#!/usr/bin/env node
/**
 * generate-rule-docs — writes `docs/rules/` from the rule registry: an index (`README.md`) with
 * counts by current and target enforcement level and by track, the Tier-1 rules grouped by
 * invariant and an index of every rule, and one page per track. The output is deterministic (no
 * timestamps; rules ordered by prefix and number) so `--check` can compare it byte for byte with
 * what is committed. Node.js built-ins only.
 *
 * Exit codes: 0 up to date / written, 1 stale output or unusable registry, 2 usage or internal
 * error.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  ENFORCEMENT_LEVELS,
  INVARIANTS,
  REGISTRY_PATH,
  RULE_ID_PATTERN,
  RegistryError,
  TIER_DECISION,
  TRACKS,
  TRACK_TITLES,
  configurableKeyStatus,
  countRules,
  effectiveTarget,
  formatFinding,
  hasPendingPromotion,
  invariantTitle,
  isGated,
  lineForPointer,
  listDecisionRecords,
  loadRegistry,
  repoRootFrom,
  sortRules,
  violationFixtureDir,
} from "./lib/registry.mjs";

const TOOL = "generate-rule-docs";

/** Output directory, relative to the repository root. */
export const DOCS_DIR = "docs/rules";

/** Manifest schema that declares the configurable keys, relative to the repository root. */
export const MANIFEST_SCHEMA_PATH = "schemas/standard.schema.json";

/** First line of every generated file; also how stale generated files are recognised. */
export const BANNER =
  "<!-- Generated from registry/rules.json — do not edit. Regenerate: node scripts/generate-rule-docs.mjs -->";

const TRACK_INTROS = Object.freeze({
  laravel:
    "Rules for the Laravel track: a JSON API with its architecture, validation, authorization, persistence and tests.",
  web: "Rules for the web track (Next.js App Router). A rule that applies to one profile only says so.",
  mobile: "Rules for the mobile track (Expo and React Native).",
  client:
    "Rules for both JavaScript client tracks, web and mobile: lint, type-checking, formatting, locale files and client code shared by the two. They apply to a project that has either track and never to the Laravel track.",
  shared:
    "Rules that apply to every project, whatever its tracks: the project configuration, stack choices, exceptions, the agent hooks and CI.",
});

const MODULE_NOTE = "core";

const HELP = `Usage: node scripts/generate-rule-docs.mjs [options]

Generates docs/rules/README.md (counts, the Tier-1 rules by invariant and the index of every
rule) and docs/rules/<track>.md from registry/rules.json. Never edit those files by hand.

Options:
  --check        Write nothing; fail when docs/rules/ differs from the generated output
  --root <dir>   Repository root (default: the repository holding this script)
  --json         Print a machine-readable report
  --help         Show this help

Exit codes: 0 up to date or written, 1 stale output or unusable registry, 2 usage or internal
error.
`;

/**
 * Escapes Markdown-significant characters outside code spans.
 *
 * @param {string} text
 * @param {{ table?: boolean }} [options] `table` also escapes `|`, including inside code spans.
 * @returns {string}
 */
export function escapeInline(text, { table = false } = {}) {
  return String(text)
    .split(/(`+[^`]*?`+)/)
    .map((part, index) => {
      if (index % 2 === 1) return table ? part.replace(/\|/g, "\\|") : part;
      let out = part.replace(/([\\*[\]])/g, "\\$1").replace(/</g, "&lt;");
      out = out.replace(/(?<![A-Za-z0-9])_|_(?![A-Za-z0-9])/g, "\\_");
      return table ? out.replace(/\|/g, "\\|") : out;
    })
    .join("");
}

/**
 * A Markdown code span that survives backticks and (in tables) pipes in its content.
 *
 * @param {string} text
 * @param {{ table?: boolean }} [options]
 * @returns {string}
 */
export function codeSpan(text, { table = false } = {}) {
  const value = String(text);
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
  const body = table ? value.replace(/\|/g, "\\|") : value;
  return `${fence}${pad}${body}${pad}${fence}`;
}

/**
 * Renders a Markdown table.
 *
 * @param {string[]} header Cell text (already escaped).
 * @param {string[][]} rows Cell text (already escaped).
 * @returns {string}
 */
function table(header, rows) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

/**
 * The Tier cell: `2`, or `1` with the invariant the rule belongs to.
 *
 * @param {any} rule
 * @returns {string}
 */
function tierText(rule) {
  if (rule.tier !== 1) return String(rule.tier);
  return `1 — invariant ${rule.invariant}: ${escapeInline(invariantTitle(rule.invariant), { table: true })}`;
}

/**
 * The gate cell: kind and id (and discriminator), marked "planned" for a REVIEW rule.
 *
 * @param {any} rule
 * @param {{ table?: boolean }} [options]
 * @returns {string}
 */
function gateText(rule, options = {}) {
  const gate = rule.gate;
  if (!gate) return "none (code review)";
  const parts = [codeSpan(gate.id, options)];
  if (gate.discriminator !== undefined) parts.push(codeSpan(gate.discriminator, options));
  const text = `${gate.kind}: ${parts.join(" / ")}`;
  return isGated(rule) ? text : `planned — ${text}`;
}

/**
 * Link to the decision record when it exists, else the bare number.
 *
 * @param {string} decision
 * @param {Map<string, string[]>} records Decision number → root-relative record paths.
 * @returns {string}
 */
function decisionText(decision, records) {
  const files = records.get(decision) ?? [];
  if (files.length !== 1) return `ADR ${decision}`;
  return `[ADR ${decision}](../decisions/${path.posix.basename(files[0])})`;
}

/**
 * The sentence that closes every page's header: counts by level and, while rules await
 * promotion, by target level.
 *
 * @param {ReturnType<typeof countRules>} counts
 * @returns {string}
 */
function countSentence(counts) {
  const levels = (by) => ENFORCEMENT_LEVELS.map((level) => `${by[level]} ${level}`).join(", ");
  const { total, pendingPromotion: pending } = counts;
  const promotion = pending ? `; ${pending} awaiting promotion to a gated level` : "";
  const targets = pending ? ` Target levels: ${levels(counts.byTarget)}.` : "";
  return `${total} ${total === 1 ? "rule" : "rules"}: ${levels(counts.byEnforcement)}${promotion}.${targets}`;
}

/**
 * Renders the Tier-1 section of the index: the invariants in order, each with its rules.
 *
 * @param {any[]} rules Sorted rules.
 * @param {ReturnType<typeof countRules>} counts
 * @param {Map<string, string[]>} records Decision records.
 * @returns {string[]} Lines.
 */
function renderTierOne(rules, counts, records) {
  const tierOne = rules.filter((rule) => rule.tier === 1);
  const out = [
    "## Tier-1 invariants",
    "",
    "Tier 1 applies to every adopting project: at most ten invariants",
    `(${decisionText(TIER_DECISION, records)}), each held by the tier 1 rules that name it. A rule`,
    "that belongs to a module applies once the project turns that module on. Tier 2 rules apply",
    "once the project declares Tier 2.",
    "",
    `${tierOne.length} of the ${counts.total} rules are tier 1; ${counts.byTier[2]} are tier 2.`,
  ];
  for (const invariant of INVARIANTS) {
    const own = tierOne.filter((rule) => rule.invariant === invariant.id);
    out.push("", `### ${invariant.id}. ${escapeInline(invariant.title)}`, "");
    if (own.length === 0) {
      out.push("No rules are registered for this invariant yet.");
      continue;
    }
    out.push(
      table(
        ["ID", "Title", "Track", "Module", "Enforcement", "Target"],
        own.map((rule) => [
          `[${rule.id}](${rule.track}.md#${rule.id.toLowerCase()})`,
          escapeInline(rule.title, { table: true }),
          TRACK_TITLES[rule.track],
          rule.module ? codeSpan(rule.module, { table: true }) : MODULE_NOTE,
          rule.enforcement,
          effectiveTarget(rule),
        ]),
      ),
    );
  }
  return out;
}

/**
 * Renders the index page.
 *
 * @param {any[]} rules Sorted rules.
 * @param {Map<string, string[]>} records Decision records.
 * @returns {string}
 */
function renderIndex(rules, records) {
  const counts = countRules(rules);
  const out = [
    BANNER,
    "",
    "# Rules",
    "",
    "Every rule of the Cross-Stack Standard, generated from the rule registry",
    "(`registry/rules.json`). A rule states one enforceable property and carries an honesty label:",
    "",
    "- **FORCED**: a gate fails the build on every violation; it is enforced structurally, with no",
    "  known way around it.",
    "- **GUARDED**: a gate fails the build on the direct form; the rule lists its known evasions.",
    "- **REVIEW**: no gate yet; code review applies the rule.",
    "",
    "Every rule also names its **target**: the level it reaches once its gate and both fixtures",
    "ship. A rule enters the registry as REVIEW with its target, and the change that ships its gate",
    "promotes it. A rule whose target is REVIEW stays a code-review rule.",
    "",
    "A rule is FORCED or GUARDED only when its gate ships and its violation fixture has been seen",
    "failing. The CI fixtures job proves that for every rule: it runs `node scripts/run-fixtures.mjs`",
    "and then `node scripts/check-registry.mjs --fixture-report` on the report. Plain",
    "`node scripts/check-registry.mjs` checks the gates, fixture definitions, decision records and",
    "rule-ID citations, not the fixture results.",
    "",
    "## Counts",
    "",
    countSentence(counts),
    "",
    table(
      ["Level", "Enforcement", "Target"],
      [
        ...ENFORCEMENT_LEVELS.map((level) => [
          level,
          String(counts.byEnforcement[level]),
          String(counts.byTarget[level]),
        ]),
        ["Total", String(counts.total), String(counts.total)],
      ],
    ),
    "",
    table(
      [
        "Track",
        ...ENFORCEMENT_LEVELS,
        ...ENFORCEMENT_LEVELS.map((level) => `Target ${level}`),
        "Total",
      ],
      TRACKS.map((track) => [
        `[${TRACK_TITLES[track]}](${track}.md)`,
        ...ENFORCEMENT_LEVELS.map((level) => String(counts.byTrack[track][level])),
        ...ENFORCEMENT_LEVELS.map((level) => String(counts.byTrackTarget[track][level])),
        String(counts.byTrack[track].total),
      ]),
    ),
    "",
    ...renderTierOne(rules, counts, records),
    "",
    "## Index",
    "",
  ];
  if (rules.length === 0) {
    out.push("No rules are registered yet.");
  } else {
    out.push(
      table(
        ["ID", "Title", "Track", "Tier", "Module", "Enforcement", "Target"],
        rules.map((rule) => [
          `[${rule.id}](${rule.track}.md#${rule.id.toLowerCase()})`,
          escapeInline(rule.title, { table: true }),
          TRACK_TITLES[rule.track],
          String(rule.tier),
          rule.module ? codeSpan(rule.module, { table: true }) : MODULE_NOTE,
          rule.enforcement,
          effectiveTarget(rule),
        ]),
      ),
    );
  }
  return `${out.join("\n")}\n`;
}

/**
 * The Profiles cell: the named profiles, "all" for a web rule without any, and "n/a" off the web
 * track, where profiles do not apply.
 *
 * @param {any} rule
 * @returns {string}
 */
function profilesText(rule) {
  if (rule.track !== "web") return "n/a";
  return Array.isArray(rule.profiles) && rule.profiles.length
    ? rule.profiles.map((profile) => codeSpan(profile, { table: true })).join(", ")
    : "all";
}

/**
 * The Configurable cell: each key, marked "planned" when the manifest schema does not declare it
 * yet (it arrives with the rule's gate).
 *
 * @param {any} rule
 * @param {object | null} manifestSchema
 * @returns {string}
 */
function configurableText(rule, manifestSchema) {
  if (!Array.isArray(rule.configurable) || rule.configurable.length === 0) return "—";
  return rule.configurable
    .map((key) => {
      const span = codeSpan(key, { table: true });
      return manifestSchema && configurableKeyStatus(manifestSchema, key) !== "declared"
        ? `${span} (planned)`
        : span;
    })
    .join(", ");
}

/**
 * Renders one track page.
 *
 * @param {string} track
 * @param {any[]} rules Sorted rules of this track.
 * @param {Map<string, string[]>} records Decision records.
 * @param {object | null} [manifestSchema] Manifest schema, to mark planned configurable keys.
 * @returns {string}
 */
function renderTrack(track, rules, records, manifestSchema = null) {
  const counts = countRules(rules);
  const out = [
    BANNER,
    "",
    `# ${TRACK_TITLES[track]} rules`,
    "",
    TRACK_INTROS[track],
    "",
    `${countSentence(counts)} Back to the [rule index](README.md).`,
    "",
  ];
  if (rules.length === 0) {
    out.push("No rules are registered for this track yet.");
    return `${out.join("\n")}\n`;
  }
  out.push(
    table(
      ["ID", "Title", "Tier", "Enforcement", "Target"],
      rules.map((rule) => [
        `[${rule.id}](#${rule.id.toLowerCase()})`,
        escapeInline(rule.title, { table: true }),
        String(rule.tier),
        rule.enforcement,
        effectiveTarget(rule),
      ]),
    ),
  );
  for (const rule of rules) {
    const title = escapeInline(rule.title);
    const properties = [
      ["Enforcement", rule.enforcement],
      ["Target enforcement", effectiveTarget(rule)],
      ["Gate", gateText(rule, { table: true })],
      ["Tier", tierText(rule)],
      ["Module", rule.module ? codeSpan(rule.module, { table: true }) : MODULE_NOTE],
      ["Profiles", profilesText(rule)],
      ["Enabled by default", rule.defaultEnabled ? "yes" : "no (opt-in)"],
      ["Configurable", configurableText(rule, manifestSchema)],
      ["Decision", decisionText(rule.decision, records)],
      ["Since", String(rule.since)],
    ];
    if (isGated(rule) || hasPendingPromotion(rule)) {
      // A REVIEW rule's fixture ships with its promotion; label it like the planned gate.
      const fixture = codeSpan(`${violationFixtureDir(rule)}/`, { table: true });
      properties.push(["Violation fixture", isGated(rule) ? fixture : `planned — ${fixture}`]);
    }
    if (typeof rule.adoption === "string" && rule.adoption) {
      properties.push(["Adoption", escapeInline(rule.adoption, { table: true })]);
    }
    out.push(
      "",
      `## ${rule.id}`,
      "",
      `**${title}.**`,
      "",
      escapeInline(rule.summary),
      "",
      table(["Property", "Value"], properties),
    );
    if (Array.isArray(rule.evasions) && rule.evasions.length) {
      out.push(
        "",
        "Known evasions:",
        "",
        ...rule.evasions.map((evasion) => `- ${escapeInline(evasion)}`),
      );
    }
  }
  return `${out.join("\n")}\n`;
}

/**
 * Renders every generated file.
 *
 * @param {any[]} rules Registry rules (any order).
 * @param {{ decisions?: Map<string, string[]>, manifestSchema?: object | null }} [options]
 *   Decision records by number, and the manifest schema that marks planned configurable keys.
 * @returns {Map<string, string>} Root-relative path → content, in a stable order.
 */
export function renderRuleDocs(rules, { decisions = new Map(), manifestSchema = null } = {}) {
  const sorted = sortRules(rules);
  const files = new Map([[`${DOCS_DIR}/README.md`, renderIndex(sorted, decisions)]]);
  for (const track of TRACKS) {
    files.set(
      `${DOCS_DIR}/${track}.md`,
      renderTrack(
        track,
        sorted.filter((rule) => rule.track === track),
        decisions,
        manifestSchema,
      ),
    );
  }
  return files;
}

/**
 * Reads the manifest schema, or `null` when it is missing or unreadable (keys are then listed
 * without the planned mark).
 *
 * @param {string} root
 * @returns {object | null}
 */
function readManifestSchema(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ...MANIFEST_SCHEMA_PATH.split("/")), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Registry problems that make the docs impossible to render.
 *
 * @param {import("./lib/registry.mjs").LoadedRegistry} registry
 * @returns {{ id: string, path: string, line: number, message: string }[]}
 */
function shapeProblems(registry) {
  const problems = [];
  if (!Array.isArray(registry.data?.rules)) {
    return [
      {
        id: "REGISTRY",
        path: REGISTRY_PATH,
        line: 1,
        message: 'the registry has no "rules" array',
      },
    ];
  }
  registry.rules.forEach((rule, index) => {
    const valid =
      rule &&
      typeof rule === "object" &&
      typeof rule.id === "string" &&
      RULE_ID_PATTERN.test(rule.id) &&
      typeof rule.title === "string" &&
      typeof rule.summary === "string" &&
      TRACKS.includes(rule.track) &&
      ENFORCEMENT_LEVELS.includes(rule.enforcement) &&
      (rule.tier === 2 ||
        (rule.tier === 1 && INVARIANTS.some((invariant) => invariant.id === rule.invariant)));
    if (!valid) {
      problems.push({
        id: typeof rule?.id === "string" && /^\S+$/.test(rule.id) ? rule.id : "REGISTRY",
        path: REGISTRY_PATH,
        line: lineForPointer(registry.lines, `/rules/${index}`),
        message: "the rule is malformed; run node scripts/check-registry.mjs",
      });
    }
  });
  return problems;
}

/**
 * First differing line between two texts (1-based).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function firstDifference(a, b) {
  const left = a.split("\n");
  const right = b.split("\n");
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return i + 1;
  }
  return 1;
}

/**
 * Generates (or, with `check`, verifies) `docs/rules/`.
 *
 * @param {{ root: string, check?: boolean }} options
 * @returns {{ tool: string, ok: boolean, mode: string, files: object[], findings: object[], counts: object | null }}
 */
export function generateRuleDocs({ root, check = false }) {
  const mode = check ? "check" : "write";
  let registry;
  try {
    registry = loadRegistry(root);
  } catch (error) {
    if (!(error instanceof RegistryError)) throw error;
    const finding = { id: "REGISTRY", path: error.file, line: error.line, message: error.message };
    return { tool: TOOL, ok: false, mode, files: [], findings: [finding], counts: null };
  }
  const problems = shapeProblems(registry);
  if (problems.length) {
    return { tool: TOOL, ok: false, mode, files: [], findings: problems, counts: null };
  }

  const expected = renderRuleDocs(registry.rules, {
    decisions: listDecisionRecords(root).records,
    manifestSchema: readManifestSchema(root),
  });
  const files = [];
  const findings = [];
  const dir = path.join(root, ...DOCS_DIR.split("/"));
  for (const [rel, content] of expected) {
    const absolute = path.join(root, ...rel.split("/"));
    let current = null;
    try {
      current = fs.readFileSync(absolute, "utf8");
    } catch {
      current = null;
    }
    if (current === content) {
      files.push({ path: rel, status: "unchanged" });
    } else if (check) {
      const status = current === null ? "missing" : "stale";
      const line = current === null ? 1 : firstDifference(current, content);
      files.push({ path: rel, status });
      findings.push({
        id: "RULE-DOCS",
        path: rel,
        line,
        message: `${status}; run node scripts/generate-rule-docs.mjs`,
      });
    } else {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content);
      files.push({ path: rel, status: "written" });
    }
  }
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const rel = `${DOCS_DIR}/${entry.name}`;
    if (expected.has(rel)) continue;
    const absolute = path.join(dir, entry.name);
    const generated =
      entry.isFile() && (fs.readFileSync(absolute, "utf8").split("\n")[0] ?? "") === BANNER;
    if (check) {
      files.push({ path: rel, status: "extra" });
      findings.push({
        id: "RULE-DOCS",
        path: rel,
        line: 1,
        message: generated
          ? "no longer generated; run node scripts/generate-rule-docs.mjs to remove it"
          : "is not generated from the registry; docs/rules/ holds generated files only",
      });
    } else if (generated) {
      fs.rmSync(absolute);
      files.push({ path: rel, status: "removed" });
    } else {
      files.push({ path: rel, status: "extra" });
      findings.push({
        id: "RULE-DOCS",
        path: rel,
        line: 1,
        message: "is not generated from the registry; move it out of docs/rules/",
      });
    }
  }
  return {
    tool: TOOL,
    ok: findings.length === 0,
    mode,
    files,
    findings,
    counts: countRules(registry.rules),
  };
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
        check: { type: "boolean", default: false },
        root: { type: "string" },
        json: { type: "boolean", default: false },
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
  let report;
  try {
    report = generateRuleDocs({ root, check: options.check });
  } catch (error) {
    process.stderr.write(`${TOOL}: internal error: ${error.stack ?? error.message}\n`);
    return 2;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const lines = report.findings.map(formatFinding);
    const changed = report.files.filter(
      (file) => file.status === "written" || file.status === "removed",
    );
    if (!report.counts) {
      lines.push(`${TOOL}: cannot render the rule docs`);
    } else if (options.check) {
      lines.push(
        report.ok
          ? `${TOOL}: ${DOCS_DIR}/ is up to date`
          : `${TOOL}: ${DOCS_DIR}/ is stale (${report.findings.length} file(s))`,
      );
    } else {
      const detail = changed.map((file) => `${file.status} ${file.path}`).join(", ");
      lines.push(`${TOOL}: ${changed.length ? detail : `${DOCS_DIR}/ already up to date`}`);
    }
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  return report.ok ? 0 : 1;
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
