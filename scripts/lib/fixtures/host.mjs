/**
 * Harness hosts: minimal projects under `test/harness/<name>/`, each described by `host.json`.
 * See `test/harness/README.md` for the contract. This module loads and validates host
 * definitions and computes the placeholder values their templates use.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { isSafeRelativePath, relPosix } from "./paths.mjs";
import { BUILTIN_PLACEHOLDERS, assertPlaceholders, expandString } from "./template.mjs";

/** File name of a host definition inside its directory. */
export const HOST_FILE = "host.json";

/** Gate kinds a registry rule may declare; a host maps some of them to commands. */
export const GATE_KINDS = Object.freeze([
  "eslint",
  "depcruise",
  "vitest",
  "jest",
  "pest",
  "phpstan",
  "script",
  "ci",
  "hook",
]);

/** Valid host names (also the directory name). */
export const HOST_NAME_RE = /^[a-z][a-z0-9-]*$/;

const VAR_NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HOST_KEYS = new Set([
  "$schema",
  "$comment",
  "name",
  "description",
  "git",
  "include",
  "setup",
  "setupTimeoutMs",
  "prepare",
  "copy",
  "vars",
  "env",
  "timeoutMs",
  "gates",
]);
const GATE_KEYS = new Set(["argv", "cwd", "env", "stdin", "junit", "timeoutMs", "failExitCodes"]);
const COPY_KEYS = new Set(["hardlink", "detach", "exclude"]);

/** Placeholders available before a work directory exists (host `setup`). */
const STATIC_PLACEHOLDERS = ["hostDir", "repoRoot", "node"];

/** Error raised for an invalid or missing host definition. */
export class HostConfigError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "HostConfigError";
  }
}

/**
 * @typedef {Array<string | string[]>} ArgvTemplate
 *
 * @typedef {object} GateTemplate
 * @property {ArgvTemplate} argv Command template.
 * @property {string | null} cwd Working-directory template (defaults to `{workdir}`).
 * @property {Record<string, string>} env Extra environment templates.
 * @property {string | null} stdin Template of a file piped to the gate's stdin.
 * @property {string | null} junit Template of the JUnit XML report the gate writes; when set,
 *   the test named after the gate id must pass in the clean run and fail in the violation run.
 * @property {number | null} timeoutMs Gate-specific timeout.
 * @property {number[] | null} failExitCodes Exit codes accepted as "violation found".
 *
 * @typedef {object} HostDefinition
 * @property {string} name Host name (equals its directory name).
 * @property {string} dir Absolute host directory.
 * @property {string} label Repository-relative path of `host.json`, for messages.
 * @property {string} description One-line description.
 * @property {boolean} git Whether each work directory becomes a scratch git repository.
 * @property {Array<{ host: HostDefinition, into: string }>} include Hosts copied into subdirectories.
 * @property {ArgvTemplate[]} setup Commands run once per runner invocation in the host directory.
 * @property {number | null} setupTimeoutMs Timeout per setup command.
 * @property {ArgvTemplate[]} prepare Commands run in every work directory before the gate.
 * @property {{ hardlink: string[], detach: string[], exclude: string[] }} copy Copy strategy.
 * @property {Record<string, string>} vars Host variables (templates over the static placeholders).
 * @property {Record<string, string>} env Environment templates for setup, prepare and gates.
 * @property {number | null} timeoutMs Default gate timeout for this host.
 * @property {Record<string, GateTemplate>} gates Gate command per gate kind.
 */

function fail(label, message) {
  throw new HostConfigError(`${label}: ${message}`);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkPlaceholders(template, allowed, where) {
  try {
    assertPlaceholders(template, allowed, where);
  } catch (err) {
    throw new HostConfigError(err.message, { cause: err });
  }
}

function checkKeys(label, where, value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(label, `${where} has unknown key "${key}"`);
  }
}

function positiveInt(label, where, value) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) fail(label, `${where} must be a positive integer`);
  return value;
}

function argvTemplate(label, where, value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(label, `${where} must be a non-empty array`);
  }
  if (typeof value[0] !== "string" || value[0] === "") {
    fail(label, `${where}[0] must be a non-empty string (the program)`);
  }
  value.forEach((item, index) => {
    if (typeof item === "string") return;
    const ok =
      Array.isArray(item) && item.length > 0 && item.every((part) => typeof part === "string");
    if (!ok) fail(label, `${where}[${index}] must be a string or a non-empty array of strings`);
  });
  return value;
}

function stringMap(label, where, value, keyRe) {
  if (value === undefined) return {};
  if (!isObject(value)) fail(label, `${where} must be an object`);
  for (const [key, template] of Object.entries(value)) {
    if (!keyRe.test(key)) fail(label, `${where} has an invalid name "${key}"`);
    if (typeof template !== "string") fail(label, `${where}.${key} must be a string`);
  }
  return { ...value };
}

function pathList(label, where, value, check) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(label, `${where} must be an array`);
  value.forEach((item, index) => {
    if (!check(item)) fail(label, `${where}[${index}] is not a valid relative path: ${item}`);
  });
  return [...value];
}

function isExcludePattern(value) {
  return (
    typeof value === "string" &&
    value !== "" &&
    !value.includes("\\") &&
    isSafeRelativePath(value.replaceAll("*", "x"))
  );
}

function validateCopy(label, value) {
  if (value === undefined) return { hardlink: [], detach: [], exclude: [] };
  if (!isObject(value)) fail(label, "copy must be an object");
  checkKeys(label, "copy", value, COPY_KEYS);
  const hardlink = pathList(label, "copy.hardlink", value.hardlink, isSafeRelativePath);
  const detach = pathList(label, "copy.detach", value.detach, isSafeRelativePath);
  const exclude = pathList(label, "copy.exclude", value.exclude, isExcludePattern);
  for (const entry of detach) {
    const underHardlink = hardlink.some((dir) => entry.startsWith(`${dir}/`));
    if (!underHardlink) {
      fail(label, `copy.detach entry "${entry}" is not inside a copy.hardlink dir`);
    }
  }
  return { hardlink, detach, exclude };
}

function validateGates(label, value, allowed) {
  if (value === undefined) return {};
  if (!isObject(value)) fail(label, "gates must be an object");
  const gates = {};
  for (const [kind, gate] of Object.entries(value)) {
    const where = `gates.${kind}`;
    if (!GATE_KINDS.includes(kind)) {
      fail(label, `${where}: unknown gate kind (known: ${GATE_KINDS.join(", ")})`);
    }
    if (!isObject(gate)) fail(label, `${where} must be an object`);
    checkKeys(label, where, gate, GATE_KEYS);
    const argv = argvTemplate(label, `${where}.argv`, gate.argv);
    checkPlaceholders(argv, allowed, `${label} ${where}.argv`);
    for (const key of ["cwd", "stdin", "junit"]) {
      if (gate[key] === undefined) continue;
      if (typeof gate[key] !== "string" || gate[key] === "") {
        fail(label, `${where}.${key} must be a non-empty string`);
      }
      checkPlaceholders(gate[key], allowed, `${label} ${where}.${key}`);
    }
    const env = stringMap(label, `${where}.env`, gate.env, ENV_NAME_RE);
    for (const [name, template] of Object.entries(env)) {
      checkPlaceholders(template, allowed, `${label} ${where}.env.${name}`);
    }
    let failExitCodes = null;
    if (gate.failExitCodes !== undefined) {
      const codes = gate.failExitCodes;
      const ok =
        Array.isArray(codes) &&
        codes.length > 0 &&
        codes.every((code) => Number.isInteger(code) && code > 0 && code < 256);
      if (!ok) fail(label, `${where}.failExitCodes must be a non-empty array of exit codes 1-255`);
      failExitCodes = [...codes];
    }
    gates[kind] = {
      argv,
      cwd: gate.cwd ?? null,
      env,
      stdin: gate.stdin ?? null,
      junit: gate.junit ?? null,
      timeoutMs: positiveInt(label, `${where}.timeoutMs`, gate.timeoutMs),
      failExitCodes,
    };
  }
  return gates;
}

/**
 * Validate a parsed `host.json` object (without resolving `include`).
 *
 * @param {unknown} raw Parsed JSON.
 * @param {{ name: string, dir: string, label: string }} where Expected name, directory and label.
 * @returns {HostDefinition & { includeNames: Array<{ host: string, into: string }> }} Host
 *   definition whose `include` is still unresolved (`includeNames`).
 * @throws {HostConfigError} When the definition is invalid.
 */
export function validateHost(raw, { name, dir, label }) {
  if (!isObject(raw)) fail(label, "must be a JSON object");
  checkKeys(label, "host.json", raw, HOST_KEYS);
  if (raw.name !== name) fail(label, `name must equal the directory name "${name}"`);
  if (typeof raw.description !== "string" || raw.description.trim() === "") {
    fail(label, "description must be a non-empty string");
  }
  if (raw.git !== undefined && typeof raw.git !== "boolean") fail(label, "git must be a boolean");

  const vars = stringMap(label, "vars", raw.vars, VAR_NAME_RE);
  for (const [varName, template] of Object.entries(vars)) {
    if (BUILTIN_PLACEHOLDERS.includes(varName)) {
      fail(label, `vars.${varName} shadows a built-in placeholder`);
    }
    checkPlaceholders(template, BUILTIN_PLACEHOLDERS, `${label} vars.${varName}`);
  }
  const varNames = Object.keys(vars);
  const setupAllowed = [...STATIC_PLACEHOLDERS, ...varNames];
  const prepareAllowed = [...setupAllowed, "workdir"];
  const gateAllowed = [...BUILTIN_PLACEHOLDERS, ...varNames];

  const commands = (key, allowed) => {
    if (raw[key] === undefined) return [];
    if (!Array.isArray(raw[key])) fail(label, `${key} must be an array of argv arrays`);
    return raw[key].map((argv, index) => {
      argvTemplate(label, `${key}[${index}]`, argv);
      checkPlaceholders(argv, allowed, `${label} ${key}[${index}]`);
      return argv;
    });
  };

  const env = stringMap(label, "env", raw.env, ENV_NAME_RE);
  for (const [envName, template] of Object.entries(env)) {
    checkPlaceholders(template, prepareAllowed, `${label} env.${envName}`);
  }

  let includeNames = [];
  if (raw.include !== undefined) {
    if (!Array.isArray(raw.include)) fail(label, "include must be an array");
    includeNames = raw.include.map((entry, index) => {
      const where = `include[${index}]`;
      if (!isObject(entry)) fail(label, `${where} must be an object`);
      checkKeys(label, where, entry, new Set(["host", "into"]));
      if (typeof entry.host !== "string" || !HOST_NAME_RE.test(entry.host)) {
        fail(label, `${where}.host must be a host name`);
      }
      if (!isSafeRelativePath(entry.into)) fail(label, `${where}.into must be a relative path`);
      return { host: entry.host, into: entry.into };
    });
  }

  return {
    name,
    dir,
    label,
    description: raw.description,
    git: raw.git === true,
    include: [],
    includeNames,
    setup: commands("setup", setupAllowed),
    setupTimeoutMs: positiveInt(label, "setupTimeoutMs", raw.setupTimeoutMs),
    prepare: commands("prepare", prepareAllowed),
    copy: validateCopy(label, raw.copy),
    vars,
    env,
    timeoutMs: positiveInt(label, "timeoutMs", raw.timeoutMs),
    gates: validateGates(label, raw.gates, gateAllowed),
  };
}

/**
 * Load a host definition from `<harnessDir>/<name>/host.json`, resolving `include` recursively.
 *
 * @param {string} name Host name.
 * @param {{ harnessDir: string, root: string, cache?: Map<string, HostDefinition> }} options
 *   Harness directory, repository root (for labels) and an optional cache shared across calls.
 * @param {string[]} [stack] Hosts being loaded (cycle detection).
 * @returns {HostDefinition} The validated host.
 * @throws {HostConfigError} When the host is missing, invalid or part of an include cycle.
 */
export function loadHost(name, { harnessDir, root, cache = new Map() }, stack = []) {
  if (typeof name !== "string" || !HOST_NAME_RE.test(name)) {
    throw new HostConfigError(`invalid host name ${JSON.stringify(name)}`);
  }
  if (stack.includes(name)) {
    throw new HostConfigError(`host include cycle: ${[...stack, name].join(" -> ")}`);
  }
  const cached = cache.get(name);
  if (cached) return cached;
  const dir = path.join(harnessDir, name);
  const file = path.join(dir, HOST_FILE);
  const label = relPosix(root, file);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new HostConfigError(`host "${name}" not found: ${label} is missing`);
    }
    throw new HostConfigError(`${label}: cannot parse: ${err.message}`, { cause: err });
  }
  const host = validateHost(raw, { name, dir, label });
  host.include = host.includeNames.map((entry) => ({
    host: loadHost(entry.host, { harnessDir, root, cache }, [...stack, name]),
    into: entry.into,
  }));
  delete host.includeNames;
  cache.set(name, host);
  return host;
}

/**
 * Compute the placeholder values for one host command.
 *
 * Values not supplied in `context` are unavailable (`undefined`) and fail when a template uses
 * them. Host variables are expanded from the built-ins; `cliVars` override host variables.
 *
 * @param {HostDefinition} host Host definition.
 * @param {{ repoRoot: string, workdir?: string, base?: string, head?: string,
 *   rule?: { id: string, gate: { kind: string, id: string, discriminator?: string | null } },
 *   cliVars?: Record<string, string> }} context Values known at this point.
 * @returns {Record<string, string | null | undefined>} Placeholder values.
 */
export function placeholderValues(host, context) {
  const gate = context.rule?.gate;
  const values = {
    ruleId: context.rule?.id,
    gateKind: gate?.kind,
    gateId: gate?.id,
    gateIdPattern: gate ? gate.id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") : undefined,
    discriminator: gate ? (gate.discriminator ?? null) : undefined,
    workdir: context.workdir,
    base: context.base,
    head: context.head,
    hostDir: host.dir,
    repoRoot: context.repoRoot,
    node: process.execPath,
  };
  const builtins = { ...values };
  for (const [name, template] of Object.entries(host.vars)) {
    const override = context.cliVars?.[name];
    if (override !== undefined) {
      values[name] = override;
      continue;
    }
    try {
      values[name] = expandString(template, builtins, `${host.label} vars.${name}`);
    } catch {
      values[name] = undefined;
    }
  }
  return values;
}

/**
 * Every host variable name declared by a host or the hosts it includes.
 *
 * @param {HostDefinition} host Host definition.
 * @returns {Set<string>} Variable names.
 */
export function declaredVars(host) {
  const names = new Set(Object.keys(host.vars));
  for (const entry of host.include) for (const name of declaredVars(entry.host)) names.add(name);
  return names;
}
