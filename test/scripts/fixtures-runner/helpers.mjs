/**
 * Shared helpers for the fixture-runner tests. The `mini/` directory is a self-contained
 * repository (registry, hosts, fixtures and a data-driven gate); each test copies it to a temp
 * directory together with the real `repo` and `node` hosts from `test/harness/`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const MINI_SOURCE = fileURLToPath(new URL("./mini/", import.meta.url));
export const CLI = path.join(REPO_ROOT, "scripts", "run-fixtures.mjs");

/**
 * Create a temporary directory removed after the test.
 *
 * @param {import("node:test").TestContext} t Test context.
 * @param {string} [prefix] Directory name prefix.
 * @returns {string} Absolute real path.
 */
export function tempDir(t, prefix = "csf-test-") {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

/**
 * Copy the mini repository and the real `repo`/`node` hosts into a temp root, and create the
 * `plain` host's dependency directory (dependency directories are never committed).
 *
 * @param {import("node:test").TestContext} t Test context.
 * @returns {string} Temp repository root.
 */
export function makeMiniRoot(t) {
  const root = tempDir(t);
  fs.cpSync(MINI_SOURCE, root, { recursive: true });
  for (const host of ["node", "repo"]) {
    fs.cpSync(
      path.join(REPO_ROOT, "test", "harness", host),
      path.join(root, "test", "harness", host),
      {
        recursive: true,
      },
    );
  }
  const plain = path.join(root, "test", "harness", "plain");
  fs.mkdirSync(path.join(plain, "node_modules", "dep"), { recursive: true });
  fs.writeFileSync(path.join(plain, "node_modules", "dep", "index.js"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(plain, "node_modules", "dep", "cache.json"), "{}\n");
  fs.writeFileSync(path.join(plain, "debug.log"), "not copied\n");
  return root;
}

/**
 * Run the CLI against a root.
 *
 * @param {string} root Repository root.
 * @param {string[]} args Extra arguments.
 * @param {{ env?: Record<string, string | undefined>, kitBin?: boolean }} [options] Extra
 *   environment; `kitBin` points the real hosts' `kitBin` variable at the mini gate.
 * @returns {{ status: number | null, stdout: string, stderr: string, ms: number }} Result.
 */
export function runCli(root, args, { env = {}, kitBin = false } = {}) {
  const argv = [CLI, "--root", root, ...args];
  if (kitBin) argv.push("--var", `kitBin=${path.join(root, "gate.mjs")}`);
  const started = Date.now();
  const result = spawnSync(process.execPath, argv, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 120_000,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ms: Date.now() - started,
  };
}

/**
 * Read a JSON file.
 *
 * @param {string} file Path.
 * @returns {any} Parsed JSON.
 */
export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Find the single result for a rule (and host) in a report.
 *
 * @param {object} report Report.
 * @param {string} rule Rule id.
 * @param {string} [host] Host name.
 * @returns {object} Result.
 */
export function resultFor(report, rule, host) {
  const matches = report.results.filter((r) => r.rule === rule && (!host || r.host === host));
  if (matches.length !== 1) {
    throw new Error(`expected one result for ${rule}, got ${matches.length}`);
  }
  return matches[0];
}

/**
 * Run git in a directory and return trimmed stdout.
 *
 * @param {string} cwd Repository.
 * @param {string[]} args Git arguments.
 * @returns {string} Output.
 */
export function git(cwd, args) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith("GIT_")) delete env[name];
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * Whether a process id is alive.
 *
 * @param {number} pid Process id.
 * @returns {boolean} True when the process exists.
 */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
