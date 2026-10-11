/**
 * Unit tests of fixture.json (hand validator and JSON Schema parity), host.json and the
 * registry loader.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, test } from "node:test";
import {
  FixtureConfigError,
  layerSkipSet,
  loadLayer,
  validateFixtureConfig,
} from "../../../scripts/lib/fixtures/fixture-config.mjs";
import {
  HostConfigError,
  declaredVars,
  loadHost,
  placeholderValues,
  validateHost,
} from "../../../scripts/lib/fixtures/host.mjs";
import {
  RegistryError,
  loadRegistry,
  selectRules,
} from "../../../scripts/lib/fixtures/registry.mjs";
import { MINI_SOURCE, REPO_ROOT, tempDir } from "./helpers.mjs";

const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "schemas", "fixture.schema.json"), "utf8"),
);

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

/** Documents judged by the schema alone (no role or file-system rules). */
const SCHEMA_CASES = [
  [true, { hosts: ["laravel"] }],
  [
    true,
    {
      $schema: "../../../../../schemas/fixture.schema.json",
      description: "x",
      hosts: ["web", "mobile"],
    },
  ],
  [
    true,
    { hosts: ["node"], manifestOverlay: { modules: { tenancy: { enabled: true } }, tier: null } },
  ],
  [
    true,
    {
      hosts: ["repo"],
      base: "base",
      head: "commits/head",
      commitMessages: { base: "chore: a", head: "feat: b" },
    },
  ],
  [true, { hosts: ["repo"], remove: ["CODEOWNERS", ".github/workflows/ci.yml"] }],
  [
    true,
    { hosts: ["laravel"], rename: { "env.example": ".env", "vendor-stub": "vendor/acme/stub" } },
  ],
  [
    true,
    {
      hosts: ["web"],
      alsoFires: ["WEB-013", "I18N-001"],
      expect: { idPattern: "cross-stack/rule" },
    },
  ],
  [false, {}],
  [false, { hosts: [] }],
  [false, { hosts: ["Web"] }],
  [false, { hosts: ["web", "web"] }],
  [false, { hosts: ["web"], extra: true }],
  [false, { hosts: ["web"], manifestOverlay: [] }],
  [false, { hosts: ["repo"], base: "../outside" }],
  [false, { hosts: ["repo"], head: "/abs" }],
  [false, { hosts: ["repo"], base: "a\\b" }],
  [false, { hosts: ["repo"], commitMessages: { tail: "x" } }],
  [false, { hosts: ["repo"], remove: ["a", "a"] }],
  [false, { hosts: ["repo"], remove: ["a/./b"] }],
  [false, { hosts: ["web"], rename: { "a/": "b" } }],
  [false, { hosts: ["web"], rename: { a: "../b" } }],
  [false, { hosts: ["web"], alsoFires: ["WEB-13"] }],
  [false, { hosts: ["web"], alsoFires: ["XX-013"] }],
  [false, { hosts: ["web"], expect: { idPattern: "" } }],
  [false, { hosts: ["web"], expect: { other: "x" } }],
  [false, { hosts: ["web"], description: "" }],
];

function handVerdict(doc) {
  try {
    validateFixtureConfig(doc, { label: "fixture.json", role: "violation" });
    return true;
  } catch (err) {
    assert.ok(err instanceof FixtureConfigError, err.message);
    return false;
  }
}

describe("fixture.json validation", () => {
  for (const [valid, doc] of SCHEMA_CASES) {
    test(`hand validator: ${valid ? "accepts" : "rejects"} ${JSON.stringify(doc)}`, () => {
      assert.equal(handVerdict(doc), valid);
    });
  }

  test("the JSON Schema agrees with the hand validator (needs the ajv devDependency)", async (t) => {
    let Ajv2020;
    try {
      Ajv2020 = createRequire(path.join(REPO_ROOT, "package.json"))("ajv/dist/2020").default;
    } catch {
      t.skip("ajv is not installed; run npm ci");
      return;
    }
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(SCHEMA);
    for (const [valid, doc] of SCHEMA_CASES) {
      assert.equal(
        validate(doc),
        valid,
        `${JSON.stringify(doc)}: ${JSON.stringify(validate.errors)}`,
      );
    }
  });

  test("the schema's relative-path pattern matches isSafeRelativePath", async () => {
    const { isSafeRelativePath } = await import("../../../scripts/lib/fixtures/paths.mjs");
    const re = new RegExp(SCHEMA.$defs.relativePath.pattern, "u");
    for (const sample of [
      "a",
      "a/b",
      ".env",
      "a/..b",
      "...",
      "",
      "/a",
      "a/",
      "a//b",
      "./a",
      "a/../b",
      "..",
      "C:/a",
      "a\\b",
    ]) {
      assert.equal(sample.length > 0 && re.test(sample), isSafeRelativePath(sample), sample);
    }
  });

  test("role and cross-field rules", () => {
    const check = (doc, role) => () =>
      validateFixtureConfig(doc, { label: "f.json", role, knownIds: new Set(["WEB-001"]) });
    assert.throws(
      check({ hosts: ["web"], alsoFires: ["WEB-001"] }, "clean"),
      /"alsoFires" is only valid in a violation fixture/,
    );
    assert.throws(
      check({ hosts: ["web"], expect: { idPattern: "x" } }, "cleanOverlay"),
      /"expect" is only valid/,
    );
    assert.throws(
      check({ hosts: ["web"], alsoFires: ["WEB-002"] }, "violation"),
      /WEB-002, which is not in the registry/,
    );
    assert.throws(
      check({ hosts: ["repo"], commitMessages: { head: "x" } }, "violation"),
      /commitMessages\.head needs "head"/,
    );
    assert.throws(
      check({ hosts: ["repo"], base: "x", head: "x" }, "violation"),
      /must be different/,
    );
    assert.throws(
      check({ hosts: ["web"], expect: { idPattern: "(" } }, "violation"),
      /not a valid regular expression/,
    );
    assert.throws(
      check({ hosts: ["web"], expect: { idPattern: "x*" } }, "violation"),
      /must not match an empty output/,
    );
    const normalised = check({ hosts: ["web"], alsoFires: ["WEB-001"] }, "violation")();
    assert.deepEqual(normalised, {
      description: null,
      hosts: ["web"],
      manifestOverlay: null,
      base: null,
      head: null,
      commitMessages: { base: null, head: null },
      remove: [],
      rename: {},
      alsoFires: ["WEB-001"],
      expect: { idPattern: null },
    });
  });

  test("every fixture.json in the mini repository is valid except the deliberate one", () => {
    const files = fs
      .readdirSync(MINI_SOURCE, { recursive: true })
      .filter((rel) => path.basename(rel) === "fixture.json")
      .map((rel) => rel.split(path.sep).join("/"));
    assert.ok(files.length >= 20);
    for (const rel of files) {
      const doc = JSON.parse(fs.readFileSync(path.join(MINI_SOURCE, rel), "utf8"));
      assert.equal(handVerdict(doc), !rel.includes("CI-918"), rel);
    }
  });
});

describe("loadLayer", () => {
  test("optional clean overlays, required violation fixtures, existing base/head and rename sources", (t) => {
    const dir = tempDir(t);
    assert.equal(loadLayer(path.join(dir, "absent"), { role: "cleanOverlay", label: "o" }), null);
    fs.mkdirSync(path.join(dir, "files-only"));
    assert.deepEqual(
      loadLayer(path.join(dir, "files-only"), { role: "cleanOverlay", label: "o" }).config,
      null,
    );
    assert.throws(
      () => loadLayer(path.join(dir, "absent"), { role: "violation", label: "v" }),
      /v: fixture directory is missing/,
    );
    assert.throws(
      () => loadLayer(path.join(dir, "files-only"), { role: "clean", label: "c" }),
      /c\/fixture\.json: is missing/,
    );
    write(path.join(dir, "bad-json", "fixture.json"), "{");
    assert.throws(
      () => loadLayer(path.join(dir, "bad-json"), { role: "violation", label: "v" }),
      /cannot parse/,
    );
    write(path.join(dir, "no-base", "fixture.json"), { hosts: ["repo"], base: "base" });
    assert.throws(
      () => loadLayer(path.join(dir, "no-base"), { role: "violation", label: "v" }),
      /base directory "base" does not exist/,
    );
    write(path.join(dir, "no-src", "fixture.json"), {
      hosts: ["web"],
      rename: { "env.txt": ".env" },
    });
    assert.throws(
      () => loadLayer(path.join(dir, "no-src"), { role: "violation", label: "v" }),
      /rename source "env.txt" does not exist/,
    );

    write(path.join(dir, "full", "fixture.json"), {
      hosts: ["repo"],
      base: "commits/base",
      head: "commits/head",
      rename: { "env.txt": ".env" },
    });
    for (const rel of ["commits/base/a", "commits/head/a", "env.txt", "src/a"]) {
      write(path.join(dir, "full", ...rel.split("/")), "x");
    }
    const layer = loadLayer(path.join(dir, "full"), { role: "violation", label: "v" });
    assert.deepEqual([...layerSkipSet(layer)].sort(), [
      "commits/base",
      "commits/head",
      "env.txt",
      "fixture.json",
    ]);
  });
});

describe("host.json", () => {
  const harnessDir = path.join(REPO_ROOT, "test", "harness");

  test("every host shipped in test/harness is valid", () => {
    const names = fs
      .readdirSync(harnessDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    assert.ok(names.includes("repo") && names.includes("node"));
    for (const name of names) {
      const host = loadHost(name, { harnessDir, root: REPO_ROOT });
      assert.equal(host.name, name);
      assert.equal(host.label, `test/harness/${name}/host.json`);
    }
  });

  test("the repo host is a git host whose script gate receives base and head", () => {
    const host = loadHost("repo", { harnessDir, root: REPO_ROOT });
    assert.equal(host.git, true);
    assert.deepEqual(host.gates.script.argv.slice(-2), [
      ["--base", "{base}"],
      ["--head", "{head}"],
    ]);
    const node = loadHost("node", { harnessDir, root: REPO_ROOT });
    assert.equal(node.git, false);
    assert.deepEqual(Object.keys(node.gates), ["script"]);
    assert.deepEqual([...declaredVars(node)], ["kitBin"]);
  });

  const valid = {
    name: "demo",
    description: "Demo host.",
    vars: { bin: "{hostDir}/bin.mjs", late: "{workdir}/x" },
    setup: [["{node}", "{bin}"]],
    prepare: [["{node}", "{late}"]],
    copy: { hardlink: ["vendor"], detach: ["vendor/composer"], exclude: ["*.log"] },
    env: { TOOL_HOME: "{workdir}/.tool" },
    gates: {
      pest: {
        argv: ["php", "vendor/bin/pest", ["--filter", "{discriminator}"]],
        failExitCodes: [1],
        timeoutMs: 5000,
      },
    },
  };
  const where = { name: "demo", dir: "/h/demo", label: "test/harness/demo/host.json" };

  test("validateHost normalises a valid definition", () => {
    const host = validateHost(valid, where);
    assert.equal(host.git, false);
    assert.deepEqual(host.gates.pest, {
      argv: ["php", "vendor/bin/pest", ["--filter", "{discriminator}"]],
      cwd: null,
      env: {},
      stdin: null,
      junit: null,
      timeoutMs: 5000,
      failExitCodes: [1],
    });
  });

  const invalid = [
    [{ ...valid, name: "other" }, /name must equal the directory name "demo"/],
    [{ ...valid, description: " " }, /description must be a non-empty string/],
    [{ ...valid, extra: 1 }, /unknown key "extra"/],
    [{ ...valid, gates: { rspec: { argv: ["x"] } } }, /unknown gate kind/],
    [{ ...valid, gates: { pest: { argv: [] } } }, /argv must be a non-empty array/],
    [{ ...valid, gates: { pest: { argv: [["x"]] } } }, /argv\[0\] must be a non-empty string/],
    [{ ...valid, gates: { pest: { argv: ["x", "{typo}"] } } }, /unknown placeholder \{typo\}/],
    [{ ...valid, gates: { pest: { argv: ["x"], failExitCodes: [0] } } }, /failExitCodes/],
    [{ ...valid, setup: [["{node}", "{workdir}"]] }, /setup\[0\]: unknown placeholder \{workdir\}/],
    [{ ...valid, vars: { node: "x" } }, /vars\.node shadows a built-in placeholder/],
    [
      { ...valid, copy: { hardlink: ["vendor"], detach: ["node_modules/x"] } },
      /is not inside a copy\.hardlink dir/,
    ],
    [
      { ...valid, copy: { hardlink: ["../vendor"] } },
      /copy\.hardlink\[0\] is not a valid relative path/,
    ],
    [
      { ...valid, include: [{ host: "x", into: "../y" }] },
      /include\[0\]\.into must be a relative path/,
    ],
    [{ ...valid, git: "yes" }, /git must be a boolean/],
    [{ ...valid, timeoutMs: 0 }, /timeoutMs must be a positive integer/],
  ];
  for (const [raw, message] of invalid) {
    test(`validateHost rejects: ${message.source}`, () => {
      assert.throws(
        () => validateHost(raw, where),
        (err) => err instanceof HostConfigError && message.test(err.message),
      );
    });
  }

  test("loadHost reports missing hosts and include cycles", (t) => {
    const dir = tempDir(t);
    write(path.join(dir, "a", "host.json"), {
      name: "a",
      description: "A.",
      include: [{ host: "b", into: "b" }],
    });
    write(path.join(dir, "b", "host.json"), {
      name: "b",
      description: "B.",
      include: [{ host: "a", into: "a" }],
    });
    assert.throws(
      () => loadHost("a", { harnessDir: dir, root: dir }),
      /host include cycle: a -> b -> a/,
    );
    assert.throws(
      () => loadHost("zzz", { harnessDir: dir, root: dir }),
      /host "zzz" not found: zzz\/host\.json is missing/,
    );
    assert.throws(() => loadHost("Bad", { harnessDir: dir, root: dir }), /invalid host name/);
    write(path.join(dir, "c", "host.json"), "{");
    assert.throws(
      () => loadHost("c", { harnessDir: dir, root: dir }),
      /c\/host\.json: cannot parse/,
    );
  });

  test("placeholderValues: built-ins, variables, CLI overrides and availability", () => {
    const host = validateHost(valid, where);
    const setup = placeholderValues(host, { repoRoot: "/r" });
    assert.equal(setup.bin, "/h/demo/bin.mjs");
    assert.equal(setup.late, undefined, "a variable that needs {workdir} is unavailable in setup");
    assert.equal(setup.workdir, undefined);
    assert.equal(setup.ruleId, undefined);
    const gate = placeholderValues(host, {
      repoRoot: "/r",
      workdir: "/w",
      base: "",
      head: "",
      rule: { id: "BE-012", gate: { kind: "pest", id: "arch" } },
      cliVars: { bin: "/override.mjs" },
    });
    assert.equal(gate.bin, "/override.mjs");
    assert.equal(gate.late, "/w/x");
    assert.equal(gate.discriminator, null);
    assert.equal(gate.gateKind, "pest");
    assert.equal(gate.node, process.execPath);
  });
});

describe("registry", () => {
  test("loads an array or an object with rules, and rejects malformed registries", (t) => {
    const dir = tempDir(t);
    const rule = {
      id: "BE-001",
      track: "laravel",
      enforcement: "FORCED",
      gate: { kind: "pest", id: "x" },
    };
    write(path.join(dir, "array.json"), [rule]);
    write(path.join(dir, "object.json"), { rules: [rule] });
    assert.deepEqual(loadRegistry(path.join(dir, "array.json")).prefixes, ["BE"]);
    assert.equal(loadRegistry(path.join(dir, "object.json")).byId.get("BE-001").track, "laravel");
    const bad = [
      [{ rules: {} }, /expected an array of rules/],
      [[rule, rule], /duplicate id BE-001/],
      [[{ ...rule, id: "BE-1" }], /invalid id "BE-1"/],
      [[{ ...rule, track: "" }], /has no track/],
      [[{ ...rule, enforcement: undefined }], /has no enforcement/],
      [[{ ...rule, gate: { kind: "pest" } }], /gate without a kind and an id/],
    ];
    for (const [data, message] of bad) {
      write(path.join(dir, "bad.json"), data);
      assert.throws(
        () => loadRegistry(path.join(dir, "bad.json"), "registry/rules.json"),
        (err) => err instanceof RegistryError && message.test(err.message),
      );
    }
    assert.throws(
      () => loadRegistry(path.join(dir, "missing.json"), "registry/rules.json"),
      /registry\/rules\.json: cannot read the registry: file not found/,
    );
  });

  test("selectRules follows enforcement, targetEnforcement and fixture presence", () => {
    const registry = loadRegistry(path.join(MINI_SOURCE, "registry", "rules.json"));
    const fixturesDir = path.join(MINI_SOURCE, "test", "fixtures");
    const all = selectRules(registry, { fixturesDir });
    assert.ok(
      !all.selected.some((rule) => rule.id === "CI-910"),
      "REVIEW without a target is never selected",
    );
    assert.deepEqual(
      all.missing.map((rule) => rule.id),
      ["CI-911"],
    );
    assert.deepEqual(all.skipped, ["CI-909"]);
    assert.equal(all.selected.length, 17);
    const web = selectRules(registry, { fixturesDir, track: "web" });
    assert.deepEqual(
      web.selected.map((rule) => rule.id),
      ["WEB-901"],
    );
    const explicit = selectRules(registry, { fixturesDir, ruleIds: ["CI-909", "CI-910"] });
    assert.deepEqual(
      explicit.missing.map((rule) => rule.id),
      ["CI-909", "CI-910"],
      "named rules must have fixtures",
    );
    assert.throws(
      () => selectRules(registry, { fixturesDir, ruleIds: ["CI-999"] }),
      /CI-999 is not in the registry/,
    );
  });
});
