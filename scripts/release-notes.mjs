#!/usr/bin/env node
/**
 * release-notes.mjs — cut the release notes for one version out of CHANGELOG.md
 * (Keep a Changelog 1.1.0 format). Used by the release workflow; also exports the changelog
 * parser that `check-changelog.mjs` reuses.
 *
 * Usage:
 *   node scripts/release-notes.mjs --tag v1.2.3 [--out notes.md]
 *   node scripts/release-notes.mjs --version 1.2.3 [--changelog CHANGELOG.md] [--json]
 *
 * Exit codes: 0 notes written, 1 the version's section is missing, undated or empty,
 * 2 usage or internal error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isEntryPoint } from "./lib/entry.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** SemVer 2.0.0 (no leading "v"), from semver.org. */
export const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Keep a Changelog 1.1.0 change categories. */
export const CATEGORIES = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];

const SECTION_RE = /^##\s+(?:\[([^\]]+)\]|(\S+))(?:\s+-\s+(\S+))?(?:\s+\[YANKED\])?\s*$/;
const LINK_DEF_RE = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const USAGE = `Usage:
  node scripts/release-notes.mjs --tag vX.Y.Z [options]
  node scripts/release-notes.mjs --version X.Y.Z [options]

Prints the CHANGELOG.md section for one released version (without its heading), ready for
"gh release create --notes-file".

Options:
  --tag <tag>          Release tag (vX.Y.Z or refs/tags/vX.Y.Z)
  --version <version>  Version without the "v"
  --changelog <file>   Changelog file (default: <root>/CHANGELOG.md)
  --out <file>         Write the notes to a file instead of stdout
  --root <dir>         Repository root (default: resolved from this script)
  --json               Print a machine-readable report
  --help               Show this help

Exit codes: 0 success, 1 section missing, undated or empty, 2 usage or internal error.`;

/** A problem with the changelog content; maps to exit code 1. */
export class ChangelogError extends Error {
  /**
   * @param {string} code Stable finding id.
   * @param {string} message
   * @param {number} line 1-based line the finding points at.
   */
  constructor(code, message, line = 1) {
    super(message);
    this.name = "ChangelogError";
    this.code = code;
    this.line = line;
  }
}

/**
 * @typedef {object} ChangelogSection
 * @property {string} title Heading label ("Unreleased" or a version).
 * @property {boolean} unreleased True for the "Unreleased" section.
 * @property {string|null} version SemVer string, or null when the label is not a version.
 * @property {string|null} date The ISO date after the label, if any.
 * @property {number} line 1-based line of the "## " heading.
 * @property {string[]} lines Body lines (without the heading and without the trailing link block).
 */

/**
 * Parse a Keep a Changelog file into sections and link reference definitions.
 * Headings inside fenced code blocks are ignored.
 *
 * @param {string} text Changelog contents.
 * @returns {{sections: ChangelogSection[], links: Map<string, string>}}
 */
export function parseChangelog(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  /** @type {ChangelogSection[]} */
  const sections = [];
  const links = new Map();
  let current = null;
  let fence = null;
  lines.forEach((raw, index) => {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(raw);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
    }
    const heading = fence ? null : SECTION_RE.exec(raw);
    if (heading) {
      const title = (heading[1] ?? heading[2]).trim();
      const unreleased = title.toLowerCase() === "unreleased";
      const bare = title.replace(/^v/, "");
      current = {
        title,
        unreleased,
        version: !unreleased && SEMVER_RE.test(bare) ? bare : null,
        date: heading[3] ?? null,
        line: index + 1,
        lines: [],
      };
      sections.push(current);
      return;
    }
    const link = fence ? null : LINK_DEF_RE.exec(raw);
    if (link) links.set(link[1].toLowerCase(), link[2]);
    if (current) current.lines.push(raw);
  });
  // The link reference block at the end of the file belongs to no section.
  const last = sections.at(-1);
  if (last) {
    while (last.lines.length) {
      const tail = last.lines.at(-1);
      if (tail.trim() === "" || LINK_DEF_RE.test(tail)) last.lines.pop();
      else break;
    }
  }
  return { sections, links };
}

/**
 * True when a section body has at least one line that is not blank and not a heading.
 *
 * @param {string[]} lines
 * @returns {boolean}
 */
export function hasContent(lines) {
  return lines.some((line) => line.trim() !== "" && !/^\s{0,3}#{1,6}\s/.test(line));
}

/**
 * Normalise a tag or version argument to a bare SemVer string.
 *
 * @param {string} value "v1.2.3", "refs/tags/v1.2.3" or "1.2.3".
 * @returns {string}
 */
export function normaliseVersion(value) {
  const bare = String(value)
    .trim()
    .replace(/^refs\/tags\//, "")
    .replace(/^v/, "");
  if (!SEMVER_RE.test(bare)) {
    throw new TypeError(`"${value}" is not a SemVer version or a vX.Y.Z tag`);
  }
  return bare;
}

/**
 * Extract the release notes for one version.
 *
 * @param {string} text Changelog contents.
 * @param {string} version Bare SemVer version.
 * @returns {{version: string, date: string, line: number, notes: string, compareUrl: string|null}}
 * @throws {ChangelogError} When the section is missing, undated or empty.
 */
export function extractReleaseNotes(text, version) {
  const { sections, links } = parseChangelog(text);
  const section = sections.find((s) => s.version === version);
  if (!section) {
    const known = sections.filter((s) => s.version).map((s) => s.version);
    throw new ChangelogError(
      "CHANGELOG-NO-SECTION",
      `no "## [${version}] - YYYY-MM-DD" section (released versions: ${known.join(", ") || "none"}); finalize the changelog on the release branch`,
    );
  }
  if (!section.date || !DATE_RE.test(section.date)) {
    throw new ChangelogError(
      "CHANGELOG-NO-DATE",
      `section ${version} has no release date; write "## [${version}] - YYYY-MM-DD"`,
      section.line,
    );
  }
  if (!hasContent(section.lines)) {
    throw new ChangelogError("CHANGELOG-EMPTY", `section ${version} has no entries`, section.line);
  }
  const body = [...section.lines];
  while (body.length && body[0].trim() === "") body.shift();
  while (body.length && body.at(-1).trim() === "") body.pop();

  // Carry over link definitions the body references (e.g. "[#12]"), except version labels.
  const bodyText = body.join("\n");
  const referenced = [];
  for (const [label, url] of links) {
    if (label === "unreleased" || SEMVER_RE.test(label.replace(/^v/, ""))) continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const usesLabel = new RegExp(`\\[${escaped}\\](?!:)`, "i").test(bodyText);
    const definedInBody = new RegExp(`^\\s{0,3}\\[${escaped}\\]:`, "im").test(bodyText);
    if (usesLabel && !definedInBody) referenced.push(`[${label}]: ${url}`);
  }
  const compareUrl =
    links.get(version.toLowerCase()) ?? links.get(`v${version}`.toLowerCase()) ?? null;
  let notes = bodyText;
  if (referenced.length) notes += `\n\n${referenced.join("\n")}`;
  if (compareUrl) notes += `\n\n**Full changelog:** ${compareUrl}`;
  return { version, date: section.date, line: section.line, notes: `${notes}\n`, compareUrl };
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
        tag: { type: "string" },
        version: { type: "string" },
        changelog: { type: "string" },
        out: { type: "string" },
        root: { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    stderr.write(`release-notes: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!values.tag === !values.version) {
    stderr.write(`release-notes: pass exactly one of --tag or --version\n\n${USAGE}\n`);
    return 2;
  }
  const root = path.resolve(values.root ?? DEFAULT_ROOT);
  const changelogPath = path.resolve(root, values.changelog ?? "CHANGELOG.md");
  const shown = path.relative(root, changelogPath).split(path.sep).join("/") || "CHANGELOG.md";

  let version;
  try {
    version = normaliseVersion(values.tag ?? values.version);
  } catch (error) {
    stderr.write(`release-notes: ${error.message}\n`);
    return 2;
  }
  let text;
  try {
    text = readFileSync(changelogPath, "utf8");
  } catch (error) {
    stderr.write(`release-notes: cannot read ${shown}: ${error.message}\n`);
    return 2;
  }
  try {
    const result = extractReleaseNotes(text, version);
    if (values.out) writeFileSync(path.resolve(values.out), result.notes);
    if (values.json) {
      stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
    } else if (values.out) {
      stdout.write(`release notes for ${version} (${result.date}) written to ${values.out}\n`);
    } else {
      stdout.write(result.notes);
    }
    return 0;
  } catch (error) {
    if (!(error instanceof ChangelogError)) {
      stderr.write(`release-notes: ${error.stack ?? error.message}\n`);
      return 2;
    }
    if (values.json) {
      stdout.write(
        `${JSON.stringify({ ok: false, version, findings: [{ id: error.code, file: shown, line: error.line, message: error.message }] }, null, 2)}\n`,
      );
    } else {
      stderr.write(`${error.code} ${shown}:${error.line} ${error.message}\n1 problem\n`);
    }
    return 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
