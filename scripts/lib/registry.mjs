/**
 * Shared helpers for the rule registry (`registry/rules.json`): constants, loading with line
 * lookup, ordering, counting and rule-ID citation scanning. Node.js built-ins only.
 *
 * @module scripts/lib/registry
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Registry file, relative to the repository root. */
export const REGISTRY_PATH = "registry/rules.json";

/** Registry schema, relative to the repository root. */
export const SCHEMA_PATH = "registry/rules.schema.json";

/** Architecture decision records, relative to the repository root. */
export const DECISIONS_DIR = "docs/decisions";

/** Rule-ID prefixes in their canonical display order. */
export const RULE_PREFIXES = Object.freeze(["BE", "WEB", "MOB", "SEC", "I18N", "UI", "PROC", "CI"]);

/** A complete rule ID, e.g. `PROC-014`. */
export const RULE_ID_PATTERN = /^(BE|WEB|MOB|SEC|I18N|UI|PROC|CI)-(\d{3})$/;

/**
 * Rule tracks in display order. `client` holds rules for both JavaScript client tracks (web and
 * mobile) and never the Laravel track; `shared` holds rules for every project, whatever its
 * tracks. A project manifest declares only laravel, web and mobile; client and shared are rule
 * scopes (docs/decisions/0009-tracks-profiles-and-scope.md).
 */
export const TRACKS = Object.freeze(["laravel", "web", "mobile", "client", "shared"]);

/** Human names of the tracks. */
export const TRACK_TITLES = Object.freeze({
  laravel: "Laravel",
  web: "Web",
  mobile: "Mobile",
  client: "Web and mobile",
  shared: "Shared",
});

/**
 * The Tier-1 invariants, numbered as in the tier model decision record
 * (docs/decisions/0008-tiers-and-invariants.md). A tier 1 rule names one of them in its
 * `invariant` field.
 */
export const INVARIANTS = Object.freeze(
  [
    "Stack-first",
    "Server authority",
    "Credentials are short-lived, revocable and never script-readable",
    "Untrusted input is hardened at the boundary",
    "One generated wire contract, when the api-contract module is on",
    "Secrets and the supply chain are protected",
    "The project is declared and green",
    "Gates are never weakened",
    "The locale contract, when the i18n module is on",
    "Tenant isolation, when the tenancy module is on",
  ].map((title, index) => Object.freeze({ id: index + 1, title })),
);

/** Decision record that defines the tier model and the Tier-1 invariants. */
export const TIER_DECISION = "0008";

/**
 * Title of a Tier-1 invariant, or `Invariant <n>` for a number outside the list.
 *
 * @param {number} id
 * @returns {string}
 */
export function invariantTitle(id) {
  return INVARIANTS.find((invariant) => invariant.id === id)?.title ?? `Invariant ${id}`;
}

/** Enforcement levels, strongest first. */
export const ENFORCEMENT_LEVELS = Object.freeze(["FORCED", "GUARDED", "REVIEW"]);

/** Levels that claim a working gate and therefore need a gate and fixtures. */
export const GATED_LEVELS = Object.freeze(["FORCED", "GUARDED"]);

/** Gate kinds known to the registry. */
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

const LEVEL_RANK = Object.freeze({ REVIEW: 0, GUARDED: 1, FORCED: 2 });

/** Error raised when the registry file cannot be read or parsed. */
export class RegistryError extends Error {
  /**
   * @param {string} message
   * @param {{ file?: string, line?: number, cause?: unknown }} [details]
   */
  constructor(message, details = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "RegistryError";
    this.file = details.file ?? REGISTRY_PATH;
    this.line = details.line ?? 1;
  }
}

/**
 * Repository root for a script that lives `depth` directories below it.
 *
 * @param {string} importMetaUrl The calling module's `import.meta.url`.
 * @param {number} [depth=1] Directories between the root and the calling file.
 * @returns {string} Absolute path of the repository root.
 */
export function repoRootFrom(importMetaUrl, depth = 1) {
  let dir = path.dirname(fileURLToPath(importMetaUrl));
  for (let i = 0; i < depth; i += 1) dir = path.dirname(dir);
  return dir;
}

/**
 * Converts a platform path to forward slashes.
 *
 * @param {string} p
 * @returns {string}
 */
export function toPosix(p) {
  return p.split(path.sep).join("/");
}

/**
 * Path of `absolute` relative to `root`, with `/` separators.
 *
 * @param {string} root
 * @param {string} absolute
 * @returns {string}
 */
export function relativePosix(root, absolute) {
  return toPosix(path.relative(root, absolute));
}

/**
 * Maps every JSON value in `raw` to the 1-based line where it starts, keyed by JSON Pointer
 * (`""` for the document, `/rules/0/gate` for a nested value). Assumes `raw` is valid JSON.
 *
 * @param {string} raw JSON text.
 * @returns {Map<string, number>}
 */
export function jsonPointerLines(raw) {
  const lines = new Map();
  let i = 0;
  let line = 1;
  const escape = (key) => key.replace(/~/g, "~0").replace(/\//g, "~1");

  const skipWhitespace = () => {
    while (i < raw.length && /\s/.test(raw[i])) {
      if (raw[i] === "\n") line += 1;
      i += 1;
    }
  };
  const readString = () => {
    let out = "";
    i += 1;
    while (i < raw.length && raw[i] !== '"') {
      if (raw[i] === "\\") {
        out += raw.slice(i, i + 2);
        i += 2;
      } else {
        out += raw[i];
        i += 1;
      }
    }
    i += 1;
    return JSON.parse(`"${out}"`);
  };
  const readValue = (pointer) => {
    skipWhitespace();
    lines.set(pointer, line);
    const ch = raw[i];
    if (ch === "{") {
      i += 1;
      skipWhitespace();
      if (raw[i] === "}") {
        i += 1;
        return;
      }
      for (;;) {
        skipWhitespace();
        const key = readString();
        skipWhitespace();
        i += 1; // ':'
        readValue(`${pointer}/${escape(key)}`);
        skipWhitespace();
        if (raw[i] === ",") {
          i += 1;
          continue;
        }
        i += 1; // '}'
        return;
      }
    }
    if (ch === "[") {
      i += 1;
      skipWhitespace();
      if (raw[i] === "]") {
        i += 1;
        return;
      }
      for (let index = 0; ; index += 1) {
        readValue(`${pointer}/${index}`);
        skipWhitespace();
        if (raw[i] === ",") {
          i += 1;
          continue;
        }
        i += 1; // ']'
        return;
      }
    }
    if (ch === '"') {
      readString();
      return;
    }
    while (i < raw.length && !/[\s,\]}]/.test(raw[i])) i += 1;
  };

  readValue("");
  return lines;
}

/**
 * Line of the value at `pointer`, or of its nearest ancestor that has one.
 *
 * @param {Map<string, number>} lines Result of {@link jsonPointerLines}.
 * @param {string} pointer JSON Pointer.
 * @returns {number} 1-based line (1 when nothing matches).
 */
export function lineForPointer(lines, pointer) {
  let current = pointer;
  for (;;) {
    if (lines.has(current)) return lines.get(current);
    if (current === "") return 1;
    current = current.slice(0, current.lastIndexOf("/"));
  }
}

/**
 * @typedef {object} LoadedRegistry
 * @property {string} file Absolute path of the registry file.
 * @property {string} raw File contents.
 * @property {any} data Parsed JSON.
 * @property {any[]} rules `data.rules` when it is an array, otherwise `[]`.
 * @property {Map<string, number>} lines JSON Pointer → line.
 */

/**
 * Reads and parses the registry.
 *
 * @param {string} root Repository root.
 * @param {string} [relPath] Registry path relative to `root`.
 * @returns {LoadedRegistry}
 * @throws {RegistryError} When the file is missing or is not valid JSON.
 */
export function loadRegistry(root, relPath = REGISTRY_PATH) {
  const file = path.resolve(root, relPath);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    throw new RegistryError(`cannot read ${relPath}: ${error.code ?? error.message}`, {
      file: relPath,
      cause: error,
    });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const { line, column } = jsonErrorPosition(raw);
    throw new RegistryError(`${relPath} is not valid JSON (line ${line}, column ${column})`, {
      file: relPath,
      line,
      cause: error,
    });
  }
  return {
    file,
    raw,
    data,
    rules: Array.isArray(data?.rules) ? data.rules : [],
    lines: jsonPointerLines(raw),
  };
}

/**
 * Offset of the first JSON syntax error in `raw`, or `-1` when it is valid. Engines word (and
 * locate) `JSON.parse` errors differently, so the offset is computed here instead.
 *
 * @param {string} raw
 * @returns {number}
 */
export function jsonSyntaxErrorOffset(raw) {
  let i = 0;
  const fail = () => {
    throw new RangeError(String(i));
  };
  const skipWhitespace = () => {
    while (i < raw.length && " \t\n\r".includes(raw[i])) i += 1;
  };
  const readString = () => {
    if (raw[i] !== '"') fail();
    i += 1;
    while (i < raw.length && raw[i] !== '"') {
      if (raw.charCodeAt(i) < 0x20) fail();
      i += raw[i] === "\\" ? 2 : 1;
    }
    if (i >= raw.length) fail();
    i += 1;
  };
  const readValue = () => {
    skipWhitespace();
    const open = raw[i];
    if (open === "{" || open === "[") {
      const close = open === "{" ? "}" : "]";
      i += 1;
      skipWhitespace();
      if (raw[i] === close) {
        i += 1;
        return;
      }
      for (;;) {
        if (open === "{") {
          skipWhitespace();
          readString();
          skipWhitespace();
          if (raw[i] !== ":") fail();
          i += 1;
        }
        readValue();
        skipWhitespace();
        if (raw[i] === ",") {
          i += 1;
        } else if (raw[i] === close) {
          i += 1;
          return;
        } else {
          fail();
        }
      }
    }
    if (open === '"') {
      readString();
      return;
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      raw.slice(i),
    );
    if (!literal) fail();
    i += literal[0].length;
  };
  try {
    readValue();
    skipWhitespace();
    if (i < raw.length) fail();
    return -1;
  } catch (error) {
    if (error instanceof RangeError) return Number(error.message);
    throw error;
  }
}

/**
 * 1-based line and column of the first JSON syntax error (1:1 when it cannot be located).
 *
 * @param {string} raw
 * @returns {{ line: number, column: number }}
 */
function jsonErrorPosition(raw) {
  const offset = jsonSyntaxErrorOffset(raw);
  if (offset < 0) return { line: 1, column: 1 };
  const before = raw.slice(0, offset).split("\n");
  return { line: before.length, column: before.at(-1).length + 1 };
}

/**
 * Whether the rule's current label claims a working gate.
 *
 * @param {{ enforcement?: string }} rule
 * @returns {boolean}
 */
export function isGated(rule) {
  return GATED_LEVELS.includes(rule?.enforcement);
}

/**
 * The rule's target level (`targetEnforcement`, defaulting to `enforcement`).
 *
 * @param {{ enforcement?: string, targetEnforcement?: string }} rule
 * @returns {string | undefined}
 */
export function effectiveTarget(rule) {
  return rule?.targetEnforcement ?? rule?.enforcement;
}

/**
 * Whether the rule is labelled below its target (awaiting its gate and fixtures).
 *
 * @param {{ enforcement?: string, targetEnforcement?: string }} rule
 * @returns {boolean}
 */
export function hasPendingPromotion(rule) {
  const current = LEVEL_RANK[rule?.enforcement];
  const target = LEVEL_RANK[effectiveTarget(rule)];
  return current !== undefined && target !== undefined && target > current;
}

/**
 * Orders rule IDs by prefix (canonical order) and then by number. Unknown shapes sort last.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareRuleIds(a, b) {
  const key = (id) => {
    const match = RULE_ID_PATTERN.exec(String(id));
    if (!match) return [RULE_PREFIXES.length, Number.MAX_SAFE_INTEGER, String(id)];
    return [RULE_PREFIXES.indexOf(match[1]), Number(match[2]), String(id)];
  };
  const [pa, na, sa] = key(a);
  const [pb, nb, sb] = key(b);
  if (pa !== pb) return pa - pb;
  if (na !== nb) return na - nb;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Returns a copy of `rules` sorted with {@link compareRuleIds}.
 *
 * @template {{ id: string }} T
 * @param {T[]} rules
 * @returns {T[]}
 */
export function sortRules(rules) {
  return [...rules].sort((a, b) => compareRuleIds(a.id, b.id));
}

/**
 * @typedef {object} RuleCounts
 * @property {number} total
 * @property {Record<string, number>} byEnforcement FORCED / GUARDED / REVIEW.
 * @property {Record<string, number>} byTarget Target level (`targetEnforcement`, defaulting to
 *   `enforcement`) → count.
 * @property {Record<string, Record<string, number>>} byTrack Track → level → count, plus `total`.
 * @property {Record<string, Record<string, number>>} byTrackTarget Track → target level → count,
 *   plus `total`.
 * @property {Record<string, number>} byTier `1` / `2` → count.
 * @property {Record<string, number>} byInvariant Tier-1 invariant number (`1`–`10`) → count of
 *   tier 1 rules.
 * @property {number} pendingPromotion Rules labelled below their target.
 */

/**
 * Counts rules by enforcement level, target level, track, tier and Tier-1 invariant.
 *
 * @param {any[]} rules
 * @returns {RuleCounts}
 */
export function countRules(rules) {
  const emptyLevels = () => Object.fromEntries(ENFORCEMENT_LEVELS.map((level) => [level, 0]));
  const byEnforcement = emptyLevels();
  const byTarget = emptyLevels();
  const perTrack = () =>
    Object.fromEntries(TRACKS.map((track) => [track, { ...emptyLevels(), total: 0 }]));
  const byTrack = perTrack();
  const byTrackTarget = perTrack();
  const byTier = { 1: 0, 2: 0 };
  const byInvariant = Object.fromEntries(INVARIANTS.map((invariant) => [invariant.id, 0]));
  let pendingPromotion = 0;
  for (const rule of rules) {
    const target = effectiveTarget(rule);
    if (rule?.enforcement in byEnforcement) byEnforcement[rule.enforcement] += 1;
    if (target in byTarget) byTarget[target] += 1;
    const bucket = byTrack[rule?.track];
    if (bucket) {
      if (rule.enforcement in bucket) bucket[rule.enforcement] += 1;
      bucket.total += 1;
      const targetBucket = byTrackTarget[rule.track];
      if (target in targetBucket) targetBucket[target] += 1;
      targetBucket.total += 1;
    }
    if (rule?.tier in byTier) byTier[rule.tier] += 1;
    if (rule?.tier === 1 && rule.invariant in byInvariant) byInvariant[rule.invariant] += 1;
    if (hasPendingPromotion(rule)) pendingPromotion += 1;
  }
  return {
    total: rules.length,
    byEnforcement,
    byTarget,
    byTrack,
    byTrackTarget,
    byTier,
    byInvariant,
    pendingPromotion,
  };
}

/**
 * Directory that must hold the rule's violation fixture.
 *
 * @param {{ id: string, track: string }} rule
 * @returns {string} Root-relative posix path.
 */
export function violationFixtureDir(rule) {
  return `test/fixtures/${rule.track}/violations/${rule.id}`;
}

/**
 * Short `kind:id[:discriminator]` label of a gate.
 *
 * @param {{ kind: string, id: string, discriminator?: string } | null | undefined} gate
 * @returns {string}
 */
export function gateLabel(gate) {
  if (!gate || typeof gate !== "object") return "none";
  return [gate.kind, gate.id, gate.discriminator].filter((part) => part !== undefined).join(":");
}

const CITATION_PATTERN =
  /(?<![A-Za-z0-9_-])(BE|WEB|MOB|SEC|I18N|UI|PROC|CI)-(\d{3})(?![A-Za-z0-9_])|(?<![A-Za-z0-9])(BE|WEB|MOB|SEC|I18N|UI|PROC|CI)_(\d{3})(?![0-9])/g;

/**
 * Finds rule-ID citations in a text: the canonical form (`SEC-016`) and the underscore form
 * test runners and identifiers use (`SEC_016`, as in `test_SEC_016_…`), reported canonically.
 *
 * @param {string} text
 * @returns {{ id: string, line: number, column: number }[]}
 */
export function findRuleIdCitations(text) {
  const found = [];
  const lines = text.split("\n");
  lines.forEach((content, index) => {
    for (const match of content.matchAll(CITATION_PATTERN)) {
      const id = match[1] ? `${match[1]}-${match[2]}` : `${match[3]}-${match[4]}`;
      found.push({ id, line: index + 1, column: match.index + 1 });
    }
  });
  return found;
}

/**
 * Architecture decision records on disk, keyed by their four-digit number.
 *
 * @param {string} root Repository root.
 * @returns {{ exists: boolean, records: Map<string, string[]> }} Record paths are root-relative.
 */
export function listDecisionRecords(root) {
  const dir = path.join(root, DECISIONS_DIR);
  const records = new Map();
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { exists: false, records };
  }
  for (const entry of entries) {
    const match = /^(\d{4})-.+\.md$/.exec(entry.name);
    if (!entry.isFile() || !match) continue;
    const list = records.get(match[1]) ?? [];
    list.push(`${DECISIONS_DIR}/${entry.name}`);
    records.set(match[1], list.sort());
  }
  return { exists: true, records };
}

/** Decision-record statuses that a rule may not cite. */
export const RETIRED_DECISION_STATUSES = Object.freeze(["rejected", "deprecated", "superseded"]);

/**
 * The `status` of a decision record, read from its front matter (MADR: `status: accepted`,
 * `superseded by [0042](…)`, …), lowercased; `null` when it has none.
 *
 * @param {string} text Record contents.
 * @returns {string | null}
 */
export function decisionStatus(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!front) return null;
  const status = /^status\s*:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(front[1]);
  return status ? status[1].trim().toLowerCase() : null;
}

/**
 * Top-level manifest fields that the adopter-manifest decision record
 * (docs/decisions/0023-adopter-manifest-and-upgrade.md) adds to the manifest schema in the release
 * that ships the gate reading them, and not before. A rule that is still REVIEW may name a key
 * under one of them before the schema declares it (a planned key); a FORCED or GUARDED rule's keys
 * must be declared.
 */
export const PLANNED_MANIFEST_FIELDS = Object.freeze([
  "trackRoots",
  "stack",
  "decisions",
  "rules",
  "modules",
]);

/**
 * Resolves a dotted configuration key (`hooks.stop.enabled`, `stack.<concern>.deprecated`)
 * against a JSON Schema: each segment must be a declared property, or match
 * `additionalProperties`/`patternProperties` (a `<name>` placeholder segment needs one of them).
 *
 * @param {object} schema
 * @param {string} key
 * @returns {boolean}
 */
export function schemaHasKey(schema, key) {
  const deref = (node) => {
    let current = node;
    for (let guard = 0; current && typeof current.$ref === "string" && guard < 16; guard += 1) {
      const pointer = current.$ref.replace(/^#\//, "").split("/");
      current = pointer.reduce((value, part) => value?.[part], schema);
    }
    return current;
  };
  let node = deref(schema);
  for (const segment of key.split(".")) {
    node = deref(node);
    if (!node || typeof node !== "object") return false;
    const placeholder = /^<[^>]+>$/.test(segment);
    const declared = !placeholder && node.properties?.[segment];
    if (declared) {
      node = declared;
      continue;
    }
    const pattern = Object.entries(node.patternProperties ?? {}).find(
      ([regex]) => placeholder || new RegExp(regex, "u").test(segment),
    );
    if (pattern) {
      node = pattern[1];
      continue;
    }
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
      node = node.additionalProperties;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Where a rule's configurable key stands: `declared` when the manifest schema has it, `planned`
 * when it sits under one of the {@link PLANNED_MANIFEST_FIELDS} (a `rules.<RULE-ID>.<option>` key
 * needs an option segment, and a `modules.<module>.<option>` key a declared module), `unknown`
 * otherwise.
 *
 * @param {object | null} schema Manifest schema, or `null` when it is unavailable.
 * @param {string} key
 * @returns {"declared" | "planned" | "unknown"}
 */
export function configurableKeyStatus(schema, key) {
  if (schema && schemaHasKey(schema, key)) return "declared";
  const [field, second, ...rest] = key.split(".");
  if (!PLANNED_MANIFEST_FIELDS.includes(field)) return "unknown";
  if (field === "rules" && (!RULE_ID_PATTERN.test(second ?? "") || rest.length === 0)) {
    return "unknown";
  }
  if (
    field === "modules" &&
    (rest.length === 0 || (schema && !schemaHasKey(schema, `modules.${second}`)))
  ) {
    return "unknown";
  }
  return "planned";
}

/** Words in a rule's text that say it reads a project setting. */
export const CONFIGURED_WORDING = /\bconfigur(?:ed|able)\b/i;

/**
 * Compares two SemVer versions by precedence (build metadata ignored).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero or positive
 */
export function compareSemver(a, b) {
  const parse = (value) => {
    const [core, pre] = String(value).split("+")[0].split(/-(.*)/s);
    return { core: core.split(".").map(Number), pre: pre ? pre.split(".") : [] };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (x.core[i] !== y.core[i]) return (x.core[i] ?? 0) - (y.core[i] ?? 0);
  }
  if (x.pre.length === 0 || y.pre.length === 0) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i += 1) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) - Number(q);
    if (pn) return -1;
    if (qn) return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/**
 * Formats a finding as `<ID> <path>:<line> <message>`.
 *
 * @param {{ id: string, path: string, line?: number, message: string }} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  return `${finding.id} ${finding.path}:${finding.line ?? 1} ${finding.message}`;
}
