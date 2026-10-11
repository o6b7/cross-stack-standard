/**
 * scripts/check-registry.mjs end to end, on temporary repositories: every check, the fixture
 * report, the human and JSON output and the exit codes.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  CITATION_EXCLUDES,
  UsageError,
  checkRegistry,
  fixtureResultProblems,
  formatReport,
  readFixtureReport,
  schemaHasKey,
} from "../../../scripts/check-registry.mjs";
import { configurableKeyStatus } from "../../../scripts/lib/registry.mjs";
import { fixtureInputsDigest } from "../../../scripts/lib/fixtures/inputs.mjs";
import { REPO_ROOT, forcedRule, guardedRule, makeRepo, reviewRule, runScript } from "./helpers.mjs";

const SCRIPT = "scripts/check-registry.mjs";
const STANDALONE = "plugins/cross-stack-standard/scripts/check-sample.mjs";

/** @type {import("./helpers.mjs").TempRepo} */
let repo;

beforeEach(() => {
  repo = makeRepo();
});

afterEach(() => {
  repo.cleanup();
});

/** Adds a standalone script gate that lists `check-sample`, run by the web check chain. */
function addScriptGate() {
  repo.write(
    STANDALONE,
    'if (process.argv[2] === "--list-checks") console.log("check-sample");\nelse process.exitCode = 2;\n',
  );
  repo.write("plugins/cross-stack-standard/templates/web/package.json", {
    scripts: {
      check: "npm run lint && npm run kit",
      kit: "node .cross-stack/bin/check-sample.mjs",
    },
  });
}

/**
 * Writes an accepted decision record (MADR front matter).
 *
 * @param {string} [number]
 * @param {string} [status]
 */
function decision(number = "0001", status = "accepted") {
  repo.write(
    `docs/decisions/${number}-sample-decision.md`,
    `---\nstatus: ${status}\ndate: 2026-01-01\n---\n\n# Sample decision\n`,
  );
}

/**
 * A FORCED rule whose gate, fixtures and decision record all exist.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function completeForcedRule(overrides = {}) {
  const rule = forcedRule(overrides);
  addScriptGate();
  repo.write(`test/fixtures/${rule.track}/violations/${rule.id}/fixture.json`, { hosts: ["repo"] });
  repo.write(`test/fixtures/${rule.track}/violations/${rule.id}/src/bad.txt`, "bad\n");
  repo.write(`test/fixtures/${rule.track}/clean/fixture.json`, { hosts: ["repo", "node"] });
  decision(rule.decision);
  return rule;
}

/**
 * Runs the checks and returns `check: message` strings of the errors (or warnings).
 *
 * @param {object} [options]
 * @param {"errors" | "warnings"} [kind]
 * @returns {string[]}
 */
function findings(options = {}, kind = "errors") {
  return checkRegistry({ root: repo.root, ...options })[kind].map(
    (finding) => `${finding.id} ${finding.path}:${finding.line} ${finding.message}`,
  );
}

describe("check-registry: registry file and schema", () => {
  it("passes a registry of REVIEW rules whose decision records exist", () => {
    decision();
    repo.registry([
      reviewRule(),
      reviewRule({
        id: "PROC-103",
        targetEnforcement: "GUARDED",
        gate: { kind: "script", id: "check-later" },
      }),
    ]);
    const report = checkRegistry({ root: repo.root });
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.pendingPromotions, [
      {
        id: "PROC-103",
        enforcement: "REVIEW",
        targetEnforcement: "GUARDED",
        gate: "script:check-later",
      },
    ]);
    assert.deepEqual(report.gates, [], "planned gates of REVIEW rules are not checked");
  });

  it("fails when the registry is missing or not JSON", () => {
    assert.deepEqual(findings(), [
      "REGISTRY registry/rules.json:1 cannot read registry/rules.json: ENOENT",
    ]);
    repo.write("registry/rules.json", '{\n  "version": 1,\n  "rules": [,]\n}\n');
    assert.deepEqual(findings(), [
      "REGISTRY registry/rules.json:3 registry/rules.json is not valid JSON (line 3, column 13)",
    ]);
  });

  it("fails when the schema is missing", () => {
    decision();
    repo.registry([reviewRule()]);
    repo.write("registry/rules.schema.json", "");
    assert.match(
      findings()[0],
      /^REGISTRY registry\/rules\.schema\.json:1 cannot read the schema: /,
    );
  });

  it("reports schema violations at the rule's line", () => {
    repo.registry([reviewRule(), guardedRule({ evasions: [] })]);
    const finding = checkRegistry({ root: repo.root }).errors.find(
      (error) => error.check === "schema",
    );
    assert.equal(finding.id, "WEB-101");
    assert.equal(finding.message, "schema: A GUARDED rule lists at least one known evasion");
    assert.ok(finding.line > 10);
  });

  it("rejects duplicate rule IDs and shared gate identities", () => {
    decision();
    repo.registry([
      reviewRule({ targetEnforcement: "FORCED", gate: { kind: "script", id: "check-a" } }),
      reviewRule({ title: "Same ID again" }),
      reviewRule({
        id: "PROC-104",
        targetEnforcement: "FORCED",
        gate: { kind: "script", id: "check-a" },
      }),
      reviewRule({
        id: "PROC-105",
        targetEnforcement: "FORCED",
        gate: { kind: "script", id: "check-a", discriminator: "other" },
      }),
    ]);
    const errors = checkRegistry({ root: repo.root }).errors;
    assert.deepEqual(
      errors.map((error) => error.check),
      ["unique-id", "unique-gate"],
    );
    assert.match(errors[0].message, /^unique-id: duplicate rule ID \(first defined at line \d+\)$/);
    assert.equal(errors[1].id, "PROC-104");
    assert.match(errors[1].message, /gate script:check-a already enforces PROC-101/);
  });
});

describe("check-registry: gated rules", () => {
  it("passes a FORCED rule whose gate, fixtures and decision record exist", () => {
    repo.registry([completeForcedRule()]);
    const report = checkRegistry({ root: repo.root });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.gates.length, 1);
    assert.equal(report.gates[0].present, true);
    assert.equal(
      report.gates[0].evidence,
      `${STANDALONE} --list-checks lists check-sample; run by the check chain in plugins/cross-stack-standard/templates/web`,
    );
  });

  it("fails a FORCED rule without its gate, fixture or decision record", () => {
    repo.registry([forcedRule()]);
    const errors = findings();
    assert.equal(errors.length, 4);
    assert.match(
      errors[0],
      /^PROC-102 registry\/rules\.json:\d+ fixture-dir: test\/fixtures\/shared\/clean\/fixture\.json is missing$/,
    );
    assert.match(
      errors[1],
      /^PROC-102 registry\/rules\.json:\d+ fixture-dir: test\/fixtures\/shared\/violations\/PROC-102\/fixture\.json is missing$/,
    );
    assert.match(
      errors[2],
      /^PROC-102 registry\/rules\.json:\d+ gate: script:check-sample not found — no script file for check-sample/,
    );
    assert.match(
      errors[3],
      /^PROC-102 registry\/rules\.json:\d+ decision: no decision record docs\/decisions\/0001-\*\.md \(docs\/decisions\/ does not exist yet\)$/,
    );
  });

  it("fails a GUARDED rule whose violation directory holds only a placeholder", () => {
    const rule = guardedRule();
    decision();
    repo.write(`test/fixtures/web/violations/${rule.id}/.gitkeep`, "");
    repo.registry([rule]);
    assert.ok(
      findings().some((line) =>
        /fixture-dir: test\/fixtures\/web\/violations\/WEB-101\/fixture\.json is missing$/.test(
          line,
        ),
      ),
    );
  });

  it("validates both fixture definitions and requires the clean one to list the hosts", () => {
    const rule = completeForcedRule();
    repo.write(`test/fixtures/shared/violations/${rule.id}/fixture.json`, {
      hosts: ["repo", "laravel"],
    });
    repo.write("test/fixtures/shared/clean/fixture.json", { hosts: ["repo"], alsoFires: [] });
    repo.registry([rule]);
    const messages = findings();
    assert.ok(
      messages.some((line) => /"alsoFires" is only valid in a violation fixture/.test(line)),
      messages.join("\n"),
    );
    repo.write("test/fixtures/shared/clean/fixture.json", { hosts: ["repo"] });
    assert.ok(
      findings().some((line) =>
        /fixture-dir: test\/fixtures\/shared\/clean\/fixture\.json does not list host\(s\) laravel$/.test(
          line,
        ),
      ),
    );
  });

  it("fails any rule whose decision record is missing, ambiguous or retired", () => {
    const gated = completeForcedRule();
    repo.write("docs/decisions/0001-duplicate.md", "# Duplicate\n");
    repo.registry([gated, reviewRule({ id: "PROC-103", decision: "0002" })]);
    const report = checkRegistry({ root: repo.root });
    assert.deepEqual(
      report.errors.map((error) => `${error.id} ${error.message}`),
      [
        "PROC-102 decision: decision 0001 is ambiguous: docs/decisions/0001-duplicate.md, docs/decisions/0001-sample-decision.md",
        "PROC-103 decision: no decision record docs/decisions/0002-*.md",
      ],
    );
  });

  it("rejects rejected, deprecated and superseded records and warns on proposed ones", () => {
    for (const status of ["rejected", "deprecated", "superseded by [0009](0009-x.md)"]) {
      repo.cleanup();
      repo = makeRepo();
      decision("0001", status);
      repo.registry([reviewRule()]);
      assert.deepEqual(
        checkRegistry({ root: repo.root }).errors.map((error) => error.message),
        [
          `decision: docs/decisions/0001-sample-decision.md is ${status}; cite the record that replaces it`,
        ],
      );
    }
    repo.cleanup();
    repo = makeRepo();
    const rule = completeForcedRule();
    decision("0001", "proposed");
    repo.registry([rule, reviewRule({ id: "PROC-103" })]);
    const report = checkRegistry({ root: repo.root });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(
      report.warnings.map((warning) => `${warning.id} ${warning.message}`),
      [
        "PROC-102 warning: decision: docs/decisions/0001-sample-decision.md is still proposed for a FORCED rule",
      ],
    );
  });
});

describe("check-registry: configurable keys", () => {
  const manifestSchema = () =>
    repo.write("schemas/standard.schema.json", {
      type: "object",
      properties: {
        hooks: {
          type: "object",
          properties: { stop: { type: "object", properties: { enabled: {} } } },
        },
        modules: {
          type: "object",
          properties: { tenancy: { $ref: "#/$defs/module" } },
        },
        stack: {
          type: "object",
          properties: { competingGroups: { type: "array" } },
          additionalProperties: { $ref: "#/$defs/concern" },
        },
      },
      $defs: {
        concern: { type: "object", properties: { deprecated: { type: "array" } } },
        module: { anyOf: [{ type: "boolean" }, { type: "object" }] },
      },
    });

  it("resolves every configurable key in the manifest schema", () => {
    decision();
    manifestSchema();
    repo.registry([
      reviewRule({
        configurable: ["hooks.stop.enabled", "stack.competingGroups", "stack.<concern>.deprecated"],
      }),
      reviewRule({ id: "PROC-103", configurable: ["hooks.stop.budget", "web.pagination.helpers"] }),
    ]);
    assert.deepEqual(
      checkRegistry({ root: repo.root }).errors.map((error) => `${error.id} ${error.message}`),
      [
        "PROC-103 configurable: hooks.stop.budget is not a key of schemas/standard.schema.json, where adopters would set it",
        "PROC-103 configurable: web.pagination.helpers is not a key of schemas/standard.schema.json, where adopters would set it",
      ],
    );
  });

  it("lets a REVIEW rule name planned keys, and requires a gated rule's keys to be declared", () => {
    decision();
    manifestSchema();
    const planned = [
      "rules.PROC-101.limit",
      "stack.<concern>.use",
      "modules.tenancy.column",
      "decisions.<name>",
      "trackRoots.<track>",
    ];
    repo.registry([
      reviewRule({ targetEnforcement: "FORCED", configurable: planned }),
      reviewRule({
        id: "PROC-103",
        configurable: [
          "rules.PROC-999.limit",
          "rules.PROC-101",
          "rules.WEB-1.limit",
          "modules.billing.plan",
        ],
      }),
      forcedRule({ configurable: ["rules.PROC-102.limit", "hooks.stop.enabled"] }),
    ]);
    const messages = checkRegistry({ root: repo.root })
      .errors.filter((error) => error.check === "configurable")
      .map((error) => `${error.id} ${error.message}`);
    assert.deepEqual(messages, [
      "PROC-103 configurable: rules.PROC-999.limit names PROC-999, which is not in the registry",
      "PROC-103 configurable: rules.PROC-101 is not a key of schemas/standard.schema.json, where adopters would set it",
      "PROC-103 configurable: rules.WEB-1.limit is not a key of schemas/standard.schema.json, where adopters would set it",
      "PROC-103 configurable: modules.billing.plan is not a key of schemas/standard.schema.json, where adopters would set it",
      "PROC-102 configurable: rules.PROC-102.limit is not a key of schemas/standard.schema.json yet; a FORCED rule's keys must be declared there, so the change that promotes it adds the key",
    ]);
  });

  it("requires a configurable key when a rule speaks of a configured value", () => {
    decision();
    manifestSchema();
    repo.registry([
      reviewRule({ summary: "Files stay under the configured line limit." }),
      reviewRule({ id: "PROC-103", title: "Keep the limit configurable" }),
      reviewRule({ id: "PROC-104", adoption: "Nothing needed: the configured default passes." }),
      reviewRule({
        id: "PROC-105",
        summary: "Files stay under the configured line limit.",
        configurable: ["rules.PROC-105.maxLines"],
      }),
      reviewRule({ id: "PROC-106", summary: "The configuration file is committed." }),
    ]);
    assert.deepEqual(
      checkRegistry({ root: repo.root })
        .errors.filter((error) => error.check === "configurable")
        .map((error) => error.id),
      ["PROC-101", "PROC-103", "PROC-104"],
    );
  });

  it("accepts every configurable key of the real registry in the real manifest schema", () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "schemas", "standard.schema.json"), "utf8"),
    );
    const registry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "registry", "rules.json"), "utf8"),
    );
    for (const rule of registry.rules) {
      const gated = rule.enforcement === "FORCED" || rule.enforcement === "GUARDED";
      for (const key of rule.configurable ?? []) {
        const status = configurableKeyStatus(schema, key);
        assert.ok(
          gated ? status === "declared" : status !== "unknown",
          `${rule.id}: ${key} (${status})`,
        );
      }
    }
    assert.ok(schemaHasKey(schema, "hooks.stop.enabled"));
  });
});

describe("check-registry: release gate", () => {
  it("requires a default-on rule to be at its target and not planned for a later version", () => {
    decision();
    repo.write("VERSION", "1.0.0\n");
    repo.registry([
      reviewRule({ targetEnforcement: "FORCED", gate: { kind: "script", id: "check-a" } }),
      reviewRule({
        id: "PROC-103",
        targetEnforcement: "FORCED",
        gate: { kind: "script", id: "check-b" },
        defaultEnabled: false,
      }),
      reviewRule({ id: "PROC-104", since: "1.1.0" }),
      reviewRule({ id: "PROC-105", since: "1.1.0", defaultEnabled: false }),
      reviewRule({ id: "PROC-106", since: "1.0.0-rc.1" }),
    ]);
    assert.deepEqual(checkRegistry({ root: repo.root }).errors, [], "only with --release");
    assert.deepEqual(
      checkRegistry({ root: repo.root, release: true }).errors.map(
        (error) => `${error.id} ${error.message}`,
      ),
      [
        "PROC-101 release: a default-on rule ships as REVIEW below its target FORCED, and promoting a default-on rule later is a MAJOR change; ship its gate and fixtures, or set defaultEnabled to false",
        "PROC-104 release: a default-on rule cannot ship in 1.0.0 while its since is 1.1.0; set defaultEnabled to false until that version",
      ],
    );
  });

  it("fails without a VERSION file and is reachable from the CLI", () => {
    decision();
    repo.registry([reviewRule()]);
    assert.deepEqual(
      checkRegistry({ root: repo.root, release: true }).errors.map((error) => error.message),
      ["release: cannot read VERSION: ENOENT"],
    );
    repo.write("VERSION", "1.0.0\n");
    const result = runScript(SCRIPT, ["--root", repo.root, "--release"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(runScript(SCRIPT, ["--help"]).stdout, /--release/);
  });
});

describe("check-registry: violation fixture directories", () => {
  it("rejects directories that belong to no rule of that track", () => {
    decision();
    repo.registry([
      reviewRule({ targetEnforcement: "FORCED", gate: { kind: "script", id: "check-a" } }),
      reviewRule({ id: "WEB-110", track: "web" }),
    ]);
    repo.write("test/fixtures/shared/violations/PROC-101/fixture.json", { hosts: ["repo"] });
    repo.write("test/fixtures/shared/clean/fixture.json", { hosts: ["repo"] });
    repo.write("test/fixtures/shared/violations/PROC-999/fixture.json", {});
    repo.write("test/fixtures/shared/violations/not-a-rule/fixture.json", {});
    repo.write("test/fixtures/shared/violations/WEB-110/fixture.json", {});
    repo.write("test/fixtures/shared/violations/README.md", "notes\n");
    assert.deepEqual(
      findings(),
      [
        "WEB-110 test/fixtures/shared/violations/WEB-110/:1 fixture-dir: WEB-110 belongs to track web; move it to test/fixtures/web/violations/WEB-110/",
        "PROC-999 test/fixtures/shared/violations/PROC-999/:1 fixture-dir: no rule PROC-999 in the registry",
        "REGISTRY test/fixtures/shared/violations/not-a-rule/:1 fixture-dir: not-a-rule is not a rule ID",
      ].sort((a, b) => (a.split(" ")[1] < b.split(" ")[1] ? -1 : 1)),
    );
  });
});

describe("check-registry: rule-ID citations", () => {
  it("fails on citations of unknown rules with their file and line", () => {
    decision();
    repo.registry([reviewRule()]);
    repo.write("docs/guide.md", "# Guide\n\nFollow PROC-101 and PROC-404.\n");
    repo.write("plugins/cross-stack-standard/skills/core/SKILL.md", "Cite WEB-012.\n");
    repo.write("packages/eslint-config/src/rules/x.js", "// enforces SEC-001\n");
    assert.deepEqual(findings(), [
      "PROC-404 docs/guide.md:3 citation: PROC-404 is not in the registry",
      "SEC-001 packages/eslint-config/src/rules/x.js:1 citation: SEC-001 is not in the registry",
      "WEB-012 plugins/cross-stack-standard/skills/core/SKILL.md:1 citation: WEB-012 is not in the registry",
    ]);
  });

  it("checks root files, .github, schemas, every template file and the underscore form", () => {
    decision();
    repo.registry([
      reviewRule({
        summary: "Works with SEC-901 in its summary.",
        evasions: ["renamed like BE-902"],
      }),
    ]);
    repo.write("README.md", "See SEC-902.\n");
    repo.write("CONTRIBUTING.md", "See SEC-903.\n");
    repo.write("CHANGELOG.md", "- SEC-904\n");
    repo.write(".github/PULL_REQUEST_TEMPLATE.md", "for example SEC-905\n");
    repo.write("plugins/cross-stack-standard/templates/laravel/.env.example", "# SEC-906\n");
    repo.write("plugins/cross-stack-standard/templates/shared/CODEOWNERS", "# PROC-907\n");
    repo.write("plugins/cross-stack-standard/templates/laravel/stubs/action.stub", "// BE-908\n");
    repo.write("plugins/cross-stack-standard/templates/web/src/styles/app.css", "/* UI-909 */\n");
    repo.write("schemas/example.json", '{ "description": "see BE-910" }\n');
    repo.write(
      "plugins/cross-stack-standard/templates/laravel/tests/ArchTest.php",
      "test_SEC_911_x\n",
    );
    const cited = findings()
      .map((line) => line.split(" ")[0])
      .sort();
    assert.deepEqual(cited, [
      "BE-902",
      "BE-908",
      "BE-910",
      "PROC-907",
      "SEC-901",
      "SEC-902",
      "SEC-903",
      "SEC-904",
      "SEC-905",
      "SEC-906",
      "SEC-911",
      "UI-909",
    ]);
  });

  it("skips generated files, dependencies, binaries, tests, tooling and the facts ledger", () => {
    decision();
    repo.registry([reviewRule()]);
    assert.deepEqual(
      [...CITATION_EXCLUDES],
      [
        "docs/rules/",
        "plugins/cross-stack-standard/data/",
        "docs/maintainers/verified-versions.md",
      ],
    );
    repo.write(
      ".gitignore",
      "node_modules/\nvendor/\n!plugins/cross-stack-standard/templates/*/vendor/\n",
    );
    repo.write("docs/rules/README.md", "BE-404\n");
    repo.write("docs/maintainers/verified-versions.md", "| grep for BE-012 |\n");
    repo.write("plugins/cross-stack-standard/data/rules.json", '["BE-404"]\n');
    repo.write("packages/eslint-config/node_modules/dep/README.md", "BE-404\n");
    repo.write("packages/laravel/vendor/x/README.md", "BE-404\n");
    repo.write(
      "docs/image.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0x42, 0x45, 0x2d]).toString("latin1") + "BE-404",
    );
    repo.write("test/fixtures/web/clean/notes.md", "BE-404\n");
    repo.write("scripts/tool.mjs", "// e.g. BE-404\n");
    assert.deepEqual(findings(), []);
    repo.write("plugins/cross-stack-standard/templates/web/vendor/pkg/README.md", "BE-405\n");
    assert.deepEqual(findings(), [
      "BE-405 plugins/cross-stack-standard/templates/web/vendor/pkg/README.md:1 citation: BE-405 is not in the registry",
    ]);
  });
});

describe("check-registry: fixture report", () => {
  const inputsFor = (rule, host = "repo") =>
    fixtureInputsDigest({
      rule,
      hostName: host,
      fixturesDir: path.join(repo.root, "test", "fixtures"),
      harnessDir: path.join(repo.root, "test", "harness"),
    });
  const result = (rule, overrides = {}) => ({
    rule: rule.id,
    track: "shared",
    host: "repo",
    gate: { kind: "script", id: "check-sample", discriminator: null },
    inputs: inputsFor(rule, overrides.host ?? "repo"),
    ok: true,
    clean: { ok: true, exitCode: 0, reasons: [] },
    violation: { ok: true, exitCode: 1, idPrinted: true, unexpectedIds: [], reasons: [] },
    error: null,
    ...overrides,
  });
  const writeReport = (results, extra = {}) =>
    repo.write("out/fixture-report.json", {
      formatVersion: 2,
      partial: false,
      results,
      missingFixtures: [],
      skipped: [],
      ...extra,
    });

  it("passes when every gated rule passed clean and failed violation with its ID", () => {
    const rule = completeForcedRule();
    repo.registry([rule, reviewRule({ id: "PROC-103" })]);
    const report = checkRegistry({
      root: repo.root,
      fixtureReport: writeReport([result(rule), result(rule, { host: "node" })]),
    });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.fixtureReport, { checked: true, path: "out/fixture-report.json" });
  });

  it("fails a gated rule without a result, and a host its fixture lists without one", () => {
    const rule = completeForcedRule();
    repo.registry([rule]);
    assert.deepEqual(
      checkRegistry({ root: repo.root, fixtureReport: writeReport([]) }).errors.map(
        (error) => error.message,
      ),
      ["fixture-report: no result for PROC-102 in out/fixture-report.json"],
    );
    repo.write(`test/fixtures/shared/violations/${rule.id}/fixture.json`, {
      hosts: ["repo", "node"],
    });
    assert.deepEqual(
      checkRegistry({
        root: repo.root,
        fixtureReport: writeReport([result(rule)]),
      }).errors.map((error) => error.message),
      ["fixture-report: no result for PROC-102 on host node, which its violation fixture lists"],
    );
  });

  it("explains every failed expectation", () => {
    const rule = completeForcedRule();
    repo.registry([rule]);
    const report = checkRegistry({
      root: repo.root,
      fixtureReport: writeReport([
        result(rule, { host: "a", clean: { ok: false, exitCode: 1 } }),
        result(rule, {
          host: "b",
          violation: { ok: false, exitCode: 0, idPrinted: false, reasons: [] },
        }),
        result(rule, {
          host: "c",
          violation: { ok: false, exitCode: 1, idPrinted: false, reasons: [] },
        }),
        result(rule, {
          host: "d",
          violation: {
            ok: false,
            exitCode: 1,
            idPrinted: true,
            reasons: ["violation: also printed WEB-001"],
          },
        }),
        result(rule, { host: "e", ok: false, error: "host setup failed\ndetails" }),
        result(rule),
      ]),
    });
    assert.deepEqual(
      report.errors.map((error) => error.message),
      [
        "fixture-report: the fixture run did not complete on host e: host setup failed",
        "fixture-report: the gate did not pass the clean fixture on host a (exit 1)",
        "fixture-report: the gate passed the violation fixture on host b",
        "fixture-report: the violation run on host c did not print PROC-102",
        "fixture-report: the violation run on host d failed: violation: also printed WEB-001",
      ],
    );
  });

  it("rejects forged results whose booleans disagree with their details, or another gate", () => {
    const rule = completeForcedRule();
    repo.registry([rule]);
    const report = checkRegistry({
      root: repo.root,
      fixtureReport: writeReport([
        result(rule, {
          violation: { ok: true, exitCode: 0, idPrinted: false, unexpectedIds: [], reasons: [] },
        }),
        result(rule, { host: "node", gate: { kind: "script", id: "something-else" } }),
      ]),
    });
    assert.deepEqual(
      report.errors.map((error) => error.message),
      [
        "fixture-report: the result on host node ran gate script:something-else, the registry names script:check-sample",
        "fixture-report: the result on host repo says the violation was caught, but its exit code, printed ID or unexpected IDs say otherwise",
      ],
    );
  });

  it("rejects a stale result after the fixture, host or rule changed", () => {
    const rule = completeForcedRule();
    repo.registry([rule]);
    const reportFile = writeReport([result(rule)]);
    assert.deepEqual(checkRegistry({ root: repo.root, fixtureReport: reportFile }).errors, []);
    repo.write(`test/fixtures/shared/violations/${rule.id}/src/bad.txt`, "changed\n");
    assert.match(
      checkRegistry({ root: repo.root, fixtureReport: reportFile }).errors[0].message,
      /^fixture-report: the result on host repo is stale/,
    );
  });

  it("rejects a partial report unless --allow-partial, and warns about unknown rules", () => {
    const rule = completeForcedRule();
    repo.registry([rule]);
    const reportFile = writeReport([result(rule), result(rule, { rule: "PROC-999" })], {
      partial: true,
    });
    assert.deepEqual(
      checkRegistry({ root: repo.root, fixtureReport: reportFile }).errors.map((e) => e.message),
      [
        "fixture-report: the report is partial (run-fixtures was filtered with --rule, --track or --host); run the whole matrix, or pass --allow-partial for local debugging",
      ],
    );
    const allowed = checkRegistry({
      root: repo.root,
      fixtureReport: reportFile,
      allowPartial: true,
    });
    assert.deepEqual(allowed.errors, []);
    assert.deepEqual(
      allowed.warnings.map((warning) => warning.message),
      [
        "warning: fixture-report: results for PROC-999, which is not in the registry",
        "warning: fixture-report: the report is partial (the run was filtered); rules outside the filter have no results",
      ],
    );
  });

  it("rejects unreadable, foreign or malformed reports", () => {
    assert.throws(
      () => readFixtureReport(path.join(repo.root, "missing.json")),
      (error) => error instanceof UsageError && /ENOENT/.test(error.message),
    );
    assert.throws(
      () => readFixtureReport(repo.write("a.json", { formatVersion: 1, results: [] })),
      /formatVersion 1; expected 2/,
    );
    assert.throws(
      () => readFixtureReport(repo.write("b.json", { formatVersion: 2 })),
      /has no "results" array/,
    );
    assert.throws(
      () => readFixtureReport(repo.write("c.json", { formatVersion: 2, results: [{ rule: "X" }] })),
      /results\[0\] needs "rule", "clean" and "violation"/,
    );
  });

  it("describes problems per result", () => {
    const rule = forcedRule();
    assert.deepEqual(
      fixtureResultProblems(
        readFixtureReport(writeReport([result(rule, { inputs: "sha256:x" })])).results[0],
        "PROC-102",
      ),
      [],
    );
  });
});

describe("check-registry: CLI", () => {
  it("prints help and exits 0", () => {
    const run = runScript(SCRIPT, ["--help"]);
    assert.equal(run.status, 0);
    assert.match(run.stdout, /^Usage: node scripts\/check-registry\.mjs \[options\]/);
    assert.match(
      run.stdout,
      /Exit codes: 0 clean \(warnings allowed\), 1 check failed, 2 usage or internal error\./,
    );
  });

  it("exits 2 on an unknown option or a malformed fixture report", () => {
    const unknown = runScript(SCRIPT, ["--nope"]);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /^check-registry: Unknown option '--nope'/);
    decision();
    repo.registry([reviewRule()]);
    const bad = runScript(SCRIPT, [
      "--root",
      repo.root,
      "--fixture-report",
      repo.write("r.json", "{"),
    ]);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /^check-registry: cannot read fixture report /);
  });

  it("exits 0 with findings and a summary line when only warnings exist", () => {
    const rule = completeForcedRule();
    decision("0001", "proposed");
    repo.registry([rule]);
    const run = runScript(SCRIPT, ["--root", repo.root]);
    assert.equal(run.status, 0, run.stderr);
    const lines = run.stdout.trimEnd().split("\n");
    assert.match(lines[0], /^PROC-102 registry\/rules\.json:\d+ warning: decision: /);
    assert.equal(
      lines.at(-1),
      "check-registry: 1 rules (1 FORCED, 0 GUARDED, 0 REVIEW; 0 pending promotion); fixture results not checked (pass --fixture-report); 0 error(s), 1 warning(s)",
    );
  });

  it("exits 1 on errors and prints gate evidence with --verbose", () => {
    repo.registry([forcedRule()]);
    const failing = runScript(SCRIPT, ["--root", repo.root]);
    assert.equal(failing.status, 1);
    assert.match(
      failing.stdout,
      /PROC-102 registry\/rules\.json:\d+ gate: script:check-sample not found/,
    );
    repo.registry([completeForcedRule()]);
    const verbose = runScript(SCRIPT, ["--root", repo.root, "--verbose"]);
    assert.equal(verbose.status, 0, verbose.stdout);
    assert.match(
      verbose.stdout,
      /^PROC-102 registry\/rules\.json:\d+ ok: script:check-sample — plugins\/cross-stack-standard\/scripts\/check-sample\.mjs --list-checks lists check-sample; run by the check chain in plugins\/cross-stack-standard\/templates\/web$/m,
    );
  });

  it("prints a JSON report with --json", () => {
    repo.registry([forcedRule()]);
    const run = runScript(SCRIPT, ["--root", repo.root, "--json"]);
    assert.equal(run.status, 1);
    const report = JSON.parse(run.stdout);
    assert.equal(report.tool, "check-registry");
    assert.equal(report.ok, false);
    assert.equal(report.registry, "registry/rules.json");
    assert.deepEqual(report.counts.byEnforcement, { FORCED: 1, GUARDED: 0, REVIEW: 0 });
    assert.deepEqual(report.errors.map((error) => error.check).sort(), [
      "decision",
      "fixture-dir",
      "fixture-dir",
      "gate",
    ]);
    assert.equal(report.gates[0].present, false);
    assert.deepEqual(report.fixtureReport, { checked: false, path: null });
  });

  it("formats reports without gate lines unless verbose", () => {
    repo.registry([completeForcedRule()]);
    const report = checkRegistry({ root: repo.root });
    assert.equal(formatReport(report).length, 1);
    assert.equal(formatReport(report, { verbose: true }).length, 2);
  });
});
