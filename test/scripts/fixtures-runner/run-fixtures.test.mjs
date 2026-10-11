/**
 * End-to-end tests of scripts/run-fixtures.mjs against the mini repository.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { git, isAlive, makeMiniRoot, readJson, resultFor, runCli, tempDir } from "./helpers.mjs";

function reportPath(root) {
  return path.join(root, "out", "fixture-report.json");
}

function run(root, args, options) {
  // Kept work directories go inside the test's temp root, which the test removes.
  const keep = args.includes("--keep-temp") ? ["--temp-dir", path.join(root, ".work")] : [];
  const result = runCli(root, ["--report", reportPath(root), ...keep, ...args], options);
  const report = fs.existsSync(reportPath(root)) ? readJson(reportPath(root)) : null;
  return { ...result, report };
}

describe("CLI basics", () => {
  test("--help prints usage and exits 0", (t) => {
    const root = makeMiniRoot(t);
    const result = runCli(root, ["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^Usage: node scripts\/run-fixtures\.mjs/);
    assert.match(result.stdout, /--keep-temp/);
  });

  test("an unknown option is a usage error (exit 2)", (t) => {
    const root = makeMiniRoot(t);
    const result = runCli(root, ["--bogus"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /bogus/);
  });

  test("an unknown rule, track or variable is a usage error (exit 2)", (t) => {
    const root = makeMiniRoot(t);
    const rule = runCli(root, ["--rule", "CI-999"]);
    assert.equal(rule.status, 2);
    assert.match(rule.stderr, /CI-999 is not in the registry/);
    const track = runCli(root, ["--track", "desktop"]);
    assert.equal(track.status, 2);
    assert.match(track.stderr, /unknown track "desktop"/);
    const variable = runCli(root, ["--rule", "CI-901", "--var", "kitbin=/x"]);
    assert.equal(variable.status, 2);
    assert.match(variable.stderr, /--var kitbin is not declared by any harness host .*kitBin/);
    const badNumber = runCli(root, ["--jobs", "0"]);
    assert.equal(badNumber.status, 2);
  });

  test("a missing registry is an error (exit 2)", (t) => {
    const root = tempDir(t);
    const result = runCli(root, []);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /registry\/rules\.json: cannot read the registry: file not found/);
  });

  test("--list prints the plan without running or writing a report", (t) => {
    const root = makeMiniRoot(t);
    const result = run(root, ["--list"]);
    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /^CI-901 \[plain\] script:fixture-gate test\/fixtures\/shared\/violations\/CI-901$/m,
    );
    assert.match(result.stdout, /^CI-906 \[node\] script:fixture-gate:manifest /m);
    assert.match(result.stdout, /^CI-911 missing violation fixture$/m);
    assert.match(result.stdout, /^CI-909 skipped \(no fixture yet\)$/m);
    assert.doesNotMatch(result.stdout, /CI-910/);
    assert.equal(result.report, null);
  });
});

describe("clean passes, violation fails with the id", () => {
  test("a gate that fails and prints the id passes the matrix (exit 0)", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, stderr, report } = run(root, ["--rule", "CI-901"]);
    assert.equal(status, 0, stdout);
    assert.match(stderr, /^\[1\/1\] ok CI-901 \[plain\] \d+\.\d s$/m, "progress on stderr");
    assert.equal(run(root, ["--rule", "CI-901", "--quiet"]).stderr, "");
    assert.equal(report.formatVersion, 2);
    assert.match(resultFor(report, "CI-901").inputs, /^sha256:[0-9a-f]{64}$/);
    assert.equal(report.partial, true);
    assert.deepEqual(report.filters, { rules: ["CI-901"], track: null, host: null });
    assert.equal(report.summary.ok, true);
    const result = resultFor(report, "CI-901");
    assert.equal(result.host, "plain");
    assert.equal(result.ok, true);
    assert.equal(result.fixture, "test/fixtures/shared/violations/CI-901");
    assert.deepEqual(result.gate, { kind: "script", id: "fixture-gate", discriminator: null });
    assert.equal(result.clean.ok, true);
    assert.equal(result.clean.exitCode, 0);
    assert.equal(result.violation.ok, true);
    assert.equal(result.violation.exitCode, 1);
    assert.equal(result.violation.idPrinted, true);
    assert.deepEqual(result.violation.unexpectedIds, []);
    assert.equal(typeof result.durationMs, "number");
    assert.match(stdout, /^run-fixtures: 1 of 1 run passed in \d+\.\d s; report /m);
  });

  test("the underscore form (CI_902, as test runners print it) counts as the id", (t) => {
    const root = makeMiniRoot(t);
    const { status, report } = run(root, ["--rule", "CI-902"]);
    assert.equal(status, 0);
    assert.equal(resultFor(report, "CI-902").violation.idPrinted, true);
  });

  test("a violation that fails without printing the id fails the matrix", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report } = run(root, ["--rule", "CI-903"]);
    assert.equal(status, 1);
    const result = resultFor(report, "CI-903");
    assert.equal(result.ok, false);
    assert.equal(result.clean.ok, true);
    assert.equal(result.violation.exitCode, 1);
    assert.equal(result.violation.idPrinted, false);
    assert.equal(result.violation.ok, false);
    assert.deepEqual(result.violation.outputTail, ["something went wrong"]);
    assert.match(
      stdout,
      /^CI-903 test\/fixtures\/shared\/violations\/CI-903\/fixture\.json:1 \[plain\] violation: output contains neither CI-903 nor CI_903$/m,
    );
    assert.match(stdout, /^ {4}\| violation> something went wrong$/m);
  });

  test("a violation the gate does not catch (exit 0) fails the matrix", (t) => {
    const root = makeMiniRoot(t);
    const { status, report } = run(root, ["--rule", "CI-913"]);
    assert.equal(status, 1);
    const result = resultFor(report, "CI-913");
    assert.equal(result.violation.exitCode, 0);
    assert.equal(result.violation.ok, false);
    assert.match(result.violation.reasons.join("\n"), /exited 0, expected a failure/);
  });

  test("a clean run that fails fails the matrix", (t) => {
    const root = makeMiniRoot(t);
    const { status, report } = run(root, ["--rule", "CI-914"]);
    assert.equal(status, 1);
    const result = resultFor(report, "CI-914");
    assert.equal(result.clean.ok, false);
    assert.equal(result.clean.exitCode, 1);
    assert.deepEqual(result.clean.outputTail, ["CI-914 src/dirty.txt:1 the clean state is dirty"]);
    // The violation run prints CI-914 too, but so did the clean run: that proves nothing.
    assert.equal(result.violation.ok, false);
    assert.match(result.violation.reasons.join("\n"), /printed by the clean run too/);
    assert.equal(result.ok, false);
  });

  test("expect.idPattern replaces the id check", (t) => {
    const root = makeMiniRoot(t);
    const { status, report } = run(root, ["--rule", "CI-915"]);
    assert.equal(status, 0);
    assert.equal(resultFor(report, "CI-915").violation.idPrinted, true);
  });
});

describe("sibling ids", () => {
  test("an undeclared sibling id fails the violation run", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report } = run(root, ["--rule", "CI-904"]);
    assert.equal(status, 1);
    const result = resultFor(report, "CI-904");
    assert.equal(result.violation.idPrinted, true);
    assert.deepEqual(result.violation.unexpectedIds, ["CI-901"]);
    assert.equal(result.violation.ok, false);
    assert.match(stdout, /violation: also printed CI-901; .*alsoFires/);
  });

  test("a sibling id listed in alsoFires is allowed", (t) => {
    const root = makeMiniRoot(t);
    const { status, report } = run(root, ["--rule", "CI-905"]);
    assert.equal(status, 0);
    const result = resultFor(report, "CI-905");
    assert.deepEqual(result.violation.unexpectedIds, []);
    assert.deepEqual(result.violation.alsoFired, ["CI-901"]);
  });
});

describe("hosts and layers", () => {
  test("manifestOverlay is merged into .cross-stack/standard.json (node host)", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report } = run(root, ["--rule", "CI-906", "--keep-temp"], {
      kitBin: true,
    });
    assert.equal(status, 0, stdout);
    const result = resultFor(report, "CI-906", "node");
    assert.equal(result.ok, true);
    const cleanManifest = readJson(
      path.join(result.clean.workdir, ".cross-stack", "standard.json"),
    );
    assert.deepEqual(cleanManifest, {
      version: "0.0.0",
      tracks: ["shared"],
      modules: { demo: { strict: true, level: 1 } },
    });
    const violationManifest = readJson(
      path.join(result.violation.workdir, ".cross-stack", "standard.json"),
    );
    assert.deepEqual(violationManifest.modules, { demo: { level: 1 } });
    const gateRun = readJson(path.join(result.clean.workdir, ".gate-run.json"));
    // The real node host passes the discriminator, then the work directory as --root.
    assert.deepEqual(gateRun.argv, ["fixture-gate", "manifest", "--root", result.clean.workdir]);
    assert.match(stdout, /kept clean: /);
  });

  test("base/head become commits in the repo host and reach the gate as SHAs", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report } = run(root, ["--rule", "CI-907", "--keep-temp"], {
      kitBin: true,
    });
    assert.equal(status, 0, stdout);
    const result = resultFor(report, "CI-907", "repo");
    assert.equal(result.ok, true);

    const clean = result.clean.workdir;
    assert.deepEqual(git(clean, ["log", "--format=%s"]).split("\n"), [
      "feat: compliant change",
      "chore: add range baseline",
      "chore: initial fixture state",
    ]);
    assert.equal(git(clean, ["show", "HEAD~1:docs/change.md"]), "base");
    assert.equal(git(clean, ["show", "HEAD:docs/change.md"]), "head");
    assert.equal(
      git(clean, ["log", "-1", "--format=%an <%ae>"]),
      "Fixture Harness <fixtures@example.invalid>",
    );
    const gateRun = readJson(path.join(clean, ".gate-run.json"));
    const baseSha = git(clean, ["rev-parse", "HEAD~1"]);
    const headSha = git(clean, ["rev-parse", "HEAD"]);
    assert.deepEqual(gateRun.argv, [
      "fixture-gate",
      "--root",
      clean,
      "--base",
      baseSha,
      "--head",
      headSha,
    ]);

    const violation = result.violation.workdir;
    assert.deepEqual(git(violation, ["log", "--format=%s"]).split("\n"), [
      "feat: VIOLATION sneaky change",
      "chore: add range baseline",
      "chore: initial fixture state",
    ]);
    assert.equal(git(violation, ["show", "HEAD:docs/extra.md"]), "extra");
    assert.equal(git(violation, ["ls-tree", "--name-only", "HEAD~1", "docs/"]), "docs/change.md");
    // The initial commit holds the host content and the flat layers.
    const initialFiles = git(violation, ["ls-tree", "-r", "--name-only", "HEAD~2"]).split("\n");
    assert.ok(initialFiles.includes("README.md"));
    assert.ok(initialFiles.includes("src/range.txt"));
    assert.ok(!initialFiles.includes("host.json"));
    assert.ok(!initialFiles.includes("fixture.json"));
  });

  test("the gate environment is isolated from the caller", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report } = run(root, ["--rule", "CI-907", "--keep-temp"], {
      kitBin: true,
      env: {
        GIT_DIR: path.join(root, "not-a-repo"),
        GIT_INDEX_FILE: path.join(root, "not-an-index"),
        CROSS_STACK_STANDARD_DISABLE: "1",
        CLAUDECODE: "1",
        AI_AGENT: "claude-code",
        FORCE_COLOR: "3",
      },
    });
    assert.equal(status, 0, stdout);
    const gateRun = readJson(
      path.join(resultFor(report, "CI-907").violation.workdir, ".gate-run.json"),
    );
    assert.equal(gateRun.env.PAO_DISABLE, "1");
    assert.equal(gateRun.env.NO_COLOR, "1");
    assert.equal(gateRun.env.CI, "1");
    assert.equal(gateRun.env.GIT_CONFIG_NOSYSTEM, "1");
    assert.ok(gateRun.env.GIT_CONFIG_GLOBAL);
    for (const name of [
      "GIT_DIR",
      "CROSS_STACK_STANDARD_DISABLE",
      "CLAUDECODE",
      "AI_AGENT",
      "FORCE_COLOR",
    ]) {
      assert.equal(gateRun.env[name], null, name);
    }
  });

  test("dependency directories are hard-linked, detached paths copied, excludes skipped", (t) => {
    const root = makeMiniRoot(t);
    const plain = path.join(root, "test", "harness", "plain");
    const { status, stdout, report } = run(root, ["--rule", "CI-912", "--keep-temp"]);
    assert.equal(status, 0, stdout);
    const result = resultFor(report, "CI-912");
    assert.equal(result.ok, true);
    const workdir = result.clean.workdir;
    const hostIndex = fs.statSync(path.join(plain, "node_modules", "dep", "index.js"));
    const copyIndex = fs.statSync(path.join(workdir, "node_modules", "dep", "index.js"));
    assert.equal(copyIndex.ino, hostIndex.ino, "index.js is a hard link");
    assert.ok(hostIndex.nlink >= 2);
    const hostCache = fs.statSync(path.join(plain, "node_modules", "dep", "cache.json"));
    const copyCache = fs.statSync(path.join(workdir, "node_modules", "dep", "cache.json"));
    assert.notEqual(copyCache.ino, hostCache.ino, "cache.json is detached (copied)");
    assert.deepEqual(result.clean.copy, { linked: 1, copied: 5, symlinks: 0, fallback: null });
    assert.ok(!fs.existsSync(path.join(workdir, "debug.log")), "*.log is excluded");
    assert.ok(!fs.existsSync(path.join(workdir, "setup-count.txt")), "setup-count.txt is excluded");
    assert.ok(!fs.existsSync(path.join(workdir, "host.json")), "host.json is never copied");
    assert.equal(fs.readFileSync(path.join(workdir, "prepared.txt"), "utf8"), "ok", "prepare ran");
    const gateRun = readJson(path.join(workdir, ".gate-run.json"));
    assert.deepEqual(gateRun.argv, ["fixture-gate", "--rule", "CI-912"]);
    assert.equal(gateRun.env.FIXTURE_HOST_ENV, plain);
    assert.equal(gateRun.env.FIXTURE_GATE_KIND, "script");
    // The violation removed its hard link only: the host keeps its file.
    assert.ok(
      !fs.existsSync(path.join(result.violation.workdir, "node_modules", "dep", "index.js")),
    );
    assert.equal(
      fs.readFileSync(path.join(plain, "node_modules", "dep", "index.js"), "utf8"),
      "module.exports = 1;\n",
    );
  });

  test("a composed host copies included hosts into subdirectories and runs their prepare", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report } = run(root, ["--rule", "CI-916"]);
    assert.equal(status, 0, stdout);
    assert.equal(resultFor(report, "CI-916", "combo").ok, true);
  });

  test("host setup runs once per invocation, and not at all with --skip-setup", (t) => {
    const root = makeMiniRoot(t);
    const counter = path.join(root, "test", "harness", "plain", "setup-count.txt");
    const skipped = run(root, ["--rule", "CI-901,CI-916", "--skip-setup"]);
    assert.equal(skipped.status, 0, skipped.stdout);
    assert.ok(!fs.existsSync(counter));
    assert.deepEqual(skipped.report.setup, []);
    const { status, report } = run(root, ["--rule", "CI-901,CI-902,CI-916", "--jobs", "3"]);
    assert.equal(status, 0);
    assert.equal(fs.readFileSync(counter, "utf8"), "x");
    // combo includes plain, so plain's setup completes first and runs only once.
    assert.deepEqual(
      report.setup.map((entry) => [entry.host, entry.ok, entry.commands]),
      [
        ["plain", true, 1],
        ["combo", true, 0],
      ],
    );
  });

  test("a failing host setup fails every run on that host", (t) => {
    const root = makeMiniRoot(t);
    const hostFile = path.join(root, "test", "harness", "plain", "host.json");
    const host = readJson(hostFile);
    host.setup = [["{node}", "-e", "console.error('install failed'); process.exit(4)"]];
    fs.writeFileSync(hostFile, JSON.stringify(host));
    const { status, stdout, report } = run(root, ["--rule", "CI-901,CI-902"]);
    assert.equal(status, 1);
    for (const rule of ["CI-901", "CI-902"]) {
      assert.match(resultFor(report, rule).error, /setup\[0\] .* failed: exit 4\ninstall failed/);
    }
    assert.match(stdout, /^CI-901 .*setup\[0\].*failed: exit 4$/m);
    assert.match(stdout, /^ {4}\| install failed$/m);
    assert.equal(report.setup.length, 1, "setup is not retried for the second rule");
    assert.equal(report.setup[0].host, "plain");
    assert.equal(report.setup[0].ok, false);
    assert.match(report.setup[0].error, /failed: exit 4/);
  });
});

describe("timeouts", () => {
  test("a gate that hangs is killed with its child processes and reported as timed out", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report, ms } = run(root, [
      "--rule",
      "CI-908",
      "--timeout",
      "1500",
      "--keep-temp",
    ]);
    assert.equal(status, 1, stdout);
    const result = resultFor(report, "CI-908");
    assert.equal(result.clean.ok, true);
    assert.equal(result.violation.timedOut, true);
    assert.equal(result.violation.exitCode, null);
    assert.equal(result.violation.ok, false);
    assert.match(stdout, /violation: timed out after 1500 ms/);
    assert.ok(ms < 30_000, `took ${ms} ms`);
    const pid = Number(
      fs.readFileSync(path.join(result.violation.workdir, "grandchild.pid"), "utf8"),
    );
    assert.ok(Number.isInteger(pid) && pid > 0);
    const deadline = Date.now() + 5000;
    while (isAlive(pid) && Date.now() < deadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
    assert.equal(isAlive(pid), false, "the grandchild process was killed");
  });
});

describe("configuration errors", () => {
  test("unmapped gate kinds, invalid fixture.json and unknown hosts fail with a message", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report } = run(root, ["--rule", "CI-917,CI-918,CI-919"]);
    assert.equal(status, 1);
    assert.match(
      resultFor(report, "CI-917").error,
      /host "plain" has no gate command for kind "eslint"/,
    );
    const invalid = resultFor(report, "CI-918");
    assert.equal(invalid.host, null);
    assert.match(invalid.error, /violations\/CI-918\/fixture\.json: unknown key "hostz"/);
    assert.match(resultFor(report, "CI-919").error, /host "missing-host" not found/);
    assert.match(stdout, /^CI-918 test\/fixtures\/shared\/violations\/CI-918\/fixture\.json:1 /m);
  });

  test("an enforced rule named with --rule but without a fixture is missing (exit 1)", (t) => {
    const root = makeMiniRoot(t);
    const { status, stdout, report } = run(root, ["--rule", "CI-911"]);
    assert.equal(status, 1);
    assert.deepEqual(report.missingFixtures, [
      {
        rule: "CI-911",
        track: "shared",
        enforcement: "FORCED",
        fixture: "test/fixtures/shared/violations/CI-911",
      },
    ]);
    assert.match(
      stdout,
      /^CI-911 test\/fixtures\/shared\/violations\/CI-911\/fixture\.json:1 enforcement is FORCED but the violation fixture is missing$/m,
    );
  });
});

describe("full matrix", () => {
  test("runs every enforced or targeted rule from the registry and writes the report", (t) => {
    const root = makeMiniRoot(t);
    const json = runCli(root, ["--json", "--timeout", "3000"], { kitBin: true });
    assert.equal(json.status, 1, json.stderr);
    const report = JSON.parse(json.stdout);
    assert.deepEqual(
      readJson(path.join(root, "fixture-report.json")),
      report,
      "default report path",
    );
    assert.equal(report.partial, false);
    assert.deepEqual(report.summary, {
      ok: false,
      runs: 17,
      passed: 9,
      failed: 8,
      missingFixtures: 1,
      skipped: 1,
      durationMs: report.summary.durationMs,
    });
    assert.deepEqual(report.skipped, ["CI-909"]);
    assert.deepEqual(
      report.missingFixtures.map((m) => m.rule),
      ["CI-911"],
    );
    assert.deepEqual(
      report.results.map((r) => `${r.rule}:${r.ok ? "ok" : "fail"}`),
      [
        "CI-901:ok",
        "CI-902:ok",
        "CI-903:fail",
        "CI-904:fail",
        "CI-905:ok",
        "CI-906:ok",
        "CI-907:ok",
        "CI-908:fail",
        "CI-912:ok",
        "CI-913:fail",
        "CI-914:fail",
        "CI-915:ok",
        "CI-916:ok",
        "CI-917:fail",
        "CI-918:fail",
        "CI-919:fail",
        "WEB-901:ok",
      ],
      "registry order; CI-910 (review only) is never selected",
    );
    assert.ok(!report.results.some((r) => r.clean.workdir), "no work directory is kept");
    assert.equal(
      fs.readdirSync(path.join(root, "test", "harness", "plain")).includes("setup-count.txt"),
      true,
    );
  });

  test("--track and --host filter the matrix; filtered runs do not report unrelated gaps", (t) => {
    const root = makeMiniRoot(t);
    const web = run(root, ["--track", "web"]);
    assert.equal(web.status, 0, web.stdout);
    assert.deepEqual(
      web.report.results.map((r) => r.rule),
      ["WEB-901"],
    );
    assert.deepEqual(web.report.filters, { rules: [], track: "web", host: null });
    const combo = run(root, ["--host", "combo"]);
    assert.equal(combo.status, 0, combo.stdout);
    assert.deepEqual(
      combo.report.results.map((r) => `${r.rule}@${r.host}`),
      ["CI-916@combo"],
    );
    assert.deepEqual(combo.report.missingFixtures, []);
  });

  test("an empty selection says that nothing ran instead of reporting a pass count", (t) => {
    const root = makeMiniRoot(t);
    const empty = run(root, ["--track", "laravel"]);
    assert.equal(empty.status, 0, empty.stdout);
    assert.equal(empty.report.summary.runs, 0);
    assert.match(
      empty.stdout,
      /^run-fixtures: no fixture runs \(no selected rule has a violation fixture yet\) in \d+\.\d s; report /m,
    );
    assert.doesNotMatch(empty.stdout, /0 of 0/);
  });

  test("--no-report writes nothing; --temp-dir places work directories", (t) => {
    const root = makeMiniRoot(t);
    const parent = tempDir(t, "csf-parent-");
    const result = runCli(root, [
      "--rule",
      "CI-901",
      "--no-report",
      "--keep-temp",
      "--temp-dir",
      parent,
      "--json",
    ]);
    assert.equal(result.status, 0);
    assert.ok(!fs.existsSync(path.join(root, "fixture-report.json")));
    const report = JSON.parse(result.stdout);
    const workdir = resultFor(report, "CI-901").clean.workdir;
    assert.ok(workdir.startsWith(parent + path.sep), workdir);
    assert.doesNotMatch(path.basename(path.dirname(path.dirname(workdir))), /CI-901/);
  });
});
