/**
 * The shipped `node` and `repo` harness hosts run `script` gates through the kit's real
 * dependency-free binary. These tests build a temporary repository holding the real hosts, the
 * real binary at the hosts' default `kitBin` location and one real registry rule, then prove the
 * calling convention end to end: the binary checks the work directory (`--root`), a clean
 * fixture passes, a violation fails with exit 1, and a crash (exit 2) never counts as a caught
 * violation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { REPO_ROOT, readJson, resultFor, runCli, tempDir } from "./helpers.mjs";

const BIN_REL = "plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs";
const RULE_ID = "PROC-014";
const HOSTS = ["node", "repo"];

/** Write a file, creating its parent directories. */
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** The UTC calendar date `days` days after now (YYYY-MM-DD). */
function daysFromNow(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** An allowlist file for the rule with one entry that expires on `expires`. */
function allowlist(expires) {
  const entry = {
    match: "src/legacy.ts",
    reason: "Migrating the legacy module in the next release.",
    expires,
    owner: "maintainers",
  };
  return `${JSON.stringify({ rule: RULE_ID, entries: [entry] }, null, 2)}\n`;
}

/**
 * Build a repository with the real hosts, the real kit binary and the real registry entry of
 * the allowlist rule. The clean fixture holds a current allowlist entry; the violation fixture
 * replaces it with an expired one, so the two runs differ by exactly that file.
 */
function makeKitRoot(t) {
  const root = tempDir(t, "csf-kit-");
  for (const host of HOSTS) {
    fs.cpSync(
      path.join(REPO_ROOT, "test", "harness", host),
      path.join(root, "test", "harness", host),
      { recursive: true },
    );
  }
  fs.mkdirSync(path.dirname(path.join(root, BIN_REL)), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, BIN_REL), path.join(root, BIN_REL));

  const registry = readJson(path.join(REPO_ROOT, "registry", "rules.json"));
  const rule = registry.rules.find((candidate) => candidate.id === RULE_ID);
  assert.ok(rule, `${RULE_ID} is in the registry`);
  assert.deepEqual(rule.gate, { kind: "script", id: "check-allowlists" });
  write(
    path.join(root, "registry", "rules.json"),
    `${JSON.stringify({ version: 1, rules: [rule] }, null, 2)}\n`,
  );

  const fixtures = path.join(root, "test", "fixtures", "shared");
  const allowlistFile = path.join(".cross-stack", "allowlists", `${RULE_ID}.json`);
  write(path.join(fixtures, "clean", "fixture.json"), `${JSON.stringify({ hosts: HOSTS })}\n`);
  // A current entry: 30 days ahead is inside the default horizon (allowlistMaxDays, 365) on any
  // run date, so the clean fixture never ages into a finding the way a fixed date would.
  write(path.join(fixtures, "clean", allowlistFile), allowlist(daysFromNow(30)));
  const violation = path.join(fixtures, "violations", RULE_ID);
  write(
    path.join(violation, "fixture.json"),
    // The binary prints its check id; the path in the finding also names the rule.
    `${JSON.stringify({ hosts: HOSTS, expect: { idPattern: "check-allowlists \\S+:\\d+ " } })}\n`,
  );
  write(path.join(violation, allowlistFile), allowlist("2000-01-01"));
  return root;
}

function run(root, args) {
  const report = path.join(root, "out", "fixture-report.json");
  const result = runCli(root, ["--report", report, "--rule", RULE_ID, ...args]);
  return { ...result, report: fs.existsSync(report) ? readJson(report) : null };
}

describe("shipped hosts and the real kit binary", () => {
  test("each host's default kitBin names the binary in this repository", () => {
    for (const host of HOSTS) {
      const definition = readJson(path.join(REPO_ROOT, "test", "harness", host, "host.json"));
      const kitBin = definition.vars.kitBin.replace("{repoRoot}", REPO_ROOT);
      assert.ok(fs.statSync(kitBin).isFile(), `${host}: ${kitBin} exists`);
      assert.deepEqual(definition.gates.script.failExitCodes, [1], `${host}: exit 1 = finding`);
      const argv = definition.gates.script.argv;
      assert.deepEqual(argv.slice(argv.indexOf("--root"), argv.indexOf("--root") + 2), [
        "--root",
        "{workdir}",
      ]);
    }
  });

  test("a far-future expiry is a finding, so a clean fixture cannot use one", (t) => {
    const root = makeKitRoot(t);
    const clean = path.join(root, "test", "fixtures", "shared", "clean");
    write(
      path.join(clean, ".cross-stack", "allowlists", `${RULE_ID}.json`),
      allowlist("2999-12-31"),
    );
    const { status, report } = run(root, []);
    assert.equal(status, 1);
    for (const host of HOSTS) {
      const result = resultFor(report, RULE_ID, host);
      assert.equal(result.clean.exitCode, 1, `${host}: the horizon check fires`);
    }
  });

  test("a clean fixture passes and an expired allowlist entry fails on both hosts", (t) => {
    const root = makeKitRoot(t);
    const { status, stdout, stderr, report } = run(root, []);
    assert.equal(status, 0, `${stdout}\n${stderr}`);
    assert.equal(report.summary.runs, 2);
    assert.equal(report.summary.passed, 2);
    for (const host of HOSTS) {
      const result = resultFor(report, RULE_ID, host);
      assert.equal(result.ok, true, `${host}: ${JSON.stringify(result, null, 2)}`);
      assert.equal(result.clean.exitCode, 0);
      assert.equal(result.violation.exitCode, 1);
      assert.equal(result.violation.idPrinted, true);
      assert.deepEqual(result.violation.unexpectedIds, []);
    }
  });

  test("a binary that crashes (exit 2) never counts as a caught violation", (t) => {
    const root = makeKitRoot(t);
    const crash = path.join(root, "crash.mjs");
    // Prints what a finding would print, then exits with the usage/internal-error code.
    write(
      crash,
      'process.stdout.write("check-allowlists x.json:1 PROC-014\\n");\nprocess.exit(2);\n',
    );
    const { status, stdout, report } = run(root, ["--var", `kitBin=${crash}`]);
    assert.equal(status, 1, stdout);
    for (const host of HOSTS) {
      const result = resultFor(report, RULE_ID, host);
      assert.equal(result.ok, false);
      assert.equal(result.violation.ok, false);
      assert.match(result.violation.reasons.join("\n"), /exited 2, expected 1/);
    }
  });
});
