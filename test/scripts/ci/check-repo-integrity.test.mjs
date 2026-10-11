import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { ESLint } from "eslint";

import { checkPaths, main } from "../../../scripts/check-repo-integrity.mjs";
import { ROOT, capture, makeRepo, tempDir } from "./helpers.mjs";

describe("checkPaths", () => {
  const ids = (files) => checkPaths(files).map((f) => `${f.id} ${f.file}`);

  test("flags tracked private working directories at the top level, in any case", () => {
    assert.deepEqual(
      ids(["_work/example.txt", "_input/sample/a.txt", "_WORK/x", "docs/_work/ok.md", "_work"]),
      [
        "private-path _work/example.txt",
        "private-path _input/sample/a.txt",
        "private-path _WORK/x",
      ],
    );
  });

  test("flags environment files but not .example templates", () => {
    assert.deepEqual(
      ids([
        ".env",
        "apps/api/.env.local",
        ".env.production",
        ".env.example",
        "config/.env.testing.example",
        "docs/env.md",
      ]),
      ["env-file .env", "env-file apps/api/.env.local", "env-file .env.production"],
    );
  });

  test("flags machine-local files", () => {
    assert.deepEqual(
      ids(["CLAUDE.local.md", ".claude/settings.local.json", ".claude/settings.json", "CLAUDE.md"]),
      ["local-file CLAUDE.local.md", "local-file .claude/settings.local.json"],
    );
  });

  test("path findings point at line 1 and explain the fix", () => {
    const [finding] = checkPaths(["_work/a.md"]);
    assert.equal(finding.line, 1);
    assert.match(finding.message, /git rm --cached -- _work\/a\.md/);
  });
});

describe("no child process through a shell (ESLint)", () => {
  const eslint = new ESLint({ cwd: ROOT });
  const lint = async (code) => {
    const [result] = await eslint.lintText(code, {
      filePath: path.join(ROOT, "scripts", "probe.mjs"),
    });
    return result.messages.filter((m) => /shell/i.test(m.message)).map((m) => m.line);
  };

  test("flags every form of the shell option and the shell-only exec functions", async () => {
    const code = [
      'import { exec, execSync, spawnSync } from "node:child_process";',
      'const isWin = process.platform === "win32";',
      "const shell = isWin;",
      'spawnSync("npm", ["run", "check"], { shell: process.platform === "win32" });',
      'spawnSync("npm", ["run", "check"], { shell: isWin });',
      'spawnSync("npm", ["run", "check"], { shell });',
      'spawnSync("npm", ["run", "check"], { ["shell"]: true });',
      'spawnSync("npm", ["run", "check"], { "shell": "/bin/sh" });',
      'spawnSync("npm", ["run", "check"], { shell: false });',
      'exec("npm run check:fast");',
      'execSync("npm run check:fast");',
      'require("node:child_process").execSync("x");',
      "",
    ].join("\n");
    assert.deepEqual(await lint(code), [1, 1, 4, 5, 6, 7, 8, 12]);
  });

  test("allows spawning a program with an argument array", async () => {
    assert.deepEqual(
      await lint(
        'import { spawnSync } from "node:child_process";\nspawnSync("git", ["status"]);\n',
      ),
      [],
    );
  });
});

describe("command line against a git repository", () => {
  const run = (dir, args = []) => {
    const stdout = capture();
    const stderr = capture();
    const code = main(["--root", dir, ...args], { stdout, stderr });
    return { code, stdout: stdout.text, stderr: stderr.text };
  };

  test("a clean repository passes", (t) => {
    const repo = makeRepo(t);
    repo.write(
      "scripts/tool.mjs",
      'import { spawnSync } from "node:child_process";\nspawnSync("git", ["status"]);\n',
    );
    repo.write(".env.example", "APP_KEY=\n");
    repo.commit("chore: clean");
    const result = run(repo.dir);
    assert.equal(result.code, 0, result.stdout);
    assert.match(result.stdout, /^repo integrity: 2 tracked files, no problems$/m);
  });

  test("tracked and staged violations fail with one line each", (t) => {
    const repo = makeRepo(t);
    repo.write("_work/draft.txt", "private\n");
    repo.write(".env", "SECRET=1\n");
    repo.commit("chore: oops");
    repo.write("CLAUDE.local.md", "local\n");
    repo.git("add", "CLAUDE.local.md");
    const result = run(repo.dir);
    assert.equal(result.code, 1);
    const lines = result.stdout.trim().split("\n");
    assert.deepEqual(lines.slice(0, -1).sort(), [
      "env-file .env:1 environment file is tracked; commit a .env.example template instead",
      "local-file CLAUDE.local.md:1 machine-local file is tracked; it is gitignored on purpose",
      'private-path _work/draft.txt:1 private working material is tracked; run "git rm --cached -- _work/draft.txt" (_work/ is gitignored)',
    ]);
    assert.equal(lines.at(-1), "repo integrity: 3 problem(s) in 3 tracked files");
  });

  test("a staged file deleted from the working tree does not crash the scan", (t) => {
    const repo = makeRepo(t);
    repo.write("scripts/gone.mjs", "export {};\n");
    repo.git("add", "scripts/gone.mjs");
    rmSync(path.join(repo.dir, "scripts", "gone.mjs"));
    assert.equal(run(repo.dir).code, 0);
  });

  test("prints JSON with --json", (t) => {
    const repo = makeRepo(t);
    repo.write("_input/x.txt", "x\n");
    repo.commit("chore: x");
    const result = run(repo.dir, ["--json"]);
    assert.equal(result.code, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.files, 1);
    assert.deepEqual(
      report.findings.map((f) => f.id),
      ["private-path"],
    );
  });

  test("a directory that is not a git repository exits 2", (t) => {
    const result = run(tempDir(t));
    assert.equal(result.code, 2);
    assert.match(result.stderr, /git ls-files failed/);
  });

  test("usage", () => {
    const help = capture();
    assert.equal(main(["--help"], { stdout: help, stderr: capture() }), 0);
    assert.match(help.text, /Usage:/);
    assert.equal(main(["--bogus"], { stdout: capture(), stderr: capture() }), 2);
  });
});
