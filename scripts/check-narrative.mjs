#!/usr/bin/env node
/**
 * check-narrative: fail when committed text, commit messages or pull request text contain
 * internal working notation that must never appear in public artifacts: research keys, internal
 * decision and audit markers, legacy rule identifiers, work-session labels, mandate narrative,
 * and references to a private application presented as "the reference" app. Rationale is
 * written neutrally instead ("a common defect is ...").
 *
 * Two severities. Internal notation (research keys, decision and audit markers, legacy rule
 * identifiers) is an error: it never appears in public text. Generic narrative phrases (a work
 * session label, mandate narrative, "the reference" implementation or app) are warnings: they
 * are also ordinary English, so they are reported for review and fail only with --strict.
 *
 * A line can carry an escape comment `narrative-ok: <reason>`; the reason is required. Patterns
 * spanning a line break (with comment markers such as `*`, `//`, `#` or `>` at the start of the
 * next line) are still matched. Findings show a location and a rule, never the matched text.
 *
 * Exit codes: 0 clean or warnings only, 1 errors (or warnings with --strict), 2 usage error or
 * unreadable input.
 */
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { isBinary } from "./lib/brand/binary.mjs";
import {
  SourceError,
  commitMessageText,
  commitMessages,
  pathFiles,
  readEntry,
  readStdin,
  stagedFiles,
  toPosix,
  treeFiles,
} from "./lib/brand/sources.mjs";

const ID = "NARRATIVE";
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @typedef {object} NarrativeRule
 * @property {string} id
 * @property {"error" | "warning"} severity
 * @property {string} message
 * @property {RegExp} pattern global regular expression
 */

/** @type {ReadonlyArray<NarrativeRule>} */
export const NARRATIVE_RULES = Object.freeze([
  {
    id: "research-key",
    severity: "error",
    message: "internal research key (a short lowercase prefix, a colon, M, R or V and a number)",
    // The internal notation uses the letter codes M, R and V only, so tool keys such as a
    // static-analysis rule "php:S100" or a CSS "sm:P1" are not matched.
    pattern: /\b[a-z]{2,4}:[MRV]\d{1,3}\b/gu,
  },
  {
    id: "decision-marker",
    severity: "error",
    message: "internal decision marker (D, number, dot, number, in a citation)",
    // Matched where a citation puts it: right after an opening parenthesis, a slash, "per",
    // "decision(s)" or a dash or arrow, or right before a closing parenthesis, a semicolon, a
    // slash or a spaced dash; a two-digit major number is matched anywhere. A product version
    // in running text ("the D1.2 guide") and a library name with a dot ("D3.js") are not.
    pattern: new RegExp(
      [
        "\\bD\\d{2}\\.\\d{1,2}\\b(?!\\.\\d)",
        "(?:(?<=\\()|(?<=/)|(?<=\\bdecisions?\\s)|(?<=\\bper\\s)|(?<=[\\u2014\\u2192]\\s?))D\\d\\.\\d{1,2}\\b(?!\\.\\d)",
        "\\bD\\d\\.\\d{1,2}(?=[);/]|\\s[\\u2014\\u2192])",
      ].join("|"),
      "gu",
    ),
  },
  {
    id: "legacy-rule-id",
    severity: "error",
    message: "legacy rule identifier with an L: prefix",
    pattern: /\bL:[A-Z][A-Z0-9]{1,5}-\d{2,4}\b/gu,
  },
  {
    id: "audit-marker",
    severity: "error",
    message: "internal audit finding marker (letter, hyphen, F and a number)",
    pattern: /\b[A-Z]-F\d{1,2}\b/gu,
  },
  {
    id: "audit-marker",
    severity: "error",
    message: "internal audit finding marker (F and a number right after audit or FAIL)",
    // The marker follows the word audit or FAIL directly (a slash-separated list is one match);
    // a function key or an F1 score elsewhere on the line is not matched.
    pattern: /\b(?:[Aa]udit(?:ed)?|FAIL(?:ED|S)?)[\s:#(-]{1,4}F\d{1,2}(?:\/F\d{1,2})*\b/gu,
  },
  {
    id: "session-label",
    severity: "warning",
    message: "internal work-session label (Session followed by a single capital A to D, or 3)",
    // Same line only, and not part of a longer word ("Session B-tree", a heading followed by a
    // paragraph).
    pattern: /\bSessions?[ \t]+[A-D3](?![\w-])/gu,
  },
  {
    id: "mandate-narrative",
    severity: "warning",
    message: "internal mandate narrative; state the rationale instead",
    pattern: /\bowner(?:['\u2019]s)?[\s-]+mandate/giu,
  },
  {
    id: "private-reference",
    severity: "warning",
    message:
      'possible reference to a private application as "the reference" implementation, app or ' +
      "client; describe the defect neutrally, or escape a generic use with narrative-ok",
    pattern:
      /\bthe\s+reference(?:['\u2019]s\b|\s+(?:implementation|app|application|client)s?(?:['\u2019]s)?\b(?!\s+of\b))/giu,
  },
]);

const ESCAPE = /narrative-ok[:](.*)$/u;
const COMMENT_CLOSERS = /\s*(?:-->|\*\/|%>|#\}|\}\})\s*$/u;
const LINE_BREAK = /\r\n|\n|\r/gu;
// Comment and quote markers at the start of a line; masked so phrases can wrap across lines.
const LINE_MARKERS = /^([ \t]*)((?:\/\/+|\/\*+|\*+|#+|(?:>[ \t]?)+|;+|--+|<!--|%+)?)/gmu;

/**
 * @typedef {object} NarrativeFinding
 * @property {number} line
 * @property {number} column
 * @property {string} rule
 * @property {"error" | "warning"} severity
 * @property {string} message
 */

/**
 * Parse a line's escape comment.
 * @param {string} line
 * @returns {{ valid: boolean, column: number } | null}
 */
export function parseEscape(line) {
  const match = ESCAPE.exec(line);
  if (!match) return null;
  const reason = match[1].replace(COMMENT_CLOSERS, "").trim();
  return { valid: /\p{L}.*\p{L}/su.test(reason), column: match.index + 1 };
}

/**
 * Replace leading comment/quote markers with spaces of the same length (offsets are kept).
 * @param {string} text
 * @returns {string}
 */
export function maskLineMarkers(text) {
  return text.replace(LINE_MARKERS, (_all, indent, marker) => indent + " ".repeat(marker.length));
}

/**
 * Lint one text.
 * @param {string} text
 * @returns {NarrativeFinding[]} sorted by position
 */
export function lintText(text) {
  const lineStarts = [0];
  for (const match of text.matchAll(LINE_BREAK)) lineStarts.push(match.index + match[0].length);
  const lines = text.split(/\r\n|\n|\r/u);
  const lineOf = (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
  /** @type {NarrativeFinding[]} */
  const findings = [];
  const escapes = lines.map(parseEscape);
  escapes.forEach((escape, index) => {
    if (escape && !escape.valid) {
      findings.push({
        line: index + 1,
        column: escape.column,
        rule: "escape-without-reason",
        severity: "error",
        message: "narrative-ok escape needs a reason after the colon",
      });
    }
  });
  const masked = maskLineMarkers(text);
  for (const rule of NARRATIVE_RULES) {
    for (const match of masked.matchAll(rule.pattern)) {
      const first = lineOf(match.index);
      const last = lineOf(match.index + match[0].length - 1);
      let escaped = false;
      for (let line = first; line <= last && !escaped; line += 1) {
        escaped = escapes[line - 1]?.valid === true;
      }
      if (escaped) continue;
      findings.push({
        line: first,
        column: match.index - lineStarts[first - 1] + 1,
        rule: rule.id,
        severity: rule.severity,
        message: rule.message,
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

const USAGE = `Usage: node scripts/check-narrative.mjs [mode] [options]

Fail on internal working notation in committed or published text, and warn on generic narrative
phrases that often carry it. Escape a deliberate use on its line with a comment
"narrative-ok: <reason>".

Modes (pick one; --tree is the default):
  --tree                  every text file of the repository (git ls-files in a git work tree,
                          else a walk that applies .gitignore, negations included)
  --paths <path...>       the given files and directories
  --staged                staged file contents (pre-commit)
  --stdin                 text from standard input (PR titles and bodies, release notes)
  --commit-msg <file>     a commit message file (commit-msg hook); everything above a scissors
                          line is linted, comment lines included
  --commits <range>       every commit message of a revision range (base..head)

Options:
  --strict                warnings fail too (exit 1)
  --root <dir>            repository root (default: this script's repository)
  --label <name>          location label for --stdin (default: <stdin>)
  --json                  print a JSON report
  --help                  print this help

Exit codes: 0 clean or warnings only, 1 errors (or warnings with --strict), 2 usage error or
unreadable input.`;

/** Error for invalid command-line usage (exit code 2). */
class UsageError extends Error {}

/**
 * @param {string[]} argv
 */
function parseOptions(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        tree: { type: "boolean" },
        paths: { type: "boolean" },
        staged: { type: "boolean" },
        stdin: { type: "boolean" },
        "commit-msg": { type: "string" },
        commits: { type: "string" },
        strict: { type: "boolean" },
        root: { type: "string" },
        label: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw new UsageError(error.message);
  }
  const { values, positionals } = parsed;
  const modes = ["tree", "paths", "staged", "stdin", "commit-msg", "commits"].filter(
    (mode) => values[mode] !== undefined,
  );
  if (modes.length > 1) throw new UsageError(`choose one mode (got --${modes.join(", --")})`);
  const mode = modes[0] ?? "tree";
  if (positionals.length > 0 && mode !== "paths") {
    throw new UsageError(`unexpected argument for --${mode}`);
  }
  if (mode === "paths" && positionals.length === 0) {
    throw new UsageError("--paths needs at least one path");
  }
  return { mode, values, positionals };
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, cwd?: string }} [io]
 * @returns {number} exit code
 */
export function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const cwd = io.cwd ?? process.cwd();
  let options;
  try {
    options = parseOptions(argv);
  } catch (error) {
    stderr.write(`check-narrative: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  const { mode, values, positionals } = options;
  if (values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  const root = resolve(cwd, values.root ?? DEFAULT_ROOT);
  const findings = [];
  const stats = { files: 0, skippedBinary: 0, texts: 0, commits: 0 };
  const lint = (text, path) => {
    for (const finding of lintText(text)) findings.push({ id: ID, path, ...finding });
  };
  const lintEntries = (entries) => {
    for (const entry of entries) {
      const buffer = readEntry(entry);
      if (!buffer) continue;
      if (isBinary(buffer)) {
        stats.skippedBinary += 1;
        continue;
      }
      stats.files += 1;
      lint(buffer.toString("utf8"), entry.path);
    }
  };
  try {
    switch (mode) {
      case "tree":
        lintEntries(treeFiles(root).files);
        break;
      case "paths":
        lintEntries(pathFiles(root, positionals, cwd));
        break;
      case "staged":
        lintEntries(stagedFiles(root));
        break;
      case "stdin":
        stats.texts += 1;
        lint(readStdin(), values.label ?? "<stdin>");
        break;
      case "commit-msg": {
        const entry = {
          path: toPosix(values["commit-msg"]),
          abs: resolve(cwd, values["commit-msg"]),
          nameStart: 0,
        };
        const buffer = readEntry(entry);
        if (!buffer) throw new SourceError(`cannot read ${entry.path}`);
        stats.texts += 1;
        lint(commitMessageText(buffer.toString("utf8")), entry.path);
        break;
      }
      case "commits":
        for (const commit of commitMessages(root, [values.commits])) {
          stats.commits += 1;
          lint(commit.message, `commit:${commit.sha.slice(0, 12)}`);
        }
        break;
      default:
        throw new UsageError(`unknown mode ${mode}`);
    }
  } catch (error) {
    if (error instanceof SourceError || error instanceof UsageError) {
      stderr.write(`check-narrative: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const failed = errors > 0 || (values.strict === true && warnings > 0);
  const summary = { findings: findings.length, errors, warnings, ...stats };
  if (values.json) {
    stdout.write(
      `${JSON.stringify({ tool: "check-narrative", mode, ok: !failed, summary, findings }, null, 2)}\n`,
    );
  } else {
    for (const f of findings) {
      const level = f.severity === "warning" ? "warning: " : "";
      stdout.write(
        `${f.id} ${f.path}:${f.line} ${level}${f.rule} (column ${f.column}): ${f.message}\n`,
      );
    }
    const scanned = [
      stats.files || mode === "tree" || mode === "paths" || mode === "staged"
        ? `${count(stats.files, "text file")} (${stats.skippedBinary} binary skipped)`
        : "",
      stats.texts ? count(stats.texts, "text input") : "",
      mode === "commits" ? count(stats.commits, "commit") : "",
    ].filter(Boolean);
    const found =
      warnings > 0
        ? `${count(errors, "error")}, ${count(warnings, "warning")}${values.strict ? " (strict)" : ""}`
        : count(errors, "finding");
    stdout.write(`check-narrative: ${found} [${mode}] scanned ${scanned.join(", ")}\n`);
  }
  return failed ? 1 : 0;
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
