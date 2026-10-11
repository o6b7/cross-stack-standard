import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { isIgnored, parseGitignore, walkUnignored } from "../../../scripts/lib/gitignore.mjs";

/**
 * @param {import("node:test").TestContext} t
 * @returns {string}
 */
function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gitignore-test-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * @param {string} dir
 * @param {Record<string, string>} files
 */
function writeFiles(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

const ignored = (text, path, directory = false) => isIgnored(parseGitignore(text), path, directory);

describe("parseGitignore and isIgnored", () => {
  it("skips comments and blank lines, and honours escaped # and !", () => {
    assert.deepEqual(parseGitignore("# comment\n\n   \n"), []);
    assert.equal(ignored("\\#file\n", "#file"), true);
    assert.equal(ignored("\\!important\n", "!important"), true);
  });
  it("matches a slash-free pattern at any depth and an anchored one from its directory", () => {
    assert.equal(ignored("*.log\n", "a/b/c.log"), true);
    assert.equal(ignored("/build\n", "build", true), true);
    assert.equal(ignored("/build\n", "src/build", true), false);
    assert.equal(ignored("docs/*.md\n", "docs/a.md"), true);
    assert.equal(ignored("docs/*.md\n", "x/docs/a.md"), false);
  });
  it("limits a trailing-slash pattern to directories", () => {
    assert.equal(ignored("vendor/\n", "vendor", true), true);
    assert.equal(ignored("vendor/\n", "vendor", false), false);
    assert.equal(ignored("vendor/\n", "a/vendor", true), true);
  });
  it("supports leading, trailing and middle double stars, ? and bracket expressions", () => {
    assert.equal(ignored("**/tmp\n", "a/b/tmp", true), true);
    assert.equal(ignored("logs/**\n", "logs/a/b.txt"), true);
    assert.equal(ignored("a/**/z\n", "a/z"), true);
    assert.equal(ignored("a/**/z\n", "a/b/c/z"), true);
    assert.equal(ignored("file?.txt\n", "file1.txt"), true);
    assert.equal(ignored("file?.txt\n", "file10.txt"), false);
    assert.equal(ignored("[ab].txt\n", "b.txt"), true);
    assert.equal(ignored("[!ab].txt\n", "b.txt"), false);
  });
  it("lets the last matching pattern win, so a negation re-includes", () => {
    const text = "vendor/\n!plugins/*/templates/*/vendor/\n";
    assert.equal(ignored(text, "packages/x/vendor", true), true);
    assert.equal(ignored(text, "plugins/kit/templates/web/vendor", true), false);
  });
  it("applies a nested file's patterns relative to its directory", () => {
    const rules = [
      ...parseGitignore("*.log\n"),
      ...parseGitignore("/local.md\n!keep.log\n", "docs"),
    ];
    assert.equal(isIgnored(rules, "docs/local.md", false), true);
    assert.equal(isIgnored(rules, "local.md", false), false);
    assert.equal(isIgnored(rules, "docs/keep.log", false), false);
    assert.equal(isIgnored(rules, "other/keep.log", false), true);
  });
});

describe("walkUnignored", () => {
  it("never re-includes a file inside an ignored directory and skips .git", (t) => {
    const root = tempDir(t);
    writeFiles(root, {
      ".gitignore": "build/\n!build/keep.txt\n",
      "build/keep.txt": "x",
      "src/a.txt": "x",
      ".git/config": "x",
    });
    assert.deepEqual(
      walkUnignored(root).map((entry) => entry.path),
      [".gitignore", "src/a.txt"],
    );
  });
  it("lists the same files as git for this repository's ignore rules", (t) => {
    const root = tempDir(t);
    writeFiles(root, {
      ".gitignore": [
        "_input/",
        "_work/",
        "node_modules/",
        "vendor/",
        "!plugins/cross-stack-standard/templates/*/vendor/",
        "coverage/",
        ".env",
        ".env.*",
        "!.env.example",
        "*.zip",
        "*.log",
        "",
      ].join("\n"),
      "_input/a.md": "x",
      "_work/b.md": "x",
      "node_modules/pkg/index.js": "x",
      "packages/laravel/vendor/autoload.php": "x",
      "plugins/cross-stack-standard/templates/web/vendor/eslint-config/index.js": "x",
      "plugins/cross-stack-standard/templates/web/vendor/eslint-config/node_modules/d/i.js": "x",
      "plugins/cross-stack-standard/templates/web/src/app.ts": "x",
      "test/harness/web/.env": "x",
      "test/harness/web/.env.example": "x",
      "test/harness/web/.env.local": "x",
      "docs/.gitignore": "draft-*.md\n",
      "docs/draft-1.md": "x",
      "docs/final.md": "x",
      "dist.zip": "x",
      "a.log": "x",
      "README.md": "x",
    });
    const gitInit = spawnSync("git", ["-C", root, "init", "-q"], { encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr);
    const listed = spawnSync(
      "git",
      ["-C", root, "ls-files", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } },
    );
    assert.equal(listed.status, 0, listed.stderr);
    const fromGit = listed.stdout.split("\0").filter(Boolean).sort();
    const fromWalk = walkUnignored(root)
      .filter((entry) => !entry.directory)
      .map((entry) => entry.path)
      .sort();
    assert.deepEqual(fromWalk, fromGit);
    assert.ok(
      fromWalk.includes("plugins/cross-stack-standard/templates/web/vendor/eslint-config/index.js"),
    );
  });
});
