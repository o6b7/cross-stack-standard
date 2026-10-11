/**
 * The opt-out guard. The entry point runs it before anything else, for every event; an
 * opted-out project gets exit 0, no output and no child process from any hook.
 *
 * Sources, first match wins:
 *
 * 1. the environment variable `CROSS_STACK_STANDARD_DISABLE` set to `1` (also `true`, `yes`,
 *    `on`);
 * 2. `"disabled": true` in the project's `.cross-stack/standard.json` (the nearest one from the
 *    project directory up to the repository root; never one found from the working directory);
 * 3. the line `cross-stack-standard: declined` in `CLAUDE.md`, `.claude/CLAUDE.md` or
 *    `CLAUDE.local.md`, in the working directory or any directory above it up to the project
 *    directory — only in directories inside the project, and only in files whose real path is
 *    inside the project; the project directory's own files always count. The match is tolerant
 *    — indentation, a list or heading marker, a quote marker, backticks or emphasis around the
 *    words, any letter case and a final full stop — but the line must hold nothing else, and
 *    lines inside fenced code blocks do not count.
 *
 * The line check runs in linear time: a file without the words is skipped at once, a line
 * without them is skipped with `indexOf`, and the rest is compared by a hand-written scanner
 * with no backtracking, so no file content can stall a hook (a stalled hook would fail open).
 *
 * The platform's own switch, `"cross-stack-standard@cross-stack-standard": false` under
 * `enabledPlugins`, stops the hooks before they start.
 *
 * @module plugins/cross-stack-standard/scripts/lib/opt-out
 */

import path from "node:path";

import { loadNearestManifest, parseSwitch } from "./manifest.mjs";
import { isWithinReal, readTextCapped } from "./project.mjs";

/** Environment variable that turns every hook off. */
export const OPT_OUT_ENV = "CROSS_STACK_STANDARD_DISABLE";

/** The opt-out line, in its canonical form. */
export const OPT_OUT_LINE = "cross-stack-standard: declined";

/** Memory files searched for the opt-out line, relative to each searched directory. */
export const MEMORY_FILES = Object.freeze(["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]);

/** Largest part of a memory file that is read (Claude Code's own soft cap is far larger). */
export const MAX_MEMORY_BYTES = 1024 * 1024;

/** Longest line that can state the opt-out; longer lines are not examined. */
export const MAX_OPT_OUT_LINE_CHARS = 512;

const WORDS = "cross-stack-standard";

/** The words anywhere, in any letter case (a literal search: linear, no copy of the text). */
const WORDS_ANYWHERE = /cross-stack-standard/i;

/** The words and the value at a given index, in any ASCII letter case. */
const WORDS_AT = /cross-stack-standard/iy;
const VALUE_AT = /declined/iy;

/** One line break (a Markdown line ends at CRLF, LF or CR). */
const LINE_BREAK = /\r\n|\n|\r/g;

/**
 * Runs of one character class. Each is a single starred class with nothing after it, used
 * sticky from a given index: it matches at once (possibly empty) and can never backtrack, so a
 * skip costs time linear in the run it consumes.
 */
const RUN = Object.freeze({
  indent: /[\t >]*/y,
  space: /[\t ]*/y,
  wrap: /[`*_]*/y,
  hash: /#*/y,
  digits: /[0-9]*/y,
  backticks: /`*/y,
  tildes: /~*/y,
});

/** The index just past the run of `run` that starts at `index`. */
function skip(text, index, run) {
  run.lastIndex = index;
  run.test(text);
  return run.lastIndex;
}

/** The index just past `literal` (a sticky pattern) when it starts at `index`, else -1. */
function matchAt(text, index, literal) {
  literal.lastIndex = index;
  return literal.test(text) ? literal.lastIndex : -1;
}

/**
 * Skips one list or heading marker (`#`–`######`, `-`, `*`, `+`, `1.`, `1)`) followed by at
 * least one space or tab; returns `start` when there is none.
 */
function skipMarker(text, start) {
  let position = start;
  const char = text[position];
  if (char === "#") {
    position = skip(text, position, RUN.hash);
    if (position - start > 6) return start;
  } else if (char === "-" || char === "*" || char === "+") {
    position += 1;
  } else {
    position = skip(text, position, RUN.digits);
    const digits = position - start;
    if (digits === 0 || digits > 9 || (text[position] !== "." && text[position] !== ")")) {
      return start;
    }
    position += 1;
  }
  const after = skip(text, position, RUN.space);
  return after > position ? after : start;
}

/**
 * Whether one line (without its line break) states the opt-out: optional indentation and quote
 * markers, an optional list or heading marker, then the words with optional backticks or
 * emphasis, an optional full stop, and nothing else. Linear in the line's length.
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isOptOutLine(line) {
  if (line.length > MAX_OPT_OUT_LINE_CHARS) return false;
  if (line.toLowerCase().indexOf(WORDS) === -1) return false;
  let position = skipMarker(line, skip(line, 0, RUN.indent));
  const wrapThenSpace = () => {
    position = skip(line, skip(line, position, RUN.wrap), RUN.space);
  };
  wrapThenSpace();
  position = matchAt(line, position, WORDS_AT);
  if (position === -1) return false;
  wrapThenSpace();
  if (line[position] !== ":") return false;
  position += 1;
  wrapThenSpace();
  position = matchAt(line, position, VALUE_AT);
  if (position === -1) return false;
  wrapThenSpace();
  if (line[position] === ".") position += 1;
  return skip(line, position, RUN.space) === line.length;
}

/**
 * An opening or closing code fence (three or more backticks or tildes after optional
 * indentation and quote markers): its character, its length and the rest of the line; null
 * otherwise.
 *
 * @param {string} line
 * @returns {{ char: string, length: number, rest: string } | null}
 */
function fenceOf(line) {
  const start = skip(line, 0, RUN.indent);
  const char = line[start];
  if (char !== "`" && char !== "~") return null;
  const end = skip(line, start, char === "`" ? RUN.backticks : RUN.tildes);
  if (end - start < 3) return null;
  return { char, length: end - start, rest: line.slice(end) };
}

/**
 * The 1-based line number of the first opt-out line outside fenced code blocks, or 0.
 *
 * @param {string} text Markdown.
 * @returns {number}
 */
export function findOptOutLine(text) {
  if (!WORDS_ANYWHERE.test(text)) return 0;
  let fence = null;
  let start = 0;
  for (let number = 1; ; number += 1) {
    LINE_BREAK.lastIndex = start;
    const lineBreak = LINE_BREAK.exec(text);
    const end = lineBreak === null ? text.length : lineBreak.index;
    const line = text.slice(start, end);
    const found = fenceOf(line);
    if (fence !== null) {
      const closes =
        found !== null &&
        found.char === fence.char &&
        found.length >= fence.length &&
        found.rest.trim() === "";
      if (closes) fence = null;
    } else if (found !== null && !(found.char === "`" && found.rest.includes("`"))) {
      // A backtick fence's info string cannot contain a backtick; such a line is inline code.
      fence = found;
    } else if (isOptOutLine(line)) {
      return number;
    }
    if (lineBreak === null) return 0;
    start = end + lineBreak[0].length;
  }
}

/**
 * @typedef {object} OptOutResult
 * @property {boolean} optedOut
 * @property {"env" | "manifest" | "memory" | null} source
 * @property {string | null} file The manifest or memory file that holds the opt-out.
 * @property {number | null} line Line of the opt-out in a memory file.
 * @property {import("./manifest.mjs").ManifestInfo | null} manifest The project's manifest,
 *   read while checking (null when there is none), so the entry point does not read it twice.
 */

/**
 * Checks every opt-out source in order. It reads files only and never throws for a missing or
 * unreadable file.
 *
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string[]} options.searchDirs Directories whose memory files count, nearest first
 *   (see `searchDirsFor` in project.mjs).
 * @param {string[]} [options.manifestDirs] Directories searched for the manifest, nearest first
 *   (default: `searchDirs`).
 * @param {string | null} [options.memoryRoot] A memory file whose real path lies outside this
 *   directory (a link leading out of the project) does not count.
 * @param {string | null} [options.manifestRoot] The same for the manifest (default:
 *   `memoryRoot`).
 * @returns {OptOutResult}
 */
export function isOptedOut({
  env,
  searchDirs,
  manifestDirs = searchDirs,
  memoryRoot = null,
  manifestRoot = memoryRoot,
}) {
  const result = (source, file = null, line = null, manifest = null) => ({
    optedOut: source !== null,
    source,
    file,
    line,
    manifest,
  });
  if (parseSwitch(env[OPT_OUT_ENV]) === true) return result("env");

  const manifest = loadNearestManifest(manifestDirs, { within: manifestRoot });
  if (manifest?.disabled === true) return result("manifest", manifest.path, null, manifest);

  for (const dir of searchDirs) {
    for (const name of MEMORY_FILES) {
      const file = path.join(dir, name);
      if (memoryRoot !== null && !isWithinReal(file, memoryRoot)) continue;
      const text = readTextCapped(file, MAX_MEMORY_BYTES);
      if (text === null) continue;
      const line = findOptOutLine(text);
      if (line > 0) return result("memory", file, line, manifest);
    }
  }
  return result(null, null, null, manifest);
}
