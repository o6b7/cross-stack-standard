/**
 * Registry access for the fixture runner: load `registry/rules.json` and decide which rules the
 * fail-then-pass matrix covers. Rules always come from the registry, never from fixture folder
 * listings.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { RULE_ID_RE, parseRuleId } from "./ids.mjs";

/** Enforcement levels that require a gate plus clean and violation fixtures. */
export const ENFORCED_LEVELS = Object.freeze(["FORCED", "GUARDED"]);

/** Tracks a rule can belong to (also the directory names under `test/fixtures/`). */
export const TRACKS = Object.freeze(["laravel", "web", "mobile", "client", "shared"]);

/** Error raised when the registry cannot be read or is malformed. */
export class RegistryError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RegistryError";
  }
}

/**
 * @typedef {object} RegistryRule
 * @property {string} id Canonical rule id.
 * @property {string} track Track.
 * @property {string} enforcement Current enforcement level.
 * @property {string} [targetEnforcement] Target enforcement level.
 * @property {{ kind: string, id: string, discriminator?: string | null } | null} gate Gate.
 *
 * @typedef {object} Registry
 * @property {RegistryRule[]} rules Rules in registry order.
 * @property {Map<string, RegistryRule>} byId Rules by id.
 * @property {string[]} prefixes Id prefixes present in the registry.
 */

/**
 * Load `registry/rules.json`. Accepts either an array of rules or an object with a `rules`
 * array. Only the fields the runner needs are checked here; `check-registry` validates the rest.
 *
 * @param {string} file Absolute path of the registry file.
 * @param {string} [label] Path used in messages.
 * @returns {Registry} Parsed registry.
 * @throws {RegistryError} When the file is missing, unparsable or malformed.
 */
export function loadRegistry(file, label = file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    const reason = err.code === "ENOENT" ? "file not found" : err.message;
    throw new RegistryError(`${label}: cannot read the registry: ${reason}`, { cause: err });
  }
  const rules = Array.isArray(data) ? data : data?.rules;
  if (!Array.isArray(rules)) {
    throw new RegistryError(`${label}: expected an array of rules or an object with "rules"`);
  }
  const byId = new Map();
  const prefixes = new Set();
  rules.forEach((rule, index) => {
    const where = `${label}: rules[${index}]`;
    if (typeof rule !== "object" || rule === null) {
      throw new RegistryError(`${where} is not an object`);
    }
    if (typeof rule.id !== "string" || !RULE_ID_RE.test(rule.id)) {
      throw new RegistryError(`${where} has an invalid id ${JSON.stringify(rule.id)}`);
    }
    if (byId.has(rule.id)) throw new RegistryError(`${where}: duplicate id ${rule.id}`);
    if (typeof rule.track !== "string" || rule.track === "") {
      throw new RegistryError(`${where} (${rule.id}) has no track`);
    }
    if (typeof rule.enforcement !== "string") {
      throw new RegistryError(`${where} (${rule.id}) has no enforcement`);
    }
    const gate = rule.gate ?? null;
    if (gate !== null && (typeof gate.kind !== "string" || typeof gate.id !== "string")) {
      throw new RegistryError(`${where} (${rule.id}) has a gate without a kind and an id`);
    }
    byId.set(rule.id, rule);
    prefixes.add(parseRuleId(rule.id).prefix);
  });
  return { rules, byId, prefixes: [...prefixes] };
}

/**
 * Whether the rule's current enforcement requires fixtures.
 *
 * @param {RegistryRule} rule Rule.
 * @returns {boolean} True for FORCED and GUARDED rules.
 */
export function isEnforced(rule) {
  return ENFORCED_LEVELS.includes(rule.enforcement);
}

/**
 * Whether the rule is enforced now or targets enforcement.
 *
 * @param {RegistryRule} rule Rule.
 * @returns {boolean} True when `enforcement` or `targetEnforcement` is FORCED or GUARDED.
 */
export function isEnforcedOrTargeted(rule) {
  return isEnforced(rule) || ENFORCED_LEVELS.includes(rule.targetEnforcement);
}

/**
 * Fixture directories of a rule.
 *
 * @param {string} fixturesDir Absolute `test/fixtures` directory.
 * @param {RegistryRule} rule Rule.
 * @returns {{ clean: string, cleanOverlay: string, violation: string }} Absolute directories.
 */
export function fixtureDirs(fixturesDir, rule) {
  const trackDir = path.join(fixturesDir, rule.track);
  return {
    clean: path.join(trackDir, "clean"),
    cleanOverlay: path.join(trackDir, "clean-overlays", rule.id),
    violation: path.join(trackDir, "violations", rule.id),
  };
}

/**
 * @typedef {object} Selection
 * @property {RegistryRule[]} selected Rules to run (their violation fixture exists).
 * @property {RegistryRule[]} missing Selected rules without a violation fixture that must have one
 *   (currently FORCED/GUARDED, or named with `--rule`).
 * @property {string[]} skipped Rules that only target enforcement and have no fixture yet.
 */

/**
 * Select the rules the matrix runs.
 *
 * Without filters: every rule whose `enforcement` or `targetEnforcement` is FORCED or GUARDED.
 * `ruleIds` restricts the run to those rules (whatever their enforcement); `track` restricts it
 * to one track.
 *
 * @param {Registry} registry Loaded registry.
 * @param {{ fixturesDir: string, ruleIds?: string[], track?: string | null }} options Filters.
 * @returns {Selection} Selection.
 * @throws {RegistryError} When a requested rule id is not in the registry.
 */
export function selectRules(registry, { fixturesDir, ruleIds = [], track = null }) {
  for (const id of ruleIds) {
    if (!registry.byId.has(id)) throw new RegistryError(`rule ${id} is not in the registry`);
  }
  const explicit = new Set(ruleIds);
  const candidates = registry.rules.filter((rule) => {
    if (explicit.size > 0 && !explicit.has(rule.id)) return false;
    if (track && rule.track !== track) return false;
    return explicit.size > 0 || isEnforcedOrTargeted(rule);
  });
  const selection = { selected: [], missing: [], skipped: [] };
  for (const rule of candidates) {
    const { violation } = fixtureDirs(fixturesDir, rule);
    if (fs.existsSync(violation)) selection.selected.push(rule);
    else if (isEnforced(rule) || explicit.has(rule.id)) selection.missing.push(rule);
    else selection.skipped.push(rule.id);
  }
  return selection;
}
