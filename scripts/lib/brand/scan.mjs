/**
 * Brand-leak scanner: matches normalised tokens, glued substrings and n-grams against a keyed
 * denylist. Results carry a location and a kind only; the matched text is never returned.
 *
 * Kinds:
 *   token   a word or camelCase/acronym/letter-digit subtoken equals a denylisted token, or a
 *           word spelled out one letter at a time ("V O K", "v-o-k", "v.o.k") does
 *   glued   a denylisted token (or the space-less form of a long phrase) occurs inside a
 *           longer word, e.g. glued to a suffix or hidden in a URL host
 *   phrase  consecutive tokens form a denylisted 2- or 3-gram; the token stream runs across the
 *           whole text, so line wraps and comment markers (`*`, `//`, `#`, `>`) do not split it
 *
 * Besides the text as written, a line is scanned in derived views when they differ: with escapes
 * decoded (see decodeEscapes and decodeCssEscapes), with inline markup removed (HTML/XML tags,
 * Markdown link targets and emphasis markers), joined with the next line when it ends in a
 * hyphenated word break, and with base64 `data:` URIs decoded. Hits that only a derived view finds
 * carry `via`.
 *
 * Documented limits: reversed text, digit-for-letter and multi-character substitutions ("0" for
 * "o", "rn" for "m"), base64 outside a `data:` URI, and a word split by a visible gap character.
 *
 * Whole words and subtokens are always compared with the token digests. The glued-substring pass
 * tries the denylist's window lengths only at positions whose first code points match a keyed
 * prefix digest, so its cost does not grow with the (padded) number of window lengths.
 */
import { createHash } from "node:crypto";
import { domainToUnicode } from "node:url";

import { DOMAINS, assertKeyMatches } from "./denylist.mjs";
import { extractStrings } from "./binary.mjs";
import { codePointLength, tokenizeWords } from "./tokenize.mjs";

/** @typedef {"token" | "glued" | "phrase"} HitKind */
/** @typedef {"escapes" | "markup" | "hyphenation" | "data-uri"} HitVia */

/**
 * @typedef {object} TextHit
 * @property {number} line 1-based line
 * @property {HitKind} kind
 * @property {boolean} [encoded] found only after decoding escapes or an embedded data URI
 * @property {HitVia} [via] the derived view that found it (absent for the text as written)
 */

/**
 * @typedef {object} BinaryHit
 * @property {HitKind} kind
 * @property {number} offset byte offset of the first occurrence
 * @property {number} count occurrences of this kind in the file
 * @property {boolean} compressed whether the first occurrence is inside decoded or decompressed
 *   data
 */

/**
 * @typedef {object} NameHit
 * @property {number[]} components indexes of the path components involved
 * @property {HitKind} kind
 */

const KIND_RANK = { token: 0, glued: 1, phrase: 2 };
const CACHE_LIMIT = 200_000;
// Runs of at least this many one-character words are joined and checked as one word.
const MIN_SPELLED_RUN = 3;
// Nested data URIs (a data URI inside decoded data) are followed this deep.
const MAX_EMBED_DEPTH = 2;
// Lines of context scanned around a changed line of a derived view (phrases have up to three
// tokens, so two lines on each side cover one token per line).
const VIEW_CONTEXT = 2;

const ESCAPE_HINT = /\\[uUx0-7]|&#|&[A-Za-z]+;|%[0-9A-Fa-f]{2}|xn--/u;
const CSS_ESCAPE_HINT = /\\[0-9A-Fa-f]/u;
const NAMED_ENTITIES = {
  amp: "&",
  nbsp: "\u00A0",
  shy: "\u00AD",
  zwnj: "\u200C",
  zwj: "\u200D",
  lrm: "\u200E",
  rlm: "\u200F",
  ZeroWidthSpace: "\u200B",
  NoBreak: "\u2060",
};
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Decode a run of bytes as UTF-8, or as Latin-1 when it is not valid UTF-8. Works for runs of any
 * length (the bytes are never spread into a function call).
 * @param {number[]} bytes
 * @returns {string}
 */
export function decodeBytes(bytes) {
  const buffer = Buffer.from(bytes);
  try {
    return strictUtf8.decode(buffer);
  } catch {
    return buffer.toString("latin1");
  }
}

/**
 * @param {number} codePoint
 * @param {string} fallback
 * @returns {string}
 */
function fromCodePoint(codePoint, fallback) {
  return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : fallback;
}

/**
 * Decode the escape forms that can hide a word in source text: `\uXXXX`, `\u{X}`,
 * `\UXXXXXXXX`, runs of `\xHH` and of three-digit octal escapes (UTF-8 when valid),
 * percent-encoding (UTF-8), HTML numeric entities and the named entities for invisible
 * characters, and punycode (`xn--`) labels.
 * @param {string} line
 * @returns {string} the decoded line (the input itself when nothing is decoded)
 */
export function decodeEscapes(line) {
  if (!ESCAPE_HINT.test(line)) return line;
  const hexBytes = (run) => run.match(/[0-9A-Fa-f]{2}/gu).map((h) => Number.parseInt(h, 16));
  return line
    .replace(/\\u\{([0-9A-Fa-f]{1,6})\}|\\U([0-9A-Fa-f]{8})/gu, (all, a, b) =>
      fromCodePoint(Number.parseInt(a ?? b, 16), all),
    )
    .replace(/\\u([0-9A-Fa-f]{4})/gu, (_all, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/(?:\\x[0-9A-Fa-f]{2})+/gu, (run) => decodeBytes(hexBytes(run.replace(/\\x/gu, ""))))
    .replace(/(?:\\[0-3][0-7]{2})+/gu, (run) =>
      decodeBytes(run.match(/[0-7]{3}/gu).map((octal) => Number.parseInt(octal, 8))),
    )
    .replace(/(?:%[0-9A-Fa-f]{2})+/gu, (run) => decodeBytes(hexBytes(run.replace(/%/gu, ""))))
    .replace(/&#[xX]([0-9A-Fa-f]{1,6});|&#(\d{1,7});/gu, (all, hex, dec) =>
      fromCodePoint(hex ? Number.parseInt(hex, 16) : Number(dec), all),
    )
    .replace(/&([A-Za-z]+);/gu, (all, name) => NAMED_ENTITIES[name] ?? all)
    .replace(/\bxn--[A-Za-z0-9-]+/gu, (label) => domainToUnicode(label.toLowerCase()) || label);
}

/**
 * Decode CSS escapes (`\76 ` or `\000076`: one to six hex digits and an optional space). A
 * separate view from decodeEscapes, because `\166` means something else in CSS than in a C or
 * JavaScript string.
 * @param {string} line
 * @returns {string}
 */
export function decodeCssEscapes(line) {
  if (!CSS_ESCAPE_HINT.test(line)) return line;
  return line.replace(/\\([0-9A-Fa-f]{1,6})[ \t]?/gu, (all, hex) =>
    fromCodePoint(Number.parseInt(hex, 16), all),
  );
}

const MARKUP_HINT = /<|\]\(|\]\[|[*_~`]/u;
// HTML/XML/JSX tags and comments on one line; Markdown inline link targets and reference labels.
const TAG = /<!--.*?-->|<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/gu;
const MD_LINK_TARGET = /\]\((?:[^()\s]|\([^()\s]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\)/gu;
const MD_REFERENCE = /\]\[[^\]]*\]/gu;

/**
 * Remove inline markup that renders as nothing between words: HTML/XML/JSX tags and comments,
 * Markdown link targets (`[text](url)` keeps `[text]`) and reference labels, and, when tags are
 * removed outright, Markdown emphasis and code markers (`*`, `_`, `~`, backticks).
 * @param {string} line
 * @param {string} [tagReplacement] what a tag becomes ("" joins the text around it, " " keeps a
 *   word boundary)
 * @returns {string} the line without markup (the input itself when it has none)
 */
export function stripMarkup(line, tagReplacement = "") {
  if (!MARKUP_HINT.test(line)) return line;
  const stripped = line
    .replace(TAG, tagReplacement)
    .replace(MD_LINK_TARGET, "]")
    .replace(MD_REFERENCE, "]");
  return tagReplacement === "" ? stripped.replace(/[*_~`]+/gu, "") : stripped;
}

const HYPHEN_BREAK = /([\p{L}\p{M}\p{N}])-[ \t]*$/u;
const NEXT_LINE_WORD =
  /^[ \t]*(?:\/\/+|\/\*+|\*+|#+|(?:>[ \t]?)+|;+|--+|%+)?[ \t]*([\p{L}\p{M}\p{N}]+)/u;

/**
 * Join words broken across lines with a hyphen ("vok-" / "zim"): every line that ends in a
 * letter or digit and a hyphen gets the first word of the next line appended, without the hyphen
 * (comment and quote markers at the start of the next line are skipped).
 * @param {string[]} lines
 * @returns {string[]} the joined view (the same line objects where nothing changed)
 */
export function joinHyphenatedLines(lines) {
  return lines.map((line, index) => {
    if (index + 1 >= lines.length || !HYPHEN_BREAK.test(line)) return line;
    const next = NEXT_LINE_WORD.exec(lines[index + 1]);
    return next ? line.replace(/-[ \t]*$/u, "") + next[1] : line;
  });
}

const DATA_URI = /data:[^,;\s"'()]*(?:;[^,;\s"'()]+)*;base64,([A-Za-z0-9+/]{4,}={0,2})/giu;

/**
 * Decoded base64 payloads of the `data:` URIs on a line.
 * @param {string} line
 * @returns {Buffer[]}
 */
export function dataUriPayloads(line) {
  if (!line.includes("data:")) return [];
  return [...line.matchAll(DATA_URI)].map((match) => Buffer.from(match[1], "base64"));
}

/**
 * Runs of at least MIN_SPELLED_RUN consecutive one-character words, joined ("v o k" -> "vok").
 * @param {import("./tokenize.mjs").Word[]} words
 * @returns {Array<{ start: number, text: string }>}
 */
export function spelledRuns(words) {
  const runs = [];
  let start = -1;
  const flush = (end) => {
    if (start >= 0 && end - start >= MIN_SPELLED_RUN) {
      const text = words
        .slice(start, end)
        .map((word) => word.text)
        .join("");
      runs.push({ start, text });
    }
    start = -1;
  };
  words.forEach((word, index) => {
    if (codePointLength(word.text) === 1) {
      if (start < 0) start = index;
    } else {
      flush(index);
    }
  });
  flush(words.length);
  return runs;
}

/**
 * HMAC-SHA-256 with the key's inner and outer hash states computed once (the same result as
 * crypto.createHmac, and cheaper per digest).
 * @param {string} secret key string (used as UTF-8 bytes)
 * @returns {(value: string) => string} lowercase hex digest
 */
export function createFastHmac(secret) {
  let key = Buffer.from(secret, "utf8");
  if (key.length > 64) key = createHash("sha256").update(key).digest();
  const block = Buffer.alloc(64);
  key.copy(block);
  const inner = createHash("sha256").update(block.map((byte) => byte ^ 0x36));
  const outer = createHash("sha256").update(block.map((byte) => byte ^ 0x5c));
  return (value) => outer.copy().update(inner.copy().update(value, "utf8").digest()).digest("hex");
}

/**
 * Incremental n-gram matcher over a token stream: every n-gram is checked once, when its last
 * token arrives, and only the last `maxN` tokens are kept in memory.
 * @template T
 */
class PhraseStream {
  /**
   * @param {BrandScanner} scanner
   * @param {(items: Array<{ token: string, at: T }>) => void} onHit
   */
  constructor(scanner, onHit) {
    this.scanner = scanner;
    this.onHit = onHit;
    /** @type {Array<{ token: string, at: T }>} */
    this.buffer = [];
  }

  /**
   * @param {string} token
   * @param {T} at
   */
  push(token, at) {
    const { scanner, buffer } = this;
    if (scanner.maxN === 0) return;
    buffer.push({ token, at });
    if (buffer.length > scanner.maxN) buffer.shift();
    for (let n = 2; n <= scanner.maxN && n <= buffer.length; n += 1) {
      const items = buffer.slice(buffer.length - n);
      if (!scanner.isHead(items[0].token)) continue;
      if (scanner.grams[n].has(scanner.digest(items.map((item) => item.token).join(" ")))) {
        this.onHit(items);
      }
    }
  }
}

/** Scanner bound to one denylist and its key. */
export class BrandScanner {
  /**
   * @param {import("./denylist.mjs").Denylist} denylist
   * @param {import("./denylist.mjs").BrandKey} key
   * @throws {import("./denylist.mjs").BrandKeyError} when the key does not match the denylist
   */
  constructor(denylist, key) {
    assertKeyMatches(denylist, key);
    this.hmac = createFastHmac(key.secret);
    this.tokenDigests = new Set(denylist.tokens.digests);
    this.prefixDigests = new Set(denylist.tokens.prefixes);
    this.prefixLength = denylist.tokens.prefixLength;
    this.lengths = [...new Set(denylist.tokens.lengths)].sort((a, b) => a - b);
    this.heads = new Set(denylist.ngrams.heads);
    this.grams = { 2: new Set(denylist.ngrams["2"]), 3: new Set(denylist.ngrams["3"]) };
    this.maxN = this.grams[3].size > 0 ? 3 : this.grams[2].size > 0 ? 2 : 0;
    /** @type {Map<string, HitKind | null>} */
    this.wordCache = new Map();
    /** @type {Map<string, boolean>} */
    this.tokenCache = new Map();
    /** @type {Map<string, boolean>} */
    this.headCache = new Map();
    /** @type {Map<string, boolean>} */
    this.prefixCache = new Map();
    /** Number of HMAC computations performed (for diagnostics and tests). */
    this.digestCount = 0;
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  digest(value) {
    this.digestCount += 1;
    return this.hmac(value);
  }

  /**
   * @param {Map<string, boolean>} cache
   * @param {string} key
   * @param {() => boolean} compute
   * @returns {boolean}
   */
  #memo(cache, key, compute) {
    let result = cache.get(key);
    if (result === undefined) {
      result = compute();
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, result);
    }
    return result;
  }

  /**
   * Whether a string (a whole word, subtoken, spelled-out run or window) is a denylisted token.
   * @param {string} text
   * @returns {boolean}
   */
  isToken(text) {
    return this.#memo(this.tokenCache, text, () => this.tokenDigests.has(this.digest(text)));
  }

  /**
   * Whether a token starts a denylisted phrase (domain-labelled head digest).
   * @param {string} token
   * @returns {boolean}
   */
  isHead(token) {
    return this.#memo(this.headCache, token, () =>
      this.heads.has(this.digest(`${DOMAINS.head}${token}`)),
    );
  }

  /**
   * @param {string} prefix
   * @returns {boolean}
   */
  #isPrefix(prefix) {
    return this.#memo(this.prefixCache, prefix, () =>
      this.prefixDigests.has(this.digest(`${DOMAINS.prefix}${prefix}`)),
    );
  }

  /**
   * Single-token and glued-substring check for one word (cached per distinct word).
   * @param {import("./tokenize.mjs").Word} word
   * @returns {HitKind | null}
   */
  checkWord(word) {
    const cacheKey = `${word.text}\u0000${word.parts.join("\u0001")}`;
    const cached = this.wordCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const result = this.#checkWordUncached(word);
    if (this.wordCache.size >= CACHE_LIMIT) this.wordCache.clear();
    this.wordCache.set(cacheKey, result);
    return result;
  }

  /**
   * @param {import("./tokenize.mjs").Word} word
   * @returns {HitKind | null}
   */
  #checkWordUncached(word) {
    // Whole words are compared whatever their length: the published window lengths only drive
    // the glued-substring pass below. Subtokens go through the keyed prefix pre-check first
    // (every token's prefix digest is in the denylist), which keeps words with thousands of
    // case changes (base64, hashes) cheap.
    if (this.isToken(word.text)) return "token";
    for (const part of word.parts) {
      if (part !== word.text && this.#startsLikeToken(part) && this.isToken(part)) return "token";
    }
    // The prefix pre-check keeps this cheap even for long runs (base64, hashes, minified data),
    // so the whole lowercased word is searched, whatever its case changes.
    return this.#findWindow(word.text) ? "glued" : null;
  }

  /**
   * Whether a string's first code points match a keyed token prefix (a necessary condition for
   * being a denylisted token).
   * @param {string} text
   * @returns {boolean}
   */
  #startsLikeToken(text) {
    if (text.length < this.prefixLength) return false;
    const head = text.slice(0, this.prefixLength * 2);
    const chars = Array.from(head);
    return chars.length >= this.prefixLength
      ? this.#isPrefix(chars.slice(0, this.prefixLength).join(""))
      : false;
  }

  /**
   * Whether a denylisted token occurs as a proper substring of `text`: at every position whose
   * first code points match a keyed prefix digest, every window length is tried.
   * @param {string} text
   * @returns {boolean}
   */
  #findWindow(text) {
    const chars = Array.from(text);
    const n = chars.length;
    if (n <= this.prefixLength) return false;
    const bmp = n === text.length; // no surrogate pairs: plain slicing is exact
    const slice = (start, end) => (bmp ? text.slice(start, end) : chars.slice(start, end).join(""));
    for (let start = 0; start + this.prefixLength <= n; start += 1) {
      if (!this.#isPrefix(slice(start, start + this.prefixLength))) continue;
      for (const length of this.lengths) {
        if (start + length > n) break;
        if (length < this.prefixLength || (start === 0 && length === n)) continue;
        if (this.isToken(slice(start, start + length))) return true;
      }
    }
    return false;
  }

  /**
   * Check the letter-spaced runs of a word list.
   * @param {import("./tokenize.mjs").Word[]} words
   * @param {(index: number, kind: HitKind) => void} onHit called with the run's first word index
   */
  #checkSpelledRuns(words, onHit) {
    for (const run of spelledRuns(words)) {
      if (this.isToken(run.text)) onHit(run.start, "token");
      else if (this.#findWindow(run.text)) onHit(run.start, "glued");
    }
  }

  /**
   * Scan text. Line numbers are 1-based; `\r\n`, `\n` and `\r` all end a line.
   * @param {string} text
   * @param {number} [depth] nesting depth of embedded data (internal)
   * @returns {TextHit[]} at most one hit per word, sorted by position
   */
  scanText(text, depth = 0) {
    const lines = text.split(/\r\n|\n|\r/u);
    const hits = this.#scanLines(lines);
    const hitLines = new Set(hits.map((hit) => hit.line));
    const addView = (view, via) => {
      for (const hit of this.#scanChangedLines(lines, view)) {
        if (hitLines.has(hit.line)) continue;
        hitLines.add(hit.line);
        hits.push({ ...hit, ...(via === "escapes" ? { encoded: true } : {}), via });
      }
    };
    const decoded = lines.map((line) => decodeEscapes(line));
    addView(decoded, "escapes");
    addView(
      lines.map((line) => decodeCssEscapes(line)),
      "escapes",
    );
    addView(
      decoded.map((line) => stripMarkup(line, "")),
      "markup",
    );
    addView(
      decoded.map((line) => stripMarkup(line, " ")),
      "markup",
    );
    addView(joinHyphenatedLines(decoded), "hyphenation");
    if (depth < MAX_EMBED_DEPTH) {
      decoded.forEach((line, index) => {
        if (hitLines.has(index + 1)) return;
        for (const payload of dataUriPayloads(line)) {
          const found = this.scanBinary(payload, depth + 1);
          if (found.length === 0) continue;
          hitLines.add(index + 1);
          hits.push({ line: index + 1, kind: found[0].kind, encoded: true, via: "data-uri" });
          break;
        }
      });
    }
    return hits.sort((a, b) => a.line - b.line);
  }

  /**
   * Scan only the lines of a derived view that differ from the original, each block with
   * VIEW_CONTEXT lines of the view around it (so a phrase that crosses into a neighbouring line
   * is still seen), and return the hits that sit on a changed line.
   * @param {string[]} lines the original lines
   * @param {string[]} view the derived lines (same length)
   * @returns {TextHit[]}
   */
  #scanChangedLines(lines, view) {
    const changed = [];
    for (let i = 0; i < view.length; i += 1) if (view[i] !== lines[i]) changed.push(i);
    if (changed.length === 0) return [];
    const hits = [];
    let k = 0;
    while (k < changed.length) {
      let end = k;
      while (end + 1 < changed.length && changed[end + 1] - changed[end] <= 2 * VIEW_CONTEXT) {
        end += 1;
      }
      const from = Math.max(0, changed[k] - VIEW_CONTEXT);
      const to = Math.min(view.length, changed[end] + VIEW_CONTEXT + 1);
      const wanted = new Set(changed.slice(k, end + 1).map((i) => i + 1));
      for (const hit of this.#scanLines(view.slice(from, to))) {
        const line = hit.line + from;
        if (wanted.has(line)) hits.push({ ...hit, line });
      }
      k = end + 1;
    }
    return hits;
  }

  /**
   * Scan lines as one token stream.
   * @param {string[]} lines
   * @returns {TextHit[]}
   */
  #scanLines(lines) {
    /** @type {Map<string, { line: number, word: number, kind: HitKind }>} */
    const hits = new Map();
    const record = (line, word, kind) => {
      const key = `${line}:${word}`;
      const previous = hits.get(key);
      if (!previous || KIND_RANK[kind] < KIND_RANK[previous.kind]) {
        hits.set(key, { line, word, kind });
      }
    };
    const onPhrase = (items) => record(items[0].at.line, items[0].at.word, "phrase");
    const partStream = new PhraseStream(this, onPhrase);
    const wordStream = new PhraseStream(this, onPhrase);
    for (let index = 0; index < lines.length; index += 1) {
      const line = index + 1;
      const words = tokenizeWords(lines[index]);
      words.forEach((word, position) => {
        const kind = this.checkWord(word);
        if (kind) record(line, position, kind);
        const at = { line, word: position };
        wordStream.push(word.text, at);
        for (const part of word.parts) partStream.push(part, at);
      });
      this.#checkSpelledRuns(words, (position, kind) => record(line, position, kind));
    }
    return [...hits.values()]
      .sort((a, b) => a.line - b.line || a.word - b.word)
      .map(({ line, kind }) => ({ line, kind }));
  }

  /**
   * Scan the names in a `/`-separated path. Components before `nameStart` are ignored. Phrases
   * are matched across components as well ("a/b" counts like "a b").
   * @param {string} path
   * @param {number} [nameStart]
   * @returns {NameHit[]}
   */
  scanPath(path, nameStart = 0) {
    const components = path.split("/");
    /** @type {NameHit[]} */
    const hits = [];
    const seen = new Set();
    const onPhrase = (items) => {
      const span = [...new Set(items.map((item) => item.at))];
      const key = span.join(",");
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ components: span, kind: "phrase" });
    };
    const partStream = new PhraseStream(this, onPhrase);
    const wordStream = new PhraseStream(this, onPhrase);
    for (let index = nameStart; index < components.length; index += 1) {
      const words = tokenizeWords(components[index]);
      let best = null;
      const consider = (kind) => {
        if (kind && (!best || KIND_RANK[kind] < KIND_RANK[best])) best = kind;
      };
      for (const word of words) {
        consider(this.checkWord(word));
        wordStream.push(word.text, index);
        for (const part of word.parts) partStream.push(part, index);
      }
      this.#checkSpelledRuns(words, (_position, kind) => consider(kind));
      if (best) hits.push({ components: [index], kind: best });
    }
    return hits;
  }

  /**
   * Replace every path component involved in a name hit with `[redacted]`, so a report can show
   * where a problem is without repeating the denylisted text.
   * @param {string} path
   * @returns {string}
   */
  redactPath(path) {
    const components = path.split("/");
    const flagged = new Set(this.scanPath(path).flatMap((hit) => hit.components));
    if (flagged.size === 0) return path;
    return components.map((name, i) => (flagged.has(i) ? "[redacted]" : name)).join("/");
  }

  /**
   * Redact free text (for example an error message that echoes a path or ref name): every
   * whitespace-separated chunk with a hit becomes `[redacted]`, and if a phrase still matches
   * across chunks the whole text is replaced.
   * @param {string} text
   * @returns {string}
   */
  redactText(text) {
    const redacted = text
      .split(/(\s+)/u)
      .map((chunk) =>
        chunk.trim() && (this.scanText(chunk).length > 0 || this.scanPath(chunk).length > 0)
          ? "[redacted]"
          : chunk,
      )
      .join("");
    return this.scanText(redacted).length > 0 ? "[redacted]" : redacted;
  }

  /**
   * Scan the printable strings of a binary buffer (including recognised compressed or encoded
   * payloads).
   * @param {Uint8Array} buffer
   * @param {number} [depth] nesting depth of embedded data (internal)
   * @returns {BinaryHit[]} one entry per kind
   */
  scanBinary(buffer, depth = 0) {
    /** @type {Map<HitKind, BinaryHit>} */
    const byKind = new Map();
    for (const run of extractStrings(buffer)) {
      for (const hit of this.scanText(run.text, depth)) {
        const previous = byKind.get(hit.kind);
        if (previous) previous.count += 1;
        else {
          byKind.set(hit.kind, {
            kind: hit.kind,
            offset: run.offset,
            count: 1,
            compressed: run.compressed,
          });
        }
      }
    }
    return [...byKind.values()].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  }
}
