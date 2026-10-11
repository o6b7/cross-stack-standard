/**
 * Unit tests of the pure helpers: rule ids, templates, JSON Merge Patch, paths, output
 * sanitising and run evaluation.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { evaluateClean, evaluateViolation } from "../../../scripts/lib/fixtures/evaluate.mjs";
import {
  RULE_ID_PREFIXES,
  createIdScanner,
  parseRuleId,
  underscoreForm,
} from "../../../scripts/lib/fixtures/ids.mjs";
import { applyMergePatch } from "../../../scripts/lib/fixtures/merge-patch.mjs";
import { sanitizeOutput, stripAnsi } from "../../../scripts/lib/fixtures/output.mjs";
import {
  isSafeRelativePath,
  resolveInside,
  toPosix,
} from "../../../scripts/lib/fixtures/paths.mjs";
import {
  assertPlaceholders,
  expandArgv,
  expandString,
  placeholdersIn,
} from "../../../scripts/lib/fixtures/template.mjs";

describe("rule ids", () => {
  test("parseRuleId and underscoreForm", () => {
    assert.deepEqual(parseRuleId("I18N-033"), { prefix: "I18N", number: "033" });
    assert.equal(parseRuleId("BE-12"), null);
    assert.equal(parseRuleId("be-012"), null);
    assert.equal(parseRuleId(undefined), null);
    assert.equal(underscoreForm("WEB-012"), "WEB_012");
    assert.ok(RULE_ID_PREFIXES.includes("PROC"));
  });

  test("the scanner finds both forms and normalises them", () => {
    const scan = createIdScanner();
    assert.deepEqual(scan("BE-012 app/Models/User.php:1 missing strict types"), ["BE-012"]);
    assert.deepEqual(scan("P\\Tests\\Unit\\ArchTest::__pest_evaluable_BE_012_strict_types"), [
      "BE-012",
    ]);
    assert.deepEqual(scan('{"rule":"SEC-001","also":"SEC_001"}'), ["SEC-001"]);
    assert.deepEqual(scan("WEB-012, I18N_033 and CI-001."), ["CI-001", "I18N-033", "WEB-012"]);
  });

  test("the scanner respects boundaries", () => {
    const scan = createIdScanner();
    assert.deepEqual(scan("XBE-012"), [], "preceded by a letter");
    assert.deepEqual(scan("3BE-012"), [], "preceded by a digit");
    assert.deepEqual(scan("BE-0123"), [], "followed by a digit");
    assert.deepEqual(scan("BE-012x"), ["BE-012"], "followed by a letter");
    assert.deepEqual(scan("ZZ-012 be-012 BE 012"), [], "unknown prefix, lower case, space");
    assert.deepEqual(scan("MSEC-001 SCI-001"), [], "prefix inside a longer word");
  });

  test("the scanner accepts extra prefixes and handles an empty list", () => {
    assert.deepEqual(createIdScanner(["XT"])("XT-100 BE-012"), ["XT-100"]);
    assert.deepEqual(createIdScanner([])("BE-012"), []);
  });
});

describe("templates", () => {
  const values = {
    gateId: "check-pins",
    discriminator: null,
    base: "",
    workdir: undefined,
    node: "/n",
  };

  test("expandString substitutes values and empties null", () => {
    assert.equal(expandString("{node} {gateId}", values), "/n check-pins");
    assert.equal(expandString("[{discriminator}]", values), "[]");
    assert.equal(
      expandString("{ not a placeholder } {{gateId}}", values),
      "{ not a placeholder } {check-pins}",
    );
  });

  test("unknown and unavailable placeholders throw", () => {
    assert.throws(
      () => expandString("{nope}", values, "here"),
      /here: unknown placeholder \{nope\}/,
    );
    assert.throws(
      () => expandString("{workdir}", values, "setup"),
      /setup: placeholder \{workdir\} is not available/,
    );
  });

  test("expandArgv keeps optional groups only when every value is non-empty", () => {
    const argv = [
      "{node}",
      "bin.mjs",
      "{gateId}",
      ["--only", "{discriminator}"],
      ["--base", "{base}"],
      ["-x"],
    ];
    assert.deepEqual(expandArgv(argv, values), ["/n", "bin.mjs", "check-pins", "-x"]);
    assert.deepEqual(expandArgv(argv, { ...values, discriminator: "schema", base: "abc" }), [
      "/n",
      "bin.mjs",
      "check-pins",
      "--only",
      "schema",
      "--base",
      "abc",
      "-x",
    ]);
    assert.throws(() => expandArgv([["{workdir}"]], values), /not available/);
  });

  test("placeholdersIn and assertPlaceholders", () => {
    assert.deepEqual(placeholdersIn("{a}/{b}/{a}"), ["a", "b", "a"]);
    assert.doesNotThrow(() => assertPlaceholders(["{a}", ["{b}"]], ["a", "b"], "x"));
    assert.throws(
      () => assertPlaceholders("{c}", ["a", "b"], "gates.script"),
      /gates\.script: unknown placeholder \{c\} \(known: a, b\)/,
    );
  });
});

describe("JSON Merge Patch (RFC 7396 appendix A)", () => {
  const cases = [
    [{ a: "b" }, { a: "c" }, { a: "c" }],
    [{ a: "b" }, { b: "c" }, { a: "b", b: "c" }],
    [{ a: "b" }, { a: null }, {}],
    [{ a: "b", b: "c" }, { a: null }, { b: "c" }],
    [{ a: ["b"] }, { a: "c" }, { a: "c" }],
    [{ a: "c" }, { a: ["b"] }, { a: ["b"] }],
    [{ a: { b: "c" } }, { a: { b: "d", c: null } }, { a: { b: "d" } }],
    [{ a: [{ b: "c" }] }, { a: [1] }, { a: [1] }],
    [
      ["a", "b"],
      ["c", "d"],
      ["c", "d"],
    ],
    [{ a: "b" }, ["c"], ["c"]],
    [{ a: "foo" }, null, null],
    [{ a: "foo" }, "bar", "bar"],
    [{ e: null }, { a: 1 }, { e: null, a: 1 }],
    [[1, 2], { a: "b", c: null }, { a: "b" }],
    [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
  ];
  for (const [target, patch, expected] of cases) {
    test(`${JSON.stringify(target)} + ${JSON.stringify(patch)}`, () => {
      const before = JSON.stringify(target);
      assert.deepEqual(applyMergePatch(target, patch), expected);
      assert.equal(JSON.stringify(target), before, "the target is not mutated");
    });
  }

  test("a __proto__ key is data, not a prototype change", () => {
    const patched = applyMergePatch({}, JSON.parse('{"__proto__": {"polluted": true}}'));
    assert.equal({}.polluted, undefined);
    assert.equal(Object.getPrototypeOf(patched), Object.prototype);
    assert.deepEqual(Object.keys(patched), ["__proto__"]);
    assert.equal(JSON.stringify(patched), '{"__proto__":{"polluted":true}}');
  });
});

describe("paths", () => {
  test("isSafeRelativePath", () => {
    for (const ok of ["a", "a/b", ".env", ".github/workflows/ci.yml", "a/..b", "..."]) {
      assert.equal(isSafeRelativePath(ok), true, ok);
    }
    for (const bad of [
      "",
      "/a",
      "a/",
      "a//b",
      "./a",
      "a/./b",
      "..",
      "a/../b",
      "C:/a",
      "a\\b",
      "a\0b",
      7,
    ]) {
      assert.equal(isSafeRelativePath(bad), false, String(bad));
    }
  });

  test("resolveInside and toPosix", () => {
    const base = path.resolve("base-dir");
    assert.equal(resolveInside(base, "a/b"), path.join(base, "a", "b"));
    assert.throws(
      () => resolveInside(base, "../x", "remove"),
      /remove must be a relative POSIX path/,
    );
    assert.equal(toPosix(["a", "b"].join(path.sep)), "a/b");
  });
});

describe("output sanitising", () => {
  test("stripAnsi removes colour, cursor and hyperlink sequences", () => {
    const esc = String.fromCharCode(27);
    const bel = String.fromCharCode(7);
    const raw = `${esc}[31mBE-012${esc}[0m ${esc}]8;;https://x.test${bel}link${esc}]8;;${bel} ${esc}[2K${esc}Mdone`;
    assert.equal(stripAnsi(raw), "BE-012 link done");
  });

  test("known paths are replaced, longest first, in both separator styles", () => {
    const workdir = "/tmp/csf-abc/w/0001-clean";
    const text = `${workdir}/src/a.ts ${"/tmp/csf-abc"}/gitconfig /home/me/x \\tmp\\csf-abc\\w\\0001-clean\\b`;
    const out = sanitizeOutput(text, [
      [workdir, "<workdir>"],
      ["/tmp/csf-abc", "<tmp>"],
      ["/home/me", "~"],
      [null, "<ignored>"],
    ]);
    assert.equal(out, "<workdir>/src/a.ts <tmp>/gitconfig ~/x <workdir>\\b");
  });

  test("an id-like segment in the work directory path is never scanned", () => {
    const workdir = "/tmp/run/BE-012-dir";
    const out = sanitizeOutput(`${workdir}/file.php: ok`, [[workdir, "<workdir>"]]);
    assert.deepEqual(createIdScanner()(out), []);
  });
});

describe("evaluation", () => {
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
    ruleId: "BE-012",
    alsoFires: [],
    idPattern: null,
    failExitCodes: null,
    scan,
  };

  test("clean runs pass only with exit 0", () => {
    assert.deepEqual(evaluateClean({ ...base, exitCode: 0 }), {
      ok: true,
      reasons: [],
      printedIds: [],
    });
    assert.match(evaluateClean({ ...base, exitCode: 2 }).reasons[0], /clean: exited 2, expected 0/);
    assert.match(
      evaluateClean({ ...base, exitCode: null, signal: "SIGKILL" }).reasons[0],
      /killed by SIGKILL/,
    );
    assert.match(evaluateClean({ ...base, timedOut: true }).reasons[0], /timed out after 1000 ms/);
    assert.match(
      evaluateClean({ ...base, error: "cannot start php" }).reasons[0],
      /clean: cannot start php/,
    );
  });

  test("a violation must fail and print the id", () => {
    const ok = evaluateViolation({ ...base, output: "BE-012 a.php:1 x" }, expectation);
    assert.deepEqual(ok, {
      ok: true,
      reasons: [],
      idPrinted: true,
      unexpectedIds: [],
      alsoFired: [],
    });
    const silent = evaluateViolation({ ...base, output: "failed" }, expectation);
    assert.equal(silent.ok, false);
    assert.match(silent.reasons[0], /neither BE-012 nor BE_012/);
    const passed = evaluateViolation({ ...base, exitCode: 0, output: "BE-012" }, expectation);
    assert.match(passed.reasons[0], /exited 0, expected a failure/);
    const killed = evaluateViolation(
      { ...base, exitCode: null, signal: "SIGSEGV", output: "BE-012" },
      expectation,
    );
    assert.match(killed.reasons[0], /was killed by SIGSEGV instead of failing/);
  });

  test("failExitCodes separates a violation from a crash", () => {
    const crash = evaluateViolation(
      { ...base, exitCode: 2, output: "BE-012" },
      { ...expectation, failExitCodes: [1] },
    );
    assert.equal(crash.ok, false);
    assert.match(
      crash.reasons[0],
      /exited 2, expected 1 \(another exit code usually means the tool crashed\)/,
    );
    assert.equal(
      evaluateViolation({ ...base, output: "BE-012" }, { ...expectation, failExitCodes: [1] }).ok,
      true,
    );
  });

  test("siblings must be declared in alsoFires", () => {
    const output = "BE-012 x\nBE_013 y\nSEC-001 z";
    const strict = evaluateViolation({ ...base, output }, expectation);
    assert.deepEqual(strict.unexpectedIds, ["BE-013", "SEC-001"]);
    assert.match(strict.reasons[0], /also printed BE-013, SEC-001/);
    const declared = evaluateViolation(
      { ...base, output },
      { ...expectation, alsoFires: ["BE-013", "SEC-001", "UI-001"] },
    );
    assert.equal(declared.ok, true);
    assert.deepEqual(declared.alsoFired, ["BE-013", "SEC-001"]);
  });

  test("idPattern replaces the id check", () => {
    const withPattern = { ...expectation, idPattern: "cross-stack/no-client-pagination" };
    assert.equal(
      evaluateViolation({ ...base, output: "error cross-stack/no-client-pagination" }, withPattern)
        .ok,
      true,
    );
    const miss = evaluateViolation({ ...base, output: "BE-012" }, withPattern);
    assert.match(miss.reasons[0], /does not match expect\.idPattern/);
  });

  test("timeouts and infrastructure errors fail the violation run", () => {
    assert.match(
      evaluateViolation({ ...base, timedOut: true, output: "BE-012" }, expectation).reasons[0],
      /timed out/,
    );
    assert.match(
      evaluateViolation({ ...base, error: "prepare failed" }, expectation).reasons[0],
      /violation: prepare failed/,
    );
  });
});
