/**
 * Static extraction of test titles from JavaScript/TypeScript (Vitest, Jest) and PHP (Pest)
 * sources. Only titles written as string literals are seen; generated titles (`test.each`,
 * template literals with placeholders, titles built at run time) are reported as dynamic.
 *
 * @module scripts/lib/gate-presence/test-titles
 */

import {
  lineAt,
  matchBracket,
  stripJsComments,
  stripPhpComments,
  unescapeJs,
  unescapePhp,
} from "./files.mjs";

/**
 * @typedef {object} TestTitle
 * @property {string} title Decoded title.
 * @property {number} line 1-based line of the call.
 * @property {string} fn Function name (`it`, `test`, `arch`).
 * @property {boolean} skipped The test is skipped, a todo, or runs only conditionally.
 */

/**
 * Reads the string literal at `index` (after optional whitespace).
 *
 * @param {string} source
 * @param {number} index
 * @returns {{ quote: string, body: string, end: number } | null}
 */
function readLiteral(source, index) {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  const quote = source[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let j = i + 1;
  while (j < source.length && source[j] !== quote) j += source[j] === "\\" ? 2 : 1;
  if (j >= source.length) return null;
  return { quote, body: source.slice(i + 1, j), end: j + 1 };
}

const JS_CALL = /(?<![\w$.])(it|test)((?:\s*\.\s*[A-Za-z]+)*)\s*\(/g;
const JS_SUITE = /(?<![\w$.])(describe|suite)((?:\s*\.\s*[A-Za-z]+)*)\s*\(/g;
const JS_SKIPPING = new Set(["skip", "todo", "fails", "skipIf", "runIf"]);
const JS_PARAMETRIC = new Set(["each", "for"]);

/**
 * Source ranges of `describe`/`suite` blocks that are skipped, todo or conditional (every test
 * inside them is skipped too).
 *
 * @param {string} code Comment-free source.
 * @returns {Array<[number, number]>}
 */
function skippedJsSuites(code) {
  const ranges = [];
  for (const match of code.matchAll(JS_SUITE)) {
    const modifiers = match[2]
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!modifiers.some((name) => JS_SKIPPING.has(name))) continue;
    const open = match.index + match[0].length - 1;
    let end = matchBracket(code, open);
    if (end === -1) continue;
    if (modifiers.includes("skipIf") || modifiers.includes("runIf")) {
      const next = /^\s*\(/.exec(code.slice(end));
      if (next) end = matchBracket(code, end + next[0].length - 1);
    }
    if (end !== -1) ranges.push([match.index, end]);
  }
  return ranges;
}

/**
 * Finds `it(…)`/`test(…)` titles in a JavaScript or TypeScript test file.
 *
 * @param {string} source
 * @returns {TestTitle[]}
 */
export function findJsTestTitles(source) {
  const code = stripJsComments(source);
  const skippedSuites = skippedJsSuites(code);
  const inSkippedSuite = (offset) =>
    skippedSuites.some(([start, end]) => offset > start && offset < end);
  const titles = [];
  for (const match of code.matchAll(JS_CALL)) {
    const modifiers = match[2]
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    if (modifiers.some((name) => JS_PARAMETRIC.has(name))) continue;
    let open = match.index + match[0].length - 1;
    if (modifiers.includes("skipIf") || modifiers.includes("runIf")) {
      const afterCondition = matchBracket(code, open);
      if (afterCondition === -1) continue;
      const next = /^\s*\(/.exec(code.slice(afterCondition));
      if (!next) continue;
      open = afterCondition + next[0].length - 1;
    }
    const literal = readLiteral(code, open + 1);
    if (!literal || (literal.quote === "`" && literal.body.includes("${"))) continue;
    titles.push({
      title: unescapeJs(literal.body),
      line: lineAt(code, match.index),
      fn: match[1],
      skipped: modifiers.some((name) => JS_SKIPPING.has(name)) || inSkippedSuite(match.index),
    });
  }
  return titles;
}

const PHP_CALL = /(?<![\w$>:\\])(test|it|arch)\s*\(/g;
const PHP_DESCRIBE = /(?<![\w$>:\\])describe\s*\(/g;
const PHP_SKIP_IN_BODY =
  /(?:\$this\s*->\s*|\bself::|\bstatic::)?\bmark(?:TestSkipped|TestIncomplete)\s*\(|\btest\(\)\s*->\s*(?:skip|todo)\s*\(/;
const PHP_SKIPPING = new Set([
  "skip",
  "todo",
  "skipOnWindows",
  "skipOnMac",
  "skipOnLinux",
  "onlyOnWindows",
  "onlyOnMac",
  "onlyOnLinux",
  "skipLocally",
  "skipOnCi",
]);

/**
 * Finds Pest `test(…)`, `it(…)` and `arch(…)` descriptions in a PHP test file. A chained
 * `->skip()`, `->todo()` or platform-conditional call marks the test as skipped.
 *
 * @param {string} source
 * @returns {TestTitle[]}
 */
export function findPestTestTitles(source) {
  const code = stripPhpComments(source);
  const chainSkips = (cursor) => {
    let skipped = false;
    while (cursor !== -1) {
      const chained = /^\s*->\s*([A-Za-z_]\w*)\s*\(/.exec(code.slice(cursor));
      if (!chained) break;
      if (PHP_SKIPPING.has(chained[1])) skipped = true;
      cursor = matchBracket(code, cursor + chained[0].length - 1);
    }
    return skipped;
  };
  // describe(...)->skip() skips every test in its body.
  const skippedBlocks = [];
  for (const match of code.matchAll(PHP_DESCRIBE)) {
    const open = match.index + match[0].length - 1;
    const end = matchBracket(code, open);
    if (end !== -1 && chainSkips(end)) skippedBlocks.push([open, end]);
  }
  const titles = [];
  for (const match of code.matchAll(PHP_CALL)) {
    const open = match.index + match[0].length - 1;
    const literal = readLiteral(code, open + 1);
    if (!literal || literal.quote === "`") continue;
    if (literal.quote === '"' && /\$[A-Za-z_{]/.test(literal.body)) continue;
    const close = matchBracket(code, open);
    const body = close === -1 ? "" : code.slice(open, close);
    const skipped =
      chainSkips(close) ||
      PHP_SKIP_IN_BODY.test(body) ||
      skippedBlocks.some(([start, end]) => match.index > start && match.index < end);
    titles.push({
      title: unescapePhp(literal.body, literal.quote),
      line: lineAt(code, match.index),
      fn: match[1],
      skipped,
    });
  }
  return titles;
}
