/**
 * The project manifest, `.cross-stack/standard.json`, as the hooks need it.
 *
 * {@link readManifest} reads it without any schema, because the opt-out check runs first and
 * must never depend on anything that can fail to load. It checks only the fields the hooks use
 * (`disabled`, `tracks`, `tier`, `profile`, `modules`, `version`); the full check is
 * `check-standard-config` in the kit tool.
 *
 * {@link resolveHookConfig} merges the `hooks` settings with their defaults and the environment
 * overrides. Defaults and constraints come from the plugin's generated copy of the manifest
 * schema (`data/standard.schema.json`), and values are validated with the kit tool's JSON Schema
 * interpreter, so the schema stays the single source. An invalid setting is ignored (its
 * default applies) and reported as a problem; it never stops a hook.
 *
 * @module plugins/cross-stack-standard/scripts/lib/manifest
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DEFAULT_POST_TOOL_USE_BUDGET_SECONDS } from "./budget.mjs";
import { findFileUp, readTextCapped } from "./project.mjs";

/** Project-relative location of the manifest. */
export const MANIFEST_PATH = ".cross-stack/standard.json";

/** Tracks, in the order the manifest schema lists them. */
export const TRACKS = Object.freeze(["laravel", "web", "mobile"]);

/** Largest manifest read. */
export const MAX_MANIFEST_BYTES = 1024 * 1024;

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The plugin's generated copy of the manifest schema. */
export const SCHEMA_FILE = path.join(PLUGIN_ROOT, "data", "standard.schema.json");

/** The kit tool whose JSON Schema interpreter validates settings. */
export const VALIDATOR_FILE = path.join(
  PLUGIN_ROOT,
  "templates",
  "shared",
  "cross-stack",
  "bin",
  "cross-stack.mjs",
);

/**
 * Environment variables that override `hooks` settings. Values: `1`/`true`/`yes`/`on` and
 * `0`/`false`/`no`/`off` for switches, digits for seconds, the script name for commands. Lists
 * (`preToolUse.protect`, `preToolUse.protectCommands`) have no override.
 */
export const ENV_OVERRIDES = Object.freeze([
  { name: "CROSS_STACK_STANDARD_SESSION_START_DETECT", event: "sessionStart", key: "detect" },
  { name: "CROSS_STACK_STANDARD_POST_TOOL_USE_PHPSTAN", event: "postToolUse", key: "phpstan" },
  {
    name: "CROSS_STACK_STANDARD_POST_TOOL_USE_BUDGET_SECONDS",
    event: "postToolUse",
    key: "budgetSeconds",
  },
  { name: "CROSS_STACK_STANDARD_STOP_GATE", event: "stop", key: "enabled" },
  { name: "CROSS_STACK_STANDARD_STOP_BUDGET_SECONDS", event: "stop", key: "budgetSeconds" },
  { name: "CROSS_STACK_STANDARD_STOP_COMMAND", event: "stop", key: "command" },
]);

const TRUE_WORDS = new Set(["1", "true", "yes", "on"]);
const FALSE_WORDS = new Set(["0", "false", "no", "off"]);

/**
 * Parses a switch value from the environment.
 *
 * @param {string | undefined} value
 * @returns {boolean | null} null when the value is missing or not a recognised word.
 */
export function parseSwitch(value) {
  if (typeof value !== "string") return null;
  const word = value.trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function countOf(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Longest setting name repeated in a problem message. */
const MAX_NAME_CHARS = 40;

/**
 * A key from the manifest as it may appear in a problem message: repeated only when it is a
 * short plain name, so a crafted key cannot put text of its own into a message.
 *
 * @param {string} name
 * @returns {string}
 */
export function settingName(name) {
  return name.length <= MAX_NAME_CHARS && /^[A-Za-z0-9_-]+$/.test(name)
    ? name
    : "<unrecognised name>";
}

/**
 * The nearest manifest in `dirs` (nearest first), or null. With `within`, a manifest whose real
 * path lies outside that directory (a `.cross-stack` link leading out of the project) is
 * skipped.
 *
 * @param {string[]} dirs
 * @param {{ within?: string | null }} [options]
 * @returns {string | null}
 */
export function findManifest(dirs, { within = null } = {}) {
  return findFileUp(dirs, MANIFEST_PATH, { within });
}

/**
 * @typedef {object} ManifestInfo
 * @property {string} path Absolute path of the manifest file.
 * @property {string} dir The project directory that holds `.cross-stack/`.
 * @property {Record<string, any> | null} manifest The parsed object; null when unreadable.
 * @property {string[]} problems Problems with the fields the hooks use.
 * @property {boolean} disabled `"disabled": true`.
 * @property {string[]} tracks Valid tracks, in schema order.
 * @property {1 | 2 | null} tier
 * @property {string | null} profile
 * @property {string[]} modules Enabled module names.
 * @property {string | null} version
 */

/**
 * Reads a manifest file and checks the fields the hooks use.
 *
 * @param {string} file
 * @returns {ManifestInfo}
 */
export function readManifest(file) {
  /** @type {ManifestInfo} */
  const info = {
    path: file,
    dir: path.dirname(path.dirname(file)),
    manifest: null,
    problems: [],
    disabled: false,
    tracks: [],
    tier: null,
    profile: null,
    modules: [],
    version: null,
  };
  const text = readTextCapped(file, MAX_MANIFEST_BYTES);
  if (text === null) {
    info.problems.push(`${MANIFEST_PATH} could not be read`);
    return info;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    info.problems.push(`${MANIFEST_PATH} is not valid JSON`);
    return info;
  }
  if (!isPlainObject(value)) {
    info.problems.push(`${MANIFEST_PATH} must hold a JSON object`);
    return info;
  }
  info.manifest = value;

  if (value.disabled === true) info.disabled = true;
  else if (value.disabled !== undefined && value.disabled !== false) {
    info.problems.push('"disabled" must be true or false');
  }

  if (Array.isArray(value.tracks)) {
    // Counted, never quoted: the text of an unknown entry is not the Standard's to repeat.
    const unknown = value.tracks.filter((track) => !TRACKS.includes(track)).length;
    if (unknown > 0) {
      info.problems.push(`"tracks" has ${countOf(unknown, "unknown entry", "unknown entries")}`);
    }
    info.tracks = TRACKS.filter((track) => value.tracks.includes(track));
    if (info.tracks.length === 0 && unknown === 0) {
      info.problems.push('"tracks" is empty');
    }
  } else {
    info.problems.push('"tracks" is missing or not a list');
  }

  if (value.tier === 1 || value.tier === 2) info.tier = value.tier;
  else if (value.tier !== undefined) info.problems.push('"tier" must be 1 or 2');

  if (value.profile === "next" || value.profile === "react-spa") info.profile = value.profile;
  else if (value.profile !== undefined) info.problems.push('"profile" must be next or react-spa');

  if (isPlainObject(value.modules)) {
    info.modules = Object.entries(value.modules)
      .filter(([, setting]) =>
        setting === true ? true : isPlainObject(setting) && setting.enabled !== false,
      )
      .map(([name]) => name)
      .sort();
  }

  if (typeof value.version === "string") info.version = value.version;
  return info;
}

/**
 * The nearest manifest, read; null when the project has none. The entry point passes the
 * project directory and its parents up to the repository root (never the working directory),
 * with `within` set to that scope.
 *
 * @param {string[]} dirs
 * @param {{ within?: string | null }} [options]
 * @returns {ManifestInfo | null}
 */
export function loadNearestManifest(dirs, { within = null } = {}) {
  const file = findManifest(dirs, { within });
  return file === null ? null : readManifest(file);
}

let schemaCache = null;
let validatorCache = null;

/**
 * Loads the plugin's copy of the manifest schema.
 *
 * @param {string} [file]
 * @returns {Record<string, any>}
 */
export function loadStandardSchema(file = SCHEMA_FILE) {
  if (file === SCHEMA_FILE && schemaCache !== null) return schemaCache;
  const schema = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!isPlainObject(schema?.properties?.hooks?.properties)) {
    throw new Error(`${path.basename(file)} has no hooks settings`);
  }
  if (file === SCHEMA_FILE) schemaCache = schema;
  return schema;
}

async function loadValidator() {
  if (validatorCache === null) {
    const module = await import(pathToFileURL(VALIDATOR_FILE).href);
    validatorCache = module.validateAgainstSchema;
  }
  return validatorCache;
}

/**
 * @typedef {object} HookConfig
 * @property {{ detect: boolean }} sessionStart
 * @property {{ phpstan: boolean, budgetSeconds: number }} postToolUse
 * @property {{ enabled: boolean, budgetSeconds: number, command: string }} stop
 * @property {{ protect: string[], protectCommands: string[] }} preToolUse
 */

/**
 * Default value of every hooks setting, from the schema (`[]` for a list without a default).
 *
 * @param {Record<string, any>} schema
 * @returns {HookConfig}
 */
export function defaultHookConfig(schema) {
  const config = {};
  for (const [event, eventSchema] of Object.entries(schema.properties.hooks.properties)) {
    config[event] = {};
    for (const [key, leaf] of Object.entries(eventSchema.properties ?? {})) {
      if (leaf.default !== undefined) config[event][key] = structuredClone(leaf.default);
      else if (leaf.type === "array") config[event][key] = [];
    }
  }
  if (config.postToolUse && config.postToolUse.budgetSeconds === undefined) {
    config.postToolUse.budgetSeconds = DEFAULT_POST_TOOL_USE_BUDGET_SECONDS;
  }
  return /** @type {HookConfig} */ (config);
}

function coerceEnvValue(raw, leaf) {
  if (leaf.type === "boolean") return parseSwitch(raw);
  if (leaf.type === "integer") return /^\s*\d+\s*$/.test(raw) ? Number(raw.trim()) : null;
  if (leaf.type === "string") return raw.trim();
  return null;
}

/**
 * Resolves the hooks settings: schema defaults, then the manifest's `hooks`, then environment
 * overrides. Each invalid value is skipped and described in `problems`.
 *
 * @param {{ manifest?: Record<string, any> | null, env: Record<string, string | undefined>, schema?: Record<string, any> }} options
 * @returns {Promise<{ config: HookConfig, problems: string[] }>}
 */
export async function resolveHookConfig({ manifest, env, schema = loadStandardSchema() }) {
  const eventSchemas = schema.properties.hooks.properties;
  const config = defaultHookConfig(schema);
  const problems = [];
  const hooks = manifest?.hooks;
  const overrides = ENV_OVERRIDES.filter(({ name }) => (env[name] ?? "") !== "");
  if (hooks === undefined && overrides.length === 0) return { config, problems };

  const validate = await loadValidator();
  const check = (leaf, value) => validate({ ...leaf, $defs: schema.$defs ?? {} }, value);
  const describe = (errors) => errors.map((error) => error.message).join("; ");

  if (hooks !== undefined && !isPlainObject(hooks)) {
    problems.push('"hooks" must be an object; its settings were ignored');
  } else if (hooks !== undefined) {
    for (const [event, settings] of Object.entries(hooks)) {
      const eventSchema = Object.hasOwn(eventSchemas, event) ? eventSchemas[event] : undefined;
      if (eventSchema === undefined) {
        problems.push(`hooks.${settingName(event)} is not a known hook`);
        continue;
      }
      if (!isPlainObject(settings)) {
        problems.push(`hooks.${event} must be an object`);
        continue;
      }
      for (const [key, value] of Object.entries(settings)) {
        const leaf = Object.hasOwn(eventSchema.properties ?? {}, key)
          ? eventSchema.properties[key]
          : undefined;
        if (leaf === undefined) {
          problems.push(`hooks.${event}.${settingName(key)} is not a known setting`);
          continue;
        }
        const errors = check(leaf, value);
        if (errors.length > 0) problems.push(`hooks.${event}.${key} ${describe(errors)}`);
        else config[event][key] = structuredClone(value);
      }
    }
  }

  for (const { name, event, key } of overrides) {
    const leaf = eventSchemas[event]?.properties?.[key];
    if (leaf === undefined) continue;
    const value = coerceEnvValue(env[name], leaf);
    const errors = value === null ? [{ message: "is not a valid value" }] : check(leaf, value);
    if (errors.length > 0) problems.push(`${name} ${describe(errors)}`);
    else config[event][key] = value;
  }

  const commands = config.preToolUse?.protectCommands;
  if (Array.isArray(commands)) {
    config.preToolUse.protectCommands = commands.filter((pattern, index) => {
      try {
        new RegExp(pattern, "u");
        return true;
      } catch {
        problems.push(
          `hooks.preToolUse.protectCommands[${index}] is not a valid regular expression`,
        );
        return false;
      }
    });
  }
  return { config, problems };
}
