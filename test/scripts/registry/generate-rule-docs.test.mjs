/**
 * scripts/generate-rule-docs.mjs: rendering, determinism, freshness checking and the CLI.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  BANNER,
  DOCS_DIR,
  codeSpan,
  escapeInline,
  generateRuleDocs,
  renderRuleDocs,
} from "../../../scripts/generate-rule-docs.mjs";
import { INVARIANTS } from "../../../scripts/lib/registry.mjs";
import { REPO_ROOT, forcedRule, guardedRule, makeRepo, reviewRule, runScript } from "./helpers.mjs";

const SCRIPT = "scripts/generate-rule-docs.mjs";
const FILES = ["README.md", "laravel.md", "web.md", "mobile.md", "client.md", "shared.md"].map(
  (name) => `${DOCS_DIR}/${name}`,
);

const RULES = [
  reviewRule({
    id: "PROC-103",
    invariant: 8,
    targetEnforcement: "FORCED",
    gate: { kind: "script", id: "check-allowlists" },
    configurable: ["stack.<concern>.deprecated"],
    adoption: "Existing entries get an expiry date | within the horizon.",
  }),
  guardedRule({
    id: "WEB-012",
    invariant: 9,
    module: "i18n",
    profiles: ["next"],
    defaultEnabled: false,
    decision: "0038",
    evasions: ["a | pipe and *stars*", "an `inline | code` span"],
  }),
  forcedRule({
    id: "BE-001",
    track: "laravel",
    invariant: 8,
    title: "Declare strict_types in every PHP file",
    gate: { kind: "pest", id: "BE-001 strict types" },
  }),
  reviewRule({ id: "MOB-002", track: "mobile", tier: 2, title: "Keep <View> trees shallow" }),
];

/**
 * The lines of one `## <heading>` section of a generated page, up to the next `## ` heading.
 *
 * @param {string} page
 * @param {string} heading
 * @returns {string}
 */
function section(page, heading) {
  const lines = page.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `no section ${heading}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

/** @type {import("./helpers.mjs").TempRepo} */
let repo;

beforeEach(() => {
  repo = makeRepo();
});

afterEach(() => {
  repo.cleanup();
});

describe("escaping", () => {
  it("escapes Markdown outside code spans only", () => {
    assert.equal(
      escapeInline("a *b* [c] <d> \\e _f_ g_h"),
      "a \\*b\\* \\[c\\] &lt;d> \\\\e \\_f\\_ g_h",
    );
    assert.equal(escapeInline("keep `a*b<c>` as code"), "keep `a*b<c>` as code");
    assert.equal(escapeInline("a | b `c | d`", { table: true }), "a \\| b `c \\| d`");
  });

  it("builds code spans that survive backticks and pipes", () => {
    assert.equal(codeSpan("plain"), "`plain`");
    assert.equal(codeSpan("a`b"), "``a`b``");
    assert.equal(codeSpan("`edge`"), "`` `edge` ``");
    assert.equal(codeSpan("a|b", { table: true }), "`a\\|b`");
  });
});

describe("renderRuleDocs", () => {
  it("renders the index and one page per track, deterministically", () => {
    const files = renderRuleDocs(RULES);
    assert.deepEqual([...files.keys()], FILES);
    const reversed = renderRuleDocs([...RULES].reverse());
    assert.deepEqual([...reversed.entries()], [...files.entries()]);
    for (const content of files.values()) {
      assert.equal(content.split("\n")[0], BANNER);
      assert.ok(content.endsWith("\n") && !content.endsWith("\n\n"));
      assert.doesNotMatch(content, /\r|\t/);
    }
    assert.match(BANNER, /Generated from registry\/rules\.json — do not edit/);
  });

  it("counts rules by enforcement, target and track", () => {
    const index = renderRuleDocs(RULES).get(`${DOCS_DIR}/README.md`);
    assert.match(
      index,
      /^4 rules: 1 FORCED, 1 GUARDED, 2 REVIEW; 1 awaiting promotion to a gated level\. Target levels: 2 FORCED, 1 GUARDED, 1 REVIEW\.$/m,
    );
    assert.match(index, /^\| Level \| Enforcement \| Target \|$/m);
    assert.match(index, /^\| FORCED \| 1 \| 2 \|$/m);
    assert.match(index, /^\| REVIEW \| 2 \| 1 \|$/m);
    assert.match(index, /^\| Total \| 4 \| 4 \|$/m);
    assert.match(
      index,
      /^\| Track \| FORCED \| GUARDED \| REVIEW \| Target FORCED \| Target GUARDED \| Target REVIEW \| Total \|$/m,
    );
    assert.match(index, /^\| \[Laravel\]\(laravel\.md\) \| 1 \| 0 \| 0 \| 1 \| 0 \| 0 \| 1 \|$/m);
    assert.match(index, /^\| \[Shared\]\(shared\.md\) \| 0 \| 0 \| 1 \| 1 \| 0 \| 0 \| 1 \|$/m);
  });

  it("omits target levels when no rule awaits promotion", () => {
    const index = renderRuleDocs([forcedRule()]).get(`${DOCS_DIR}/README.md`);
    assert.match(index, /^1 rule: 1 FORCED, 0 GUARDED, 0 REVIEW\.$/m);
  });

  it("lists rules in prefix order with links, current and target levels", () => {
    const index = section(renderRuleDocs(RULES).get(`${DOCS_DIR}/README.md`), "Index");
    const ids = [...index.matchAll(/^\| \[([A-Z0-9]+-\d{3})\]\(/gm)].map((match) => match[1]);
    assert.deepEqual(ids, ["BE-001", "WEB-012", "MOB-002", "PROC-103"]);
    assert.match(index, /^\| ID \| Title \| Track \| Tier \| Module \| Enforcement \| Target \|$/m);
    assert.match(
      index,
      /^\| \[WEB-012\]\(web\.md#web-012\) \| A sample process rule for tests \| Web \| 1 \| `i18n` \| GUARDED \| GUARDED \|$/m,
    );
    assert.match(
      index,
      /^\| \[PROC-103\]\(shared\.md#proc-103\) \| .* \| Shared \| 1 \| core \| REVIEW \| FORCED \|$/m,
    );
    assert.match(
      index,
      /^\| \[MOB-002\]\(mobile\.md#mob-002\) \| .* \| 2 \| core \| REVIEW \| REVIEW \|$/m,
    );
    assert.match(index, /Keep &lt;View> trees shallow/);
  });

  it("groups the tier 1 rules by invariant, in invariant order", () => {
    const tierOne = section(
      renderRuleDocs(RULES, {
        decisions: new Map([["0008", ["docs/decisions/0008-tiers-and-invariants.md"]]]),
      }).get(`${DOCS_DIR}/README.md`),
      "Tier-1 invariants",
    );
    assert.match(tierOne, /\[ADR 0008\]\(\.\.\/decisions\/0008-tiers-and-invariants\.md\)/);
    assert.match(tierOne, /^3 of the 4 rules are tier 1; 1 are tier 2\.$/m);
    const headings = [...tierOne.matchAll(/^### (.*)$/gm)].map((match) => match[1]);
    assert.deepEqual(
      headings,
      INVARIANTS.map((invariant) => `${invariant.id}. ${invariant.title}`),
    );
    const ruleIds = (heading) =>
      [
        ...tierOne
          .split(`### ${heading}`)[1]
          .split("### ")[0]
          .matchAll(/^\| \[([A-Z0-9]+-\d{3})\]/gm),
      ].map((match) => match[1]);
    assert.deepEqual(ruleIds(`8. ${INVARIANTS[7].title}`), ["BE-001", "PROC-103"]);
    assert.deepEqual(ruleIds(`9. ${INVARIANTS[8].title}`), ["WEB-012"]);
    assert.doesNotMatch(tierOne, /MOB-002/, "tier 2 rules are not listed");
    assert.match(
      tierOne,
      /^\| \[PROC-103\]\(shared\.md#proc-103\) \| .* \| Shared \| core \| REVIEW \| FORCED \|$/m,
    );
    const empty = tierOne.split(`### 1. ${INVARIANTS[0].title}`)[1].split("### ")[0];
    assert.match(empty, /No rules are registered for this invariant yet\./);
  });

  it("renders every property of a rule on its track page", () => {
    const web = renderRuleDocs(RULES, {
      decisions: new Map([["0038", ["docs/decisions/0038-exceptions.md"]]]),
    }).get(`${DOCS_DIR}/web.md`);
    assert.match(web, /^## WEB-012$/m);
    assert.match(web, /^\*\*A sample process rule for tests\.\*\*$/m);
    assert.match(web, /^\| Enforcement \| GUARDED \|$/m);
    assert.match(web, /^\| Target enforcement \| GUARDED \|$/m);
    assert.match(
      web,
      /^\| Tier \| 1 — invariant 9: The locale contract, when the i18n module is on \|$/m,
    );
    assert.match(web, /^\| Gate \| eslint: `cross-stack\/no-sample` \|$/m);
    assert.match(web, /^\| Module \| `i18n` \|$/m);
    assert.match(web, /^\| Profiles \| `next` \|$/m);
    assert.match(web, /^\| Enabled by default \| no \(opt-in\) \|$/m);
    assert.match(web, /^\| Decision \| \[ADR 0038\]\(\.\.\/decisions\/0038-exceptions\.md\) \|$/m);
    assert.match(web, /^\| Violation fixture \| `test\/fixtures\/web\/violations\/WEB-012\/` \|$/m);
    assert.match(web, /^- a \| pipe and \\\*stars\\\*$/m);
    assert.match(web, /^- an `inline \| code` span$/m);
  });

  it("marks planned gates and pending fixtures of REVIEW rules", () => {
    const shared = renderRuleDocs(RULES).get(`${DOCS_DIR}/shared.md`);
    assert.match(shared, /^\| \[PROC-103\]\(#proc-103\) \| .* \| 1 \| REVIEW \| FORCED \|$/m);
    assert.match(shared, /^\| Enforcement \| REVIEW \|$/m);
    assert.match(shared, /^\| Target enforcement \| FORCED \|$/m);
    assert.match(shared, /^\| Gate \| planned — script: `check-allowlists` \|$/m);
    assert.match(
      shared,
      /^\| Adoption \| Existing entries get an expiry date \\\| within the horizon\. \|$/m,
    );
    assert.match(shared, /^\| Configurable \| `stack.<concern>.deprecated` \|$/m);
    assert.match(shared, /^\| Decision \| ADR 0001 \|$/m);
    assert.match(
      shared,
      /^\| Violation fixture \| planned — `test\/fixtures\/shared\/violations\/PROC-103\/` \|$/m,
    );
    const mobile = renderRuleDocs(RULES).get(`${DOCS_DIR}/mobile.md`);
    assert.match(mobile, /^\| Gate \| none \(code review\) \|$/m);
    assert.match(mobile, /^\| Tier \| 2 \|$/m);
    assert.match(mobile, /^\| Target enforcement \| REVIEW \|$/m);
    assert.match(mobile, /^\| Adoption \| Nothing needed\. \|$/m);
    assert.doesNotMatch(mobile, /Violation fixture/);
    assert.doesNotMatch(mobile, /Known evasions/);
  });

  it("prints n/a for profiles off the web track and all for a web rule without profiles", () => {
    const files = renderRuleDocs([
      ...RULES,
      reviewRule({ id: "WEB-013", track: "web", tier: 2 }),
      reviewRule({ id: "UI-001", track: "client", tier: 2 }),
    ]);
    assert.match(files.get(`${DOCS_DIR}/web.md`), /^\| Profiles \| all \|$/m);
    for (const page of ["laravel.md", "mobile.md", "client.md", "shared.md"]) {
      assert.match(files.get(`${DOCS_DIR}/${page}`), /^\| Profiles \| n\/a \|$/m, page);
      assert.doesNotMatch(files.get(`${DOCS_DIR}/${page}`), /^\| Profiles \| all \|$/m, page);
    }
  });

  it("renders client rules on their own page, titled for both client tracks", () => {
    const files = renderRuleDocs([reviewRule({ id: "WEB-021", track: "client" })]);
    const client = files.get(`${DOCS_DIR}/client.md`);
    assert.match(client, /^# Web and mobile rules$/m);
    assert.match(client, /never to the Laravel track/);
    assert.match(client, /^## WEB-021$/m);
    assert.match(
      files.get(`${DOCS_DIR}/README.md`),
      /^\| \[WEB-021\]\(client\.md#web-021\) \| .* \| Web and mobile \| 1 \| core \| REVIEW \| REVIEW \|$/m,
    );
  });

  it("marks configurable keys the manifest schema does not declare yet as planned", () => {
    const manifestSchema = {
      type: "object",
      properties: { hooks: { type: "object", properties: { stop: { type: "object" } } } },
    };
    const rule = reviewRule({
      configurable: ["hooks.stop", "rules.PROC-101.limit", "stack.<concern>.use"],
    });
    const shared = renderRuleDocs([rule], { manifestSchema }).get(`${DOCS_DIR}/shared.md`);
    assert.match(
      shared,
      /^\| Configurable \| `hooks.stop`, `rules.PROC-101.limit` \(planned\), `stack.<concern>.use` \(planned\) \|$/m,
    );
    const unmarked = renderRuleDocs([rule]).get(`${DOCS_DIR}/shared.md`);
    assert.match(
      unmarked,
      /^\| Configurable \| `hooks.stop`, `rules.PROC-101.limit`, `stack.<concern>.use` \|$/m,
    );
  });

  it("renders empty tracks and an empty registry", () => {
    const files = renderRuleDocs([]);
    assert.match(files.get(`${DOCS_DIR}/README.md`), /^No rules are registered yet\.$/m);
    assert.match(
      files.get(`${DOCS_DIR}/web.md`),
      /^0 rules: 0 FORCED, 0 GUARDED, 0 REVIEW\. Back to the \[rule index\]\(README\.md\)\.$/m,
    );
    assert.match(
      files.get(`${DOCS_DIR}/web.md`),
      /^No rules are registered for this track yet\.$/m,
    );
  });
});

describe("generateRuleDocs", () => {
  const read = (rel) => fs.readFileSync(path.join(repo.root, ...rel.split("/")), "utf8");

  it("writes the docs, then reports them up to date", () => {
    repo.registry(RULES);
    const written = generateRuleDocs({ root: repo.root });
    assert.equal(written.ok, true);
    assert.deepEqual(
      written.files.map((file) => [file.path, file.status]),
      FILES.map((file) => [file, "written"]),
    );
    assert.equal(read(`${DOCS_DIR}/README.md`), renderRuleDocs(RULES).get(`${DOCS_DIR}/README.md`));
    const again = generateRuleDocs({ root: repo.root });
    assert.deepEqual(
      again.files.map((file) => file.status),
      FILES.map(() => "unchanged"),
    );
    const checked = generateRuleDocs({ root: repo.root, check: true });
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.findings, []);
  });

  it("links decision records that exist", () => {
    repo.write("docs/decisions/0038-exceptions-are-explicit.md", "# 0038\n");
    repo.registry(RULES);
    generateRuleDocs({ root: repo.root });
    assert.match(
      read(`${DOCS_DIR}/web.md`),
      /\[ADR 0038\]\(\.\.\/decisions\/0038-exceptions-are-explicit\.md\)/,
    );
  });

  it("reports stale, missing, extra and foreign files in check mode", () => {
    repo.registry(RULES);
    generateRuleDocs({ root: repo.root });
    const shared = read(`${DOCS_DIR}/shared.md`).split("\n");
    shared[6] = "hand edit";
    repo.write(`${DOCS_DIR}/shared.md`, shared.join("\n"));
    fs.rmSync(path.join(repo.root, DOCS_DIR, "web.md"));
    repo.write(`${DOCS_DIR}/old-track.md`, `${BANNER}\n\n# Old\n`);
    repo.write(`${DOCS_DIR}/notes.md`, "# Hand-written\n");
    const report = generateRuleDocs({ root: repo.root, check: true });
    assert.equal(report.ok, false);
    assert.deepEqual(
      report.findings.map((finding) => `${finding.path}:${finding.line} ${finding.message}`),
      [
        "docs/rules/web.md:1 missing; run node scripts/generate-rule-docs.mjs",
        "docs/rules/shared.md:7 stale; run node scripts/generate-rule-docs.mjs",
        "docs/rules/notes.md:1 is not generated from the registry; docs/rules/ holds generated files only",
        "docs/rules/old-track.md:1 no longer generated; run node scripts/generate-rule-docs.mjs to remove it",
      ],
    );
  });

  it("removes stale generated files and keeps foreign ones when writing", () => {
    repo.registry(RULES);
    repo.write(`${DOCS_DIR}/old-track.md`, `${BANNER}\n\n# Old\n`);
    repo.write(`${DOCS_DIR}/notes.md`, "# Hand-written\n");
    const report = generateRuleDocs({ root: repo.root });
    assert.equal(fs.existsSync(path.join(repo.root, DOCS_DIR, "old-track.md")), false);
    assert.equal(fs.existsSync(path.join(repo.root, DOCS_DIR, "notes.md")), true);
    assert.deepEqual(
      report.files.filter((file) => !FILES.includes(file.path)),
      [
        { path: "docs/rules/notes.md", status: "extra" },
        { path: "docs/rules/old-track.md", status: "removed" },
      ],
    );
    assert.equal(report.ok, false);
  });

  it("refuses to render an unusable registry", () => {
    assert.deepEqual(
      generateRuleDocs({ root: repo.root }).findings.map((finding) => finding.message),
      ["cannot read registry/rules.json: ENOENT"],
    );
    repo.write("registry/rules.json", { $schema: "./rules.schema.json", version: 1 });
    assert.deepEqual(
      generateRuleDocs({ root: repo.root }).findings.map((finding) => finding.message),
      ['the registry has no "rules" array'],
    );
    repo.registry([
      reviewRule(),
      { id: "PROC-104", title: "No track" },
      reviewRule({ id: "PROC-105", invariant: undefined }),
      reviewRule({ id: "PROC-106", invariant: 11 }),
    ]);
    const report = generateRuleDocs({ root: repo.root });
    assert.equal(report.ok, false);
    assert.deepEqual(
      report.findings.map((finding) => [finding.id, finding.message]),
      ["PROC-104", "PROC-105", "PROC-106"].map((id) => [
        id,
        "the rule is malformed; run node scripts/check-registry.mjs",
      ]),
    );
    assert.equal(fs.existsSync(path.join(repo.root, DOCS_DIR)), false);
  });
});

describe("generate-rule-docs: CLI", () => {
  it("prints help and rejects unknown options", () => {
    const help = runScript(SCRIPT, ["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /^Usage: node scripts\/generate-rule-docs\.mjs \[options\]/);
    const bad = runScript(SCRIPT, ["--bogus"]);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /Unknown option '--bogus'/);
  });

  it("writes, then passes --check, then fails --check once stale", () => {
    repo.registry(RULES);
    const write = runScript(SCRIPT, ["--root", repo.root]);
    assert.equal(write.status, 0, write.stderr);
    assert.match(
      write.stdout,
      /^generate-rule-docs: written docs\/rules\/README\.md, written docs\/rules\/laravel\.md/,
    );
    const again = runScript(SCRIPT, ["--root", repo.root]);
    assert.equal(again.stdout, "generate-rule-docs: docs/rules/ already up to date\n");
    const fresh = runScript(SCRIPT, ["--root", repo.root, "--check"]);
    assert.equal(fresh.status, 0);
    assert.equal(fresh.stdout, "generate-rule-docs: docs/rules/ is up to date\n");
    repo.registry([...RULES, reviewRule({ id: "UI-001", track: "web" })]);
    const stale = runScript(SCRIPT, ["--root", repo.root, "--check"]);
    assert.equal(stale.status, 1);
    assert.match(
      stale.stdout,
      /^RULE-DOCS docs\/rules\/README\.md:\d+ stale; run node scripts\/generate-rule-docs\.mjs$/m,
    );
    assert.match(stale.stdout, /^generate-rule-docs: docs\/rules\/ is stale \(2 file\(s\)\)$/m);
  });

  it("prints a JSON report and exits 1 for an unusable registry", () => {
    const run = runScript(SCRIPT, ["--root", repo.root, "--json", "--check"]);
    assert.equal(run.status, 1);
    const report = JSON.parse(run.stdout);
    assert.equal(report.tool, "generate-rule-docs");
    assert.equal(report.mode, "check");
    assert.equal(report.counts, null);
    assert.equal(report.findings[0].id, "REGISTRY");
  });
});

describe("repository docs", () => {
  it("docs/rules/ matches the committed registry", () => {
    const report = generateRuleDocs({ root: REPO_ROOT, check: true });
    assert.deepEqual(report.findings, [], "run node scripts/generate-rule-docs.mjs");
  });
});
