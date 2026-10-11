import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  IDENTITY,
  checkIdentity,
  copyrightHolders,
  hasCatchAllOwner,
  main,
  markdownSection,
  normalizeRepositoryUrl,
  parsePerson,
  personMismatches,
} from "../../../scripts/check-identity.mjs";
import {
  SCRIPTS,
  callMain,
  makeTree,
  read,
  readJson,
  removeTree,
  run,
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
const AUTHOR = Object.freeze({
  name: "Qusai Abdullah",
  email: "qusaii.abdullah@gmail.com",
  url: "https://github.com/o6b7",
});

const README = `# Cross-Stack Standard

Gates, not guidelines.

\`\`\`md
## Author
nobody
\`\`\`

## Contributing

See CONTRIBUTING.md.

## Author

Qusai Abdullah, GitHub [@o6b7](https://github.com/o6b7),
[LinkedIn](https://www.linkedin.com/in/qusaiabdullah/), qusaii.abdullah@gmail.com.

### Thanks

Everyone.

## License

MIT
`;

const KIT_FILE = `// cross-stack-standard v1.2.3
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Qusai Abdullah
export {};
`;

const LICENSE = `MIT License

Copyright (c) 2026 Qusai Abdullah

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
`;

/** A tree in which every identity location is present and correct. */
function identityFiles() {
  return {
    [PLUGIN_JSON]: {
      name: "cross-stack-standard",
      version: "1.0.0",
      author: { ...AUTHOR },
      repository: "https://github.com/o6b7/cross-stack-standard",
    },
    [MARKETPLACE]: {
      name: "cross-stack-standard",
      owner: { ...AUTHOR },
      metadata: { version: "1.0.0" },
      plugins: [
        {
          name: "cross-stack-standard",
          source: "./plugins/cross-stack-standard",
          author: { ...AUTHOR },
          repository: "https://github.com/o6b7/cross-stack-standard",
        },
      ],
    },
    "package.json": {
      name: "cross-stack-standard-repo",
      author: "Qusai Abdullah <qusaii.abdullah@gmail.com> (https://github.com/o6b7)",
    },
    "packages/eslint-config/package.json": {
      name: "@cross-stack-standard/eslint-config",
      author: { ...AUTHOR },
      repository: {
        type: "git",
        url: "git+https://github.com/o6b7/cross-stack-standard.git",
        directory: "packages/eslint-config",
      },
    },
    "packages/eslint-config/LICENSE": LICENSE,
    "packages/laravel/LICENSE": LICENSE,
    "plugins/cross-stack-standard/templates/shared/cross-stack/bin/tool.mjs": KIT_FILE,
    "packages/laravel/composer.json": {
      name: "o6b7/cross-stack-standard-laravel",
      authors: [
        { name: AUTHOR.name, email: AUTHOR.email, homepage: AUTHOR.url, role: "Developer" },
      ],
    },
    LICENSE,
    "plugins/cross-stack-standard/LICENSE": LICENSE,
    "README.md": README,
    "SECURITY.md": "# Security\n\nReport privately to qusaii.abdullah@gmail.com.\n",
    "CODE_OF_CONDUCT.md": "# Code of Conduct\n\nContact: Qusaii.Abdullah@gmail.com\n",
    ".github/CODEOWNERS": "# Default owner\n* @o6b7\n/registry/ @o6b7\n",
  };
}

const validTree = () => tree(identityFiles());

function editJson(root, rel, edit) {
  const value = readJson(root, rel);
  edit(value);
  writeFiles(root, { [rel]: value });
}

const summary = (findings) => findings.map((f) => `${f.id} ${f.file}:${f.line} ${f.message}`);

describe("check-identity: helpers", () => {
  it("parses npm person strings and objects", () => {
    assert.deepEqual(
      parsePerson("Qusai Abdullah <qusaii.abdullah@gmail.com> (https://github.com/o6b7)"),
      AUTHOR,
    );
    assert.deepEqual(parsePerson("Qusai Abdullah"), {
      name: "Qusai Abdullah",
      email: undefined,
      url: undefined,
    });
    assert.deepEqual(parsePerson({ name: "A", email: "b", homepage: "c" }), {
      name: "A",
      email: "b",
      url: "c",
    });
    assert.equal(parsePerson(42), null);
    assert.equal(parsePerson(["x"]), null);
  });

  it("compares a person with the author, tolerating a trailing slash and email case", () => {
    assert.deepEqual(
      personMismatches({
        ...AUTHOR,
        url: "https://github.com/o6b7/",
        email: "QUSAII.abdullah@gmail.com",
      }),
      [],
    );
    assert.deepEqual(personMismatches({ name: "Someone" }, "homepage"), [
      'name is "Someone"; expected "Qusai Abdullah"',
      'email is missing; expected "qusaii.abdullah@gmail.com"',
      'homepage is missing; expected "https://github.com/o6b7"',
    ]);
    assert.equal(
      personMismatches({ ...AUTHOR, url: "https://github.com/o6b7/cross-stack-standard" }).length,
      1,
    );
  });

  it("normalises repository references", () => {
    const expected = IDENTITY.repositoryUrl;
    for (const value of [
      "https://github.com/o6b7/cross-stack-standard",
      "https://github.com/o6b7/cross-stack-standard/",
      "https://github.com/o6b7/cross-stack-standard.git",
      "git+https://github.com/o6b7/cross-stack-standard.git",
      "git@github.com:o6b7/cross-stack-standard.git",
      "ssh://git@github.com/o6b7/cross-stack-standard.git",
      "git://github.com/o6b7/cross-stack-standard.git",
      "github:o6b7/cross-stack-standard",
      "o6b7/cross-stack-standard",
      {
        type: "git",
        url: "git+https://github.com/o6b7/cross-stack-standard.git",
        directory: "packages/x",
      },
    ]) {
      assert.equal(normalizeRepositoryUrl(value), expected, JSON.stringify(value));
    }
    assert.equal(
      normalizeRepositoryUrl("https://github.com/someone/fork"),
      "https://github.com/someone/fork",
    );
    assert.equal(normalizeRepositoryUrl(""), null);
    assert.equal(normalizeRepositoryUrl({}), null);
  });

  it("finds copyright holders without matching license prose", () => {
    const text = [
      "Copyright (c) 2026 Qusai Abdullah",
      "Copyright 2025-2026 Someone Else.",
      "Copyright © 2024, 2026 Third Party",
      "copyright notice and this permission notice shall be included",
      "The above copyright notice",
    ].join("\n");
    assert.deepEqual(copyrightHolders(text), [
      { line: 1, holder: "Qusai Abdullah" },
      { line: 2, holder: "Someone Else" },
      { line: 3, holder: "Third Party" },
    ]);
  });

  it("extracts Markdown sections, ignoring fenced headings", () => {
    const section = markdownSection(README, /^authors?$/i);
    assert.equal(section.line, 14);
    assert.match(section.body, /LinkedIn/);
    assert.match(section.body, /### Thanks/, "deeper headings stay in the section");
    assert.doesNotMatch(section.body, /## License/);
    assert.equal(markdownSection("```\n# Author\n```\n", /^author$/i), null);
    assert.equal(markdownSection("## Author ##\nbody\n", /^author$/i).body, "body\n");
  });

  it("detects the catch-all owner line", () => {
    assert.equal(hasCatchAllOwner("* @o6b7\n", "o6b7"), true);
    assert.equal(hasCatchAllOwner("*\t@someone   @O6B7 # comment\n", "o6b7"), true);
    assert.equal(hasCatchAllOwner("# * @o6b7\n", "o6b7"), false);
    assert.equal(hasCatchAllOwner("* @someone\n/docs/ @o6b7\n", "o6b7"), false);
    assert.equal(hasCatchAllOwner("*.js @o6b7\n", "o6b7"), false);
    assert.equal(hasCatchAllOwner("* @o6b7x\n", "o6b7"), false);
  });
});

describe("check-identity: complete trees", () => {
  it("passes a correct tree in both modes", () => {
    const root = validTree();
    for (const release of [false, true]) {
      const result = checkIdentity(root, { release });
      assert.deepEqual(summary(result.findings), [], `release=${release}`);
      assert.equal(result.ok, true);
    }
    const result = checkIdentity(root);
    assert.deepEqual(result.checked, [
      PLUGIN_JSON,
      MARKETPLACE,
      "package.json",
      "LICENSE",
      "plugins/cross-stack-standard/LICENSE",
      "packages/eslint-config/package.json",
      "packages/eslint-config/LICENSE",
      "packages/laravel/composer.json",
      "packages/laravel/LICENSE",
      "plugins/cross-stack-standard/templates/shared/cross-stack/bin/tool.mjs",
      "README.md",
      "SECURITY.md",
      "CODE_OF_CONDUCT.md",
      ".github/CODEOWNERS",
    ]);
  });

  it("skips missing files outside release mode", () => {
    const result = checkIdentity(tree({}));
    assert.equal(result.ok, true);
    assert.deepEqual(result.checked, []);
  });

  it("requires every identity file in release mode", () => {
    const result = checkIdentity(tree({ "packages/empty/README.md": "x" }), { release: true });
    assert.deepEqual(
      result.findings.map((f) => `${f.id} ${f.file}`),
      [
        `IDENTITY-MISSING ${PLUGIN_JSON}`,
        `IDENTITY-MISSING ${MARKETPLACE}`,
        "IDENTITY-MISSING package.json",
        "IDENTITY-MISSING LICENSE",
        "IDENTITY-MISSING plugins/cross-stack-standard/LICENSE",
        "IDENTITY-MISSING packages/empty",
        "IDENTITY-MISSING packages/empty/LICENSE",
        "IDENTITY-MISSING packages/*/composer.json",
        "IDENTITY-MISSING README.md",
        "IDENTITY-MISSING SECURITY.md",
        "IDENTITY-MISSING CODE_OF_CONDUCT.md",
        "IDENTITY-MISSING .github/CODEOWNERS",
      ],
    );
    const noPackages = checkIdentity(tree({}), { release: true });
    assert.ok(
      noPackages.findings.some((f) => f.file === "packages" && /no gate packages/.test(f.message)),
    );
  });
});

describe("check-identity: detects each wrong value", () => {
  /** @type {[string, (root: string) => void, string][]} */
  const cases = [
    [
      "plugin.json author email",
      (r) => editJson(r, PLUGIN_JSON, (p) => (p.author.email = "someone@example.com")),
      `IDENTITY-AUTHOR ${PLUGIN_JSON}:4 author email is "someone@example.com"; expected "qusaii.abdullah@gmail.com"`,
    ],
    [
      "plugin.json author missing",
      (r) => editJson(r, PLUGIN_JSON, (p) => delete p.author),
      `IDENTITY-AUTHOR ${PLUGIN_JSON}:0 author is missing; expected { name, email, url } of Qusai Abdullah`,
    ],
    [
      "plugin.json author as a string",
      (r) => editJson(r, PLUGIN_JSON, (p) => (p.author = "Qusai Abdullah")),
      `IDENTITY-AUTHOR ${PLUGIN_JSON}:4 author must be an object with name, email and url`,
    ],
    [
      "plugin.json name",
      (r) => editJson(r, PLUGIN_JSON, (p) => (p.name = "standard")),
      `IDENTITY-NAME ${PLUGIN_JSON}:2 name is "standard"; expected "cross-stack-standard"`,
    ],
    [
      "plugin.json repository",
      (r) => editJson(r, PLUGIN_JSON, (p) => (p.repository = "https://github.com/someone/fork")),
      `IDENTITY-REPOSITORY ${PLUGIN_JSON}:9 repository points at "https://github.com/someone/fork"; expected "https://github.com/o6b7/cross-stack-standard"`,
    ],
    [
      "marketplace owner url",
      (r) => editJson(r, MARKETPLACE, (m) => (m.owner.url = "https://example.com")),
      `IDENTITY-AUTHOR ${MARKETPLACE}:3 owner url is "https://example.com"; expected "https://github.com/o6b7"`,
    ],
    [
      "marketplace owner missing",
      (r) => editJson(r, MARKETPLACE, (m) => delete m.owner),
      `IDENTITY-AUTHOR ${MARKETPLACE}:0 owner is missing; expected { name, email, url } of Qusai Abdullah`,
    ],
    [
      "marketplace entry author",
      (r) => editJson(r, MARKETPLACE, (m) => (m.plugins[0].author.name = "Someone")),
      `IDENTITY-AUTHOR ${MARKETPLACE}:15 plugins[0].author name is "Someone"; expected "Qusai Abdullah"`,
    ],
    [
      "marketplace entry repository",
      (r) => editJson(r, MARKETPLACE, (m) => (m.plugins[0].repository = "x/y")),
      `IDENTITY-REPOSITORY ${MARKETPLACE}:20 plugins[0].repository points at "https://github.com/x/y"; expected "https://github.com/o6b7/cross-stack-standard"`,
    ],
    [
      "marketplace entry missing",
      (r) => editJson(r, MARKETPLACE, (m) => (m.plugins[0].name = "other")),
      `IDENTITY-NAME ${MARKETPLACE}:11 plugins has no entry named "cross-stack-standard"`,
    ],
    [
      "marketplace name",
      (r) => editJson(r, MARKETPLACE, (m) => (m.name = "tools")),
      `IDENTITY-NAME ${MARKETPLACE}:2 name is "tools"; expected "cross-stack-standard"`,
    ],
    [
      "root package author",
      (r) =>
        editJson(
          r,
          "package.json",
          (p) => (p.author = "Qusai Abdullah <other@example.com> (https://github.com/o6b7)"),
        ),
      'IDENTITY-AUTHOR package.json:3 author email is "other@example.com"; expected "qusaii.abdullah@gmail.com"',
    ],
    [
      "root package author missing",
      (r) => editJson(r, "package.json", (p) => delete p.author),
      'IDENTITY-AUTHOR package.json:0 author is missing; expected "Qusai Abdullah <qusaii.abdullah@gmail.com> (https://github.com/o6b7)"',
    ],
    [
      "package author not a person",
      (r) => editJson(r, "packages/eslint-config/package.json", (p) => (p.author = 7)),
      "IDENTITY-AUTHOR packages/eslint-config/package.json:3 author must be a string or an object",
    ],
    [
      "package scope",
      (r) =>
        editJson(r, "packages/eslint-config/package.json", (p) => (p.name = "eslint-config-cross")),
      'IDENTITY-NAME packages/eslint-config/package.json:2 name is "eslint-config-cross"; expected the @cross-stack-standard/* scope',
    ],
    [
      "package repository",
      (r) =>
        editJson(
          r,
          "packages/eslint-config/package.json",
          (p) => (p.repository.url = "git+https://github.com/someone/cross-stack-standard.git"),
        ),
      'IDENTITY-REPOSITORY packages/eslint-config/package.json:8 repository points at "https://github.com/someone/cross-stack-standard"; expected "https://github.com/o6b7/cross-stack-standard"',
    ],
    [
      "composer vendor",
      (r) =>
        editJson(
          r,
          "packages/laravel/composer.json",
          (c) => (c.name = "acme/cross-stack-standard-laravel"),
        ),
      'IDENTITY-NAME packages/laravel/composer.json:2 name is "acme/cross-stack-standard-laravel"; expected the o6b7/* vendor',
    ],
    [
      "composer author missing",
      (r) =>
        editJson(r, "packages/laravel/composer.json", (c) => (c.authors = [{ name: "Someone" }])),
      'IDENTITY-AUTHOR packages/laravel/composer.json:3 authors does not list "Qusai Abdullah" (with email and homepage)',
    ],
    [
      "composer authors absent",
      (r) => editJson(r, "packages/laravel/composer.json", (c) => delete c.authors),
      'IDENTITY-AUTHOR packages/laravel/composer.json:0 authors does not list "Qusai Abdullah" (with email and homepage)',
    ],
    [
      "composer author homepage",
      (r) =>
        editJson(
          r,
          "packages/laravel/composer.json",
          (c) => (c.authors[0].homepage = "https://example.com"),
        ),
      'IDENTITY-AUTHOR packages/laravel/composer.json:4 authors[0] homepage is "https://example.com"; expected "https://github.com/o6b7"',
    ],
    [
      "LICENSE holder",
      (r) => writeFiles(r, { LICENSE: LICENSE.replace("Qusai Abdullah", "Some Company Ltd") }),
      'IDENTITY-LICENSE LICENSE:3 copyright holder is "Some Company Ltd"; expected "Qusai Abdullah"',
      { copy: true },
    ],
    [
      "LICENSE without copyright",
      (r) => writeFiles(r, { LICENSE: "MIT License\n\nPermission is hereby granted.\n" }),
      'IDENTITY-LICENSE LICENSE:0 no copyright line; expected "Copyright (c) <year> Qusai Abdullah"',
      { copy: true },
    ],
    [
      "plugin LICENSE differs from the root LICENSE",
      (r) =>
        writeFiles(r, {
          "plugins/cross-stack-standard/LICENSE": LICENSE.replace("MIT License", "MIT"),
        }),
      "IDENTITY-LICENSE plugins/cross-stack-standard/LICENSE:0 differs from LICENSE; run node scripts/build-plugin-data.mjs",
    ],
    [
      "package LICENSE holder",
      (r) => writeFiles(r, { "packages/eslint-config/LICENSE": "Copyright 2026 Someone\n" }),
      'IDENTITY-LICENSE packages/eslint-config/LICENSE:1 copyright holder is "Someone"; expected "Qusai Abdullah"',
    ],
    [
      "README without Author",
      (r) => writeFiles(r, { "README.md": "# Title\n\n## License\n\nMIT\n" }),
      'IDENTITY-README README.md:0 no "Author" section (name, GitHub, LinkedIn, email)',
    ],
    [
      "README Author only in a code block",
      (r) => writeFiles(r, { "README.md": "# T\n\n```\n## Author\nQusai Abdullah\n```\n" }),
      'IDENTITY-README README.md:0 no "Author" section (name, GitHub, LinkedIn, email)',
    ],
    [
      "README Author without LinkedIn",
      (r) =>
        writeFiles(r, {
          "README.md": README.replace(
            "[LinkedIn](https://www.linkedin.com/in/qusaiabdullah/), ",
            "",
          ),
        }),
      "IDENTITY-README README.md:14 Author section is missing the LinkedIn link",
    ],
    [
      "README Author with only the repository link",
      (r) =>
        writeFiles(r, {
          "README.md": README.replace(
            "(https://github.com/o6b7)",
            "(https://github.com/o6b7/cross-stack-standard)",
          ),
        }),
      "IDENTITY-README README.md:14 Author section is missing the GitHub profile link",
    ],
    [
      "README Author details outside the section",
      (r) =>
        writeFiles(r, {
          "README.md": README.replace("qusaii.abdullah@gmail.com.", "").replace(
            "MIT\n",
            "MIT qusaii.abdullah@gmail.com\n",
          ),
        }),
      "IDENTITY-README README.md:14 Author section is missing the email address",
    ],
    [
      "SECURITY contact",
      (r) => writeFiles(r, { "SECURITY.md": "# Security\n\nOpen an issue.\n" }),
      "IDENTITY-CONTACT SECURITY.md:0 does not give the contact email qusaii.abdullah@gmail.com",
    ],
    [
      "CODE_OF_CONDUCT contact",
      (r) => writeFiles(r, { "CODE_OF_CONDUCT.md": "# Code of Conduct\n" }),
      "IDENTITY-CONTACT CODE_OF_CONDUCT.md:0 does not give the contact email qusaii.abdullah@gmail.com",
    ],
    [
      "CODEOWNERS catch-all",
      (r) => writeFiles(r, { ".github/CODEOWNERS": "# * @o6b7\n/registry/ @o6b7\n" }),
      'IDENTITY-CODEOWNERS .github/CODEOWNERS:0 no catch-all line "* @o6b7"',
    ],
    [
      "invalid manifest JSON",
      (r) => writeFiles(r, { [PLUGIN_JSON]: '{\n  "name": "cross-stack-standard",\n}\n' }),
      null,
    ],
  ];

  for (const [name, mutate, expected, { copy = false } = {}] of cases) {
    it(name, () => {
      const root = validTree();
      mutate(root);
      // A root LICENSE change regenerates the plugin copy (build-plugin-data); mirror it here so
      // the case reports only its own finding.
      if (copy) {
        fs.copyFileSync(
          path.join(root, "LICENSE"),
          path.join(root, "plugins", "cross-stack-standard", "LICENSE"),
        );
      }
      const result = checkIdentity(root);
      assert.equal(result.ok, false);
      if (expected === null) {
        assert.equal(result.findings.length, 1);
        assert.equal(result.findings[0].id, "IDENTITY-JSON");
        assert.equal(result.findings[0].file, PLUGIN_JSON);
        assert.match(result.findings[0].message, /^not valid JSON/);
        return;
      }
      assert.deepEqual(summary(result.findings), [expected]);
    });
  }

  it("requires the MIT notice in the header of every versioned kit template file", () => {
    const root = validTree();
    const kit = "plugins/cross-stack-standard/templates";
    writeFiles(root, {
      [`${kit}/laravel/pint.json.md`]: "<!-- cross-stack-standard v1.2.3 -->\n# Pint\n",
      [`${kit}/web/eslint.config.mjs`]:
        "// cross-stack-standard v1.2.3\n// SPDX-License-Identifier: MIT\n// Copyright (c) 2026 Someone Else\n",
      [`${kit}/web/notes.txt`]: "No version header, so not a stamped kit file.\n",
      [`${kit}/web/vendor/pkg/index.js`]: "// cross-stack-standard v1.2.3\n",
      [`${kit}/shared/lefthook.yml`]:
        "# cross-stack-standard v1.2.3\n# SPDX-License-Identifier: MIT\n# Copyright (c) 2026 Qusai Abdullah\n",
    });
    assert.deepEqual(summary(checkIdentity(root).findings), [
      `IDENTITY-NOTICE ${kit}/laravel/pint.json.md:1 header has no "SPDX-License-Identifier: MIT" line`,
      `IDENTITY-NOTICE ${kit}/laravel/pint.json.md:1 header has no "Copyright (c) <year> Qusai Abdullah" line`,
      `IDENTITY-NOTICE ${kit}/web/eslint.config.mjs:1 header has no "Copyright (c) <year> Qusai Abdullah" line`,
    ]);
  });

  it("checks the plugin LICENSE's own holder when there is no root LICENSE", () => {
    const root = validTree();
    fs.rmSync(path.join(root, "LICENSE"));
    writeFiles(root, {
      "plugins/cross-stack-standard/LICENSE": LICENSE.replace("Qusai Abdullah", "Someone Else"),
    });
    assert.deepEqual(summary(checkIdentity(root).findings), [
      'IDENTITY-LICENSE plugins/cross-stack-standard/LICENSE:3 copyright holder is "Someone Else"; expected "Qusai Abdullah"',
    ]);
  });

  it("requires a manifest in every package directory only in release mode", () => {
    const root = validTree();
    fs.mkdirSync(path.join(root, "packages", "vitest-arch"), { recursive: true });
    assert.equal(checkIdentity(root).ok, true);
    assert.deepEqual(summary(checkIdentity(root, { release: true }).findings), [
      "IDENTITY-MISSING packages/vitest-arch:0 has no package.json or composer.json",
      "IDENTITY-MISSING packages/vitest-arch/LICENSE:0 required for a release but not found",
    ]);
  });

  it("does not treat template or dependency manifests as the project's own", () => {
    const root = validTree();
    writeFiles(root, {
      "plugins/cross-stack-standard/templates/web/package.json": { name: "app", author: "Adopter" },
      "packages/laravel/vendor/acme/lib/composer.json": { name: "acme/lib", authors: [] },
      "packages/eslint-config/node_modules/dep/package.json": { name: "dep", author: "Other" },
    });
    assert.equal(checkIdentity(root).ok, true);
  });
});

describe("check-identity: CLI", () => {
  it("prints findings, a summary and exit code 1", () => {
    const root = validTree();
    writeFiles(root, { "SECURITY.md": "nothing\n" });
    const result = callMain(main, ["--root", root]);
    assert.equal(result.code, 1);
    assert.equal(
      result.stdout,
      "IDENTITY-CONTACT SECURITY.md:0 does not give the contact email qusaii.abdullah@gmail.com\n" +
        "check-identity: 14 file(s) checked, 1 finding(s)\n",
    );
  });

  it("prints a JSON report and labels release mode", () => {
    const root = validTree();
    const json = JSON.parse(callMain(main, ["--root", root, "--json", "--release"]).stdout);
    assert.deepEqual(Object.keys(json), ["ok", "release", "checked", "findings"]);
    assert.equal(json.ok, true);
    assert.equal(json.release, true);
    assert.match(callMain(main, ["--root", root, "--release"]).stdout, /\(release mode\)\n$/);
  });

  it("runs as a process with the documented exit codes", () => {
    const root = validTree();
    assert.equal(run(SCRIPTS.identity, ["--root", root]).status, 0);
    assert.equal(run(SCRIPTS.identity, ["--root", tree({}), "--release"]).status, 1);
    const usage = run(SCRIPTS.identity, ["--release=yes"]);
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /Usage: node scripts\/check-identity\.mjs/);
    assert.equal(run(SCRIPTS.identity, ["--help"]).status, 0);
  });

  it("reads files with a byte-order mark", () => {
    const root = validTree();
    writeFiles(root, { "SECURITY.md": `\uFEFF${read(root, "SECURITY.md")}` });
    writeFiles(root, { [PLUGIN_JSON]: `\uFEFF${read(root, PLUGIN_JSON)}` });
    assert.equal(checkIdentity(root).ok, true);
  });
});
