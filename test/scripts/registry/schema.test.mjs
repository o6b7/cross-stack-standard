/**
 * The registry schema: the committed registry validates, and every rule-level constraint rejects
 * the invalid shape with a readable message (through check-registry's error mapping).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { schemaFindings } from "../../../scripts/check-registry.mjs";
import {
  INVARIANTS,
  countRules,
  effectiveTarget,
  findRuleIdCitations,
  jsonPointerLines,
  sortRules,
} from "../../../scripts/lib/registry.mjs";
import { REPO_ROOT, SCHEMA_FILE, forcedRule, guardedRule, reviewRule } from "./helpers.mjs";

const require = createRequire(path.join(REPO_ROOT, "scripts", "check-registry.mjs"));
const Ajv2020 = require("ajv/dist/2020").default;
const validate = new Ajv2020({ allErrors: true, strict: true, verbose: true }).compile(
  JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8")),
);

/**
 * Validates a registry document and returns check-registry's finding messages.
 *
 * @param {object} document
 * @returns {string[]}
 */
function messages(document) {
  if (validate(document)) return [];
  const raw = JSON.stringify(document, null, 2);
  const registry = {
    raw,
    data: document,
    rules: document.rules ?? [],
    lines: jsonPointerLines(raw),
  };
  return schemaFindings(validate.errors, registry, "registry/rules.json").map(
    (finding) => finding.message,
  );
}

/**
 * @param {object[]} rules
 * @returns {object}
 */
const doc = (rules) => ({ $schema: "./rules.schema.json", version: 1, rules });

describe("registry schema", () => {
  it("accepts the committed registry", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "registry", "rules.json"), "utf8"),
    );
    assert.deepEqual(messages(registry), []);
  });

  it("accepts minimal REVIEW, FORCED and GUARDED rules", () => {
    assert.deepEqual(messages(doc([reviewRule(), forcedRule(), guardedRule()])), []);
  });

  it("accepts an empty rule list", () => {
    assert.deepEqual(messages(doc([])), []);
  });

  it("requires $schema, version 1 and rules at the top level", () => {
    assert.match(messages({ version: 1, rules: [] }).join("\n"), /required property '\$schema'/);
    assert.match(
      messages({ ...doc([]), version: 2 }).join("\n"),
      /\/version must be equal to constant: 1/,
    );
    assert.match(messages({ ...doc([]), extra: true }).join("\n"), /additional properties: extra/);
  });

  const invalid = [
    ["an id with an unknown prefix", { id: "API-001" }, /\/id must match pattern/],
    ["an id with two digits", { id: "BE-12" }, /\/id must match pattern/],
    ["a decision that is not four digits", { decision: "12" }, /\/decision must match pattern/],
    ["a numeric decision", { decision: 12 }, /\/decision must be string/],
    [
      "an unknown track",
      { track: "desktop" },
      /\/track must be equal to one of the allowed values: laravel, web, mobile, client, shared/,
    ],
    ["tier 3", { tier: 3 }, /\/tier must be equal to one of the allowed values: 1, 2/],
    [
      "an unknown module",
      { module: "billing" },
      /\/module must be equal to one of the allowed values/,
    ],
    [
      "an unknown enforcement",
      { enforcement: "STRICT" },
      /\/enforcement must be equal to one of the allowed values/,
    ],
    [
      "an unknown target",
      { targetEnforcement: "SOON" },
      /\/targetEnforcement must be equal to one of the allowed values/,
    ],
    [
      "a title with a trailing period",
      { title: "Ends with a period." },
      /\/title must match pattern/,
    ],
    ["a title spanning lines", { title: "Two\nlines" }, /\/title must match pattern/],
    [
      "a summary without end punctuation",
      { summary: "No final punctuation here" },
      /\/summary must match pattern/,
    ],
    ["a non-semver since", { since: "1.0" }, /\/since must match pattern/],
    ["a non-boolean defaultEnabled", { defaultEnabled: "yes" }, /\/defaultEnabled must be boolean/],
    [
      "a malformed configurable key",
      { configurable: ["web..x"] },
      /\/configurable\/0 must match pattern/,
    ],
    [
      "duplicate configurable keys",
      { configurable: ["a.b", "a.b"] },
      /\/configurable must NOT have duplicate items/,
    ],
    [
      "an unknown profile",
      { track: "web", profiles: ["remix"] },
      /\/profiles\/0 must be equal to one of the allowed values/,
    ],
    [
      "an empty profile list",
      { track: "web", profiles: [] },
      /\/profiles must NOT have fewer than 1 items/,
    ],
    ["an unknown property", { owner: "someone" }, /additional properties: owner/],
    ["an empty evasion", { evasions: [""] }, /\/evasions\/0 must NOT have fewer than 3 characters/],
    ["invariant 0", { invariant: 0 }, /\/invariant must be >= 1/],
    ["invariant 11", { invariant: 11 }, /\/invariant must be <= 10/],
    ["a fractional invariant", { invariant: 1.5 }, /\/invariant must be integer/],
    ["a string invariant", { invariant: "1" }, /\/invariant must be integer/],
    [
      "an adoption note without end punctuation",
      { adoption: "Baseline: existing violations go into the baseline" },
      /\/adoption must match pattern/,
    ],
    [
      "an adoption note spanning lines",
      { adoption: "Baseline: two\nlines." },
      /\/adoption must match pattern/,
    ],
    [
      "an adoption note outside the closed prefix set",
      { adoption: "None: existing violations go into the baseline." },
      /\/adoption must match pattern/,
    ],
    [
      "an adoption prefix without its colon",
      { adoption: "Baseline existing violations go into the baseline." },
      /\/adoption must match pattern/,
    ],
    [
      "a title longer than 100 characters",
      { title: `Keep ${"x".repeat(100)}` },
      /\/title must NOT have more than 100 characters/,
    ],
    ["a non-string adoption note", { adoption: ["baseline"] }, /\/adoption must be string/],
    ["a private draftIds field", { draftIds: ["BE-001"] }, /additional properties: draftIds/],
  ];
  for (const [name, overrides, expected] of invalid) {
    it(`rejects ${name}`, () => {
      assert.match(messages(doc([reviewRule(overrides)])).join("\n"), expected);
    });
  }

  it("requires every mandatory field", () => {
    for (const field of [
      "id",
      "title",
      "track",
      "tier",
      "module",
      "enforcement",
      "gate",
      "decision",
      "defaultEnabled",
      "since",
      "summary",
      "adoption",
    ]) {
      const rule = reviewRule();
      delete rule[field];
      assert.match(
        messages(doc([rule])).join("\n"),
        new RegExp(`required property '${field}'`),
        field,
      );
    }
  });

  it("requires an invariant for tier 1 rules and forbids one for tier 2 rules", () => {
    assert.deepEqual(messages(doc([reviewRule({ invariant: 10 })])), []);
    assert.deepEqual(messages(doc([reviewRule({ tier: 2 })])), []);
    const missing = reviewRule();
    delete missing.invariant;
    assert.deepEqual(messages(doc([missing])), [
      "schema: A tier 1 rule names the Tier-1 invariant it belongs to",
    ]);
    assert.deepEqual(messages(doc([reviewRule({ tier: 2, invariant: 3 })])), [
      "schema: Only a tier 1 rule names an invariant",
    ]);
  });

  it("accepts a one-sentence adoption note with each prefix of the closed set", () => {
    for (const adoption of [
      "Nothing needed.",
      "Nothing needed: adopt writes the configuration.",
      "Fix first: blank the values before adopting.",
      "Baseline: existing violations go into the baseline.",
      "Allowlist: existing violations get dated entries.",
      "Opt-in: off until the project enables it.",
    ]) {
      assert.deepEqual(messages(doc([reviewRule({ adoption })])), [], adoption);
    }
  });

  it("accepts the client track", () => {
    assert.deepEqual(messages(doc([reviewRule({ track: "client" })])), []);
    assert.deepEqual(messages(doc([reviewRule({ track: "client", profiles: ["next"] })])), [
      "schema: Profiles apply only to web-track rules",
    ]);
  });

  it("requires evasions for GUARDED rules", () => {
    const missing = guardedRule();
    delete missing.evasions;
    assert.deepEqual(messages(doc([missing])), [
      "schema: A GUARDED rule lists at least one known evasion",
    ]);
    assert.deepEqual(messages(doc([guardedRule({ evasions: [] })])), [
      "schema: A GUARDED rule lists at least one known evasion",
    ]);
  });

  it("allows evasions on FORCED and REVIEW rules", () => {
    assert.deepEqual(
      messages(
        doc([forcedRule({ evasions: ["an allowlist entry"] }), reviewRule({ evasions: [] })]),
      ),
      [],
    );
  });

  it("requires a gate for FORCED and GUARDED rules", () => {
    assert.deepEqual(messages(doc([forcedRule({ gate: null })])), [
      "schema: A FORCED or GUARDED rule names its gate",
    ]);
    assert.deepEqual(messages(doc([guardedRule({ gate: null })])), [
      "schema: A FORCED or GUARDED rule names its gate",
    ]);
  });

  it("lets only REVIEW rules target a higher level", () => {
    assert.deepEqual(messages(doc([reviewRule({ targetEnforcement: "FORCED" })])), []);
    assert.deepEqual(messages(doc([reviewRule({ targetEnforcement: "GUARDED" })])), []);
    assert.deepEqual(messages(doc([guardedRule({ targetEnforcement: "FORCED" })])), [
      "schema: A GUARDED rule targets GUARDED; only a REVIEW rule may target a higher level",
    ]);
    assert.deepEqual(messages(doc([forcedRule({ targetEnforcement: "GUARDED" })])), [
      "schema: A FORCED rule has no other target; only a REVIEW rule may target a higher level",
    ]);
    assert.deepEqual(messages(doc([forcedRule({ targetEnforcement: "FORCED" })])), []);
  });

  it("lets a REVIEW rule name a planned gate only when it targets a gated level", () => {
    const gate = { kind: "script", id: "check-sample" };
    assert.deepEqual(messages(doc([reviewRule({ targetEnforcement: "FORCED", gate })])), []);
    assert.deepEqual(messages(doc([reviewRule({ gate })])), [
      "schema: A REVIEW rule with no higher target has no gate (null)",
    ]);
    assert.deepEqual(messages(doc([reviewRule({ targetEnforcement: "REVIEW", gate })])), [
      "schema: A REVIEW rule with no higher target has no gate (null)",
    ]);
  });

  it("limits profiles to web rules", () => {
    assert.deepEqual(
      messages(doc([reviewRule({ id: "WEB-110", track: "web", profiles: ["next"] })])),
      [],
    );
    assert.deepEqual(messages(doc([reviewRule({ profiles: ["next"] })])), [
      "schema: Profiles apply only to web-track rules",
    ]);
  });

  it("validates gate objects", () => {
    const withGate = (gate) => messages(doc([forcedRule({ gate })])).join("\n");
    assert.match(
      withGate({ kind: "sonar", id: "x" }),
      /\/gate\/kind must be equal to one of the allowed values/,
    );
    assert.match(withGate({ kind: "script" }), /\/gate must have required property 'id'/);
    assert.match(withGate({ kind: "script", id: "x", extra: 1 }), /additional properties: extra/);
    assert.match(withGate({ kind: "script", id: " padded" }), /\/gate\/id must match pattern/);
    assert.match(withGate("check-sample"), /\/gate must be object/);
  });

  it("checks gate ids and discriminators per kind", () => {
    const withGate = (gate) => messages(doc([forcedRule({ gate })]));
    assert.deepEqual(withGate({ kind: "hook", id: "PreToolUse", discriminator: "Edit" }), []);
    assert.deepEqual(withGate({ kind: "hook", id: "pre-tool-use" }), [
      "schema: A hook gate names a hook event (such as PreToolUse) and, optionally, a tool name its matcher must cover",
    ]);
    assert.deepEqual(
      withGate({ kind: "script", id: "check-standard-config", discriminator: "tier-triggers" }),
      [],
    );
    assert.deepEqual(withGate({ kind: "script", id: "Check_Things" }), [
      "schema: A script gate names a kebab-case script and, optionally, a kebab-case sub-check",
    ]);
    assert.deepEqual(
      withGate({ kind: "eslint", id: "no-restricted-syntax", discriminator: "TSEnumDeclaration" }),
      [],
    );
    assert.deepEqual(withGate({ kind: "ci", id: "commitlint", discriminator: "quality" }), []);
    for (const kind of ["pest", "phpstan", "depcruise", "vitest", "jest"]) {
      assert.deepEqual(withGate({ kind, id: "PROC-102 sample", discriminator: "x" }), [
        "schema: Only eslint, script, ci and hook gates take a discriminator",
      ]);
    }
  });

  it("points findings at the rule and its line", () => {
    const document = doc([reviewRule(), reviewRule({ id: "PROC-103", decision: "x" })]);
    const raw = JSON.stringify(document, null, 2);
    assert.equal(validate(document), false);
    const registry = { raw, data: document, rules: document.rules, lines: jsonPointerLines(raw) };
    const [finding] = schemaFindings(validate.errors, registry, "registry/rules.json");
    assert.equal(finding.id, "PROC-103");
    assert.equal(finding.path, "registry/rules.json");
    assert.equal(raw.split("\n")[finding.line - 1].trim(), '"decision": "x",');
  });
});

describe("committed registry content", () => {
  const registry = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "registry", "rules.json"), "utf8"),
  );
  const ids = new Set(registry.rules.map((rule) => rule.id));

  it("lists the rules in prefix order and then by number", () => {
    assert.deepEqual(
      registry.rules.map((rule) => rule.id),
      sortRules(registry.rules).map((rule) => rule.id),
    );
  });

  it("maps every Tier-1 invariant to at least one tier 1 rule", () => {
    const counts = countRules(registry.rules);
    for (const invariant of INVARIANTS) {
      assert.ok(counts.byInvariant[invariant.id] > 0, `invariant ${invariant.id} has no rule`);
    }
  });

  it("keeps the seed rules' gates", () => {
    const gates = Object.fromEntries(registry.rules.map((rule) => [rule.id, rule.gate]));
    // The schema sub-check keeps PROC-001's meaning and keeps it apart from the other
    // check-standard-config sub-checks, which have rules of their own.
    assert.deepEqual(gates["PROC-001"], {
      kind: "script",
      id: "check-standard-config",
      discriminator: "schema",
    });
    assert.deepEqual(gates["PROC-007"], { kind: "script", id: "check-competing-deps" });
    assert.deepEqual(gates["PROC-013"], { kind: "hook", id: "PreToolUse", discriminator: "Edit" });
    assert.deepEqual(gates["PROC-014"], { kind: "script", id: "check-allowlists" });
    assert.deepEqual(gates["PROC-022"], { kind: "hook", id: "Stop" });
  });

  it("labels a rule that lists known evasions GUARDED, never FORCED", () => {
    for (const rule of registry.rules) {
      if (effectiveTarget(rule) === "FORCED") {
        assert.deepEqual(rule.evasions ?? [], [], `${rule.id} targets FORCED but lists evasions`);
      }
    }
  });

  it("keeps JavaScript-only gates off Laravel and shared rules, and PHP gates off client rules", () => {
    const javascript = ["eslint", "depcruise", "vitest", "jest"];
    for (const rule of registry.rules) {
      if (!rule.gate) continue;
      if (javascript.includes(rule.gate.kind)) {
        assert.ok(
          ["web", "mobile", "client"].includes(rule.track),
          `${rule.id} has a ${rule.gate.kind} gate on the ${rule.track} track`,
        );
      }
      if (["pest", "phpstan"].includes(rule.gate.kind)) {
        assert.equal(rule.track, "laravel", `${rule.id} has a ${rule.gate.kind} gate`);
      }
    }
  });

  it("names the switch of every default-off rule in its configurable keys", () => {
    for (const rule of registry.rules.filter((candidate) => !candidate.defaultEnabled)) {
      assert.ok(
        (rule.configurable ?? []).length > 0,
        `${rule.id} is off by default but lists no configurable key that turns it on`,
      );
    }
  });

  it("keeps a rule planned for a later version off by default", () => {
    for (const rule of registry.rules) {
      if (rule.since !== "1.0.0") {
        assert.equal(rule.defaultEnabled, false, `${rule.id} is planned for ${rule.since}`);
      }
    }
  });

  it("cites only registry rule IDs in adoption notes", () => {
    for (const rule of registry.rules) {
      for (const citation of findRuleIdCitations(rule.adoption ?? "")) {
        assert.ok(ids.has(citation.id), `${rule.id} cites ${citation.id}`);
      }
    }
  });
});
