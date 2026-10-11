import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { main as driftMain } from "../../../scripts/check-version-drift.mjs";
import { formatChange, main } from "../../../scripts/stamp-version.mjs";
import {
  NEVER_WRITTEN,
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

describe("stamp-version: every location", () => {
  const root = tree(versionTree());
  const before = snapshot(root);
  const result = callMain(main, ["--root", root]);

  it("exits 0 and summarises the run", () => {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.match(
      result.stdout,
      new RegExp(
        `stamp-version: ${NEW.replace(/\./g, "\\.")}; \\d+ change\\(s\\) in \\d+ file\\(s\\) written`,
      ),
    );
  });

  it("stamps the marketplace metadata.version but never the plugin entry", () => {
    const marketplace = readJson(root, MARKETPLACE);
    assert.equal(marketplace.metadata.version, NEW);
    assert.equal(Object.hasOwn(marketplace.plugins[0], "version"), false);
  });

  it("stamps plugin.json in place, keeping its formatting", () => {
    assert.equal(
      read(root, PLUGIN_JSON),
      `{\n  "name": "cross-stack-standard",\n  "version": "${NEW}",\n  "keywords": ["laravel", "web"]\n}\n`,
    );
  });

  it("stamps the root and workspace package.json files and internal ranges", () => {
    const rootPackage = readJson(root, "package.json");
    assert.equal(rootPackage.version, NEW);
    assert.equal(rootPackage.devDependencies["@cross-stack-standard/eslint-config"], NEW);
    assert.equal(rootPackage.devDependencies.eslint, "9.39.5");
    assert.equal(readJson(root, "packages/eslint-config/package.json").version, NEW);
  });

  it("keeps the npm lockfile in sync with the workspaces", () => {
    const lock = readJson(root, "package-lock.json");
    assert.equal(lock.version, NEW);
    assert.equal(lock.packages[""].version, NEW);
    assert.equal(lock.packages[""].devDependencies["@cross-stack-standard/eslint-config"], NEW);
    assert.equal(lock.packages["packages/eslint-config"].version, NEW);
    assert.equal(lock.packages["node_modules/eslint"].version, "9.39.5");
    assert.equal(lock.packages["packages/eslint-config"].peerDependencies.eslint, "^9.39.0");
  });

  it("stamps template package.json files that declare a version, and their internal ranges", () => {
    const web = readJson(root, `${TEMPLATES}/web/package.json`);
    assert.equal(web.version, NEW);
    assert.deepEqual(web.devDependencies, {
      "@cross-stack-standard/eslint-config": `^${NEW}`,
      "@cross-stack-standard/i18n-parity": "file:.cross-stack/vendor/i18n-parity",
      "@cross-stack-standard/vitest-arch": "*",
      "left-pad": OLD,
    });
    assert.equal(readJson(root, `${TEMPLATES}/web/vendor/eslint-config/package.json`).version, NEW);
  });

  it("stamps header comments in templates and packages", () => {
    assert.equal(
      read(root, `${TEMPLATES}/shared/lefthook.yml`).split("\n")[0],
      `# cross-stack-standard v${NEW}`,
    );
    assert.match(
      read(root, "packages/eslint-config/index.js"),
      new RegExp(`^// cross-stack-standard v${NEW}:`),
    );
    assert.match(
      read(root, "packages/laravel/src/Rule.php"),
      new RegExp(`// cross-stack-standard v${NEW}\\n$`),
    );
  });

  it("stamps versioned schema URLs in templates and schemas", () => {
    const expected = `${SCHEMA_BASE}/v${NEW}/plugins/cross-stack-standard/data/standard.schema.json`;
    assert.equal(readJson(root, `${TEMPLATES}/claude/standard.json`).$schema, expected);
    assert.equal(readJson(root, "schemas/standard.schema.json").$id, expected);
    assert.equal(
      readJson(root, "schemas/standard.schema.json").$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.equal(
      readJson(root, "registry/rules.schema.json").$id,
      `${SCHEMA_BASE}/v${NEW}/registry/rules.schema.json`,
    );
    assert.equal(
      readJson(root, "plugins/cross-stack-standard/data/standard.schema.json").$id,
      expected,
    );
  });

  it("never writes composer.json, changelogs, fixtures, dependencies, binaries or out-of-scope files", () => {
    const afterRun = snapshot(root);
    for (const rel of NEVER_WRITTEN) assert.equal(afterRun.get(rel), before.get(rel), rel);
    assert.equal(Object.hasOwn(readJson(root, "packages/laravel/composer.json"), "version"), false);
    assert.equal(
      Object.hasOwn(readJson(root, `${TEMPLATES}/laravel/package.json`), "version"),
      false,
    );
  });

  it("leaves a tree the drift check accepts, and a second run changes nothing", () => {
    const drift = callMain(driftMain, ["--root", root]);
    assert.equal(drift.code, 0, drift.stdout);
    const stable = snapshot(root);
    const again = callMain(main, ["--root", root]);
    assert.equal(again.code, 0);
    assert.match(again.stdout, /0 change\(s\) in 0 file\(s\) written/);
    assert.deepEqual(snapshot(root), stable);
  });
});

describe("stamp-version: missing fields and files", () => {
  it("adds missing required versions and a missing metadata block", () => {
    const root = tree({
      VERSION: `${NEW}\n`,
      [MARKETPLACE]: { name: "cross-stack-standard", owner: { name: "o" }, plugins: [] },
      [PLUGIN_JSON]: { name: "cross-stack-standard", description: "d" },
      "package.json": { name: "repo", private: true },
      "packages/i18n-parity/package.json": { name: "@cross-stack-standard/i18n-parity" },
    });
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 0);
    assert.match(
      result.stdout,
      /VERSION-STAMP \.claude-plugin\/marketplace\.json:1 metadata\.version: \(missing\) -> "1\.2\.3"/,
    );
    assert.equal(
      read(root, MARKETPLACE),
      `{\n  "name": "cross-stack-standard",\n  "owner": {\n    "name": "o"\n  },\n  "metadata": {\n    "version": "${NEW}"\n  },\n  "plugins": []\n}\n`,
    );
    assert.deepEqual(Object.keys(readJson(root, PLUGIN_JSON)), ["name", "version", "description"]);
    assert.deepEqual(Object.keys(readJson(root, "package.json")), ["name", "version", "private"]);
    assert.equal(readJson(root, "packages/i18n-parity/package.json").version, NEW);
  });

  it("skips every missing file silently", () => {
    const root = tree({ VERSION: `${NEW}\n` });
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(
      result.stdout,
      `stamp-version: ${NEW}; 0 change(s) in 0 file(s) written (0 location(s) checked)\n`,
    );
  });
});

describe("stamp-version: --dry-run", () => {
  it("lists every change and writes nothing", () => {
    const root = tree(versionTree());
    const before = snapshot(root);
    const result = callMain(main, ["--root", root, "--dry-run"]);
    assert.equal(result.code, 0);
    assert.deepEqual(snapshot(root), before);
    assert.match(result.stdout, /dry run: \d+ change\(s\) in \d+ file\(s\) would be written/);
    const lines = result.stdout.trim().split("\n");
    assert.ok(lines.slice(0, -1).every((line) => line.startsWith("VERSION-STAMP ")));
    assert.ok(lines.includes(`VERSION-STAMP ${PLUGIN_JSON}:3 version: "${OLD}" -> "${NEW}"`));
    assert.ok(
      lines.includes(
        `VERSION-STAMP ${TEMPLATES}/shared/lefthook.yml:1 header: "${OLD}" -> "${NEW}"`,
      ),
    );
  });

  it("reports the same changes as JSON", () => {
    const root = tree(versionTree());
    const result = callMain(main, ["--root", root, "--dry-run", "--json"]);
    assert.equal(result.code, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(report.written, 0);
    assert.equal(report.version, NEW);
    assert.ok(report.files.includes(PLUGIN_JSON));
    assert.ok(
      report.changes.some((c) => c.file === MARKETPLACE && c.location === "metadata.version"),
    );
    assert.deepEqual(report.warnings, []);
  });
});

describe("stamp-version: errors", () => {
  it("exits 2 on an invalid VERSION and writes nothing", () => {
    const root = tree({ ...versionTree(), VERSION: "v2\n" });
    const before = snapshot(root);
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /not a SemVer 2\.0\.0 version/);
    assert.deepEqual(snapshot(root), before);
  });

  it("exits 2 on a missing VERSION, as JSON too", () => {
    const root = tree({});
    const result = callMain(main, ["--root", root, "--json"]);
    assert.equal(result.code, 2);
    assert.match(JSON.parse(result.stdout).error, /VERSION not found/);
  });

  it("writes nothing when any manifest cannot be parsed", () => {
    const root = tree(versionTree());
    writeFiles(root, { "packages/eslint-config/package.json": '{ "name": "x", }\n' });
    const before = snapshot(root);
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 2);
    assert.match(
      result.stderr,
      /^VERSION-JSON packages\/eslint-config\/package\.json:\d+ not valid JSON/m,
    );
    assert.match(result.stderr, /nothing was written/);
    assert.deepEqual(snapshot(root), before);
  });

  it("warns about policy findings but still stamps", () => {
    const root = tree({
      VERSION: `${NEW}\n`,
      [MARKETPLACE]: {
        name: "cross-stack-standard",
        metadata: { version: OLD },
        plugins: [
          { name: "cross-stack-standard", source: "./plugins/cross-stack-standard", version: OLD },
        ],
      },
      "packages/laravel/composer.json": { name: "o6b7/cross-stack-standard-laravel", version: OLD },
    });
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 0);
    assert.match(result.stderr, /warning: VERSION-ENTRY \.claude-plugin\/marketplace\.json:\d+ /);
    assert.match(result.stderr, /warning: VERSION-COMPOSER packages\/laravel\/composer\.json:3 /);
    assert.match(result.stdout, /2 warning\(s\)/);
    const marketplace = readJson(root, MARKETPLACE);
    assert.equal(marketplace.metadata.version, NEW);
    assert.equal(marketplace.plugins[0].version, OLD, "the entry version is never written");
    assert.equal(
      readJson(root, "packages/laravel/composer.json").version,
      OLD,
      "composer.json is never written",
    );
  });

  it("rejects unknown options and positionals with exit 2", () => {
    assert.equal(callMain(main, ["--nope"]).code, 2);
    assert.equal(callMain(main, ["extra"]).code, 2);
    const missingRoot = callMain(main, ["--root", "/definitely/not/here"]);
    assert.equal(missingRoot.code, 2);
    assert.match(missingRoot.stderr, /is not a directory/);
  });
});

describe("stamp-version: CLI", () => {
  it("prints help", () => {
    const result = run(SCRIPTS.stamp, ["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^Usage: node scripts\/stamp-version\.mjs/);
  });

  it("runs as a process and sets the exit code", () => {
    const root = tree(versionTree());
    const dry = run(SCRIPTS.stamp, ["--root", root, "--dry-run"]);
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, /would be written/);
    const bad = run(SCRIPTS.stamp, ["--bogus"]);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /Usage:/);
  });

  it("formats changes", () => {
    assert.equal(
      formatChange({
        file: "a.json",
        line: 2,
        location: "version",
        from: null,
        to: "1.0.0",
        action: "insert",
      }),
      'VERSION-STAMP a.json:2 version: (missing) -> "1.0.0"',
    );
  });
});
