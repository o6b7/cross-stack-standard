import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { checkVersionDrift, main } from "../../../scripts/check-version-drift.mjs";
import { main as stampMain } from "../../../scripts/stamp-version.mjs";
import {
  NEW,
  OLD,
  SCHEMA_BASE,
  SCRIPTS,
  callMain,
  makeTree,
  read,
  readJson,
  removeTree,
  run,
  snapshot,
  versionTree,
  writeFiles,
} from "./helpers.mjs";

const trees = [];
const tree = (files) => {
  const root = makeTree(files);
  trees.push(root);
  return root;
};
after(() => trees.forEach(removeTree));

const PLUGIN_JSON = "plugins/cross-stack-standard/.claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";
const TEMPLATES = "plugins/cross-stack-standard/templates";

/** A tree where every location already holds NEW. */
function cleanTree() {
  return tree(versionTree({ from: NEW, to: NEW }));
}

/** Edits a JSON file of a tree. */
function editJson(root, rel, edit) {
  const value = readJson(root, rel);
  edit(value);
  writeFiles(root, { [rel]: value });
}

describe("check-version-drift: clean trees", () => {
  it("passes when every location matches VERSION", () => {
    const root = cleanTree();
    const before = snapshot(root);
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 0, result.stdout);
    assert.match(
      result.stdout,
      new RegExp(
        `^check-version-drift: VERSION ${NEW.replace(/\./g, "\\.")}; \\d+ location\\(s\\) checked, 0 finding\\(s\\)\\n$`,
      ),
    );
    assert.deepEqual(snapshot(root), before, "the check never writes");
  });

  it("passes on a tree with only VERSION (files are added over time)", () => {
    const result = callMain(main, ["--root", tree({ VERSION: `${NEW}\n` })]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /0 location\(s\) checked, 0 finding\(s\)/);
  });

  it("ignores stale versions outside the stamped locations", () => {
    // versionTree() keeps 0.9.0 in a changelog, a fixture, node_modules, vendor, a deep line,
    // a binary file and docs; none of them is a finding.
    const result = checkVersionDrift(cleanTree());
    assert.deepEqual(result.findings, []);
    assert.equal(result.ok, true);
  });
});

describe("check-version-drift: detects drift in every location", () => {
  /** @type {[string, (root: string) => void, string, string, number][]} */
  const cases = [
    [
      "marketplace metadata.version",
      (r) => editJson(r, MARKETPLACE, (m) => (m.metadata.version = OLD)),
      MARKETPLACE,
      "metadata.version",
      8,
    ],
    [
      "marketplace top-level version",
      (r) => editJson(r, MARKETPLACE, (m) => (m.version = OLD)),
      MARKETPLACE,
      "version",
      16,
    ],
    [
      "plugin.json version",
      (r) => writeFiles(r, { [PLUGIN_JSON]: read(r, PLUGIN_JSON).replace(NEW, OLD) }),
      PLUGIN_JSON,
      "version",
      3,
    ],
    [
      "root package.json version",
      (r) => editJson(r, "package.json", (p) => (p.version = OLD)),
      "package.json",
      "version",
      3,
    ],
    [
      "root internal dependency",
      (r) =>
        editJson(
          r,
          "package.json",
          (p) => (p.devDependencies["@cross-stack-standard/eslint-config"] = `~${OLD}`),
        ),
      "package.json",
      'devDependencies["@cross-stack-standard/eslint-config"]',
      9,
    ],
    [
      "workspace package.json",
      (r) => editJson(r, "packages/eslint-config/package.json", (p) => (p.version = OLD)),
      "packages/eslint-config/package.json",
      "version",
      3,
    ],
    [
      "lockfile version",
      (r) => editJson(r, "package-lock.json", (l) => (l.version = OLD)),
      "package-lock.json",
      "version",
      3,
    ],
    [
      "lockfile root entry",
      (r) => editJson(r, "package-lock.json", (l) => (l.packages[""].version = OLD)),
      "package-lock.json",
      'packages[""].version',
      9,
    ],
    [
      "lockfile workspace entry",
      (r) =>
        editJson(
          r,
          "package-lock.json",
          (l) => (l.packages["packages/eslint-config"].version = OLD),
        ),
      "package-lock.json",
      'packages["packages/eslint-config"].version',
      28,
    ],
    [
      "template package.json",
      (r) => editJson(r, `${TEMPLATES}/web/package.json`, (p) => (p.version = OLD)),
      `${TEMPLATES}/web/package.json`,
      "version",
      3,
    ],
    [
      "vendored template package",
      (r) =>
        editJson(r, `${TEMPLATES}/web/vendor/eslint-config/package.json`, (p) => (p.version = OLD)),
      `${TEMPLATES}/web/vendor/eslint-config/package.json`,
      "version",
      3,
    ],
    [
      "template header",
      (r) =>
        writeFiles(r, {
          [`${TEMPLATES}/shared/lefthook.yml`]: read(r, `${TEMPLATES}/shared/lefthook.yml`).replace(
            NEW,
            OLD,
          ),
        }),
      `${TEMPLATES}/shared/lefthook.yml`,
      "header",
      1,
    ],
    [
      "package header",
      (r) =>
        writeFiles(r, {
          "packages/laravel/src/Rule.php": read(r, "packages/laravel/src/Rule.php").replace(
            NEW,
            OLD,
          ),
        }),
      "packages/laravel/src/Rule.php",
      "header",
      5,
    ],
    [
      "template schema URL",
      (r) =>
        editJson(
          r,
          `${TEMPLATES}/claude/standard.json`,
          (s) => (s.$schema = s.$schema.replace(`/v${NEW}/`, `/v${OLD}/`)),
        ),
      `${TEMPLATES}/claude/standard.json`,
      "schema URL",
      2,
    ],
    [
      "schema $id URL",
      (r) =>
        editJson(
          r,
          "schemas/standard.schema.json",
          (s) => (s.$id = s.$id.replace(`/v${NEW}/`, `/v${OLD}/`)),
        ),
      "schemas/standard.schema.json",
      "schema URL",
      3,
    ],
  ];

  for (const [name, mutate, file, location, line] of cases) {
    it(name, () => {
      const root = cleanTree();
      mutate(root);
      const result = callMain(main, ["--root", root]);
      assert.equal(result.code, 1, result.stdout);
      const findings = result.stdout.trim().split("\n").slice(0, -1);
      // A range keeps its operator: "~1.0.0" is expected to become "~1.2.3".
      const operator = name === "root internal dependency" ? "~" : "";
      assert.deepEqual(findings, [
        `VERSION-MISMATCH ${file}:${line} ${location} is "${operator}${OLD}"; ` +
          `expected "${operator}${NEW}" (run node scripts/stamp-version.mjs)`,
      ]);
      assert.match(result.stdout, /1 finding\(s\)\n$/);
    });
  }

  it("reports a missing required version field", () => {
    const root = cleanTree();
    editJson(root, PLUGIN_JSON, (p) => delete p.version);
    editJson(root, MARKETPLACE, (m) => delete m.metadata);
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 1);
    assert.match(
      result.stdout,
      new RegExp(
        `^VERSION-MISSING ${MARKETPLACE.replace(/\./g, "\\.")}:1 metadata\\.version is missing; expected "${NEW.replace(/\./g, "\\.")}"`,
        "m",
      ),
    );
    assert.match(
      result.stdout,
      /^VERSION-MISSING plugins\/cross-stack-standard\/\.claude-plugin\/plugin\.json:1 version is missing/m,
    );
  });

  it("does not require a version in template package.json fragments", () => {
    const root = cleanTree();
    editJson(root, `${TEMPLATES}/web/package.json`, (p) => delete p.version);
    assert.equal(callMain(main, ["--root", root]).code, 0);
  });

  it("finds drift after VERSION changes, and stamping fixes it", () => {
    const root = cleanTree();
    writeFiles(root, { VERSION: "2.0.0\n" });
    const drift = checkVersionDrift(root);
    assert.equal(drift.ok, false);
    assert.ok(drift.findings.length >= 15, `${drift.findings.length} findings`);
    assert.ok(drift.findings.every((f) => f.id === "VERSION-MISMATCH"));
    assert.equal(callMain(stampMain, ["--root", root]).code, 0);
    assert.equal(checkVersionDrift(root).ok, true);
    assert.equal(
      readJson(root, "schemas/standard.schema.json").$id.startsWith(`${SCHEMA_BASE}/v2.0.0/`),
      true,
    );
  });
});

describe("check-version-drift: composer and marketplace policy", () => {
  it("fails on a composer.json with a version field, wherever it is published", () => {
    const root = cleanTree();
    editJson(root, "packages/laravel/composer.json", (c) => (c.version = NEW));
    editJson(
      root,
      `${TEMPLATES}/laravel/vendor/cross-stack-standard-laravel/composer.json`,
      (c) => (c.version = NEW),
    );
    writeFiles(root, { "composer.json": { name: "o6b7/root", version: NEW } });
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 1);
    const ids = result.stdout
      .trim()
      .split("\n")
      .slice(0, -1)
      .map((line) => line.split(" ").slice(0, 2).join(" "));
    assert.deepEqual(ids, [
      "VERSION-COMPOSER composer.json:3",
      "VERSION-COMPOSER packages/laravel/composer.json:5",
      `VERSION-COMPOSER ${TEMPLATES}/laravel/vendor/cross-stack-standard-laravel/composer.json:4`,
    ]);
    assert.match(result.stdout, /remove it: Composer infers the version/);
  });

  it("ignores composer.json files of third-party dependencies and test fixtures", () => {
    const root = cleanTree();
    writeFiles(root, {
      "packages/laravel/tests/fixtures/app/composer.json": {
        name: "fixture/app",
        version: "1.0.0",
      },
      "test/fixtures/laravel/clean/composer.json": { name: "fixture/app", version: "1.0.0" },
    });
    // packages/laravel/vendor/acme/lib/composer.json (with a version) is part of versionTree().
    assert.equal(callMain(main, ["--root", root]).code, 0);
  });

  it("fails when the plugin's marketplace entry declares a version, even an equal one", () => {
    const root = cleanTree();
    editJson(root, MARKETPLACE, (m) => (m.plugins[0].version = NEW));
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 1);
    assert.match(
      result.stdout,
      /^VERSION-ENTRY \.claude-plugin\/marketplace\.json:14 plugins\[0\] \("cross-stack-standard"\) declares "version"/m,
    );
  });

  it("allows versions on other plugins' marketplace entries", () => {
    const root = cleanTree();
    editJson(root, MARKETPLACE, (m) =>
      m.plugins.push({
        name: "third-party",
        source: { source: "github", repo: "a/b" },
        version: "4.3.1",
      }),
    );
    assert.equal(callMain(main, ["--root", root]).code, 0);
  });

  it("reports unparsable manifests as findings", () => {
    const root = cleanTree();
    writeFiles(root, { [PLUGIN_JSON]: '{\n  "name": "cross-stack-standard",\n  "version": \n}\n' });
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 1);
    assert.match(
      result.stdout,
      /^VERSION-JSON plugins\/cross-stack-standard\/\.claude-plugin\/plugin\.json:\d+ not valid JSON/m,
    );
  });

  it("reports a non-object metadata as a finding instead of crashing", () => {
    const root = cleanTree();
    editJson(root, MARKETPLACE, (m) => (m.metadata = "x"));
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 1);
    assert.match(
      result.stdout,
      /^VERSION-JSON \.claude-plugin\/marketplace\.json:0 metadata is not an object/m,
    );
  });
});

describe("check-version-drift: output and CLI", () => {
  it("prints a JSON report", () => {
    const root = cleanTree();
    editJson(root, "package.json", (p) => (p.version = OLD));
    const result = callMain(main, ["--root", root, "--json"]);
    assert.equal(result.code, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.version, NEW);
    assert.equal(report.checked, report.locations.length);
    assert.deepEqual(report.findings, [
      {
        id: "VERSION-MISMATCH",
        file: "package.json",
        line: 3,
        message: `version is "${OLD}"; expected "${NEW}" (run node scripts/stamp-version.mjs)`,
      },
    ]);
  });

  it("exits 2 on a missing or invalid VERSION", () => {
    const missing = callMain(main, ["--root", tree({})]);
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /VERSION not found/);
    const invalid = callMain(main, ["--root", tree({ VERSION: "1.0\n" }), "--json"]);
    assert.equal(invalid.code, 2);
    assert.equal(JSON.parse(invalid.stdout).ok, false);
  });

  it("runs as a process with the documented exit codes", () => {
    const clean = cleanTree();
    assert.equal(run(SCRIPTS.drift, ["--root", clean]).status, 0);
    editJson(clean, "package.json", (p) => (p.version = OLD));
    assert.equal(run(SCRIPTS.drift, ["--root", clean]).status, 1);
    assert.equal(run(SCRIPTS.drift, ["--unknown"]).status, 2);
    const help = run(SCRIPTS.drift, ["-h"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Fix drift with: node scripts\/stamp-version\.mjs/);
  });
});
