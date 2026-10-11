/**
 * Shared helpers for the CI tooling tests: temporary directories, isolated scratch git
 * repositories, output capture, and extraction of `run:` blocks from workflow and lefthook YAML
 * (so the shell and Node snippets inside them can be executed by tests).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Create a temporary directory that is removed after the test.
 *
 * @param {import("node:test").TestContext} t
 * @param {string} [prefix]
 * @returns {string}
 */
export function tempDir(t, prefix = "cross-stack-ci-") {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * A writable sink that records everything written to it.
 *
 * @returns {{write: (chunk: unknown) => boolean, readonly text: string}}
 */
export function capture() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    get text() {
      return chunks.join("");
    },
  };
}

/**
 * True when a program can be started (used to skip shell-based tests where it is missing).
 *
 * @param {string} command
 * @param {string[]} [args]
 * @returns {boolean}
 */
export function hasCommand(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

/**
 * Create an isolated git repository: no global or system configuration, fixed identity and
 * dates, no signing, `main` as the initial branch.
 *
 * @param {import("node:test").TestContext} t
 * @returns {{dir: string, env: NodeJS.ProcessEnv, git: (...args: string[]) => string, write: (file: string, content: string) => void, commit: (message: string) => string}}
 */
export function makeRepo(t) {
  const dir = tempDir(t, "cross-stack-ci-repo-");
  const home = path.join(dir, ".test-home");
  mkdirSync(home);
  const emptyConfig = path.join(home, "gitconfig");
  writeFileSync(emptyConfig, "");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test Author",
    GIT_AUTHOR_EMAIL: "author@example.invalid",
    GIT_COMMITTER_NAME: "Test Author",
    GIT_COMMITTER_EMAIL: "author@example.invalid",
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  };
  const git = (...args) => {
    const result = spawnSync("git", ["-C", dir, "-c", "commit.gpgsign=false", ...args], {
      encoding: "utf8",
      env,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  // The scratch repository's own exclude file keeps the fake home out of `git add -A`.
  writeFileSync(path.join(dir, ".git", "info", "exclude"), ".test-home/\n");
  const write = (file, content) => {
    const full = path.join(dir, ...file.split("/"));
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  };
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  return { dir, env, git, write, commit };
}

/**
 * Extract the `run: |` block of the step or job named `name` from workflow or lefthook YAML,
 * with its indentation removed. Throws when the step or its run block is missing.
 *
 * @param {string} yaml
 * @param {string} name Exact value of the step's `name:`.
 * @returns {string}
 */
export function extractRunBlock(yaml, name) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => {
    const match = /^\s*-\s+name:\s*(.*?)\s*$/.exec(line);
    return match !== null && match[1] === name;
  });
  if (start === -1) throw new Error(`no step named "${name}"`);
  const stepIndent = lines[start].indexOf("-");
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const indent = line.length - line.trimStart().length;
    if (line.trim() && indent <= stepIndent) break;
    const run = /^(\s*)run:\s*\|\s*$/.exec(line);
    if (!run) continue;
    const runIndent = run[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];
      const nextIndent = next.length - next.trimStart().length;
      if (next.trim() && nextIndent <= runIndent) break;
      body.push(next);
    }
    while (body.length && !body.at(-1).trim()) body.pop();
    const margin = Math.min(
      ...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length),
    );
    return `${body.map((l) => l.slice(margin)).join("\n")}\n`;
  }
  throw new Error(`step "${name}" has no "run: |" block`);
}

/**
 * Extract the body of the first quoted heredoc (`<<'EOF'` … `EOF`) in a shell script.
 *
 * @param {string} script
 * @returns {string}
 */
export function extractHeredoc(script) {
  const lines = script.split("\n");
  const start = lines.findIndex((line) => line.includes("<<'EOF'"));
  const end = lines.findIndex((line, index) => index > start && line === "EOF");
  if (start === -1 || end === -1) throw new Error("no quoted heredoc found");
  return `${lines.slice(start + 1, end).join("\n")}\n`;
}
