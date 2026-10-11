/**
 * File discovery and source-text helpers shared by the gate-presence adapters.
 * Node.js built-ins only. Globs are matched by a small local matcher so behaviour does not
 * depend on the Node.js version (`path.matchesGlob` is experimental on older 22.x releases).
 *
 * @module scripts/lib/gate-presence/files
 */

import fs from "node:fs";
import path from "node:path";

/** Directory names never descended into while searching for gate files. */
export const IGNORED_DIRS = Object.freeze(
  new Set([
    "node_modules",
    "vendor",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    ".expo",
    ".turbo",
    ".cache",
  ]),
);

const GLOB_CHARS = /[*?[{]|[?*+@!]\(/;

/**
 * Compiles a posix glob into an anchored regular expression. Supports `**` (any number of
 * directories), `*`, `?`, character classes (`[jt]`, `[!x]`), braces (`{a,b}`) and the extglob
 * groups `?(…)`, `*(…)`, `+(…)` and `@(…)`. Dot files are matched like any other name.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let out = "";
  const groups = [];
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    const next = glob[i + 1];
    if (c === "*" && next === "*") {
      const atSegmentStart = i === 0 || glob[i - 1] === "/";
      if (atSegmentStart && glob[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else if (atSegmentStart && i + 2 === glob.length) {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if ("?*+@".includes(c) && next === "(") {
      groups.push({ type: "ext", suffix: { "?": "?", "*": "*", "+": "+", "@": "" }[c] });
      out += "(?:";
      i += 1;
    } else if (c === "{") {
      groups.push({ type: "brace", suffix: "" });
      out += "(?:";
    } else if (
      (c === ")" && groups.at(-1)?.type === "ext") ||
      (c === "}" && groups.at(-1)?.type === "brace")
    ) {
      out += `)${groups.pop().suffix}`;
    } else if (
      (c === "|" && groups.at(-1)?.type === "ext") ||
      (c === "," && groups.at(-1)?.type === "brace")
    ) {
      out += "|";
    } else if (c === "*") {
      out += "[^/]*";
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "[" && glob.indexOf("]", i + 2) !== -1) {
      const end = glob.indexOf("]", i + 2);
      let body = glob.slice(i + 1, end);
      if (body.startsWith("!")) body = `^${body.slice(1)}`;
      out += `[${body.replace(/\\/g, "\\\\")}]`;
      i = end;
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * Whether a posix path matches a glob.
 *
 * @param {string} posixPath
 * @param {string} glob
 * @returns {boolean}
 */
export function matchesGlob(posixPath, glob) {
  return globToRegExp(glob).test(posixPath);
}

/**
 * Walks `dir` recursively and returns files as paths relative to `dir` (posix), sorted.
 * Directories in {@link IGNORED_DIRS} are skipped; a missing directory yields `[]`.
 *
 * @param {string} dir Absolute directory.
 * @returns {string[]}
 */
export function walkFiles(dir) {
  const out = [];
  const visit = (absolute, relative) => {
    let entries;
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) visit(path.join(absolute, entry.name), rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  };
  visit(dir, "");
  return out.sort();
}

/**
 * Lists files under `root` that match any of the posix globs (relative to `root`).
 * A pattern without glob characters matches that exact file when it exists.
 *
 * @param {string} root Absolute base directory.
 * @param {string | string[]} patterns Globs relative to `root`.
 * @returns {string[]} Sorted, de-duplicated root-relative posix paths.
 */
export function listFiles(root, patterns) {
  const found = new Set();
  for (const pattern of [patterns].flat()) {
    const segments = pattern.split("/");
    const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
    if (firstGlob === -1) {
      if (isFile(path.join(root, ...segments))) found.add(pattern);
      continue;
    }
    const base = segments.slice(0, firstGlob).join("/");
    const regex = globToRegExp(pattern);
    for (const rel of walkFiles(path.join(root, ...segments.slice(0, firstGlob)))) {
      const candidate = base ? `${base}/${rel}` : rel;
      if (regex.test(candidate)) found.add(candidate);
    }
  }
  return [...found].sort();
}

/**
 * @param {string} absolute
 * @returns {boolean}
 */
export function isFile(absolute) {
  try {
    return fs.statSync(absolute).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} absolute
 * @returns {boolean}
 */
export function isDirectory(absolute) {
  try {
    return fs.statSync(absolute).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Reads a UTF-8 file, or returns `null` when it cannot be read.
 *
 * @param {string} absolute
 * @returns {string | null}
 */
export function readText(absolute) {
  try {
    return fs.readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

/**
 * 1-based line of a character offset.
 *
 * @param {string} text
 * @param {number} offset
 * @returns {number}
 */
export function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

/**
 * Escapes a string for literal use inside a regular expression.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const blank = (text) => text.replace(/[^\n]/g, " ");

/**
 * Replaces JavaScript/TypeScript comments with spaces (newlines kept, so offsets and line
 * numbers stay valid). Strings, template literals and regular-expression literals are skipped.
 * Regex literals are recognised by the preceding token, which covers ordinary code but not
 * every edge case of the grammar.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripJsComments(source) {
  let out = "";
  let i = 0;
  let previous = "";
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      const stop = skipQuoted(source, i, c);
      out += source.slice(i, stop);
      i = stop;
      previous = c;
    } else if (c === "/" && (previous === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(previous))) {
      const stop = skipRegexLiteral(source, i);
      out += source.slice(i, stop);
      i = stop;
      previous = "/";
    } else {
      out += c;
      if (!/\s/.test(c)) previous = c;
      i += 1;
    }
  }
  return out;
}

/**
 * Replaces PHP comments (`//`, `#` except attributes `#[`, block comments) with spaces while
 * keeping strings and line numbers intact. Heredoc bodies are copied verbatim.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripPhpComments(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if ((c === "/" && next === "/") || (c === "#" && next !== "[")) {
      let stop = i;
      while (stop < source.length && source[stop] !== "\n" && !source.startsWith("?>", stop)) {
        stop += 1;
      }
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'") {
      const stop = skipQuoted(source, i, c);
      out += source.slice(i, stop);
      i = stop;
    } else if (source.startsWith("<<<", i)) {
      const match = /^<<<[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n/.exec(source.slice(i));
      if (!match) {
        out += c;
        i += 1;
        continue;
      }
      const closing = new RegExp(`\\n[ \\t]*${match[2]}\\b`, "g");
      closing.lastIndex = i + match[0].length - 1;
      const found = closing.exec(source);
      const stop = found ? found.index + found[0].length : source.length;
      out += source.slice(i, stop);
      i = stop;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/**
 * Replaces `#` comments in YAML or NEON text (outside quotes) with spaces.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripHashComments(source) {
  return source
    .split("\n")
    .map((line) => {
      let quote = "";
      for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        if (quote) {
          if (c === "\\" && quote === '"') i += 1;
          else if (c === quote) quote = "";
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
          return line.slice(0, i) + " ".repeat(line.length - i);
        }
      }
      return line;
    })
    .join("\n");
}

/**
 * Index just after the quoted string or template literal that starts at `start`.
 *
 * @param {string} source
 * @param {number} start Index of the opening quote.
 * @param {string} quote The quote character.
 * @returns {number}
 */
function skipQuoted(source, start, quote) {
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      i += 2;
    } else if (c === quote) {
      return i + 1;
    } else {
      i += 1;
    }
  }
  return source.length;
}

/**
 * Index just after the regular-expression literal that starts at `start`.
 *
 * @param {string} source
 * @param {number} start Index of the opening slash.
 * @returns {number}
 */
function skipRegexLiteral(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && source[i] !== "\n") {
    const c = source[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      i += 1;
      while (i < source.length && /[a-z]/i.test(source[i])) i += 1;
      return i;
    }
    i += 1;
  }
  return i;
}

/**
 * Decodes the body of a JavaScript string literal (common escapes only).
 *
 * @param {string} body Text between the quotes.
 * @returns {string}
 */
export function unescapeJs(body) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, esc) => {
    if (esc.startsWith("u{")) return String.fromCodePoint(parseInt(esc.slice(2, -1), 16));
    if (esc.startsWith("u") && esc.length === 5) {
      return String.fromCharCode(parseInt(esc.slice(1), 16));
    }
    if (esc.startsWith("x") && esc.length === 3) {
      return String.fromCharCode(parseInt(esc.slice(1), 16));
    }
    return { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" }[esc] ?? esc;
  });
}

/**
 * Decodes the body of a PHP string literal. Single-quoted strings only unescape `\'` and `\\`.
 *
 * @param {string} body Text between the quotes.
 * @param {string} quote `'` or `"`.
 * @returns {string}
 */
export function unescapePhp(body, quote) {
  if (quote === "'") return body.replace(/\\(['\\])/g, "$1");
  return body.replace(
    /\\([nrtv"\\$])/g,
    (_, esc) => ({ n: "\n", r: "\r", t: "\t", v: "\v" })[esc] ?? esc,
  );
}

/**
 * Index just after the bracket that closes the one at `open` (`(`, `[` or `{`), skipping
 * strings. Returns `-1` when unbalanced.
 *
 * @param {string} source Comment-free source.
 * @param {number} open Index of the opening bracket.
 * @returns {number}
 */
export function matchBracket(source, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const stack = [pairs[source[open]]];
  let i = open + 1;
  while (i < source.length && stack.length) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipQuoted(source, i, c);
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) stack.pop();
    i += 1;
  }
  return stack.length ? -1 : i;
}
