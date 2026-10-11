#!/usr/bin/env node
/**
 * check-registry — integrity check for the rule registry (`registry/rules.json`).
 *
 * Repository-only validator: it imports `ajv` (a root devDependency) for JSON Schema
 * validation. That is the one exception to the Node.js-built-ins rule for `scripts/`; this file
 * is never shipped in the plugin.
 *
 * Checks, in order:
 *  1. schema — the registry validates against `registry/rules.schema.json` (draft 2020-12);
 *  2. unique-id — rule IDs are unique; unique-gate — no two rules share a gate identity;
 *  3. gate — every FORCED/GUARDED rule's gate exists (adapters in scripts/lib/gate-presence/);
 *  4. fixture-dir — every FORCED/GUARDED rule has a valid `test/fixtures/<track>/violations/<ID>/
 *     fixture.json` and a valid `test/fixtures/<track>/clean/fixture.json` that lists the same
 *     hosts, and every violation directory belongs to a registry rule of that track;
 *  5. decision — `docs/decisions/<NNNN>-*.md` exists for every rule's decision (an error for
 *     every rule), and is not rejected, deprecated or superseded; a proposed record only warns
 *     for a FORCED or GUARDED rule;
 *  6. configurable — every `configurable` key resolves in schemas/standard.schema.json (the
 *     manifest where adopters set it), except that a REVIEW rule may name a planned key under a
 *     field the adopter-manifest decision record adds with its gate (trackRoots, stack,
 *     decisions, rules, modules); a `rules.<RULE-ID>.…` key names a registry rule; and a rule
 *     whose text speaks of a configured value lists at least one key;
 *  7. citation — every rule ID (either form: SEC-016 or SEC_016) cited in the tracked docs,
 *     plugin, packages, .github/, schemas/, root files and the registry's own titles, summaries
 *     and evasions is in the registry (generated files and the external-facts ledger are
 *     skipped);
 *  8. fixture-report (with --fixture-report) — every FORCED/GUARDED rule has, for every host its
 *     violation fixture lists, a result that passed the clean fixture and failed the violation
 *     fixture with its ID printed, is internally consistent, names the registry's gate and was
 *     produced from the current inputs (fingerprint recomputed). A partial (filtered) report is
 *     an error unless --allow-partial is given.
 *  9. release (with --release) — every default-on rule is at its target level and its `since`
 *     is not later than VERSION, because promoting a default-on rule after the release is a MAJOR
 *     change (docs/decisions/0024-versioning.md).
 *
 * The fixture report is the `fixture-report.json` that scripts/run-fixtures.mjs writes
 * (`formatVersion` 2): one entry in `results` per rule and host, with `clean.ok` (the gate passed
 * the clean fixture) and `violation.ok` (the gate failed the violation fixture, printed the rule
 * ID and nothing unexpected), and `inputs`, the fingerprint of what the run depended on.
 *
 * Exit codes: 0 clean (warnings allowed), 1 check failed, 2 usage or internal error.
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isBinary } from "./lib/brand/binary.mjs";
import { treeFiles } from "./lib/brand/sources.mjs";
import { FixtureConfigError, validateFixtureConfig } from "./lib/fixtures/fixture-config.mjs";
import { fixtureInputsDigest } from "./lib/fixtures/inputs.mjs";
import { checkGatePresence, createPresenceContext } from "./lib/gate-presence/index.mjs";
import {
  CONFIGURED_WORDING,
  RETIRED_DECISION_STATUSES,
  RULE_ID_PATTERN,
  REGISTRY_PATH,
  RegistryError,
  SCHEMA_PATH,
  TRACKS,
  compareSemver,
  configurableKeyStatus,
  countRules,
  decisionStatus,
  effectiveTarget,
  findRuleIdCitations,
  formatFinding,
  gateLabel,
  hasPendingPromotion,
  isGated,
  lineForPointer,
  listDecisionRecords,
  loadRegistry,
  relativePosix,
  repoRootFrom,
  sortRules,
  violationFixtureDir,
} from "./lib/registry.mjs";

const TOOL = "check-registry";

export { schemaHasKey } from "./lib/registry.mjs";

/**
 * Where rule-ID citations are checked: tracked files under these root-relative directories, and
 * every tracked file at the repository root (README, CONTRIBUTING, CHANGELOG, …). Repository
 * tooling (scripts/) and tests (test/) use example and synthetic IDs, and are not in scope.
 */
export const CITATION_DIRS = Object.freeze([
  "docs",
  "plugins/cross-stack-standard",
  "packages",
  ".github",
  "schemas",
]);

/**
 * Paths skipped by the citation scan: generated from the registry (always consistent) or an
 * external-facts ledger whose rule IDs are format examples rather than citations.
 */
export const CITATION_EXCLUDES = Object.freeze([
  "docs/rules/",
  "plugins/cross-stack-standard/data/",
  "docs/maintainers/verified-versions.md",
]);

/** Manifest schema that holds every adopter-configurable key. */
export const MANIFEST_SCHEMA_PATH = "schemas/standard.schema.json";

const MAX_SCAN_BYTES = 2 * 1024 * 1024;

const HELP = `Usage: node scripts/check-registry.mjs [options]

Verifies registry/rules.json: schema validity, unique rule IDs and gate identities, a decision
record for every rule that is not rejected, deprecated or superseded, configurable keys that
resolve in the manifest schema and, for every FORCED or GUARDED rule, that its gate ships and its
fixtures are valid. Every rule ID cited in the tracked docs, plugin, packages, .github/, schemas/,
root files and registry text must be in the registry. With --fixture-report, every FORCED or
GUARDED rule must have passed its clean fixture and failed its violation fixture, with its ID
printed, on every host its violation fixture lists, in a report built from the current inputs.

Options:
  --root <dir>             Repository root (default: the repository holding this script)
  --fixture-report <file>  fixture-report.json written by scripts/run-fixtures.mjs
  --allow-partial          Accept a filtered (partial) fixture report; for local debugging only
  --release                Also apply the release gate: a default-on rule must be at its target
                           level and its since must not be later than VERSION
  --json                   Print a machine-readable report
  --verbose                Also print the evidence of every gate found
  --help                   Show this help

Exit codes: 0 clean (warnings allowed), 1 check failed, 2 usage or internal error.
`;

/**
 * Locale-independent string order (deterministic output on every machine).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A problem with the invocation or its inputs (exit code 2). */
export class UsageError extends Error {}

/**
 * @typedef {object} Finding
 * @property {string} id Rule ID, or `REGISTRY` for findings about the file as a whole.
 * @property {string} path Root-relative posix path.
 * @property {number} line 1-based line.
 * @property {string} check Check name (schema, unique-id, gate, …).
 * @property {string} message
 */

/**
 * Loads the draft 2020-12 validator from the root devDependency `ajv`.
 *
 * @returns {new (options: object) => { compile: (schema: object) => any }}
 * @throws {UsageError} When ajv is not installed.
 */
function loadAjv() {
  const require = createRequire(import.meta.url);
  try {
    const module = require("ajv/dist/2020");
    return module.default ?? module;
  } catch (error) {
    throw new UsageError(`cannot load ajv (${error.code ?? error.message}); run npm ci first`);
  }
}

/**
 * The rule ID to report for a rule, or `REGISTRY` when it has no usable ID.
 *
 * @param {any} rule
 * @returns {string}
 */
function reportId(rule) {
  return typeof rule?.id === "string" && /^\S+$/.test(rule.id) ? rule.id : "REGISTRY";
}

/**
 * Converts ajv errors into findings, replacing conditional-branch noise with the branch's
 * description from the schema.
 *
 * @param {any[]} errors ajv errors (compiled with `verbose: true`).
 * @param {import("./lib/registry.mjs").LoadedRegistry} registry
 * @param {string} registryPath
 * @returns {Finding[]}
 */
export function schemaFindings(errors, registry, registryPath) {
  const explained = errors.filter(
    (error) => error.keyword === "if" && error.parentSchema?.description,
  );
  const covered = (error) =>
    explained.some(
      (branch) =>
        error !== branch &&
        error.schemaPath.startsWith(`${branch.schemaPath.slice(0, -"/if".length)}/then`) &&
        (error.instancePath === branch.instancePath ||
          error.instancePath.startsWith(`${branch.instancePath}/`)),
    );
  const findings = [];
  const seen = new Set();
  for (const error of errors) {
    if (error.keyword === "anyOf" || covered(error)) continue;
    if (error.keyword === "if" && !error.parentSchema?.description) continue;
    if (
      error.keyword === "type" &&
      error.params?.type === "null" &&
      /\/anyOf\/\d+\/type$/.test(error.schemaPath)
    ) {
      continue;
    }
    const ruleMatch = /^\/rules\/(\d+)(\/.*)?$/.exec(error.instancePath);
    const rule = ruleMatch ? registry.rules[Number(ruleMatch[1])] : undefined;
    const where = ruleMatch ? (ruleMatch[2] ?? "") : error.instancePath;
    let message;
    if (error.keyword === "if") {
      message = error.parentSchema.description.replace(/\.$/, "");
    } else {
      message = `${where || "/"} ${error.message}`;
      if (error.params?.allowedValues) {
        message += `: ${error.params.allowedValues.map(String).join(", ")}`;
      } else if (error.params?.allowedValue !== undefined) {
        message += `: ${String(error.params.allowedValue)}`;
      } else if (error.params?.additionalProperty) {
        message += `: ${error.params.additionalProperty}`;
      }
    }
    const finding = {
      id: ruleMatch ? reportId(rule) : "REGISTRY",
      path: registryPath,
      line: lineForPointer(registry.lines, error.instancePath),
      check: "schema",
      message: `schema: ${message}`,
    };
    const key = `${finding.id}|${finding.line}|${finding.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push(finding);
    }
  }
  return findings;
}

/** Fixture report format version this checker understands. */
export const FIXTURE_REPORT_FORMAT = 2;

/**
 * @typedef {object} FixtureResult
 * @property {string} rule
 * @property {string} host
 * @property {{ kind: string, id: string, discriminator: string | null } | null} gate
 * @property {string | null} inputs Fingerprint of the run's inputs.
 * @property {string | null} error Setup or run error, when the run could not complete.
 * @property {{ ok: boolean, exitCode: number | null }} clean
 * @property {{ ok: boolean, exitCode: number | null, idPrinted: boolean, unexpectedIds: string[], reasons: string[] }} violation
 */

/**
 * Reads the fixture runner's report.
 *
 * @param {string} file Absolute path.
 * @returns {{ partial: boolean, results: FixtureResult[] }}
 * @throws {UsageError} When the file is missing, malformed or in an unknown format.
 */
export function readFixtureReport(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new UsageError(`cannot read fixture report ${file}: ${error.code ?? error.message}`);
  }
  if (data?.formatVersion !== FIXTURE_REPORT_FORMAT) {
    throw new UsageError(
      `fixture report ${file} has formatVersion ${JSON.stringify(data?.formatVersion)}; expected ${FIXTURE_REPORT_FORMAT}`,
    );
  }
  if (!Array.isArray(data.results)) {
    throw new UsageError(`fixture report ${file} has no "results" array`);
  }
  const results = data.results.map((entry, index) => {
    if (
      !entry ||
      typeof entry.rule !== "string" ||
      typeof entry.clean !== "object" ||
      typeof entry.violation !== "object"
    ) {
      throw new UsageError(
        `fixture report ${file}: results[${index}] needs "rule", "clean" and "violation"`,
      );
    }
    const exitCode = (value) => (Number.isInteger(value) ? value : null);
    const gate =
      entry.gate && typeof entry.gate === "object"
        ? {
            kind: String(entry.gate.kind),
            id: String(entry.gate.id),
            discriminator:
              entry.gate.discriminator === undefined || entry.gate.discriminator === null
                ? null
                : String(entry.gate.discriminator),
          }
        : null;
    return {
      rule: entry.rule,
      host: typeof entry.host === "string" && entry.host ? entry.host : "default",
      gate,
      inputs: typeof entry.inputs === "string" ? entry.inputs : null,
      error: typeof entry.error === "string" && entry.error ? entry.error : null,
      clean: { ok: entry.clean?.ok === true, exitCode: exitCode(entry.clean?.exitCode) },
      violation: {
        ok: entry.violation?.ok === true,
        exitCode: exitCode(entry.violation?.exitCode),
        idPrinted: entry.violation?.idPrinted === true,
        unexpectedIds: Array.isArray(entry.violation?.unexpectedIds)
          ? entry.violation.unexpectedIds.map(String)
          : [],
        reasons: Array.isArray(entry.violation?.reasons) ? entry.violation.reasons.map(String) : [],
      },
    };
  });
  return { partial: data.partial === true, results };
}

/**
 * Problems of one fixture result for a gated rule (empty when clean passed and violation failed
 * with the ID printed).
 *
 * @param {FixtureResult} result
 * @param {string} ruleId
 * @returns {string[]}
 */
export function fixtureResultProblems(result, ruleId, expected = {}) {
  const host = `on host ${result.host}`;
  if (result.error) {
    return [`the fixture run did not complete ${host}: ${result.error.split("\n")[0]}`];
  }
  const problems = [];
  // The booleans are not trusted on their own: they must agree with the recorded details.
  if (result.clean.ok && result.clean.exitCode !== 0) {
    problems.push(`the result ${host} says the clean run passed, but its exit code is not 0`);
  }
  if (
    result.violation.ok &&
    (result.violation.exitCode === 0 ||
      result.violation.exitCode === null ||
      !result.violation.idPrinted ||
      result.violation.unexpectedIds.length > 0)
  ) {
    problems.push(
      `the result ${host} says the violation was caught, but its exit code, printed ID or ` +
        "unexpected IDs say otherwise",
    );
  }
  if (expected.gate) {
    const want = gateLabel(expected.gate);
    const got = result.gate
      ? gateLabel({ ...result.gate, discriminator: result.gate.discriminator ?? undefined })
      : "no gate";
    if (want !== got)
      problems.push(`the result ${host} ran gate ${got}, the registry names ${want}`);
  }
  if (expected.inputs && result.inputs !== expected.inputs) {
    problems.push(
      `the result ${host} is stale: its inputs fingerprint does not match the current rule, ` +
        "fixtures and host; run scripts/run-fixtures.mjs again",
    );
  }
  if (!result.clean.ok) {
    const exit = result.clean.exitCode === null ? "" : ` (exit ${result.clean.exitCode})`;
    problems.push(`the gate did not pass the clean fixture ${host}${exit}`);
  }
  if (!result.violation.ok) {
    if (result.violation.exitCode === 0) {
      problems.push(`the gate passed the violation fixture ${host}`);
    } else if (!result.violation.idPrinted) {
      problems.push(`the violation run ${host} did not print ${ruleId}`);
    } else {
      problems.push(
        `the violation run ${host} failed: ${result.violation.reasons[0] ?? "see the fixture report"}`,
      );
    }
  }
  return problems;
}

/**
 * Tracked text files in the citation scope, root-relative and posix.
 *
 * @param {string} root
 * @returns {string[]}
 */
function citationFiles(root) {
  const inScope = (file) =>
    !file.includes("/") || CITATION_DIRS.some((dir) => file.startsWith(`${dir}/`));
  const excluded = (file) =>
    CITATION_EXCLUDES.some((exclude) =>
      exclude.endsWith("/") ? file.startsWith(exclude) : file === exclude,
    );
  return treeFiles(root)
    .files.filter((entry) => !entry.directory && !entry.nameOnly && entry.abs)
    .map((entry) => entry.path)
    .filter((file) => inScope(file) && !excluded(file))
    .sort();
}

/**
 * Problems with a gated rule's fixture definitions: the violation fixture.json and the track's
 * clean fixture.json must exist, validate against the fixture schema, and the clean fixture must
 * list every host the violation lists.
 *
 * @param {string} root
 * @param {{ id: string, track: string }} rule
 * @param {Map<string, unknown>} ids Registry rule IDs.
 * @returns {string[]}
 */
export function fixtureDirProblems(root, rule, ids) {
  const knownIds = new Set(ids.keys());
  const violationDir = violationFixtureDir(rule);
  const cleanDir = `test/fixtures/${rule.track}/clean`;
  const load = (dir, role) => {
    const file = `${dir}/fixture.json`;
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(root, ...file.split("/")), "utf8"));
    } catch (error) {
      return { problem: `${file} ${error.code === "ENOENT" ? "is missing" : `is not valid JSON`}` };
    }
    try {
      return { config: validateFixtureConfig(raw, { label: file, role, knownIds }) };
    } catch (error) {
      if (error instanceof FixtureConfigError) return { problem: error.message };
      throw error;
    }
  };
  const problems = [];
  const violation = load(violationDir, "violation");
  const clean = load(cleanDir, "clean");
  if (violation.problem) problems.push(violation.problem);
  if (clean.problem) problems.push(clean.problem);
  if (violation.config && clean.config) {
    const missing = violation.config.hosts.filter((host) => !clean.config.hosts.includes(host));
    if (missing.length > 0) {
      problems.push(`${cleanDir}/fixture.json does not list host(s) ${missing.join(", ")}`);
    }
  }
  return problems;
}

/**
 * Hosts a rule's violation fixture lists (empty when it cannot be read).
 *
 * @param {string} root
 * @param {{ id: string, track: string }} rule
 * @returns {string[]}
 */
function violationFixtureHosts(root, rule) {
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(root, ...violationFixtureDir(rule).split("/"), "fixture.json"),
        "utf8",
      ),
    );
    return Array.isArray(raw.hosts) ? raw.hosts.filter((host) => typeof host === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Runs every registry check.
 *
 * @param {{ root: string, fixtureReport?: string, locations?: object }} options
 *   `fixtureReport` is an absolute path; `locations` overrides gate-presence locations.
 * @returns {object} The report (see `--json`).
 * @throws {UsageError} On a missing validator, schema compile error or malformed fixture report.
 */
export function checkRegistry({
  root,
  fixtureReport,
  locations,
  allowPartial = false,
  release = false,
}) {
  /** @type {Finding[]} */
  const errors = [];
  /** @type {Finding[]} */
  const warnings = [];
  const gates = [];
  const registryPath = REGISTRY_PATH;

  let registry;
  try {
    registry = loadRegistry(root, registryPath);
  } catch (error) {
    if (!(error instanceof RegistryError)) throw error;
    errors.push({
      id: "REGISTRY",
      path: error.file,
      line: error.line,
      check: "registry",
      message: error.message,
    });
    return buildReport({ root, registry: null, errors, warnings, gates, fixtureReport });
  }

  // 1. Schema.
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(path.join(root, SCHEMA_PATH), "utf8"));
  } catch (error) {
    errors.push({
      id: "REGISTRY",
      path: SCHEMA_PATH,
      line: 1,
      check: "schema",
      message: `cannot read the schema: ${error.code ?? error.message}`,
    });
  }
  if (schema) {
    const Ajv2020 = loadAjv();
    let validate;
    try {
      validate = new Ajv2020({ allErrors: true, strict: true, verbose: true }).compile(schema);
    } catch (error) {
      throw new UsageError(`${SCHEMA_PATH} does not compile: ${error.message}`);
    }
    if (!validate(registry.data)) {
      errors.push(...schemaFindings(validate.errors, registry, registryPath));
    }
  }

  const rules = registry.rules;
  const lineOf = (index, property = "") =>
    lineForPointer(registry.lines, `/rules/${index}${property}`);
  const validRules = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => typeof rule?.id === "string" && RULE_ID_PATTERN.test(rule.id));
  const ids = new Map();

  // 2. Unique rule IDs and gate identities.
  for (const { rule, index } of validRules) {
    const first = ids.get(rule.id);
    if (first === undefined) {
      ids.set(rule.id, { rule, index });
      continue;
    }
    errors.push({
      id: rule.id,
      path: registryPath,
      line: lineOf(index, "/id"),
      check: "unique-id",
      message: `unique-id: duplicate rule ID (first defined at line ${lineOf(first.index, "/id")})`,
    });
  }
  const gateOwners = new Map();
  for (const { rule, index } of validRules) {
    const gate = rule.gate;
    if (
      !gate ||
      typeof gate !== "object" ||
      typeof gate.kind !== "string" ||
      typeof gate.id !== "string"
    ) {
      continue;
    }
    const key = gateLabel(gate);
    const owner = gateOwners.get(key);
    if (owner === undefined) {
      gateOwners.set(key, rule.id);
    } else if (owner !== rule.id) {
      errors.push({
        id: rule.id,
        path: registryPath,
        line: lineOf(index, "/gate"),
        check: "unique-gate",
        message: `unique-gate: gate ${key} already enforces ${owner}; one gate identity enforces one rule (add a discriminator)`,
      });
    }
  }

  // 3–5. Gate presence, violation fixture directory, decision record.
  const presence = createPresenceContext({ root, locations });
  const decisions = listDecisionRecords(root);
  let manifestSchema = null;
  try {
    manifestSchema = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_SCHEMA_PATH), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      errors.push({
        id: "REGISTRY",
        path: MANIFEST_SCHEMA_PATH,
        line: 1,
        check: "configurable",
        message: `configurable: cannot read the manifest schema: ${error.code ?? error.message}`,
      });
    }
  }
  for (const { rule, index } of validRules) {
    if (ids.get(rule.id)?.index !== index) continue;
    const gated = isGated(rule);
    if (gated && rule.gate && typeof rule.gate === "object") {
      const result = checkGatePresence(rule, presence);
      gates.push({
        id: rule.id,
        line: lineOf(index, "/gate"),
        gate: gateLabel(rule.gate),
        present: result.present,
        evidence: result.evidence,
      });
      if (!result.present) {
        errors.push({
          id: rule.id,
          path: registryPath,
          line: lineOf(index, "/gate"),
          check: "gate",
          message: `gate: ${gateLabel(rule.gate)} not found — ${result.evidence}`,
        });
      }
    }
    if (gated && TRACKS.includes(rule.track)) {
      for (const problem of fixtureDirProblems(root, rule, ids)) {
        errors.push({
          id: rule.id,
          path: registryPath,
          line: lineOf(index),
          check: "fixture-dir",
          message: `fixture-dir: ${problem}`,
        });
      }
    }
    if (typeof rule.decision === "string" && /^\d{4}$/.test(rule.decision)) {
      const records = decisions.records.get(rule.decision) ?? [];
      const finding = {
        id: rule.id,
        path: registryPath,
        line: lineOf(index, "/decision"),
        check: "decision",
      };
      if (records.length === 0) {
        errors.push({
          ...finding,
          message: decisions.exists
            ? `decision: no decision record docs/decisions/${rule.decision}-*.md`
            : `decision: no decision record docs/decisions/${rule.decision}-*.md (docs/decisions/ does not exist yet)`,
        });
      } else if (records.length > 1) {
        errors.push({
          ...finding,
          message: `decision: decision ${rule.decision} is ambiguous: ${records.join(", ")}`,
        });
      } else {
        const status = decisionStatus(
          fs.readFileSync(path.join(root, ...records[0].split("/")), "utf8"),
        );
        const retired = RETIRED_DECISION_STATUSES.find((word) => status?.startsWith(word));
        if (retired) {
          errors.push({
            ...finding,
            message: `decision: ${records[0]} is ${status}; cite the record that replaces it`,
          });
        } else if (gated && status?.startsWith("proposed")) {
          warnings.push({
            ...finding,
            message: `warning: decision: ${records[0]} is still proposed for a ${rule.enforcement} rule`,
          });
        }
      }
    }
    if (manifestSchema && Array.isArray(rule.configurable)) {
      rule.configurable.forEach((key, keyIndex) => {
        if (typeof key !== "string") return;
        const status = configurableKeyStatus(manifestSchema, key);
        const at = {
          id: rule.id,
          path: registryPath,
          line: lineOf(index, `/configurable/${keyIndex}`),
          check: "configurable",
        };
        const owner = /^rules\.([^.]+)\./.exec(key)?.[1];
        if (status === "unknown") {
          errors.push({
            ...at,
            message: `configurable: ${key} is not a key of ${MANIFEST_SCHEMA_PATH}, where adopters would set it`,
          });
        } else if (status === "planned" && gated) {
          errors.push({
            ...at,
            message: `configurable: ${key} is not a key of ${MANIFEST_SCHEMA_PATH} yet; a ${rule.enforcement} rule's keys must be declared there, so the change that promotes it adds the key`,
          });
        } else if (owner && !ids.has(owner)) {
          errors.push({
            ...at,
            message: `configurable: ${key} names ${owner}, which is not in the registry`,
          });
        }
      });
    }
    const texts = [rule.title, rule.summary, rule.adoption].filter((t) => typeof t === "string");
    if (
      texts.some((text) => CONFIGURED_WORDING.test(text)) &&
      !(Array.isArray(rule.configurable) && rule.configurable.length > 0)
    ) {
      errors.push({
        id: rule.id,
        path: registryPath,
        line: lineOf(index),
        check: "configurable",
        message:
          "configurable: the rule speaks of a configured value but lists no configurable key; name the manifest key adopters set",
      });
    }
    for (const [field, texts] of [
      ["title", [rule.title]],
      ["summary", [rule.summary]],
      ["evasions", Array.isArray(rule.evasions) ? rule.evasions : []],
    ]) {
      for (const text of texts) {
        if (typeof text !== "string") continue;
        for (const citation of findRuleIdCitations(text)) {
          if (ids.has(citation.id)) continue;
          errors.push({
            id: citation.id,
            path: registryPath,
            line: lineOf(index, `/${field}`),
            check: "citation",
            message: `citation: ${citation.id} (in the ${field}) is not in the registry`,
          });
        }
      }
    }
  }

  // 4b. Violation directories that belong to no registry rule of that track.
  for (const track of TRACKS) {
    const base = `test/fixtures/${track}/violations`;
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(root, ...base.split("/")), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = `${base}/${entry.name}`;
      const owner = ids.get(entry.name)?.rule;
      let message = null;
      if (!RULE_ID_PATTERN.test(entry.name)) message = `${entry.name} is not a rule ID`;
      else if (!owner) message = `no rule ${entry.name} in the registry`;
      else if (owner.track !== track) {
        message = `${entry.name} belongs to track ${owner.track}; move it to test/fixtures/${owner.track}/violations/${entry.name}/`;
      }
      if (message) {
        errors.push({
          id: RULE_ID_PATTERN.test(entry.name) ? entry.name : "REGISTRY",
          path: `${dir}/`,
          line: 1,
          check: "fixture-dir",
          message: `fixture-dir: ${message}`,
        });
      }
    }
  }

  // 9. Release gate: what a default-on rule may claim in the version being released.
  if (release) {
    let version = null;
    try {
      version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
    } catch (error) {
      errors.push({
        id: "REGISTRY",
        path: "VERSION",
        line: 1,
        check: "release",
        message: `release: cannot read VERSION: ${error.code ?? error.message}`,
      });
    }
    if (version) {
      for (const { rule, index } of validRules) {
        if (ids.get(rule.id)?.index !== index || rule.defaultEnabled !== true) continue;
        const at = { id: rule.id, path: registryPath, line: lineOf(index), check: "release" };
        if (typeof rule.since === "string" && compareSemver(rule.since, version) > 0) {
          errors.push({
            ...at,
            message: `release: a default-on rule cannot ship in ${version} while its since is ${rule.since}; set defaultEnabled to false until that version`,
          });
        } else if (effectiveTarget(rule) !== rule.enforcement) {
          errors.push({
            ...at,
            message: `release: a default-on rule ships as ${rule.enforcement} below its target ${effectiveTarget(rule)}, and promoting a default-on rule later is a MAJOR change; ship its gate and fixtures, or set defaultEnabled to false`,
          });
        }
      }
    }
  }

  // 7. Rule IDs cited in the tracked docs, plugin, packages, .github/, schemas/ and root files.
  for (const file of citationFiles(root)) {
    const absolute = path.join(root, ...file.split("/"));
    let text;
    try {
      if (fs.statSync(absolute).size > MAX_SCAN_BYTES) continue;
      const buffer = fs.readFileSync(absolute);
      if (isBinary(buffer)) continue;
      text = buffer.toString("utf8");
    } catch {
      continue;
    }
    for (const citation of findRuleIdCitations(text)) {
      if (ids.has(citation.id)) continue;
      errors.push({
        id: citation.id,
        path: file,
        line: citation.line,
        check: "citation",
        message: `citation: ${citation.id} is not in the registry`,
      });
    }
  }

  // 8. Fixture results.
  if (fixtureReport) {
    const report = readFixtureReport(fixtureReport);
    const reportPath = relativePosix(root, fixtureReport);
    const byRule = new Map();
    for (const result of report.results) {
      const list = byRule.get(result.rule) ?? [];
      list.push(result);
      byRule.set(result.rule, list);
    }
    if (report.partial) {
      const finding = { id: "REGISTRY", path: reportPath, line: 1, check: "fixture-report" };
      if (allowPartial) {
        warnings.push({
          ...finding,
          message:
            "warning: fixture-report: the report is partial (the run was filtered); rules outside the filter have no results",
        });
      } else {
        errors.push({
          ...finding,
          message:
            "fixture-report: the report is partial (run-fixtures was filtered with --rule, --track or --host); " +
            "run the whole matrix, or pass --allow-partial for local debugging",
        });
      }
    }
    for (const { rule, index } of validRules) {
      if (!isGated(rule) || ids.get(rule.id)?.index !== index) continue;
      const at = { id: rule.id, path: registryPath, line: lineOf(index), check: "fixture-report" };
      const own = byRule.get(rule.id) ?? [];
      if (own.length === 0) {
        errors.push({
          ...at,
          message: `fixture-report: no result for ${rule.id} in ${reportPath}`,
        });
        continue;
      }
      const hosts = violationFixtureHosts(root, rule);
      const reported = new Set(own.map((result) => result.host));
      for (const host of hosts) {
        if (!reported.has(host) && !(report.partial && allowPartial)) {
          errors.push({
            ...at,
            message: `fixture-report: no result for ${rule.id} on host ${host}, which its violation fixture lists`,
          });
        }
      }
      for (const result of own) {
        const inputs = fixtureInputsDigest({
          rule,
          hostName: result.host,
          fixturesDir: path.join(root, "test", "fixtures"),
          harnessDir: path.join(root, "test", "harness"),
        });
        for (const problem of fixtureResultProblems(result, rule.id, { gate: rule.gate, inputs })) {
          errors.push({ ...at, message: `fixture-report: ${problem}` });
        }
      }
    }
    for (const ruleId of [...byRule.keys()].sort()) {
      if (ids.has(ruleId)) continue;
      warnings.push({
        id: RULE_ID_PATTERN.test(ruleId) ? ruleId : "REGISTRY",
        path: reportPath,
        line: 1,
        check: "fixture-report",
        message: `warning: fixture-report: results for ${ruleId}, which is not in the registry`,
      });
    }
  }

  return buildReport({ root, registry, errors, warnings, gates, fixtureReport });
}

/**
 * Assembles the report object shared by the human and JSON outputs.
 *
 * @param {object} parts
 * @returns {object}
 */
function buildReport({ root, registry, errors, warnings, gates, fixtureReport }) {
  const order = (a, b) =>
    compareText(a.path, b.path) ||
    a.line - b.line ||
    compareText(a.id, b.id) ||
    compareText(a.message, b.message);
  const rules = registry ? registry.rules.filter((rule) => rule && typeof rule === "object") : [];
  const pending = sortRules(
    rules.filter((rule) => typeof rule.id === "string" && hasPendingPromotion(rule)),
  );
  return {
    tool: TOOL,
    ok: errors.length === 0,
    registry: REGISTRY_PATH,
    counts: countRules(rules),
    errors: errors.sort(order),
    warnings: warnings.sort(order),
    gates: gates.sort((a, b) => compareText(a.id, b.id)),
    pendingPromotions: pending.map((rule) => ({
      id: rule.id,
      enforcement: rule.enforcement,
      targetEnforcement: effectiveTarget(rule),
      gate: rule.gate ? gateLabel(rule.gate) : null,
    })),
    fixtureReport: {
      checked: Boolean(fixtureReport),
      path: fixtureReport ? relativePosix(root, fixtureReport) : null,
    },
  };
}

/**
 * Human-readable report lines.
 *
 * @param {object} report
 * @param {{ verbose?: boolean }} [options]
 * @returns {string[]}
 */
export function formatReport(report, { verbose = false } = {}) {
  const lines = [...report.errors, ...report.warnings]
    .sort((a, b) => compareText(a.path, b.path) || a.line - b.line || compareText(a.id, b.id))
    .map(formatFinding);
  if (verbose) {
    for (const gate of report.gates.filter((entry) => entry.present)) {
      lines.push(`${gate.id} ${report.registry}:${gate.line} ok: ${gate.gate} — ${gate.evidence}`);
    }
  }
  const { counts } = report;
  const levels = `${counts.byEnforcement.FORCED} FORCED, ${counts.byEnforcement.GUARDED} GUARDED, ${counts.byEnforcement.REVIEW} REVIEW`;
  const fixtures = report.fixtureReport.checked
    ? "fixture results checked"
    : "fixture results not checked (pass --fixture-report)";
  lines.push(
    `${TOOL}: ${counts.total} rules (${levels}; ${counts.pendingPromotion} pending promotion); ${fixtures}; ` +
      `${report.errors.length} error(s), ${report.warnings.length} warning(s)`,
  );
  return lines;
}

/**
 * CLI entry point.
 *
 * @param {string[]} argv Arguments after the script path.
 * @returns {number} Exit code.
 */
export function main(argv) {
  let options;
  try {
    ({ values: options } = parseArgs({
      args: argv,
      options: {
        root: { type: "string" },
        "fixture-report": { type: "string" },
        "allow-partial": { type: "boolean", default: false },
        release: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        verbose: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    process.stderr.write(`${TOOL}: ${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const root = options.root ? path.resolve(options.root) : repoRootFrom(import.meta.url, 1);
  try {
    const report = checkRegistry({
      root,
      fixtureReport: options["fixture-report"]
        ? path.resolve(options["fixture-report"])
        : undefined,
      allowPartial: options["allow-partial"],
      release: options.release,
    });
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(`${formatReport(report, { verbose: options.verbose }).join("\n")}\n`);
    return report.ok ? 0 : 1;
  } catch (error) {
    const message =
      error instanceof UsageError
        ? error.message
        : `internal error: ${error.stack ?? error.message}`;
    process.stderr.write(`${TOOL}: ${message}\n`);
    return 2;
  }
}

/**
 * Whether this module is the process entry point (symlinks resolved).
 *
 * @returns {boolean}
 */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = main(process.argv.slice(2));
}
