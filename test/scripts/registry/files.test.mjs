/**
 * scripts/lib/gate-presence/files.mjs, test-titles.mjs and workflow-steps.mjs: globbing, file
 * discovery, comment stripping, test-title extraction and the workflow step reader.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escapeRegExp,
  globToRegExp,
  lineAt,
  listFiles,
  matchBracket,
  matchesGlob,
  readText,
  stripHashComments,
  stripJsComments,
  stripPhpComments,
  unescapeJs,
  unescapePhp,
  walkFiles,
} from "../../../scripts/lib/gate-presence/files.mjs";
import {
  findJsTestTitles,
  findPestTestTitles,
} from "../../../scripts/lib/gate-presence/test-titles.mjs";
import {
  parseWorkflowSteps,
  yamlScalar,
} from "../../../scripts/lib/gate-presence/workflow-steps.mjs";
import { makeRepo } from "./helpers.mjs";

describe("globToRegExp", () => {
  const cases = [
    [
      "**/*.{test,spec}.?(c|m)[jt]s?(x)",
      ["a.test.ts", "src/a/b.spec.mjs", "x.test.cjs", "b.test.tsx"],
      ["a.test.mts.map", "a.ts", "atest.ts"],
    ],
    [
      "**/__tests__/**/*.[jt]s?(x)",
      ["__tests__/a.js", "src/__tests__/deep/b.tsx"],
      ["src/tests/a.js", "__tests__/a.mjs"],
    ],
    ["**/?(*.)+(spec|test).[jt]s?(x)", ["a.test.js", "test.ts", "x/y.spec.tsx"], ["a.check.js"]],
    [
      "packages/eslint-config/**/rules/*.{js,mjs,cjs}",
      ["packages/eslint-config/rules/a.js", "packages/eslint-config/src/rules/b.mjs"],
      ["packages/eslint-config/src/rules/x/b.js", "packages/other/rules/a.js"],
    ],
    ["docs/**", ["docs/a.md", "docs/x/y/z.md"], ["doc/a.md"]],
    ["a/*.md", ["a/b.md", "a/.hidden.md"], ["a/b/c.md"]],
    ["file.[!j]s", ["file.ts"], ["file.js"]],
    [
      "templates/**/.dependency-cruiser.{js,cjs}",
      ["templates/web/.dependency-cruiser.cjs", "templates/.dependency-cruiser.js"],
      ["templates/web/dependency-cruiser.cjs"],
    ],
    ["literal+(x).md", ["literalx.md", "literalxx.md"], ["literal.md"]],
    ["a.b", ["a.b"], ["axb"]],
  ];
  for (const [glob, matches, misses] of cases) {
    it(`matches ${glob}`, () => {
      for (const candidate of matches) {
        assert.equal(matchesGlob(candidate, glob), true, `${candidate} should match`);
      }
      for (const candidate of misses) {
        assert.equal(matchesGlob(candidate, glob), false, `${candidate} should not match`);
      }
    });
  }

  it("anchors the whole path", () => {
    assert.equal(globToRegExp("*.md").test("dir/a.md"), false);
  });
});

describe("listFiles and walkFiles", () => {
  it("finds matching files, skipping dependency and build directories", () => {
    const repo = makeRepo({ schema: false });
    try {
      repo.write("pkg/src/rules/a.js", "");
      repo.write("pkg/src/rules/b.ts", "");
      repo.write("pkg/node_modules/x/rules/c.js", "");
      repo.write("pkg/vendor/rules/d.js", "");
      repo.write("pkg/dist/rules/e.js", "");
      repo.write("pkg/index.js", "");
      assert.deepEqual(listFiles(repo.root, "pkg/**/rules/*.js"), ["pkg/src/rules/a.js"]);
      assert.deepEqual(listFiles(repo.root, ["pkg/index.js", "pkg/missing.js", "pkg/**/*.ts"]), [
        "pkg/index.js",
        "pkg/src/rules/b.ts",
      ]);
      assert.deepEqual(listFiles(repo.root, "absent/**/*.js"), []);
      assert.deepEqual(walkFiles(`${repo.root}/pkg`), [
        "index.js",
        "src/rules/a.js",
        "src/rules/b.ts",
      ]);
      assert.deepEqual(walkFiles(`${repo.root}/missing`), []);
      assert.equal(readText(`${repo.root}/missing.txt`), null);
    } finally {
      repo.cleanup();
    }
  });
});

describe("comment stripping", () => {
  it("removes JavaScript comments but keeps strings, templates and regexes", () => {
    const source = [
      'const a = "// not a comment"; // gone',
      "/* block",
      "   comment */ const b = `/* kept ${1} */`;",
      "const re = /\\/\\/ kept/g; // gone too",
      "const c = 4 / 2 / 1; // division",
    ].join("\n");
    const stripped = stripJsComments(source);
    assert.equal(stripped.split("\n").length, 5);
    assert.match(stripped, /"\/\/ not a comment"/);
    assert.doesNotMatch(stripped, /gone/);
    assert.doesNotMatch(stripped, /block/);
    assert.match(stripped, /`\/\* kept \$\{1\} \*\/`/);
    assert.match(stripped, /\/\\\/\\\/ kept\/g/);
    assert.match(stripped, /4 \/ 2 \/ 1;/);
    assert.doesNotMatch(stripped, /division/);
  });

  it("removes PHP comments but keeps strings, attributes and heredocs", () => {
    const source = [
      "<?php",
      "// line comment test('hidden')",
      "# hash comment",
      "#[Attribute]",
      "/* test('also hidden') */",
      "$url = 'http://example.test'; // trailing",
      '$s = "a # b";',
      "$h = <<<EOT",
      "  # kept in heredoc",
      "  EOT;",
      "test('visible');",
    ].join("\n");
    const stripped = stripPhpComments(source);
    assert.equal(stripped.split("\n").length, 11);
    assert.doesNotMatch(stripped, /hidden/);
    assert.doesNotMatch(stripped, /hash comment|trailing/);
    assert.match(stripped, /#\[Attribute\]/);
    assert.match(stripped, /'http:\/\/example\.test'/);
    assert.match(stripped, /"a # b"/);
    assert.match(stripped, /# kept in heredoc/);
    assert.match(stripped, /test\('visible'\)/);
  });

  it("removes YAML and NEON hash comments outside quotes", () => {
    const stripped = stripHashComments("a: 1 # note\nb: 'x # y'\n# whole line\nc: d#e");
    assert.equal(stripped, "a: 1       \nb: 'x # y'\n            \nc: d#e");
  });
});

describe("text helpers", () => {
  it("matches brackets across strings", () => {
    const code = 'f(a, "(", [1, { b: ")" }]) + 1';
    assert.equal(code.slice(0, matchBracket(code, 1)), 'f(a, "(", [1, { b: ")" }])');
    assert.equal(matchBracket("f(a", 1), -1);
  });

  it("decodes string escapes", () => {
    assert.equal(unescapeJs("it\\'s \\u0041\\x42\\u{1F600}\\n"), "it's AB\u{1F600}\n");
    assert.equal(unescapePhp("it\\'s \\\\ \\n", "'"), "it's \\ \\n");
    assert.equal(unescapePhp('say \\"hi\\"\\n', '"'), 'say "hi"\n');
  });

  it("computes lines and escapes regex text", () => {
    assert.equal(lineAt("a\nb\nc", 4), 3);
    assert.equal(new RegExp(escapeRegExp("a.b*c/(d)")).test("a.b*c/(d)"), true);
  });
});

describe("findJsTestTitles", () => {
  it("finds literal titles with lines and skip state", () => {
    const source = [
      'import { it, test } from "vitest";',
      'it("plain title", () => {});',
      "test('single \\'quoted\\'', () => {});",
      "it(`template title`, () => {});",
      "it.skip('skipped title', () => {});",
      "test.todo('todo title');",
      "it.concurrent('concurrent title', async () => {});",
      "test.skipIf(process.env.CI)('conditional title', () => {});",
      "test.each([1, 2])('each %s', () => {});",
      "it(`dynamic ${name}`, () => {});",
      "// it('commented title', () => {});",
      "helper.it('member call', () => {});",
      "describe('a suite', () => {});",
    ].join("\n");
    assert.deepEqual(
      findJsTestTitles(source).map(({ title, line, skipped }) => [title, line, skipped]),
      [
        ["plain title", 2, false],
        ["single 'quoted'", 3, false],
        ["template title", 4, false],
        ["skipped title", 5, true],
        ["todo title", 6, true],
        ["concurrent title", 7, false],
        ["conditional title", 8, true],
      ],
    );
  });
});

describe("findPestTestTitles", () => {
  it("finds test, it and arch descriptions with chained skips", () => {
    const source = [
      "<?php",
      "test('BE-001 plain', function () {",
      "    expect(true)->toBeTrue();",
      "});",
      'it("BE-002 double", fn () => true)->group("arch");',
      "arch('BE-003 arch')->expect('App')->toUseStrictTypes();",
      "test('BE-004 skipped', fn () => true)->skip('later');",
      "it('BE-005 todo')->todo();",
      "// test('BE-006 commented', fn () => true);",
      "$this->test('BE-007 method');",
      'test("BE-008 {$interpolated}", fn () => true);',
      "test('BE-009 it\\'s escaped', fn () => true)->skipOnWindows();",
    ].join("\n");
    assert.deepEqual(
      findPestTestTitles(source).map(({ title, line, fn, skipped }) => [title, line, fn, skipped]),
      [
        ["BE-001 plain", 2, "test", false],
        ["BE-002 double", 5, "it", false],
        ["BE-003 arch", 6, "arch", false],
        ["BE-004 skipped", 7, "test", true],
        ["BE-005 todo", 8, "it", true],
        ["BE-009 it's escaped", 12, "test", true],
      ],
    );
  });
});

describe("parseWorkflowSteps", () => {
  it("reads job steps with ids, names, run blocks and actions", () => {
    const workflow = [
      "name: quality",
      "on:",
      "  workflow_call:",
      "jobs:",
      "  quality:",
      "    runs-on: ubuntu-24.04",
      "    steps:",
      "      - name: Check out",
      "        uses: actions/checkout@0000000000000000000000000000000000000000 # v7",
      "      - id: commitlint",
      '        name: "Commit messages"',
      "        run: npx commitlint --from origin/main # lint the range",
      "      - name: Tests",
      "        run: |",
      "          npm ci",
      "          npm test",
      "        env:",
      "          CI: true",
      "  e2e:",
      "    needs: quality",
      "    steps:",
      "    - name: 'axe scan'",
      "      run: >-",
      "        npx playwright test",
      "",
      "    - uses: actions/upload-artifact@0000000000000000000000000000000000000000",
      "other: true",
    ].join("\n");
    const steps = parseWorkflowSteps(workflow).map(({ job, line, id, name, run, uses }) => ({
      job,
      line,
      id,
      name,
      run,
      uses,
    }));
    assert.deepEqual(steps, [
      {
        job: "quality",
        line: 8,
        id: undefined,
        name: "Check out",
        run: undefined,
        uses: "actions/checkout@0000000000000000000000000000000000000000",
      },
      {
        job: "quality",
        line: 10,
        id: "commitlint",
        name: "Commit messages",
        run: "npx commitlint --from origin/main",
        uses: undefined,
      },
      {
        job: "quality",
        line: 13,
        id: undefined,
        name: "Tests",
        run: "npm ci\nnpm test",
        uses: undefined,
      },
      {
        job: "e2e",
        line: 22,
        id: undefined,
        name: "axe scan",
        run: "npx playwright test",
        uses: undefined,
      },
      {
        job: "e2e",
        line: 26,
        id: undefined,
        name: undefined,
        run: undefined,
        uses: "actions/upload-artifact@0000000000000000000000000000000000000000",
      },
    ]);
  });

  it("returns no steps without a jobs map", () => {
    assert.deepEqual(parseWorkflowSteps("name: x\non: push\n"), []);
  });

  it("decodes quoted scalars", () => {
    assert.equal(yamlScalar("'it''s'"), "it's");
    assert.equal(yamlScalar('"a\\tb"'), "a\tb");
    assert.equal(yamlScalar("  plain  "), "plain");
  });
});
