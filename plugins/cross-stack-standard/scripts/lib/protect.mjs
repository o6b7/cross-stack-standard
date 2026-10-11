/**
 * Gate-file protection for the PreToolUse hook: which file edits and shell commands touch a
 * quality gate, the Standard's configuration or its opt-out.
 *
 * The rules come from the plugin's data file `data/protected-paths.json` (see its `$comment`),
 * extended by the project's `hooks.preToolUse.protect` globs and `hooks.preToolUse.protectCommands`
 * patterns:
 *
 * - `paths`: project-relative globs. An entry with `jsonPointers` protects only edits that change
 *   those locations of the JSON file (the file is read, the edit applied, both versions parsed).
 *   An entry with `"containment": false` does not make a directory that holds its files count as
 *   protected (installed copies that a reinstall restores).
 * - `contentRules`: edits whose result adds text matching `addedPattern` to a matching file
 *   (`globs` are project-relative, `homeGlobs` relative to the user's home directory). With
 *   `"matcher": "opt-out-line"` the edit is also caught when it makes the file state the opt-out
 *   line as the opt-out guard reads it ({@link findOptOutLine}), such as by removing the code fence
 *   around an existing line.
 * - `commands` and `pathCommands`: an entry without `matcher` is a regular expression tested
 *   against the raw command and against a normalised form, and optionally a `words` sequence (one
 *   regular expression per word, matched in order within one segment). An entry with `matcher`
 *   is checked by the named built-in check on the parsed command (its `pattern` then documents the
 *   simplest form and is only validated): `shell-write` and `shell-delete` (writing, moving,
 *   linking, deleting or changing the mode of a protected file or of a directory that holds
 *   protected files), `delete-operand` (a delete verb from `verbs` whose operand's file name
 *   matches `operandPattern`), `shell-write-content` (a write to a file matching `targetGlobs`
 *   whose content shows `evidencePattern`, or comes from a source that holds it), `git-hook-skip`
 *   and `git-force-push` (git invocations read with their global options and aliases).
 * - `allowCommands`: whole commands that are not inspected (the sanctioned baseline scripts).
 *
 * Shell commands are split with a small lexer for the Bash and PowerShell grammars: quotes and
 * escapes are removed, `${IFS}` counts as a space, chained commands (`&&`, `||`, `;`, `|`, `&`,
 * newlines) become segments, redirections become operators, here-documents are read (their bodies
 * are content, never paths), and command strings passed to `bash -c`, `sh -c`, `eval`,
 * `pwsh -Command`, `pwsh -EncodedCommand`, `cmd /c`, `Invoke-Expression`, `$(…)`, backticks and a
 * shell's here-document are parsed as nested commands. Quoted words that hold spaces are also read
 * as possible commands for the command patterns (not for the path checks, so a commit message is
 * never taken for a deletion). Node.js has no shell parser, and `path.matchesGlob` is experimental
 * on the supported Node.js versions and has no case-insensitive mode, so the lexer, the option
 * parsers and the glob matchers are written here.
 *
 * Paths are compared case-insensitively on Windows and macOS (whose default file systems are
 * case-insensitive), with `\` read as a separator, after resolving symbolic links; a path that no
 * string comparison places in the project is placed by file identity (device and inode of an
 * existing ancestor), which also covers macOS's `/System/Volumes/Data` alias and bind mounts.
 *
 * Every check is bounded: commands longer than {@link MAX_COMMAND_CHARS}, brace expansions
 * over their cap, directory walks over their entry cap and an inspection past
 * {@link INSPECTION_BUDGET_MS} throw {@link ProtectionIncomplete}, which the hook answers with a
 * confirmation prompt (it fails closed). Every regular expression the checks run on command text
 * is linear or bounded; a quantified gap is never followed by another unbounded gap.
 *
 * @module plugins/cross-stack-standard/scripts/lib/protect
 */

import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { findOptOutLine, MEMORY_FILES } from "./opt-out.mjs";
import { readTextCapped } from "./project.mjs";

/** The data file, relative to the plugin's `data/` directory. */
export const PROTECTED_PATHS_FILE = "protected-paths.json";

/** Largest part of an existing file read to work out what an edit changes. */
export const MAX_CURRENT_FILE_BYTES = 8 * 1024 * 1024;

/** Longest command inspected; a longer command is not inspected and needs confirmation. */
export const MAX_COMMAND_CHARS = 256 * 1024;

/**
 * Time one inspection may take. It sits well inside the platform's 10 s PreToolUse timeout
 * (whose expiry lets the tool call run), leaving room for Node.js to start and for the manifest.
 */
export const INSPECTION_BUDGET_MS = 3_000;

/** Id of the rule built from the project's own `hooks.preToolUse.protect` globs. */
export const PROJECT_PATHS_RULE_ID = "project-protect";

/** Id prefix of the rules built from `hooks.preToolUse.protectCommands`. */
export const PROJECT_COMMAND_RULE_PREFIX = "project-command";

/** Directory names a containment walk does not enter (dependencies and build output). */
export const WALK_PRUNED = Object.freeze([
  "node_modules",
  "vendor",
  ".git",
  "dist",
  "build",
  ".next",
  ".expo",
  ".turbo",
  ".cache",
  "coverage",
]);

/** The built-in checks a command entry can name in `matcher`. */
export const MATCHERS = Object.freeze([
  "shell-write",
  "shell-delete",
  "delete-operand",
  "shell-write-content",
  "git-hook-skip",
  "git-force-push",
]);

const MAX_BRACE_EXPANSIONS = 256;
const MAX_GLOB_CHARS = 1024;
const MAX_PATH_CHARS = 4096;
const MAX_NAME_CHARS = 255;
const MAX_VERB_CHARS = 256;
const MAX_NESTING = 4;
const MAX_NESTED_COMMANDS = 64;
const MAX_NESTED_CHARS = 512 * 1024;
const MAX_SNIPPET_CHARS = 80;
const MAX_WILDCARD_ENTRIES = 5_000;
const WALK_MAX_DEPTH = 8;
const WALK_MAX_ENTRIES = 20_000;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_PATCH_BYTES = 4 * 1024 * 1024;
const MAX_LIST_BYTES = 64 * 1024;
const MAX_LIST_ITEMS = 2_000;
const MAX_INPUT_FILES = 16;
const MAX_SCRIPT_TOKENS = 5_000;
const MAX_GIT_CONFIG_BYTES = 256 * 1024;
const MAX_GIT_INCLUDE_DEPTH = 3;
const MAX_ALIAS_DEPTH = 5;

// ---------------------------------------------------------------------------------------------
// Incomplete checks and the time budget

/**
 * Thrown when a check cannot complete within its bounds; the hook then asks for confirmation.
 */
export class ProtectionIncomplete extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(reason);
    this.name = "ProtectionIncomplete";
  }
}

/**
 * @typedef {object} Deadline
 * @property {number} ms
 * @property {() => void} check Throws {@link ProtectionIncomplete} once the time is up.
 */

/**
 * A deadline that starts now.
 *
 * @param {number} ms
 * @param {() => number} [now]
 * @returns {Deadline}
 */
export function createDeadline(ms, now = () => performance.now()) {
  const end = now() + ms;
  return {
    ms,
    check() {
      if (now() > end) {
        throw new ProtectionIncomplete(
          `the check did not finish within ${Math.round(ms / 100) / 10} s`,
        );
      }
    },
  };
}

const NO_DEADLINE = Object.freeze({ ms: Infinity, check() {} });

// ---------------------------------------------------------------------------------------------
// Globs

/**
 * The leftmost `{…}` group with a top-level comma, found in one pass.
 *
 * @param {string} text
 * @returns {{ start: number, end: number, parts: string[] } | null}
 */
function findBraceGroup(text) {
  const stack = [];
  let best = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") stack.push({ start: index, commas: [] });
    else if (char === "," && stack.length > 0) stack[stack.length - 1].commas.push(index);
    else if (char === "}" && stack.length > 0) {
      const group = stack.pop();
      if (group.commas.length > 0 && (best === null || group.start < best.start)) {
        best = { start: group.start, end: index, commas: group.commas };
      }
    }
  }
  if (best === null) return null;
  const parts = [];
  let from = best.start + 1;
  for (const comma of best.commas) {
    parts.push(text.slice(from, comma));
    from = comma + 1;
  }
  parts.push(text.slice(from, best.end));
  return { start: best.start, end: best.end, parts };
}

/**
 * Brace expansion without recursion, bounded in output and work.
 *
 * @param {string} glob
 * @param {number} limit
 * @returns {{ items: string[], complete: boolean }}
 */
function expandBracesBounded(glob, limit) {
  const out = [];
  const stack = [glob];
  const maxPending = limit * 8;
  for (let steps = 0; stack.length > 0; steps += 1) {
    if (steps > maxPending) return { items: out, complete: false };
    const item = stack.pop();
    const group = findBraceGroup(item);
    if (group === null) {
      out.push(item);
      if (out.length >= limit) return { items: out, complete: stack.length === 0 };
      continue;
    }
    const prefix = item.slice(0, group.start);
    const suffix = item.slice(group.end + 1);
    for (let k = group.parts.length - 1; k >= 0; k -= 1) {
      stack.push(prefix + group.parts[k] + suffix);
    }
    if (stack.length > maxPending) return { items: out, complete: false };
  }
  return { items: out, complete: true };
}

/**
 * Expands `{a,b}` alternatives (nested groups included) into plain globs, at most 256 of them.
 *
 * @param {string} glob
 * @returns {string[]}
 */
export function expandBraces(glob) {
  return expandBracesBounded(glob, MAX_BRACE_EXPANSIONS).items;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function globBodySource(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return source;
}

/**
 * Compiles a glob of the data file's dialect: `**` matches zero or more directories, `*` stays
 * inside one path segment, `?` matches one character and `{a,b}` either alternative. Paths
 * tested against it are at most 4,096 characters long.
 *
 * @param {string} glob Project-relative, with `/` separators.
 * @param {{ caseInsensitive?: boolean }} [options]
 * @returns {RegExp}
 */
export function compileGlob(glob, { caseInsensitive = false } = {}) {
  const expanded = expandBracesBounded(glob, MAX_BRACE_EXPANSIONS);
  if (!expanded.complete) {
    throw new Error(`${snippet(glob)} expands to more than ${MAX_BRACE_EXPANSIONS} alternatives`);
  }
  const body = expanded.items.map(globBodySource).join("|");
  return new RegExp(`^(?:${body})$`, caseInsensitive ? "iu" : "u");
}

/**
 * Matches one shell wildcard pattern (`*`, `?`, `[…]`) against a text, without regular
 * expressions (backtracking only to the last `*`). Both are already case-folded when needed.
 *
 * @param {string} pattern
 * @param {string} text
 * @returns {boolean}
 */
export function wildcardMatch(pattern, text) {
  let p = 0;
  let t = 0;
  let starP = -1;
  let starT = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === "*") {
      starP = p;
      starT = t;
      p += 1;
      continue;
    }
    const next = p < pattern.length ? matchOne(pattern, p, text[t]) : -1;
    if (next !== -1) {
      p = next;
      t += 1;
      continue;
    }
    if (starP === -1) return false;
    p = starP + 1;
    starT += 1;
    t = starT;
  }
  while (p < pattern.length && pattern[p] === "*") p += 1;
  return p === pattern.length;
}

/** The index after the pattern item at `p` when it matches `char`, else -1. */
function matchOne(pattern, p, char) {
  const item = pattern[p];
  if (item === "?") return p + 1;
  if (item === "[") {
    let k = p + 1;
    const negate = pattern[k] === "!" || pattern[k] === "^";
    if (negate) k += 1;
    let matched = false;
    let first = true;
    for (; k < pattern.length && (first || pattern[k] !== "]"); k += 1) {
      first = false;
      const low = pattern[k];
      if (pattern[k + 1] === "-" && k + 2 < pattern.length && pattern[k + 2] !== "]") {
        if (char >= low && char <= pattern[k + 2]) matched = true;
        k += 2;
      } else if (char === low) {
        matched = true;
      }
    }
    if (k >= pattern.length) return char === "[" ? p + 1 : -1; // An unclosed [ is literal.
    return matched !== negate ? k + 1 : -1;
  }
  return item === char ? p + 1 : -1;
}

/**
 * A matcher for a wildcard word, braces expanded (fails closed past the cap).
 *
 * @param {string} pattern
 * @param {boolean} caseInsensitive
 * @returns {(text: string) => boolean}
 */
function wordGlobMatcher(pattern, caseInsensitive) {
  const collapsed = pattern.replace(/\*{2,}/g, "*");
  if (collapsed.length > MAX_GLOB_CHARS) {
    throw new ProtectionIncomplete(`a wildcard is longer than ${MAX_GLOB_CHARS} characters`);
  }
  const fold = (text) => (caseInsensitive ? text.toLowerCase() : text);
  const expanded = expandBracesBounded(collapsed, MAX_BRACE_EXPANSIONS);
  if (!expanded.complete) {
    throw new ProtectionIncomplete(
      `a word expands to more than ${MAX_BRACE_EXPANSIONS} brace alternatives`,
    );
  }
  const alternatives = expanded.items.map(fold);
  return (text) => {
    const folded = fold(text);
    return alternatives.some((alternative) => wildcardMatch(alternative, folded));
  };
}

/**
 * What a glob says about directories, for commands that delete or move a whole directory.
 *
 * @param {string} alternative A glob without braces.
 * @returns {{ floating: boolean, dirPrefix: string, literalName: string | null, recursive: boolean }}
 */
function analyseGlob(alternative) {
  const floating = alternative.startsWith("**/");
  const rest = floating ? alternative.slice(3) : alternative;
  const firstWildcard = rest.search(/[*?]/);
  const literal = firstWildcard === -1 ? rest : rest.slice(0, firstWildcard);
  const slash = literal.lastIndexOf("/");
  const lastSegment = rest.slice(rest.lastIndexOf("/") + 1);
  return {
    floating,
    dirPrefix: slash === -1 ? "" : literal.slice(0, slash + 1),
    literalName: /[*?]/.test(lastSegment) ? null : lastSegment,
    recursive: rest.endsWith("/**"),
  };
}

// ---------------------------------------------------------------------------------------------
// The protection list

/**
 * @typedef {object} PathRule
 * @property {string} id
 * @property {string} description
 * @property {string[]} globs
 * @property {string[] | null} jsonPointers
 * @property {RegExp[]} patterns
 * @property {ReturnType<typeof analyseGlob>[]} shapes
 * @property {boolean} containment Whether a directory holding these files counts as protected.
 */

/**
 * @typedef {object} ContentRule
 * @property {string} id
 * @property {string} description
 * @property {"gate" | "opt-out"} effect
 * @property {RegExp[]} patterns
 * @property {RegExp[]} homePatterns Globs relative to the user's home directory.
 * @property {RegExp} added Global version of `addedPattern`.
 * @property {string | null} matcher
 */

/**
 * @typedef {object} CommandRule
 * @property {string} id
 * @property {string} description
 * @property {"gate" | "opt-out"} effect
 * @property {string | null} matcher A name from {@link MATCHERS}, or null for a pattern rule.
 * @property {RegExp | null} pattern Tested on the command text (pattern rules only).
 * @property {RegExp[] | null} words Word sequence tested on each segment (pattern rules only).
 * @property {Set<string>} verbs Lower-case verbs (`delete-operand`).
 * @property {RegExp | null} operand Tested on operand file names (`delete-operand`).
 * @property {RegExp[]} targets Files a `shell-write-content` write must hit.
 * @property {string[]} targetNames Literal file names of `targets`, for wildcard words.
 * @property {RegExp | null} evidence Content evidence tested on the command text.
 * @property {RegExp | null} sourcePattern Content evidence tested on source files.
 * @property {string | null} sourceMatcher `opt-out-line`: sources are read as memory files.
 * @property {boolean} opaque Content from a source the hook cannot read counts as evidence.
 * @property {boolean} targetEvidence Evidence already in the target file counts.
 */

/**
 * @typedef {object} Protection
 * @property {PathRule[]} paths
 * @property {ContentRule[]} contentRules
 * @property {CommandRule[]} commands
 * @property {RegExp[]} allowCommands
 * @property {boolean} caseInsensitive
 * @property {string[]} problems Entries skipped because they could not be compiled.
 * @property {string[]} literalNames Literal file names of the path rules.
 */

/**
 * Reads the plugin's protection list.
 *
 * @param {string} dataDir The plugin's `data/` directory.
 * @returns {Record<string, any>}
 */
export function loadProtectionList(dataDir) {
  const file = path.join(dataDir, PROTECTED_PATHS_FILE);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `data/${PROTECTED_PATHS_FILE} could not be read (${error?.code ?? error?.message}); ` +
        "reinstalling the plugin restores it",
      { cause: error },
    );
  }
  if (value === null || typeof value !== "object" || !Array.isArray(value.paths)) {
    throw new Error(`data/${PROTECTED_PATHS_FILE} has no "paths" list`);
  }
  return value;
}

function effectOf(entry) {
  return entry?.effect === "opt-out" ? "opt-out" : "gate";
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : [];
}

function literalNamesOf(globs) {
  const names = new Set();
  for (const glob of globs) {
    for (const alternative of expandBraces(glob)) {
      const name = analyseGlob(alternative).literalName;
      if (name !== null && name !== "") names.add(name);
    }
  }
  return [...names];
}

/**
 * Compiles the protection list together with the project's extensions. An entry that does not
 * compile is skipped and named in `problems`; nothing here throws for bad data.
 *
 * @param {Record<string, any>} list The parsed data file.
 * @param {{ protect?: string[], protectCommands?: string[], caseInsensitive?: boolean }} [options]
 * @returns {Protection}
 */
export function compileProtection(list, options = {}) {
  const { protect = [], protectCommands = [], caseInsensitive = false } = options;
  const problems = [];
  const globOptions = { caseInsensitive };
  const compilePathRule = (entry) => {
    const globs = stringList(entry.globs);
    const alternatives = globs.flatMap((glob) => expandBraces(glob));
    return {
      id: String(entry.id),
      description: String(entry.description ?? ""),
      globs,
      jsonPointers: Array.isArray(entry.jsonPointers) ? stringList(entry.jsonPointers) : null,
      patterns: globs.map((glob) => compileGlob(glob, globOptions)),
      shapes: alternatives.map(analyseGlob),
      containment: entry.containment !== false,
    };
  };
  const tryCompile = (where, build) => {
    try {
      return build();
    } catch (error) {
      problems.push(`${where}: ${error?.message ?? error}`);
      return null;
    }
  };

  const paths = [];
  for (const entry of list.paths ?? []) {
    const rule = tryCompile(`paths ${entry?.id}`, () => compilePathRule(entry));
    if (rule !== null) paths.push(rule);
  }
  const projectGlobs = stringList(protect);
  if (projectGlobs.length > 0) {
    const rule = tryCompile("hooks.preToolUse.protect", () =>
      compilePathRule({
        id: PROJECT_PATHS_RULE_ID,
        description: "listed in hooks.preToolUse.protect",
        globs: projectGlobs,
      }),
    );
    if (rule !== null) paths.push(rule);
  }

  const contentRules = [];
  for (const entry of list.contentRules ?? []) {
    const rule = tryCompile(`contentRules ${entry?.id}`, () => ({
      id: String(entry.id),
      description: String(entry.description ?? ""),
      effect: effectOf(entry),
      patterns: stringList(entry.globs).map((glob) => compileGlob(glob, globOptions)),
      homePatterns: stringList(entry.homeGlobs).map((glob) => compileGlob(glob, globOptions)),
      added: new RegExp(entry.addedPattern, `${entry.flags ?? ""}gu`),
      matcher: typeof entry.matcher === "string" ? entry.matcher : null,
    }));
    if (rule !== null) contentRules.push(rule);
  }

  const compileCommand = (entry) => {
    const flags = `${entry.flags ?? ""}u`;
    const matcher = typeof entry.matcher === "string" ? entry.matcher : null;
    if (matcher !== null && !MATCHERS.includes(matcher)) {
      throw new Error(`unknown matcher "${matcher}"`);
    }
    // The pattern is validated even when a matcher does the work: a broken entry is skipped.
    const pattern =
      typeof entry.pattern === "string" && entry.pattern !== ""
        ? new RegExp(entry.pattern, flags)
        : null;
    const words = stringList(entry.words).map((source) => new RegExp(source, flags));
    if (matcher === null && pattern === null && words.length === 0) {
      throw new Error('needs a "pattern", "words" or "matcher"');
    }
    const evidenceFlags = `${entry.evidenceFlags ?? ""}u`;
    const targetGlobs = stringList(entry.targetGlobs);
    return {
      id: String(entry.id),
      description: String(entry.description ?? ""),
      effect: effectOf(entry),
      matcher,
      pattern: matcher === null ? pattern : null,
      words: matcher === null && words.length > 0 ? words : null,
      verbs: new Set(stringList(entry.verbs).map((verb) => verb.toLowerCase())),
      operand:
        typeof entry.operandPattern === "string" ? new RegExp(entry.operandPattern, flags) : null,
      targets: targetGlobs.map((glob) => compileGlob(glob, globOptions)),
      targetNames: literalNamesOf(targetGlobs),
      evidence:
        typeof entry.evidencePattern === "string"
          ? new RegExp(entry.evidencePattern, evidenceFlags)
          : null,
      sourcePattern:
        typeof entry.sourcePattern === "string"
          ? new RegExp(entry.sourcePattern, evidenceFlags)
          : null,
      sourceMatcher: entry.sourceMatcher === "opt-out-line" ? "opt-out-line" : null,
      opaque: entry.opaque === true,
      targetEvidence: entry.targetEvidence === true,
    };
  };
  const commands = [];
  for (const entry of list.commands ?? []) {
    const rule = tryCompile(`commands ${entry?.id}`, () => compileCommand(entry));
    if (rule !== null) commands.push(rule);
  }
  for (const entry of list.pathCommands ?? []) {
    const rule = tryCompile(`pathCommands ${entry?.id}`, () => compileCommand(entry));
    if (rule !== null) commands.push(rule);
  }
  stringList(protectCommands).forEach((pattern, index) => {
    const rule = tryCompile(`hooks.preToolUse.protectCommands[${index}]`, () =>
      compileCommand({
        id: `${PROJECT_COMMAND_RULE_PREFIX}-${index + 1}`,
        description: "Matches a pattern listed in hooks.preToolUse.protectCommands",
        pattern,
      }),
    );
    if (rule !== null) commands.push(rule);
  });

  const allowCommands = [];
  for (const entry of list.allowCommands ?? []) {
    const pattern = tryCompile(
      `allowCommands ${entry?.id}`,
      () => new RegExp(entry.pattern, `${entry.flags ?? ""}u`),
    );
    if (pattern !== null) allowCommands.push(pattern);
  }
  const literalNames = literalNamesOf(paths.flatMap((rule) => rule.globs));
  return {
    paths,
    contentRules,
    commands,
    allowCommands,
    caseInsensitive,
    problems,
    literalNames,
  };
}

// ---------------------------------------------------------------------------------------------
// Paths

/**
 * Whether paths on a platform are compared without regard to letter case.
 *
 * @param {string} [platform]
 * @returns {boolean}
 */
export function caseInsensitivePaths(platform = process.platform) {
  return platform === "win32" || platform === "darwin";
}

function pathApi(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

/**
 * A path from a tool call with `/` separators (Windows sends backslashes) and without the
 * Windows long-path prefix.
 *
 * @param {string} value
 * @param {string} [platform]
 * @returns {string}
 */
export function normaliseToolPath(value, platform = process.platform) {
  let text = value.replace(/\\/g, "/");
  if (platform === "win32" && /^\/\/[?.]\/[A-Za-z]:/.test(text)) text = text.slice(4);
  return text;
}

/**
 * The real path of the nearest existing ancestor, joined with the rest (a file that a Write is
 * about to create has no real path yet).
 *
 * @param {string} absolute
 * @param {typeof path.posix} api
 * @returns {string}
 */
function canonicalPath(absolute, api) {
  const cached = realCache.get(absolute);
  if (cached !== undefined) return cached;
  let result = null;
  let exists = true;
  try {
    fs.lstatSync(absolute);
  } catch {
    exists = false;
  }
  if (exists) {
    try {
      result = fs.realpathSync.native(absolute);
    } catch {
      result = null; // A dangling link: resolve its parent instead.
    }
  }
  if (result === null) {
    const parent = api.dirname(absolute);
    result =
      parent === absolute ? absolute : api.join(canonicalPath(parent, api), api.basename(absolute));
  }
  if (realCache.size > 50_000) realCache.clear();
  realCache.set(absolute, result);
  return result;
}

/**
 * Caches of real paths and root forms, cleared at the start of every inspection so that files
 * created or removed between tool calls are seen as they are.
 */
const realCache = new Map();
const rootFormCache = new Map();

function resetPathCaches() {
  realCache.clear();
  rootFormCache.clear();
  identityCache.clear();
}

/** macOS reaches the data volume through this alias; `realpath` keeps it as written. */
const FIRMLINK_PREFIX = "/System/Volumes/Data/";

function stripFirmlink(value, platform) {
  return platform === "darwin" && value.startsWith(FIRMLINK_PREFIX)
    ? value.slice(FIRMLINK_PREFIX.length - 1)
    : value;
}

function slashes(value) {
  return value.replace(/\\/g, "/");
}

function relativeInside(root, file, caseInsensitive) {
  const rootText = slashes(root).replace(/\/+$/, "");
  const fileText = slashes(file);
  const rootCompare = caseInsensitive ? rootText.toLowerCase() : rootText;
  const fileCompare = caseInsensitive ? fileText.toLowerCase() : fileText;
  if (fileCompare === rootCompare) return "";
  const prefix = `${rootCompare}/`;
  if (!fileCompare.startsWith(prefix)) return null;
  const sameLength =
    fileCompare.length === fileText.length && rootCompare.length === rootText.length;
  return (sameLength ? fileText : fileCompare).slice(prefix.length);
}

const identityCache = new Map();

/** Device and inode of an existing path, or null (also where inodes are not meaningful). */
function identityOf(file) {
  try {
    const stat = fs.statSync(file, { bigint: true, throwIfNoEntry: false });
    if (!stat || stat.ino === 0n) return null;
    return { dev: stat.dev, ino: stat.ino };
  } catch {
    return null;
  }
}

function rootIdentity(root) {
  if (!identityCache.has(root)) {
    if (identityCache.size > 64) identityCache.clear();
    identityCache.set(root, identityOf(root));
  }
  return identityCache.get(root);
}

/**
 * The project-relative path of `absolute` found by file identity: the nearest existing ancestor
 * whose device and inode equal a root's, with the remaining components appended.
 */
function identityRelative(absolute, roots, api) {
  const ids = roots.map((root) => rootIdentity(api.resolve(root))).filter((id) => id !== null);
  if (ids.length === 0) return null;
  let current = absolute;
  const rest = [];
  for (let count = 0; count < 256; count += 1) {
    const id = identityOf(current);
    if (id !== null && ids.some((root) => root.dev === id.dev && root.ino === id.ino)) {
      return rest.reverse().join("/");
    }
    const parent = api.dirname(current);
    if (parent === current) return null;
    rest.push(api.basename(current));
    current = parent;
  }
  return null;
}

/**
 * @typedef {object} PathContext
 * @property {string[]} roots Project directories the globs are relative to.
 * @property {string} cwd Directory that relative paths are resolved against.
 * @property {string} [platform]
 */

function pathForms(absolute, api, platform, useFs) {
  const forms = new Set([absolute]);
  if (useFs) forms.add(canonicalPath(absolute, api));
  for (const form of [...forms]) forms.add(stripFirmlink(form, platform));
  return forms;
}

/**
 * Every project-relative form of a path (`/` separators): relative to each root, before and
 * after resolving symbolic links, and, when no comparison places it in a root, by file identity.
 * Paths outside every root give an empty list.
 *
 * @param {string} file
 * @param {PathContext} context
 * @returns {{ absolute: string, relatives: string[] }}
 */
export function projectRelativePaths(file, { roots, cwd, platform = process.platform }) {
  const api = pathApi(platform);
  const caseInsensitive = caseInsensitivePaths(platform);
  const useFs = platform === process.platform;
  const normalised = normaliseToolPath(file, platform);
  // A drive-letter path names another machine's file system here; it is not in the project.
  if (platform !== "win32" && /^[A-Za-z]:\//.test(normalised)) {
    return { absolute: normalised, relatives: [] };
  }
  const absolute = api.resolve(cwd, normalised);
  const forms = pathForms(absolute, api, platform, useFs);
  const rootKey = `${platform}\0${roots.join("\0")}`;
  let rootForms = rootFormCache.get(rootKey);
  if (rootForms === undefined) {
    rootForms = new Set();
    for (const root of roots) {
      for (const form of pathForms(api.resolve(root), api, platform, useFs)) rootForms.add(form);
    }
    rootFormCache.set(rootKey, rootForms);
  }
  const relatives = new Set();
  for (const form of forms) {
    for (const root of rootForms) {
      const relative = relativeInside(root, form, caseInsensitive);
      if (relative !== null) relatives.add(relative);
    }
  }
  if (relatives.size === 0 && useFs) {
    const byIdentity = identityRelative(absolute, roots, api);
    if (byIdentity !== null) relatives.add(byIdentity);
  }
  return { absolute, relatives: [...relatives] };
}

/** Whether `absolute` is a proper ancestor of a root (deleting it deletes the project). */
function isAncestorOfRoot(absolute, roots, platform) {
  const api = pathApi(platform);
  const useFs = platform === process.platform;
  const caseInsensitive = caseInsensitivePaths(platform);
  const forms = pathForms(absolute, api, platform, useFs);
  for (const root of roots) {
    for (const rootForm of pathForms(api.resolve(root), api, platform, useFs)) {
      for (const form of forms) {
        const inside = relativeInside(form, rootForm, caseInsensitive);
        if (inside !== null && inside !== "") return true;
      }
    }
  }
  return false;
}

/**
 * The path rules that protect a project-relative path.
 *
 * @param {Protection} protection
 * @param {string} relative
 * @returns {PathRule[]}
 */
export function protectingRules(protection, relative) {
  if (relative === "" || relative.length > MAX_PATH_CHARS) return [];
  return protection.paths.filter((rule) => rule.patterns.some((pattern) => pattern.test(relative)));
}

/** Whether a file found inside a directory makes that directory protected. */
function containedProtected(protection, relative) {
  return protection.paths.some(
    (rule) =>
      rule.containment &&
      rule.jsonPointers === null &&
      rule.patterns.some((pattern) => pattern.test(relative)),
  );
}

/**
 * Walks a directory (depth and entry bounded, dependency and build directories skipped) and
 * collects the project-relative paths of the files that `test` accepts.
 *
 * @param {string} absolute
 * @param {string} relative Its project-relative path ("" for the root).
 * @param {(relative: string) => boolean} test
 * @param {{ deadline?: Deadline, firstOnly?: boolean, maxDepth?: number }} [options]
 * @returns {{ files: string[], capped: boolean }}
 */
function walkFiles(absolute, relative, test, options = {}) {
  const { deadline = NO_DEADLINE, firstOnly = false, maxDepth = WALK_MAX_DEPTH } = options;
  const files = [];
  const stack = [{ dir: absolute, rel: relative, depth: 1 }];
  let entries = 0;
  while (stack.length > 0) {
    const { dir, rel, depth } = stack.pop();
    let listing;
    try {
      listing = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of listing) {
      entries += 1;
      if (entries > WALK_MAX_ENTRIES) return { files, capped: true };
      if (entries % 512 === 0) deadline.check();
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (depth < maxDepth && !WALK_PRUNED.includes(entry.name.toLowerCase())) {
          stack.push({ dir: path.join(dir, entry.name), rel: childRel, depth: depth + 1 });
        }
        continue;
      }
      if (test(childRel)) {
        files.push(childRel);
        if (firstOnly || files.length >= MAX_LIST_ITEMS) return { files, capped: false };
      }
    }
  }
  return { files, capped: false };
}

/**
 * Whether a directory holds protected files: the project root itself, an ancestor of a
 * protected directory (`.github` for `.github/workflows/**`), or a directory with a protected
 * file anywhere below it (a bounded walk on disk; a walk that hits its cap counts as holding one).
 *
 * @param {Protection} protection
 * @param {string} relative The directory, project-relative ("" for the root).
 * @param {string | null} absolute Its absolute path, for the on-disk walk.
 * @param {{ deadline?: Deadline }} [options]
 * @returns {boolean}
 */
export function directoryHoldsProtected(protection, relative, absolute, options = {}) {
  if (relative === "" || relative === ".") return true;
  const fold = (text) => (protection.caseInsensitive ? text.toLowerCase() : text);
  const segments = fold(relative).split("/").filter(Boolean);
  const suffixes = segments.map((_, index) => `${segments.slice(index).join("/")}/`);
  const whole = `${segments.join("/")}/`;
  for (const rule of protection.paths) {
    if (!rule.containment) continue;
    for (const shape of rule.shapes) {
      const prefix = fold(shape.dirPrefix);
      if (prefix === "") continue;
      if (
        shape.floating
          ? suffixes.some((suffix) => prefix.startsWith(suffix))
          : prefix.startsWith(whole)
      ) {
        return true;
      }
    }
  }
  if (absolute === null) return false;
  if (segments.some((segment) => WALK_PRUNED.includes(segment.toLowerCase()))) return false;
  const base = relative.replace(/\/+$/, "");
  const walk = walkFiles(absolute, base, (rel) => containedProtected(protection, rel), {
    deadline: options.deadline,
    firstOnly: true,
  });
  return walk.capped || walk.files.length > 0;
}

// ---------------------------------------------------------------------------------------------
// File edits

/**
 * The file content after an Edit, or null when `old_string` does not occur (the tool would
 * fail). Line endings are retried as CRLF for files that use them.
 *
 * @param {string | null} before Current content; null when the file does not exist.
 * @param {unknown} oldString
 * @param {unknown} newString
 * @param {boolean} replaceAll
 * @returns {string | null}
 */
export function applyEdit(before, oldString, newString, replaceAll) {
  if (typeof oldString !== "string" || typeof newString !== "string") return null;
  if (before === null) return oldString === "" ? newString : null;
  if (oldString === "") return before === "" ? newString : null;
  const attempt = (search, replacement) => {
    if (!before.includes(search)) return null;
    return replaceAll
      ? before.split(search).join(replacement)
      : before.replace(search, () => replacement);
  };
  const direct = attempt(oldString, newString);
  if (direct !== null || !before.includes("\r\n")) return direct;
  const crlf = (text) => text.replace(/\r?\n/g, "\r\n");
  return attempt(crlf(oldString), crlf(newString));
}

function stripBom(text) {
  return text.startsWith("﻿") ? text.slice(1) : text;
}

function pointerLookup(document, pointer) {
  if (pointer === "") return { found: true, value: document };
  let current = document;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || typeof current !== "object" || !Object.hasOwn(current, key)) {
      return { found: false, value: undefined };
    }
    current = current[key];
  }
  return { found: true, value: current };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The JSON Pointers whose value differs between two versions of a JSON file. Key order is
 * ignored. When a version cannot be parsed the result is `unknown` (treated as a change).
 *
 * @param {string} beforeText
 * @param {string} afterText
 * @param {string[]} pointers
 * @returns {{ changed: string[], unknown: boolean }}
 */
export function changedJsonPointers(beforeText, afterText, pointers) {
  const parse = (text) => {
    try {
      return { ok: true, value: JSON.parse(stripBom(text)) };
    } catch {
      return { ok: false, value: undefined };
    }
  };
  const before = parse(beforeText);
  const after = parse(afterText);
  if (!after.ok) return { changed: [...pointers], unknown: true };
  if (!before.ok) {
    const present = pointers.filter((pointer) => pointerLookup(after.value, pointer).found);
    return { changed: present, unknown: present.length > 0 };
  }
  const changed = pointers.filter((pointer) => {
    const a = pointerLookup(before.value, pointer);
    const b = pointerLookup(after.value, pointer);
    return a.found !== b.found || (a.found && canonicalJson(a.value) !== canonicalJson(b.value));
  });
  return { changed, unknown: false };
}

function countMatches(pattern, text) {
  if (typeof text !== "string" || text === "") return 0;
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) !== null) {
    count += 1;
    if (pattern.lastIndex === 0) break;
  }
  pattern.lastIndex = 0;
  return count;
}

/** The opt-out line's position, read only when the text mentions the decisive word. */
function optOutLineIn(text) {
  return typeof text === "string" && /declined/i.test(text) ? findOptOutLine(text) : 0;
}

/**
 * @typedef {object} Finding
 * @property {"path" | "content" | "command"} source
 * @property {string} ruleId Id of the data entry (or the project rule) that matched.
 * @property {string} description
 * @property {"gate" | "opt-out"} effect
 * @property {string | null} path Project-relative path involved, when there is one.
 * @property {string[]} [pointers] JSON Pointers an edit changes (`jsonPointers` entries).
 * @property {boolean} [unknown] The change could not be worked out and is treated as a change.
 * @property {string} [match] The command text that matched.
 */

function readCurrent(file) {
  let exists = false;
  try {
    exists = fs.statSync(file).isFile();
  } catch {
    exists = false;
  }
  if (!exists) return { exists: false, text: null };
  return { exists: true, text: readTextCapped(file, MAX_CURRENT_FILE_BYTES) };
}

function memoryAliases(absolute, searchDirs, context) {
  const api = pathApi(context.platform ?? process.platform);
  if ((context.platform ?? process.platform) !== process.platform) return [];
  const target = canonicalPath(absolute, api);
  const out = [];
  for (const dir of searchDirs) {
    for (const name of MEMORY_FILES) {
      const file = path.join(dir, name);
      try {
        if (!fs.lstatSync(file).isSymbolicLink()) continue;
        if (fs.realpathSync.native(file) !== target) continue;
      } catch {
        continue;
      }
      out.push(...projectRelativePaths(file, context).relatives);
    }
  }
  return out;
}

/** Directories the `homeGlobs` of content rules are relative to. */
function homeRoots(home, env) {
  const roots = [home];
  const configDir = env?.CLAUDE_CONFIG_DIR;
  if (typeof configDir === "string" && configDir !== "" && path.isAbsolute(configDir)) {
    // CLAUDE_CONFIG_DIR replaces ~/.claude; its files are matched as if they sat there.
    roots.push(path.dirname(configDir));
  }
  return roots;
}

/**
 * Inspects an `Edit`, `Write` or `NotebookEdit` call.
 *
 * @param {object} options
 * @param {string} options.toolName
 * @param {Record<string, any>} options.toolInput
 * @param {Protection} options.protection
 * @param {string[]} options.roots
 * @param {string} options.cwd
 * @param {string[]} [options.searchDirs] Directories whose memory files the opt-out guard reads.
 * @param {string} [options.home] The user's home directory (for `homeGlobs`).
 * @param {Record<string, string | undefined>} [options.env]
 * @param {string} [options.platform]
 * @param {number} [options.budgetMs]
 * @returns {Finding[]}
 */
export function inspectFileEdit({
  toolName,
  toolInput,
  protection,
  roots,
  cwd,
  searchDirs = [],
  home = os.homedir(),
  env = {},
  platform = process.platform,
  budgetMs = INSPECTION_BUDGET_MS,
}) {
  const deadline = createDeadline(budgetMs);
  resetPathCaches();
  const rawPath =
    toolName === "NotebookEdit"
      ? (toolInput.notebook_path ?? toolInput.file_path)
      : toolInput.file_path;
  if (typeof rawPath !== "string" || rawPath.trim() === "") return [];
  if (rawPath.length > MAX_PATH_CHARS) return [];
  const context = { roots, cwd, platform };
  const { absolute, relatives } = projectRelativePaths(rawPath, context);
  const candidates = new Set(relatives.filter((relative) => relative !== ""));
  for (const alias of memoryAliases(absolute, searchDirs, context)) candidates.add(alias);
  const homeRelatives = projectRelativePaths(rawPath, {
    roots: homeRoots(home, env),
    cwd,
    platform,
  }).relatives.filter((relative) => relative !== "");
  if (candidates.size === 0 && homeRelatives.length === 0) return [];
  const rels = [...candidates];

  let state = null;
  const content = () => {
    if (state !== null) return state;
    const current =
      platform === process.platform ? readCurrent(absolute) : { exists: false, text: null };
    let after = null;
    let fragment = "";
    let removed = "";
    if (toolName === "Write") {
      after = typeof toolInput.content === "string" ? toolInput.content : null;
      fragment = after ?? "";
    } else if (toolName === "Edit") {
      after = applyEdit(
        current.exists ? current.text : null,
        toolInput.old_string,
        toolInput.new_string,
        toolInput.replace_all === true,
      );
      fragment = typeof toolInput.new_string === "string" ? toolInput.new_string : "";
      removed = typeof toolInput.old_string === "string" ? toolInput.old_string : "";
    } else {
      fragment = typeof toolInput.new_source === "string" ? toolInput.new_source : "";
    }
    const before = current.exists ? current.text : toolName === "Write" ? "" : null;
    state = { current, before, after, fragment, removed };
    return state;
  };

  const findings = [];
  for (const rule of protection.contentRules) {
    deadline.check();
    const relative =
      rels.find((rel) => rule.patterns.some((pattern) => pattern.test(rel))) ??
      homeRelatives.find((rel) => rule.homePatterns.some((pattern) => pattern.test(rel)));
    if (relative === undefined) continue;
    const { before, after, fragment, removed } = content();
    const [oldText, newText] =
      before !== null && after !== null ? [before, after] : [removed, fragment];
    const added = countMatches(rule.added, newText) > countMatches(rule.added, oldText);
    const optOut =
      rule.matcher === "opt-out-line" && optOutLineIn(newText) > 0 && optOutLineIn(oldText) === 0;
    if (added || optOut) {
      findings.push({
        source: "content",
        ruleId: rule.id,
        description: rule.description,
        effect: rule.effect,
        path: relative,
      });
    }
  }

  for (const rule of protection.paths) {
    deadline.check();
    const relative = rels.find((rel) => rule.patterns.some((pattern) => pattern.test(rel)));
    if (relative === undefined) continue;
    const finding = {
      source: "path",
      ruleId: rule.id,
      description: rule.description,
      effect: "gate",
      path: relative,
    };
    if (rule.jsonPointers !== null && toolName !== "NotebookEdit") {
      const { current, after } = content();
      if (!current.exists) continue; // A new file has no gate settings to weaken.
      if (current.text === null || after === null) {
        findings.push({ ...finding, pointers: rule.jsonPointers, unknown: true });
        continue;
      }
      const result = changedJsonPointers(current.text, after, rule.jsonPointers);
      if (result.changed.length === 0 && !result.unknown) continue;
      findings.push({ ...finding, pointers: result.changed, unknown: result.unknown });
      continue;
    }
    findings.push(finding);
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------
// Shell lexer

/**
 * @typedef {object} ShellWord
 * @property {"word"} kind
 * @property {string} value The text after quote removal and escape processing.
 * @property {string} pathValue Quotes removed, `\` kept as a path separator (`/`).
 * @property {boolean} [quoted] Some part of the word was quoted.
 * @property {boolean} [glob] An unquoted `*`, `?` or `[` (the shell expands it).
 * @property {boolean} [brace] An unquoted `{` (the shell may expand it).
 * @property {boolean} [heredoc] A here-document body: content, never a path.
 * @property {string} [subst] The command of a word made of one command substitution.
 */

/**
 * @typedef {object} ShellOp
 * @property {"op"} kind
 * @property {string} value `>`, `>>`, `<`, `>&`, `<&`, `<<` or `<<<`.
 */

/**
 * @typedef {object} LexedSegment
 * @property {Array<ShellWord | ShellOp>} tokens
 * @property {string} sep The operator that ends the segment (`;`, `&&`, `||`, `|`, `&`, …).
 * @property {Array<{ text: string, dialect: "bash" | "powershell" }>} nested Command strings
 *   found inside the segment (command substitutions).
 */

function readBalanced(source, start, escapeChar) {
  let depth = 1;
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote !== null) {
      // Single quotes are literal in both grammars; double quotes honour the escape character.
      if (char === escapeChar && quote === '"') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === escapeChar) {
      index += 1;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return { text: source.slice(start, index), end: index + 1 };
    }
  }
  return { text: source.slice(start), end: source.length };
}

function readBacktick(source, start) {
  let text = "";
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\" && index + 1 < source.length) {
      text += source[index + 1];
      index += 1;
    } else if (char === "`") {
      return { text, end: index + 1 };
    } else {
      text += char;
    }
  }
  return { text, end: source.length };
}

const ANSI_ESCAPES = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", e: "\x1b", E: "\x1b" };

function readAnsiC(source, start) {
  let text = "";
  let index = start;
  while (index < source.length && source[index] !== "'") {
    const char = source[index];
    if (char !== "\\" || index + 1 >= source.length) {
      text += char;
      index += 1;
      continue;
    }
    const next = source[index + 1];
    const hex = /^x([0-9A-Fa-f]{1,2})/.exec(source.slice(index + 1, index + 4));
    const unicode = /^[uU]([0-9A-Fa-f]{1,8})/.exec(source.slice(index + 1, index + 10));
    const octal = /^([0-7]{1,3})/.exec(source.slice(index + 1, index + 4));
    if (hex) {
      text += String.fromCharCode(parseInt(hex[1], 16));
      index += 1 + hex[0].length;
    } else if (unicode) {
      const code = parseInt(unicode[1], 16);
      text += code <= 0x10ffff ? String.fromCodePoint(code) : "";
      index += 1 + unicode[0].length;
    } else if (octal) {
      text += String.fromCharCode(parseInt(octal[1], 8));
      index += 1 + octal[0].length;
    } else {
      text += ANSI_ESCAPES[next] ?? next;
      index += 2;
    }
  }
  return { text, end: Math.min(index + 1, source.length) };
}

function readHeredocDelimiter(source, start) {
  let index = start;
  while (source[index] === " " || source[index] === "\t") index += 1;
  let delimiter = "";
  while (index < source.length && !/[\s;&|<>()]/.test(source[index])) {
    const char = source[index];
    if (char === "'" || char === '"') {
      const end = source.indexOf(char, index + 1);
      const stop = end === -1 ? source.length : end;
      delimiter += source.slice(index + 1, stop);
      index = stop + 1;
    } else if (char === "\\" && index + 1 < source.length) {
      delimiter += source[index + 1];
      index += 2;
    } else {
      delimiter += char;
      index += 1;
    }
  }
  return { delimiter: delimiter === "" ? null : delimiter, end: index };
}

/**
 * State shared by both lexers: the current word, the segment under construction and the
 * finished segments.
 */
function createLexState() {
  const state = {
    segments: /** @type {LexedSegment[]} */ ([]),
    tokens: /** @type {Array<ShellWord | ShellOp>} */ ([]),
    nested: /** @type {LexedSegment["nested"]} */ ([]),
    value: "",
    pathValue: "",
    inWord: false,
    quoted: false,
    glob: false,
    brace: false,
    subst: /** @type {string | null} */ (null),
    append(text, pathText = text) {
      if (state.inWord) state.subst = null;
      state.value += text;
      state.pathValue += pathText;
      state.inWord = true;
    },
    literal(char, pathChar = char) {
      if (char === "*" || char === "?" || char === "[") state.glob = true;
      else if (char === "{") state.brace = true;
      state.append(char, pathChar);
    },
    substitution(text) {
      const fresh = !state.inWord;
      state.append(text.trim() === "pwd" ? "$PWD" : text);
      if (fresh) state.subst = text;
    },
    reset() {
      state.value = "";
      state.pathValue = "";
      state.inWord = false;
      state.quoted = false;
      state.glob = false;
      state.brace = false;
      state.subst = null;
    },
    pushWord() {
      if (state.inWord) {
        const bare = !state.quoted && (state.value === "{" || state.value === "}");
        if (!bare) {
          const word = {
            kind: "word",
            value: state.value,
            pathValue: state.pathValue,
            quoted: state.quoted,
            glob: state.glob,
            brace: state.brace,
          };
          if (state.subst !== null) word.subst = state.subst;
          state.tokens.push(word);
        }
      }
      state.reset();
    },
    redirect(op) {
      const fd = state.inWord && !state.quoted && /^(?:\d+|\*)$/.test(state.value);
      if (fd) state.reset();
      else state.pushWord();
      state.tokens.push({ kind: "op", value: op });
    },
    endSegment(sep) {
      state.pushWord();
      if (state.tokens.length > 0 || state.nested.length > 0) {
        state.segments.push({ tokens: state.tokens, sep, nested: state.nested });
      }
      state.tokens = [];
      state.nested = [];
    },
  };
  return state;
}

/**
 * Splits a Bash command into segments of words and redirection operators. A here-document body
 * becomes a word marked `heredoc` at the end of its segment.
 *
 * @param {string} source
 * @returns {LexedSegment[]}
 */
export function lexBash(source) {
  const s = createLexState();
  const n = source.length;
  let pending = [];
  const readHeredocs = (position) => {
    let at = position;
    for (const heredoc of pending) {
      const lines = [];
      while (at < n) {
        let end = source.indexOf("\n", at);
        if (end === -1) end = n;
        let line = source.slice(at, end);
        at = end + 1;
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if ((heredoc.stripTabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) break;
        lines.push(line);
      }
      const body = lines.join("\n");
      heredoc.tokens.push({
        kind: "word",
        value: body,
        pathValue: body,
        quoted: true,
        glob: false,
        brace: false,
        heredoc: true,
      });
    }
    pending = [];
    return at;
  };

  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === " " || c === "\t" || c === "\r") {
      s.pushWord();
      i += 1;
    } else if (c === "\n") {
      s.endSegment(";");
      i = pending.length > 0 ? readHeredocs(i + 1) : i + 1;
    } else if (c === "#" && !s.inWord) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? n : end;
    } else if (c === "\\") {
      if (source[i + 1] === "\n") i += 2;
      else if (i + 1 < n) {
        s.append(source[i + 1], `/${source[i + 1]}`);
        i += 2;
      } else {
        s.append("\\", "/");
        i += 1;
      }
    } else if (c === "'") {
      const end = source.indexOf("'", i + 1);
      const stop = end === -1 ? n : end;
      const text = source.slice(i + 1, stop);
      s.append(text, slashes(text));
      s.quoted = true;
      i = stop + 1;
    } else if (c === "$" && source[i + 1] === "'") {
      const read = readAnsiC(source, i + 2);
      s.append(read.text, slashes(read.text));
      s.quoted = true;
      i = read.end;
    } else if (c === '"') {
      let text = "";
      let pathText = "";
      let k = i + 1;
      while (k < n && source[k] !== '"') {
        const ch = source[k];
        if (ch === "\\" && k + 1 < n) {
          const next = source[k + 1];
          if (next === "\n") {
            k += 2;
            continue;
          }
          if ('$`"\\'.includes(next)) {
            text += next;
            pathText += next === "\\" ? "/" : next;
          } else {
            text += `\\${next}`;
            pathText += `/${next}`;
          }
          k += 2;
        } else if (ch === "$" && source[k + 1] === "(") {
          const read = readBalanced(source, k + 2, "\\");
          s.nested.push({ text: read.text, dialect: "bash" });
          const shown = read.text.trim() === "pwd" ? "$PWD" : read.text;
          text += shown;
          pathText += shown;
          k = read.end;
        } else if (ch === "`") {
          const read = readBacktick(source, k + 1);
          s.nested.push({ text: read.text, dialect: "bash" });
          const shown = read.text.trim() === "pwd" ? "$PWD" : read.text;
          text += shown;
          pathText += shown;
          k = read.end;
        } else if (source.startsWith("${IFS}", k)) {
          text += " ";
          pathText += " ";
          k += 6;
        } else {
          text += ch;
          pathText += ch === "\\" ? "/" : ch;
          k += 1;
        }
      }
      s.append(text, pathText);
      s.quoted = true;
      i = Math.min(k + 1, n);
    } else if (c === "$" && source[i + 1] === "(") {
      const read = readBalanced(source, i + 2, "\\");
      s.nested.push({ text: read.text, dialect: "bash" });
      s.substitution(read.text);
      i = read.end;
    } else if ((c === "<" || c === ">") && source[i + 1] === "(") {
      const read = readBalanced(source, i + 2, "\\");
      s.nested.push({ text: read.text, dialect: "bash" });
      s.pushWord();
      i = read.end;
    } else if (c === "`") {
      const read = readBacktick(source, i + 1);
      s.nested.push({ text: read.text, dialect: "bash" });
      s.substitution(read.text);
      i = read.end;
    } else if (source.startsWith("${IFS}", i)) {
      s.pushWord();
      i += 6;
    } else if (/^\$IFS(?![A-Za-z0-9_])/.test(source.slice(i, i + 5))) {
      s.pushWord();
      i += 4;
    } else if (source.startsWith("&>>", i)) {
      s.redirect(">>");
      i += 3;
    } else if (source.startsWith("&>", i)) {
      s.redirect(">");
      i += 2;
    } else if (["&&", "||", "|&", ";;"].includes(source.slice(i, i + 2))) {
      s.endSegment(source.slice(i, i + 2));
      i += 2;
    } else if (source.startsWith(">>", i)) {
      s.redirect(">>");
      i += 2;
    } else if (source.startsWith(">|", i) || source.startsWith("<>", i)) {
      s.redirect(">");
      i += 2;
    } else if (source.startsWith(">&", i)) {
      const next = source.slice(i + 2, i + 64).trimStart()[0];
      s.redirect(next !== undefined && /[0-9-]/.test(next) ? ">&" : ">");
      i += 2;
    } else if (source.startsWith("<<<", i)) {
      s.redirect("<<<");
      i += 3;
    } else if (source.startsWith("<<", i)) {
      const stripTabs = source[i + 2] === "-";
      s.redirect("<<");
      const read = readHeredocDelimiter(source, i + (stripTabs ? 3 : 2));
      if (read.delimiter !== null)
        pending.push({ delimiter: read.delimiter, stripTabs, tokens: s.tokens });
      i = read.end;
    } else if (source.startsWith("<&", i)) {
      s.redirect("<&");
      i += 2;
    } else if (c === ">") {
      s.redirect(">");
      i += 1;
    } else if (c === "<") {
      s.redirect("<");
      i += 1;
    } else if (c === ";" || c === "|" || c === "&") {
      s.endSegment(c);
      i += 1;
    } else if (c === "(" || c === ")") {
      s.pushWord();
      i += 1;
    } else {
      s.literal(c);
      i += 1;
    }
  }
  s.endSegment("");
  return s.segments;
}

const POWERSHELL_ESCAPES = {
  0: "\0",
  a: "\x07",
  b: "\b",
  e: "\x1b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
};

/**
 * Splits a PowerShell command into segments of words and redirection operators.
 *
 * @param {string} source
 * @returns {LexedSegment[]}
 */
export function lexPowerShell(source) {
  const s = createLexState();
  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === " " || c === "\t" || c === "\r") {
      s.pushWord();
      i += 1;
    } else if (c === "\n") {
      s.endSegment(";");
      i += 1;
    } else if (c === "<" && source[i + 1] === "#" && !s.inWord) {
      const end = source.indexOf("#>", i + 2);
      i = end === -1 ? n : end + 2;
    } else if (c === "#" && !s.inWord) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? n : end;
    } else if (c === "`") {
      if (source[i + 1] === "\n") i += 2;
      else if (source.startsWith("\r\n", i + 1)) i += 3;
      else if (i + 1 < n) {
        s.append(source[i + 1], source[i + 1] === "\\" ? "/" : source[i + 1]);
        i += 2;
      } else i += 1;
    } else if (
      c === "@" &&
      (source[i + 1] === "'" || source[i + 1] === '"') &&
      /^[ \t]*\r?\n/.test(source.slice(i + 2, i + 256))
    ) {
      const quote = source[i + 1];
      const bodyStart = source.indexOf("\n", i + 2) + 1;
      const close = new RegExp(`\\r?\\n${quote}@`, "g");
      close.lastIndex = bodyStart - 1;
      const found = close.exec(source);
      const body = found ? source.slice(bodyStart, found.index) : source.slice(bodyStart);
      s.append(body, slashes(body));
      s.quoted = true;
      i = found ? found.index + found[0].length : n;
    } else if (c === "'") {
      let text = "";
      let k = i + 1;
      while (k < n) {
        if (source[k] === "'") {
          if (source[k + 1] === "'") {
            text += "'";
            k += 2;
            continue;
          }
          break;
        }
        text += source[k];
        k += 1;
      }
      s.append(text, slashes(text));
      s.quoted = true;
      i = Math.min(k + 1, n);
    } else if (c === '"') {
      let text = "";
      let pathText = "";
      let k = i + 1;
      while (k < n) {
        const ch = source[k];
        if (ch === '"') {
          if (source[k + 1] === '"') {
            text += '"';
            pathText += '"';
            k += 2;
            continue;
          }
          break;
        }
        if (ch === "`" && k + 1 < n) {
          const next = source[k + 1];
          const value = POWERSHELL_ESCAPES[next] ?? next;
          text += value;
          pathText += value;
          k += 2;
        } else if (ch === "$" && source[k + 1] === "(") {
          const read = readBalanced(source, k + 2, "`");
          s.nested.push({ text: read.text, dialect: "powershell" });
          text += read.text;
          pathText += read.text;
          k = read.end;
        } else {
          text += ch;
          pathText += ch === "\\" ? "/" : ch;
          k += 1;
        }
      }
      s.append(text, pathText);
      s.quoted = true;
      i = Math.min(k + 1, n);
    } else if (c === "$" && source[i + 1] === "(") {
      const read = readBalanced(source, i + 2, "`");
      s.nested.push({ text: read.text, dialect: "powershell" });
      s.substitution(read.text);
      i = read.end;
    } else if (c === "@" && source[i + 1] === "(") {
      s.pushWord();
      i += 2;
    } else if (source.startsWith("&&", i) || source.startsWith("||", i)) {
      s.endSegment(source.slice(i, i + 2));
      i += 2;
    } else if (source.startsWith(">>", i)) {
      s.redirect(">>");
      i += 2;
    } else if (source.startsWith(">&", i)) {
      s.redirect(">&");
      i += 2;
    } else if (c === ">") {
      s.redirect(">");
      i += 1;
    } else if (c === "<") {
      s.redirect("<");
      i += 1;
    } else if (c === ";" || c === "|") {
      s.endSegment(c);
      i += 1;
    } else if ("&(){},".includes(c)) {
      s.pushWord();
      i += 1;
    } else {
      s.literal(c, c === "\\" ? "/" : c);
      i += 1;
    }
  }
  s.endSegment("");
  return s.segments;
}

const SHELL_PROGRAMS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "fish", "busybox"]);
const POWERSHELL_PROGRAMS = new Set(["pwsh", "powershell"]);

function programName(value) {
  if (value.length > MAX_VERB_CHARS) return "";
  return path.posix
    .basename(slashes(value))
    .replace(/\.exe$/i, "")
    .toLowerCase();
}

function isEncodedCommandFlag(flag) {
  if (flag === "-ec") return true;
  if (!/^-e[a-z]*$/.test(flag)) return false;
  return "encodedcommand".startsWith(flag.slice(1));
}

function decodeEncodedCommand(text) {
  if (text.length > MAX_COMMAND_CHARS * 2 || !/^[A-Za-z0-9+/=\s]+$/.test(text)) return null;
  try {
    return Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf16le");
  } catch {
    return null;
  }
}

/**
 * Command strings handed to another interpreter within one segment, and the word indices they
 * used. One pass over the words.
 *
 * @param {ShellWord[]} words
 * @returns {Array<{ text: string, dialect: "bash" | "powershell", consumed: number[] }>}
 */
function commandStrings(words) {
  const out = [];
  const n = words.length;
  const names = words.map((word) => programName(word.value));
  const lower = words.map((word) =>
    word.value.length <= MAX_VERB_CHARS ? word.value.toLowerCase() : "",
  );
  const rest = (from, dialect) => {
    const consumed = [];
    for (let k = from; k < n; k += 1) consumed.push(k);
    return {
      text: words
        .slice(from)
        .map((word) => word.value)
        .join(" "),
      dialect,
      consumed,
    };
  };
  const single = (index, dialect, text = words[index].value) => ({
    text,
    dialect,
    consumed: [index],
  });
  if (names[0] === "eval") out.push(rest(1, "bash"));
  if (names[0] === "invoke-expression" || names[0] === "iex") out.push(rest(1, "powershell"));
  lower.forEach((value, index) => {
    if (value === "[scriptblock]::create" && index + 1 < n)
      out.push(single(index + 1, "powershell"));
  });
  const seen = new Set();
  for (let j = 0; j + 1 < n; j += 1) {
    if (j > 0) seen.add(names[j - 1]);
    const flag = lower[j];
    const has = (list) => list.some((name) => seen.has(name));
    if ([...POWERSHELL_PROGRAMS].some((name) => seen.has(name))) {
      if (/^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/.test(flag)) {
        out.push(rest(j + 1, "powershell"));
        break;
      }
      if (isEncodedCommandFlag(flag)) {
        const decoded = decodeEncodedCommand(words[j + 1].value);
        if (decoded !== null) out.push(single(j + 1, "powershell", decoded));
        continue;
      }
    }
    if (/^-[a-z]*c[a-z]*$/.test(flag) && [...SHELL_PROGRAMS].some((name) => seen.has(name))) {
      out.push(single(j + 1, "bash"));
    } else if (/^\/[ck]$/.test(flag) && seen.has("cmd")) {
      out.push(rest(j + 1, "bash"));
      break;
    } else if ((flag === "-c" || flag === "--command") && has(["su", "flock"])) {
      out.push(single(j + 1, "bash"));
    } else if (/^-[a-z]*c$/.test(flag) && seen.has("script")) {
      out.push(single(j + 1, "bash"));
    } else if ((flag === "-c" || flag === "--call") && has(["npx", "npm", "pnpm"])) {
      out.push(single(j + 1, "bash"));
    } else if ((words[j].value === "-S" || flag === "--split-string") && seen.has("env")) {
      out.push(single(j + 1, "bash"));
    }
    const inline = /^--(?:call|split-string|command)=(.+)$/s.exec(words[j].value);
    if (inline && has(["npx", "npm", "env", "su", "flock"])) {
      out.push({ text: inline[1], dialect: "bash", consumed: [j] });
    }
  }
  const watch = names.indexOf("watch");
  if (watch !== -1) {
    let k = watch + 1;
    while (k < n && words[k].value.startsWith("-")) {
      k += /^-(?:n|-interval)$/.test(words[k].value) ? 2 : 1;
    }
    if (k < n) out.push(rest(k, "bash"));
  }
  return out;
}

/**
 * @typedef {object} CommandSegment
 * @property {Array<ShellWord | ShellOp>} tokens
 * @property {string} sep
 * @property {number} depth 0 for the command itself; nested command strings are deeper.
 * @property {number} parent Index of the segment a nested command came from (-1 at the top).
 * @property {"bash" | "powershell"} dialect
 * @property {number} group Segments lexed from the same text share a group (pipelines).
 * @property {boolean} soft A quoted word read as a possible command; the path checks skip it.
 */

function wordsOf(tokens) {
  return tokens.filter((token) => token.kind === "word");
}

/**
 * A parser that appends to one flat segment list, within one nesting budget.
 *
 * @param {{ deadline?: Deadline }} [options]
 */
function createParser({ deadline = NO_DEADLINE } = {}) {
  const flat = [];
  let budget = MAX_NESTED_COMMANDS;
  let chars = MAX_NESTED_CHARS;
  let groups = 0;
  const nestedAllowed = (text) => {
    if (budget <= 0 || chars < text.length) return false;
    budget -= 1;
    chars -= text.length;
    return true;
  };
  const visit = (text, dialect, depth, parent, soft) => {
    deadline.check();
    const segments = dialect === "powershell" ? lexPowerShell(text) : lexBash(text);
    const group = groups;
    groups += 1;
    for (let k = 0; k < segments.length; k += 1) {
      const segment = segments[k];
      flat.push({ tokens: segment.tokens, sep: segment.sep, depth, parent, dialect, group, soft });
      const index = flat.length - 1;
      if (depth >= MAX_NESTING) continue;
      const words = wordsOf(segment.tokens);
      const strings = commandStrings(words);
      const consumed = new Set(strings.flatMap((inner) => inner.consumed));
      const hard = [...segment.nested, ...strings];
      // A shell reading its script from a here-document, a here-string or an echo in a pipe.
      const shell = words.some((word) => {
        if (word.heredoc) return false;
        const name = programName(word.value);
        return SHELL_PROGRAMS.has(name) || POWERSHELL_PROGRAMS.has(name);
      });
      if (shell && strings.length === 0) {
        const innerDialect = words.some((word) => POWERSHELL_PROGRAMS.has(programName(word.value)))
          ? "powershell"
          : "bash";
        segment.tokens.forEach((token, position) => {
          if (token.kind !== "word") return;
          const previous = segment.tokens[position - 1];
          if (token.heredoc || (previous?.kind === "op" && previous.value === "<<<")) {
            hard.push({ text: token.value, dialect: innerDialect });
            consumed.add(words.indexOf(token));
          }
        });
        const before = k > 0 ? segments[k - 1] : null;
        if (before !== null && (before.sep === "|" || before.sep === "|&")) {
          const producer = wordsOf(before.tokens);
          if (["echo", "printf"].includes(programName(producer[0]?.value ?? ""))) {
            hard.push({
              text: producer
                .slice(1)
                .map((word) => word.value)
                .join(" "),
              dialect: innerDialect,
            });
          }
        }
      }
      for (const inner of hard) {
        if (!nestedAllowed(inner.text)) break;
        visit(inner.text, inner.dialect, depth + 1, index, soft);
      }
      // Quoted words with spaces may be commands run elsewhere (ssh, docker, a message…): the
      // command patterns read them, the path checks do not.
      words.forEach((word, position) => {
        if (consumed.has(position) || word.heredoc || !/\s/.test(word.value)) return;
        if (!nestedAllowed(word.value)) return;
        visit(word.value, dialect, depth + 1, index, true);
      });
    }
  };
  const visitNested = (text, dialect, depth, parent, soft) => {
    if (depth <= MAX_NESTING && nestedAllowed(text)) visit(text, dialect, depth, parent, soft);
  };
  return { flat, visit, visitNested };
}

/**
 * Parses a command into a flat list of segments, nested command strings included (each right
 * after the segment it came from).
 *
 * @param {string} command
 * @param {"bash" | "powershell"} dialect
 * @param {{ deadline?: Deadline }} [options]
 * @returns {CommandSegment[]}
 */
export function parseCommand(command, dialect, options = {}) {
  const parser = createParser(options);
  parser.visit(command, dialect, 0, -1, false);
  return parser.flat;
}

/**
 * One segment as text: words (with `; & | < >` and line breaks inside a word replaced by
 * spaces) and operators joined by single spaces, and where each token starts.
 *
 * @param {Array<ShellWord | ShellOp>} tokens
 * @returns {{ text: string, starts: number[] }}
 */
export function renderSegment(tokens) {
  let text = "";
  const starts = [];
  for (const token of tokens) {
    if (text !== "") text += " ";
    starts.push(text.length);
    text += token.kind === "op" ? token.value : token.value.replace(/[;&|<>\r\n]/g, " ");
  }
  return { text, starts };
}

/**
 * The whole command as normalised text: every segment rendered and joined by its operator.
 *
 * @param {CommandSegment[]} segments
 * @returns {string}
 */
export function renderCommand(segments) {
  return segments
    .map((segment) => `${renderSegment(segment.tokens).text} ${segment.sep || ";"}`)
    .join(" ");
}

// ---------------------------------------------------------------------------------------------
// Words, variables and targets

const CD_COMMANDS = new Set(["cd", "pushd", "chdir", "set-location", "sl", "push-location"]);

function derivedWord(value, from = null) {
  return {
    kind: "word",
    value,
    pathValue: slashes(value),
    quoted: from?.quoted ?? false,
    glob: (from?.glob ?? false) && /[*?[]/.test(value),
    brace: (from?.brace ?? false) && value.includes("{"),
  };
}

function cdTarget(words) {
  let k = 0;
  while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k].value)) k += 1;
  if (!CD_COMMANDS.has((words[k]?.value ?? "").toLowerCase())) return undefined;
  const args = words.slice(k + 1);
  for (let j = 0; j < args.length; j += 1) {
    const value = args[j].value;
    if (/^-(?:path|literalpath)$/i.test(value)) return args[j + 1] ?? null;
    const inline = /^-(?:path|literalpath):(.+)$/i.exec(value);
    if (inline) return derivedWord(inline[1]);
    if (value === "-") return null;
    if (value.startsWith("-")) continue;
    return args[j];
  }
  return derivedWord("~");
}

/**
 * Expands `~`, `~+`, `$NAME`, `${NAME}` and `$env:NAME` in a path word: `PWD` is the segment's
 * directory, `HOME`, `USERPROFILE` and `CLAUDE_PROJECT_DIR` come from the run, variables the
 * command assigns come next, anything else from the hook's environment (the shell tool inherits
 * the same session environment). An unknown variable stays as written, which keeps the path
 * inside the working directory.
 */
function expandVariables(value, vars) {
  let text = value;
  if (text === "~+" || text.startsWith("~+/")) text = vars.cwd + text.slice(2);
  else if (text === "~" || text.startsWith("~/") || text.startsWith("~\\")) {
    text = vars.home + text.slice(1);
  }
  if (!text.includes("$")) return text;
  const lookup = (name, match) => {
    const upper = name.toUpperCase();
    if (upper === "PWD") return vars.cwd;
    if (upper === "HOME" || upper === "USERPROFILE") return vars.home;
    if (upper === "CLAUDE_PROJECT_DIR" && vars.projectDir) return vars.projectDir;
    const assigned = vars.assigned?.get(name);
    if (typeof assigned === "string" && assigned !== "" && !assigned.includes("$")) return assigned;
    const fromEnv = vars.env?.[name] ?? vars.env?.[upper];
    return typeof fromEnv === "string" && fromEnv !== "" ? fromEnv : match;
  };
  return text.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$env:([A-Za-z_][A-Za-z0-9_]*)|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced, powershell, plain) => lookup(braced ?? powershell ?? plain, match),
  );
}

/**
 * The path candidates a word names: the word, an option's value (`--file=x`), an assignment's
 * value, and brace alternatives (unquoted braces only; past the cap the check fails closed).
 * Words that cannot be paths (line breaks, over 4,096 characters) give nothing.
 */
function wordCandidates(word) {
  const out = new Set();
  for (const value of [word.value, word.pathValue]) {
    if (value === "" || value.length > MAX_PATH_CHARS || /[\r\n]/.test(value)) continue;
    const option = /^-{1,2}[A-Za-z][\w-]*[=:](.+)$/.exec(value);
    if (option) {
      out.add(option[1]);
      continue;
    }
    if (value.startsWith("-")) continue;
    out.add(value);
    const assignment = /^[A-Za-z_][\w.-]*=(.+)$/.exec(value);
    if (assignment) out.add(assignment[1]);
  }
  if (word.brace) {
    for (const value of [...out]) {
      if (!value.includes("{") || !value.includes(",")) continue;
      const expanded = expandBracesBounded(value, MAX_BRACE_EXPANSIONS);
      if (!expanded.complete) {
        throw new ProtectionIncomplete(
          `a word expands to more than ${MAX_BRACE_EXPANSIONS} brace alternatives`,
        );
      }
      for (const item of expanded.items) out.add(item);
    }
  }
  return [...out];
}

function hasWildcard(value) {
  return /[*?[]/.test(value);
}

function isDirectoryOnDisk(absolute, platform) {
  if (platform !== process.platform) return false;
  try {
    return fs.statSync(absolute).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The first matching path a word names, relative to the project, or null. `test` decides what
 * matches (default: a protected path); with `containment` (protection only) a directory that
 * holds protected files, or an ancestor of the project, counts too.
 *
 * @param {ShellWord} word
 * @param {InspectionContext} ctx
 * @param {string[]} cwds
 * @param {{ containment?: boolean, test?: (relative: string) => boolean, names?: string[] }} [how]
 * @returns {string | null}
 */
function resolveWord(word, ctx, cwds, how = {}) {
  const { containment = false, test = null } = how;
  for (const raw of wordCandidates(word)) {
    for (const cwd of cwds) {
      const expanded = expandVariables(raw, { ...ctx.vars, cwd });
      if (expanded.length > MAX_PATH_CHARS) continue;
      const candidate = normaliseToolPath(expanded, ctx.platform);
      const glob = word.glob && hasWildcard(candidate);
      const key =
        test === null ? `${glob ? "g" : "p"}${containment ? 1 : 0}\0${cwd}\0${candidate}` : null;
      let found;
      if (key !== null && ctx.targetCache?.has(key)) found = ctx.targetCache.get(key);
      else {
        found = glob
          ? wildcardTarget(candidate, ctx, cwd, { containment, test, names: how.names })
          : plainTarget(candidate, ctx, cwd, { containment, test });
        if (key !== null) ctx.targetCache?.set(key, found);
      }
      if (found !== null) return found;
    }
  }
  return null;
}

function plainTarget(candidate, ctx, cwd, { containment, test }) {
  const { protection, roots, platform } = ctx;
  const { absolute, relatives } = projectRelativePaths(candidate, { roots, cwd, platform });
  if (relatives.length === 0) {
    if (containment && test === null && isAncestorOfRoot(absolute, roots, platform)) return ".";
    return null;
  }
  for (const relative of relatives) {
    if (test !== null ? test(relative) : protectingRules(protection, relative).length > 0) {
      return relative;
    }
  }
  if (!containment || test !== null) return null;
  if (!candidate.endsWith("/") && !isDirectoryOnDisk(absolute, platform)) return null;
  const onDisk = platform === process.platform ? absolute : null;
  for (const relative of relatives) {
    if (directoryHoldsProtected(protection, relative, onDisk, { deadline: ctx.deadline })) {
      return relative === "" ? "." : `${relative.replace(/\/+$/, "")}/`;
    }
  }
  return null;
}

/** Whether a path below a wildcard directory matches the pattern's remaining segments. */
function matchesSegments(patternSegments, pathSegments, caseInsensitive, prefixOk) {
  const fold = (text) => (caseInsensitive ? text.toLowerCase() : text);
  const walk = (p, s) => {
    if (p === patternSegments.length) return s === pathSegments.length || prefixOk;
    if (s === pathSegments.length) return false;
    if (patternSegments[p] === "**") return walk(p + 1, s) || walk(p, s + 1);
    return wildcardMatch(fold(patternSegments[p]), fold(pathSegments[s])) && walk(p + 1, s + 1);
  };
  return walk(0, 0);
}

function wildcardTarget(candidate, ctx, cwd, { containment, test, names: knownNames }) {
  const { protection, roots, platform } = ctx;
  const accepts = (relative) =>
    test !== null ? test(relative) : protectingRules(protection, relative).length > 0;
  const segments = candidate.split("/");
  const firstWild = segments.findIndex(hasWildcard);
  const directory =
    segments.slice(0, firstWild).join("/") || (candidate.startsWith("/") ? "/" : ".");
  const { absolute, relatives } = projectRelativePaths(directory, { roots, cwd, platform });
  if (relatives.length === 0) return null;
  const onDisk = platform === process.platform ? absolute : null;
  const shown = (relative, rest) => `${relative ? `${relative}/` : ""}${rest}`;
  if (firstWild < segments.length - 1) {
    // A wildcard directory: the protected files below the literal part that the rest matches.
    const pattern = segments
      .slice(firstWild)
      .filter((segment, k, all) => segment !== "" && !(segment === "**" && all[k - 1] === "**"));
    if (pattern.some((segment) => segment.length > MAX_GLOB_CHARS)) {
      throw new ProtectionIncomplete(`a wildcard is longer than ${MAX_GLOB_CHARS} characters`);
    }
    for (const relative of relatives) {
      if (onDisk === null) {
        if (test === null && directoryHoldsProtected(protection, relative, null)) {
          return shown(relative, pattern.join("/"));
        }
        continue;
      }
      const walk = walkFiles(onDisk, relative.replace(/\/+$/, ""), accepts, {
        deadline: ctx.deadline,
      });
      if (walk.capped) return shown(relative, pattern.join("/"));
      const base = relative === "" ? 0 : relative.replace(/\/+$/, "").split("/").length;
      for (const file of walk.files) {
        const below = file.split("/").slice(base);
        if (matchesSegments(pattern, below, protection.caseInsensitive, containment)) {
          return shown(relative, pattern.join("/"));
        }
      }
    }
    return null;
  }
  const basePattern = segments[firstWild];
  const matches = wordGlobMatcher(basePattern, protection.caseInsensitive);
  // The names the wildcard expands to: the directory's entries when it can be listed, otherwise
  // every protected file name it could match plus a sample name.
  let names = null;
  if (onDisk !== null) {
    try {
      names = fs
        .readdirSync(onDisk)
        .slice(0, MAX_WILDCARD_ENTRIES)
        .filter((name) => name.length <= MAX_NAME_CHARS && matches(name));
    } catch {
      names = null;
    }
  }
  if (names === null) {
    const sample = basePattern.replace(/\[([^\]])[^\]]*\]/g, "$1").replace(/[*?]/g, "x");
    const set = new Set([sample]);
    for (const name of knownNames ?? protection.literalNames) {
      if (matches(name)) set.add(name);
    }
    names = [...set];
  }
  for (const relative of relatives) {
    for (const name of names) {
      ctx.deadline.check();
      const target = relative ? `${relative}/${name}` : name;
      if (accepts(target)) return shown(relative, basePattern);
      if (containment && test === null && onDisk !== null) {
        const entry = path.join(onDisk, name);
        if (
          isDirectoryOnDisk(entry, platform) &&
          directoryHoldsProtected(protection, target, entry, { deadline: ctx.deadline })
        ) {
          return shown(relative, basePattern);
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Option parsing

/**
 * GNU-style options: short clusters (`-rf`), long options with unambiguous prefixes, values
 * attached or in the next word, `--` ending the options.
 *
 * @param {ShellWord[]} args
 * @param {number} start
 * @param {{ short?: string, long?: string[] }} [spec] Options that take a value.
 * @returns {{ options: Array<{ name: string, value: string | true, word: ShellWord }>, operands: ShellWord[], afterDashDash: number }}
 */
function parseOptions(args, start, spec = {}) {
  const shortValues = spec.short ?? "";
  const longValues = spec.long ?? [];
  const options = [];
  const operands = [];
  let afterDashDash = -1;
  for (let k = start; k < args.length; k += 1) {
    const word = args[k];
    const value = word.value;
    if (afterDashDash !== -1 || value === "-" || !value.startsWith("-") || value.length < 2) {
      operands.push(word);
      continue;
    }
    if (value === "--") {
      afterDashDash = operands.length;
      continue;
    }
    if (value.startsWith("--")) {
      const eq = value.indexOf("=");
      const name = eq === -1 ? value.slice(2) : value.slice(2, eq);
      const canonical =
        longValues.find((long) => long === name) ??
        (name.length >= 3 ? longValues.find((long) => long.startsWith(name)) : undefined);
      if (eq !== -1) {
        options.push({ name: canonical ?? name, value: value.slice(eq + 1), word });
      } else if (canonical !== undefined && k + 1 < args.length) {
        options.push({ name: canonical, value: args[k + 1].value, word: args[k + 1] });
        k += 1;
      } else {
        options.push({ name, value: true, word });
      }
      continue;
    }
    for (let c = 1; c < value.length; c += 1) {
      const letter = value[c];
      if (shortValues.includes(letter)) {
        const rest = value.slice(c + 1);
        if (rest !== "") {
          options.push({ name: letter, value: rest, word: derivedWord(rest, word) });
        } else if (k + 1 < args.length) {
          options.push({ name: letter, value: args[k + 1].value, word: args[k + 1] });
          k += 1;
        }
        break;
      }
      options.push({ name: letter, value: true, word });
    }
  }
  return { options, operands, afterDashDash };
}

function hasOption(parsed, ...names) {
  return parsed.options.some((option) => names.includes(option.name));
}

function optionWords(parsed, ...names) {
  return parsed.options.filter((option) => names.includes(option.name)).map((o) => o.word);
}

const PS_SWITCHES = new Set([
  "force",
  "recurse",
  "passthru",
  "whatif",
  "confirm",
  "container",
  "nonewline",
  "append",
  "noclobber",
  "asbytestream",
  "verbose",
  "debug",
  "followsymlink",
  "hidden",
  "readonly",
  "system",
  "directory",
  "file",
  "usetransaction",
  "name",
]);

const PS_COMMON = [
  "verbose",
  "debug",
  "erroraction",
  "warningaction",
  "informationaction",
  "errorvariable",
  "warningvariable",
  "informationvariable",
  "outvariable",
  "outbuffer",
  "pipelinevariable",
  "progressaction",
];

/** PowerShell cmdlets the checks read: their parameters and positional order. */
const PS_CMDLETS = {
  copy: {
    names: ["path", "literalpath", "destination", "filter", "include", "exclude", "credential"],
    positional: ["path", "destination"],
  },
  move: {
    names: ["path", "literalpath", "destination", "filter", "include", "exclude", "credential"],
    positional: ["path", "destination"],
  },
  rename: {
    names: ["path", "literalpath", "newname", "credential"],
    positional: ["path", "newname"],
  },
  remove: {
    names: ["path", "literalpath", "filter", "include", "exclude", "credential", "stream"],
    positional: ["path*"],
  },
  content: {
    names: ["path", "literalpath", "value", "filter", "include", "exclude", "encoding", "stream"],
    positional: ["path", "value"],
  },
  outfile: {
    names: ["filepath", "literalpath", "encoding", "width", "inputobject"],
    positional: ["filepath", "encoding"],
    aliases: { path: "filepath" },
  },
  tee: {
    names: ["filepath", "literalpath", "variable", "inputobject", "encoding"],
    positional: ["filepath"],
    aliases: { path: "filepath" },
  },
  newitem: {
    names: ["path", "name", "itemtype", "value", "credential"],
    positional: ["path"],
    aliases: { target: "value", type: "itemtype" },
  },
  list: {
    names: ["path", "literalpath", "filter", "include", "exclude", "depth", "attributes"],
    positional: ["path", "filter"],
  },
};

const PS_PARAMETER_ALIASES = { pspath: "literalpath", lp: "literalpath", fullname: "path" };

/**
 * PowerShell parameters: any unambiguous prefix (`-Dest`, `-De`), `-Name:value`, switches
 * without a value, positional binding in the cmdlet's order.
 *
 * @param {ShellWord[]} args
 * @param {number} start
 * @param {{ names: string[], positional: string[], aliases?: Record<string, string> }} spec
 * @returns {Map<string, ShellWord[]>}
 */
function psParameters(args, start, spec) {
  const named = new Map();
  const positional = [];
  const known = [...spec.names, ...PS_SWITCHES, ...PS_COMMON];
  const resolve = (name) => {
    if (spec.aliases?.[name]) return spec.aliases[name];
    if (PS_PARAMETER_ALIASES[name]) return PS_PARAMETER_ALIASES[name];
    if (known.includes(name)) return name;
    // Any prefix works when unambiguous; an ambiguous one prefers the cmdlet's own parameter.
    return (
      spec.names.find((candidate) => candidate.startsWith(name)) ??
      known.find((candidate) => candidate.startsWith(name)) ??
      name
    );
  };
  const add = (name, word) => {
    if (!named.has(name)) named.set(name, []);
    if (word !== null) named.get(name).push(word);
  };
  for (let k = start; k < args.length; k += 1) {
    const value = args[k].value;
    if (/^-[A-Za-z]/.test(value) && value.length <= MAX_VERB_CHARS) {
      let name = value.slice(1);
      let inline = null;
      const colon = name.indexOf(":");
      if (colon !== -1) {
        inline = name.slice(colon + 1);
        name = name.slice(0, colon);
      }
      const canonical = resolve(name.toLowerCase());
      if (inline !== null && inline !== "") add(canonical, derivedWord(inline, args[k]));
      else if (PS_SWITCHES.has(canonical) && !spec.names.includes(canonical)) add(canonical, null);
      else if (k + 1 < args.length) {
        add(canonical, args[k + 1]);
        k += 1;
      }
      continue;
    }
    positional.push(args[k]);
  }
  let slot = 0;
  for (const word of positional) {
    while (slot < spec.positional.length && named.has(spec.positional[slot])) slot += 1;
    const name = spec.positional[Math.min(slot, spec.positional.length - 1)];
    if (name === undefined) break;
    if (name.endsWith("*")) {
      add(name.slice(0, -1), word);
      continue;
    }
    if (slot >= spec.positional.length) break;
    add(name, word);
    slot += 1;
  }
  return named;
}

function psValues(named, ...names) {
  return names.flatMap((name) => named.get(name) ?? []);
}

// ---------------------------------------------------------------------------------------------
// Verbs

/** What a program does to its operands, by lower-case name. */
const VERB_KINDS = new Map([
  ["rm", "delete"],
  ["rmdir", "delete"],
  ["unlink", "delete"],
  ["del", "delete"],
  ["erase", "delete"],
  ["rd", "delete"],
  ["srm", "delete"],
  ["trash", "delete"],
  ["trash-put", "delete"],
  ["shred", "delete"],
  ["ri", "delete-ps"],
  ["remove-item", "delete-ps"],
  ["chmod", "perm"],
  ["chown", "perm"],
  ["chgrp", "perm"],
  ["chattr", "perm"],
  ["setfacl", "perm"],
  ["cp", "copy"],
  ["copy", "copy"],
  ["install", "copy"],
  ["rsync", "copy"],
  ["ditto", "copy"],
  ["scp", "copy"],
  ["cpi", "copy-ps"],
  ["copy-item", "copy-ps"],
  ["mv", "move"],
  ["move", "move"],
  ["rename", "rename"],
  ["mi", "move-ps"],
  ["move-item", "move-ps"],
  ["rename-item", "rename-ps"],
  ["ren", "rename-ps"],
  ["rni", "rename-ps"],
  ["ln", "link"],
  ["link", "link"],
  ["tee", "tee"],
  ["sponge", "tee"],
  ["tee-object", "tee-ps"],
  ["truncate", "truncate"],
  ["clear-content", "content-ps"],
  ["clc", "content-ps"],
  ["set-content", "content-ps"],
  ["add-content", "content-ps"],
  ["ac", "content-ps"],
  ["out-file", "outfile-ps"],
  ["new-item", "newitem-ps"],
  ["ni", "newitem-ps"],
  ["sed", "sed"],
  ["gsed", "sed"],
  ["perl", "perl"],
  ["ruby", "ruby"],
  ["awk", "awk"],
  ["gawk", "awk"],
  ["ed", "editor"],
  ["ex", "editor"],
  ["vi", "editor"],
  ["vim", "editor"],
  ["nvim", "editor"],
  ["nano", "editor"],
  ["emacs", "editor"],
  ["pico", "editor"],
  ["micro", "editor"],
  ["joe", "editor"],
  ["dd", "dd"],
  ["patch", "patch"],
  ["find", "find"],
  ["git", "git"],
  ["node", "interpreter"],
  ["nodejs", "interpreter"],
  ["deno", "interpreter"],
  ["bun", "interpreter"],
  ["php", "interpreter"],
]);

/** PowerShell aliases that differ from the POSIX programs of the same name. */
const PS_VERB_KINDS = new Map([
  ["cp", "copy-ps"],
  ["copy", "copy-ps"],
  ["mv", "move-ps"],
  ["move", "move-ps"],
  ["rm", "delete-ps"],
  ["del", "delete-ps"],
  ["erase", "delete-ps"],
  ["rd", "delete-ps"],
  ["rmdir", "delete-ps"],
  ["tee", "tee-ps"],
  ["sc", "content-ps"],
]);

const PYTHON = /^(?:python|pypy)[0-9.]*$/;

/** Programs whose output the hook cannot see (a memory file written from them is opaque). */
const OPAQUE_PRODUCERS = new Set([
  "git",
  "curl",
  "wget",
  "base64",
  "xxd",
  "openssl",
  "gpg",
  "gunzip",
  "zcat",
  "bzcat",
  "xzcat",
  "unzip",
  "tar",
  "tr",
  "rev",
  "iconv",
  "uudecode",
  "node",
  "nodejs",
  "deno",
  "bun",
  "php",
  "ruby",
  "perl",
  "invoke-webrequest",
  "iwr",
  "invoke-restmethod",
  "irm",
  "certutil",
]);

/** Programs that list the entries of their operands (`ls dir | xargs rm -r`). */
const LISTING_PRODUCERS = new Set(["ls", "dir"]);
const PS_LISTING_PRODUCERS = new Set(["ls", "dir", "gci", "get-childitem", "gi", "get-item"]);
const ECHO_PRODUCERS = new Set(["echo", "printf", "write-output", "write-host"]);

const DOTNET_FILE_WRITE =
  /^\[(?:system\.)?io\.(?:file|directory)\]::(?:write|append|create|copy|move|replace|delete|open)\w*$/i;

/** A script that may write files (a necessary condition for reading its paths). */
const SCRIPT_WRITES =
  /\b(?:write\w*|append\w*|unlink\w*|rename\w*|copy\w*|symlink\w*|link(?:Sync)?|truncate\w*|rm(?:Sync|dir\w*|tree)?|remove\w*|file_put_contents|fopen|fwrite|fputs|f?chmod\w*|chown\w*|move\w*|os\.replace|shutil|dump|save\w*|touch|mkdir\w*|outputFile\w*|emptyDir\w*)\b|\bopen\s*\([^()]{0,200}?,\s*['"][^'"]{0,8}[wax+]/i;

const SCRIPT_LETTERS = {
  node: "ep",
  nodejs: "ep",
  bun: "ep",
  php: "rBRE",
  ruby: "e",
  perl: "eE",
  python: "c",
};

function verbName(word) {
  if (word.heredoc || /\s/.test(word.value) || word.value.length > MAX_VERB_CHARS) return null;
  const name = programName(word.value);
  return name === "" ? null : name;
}

function verbKind(name, dialect) {
  if (dialect === "powershell" && PS_VERB_KINDS.has(name)) return PS_VERB_KINDS.get(name);
  if (VERB_KINDS.has(name)) return VERB_KINDS.get(name);
  if (PYTHON.test(name)) return "interpreter";
  if (DOTNET_FILE_WRITE.test(name)) return "dotnet";
  return null;
}

/**
 * @typedef {object} Effect
 * @property {"write" | "delete" | "perm"} kind
 * @property {"target" | "destination" | "found" | "patch" | "script"} role
 * @property {number} segIndex
 * @property {string} verb
 * @property {string} match Text shown for the finding.
 * @property {ShellWord} [word] The target (`target`).
 * @property {boolean} [containment]
 * @property {string | null} [cwd] Directory that overrides the segment's (git -C).
 * @property {boolean} [opaque] Content from a source the hook cannot read.
 * @property {ShellWord} [dest] Destination of a copy, move or link.
 * @property {ShellWord[]} [sources]
 * @property {boolean} [targetDir] `-t DIR` named the destination directory.
 * @property {boolean} [noTargetDir] `-T`: the destination is not a directory.
 * @property {boolean} [recursive]
 * @property {boolean} [contents] Copies a directory's contents (rsync `src/`).
 * @property {boolean} [symbolic]
 * @property {ShellWord[]} [roots] Search roots (`found`).
 * @property {Array<{ test: "name" | "path", pattern: string, fold: boolean }>} [filters]
 * @property {boolean} [complex] Filters the checks cannot evaluate (`-o`, `!`, `-regex`).
 * @property {number} [depth]
 * @property {string[]} [paths] Paths a patch names (`patch`).
 * @property {boolean} [unknown] The patch input could not be read.
 * @property {ShellWord | null} [patchDir]
 * @property {string} [text] Inline script (`script`).
 */

function snippet(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= MAX_SNIPPET_CHARS ? clean : `${clean.slice(0, MAX_SNIPPET_CHARS - 1)}…`;
}

function wordsText(words) {
  return words
    .slice(0, 12)
    .map((word) => (word.value.length > 60 ? `${word.value.slice(0, 59)}…` : word.value))
    .join(" ");
}

/**
 * Words, redirections and here-documents of one segment.
 *
 * @param {CommandSegment} segment
 */
function prepareSegment(segment) {
  const args = [];
  const redirects = [];
  const heredocs = [];
  const hereStrings = [];
  const inputs = [];
  const tokens = segment.tokens;
  for (let k = 0; k < tokens.length; k += 1) {
    const token = tokens[k];
    if (token.kind === "op") {
      if (token.value === "<<") continue;
      const next = tokens[k + 1];
      if (next && next.kind === "word" && !next.heredoc) {
        k += 1;
        if (token.value === ">" || token.value === ">>") redirects.push(next);
        else if (token.value === "<") inputs.push(next);
        else if (token.value === "<<<") hereStrings.push(next);
      }
      continue;
    }
    if (token.heredoc) heredocs.push(token);
    else args.push(token);
  }
  return { args, redirects, heredocs, hereStrings, inputs };
}

function isAssignment(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(value);
}

/** Variables a command assigns (`F=x;`, `export F=x`, PowerShell `$f='x'`), last value wins. */
function collectShellVariables(segments) {
  const vars = new Map();
  for (const segment of segments) {
    if (segment.soft) continue;
    const words = wordsOf(segment.tokens).filter((word) => !word.heredoc);
    if (words.length === 0) continue;
    const first = words[0].value;
    const declared = ["export", "local", "declare", "typeset", "readonly"].includes(first);
    const list = declared ? words.slice(1) : words;
    if (declared || list.every((word) => isAssignment(word.value))) {
      for (const word of list) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(word.value);
        if (match && match[2].length <= MAX_PATH_CHARS) vars.set(match[1], match[2]);
      }
    }
    const ps = /^\$([A-Za-z_][A-Za-z0-9_]*)=(.+)$/s.exec(first);
    if (ps && ps[2].length <= MAX_PATH_CHARS) vars.set(ps[1], ps[2]);
    if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(first) && words[1]?.value === "=" && words[2]) {
      if (words[2].value.length <= MAX_PATH_CHARS) vars.set(first.slice(1), words[2].value);
    }
  }
  return vars;
}

// ---------------------------------------------------------------------------------------------
// Git

const GIT_BUILTINS = new Set(
  (
    "add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file " +
    "check-attr check-ignore check-mailmap check-ref-format checkout checkout-index cherry " +
    "cherry-pick citool clean clone column commit commit-graph commit-tree config " +
    "count-objects credential describe diagnose diff diff-files diff-index diff-tree difftool " +
    "fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref " +
    "for-each-repo format-patch fsck gc get-tar-commit-id grep gui hash-object help hook " +
    "index-pack init init-db instaweb interpret-trailers log ls-files ls-remote ls-tree " +
    "mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-tree " +
    "mergetool mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant " +
    "pack-refs patch-id prune prune-packed pull push range-diff read-tree rebase receive-pack " +
    "reflog refs remote repack replace replay request-pull rerere reset restore rev-list " +
    "rev-parse revert rm scalar send-email send-pack shortlog show show-branch show-index " +
    "show-ref sparse-checkout stage stash status stripspace submodule switch symbolic-ref tag " +
    "unpack-file unpack-objects update-index update-ref update-server-info upload-archive " +
    "upload-pack var verify-commit verify-pack verify-tag version whatchanged worktree " +
    "write-tree"
  ).split(" "),
);

const GIT_GLOBAL_VALUE = new Set([
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
  "--exec-path",
  "--attr-source",
  "--list-cmds",
]);

function isTruthy(value) {
  return typeof value === "string" && /^(?:1|true|yes|on)$/i.test(value.trim());
}

/** A git config value: quotes, escapes and comments handled. */
function parseGitValue(raw) {
  let out = "";
  let quoted = false;
  let pending = "";
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      i += 1;
      out += pending + ({ n: "\n", t: "\t", b: "\b" }[next] ?? next);
      pending = "";
      continue;
    }
    if (c === '"') {
      quoted = !quoted;
      out += pending;
      pending = "";
      continue;
    }
    if (!quoted && (c === "#" || c === ";")) break;
    if (!quoted && (c === " " || c === "\t")) {
      if (out !== "") pending += c;
      continue;
    }
    out += pending + c;
    pending = "";
  }
  return out;
}

/** Reads the `[alias]` section (and followed includes) of one git config file. */
function readGitConfig(file, home, aliases, depth, seen) {
  if (depth > MAX_GIT_INCLUDE_DEPTH || seen.has(file)) return;
  seen.add(file);
  const text = readTextCapped(file, MAX_GIT_CONFIG_BYTES);
  if (text === null) return;
  let section = "";
  for (const physical of text.replace(/\\\r?\n/g, "").split(/\r?\n/)) {
    let line = physical;
    const header = /^\s*\[\s*([A-Za-z0-9.-]+)(?:\s+"(?:[^"\\]|\\.)*")?\s*\]/.exec(line);
    if (header) {
      section = header[1].toLowerCase();
      if (line.includes('"')) section += " sub";
      line = line.slice(header[0].length);
    }
    const entry = /^\s*([A-Za-z][A-Za-z0-9-]*)\s*(?:=(.*))?$/.exec(line);
    if (!entry) continue;
    const key = entry[1].toLowerCase();
    const value = entry[2] === undefined ? "true" : parseGitValue(entry[2]);
    if (section === "alias") aliases.set(key, value);
    else if ((section === "include" || section === "includeif sub") && key === "path") {
      const target = value.startsWith("~/")
        ? path.join(home, value.slice(2))
        : path.resolve(path.dirname(file), value);
      readGitConfig(target, home, aliases, depth + 1, seen);
    }
  }
}

function findGitDir(start) {
  let current = start;
  for (let count = 0; count < 64; count += 1) {
    const dotGit = path.join(current, ".git");
    let stat = null;
    try {
      stat = fs.statSync(dotGit);
    } catch {
      stat = null;
    }
    if (stat?.isDirectory()) return { gitDir: dotGit, common: commonDir(dotGit) };
    if (stat?.isFile()) {
      const match = /^gitdir:\s*(.+?)\s*$/m.exec(readTextCapped(dotGit, 4096) ?? "");
      if (match) {
        const gitDir = path.resolve(current, match[1]);
        return { gitDir, common: commonDir(gitDir) };
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function commonDir(gitDir) {
  const text = readTextCapped(path.join(gitDir, "commondir"), 4096);
  return text ? path.resolve(gitDir, text.trim()) : gitDir;
}

/** The aliases git would see in `cwd`, read offline from its config files. */
function gitAliases(cwd, ctx) {
  if (ctx.platform !== process.platform) return new Map();
  if (ctx.gitAliasCache.has(cwd)) return ctx.gitAliasCache.get(cwd);
  const env = ctx.vars.env ?? {};
  const home = ctx.vars.home;
  const files = [];
  if (!isTruthy(env.GIT_CONFIG_NOSYSTEM)) {
    files.push(env.GIT_CONFIG_SYSTEM || (process.platform === "win32" ? null : "/etc/gitconfig"));
  }
  if (env.GIT_CONFIG_GLOBAL) files.push(env.GIT_CONFIG_GLOBAL);
  else {
    const xdg = env.XDG_CONFIG_HOME || path.join(home, ".config");
    files.push(path.join(xdg, "git", "config"), path.join(home, ".gitconfig"));
  }
  const repo = findGitDir(cwd);
  if (repo !== null) {
    files.push(path.join(repo.common, "config"), path.join(repo.gitDir, "config.worktree"));
  }
  const aliases = new Map();
  const seen = new Set();
  for (const file of files) {
    if (typeof file === "string" && file !== "") readGitConfig(file, home, aliases, 0, seen);
  }
  ctx.gitAliasCache.set(cwd, aliases);
  return aliases;
}

/**
 * @typedef {object} GitInvocation
 * @property {string} sub The subcommand after aliases.
 * @property {Array<{ word: ShellWord, alias: boolean }>} args Its arguments; `alias` marks the
 *   ones an alias added.
 * @property {string | null} cwd The directory of `-C`.
 * @property {string[]} aliasCommands Shell commands of `!` aliases.
 * @property {string} match
 */

/**
 * A git invocation: global options skipped (`-C`, `-c`, `--git-dir`, …), the subcommand
 * resolved through `-c alias.*`, `--config-env` and the config files' aliases.
 *
 * @returns {GitInvocation | null}
 */
function gitInvocation(args, start, ctx, cwds) {
  const configs = [];
  let dir = null;
  let k = start + 1;
  while (k < args.length) {
    const value = args[k].value;
    if (value === "-C" && k + 1 < args.length) {
      dir = dir === null ? args[k + 1].pathValue : `${dir}/${args[k + 1].pathValue}`;
      k += 2;
    } else if (value === "-c" && k + 1 < args.length) {
      configs.push(args[k + 1].value);
      k += 2;
    } else if (/^-c./.test(value)) {
      configs.push(value.slice(2));
      k += 1;
    } else if (GIT_GLOBAL_VALUE.has(value) && k + 1 < args.length) {
      if (value === "--config-env") configs.push(configEnv(args[k + 1].value, ctx));
      k += 2;
    } else if (value.startsWith("--config-env=")) {
      configs.push(configEnv(value.slice("--config-env=".length), ctx));
      k += 1;
    } else if (value.startsWith("-")) {
      k += 1;
    } else break;
  }
  if (k >= args.length) return null;
  const baseCwd = cwds[0];
  const cwd =
    dir === null
      ? null
      : pathApi(ctx.platform).resolve(
          baseCwd,
          normaliseToolPath(expandVariables(dir, { ...ctx.vars, cwd: baseCwd }), ctx.platform),
        );
  let sub = args[k].value;
  let rest = args.slice(k + 1).map((word) => ({ word, alias: false }));
  const aliasCommands = [];
  const inline = new Map();
  for (const config of configs) {
    const match = /^alias\.([^=]+)=(.*)$/is.exec(config);
    if (match) inline.set(match[1].toLowerCase(), match[2]);
  }
  for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth += 1) {
    if (GIT_BUILTINS.has(sub)) break;
    const key = sub.toLowerCase();
    const value = inline.get(key) ?? gitAliases(cwd ?? baseCwd, ctx).get(key);
    if (typeof value !== "string" || value === "") break;
    if (value.startsWith("!")) {
      aliasCommands.push(
        [value.slice(1), ...rest.map((arg) => shellQuote(arg.word.value))].join(" "),
      );
      sub = "";
      rest = [];
      break;
    }
    const expansion = wordsOf(lexBash(value)[0]?.tokens ?? []);
    if (expansion.length === 0) break;
    sub = expansion[0].value;
    rest = [...expansion.slice(1).map((word) => ({ word, alias: true })), ...rest];
  }
  const shown = snippet(
    `git ${sub} ${rest
      .slice(0, 8)
      .map((arg) => arg.word.value)
      .join(" ")}`,
  );
  return { sub, args: rest, cwd, aliasCommands, match: shown };
}

function configEnv(value, ctx) {
  const match = /^([^=]+)=(.+)$/.exec(value);
  if (!match) return value;
  const fromEnv = ctx.vars.env?.[match[2]];
  return typeof fromEnv === "string" ? `${match[1]}=${fromEnv}` : value;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const COMMIT_VALUE_SHORT = "mFCct";
const COMMIT_OPTIONAL_SHORT = "Su";
const COMMIT_VALUE_LONG = [
  "message",
  "file",
  "reuse-message",
  "reedit-message",
  "fixup",
  "squash",
  "author",
  "date",
  "cleanup",
  "template",
  "trailer",
  "pathspec-from-file",
];
const PUSH_VALUE_LONG = ["repo", "receive-pack", "exec", "push-option"];

function longOptionTakesValue(name, list) {
  return list.some((long) => long === name || (name.length >= 3 && long.startsWith(name)));
}

/** The text of a hook-skipping option (`-n` on commit, a `--no-verify` abbreviation), or null. */
function gitHookSkip(invocation) {
  const { sub, args } = invocation;
  for (let k = 0; k < args.length; k += 1) {
    const { word, alias } = args[k];
    const value = word.value;
    if (value === "--") break;
    if (value.startsWith("--")) {
      const name = value.split("=")[0];
      // git accepts any unambiguous prefix; --no-v and --no-ve also match --no-verbose.
      if (name.length >= 9 && "--no-verify".startsWith(name)) {
        // The literal option in the command is the git-no-verify entry's.
        if (alias || name !== "--no-verify") return invocation.match;
        continue;
      }
      if (sub === "commit" && !value.includes("=")) {
        if (longOptionTakesValue(name.slice(2), COMMIT_VALUE_LONG)) k += 1;
      }
      continue;
    }
    if (sub !== "commit" || !value.startsWith("-") || value.length < 2) continue;
    for (let c = 1; c < value.length; c += 1) {
      const letter = value[c];
      if (letter === "n") return invocation.match;
      if (COMMIT_OPTIONAL_SHORT.includes(letter)) break;
      if (COMMIT_VALUE_SHORT.includes(letter)) {
        if (c === value.length - 1) k += 1;
        break;
      }
    }
  }
  return null;
}

/** The text of a force push (`--force*`, `-f`, a `+refspec`), or null. */
function gitForcePush(invocation) {
  if (invocation.sub !== "push") return null;
  const { args } = invocation;
  for (let k = 0; k < args.length; k += 1) {
    const value = args[k].word.value;
    if (value === "--") break;
    if (value.startsWith("--")) {
      const name = value.split("=")[0];
      if (name.length >= 5 && name.startsWith("--for")) return invocation.match;
      if (!value.includes("=") && longOptionTakesValue(name.slice(2), PUSH_VALUE_LONG)) k += 1;
      continue;
    }
    if (value.startsWith("-") && value.length > 1) {
      for (let c = 1; c < value.length; c += 1) {
        if (value[c] === "f") return invocation.match;
        if (value[c] === "o") {
          if (c === value.length - 1) k += 1;
          break;
        }
      }
      continue;
    }
    if (value.startsWith("+") && value.length > 1) return invocation.match;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Segment analysis

/**
 * @typedef {object} InspectionContext
 * @property {Protection} protection
 * @property {string[]} roots
 * @property {string} platform
 * @property {{ home: string, projectDir?: string, env: Record<string, string | undefined>, assigned: Map<string, string> }} vars
 * @property {Deadline} deadline
 * @property {CommandSegment[]} segments
 * @property {string[][]} cwds Directories of each segment.
 * @property {Map<string, Map<string, string>>} gitAliasCache
 * @property {Map<string, string | null>} fileCache
 */

function addEffect(info, effect) {
  info.effects.push({ segIndex: info.index, ...effect });
}

/** The segments that feed segment `index` through pipes, nearest first. */
function pipelinePredecessors(ctx, index) {
  const out = [];
  const segment = ctx.segments[index];
  for (let k = index - 1; k >= 0 && out.length < 8; k -= 1) {
    const other = ctx.segments[k];
    if (other.group !== segment.group) continue;
    if (other.sep !== "|" && other.sep !== "|&") break;
    out.push(k);
  }
  return out;
}

function readListFile(word, ctx, cwds) {
  const out = [];
  for (const cwd of cwds) {
    const absolute = absoluteOf(word, ctx, cwd);
    if (absolute === null) continue;
    const text = readTextCapped(absolute, MAX_LIST_BYTES);
    if (text === null) continue;
    for (const line of text.split(/[\r\n\0]+/).slice(0, MAX_LIST_ITEMS)) {
      const value = line.trim();
      if (value !== "") out.push(derivedWord(value));
    }
    break;
  }
  return out;
}

function absoluteOf(word, ctx, cwd) {
  if (word.value === "" || word.value.length > MAX_PATH_CHARS) return null;
  const expanded = expandVariables(word.pathValue, { ...ctx.vars, cwd });
  return pathApi(ctx.platform).resolve(cwd, normaliseToolPath(expanded, ctx.platform));
}

/**
 * What a producer segment feeds into `xargs VERB` or a pipeline cmdlet: effects of `kind` on
 * the files it names.
 */
function producerEffects(info, ctx, producerIndex, kind, verb, match) {
  const segment = ctx.segments[producerIndex];
  const prep = prepareSegment(segment);
  const args = prep.args;
  let start = 0;
  while (start < args.length && isAssignment(args[start].value)) start += 1;
  const name = args[start] ? programName(args[start].value) : "";
  const base = { kind, verb, match, segIndex: producerIndex };
  if (name === "find") {
    const { roots, filters, complex } = parseFind(args, start);
    info.effects.push({ ...base, role: "found", roots, filters, complex, depth: WALK_MAX_DEPTH });
    return;
  }
  if (segment.dialect === "powershell" && PS_LISTING_PRODUCERS.has(name)) {
    const named = psParameters(args, start + 1, PS_CMDLETS.list);
    const roots = psValues(named, "path", "literalpath");
    const filters = psValues(named, "filter", "include").map((word) => ({
      test: "name",
      pattern: word.value,
      fold: true,
    }));
    info.effects.push({
      ...base,
      role: "found",
      roots: roots.length > 0 ? roots : [derivedWord(".")],
      filters,
      complex: false,
      depth: named.has("recurse") ? WALK_MAX_DEPTH : 1,
    });
    return;
  }
  if (LISTING_PRODUCERS.has(name)) {
    const parsed = parseOptions(args, start + 1, {});
    info.effects.push({
      ...base,
      role: "found",
      roots: parsed.operands.length > 0 ? parsed.operands : [derivedWord(".")],
      filters: [],
      complex: false,
      depth: 1,
    });
    return;
  }
  const lines = [...prep.heredocs, ...prep.hereStrings].flatMap((word) =>
    word.value
      .split(/[\r\n]+/)
      .slice(0, MAX_LIST_ITEMS)
      .map((line) => derivedWord(line.trim())),
  );
  const cwds = ctx.cwds[producerIndex] ?? ctx.cwds[info.index];
  let candidates = lines;
  let containment = true;
  if (ECHO_PRODUCERS.has(name)) candidates = [...candidates, ...args.slice(start + 1)];
  else if (name === "cat") {
    for (const word of parseOptions(args, start + 1, {}).operands) {
      candidates = [...candidates, ...readListFile(word, ctx, cwds)];
    }
  } else {
    // Other producers (grep -l, git ls-files, …) take directories as search roots.
    containment = false;
    candidates = [...candidates, ...parseOptions(args, start + 1, {}).operands];
  }
  for (const word of candidates) {
    if (word.value === "") continue;
    info.effects.push({ ...base, role: "target", word, containment });
  }
}

/** Effects for a verb fed from a pipe, `xargs` input or a command substitution. */
function pipedEffects(info, ctx, args, verbIndex, kind, verb, match) {
  const xargsIndex = args.findIndex(
    (word, position) => position < verbIndex && programName(word.value) === "xargs",
  );
  const psPipe = info.segment.dialect === "powershell" && verbIndex === 0;
  if (xargsIndex === -1 && !psPipe) return;
  for (const predecessor of pipelinePredecessors(ctx, info.index)) {
    producerEffects(info, ctx, predecessor, kind, verb, match);
  }
  if (xargsIndex === -1) return;
  const cwds = ctx.cwds[info.index];
  const lists = [...info.prep.inputs];
  const xargs = parseOptions(args.slice(0, verbIndex), xargsIndex + 1, {
    short: "aEeIiLlnPsd",
    long: ["arg-file", "delimiter", "max-args", "max-lines", "max-procs", "replace"],
  });
  lists.push(...optionWords(xargs, "a", "arg-file"));
  for (const word of lists) {
    for (const item of readListFile(word, ctx, cwds)) {
      addEffect(info, { kind, role: "target", word: item, containment: true, verb, match });
    }
  }
  for (const word of info.prep.hereStrings) {
    for (const line of word.value.split(/\s+/).slice(0, MAX_LIST_ITEMS)) {
      if (line === "") continue;
      addEffect(info, {
        kind,
        role: "target",
        word: derivedWord(line),
        containment: true,
        verb,
        match,
      });
    }
  }
}

/** Effects for operands that are command substitutions (`rm $(find …)`). */
function substitutionEffects(info, ctx, operands, kind, verb, match) {
  for (const word of operands) {
    if (typeof word.subst !== "string") continue;
    const segments = lexBash(word.subst);
    if (segments.length === 0) continue;
    // A throwaway segment in the same group, so producer analysis can read it.
    const temp = {
      tokens: segments[segments.length - 1].tokens,
      sep: "",
      depth: info.segment.depth + 1,
      parent: info.index,
      dialect: "bash",
      group: -1,
      soft: false,
    };
    ctx.segments.push(temp);
    ctx.cwds[ctx.segments.length - 1] = ctx.cwds[info.index];
    producerEffects(info, ctx, ctx.segments.length - 1, kind, verb, match);
  }
}

/**
 * `find` roots, name and path filters and actions.
 *
 * @returns {{ roots: ShellWord[], filters: Array<{ test: "name" | "path", pattern: string, fold: boolean }>, complex: boolean, kind: "delete" | "perm" | "write" | null, writes: ShellWord[] }}
 */
function parseFind(args, start) {
  let k = start + 1;
  while (k < args.length && /^-(?:[HLP]|O\d*|D)$/.test(args[k].value)) {
    k += args[k].value === "-D" ? 2 : 1;
  }
  const roots = [];
  while (k < args.length && !/^[-(!,)]/.test(args[k].value)) {
    roots.push(args[k]);
    k += 1;
  }
  const filters = [];
  const writes = [];
  let complex = false;
  let kind = null;
  const stronger = (next) => {
    if (next === "delete" || kind === null || (kind === "write" && next === "perm")) kind = next;
  };
  for (; k < args.length; k += 1) {
    const value = args[k].value;
    const next = args[k + 1];
    if (/^-(?:i?name)$/.test(value) && next) {
      filters.push({ test: "name", pattern: next.value, fold: value === "-iname" });
      k += 1;
    } else if (/^-(?:i?path|i?wholename)$/.test(value) && next) {
      filters.push({ test: "path", pattern: next.value, fold: value.startsWith("-i") });
      k += 1;
    } else if (/^-(?:i?regex|i?lname)$/.test(value)) {
      complex = true;
      k += 1;
    } else if (["-o", "-or", "!", "-not", ","].includes(value)) {
      complex = true;
    } else if (value === "-delete") {
      stronger("delete");
    } else if (/^-(?:exec|execdir|ok|okdir)$/.test(value)) {
      const command = [];
      for (k += 1; k < args.length && args[k].value !== ";" && args[k].value !== "+"; k += 1) {
        command.push(args[k]);
      }
      const classified = classifyCommand(command, 0);
      if (classified !== null) stronger(classified);
    } else if (/^-(?:fprint0?|fls|fprintf)$/.test(value) && next) {
      writes.push(next);
      k += value === "-fprintf" ? 2 : 1;
    }
  }
  return {
    roots: roots.length > 0 ? roots : [derivedWord(".")],
    filters,
    complex,
    kind,
    writes,
  };
}

/** Whether a command (for `find -exec`) deletes, changes modes or writes its operands. */
function classifyCommand(words, depth) {
  let result = null;
  const rank = { write: 1, perm: 2, delete: 3 };
  const take = (kind) => {
    if (kind !== null && (result === null || rank[kind] > rank[result])) result = kind;
  };
  for (let k = 0; k < words.length; k += 1) {
    const name = verbName(words[k]);
    if (name === null) continue;
    const kind = verbKind(name, "bash");
    if (kind === "delete" || kind === "delete-ps") take("delete");
    else if (kind === "perm") take("perm");
    else if (["move", "rename", "tee", "truncate", "editor", "dd"].includes(kind)) take("write");
    else if (["sed", "perl", "ruby", "awk"].includes(kind)) {
      if (words.slice(k + 1).some((word) => /^-(?:[A-Za-z]*i|-in-place)/.test(word.value))) {
        take("write");
      }
    } else if (SHELL_PROGRAMS.has(name) && depth < 2) {
      const flag = words.findIndex((word, position) => position > k && /^-\w*c/.test(word.value));
      if (flag !== -1 && words[flag + 1]) {
        for (const segment of lexBash(words[flag + 1].value)) {
          take(classifyCommand(wordsOf(segment.tokens), depth + 1));
        }
      }
    }
  }
  return result;
}

/** Destination and sources of cp, mv, ln, install, rsync (GNU-style options). */
function copyShape(args, verbIndex, kind, verb) {
  const specs = {
    install: { short: "tSmog", long: ["target-directory", "suffix", "mode", "owner", "group"] },
    rsync: {
      short: "efTBM",
      long: [
        "exclude",
        "include",
        "filter",
        "files-from",
        "exclude-from",
        "include-from",
        "chmod",
        "rsync-path",
        "port",
        "password-file",
        "log-file",
        "backup-dir",
        "suffix",
        "temp-dir",
        "compare-dest",
        "copy-dest",
        "link-dest",
        "partial-dir",
        "rsh",
        "timeout",
        "bwlimit",
        "max-size",
        "min-size",
        "out-format",
      ],
    },
    scp: { short: "cFiJloPS", long: [] },
  };
  const spec = specs[verb] ?? { short: "tS", long: ["target-directory", "suffix"] };
  const parsed = parseOptions(args, verbIndex + 1, spec);
  const targetDirWord = verb === "scp" ? [] : optionWords(parsed, "t", "target-directory");
  const noTargetDir = hasOption(parsed, "T", "no-target-directory") && verb !== "rsync";
  const symbolic = kind === "link" && hasOption(parsed, "s", "symbolic");
  const recursive =
    verb === "ditto" ||
    kind === "move" ||
    hasOption(parsed, "r", "R", "a", "recursive", "archive") ||
    (verb === "cp" && hasOption(parsed, "dereference-recursive"));
  if (targetDirWord.length > 0) {
    return {
      dest: targetDirWord[targetDirWord.length - 1],
      sources: parsed.operands,
      targetDir: true,
      noTargetDir: false,
      recursive,
      symbolic,
    };
  }
  if (parsed.operands.length === 0) return null;
  return {
    dest: parsed.operands[parsed.operands.length - 1],
    sources: parsed.operands.slice(0, -1),
    targetDir: false,
    noTargetDir,
    recursive,
    symbolic,
  };
}

/** In-place editing flags of sed, perl, ruby and awk, and the files they edit. */
function inPlaceTargets(kind, args, verbIndex) {
  if (kind === "sed") {
    const parsed = parseOptions(args, verbIndex + 1, {
      short: "efl",
      long: ["expression", "file", "line-length"],
    });
    const inPlace = parsed.options.some(
      (option) => option.name === "i" || option.name === "I" || option.name === "in-place",
    );
    if (!inPlace) return [];
    const scripted = hasOption(parsed, "e", "f", "expression", "file");
    const operands = parsed.operands.filter((word) => word.value !== "");
    return scripted ? operands : operands.slice(1);
  }
  if (kind === "awk") {
    const parsed = parseOptions(args, verbIndex + 1, {
      short: "fvFiEl",
      long: ["file", "assign", "field-separator", "include", "exec", "load"],
    });
    const inPlace = parsed.options.some(
      (option) => (option.name === "i" || option.name === "include") && option.value === "inplace",
    );
    if (!inPlace) return [];
    const scripted = hasOption(parsed, "f", "E", "file", "exec");
    return scripted ? parsed.operands : parsed.operands.slice(1);
  }
  // perl and ruby: -i[ext] in a cluster; -e CODE takes the next word.
  const valueLetters = kind === "perl" ? "eE" : "eIrCEF";
  const attached = kind === "perl" ? "MmIxl0CdDF" : "";
  let inPlace = false;
  let scripted = false;
  const operands = [];
  for (let k = verbIndex + 1; k < args.length; k += 1) {
    const value = args[k].value;
    if (value === "--") {
      operands.push(...args.slice(k + 1));
      break;
    }
    if (!value.startsWith("-") || value.length < 2 || value.startsWith("--")) {
      if (!value.startsWith("--")) operands.push(args[k]);
      continue;
    }
    for (let c = 1; c < value.length; c += 1) {
      const letter = value[c];
      if (letter === "i") {
        inPlace = true;
        break;
      }
      if (valueLetters.includes(letter)) {
        if (letter === "e" || letter === "E") scripted = true;
        if (c === value.length - 1) k += 1;
        break;
      }
      if (attached.includes(letter)) break;
    }
  }
  if (!inPlace) return [];
  return scripted ? operands : operands.slice(1);
}

/** Inline scripts of an interpreter (`node -e`, `python3 -c`, `php -r`, `deno eval`, stdin). */
function interpreterScripts(name, args, verbIndex, prep) {
  const family = PYTHON.test(name) ? "python" : name;
  const letters = SCRIPT_LETTERS[family] ?? "";
  const scripts = [];
  let operand = false;
  if (family === "deno") {
    const evalAt = args.findIndex((word, k) => k > verbIndex && word.value === "eval");
    if (evalAt !== -1) {
      const code = args.slice(evalAt + 1).find((word) => !word.value.startsWith("-"));
      if (code) scripts.push(code.value);
    }
    return scripts;
  }
  for (let k = verbIndex + 1; k < args.length; k += 1) {
    const value = args[k].value;
    const long = /^--(?:eval|print)(?:=(.*))?$/s.exec(value);
    if (long && (family === "node" || family === "nodejs" || family === "bun")) {
      if (long[1] !== undefined) scripts.push(long[1]);
      else if (args[k + 1]) {
        scripts.push(args[k + 1].value);
        k += 1;
      }
      continue;
    }
    if (/^-[A-Za-z]+$/.test(value) && letters.includes(value[value.length - 1])) {
      if (args[k + 1]) {
        scripts.push(args[k + 1].value);
        k += 1;
      }
      continue;
    }
    const attached = family === "python" ? /^-[A-Za-z]*c(.+)$/s.exec(value) : null;
    if (attached) {
      scripts.push(attached[1]);
      continue;
    }
    if (family === "python" && /^-[WXm]$/.test(value)) {
      k += 1;
      continue;
    }
    if (!value.startsWith("-")) {
      operand = true;
      break;
    }
  }
  const stdinScript = scripts.length === 0 && !operand;
  if (stdinScript) {
    for (const word of [...prep.heredocs, ...prep.hereStrings]) scripts.push(word.value);
  }
  return scripts;
}

/** Effects of the patch a `patch` or `git apply` reads. */
function patchEffect(info, ctx, sources, stripDefault, dir, verb, match, fallbackToStdin = true) {
  const cwds = ctx.cwds[info.index];
  const texts = [];
  let unknown = false;
  for (const word of sources) {
    let text = null;
    for (const cwd of cwds) {
      const absolute = absoluteOf(word, ctx, cwd);
      if (absolute !== null) text = readTextCapped(absolute, MAX_PATCH_BYTES);
      if (text !== null) break;
    }
    if (text === null) unknown = true;
    else texts.push(text);
  }
  if (sources.length === 0 && fallbackToStdin) {
    const stdin = [...info.prep.heredocs, ...info.prep.hereStrings];
    for (const word of info.prep.inputs) {
      let text = null;
      for (const cwd of cwds) {
        const absolute = absoluteOf(word, ctx, cwd);
        if (absolute !== null) text = readTextCapped(absolute, MAX_PATCH_BYTES);
        if (text !== null) break;
      }
      if (text === null) unknown = true;
      else texts.push(text);
    }
    if (stdin.length > 0) texts.push(...stdin.map((word) => word.value));
    else if (info.prep.inputs.length === 0) unknown = true;
  }
  const paths = new Set();
  for (const text of texts) {
    for (const match of text.matchAll(
      /^(?:(?:\+\+\+|---) |(?:rename|copy) (?:from|to) )("?)([^\t\r\n]+?)\1(?:\t[^\r\n]*)?$/gm,
    )) {
      const file = match[2];
      if (file === "/dev/null" || file.length > MAX_PATH_CHARS) continue;
      const parts = file.split("/");
      // The stripped form (patch -p1: a/phpstan.neon names phpstan.neon) first, then as written.
      const strip = stripDefault === null ? 1 : stripDefault;
      if (strip > 0 && parts.length > strip) paths.add(parts.slice(strip).join("/"));
      paths.add(file);
    }
    for (const match of text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)) {
      paths.add(match[1]);
      paths.add(match[2]);
    }
  }
  addEffect(info, {
    kind: "write",
    role: "patch",
    paths: [...paths].slice(0, MAX_LIST_ITEMS),
    unknown,
    patchDir: dir,
    opaque: true,
    verb,
    match,
  });
}

/** Effects of a git subcommand that writes or deletes files. */
function gitEffects(info, ctx, invocation) {
  const words = invocation.args.map((arg) => arg.word);
  const cwd = invocation.cwd;
  const match = invocation.match;
  const base = { cwd, match };
  switch (invocation.sub) {
    case "rm": {
      const parsed = parseOptions(words, 0, { long: ["pathspec-from-file"] });
      if (hasOption(parsed, "n", "dry-run")) return;
      for (const word of parsed.operands) {
        addEffect(info, {
          ...base,
          kind: "delete",
          role: "target",
          word,
          containment: true,
          verb: "rm",
        });
      }
      return;
    }
    case "mv": {
      const parsed = parseOptions(words, 0, {});
      if (hasOption(parsed, "n", "dry-run") || parsed.operands.length < 2) return;
      const dest = parsed.operands[parsed.operands.length - 1];
      const sources = parsed.operands.slice(0, -1);
      addEffect(info, {
        ...base,
        kind: "write",
        role: "destination",
        dest,
        sources,
        recursive: true,
        verb: "mv",
      });
      for (const word of sources) {
        addEffect(info, {
          ...base,
          kind: "write",
          role: "target",
          word,
          containment: true,
          verb: "mv",
        });
      }
      return;
    }
    case "checkout":
    case "restore": {
      const parsed = parseOptions(words, 0, {
        short: invocation.sub === "checkout" ? "bB" : "s",
        long: ["orphan", "conflict", "pathspec-from-file", "source"],
      });
      let targets = [];
      if (invocation.sub === "restore") {
        if (hasOption(parsed, "s", "source")) targets = parsed.operands;
      } else if (parsed.afterDashDash !== -1) {
        if (parsed.afterDashDash > 0) targets = parsed.operands.slice(parsed.afterDashDash);
      } else if (parsed.operands.length >= 2) {
        targets = parsed.operands.slice(1);
      }
      for (const word of targets) {
        addEffect(info, {
          ...base,
          kind: "write",
          role: "target",
          word,
          containment: true,
          opaque: true,
          verb: `git ${invocation.sub}`,
        });
      }
      return;
    }
    case "apply":
    case "am": {
      const parsed = parseOptions(words, 0, {
        short: "pC",
        long: ["directory", "include", "exclude"],
      });
      const checkOnly =
        hasOption(parsed, "check", "stat", "numstat", "summary") && !hasOption(parsed, "apply");
      if (checkOnly) return;
      const strip = optionWords(parsed, "p")[0];
      const dirWord = optionWords(parsed, "directory")[0] ?? null;
      patchEffect(
        info,
        ctx,
        parsed.operands,
        strip ? Number.parseInt(strip.value, 10) || 0 : 1,
        dirWord,
        `git ${invocation.sub}`,
        match,
      );
      return;
    }
    case "clean": {
      const parsed = parseOptions(words, 0, { short: "e", long: ["exclude"] });
      const force = hasOption(parsed, "f", "force");
      const dry = hasOption(parsed, "n", "dry-run");
      const ignored = hasOption(parsed, "x", "X");
      if (!force || dry || !ignored) return;
      const targets = parsed.operands.length > 0 ? parsed.operands : [derivedWord(".")];
      for (const word of targets) {
        addEffect(info, {
          ...base,
          kind: "delete",
          role: "target",
          word,
          containment: true,
          verb: "git clean",
        });
      }
      return;
    }
    default:
  }
}

/** One verb and its operands. */
function analyseVerb(info, ctx, args, verbIndex, name) {
  const dialect = info.segment.dialect;
  const kind = verbKind(name, dialect);
  if (kind === null) return;
  const verb = name;
  const match = snippet(wordsText(args.slice(verbIndex)));
  const target = (word, effectKind, containment = effectKind !== "write", extra = {}) =>
    addEffect(info, { kind: effectKind, role: "target", word, containment, verb, match, ...extra });
  switch (kind) {
    case "delete":
    case "perm": {
      const effectKind = kind === "perm" ? "perm" : "delete";
      const parsed = parseOptions(args, verbIndex + 1, {
        short: name === "shred" ? "ns" : "",
        long: name === "shred" ? ["iterations", "size", "random-source"] : ["reference"],
      });
      for (const word of parsed.operands) target(word, effectKind);
      substitutionEffects(info, ctx, parsed.operands, effectKind, verb, match);
      pipedEffects(info, ctx, args, verbIndex, effectKind, verb, match);
      return;
    }
    case "delete-ps": {
      const named = psParameters(args, verbIndex + 1, PS_CMDLETS.remove);
      for (const word of psValues(named, "path", "literalpath")) target(word, "delete");
      pipedEffects(info, ctx, args, verbIndex, "delete", verb, match);
      return;
    }
    case "copy":
    case "move":
    case "link":
    case "rename": {
      if (kind === "rename") {
        // rename FROM TO FILES…: the files are renamed away from where they are.
        const parsed = parseOptions(args, verbIndex + 1, {});
        for (const word of parsed.operands.slice(2)) target(word, "write", true);
        return;
      }
      const shape = copyShape(args, verbIndex, kind, name);
      if (shape === null) {
        pipedEffects(info, ctx, args, verbIndex, "write", verb, match);
        return;
      }
      addEffect(info, {
        kind: "write",
        role: "destination",
        ...shape,
        contents: name === "rsync",
        verb,
        match,
      });
      if (kind === "move" || kind === "link") {
        // A move takes its sources away; a link to a protected file writes through it.
        for (const word of shape.sources) target(word, "write", true);
      }
      return;
    }
    case "copy-ps":
    case "move-ps": {
      const named = psParameters(
        args,
        verbIndex + 1,
        kind === "copy-ps" ? PS_CMDLETS.copy : PS_CMDLETS.move,
      );
      const sources = psValues(named, "path", "literalpath");
      const dest = psValues(named, "destination")[0];
      if (dest !== undefined) {
        addEffect(info, {
          kind: "write",
          role: "destination",
          dest,
          sources,
          targetDir: false,
          noTargetDir: false,
          recursive: kind === "move-ps" || named.has("recurse"),
          verb,
          match,
        });
      }
      if (kind === "move-ps") for (const word of sources) target(word, "write", true);
      return;
    }
    case "rename-ps": {
      const named = psParameters(args, verbIndex + 1, PS_CMDLETS.rename);
      const sources = psValues(named, "path", "literalpath");
      for (const word of sources) target(word, "write", true);
      const newName = psValues(named, "newname")[0];
      if (newName !== undefined && sources[0] !== undefined) {
        const dir = path.posix.dirname(sources[0].pathValue);
        target(
          derivedWord(dir === "." ? newName.value : `${dir}/${newName.value}`),
          "write",
          false,
        );
      }
      return;
    }
    case "tee": {
      const parsed = parseOptions(args, verbIndex + 1, { long: ["output-error"] });
      for (const word of parsed.operands) target(word, "write");
      return;
    }
    case "tee-ps": {
      const named = psParameters(args, verbIndex + 1, PS_CMDLETS.tee);
      for (const word of psValues(named, "filepath", "literalpath")) target(word, "write");
      return;
    }
    case "truncate": {
      const parsed = parseOptions(args, verbIndex + 1, {
        short: "sr",
        long: ["size", "reference"],
      });
      for (const word of parsed.operands) target(word, "write");
      return;
    }
    case "content-ps": {
      const named = psParameters(args, verbIndex + 1, PS_CMDLETS.content);
      for (const word of psValues(named, "path", "literalpath")) target(word, "write");
      if (verbIndex === 0) pipedEffects(info, ctx, args, verbIndex, "write", verb, match);
      return;
    }
    case "outfile-ps": {
      const named = psParameters(args, verbIndex + 1, PS_CMDLETS.outfile);
      for (const word of psValues(named, "filepath", "literalpath")) target(word, "write");
      return;
    }
    case "newitem-ps": {
      const named = psParameters(args, verbIndex + 1, PS_CMDLETS.newitem);
      const paths = psValues(named, "path");
      const itemName = psValues(named, "name")[0];
      const itemType = (psValues(named, "itemtype")[0]?.value ?? "").toLowerCase();
      const created = itemName
        ? (paths.length > 0 ? paths : [derivedWord(".")]).map((word) =>
            derivedWord(`${word.pathValue.replace(/\/+$/, "")}/${itemName.value}`),
          )
        : paths;
      const link = /link|junction/.test(itemType);
      for (const word of created) target(word, "write", link);
      if (link) for (const word of psValues(named, "value")) target(word, "write", true);
      return;
    }
    case "dotnet": {
      for (const word of args.slice(verbIndex + 1)) target(word, "write");
      return;
    }
    case "sed":
    case "perl":
    case "ruby":
    case "awk": {
      for (const word of inPlaceTargets(kind, args, verbIndex)) target(word, "write");
      if (kind === "perl" || kind === "ruby") {
        for (const text of interpreterScripts(name, args, verbIndex, info.prep)) {
          addEffect(info, { kind: "write", role: "script", text, verb, match });
        }
      }
      return;
    }
    case "editor": {
      // Editors differ in which options take values; every operand word counts (a command
      // string given to -c is never a protected path).
      const parsed = parseOptions(args, verbIndex + 1, {});
      for (const word of parsed.operands) {
        if (!word.value.startsWith("+")) target(word, "write");
      }
      return;
    }
    case "dd": {
      for (const word of args.slice(verbIndex + 1)) {
        const output = /^of=(.+)$/s.exec(word.value);
        if (output) target(derivedWord(output[1], word), "write");
      }
      return;
    }
    case "patch": {
      const parsed = parseOptions(args, verbIndex + 1, {
        short: "pdioDrFBYzVgx",
        long: [
          "strip",
          "directory",
          "input",
          "output",
          "reject-file",
          "ifdef",
          "fuzz",
          "prefix",
          "basename-prefix",
          "suffix",
          "version-control",
          "get",
          "debug",
        ],
      });
      if (hasOption(parsed, "dry-run")) return;
      const input = optionWords(parsed, "i", "input");
      const strip = optionWords(parsed, "p", "strip")[0];
      const dirWord = optionWords(parsed, "d", "directory")[0] ?? null;
      const sources = input.length > 0 ? input : parsed.operands.slice(1, 2);
      if (parsed.operands[0]) target(parsed.operands[0], "write");
      for (const word of optionWords(parsed, "o", "output")) target(word, "write");
      const stripValue = strip ? Number.parseInt(strip.value, 10) : null;
      patchEffect(
        info,
        ctx,
        sources,
        Number.isNaN(stripValue) ? null : stripValue,
        dirWord,
        verb,
        match,
        parsed.operands[0] === undefined || input.length === 0,
      );
      return;
    }
    case "find": {
      const found = parseFind(args, verbIndex);
      for (const word of found.writes) target(word, "write");
      if (found.kind !== null) {
        addEffect(info, {
          kind: found.kind,
          role: "found",
          roots: found.roots,
          filters: found.filters,
          complex: found.complex,
          depth: WALK_MAX_DEPTH,
          verb,
          match,
        });
      }
      return;
    }
    case "interpreter": {
      for (const text of interpreterScripts(name, args, verbIndex, info.prep)) {
        addEffect(info, { kind: "write", role: "script", text, verb, match });
      }
      return;
    }
    default:
  }
}

/** Effects and git invocations of one segment. */
function analyseSegment(ctx, index, parser) {
  const segment = ctx.segments[index];
  const prep = prepareSegment(segment);
  const info = { index, segment, prep, effects: [], gits: [] };
  const args = prep.args;
  const cwds = ctx.cwds[index];
  // Only the first git word and the first other verb of a segment start a command: later ones
  // are its arguments (`echo git commit -n` is still read as git, `sudo rm` as rm).
  const gitAt = args.findIndex((word) => verbName(word) === "git");
  if (gitAt !== -1) {
    const invocation = gitInvocation(args, gitAt, ctx, cwds);
    if (invocation !== null) {
      info.gits.push(invocation);
      for (const text of invocation.aliasCommands) {
        parser.visitNested(text, "bash", segment.depth + 1, index, segment.soft);
      }
      if (!segment.soft) gitEffects(info, ctx, invocation);
    }
  }
  if (segment.soft) return info;
  for (const word of prep.redirects) {
    addEffect(info, {
      kind: "write",
      role: "target",
      word,
      containment: false,
      verb: ">",
      match: snippet(renderSegment(segment.tokens).text),
    });
  }
  for (let i = 0; i < args.length; i += 1) {
    const name = verbName(args[i]);
    if (name === null || name === "git" || verbKind(name, segment.dialect) === null) continue;
    analyseVerb(info, ctx, args, i, name);
    break;
  }
  return info;
}

// ---------------------------------------------------------------------------------------------
// Effect resolution

function effectCwds(effect, ctx) {
  if (typeof effect.cwd === "string") return [effect.cwd];
  return ctx.cwds[effect.segIndex] ?? ctx.cwds[0];
}

/** The protected path an effect touches, or null (memoised on the effect). */
function effectProtected(effect, ctx) {
  if (effect.protectedResult !== undefined) return effect.protectedResult;
  ctx.deadline.check();
  const cwds = effectCwds(effect, ctx);
  let result = null;
  switch (effect.role) {
    case "target":
      result = resolveWord(effect.word, ctx, cwds, { containment: effect.containment });
      break;
    case "destination":
      result = destinationTarget(effect, ctx, cwds, null);
      break;
    case "found":
      result = foundTarget(effect, ctx, cwds);
      break;
    case "patch":
      result = patchTarget(effect, ctx, cwds, null);
      break;
    case "script":
      result = scriptTarget(effect, ctx, cwds, null);
      break;
    default:
  }
  effect.protectedResult = result;
  return result;
}

/** The first file a directory copy writes that `accepts` (walks the source, bounded). */
function mapDirectoryInto(sourceAbsolute, destRelatives, accepts, ctx) {
  const mapped = (file) => destRelatives.map((dest) => (dest === "" ? file : `${dest}/${file}`));
  const walk = walkFiles(sourceAbsolute, "", (file) => mapped(file).some(accepts), {
    deadline: ctx.deadline,
    firstOnly: true,
  });
  if (walk.files.length > 0) return mapped(walk.files[0]).find(accepts) ?? null;
  if (walk.capped) return `${destRelatives[0] || "."}/`;
  return null;
}

/**
 * What a copy, move or link writes: the destination, or each source's name inside a destination
 * directory, and, for a directory source, the files it holds.
 */
function destinationTarget(effect, ctx, cwds, test) {
  const { dest, sources = [] } = effect;
  const how = test === null ? {} : { test };
  const direct = resolveWord(dest, ctx, cwds, how);
  if (direct !== null) return direct;
  const accepts = (relative) =>
    test !== null ? test(relative) : protectingRules(ctx.protection, relative).length > 0;
  const destinationPath = dest.pathValue.replace(/\/+$/, "") || "/";
  const api = pathApi(ctx.platform);
  const destIsDir =
    effect.targetDir ||
    (!effect.noTargetDir &&
      (dest.pathValue.endsWith("/") ||
        sources.length > 1 ||
        cwds.some((cwd) => {
          const absolute = absoluteOf(dest, ctx, cwd);
          return absolute !== null && isDirectoryOnDisk(absolute, ctx.platform);
        })));
  for (const source of sources) {
    ctx.deadline.check();
    const sourcePath = source.pathValue.replace(/\/+$/, "");
    const base = path.posix.basename(sourcePath);
    const contents = effect.contents || source.pathValue.endsWith("/") || base === ".";
    const into = destIsDir && base !== "." && base !== ".." && base !== "";
    const mapped = into ? `${destinationPath}/${base}` : destinationPath;
    if (into) {
      const found = resolveWord(derivedWord(mapped, source), ctx, cwds, how);
      if (found !== null) return found;
    }
    const sourceDirs = cwds
      .map((cwd) => absoluteOf(source, ctx, cwd))
      .filter((absolute) => absolute !== null && isDirectoryOnDisk(absolute, ctx.platform));
    if (sourceDirs.length === 0 || !effect.recursive) continue;
    // A directory source: its files land below the mapped path (or the destination itself).
    if (test === null) {
      const shape = resolveWord(derivedWord(`${mapped}/`), ctx, cwds, { containment: true });
      if (shape !== null && shape !== ".") return shape;
    }
    const destRelatives = new Set();
    for (const cwd of cwds) {
      const place = { roots: ctx.roots, cwd, platform: ctx.platform };
      for (const candidate of new Set([mapped, contents ? destinationPath : mapped])) {
        const expanded = normaliseToolPath(
          expandVariables(candidate, { ...ctx.vars, cwd }),
          ctx.platform,
        );
        for (const relative of projectRelativePaths(expanded, place).relatives) {
          destRelatives.add(relative);
        }
      }
    }
    if (destRelatives.size === 0) continue;
    const found = mapDirectoryInto(api.resolve(sourceDirs[0]), [...destRelatives], accepts, ctx);
    if (found !== null) return found;
  }
  return null;
}

/** The protected files a `find` (or a listing fed to xargs) selects. */
function foundTarget(effect, ctx, cwds) {
  const { protection, roots: projectRoots, platform } = ctx;
  const filters = effect.complex ? [] : (effect.filters ?? []);
  // find compares names case-sensitively unless -iname/-ipath; its * in -path crosses "/".
  const selects = (rootShown, sub) => {
    if (effect.complex) return true;
    const parts = sub.split("/");
    const prefix = rootShown.replace(/\/+$/, "");
    return filters.every((filter) => {
      const fold = (text) => (filter.fold ? text.toLowerCase() : text);
      const pattern = fold(filter.pattern);
      if (filter.test === "name") return parts.some((part) => wildcardMatch(pattern, fold(part)));
      for (let n = 1; n <= parts.length; n += 1) {
        const shown = `${prefix === "" ? "" : `${prefix}/`}${parts.slice(0, n).join("/")}`;
        if (wildcardMatch(pattern, fold(shown))) return true;
      }
      return false;
    });
  };
  for (const root of effect.roots ?? []) {
    for (const cwd of cwds) {
      ctx.deadline.check();
      if (filters.length === 0 && !effect.complex && (effect.depth ?? WALK_MAX_DEPTH) > 0) {
        // Everything below the root goes.
        const found = resolveWord(root, ctx, [cwd], { containment: true });
        if (found !== null) return found;
        continue;
      }
      let rootPath = root.pathValue;
      if (root.glob && hasWildcard(rootPath)) {
        // A wildcard root: search from its literal part (a superset of what it names).
        const parts = rootPath.split("/");
        rootPath = parts.slice(0, parts.findIndex(hasWildcard)).join("/") || ".";
      }
      const absolute = absoluteOf(derivedWord(rootPath), ctx, cwd);
      if (absolute === null) continue;
      let places = [];
      const { relatives } = projectRelativePaths(absolute, { roots: projectRoots, cwd, platform });
      if (relatives.length > 0) places = [{ absolute, relative: relatives[0], shown: root.value }];
      else if (isAncestorOfRoot(absolute, projectRoots, platform)) {
        const api = pathApi(platform);
        places = projectRoots.map((projectRoot) => ({
          absolute: api.resolve(projectRoot),
          relative: "",
          shown: `${root.value.replace(/\/+$/, "")}/${slashes(api.relative(absolute, api.resolve(projectRoot)))}`,
        }));
      }
      for (const place of places) {
        const base = place.relative.replace(/\/+$/, "");
        if (protectingRules(protection, base).length > 0) {
          if (selects(path.posix.dirname(place.shown), path.posix.basename(base))) return base;
          continue;
        }
        if (!isDirectoryOnDisk(place.absolute, platform)) continue;
        const walk = walkFiles(
          place.absolute,
          base,
          (relative) => protectingRules(protection, relative).length > 0,
          { deadline: ctx.deadline, maxDepth: effect.depth ?? WALK_MAX_DEPTH },
        );
        if (walk.capped) return `${base || "."}/`;
        const skip = base === "" ? 0 : base.split("/").length;
        for (const file of walk.files) {
          const sub = file.split("/").slice(skip).join("/");
          if (selects(place.shown, sub)) return file;
        }
      }
    }
  }
  return null;
}

const PATCH_UNKNOWN = "the files the patch changes (its input could not be read)";

function patchTarget(effect, ctx, cwds, test) {
  const dirs = [];
  for (const cwd of cwds) {
    if (effect.patchDir) {
      const absolute = absoluteOf(effect.patchDir, ctx, cwd);
      if (absolute !== null) dirs.push(absolute);
    } else dirs.push(cwd);
  }
  for (const file of effect.paths ?? []) {
    const found = resolveWord(derivedWord(file), ctx, dirs, test === null ? {} : { test });
    if (found !== null) return found;
  }
  if (effect.unknown && test === null) return PATCH_UNKNOWN;
  return null;
}

/** The paths an inline script that may write files names. */
function scriptTarget(effect, ctx, cwds, test) {
  const text = effect.text ?? "";
  if (!SCRIPT_WRITES.test(text)) return null;
  const seen = new Set();
  for (const match of text.matchAll(/[\w.@~/\\-]+/g)) {
    const token = match[0];
    if (token.length < 2 || token.length > MAX_PATH_CHARS || !/[A-Za-z0-9]/.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    if (seen.size > MAX_SCRIPT_TOKENS) {
      throw new ProtectionIncomplete("an inline script names too many paths to check");
    }
    if (seen.size % 256 === 0) ctx.deadline.check();
    const pathLike = /[./\\]/.test(token);
    if (!pathLike) {
      if (token.length > 64) continue;
      const exists = cwds.some((cwd) => {
        const absolute = absoluteOf(derivedWord(token), ctx, cwd);
        return absolute !== null && fs.existsSync(absolute);
      });
      if (!exists) continue;
    }
    const found = resolveWord(
      derivedWord(token),
      ctx,
      cwds,
      test === null ? { containment: true } : { test },
    );
    if (found !== null && found !== ".") return found;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Content evidence (opt-out through the shell)

function readFileFor(word, ctx, cwds, extraDirs = []) {
  for (const cwd of [...cwds, ...extraDirs]) {
    const absolute = absoluteOf(word, ctx, cwd);
    if (absolute === null) continue;
    if (ctx.fileCache.has(absolute)) {
      const cached = ctx.fileCache.get(absolute);
      if (cached !== null) return cached;
      continue;
    }
    const text =
      ctx.platform === process.platform ? readTextCapped(absolute, MAX_SOURCE_BYTES) : null;
    ctx.fileCache.set(absolute, text);
    if (text !== null) return text;
  }
  return null;
}

function sourceHasEvidence(rule, text) {
  if (rule.sourceMatcher === "opt-out-line" && optOutLineIn(text) > 0) return true;
  return rule.sourcePattern !== null && rule.sourcePattern.test(text);
}

function textEvidence(rule, ctx) {
  if (!ctx.textEvidence.has(rule.id)) {
    const hit =
      rule.evidence !== null && (rule.evidence.test(ctx.raw) || rule.evidence.test(ctx.whole()));
    ctx.textEvidence.set(rule.id, hit);
  }
  return ctx.textEvidence.get(rule.id);
}

/** The file a write effect puts content into that matches the rule's targets. */
function contentTarget(rule, effect, ctx) {
  const test = (relative) => rule.targets.some((pattern) => pattern.test(relative));
  const cwds = effectCwds(effect, ctx);
  switch (effect.role) {
    case "target":
      return resolveWord(effect.word, ctx, cwds, { test, names: rule.targetNames });
    case "destination":
      return destinationTarget(effect, ctx, cwds, test);
    case "patch":
      return patchTarget(effect, ctx, cwds, test);
    case "script":
      return scriptTarget(effect, ctx, cwds, test);
    default:
      return null;
  }
}

/** Whether what an effect writes into `target` carries the rule's evidence. */
function contentEvidence(rule, effect, target, ctx) {
  if (effect.opaque) return rule.opaque || textEvidence(rule, ctx);
  if (textEvidence(rule, ctx)) return true;
  const cwds = effectCwds(effect, ctx);
  if (effect.role === "destination") {
    const destDir = effect.dest ? path.posix.dirname(effect.dest.pathValue) : ".";
    const linkDirs = effect.symbolic
      ? cwds.map((cwd) => pathApi(ctx.platform).resolve(cwd, destDir))
      : [];
    for (const source of effect.sources ?? []) {
      const text = readFileFor(source, ctx, cwds, linkDirs);
      if (text === null) {
        if (rule.opaque) return true;
        continue;
      }
      if (sourceHasEvidence(rule, text)) return true;
    }
  } else if (effect.role === "target") {
    const chain = [effect.segIndex, ...pipelinePredecessors(ctx, effect.segIndex)];
    let files = 0;
    for (const index of chain) {
      const prep = prepareSegment(ctx.segments[index]);
      const segmentCwds = ctx.cwds[index] ?? cwds;
      const names = prep.args.slice(0, 3).map((word) => programName(word.value));
      if (rule.opaque && names.some((name) => OPAQUE_PRODUCERS.has(name) || PYTHON.test(name))) {
        return true;
      }
      const inputs = [
        ...prep.args.slice(1).filter((word) => !word.value.startsWith("-")),
        ...prep.inputs,
        ...prep.args
          .map((word) => /^if=(.+)$/s.exec(word.value))
          .filter(Boolean)
          .map((match) => derivedWord(match[1])),
      ];
      for (const word of inputs) {
        if (files >= MAX_INPUT_FILES) break;
        if (word === effect.word || /\s/.test(word.value)) continue;
        files += 1;
        const text = readFileFor(word, ctx, segmentCwds);
        if (text !== null && sourceHasEvidence(rule, text)) return true;
      }
    }
  }
  if (rule.targetEvidence && rule.evidence !== null) {
    const current = readFileFor(derivedWord(target), ctx, ctx.roots);
    if (current !== null && rule.evidence.test(current)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Commands

/**
 * Inspects a `Bash` or `PowerShell` command.
 *
 * @param {object} options
 * @param {string} options.command
 * @param {"bash" | "powershell"} options.dialect
 * @param {Protection} options.protection
 * @param {string[]} options.roots
 * @param {string} options.cwd
 * @param {string} [options.projectDir] Value of `$CLAUDE_PROJECT_DIR` in commands.
 * @param {string} [options.home] Value of `~` and `$HOME` in commands.
 * @param {Record<string, string | undefined>} [options.env] Values of other variables.
 * @param {string} [options.platform]
 * @param {number} [options.budgetMs]
 * @returns {Finding[]}
 * @throws {ProtectionIncomplete} When the command is too long or the check runs out of time.
 */
export function inspectCommand({
  command,
  dialect,
  protection,
  roots,
  cwd,
  projectDir,
  home = os.homedir(),
  env = {},
  platform = process.platform,
  budgetMs = INSPECTION_BUDGET_MS,
}) {
  if (typeof command !== "string" || command.trim() === "") return [];
  if (command.length > MAX_COMMAND_CHARS) {
    throw new ProtectionIncomplete(
      `the command is ${command.length} characters long, over the ${MAX_COMMAND_CHARS} the check reads`,
    );
  }
  if (protection.allowCommands.some((pattern) => pattern.test(command))) return [];

  const deadline = createDeadline(budgetMs);
  resetPathCaches();
  const parser = createParser({ deadline });
  parser.visit(command, dialect, 0, -1, false);
  const segments = parser.flat;
  const api = pathApi(platform);
  let wholeText = null;
  /** @type {InspectionContext & Record<string, any>} */
  const ctx = {
    protection,
    roots,
    platform,
    vars: { home, projectDir, env, assigned: collectShellVariables(segments) },
    deadline,
    segments,
    cwds: [],
    analyses: [],
    gitAliasCache: new Map(),
    fileCache: new Map(),
    targetCache: new Map(),
    textEvidence: new Map(),
    raw: command,
    whole: () => {
      if (wholeText === null) wholeText = renderCommand(segments.filter((s) => s.group !== -1));
      return wholeText;
    },
  };
  const scopeCwd = new Map([[-1, cwd]]);
  const analysed = segments.length;
  for (
    let index = 0;
    index < segments.length && index < analysed + MAX_NESTED_COMMANDS;
    index += 1
  ) {
    deadline.check();
    const segment = segments[index];
    if (segment.group === -1) continue; // A throwaway segment made for a substitution.
    const scope = segment.parent;
    const current = scopeCwd.get(scope) ?? cwd;
    const target = segment.soft ? undefined : cdTarget(wordsOf(segment.tokens));
    if (target) {
      const dir = normaliseToolPath(
        expandVariables(target.pathValue, { ...ctx.vars, cwd: current }),
        platform,
      );
      scopeCwd.set(scope, api.resolve(current, dir));
    }
    scopeCwd.set(index, scopeCwd.get(scope) ?? current);
    ctx.cwds[index] = [...new Set([current, cwd])];
    ctx.analyses[index] = analyseSegment(ctx, index, parser);
  }
  const analyses = ctx.analyses.filter(Boolean);
  const findings = [];
  for (const rule of protection.commands) {
    deadline.check();
    const found =
      rule.matcher === null ? patternMatch(rule, ctx) : matcherMatch(rule, analyses, ctx);
    if (found === null) continue;
    findings.push({
      source: "command",
      ruleId: rule.id,
      description: rule.description,
      effect: rule.effect,
      path: found.path ?? null,
      match: snippet(found.match || command),
    });
  }
  return findings;
}

function patternMatch(rule, ctx) {
  if (rule.pattern !== null) {
    const raw = rule.pattern.exec(ctx.raw);
    const match = raw ?? rule.pattern.exec(ctx.whole());
    // A pattern made of lookaheads matches no text; the command itself is shown then.
    if (match !== null) return { path: null, match: match[0] || ctx.raw };
  }
  if (rule.words !== null) {
    for (const segment of ctx.segments) {
      if (segment.group === -1) continue;
      const matched = [];
      for (const token of segment.tokens) {
        if (token.kind !== "word" || token.heredoc || token.value.length > MAX_PATH_CHARS) continue;
        if (rule.words[matched.length].test(token.value)) {
          matched.push(token.value);
          if (matched.length === rule.words.length) return { path: null, match: matched.join(" ") };
        }
      }
    }
  }
  return null;
}

function matcherMatch(rule, analyses, ctx) {
  switch (rule.matcher) {
    case "git-hook-skip":
    case "git-force-push": {
      const check = rule.matcher === "git-hook-skip" ? gitHookSkip : gitForcePush;
      for (const info of analyses) {
        for (const invocation of info.gits) {
          const hit = check(invocation);
          if (hit !== null) return { path: null, match: hit };
        }
      }
      return null;
    }
    case "shell-write":
    case "shell-delete": {
      const kinds = rule.matcher === "shell-write" ? ["write"] : ["delete", "perm"];
      for (const info of analyses) {
        for (const effect of info.effects) {
          if (!kinds.includes(effect.kind)) continue;
          const target = effectProtected(effect, ctx);
          if (target !== null) return { path: target, match: effect.match };
        }
      }
      return null;
    }
    case "delete-operand": {
      if (rule.operand === null) return null;
      for (const info of analyses) {
        for (const effect of info.effects) {
          if (effect.role !== "target" || !rule.verbs.has(effect.verb)) continue;
          for (const raw of wordCandidates(effect.word)) {
            const base = path.posix.basename(slashes(raw));
            if (base.length <= MAX_NAME_CHARS && rule.operand.test(base)) {
              return { path: raw, match: effect.match };
            }
          }
        }
      }
      return null;
    }
    case "shell-write-content": {
      for (const info of analyses) {
        for (const effect of info.effects) {
          if (effect.kind !== "write") continue;
          ctx.deadline.check();
          const target = contentTarget(rule, effect, ctx);
          if (target === null) continue;
          if (contentEvidence(rule, effect, target, ctx))
            return { path: target, match: effect.match };
        }
      }
      return null;
    }
    default:
      return null;
  }
}
