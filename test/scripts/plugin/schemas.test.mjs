/**
 * Tests for schemas/standard.schema.json and schemas/allowlist.schema.json: their identity, that
 * the kit's dependency-free validator supports every keyword they use, and that it agrees with
 * ajv (a root devDependency; those checks skip before `npm ci`) on a corpus of valid and invalid
 * documents.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";

import {
  assertSchemaSubset,
  validateAgainstSchema,
} from "../../../plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs";
import { REPO_ROOT, VERSION, optionalDevDependency, readJson } from "./helpers.mjs";

const standardSchema = readJson(path.join(REPO_ROOT, "schemas/standard.schema.json"));
const allowlistSchema = readJson(path.join(REPO_ROOT, "schemas/allowlist.schema.json"));

const ajvModule = optionalDevDependency("ajv/dist/2020");
const Ajv2020 = ajvModule?.default ?? ajvModule;
const skipAjv = Ajv2020 ? false : "ajv is not installed (run npm ci)";

const base = { version: VERSION, tracks: ["laravel"] };

/** [name, document, valid?] */
const STANDARD_CASES = [
  ["minimal", base, true],
  [
    "every field",
    {
      $schema: standardSchema.$id,
      version: VERSION,
      tracks: ["laravel", "web", "mobile"],
      profile: "next",
      tier: 2,
      modules: {
        tenancy: true,
        i18n: { enabled: true },
        "api-contract": true,
        "bff-auth": true,
        design: false,
        "browser-check": { enabled: false },
        observability: {},
      },
      locales: ["en", "ar", "zh-Hant-TW", "es-419"],
      disabled: false,
      hooks: {
        sessionStart: { detect: false },
        postToolUse: { phpstan: true, budgetSeconds: 20 },
        stop: { enabled: true, budgetSeconds: 90, command: "check:fast" },
        preToolUse: {
          protect: ["config/gates/**", "tests/Arch/*.php"],
          protectCommands: ["\\bdeploy\\b"],
        },
      },
      allowlistsDir: ".cross-stack/allowlists",
    },
    true,
  ],
  ["prerelease version", { ...base, version: "1.2.0-fixture.1" }, true],
  ["react-spa profile with web", { ...base, tracks: ["web"], profile: "react-spa" }, true],
  [
    "bff-auth switched off without web",
    { ...base, modules: { "bff-auth": { enabled: false } } },
    true,
  ],
  [
    "bff-auth with web and no profile",
    { ...base, tracks: ["web"], modules: { "bff-auth": true } },
    true,
  ],
  ["i18n switched off without locales", { ...base, modules: { i18n: false } }, true],
  ["i18n with locales", { ...base, modules: { i18n: {} }, locales: ["en"] }, true],
  ["tier 1", { ...base, tier: 1 }, true],

  ["empty object", {}, false],
  ["not an object", [], false],
  ["no tracks", { version: VERSION }, false],
  ["no version", { tracks: ["web"] }, false],
  ["empty tracks", { ...base, tracks: [] }, false],
  ["repeated track", { ...base, tracks: ["web", "web"] }, false],
  ["unknown track", { ...base, tracks: ["desktop"] }, false],
  ["too many tracks", { ...base, tracks: ["laravel", "web", "mobile", "laravel"] }, false],
  ["profile without web", { ...base, profile: "next" }, false],
  ["unknown profile", { ...base, tracks: ["web"], profile: "remix" }, false],
  ["tier 3", { ...base, tier: 3 }, false],
  ["tier as a string", { ...base, tier: "2" }, false],
  ["unknown module", { ...base, modules: { cms: true } }, false],
  ["module as a string", { ...base, modules: { tenancy: "yes" } }, false],
  ["module object with an unknown key", { ...base, modules: { tenancy: { level: 2 } } }, false],
  ["module enabled as a string", { ...base, modules: { tenancy: { enabled: "yes" } } }, false],
  ["bff-auth without web", { ...base, modules: { "bff-auth": true } }, false],
  [
    "bff-auth with react-spa",
    { ...base, tracks: ["web"], profile: "react-spa", modules: { "bff-auth": {} } },
    false,
  ],
  ["i18n without locales", { ...base, modules: { i18n: true } }, false],
  ["empty locales", { ...base, locales: [] }, false],
  ["repeated locale", { ...base, locales: ["en", "en"] }, false],
  ["upper-case locale", { ...base, locales: ["EN"] }, false],
  ["underscore locale", { ...base, locales: ["en_US"] }, false],
  ["disabled as a string", { ...base, disabled: "true" }, false],
  ["unknown top-level key", { ...base, extra: 1 }, false],
  ["two-part version", { ...base, version: "1.0" }, false],
  ["v-prefixed version", { ...base, version: "v1.0.0" }, false],
  ["unknown hook", { ...base, hooks: { preCompact: {} } }, false],
  ["unknown hook setting", { ...base, hooks: { sessionStart: { quiet: true } } }, false],
  ["zero budget", { ...base, hooks: { stop: { budgetSeconds: 0 } } }, false],
  ["budget above 600", { ...base, hooks: { stop: { budgetSeconds: 601 } } }, false],
  ["fractional budget", { ...base, hooks: { postToolUse: { budgetSeconds: 1.5 } } }, false],
  [
    "shell command as the stop script",
    { ...base, hooks: { stop: { command: "npm run x; rm -rf ." } } },
    false,
  ],
  ["stop script with a space", { ...base, hooks: { stop: { command: "check fast" } } }, false],
  [
    "absolute protect glob",
    { ...base, hooks: { preToolUse: { protect: ["/etc/passwd"] } } },
    false,
  ],
  ["parent protect glob", { ...base, hooks: { preToolUse: { protect: ["../x/**"] } } }, false],
  ["inner parent segment", { ...base, hooks: { preToolUse: { protect: ["a/../b"] } } }, false],
  ["backslash protect glob", { ...base, hooks: { preToolUse: { protect: ["a\\b"] } } }, false],
  ["dot-slash protect glob", { ...base, hooks: { preToolUse: { protect: ["./x"] } } }, false],
  ["drive-letter protect glob", { ...base, hooks: { preToolUse: { protect: ["C:/x"] } } }, false],
  ["empty protect glob", { ...base, hooks: { preToolUse: { protect: [""] } } }, false],
  ["empty command pattern", { ...base, hooks: { preToolUse: { protectCommands: [""] } } }, false],
  ["allowlists outside the project", { ...base, allowlistsDir: "../elsewhere" }, false],
  ["absolute allowlists dir", { ...base, allowlistsDir: "/srv/allowlists" }, false],
  ["glob allowlists dir", { ...base, allowlistsDir: "config/*" }, false],
];

const entry = {
  match: "src/legacy.ts",
  reason: "Pending rewrite.",
  expires: "2026-12-31",
  owner: "@o6b7",
};

/** [name, document, valid?] — `expires` calendar validity and expiry are the tool's checks, not the schema's. */
const ALLOWLIST_CASES = [
  ["no entries", { rule: "PROC-014", entries: [] }, true],
  ["one entry", { rule: "SEC-001", entries: [entry] }, true],
  ["with $schema", { $schema: allowlistSchema.$id, rule: "I18N-010", entries: [entry] }, true],
  [
    "impossible date passes the pattern",
    { rule: "UI-001", entries: [{ ...entry, expires: "2026-02-30" }] },
    true,
  ],

  ["no rule", { entries: [] }, false],
  ["lower-case rule", { rule: "proc-014", entries: [] }, false],
  ["two-digit rule", { rule: "PROC-14", entries: [] }, false],
  ["unknown prefix", { rule: "APP-001", entries: [] }, false],
  ["no entries list", { rule: "PROC-014" }, false],
  ["entries not a list", { rule: "PROC-014", entries: {} }, false],
  ["unknown top-level key", { rule: "PROC-014", entries: [], note: "x" }, false],
  ["entry without reason", { rule: "PROC-014", entries: [{ ...entry, reason: undefined }] }, false],
  ["empty reason", { rule: "PROC-014", entries: [{ ...entry, reason: "" }] }, false],
  ["blank reason", { rule: "PROC-014", entries: [{ ...entry, reason: "   " }] }, false],
  ["no owner", { rule: "PROC-014", entries: [{ ...entry, owner: undefined }] }, false],
  ["blank owner", { rule: "PROC-014", entries: [{ ...entry, owner: " " }] }, false],
  ["no expiry", { rule: "PROC-014", entries: [{ ...entry, expires: undefined }] }, false],
  ["short date", { rule: "PROC-014", entries: [{ ...entry, expires: "2026-1-1" }] }, false],
  ["word date", { rule: "PROC-014", entries: [{ ...entry, expires: "tomorrow" }] }, false],
  ["empty match", { rule: "PROC-014", entries: [{ ...entry, match: "" }] }, false],
  ["unknown entry key", { rule: "PROC-014", entries: [{ ...entry, ticket: "X-1" }] }, false],
  ["entry not an object", { rule: "PROC-014", entries: ["src/a.ts"] }, false],
];

/** JSON round trip, which drops `undefined` members the way a file would not have them. */
const asJson = (value) => JSON.parse(JSON.stringify(value));

for (const [label, schema, file] of [
  ["standard.schema.json", standardSchema, "standard.schema.json"],
  ["allowlist.schema.json", allowlistSchema, "allowlist.schema.json"],
]) {
  describe(label, () => {
    test("is a 2020-12 schema published at the versioned URL", () => {
      assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
      assert.equal(
        schema.$id,
        `https://raw.githubusercontent.com/o6b7/cross-stack-standard/v${VERSION}/plugins/cross-stack-standard/data/${file}`,
      );
    });

    test("uses only keywords the kit's validator implements", () => {
      assert.doesNotThrow(() => assertSchemaSubset(schema));
    });

    test("compiles in ajv strict mode", { skip: skipAjv }, () => {
      const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
      assert.doesNotThrow(() => ajv.compile(schema));
    });
  });
}

describe("validator verdicts", () => {
  for (const [schemaName, schema, cases] of [
    ["standard", standardSchema, STANDARD_CASES],
    ["allowlist", allowlistSchema, ALLOWLIST_CASES],
  ]) {
    for (const [name, document, valid] of cases) {
      test(`${schemaName}: ${name} is ${valid ? "valid" : "invalid"}`, () => {
        const errors = validateAgainstSchema(schema, asJson(document));
        assert.equal(errors.length === 0, valid, JSON.stringify(errors, null, 2));
      });
    }
  }
});

describe("agreement with ajv", { skip: skipAjv }, () => {
  for (const [schemaName, schema, cases] of [
    ["standard", standardSchema, STANDARD_CASES],
    ["allowlist", allowlistSchema, ALLOWLIST_CASES],
  ]) {
    test(`${schemaName}: every corpus document gets the same verdict`, () => {
      const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
      const validate = ajv.compile(schema);
      for (const [name, document] of cases) {
        const value = asJson(document);
        const ours = validateAgainstSchema(schema, value).length === 0;
        assert.equal(ours, validate(value), `${name}: ajv ${JSON.stringify(validate.errors)}`);
      }
    });
  }
});

describe("validator messages", () => {
  const messages = (document) =>
    validateAgainstSchema(standardSchema, asJson(document)).map(
      (error) => `${error.pointer} ${error.message}`,
    );

  test("names the missing and unknown properties", () => {
    assert.deepEqual(messages({ tracks: ["web"], extra: true }), [
      ' missing required property "version"',
      ' unknown property "extra"',
    ]);
  });

  test("explains conditional rules with the schema's description", () => {
    assert.deepEqual(messages({ ...base, profile: "next" }), [
      '/tracks must include "web" ("profile" applies only when "tracks" includes "web".)',
    ]);
    assert.deepEqual(messages({ ...base, modules: { i18n: true } }), [
      ' missing required property "locales" (The i18n module needs a "locales" list; its first entry is the source locale.)',
    ]);
  });

  test("reports the fitting alternative of a boolean-or-object setting", () => {
    assert.deepEqual(messages({ ...base, modules: { tenancy: { enabled: 1 } } }), [
      "/modules/tenancy/enabled must be a boolean",
    ]);
    assert.deepEqual(messages({ ...base, modules: { tenancy: "on" } }), [
      "/modules/tenancy must be a boolean or an object",
    ]);
  });

  test("describes pattern failures", () => {
    assert.deepEqual(messages({ ...base, locales: ["EN"] }), [
      '/locales/0 "EN" is not valid: A BCP 47 language tag in canonical form, such as en, ar or zh-Hant-TW.',
    ]);
    const blank = validateAgainstSchema(allowlistSchema, {
      rule: "PROC-014",
      entries: [{ ...entry, reason: " " }],
    });
    assert.deepEqual(
      blank.map((error) => `${error.pointer} ${error.message}`),
      ["/entries/0/reason must not be blank"],
    );
  });

  test("points repeated items at the repeat", () => {
    const [error] = validateAgainstSchema(standardSchema, {
      ...base,
      tracks: ["web", "laravel", "web"],
    });
    assert.equal(error.pointer, "/tracks");
    assert.equal(error.at, "/tracks/2");
    assert.equal(error.message, 'must not repeat "web" (items 0 and 2)');
  });
});

describe("assertSchemaSubset", () => {
  test("rejects keywords the validator does not implement", () => {
    assert.throws(
      () => assertSchemaSubset({ type: "string", format: "date", maxLength: 3 }),
      /"maxLength"/,
    );
    assert.throws(
      () => assertSchemaSubset({ properties: { a: { oneOf: [{ type: "string" }] } } }),
      /#\/properties\/a: unsupported JSON Schema keyword "oneOf"/,
    );
    assert.throws(
      () => assertSchemaSubset({ $ref: "https://example.com/x.json" }),
      /local "\$ref"/,
    );
  });

  test("accepts boolean schemas", () => {
    assert.doesNotThrow(() => assertSchemaSubset({ properties: { a: true, b: false } }));
    assert.equal(validateAgainstSchema({ properties: { b: false } }, { b: 1 }).length, 1);
  });
});
