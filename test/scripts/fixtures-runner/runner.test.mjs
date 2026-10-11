/**
 * Library-level tests of scripts/lib/fixtures/runner.mjs and report.mjs: the cross-device copy
 * fallback inside a real run, abort handling, progress callbacks and report formatting.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { buildReport, formatHuman, formatPlan } from "../../../scripts/lib/fixtures/report.mjs";
import { planFixtures, runFixtures } from "../../../scripts/lib/fixtures/runner.mjs";
import { makeMiniRoot, resultFor } from "./helpers.mjs";

describe("runFixtures", () => {
  test("a run whose temp directory is on another device still passes, with copies", async (t) => {
    const root = makeMiniRoot(t);
    const exdev = () => {
      throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" });
    };
    const seen = [];
    const run = await runFixtures({
      root,
      rules: ["CI-912"],
      link: exdev,
      onResult: (r) => seen.push(r.rule),
    });
    const result = resultFor({ results: run.results }, "CI-912");
    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    assert.deepEqual(result.clean.copy, { linked: 0, copied: 6, symlinks: 0, fallback: "EXDEV" });
    assert.deepEqual(seen, ["CI-912"]);
    assert.equal(run.tempRoot, null);
  });

  test("an abort stops the run and marks unfinished work", async (t) => {
    const root = makeMiniRoot(t);
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 1500);
    const run = await runFixtures({
      root,
      rules: ["CI-908", "CI-912"],
      jobs: 1,
      timeoutMs: 60_000,
      signal: controller.signal,
    });
    assert.ok(Date.now() - started < 20_000);
    const hung = resultFor({ results: run.results }, "CI-908");
    assert.equal(hung.ok, false);
    assert.match(hung.violation.reasons.join("\n"), /violation: aborted/);
    const pending = resultFor({ results: run.results }, "CI-912");
    assert.equal(pending.error, "aborted before this run started");
  });

  test("a prepare failure is reported as an infrastructure error of the run", async (t) => {
    const root = makeMiniRoot(t);
    const hostFile = path.join(root, "test", "harness", "plain", "host.json");
    const host = JSON.parse(fs.readFileSync(hostFile, "utf8"));
    host.prepare = [["{node}", "-e", "console.error('autoload failed'); process.exit(9)"]];
    fs.writeFileSync(hostFile, JSON.stringify(host));
    const run = await runFixtures({ root, rules: ["CI-901"] });
    const result = resultFor({ results: run.results }, "CI-901");
    assert.equal(result.ok, false);
    assert.match(
      result.clean.reasons[0],
      /clean: test\/harness\/plain\/host\.json prepare\[0\] \(.*\) failed: exit 9\nautoload failed/,
    );
    assert.doesNotMatch(
      result.clean.reasons[0],
      new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "absolute paths are replaced",
    );
  });

  test("base/head on a host without git is a clear error", async (t) => {
    const root = makeMiniRoot(t);
    const fixture = path.join(root, "test", "fixtures", "shared", "violations", "CI-901");
    fs.mkdirSync(path.join(fixture, "head"));
    fs.writeFileSync(path.join(fixture, "head", "x.txt"), "x\n");
    fs.writeFileSync(
      path.join(fixture, "fixture.json"),
      JSON.stringify({ hosts: ["plain"], head: "head" }),
    );
    const run = await runFixtures({ root, rules: ["CI-901"] });
    const result = resultFor({ results: run.results }, "CI-901");
    assert.equal(result.clean.ok, true);
    assert.match(
      result.violation.reasons[0],
      /base\/head need a host with "git": true, but host "plain" has none/,
    );
  });

  test("a clean layer that does not list the host fails with a message", async (t) => {
    const root = makeMiniRoot(t);
    const clean = path.join(root, "test", "fixtures", "shared", "clean", "fixture.json");
    fs.writeFileSync(clean, JSON.stringify({ hosts: ["repo"] }));
    const run = await runFixtures({ root, rules: ["CI-901"] });
    assert.match(
      resultFor({ results: run.results }, "CI-901").error,
      /shared\/clean\/fixture\.json does not list host "plain"/,
    );
  });

  test("remove of a path that does not exist is a stale-fixture error", async (t) => {
    const root = makeMiniRoot(t);
    const file = path.join(
      root,
      "test",
      "fixtures",
      "shared",
      "violations",
      "CI-901",
      "fixture.json",
    );
    fs.writeFileSync(file, JSON.stringify({ hosts: ["plain"], remove: ["src/gone.txt"] }));
    const run = await runFixtures({ root, rules: ["CI-901"] });
    assert.match(
      resultFor({ results: run.results }, "CI-901").violation.reasons[0],
      /remove: "src\/gone\.txt" does not exist/,
    );
  });

  test("rename writes a file under a name that cannot be committed", async (t) => {
    const root = makeMiniRoot(t);
    const dir = path.join(root, "test", "fixtures", "shared", "violations", "CI-901");
    fs.writeFileSync(path.join(dir, "dot-env"), "VIOLATION CI-901 secret in env\n");
    fs.writeFileSync(
      path.join(dir, "fixture.json"),
      JSON.stringify({ hosts: ["plain"], rename: { "dot-env": "src/.env" } }),
    );
    fs.rmSync(path.join(dir, "src"), { recursive: true });
    const run = await runFixtures({ root, rules: ["CI-901"], keepTemp: true });
    t.after(() => fs.rmSync(run.tempRoot, { recursive: true, force: true }));
    const result = resultFor({ results: run.results }, "CI-901");
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(path.join(result.violation.workdir, "src", ".env")));
    assert.ok(!fs.existsSync(path.join(result.violation.workdir, "dot-env")));
  });
});

describe("report", () => {
  test("buildReport and formatHuman", async (t) => {
    const root = makeMiniRoot(t);
    const run = await runFixtures({ root, rules: ["CI-901", "CI-903", "CI-911"] });
    const report = buildReport(run, { rules: ["CI-901", "CI-903", "CI-911"] });
    assert.equal(report.summary.ok, false);
    assert.deepEqual(
      {
        runs: report.summary.runs,
        passed: report.summary.passed,
        failed: report.summary.failed,
        missing: report.summary.missingFixtures,
      },
      { runs: 2, passed: 1, failed: 1, missing: 1 },
    );
    const text = formatHuman(report, { reportPath: "fixture-report.json" });
    const lines = text.trimEnd().split("\n");
    assert.match(
      lines[0],
      /^CI-903 test\/fixtures\/shared\/violations\/CI-903\/fixture\.json:1 \[plain\] violation: /,
    );
    assert.match(
      lines.at(-1),
      /^run-fixtures: 1 of 2 runs passed, 1 failed, 1 rule without a required fixture in \d+\.\d s; report fixture-report\.json$/,
    );
    assert.doesNotMatch(text, /^ok CI-901/m);
    assert.match(
      formatHuman(report, { verbose: true }),
      /^ok CI-901 \[plain\] clean exit 0, violation exit 1 \(\d+ ms\)$/m,
    );
  });

  test("formatPlan lists runs, errors, missing and skipped rules", (t) => {
    const root = makeMiniRoot(t);
    const plan = planFixtures({ root });
    const text = formatPlan(plan);
    assert.match(
      text,
      /^CI-907 \[repo\] script:fixture-gate test\/fixtures\/shared\/violations\/CI-907$/m,
    );
    assert.match(
      text,
      /^CI-918 test\/fixtures\/shared\/violations\/CI-918\/fixture\.json: unknown key "hostz"$/m,
    );
    assert.match(text, /^run-fixtures: 16 planned runs$/m);
  });
});
