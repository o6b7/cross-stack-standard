/**
 * Fixture layers and their `fixture.json` (schema: `schemas/fixture.schema.json`).
 *
 * A run builds a work directory from a host plus ordered layers:
 *
 * - `clean`: `test/fixtures/<track>/clean/` (required, `fixture.json` required);
 * - `cleanOverlay`: `test/fixtures/<track>/clean-overlays/<RULE-ID>/` (optional, `fixture.json`
 *   optional) — the rule's own additions to the clean state, used by both runs;
 * - `violation`: `test/fixtures/<track>/violations/<RULE-ID>/` (`fixture.json` required).
 *
 * The clean run uses `clean` + `cleanOverlay`; the violation run adds `violation` on top, so the
 * two runs differ by exactly the violation layer.
 *
 * This validator is hand-written (scripts use Node built-ins only) and mirrors the schema; a test
 * checks that both accept and reject the same documents.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { RULE_ID_PREFIXES, parseRuleId } from "./ids.mjs";
import { isSafeRelativePath } from "./paths.mjs";
import { HOST_NAME_RE } from "./host.mjs";

/** File name of a fixture definition inside a fixture directory. */
export const FIXTURE_FILE = "fixture.json";

/** Layer roles, in the order they are applied. */
export const LAYER_ROLES = Object.freeze(["clean", "cleanOverlay", "violation"]);

const FIXTURE_KEYS = new Set([
  "$schema",
  "description",
  "hosts",
  "manifestOverlay",
  "base",
  "head",
  "commitMessages",
  "remove",
  "rename",
  "alsoFires",
  "expect",
]);
const VIOLATION_ONLY_KEYS = ["alsoFires", "expect"];

/** Error raised for an invalid or missing fixture definition. */
export class FixtureConfigError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "FixtureConfigError";
  }
}

/**
 * @typedef {object} FixtureConfig
 * @property {string | null} description Reviewer note.
 * @property {string[]} hosts Harness hosts this fixture runs on.
 * @property {Record<string, unknown> | null} manifestOverlay Merge patch for `.cross-stack/standard.json`.
 * @property {string | null} base Directory committed as the base commit (git hosts).
 * @property {string | null} head Directory committed as the head commit (git hosts).
 * @property {{ base: string | null, head: string | null }} commitMessages Commit messages.
 * @property {string[]} remove Work-directory paths deleted after this layer is applied.
 * @property {Record<string, string>} rename Layer file → work-directory path, for names that
 *   cannot be committed as-is (for example `.env` or `vendor/`).
 * @property {string[]} alsoFires Other rule ids the violation may print (violation only).
 * @property {{ idPattern: string | null }} expect Custom id expectation (violation only).
 *
 * @typedef {object} Layer
 * @property {"clean" | "cleanOverlay" | "violation"} role Layer role.
 * @property {string} dir Absolute layer directory.
 * @property {string} label Repository-relative directory, for messages.
 * @property {FixtureConfig | null} config Parsed `fixture.json`, or null when absent.
 */

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(label, message) {
  throw new FixtureConfigError(`${label}: ${message}`);
}

function relPathList(label, key, value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(label, `${key} must be an array`);
  if (new Set(value).size !== value.length) fail(label, `${key} has duplicate entries`);
  value.forEach((item, index) => {
    if (!isSafeRelativePath(item)) fail(label, `${key}[${index}] is not a valid relative path`);
  });
  return [...value];
}

function optionalRelPath(label, key, value) {
  if (value === undefined) return null;
  if (!isSafeRelativePath(value)) fail(label, `${key} must be a relative path inside the fixture`);
  return value;
}

/**
 * Validate a parsed `fixture.json` object against the fixture schema and the layer role.
 *
 * @param {unknown} raw Parsed JSON.
 * @param {{ label: string, role: "clean" | "cleanOverlay" | "violation",
 *   knownIds?: Set<string> }} options Label for messages, the layer role, and the registry ids
 *   (checks `alsoFires`).
 * @returns {FixtureConfig} Normalised configuration.
 * @throws {FixtureConfigError} When the document is invalid.
 */
export function validateFixtureConfig(raw, { label, role, knownIds }) {
  if (!isObject(raw)) fail(label, "must be a JSON object");
  for (const key of Object.keys(raw)) {
    if (!FIXTURE_KEYS.has(key)) fail(label, `unknown key "${key}"`);
  }
  if (raw.$schema !== undefined && typeof raw.$schema !== "string") {
    fail(label, "$schema must be a string");
  }
  if (
    raw.description !== undefined &&
    (typeof raw.description !== "string" || raw.description === "")
  ) {
    fail(label, "description must be a non-empty string");
  }

  const hosts = raw.hosts;
  if (!Array.isArray(hosts) || hosts.length === 0) fail(label, "hosts must be a non-empty array");
  if (new Set(hosts).size !== hosts.length) fail(label, "hosts has duplicate entries");
  hosts.forEach((host, index) => {
    if (typeof host !== "string" || !HOST_NAME_RE.test(host)) {
      fail(label, `hosts[${index}] must be a host name (lower-case letters, digits, hyphens)`);
    }
  });

  if (raw.manifestOverlay !== undefined && !isObject(raw.manifestOverlay)) {
    fail(label, "manifestOverlay must be an object");
  }

  const base = optionalRelPath(label, "base", raw.base);
  const head = optionalRelPath(label, "head", raw.head);
  if (base && head && base === head) fail(label, "base and head must be different directories");

  const commitMessages = { base: null, head: null };
  if (raw.commitMessages !== undefined) {
    if (!isObject(raw.commitMessages)) fail(label, "commitMessages must be an object");
    for (const key of Object.keys(raw.commitMessages)) {
      if (key !== "base" && key !== "head") fail(label, `commitMessages has unknown key "${key}"`);
      const message = raw.commitMessages[key];
      if (typeof message !== "string" || message.trim() === "") {
        fail(label, `commitMessages.${key} must be a non-empty string`);
      }
      if ((key === "base" && !base) || (key === "head" && !head)) {
        fail(label, `commitMessages.${key} needs "${key}" to be set`);
      }
      commitMessages[key] = message;
    }
  }

  const remove = relPathList(label, "remove", raw.remove);

  const rename = {};
  if (raw.rename !== undefined) {
    if (!isObject(raw.rename)) fail(label, "rename must be an object");
    for (const [from, to] of Object.entries(raw.rename)) {
      if (!isSafeRelativePath(from)) {
        fail(label, `rename key "${from}" is not a valid relative path`);
      }
      if (!isSafeRelativePath(to)) fail(label, `rename.${from} is not a valid relative path`);
      rename[from] = to;
    }
  }

  const alsoFires = [];
  if (raw.alsoFires !== undefined) {
    if (!Array.isArray(raw.alsoFires)) fail(label, "alsoFires must be an array");
    if (new Set(raw.alsoFires).size !== raw.alsoFires.length) {
      fail(label, "alsoFires has duplicate entries");
    }
    for (const id of raw.alsoFires) {
      const parsed = parseRuleId(id);
      if (!parsed || !RULE_ID_PREFIXES.includes(parsed.prefix)) {
        fail(label, `alsoFires entry ${JSON.stringify(id)} is not a rule id`);
      }
      if (knownIds && !knownIds.has(id)) {
        fail(label, `alsoFires lists ${id}, which is not in the registry`);
      }
      alsoFires.push(id);
    }
  }

  const expect = { idPattern: null };
  if (raw.expect !== undefined) {
    if (!isObject(raw.expect)) fail(label, "expect must be an object");
    for (const key of Object.keys(raw.expect)) {
      if (key !== "idPattern") fail(label, `expect has unknown key "${key}"`);
    }
    const source = raw.expect.idPattern;
    if (source !== undefined) {
      if (typeof source !== "string" || source === "") {
        fail(label, "expect.idPattern must be a non-empty string");
      }
      let re;
      try {
        re = new RegExp(source);
      } catch (err) {
        fail(label, `expect.idPattern is not a valid regular expression: ${err.message}`);
      }
      if (re.test("")) fail(label, "expect.idPattern must not match an empty output");
      expect.idPattern = source;
    }
  }

  if (role !== "violation") {
    for (const key of VIOLATION_ONLY_KEYS) {
      if (raw[key] !== undefined) fail(label, `"${key}" is only valid in a violation fixture`);
    }
  }

  return {
    description: raw.description ?? null,
    hosts: [...hosts],
    manifestOverlay: raw.manifestOverlay ?? null,
    base,
    head,
    commitMessages,
    remove,
    rename,
    alsoFires,
    expect,
  };
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Load a fixture layer from a directory.
 *
 * @param {string} dir Absolute layer directory.
 * @param {{ role: "clean" | "cleanOverlay" | "violation", label: string, knownIds?: Set<string> }} options
 *   Layer role, repository-relative label and registry ids.
 * @returns {Layer | null} The layer, or null when the directory does not exist and the role is
 *   optional (`cleanOverlay`).
 * @throws {FixtureConfigError} When a required directory or `fixture.json` is missing or invalid.
 */
export function loadLayer(dir, { role, label, knownIds }) {
  if (!LAYER_ROLES.includes(role)) throw new Error(`unknown layer role ${role}`);
  if (!isDirectory(dir)) {
    if (role === "cleanOverlay") return null;
    fail(label, "fixture directory is missing");
  }
  const file = path.join(dir, FIXTURE_FILE);
  const fileLabel = `${label}/${FIXTURE_FILE}`;
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    if (role === "cleanOverlay") return { role, dir, label, config: null };
    fail(fileLabel, "is missing");
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    fail(fileLabel, `cannot parse: ${err.message}`);
  }
  const config = validateFixtureConfig(raw, { label: fileLabel, role, knownIds });
  for (const key of ["base", "head"]) {
    const rel = config[key];
    if (rel && !isDirectory(path.join(dir, ...rel.split("/")))) {
      fail(fileLabel, `${key} directory "${rel}" does not exist`);
    }
  }
  for (const from of Object.keys(config.rename)) {
    if (!fs.existsSync(path.join(dir, ...from.split("/")))) {
      fail(fileLabel, `rename source "${from}" does not exist`);
    }
  }
  return { role, dir, label, config };
}

/**
 * Layer-relative paths that are not copied as plain files: `fixture.json`, the base/head
 * directories and rename sources.
 *
 * @param {Layer} layer Fixture layer.
 * @returns {Set<string>} Relative POSIX paths.
 */
export function layerSkipSet(layer) {
  const skip = new Set([FIXTURE_FILE]);
  const config = layer.config;
  if (config) {
    if (config.base) skip.add(config.base);
    if (config.head) skip.add(config.head);
    for (const from of Object.keys(config.rename)) skip.add(from);
  }
  return skip;
}
