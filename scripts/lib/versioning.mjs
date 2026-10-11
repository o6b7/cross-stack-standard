/**
 * @file Version stamping and drift detection shared by `scripts/stamp-version.mjs` and
 * `scripts/check-version-drift.mjs`.
 *
 * `VERSION` at the repository root is the single source of the release version. This module
 * finds every place that repeats it, compares each one with `VERSION`, and computes the minimal
 * text edits that bring each place in line. Both scripts run the same plan, so the stamper and
 * the drift check can never disagree about which locations exist.
 *
 * Locations (a missing file is skipped):
 * - `.claude-plugin/marketplace.json`: `metadata.version` (added when absent) and a top-level
 *   `version` when one exists. The plugin entry's own `version` is never written: `plugin.json`
 *   wins over it and a mismatch fails `claude plugin validate --strict`, so it must stay unset.
 * - `plugins/cross-stack-standard/.claude-plugin/plugin.json`: `version` (added when absent).
 * - `package.json` at the root and in each `packages/<name>/`: `version` (added when absent) and
 *   pinned internal `@cross-stack-standard/*` dependency ranges.
 * - Every `package.json` under the plugin's `templates/`: `version` when present (template
 *   fragments merged into a project's own manifest never get one) and internal ranges.
 * - The root `package-lock.json`: the root and workspace entries, so `npm ci` stays in sync.
 * - Header comments `cross-stack-standard vX.Y.Z` in the first lines of every text file under the
 *   plugin's `templates/` and under `packages/`.
 * - Versioned schema URLs `https://raw.githubusercontent.com/o6b7/cross-stack-standard/vX.Y.Z/…`
 *   in templates and JSON Schemas.
 *
 * `composer.json` files are never written. Composer infers versions from tags (and from the
 * path-repository `versions` option for vendored copies), so a `version` field there is reported
 * as a policy finding instead.
 *
 * Node.js built-ins only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** The plugin, marketplace and project name. */
export const PLUGIN_NAME = "cross-stack-standard";

/** npm scope of the gate packages; their internal dependency ranges are stamped. */
export const NPM_SCOPE = "@cross-stack-standard/";

/** Repository-relative (POSIX) paths of the fixed version locations. */
export const PATHS = Object.freeze({
  version: "VERSION",
  marketplace: ".claude-plugin/marketplace.json",
  pluginDir: "plugins/cross-stack-standard",
  pluginManifest: "plugins/cross-stack-standard/.claude-plugin/plugin.json",
  pluginData: "plugins/cross-stack-standard/data",
  templates: "plugins/cross-stack-standard/templates",
  packages: "packages",
  schemas: "schemas",
  registry: "registry",
  rootPackage: "package.json",
  rootLock: "package-lock.json",
  rootComposer: "composer.json",
});

/** Strict SemVer 2.0.0 (semver.org), used to validate `VERSION`. */
export const SEMVER_PATTERN =
  "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
  "(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?" +
  "(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?";

const SEMVER_RE = new RegExp(`^${SEMVER_PATTERN}$`);

/**
 * Loose SemVer shape used to *find* versions embedded in text. It is deliberately more lenient
 * than {@link SEMVER_PATTERN} (leading zeros are accepted) so that a malformed stale value is
 * still detected and replaced.
 */
const LOOSE_SEMVER =
  "\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?";

/** Matches a template header `cross-stack-standard vX.Y.Z`; group 1 is the version. */
export const HEADER_RE = new RegExp(
  `(?<![\\w-])${PLUGIN_NAME} v(${LOOSE_SEMVER})(?![0-9A-Za-z]|\\.[0-9A-Za-z])`,
  "g",
);

/** Matches a versioned raw schema URL of this repository; group 1 is the version. */
export const SCHEMA_URL_RE = new RegExp(
  `https://raw\\.githubusercontent\\.com/o6b7/${PLUGIN_NAME}/v(${LOOSE_SEMVER})/`,
  "g",
);

/** A header must appear within this many leading lines of a file to count as a header. */
export const HEADER_MAX_LINES = 20;

/** npm dependency maps whose internal ranges are stamped. */
const DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]);

/** An internal range that tracks the release: exact, `=`, `^`, `~` or `>=` plus a version. */
const INTERNAL_RANGE_RE = new RegExp(`^(\\^|~|>=|=)?(${LOOSE_SEMVER})$`);

/** Directory names never descended into (dependencies, VCS data and ignored build output). */
const ALWAYS_SKIPPED_DIRS = Object.freeze([
  ".git",
  "node_modules",
  ".next",
  ".expo",
  ".turbo",
  ".cache",
  "coverage",
  "dist",
  "build",
]);

/**
 * Test inputs keep whatever version they were written for; stamping them would break the tests
 * that depend on an older header or URL.
 */
const FIXTURE_DIRS = Object.freeze(["fixtures", "__fixtures__"]);

/** Skipped inside `packages/`: a Composer install lives in `vendor/` there. */
const PACKAGE_SKIPPED_DIRS = new Set([...ALWAYS_SKIPPED_DIRS, ...FIXTURE_DIRS, "vendor"]);

/**
 * Skipped inside the plugin's `templates/`. `vendor/` is *not* skipped: there it holds the kit's
 * vendored gate packages, which carry the kit version like any other template.
 */
const TEMPLATE_SKIPPED_DIRS = new Set([...ALWAYS_SKIPPED_DIRS, ...FIXTURE_DIRS]);

/** Skipped when searching `packages/` for `composer.json` (third-party packages live in `vendor/`). */
const COMPOSER_SKIPPED_DIRS = new Set([...ALWAYS_SKIPPED_DIRS, ...FIXTURE_DIRS, "vendor"]);

/** Lockfiles are machine-written; only the npm lockfile is handled, structurally. */
const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "composer.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
]);

/** Files larger than this are not scanned as text templates. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/** Manifests and lockfiles are always read, up to this size. */
const MAX_JSON_BYTES = 64 * 1024 * 1024;

/**
 * Sibling members after which a missing key is inserted, in order of preference, per key. A key
 * with no listed sibling present is inserted as the first member.
 */
const INSERT_ANCHORS = Object.freeze({
  version: ["name", "description"],
  metadata: ["description", "owner", "name"],
});

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** Raised when `VERSION` is missing or is not a valid SemVer 2.0.0 string. */
export class VersionFileError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "VersionFileError";
  }
}

/** Raised for invalid command-line usage; scripts map it to exit code 2. */
export class UsageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

// ---------------------------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------------------------

/**
 * Whether `value` is a valid SemVer 2.0.0 version (no leading `v`).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSemver(value) {
  return typeof value === "string" && SEMVER_RE.test(value);
}

/**
 * Reads and validates `VERSION` at `root`.
 * @param {string} root Repository root.
 * @returns {string} The version, without surrounding whitespace.
 * @throws {VersionFileError} When the file is missing, empty or not SemVer.
 */
export function readVersionFile(root) {
  const file = path.join(root, PATHS.version);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new VersionFileError(`${PATHS.version} not found at ${toPosix(root)}`);
    }
    throw error;
  }
  const value = raw.replace(/^\uFEFF/, "").trim();
  if (value === "") throw new VersionFileError(`${PATHS.version} is empty`);
  if (/\s/.test(value)) {
    throw new VersionFileError(`${PATHS.version} must hold one version on one line`);
  }
  if (!isSemver(value)) {
    const hint = /^v\d/.test(value) ? ' (write it without the leading "v")' : "";
    throw new VersionFileError(
      `${PATHS.version} holds "${value}", which is not a SemVer 2.0.0 version${hint}`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Path and file-system helpers
// ---------------------------------------------------------------------------------------------

/**
 * Converts a path to forward slashes.
 * @param {string} value
 * @returns {string}
 */
export function toPosix(value) {
  return value.split(path.sep).join("/");
}

/**
 * Absolute path of a repository-relative POSIX path.
 * @param {string} root
 * @param {string} rel
 * @returns {string}
 */
export function resolveRel(root, rel) {
  return path.join(root, ...rel.split("/"));
}

/**
 * Whether a regular file exists at `abs`.
 * @param {string} abs
 * @returns {boolean}
 */
export function isFile(abs) {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Whether a directory exists at `abs`.
 * @param {string} abs
 * @returns {boolean}
 */
export function isDirectory(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/** Code-point order, so output does not depend on the locale. */
function compareStrings(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Lists regular files under a repository-relative directory, depth first, sorted. Symbolic links
 * are not followed. A missing directory yields an empty list.
 * @param {string} root Repository root.
 * @param {string} relDir Repository-relative POSIX directory.
 * @param {{ skipDirs?: Set<string>, filter?: (rel: string, name: string) => boolean }} [options]
 * @returns {string[]} Repository-relative POSIX paths.
 */
export function walkFiles(root, relDir, options = {}) {
  const skipDirs = options.skipDirs ?? new Set(ALWAYS_SKIPPED_DIRS);
  const start = resolveRel(root, relDir);
  const out = [];
  if (!isDirectory(start)) return out;
  const stack = [start];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) stack.push(abs);
      } else if (entry.isFile()) {
        const rel = toPosix(path.relative(root, abs));
        if (!options.filter || options.filter(rel, entry.name)) out.push(rel);
      }
    }
  }
  return out.sort(compareStrings);
}

/**
 * Lists the immediate sub-directories of a repository-relative directory, sorted.
 * @param {string} root
 * @param {string} relDir
 * @returns {string[]} Directory names.
 */
export function listDirectories(root, relDir) {
  const abs = resolveRel(root, relDir);
  if (!isDirectory(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !ALWAYS_SKIPPED_DIRS.includes(entry.name))
    .map((entry) => entry.name)
    .sort(compareStrings);
}

/**
 * Reads a file as UTF-8 text. Returns `null` for binary files, files that are not valid UTF-8,
 * and files over the size limit, so they are never rewritten.
 * @param {string} abs
 * @param {number} [maxBytes] Size limit (default 2 MiB).
 * @returns {string | null}
 */
export function readTextFile(abs, maxBytes = MAX_TEXT_BYTES) {
  const buffer = fs.readFileSync(abs);
  if (buffer.length > maxBytes) return null;
  if (buffer.subarray(0, 8192).includes(0)) return null;
  const text = buffer.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buffer)) return null;
  return text;
}

// ---------------------------------------------------------------------------------------------
// Line numbers
// ---------------------------------------------------------------------------------------------

/**
 * Builds a function that maps a character offset to its 1-based line number.
 * @param {string} text
 * @returns {(offset: number) => number}
 */
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/**
 * Extracts the 1-based line from a `JSON.parse` error message, when the engine reports one.
 * @param {string} text The text that failed to parse.
 * @param {Error} error
 * @returns {number} The line, or 0 when unknown.
 */
export function jsonErrorLine(text, error) {
  const message = String(error && error.message);
  const line = /line (\d+)/.exec(message);
  if (line) return Number(line[1]);
  const position = /position (\d+)/.exec(message);
  if (position) return lineIndex(text)(Number(position[1]));
  return 0;
}

// ---------------------------------------------------------------------------------------------
// JSON with source spans
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} JsonNode
 * @property {"object" | "array" | "string" | "literal"} type
 * @property {number} start Offset of the first character.
 * @property {number} end Offset after the last character.
 * @property {unknown} [value] Decoded value (strings and literals).
 * @property {JsonMember[]} [members] Object members in source order.
 * @property {JsonNode[]} [items] Array items.
 */

/**
 * @typedef {object} JsonMember
 * @property {string} key Decoded key.
 * @property {number} keyStart Offset of the key's opening quote.
 * @property {number} keyEnd Offset after the key's closing quote.
 * @property {JsonNode} value
 */

/**
 * Parses JSON text into a tree that records the source span of every node, so that single
 * values can be replaced without reformatting the file. The input must already be valid JSON
 * (callers run `JSON.parse` first for validation and error messages).
 * @param {string} text
 * @returns {JsonNode}
 */
export function parseJsonSpans(text) {
  let i = 0;
  const n = text.length;
  const fail = (what) => {
    throw new SyntaxError(`${what} at offset ${i}`);
  };
  const skipWhitespace = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  };
  const parseString = () => {
    const start = i;
    i++;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 92) i += 2;
      else if (c === 34) {
        i++;
        return { type: "string", start, end: i, value: JSON.parse(text.slice(start, i)) };
      } else i++;
    }
    return fail("unterminated string");
  };
  const parseValue = () => {
    skipWhitespace();
    const start = i;
    const ch = text[i];
    if (ch === "{") {
      i++;
      const members = [];
      skipWhitespace();
      if (text[i] === "}") {
        i++;
        return { type: "object", start, end: i, members };
      }
      for (;;) {
        skipWhitespace();
        if (text[i] !== '"') fail("expected a key");
        const key = parseString();
        skipWhitespace();
        if (text[i] !== ":") fail("expected ':'");
        i++;
        const value = parseValue();
        members.push({ key: key.value, keyStart: key.start, keyEnd: key.end, value });
        skipWhitespace();
        if (text[i] === ",") i++;
        else if (text[i] === "}") {
          i++;
          return { type: "object", start, end: i, members };
        } else fail("expected ',' or '}'");
      }
    }
    if (ch === "[") {
      i++;
      const items = [];
      skipWhitespace();
      if (text[i] === "]") {
        i++;
        return { type: "array", start, end: i, items };
      }
      for (;;) {
        items.push(parseValue());
        skipWhitespace();
        if (text[i] === ",") i++;
        else if (text[i] === "]") {
          i++;
          return { type: "array", start, end: i, items };
        } else fail("expected ',' or ']'");
      }
    }
    if (ch === '"') return parseString();
    while (i < n && !/[\s,\]}]/.test(text[i])) i++;
    if (i === start) fail("unexpected character");
    return { type: "literal", start, end: i, value: JSON.parse(text.slice(start, i)) };
  };
  const root = parseValue();
  skipWhitespace();
  if (i !== n) fail("unexpected trailing content");
  return root;
}

/**
 * The last member of an object node with the given key (JSON.parse keeps the last duplicate).
 * @param {JsonNode | undefined} node
 * @param {string} key
 * @returns {JsonMember | undefined}
 */
export function getMember(node, key) {
  if (!node || node.type !== "object") return undefined;
  for (let k = node.members.length - 1; k >= 0; k--) {
    if (node.members[k].key === key) return node.members[k];
  }
  return undefined;
}

/**
 * Renders a key path for messages: `metadata.version`, `packages["packages/x"].version`.
 * @param {string[]} keys
 * @returns {string}
 */
export function formatKeyPath(keys) {
  return keys
    .map((key, index) => {
      if (/^[A-Za-z_$][\w$]*$/.test(key)) return index === 0 ? key : `.${key}`;
      return `[${JSON.stringify(key)}]`;
    })
    .join("");
}

/** Leading whitespace of the line that contains `offset`. */
function lineIndent(text, offset) {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, offset));
  return match ? match[0] : "";
}

/** Formatting conventions of a JSON document, reused for inserted members. */
function detectJsonFormat(text, tree) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const multiline = text.includes("\n");
  let unit = "  ";
  let colon = ": ";
  if (tree.type === "object" && tree.members.length > 0) {
    const first = tree.members[0];
    if (multiline) {
      const indent = lineIndent(text, first.keyStart);
      if (indent !== "") unit = indent;
    }
    const between = text.slice(first.keyEnd, first.value.start);
    colon = between.includes("\n") ? ": " : between.replace(/\r/g, "");
  }
  return { newline, multiline, unit, colon, trailingNewline: /\n$/.test(text) };
}

/** Raw JSON for a value to insert, nesting objects for the remaining keys of a path. */
function nestedRaw(keys, value, indent, format) {
  if (keys.length === 0) return JSON.stringify(value);
  const inner = format.multiline ? indent + format.unit : "";
  const member = `${JSON.stringify(keys[0])}${format.colon}${nestedRaw(keys.slice(1), value, inner, format)}`;
  if (!format.multiline) return `{${member}}`;
  return `{${format.newline}${inner}${member}${format.newline}${indent}}`;
}

/** A text edit that inserts `key` (with the remaining `rest` keys nested) into an object node. */
function insertionEdit(text, objectNode, key, rest, value, format) {
  const members = objectNode.members;
  if (members.length === 0) {
    const indent = lineIndent(text, objectNode.start);
    return {
      start: objectNode.start,
      end: objectNode.end,
      text: format.multiline
        ? `{${format.newline}${indent}${format.unit}${JSON.stringify(key)}${format.colon}${nestedRaw(rest, value, indent + format.unit, format)}${format.newline}${indent}}`
        : `{${JSON.stringify(key)}${format.colon}${nestedRaw(rest, value, "", format)}}`,
    };
  }
  let anchor;
  for (const name of INSERT_ANCHORS[key] ?? ["name"]) {
    anchor = getMember(objectNode, name);
    if (anchor) break;
  }
  const expanded = text.slice(objectNode.start, members[0].keyStart).includes("\n");
  const reference = anchor ?? members[0];
  const indent = expanded ? lineIndent(text, reference.keyStart) : "";
  const pair = `${JSON.stringify(key)}${format.colon}${nestedRaw(rest, value, indent, format)}`;
  let separator = `,${format.newline}${indent}`;
  if (!expanded) {
    // Single-line object: reuse the separator between its first two members when there are two.
    if (members.length > 1) separator = text.slice(members[0].value.end, members[1].keyStart);
    else separator = /^\{\s/.test(text.slice(objectNode.start)) ? ", " : ",";
  }
  if (anchor) {
    return { start: anchor.value.end, end: anchor.value.end, text: `${separator}${pair}` };
  }
  return { start: members[0].keyStart, end: members[0].keyStart, text: `${pair}${separator}` };
}

/** Sets `keys` to `value` in a plain object, creating intermediate objects. */
function setDeep(target, keys, value) {
  let node = target;
  for (const key of keys.slice(0, -1)) {
    if (node[key] === null || typeof node[key] !== "object" || Array.isArray(node[key])) {
      node[key] = {};
    }
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
}

/** Applies non-overlapping edits, last first so earlier offsets stay valid. */
function applyEdits(text, edits) {
  const ordered = edits
    .map((edit, order) => ({ ...edit, order }))
    .sort((a, b) => b.start - a.start || b.order - a.order);
  let out = text;
  for (const edit of ordered) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}

/**
 * @typedef {object} JsonSet
 * @property {string[]} keys Key path of the string value to set.
 * @property {string} value The value it must hold.
 * @property {"set" | "upsert"} mode `set` only replaces an existing value; `upsert` also adds it.
 */

/**
 * @typedef {object} JsonSetResult
 * @property {JsonSet} set
 * @property {"none" | "set" | "insert" | "absent"} action What the stamp does at this location.
 * @property {string | null} from The current value (raw JSON for non-strings), null when absent.
 * @property {number} line 1-based line in the input (the parent object's line for an insert).
 */

/**
 * Sets string values in a JSON document with minimal, format-preserving edits: an existing value
 * is replaced in place and a missing one is inserted after its `name`/`description` sibling with
 * the file's own indentation and line endings. If the surgical result does not parse back to the
 * expected document the whole file is re-serialised instead (with the detected indentation).
 * @param {string} text JSON text (a leading BOM is preserved).
 * @param {JsonSet[]} sets
 * @returns {{ text: string, results: JsonSetResult[] }}
 * @throws {SyntaxError} When the text is not valid JSON.
 * @throws {TypeError} When a path runs through a value that is not an object.
 */
export function stampJson(text, sets) {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = text.slice(bom.length);
  const parsed = JSON.parse(body);
  const tree = parseJsonSpans(body);
  const lineOf = lineIndex(body);
  const format = detectJsonFormat(body, tree);
  const expected = structuredClone(parsed);
  const edits = [];
  const results = [];

  for (const set of sets) {
    let node = tree;
    let depth = 0;
    for (; depth < set.keys.length - 1; depth++) {
      const member = getMember(node, set.keys[depth]);
      if (!member) break;
      if (member.value.type !== "object") {
        throw new TypeError(
          `${formatKeyPath(set.keys.slice(0, depth + 1))} is not an object, so ${formatKeyPath(set.keys)} cannot be set`,
        );
      }
      node = member.value;
    }
    const member = depth === set.keys.length - 1 ? getMember(node, set.keys[depth]) : undefined;
    if (member) {
      const current = member.value;
      const from =
        current.type === "string" ? current.value : body.slice(current.start, current.end);
      const line = lineOf(current.start);
      if (current.type === "string" && current.value === set.value) {
        results.push({ set, action: "none", from, line });
        continue;
      }
      edits.push({ start: current.start, end: current.end, text: JSON.stringify(set.value) });
      setDeep(expected, set.keys, set.value);
      results.push({ set, action: "set", from, line });
      continue;
    }
    if (set.mode !== "upsert") {
      results.push({ set, action: "absent", from: null, line: lineOf(node.start) });
      continue;
    }
    if (node.type !== "object") {
      throw new TypeError(
        `the document root is not an object, so ${formatKeyPath(set.keys)} cannot be set`,
      );
    }
    edits.push(
      insertionEdit(body, node, set.keys[depth], set.keys.slice(depth + 1), set.value, format),
    );
    setDeep(expected, set.keys, set.value);
    results.push({ set, action: "insert", from: null, line: lineOf(node.start) });
  }

  if (edits.length === 0) return { text, results };
  let output = applyEdits(body, edits);
  let reparsed;
  try {
    reparsed = JSON.parse(output);
  } catch {
    reparsed = undefined;
  }
  if (!isDeepStrictEqual(reparsed, expected)) {
    output = JSON.stringify(expected, null, format.unit).replace(/\n/g, format.newline);
    if (format.trailingNewline) output += format.newline;
  }
  return { text: bom + output, results };
}

// ---------------------------------------------------------------------------------------------
// Text stamping (headers and schema URLs)
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} TextMatch
 * @property {"header" | "schema-url"} kind
 * @property {number} line 1-based line.
 * @property {string} from The version found.
 * @property {number} start Offset of the version.
 * @property {number} end Offset after the version.
 */

/**
 * Finds header comments (`cross-stack-standard vX.Y.Z` within the first
 * {@link HEADER_MAX_LINES} lines) and/or versioned schema URLs in a text.
 * @param {string} text
 * @param {{ headers?: boolean, schemaUrls?: boolean }} kinds
 * @returns {TextMatch[]} Matches in source order.
 */
export function findVersionMarkers(text, kinds) {
  const lineOf = lineIndex(text);
  const matches = [];
  const collect = (regex, kind, limit) => {
    regex.lastIndex = 0;
    const scope = text.slice(0, limit);
    for (const match of scope.matchAll(regex)) {
      const start = match.index + match[0].lastIndexOf(match[1]);
      matches.push({
        kind,
        line: lineOf(start),
        from: match[1],
        start,
        end: start + match[1].length,
      });
    }
  };
  if (kinds.headers) {
    // End of the header zone: the newline that closes line HEADER_MAX_LINES, or end of text.
    let limit = text.length;
    let from = 0;
    for (let line = 0; line < HEADER_MAX_LINES; line++) {
      const newline = text.indexOf("\n", from);
      if (newline === -1) {
        limit = text.length;
        break;
      }
      limit = newline;
      from = newline + 1;
    }
    collect(HEADER_RE, "header", limit);
  }
  if (kinds.schemaUrls) collect(SCHEMA_URL_RE, "schema-url", text.length);
  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Rewrites every marker found by {@link findVersionMarkers} to `version`.
 * @param {string} text
 * @param {TextMatch[]} matches
 * @param {string} version
 * @returns {string}
 */
export function replaceVersionMarkers(text, matches, version) {
  const edits = matches
    .filter((match) => match.from !== version)
    .map((match) => ({ start: match.start, end: match.end, text: version }));
  return edits.length === 0 ? text : applyEdits(text, edits);
}

// ---------------------------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} TargetRoles
 * @property {boolean} [marketplace] `.claude-plugin/marketplace.json`.
 * @property {boolean} [pluginManifest] The plugin's `plugin.json`.
 * @property {boolean} [packageRequired] A `package.json` that must declare `version`.
 * @property {boolean} [packageTemplate] A template `package.json` (stamped only when present).
 * @property {boolean} [lockfile] The root `package-lock.json`.
 * @property {boolean} [headers] Scan for header comments.
 * @property {boolean} [schemaUrls] Scan for versioned schema URLs.
 * @property {boolean} [composer] A `composer.json` (policy check only; never written).
 */

const isComposer = (name) => name === "composer.json";
const isChangelog = (name) => /^changelog(\.|$)/i.test(name);

/**
 * Collects every file that holds a version location, with the roles it plays. Files that do not
 * exist are simply absent from the result.
 * @param {string} root Repository root.
 * @returns {Map<string, TargetRoles>} Keyed by repository-relative POSIX path, sorted.
 */
export function collectTargets(root) {
  /** @type {Map<string, TargetRoles>} */
  const targets = new Map();
  const add = (rel, roles) => {
    if (!isFile(resolveRel(root, rel))) return;
    targets.set(rel, { ...targets.get(rel), ...roles });
  };

  add(PATHS.marketplace, { marketplace: true });
  add(PATHS.pluginManifest, { pluginManifest: true });
  add(PATHS.rootPackage, { packageRequired: true });
  add(PATHS.rootLock, { lockfile: true });
  add(PATHS.rootComposer, { composer: true });
  for (const name of listDirectories(root, PATHS.packages)) {
    add(`${PATHS.packages}/${name}/package.json`, { packageRequired: true });
  }

  const textFilter = (_rel, name) =>
    !isComposer(name) && !isChangelog(name) && !LOCKFILE_NAMES.has(name);
  for (const rel of walkFiles(root, PATHS.templates, {
    skipDirs: TEMPLATE_SKIPPED_DIRS,
    filter: textFilter,
  })) {
    const roles = { headers: true, schemaUrls: true };
    if (rel.endsWith("/package.json")) roles.packageTemplate = true;
    add(rel, roles);
  }
  for (const rel of walkFiles(root, PATHS.packages, {
    skipDirs: PACKAGE_SKIPPED_DIRS,
    filter: textFilter,
  })) {
    add(rel, { headers: true });
  }

  const schemaFilter = (_rel, name) => name.endsWith(".schema.json");
  for (const rel of [
    ...walkFiles(root, PATHS.schemas, { filter: schemaFilter }),
    ...walkFiles(root, PATHS.registry, { filter: schemaFilter }),
    ...walkFiles(root, PATHS.pluginData, { filter: schemaFilter }),
  ]) {
    add(rel, { schemaUrls: true });
  }

  const composerScopes = [
    walkFiles(root, PATHS.packages, {
      skipDirs: COMPOSER_SKIPPED_DIRS,
      filter: (_rel, name) => isComposer(name),
    }),
    // Inside the plugin, `vendor/` holds the kit's vendored gate packages; they are checked too.
    walkFiles(root, PATHS.pluginDir, {
      skipDirs: TEMPLATE_SKIPPED_DIRS,
      filter: (_rel, name) => isComposer(name),
    }),
  ];
  for (const rel of composerScopes.flat()) add(rel, { composer: true });

  return new Map([...targets.entries()].sort(([a], [b]) => compareStrings(a, b)));
}

/** Stamps for internal `@cross-stack-standard/*` ranges inside one manifest object. */
function internalDependencySets(manifest, prefix, version) {
  const sets = [];
  if (!manifest || typeof manifest !== "object") return sets;
  for (const field of DEPENDENCY_FIELDS) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!name.startsWith(NPM_SCOPE) || typeof spec !== "string") continue;
      const match = INTERNAL_RANGE_RE.exec(spec.trim());
      if (!match) continue;
      sets.push({
        keys: [...prefix, field, name],
        value: `${match[1] ?? ""}${version}`,
        mode: "set",
      });
    }
  }
  return sets;
}

/** Whether a marketplace plugin entry describes this repository's plugin. */
function isOwnPluginEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.name === PLUGIN_NAME) return true;
  return (
    typeof entry.source === "string" && entry.source.replace(/\/+$/, "") === `./${PATHS.pluginDir}`
  );
}

/**
 * The JSON stamps for one file, given its roles and parsed content.
 * @param {TargetRoles} roles
 * @param {unknown} parsed
 * @param {string} version
 * @param {Set<string>} workspaceKeys Lockfile `packages` keys to stamp ("" and workspace dirs).
 * @returns {JsonSet[]}
 */
function jsonSetsFor(roles, parsed, version, workspaceKeys) {
  /** @type {JsonSet[]} */
  const sets = [];
  if (roles.marketplace) {
    sets.push({ keys: ["metadata", "version"], value: version, mode: "upsert" });
    sets.push({ keys: ["version"], value: version, mode: "set" });
  }
  if (roles.pluginManifest) sets.push({ keys: ["version"], value: version, mode: "upsert" });
  if (roles.packageRequired || roles.packageTemplate) {
    sets.push({
      keys: ["version"],
      value: version,
      mode: roles.packageRequired ? "upsert" : "set",
    });
    sets.push(...internalDependencySets(parsed, [], version));
  }
  if (roles.lockfile && parsed && typeof parsed === "object") {
    sets.push({ keys: ["version"], value: version, mode: "set" });
    const entries = parsed.packages && typeof parsed.packages === "object" ? parsed.packages : {};
    for (const key of Object.keys(entries)) {
      // Only the root ("") and the stamped workspaces; dependencies live under node_modules/.
      if (!workspaceKeys.has(key)) continue;
      sets.push({ keys: ["packages", key, "version"], value: version, mode: "set" });
      sets.push(...internalDependencySets(entries[key], ["packages", key], version));
    }
  }
  return sets;
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} Location
 * @property {string} file Repository-relative POSIX path.
 * @property {number} line 1-based line (0 when not applicable).
 * @property {string} location What is stamped: a key path, `header` or `schema URL`.
 * @property {string | null} from Current value, null when missing.
 * @property {string} to The version it must hold.
 * @property {"none" | "set" | "insert"} action
 */

/**
 * @typedef {object} Finding
 * @property {string} id Finding identifier (`VERSION-…`).
 * @property {string} file Repository-relative POSIX path.
 * @property {number} line 1-based line (0 when not applicable).
 * @property {string} message
 */

/**
 * @typedef {object} StampPlan
 * @property {string} version The version from `VERSION`.
 * @property {Location[]} locations Every location checked.
 * @property {Location[]} changes Locations that differ from `version`.
 * @property {Finding[]} findings Policy findings and unreadable files.
 * @property {{ file: string, text: string }[]} writes New content per changed file.
 */

/**
 * Computes every version location under `root` and the edits that align it with `version`.
 * Nothing is written.
 * @param {string} root Repository root.
 * @param {string} version Target version (normally from {@link readVersionFile}).
 * @returns {StampPlan}
 */
export function planVersionStamp(root, version) {
  /** @type {Location[]} */
  const locations = [];
  /** @type {Finding[]} */
  const findings = [];
  const writes = [];
  const workspaceKeys = new Set([
    "",
    ...listDirectories(root, PATHS.packages)
      .filter((name) => isFile(resolveRel(root, `${PATHS.packages}/${name}/package.json`)))
      .map((name) => `${PATHS.packages}/${name}`),
  ]);

  for (const [rel, roles] of collectTargets(root)) {
    const jsonRoles = Boolean(
      roles.marketplace ||
      roles.pluginManifest ||
      roles.packageRequired ||
      roles.packageTemplate ||
      roles.lockfile ||
      roles.composer,
    );
    const original = readTextFile(
      resolveRel(root, rel),
      jsonRoles ? MAX_JSON_BYTES : MAX_TEXT_BYTES,
    );
    if (original === null) {
      if (jsonRoles) {
        findings.push({
          id: "VERSION-JSON",
          file: rel,
          line: 0,
          message: "not a UTF-8 text file; its version cannot be checked",
        });
      }
      continue;
    }
    let text = original;

    if (!roles.composer && (roles.headers || roles.schemaUrls)) {
      const markers = findVersionMarkers(text, {
        headers: roles.headers,
        schemaUrls: roles.schemaUrls,
      });
      for (const marker of markers) {
        locations.push({
          file: rel,
          line: marker.line,
          location: marker.kind === "header" ? "header" : "schema URL",
          from: marker.from,
          to: version,
          action: marker.from === version ? "none" : "set",
        });
      }
      text = replaceVersionMarkers(text, markers, version);
    }

    if (jsonRoles) {
      let parsed;
      try {
        parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
      } catch (error) {
        findings.push({
          id: "VERSION-JSON",
          file: rel,
          line: jsonErrorLine(text.replace(/^\uFEFF/, ""), error),
          message: `not valid JSON (${error.message}); its version cannot be checked`,
        });
        continue;
      }
      if (roles.composer) {
        findings.push(...composerFindings(rel, text, parsed));
      } else {
        if (roles.marketplace) findings.push(...marketplaceFindings(rel, text, parsed));
        try {
          const stamped = stampJson(text, jsonSetsFor(roles, parsed, version, workspaceKeys));
          for (const result of stamped.results) {
            if (result.action === "absent") continue;
            locations.push({
              file: rel,
              line: result.line,
              location: formatKeyPath(result.set.keys),
              from: result.from,
              to: result.set.value,
              action: result.action,
            });
          }
          text = stamped.text;
        } catch (error) {
          findings.push({ id: "VERSION-JSON", file: rel, line: 0, message: error.message });
          continue;
        }
      }
    }

    if (text !== original) writes.push({ file: rel, text });
  }

  const changes = locations.filter((location) => location.action !== "none");
  return { version, locations, changes, findings, writes };
}

/**
 * The 1-based line of the member (or array item) at a key path, 0 when it cannot be found.
 * @param {string} text JSON text.
 * @param {string[]} keys Object keys and array indexes (as strings).
 * @returns {number}
 */
export function memberLine(text, keys) {
  const body = text.replace(/^\uFEFF/, "");
  try {
    let node = parseJsonSpans(body);
    let offset = node.start;
    for (const key of keys) {
      if (node.type === "array") {
        const item = node.items[Number(key)];
        if (!item) return 0;
        node = item;
        offset = item.start;
      } else {
        const member = getMember(node, key);
        if (!member) return 0;
        node = member.value;
        offset = member.keyStart;
      }
    }
    return lineIndex(body)(offset);
  } catch {
    return 0;
  }
}

/** `composer.json` must not declare `version`. */
function composerFindings(rel, text, parsed) {
  if (!parsed || typeof parsed !== "object" || !Object.hasOwn(parsed, "version")) return [];
  return [
    {
      id: "VERSION-COMPOSER",
      file: rel,
      line: memberLine(text, ["version"]),
      message:
        `declares "version" (${JSON.stringify(parsed.version)}); remove it: Composer infers the ` +
        "version from tags and from the path-repository versions option",
    },
  ];
}

/** The marketplace entry of this plugin must not declare `version` (plugin.json owns it). */
function marketplaceFindings(rel, text, parsed) {
  const entries = parsed && Array.isArray(parsed.plugins) ? parsed.plugins : [];
  const findings = [];
  entries.forEach((entry, index) => {
    if (!isOwnPluginEntry(entry) || !Object.hasOwn(entry, "version")) return;
    findings.push({
      id: "VERSION-ENTRY",
      file: rel,
      line: memberLine(text, ["plugins", String(index), "version"]),
      message:
        `plugins[${index}] ("${entry.name}") declares "version" (${JSON.stringify(entry.version)}); ` +
        "remove it: plugin.json version is the only plugin version and a mismatch fails validation",
    });
  });
  return findings;
}

/**
 * Converts the plan's pending changes into drift findings (`VERSION-MISMATCH`,
 * `VERSION-MISSING`) followed by its policy findings.
 * @param {StampPlan} plan
 * @returns {Finding[]}
 */
export function driftFindings(plan) {
  const fix = "run node scripts/stamp-version.mjs";
  const drift = plan.changes.map((change) =>
    change.action === "insert"
      ? {
          id: "VERSION-MISSING",
          file: change.file,
          line: change.line,
          message: `${change.location} is missing; expected "${change.to}" (${fix})`,
        }
      : {
          id: "VERSION-MISMATCH",
          file: change.file,
          line: change.line,
          message: `${change.location} is "${change.from}"; expected "${change.to}" (${fix})`,
        },
  );
  return [...drift, ...plan.findings];
}

/**
 * Writes the plan's new file contents. Callers must not write a plan that has findings of kind
 * `VERSION-JSON` (the file set would be incomplete).
 * @param {string} root
 * @param {StampPlan} plan
 * @returns {number} Number of files written.
 */
export function writePlan(root, plan) {
  for (const write of plan.writes) fs.writeFileSync(resolveRel(root, write.file), write.text);
  return plan.writes.length;
}

// ---------------------------------------------------------------------------------------------
// CLI helpers shared by the version and identity scripts
// ---------------------------------------------------------------------------------------------

/**
 * Formats a finding as `<ID> <path>:<line> <message>`.
 * @param {Finding} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  return `${finding.id} ${finding.file}:${finding.line} ${finding.message}`;
}

/**
 * Whether the module at `metaUrl` is the process entry point.
 * @param {string} metaUrl `import.meta.url` of the calling module.
 * @returns {boolean}
 */
export function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(process.argv[1]))
    );
  } catch {
    return false;
  }
}

/**
 * The repository root, two levels above `scripts/lib/`.
 * @returns {string}
 */
export function defaultRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/**
 * Parses CLI arguments with `node:util` `parseArgs` in strict mode (no positionals). Every script
 * accepts `--root <dir>`, `--json` and `--help` in addition to its own options.
 * @param {string[]} argv
 * @param {Record<string, { type: "string" | "boolean", short?: string }>} extra
 * @returns {Record<string, string | boolean | undefined> & { root: string }}
 * @throws {UsageError}
 */
export function parseCli(argv, extra = {}) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        root: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        ...extra,
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError(error.message);
  }
  const root = values.root === undefined ? defaultRoot() : path.resolve(values.root);
  if (values.root !== undefined && !isDirectory(root)) {
    throw new UsageError(`--root ${values.root} is not a directory`);
  }
  return { ...values, root };
}
