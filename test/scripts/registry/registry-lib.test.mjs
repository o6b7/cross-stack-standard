/**
 * scripts/lib/registry.mjs: loading, line lookup, ordering, counting and citation scanning.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import {
  INVARIANTS,
  RegistryError,
  TRACKS,
  TRACK_TITLES,
  compareRuleIds,
  compareSemver,
  configurableKeyStatus,
  countRules,
  effectiveTarget,
  findRuleIdCitations,
  formatFinding,
  gateLabel,
  hasPendingPromotion,
  invariantTitle,
  isGated,
  jsonPointerLines,
  jsonSyntaxErrorOffset,
  lineForPointer,
  listDecisionRecords,
  loadRegistry,
  relativePosix,
  repoRootFrom,
  sortRules,
  toPosix,
  violationFixtureDir,
} from "../../../scripts/lib/registry.mjs";
import { REPO_ROOT, forcedRule, makeRepo, reviewRule } from "./helpers.mjs";

describe("jsonPointerLines", () => {
  it("maps every value to the line where it starts", () => {
    const raw =
      '{\n  "a": 1,\n  "rules": [\n    { "id": "X", "gate": {\n      "kind": "k" } },\n    []\n  ],\n  "s": "a\\"b"\n}';
    const lines = jsonPointerLines(raw);
    assert.equal(lines.get(""), 1);
    assert.equal(lines.get("/a"), 2);
    assert.equal(lines.get("/rules"), 3);
    assert.equal(lines.get("/rules/0"), 4);
    assert.equal(lines.get("/rules/0/id"), 4);
    assert.equal(lines.get("/rules/0/gate/kind"), 5);
    assert.equal(lines.get("/rules/1"), 6);
    assert.equal(lines.get("/s"), 8);
  });

  it("escapes keys as JSON Pointer tokens", () => {
    const lines = jsonPointerLines('{"a/b": {"c~d": true}}');
    assert.equal(lines.get("/a~1b/c~0d"), 1);
  });

  it("falls back to the nearest ancestor", () => {
    const lines = jsonPointerLines('{\n  "rules": [\n    {}\n  ]\n}');
    assert.equal(lineForPointer(lines, "/rules/0/missing/deeper"), 3);
    assert.equal(lineForPointer(lines, "/nothing"), 1);
  });
});

describe("jsonSyntaxErrorOffset", () => {
  it("returns -1 for valid JSON", () => {
    for (const text of ['{"a":[1,-2.5e3,true,false,null,"x\\"y"]}', " [ ] ", '"s"', "0"]) {
      assert.equal(jsonSyntaxErrorOffset(text), -1, text);
    }
  });

  it("locates the first error", () => {
    assert.equal(jsonSyntaxErrorOffset('{"a": }'), 6);
    assert.equal(jsonSyntaxErrorOffset('{"a": 1,}'), 8);
    assert.equal(jsonSyntaxErrorOffset("[1 2]"), 3);
    assert.equal(jsonSyntaxErrorOffset("{a: 1}"), 1);
    assert.equal(jsonSyntaxErrorOffset('{"a": 1} x'), 9);
    assert.equal(jsonSyntaxErrorOffset('"open'), 5);
    assert.equal(jsonSyntaxErrorOffset("[01]"), 2);
    assert.equal(jsonSyntaxErrorOffset(""), 0);
  });
});

describe("loadRegistry", () => {
  it("loads rules and line numbers", () => {
    const repo = makeRepo();
    try {
      repo.registry([reviewRule()]);
      const loaded = loadRegistry(repo.root);
      assert.equal(loaded.rules.length, 1);
      assert.equal(loaded.rules[0].id, "PROC-101");
      assert.ok(loaded.lines.get("/rules/0/id") > 1);
    } finally {
      repo.cleanup();
    }
  });

  it("reports a missing file", () => {
    const repo = makeRepo();
    try {
      assert.throws(
        () => loadRegistry(repo.root),
        (error) =>
          error instanceof RegistryError &&
          /cannot read registry\/rules\.json: ENOENT/.test(error.message),
      );
    } finally {
      repo.cleanup();
    }
  });

  it("reports invalid JSON with its line", () => {
    const repo = makeRepo();
    try {
      repo.write("registry/rules.json", '{\n  "rules": [\n    { "id": }\n  ]\n}\n');
      assert.throws(
        () => loadRegistry(repo.root),
        (error) =>
          error instanceof RegistryError &&
          error.line === 3 &&
          error.message === "registry/rules.json is not valid JSON (line 3, column 13)",
      );
    } finally {
      repo.cleanup();
    }
  });

  it("returns an empty rule list when rules is not an array", () => {
    const repo = makeRepo();
    try {
      repo.write("registry/rules.json", { rules: {} });
      assert.deepEqual(loadRegistry(repo.root).rules, []);
    } finally {
      repo.cleanup();
    }
  });
});

describe("rule helpers", () => {
  it("classifies enforcement and targets", () => {
    assert.equal(isGated(forcedRule()), true);
    assert.equal(isGated(reviewRule()), false);
    assert.equal(effectiveTarget(reviewRule()), "REVIEW");
    assert.equal(effectiveTarget(reviewRule({ targetEnforcement: "GUARDED" })), "GUARDED");
    assert.equal(hasPendingPromotion(reviewRule({ targetEnforcement: "GUARDED" })), true);
    assert.equal(hasPendingPromotion(reviewRule({ targetEnforcement: "REVIEW" })), false);
    assert.equal(hasPendingPromotion(forcedRule()), false);
    assert.equal(hasPendingPromotion({ enforcement: "BOGUS", targetEnforcement: "FORCED" }), false);
  });

  it("orders IDs by prefix order and number", () => {
    const ids = [
      "CI-001",
      "PROC-010",
      "BE-002",
      "WEB-001",
      "PROC-002",
      "BE-010",
      "I18N-001",
      "weird",
    ];
    assert.deepEqual([...ids].sort(compareRuleIds), [
      "BE-002",
      "BE-010",
      "WEB-001",
      "I18N-001",
      "PROC-002",
      "PROC-010",
      "CI-001",
      "weird",
    ]);
    assert.deepEqual(
      sortRules([{ id: "UI-002" }, { id: "SEC-001" }]).map((rule) => rule.id),
      ["SEC-001", "UI-002"],
    );
  });

  it("counts by enforcement, target, track, tier, invariant and pending promotion", () => {
    const counts = countRules([
      forcedRule(),
      reviewRule({ id: "PROC-103", invariant: 8, targetEnforcement: "FORCED" }),
      reviewRule({ id: "BE-001", track: "laravel", tier: 2 }),
      { id: "junk" },
    ]);
    assert.equal(counts.total, 4);
    assert.deepEqual(counts.byEnforcement, { FORCED: 1, GUARDED: 0, REVIEW: 2 });
    assert.deepEqual(counts.byTarget, { FORCED: 2, GUARDED: 0, REVIEW: 1 });
    assert.deepEqual(counts.byTrack.shared, { FORCED: 1, GUARDED: 0, REVIEW: 1, total: 2 });
    assert.deepEqual(counts.byTrack.laravel, { FORCED: 0, GUARDED: 0, REVIEW: 1, total: 1 });
    assert.deepEqual(counts.byTrackTarget.shared, { FORCED: 2, GUARDED: 0, REVIEW: 0, total: 2 });
    assert.deepEqual(counts.byTrackTarget.laravel, { FORCED: 0, GUARDED: 0, REVIEW: 1, total: 1 });
    assert.deepEqual(counts.byTier, { 1: 2, 2: 1 });
    assert.deepEqual(counts.byInvariant, {
      1: 1,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 1,
      9: 0,
      10: 0,
    });
    assert.equal(counts.pendingPromotion, 1);
  });

  it("names the ten Tier-1 invariants in order", () => {
    assert.deepEqual(
      INVARIANTS.map((invariant) => invariant.id),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    assert.equal(invariantTitle(1), "Stack-first");
    assert.equal(invariantTitle(8), "Gates are never weakened");
    assert.equal(invariantTitle(11), "Invariant 11");
    assert.ok(Object.isFrozen(INVARIANTS) && Object.isFrozen(INVARIANTS[0]));
  });

  it("builds fixture paths, gate labels and findings", () => {
    assert.equal(
      violationFixtureDir({ id: "WEB-012", track: "web" }),
      "test/fixtures/web/violations/WEB-012",
    );
    assert.equal(
      gateLabel({ kind: "eslint", id: "no-restricted-syntax", discriminator: "TSEnumDeclaration" }),
      "eslint:no-restricted-syntax:TSEnumDeclaration",
    );
    assert.equal(gateLabel({ kind: "script", id: "check-allowlists" }), "script:check-allowlists");
    assert.equal(gateLabel(null), "none");
    assert.equal(
      formatFinding({ id: "BE-001", path: "a/b.md", line: 3, message: "boom" }),
      "BE-001 a/b.md:3 boom",
    );
    assert.equal(
      formatFinding({ id: "BE-001", path: "a/b.md", message: "boom" }),
      "BE-001 a/b.md:1 boom",
    );
  });

  it("resolves roots and posix paths", () => {
    assert.equal(
      repoRootFrom(new URL("../../../scripts/check-registry.mjs", import.meta.url).href, 1),
      REPO_ROOT,
    );
    assert.equal(toPosix(["a", "b", "c"].join(path.sep)), "a/b/c");
    assert.equal(relativePosix(REPO_ROOT, path.join(REPO_ROOT, "docs", "rules")), "docs/rules");
  });
});

describe("findRuleIdCitations", () => {
  it("finds IDs with their line and column", () => {
    const text = "See PROC-014 and `WEB-012`.\nAlso (SEC-001), I18N-020, UI-003; CI-016.";
    assert.deepEqual(findRuleIdCitations(text), [
      { id: "PROC-014", line: 1, column: 5 },
      { id: "WEB-012", line: 1, column: 19 },
      { id: "SEC-001", line: 2, column: 7 },
      { id: "I18N-020", line: 2, column: 17 },
      { id: "UI-003", line: 2, column: 27 },
      { id: "CI-016", line: 2, column: 35 },
    ]);
  });

  it("ignores look-alikes", () => {
    const text = "XBE-001 BE-0012 BE-001a MY-BE-001 be-001 ABE-001 WEB-01 XBE_001 BE_0012 be_001";
    assert.deepEqual(findRuleIdCitations(text), []);
  });
  it("reports the underscore form canonically", () => {
    assert.deepEqual(findRuleIdCitations("test_SEC_016_blocks and __pest_evaluable_BE_012_x"), [
      { id: "SEC-016", line: 1, column: 6 },
      { id: "BE-012", line: 1, column: 42 },
    ]);
  });
});

describe("listDecisionRecords", () => {
  it("reports a missing directory", () => {
    const repo = makeRepo();
    try {
      assert.deepEqual(listDecisionRecords(repo.root), { exists: false, records: new Map() });
    } finally {
      repo.cleanup();
    }
  });

  it("indexes records by number and ignores other files", () => {
    const repo = makeRepo();
    try {
      repo.write("docs/decisions/0038-exceptions.md", "# 0038\n");
      repo.write("docs/decisions/0038-duplicate.md", "# 0038\n");
      repo.write("docs/decisions/0039-stack-first.md", "# 0039\n");
      repo.write("docs/decisions/README.md", "# index\n");
      repo.write("docs/decisions/0040.md", "# no title\n");
      repo.mkdir("docs/decisions/0041-directory.md");
      const { exists, records } = listDecisionRecords(repo.root);
      assert.equal(exists, true);
      assert.deepEqual([...records.keys()].sort(), ["0038", "0039"]);
      assert.deepEqual(records.get("0038"), [
        "docs/decisions/0038-duplicate.md",
        "docs/decisions/0038-exceptions.md",
      ]);
    } finally {
      repo.cleanup();
    }
  });
});

describe("tracks, planned configurable keys and version order", () => {
  it("lists the client track between the single tracks and shared", () => {
    assert.deepEqual(TRACKS, ["laravel", "web", "mobile", "client", "shared"]);
    assert.equal(TRACK_TITLES.client, "Web and mobile");
    const counts = countRules([reviewRule({ track: "client" })]);
    assert.deepEqual(counts.byTrack.client, { FORCED: 0, GUARDED: 0, REVIEW: 1, total: 1 });
  });

  it("classifies configurable keys as declared, planned or unknown", () => {
    const schema = {
      type: "object",
      properties: {
        hooks: { type: "object", properties: { stop: {} } },
        modules: { type: "object", properties: { i18n: { anyOf: [{ type: "boolean" }] } } },
      },
    };
    assert.equal(configurableKeyStatus(schema, "hooks.stop"), "declared");
    assert.equal(configurableKeyStatus(schema, "rules.BE-001.namespaces"), "planned");
    assert.equal(configurableKeyStatus(schema, "modules.i18n.timeZone"), "planned");
    assert.equal(configurableKeyStatus(schema, "stack.<concern>.use"), "planned");
    assert.equal(configurableKeyStatus(schema, "trackRoots.<track>"), "planned");
    assert.equal(configurableKeyStatus(schema, "decisions.<name>"), "planned");
    assert.equal(configurableKeyStatus(schema, "hooks.stop.budget.extra"), "unknown");
    assert.equal(configurableKeyStatus(schema, "rules.BE-001"), "unknown");
    assert.equal(configurableKeyStatus(schema, "rules.nope.x"), "unknown");
    assert.equal(configurableKeyStatus(schema, "modules.billing.plan"), "unknown");
    assert.equal(configurableKeyStatus(schema, "web.maxLines"), "unknown");
    assert.equal(configurableKeyStatus(null, "rules.BE-001.namespaces"), "planned");
  });

  it("orders versions by SemVer precedence", () => {
    assert.ok(compareSemver("1.0.0", "1.1.0") < 0);
    assert.ok(compareSemver("1.10.0", "1.9.9") > 0);
    assert.equal(compareSemver("1.0.0", "1.0.0+build.5"), 0);
    assert.ok(compareSemver("1.0.0-rc.1", "1.0.0") < 0);
    assert.ok(compareSemver("1.0.0-rc.2", "1.0.0-rc.10") < 0);
    assert.ok(compareSemver("1.0.0-alpha", "1.0.0-alpha.1") < 0);
    assert.ok(compareSemver("1.0.0-1", "1.0.0-alpha") < 0);
    assert.ok(compareSemver("0.0.0-fixture.1", "0.0.0") < 0);
  });
});
