/**
 * Regression tests for the fixture runner's evidence rules: paths never count as printed ids,
 * ids must come from the violation (differential), an idPattern must name the gate, clean runs
 * must be fully clean, JUnit reports decide test-runner gates, host symlinks resolve inside the
 * work directory, a gate's background processes cannot outlive it, cleanup failures never abort
 * the matrix, and every result carries a fingerprint of its inputs.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { removeTree } from "../../../scripts/lib/fixtures/cleanup.mjs";
import { copiedLinkTarget, copyTree } from "../../../scripts/lib/fixtures/copy.mjs";
import {
  evaluateClean,
  evaluateViolation,
  junitStatus,
  parseJunitCases,
  stripPathTokens,
} from "../../../scripts/lib/fixtures/evaluate.mjs";
import { createIdScanner } from "../../../scripts/lib/fixtures/ids.mjs";
import { fixtureInputsDigest, stableStringify } from "../../../scripts/lib/fixtures/inputs.mjs";
import { runProcess } from "../../../scripts/lib/fixtures/process.mjs";
import { runFixtures } from "../../../scripts/lib/fixtures/runner.mjs";
import { tempDir } from "./helpers.mjs";

const scan = createIdScanner();
const base = {
  exitCode: 1,
  signal: null,
  timedOut: false,
  error: null,
  output: "",
  timeoutMs: 1000,
};
const expectation = {
  ruleId: "PROC-001",
  gateId: "check-foo",
  alsoFires: [],
  idPattern: null,
  failExitCodes: null,
  scan,
};

describe("ids in paths never count", () => {
  test("path-like tokens are removed, PHP class names are kept", () => {
    assert.equal(
      stripPathTokens("found a problem in src/PROC-001-sample.txt").trim(),
      "found a problem in",
    );
    assert.equal(
      stripPathTokens("<workdir>/x/PROC-001.json:3 bad").replace(/\s+/g, " "),
      "<workdir> bad",
    );
    assert.equal(stripPathTokens("C:\\work\\PROC-001.txt oops").trim(), "oops");
    assert.equal(
      stripPathTokens("P\\Tests\\Unit\\ArchTest::__pest_evaluable_BE_012_x"),
      "P\\Tests\\Unit\\ArchTest::__pest_evaluable_BE_012_x",
    );
    assert.equal(
      stripPathTokens("PROC-001-sample.txt: bad", ["PROC-001-sample.txt"]).trim(),
      "bad",
    );
  });
  test("a violation whose output names the rule only in a file path is not caught", () => {
    const verdict = evaluateViolation(
      { ...base, output: "found a problem in <workdir>/src/PROC-001-sample.txt" },
      expectation,
    );
    assert.equal(verdict.ok, false);
    assert.equal(verdict.idPrinted, false);
    assert.match(verdict.reasons.join("\n"), /contains neither PROC-001 nor PROC_001/);
  });
  test("a bare fixture file name that contains the id does not count either", () => {
    const verdict = evaluateViolation(
      { ...base, output: "PROC-001-sample.txt: problem" },
      { ...expectation, fileNames: ["PROC-001-sample.txt"] },
    );
    assert.equal(verdict.idPrinted, false);
  });
});

describe("the id must come from the violation", () => {
  test("an id the clean run also printed proves nothing", () => {
    const clean = evaluateClean({ ...base, exitCode: 0, output: "banner PROC-001" }, { scan });
    assert.equal(clean.ok, false, "the clean run printed a rule id");
    const verdict = evaluateViolation(
      { ...base, output: "banner PROC-001\nunrelated crash" },
      { ...expectation, cleanIds: clean.printedIds },
    );
    assert.equal(verdict.ok, false);
    assert.match(verdict.reasons.join("\n"), /printed by the clean run too/);
  });
  test("a clean run that prints another rule id (an advisory warning) is not clean", () => {
    const clean = evaluateClean(
      { ...base, exitCode: 0, output: "warning: UI-001 would also apply here (advisory)" },
      { scan },
    );
    assert.equal(clean.ok, false);
    assert.match(clean.reasons[0], /printed UI-001; a clean fixture must be fully clean/);
  });
});

describe("expect.idPattern is bound to the gate", () => {
  test("the matched text must name the gate id", () => {
    const loose = evaluateViolation(
      { ...base, output: "found a problem in x" },
      { ...expectation, idPattern: "." },
    );
    assert.equal(loose.ok, false);
    assert.match(loose.reasons.join("\n"), /does not name the gate id check-foo/);
    const bound = evaluateViolation(
      { ...base, output: "check-foo src/x.txt:3 expired" },
      { ...expectation, idPattern: "check-foo \\S+:\\d+ " },
    );
    assert.equal(bound.ok, true);
  });
  test("the matched text must name the sub-check when the gate has one", () => {
    const verdict = evaluateViolation(
      { ...base, output: "check-foo other src/x.txt:3" },
      { ...expectation, discriminator: "tier", idPattern: "check-foo \\S+" },
    );
    assert.match(verdict.reasons.join("\n"), /does not name the sub-check tier/);
  });
  test("a pattern that matches the clean output cannot tell the runs apart", () => {
    const clean = evaluateClean(
      { ...base, exitCode: 0, output: "check-foo: 3 files, all valid" },
      { scan, idPattern: "check-foo" },
    );
    assert.equal(clean.ok, false);
    assert.match(clean.reasons[0], /matches expect\.idPattern/);
  });
});

describe("JUnit reports decide test-runner gates", () => {
  const xml = (status) =>
    `<?xml version="1.0"?><testsuites><testsuite name="Arch">` +
    `<testcase name="BE-001 strict types" file="tests/ArchTest.php">${status}</testcase>` +
    `<testcase name="BE-002 other"/></testsuite></testsuites>`;
  test("parses names and statuses", () => {
    assert.deepEqual(parseJunitCases(xml("<failure>x</failure>")), [
      { name: "BE-001 strict types", status: "failed" },
      { name: "BE-002 other", status: "passed" },
    ]);
    assert.equal(junitStatus(xml("<skipped/>"), "BE-001 strict types"), "skipped");
    assert.equal(junitStatus(xml(""), "BE-009 absent"), "missing");
    assert.equal(junitStatus(null, "BE-001 strict types"), "no-report");
  });
  test("the named test must pass in the clean run and fail in the violation run", () => {
    const junitTest = "BE-001 strict types";
    assert.equal(
      evaluateClean({ ...base, exitCode: 0, junit: xml("") }, { scan, junitTest }).ok,
      true,
    );
    assert.match(
      evaluateClean({ ...base, exitCode: 0, junit: xml("<skipped/>") }, { scan, junitTest })
        .reasons[0],
      /was skipped, expected to pass/,
    );
    const failed = evaluateViolation(
      { ...base, output: "BE-001 strict types", junit: xml("<failure/>") },
      { ...expectation, ruleId: "BE-001", junitTest },
    );
    assert.equal(failed.ok, true);
    const otherFailure = evaluateViolation(
      { ...base, output: "BE-001 strict types", junit: xml("") },
      { ...expectation, ruleId: "BE-001", junitTest },
    );
    assert.match(otherFailure.reasons.join("\n"), /passed, expected to fail/);
  });
});

describe("host symlinks in work directories", () => {
  test("a link to a package outside the host (npm file: dependency) points at it absolutely", (t) => {
    const repo = tempDir(t);
    const host = path.join(repo, "test", "harness", "web");
    const pkg = path.join(repo, "vendor", "probe-pkg");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "index.js"), "module.exports = 'vendored';\n");
    fs.mkdirSync(path.join(host, "node_modules"), { recursive: true });
    fs.symlinkSync(
      "../../../../vendor/probe-pkg",
      path.join(host, "node_modules", "probe-pkg"),
      "dir",
    );
    fs.writeFileSync(path.join(host, "local.txt"), "x");
    fs.symlinkSync("local.txt", path.join(host, "alias.txt"));
    fs.symlinkSync(path.join(host, "local.txt"), path.join(host, "absolute.txt"));
    const work = path.join(tempDir(t), "w");
    copyTree(host, work, { hardlink: ["node_modules"] });
    const linked = path.join(work, "node_modules", "probe-pkg");
    assert.equal(fs.readlinkSync(linked), pkg, "outside target: absolute");
    assert.equal(
      fs.readFileSync(path.join(linked, "index.js"), "utf8"),
      "module.exports = 'vendored';\n",
    );
    assert.equal(fs.readlinkSync(path.join(work, "alias.txt")), "local.txt", "inside, relative");
    assert.equal(
      fs.readlinkSync(path.join(work, "absolute.txt")),
      path.join(work, "local.txt"),
      "an absolute link into the host is rewritten into the work directory",
    );
    fs.writeFileSync(path.join(work, "absolute.txt"), "changed");
    assert.equal(
      fs.readFileSync(path.join(host, "local.txt"), "utf8"),
      "x",
      "the host is untouched",
    );
  });
  test("copiedLinkTarget keeps a link into the tree relative", (t) => {
    const dir = tempDir(t);
    fs.mkdirSync(path.join(dir, "src", "a"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "file"), "x");
    fs.symlinkSync("../file", path.join(dir, "src", "a", "link"));
    assert.equal(
      copiedLinkTarget(
        path.join(dir, "src", "a", "link"),
        path.join(dir, "dst", "a", "link"),
        path.join(dir, "src"),
        path.join(dir, "dst"),
      ),
      path.join("..", "file"),
    );
  });
});

describe(
  "a gate's background processes do not outlive it",
  { skip: process.platform === "win32" && "POSIX process groups" },
  () => {
    test("a child with stdio ignored is ended when the gate exits", async (t) => {
      const dir = tempDir(t);
      const late = path.join(dir, "late.txt");
      const gate = path.join(dir, "gate.mjs");
      const code = `setTimeout(() => require("fs").writeFileSync(${JSON.stringify(late)}, "x"), 800)`;
      fs.writeFileSync(
        gate,
        [
          'import { spawn } from "node:child_process";',
          `spawn(process.execPath, ["-e", ${JSON.stringify(code)}], { stdio: "ignore" });`,
          'process.stdout.write("gate done\\n");',
          "process.exit(1);",
          "",
        ].join("\n"),
      );
      const result = await runProcess({
        argv: [process.execPath, gate],
        cwd: dir,
        env: process.env,
        timeoutMs: 10_000,
      });
      assert.equal(result.exitCode, 1);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.equal(fs.existsSync(late), false, "the background writer was ended with the gate");
    });
  },
);

describe("cleanup never aborts the matrix", () => {
  test("removeTree removes read-only directories", (t) => {
    const dir = path.join(tempDir(t), "w");
    fs.mkdirSync(path.join(dir, ".cache", "ro"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".cache", "ro", "entry"), "x");
    fs.chmodSync(path.join(dir, ".cache", "ro"), 0o555);
    assert.deepEqual(removeTree(dir), { ok: true, error: null });
    assert.equal(fs.existsSync(dir), false);
  });

  /** A root with one rule, one host and a gate script written by the test. */
  function probeRoot(t, gateSource, { idPattern } = {}) {
    const root = tempDir(t);
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    const rule = {
      id: "PROC-010",
      title: "probe",
      track: "shared",
      tier: 1,
      module: null,
      enforcement: "FORCED",
      gate: { kind: "script", id: "probe-gate" },
      evasions: [],
      decision: "0001",
      defaultEnabled: true,
      since: "1.0.0",
      configurable: [],
      summary: "probe",
    };
    write("registry/rules.json", JSON.stringify({ version: 1, rules: [rule] }));
    write("gate.mjs", gateSource);
    write(
      "test/harness/probe/host.json",
      JSON.stringify({
        name: "probe",
        description: "probe host",
        gates: {
          script: { argv: ["{node}", "{repoRoot}/gate.mjs", "{workdir}"], failExitCodes: [1] },
        },
      }),
    );
    write("test/fixtures/shared/clean/fixture.json", JSON.stringify({ hosts: ["probe"] }));
    write(
      "test/fixtures/shared/violations/PROC-010/fixture.json",
      JSON.stringify({ hosts: ["probe"], ...(idPattern ? { expect: { idPattern } } : {}) }),
    );
    write("test/fixtures/shared/violations/PROC-010/marker.txt", "violation\n");
    return { root, rule };
  }

  test("a gate that leaves a read-only directory still gets its verdict", async (t) => {
    const { root } = probeRoot(
      t,
      [
        'import fs from "node:fs";',
        'import path from "node:path";',
        "const work = process.argv[2];",
        'fs.mkdirSync(path.join(work, ".cache", "ro"), { recursive: true });',
        'fs.writeFileSync(path.join(work, ".cache", "ro", "entry"), "x");',
        'fs.chmodSync(path.join(work, ".cache", "ro"), 0o555);',
        'if (fs.existsSync(path.join(work, "marker.txt"))) { console.log("PROC-010 violation"); process.exit(1); }',
        "",
      ].join("\n"),
    );
    const run = await runFixtures({ root, tempDir: path.join(root, "tmp"), jobs: 1 });
    assert.equal(run.results.length, 1);
    assert.equal(run.results[0].ok, true, JSON.stringify(run.results[0], null, 2));
    assert.deepEqual(run.results[0].warnings, []);
    assert.deepEqual(
      fs.readdirSync(path.join(root, "tmp")),
      [],
      "no work directory is left behind",
    );
  });

  test("an idPattern that does not name the gate is a configuration error", async (t) => {
    const { root } = probeRoot(t, "process.exit(1);\n", { idPattern: "." });
    const run = await runFixtures({ root, jobs: 1 });
    assert.equal(run.results[0].ok, false);
    assert.match(run.results[0].error, /expect\.idPattern must name the gate id probe-gate/);
  });

  test("every result records a fingerprint of its inputs, which changes with them", async (t) => {
    const { root, rule } = probeRoot(t, "process.exit(0);\n");
    const dirs = {
      fixturesDir: path.join(root, "test", "fixtures"),
      harnessDir: path.join(root, "test", "harness"),
    };
    const first = fixtureInputsDigest({ rule, hostName: "probe", ...dirs });
    assert.match(first, /^sha256:[0-9a-f]{64}$/);
    assert.equal(fixtureInputsDigest({ rule: { ...rule }, hostName: "probe", ...dirs }), first);
    const run = await runFixtures({ root, jobs: 1 });
    assert.equal(run.results[0].inputs, first);
    fs.writeFileSync(
      path.join(dirs.fixturesDir, "shared", "violations", "PROC-010", "marker.txt"),
      "v2\n",
    );
    const second = fixtureInputsDigest({ rule, hostName: "probe", ...dirs });
    assert.notEqual(second, first, "a fixture change changes the fingerprint");
    assert.notEqual(
      fixtureInputsDigest({
        rule: { ...rule, gate: { kind: "script", id: "other" } },
        hostName: "probe",
        ...dirs,
      }),
      second,
      "a registry change changes the fingerprint",
    );
    fs.appendFileSync(path.join(dirs.harnessDir, "probe", "host.json"), "\n");
    assert.notEqual(
      fixtureInputsDigest({ rule, hostName: "probe", ...dirs }),
      second,
      "a host change",
    );
    assert.equal(
      stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] }),
      '{"a":[2,{"c":4,"d":3}],"b":1}',
    );
  });
});

test("git is available for these tests' helpers", () => {
  assert.equal(spawnSync("git", ["--version"]).status, 0);
});

describe("the fixture fingerprint covers the gate's implementation", () => {
  test("editing a hook script or the kit tool makes an older result stale", (t) => {
    const root = tempDir(t);
    const dirs = {
      fixturesDir: path.join(root, "test", "fixtures"),
      harnessDir: path.join(root, "test", "harness"),
    };
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    write("plugins/cross-stack-standard/scripts/handlers/stop.mjs", "export default 1;\n");
    write("plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs", "1\n");
    const hookRule = { id: "PROC-022", track: "shared", gate: { kind: "hook", id: "Stop" } };
    const scriptRule = { id: "PROC-014", track: "shared", gate: { kind: "script", id: "x" } };
    const hookBefore = fixtureInputsDigest({ rule: hookRule, hostName: "hook", ...dirs });
    const scriptBefore = fixtureInputsDigest({ rule: scriptRule, hostName: "node", ...dirs });

    write("plugins/cross-stack-standard/scripts/handlers/stop.mjs", "export default 2;\n");
    assert.notEqual(
      fixtureInputsDigest({ rule: hookRule, hostName: "hook", ...dirs }),
      hookBefore,
      "a hook script change",
    );
    assert.equal(
      fixtureInputsDigest({ rule: scriptRule, hostName: "node", ...dirs }),
      scriptBefore,
      "a hook script does not affect a script gate",
    );
    write("plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs", "2\n");
    assert.notEqual(
      fixtureInputsDigest({ rule: scriptRule, hostName: "node", ...dirs }),
      scriptBefore,
      "a kit tool change",
    );
  });
});
