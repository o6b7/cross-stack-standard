import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseUnifiedDiff, unquoteGitPath } from "../../../scripts/check-pr.mjs";
import {
  PHRASE,
  TEST_KEY,
  WORD,
  assertNoLeak,
  runScript,
  tempDir,
  writeFiles,
  writeSyntheticDenylist,
} from "./helpers.mjs";

const SCRIPT = "scripts/check-pr.mjs";
const DECISION = ["D10", "19"].join(".");
const [p1, p2] = PHRASE;

// gh is replaced by a stub on PATH; the stub is a POSIX shell script, so these tests need a POSIX
// shell (Windows runs the pure parser tests only).
const posix = process.platform !== "win32";

const STUB = `import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.env.GH_STUB_DIR;
const args = process.argv.slice(2);
appendFileSync(join(dir, "calls.log"), JSON.stringify(args) + "\\n");
if (process.env.GH_STUB_FAIL) {
  process.stderr.write("HTTP 404: Not Found\\n");
  process.exit(1);
}
if (args[0] === "pr" && args[1] === "view") process.stdout.write(readFileSync(join(dir, "view.json"), "utf8"));
else if (args[0] === "pr" && args[1] === "diff") process.stdout.write(readFileSync(join(dir, "diff.txt"), "utf8"));
else process.exit(4);
`;

/**
 * A scratch root with the synthetic denylist and a stub gh serving the given pull request.
 * @param {import("node:test").TestContext} t
 * @param {{ view?: object, diff?: string }} pr
 */
function setup(t, { view = {}, diff = "" } = {}) {
  const root = tempDir(t);
  const { denylist } = writeSyntheticDenylist(root);
  const bin = tempDir(t, "gh-stub-");
  const pull = {
    number: 7,
    title: "feat: add a gate",
    body: "Adds a gate.\n\nA reference implementation of RFC 9457 is linked.",
    headRefName: "feat/add-gate",
    commits: [{ oid: "a".repeat(40), messageHeadline: "feat: add a gate", messageBody: "" }],
    ...view,
  };
  writeFiles(bin, {
    "gh-stub.mjs": STUB,
    gh: `#!/bin/sh\nexec "${process.execPath}" "${join(bin, "gh-stub.mjs")}" "$@"\n`,
    "view.json": JSON.stringify(pull),
    "diff.txt": diff,
  });
  chmodSync(join(bin, "gh"), 0o755);
  const run = (args, env = {}) => {
    const result = runScript(SCRIPT, ["--root", root, "--denylist", denylist, ...args], {
      cwd: root,
      env: { PATH: bin, GH_STUB_DIR: bin, CROSS_STACK_STANDARD_BRAND_KEY: TEST_KEY, ...env },
    });
    assertNoLeak(result.stdout + result.stderr);
    return result;
  };
  const calls = () =>
    existsSync(join(bin, "calls.log"))
      ? readFileSync(join(bin, "calls.log"), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  return { run, calls };
}

const findingLines = (stdout) =>
  stdout.split("\n").filter((line) => /^(BRAND-LEAK|NARRATIVE|BINARY-UNCHECKED) /u.test(line));
const DECISION_MESSAGE = "internal decision marker (D, number, dot, number, in a citation)";

const DIFF = [
  "diff --git a/docs/guide.md b/docs/guide.md",
  "index 1111111..2222222 100644",
  "--- a/docs/guide.md",
  "+++ b/docs/guide.md",
  "@@ -1,3 +1,4 @@",
  " # Guide",
  "-old line",
  "+new line",
  " context",
  `+mentions ${WORD} here`,
  "@@ -20,2 +21,3 @@ section",
  " keep",
  `+decided in ${DECISION}`,
  "\\ No newline at end of file",
  `diff --git a/src/${WORD}.ts b/src/${WORD}.ts`,
  "new file mode 100644",
  "--- /dev/null",
  `+++ b/src/${WORD}.ts`,
  "@@ -0,0 +1 @@",
  "+export {};",
  "",
].join("\n");

describe("parseUnifiedDiff", () => {
  it("collects changed paths and added lines with new-file line numbers", () => {
    assert.deepEqual(parseUnifiedDiff(DIFF), [
      {
        path: "docs/guide.md",
        added: [
          { line: 2, text: "new line" },
          { line: 4, text: `mentions ${WORD} here` },
          { line: 22, text: `decided in ${DECISION}` },
        ],
        binary: false,
      },
      { path: `src/${WORD}.ts`, added: [{ line: 1, text: "export {};" }], binary: false },
    ]);
  });
  it("handles renames, binary files, deletions and paths with spaces", () => {
    const diff = [
      "diff --git a/old name.md b/new name.md",
      "similarity index 100%",
      "rename from old name.md",
      "rename to new name.md",
      "diff --git a/img.png b/img.png",
      "Binary files a/img.png and b/img.png differ",
      "diff --git a/gone.md b/gone.md",
      "deleted file mode 100644",
      "--- a/gone.md",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
    ].join("\n");
    assert.deepEqual(
      parseUnifiedDiff(diff).map((f) => [f.path, f.added.length, f.binary]),
      [
        ["new name.md", 0, false],
        ["img.png", 0, true],
        ["gone.md", 0, false],
      ],
    );
  });
  it("marks binary files from 'Binary files … differ' and 'GIT binary patch'", () => {
    const diff = [
      "diff --git a/assets/logo.png b/assets/logo.png",
      "new file mode 100644",
      "Binary files /dev/null and b/assets/logo.png differ",
      "diff --git a/font.woff2 b/font.woff2",
      "GIT binary patch",
      "literal 12",
      "zcmZ?wbhEHbWME)m",
      "",
    ].join("\n");
    assert.deepEqual(
      parseUnifiedDiff(diff).map((f) => [f.path, f.binary]),
      [
        ["assets/logo.png", true],
        ["font.woff2", true],
      ],
    );
  });
  it("decodes C-quoted paths", () => {
    assert.equal(unquoteGitPath('"b/caf\\303\\251 \\"x\\".md"'), 'b/caf\u00E9 "x".md');
    assert.equal(unquoteGitPath("plain/path.md"), "plain/path.md");
    const diff = 'diff --git "a/caf\\303\\251.md" "b/caf\\303\\251.md"\n@@ -0,0 +1 @@\n+x\n';
    assert.equal(parseUnifiedDiff(diff)[0].path, "caf\u00E9.md");
  });
});

describe("check-pr", { skip: !posix && "needs a POSIX shell for the gh stub" }, () => {
  it("passes a clean pull request and queries the default repository", (t) => {
    const { run, calls } = setup(t, {
      diff: "diff --git a/a.md b/a.md\n--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n-x\n+y\n",
    });
    const result = run(["7"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^check-pr: 0 findings \(0 brand, 0 narrative\) in o6b7\/cross-stack-standard#7: title, body, branch, 1 commit, 1 changed file$/mu,
    );
    assert.deepEqual(calls(), [
      [
        "pr",
        "view",
        "7",
        "--repo",
        "o6b7/cross-stack-standard",
        "--json",
        "number,title,body,headRefName,commits",
      ],
      ["pr", "diff", "7", "--repo", "o6b7/cross-stack-standard", "--color", "never"],
    ]);
  });
  it("reports the title, body, branch, commits and diff with locations only", (t) => {
    const { run } = setup(t, {
      view: {
        title: `feat: ${WORD} support`,
        body: `Summary\n\nWraps the ${p1}\n${p2} helper.`,
        headRefName: `feat/${WORD}kit`,
        commits: [
          {
            oid: "b".repeat(40),
            messageHeadline: "fix: gate",
            messageBody: `Per ${DECISION}.`,
            authors: [{ name: "Dev", email: `dev@${WORD}.io`, login: "dev" }],
          },
        ],
      },
      diff: DIFF,
    });
    const result = run(["7", "--repo", "someone/fork"]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout), [
      "BRAND-LEAK pr#7:title:1 denylisted token",
      "BRAND-LEAK pr#7:body:3 denylisted phrase",
      "BRAND-LEAK pr#7:branch:0 denylisted token glued inside a longer word in the head branch name",
      `NARRATIVE commit:${"b".repeat(12)}:3 decision-marker (column 5): ${DECISION_MESSAGE}`,
      `BRAND-LEAK commit:${"b".repeat(12)}:author:0 denylisted token in a name, email address or login`,
      "BRAND-LEAK docs/guide.md:4 denylisted token (added line)",
      `NARRATIVE docs/guide.md:22 decision-marker (column 12): ${DECISION_MESSAGE}`,
      "BRAND-LEAK src/[redacted]:0 denylisted token in a changed path",
    ]);
    assert.match(
      result.stdout,
      /check-pr: 8 findings \(6 brand, 2 narrative\) in someone\/fork#7/u,
    );
  });
  it("reports changed binary files as unchecked unless allowed", (t) => {
    const diff = [
      "diff --git a/assets/logo.png b/assets/logo.png",
      "new file mode 100644",
      "Binary files /dev/null and b/assets/logo.png differ",
      "",
    ].join("\n");
    const { run } = setup(t, { diff });
    const refused = run(["7"]);
    assert.equal(refused.status, 1);
    assert.deepEqual(findingLines(refused.stdout), [
      "BINARY-UNCHECKED assets/logo.png:0 binary file not inspected: a diff has no content for it; fetch the pull request head and scan it locally, then pass --allow-unchecked-binary",
    ]);
    assert.match(refused.stdout, /1 binary file not inspected\)/u);
    const allowed = run(["7", "--allow-unchecked-binary"]);
    assert.equal(allowed.status, 0);
    assert.match(allowed.stdout, /1 binary file not inspected \(allowed\)/u);
  });
  it("reports narrative warnings without failing", (t) => {
    const reference = ["the", "reference", "implementation"].join(" ");
    const { run } = setup(t, { view: { body: `Uses ${reference}, which we copied.` } });
    const result = run(["7"]);
    assert.equal(result.status, 0);
    assert.match(
      findingLines(result.stdout)[0],
      /^NARRATIVE pr#7:body:1 warning: private-reference/u,
    );
    assert.match(result.stdout, /1 narrative warning/u);
  });
  it("--no-diff checks text only and --json prints a report", (t) => {
    const { run, calls } = setup(t, { view: { title: `docs: ${DECISION}` }, diff: DIFF });
    const result = run(["7", "--no-diff", "--json"]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.deepEqual(report.summary, {
      findings: 1,
      brand: 0,
      narrative: 1,
      warnings: 0,
      uncheckedBinaries: 0,
      commits: 1,
      changedFiles: 0,
    });
    assert.equal(calls().length, 1);
  });
  it("exits 2 when gh fails or is missing", (t) => {
    const { run } = setup(t);
    const failed = run(["7"], { GH_STUB_FAIL: "1" });
    assert.equal(failed.status, 2);
    assert.match(failed.stderr, /check-pr: gh pr view failed: HTTP 404: Not Found/u);
    const missing = run(["7"], { PATH: tempDir(t, "empty-path-") });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /the GitHub CLI \(gh\) is not installed or not on PATH/u);
  });
  it("exits 2 without a key and for bad arguments", (t) => {
    const { run } = setup(t);
    const noKey = run(["7"], { CROSS_STACK_STANDARD_BRAND_KEY: "" });
    assert.equal(noKey.status, 2);
    assert.match(noKey.stderr, /no brand key/u);
    for (const args of [[], ["abc"], ["0"], ["7", "8"], ["7", "--repo", "not a repo"]]) {
      assert.equal(run(args).status, 2, JSON.stringify(args));
    }
    assert.equal(run(["--help"]).status, 0);
  });
});
