import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { main } from "../../../scripts/check-brand-leak.mjs";

import { png } from "./binary-samples.mjs";
import {
  ARABIC_WORD,
  OTHER_KEY,
  PHRASE,
  TEST_KEY,
  TRIGRAM,
  WORD,
  assertNoLeak,
  commitAll,
  git,
  initRepo,
  runScript,
  tempDir,
  writeFiles,
  writeSyntheticDenylist,
} from "./helpers.mjs";

const SCRIPT = "scripts/check-brand-leak.mjs";
const [p1, p2] = PHRASE;

/**
 * Create a scratch root with the synthetic denylist and return a runner bound to it.
 * @param {import("node:test").TestContext} t
 * @param {{ git?: boolean }} [options]
 */
function setup(t, { git: withGit = false } = {}) {
  const root = tempDir(t);
  if (withGit) initRepo(root);
  const { denylist, keyFile } = writeSyntheticDenylist(root);
  if (withGit) writeFiles(root, { ".gitignore": ".brand/\nignored/\n" });
  const run = (args, options = {}) => {
    const result = runScript(SCRIPT, ["--root", root, "--denylist", denylist, ...args], {
      cwd: root,
      env: { CROSS_STACK_STANDARD_BRAND_KEY: TEST_KEY },
      ...options,
    });
    assertNoLeak(result.stdout + result.stderr);
    return result;
  };
  return { root, denylist, keyFile, run };
}

const ROOT_FOR_MAIN = join(import.meta.dirname, "..", "..", "..");

const findingLines = (stdout) =>
  stdout.split("\n").filter((line) => line.startsWith("BRAND-LEAK "));

describe("check-brand-leak: key handling and usage", () => {
  it("exits 2 with a clear message when no key is available", (t) => {
    const { root, denylist } = setup(t);
    const result = runScript(SCRIPT, ["--root", root, "--denylist", denylist, "--tree"], {
      cwd: root,
    });
    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /no brand key: set CROSS_STACK_STANDARD_BRAND_KEY or CROSS_STACK_STANDARD_BRAND_KEY_FILE, pass --key-file <file>, or install the key once per clone as \.git\/cross-stack-standard\/brand\.key/u,
    );
  });
  it("does not skip a key that exists but is unusable, even with --skip-without-key", (t) => {
    const { root, denylist } = setup(t);
    const skip = ["--root", root, "--denylist", denylist, "--skip-without-key", "--tree"];
    const short = runScript(SCRIPT, skip, {
      cwd: root,
      env: { CROSS_STACK_STANDARD_BRAND_KEY: TEST_KEY.slice(0, 31) },
    });
    assert.equal(short.status, 2);
    assert.match(short.stderr, /too short \(31 characters, minimum 32\)/u);
    const unreadable = runScript(SCRIPT, [...skip, "--key-file", join(root, "absent.key")], {
      cwd: root,
    });
    assert.equal(unreadable.status, 2);
    assert.match(unreadable.stderr, /cannot read the key file \(ENOENT\)/u);
    const named = runScript(SCRIPT, skip, {
      cwd: root,
      env: { CROSS_STACK_STANDARD_BRAND_KEY_FILE: join(root, "absent.key") },
    });
    assert.equal(named.status, 2);
    assert.doesNotMatch(named.stderr, /skipped/u);
  });
  it("reads the clone's key file under the git directory", (t) => {
    const { root, denylist } = setup(t, { git: true });
    writeFiles(root, { "a.md": WORD });
    const args = ["--root", root, "--denylist", denylist, "--skip-without-key", "--tree"];
    writeFiles(root, { ".git/cross-stack-standard/brand.key": `${TEST_KEY}\n` });
    const found = runScript(SCRIPT, args, { cwd: root });
    assert.equal(found.status, 1, found.stderr);
    assert.deepEqual(findingLines(found.stdout), ["BRAND-LEAK a.md:1 denylisted token"]);
    writeFiles(root, { ".git/cross-stack-standard/brand.key": "too-short\n" });
    const broken = runScript(SCRIPT, args, { cwd: root });
    assert.equal(broken.status, 2);
    assert.match(broken.stderr, /\.git\/cross-stack-standard\/brand\.key is too short/u);
  });
  it("exits 2 without echoing the message of an unexpected error", (t) => {
    const { root, denylist } = setup(t);
    const out = [];
    const code = main(["--stdin", "--root", root, "--denylist", denylist], {
      stdout: { write: (text) => out.push(text) },
      stderr: { write: (text) => out.push(text) },
      env: { CROSS_STACK_STANDARD_BRAND_KEY: TEST_KEY },
      cwd: root,
      stdin: () => {
        throw new TypeError(`boom ${WORD}`);
      },
    });
    assert.equal(code, 2);
    assert.match(out.join(""), /internal error \(TypeError\)/u);
    assertNoLeak(out.join(""));
  });
  it("skips with exit 0 when asked to and no key is available", (t) => {
    const { root, denylist } = setup(t);
    writeFiles(root, { "a.md": WORD });
    const result = runScript(
      SCRIPT,
      ["--root", root, "--denylist", denylist, "--skip-without-key"],
      { cwd: root },
    );
    assert.equal(result.status, 0);
    assert.match(result.stderr, /skipped/u);
  });
  it("reads the key from --key-file", (t) => {
    const { root, denylist, keyFile } = setup(t);
    writeFiles(root, { "a.md": "clean" });
    const result = runScript(
      SCRIPT,
      ["--root", root, "--denylist", denylist, "--key-file", keyFile],
      { cwd: root },
    );
    assert.equal(result.status, 0);
  });
  it("exits 2 when the key does not match the denylist", (t) => {
    const { run } = setup(t);
    const result = run(["--tree"], { env: { CROSS_STACK_STANDARD_BRAND_KEY: OTHER_KEY } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /does not match the denylist/u);
  });
  it("exits 2 for a missing or invalid denylist", (t) => {
    const { root } = setup(t);
    const result = runScript(SCRIPT, ["--root", root, "--denylist", join(root, "nope.json")], {
      cwd: root,
      env: { CROSS_STACK_STANDARD_BRAND_KEY: TEST_KEY },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot read the denylist/u);
  });
  it("prints help and rejects bad usage with exit 2", (t) => {
    const { run } = setup(t);
    const help = runScript(SCRIPT, ["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--all-history/u);
    for (const args of [
      ["--tree", "--staged"],
      ["--paths"],
      ["--stdin", "extra"],
      ["--stdin", "--names-only"],
      ["--bogus"],
    ]) {
      const result = run(args);
      assert.equal(result.status, 2, args.join(" "));
      assert.match(result.stderr, /check-brand-leak: /u);
    }
  });
});

describe("check-brand-leak --tree (filesystem walk)", () => {
  it("passes a clean tree and prints a summary line", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, {
      "README.md": "A reference implementation of RFC 9457.\n",
      "src/index.mjs": "export const plumbing = 1;\n",
    });
    const result = run(["--tree"]);
    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /^check-brand-leak: 0 findings \[tree\] scanned \d+ files \(\d+ text, 0 binary\), \d+ names in \d+ ms \(key [0-9a-f]{8}\)$/mu,
    );
  });
  it("reports content, glued, phrase, name and binary hits with locations only", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, {
      "docs/guide.md": `# Guide\n\nclean line\nsee ${WORD} here\n`,
      "src/config.ts": `const url = "https://${WORD}standard.example";\n`,
      "src/notes.js": `/**\n * the ${p1}\n * ${p2} helper\n */\n`,
      [`docs/${WORD}-notes/readme.md`]: "clean\n",
      "assets/logo.png": png({ compressedText: `drawn for ${WORD}` }),
      "i18n/ar.json": `{"name": "${ARABIC_WORD}"}\n`,
    });
    const result = run(["--tree"]);
    assert.equal(result.status, 1);
    const lines = findingLines(result.stdout);
    assert.deepEqual(lines.sort(), [
      "BRAND-LEAK assets/logo.png:0 denylisted token in a binary string (compressed or encoded data at byte offset 33)",
      "BRAND-LEAK docs/[redacted]:0 denylisted token in a file or directory name",
      "BRAND-LEAK docs/guide.md:4 denylisted token",
      "BRAND-LEAK i18n/ar.json:1 denylisted token",
      "BRAND-LEAK src/config.ts:1 denylisted token glued inside a longer word",
      "BRAND-LEAK src/notes.js:2 denylisted phrase",
    ]);
    assert.match(result.stdout, /check-brand-leak: 6 findings \[tree\]/u);
  });
  it("applies .gitignore with negations, like git would (vendored kit packages are scanned)", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, {
      ".gitignore": [
        "_work/",
        "node_modules/",
        "vendor/",
        "!plugins/cross-stack-standard/templates/*/vendor/",
        ".brand/",
        "*.log",
        "",
      ].join("\n"),
      "_work/a.md": WORD,
      "node_modules/pkg/c.js": WORD,
      "packages/x/vendor/d.php": WORD,
      "plugins/cross-stack-standard/templates/web/vendor/pkg/index.js": WORD,
      "plugins/cross-stack-standard/templates/web/vendor/pkg/node_modules/dep/e.js": WORD,
      "docs/nested/.gitignore": "local.md\n",
      "docs/nested/local.md": WORD,
      "build.log": WORD,
      "ok.md": "fine",
    });
    const result = run(["--tree"]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout), [
      "BRAND-LEAK plugins/cross-stack-standard/templates/web/vendor/pkg/index.js:1 denylisted token",
    ]);
  });
  it("skips _input, _work, node_modules, vendor and .git directories without a .gitignore", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, {
      "_input/a.md": WORD,
      "_work/b.md": WORD,
      "node_modules/pkg/c.js": WORD,
      "packages/x/vendor/d.php": WORD,
      ".git/e": WORD,
      "ok.md": "fine",
    });
    assert.equal(run(["--tree"]).status, 0);
  });
  it(
    "scans a symbolic link's target text, not the file it points to",
    { skip: process.platform === "win32" },
    (t) => {
      const { root, run } = setup(t);
      mkdirSync(join(root, "links"));
      symlinkSync(`../${WORD}/x`, join(root, "links", "l"));
      const result = run(["--tree"]);
      assert.equal(result.status, 1);
      assert.deepEqual(findingLines(result.stdout), ["BRAND-LEAK links/l:1 denylisted token"]);
    },
  );
  it("prints a JSON report", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, { "a.md": `x\n${TRIGRAM.join("\n")}\n` });
    const result = run(["--tree", "--json"]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.mode, "tree");
    assert.deepEqual(report.findings, [
      {
        id: "BRAND-LEAK",
        path: "a.md",
        line: 2,
        kind: "phrase",
        source: "content",
        message: "denylisted phrase",
      },
    ]);
    assert.equal(report.summary.findings, 1);
  });
  it("--names-only reports names and ignores contents", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, { "a.md": WORD, [`b/${WORD}.md`]: "x" });
    const result = run(["--tree", "--names-only"]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout), [
      "BRAND-LEAK b/[redacted]:0 denylisted token in a file or directory name",
    ]);
  });
});

describe("check-brand-leak --tree (git work tree)", () => {
  it("scans tracked and untracked files but not ignored ones", (t) => {
    const { root, run } = setup(t, { git: true });
    writeFiles(root, { "tracked.md": "clean", "ignored/secret.md": WORD });
    commitAll(root, "chore: init");
    assert.equal(run(["--tree"]).status, 0);
    writeFiles(root, { "untracked.md": WORD });
    const result = run(["--tree"]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout), ["BRAND-LEAK untracked.md:1 denylisted token"]);
  });
});

describe("check-brand-leak --paths", () => {
  it("scans given files and directories, relative to the root", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, { "a/one.md": WORD, "a/two.md": "clean", "b/three.md": WORD });
    const result = run(["--paths", "a", "b/three.md"]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout).sort(), [
      "BRAND-LEAK a/one.md:1 denylisted token",
      "BRAND-LEAK b/three.md:1 denylisted token",
    ]);
  });
  it("does not name-scan the parents of a path outside the root", (t) => {
    const { run } = setup(t);
    const outside = tempDir(t);
    writeFiles(outside, { [`${WORD}/inner/file.md`]: "clean" });
    const result = run(["--paths", join(outside, WORD, "inner")]);
    assert.equal(result.status, 0);
  });
  it("redacts a denylisted word echoed in an error message", (t) => {
    const { run } = setup(t);
    const result = run(["--paths", `${WORD}-missing/file.md`]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^check-brand-leak: cannot read \[redacted\] \(ENOENT\)$/mu);
  });
  it("exits 2 for a missing path", (t) => {
    const { run } = setup(t);
    const result = run(["--paths", "does-not-exist"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot read does-not-exist \(ENOENT\)/u);
  });
});

describe("check-brand-leak --staged", () => {
  it("scans staged content from the index and staged names", (t) => {
    const { root, run } = setup(t, { git: true });
    writeFiles(root, { "a.md": "clean" });
    commitAll(root, "chore: init");
    writeFiles(root, { "a.md": `staged ${WORD}\n` });
    git(root, ["add", "a.md"]);
    writeFiles(root, { "a.md": "working copy is clean again\n" });
    writeFiles(root, { [`new/${WORD}.md`]: "clean" });
    git(root, ["add", "new"]);
    const result = run(["--staged"]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout).sort(), [
      "BRAND-LEAK a.md:1 denylisted token",
      "BRAND-LEAK new/[redacted]:0 denylisted token in a file or directory name",
    ]);
  });
  it("scans the author and committer identity of the next commit", (t) => {
    const { root, run } = setup(t, { git: true });
    writeFiles(root, { "a.md": "clean" });
    git(root, ["add", "a.md"]);
    const clean = run(["--staged"]);
    assert.equal(clean.status, 0);
    assert.match(clean.stdout, /2 identities/u);
    const leaky = run(["--staged"], {
      env: {
        CROSS_STACK_STANDARD_BRAND_KEY: TEST_KEY,
        GIT_AUTHOR_NAME: "Dev",
        GIT_AUTHOR_EMAIL: `dev@${WORD}.io`,
        GIT_COMMITTER_NAME: `Ops (${WORD.toUpperCase()})`,
        GIT_COMMITTER_EMAIL: "ops@example.com",
      },
    });
    assert.equal(leaky.status, 1);
    assert.deepEqual(findingLines(leaky.stdout), [
      "BRAND-LEAK identity:author:0 denylisted token in a name or email address",
      "BRAND-LEAK identity:committer:0 denylisted token in a name or email address",
    ]);
  });
  it("name-scans a staged submodule (gitlink) entry", (t) => {
    const { root, run } = setup(t, { git: true });
    writeFiles(root, { "a.md": "clean" });
    const head = commitAll(root, "chore: init");
    git(root, ["update-index", "--add", "--cacheinfo", `160000,${head},${WORD}-module`]);
    const result = run(["--staged"]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout), [
      "BRAND-LEAK [redacted]:0 denylisted token in a file or directory name",
    ]);
  });
  it("ignores unstaged changes and deletions", (t) => {
    const { root, run } = setup(t, { git: true });
    writeFiles(root, { "a.md": "clean", "b.md": "clean" });
    commitAll(root, "chore: init");
    writeFiles(root, { "a.md": WORD });
    git(root, ["rm", "-q", "b.md"]);
    const result = run(["--staged"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /0 findings \[staged\]/u);
  });
});

describe("check-brand-leak --stdin and --commit-msg", () => {
  it("scans standard input with an optional label", (t) => {
    const { run } = setup(t);
    const clean = run(["--stdin"], { input: "feat: add a gate\n" });
    assert.equal(clean.status, 0);
    const hit = run(["--stdin", "--label", "pull request"], {
      input: `title\n\nbody ${p1}\n${p2}\n`,
    });
    assert.equal(hit.status, 1);
    assert.deepEqual(findingLines(hit.stdout), ["BRAND-LEAK pull request:3 denylisted phrase"]);
  });
  it("scans a commit message file including comment lines, but not the scissors section", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, {
      "clean.txt": `feat: gate\n\n# Please enter a message\n# ------------------------ >8 ------------------------\n+${WORD}\n`,
      "dirty.txt": `feat: gate\n\nmentions ${WORD.toUpperCase()}\n`,
      // git keeps "#" lines for -m/-F without an editor, --cleanup=verbatim or another
      // core.commentChar, so they must be scanned.
      "hash.txt": `feat: add a\n\n# ${WORD} appears here\n`,
      "semicolon.txt": `feat: gate\n\n; ------------------------ >8 ------------------------\n${WORD}\n`,
    });
    assert.equal(run(["--commit-msg", "clean.txt"]).status, 0);
    assert.equal(run(["--commit-msg", "semicolon.txt"]).status, 0);
    const dirty = run(["--commit-msg", "dirty.txt"]);
    assert.equal(dirty.status, 1);
    assert.deepEqual(findingLines(dirty.stdout), ["BRAND-LEAK dirty.txt:3 denylisted token"]);
    const hash = run(["--commit-msg", "hash.txt"]);
    assert.equal(hash.status, 1);
    assert.deepEqual(findingLines(hash.stdout), ["BRAND-LEAK hash.txt:3 denylisted token"]);
  });
  it("blocks a real `git commit -m` whose message has a '#' line (commit-msg hook)", (t) => {
    const { root, denylist } = setup(t, { git: true });
    writeFiles(root, { "a.md": "clean" });
    git(root, ["add", "a.md"]);
    const hook = join(root, ".git", "hooks", "commit-msg");
    writeFiles(root, {
      ".git/hooks/commit-msg": [
        "#!/bin/sh",
        `exec "${process.execPath}" "${join(ROOT_FOR_MAIN, SCRIPT)}" --commit-msg "$1" --root "${root}" --denylist "${denylist}"`,
        "",
      ].join("\n"),
    });
    spawnSync("chmod", ["+x", hook]);
    const result = spawnSync(
      "git",
      ["-C", root, "commit", "-q", "-m", `feat: add a\n\n# ${WORD} here`],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CROSS_STACK_STANDARD_BRAND_KEY: TEST_KEY,
          GIT_AUTHOR_NAME: "Test",
          GIT_AUTHOR_EMAIL: "test@example.com",
          GIT_COMMITTER_NAME: "Test",
          GIT_COMMITTER_EMAIL: "test@example.com",
        },
      },
    );
    assertNoLeak(result.stdout + result.stderr);
    assert.notEqual(result.status, 0, "the hook must refuse the commit");
    assert.match(result.stdout + result.stderr, /BRAND-LEAK .*:3 denylisted token/u);
  });
  it("exits 2 for a missing commit message file", (t) => {
    const { run } = setup(t);
    assert.equal(run(["--commit-msg", "missing.txt"]).status, 2);
  });
});

describe("check-brand-leak --commits and --all-history", () => {
  /** Build a repository with a clean base and a feature branch that leaks in several ways. */
  function history(t) {
    const env = setup(t, { git: true });
    const { root } = env;
    writeFiles(root, { "base.md": "clean" });
    const base = commitAll(root, "chore: base");
    git(root, ["checkout", "-q", "-b", `feature/${WORD}-work`]);
    writeFiles(root, { "a.md": "clean" });
    const leakyMessage = commitAll(root, `feat: add a\n\nBody mentions ${p1}\n${p2}.`);
    writeFiles(root, { [`docs/${WORD}.md`]: "clean" });
    commitAll(root, "docs: add page");
    git(root, ["rm", "-q", `docs/${WORD}.md`]);
    commitAll(root, "docs: remove page");
    git(root, ["tag", "-a", "v0.0.1", "-m", `release for ${WORD}`]);
    return { ...env, base, leakyMessage };
  }

  it("--commits scans messages, identities and paths added in the range", (t) => {
    const { run, base, leakyMessage } = history(t);
    const result = run(["--commits", `${base}..HEAD`]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout).sort(), [
      `BRAND-LEAK commit:${leakyMessage.slice(0, 12)}:3 denylisted phrase`,
      "BRAND-LEAK docs/[redacted]:0 denylisted token in a path added in history",
    ]);
    assert.match(result.stdout, /\d+ names, 3 commits, \d+ file versions?, 6 identities/u);
  });
  it("--commits scans every file version in the range, even one a later commit removed", (t) => {
    const { root, run } = setup(t, { git: true });
    writeFiles(root, { "base.md": "clean" });
    const base = commitAll(root, "chore: base");
    writeFiles(root, { "notes/draft.md": `line one\nline two ${WORD}\n` });
    const leaked = commitAll(root, "docs: draft");
    writeFiles(root, { "notes/draft.md": "line one\nline two\n" });
    commitAll(root, "docs: clean the draft");
    assert.equal(run(["--tree"]).status, 0, "the tip is clean");
    const result = run(["--commits", `${base}..HEAD`]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout), [
      `BRAND-LEAK commit:${leaked.slice(0, 12)}:notes/draft.md:2 denylisted token`,
    ]);
  });
  it("--commits scans author and committer names and email addresses", (t) => {
    const { root, run } = setup(t, { git: true });
    writeFiles(root, { "x.txt": "x" });
    git(root, ["add", "x.txt"]);
    const result = spawnSync("git", ["-C", root, "commit", "-q", "-m", "chore: init"], {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: `Dev (${WORD})`,
        GIT_AUTHOR_EMAIL: `dev@${WORD}.io`,
        GIT_COMMITTER_NAME: "Dev",
        GIT_COMMITTER_EMAIL: `dev@${WORD}.io`,
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
    });
    assert.equal(result.status, 0);
    const sha = git(root, ["rev-parse", "HEAD"]).trim().slice(0, 12);
    const scan = run(["--commits", "HEAD"]);
    assert.equal(scan.status, 1);
    assert.deepEqual(findingLines(scan.stdout), [
      `BRAND-LEAK commit:${sha}:author:0 denylisted token in a name or email address`,
      `BRAND-LEAK commit:${sha}:committer:0 denylisted token in a name or email address`,
    ]);
  });
  it("--commits passes a clean range", (t) => {
    const { root, run, base } = history(t);
    assert.equal(run(["--commits", `${base}..${base}`]).status, 0);
    git(root, ["checkout", "-q", "main"]);
    assert.equal(run(["--commits", "main"]).status, 0);
  });
  it("--all-history scans every ref name, tag message, tagger, commit message and added path", (t) => {
    const { root, run } = history(t);
    spawnSync("git", ["-C", root, "tag", "-a", "v0.0.2", "-m", "release"], {
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: "Releaser",
        GIT_COMMITTER_EMAIL: `release@${WORD}.io`,
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
    });
    const result = run(["--all-history"]);
    assert.equal(result.status, 1);
    const lines = findingLines(result.stdout);
    assert.ok(
      lines.includes(
        "BRAND-LEAK ref:refs/heads/feature/[redacted]:0 denylisted token in a ref name",
      ),
    );
    assert.ok(lines.includes("BRAND-LEAK ref:refs/tags/v0.0.1:1 denylisted token"));
    assert.ok(
      lines.includes(
        "BRAND-LEAK ref:refs/tags/v0.0.2:tagger:0 denylisted token in a name or email address",
      ),
    );
    assert.ok(
      lines.includes("BRAND-LEAK docs/[redacted]:0 denylisted token in a path added in history"),
    );
    assert.ok(
      lines.some((line) => /^BRAND-LEAK commit:[0-9a-f]{12}:3 denylisted phrase$/u.test(line)),
    );
  });
  it("--all-history limited to clean refs passes", (t) => {
    const { run } = history(t);
    const result = run(["--all-history", "main"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /1 commit, 2 file versions, 2 identities, 1 ref /u);
  });
  it("--pre-push scans the commits each pushed ref would publish", (t) => {
    const { root, run, base, leakyMessage } = history(t);
    const head = git(root, ["rev-parse", "HEAD"]).trim();
    const zero = "0".repeat(40);
    const updated = run(["--pre-push"], {
      input: `refs/heads/feature ${head} refs/heads/feature ${base}\n`,
    });
    assert.equal(updated.status, 1);
    assert.ok(
      findingLines(updated.stdout).includes(
        `BRAND-LEAK commit:${leakyMessage.slice(0, 12)}:3 denylisted phrase`,
      ),
    );
    // A new branch: every commit that no remote-tracking ref has (here: all of them).
    const created = run(["--pre-push"], {
      input: `refs/heads/feature ${head} refs/heads/feature ${zero}\n`,
    });
    assert.equal(created.status, 1);
    // A deletion publishes nothing; a clean update passes.
    const deleted = run(["--pre-push"], {
      input: `(delete) ${zero} refs/heads/feature ${head}\nrefs/heads/main ${base} refs/heads/main ${base}\n`,
    });
    assert.equal(deleted.status, 0, deleted.stdout);
  });
  it("redacts a denylisted ref name echoed by git", (t) => {
    const { run } = history(t);
    const result = run(["--commits", `no-such-${WORD}..HEAD`]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /\[redacted\]/u);
  });
  it("exits 2 outside a git repository", (t) => {
    const { run } = setup(t);
    const result = run(["--commits", "HEAD~1..HEAD"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /git log failed/u);
  });
});

describe("check-brand-leak: encoded, embedded and oversized input", () => {
  it("finds a token in a base64 data URI in a text file", (t) => {
    const { root, run } = setup(t);
    const payload = Buffer.from(png({ text: `Author\0${WORD} studio` })).toString("base64");
    writeFiles(root, {
      "logo.svg": `<svg><image href="data:image/png;base64,${payload}"/></svg>\n`,
      "readme.md": `![logo](data:image/png;base64,${payload})\n`,
    });
    const result = run(["--tree"]);
    assert.equal(result.status, 1);
    assert.deepEqual(findingLines(result.stdout).sort(), [
      "BRAND-LEAK logo.svg:1 denylisted token (in an embedded base64 data URI)",
      "BRAND-LEAK readme.md:1 denylisted token (in an embedded base64 data URI)",
    ]);
  });
  it("decodes a very long run of escaped bytes without crashing", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, {
      "xesc.txt": `s = "${"\\xff".repeat(300_000)}";\n`,
      "pct.txt": `${"%ff".repeat(200_000)}\n`,
    });
    const result = run(["--tree"]);
    assert.equal(result.status, 0, result.stderr);
  });
});
