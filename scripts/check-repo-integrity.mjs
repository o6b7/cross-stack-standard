#!/usr/bin/env node
/**
 * check-repo-integrity.mjs — structural checks on the files git tracks (committed or staged):
 *
 *   private-path   nothing under the private working directories `_input/` or `_work/`
 *   env-file       no `.env` or `.env.*` file (templates ending in `.example` are allowed)
 *   local-file     no machine-local file (`CLAUDE.local.md`, `.claude/settings.local.json`)
 *
 * Starting child processes through a shell is banned by ESLint (eslint.config.mjs), which sees
 * every form of the `shell` option and the shell-only `exec`/`execSync` imports.
 *
 * Usage:
 *   node scripts/check-repo-integrity.mjs [--root <dir>] [--json]
 *
 * Exit codes: 0 clean, 1 violations found, 2 usage error or git missing.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isEntryPoint } from "./lib/entry.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Top-level directories that hold private working material and are never tracked. */
export const PRIVATE_DIRS = ["_input", "_work"];

/** Machine-local files that are gitignored and must never be tracked. */
export const LOCAL_FILES = ["CLAUDE.local.md", ".claude/settings.local.json"];

const USAGE = `Usage:
  node scripts/check-repo-integrity.mjs [--root <dir>] [--json]

Checks the files git tracks for private working directories (${PRIVATE_DIRS.map((d) => `${d}/`).join(", ")}),
.env files and machine-local files. (ESLint bans starting child processes through a shell.)

Exit codes: 0 clean, 1 violations found, 2 usage error or git missing.`;

/**
 * @typedef {object} Finding
 * @property {string} id Check id.
 * @property {string} file POSIX path relative to the root.
 * @property {number} line 1-based line (1 for path-level findings).
 * @property {string} message
 */

/**
 * Path-level checks on a list of tracked files.
 *
 * @param {string[]} files POSIX paths relative to the root.
 * @returns {Finding[]}
 */
export function checkPaths(files) {
  const findings = [];
  const localFiles = new Set(LOCAL_FILES.map((f) => f.toLowerCase()));
  for (const file of files) {
    const lower = file.toLowerCase();
    const top = lower.split("/")[0];
    if (PRIVATE_DIRS.includes(top) && lower.includes("/")) {
      findings.push({
        id: "private-path",
        file,
        line: 1,
        message: `private working material is tracked; run "git rm --cached -- ${file}" (${top}/ is gitignored)`,
      });
    }
    const base = lower.split("/").pop();
    if ((base === ".env" || base.startsWith(".env.")) && !base.endsWith(".example")) {
      findings.push({
        id: "env-file",
        file,
        line: 1,
        message: "environment file is tracked; commit a .env.example template instead",
      });
    }
    if (localFiles.has(lower)) {
      findings.push({
        id: "local-file",
        file,
        line: 1,
        message: "machine-local file is tracked; it is gitignored on purpose",
      });
    }
  }
  return findings;
}

/**
 * Tracked files (committed and staged) of the repository at `root`.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function trackedFiles(root) {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z", "--cached"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`cannot run git: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr.trim()}`);
  return result.stdout.split("\0").filter(Boolean);
}

/**
 * Run every check against a repository.
 *
 * @param {string} root Repository root.
 * @returns {{files: number, findings: Finding[]}}
 */
export function checkRepository(root) {
  const files = trackedFiles(root);
  return { files: files.length, findings: checkPaths(files) };
}

/**
 * Command-line entry point.
 *
 * @param {string[]} argv Arguments after the script path.
 * @param {{stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream}} [io]
 * @returns {number} Exit code.
 */
export function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        root: { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    stderr.write(`check-repo-integrity: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  let report;
  try {
    report = checkRepository(path.resolve(values.root ?? DEFAULT_ROOT));
  } catch (error) {
    stderr.write(`check-repo-integrity: ${error.message}\n`);
    return 2;
  }
  const ok = report.findings.length === 0;
  if (values.json) {
    stdout.write(
      `${JSON.stringify({ ok, files: report.files, findings: report.findings }, null, 2)}\n`,
    );
  } else {
    for (const f of report.findings) stdout.write(`${f.id} ${f.file}:${f.line} ${f.message}\n`);
    stdout.write(
      ok
        ? `repo integrity: ${report.files} tracked files, no problems\n`
        : `repo integrity: ${report.findings.length} problem(s) in ${report.files} tracked files\n`,
    );
  }
  return ok ? 0 : 1;
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
