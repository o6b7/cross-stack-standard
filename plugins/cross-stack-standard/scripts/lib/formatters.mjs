/**
 * The per-file formatter and linter runs of the PostToolUse hook: which tools apply to an edited
 * file, where each one is installed, which directory it runs from, its exact command line, and
 * how its result is read.
 *
 * | Edited file                   | Formatter                         | Linter                      |
 * | ----------------------------- | --------------------------------- | --------------------------- |
 * | js jsx mjs cjs ts tsx mts cts | Prettier                          | ESLint                      |
 * | json css scss md yml yaml     | Prettier                          | none                        |
 * | php (not `*.blade.php`)       | Pint (`php vendor/bin/pint <file>`) | PHPStan, only when enabled |
 *
 * Each tool runs only when the project has it installed, resolved by lib/resolve-tool.mjs to
 * `process.execPath <bin .js>` or `php vendor/bin/<name>`: never a shell, a `.cmd` shim or npx.
 *
 * - Prettier runs when the project uses it: a Prettier config or ignore file, or a package.json
 *   that declares `prettier` (a dependency or its config key), in the file's directory or a
 *   parent up to the project directory. A copy of Prettier that another package pulled into
 *   node_modules does not reformat files in a project that never chose it. It runs from that
 *   directory. Prettier reads `.gitignore` and `.prettierignore` only from its working
 *   directory, so every one of them from the project directory down to that directory is passed
 *   with `--ignore-path` ({@link prettierIgnoreArgs}): a file a monorepo root ignores stays as
 *   written, as it does when the developer runs Prettier from the root.
 * - Pint is given the file by name, and then ignores its own file selection (`pint.json`
 *   `exclude`, `notPath`, `notName` and `in`, and its built-in exclusions). The hook applies that
 *   selection first and leaves an excluded file alone ({@link pintExcludes}).
 * - ESLint runs from the track root: the nearest directory, from the file's own up to the project
 *   directory, that holds a flat config (`eslint.config.*`). ESLint 9 looks the config up from
 *   its working directory, ESLint 10 from the file, so the track root suits both. A directory
 *   tree with only a legacy `.eslintrc*` is skipped, because ESLint 10 no longer reads it.
 * - Pint and PHPStan run from the directory that holds `vendor/`, where `pint.json` and the
 *   PHPStan config live.
 *
 * The config file names come from the protection list the plugin ships
 * (`data/protected-paths.json`, entries `eslint-config` and `prettier-config`), so one list
 * names them for both hooks.
 *
 * Results are read from exit codes and machine-readable reports, never from summary text
 * (the exit codes are recorded in docs/maintainers/verified-versions.md):
 *
 * - ESLint: 0 clean; 1 problems, read from its JSON report; 2 or anything else is a tool failure
 *   (a crash or a configuration error), which never becomes lint feedback.
 * - PHPStan: 0 clean; 1 errors, read from its JSON report (errors that belong to no file, such as
 *   configuration problems, are a tool failure); anything else is a tool failure.
 * - Prettier and Pint: 0 formatted; anything else could not format. Pint prints agent-mode JSON
 *   under Claude Code that no variable turns off, so only its exit code counts.
 *
 * @module plugins/cross-stack-standard/scripts/lib/formatters
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ancestorsUpTo,
  isFile,
  isWithin,
  readTextCapped,
  relativePosix,
  toPosix,
} from "./project.mjs";
import { resolveNodeBin, resolveVendorBin } from "./resolve-tool.mjs";
import { stripAnsi } from "./spawn.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The plugin's protection list, the source of the config file names. */
export const PROTECTED_PATHS_FILE = path.join(PLUGIN_ROOT, "data", "protected-paths.json");

/** Extensions Prettier formats (lower case). */
export const PRETTIER_EXTENSIONS = Object.freeze([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".json",
  ".css",
  ".scss",
  ".md",
  ".yml",
  ".yaml",
]);

/** Extensions ESLint checks (lower case). */
export const ESLINT_EXTENSIONS = Object.freeze([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);

/** Prettier arguments before the file: write in place; a file it has no parser for is skipped. */
export const PRETTIER_ARGS = Object.freeze(["--write", "--ignore-unknown"]);

/**
 * ESLint arguments before the file: any warning fails (as in the Standard's gates), an ignored
 * file is not reported, a file that no longer exists is not an error, and the report is JSON.
 */
export const ESLINT_ARGS = Object.freeze([
  "--max-warnings=0",
  "--no-warn-ignored",
  "--no-error-on-unmatched-pattern",
  "--format",
  "json",
]);

/** PHPStan arguments before the file. */
export const PHPSTAN_ARGS = Object.freeze(["analyse", "--error-format=json", "--no-progress"]);

/** Problem lines shown before the rest are counted. */
export const MAX_PROBLEM_LINES = 30;

/** Longest message kept on one problem line, in characters. */
export const MAX_MESSAGE_CHARS = 240;

/** Longest tool output line quoted in a notice, in characters. */
export const MAX_QUOTE_CHARS = 200;

const DEPENDENCY_BLOCKS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(file) {
  const text = readTextCapped(file, 1024 * 1024);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @typedef {object} FileKinds
 * @property {boolean} prettier Prettier formats it.
 * @property {boolean} eslint ESLint checks it.
 * @property {boolean} php Pint formats it and PHPStan can check it.
 */

/**
 * Which tools apply to a file, by its extension; null when none does (a non-code file).
 *
 * @param {string} file
 * @returns {FileKinds | null}
 */
export function classifyFile(file) {
  const base = path.basename(file).toLowerCase();
  const extension = path.extname(base);
  const kinds = {
    prettier: PRETTIER_EXTENSIONS.includes(extension),
    eslint: ESLINT_EXTENSIONS.includes(extension),
    // Blade templates are not PHP source: Pint and PHPStan do not handle them.
    php: extension === ".php" && !base.endsWith(".blade.php"),
  };
  return kinds.prettier || kinds.eslint || kinds.php ? kinds : null;
}

/**
 * Expands `{a,b}` groups (not nested) in a glob: `x.{js,mjs}` gives `x.js`, `x.mjs`.
 *
 * @param {string} pattern
 * @returns {string[]}
 */
export function expandBraces(pattern) {
  const match = /\{([^{}]*)\}/.exec(pattern);
  if (match === null) return [pattern];
  const before = pattern.slice(0, match.index);
  const after = pattern.slice(match.index + match[0].length);
  return match[1].split(",").flatMap((alternative) => expandBraces(before + alternative + after));
}

/**
 * The file names an entry of the protection list matches in any directory: each glob that is
 * the any-directory prefix followed by a file name, braces expanded. Globs with other wildcards
 * or a directory part are left out.
 *
 * @param {any} protectedPaths The parsed protection list.
 * @param {string} id The entry id, for example `eslint-config`.
 * @returns {string[]}
 */
export function configFileNames(protectedPaths, id) {
  const entries = Array.isArray(protectedPaths?.paths) ? protectedPaths.paths : [];
  const entry = entries.find((candidate) => candidate?.id === id);
  if (!Array.isArray(entry?.globs)) return [];
  const names = [];
  for (const glob of entry.globs) {
    if (typeof glob !== "string" || !glob.startsWith("**/")) continue;
    for (const name of expandBraces(glob.slice(3))) {
      if (name !== "" && !/[/\\*?[\]{}]/.test(name) && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

let protectedPathsCache = null;

/**
 * Loads the plugin's protection list. Throws when it is missing or unreadable (the entry point
 * then fails open with a notice, as for any other missing plugin data).
 *
 * @param {string} [file]
 * @returns {any}
 */
export function loadProtectedPaths(file = PROTECTED_PATHS_FILE) {
  if (file === PROTECTED_PATHS_FILE && protectedPathsCache !== null) return protectedPathsCache;
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(value?.paths)) {
    throw new Error(`${path.basename(file)} has no "paths" list`);
  }
  if (file === PROTECTED_PATHS_FILE) protectedPathsCache = value;
  return value;
}

/**
 * ESLint flat config file names (`eslint.config.*`).
 *
 * @param {any} [protectedPaths]
 * @returns {string[]}
 */
export function eslintConfigNames(protectedPaths = loadProtectedPaths()) {
  return configFileNames(protectedPaths, "eslint-config").filter((name) =>
    name.startsWith("eslint.config."),
  );
}

/**
 * File names whose presence shows that a directory tree uses Prettier: its config files and
 * `.prettierignore`.
 *
 * @param {any} [protectedPaths]
 * @returns {string[]}
 */
export function prettierSignalNames(protectedPaths = loadProtectedPaths()) {
  return configFileNames(protectedPaths, "prettier-config");
}

function hasAnyFile(dir, names) {
  return names.some((name) => isFile(path.join(dir, name)));
}

/**
 * The track root for ESLint: the nearest directory from `fromDir` up to `projectDir` that holds
 * a flat config file; null when there is none.
 *
 * @param {string} fromDir
 * @param {string} projectDir
 * @param {string[]} configNames
 * @returns {string | null}
 */
export function findEslintRoot(fromDir, projectDir, configNames) {
  if (configNames.length === 0 || !isWithin(fromDir, projectDir)) return null;
  for (const dir of ancestorsUpTo(fromDir, projectDir)) {
    if (hasAnyFile(dir, configNames)) return dir;
  }
  return null;
}

function declaresPrettier(pkg) {
  if (!isPlainObject(pkg)) return false;
  if (Object.hasOwn(pkg, "prettier")) return true;
  return DEPENDENCY_BLOCKS.some(
    (block) => isPlainObject(pkg[block]) && Object.hasOwn(pkg[block], "prettier"),
  );
}

/**
 * The nearest directory from `fromDir` up to `projectDir` that shows the project uses Prettier:
 * a Prettier config or ignore file, or a package.json that declares `prettier`. Null when the
 * project does not use Prettier.
 *
 * @param {string} fromDir
 * @param {string} projectDir
 * @param {string[]} signalNames
 * @returns {string | null}
 */
export function findPrettierRoot(fromDir, projectDir, signalNames) {
  if (!isWithin(fromDir, projectDir)) return null;
  for (const dir of ancestorsUpTo(fromDir, projectDir)) {
    if (hasAnyFile(dir, signalNames)) return dir;
    if (declaresPrettier(readJson(path.join(dir, "package.json")))) return dir;
  }
  return null;
}

/**
 * One tool run, ready for lib/spawn.mjs `runTool`.
 *
 * @typedef {object} ToolPlan
 * @property {"Prettier" | "Pint" | "ESLint" | "PHPStan"} name
 * @property {string} command
 * @property {string[]} args
 * @property {string} cwd
 */

/** The ignore files Prettier reads by default, from its working directory only. */
export const PRETTIER_IGNORE_FILES = Object.freeze([".gitignore", ".prettierignore"]);

/**
 * `--ignore-path <file>` for every existing `.gitignore` and `.prettierignore` from
 * `projectDir` down to `root` (Prettier's working directory). Prettier 3 accepts the option
 * more than once and reads each file's patterns relative to that file's directory; the option
 * replaces its default (`./.gitignore`, `./.prettierignore`), which is in the list as well.
 *
 * @param {string} root
 * @param {string} projectDir
 * @returns {string[]}
 */
export function prettierIgnoreArgs(root, projectDir) {
  const dirs = isWithin(root, projectDir) ? ancestorsUpTo(root, projectDir).reverse() : [root];
  const args = [];
  for (const dir of dirs) {
    for (const name of PRETTIER_IGNORE_FILES) {
      const file = path.join(dir, name);
      if (isFile(file)) args.push("--ignore-path", file);
    }
  }
  return args;
}

/**
 * Prettier for `file`, or null when the project does not use it or has not installed it.
 *
 * @param {{ file: string, projectDir: string, signalNames?: string[] }} options
 * @returns {ToolPlan | null}
 */
export function planPrettier({ file, projectDir, signalNames = prettierSignalNames() }) {
  const dir = path.dirname(file);
  const root = findPrettierRoot(dir, projectDir, signalNames);
  if (root === null) return null;
  const tool = resolveNodeBin({ pkg: "prettier", from: dir, stopAt: projectDir });
  if (tool === null) return null;
  return {
    name: "Prettier",
    command: tool.command,
    args: [...tool.args, ...PRETTIER_ARGS, ...prettierIgnoreArgs(root, projectDir), file],
    cwd: root,
  };
}

/**
 * ESLint for `file`, run from its track root; null without a flat config or an installed ESLint.
 *
 * @param {{ file: string, projectDir: string, configNames?: string[] }} options
 * @returns {ToolPlan | null}
 */
export function planEslint({ file, projectDir, configNames = eslintConfigNames() }) {
  const root = findEslintRoot(path.dirname(file), projectDir, configNames);
  if (root === null) return null;
  const tool = resolveNodeBin({ pkg: "eslint", from: root, stopAt: projectDir });
  if (tool === null) return null;
  return {
    name: "ESLint",
    command: tool.command,
    args: [...tool.args, ...ESLINT_ARGS, file],
    cwd: root,
  };
}

function planVendorTool(binName, name, toolArgs, { file, projectDir }) {
  const tool = resolveVendorBin({ name: binName, from: path.dirname(file), stopAt: projectDir });
  if (tool === null) return null;
  // <root>/vendor/bin/<name>: the tool runs from <root>.
  const root = path.dirname(path.dirname(path.dirname(tool.file)));
  return { name, command: tool.command, args: [...tool.args, ...toolArgs, file], cwd: root };
}

// ---------------------------------------------------------------------------------------------
// Pint's file selection. Pint (laravel/pint 1.30.5, app/Factories/ConfigurationFactory.php and
// app/Repositories/ConfigurationJsonRepository.php) builds a Symfony Finder from its defaults
// and pint.json, and applies it only when it searches directories itself: a file named on the
// command line is fixed regardless. For editor input (`--stdin-filename`) it has a second check,
// `isPathExcluded`. A file either check excludes is left alone here. Pattern forms follow
// Symfony Finder (symfony/finder Finder.php, Glob.php and Iterator/*FilterIterator.php).
// ---------------------------------------------------------------------------------------------

/** Pint's built-in excluded directories. */
export const PINT_DEFAULT_EXCLUDE = Object.freeze([
  "bootstrap/cache",
  "build",
  "node_modules",
  "storage",
]);

/** Pint's built-in excluded file names (Blade templates are never PHP files here). */
export const PINT_DEFAULT_NOT_NAME = Object.freeze([
  "_ide_helper_actions.php",
  "_ide_helper_models.php",
  "_ide_helper.php",
  ".phpstorm.meta.php",
]);

/** Version-control directories Symfony Finder skips (`ignoreVCS(true)`). */
const FINDER_VCS_DIRS = Object.freeze([
  ".svn",
  "_svn",
  "CVS",
  "_darcs",
  ".arch-params",
  ".monotone",
  ".bzr",
  ".git",
  ".hg",
]);

/** Symfony Finder's `ignoreDotFiles(true)`: any path segment that starts with a dot. */
const FINDER_DOT_PATH = /(?:^|\/)\..+(?:\/|$)/;

/** Returned for a pattern the hook cannot read: the file is then treated as excluded. */
const UNREADABLE = Symbol("unreadable pattern");

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function compile(source, flags = "") {
  try {
    return new RegExp(source, flags);
  } catch {
    return UNREADABLE;
  }
}

/**
 * A Finder pattern that is a delimited regular expression (`/…/i`, `#…#`, `{…}`), as a
 * RegExp; UNREADABLE for one JavaScript cannot run the same way; null for a plain pattern.
 */
function finderRegex(pattern) {
  const match = /^(.{3,}?)[imsxuADUn]*$/s.exec(pattern);
  if (match === null) return null;
  const body = match[1];
  const start = body[0];
  const end = body.at(-1);
  const pairs = ["{}", "()", "[]", "<>"];
  const delimited =
    start === end ? !/[*?A-Za-z0-9 \\]/.test(start) : pairs.includes(`${start}${end}`);
  if (!delimited) return null;
  const modifiers = pattern.slice(body.length);
  if (/[^imsu]/.test(modifiers)) return UNREADABLE;
  return compile(body.slice(1, -1), [...new Set(modifiers)].join(""));
}

/** Symfony's Glob::toRegex (wildcards stop at `/`), anchored. */
function finderGlob(glob) {
  let source = "";
  let escaping = false;
  let braces = 0;
  for (const char of glob) {
    if (escaping) {
      source += escapeRegExp(char);
      escaping = false;
    } else if (char === "\\") escaping = true;
    else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "{") {
      source += "(?:";
      braces += 1;
    } else if (char === "}" && braces > 0) {
      source += ")";
      braces -= 1;
    } else if (char === "," && braces > 0) source += "|";
    else if (char === "[" || char === "]" || char === "-") source += char;
    else source += escapeRegExp(char);
  }
  return compile(`^${source}$`);
}

/** PHP's fnmatch() without flags: `*` and `?` also match `/`; `[!…]` negates. */
function fnmatchRegex(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") source += "[\\s\\S]*";
    else if (char === "?") source += "[\\s\\S]";
    else if (char === "\\" && index + 1 < pattern.length) {
      index += 1;
      source += escapeRegExp(pattern[index]);
    } else if (char === "[") {
      let close = index + 1;
      if (pattern[close] === "!" || pattern[close] === "^") close += 1;
      if (pattern[close] === "]") close += 1;
      close = pattern.indexOf("]", close);
      if (close === -1) {
        source += "\\[";
        continue;
      }
      let set = pattern.slice(index + 1, close);
      if (set.startsWith("!")) set = `^${set.slice(1)}`;
      source += `[${set.replace(/\\/g, "\\\\")}]`;
      index = close;
    } else source += escapeRegExp(char);
  }
  return compile(`^${source}$`);
}

/** True when `regex` matches `subject`, or when the pattern could not be read. */
function hits(regex, subject) {
  return regex === UNREADABLE || regex.test(subject);
}

function stringList(value) {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return list.filter((item) => typeof item === "string");
}

/** `/`-separated, without `./` in front or `/` at the end. */
function cleanDir(value) {
  return toPosix(value)
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+$/, "");
}

/** Pint's own check for a named file (`isPathExcluded`), on the path relative to its root. */
function namedFileExcluded(rel, { exclude, notName, notPath }) {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  if (notName.some((pattern) => hits(fnmatchRegex(pattern), name))) return true;
  const folders = exclude.map(toPosix);
  if (folders.some((folder) => rel === folder || rel.startsWith(`${folder}/`))) return true;
  return notPath.some((pattern) => hits(fnmatchRegex(pattern), rel));
}

/** The Finder's verdict for a file at `rel`, relative to the directory it searches. */
function finderExcluded(rel, { exclude, notName, notPath }) {
  const segments = rel.split("/");
  const name = segments.pop();
  const dir = segments.join("/");
  if (FINDER_DOT_PATH.test(rel)) return true;
  const dirs = exclude.map((entry) => entry.replace(/\/+$/, "")).filter((entry) => entry !== "");
  const names = [...FINDER_VCS_DIRS, ...dirs.filter((entry) => !entry.includes("/"))];
  if (segments.some((segment) => names.includes(segment))) return true;
  for (const entry of dirs.filter((item) => item.includes("/"))) {
    if (new RegExp(`(?:^|/)${escapeRegExp(entry)}(?:/|$)`).test(dir)) return true;
  }
  const byName = (pattern) => finderRegex(pattern) ?? finderGlob(pattern);
  if (notName.some((pattern) => hits(byName(pattern), name))) return true;
  const byPath = (pattern) => finderRegex(pattern) ?? compile(escapeRegExp(pattern));
  return notPath.some((pattern) => hits(byPath(pattern), rel));
}

/**
 * The prefixes (`""` or `dir/`) of the `in` directories that hold `rel`: `[""]` without `in`.
 * A directory given as a glob is matched against each parent directory of the file; one the
 * hook cannot read holds nothing (so a file only it could hold is left alone).
 */
function searchRoots(rel, inDirs, root) {
  if (inDirs.length === 0) return [""];
  const segments = rel.split("/");
  const parents = segments.map((_, count) => segments.slice(0, count).join("/"));
  const roots = new Set();
  for (const entry of inDirs) {
    const dir = cleanDir(path.isAbsolute(entry) ? relativePosix(root, entry) : entry);
    const glob = /[*?[{]/.test(dir) ? finderGlob(dir) : null;
    for (const parent of parents) {
      const inside =
        glob === null
          ? dir === parent || (dir === "." && parent === "")
          : glob !== UNREADABLE && glob.test(parent);
      if (inside) roots.add(parent === "" ? "" : `${parent}/`);
    }
  }
  return [...roots];
}

/**
 * Whether Pint leaves `file` alone: its built-in exclusions, or `exclude`, `notPath`, `notName`
 * and `in` from pint.json (`config`), read the way Pint reads them, both for a directory search
 * and for a named file. A pattern the hook cannot read counts as a match, so a file is never
 * reformatted on a guess.
 *
 * @param {string} file Absolute path inside `root`.
 * @param {string} root Pint's root (the directory that holds vendor/ and pint.json).
 * @param {Record<string, unknown>} config The parsed pint.json ({@link readPintConfig}).
 * @returns {boolean}
 */
export function pintExcludes(file, root, config) {
  const rel = relativePosix(root, file);
  const rules = {
    exclude: [...PINT_DEFAULT_EXCLUDE, ...stringList(config?.exclude)],
    notName: [...PINT_DEFAULT_NOT_NAME, ...stringList(config?.notName)],
    notPath: stringList(config?.notPath),
  };
  if (namedFileExcluded(rel, rules)) return true;
  const roots = searchRoots(rel, stringList(config?.in), root);
  if (roots.length === 0) return true;
  return roots.every((prefix) => finderExcluded(rel.slice(prefix.length), rules));
}

function isContainer(value) {
  return value !== null && typeof value === "object";
}

/** PHP's array_replace_recursive(): lists are replaced item by item, maps key by key. */
function replaceRecursive(base, over) {
  if (!isContainer(base) || !isContainer(over)) return over;
  const merged = Array.isArray(base) && Array.isArray(over) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(over)) {
    merged[key] = Object.hasOwn(base, key) ? replaceRecursive(base[key], value) : value;
  }
  return merged;
}

/**
 * The pint.json in `root`, with the one file its `extend` names merged underneath, as Pint
 * merges it. An empty object when there is none; also when it is not valid JSON (Pint then
 * reports the error itself when it runs).
 *
 * @param {string} root
 * @returns {Record<string, unknown>}
 */
export function readPintConfig(root) {
  const config = readJson(path.join(root, "pint.json"));
  if (!isPlainObject(config)) return {};
  if (typeof config.extend !== "string") return config;
  const base = readJson(path.resolve(root, config.extend));
  return isPlainObject(base) ? replaceRecursive(base, config) : config;
}

/**
 * Pint for `file` (`php vendor/bin/pint <file>`), or null when it is not installed or its file
 * selection leaves the file alone.
 *
 * @param {{ file: string, projectDir: string }} options
 * @returns {ToolPlan | null}
 */
export function planPint(options) {
  const plan = planVendorTool("pint", "Pint", [], options);
  if (plan === null) return null;
  return pintExcludes(options.file, plan.cwd, readPintConfig(plan.cwd)) ? null : plan;
}

/**
 * PHPStan for `file` (`php vendor/bin/phpstan analyse --error-format=json --no-progress
 * <file>`), or null when it is not installed.
 *
 * @param {{ file: string, projectDir: string }} options
 * @returns {ToolPlan | null}
 */
export function planPhpstan(options) {
  return planVendorTool("phpstan", "PHPStan", PHPSTAN_ARGS, options);
}

/**
 * One reported problem.
 *
 * @typedef {object} Problem
 * @property {string} file Absolute path, as the tool reported it.
 * @property {number} line 0 when the tool gave none.
 * @property {number} column 0 when the tool gave none.
 * @property {string} ruleId
 * @property {string} message
 * @property {"error" | "warning"} severity
 */

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Parses a JSON report from a tool's stdout. The report is normally all of stdout; when a
 * plugin, a config file or a PHP notice printed something first, the last line that starts
 * with `opener` and parses is used.
 */
function parseJsonReport(stdout, opener) {
  const text = stdout.trim();
  const candidates = [
    text,
    ...text
      .split(/\r?\n/)
      .reverse()
      .map((line) => line.trim())
      .filter((line) => line.startsWith(opener)),
  ];
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next candidate.
    }
  }
  return { ok: false };
}

/**
 * Reads ESLint's JSON report (`--format json`): an array of `{filePath, messages}` results.
 * Messages without a rule id are labelled `parse-error` (fatal) or `eslint` (for example an
 * unused disable directive).
 *
 * @param {string} stdout
 * @returns {{ ok: true, problems: Problem[] } | { ok: false, reason: string }}
 */
export function parseEslintReport(stdout) {
  const parsed = parseJsonReport(stdout, "[");
  if (!parsed.ok || !Array.isArray(parsed.value)) {
    return { ok: false, reason: "its JSON report could not be read" };
  }
  const problems = [];
  for (const result of parsed.value) {
    if (
      !isPlainObject(result) ||
      typeof result.filePath !== "string" ||
      !Array.isArray(result.messages)
    ) {
      return { ok: false, reason: "its JSON report has an unexpected shape" };
    }
    for (const message of result.messages) {
      if (!isPlainObject(message)) continue;
      problems.push({
        file: result.filePath,
        line: positiveInteger(message.line),
        column: positiveInteger(message.column),
        ruleId:
          nonEmptyString(message.ruleId) ?? (message.fatal === true ? "parse-error" : "eslint"),
        message: nonEmptyString(message.message) ?? "(no message)",
        severity: message.severity === 1 ? "warning" : "error",
      });
    }
  }
  return { ok: true, problems };
}

/**
 * Reads PHPStan's JSON report (`--error-format=json`): `files` maps each path to its messages
 * (PHP encodes an empty map as `[]`), and `errors` lists errors that belong to no file.
 *
 * @param {string} stdout
 * @returns {{ ok: true, problems: Problem[], generalErrors: string[] } | { ok: false, reason: string }}
 */
export function parsePhpstanReport(stdout) {
  const parsed = parseJsonReport(stdout, "{");
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return { ok: false, reason: "its JSON report could not be read" };
  }
  const { files, errors } = parsed.value;
  let entries;
  if (isPlainObject(files)) entries = Object.entries(files);
  else if (Array.isArray(files) && files.length === 0) entries = [];
  else return { ok: false, reason: "its JSON report has an unexpected shape" };

  const problems = [];
  for (const [key, entry] of entries) {
    // A trait's errors are keyed "<file> (in context of class …)".
    const context = / \(in context of .+\)$/.exec(key);
    const file = context === null ? key : key.slice(0, context.index);
    const messages = Array.isArray(entry?.messages) ? entry.messages : [];
    for (const message of messages) {
      if (!isPlainObject(message)) continue;
      const text = nonEmptyString(message.message) ?? "(no message)";
      problems.push({
        file,
        line: positiveInteger(message.line),
        column: 0,
        ruleId: nonEmptyString(message.identifier) ?? "phpstan",
        message: context === null ? text : `${text}${context[0]}`,
        severity: "error",
      });
    }
  }
  const generalErrors = Array.isArray(errors)
    ? errors.filter((error) => typeof error === "string" && error.trim() !== "")
    : [];
  return { ok: true, problems, generalErrors };
}

/**
 * Text on one line: escape sequences removed, whitespace runs collapsed, cut to `max`.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function oneLine(text, max) {
  const flat = stripAnsi(String(text)).replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/**
 * The line of a tool's error output worth quoting in a notice: the first line that mentions an
 * error, skipping ESLint's crash banner, version line and stack frames, and PHPStan's config
 * note; otherwise the first non-empty line. Empty when there is nothing.
 *
 * @param {string} text
 * @returns {string}
 */
export function firstErrorLine(text) {
  const lines = stripAnsi(String(text))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== "" &&
        !/^Oops! Something went wrong/i.test(line) &&
        !/^ESLint: \d/.test(line) &&
        !/^at\s/.test(line) &&
        !/^Note: Using configuration file/i.test(line),
    );
  const chosen = lines.find((line) => /error/i.test(line)) ?? lines[0] ?? "";
  return oneLine(chosen, MAX_QUOTE_CHARS);
}

/**
 * A path for output: relative to the project directory with `/` separators, or the whole path
 * with `/` separators when it lies outside.
 *
 * @param {string} file
 * @param {string} projectDir
 * @returns {string}
 */
export function displayPath(file, projectDir) {
  return isWithin(file, projectDir) ? relativePosix(projectDir, file) : toPosix(file);
}

/**
 * One problem line: `<path>:<line>:<column> <rule> <message>`, with ` (warning)` for a warning.
 * The column (or line and column) is left out when the tool gave none.
 *
 * @param {Problem} problem
 * @param {string} projectDir
 * @returns {string}
 */
export function formatProblem(problem, projectDir) {
  let where = displayPath(problem.file, projectDir);
  if (problem.line > 0) {
    where += `:${problem.line}`;
    if (problem.column > 0) where += `:${problem.column}`;
  }
  const suffix = problem.severity === "warning" ? " (warning)" : "";
  return `${where} ${oneLine(problem.ruleId, 80)} ${oneLine(problem.message, MAX_MESSAGE_CHARS)}${suffix}`;
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The report Claude reads on stderr: a header with the counts, at most `maxLines` problem lines,
 * and how many more were left out.
 *
 * @param {{ tool: string, target: string, problems: Problem[], projectDir: string, maxLines?: number }} options
 *   `target` is the edited file as shown to Claude.
 * @returns {string} Lines, each ending with a newline.
 */
export function problemReport({
  tool,
  target,
  problems,
  projectDir,
  maxLines = MAX_PROBLEM_LINES,
}) {
  const errors = problems.filter((problem) => problem.severity === "error").length;
  const warnings = problems.length - errors;
  const counts = [plural(errors, "error"), ...(warnings > 0 ? [plural(warnings, "warning")] : [])];
  const lines = [
    `${tool} found ${plural(problems.length, "problem")} in ${target} (${counts.join(", ")}):`,
    ...problems.slice(0, maxLines).map((problem) => formatProblem(problem, projectDir)),
  ];
  if (problems.length > maxLines) lines.push(`(${problems.length - maxLines} more not shown)`);
  return `${lines.join("\n")}\n`;
}

/**
 * What a linter run means.
 *
 * - `problems` non-empty: report them to Claude (exit 2).
 * - `failure` set: the tool did not produce a usable result; a notice for the user, never
 *   feedback that blocks on a broken tool or configuration.
 * - Both empty: clean, or the tool is not installed (`ENOENT` on start).
 *
 * @param {ToolPlan} plan
 * @param {import("./spawn.mjs").ToolResult} result
 * @param {string} target The edited file as shown in messages.
 * @returns {{ problems: Problem[], failure: string | null }}
 */
export function interpretLint(plan, result, target) {
  const clean = { problems: [], failure: null };
  const failed = (detail) => ({
    problems: [],
    failure: `${plan.name} could not check ${target} (${detail}); lint feedback for this edit was skipped.`,
  });
  const started = startFailure(plan, result);
  if (started !== undefined) return started === null ? clean : { problems: [], failure: started };
  if (result.exitCode === 0) return clean;
  if (result.exitCode !== 1) return failed(exitDetail(result));

  if (plan.name === "PHPStan") {
    const report = parsePhpstanReport(result.stdout);
    if (!report.ok) return failed(`exit 1; ${report.reason}`);
    if (report.problems.length > 0) return { problems: report.problems, failure: null };
    const general = report.generalErrors[0];
    return failed(
      general === undefined
        ? "exit 1 with no errors listed"
        : `exit 1: ${oneLine(general, MAX_QUOTE_CHARS)}`,
    );
  }

  const report = parseEslintReport(result.stdout);
  if (!report.ok) return failed(`exit 1; ${report.reason}`);
  if (report.problems.length === 0) return failed("exit 1 with no problems listed");
  return { problems: report.problems, failure: null };
}

/**
 * What a formatter run means: null when it formatted the file, is not installed, or produced no
 * news; otherwise a sentence for a notice. Pint is judged by its exit code only.
 *
 * @param {ToolPlan} plan
 * @param {import("./spawn.mjs").ToolResult} result
 * @param {string} target
 * @returns {string | null}
 */
export function interpretFormat(plan, result, target) {
  const started = startFailure(plan, result);
  if (started !== undefined) return started;
  if (result.exitCode === 0) return null;
  const detail = plan.name === "Pint" ? exitDetail({ ...result, stderr: "" }) : exitDetail(result);
  return `${plan.name} could not format ${target} (${detail}); the file was left as written.`;
}

/**
 * Undefined when the tool ran; null when it is not installed (a silent skip); otherwise a
 * sentence saying why it did not start.
 */
function startFailure(plan, result) {
  if (result.error === null) return undefined;
  if (result.error.code === "ENOENT") return null;
  return `${plan.name} could not be started (${result.error.code}).`;
}

function exitDetail(result) {
  const how =
    result.exitCode === null
      ? `stopped by ${result.signal ?? "a signal"}`
      : `exit ${result.exitCode}`;
  const quote = firstErrorLine(result.stderr);
  return quote === "" ? how : `${how}: ${quote}`;
}
