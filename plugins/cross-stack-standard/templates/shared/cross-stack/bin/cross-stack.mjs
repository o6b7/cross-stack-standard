// cross-stack-standard v0.1.0
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Qusai Abdullah
//
// Project tool of the Cross-Stack Standard. The adopt skill copies it to
// .cross-stack/bin/cross-stack.mjs; the Standard's skills run it, and so can the project's own
// `check` scripts and CI (the kit's reusable CI workflows will, once they ship):
//
//   node .cross-stack/bin/cross-stack.mjs <command> [options]
//
// It is one file that uses Node.js built-ins only and never touches the network, so it runs in any
// project with Node.js >= 22.13 before (or without) installing dependencies. For the same reason it
// validates JSON with the small JSON Schema subset interpreter below rather than a schema library:
// a library would be a dependency. The schemas themselves are embedded at the end of the file,
// generated from the Standard's published schemas so there is one source.
//
// Besides the checks, `detect` prints the stacks it finds in a project as JSON (the adopt skill
// uses it), and `doctor` reports on the environment and on the project's adoption (the doctor
// skill explains its output). `doctor` starts a few local programs (`git`, `claude`, `php`,
// `composer`) to read their versions; it never installs anything.
//
// Exit codes: 0 clean, 1 check failed, 2 usage or internal error.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** Exit codes shared by every command. */
export const EXIT = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });

/** Project-relative location of the manifest. */
export const MANIFEST_PATH = ".cross-stack/standard.json";

/** Default project-relative directory of the allowlist files. */
export const DEFAULT_ALLOWLISTS_DIR = ".cross-stack/allowlists";

/** Default furthest expiry date of an allowlist entry, in days after today. */
export const DEFAULT_ALLOWLIST_MAX_DAYS = 365;

const RULE_ID = /^(?:BE|WEB|MOB|SEC|I18N|UI|PROC|CI)-[0-9]{3}$/;
const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/** A problem with how the tool was invoked (exit code 2). */
export class UsageError extends Error {}

// ---------------------------------------------------------------------------------------------
// JSON reading with line numbers
// ---------------------------------------------------------------------------------------------

/**
 * Parses JSON text and records the line of every value, so findings can point at a line.
 * A leading byte-order mark is ignored.
 *
 * @param {string} text
 * @returns {{ ok: true, value: unknown, lines: Map<string, number>, duplicates: Array<{pointer: string, line: number}> }
 *   | { ok: false, line: number, message: string }}
 */
export function parseJsonWithLines(text) {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return { ok: false, ...describeJsonError(source, error) };
  }
  return { ok: true, value, ...locateJsonValues(source) };
}

function describeJsonError(source, error) {
  const raw = error instanceof Error ? error.message : String(error);
  const position = /at position (\d+)/.exec(raw);
  const line = position
    ? lineAt(source, Number(position[1]))
    : Math.max(1, source.split("\n").length - (source.endsWith("\n") ? 1 : 0));
  const message = raw.replace(/\s*in JSON at position \d+(?: \(line \d+ column \d+\))?/, "");
  return { line, message: `invalid JSON: ${message}` };
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

/** Escapes one JSON Pointer reference token (RFC 6901). */
function pointerToken(key) {
  return String(key).replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Walks JSON text that JSON.parse accepted and maps each JSON Pointer to the line where its
 * value (or, for object members, its key) starts. Also reports duplicate object keys, which
 * JSON.parse silently collapses.
 */
function locateJsonValues(text) {
  const lines = new Map();
  const duplicates = [];
  let i = 0;
  let line = 1;

  const skipWhitespace = () => {
    while (i < text.length) {
      const c = text[i];
      if (c === "\n") line += 1;
      else if (c !== " " && c !== "\t" && c !== "\r") return;
      i += 1;
    }
  };
  const readString = () => {
    const start = i;
    i += 1;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i += 1;
    return JSON.parse(text.slice(start, i));
  };
  const readValue = (pointer) => {
    skipWhitespace();
    if (!lines.has(pointer)) lines.set(pointer, line);
    const c = text[i];
    if (c === "{" || c === "[") {
      const isObject = c === "{";
      const close = isObject ? "}" : "]";
      const seen = new Set();
      let index = 0;
      i += 1;
      skipWhitespace();
      if (text[i] === close) {
        i += 1;
        return;
      }
      for (;;) {
        skipWhitespace();
        let child;
        if (isObject) {
          const keyLine = line;
          const key = readString();
          child = `${pointer}/${pointerToken(key)}`;
          if (seen.has(key)) {
            // JSON.parse keeps the last occurrence, so the lines must describe that one.
            duplicates.push({ pointer: child, line: keyLine });
            for (const recorded of [...lines.keys()]) {
              if (recorded.startsWith(`${child}/`)) lines.delete(recorded);
            }
          }
          lines.set(child, keyLine);
          seen.add(key);
          skipWhitespace();
          i += 1; // the colon
        } else {
          child = `${pointer}/${index}`;
          index += 1;
        }
        readValue(child);
        skipWhitespace();
        const separator = text[i];
        i += 1;
        if (separator === close) return;
      }
    }
    if (c === '"') {
      readString();
      return;
    }
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i += 1;
  };

  readValue("");
  return { lines, duplicates };
}

/** Line of the closest recorded ancestor of a JSON Pointer (1 when nothing matches). */
function lineOf(lines, pointer) {
  let current = pointer;
  for (;;) {
    if (lines.has(current)) return lines.get(current);
    if (current === "") return 1;
    current = current.slice(0, current.lastIndexOf("/"));
  }
}

// ---------------------------------------------------------------------------------------------
// JSON Schema subset
// ---------------------------------------------------------------------------------------------

const ANNOTATION_KEYWORDS = [
  "$schema",
  "$id",
  "$comment",
  "$defs",
  "title",
  "description",
  "default",
  "examples",
  "format",
];
const ASSERTION_KEYWORDS = [
  "$ref",
  "type",
  "enum",
  "const",
  "required",
  "properties",
  "additionalProperties",
  "dependentSchemas",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minLength",
  "pattern",
  "minimum",
  "maximum",
  "allOf",
  "anyOf",
  "not",
  "if",
  "then",
  "else",
];

/**
 * JSON Schema 2020-12 keywords this tool understands. `format` is an annotation only (as in most
 * validators by default); callers check formats they care about themselves.
 */
export const SUPPORTED_SCHEMA_KEYWORDS = Object.freeze([
  ...ANNOTATION_KEYWORDS,
  ...ASSERTION_KEYWORDS,
]);

const SUPPORTED = new Set(SUPPORTED_SCHEMA_KEYWORDS);
const SUBSCHEMA_MAP_KEYWORDS = ["properties", "dependentSchemas", "$defs"];
const SUBSCHEMA_LIST_KEYWORDS = ["allOf", "anyOf"];
const SUBSCHEMA_KEYWORDS = [
  "additionalProperties",
  "items",
  "contains",
  "not",
  "if",
  "then",
  "else",
];

/**
 * Throws when a schema uses a keyword or a `$ref` form this validator does not implement, so a
 * schema change can never be silently ignored.
 *
 * @param {unknown} schema
 * @param {string} [where] JSON Pointer of `schema` inside the root schema, for the message.
 */
export function assertSchemaSubset(schema, where = "#") {
  if (typeof schema === "boolean") return;
  if (!isPlainObject(schema)) throw new Error(`${where}: a schema must be an object or a boolean`);
  for (const [keyword, value] of Object.entries(schema)) {
    if (!SUPPORTED.has(keyword)) {
      throw new Error(`${where}: unsupported JSON Schema keyword "${keyword}"`);
    }
    if (keyword === "$ref" && !String(value).startsWith("#/")) {
      throw new Error(`${where}: only local "$ref" values ("#/...") are supported`);
    }
    if (SUBSCHEMA_MAP_KEYWORDS.includes(keyword)) {
      for (const [name, sub] of Object.entries(value)) {
        assertSchemaSubset(sub, `${where}/${keyword}/${pointerToken(name)}`);
      }
    } else if (SUBSCHEMA_LIST_KEYWORDS.includes(keyword)) {
      value.forEach((sub, index) => assertSchemaSubset(sub, `${where}/${keyword}/${index}`));
    } else if (SUBSCHEMA_KEYWORDS.includes(keyword)) {
      assertSchemaSubset(value, `${where}/${keyword}`);
    }
  }
}

/**
 * Validates `instance` against `schema` (the subset in SUPPORTED_SCHEMA_KEYWORDS).
 *
 * Each error has `pointer` (the instance location it is about), `at` (the location whose line
 * best shows it) and a readable `message`.
 *
 * @param {object|boolean} schema Root schema; local `$ref`s resolve against it.
 * @param {unknown} instance
 * @returns {Array<{pointer: string, at: string, message: string}>}
 */
export function validateAgainstSchema(schema, instance) {
  assertSchemaSubset(schema);
  const errors = [];
  validateNode(schema, instance, "", schema, errors);
  return errors;
}

function validateNode(schema, value, pointer, root, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push({ pointer, at: pointer, message: "is not allowed here" });
    return;
  }
  if (schema.$ref !== undefined)
    validateNode(resolveRef(root, schema.$ref), value, pointer, root, errors);

  if (schema.type !== undefined && !matchesType(schema.type, value)) {
    errors.push({ pointer, at: pointer, message: `must be ${describeTypes(schema.type)}` });
    return;
  }
  if (schema.enum !== undefined && !schema.enum.some((option) => deepEqual(option, value))) {
    const options = schema.enum.map((option) => JSON.stringify(option)).join(", ");
    errors.push({ pointer, at: pointer, message: `must be one of ${options}` });
  }
  if (schema.const !== undefined && !deepEqual(schema.const, value)) {
    errors.push({ pointer, at: pointer, message: `must be ${JSON.stringify(schema.const)}` });
  }

  if (typeof value === "string") validateString(schema, value, pointer, errors);
  if (typeof value === "number") validateNumber(schema, value, pointer, errors);
  if (Array.isArray(value)) validateArray(schema, value, pointer, root, errors);
  if (isPlainObject(value)) validateObject(schema, value, pointer, root, errors);

  for (const sub of schema.allOf ?? []) validateNode(sub, value, pointer, root, errors);
  if (schema.anyOf !== undefined) validateAnyOf(schema.anyOf, value, pointer, root, errors);
  if (schema.not !== undefined && isValid(schema.not, value, root)) {
    const what = schema.not.description ? ` (${schema.not.description})` : "";
    errors.push({ pointer, at: pointer, message: `must not match the excluded form${what}` });
  }
  if (schema.if !== undefined) {
    const branch = isValid(schema.if, value, root) ? schema.then : schema.else;
    if (branch !== undefined) validateWithContext(branch, value, pointer, root, errors);
  }
}

function validateString(schema, value, pointer, errors) {
  if (schema.minLength !== undefined && [...value].length < schema.minLength) {
    const message =
      schema.minLength === 1
        ? "must not be empty"
        : `must be at least ${schema.minLength} characters`;
    errors.push({ pointer, at: pointer, message });
  }
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
    if (value.trim() === "") {
      errors.push({ pointer, at: pointer, message: "must not be blank" });
    } else {
      const expected = schema.description ?? `It must match /${schema.pattern}/.`;
      errors.push({
        pointer,
        at: pointer,
        message: `${JSON.stringify(value)} is not valid: ${expected}`,
      });
    }
  }
}

function validateNumber(schema, value, pointer, errors) {
  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push({ pointer, at: pointer, message: `must be at least ${schema.minimum}` });
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push({ pointer, at: pointer, message: `must be at most ${schema.maximum}` });
  }
}

function validateArray(schema, value, pointer, root, errors) {
  const count = (n) => `${n} ${n === 1 ? "item" : "items"}`;
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push({ pointer, at: pointer, message: `must have at least ${count(schema.minItems)}` });
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push({ pointer, at: pointer, message: `must have at most ${count(schema.maxItems)}` });
  }
  if (schema.uniqueItems === true) {
    const firstIndex = new Map();
    value.forEach((item, index) => {
      const key = canonicalJson(item);
      if (firstIndex.has(key)) {
        errors.push({
          pointer,
          at: `${pointer}/${index}`,
          message: `must not repeat ${JSON.stringify(item)} (items ${firstIndex.get(key)} and ${index})`,
        });
      } else {
        firstIndex.set(key, index);
      }
    });
  }
  if (schema.items !== undefined) {
    value.forEach((item, index) =>
      validateNode(schema.items, item, `${pointer}/${index}`, root, errors),
    );
  }
  if (
    schema.contains !== undefined &&
    !value.some((item) => isValid(schema.contains, item, root))
  ) {
    const wanted =
      schema.contains.const !== undefined
        ? JSON.stringify(schema.contains.const)
        : "an item that matches the expected form";
    errors.push({ pointer, at: pointer, message: `must include ${wanted}` });
  }
}

function validateObject(schema, value, pointer, root, errors) {
  for (const name of schema.required ?? []) {
    if (!Object.hasOwn(value, name)) {
      errors.push({ pointer, at: pointer, message: `missing required property "${name}"` });
    }
  }
  const properties = schema.properties ?? {};
  for (const [name, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${pointerToken(name)}`;
    if (Object.hasOwn(properties, name)) {
      validateNode(properties[name], child, childPointer, root, errors);
    } else if (schema.additionalProperties === false) {
      errors.push({ pointer, at: childPointer, message: `unknown property "${name}"` });
    } else if (schema.additionalProperties !== undefined) {
      validateNode(schema.additionalProperties, child, childPointer, root, errors);
    }
  }
  for (const [name, dependent] of Object.entries(schema.dependentSchemas ?? {})) {
    if (Object.hasOwn(value, name)) validateWithContext(dependent, value, pointer, root, errors);
  }
}

function validateAnyOf(options, value, pointer, root, errors) {
  if (options.some((option) => isValid(option, value, root))) return;
  // Report the errors of the one option whose declared type fits the value; otherwise say which
  // types would have been accepted.
  const fitting = options.filter(
    (option) => option.type === undefined || matchesType(option.type, value),
  );
  if (fitting.length === 1) {
    validateNode(fitting[0], value, pointer, root, errors);
    return;
  }
  const types = options.map((option) => option.type).filter((type) => type !== undefined);
  const message =
    types.length === options.length
      ? `must be ${describeTypes(types.flat())}`
      : "does not match any of the allowed forms";
  errors.push({ pointer, at: pointer, message });
}

/** Validates a conditional subschema and appends its description to each error as context. */
function validateWithContext(schema, value, pointer, root, errors) {
  const inner = [];
  validateNode(schema, value, pointer, root, inner);
  const context = isPlainObject(schema) && schema.description ? ` (${schema.description})` : "";
  for (const error of inner) errors.push({ ...error, message: `${error.message}${context}` });
}

function isValid(schema, value, root) {
  const errors = [];
  validateNode(schema, value, "", root, errors);
  return errors.length === 0;
}

function resolveRef(root, ref) {
  let target = root;
  for (const token of ref.slice(2).split("/")) {
    const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isPlainObject(target) || !Object.hasOwn(target, key)) {
      throw new Error(`cannot resolve "$ref": ${ref}`);
    }
    target = target[key];
  }
  return target;
}

function matchesType(type, value) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((name) => {
    switch (name) {
      case "object":
        return isPlainObject(value);
      case "array":
        return Array.isArray(value);
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "integer":
        return Number.isInteger(value);
      case "boolean":
        return typeof value === "boolean";
      case "null":
        return value === null;
      default:
        throw new Error(`unknown JSON Schema type "${name}"`);
    }
  });
}

function describeTypes(type) {
  const types = [...new Set(Array.isArray(type) ? type : [type])];
  const withArticle = types.map((name) => (/^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`));
  return withArticle.join(" or ");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepEqual(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} Finding
 * @property {string} id    The check that produced it.
 * @property {string} path  Project-relative path with `/` separators.
 * @property {number} line  1-based line.
 * @property {string} message
 */

/**
 * @typedef {object} CheckResult
 * @property {Finding[]} findings
 * @property {string} summary  One line for people.
 * @property {object} [details] Extra machine-readable facts for --json.
 */

/**
 * Reads and parses a project JSON file. Returns findings instead of throwing for problems in the
 * file itself; `document` is null when there is no usable value.
 */
function readProjectJson(root, relativePath, checkId) {
  const absolute = path.join(root, ...relativePath.split("/"));
  let text;
  try {
    text = fs.readFileSync(absolute, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { document: null, findings: [], missing: true };
    if (error.code === "EISDIR") {
      return {
        document: null,
        findings: [
          { id: checkId, path: relativePath, line: 1, message: "is a directory, not a file" },
        ],
      };
    }
    throw error;
  }
  const parsed = parseJsonWithLines(text);
  if (!parsed.ok) {
    return {
      document: null,
      findings: [{ id: checkId, path: relativePath, line: parsed.line, message: parsed.message }],
    };
  }
  const findings = parsed.duplicates.map((duplicate) => ({
    id: checkId,
    path: relativePath,
    line: duplicate.line,
    message: `${displayPointer(duplicate.pointer)}duplicate key; JSON keeps only the last value`,
  }));
  return { document: { value: parsed.value, lines: parsed.lines }, findings };
}

function displayPointer(pointer) {
  return pointer === "" ? "" : `${pointer}: `;
}

function toFinding(error, document, relativePath, checkId) {
  return {
    id: checkId,
    path: relativePath,
    line: lineOf(document.lines, error.at),
    message: `${displayPointer(error.pointer)}${error.message}`,
  };
}

function schemaFindings(schema, document, relativePath, checkId) {
  return validateAgainstSchema(schema, document.value).map((error) =>
    toFinding(error, document, relativePath, checkId),
  );
}

function sortFindings(findings) {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) =>
      a.finding.path === b.finding.path
        ? a.finding.line - b.finding.line || a.index - b.index
        : a.finding.path < b.finding.path
          ? -1
          : 1,
    )
    .map(({ finding }) => finding);
}

/** Sub-checks of check-standard-config, each run on its own with `check-standard-config <name>`. */
export const STANDARD_CONFIG_SUB_CHECKS = Object.freeze({
  schema:
    "The manifest is schema-valid and names a track root for every detected Laravel, web or mobile manifest.",
});

/**
 * check-standard-config: validates .cross-stack/standard.json against the manifest schema and
 * checks that it covers every stack in the project (each detected Laravel, web or mobile manifest
 * has its track declared and its directory named as a track root), then checks what the schema
 * cannot express: canonical locale tags, compilable command patterns, a `$schema` URL of the
 * recorded version, and a version no newer than this tool. The `schema` sub-check runs only the
 * first two parts and labels its findings `check-standard-config:schema`.
 *
 * @param {{ root: string, subCheck?: string | null }} options
 * @returns {CheckResult}
 */
export function checkStandardConfig({ root, subCheck = null }) {
  if (subCheck !== null && !Object.hasOwn(STANDARD_CONFIG_SUB_CHECKS, subCheck)) {
    const known = Object.keys(STANDARD_CONFIG_SUB_CHECKS).join(", ");
    throw new UsageError(
      `check-standard-config: unknown sub-check "${subCheck}" (known: ${known})`,
    );
  }
  // A sub-check labels its findings `<check>:<sub-check>`, the gate id the rule registry names.
  const id = subCheck === null ? "check-standard-config" : `check-standard-config:${subCheck}`;
  const read = readProjectJson(root, MANIFEST_PATH, id);
  if (read.missing) {
    return {
      findings: [
        {
          id,
          path: MANIFEST_PATH,
          line: 1,
          message: "manifest not found; run /cross-stack-standard:adopt to create it",
        },
      ],
      summary: `${id}: ${MANIFEST_PATH} is missing`,
    };
  }
  const findings = [...read.findings];
  if (read.document) {
    const schemaErrors = validateAgainstSchema(GENERATED.standardSchema, read.document.value);
    findings.push(
      ...schemaErrors.map((error) => toFinding(error, read.document, MANIFEST_PATH, id)),
    );
    const invalid = new Set(schemaErrors.flatMap((error) => [error.pointer, error.at]));
    findings.push(...trackCoverageFindings(root, read.document, invalid, id));
    if (subCheck === null) findings.push(...manifestSemanticFindings(read.document, invalid, id));
  }
  const sorted = sortFindings(findings);
  return {
    findings: sorted,
    summary:
      sorted.length === 0
        ? `${id}: ${MANIFEST_PATH} is valid`
        : `${id}: ${plural(sorted.length, "problem")} in ${MANIFEST_PATH}`,
  };
}

/**
 * The directories a track's `trackRoots` entry names, normalised (`./a/` is `a`, the project root
 * is `.`); a track without an entry uses the project root.
 */
function trackRootDirs(manifest, track) {
  const roots = isPlainObject(manifest.trackRoots) ? manifest.trackRoots : {};
  const value = Object.hasOwn(roots, track) ? roots[track] : ".";
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.replace(/^(?:\.\/)+/, "").replace(/\/+$/, "") || ".");
}

/**
 * Coverage: every Laravel, web or mobile manifest that detection finds (see `detectTracks`) needs
 * its track in `tracks` and its directory named as a root of that track under `trackRoots`, so the
 * track's checks run where its code is. Fields that already failed the schema are skipped.
 */
function trackCoverageFindings(root, document, invalid, id) {
  const manifest = document.value;
  if (!isPlainObject(manifest) || invalid.has("") || invalid.has("/tracks")) return [];
  if (!Array.isArray(manifest.tracks)) return [];
  const findings = [];
  const add = (pointer, message) =>
    findings.push({ id, path: MANIFEST_PATH, line: lineOf(document.lines, pointer), message });
  const detection = detectTracks(root);
  for (const track of detection.tracks) {
    const sources = detection.sources[track];
    if (!manifest.tracks.includes(track)) {
      add(
        "/tracks",
        `/tracks: ${sources[0]} is a ${track} manifest, but "tracks" does not list "${track}"; ` +
          `add it and name the manifest's directory under trackRoots.${track}`,
      );
      continue;
    }
    const pointer = `/trackRoots/${track}`;
    if (invalid.has("/trackRoots") || invalid.has(pointer)) continue;
    const roots = trackRootDirs(manifest, track);
    for (const source of sources) {
      const dir = path.posix.dirname(source);
      if (roots.includes(dir)) continue;
      add(
        pointer,
        `${pointer}: ${source} is a ${track} manifest, but trackRoots.${track} does not name ` +
          `its directory "${dir}"; add it, so the ${track} checks run there`,
      );
    }
  }
  return findings;
}

/** Checks the schema cannot express. Fields that already failed the schema are skipped. */
function manifestSemanticFindings(document, invalid, id) {
  const manifest = document.value;
  if (!isPlainObject(manifest)) return [];
  const findings = [];
  const add = (pointer, message) => {
    if (invalid.has(pointer)) return;
    findings.push({
      id,
      path: MANIFEST_PATH,
      line: lineOf(document.lines, pointer),
      message: `${displayPointer(pointer)}${message}`,
    });
  };

  if (Array.isArray(manifest.locales)) {
    manifest.locales.forEach((tag, index) => {
      if (typeof tag !== "string") return;
      let canonical;
      try {
        [canonical] = Intl.getCanonicalLocales(tag);
      } catch {
        add(`/locales/${index}`, `"${tag}" is not a valid BCP 47 language tag`);
        return;
      }
      if (canonical !== tag)
        add(`/locales/${index}`, `"${tag}" is not canonical; use "${canonical}"`);
    });
  }

  const commands = manifest.hooks?.preToolUse?.protectCommands;
  if (Array.isArray(commands)) {
    commands.forEach((pattern, index) => {
      if (typeof pattern !== "string") return;
      try {
        new RegExp(pattern, "u");
      } catch (error) {
        add(
          `/hooks/preToolUse/protectCommands/${index}`,
          `is not a valid regular expression: ${error.message}`,
        );
      }
    });
  }

  if (typeof manifest.version === "string" && !invalid.has("/version")) {
    // An older manifest is normal (fixtures, a pending upgrade); a newer one means the kit copy in
    // the project is stale or the version was edited by hand.
    if (compareVersions(manifest.version, GENERATED.version) > 0) {
      add(
        "/version",
        `the manifest records version ${manifest.version}, newer than this tool (${GENERATED.version}); ` +
          "run /cross-stack-standard:upgrade to bring the kit up to that version",
      );
    }
    const schemaVersion =
      typeof manifest.$schema === "string" ? /\/v([^/]+)\/plugins\//.exec(manifest.$schema) : null;
    if (schemaVersion && schemaVersion[1] !== manifest.version) {
      add(
        "/$schema",
        `points at the v${schemaVersion[1]} schema but "version" is ${manifest.version}`,
      );
    }
  }
  return findings;
}

/**
 * Compares two SemVer versions by precedence (build metadata ignored).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative when a < b, 0 when equal, positive when a > b.
 */
export function compareVersions(a, b) {
  const parse = (version) => {
    const [core, prerelease] = version.split("+")[0].split(/-(.*)/s);
    return {
      core: core.split(".").map(Number),
      prerelease: prerelease ? prerelease.split(".") : [],
    };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return right.prerelease.length - left.prerelease.length;
  }
  const numeric = /^[0-9]+$/;
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i += 1) {
    const x = left.prerelease[i];
    const y = right.prerelease[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    if (numeric.test(x) && numeric.test(y)) return Number(x) - Number(y);
    if (numeric.test(x) !== numeric.test(y)) return numeric.test(x) ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Today's date in UTC as YYYY-MM-DD.
 *
 * @returns {string}
 */
export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function isCalendarDate(text) {
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Reads `allowlistMaxDays` from the manifest when it is usable; the default otherwise. */
function allowlistMaxDaysOf(root) {
  const absolute = path.join(root, ...MANIFEST_PATH.split("/"));
  try {
    const parsed = parseJsonWithLines(fs.readFileSync(absolute, "utf8"));
    const configured =
      parsed.ok && isPlainObject(parsed.value) ? parsed.value.allowlistMaxDays : undefined;
    if (
      configured !== undefined &&
      validateAgainstSchema(GENERATED.standardSchema.properties.allowlistMaxDays, configured)
        .length === 0
    ) {
      return configured;
    }
  } catch {
    // A missing or unreadable manifest is check-standard-config's finding, not this check's.
  }
  return DEFAULT_ALLOWLIST_MAX_DAYS;
}

/**
 * A calendar date plus a number of days, as YYYY-MM-DD (UTC).
 *
 * @param {string} date YYYY-MM-DD
 * @param {number} days
 * @returns {string}
 */
function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Reads `allowlistsDir` from the manifest when it is usable; the default otherwise. */
function allowlistsDirOf(root) {
  const absolute = path.join(root, ...MANIFEST_PATH.split("/"));
  try {
    const parsed = parseJsonWithLines(fs.readFileSync(absolute, "utf8"));
    const configured =
      parsed.ok && isPlainObject(parsed.value) ? parsed.value.allowlistsDir : undefined;
    if (
      typeof configured === "string" &&
      validateAgainstSchema(GENERATED.standardSchema.properties.allowlistsDir, configured)
        .length === 0
    ) {
      return configured.replace(/\/+$/, "");
    }
  } catch {
    // A missing or unreadable manifest is check-standard-config's finding, not this check's.
  }
  return DEFAULT_ALLOWLISTS_DIR;
}

/**
 * check-allowlists: validates every <allowlistsDir>/*.json against the allowlist schema, requires
 * the file name to be exactly `<RULE-ID>.json` (a regular file: a symbolic link or an upper-case
 * extension is a finding, because a gate that opens the canonical name could read it anyway), and
 * fails on expired entries (an entry is valid through its `expires` date, in UTC), on an expiry
 * date further ahead than `allowlistMaxDays` (default 365), and on duplicate `match` values.
 *
 * @param {{ root: string, today?: string }} options `today` (YYYY-MM-DD) defaults to the UTC date.
 * @returns {CheckResult}
 */
export function checkAllowlists({ root, today = todayUtc() }) {
  const id = "check-allowlists";
  const dir = allowlistsDirOf(root);
  const absoluteDir = path.join(root, ...dir.split("/"));
  const maxDays = allowlistMaxDaysOf(root);
  const horizon = addDays(today, maxDays);
  const findings = [];
  let names = [];
  try {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (!/\.json$/i.test(entry.name)) continue;
      const relativePath = `${dir}/${entry.name}`;
      const problem = (message) => findings.push({ id, path: relativePath, line: 1, message });
      if (entry.isSymbolicLink()) {
        problem(`${entry.name} is a symbolic link; an allowlist must be a regular file in ${dir}`);
        continue;
      }
      if (!entry.isFile()) {
        problem(`${entry.name} is not a regular file`);
        continue;
      }
      if (!entry.name.endsWith(".json")) {
        problem(`the file name must end in a lower-case .json, not ${entry.name}`);
        continue;
      }
      names.push(entry.name);
    }
    names = names.sort();
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
  }

  let entryCount = 0;
  let expiredCount = 0;
  for (const name of names) {
    const relativePath = `${dir}/${name}`;
    const read = readProjectJson(root, relativePath, id);
    findings.push(...read.findings);
    if (!read.document) continue;
    const add = (pointer, message) =>
      findings.push({
        id,
        path: relativePath,
        line: lineOf(read.document.lines, pointer),
        message: `${displayPointer(pointer)}${message}`,
      });

    findings.push(...schemaFindings(GENERATED.allowlistSchema, read.document, relativePath, id));
    const allowlist = read.document.value;
    if (!isPlainObject(allowlist)) continue;

    const expectedRule = name.slice(0, -".json".length);
    if (!RULE_ID.test(expectedRule)) {
      add(
        "",
        `the file name must be <RULE-ID>.json (a track prefix and three digits), not ${name}`,
      );
    } else if (typeof allowlist.rule === "string" && allowlist.rule !== expectedRule) {
      add("/rule", `is "${allowlist.rule}" but the file is named ${name}`);
    }

    if (!Array.isArray(allowlist.entries)) continue;
    const seenMatches = new Map();
    allowlist.entries.forEach((entry, index) => {
      entryCount += 1;
      if (!isPlainObject(entry)) return;
      const pointer = `/entries/${index}`;
      if (typeof entry.match === "string" && entry.match !== "") {
        if (seenMatches.has(entry.match)) {
          add(`${pointer}/match`, `repeats the match of entry ${seenMatches.get(entry.match)}`);
        } else {
          seenMatches.set(entry.match, index);
        }
      }
      if (typeof entry.expires !== "string" || !ISO_DATE.test(entry.expires)) return;
      if (!isCalendarDate(entry.expires)) {
        add(`${pointer}/expires`, `"${entry.expires}" is not a calendar date`);
      } else if (entry.expires < today) {
        expiredCount += 1;
        add(
          `${pointer}/expires`,
          `entry for ${JSON.stringify(entry.match)} expired on ${entry.expires} (today is ${today}); ` +
            "fix the code and remove the entry, or renew it with a current reason",
        );
      } else if (entry.expires > horizon) {
        add(
          `${pointer}/expires`,
          `"${entry.expires}" is more than ${maxDays} days after today (${today}); set a date ` +
            `no later than ${horizon} and renew the entry with a current reason when it comes`,
        );
      }
    });
  }

  const sorted = sortFindings(findings);
  const scope = `${plural(names.length, "file")}, ${plural(entryCount, "entry", "entries")} in ${dir}`;
  return {
    findings: sorted,
    summary:
      sorted.length === 0
        ? `${id}: ${scope}; all valid`
        : `${id}: ${plural(sorted.length, "problem")} (${scope})`,
    details: {
      directory: dir,
      files: names.length,
      entries: entryCount,
      expired: expiredCount,
      today,
      maxDays,
    },
  };
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// ---------------------------------------------------------------------------------------------
// Track detection
// ---------------------------------------------------------------------------------------------
//
// The same heuristics as the plugin's SessionStart detector, reimplemented here because this file
// must run on its own inside a project, where the plugin's scripts are not available.

/** Tracks, in the order the manifest schema lists them. */
export const TRACKS = Object.freeze(["laravel", "web", "mobile"]);

/** Directory names the detection walk never enters. Names starting with a dot are skipped too. */
export const DETECT_PRUNED_DIRS = Object.freeze([
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

/**
 * Bounds of the detection walk. Depth, directory and entry caps match the SessionStart detector;
 * the time cap is larger because this runs on request, not at the start of every session.
 */
export const DETECT_LIMITS = Object.freeze({
  /** Deepest directory level scanned; the root is level 0. */
  maxDepth: 4,
  /** Directories read at most. */
  maxDirs: 2_000,
  /** Directory entries examined at most, in total (a safety net). */
  maxEntries: 100_000,
  /** Entries examined in any one directory; a huge flat directory cannot end the whole walk. */
  maxEntriesPerDir: 5_000,
  /** Elapsed time allowed, in milliseconds. */
  timeMs: 2_000,
  /** Largest manifest file parsed, in bytes. */
  maxManifestBytes: 1024 * 1024,
});

const DETECT_PRUNED = new Set(DETECT_PRUNED_DIRS);
const MOBILE_PACKAGES = ["expo", "expo-router", "react-native"];
const WEB_PACKAGES = ["next", "react"];
const DEPENDENCY_BLOCKS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function hasAnyPackage(blocks, names) {
  return blocks.some((block) => names.some((name) => Object.hasOwn(block, name)));
}

/**
 * The track a parsed `package.json` indicates: `mobile` when any dependency block names `expo`,
 * `expo-router` or `react-native` (every Expo app also depends on React, so it is not counted as
 * web), otherwise `web` when one names `next` or `react`, otherwise null.
 *
 * @param {unknown} pkg
 * @returns {"mobile" | "web" | null}
 */
export function trackFromPackageJson(pkg) {
  if (!isPlainObject(pkg)) return null;
  const blocks = DEPENDENCY_BLOCKS.map((name) => pkg[name]).filter(isPlainObject);
  if (hasAnyPackage(blocks, MOBILE_PACKAGES)) return "mobile";
  if (hasAnyPackage(blocks, WEB_PACKAGES)) return "web";
  return null;
}

/**
 * The track a parsed `composer.json` indicates: `laravel` when `require` or `require-dev` names
 * `laravel/framework`, otherwise null.
 *
 * @param {unknown} composer
 * @returns {"laravel" | null}
 */
export function trackFromComposerJson(composer) {
  if (!isPlainObject(composer)) return null;
  const blocks = [composer.require, composer["require-dev"]].filter(isPlainObject);
  return hasAnyPackage(blocks, ["laravel/framework"]) ? "laravel" : null;
}

function usesNext(pkg) {
  const blocks = DEPENDENCY_BLOCKS.map((name) => pkg[name]).filter(isPlainObject);
  return hasAnyPackage(blocks, ["next"]);
}

/** Reads a small file as UTF-8; null when it is missing, unreadable or larger than `maxBytes`. */
function readSmallText(file, maxBytes) {
  try {
    if (fs.statSync(file).size > maxBytes) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function relativeToRoot(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

/**
 * @typedef {object} Detection
 * @property {string[]} tracks  Detected tracks, in schema order.
 * @property {Record<string, string[]>} sources  Root-relative manifest paths per track (`/`).
 * @property {"next" | "react-spa" | null} webProfile  `next` when a web package depends on Next.js,
 *   `react-spa` when web was found without it, null without a web track.
 * @property {null | "dirs" | "entries" | "time"} truncated  Why the walk stopped early, if it did.
 * @property {number} dirs  Directories read.
 * @property {number} entries  Directory entries examined.
 */

/**
 * Walks the project breadth-first and reports every track it finds, so a Laravel API next to a
 * Next.js app reports both. Directories in {@link DETECT_PRUNED_DIRS}, directories whose name
 * starts with a dot and symbolic links are not entered; the walk stops at the caps in
 * {@link DETECT_LIMITS} and says why.
 *
 * @param {string} root  Absolute project directory.
 * @param {Partial<typeof DETECT_LIMITS>} [limits]
 * @param {() => number} [now]  Clock in milliseconds (tests pass their own).
 * @returns {Detection}
 */
export function detectTracks(root, limits = {}, now = () => Date.now()) {
  const bounds = { ...DETECT_LIMITS, ...limits };
  const started = now();
  /** @type {Record<string, string[]>} */
  const sources = Object.fromEntries(TRACKS.map((track) => [track, []]));
  let nextFound = false;
  let dirs = 0;
  let entries = 0;
  let truncated = null;
  const queue = [{ dir: root, depth: 0 }];

  walk: for (let head = 0; head < queue.length; head += 1) {
    if (dirs >= bounds.maxDirs) {
      truncated = "dirs";
      break;
    }
    if (now() - started > bounds.timeMs) {
      truncated = "time";
      break;
    }
    const { dir, depth } = queue[head];
    let listing;
    try {
      listing = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    listing.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (listing.length > bounds.maxEntriesPerDir)
      listing = listing.slice(0, bounds.maxEntriesPerDir);
    dirs += 1;
    for (const entry of listing) {
      entries += 1;
      if (entries > bounds.maxEntries) {
        truncated = "entries";
        break walk;
      }
      const { name } = entry;
      if (entry.isDirectory()) {
        if (depth < bounds.maxDepth && !DETECT_PRUNED.has(name) && !name.startsWith(".")) {
          queue.push({ dir: path.join(dir, name), depth: depth + 1 });
        }
        continue;
      }
      if ((name !== "composer.json" && name !== "package.json") || !entry.isFile()) continue;
      const file = path.join(dir, name);
      const text = readSmallText(file, bounds.maxManifestBytes);
      if (text === null) continue;
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      const track =
        name === "composer.json" ? trackFromComposerJson(parsed) : trackFromPackageJson(parsed);
      if (track === null) continue;
      sources[track].push(relativeToRoot(root, file));
      if (track === "web" && usesNext(parsed)) nextFound = true;
    }
  }

  const tracks = TRACKS.filter((track) => sources[track].length > 0);
  const webProfile = !tracks.includes("web") ? null : nextFound ? "next" : "react-spa";
  return { tracks, sources, webProfile, truncated, dirs, entries };
}

/**
 * Tracks a manifest declares, read without the schema (null when the manifest is missing, is not
 * JSON or declares no known track). check-standard-config reports what is wrong with it.
 *
 * @param {string} root
 * @returns {string[] | null}
 */
function declaredTracks(root) {
  const text = readSmallText(path.join(root, ...MANIFEST_PATH.split("/")), 1024 * 1024);
  if (text === null) return null;
  const parsed = parseJsonWithLines(text);
  if (!parsed.ok || !isPlainObject(parsed.value) || !Array.isArray(parsed.value.tracks)) {
    return null;
  }
  const tracks = TRACKS.filter((track) => parsed.value.tracks.includes(track));
  return tracks.length > 0 ? tracks : null;
}

/**
 * The `detect` command: tracks found in the project files, and those the manifest declares.
 *
 * @param {{ root: string }} options
 * @returns {object} The JSON report.
 */
export function detectReport({ root }) {
  const detection = detectTracks(root);
  return {
    tool: "cross-stack-standard",
    version: GENERATED.version,
    command: "detect",
    tracks: detection.tracks,
    sources: detection.sources,
    webProfile: detection.webProfile,
    truncated: detection.truncated,
    manifest: { path: MANIFEST_PATH, tracks: declaredTracks(root) },
  };
}

// ---------------------------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------------------------

/** Oldest Node.js release the kit supports. */
export const NODE_FLOOR = "22.13.0";

/** Claude Code release that added exec-form hook `args`, which every hook of the plugin uses. */
export const CLAUDE_EXEC_FORM_HOOKS = "2.1.139";

/** Oldest PHP release Laravel 13 installs on. */
export const LARAVEL_PHP_FLOOR = "8.3.0";

/** Markers of the managed block in CLAUDE.md. */
export const BLOCK_BEGIN = "<!-- cross-stack-standard:begin -->";
export const BLOCK_END = "<!-- cross-stack-standard:end -->";

/** The managed block, with any AGENTS.md that CLAUDE.md imports, stays under this many lines. */
export const CONTEXT_BUDGET_LINES = 200;

/** The plugin's install id and its marketplace name. */
export const PLUGIN_ID = "cross-stack-standard@cross-stack-standard";
export const MARKETPLACE_NAME = "cross-stack-standard";

/** Environment variable that turns every hook of the plugin off. */
export const OPT_OUT_ENV = "CROSS_STACK_STANDARD_DISABLE";

/** Memory files searched for the opt-out line, relative to each searched directory. */
export const MEMORY_FILES = Object.freeze(["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]);

/** Where lefthook looks for its configuration. */
export const LEFTHOOK_CONFIGS = Object.freeze(
  ["", ".", ".config/"].flatMap((prefix) =>
    ["yml", "yaml", "toml", "json", "jsonc"].map((ext) =>
      prefix === "." ? `.lefthook.${ext}` : `${prefix}lefthook.${ext}`,
    ),
  ),
);

/** Candidate files for the managed block, in the order they are searched. */
const BLOCK_HOSTS = ["CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md"];

const MAX_TEXT_BYTES = 1024 * 1024;
const TOOL_TIMEOUT_MS = 10_000;
const TOOL_ENV = Object.freeze({
  // Keep `claude --version` from starting update checks or other background traffic.
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_AUTOUPDATER: "1",
  NO_COLOR: "1",
});
const GIT_HOOK_NAMES = new Set([
  "applypatch-msg",
  "pre-applypatch",
  "post-applypatch",
  "pre-commit",
  "pre-merge-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "pre-rebase",
  "post-checkout",
  "post-merge",
  "pre-push",
  "post-rewrite",
]);
const TRUE_WORDS = new Set(["1", "true", "yes", "on"]);

/**
 * @typedef {object} ToolRun
 * @property {boolean} found  False when the program could not be started (not on PATH, or on
 *   Windows only as a .cmd/.bat shim, which Node.js does not start without a shell).
 * @property {number | null} status  Exit code; null when it timed out or was not found.
 * @property {string} stdout
 * @property {string} stderr
 */

/**
 * Starts a local program without a shell and captures its output (10 s limit).
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string }} options
 * @returns {ToolRun}
 */
export function runTool(command, args, { cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: TOOL_TIMEOUT_MS,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...TOOL_ENV },
  });
  if (result.error && result.error.code !== "ETIMEDOUT") {
    return { found: false, status: null, stdout: "", stderr: "" };
  }
  return {
    found: true,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** The first `major.minor.patch` in a text, or null. */
function firstVersion(text) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : null;
}

function firstLine(text) {
  return text.trim().split(/\r?\n/)[0] ?? "";
}

function countLines(text) {
  if (text === "") return 0;
  const lines = text.split(/\r\n|\n|\r/);
  return text.endsWith("\n") || text.endsWith("\r") ? lines.length - 1 : lines.length;
}

/** An opening or closing code fence (backticks or tildes, three or more). */
const FENCE = /^[\t >]*(`{3,}|~{3,})(.*)$/;

/**
 * Lines of Markdown with those inside fenced code blocks marked, so markers and imports shown as
 * examples in a code block do not count.
 *
 * @param {string} text
 * @returns {Array<{ text: string, number: number, fenced: boolean }>}
 */
function markdownLines(text) {
  let fence = null;
  return text.split(/\r\n|\n|\r/).map((line, index) => {
    const match = FENCE.exec(line);
    const entry = { text: line, number: index + 1, fenced: true };
    if (fence !== null) {
      if (
        match !== null &&
        match[1][0] === fence[0] &&
        match[1].length >= fence.length &&
        match[2].trim() === ""
      ) {
        fence = null;
      }
      return entry;
    }
    // A backtick fence's info string cannot contain a backtick; such a line is inline code.
    if (match !== null && !(match[1][0] === "`" && match[2].includes("`"))) {
      fence = match[1];
      return entry;
    }
    return { ...entry, fenced: false };
  });
}

// The opt-out line as the plugin's hooks read it: a whole line with optional indentation, quote,
// list or heading markers, the words with optional backticks or emphasis, any letter case and an
// optional final full stop. Kept in step with the hooks' opt-out guard, and like it matched by a
// hand-written scanner with no backtracking: a regular expression with several adjacent optional
// whitespace runs takes cubic time on a long line of spaces, and this tool must never stall.
const OPT_OUT_WORDS = "cross-stack-standard";
const MAX_OPT_OUT_LINE_CHARS = 512;
const OPT_OUT_WORDS_AT = /cross-stack-standard/iy;
const OPT_OUT_VALUE_AT = /declined/iy;
const OPT_OUT_RUN = Object.freeze({
  indent: /[\t >]*/y,
  space: /[\t ]*/y,
  wrap: /[`*_]*/y,
  hash: /#*/y,
  digits: /[0-9]*/y,
});

/** The index just past the run of `run` (a sticky single-class pattern) that starts at `index`. */
function skipRun(text, index, run) {
  run.lastIndex = index;
  run.test(text);
  return run.lastIndex;
}

/** The index just past `literal` (a sticky pattern) when it starts at `index`, else -1. */
function literalAt(text, index, literal) {
  literal.lastIndex = index;
  return literal.test(text) ? literal.lastIndex : -1;
}

/** Skips one list or heading marker followed by at least one space or tab, else returns `start`. */
function skipListMarker(text, start) {
  let position = start;
  const char = text[position];
  if (char === "#") {
    position = skipRun(text, position, OPT_OUT_RUN.hash);
    if (position - start > 6) return start;
  } else if (char === "-" || char === "*" || char === "+") {
    position += 1;
  } else {
    position = skipRun(text, position, OPT_OUT_RUN.digits);
    const digits = position - start;
    if (digits === 0 || digits > 9 || (text[position] !== "." && text[position] !== ")")) {
      return start;
    }
    position += 1;
  }
  const after = skipRun(text, position, OPT_OUT_RUN.space);
  return after > position ? after : start;
}

/**
 * Whether one line states the opt-out. Linear in the line's length.
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isOptOutLine(line) {
  if (line.length > MAX_OPT_OUT_LINE_CHARS) return false;
  if (line.toLowerCase().indexOf(OPT_OUT_WORDS) === -1) return false;
  let position = skipListMarker(line, skipRun(line, 0, OPT_OUT_RUN.indent));
  const wrapThenSpace = () => {
    position = skipRun(line, skipRun(line, position, OPT_OUT_RUN.wrap), OPT_OUT_RUN.space);
  };
  wrapThenSpace();
  position = literalAt(line, position, OPT_OUT_WORDS_AT);
  if (position === -1) return false;
  wrapThenSpace();
  if (line[position] !== ":") return false;
  position += 1;
  wrapThenSpace();
  position = literalAt(line, position, OPT_OUT_VALUE_AT);
  if (position === -1) return false;
  wrapThenSpace();
  if (line[position] === ".") position += 1;
  return skipRun(line, position, OPT_OUT_RUN.space) === line.length;
}

/**
 * The 1-based line of the first opt-out line outside fenced code blocks, or 0.
 *
 * @param {string} text Markdown.
 * @returns {number}
 */
export function findOptOutLine(text) {
  if (!/cross-stack-standard/i.test(text)) return 0;
  const line = markdownLines(text).find((entry) => !entry.fenced && isOptOutLine(entry.text));
  return line ? line.number : 0;
}

/**
 * Directories searched for the opt-out line: the working directory and each parent up to the
 * project root when the working directory is inside the project, otherwise the root alone.
 */
function optOutSearchDirs(root, cwd) {
  const relative = path.relative(root, path.resolve(cwd));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return [root];
  const dirs = [];
  let current = path.resolve(cwd);
  for (;;) {
    dirs.push(current);
    if (current === root) return dirs;
    const parent = path.dirname(current);
    if (parent === current) return dirs;
    current = parent;
  }
}

function readJsonQuietly(file) {
  const text = readSmallText(file, MAX_TEXT_BYTES);
  if (text === null) return null;
  const parsed = parseJsonWithLines(text);
  return parsed.ok ? parsed.value : null;
}

/**
 * @typedef {object} DoctorCheck
 * @property {string} id
 * @property {"ok" | "warn" | "fail" | "skip"} status
 * @property {string} message
 * @property {string} [rule]  The registry rule this diagnostic relates to.
 */

function checkNode(nodeVersion) {
  const version = firstVersion(nodeVersion);
  if (version !== null && compareVersions(version, NODE_FLOOR) >= 0) {
    return {
      id: "node",
      status: "ok",
      message: `Node.js ${version} (the kit needs ${NODE_FLOOR} or later)`,
    };
  }
  return {
    id: "node",
    status: "fail",
    message: `Node.js ${version ?? nodeVersion} is older than ${NODE_FLOOR}, the oldest release the kit supports`,
  };
}

function checkGit(exec, root) {
  const run = exec("git", ["--version"], { cwd: root });
  if (!run.found || run.status !== 0) {
    return {
      id: "git",
      status: "fail",
      message:
        "git is not on PATH; the Standard's commit hooks need it, and without it the Stop hook " +
        "detects changes with a slower file walk",
    };
  }
  return { id: "git", status: "ok", message: firstLine(run.stdout) };
}

function checkClaude(exec, root) {
  const run = exec("claude", ["--version"], { cwd: root });
  if (!run.found) {
    return {
      id: "claude",
      status: "skip",
      message:
        "the Claude Code CLI was not found on PATH (on Windows a .cmd shim is not started); " +
        "the project's checks do not need it",
    };
  }
  const version = run.status === 0 ? firstVersion(run.stdout) : null;
  if (version === null) {
    return {
      id: "claude",
      status: "warn",
      message: "`claude --version` did not report a version",
    };
  }
  if (compareVersions(version, CLAUDE_EXEC_FORM_HOOKS) < 0) {
    return {
      id: "claude",
      status: "warn",
      message:
        `Claude Code ${version}: the plugin's hooks use exec-form "args", added in ` +
        `${CLAUDE_EXEC_FORM_HOOKS}; update Claude Code`,
    };
  }
  return {
    id: "claude",
    status: "ok",
    message: `Claude Code ${version} (a minimum supported version is not documented yet)`,
  };
}

function checkManifest(root) {
  const result = checkStandardConfig({ root });
  if (result.findings.length === 0) {
    return { id: "manifest", status: "ok", message: result.summary, rule: "PROC-001" };
  }
  const shown = result.findings.slice(0, 3).map((finding) => formatFinding(finding));
  const more = result.findings.length > 3 ? ` (+${result.findings.length - 3} more)` : "";
  return {
    id: "manifest",
    status: "fail",
    message: `${shown.join("; ")}${more}`,
    rule: "PROC-001",
  };
}

function checkOptOut(root, env, cwd) {
  const id = "opt-out";
  const switchValue = String(env[OPT_OUT_ENV] ?? "");
  if (TRUE_WORDS.has(switchValue.trim().toLowerCase())) {
    return {
      id,
      status: "warn",
      message: `the hooks are off: ${OPT_OUT_ENV} is set in the environment`,
    };
  }
  const manifest = readJsonQuietly(path.join(root, ...MANIFEST_PATH.split("/")));
  if (isPlainObject(manifest) && manifest.disabled === true) {
    return {
      id,
      status: "warn",
      message: `the hooks are off: "disabled": true in ${MANIFEST_PATH}`,
    };
  }
  for (const dir of optOutSearchDirs(root, cwd)) {
    for (const name of MEMORY_FILES) {
      const file = path.join(dir, ...name.split("/"));
      const text = readSmallText(file, MAX_TEXT_BYTES);
      if (text === null) continue;
      const line = findOptOutLine(text);
      if (line > 0) {
        return {
          id,
          status: "warn",
          message: `the hooks are off: ${relativeToRoot(root, file)}:${line} holds the opt-out line`,
        };
      }
    }
  }
  for (const name of [".claude/settings.local.json", ".claude/settings.json"]) {
    const settings = readJsonQuietly(path.join(root, ...name.split("/")));
    if (isPlainObject(settings?.enabledPlugins) && settings.enabledPlugins[PLUGIN_ID] === false) {
      return {
        id,
        status: "warn",
        message: `the plugin is off: ${name} sets "${PLUGIN_ID}" to false under enabledPlugins`,
      };
    }
  }
  return { id, status: "ok", message: "not opted out; the hooks run" };
}

/** Finds the managed block: its host file and line range, or a problem. */
function findManagedBlock(root) {
  for (const host of BLOCK_HOSTS) {
    const text = readSmallText(path.join(root, ...host.split("/")), MAX_TEXT_BYTES);
    if (text === null) continue;
    const lines = markdownLines(text).filter((line) => !line.fenced);
    const begins = lines.filter((line) => line.text.trim() === BLOCK_BEGIN);
    const ends = lines.filter((line) => line.text.trim() === BLOCK_END);
    if (begins.length === 0 && ends.length === 0) continue;
    if (begins.length !== 1 || ends.length !== 1 || ends[0].number < begins[0].number) {
      return {
        host,
        text,
        problem: `${host} must hold exactly one begin marker followed by one end marker`,
      };
    }
    return { host, text, begin: begins[0].number, end: ends[0].number };
  }
  return null;
}

/** AGENTS.md files a memory file imports with an `@path` line, relative to the root. */
function importedAgentsFiles(root, host, text) {
  const hostDir = path.dirname(path.join(root, ...host.split("/")));
  const found = new Set();
  for (const line of markdownLines(text)) {
    if (line.fenced) continue;
    const match = /^@(\S+)$/.exec(line.text.trim());
    if (!match || match[1].startsWith("~") || path.posix.basename(match[1]) !== "AGENTS.md") {
      continue;
    }
    const target = path.resolve(hostDir, match[1]);
    const relative = relativeToRoot(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    found.add(relative);
  }
  return [...found];
}

function checkContextBudget(root) {
  const id = "context-budget";
  const rule = "PROC-029";
  const block = findManagedBlock(root);
  if (block === null) {
    return {
      id,
      status: "fail",
      message:
        "no managed block (the cross-stack-standard begin and end markers) in CLAUDE.md; " +
        "run /cross-stack-standard:adopt",
      rule,
    };
  }
  if (block.problem) return { id, status: "fail", message: block.problem, rule };

  const blockLines = block.end - block.begin + 1;
  const parts = [`${block.host} block ${blockLines}`];
  let total = blockLines;
  const importers = ["CLAUDE.md", ".claude/CLAUDE.md"];
  const imported = new Set();
  for (const importer of importers) {
    const text =
      importer === block.host
        ? block.text
        : readSmallText(path.join(root, ...importer.split("/")), MAX_TEXT_BYTES);
    if (text === null) continue;
    for (const file of importedAgentsFiles(root, importer, text)) imported.add(file);
  }
  for (const file of [...imported].sort()) {
    const text = readSmallText(path.join(root, ...file.split("/")), MAX_TEXT_BYTES);
    if (text === null) continue;
    const lines = countLines(text);
    if (file === block.host) {
      // The block lives in the imported AGENTS.md: the whole file is loaded, block included.
      total = lines;
      parts[0] = `${file} (with the block) ${lines}`;
    } else {
      total += lines;
      parts.push(`imported ${file} ${lines}`);
    }
  }
  const detail = `${parts.join(" + ")} = ${plural(total, "line")}`;
  if (total >= CONTEXT_BUDGET_LINES) {
    return {
      id,
      status: "fail",
      message: `${detail}; keep it under ${CONTEXT_BUDGET_LINES} and move detail into .claude/rules/`,
      rule,
    };
  }
  return { id, status: "ok", message: `${detail} (under ${CONTEXT_BUDGET_LINES})`, rule };
}

function checkRulesFiles(root, tracks) {
  const id = "rules-files";
  if (tracks.length === 0) {
    return { id, status: "skip", message: "no track declared or detected" };
  }
  const missing = tracks.filter((track) => {
    try {
      return !fs.statSync(path.join(root, ".claude", "rules", `${track}.md`)).isFile();
    } catch {
      return true;
    }
  });
  if (missing.length > 0) {
    const files = missing.map((track) => `.claude/rules/${track}.md`).join(", ");
    return {
      id,
      status: "fail",
      message: `missing ${files}; run /cross-stack-standard:adopt to copy the path-scoped rules`,
    };
  }
  const files = tracks.map((track) => `.claude/rules/${track}.md`).join(", ");
  return { id, status: "ok", message: `${files} present` };
}

function checkPluginEnabled(root) {
  const id = "plugin-enabled";
  const rule = "PROC-004";
  const settings = readJsonQuietly(path.join(root, ".claude", "settings.json"));
  const marketplace =
    isPlainObject(settings?.extraKnownMarketplaces) &&
    isPlainObject(settings.extraKnownMarketplaces[MARKETPLACE_NAME]);
  const enabled =
    isPlainObject(settings?.enabledPlugins) && settings.enabledPlugins[PLUGIN_ID] === true;
  if (marketplace && enabled) {
    return {
      id,
      status: "ok",
      message: `.claude/settings.json registers the marketplace and enables ${PLUGIN_ID}`,
      rule,
    };
  }
  const missing = [
    ...(marketplace ? [] : [`extraKnownMarketplaces.${MARKETPLACE_NAME}`]),
    ...(enabled ? [] : [`enabledPlugins["${PLUGIN_ID}"]: true`]),
  ];
  return {
    id,
    status: "warn",
    message: `.claude/settings.json lacks ${missing.join(" and ")}, so contributors do not all load the plugin`,
    rule,
  };
}

/** Git hook names a lefthook configuration defines (a light reading of its top-level keys). */
function lefthookHookNames(file, text) {
  const names = new Set();
  if (/\.jsonc?$/.test(file)) {
    const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
    try {
      const parsed = JSON.parse(withoutComments);
      if (isPlainObject(parsed)) for (const key of Object.keys(parsed)) names.add(key);
    } catch {
      // Unreadable: fall back to the default below.
    }
  } else if (file.endsWith(".toml")) {
    for (const match of text.matchAll(/^\[([a-z-]+)\]\s*$/gm)) names.add(match[1]);
  } else {
    for (const match of text.matchAll(/^([a-z][a-z-]*)\s*:/gm)) names.add(match[1]);
  }
  const hooks = [...names].filter((name) => GIT_HOOK_NAMES.has(name)).sort();
  return hooks.length > 0 ? hooks : ["pre-commit"];
}

function checkPreCommit(root, exec, gitFound) {
  const id = "pre-commit";
  const rule = "CI-015";
  const config = LEFTHOOK_CONFIGS.find((name) => {
    try {
      return fs.statSync(path.join(root, ...name.split("/"))).isFile();
    } catch {
      return false;
    }
  });
  if (config === undefined) {
    return { id, status: "skip", message: "no lefthook configuration in the project root", rule };
  }
  const hooks = lefthookHookNames(
    config,
    readSmallText(path.join(root, ...config.split("/")), MAX_TEXT_BYTES) ?? "",
  );

  let hooksDir = null;
  let hooksPathSetting = "";
  if (gitFound) {
    const inside = exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root });
    if (inside.status !== 0 || inside.stdout.trim() !== "true") {
      return {
        id,
        status: "warn",
        message: `${config} is present but the project is not a git work tree, so no hooks can be installed`,
        rule,
      };
    }
    const gitPath = exec("git", ["rev-parse", "--git-path", "hooks"], { cwd: root });
    if (gitPath.status === 0 && gitPath.stdout.trim() !== "") {
      hooksDir = path.resolve(root, gitPath.stdout.trim());
    }
    const setting = exec("git", ["config", "--get", "core.hooksPath"], { cwd: root });
    if (setting.status === 0) hooksPathSetting = setting.stdout.trim();
  }
  if (hooksDir === null) hooksDir = path.join(root, ".git", "hooks");

  const missing = hooks.filter((hook) => {
    const text = readSmallText(path.join(hooksDir, hook), MAX_TEXT_BYTES);
    return text === null || !/lefthook/i.test(text);
  });
  if (missing.length > 0) {
    return {
      id,
      status: "fail",
      message:
        `${config} defines ${hooks.join(", ")} but lefthook has not installed ` +
        `${missing.join(", ")}; run lefthook install in the project`,
      rule,
    };
  }
  if (hooksPathSetting !== "") {
    return {
      id,
      status: "warn",
      message: `lefthook hooks are installed, but core.hooksPath is set (${hooksPathSetting}); the Standard expects it unset`,
      rule,
    };
  }
  return {
    id,
    status: "ok",
    message: `lefthook installed ${hooks.join(", ")} from ${config}`,
    rule,
  };
}

function checkPhp(exec, root, tracks) {
  if (!tracks.includes("laravel")) {
    return { id: "php", status: "skip", message: "no laravel track" };
  }
  const run = exec("php", ["--version"], { cwd: root });
  const version = run.found && run.status === 0 ? firstVersion(run.stdout) : null;
  if (version === null) {
    return { id: "php", status: "warn", message: "php is not on PATH; the laravel track needs it" };
  }
  if (compareVersions(version, LARAVEL_PHP_FLOOR) < 0) {
    return {
      id: "php",
      status: "warn",
      message: `PHP ${version} is older than ${LARAVEL_PHP_FLOOR}, which Laravel 13 needs`,
    };
  }
  return { id: "php", status: "ok", message: `PHP ${version}` };
}

function checkComposer(exec, root, tracks) {
  if (!tracks.includes("laravel")) {
    return { id: "composer", status: "skip", message: "no laravel track" };
  }
  const run = exec("composer", ["--version"], { cwd: root });
  const version = run.found && run.status === 0 ? firstVersion(run.stdout) : null;
  if (version === null) {
    return {
      id: "composer",
      status: "warn",
      message: "composer is not on PATH (or only as a .bat shim); the laravel track needs it",
    };
  }
  return { id: "composer", status: "ok", message: `Composer ${version}` };
}

/**
 * @typedef {object} DoctorReport
 * @property {boolean} ok  False when any check failed; warnings do not fail.
 * @property {DoctorCheck[]} checks
 * @property {string} summary
 */

/**
 * Runs every doctor check. Offline: it reads project files and starts local programs only to read
 * their versions.
 *
 * @param {object} options
 * @param {string} options.root  Absolute project directory.
 * @param {Record<string, string | undefined>} [options.env]  Environment for the opt-out check.
 * @param {string} [options.nodeVersion]  Node.js version to judge (default: the running one).
 * @param {typeof runTool} [options.exec]  Starts a program (tests pass a fake).
 * @param {string} [options.cwd]  Working directory, for the opt-out search.
 * @returns {DoctorReport}
 */
export function runDoctor({
  root,
  env = process.env,
  nodeVersion = process.versions.node,
  exec = runTool,
  cwd = process.cwd(),
}) {
  const git = checkGit(exec, root);
  const manifest = checkManifest(root);
  const tracks = declaredTracks(root) ?? detectTracks(root).tracks;
  const checks = [
    checkNode(nodeVersion),
    git,
    checkClaude(exec, root),
    manifest,
    checkOptOut(root, env, cwd),
    checkContextBudget(root),
    checkRulesFiles(root, tracks),
    checkPluginEnabled(root),
    checkPreCommit(root, exec, git.status === "ok"),
    checkPhp(exec, root, tracks),
    checkComposer(exec, root, tracks),
  ];
  const count = (status) => checks.filter((check) => check.status === status).length;
  const failed = count("fail");
  const summary =
    `doctor: ${failed} failed, ${plural(count("warn"), "warning")}, ` +
    `${count("ok")} passed, ${count("skip")} skipped`;
  return { ok: failed === 0, checks, summary };
}

/**
 * Formats a doctor report for people: one check per line, then the summary.
 *
 * @param {DoctorReport} report
 * @returns {string}
 */
export function formatDoctor(report) {
  const width = Math.max(...report.checks.map((check) => check.id.length)) + 2;
  const lines = report.checks.map((check) => {
    const rule = check.rule ? ` [${check.rule}]` : "";
    return `${check.status.padEnd(6)}${check.id.padEnd(width)}${check.message}${rule}`;
  });
  return [`cross-stack-standard ${GENERATED.version} doctor`, ...lines, report.summary].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

const INVOCATION = "node .cross-stack/bin/cross-stack.mjs";
const ROOT_HELP =
  "  --root <dir>    Project root (default: the project that contains .cross-stack/bin/).";
const JSON_HELP = "  --json          Print a machine-readable report on stdout.";
const TODAY_HELP = "  --today <date>  Treat <date> (YYYY-MM-DD, UTC) as today.";

/**
 * @typedef {object} Command
 * @property {string} name
 * @property {"check"|"info"|"report"} kind  Checks print findings and exit 1 when they find
 *   problems; info commands print text and exit 0; reports (doctor) print their own text or JSON
 *   and exit 1 when an item failed. Only checks are listed by `list-checks`.
 * @property {string} summary
 * @property {Record<string, {type: "string"|"boolean"}>} options  node:util parseArgs options.
 * @property {string[]} help  Option lines for `help <command>`.
 * @property {string} [positionals]  Usage text for positional arguments (none when absent).
 * @property {Record<string, string>} [subChecks]  Sub-checks by name, with a summary each: a
 *   check runs one alone when it is named as a positional argument, and `list-checks` lists it as
 *   `<check>:<sub-check>`.
 * @property {(values: Record<string, unknown>, positionals: string[]) =>
 *   CheckResult|string|{ ok: boolean, text: string, json: object }} run
 */

/**
 * The command table. Checks are listed by `list-checks` and their names are the gate IDs that
 * the Standard's rule registry refers to. New checks are added here.
 *
 * @type {ReadonlyArray<Command>}
 */
export const COMMANDS = Object.freeze([
  {
    name: "check-standard-config",
    kind: "check",
    summary: `Validate ${MANIFEST_PATH}: the schema, every detected stack covered, and its values.`,
    options: { root: { type: "string" }, json: { type: "boolean" } },
    help: [ROOT_HELP, JSON_HELP],
    positionals: "[sub-check]",
    subChecks: STANDARD_CONFIG_SUB_CHECKS,
    run: (values, positionals) => {
      if (positionals.length > 1) {
        throw new UsageError("check-standard-config takes at most one sub-check");
      }
      return checkStandardConfig({
        root: resolveRoot(values.root),
        subCheck: positionals[0] ?? null,
      });
    },
  },
  {
    name: "check-allowlists",
    kind: "check",
    summary: "Validate the allowlist files; expired entries and entries without a reason fail.",
    options: { root: { type: "string" }, json: { type: "boolean" }, today: { type: "string" } },
    help: [ROOT_HELP, JSON_HELP, TODAY_HELP],
    run: (values) => {
      if (values.today !== undefined && !isCalendarDate(values.today)) {
        throw new UsageError(
          `--today must be a date in the form YYYY-MM-DD, got "${values.today}"`,
        );
      }
      return checkAllowlists({ root: resolveRoot(values.root), today: values.today });
    },
  },
  {
    name: "detect",
    kind: "info",
    summary:
      "Print the tracks found in the project files, and those the manifest declares, as JSON.",
    options: { root: { type: "string" } },
    help: [ROOT_HELP],
    run: (values) => JSON.stringify(detectReport({ root: resolveRoot(values.root) }), null, 2),
  },
  {
    name: "doctor",
    kind: "report",
    summary: "Check the environment and the project's adoption; exit 1 when an item fails.",
    options: { root: { type: "string" }, json: { type: "boolean" } },
    help: [ROOT_HELP, JSON_HELP],
    run: (values) => {
      const report = runDoctor({ root: resolveRoot(values.root) });
      return {
        ok: report.ok,
        text: formatDoctor(report),
        json: {
          tool: "cross-stack-standard",
          version: GENERATED.version,
          command: "doctor",
          ok: report.ok,
          checks: report.checks,
          summary: report.summary,
        },
      };
    },
  },
  {
    name: "list-checks",
    kind: "info",
    summary: "List the checks this tool runs.",
    options: { json: { type: "boolean" } },
    help: [JSON_HELP],
    run: (values) => listChecks(Boolean(values.json)),
  },
  {
    name: "help",
    kind: "info",
    summary: "Show help for the tool or for one command.",
    options: {},
    help: [],
    positionals: "[command]",
    run: (_values, positionals) => {
      if (positionals.length > 1) throw new UsageError("help takes at most one command name");
      if (positionals.length === 0) return usage();
      return usage(findCommand(positionals[0]));
    },
  },
]);

function findCommand(name) {
  const command = COMMANDS.find((entry) => entry.name === name);
  if (!command) throw new UsageError(`unknown command "${name}"; run "help" to list the commands`);
  return command;
}

/**
 * The `list-checks` output: one check per line, id first. A check with sub-checks is followed by
 * one line per sub-check, `<check>:<sub-check>`, the gate id and discriminator the rule registry
 * names; `node .cross-stack/bin/cross-stack.mjs <check> <sub-check>` runs it alone.
 */
function listChecks(asJson) {
  const checks = COMMANDS.filter((entry) => entry.kind === "check").map((entry) => ({
    id: entry.name,
    summary: entry.summary,
    ...(entry.subChecks ? { subChecks: Object.keys(entry.subChecks) } : {}),
  }));
  if (asJson) {
    const report = { tool: "cross-stack-standard", version: GENERATED.version, checks };
    return JSON.stringify(report, null, 2);
  }
  const rows = COMMANDS.filter((entry) => entry.kind === "check").flatMap((entry) => [
    [entry.name, entry.summary],
    ...Object.entries(entry.subChecks ?? {}).map(([sub, summary]) => [
      `${entry.name}:${sub}`,
      summary,
    ]),
  ]);
  const width = Math.max(...rows.map(([id]) => id.length)) + 2;
  return rows.map(([id, summary]) => `${id.padEnd(width)}${summary}`).join("\n");
}

/**
 * Resolves the project root: `--root` when given, else the project whose .cross-stack/bin/ holds
 * this file.
 *
 * @param {string|undefined} rootOption
 * @returns {string} Absolute path of an existing directory.
 */
export function resolveRoot(rootOption) {
  let root = rootOption;
  if (root === undefined) {
    const binDir = path.dirname(fileURLToPath(import.meta.url));
    const configDir = path.dirname(binDir);
    if (path.basename(binDir) !== "bin" || path.basename(configDir) !== ".cross-stack") {
      throw new UsageError(
        "cannot tell which project to check: this file is not inside <project>/.cross-stack/bin/; " +
          "pass --root <dir>",
      );
    }
    root = path.dirname(configDir);
  }
  const absolute = path.resolve(root);
  let stats;
  try {
    stats = fs.statSync(absolute);
  } catch {
    throw new UsageError(`--root ${root} does not exist`);
  }
  if (!stats.isDirectory()) throw new UsageError(`--root ${root} is not a directory`);
  return absolute;
}

function usage(command) {
  if (command) {
    const positionals = command.positionals ? ` ${command.positionals}` : "";
    const options = command.help.length > 0 ? " [options]" : "";
    const lines = [
      `Usage: ${INVOCATION} ${command.name}${positionals}${options}`,
      "",
      command.summary,
    ];
    if (command.help.length > 0) lines.push("", "Options:", ...command.help);
    const subChecks = Object.entries(command.subChecks ?? {});
    if (subChecks.length > 0) {
      const width = Math.max(...subChecks.map(([name]) => name.length)) + 2;
      lines.push(
        "",
        "Sub-checks (name one to run it alone):",
        ...subChecks.map(([name, summary]) => `  ${name.padEnd(width)}${summary}`),
      );
    }
    return lines.join("\n");
  }
  const width = Math.max(...COMMANDS.map((entry) => entry.name.length)) + 2;
  return [
    `cross-stack-standard ${GENERATED.version}: project tool of the Cross-Stack Standard`,
    "",
    `Usage: ${INVOCATION} <command> [options]`,
    "",
    "Commands:",
    ...COMMANDS.map((entry) => `  ${entry.name.padEnd(width)}${entry.summary}`),
    "",
    "Global options:",
    "  -h, --help      Show help.",
    "  --version       Print the version.",
    "",
    `Run "${INVOCATION} help <command>" for a command's options.`,
    "Exit codes: 0 clean, 1 check failed, 2 usage or internal error.",
  ].join("\n");
}

/**
 * Formats a finding as one line: `<ID> <path>:<line> <message>`.
 *
 * @param {Finding} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  return `${finding.id} ${finding.path}:${finding.line} ${finding.message}`;
}

/**
 * Runs the tool.
 *
 * @param {string[]} argv Arguments after the script path.
 * @param {{ stdout?: (text: string) => void, stderr?: (text: string) => void }} [io]
 * @returns {number} The exit code.
 */
export function main(argv, io = {}) {
  const out = io.stdout ?? ((text) => process.stdout.write(text));
  const err = io.stderr ?? ((text) => process.stderr.write(text));
  try {
    return runCommand(argv, out, err);
  } catch (error) {
    if (error instanceof UsageError) {
      err(`cross-stack: ${error.message}\n`);
      return EXIT.USAGE;
    }
    err(`cross-stack: internal error: ${error instanceof Error ? error.stack : String(error)}\n`);
    return EXIT.USAGE;
  }
}

function runCommand(argv, out, err) {
  const [name, ...rest] = argv;
  if (name === undefined) {
    err(`${usage()}\n`);
    return EXIT.USAGE;
  }
  if (name === "--help" || name === "-h") {
    out(`${usage()}\n`);
    return EXIT.OK;
  }
  if (name === "--version") {
    out(`${GENERATED.version}\n`);
    return EXIT.OK;
  }
  const command = findCommand(name);

  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: { ...command.options, help: { type: "boolean", short: "h" } },
      allowPositionals: command.positionals !== undefined,
      strict: true,
    });
  } catch (error) {
    throw new UsageError(`${name}: ${error.message}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    out(`${usage(command)}\n`);
    return EXIT.OK;
  }
  if (command.kind === "info") {
    out(`${command.run(values, positionals)}\n`);
    return EXIT.OK;
  }
  if (command.kind === "report") {
    const report = command.run(values, positionals);
    out(values.json ? `${JSON.stringify(report.json, null, 2)}\n` : `${report.text}\n`);
    return report.ok ? EXIT.OK : EXIT.FAIL;
  }

  const result = command.run(values, positionals);
  const ok = result.findings.length === 0;
  if (values.json) {
    const report = {
      tool: "cross-stack-standard",
      version: GENERATED.version,
      check: command.name,
      ok,
      findings: result.findings,
      summary: result.summary,
      ...(result.details ? { details: result.details } : {}),
    };
    out(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    out(result.findings.map((finding) => `${formatFinding(finding)}\n`).join(""));
    out(`${result.summary}\n`);
  }
  return ok ? EXIT.OK : EXIT.FAIL;
}

// <cross-stack-standard:generated>
// Written by scripts/build-plugin-data.mjs from VERSION and schemas/*.json. Do not edit by hand.
// prettier-ignore
const GENERATED = {
  "version": "0.1.0",
  "standardSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://raw.githubusercontent.com/o6b7/cross-stack-standard/v0.1.0/plugins/cross-stack-standard/data/standard.schema.json",
    "title": "Cross-Stack Standard project manifest",
    "description": "The manifest at .cross-stack/standard.json: which version of the Standard a project adopted, its tracks, profile, tier and modules, and the settings of the Standard's hooks.",
    "type": "object",
    "required": [
      "version",
      "tracks"
    ],
    "additionalProperties": false,
    "properties": {
      "$schema": {
        "type": "string",
        "description": "URL of this schema, for editor completion. Pin it to the adopted version."
      },
      "version": {
        "description": "The SemVer version of the Standard the project adopted; the upgrade skill reads it.",
        "type": "string",
        "pattern": "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"
      },
      "tracks": {
        "description": "Stacks present in the project: laravel (JSON API), web (Next.js or React), mobile (Expo).",
        "type": "array",
        "minItems": 1,
        "maxItems": 3,
        "uniqueItems": true,
        "items": {
          "enum": [
            "laravel",
            "web",
            "mobile"
          ]
        }
      },
      "trackRoots": {
        "description": "The project-relative directory of each track whose files do not sit at the project root (a directory, or a list of them); a track without an entry uses the project root.",
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "laravel": {
            "$ref": "#/$defs/trackRoot"
          },
          "web": {
            "$ref": "#/$defs/trackRoot"
          },
          "mobile": {
            "$ref": "#/$defs/trackRoot"
          }
        }
      },
      "profile": {
        "description": "Web profile: next (App Router) or react-spa (Vite). Only valid with the web track; defaults to next.",
        "enum": [
          "next",
          "react-spa"
        ]
      },
      "tier": {
        "description": "Tier 1: the invariants only. Tier 2: the full Standard, for projects that are multi-tenant, have more than one developer, or are long-lived. When absent, Claude asks.",
        "enum": [
          1,
          2
        ]
      },
      "modules": {
        "description": "Optional modules. Each is true or false, or an object whose \"enabled\" defaults to true.",
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "tenancy": {
            "$ref": "#/$defs/moduleSetting"
          },
          "i18n": {
            "$ref": "#/$defs/moduleSetting"
          },
          "api-contract": {
            "$ref": "#/$defs/moduleSetting"
          },
          "bff-auth": {
            "$ref": "#/$defs/moduleSetting"
          },
          "design": {
            "$ref": "#/$defs/moduleSetting"
          },
          "browser-check": {
            "$ref": "#/$defs/moduleSetting"
          },
          "observability": {
            "$ref": "#/$defs/moduleSetting"
          }
        }
      },
      "locales": {
        "description": "BCP 47 language tags in canonical form, such as en or ar-SA. The first entry is the source locale.",
        "type": "array",
        "minItems": 1,
        "uniqueItems": true,
        "items": {
          "$ref": "#/$defs/locale"
        }
      },
      "companions": {
        "description": "The user's answer, per companion plugin, to adopt's install question: true approved and installed, false declined. A declined companion is never installed, and its tools are refused in this project.",
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "caveman": {
            "type": "boolean"
          },
          "impeccable": {
            "type": "boolean"
          },
          "figma": {
            "type": "boolean"
          },
          "playwright-mcp": {
            "type": "boolean"
          },
          "chrome-devtools-mcp": {
            "type": "boolean"
          }
        }
      },
      "disabled": {
        "description": "true turns every hook of the Standard off for this project.",
        "type": "boolean",
        "default": false
      },
      "hooks": {
        "description": "Settings for the Standard's Claude Code hooks. Environment variables override them.",
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "sessionStart": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "detect": {
                "description": "Detect the project's tracks at session start and add a short reminder.",
                "type": "boolean",
                "default": true
              }
            }
          },
          "postToolUse": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "phpstan": {
                "description": "Also run PHPStan on each edited PHP file. Off by default because it is slow.",
                "type": "boolean",
                "default": false
              },
              "budgetSeconds": {
                "description": "Time budget in seconds for formatting and linting one edited file.",
                "type": "integer",
                "minimum": 1,
                "maximum": 600
              }
            }
          },
          "stop": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "enabled": {
                "description": "Run the fast gate when Claude finishes a turn. CROSS_STACK_STANDARD_STOP_GATE=0 turns it off.",
                "type": "boolean",
                "default": true
              },
              "budgetSeconds": {
                "description": "Time budget in seconds for the fast gate.",
                "type": "integer",
                "minimum": 1,
                "maximum": 600,
                "default": 90
              },
              "command": {
                "description": "The name of the composer and/or npm script the fast gate runs: a script name, not a shell command.",
                "type": "string",
                "pattern": "^[A-Za-z0-9][A-Za-z0-9:._-]*$",
                "default": "check:fast"
              }
            }
          },
          "preToolUse": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "protect": {
                "description": "Extra project-relative globs whose edits need confirmation, added to the built-in list.",
                "type": "array",
                "uniqueItems": true,
                "items": {
                  "$ref": "#/$defs/projectGlob"
                }
              },
              "protectCommands": {
                "description": "Extra JavaScript regular expressions for shell commands that need confirmation, added to the built-in list.",
                "type": "array",
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "decision": {
                "description": "The answer to a protected tool call: ask (the user confirms) or deny (blocked, also in bypassPermissions mode; the user makes the change directly).",
                "enum": [
                  "ask",
                  "deny"
                ],
                "default": "ask"
              },
              "browserHosts": {
                "description": "Development hosts the Chrome DevTools MCP companion may open without asking, added to the built-in local hosts (localhost, 127.0.0.1, [::1], *.localhost, *.test). A leading *. matches any subdomain.",
                "type": "array",
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "pattern": "^(\\*\\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$"
                }
              }
            }
          }
        }
      },
      "allowlistsDir": {
        "description": "A project-relative directory (no leading /, no .. segment, no glob characters) that holds the allowlist files, <RULE-ID>.json.",
        "type": "string",
        "pattern": "^(?![/\\\\])(?![A-Za-z]:)(?!(?:.*/)?\\.\\.(?:/|$))[^\\\\*?{}\\[\\]]+$",
        "default": ".cross-stack/allowlists"
      },
      "allowlistMaxDays": {
        "description": "The furthest ahead an allowlist entry's expiry date may lie, in days from today (UTC). A date further ahead is a finding, so an exception cannot be made permanent by a far-future date.",
        "type": "integer",
        "minimum": 1,
        "maximum": 3650,
        "default": 365
      },
      "stack": {
        "description": "Settings of the one-library-per-concern check. Each key other than competingGroups names a concern (state, server-state, forms, validation, http, dates, styling, unit-tests, e2e-tests) that is being migrated from one library to another.",
        "type": "object",
        "properties": {
          "competingGroups": {
            "description": "Groups of libraries that compete for one concern, added to the curated catalogue the check ships with.",
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "concern",
                "packages"
              ],
              "additionalProperties": false,
              "properties": {
                "concern": {
                  "description": "Name of the concern, such as state or dates.",
                  "type": "string",
                  "minLength": 1
                },
                "packages": {
                  "description": "Package names (npm or Composer) that compete for the concern.",
                  "type": "array",
                  "minItems": 2,
                  "uniqueItems": true,
                  "items": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              }
            }
          }
        },
        "additionalProperties": {
          "description": "A concern under migration.",
          "type": "object",
          "required": [
            "deprecated"
          ],
          "additionalProperties": false,
          "properties": {
            "deprecated": {
              "description": "Packages being migrated away from; they may stay installed next to the winner until the migration ends.",
              "type": "array",
              "minItems": 1,
              "uniqueItems": true,
              "items": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      }
    },
    "dependentSchemas": {
      "profile": {
        "description": "\"profile\" applies only when \"tracks\" includes \"web\".",
        "type": "object",
        "properties": {
          "tracks": {
            "type": "array",
            "contains": {
              "const": "web"
            }
          }
        }
      }
    },
    "allOf": [
      {
        "if": {
          "type": "object",
          "required": [
            "modules"
          ],
          "properties": {
            "modules": {
              "type": "object",
              "required": [
                "bff-auth"
              ],
              "properties": {
                "bff-auth": {
                  "$ref": "#/$defs/enabledModule"
                }
              }
            }
          }
        },
        "then": {
          "description": "The bff-auth module needs the web track with the next profile.",
          "type": "object",
          "properties": {
            "tracks": {
              "type": "array",
              "contains": {
                "const": "web"
              }
            },
            "profile": {
              "const": "next"
            }
          }
        }
      },
      {
        "if": {
          "type": "object",
          "required": [
            "modules"
          ],
          "properties": {
            "modules": {
              "type": "object",
              "required": [
                "i18n"
              ],
              "properties": {
                "i18n": {
                  "$ref": "#/$defs/enabledModule"
                }
              }
            }
          }
        },
        "then": {
          "description": "The i18n module needs a \"locales\" list; its first entry is the source locale.",
          "type": "object",
          "required": [
            "locales"
          ],
          "properties": {
            "locales": true
          }
        }
      }
    ],
    "$defs": {
      "moduleSetting": {
        "anyOf": [
          {
            "type": "boolean"
          },
          {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "enabled": {
                "type": "boolean",
                "default": true
              }
            }
          }
        ]
      },
      "enabledModule": {
        "description": "Matches a module setting that turns the module on.",
        "anyOf": [
          {
            "const": true
          },
          {
            "type": "object",
            "not": {
              "type": "object",
              "required": [
                "enabled"
              ],
              "properties": {
                "enabled": {
                  "const": false
                }
              }
            }
          }
        ]
      },
      "locale": {
        "description": "A BCP 47 language tag in canonical form, such as en, ar or zh-Hant-TW.",
        "type": "string",
        "pattern": "^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?(?:-(?:[0-9a-z]{5,8}|[0-9][0-9a-z]{3}))*$"
      },
      "projectGlob": {
        "description": "A project-relative glob with / separators, no leading / and no .. segment.",
        "type": "string",
        "minLength": 1,
        "pattern": "^(?![/\\\\])(?![A-Za-z]:)(?!\\./)(?!(?:.*/)?\\.\\.(?:/|$))[^\\\\]+$"
      },
      "trackRoot": {
        "description": "A project-relative directory (no leading /, no .. segment, no glob characters), or a non-empty list of them.",
        "anyOf": [
          {
            "$ref": "#/$defs/projectDir"
          },
          {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "$ref": "#/$defs/projectDir"
            }
          }
        ]
      },
      "projectDir": {
        "description": "A project-relative directory: no leading /, no drive letter, no .. segment, no glob characters.",
        "type": "string",
        "minLength": 1,
        "pattern": "^(?![/\\\\])(?![A-Za-z]:)(?!(?:.*/)?\\.\\.(?:/|$))[^\\\\*?{}\\[\\]]+$"
      }
    }
  },
  "allowlistSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://raw.githubusercontent.com/o6b7/cross-stack-standard/v0.1.0/plugins/cross-stack-standard/data/allowlist.schema.json",
    "title": "Cross-Stack Standard allowlist",
    "description": "A dated allowlist for one rule, stored as .cross-stack/allowlists/<RULE-ID>.json. Every entry needs a reason, an owner and an expiry date; expired entries fail the check.",
    "type": "object",
    "required": [
      "rule",
      "entries"
    ],
    "additionalProperties": false,
    "properties": {
      "$schema": {
        "type": "string",
        "description": "URL of this schema, for editor completion."
      },
      "rule": {
        "description": "The ID of the rule the entries apply to (a track prefix and three digits); it must match the file name.",
        "type": "string",
        "pattern": "^(?:BE|WEB|MOB|SEC|I18N|UI|PROC|CI)-[0-9]{3}$"
      },
      "entries": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/entry"
        }
      }
    },
    "$defs": {
      "entry": {
        "type": "object",
        "required": [
          "match",
          "reason",
          "expires",
          "owner"
        ],
        "additionalProperties": false,
        "properties": {
          "match": {
            "description": "What the entry allows, in the form the rule's gate documents (for example a project-relative path or glob).",
            "type": "string",
            "minLength": 1
          },
          "reason": {
            "description": "Why the exception is needed.",
            "type": "string",
            "pattern": "\\S"
          },
          "expires": {
            "description": "The last day (UTC, YYYY-MM-DD) on which the entry is valid.",
            "type": "string",
            "format": "date",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
          },
          "owner": {
            "description": "Who removes the entry: a GitHub handle, team or email address.",
            "type": "string",
            "pattern": "\\S"
          }
        }
      }
    }
  }
};
// </cross-stack-standard:generated>

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2));

/** True when Node runs this file directly (not when it is imported, e.g. by tests). */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  const real = (target) => {
    try {
      return fs.realpathSync(target);
    } catch {
      return path.resolve(target);
    }
  };
  return real(process.argv[1]) === real(fileURLToPath(import.meta.url));
}
