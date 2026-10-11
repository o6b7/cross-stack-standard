#!/usr/bin/env node
/**
 * check-changelog.mjs — fail a pull request that changes files outside `docs/` and `test/`
 * without adding a changelog entry.
 *
 * The check compares the changelog at the base ref with the changelog at the head ref. An entry
 * is a list item that is new at the head either under "## [Unreleased]" (a feature pull request)
 * or under a version section that the base does not have (a release or hotfix pull request, which
 * moves the entries into "## [X.Y.Z] - YYYY-MM-DD"). Every new item must sit under a Keep a
 * Changelog category ("### Added", "### Changed", "### Deprecated", "### Removed", "### Fixed",
 * "### Security"), and a new version section must name the version in VERSION at the head.
 *
 * A pull request from `main` (the back-merge of a release into `dev`) needs no entry: it only
 * brings back what the release already recorded. Pass the pull request's head branch with
 * `--head-ref` (CI reads it from github.head_ref).
 *
 * Usage:
 *   node scripts/check-changelog.mjs --base <ref> [--head <ref>] [--head-ref <branch>] [--json]
 *
 * Exit codes: 0 entry present or not needed, 1 entry missing or misplaced, 2 usage or git error.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CATEGORIES, parseChangelog } from "./release-notes.mjs";
import { isEntryPoint } from "./lib/entry.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = "CHANGELOG.md";

/** Path prefixes whose changes never need a changelog entry. */
export const EXEMPT_PREFIXES = ["docs/", "test/"];

const USAGE = `Usage:
  node scripts/check-changelog.mjs --base <ref> [--head <ref>] [options]

Fails when the changes between <base> and <head> touch files outside ${EXEMPT_PREFIXES.join(" and ")}
and ${CHANGELOG} gains no new entry, under "## [Unreleased]" or under a new version section
(a release or hotfix; the version must match VERSION). A pull request from main (a release
back-merge) needs no entry.

Options:
  --base <ref>        Base commit or ref (required; e.g. the pull request's base SHA)
  --head <ref>        Head commit or ref (default: HEAD)
  --head-ref <name>   The pull request's head branch (github.head_ref); "main" is a back-merge
  --root <dir>        Repository root (default: resolved from this script)
  --json              Print a machine-readable report
  --help              Show this help

Exit codes: 0 pass, 1 entry missing or misplaced, 2 usage or git error.`;

/** A git failure; maps to exit code 2. */
class GitError extends Error {}

/**
 * Run git without a shell and return stdout.
 *
 * @param {string} root Repository root.
 * @param {string[]} args git arguments.
 * @param {{allowFailure?: boolean}} [options]
 * @returns {{ok: boolean, stdout: string, stderr: string}}
 */
function git(root, args, options = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new GitError(`cannot run git: ${result.error.message}`);
  const ok = result.status === 0;
  if (!ok && !options.allowFailure) {
    throw new GitError(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return { ok, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Files changed between the merge base of `base` and `head`, and `head` (renames count as a
 * deletion plus an addition, so moving a file out of an exempt directory is seen).
 *
 * @param {string} root
 * @param {string} base
 * @param {string} head
 * @returns {string[]} POSIX paths relative to the root.
 */
export function changedFiles(root, base, head) {
  for (const ref of [base, head]) {
    if (
      !git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { allowFailure: true }).ok
    ) {
      throw new GitError(
        `unknown ref "${ref}"; fetch enough history (actions/checkout with fetch-depth: 0)`,
      );
    }
  }
  const out = git(root, ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`]).stdout;
  return out.split("\0").filter(Boolean);
}

/**
 * True when a path needs no changelog entry.
 *
 * @param {string} file POSIX path relative to the root.
 * @returns {boolean}
 */
export function isExempt(file) {
  return EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/**
 * List items of one changelog section with their category and line.
 *
 * @param {{ line: number, lines: string[] }} section
 * @returns {{text: string, category: string|null, line: number}[]}
 */
function sectionEntries(section) {
  const entries = [];
  let category = null;
  section.lines.forEach((raw, index) => {
    const heading = /^###\s+(.+?)\s*$/.exec(raw);
    if (heading) {
      category = heading[1];
      return;
    }
    const item = /^[-*+]\s+(.*\S)\s*$/.exec(raw);
    if (item) {
      entries.push({
        text: item[1].replace(/\s+/g, " "),
        category,
        line: section.line + 1 + index,
      });
    }
  });
  return entries;
}

/**
 * List items of the Unreleased section with their category and line.
 *
 * @param {string} text Changelog contents.
 * @returns {{found: boolean, line: number, entries: {text: string, category: string|null, line: number}[]}}
 */
export function unreleasedEntries(text) {
  const { sections } = parseChangelog(text);
  const section = sections.find((s) => s.unreleased);
  if (!section) return { found: false, line: 1, entries: [] };
  return { found: true, line: section.line, entries: sectionEntries(section) };
}

/**
 * Version sections of the head changelog that the base changelog does not have, with their
 * entries.
 *
 * @param {string|null} baseText
 * @param {string} headText
 * @returns {{version: string, date: string|null, line: number, entries: {text: string, category: string|null, line: number}[]}[]}
 */
export function newVersionSections(baseText, headText) {
  const before = new Set(
    baseText === null
      ? []
      : parseChangelog(baseText)
          .sections.map((s) => s.version)
          .filter(Boolean),
  );
  return parseChangelog(headText)
    .sections.filter((s) => s.version && !before.has(s.version))
    .map((s) => ({ version: s.version, date: s.date, line: s.line, entries: sectionEntries(s) }));
}

/**
 * Compare two versions of the changelog and report problems for a change set.
 *
 * @param {object} input
 * @param {string[]} input.files Changed files.
 * @param {string|null} input.baseText Changelog at the base (null when absent).
 * @param {string|null} input.headText Changelog at the head (null when absent).
 * @returns {{needed: boolean, relevant: string[], added: {text: string, category: string|null, line: number}[], findings: {id: string, file: string, line: number, message: string}[]}}
 */
export function evaluateChangelog({
  files,
  baseText,
  headText,
  headVersion = null,
  headRef = null,
}) {
  const relevant = files.filter((file) => !isExempt(file));
  const result = {
    needed: relevant.length > 0,
    relevant,
    added: [],
    findings: [],
    kind: "feature",
  };
  if (headRef === "main") {
    // A back-merge of a release into dev: the release pull request already recorded it.
    result.kind = "back-merge";
    result.needed = false;
    return result;
  }
  if (!result.needed) return result;
  const sample = relevant.slice(0, 3).join(", ") + (relevant.length > 3 ? ", …" : "");

  if (headText === null) {
    result.findings.push({
      id: "CHANGELOG-MISSING",
      file: CHANGELOG,
      line: 1,
      message: `${CHANGELOG} does not exist; add it with a "## [Unreleased]" section`,
    });
    return result;
  }
  const head = unreleasedEntries(headText);
  if (!head.found) {
    result.findings.push({
      id: "CHANGELOG-NO-UNRELEASED",
      file: CHANGELOG,
      line: 1,
      message: `no "## [Unreleased]" section; add one above the latest release`,
    });
    return result;
  }
  const remaining = new Map();
  for (const entry of baseText === null ? [] : unreleasedEntries(baseText).entries) {
    remaining.set(entry.text, (remaining.get(entry.text) ?? 0) + 1);
  }
  for (const entry of head.entries) {
    const count = remaining.get(entry.text) ?? 0;
    if (count > 0) remaining.set(entry.text, count - 1);
    else result.added.push(entry);
  }
  // A release or hotfix moves entries into a new dated version section.
  const released = newVersionSections(baseText, headText);
  if (released.length > 0) {
    result.kind = "release";
    for (const section of released) {
      if (headVersion !== null && section.version !== headVersion) {
        result.findings.push({
          id: "CHANGELOG-VERSION",
          file: CHANGELOG,
          line: section.line,
          message: `new section "## [${section.version}]" does not match VERSION (${headVersion})`,
        });
      }
      if (!section.date) {
        result.findings.push({
          id: "CHANGELOG-DATE",
          file: CHANGELOG,
          line: section.line,
          message: `new section "## [${section.version}]" needs a release date (## [${section.version}] - YYYY-MM-DD)`,
        });
      }
      result.added.push(...section.entries);
    }
  }
  if (!result.added.length) {
    result.findings.push({
      id: "CHANGELOG-NO-ENTRY",
      file: CHANGELOG,
      line: head.line,
      message: `no new entry under "## [Unreleased]" or in a new release section for ${relevant.length} changed file(s) outside ${EXEMPT_PREFIXES.join(" and ")} (${sample})`,
    });
  }
  for (const entry of result.added) {
    if (!CATEGORIES.includes(entry.category)) {
      result.findings.push({
        id: "CHANGELOG-CATEGORY",
        file: CHANGELOG,
        line: entry.line,
        message: `new entry is not under a Keep a Changelog category (${CATEGORIES.map((c) => `### ${c}`).join(", ")})`,
      });
    }
  }
  return result;
}

/**
 * Read a file at a ref, or null when it does not exist there.
 *
 * @param {string} root
 * @param {string} ref
 * @param {string} file
 * @returns {string|null}
 */
function showFile(root, ref, file) {
  const result = git(root, ["show", `${ref}:${file}`], { allowFailure: true });
  return result.ok ? result.stdout : null;
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
        base: { type: "string" },
        head: { type: "string", default: "HEAD" },
        "head-ref": { type: "string" },
        root: { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    stderr.write(`check-changelog: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!values.base) {
    stderr.write(`check-changelog: --base <ref> is required\n\n${USAGE}\n`);
    return 2;
  }
  const root = path.resolve(values.root ?? DEFAULT_ROOT);
  let result;
  try {
    const files = changedFiles(root, values.base, values.head);
    const version = showFile(root, values.head, "VERSION");
    result = evaluateChangelog({
      files,
      baseText: showFile(root, values.base, CHANGELOG),
      headText: showFile(root, values.head, CHANGELOG),
      headVersion: version === null ? null : version.trim(),
      headRef: values["head-ref"] ?? null,
    });
  } catch (error) {
    stderr.write(
      `check-changelog: ${error instanceof GitError ? error.message : (error.stack ?? error.message)}\n`,
    );
    return 2;
  }
  const ok = result.findings.length === 0;
  if (values.json) {
    stdout.write(
      `${JSON.stringify({ ok, needed: result.needed, kind: result.kind, relevantFiles: result.relevant, added: result.added, findings: result.findings }, null, 2)}\n`,
    );
  } else {
    for (const f of result.findings) stdout.write(`${f.id} ${f.file}:${f.line} ${f.message}\n`);
    if (result.kind === "back-merge") {
      stdout.write("changelog: not needed (a back-merge from main)\n");
    } else if (!result.needed) {
      stdout.write(`changelog: not needed (only ${EXEMPT_PREFIXES.join(" and ")} changed)\n`);
    } else if (ok) {
      const where = result.kind === "release" ? "release" : "Unreleased";
      stdout.write(
        `changelog: ${result.added.length} new ${where} entr${result.added.length === 1 ? "y" : "ies"}\n`,
      );
    } else {
      stdout.write(`changelog: ${result.findings.length} problem(s)\n`);
    }
  }
  return ok ? 0 : 1;
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
