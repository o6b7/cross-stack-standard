import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  HEADER_MAX_LINES,
  VersionFileError,
  collectTargets,
  findVersionMarkers,
  formatKeyPath,
  isSemver,
  lineIndex,
  memberLine,
  parseJsonSpans,
  planVersionStamp,
  readTextFile,
  readVersionFile,
  replaceVersionMarkers,
  stampJson,
  walkFiles,
} from "../../../scripts/lib/versioning.mjs";
import { NEW, OLD, makeTree, removeTree, versionTree, writeFiles } from "./helpers.mjs";

const trees = [];
const tree = (files) => {
  const root = makeTree(files);
  trees.push(root);
  return root;
};
after(() => trees.forEach(removeTree));

describe("isSemver", () => {
  it("accepts SemVer 2.0.0 versions", () => {
    for (const v of [
      "0.0.0",
      "1.2.3",
      "10.20.30",
      "1.0.0-rc.1",
      "1.0.0-alpha.beta+exp.sha.5114f85",
      "0.0.0-fixture.1",
    ]) {
      assert.equal(isSemver(v), true, v);
    }
  });
  it("rejects everything else", () => {
    for (const v of [
      "",
      "1",
      "1.2",
      "v1.2.3",
      "01.2.3",
      "1.02.3",
      "1.2.3-",
      "1.2.3-01",
      "1.2.3 ",
      " 1.2.3",
      null,
      123,
    ]) {
      assert.equal(isSemver(v), false, String(v));
    }
  });
});

describe("readVersionFile", () => {
  it("reads and trims the version", () => {
    assert.equal(readVersionFile(tree({ VERSION: "1.2.3\n" })), "1.2.3");
    assert.equal(readVersionFile(tree({ VERSION: "\uFEFF2.0.0-rc.1\r\n" })), "2.0.0-rc.1");
  });
  it("fails clearly on a missing, empty, multi-line or invalid file", () => {
    assert.throws(
      () => readVersionFile(tree({})),
      (e) => e instanceof VersionFileError && /not found/.test(e.message),
    );
    assert.throws(() => readVersionFile(tree({ VERSION: "\n" })), /empty/);
    assert.throws(
      () => readVersionFile(tree({ VERSION: "1.0.0\n2.0.0\n" })),
      /one version on one line/,
    );
    assert.throws(() => readVersionFile(tree({ VERSION: "v1.0.0\n" })), /without the leading "v"/);
    assert.throws(
      () => readVersionFile(tree({ VERSION: "1.0\n" })),
      /not a SemVer 2\.0\.0 version/,
    );
  });
});

describe("lineIndex and memberLine", () => {
  it("maps offsets to 1-based lines", () => {
    const lineOf = lineIndex("a\nbc\n\nd");
    assert.deepEqual([0, 1, 2, 4, 5, 6].map(lineOf), [1, 1, 2, 2, 3, 4]);
  });
  it("finds member and array item lines", () => {
    const text = '{\n  "a": 1,\n  "list": [\n    { "version": "x" }\n  ]\n}\n';
    assert.equal(memberLine(text, ["a"]), 2);
    assert.equal(memberLine(text, ["list", "0", "version"]), 4);
    assert.equal(memberLine(text, ["missing"]), 0);
    assert.equal(memberLine("not json", ["a"]), 0);
  });
});

describe("parseJsonSpans", () => {
  it("records spans for nested values, escapes and literals", () => {
    const text = '{"a\\"b": [1, true, null, "x\\u0041"], "o": {"k": -1.5e3}}';
    const node = parseJsonSpans(text);
    assert.equal(node.type, "object");
    assert.deepEqual(
      node.members.map((m) => m.key),
      ['a"b', "o"],
    );
    const array = node.members[0].value;
    assert.deepEqual(
      array.items.map((i) => i.value),
      [1, true, null, "xA"],
    );
    const inner = node.members[1].value.members[0].value;
    assert.equal(text.slice(inner.start, inner.end), "-1.5e3");
  });
  it("renders key paths", () => {
    assert.equal(formatKeyPath(["metadata", "version"]), "metadata.version");
    assert.equal(formatKeyPath(["packages", "", "version"]), 'packages[""].version');
    assert.equal(
      formatKeyPath(["devDependencies", "@cross-stack-standard/x"]),
      'devDependencies["@cross-stack-standard/x"]',
    );
  });
});

describe("stampJson", () => {
  const set = (keys, mode = "upsert", value = NEW) => ({ keys, value, mode });

  it("replaces a value in place and keeps every other byte", () => {
    const text = '{\n  "name": "x",\n  "version": "1.0.0",\n  "keywords": ["a", "b"]\n}\n';
    const { text: out, results } = stampJson(text, [set(["version"])]);
    assert.equal(out, text.replace('"1.0.0"', `"${NEW}"`));
    assert.deepEqual(
      results.map(({ action, from, line }) => ({ action, from, line })),
      [{ action: "set", from: "1.0.0", line: 3 }],
    );
  });

  it("reports an equal value as unchanged and leaves the text identical", () => {
    const text = `{ "version": "${NEW}" }`;
    const { text: out, results } = stampJson(text, [set(["version"])]);
    assert.equal(out, text);
    assert.equal(results[0].action, "none");
  });

  it("replaces a non-string value with the string version", () => {
    const { text: out, results } = stampJson('{"version": 1}', [set(["version"])]);
    assert.deepEqual(JSON.parse(out), { version: NEW });
    assert.equal(results[0].from, "1");
  });

  it("inserts a missing version after name with the file's indentation", () => {
    const text = '{\n    "name": "x",\n    "description": "d"\n}\n';
    const { text: out, results } = stampJson(text, [set(["version"])]);
    assert.equal(out, `{\n    "name": "x",\n    "version": "${NEW}",\n    "description": "d"\n}\n`);
    assert.equal(results[0].action, "insert");
  });

  it("inserts as the first member when no anchor exists, with tabs and CRLF", () => {
    const text = '{\r\n\t"private": true\r\n}\r\n';
    const { text: out } = stampJson(text, [set(["version"])]);
    assert.equal(out, `{\r\n\t"version": "${NEW}",\r\n\t"private": true\r\n}\r\n`);
  });

  it("inserts after the last member when it is the anchor", () => {
    const { text: out } = stampJson('{\n  "a": 1,\n  "name": "x"\n}', [set(["version"])]);
    assert.equal(out, `{\n  "a": 1,\n  "name": "x",\n  "version": "${NEW}"\n}`);
  });

  it("creates a missing parent object with nested indentation", () => {
    const text = '{\n  "name": "m",\n  "owner": { "name": "o" },\n  "plugins": []\n}\n';
    const { text: out } = stampJson(text, [set(["metadata", "version"])]);
    assert.equal(
      out,
      `{\n  "name": "m",\n  "owner": { "name": "o" },\n  "metadata": {\n    "version": "${NEW}"\n  },\n  "plugins": []\n}\n`,
    );
  });

  it("inserts version after the metadata description", () => {
    const text = '{\n  "metadata": {\n    "description": "d"\n  }\n}\n';
    const { text: out } = stampJson(text, [set(["metadata", "version"])]);
    assert.equal(
      out,
      `{\n  "metadata": {\n    "description": "d",\n    "version": "${NEW}"\n  }\n}\n`,
    );
  });

  it("fills empty objects in both layouts", () => {
    assert.equal(stampJson("{}", [set(["version"])]).text, `{"version": "${NEW}"}`);
    assert.equal(stampJson("{}\n", [set(["version"])]).text, `{\n  "version": "${NEW}"\n}\n`);
    assert.equal(
      stampJson('{\n  "metadata": {}\n}\n', [set(["metadata", "version"])]).text,
      `{\n  "metadata": {\n    "version": "${NEW}"\n  }\n}\n`,
    );
  });

  it("keeps single-line objects on one line", () => {
    assert.equal(
      stampJson('{"name":"x"}', [set(["version"])]).text,
      `{"name":"x","version":"${NEW}"}`,
    );
    assert.equal(
      stampJson('{ "name": "x", "a": 1 }', [set(["version"])]).text,
      `{ "name": "x", "version": "${NEW}", "a": 1 }`,
    );
    assert.equal(
      stampJson('{ "name": "x" }', [set(["version"])]).text,
      `{ "name": "x", "version": "${NEW}" }`,
    );
  });

  it("preserves a byte-order mark", () => {
    const { text: out } = stampJson('\uFEFF{"version": "1.0.0"}', [set(["version"])]);
    assert.equal(out, `\uFEFF{"version": "${NEW}"}`);
  });

  it("targets the last duplicate key, as JSON.parse does", () => {
    const { text: out } = stampJson('{"version": "a", "version": "b"}', [set(["version"])]);
    assert.equal(JSON.parse(out).version, NEW);
    assert.ok(out.includes('"version": "a"'));
  });

  it("skips absent values in set mode and records them as absent", () => {
    const text = '{"name": "x"}';
    const { text: out, results } = stampJson(text, [
      set(["version"], "set"),
      set(["a", "b"], "set"),
    ]);
    assert.equal(out, text);
    assert.deepEqual(
      results.map((r) => r.action),
      ["absent", "absent"],
    );
  });

  it("applies several edits in one pass", () => {
    const text = '{\n  "name": "x",\n  "deps": { "a": "1.0.0", "b": "1.0.0" }\n}\n';
    const { text: out } = stampJson(text, [
      set(["version"]),
      set(["deps", "a"], "set"),
      set(["deps", "b"], "set", `^${NEW}`),
    ]);
    assert.deepEqual(JSON.parse(out), { name: "x", version: NEW, deps: { a: NEW, b: `^${NEW}` } });
    assert.ok(out.includes(`"deps": { "a": "${NEW}", "b": "^${NEW}" }`));
  });

  it("refuses to descend through a non-object and rejects invalid JSON", () => {
    assert.throws(() => stampJson('{"metadata": "x"}', [set(["metadata", "version"])]), TypeError);
    assert.throws(() => stampJson("[1]", [set(["version"])]), TypeError);
    assert.throws(() => stampJson("{", [set(["version"])]), SyntaxError);
  });
});

describe("findVersionMarkers and replaceVersionMarkers", () => {
  it("finds headers only within the header zone", () => {
    const early = "// cross-stack-standard v1.0.0\n";
    const filler = "x\n".repeat(HEADER_MAX_LINES - 2);
    const lastHeaderLine = `# cross-stack-standard v1.1.0\n`;
    const tooLate = `# cross-stack-standard v1.2.0\n`;
    const text = early + filler + lastHeaderLine + tooLate;
    const markers = findVersionMarkers(text, { headers: true });
    assert.deepEqual(
      markers.map((m) => [m.line, m.from]),
      [
        [1, "1.0.0"],
        [HEADER_MAX_LINES, "1.1.0"],
      ],
    );
  });

  it("respects word boundaries around the header", () => {
    const text = [
      "// cross-stack-standard v1.0.0.", // sentence end: matches
      "// cross-stack-standard v1.0.0-rc.1+b.2", // pre-release and build: matches
      "// my-cross-stack-standard v1.0.0", // different name: no match
      "// cross-stack-standard v1.0.0.4", // four parts: no match
      "// cross-stack-standard v1.0", // two parts: no match
      "// cross-stack-standard vX.Y.Z", // placeholder: no match
      "// @cross-stack-standard/eslint-config v1.0.0", // package name: no match
    ].join("\n");
    const markers = findVersionMarkers(text, { headers: true });
    assert.deepEqual(
      markers.map((m) => [m.line, m.from]),
      [
        [1, "1.0.0"],
        [2, "1.0.0-rc.1+b.2"],
      ],
    );
  });

  it("finds schema URLs anywhere and rewrites only stale markers", () => {
    const base = "https://raw.githubusercontent.com/o6b7/cross-stack-standard";
    const text = `${"\n".repeat(40)}{"$schema": "${base}/v1.0.0/x.json", "b": "${base}/v${NEW}/y.json", "c": "${base}/main/z.json"}`;
    const markers = findVersionMarkers(text, { schemaUrls: true });
    assert.deepEqual(
      markers.map((m) => m.from),
      ["1.0.0", NEW],
    );
    assert.equal(markers[0].line, 41);
    const out = replaceVersionMarkers(text, markers, NEW);
    assert.ok(out.includes(`${base}/v${NEW}/x.json`));
    assert.ok(out.includes(`${base}/main/z.json`));
    assert.equal(out.length, text.length + NEW.length - "1.0.0".length);
  });
});

describe("file helpers", () => {
  it("walks files sorted, skipping configured directories", () => {
    const root = tree({
      "a/z.txt": "",
      "a/b/y.txt": "",
      "a/node_modules/x.txt": "",
      "a/skip/w.txt": "",
    });
    assert.deepEqual(walkFiles(root, "a", { skipDirs: new Set(["node_modules", "skip"]) }), [
      "a/b/y.txt",
      "a/z.txt",
    ]);
    assert.deepEqual(walkFiles(root, "missing"), []);
  });

  it("reads text but refuses binary, non-UTF-8 and oversized files", () => {
    const root = tree({
      "t.txt": "café",
      "b.bin": Buffer.from([0x61, 0x00, 0x62]),
      "l.txt": Buffer.from([0x63, 0x61, 0x66, 0xe9]),
    });
    assert.equal(readTextFile(`${root}/t.txt`), "café");
    assert.equal(readTextFile(`${root}/b.bin`), null);
    assert.equal(readTextFile(`${root}/l.txt`), null);
    assert.equal(readTextFile(`${root}/t.txt`, 2), null);
  });
});

describe("collectTargets", () => {
  it("assigns roles to every location and skips what must not be scanned", () => {
    const root = tree(versionTree());
    const targets = collectTargets(root);
    const roles = (rel) => targets.get(rel);
    assert.deepEqual(roles(".claude-plugin/marketplace.json"), { marketplace: true });
    assert.deepEqual(roles("plugins/cross-stack-standard/.claude-plugin/plugin.json"), {
      pluginManifest: true,
    });
    assert.deepEqual(roles("package.json"), { packageRequired: true });
    assert.deepEqual(roles("package-lock.json"), { lockfile: true });
    assert.deepEqual(roles("packages/eslint-config/package.json"), {
      packageRequired: true,
      headers: true,
    });
    assert.deepEqual(roles("packages/laravel/composer.json"), { composer: true });
    assert.deepEqual(roles("plugins/cross-stack-standard/templates/web/package.json"), {
      headers: true,
      schemaUrls: true,
      packageTemplate: true,
    });
    assert.deepEqual(
      roles(
        "plugins/cross-stack-standard/templates/laravel/vendor/cross-stack-standard-laravel/composer.json",
      ),
      { composer: true },
    );
    assert.deepEqual(roles("schemas/standard.schema.json"), { schemaUrls: true });
    assert.deepEqual(roles("registry/rules.schema.json"), { schemaUrls: true });
    for (const rel of [
      "packages/eslint-config/CHANGELOG.md",
      "packages/eslint-config/test/fixtures/old-header.js",
      "packages/eslint-config/node_modules/dep/index.js",
      "packages/laravel/vendor/acme/lib/composer.json",
      "packages/laravel/vendor/acme/lib/Lib.php",
      "docs/configuration.md",
    ]) {
      assert.equal(targets.has(rel), false, rel);
    }
    const keys = [...targets.keys()];
    assert.deepEqual(keys, [...keys].sort());
  });

  it("returns nothing for an empty tree", () => {
    assert.equal(collectTargets(tree({ VERSION: "1.0.0\n" })).size, 0);
  });
});

describe("planVersionStamp", () => {
  it("plans every change of the full tree without writing", () => {
    const root = tree(versionTree());
    const before = JSON.stringify(versionTree());
    const plan = planVersionStamp(root, NEW);
    assert.equal(plan.version, NEW);
    assert.deepEqual(plan.findings, []);
    const changed = (file, location) =>
      plan.changes.find((c) => c.file === file && c.location === location);
    assert.equal(changed(".claude-plugin/marketplace.json", "metadata.version").from, OLD);
    assert.equal(changed("package-lock.json", 'packages[""].version').to, NEW);
    assert.equal(
      changed("package-lock.json", 'packages["packages/eslint-config"].version').from,
      OLD,
    );
    assert.equal(
      changed(
        "package-lock.json",
        'packages[""].devDependencies["@cross-stack-standard/eslint-config"]',
      ).to,
      NEW,
    );
    assert.equal(
      changed(
        "plugins/cross-stack-standard/templates/web/package.json",
        'devDependencies["@cross-stack-standard/eslint-config"]',
      ).to,
      `^${NEW}`,
    );
    assert.equal(changed("packages/laravel/src/Rule.php", "header").line, 5);
    assert.equal(changed("schemas/standard.schema.json", "schema URL").from, OLD);
    assert.equal(
      plan.changes.some(
        (c) => c.location.includes("left-pad") || c.location.includes("i18n-parity"),
      ),
      false,
    );
    assert.equal(
      plan.changes.some((c) => c.file.endsWith("composer.json")),
      false,
    );
    assert.equal(JSON.stringify(versionTree()), before);
  });

  it("reports policy findings and unreadable manifests", () => {
    const root = tree({
      VERSION: `${NEW}\n`,
      "composer.json": { name: "o6b7/x", version: "1.0.0" },
      ".claude-plugin/marketplace.json": {
        name: "cross-stack-standard",
        metadata: { version: NEW },
        plugins: [
          { name: "other", source: "./plugins/other", version: "9.9.9" },
          { name: "renamed", source: "./plugins/cross-stack-standard/", version: NEW },
        ],
      },
      "plugins/cross-stack-standard/.claude-plugin/plugin.json": "{ not json",
    });
    writeFiles(root, { "packages/a/package.json": Buffer.from([0x7b, 0xff, 0x7d]) });
    const plan = planVersionStamp(root, NEW);
    assert.deepEqual(
      plan.findings.map((f) => [f.id, f.file]),
      [
        ["VERSION-ENTRY", ".claude-plugin/marketplace.json"],
        ["VERSION-COMPOSER", "composer.json"],
        ["VERSION-JSON", "packages/a/package.json"],
        ["VERSION-JSON", "plugins/cross-stack-standard/.claude-plugin/plugin.json"],
      ],
    );
    assert.match(plan.findings[0].message, /plugins\[1\] \("renamed"\)/);
    assert.equal(plan.findings[0].line, 15);
    assert.equal(plan.findings[1].line, 3);
    assert.match(plan.findings[2].message, /not a UTF-8 text file/);
    assert.match(plan.findings[3].message, /not valid JSON/);
    assert.equal(plan.findings[3].line, 1);
  });
});
