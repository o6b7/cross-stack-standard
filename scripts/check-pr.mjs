#!/usr/bin/env node
/**
 * check-pr: run the brand-leak guard and the narrative lint over a pull request's text, for pull
 * requests whose CI run has no access to the brand key (for example from forks). A maintainer
 * runs it locally before merging.
 *
 * It fetches with the GitHub CLI (`gh`, the only network access in the repository tooling): the
 * title, body, head branch name, every commit message and commit author, plus the unified diff
 * (changed paths and added lines) unless --no-diff is given. A diff shows no content for binary
 * files, so each changed binary file is reported as unchecked (a failure unless
 * --allow-unchecked-binary). Nothing is printed from the fetched text; findings name a location
 * and a kind only. Narrative warnings are reported but do not fail the check.
 *
 * Exit codes: 0 clean, 1 findings, 2 usage error, missing key, or gh failure.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { lintText } from "./check-narrative.mjs";
import {
  BrandKeyError,
  CLONE_KEY_PATH,
  DenylistError,
  KEY_ENV,
  loadKey,
  readDenylist,
} from "./lib/brand/denylist.mjs";
import { BrandScanner } from "./lib/brand/scan.mjs";
import { gitCommonPath } from "./lib/brand/sources.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPO = "o6b7/cross-stack-standard";
const DENYLIST_PATH = "scripts/brand-denylist.json";

const USAGE = `Usage: node scripts/check-pr.mjs <number> [options]

Fetch a pull request with the GitHub CLI and check its title, body, head branch name, commit
messages and authors, and diff (changed paths, added lines) with the brand-leak guard and the
narrative lint. Binary files have no content in a diff: each one is reported as unchecked.

Options:
  --repo <owner/name>   repository (default: ${DEFAULT_REPO})
  --no-diff             skip the diff (text, authors and branch only)
  --allow-unchecked-binary
                        report changed binary files without failing (after checking them
                        locally: git fetch origin pull/<number>/head, then
                        node scripts/check-brand-leak.mjs --commits <base>..FETCH_HEAD)
  --key-file <file>     file holding the HMAC key (default: $${KEY_ENV}, the file its _FILE
                        variant names, or .git/${CLONE_KEY_PATH})
  --denylist <file>     denylist file (default: ${DENYLIST_PATH} under the root)
  --root <dir>          repository root (default: this script's repository)
  --json                print a JSON report
  --help                print this help

Exit codes: 0 clean, 1 findings, 2 usage error, missing key, or gh failure.`;

const BRAND_TEXT = {
  token: "denylisted token",
  glued: "denylisted token glued inside a longer word",
  phrase: "denylisted phrase",
};

const VIA_TEXT = {
  escapes: " (in escaped or encoded text)",
  markup: " (split by markup)",
  hyphenation: " (split by a hyphenated line break)",
  "data-uri": " (in an embedded base64 data URI)",
};

/** Error raised when gh is missing or fails (exit code 2). */
export class GhError extends Error {}

/**
 * Run gh and return stdout.
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 * @throws {GhError}
 */
function gh(args, env) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
    env: { ...env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" },
  });
  if (result.error) {
    throw new GhError(
      result.error.code === "ENOENT"
        ? "the GitHub CLI (gh) is not installed or not on PATH"
        : `cannot run gh (${result.error.code ?? result.error.message})`,
    );
  }
  if (result.status !== 0) {
    const detail = (result.stderr ?? "").trim().split("\n")[0];
    throw new GhError(`gh ${args.slice(0, 2).join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

/**
 * Decode a path as git prints it: plain, or C-quoted with octal escapes for non-ASCII bytes.
 * @param {string} path
 * @returns {string}
 */
export function unquoteGitPath(path) {
  if (!(path.length >= 2 && path.startsWith('"') && path.endsWith('"'))) return path;
  const escapes = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
  const inner = path.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch !== "\\") {
      bytes.push(...Buffer.from(ch, "utf8"));
    } else if (/[0-7]/u.test(inner[i + 1] ?? "")) {
      bytes.push(Number.parseInt(inner.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      const next = inner[i + 1] ?? "";
      bytes.push(escapes[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/**
 * New-side path from a `diff --git a/<old> b/<new>` header (exact when both sides are equal or
 * quoted; `+++` and `rename to` lines refine it later).
 * @param {string} header text after "diff --git "
 * @returns {string}
 */
function headerPath(header) {
  const quoted = /(?:^|\s)("b\/(?:[^"\\]|\\.)*")$/u.exec(header);
  if (quoted) return unquoteGitPath(quoted[1]).slice(2);
  if (header.startsWith("a/") && (header.length - 5) % 2 === 0) {
    const half = (header.length - 5) / 2;
    const oldPath = header.slice(2, 2 + half);
    if (header.slice(2 + half) === ` b/${oldPath}`) return oldPath;
  }
  const at = header.lastIndexOf(" b/");
  return at >= 0 ? header.slice(at + 3) : "";
}

/**
 * @typedef {object} DiffFile
 * @property {string} path new path (`/`-separated)
 * @property {Array<{ line: number, text: string }>} added added lines with new-file line numbers
 * @property {boolean} binary the diff shows no content for this file ("Binary files … differ"
 *   or a "GIT binary patch")
 */

/**
 * Parse a unified diff (as printed by `gh pr diff`) into changed paths and added lines.
 * @param {string} diff
 * @returns {DiffFile[]}
 */
export function parseUnifiedDiff(diff) {
  /** @type {DiffFile[]} */
  const files = [];
  let current = null;
  let next = 0;
  let inHunk = false;
  for (const line of diff.split(/\r?\n/u)) {
    if (line.startsWith("diff --git ")) {
      current = { path: headerPath(line.slice("diff --git ".length)), added: [], binary: false };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
    if (hunk) {
      next = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      if (/^Binary files .* differ$/u.test(line) || line === "GIT binary patch") {
        current.binary = true;
      } else if (line.startsWith("+++ ") && line !== "+++ /dev/null") {
        current.path = unquoteGitPath(line.slice(4)).replace(/^b\//u, "");
      } else if (line.startsWith("rename to ") || line.startsWith("copy to ")) {
        current.path = unquoteGitPath(line.slice(line.indexOf(" to ") + 4));
      }
      continue;
    }
    if (line.startsWith("+")) {
      current.added.push({ line: next, text: line.slice(1) });
      next += 1;
    } else if (line.startsWith(" ")) {
      next += 1;
    }
  }
  return files.filter((file) => file.path);
}

/**
 * Check fetched pull request data.
 * @param {BrandScanner} scanner
 * @param {{ number: number, title: string, body: string, headRefName: string, commits: Array<{ oid: string, messageHeadline: string, messageBody: string, authors?: Array<{ name?: string, email?: string, login?: string }> }> }} pr
 * @param {DiffFile[]} diffFiles
 * @returns {Array<{ id: string, check: "brand" | "narrative", severity: "error" | "warning", path: string, line: number, kind: string, message: string }>}
 */
export function checkPullRequest(scanner, pr, diffFiles) {
  const findings = [];
  const brand = (path, line, kind, detail = "") =>
    findings.push({
      id: "BRAND-LEAK",
      check: "brand",
      severity: "error",
      path,
      line,
      kind,
      message: `${BRAND_TEXT[kind]}${detail}`,
    });
  const narrative = (path, finding, lineOf = (n) => n) =>
    findings.push({
      id: "NARRATIVE",
      check: "narrative",
      severity: finding.severity,
      path,
      line: lineOf(finding.line),
      kind: finding.rule,
      message: `${finding.severity === "warning" ? "warning: " : ""}${finding.rule} (column ${finding.column}): ${finding.message}`,
    });
  const both = (text, path) => {
    for (const hit of scanner.scanText(text)) {
      brand(path, hit.line, hit.kind, hit.via ? VIA_TEXT[hit.via] : "");
    }
    for (const finding of lintText(text)) narrative(path, finding);
  };
  const label = `pr#${pr.number}`;
  both(pr.title ?? "", `${label}:title`);
  both(pr.body ?? "", `${label}:body`);
  for (const hit of scanner.scanPath(pr.headRefName ?? "")) {
    brand(`${label}:branch`, 0, hit.kind, " in the head branch name");
  }
  for (const commit of pr.commits ?? []) {
    const message = [commit.messageHeadline ?? "", commit.messageBody ?? ""]
      .filter(Boolean)
      .join("\n\n");
    const location = `commit:${String(commit.oid ?? "").slice(0, 12)}`;
    both(message, location);
    for (const author of commit.authors ?? []) {
      const identity = [author.name, author.email, author.login].filter(Boolean).join("\n");
      const kinds = scanner.scanText(identity).map((hit) => hit.kind);
      const best = ["token", "glued", "phrase"].find((kind) => kinds.includes(kind));
      if (best) brand(`${location}:author`, 0, best, " in a name, email address or login");
    }
  }
  for (const file of diffFiles) {
    const location = scanner.redactPath(file.path);
    for (const hit of scanner.scanPath(file.path)) {
      brand(location, 0, hit.kind, " in a changed path");
    }
    if (file.binary) {
      findings.push({
        id: "BINARY-UNCHECKED",
        check: "brand",
        severity: "error",
        path: location,
        line: 0,
        kind: "binary",
        message:
          "binary file not inspected: a diff has no content for it; fetch the pull request " +
          "head and scan it locally, then pass --allow-unchecked-binary",
      });
    }
    if (file.added.length === 0) continue;
    const text = file.added.map((added) => added.text).join("\n");
    const lineOf = (n) => file.added[n - 1]?.line ?? 0;
    for (const hit of scanner.scanText(text)) {
      const detail = hit.via ? ` (added line,${VIA_TEXT[hit.via].slice(1, -1)})` : " (added line)";
      brand(location, lineOf(hit.line), hit.kind, detail);
    }
    for (const finding of lintText(text)) narrative(location, finding, lineOf);
  }
  return findings;
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, env?: NodeJS.ProcessEnv, cwd?: string }} [io]
 * @returns {number} exit code
 */
export function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const fail = (message) => {
    stderr.write(`check-pr: ${message}\n`);
    return 2;
  };
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        repo: { type: "string" },
        "no-diff": { type: "boolean" },
        "allow-unchecked-binary": { type: "boolean" },
        "key-file": { type: "string" },
        denylist: { type: "string" },
        root: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    return fail(`${error.message}\n\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (positionals.length !== 1 || !/^[1-9]\d*$/u.test(positionals[0])) {
    return fail(`expected one pull request number\n\n${USAGE}`);
  }
  const repo = values.repo ?? DEFAULT_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo)) return fail("--repo must look like owner/name");
  const root = resolve(cwd, values.root ?? DEFAULT_ROOT);
  const number = positionals[0];

  let scanner;
  try {
    const key = loadKey({
      keyFile: values["key-file"] && resolve(cwd, values["key-file"]),
      env,
      cloneKeyFile: gitCommonPath(root, CLONE_KEY_PATH),
    });
    scanner = new BrandScanner(
      readDenylist(resolve(cwd, values.denylist ?? resolve(root, DENYLIST_PATH))),
      key,
    );
  } catch (error) {
    if (error instanceof BrandKeyError || error instanceof DenylistError)
      return fail(error.message);
    throw error;
  }

  let pr;
  let diffFiles = [];
  try {
    const view = gh(
      ["pr", "view", number, "--repo", repo, "--json", "number,title,body,headRefName,commits"],
      env,
    );
    try {
      pr = JSON.parse(view);
    } catch {
      throw new GhError("gh pr view returned invalid JSON");
    }
    if (!values["no-diff"]) {
      diffFiles = parseUnifiedDiff(
        gh(["pr", "diff", number, "--repo", repo, "--color", "never"], env),
      );
    }
  } catch (error) {
    if (error instanceof GhError) return fail(scanner.redactText(error.message));
    throw error;
  }
  pr.number = pr.number ?? Number(number);

  const all = checkPullRequest(scanner, pr, diffFiles);
  const allowBinary = values["allow-unchecked-binary"] === true;
  const failing = all.filter(
    (f) => f.severity === "error" && !(allowBinary && f.id === "BINARY-UNCHECKED"),
  );
  const summary = {
    findings: failing.length,
    brand: all.filter((f) => f.check === "brand" && f.id === "BRAND-LEAK").length,
    narrative: all.filter((f) => f.check === "narrative" && f.severity === "error").length,
    warnings: all.filter((f) => f.severity === "warning").length,
    uncheckedBinaries: all.filter((f) => f.id === "BINARY-UNCHECKED").length,
    commits: (pr.commits ?? []).length,
    changedFiles: diffFiles.length,
  };
  if (values.json) {
    stdout.write(
      `${JSON.stringify({ tool: "check-pr", repo, number: pr.number, ok: failing.length === 0, summary, findings: all }, null, 2)}\n`,
    );
  } else {
    for (const f of all) stdout.write(`${f.id} ${f.path}:${f.line} ${f.message}\n`);
    const extras = [
      summary.warnings > 0 ? `, ${count(summary.warnings, "narrative warning")}` : "",
      summary.uncheckedBinaries > 0
        ? `, ${count(summary.uncheckedBinaries, "binary file")} not inspected${allowBinary ? " (allowed)" : ""}`
        : "",
    ].join("");
    stdout.write(
      `check-pr: ${count(failing.length, "finding")} (${summary.brand} brand, ${summary.narrative} narrative${extras}) ` +
        `in ${repo}#${pr.number}: title, body, branch, ${count(summary.commits, "commit")}` +
        `${values["no-diff"] ? "" : `, ${count(summary.changedFiles, "changed file")}`}\n`,
    );
  }
  return failing.length > 0 ? 1 : 0;
}

/**
 * "1 file", "2 files".
 * @param {number} n
 * @param {string} noun singular
 * @param {string} [plural]
 * @returns {string}
 */
function count(n, noun, plural = `${noun}s`) {
  return `${n} ${n === 1 ? noun : plural}`;
}

const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
