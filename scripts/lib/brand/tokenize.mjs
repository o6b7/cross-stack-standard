/**
 * Tokenizer shared by the brand-leak guard and the denylist builder.
 *
 * Both sides of a comparison (the plaintext denylist at build time and every scanned text at
 * check time) go through exactly the same pipeline, so a normalisation step only has to be
 * deterministic, not reversible. Changing any step changes digests: bump TOKENIZER_VERSION and
 * rebuild the denylist in the same change.
 *
 * Pipeline, in order (each step is exported for unit tests):
 *   1. nfkc                   Unicode NFKC: full-width forms, ligatures, mathematical
 *                             alphanumerics, circled letters and Arabic presentation forms
 *                             fold to their plain letters.
 *   2. stripInvisibleChars    Remove every code point that renders as nothing or is a control:
 *                             general category Cf (zero-width space/joiners, bidi controls, soft
 *                             hyphen, word joiner, BOM), Default_Ignorable_Code_Point (adds the
 *                             Hangul fillers U+115F, U+1160, U+3164 and U+FFA0, the combining
 *                             grapheme joiner, variation selectors and tag characters) and the
 *                             C0/C1 controls other than tab, line feed and carriage return.
 *   3. stripLatinMarks        NFD, then drop combining marks that sit on a Latin, Greek,
 *                             Cyrillic, Armenian or Common-script base (or start a line), plus
 *                             generic combining diacritics on any base; then NFC. Marks on
 *                             Arabic (and other) letters are left for their own rules.
 *   4. toSkeleton             Map Latin look-alike letters to ASCII (case preserved), in the
 *                             spirit of Unicode TR39 confusable skeletons (see CONFUSABLES), and
 *                             the enclosed letters NFKC leaves alone (negative circled, negative
 *                             squared, regional indicators) to ASCII capitals.
 *   5. foldArabic             Alef forms -> U+0627; teh marbuta U+0629, teh marbuta goal U+06C3
 *                             and the heh forms U+06BE, U+06C1, U+06D5 -> heh U+0647; alef maksura
 *                             U+0649, Farsi yeh U+06CC and the yeh forms U+06CD, U+06CE, U+06D0 ->
 *                             yeh U+064A; keheh U+06A9 and the kaf forms U+06AA, U+06AB, U+06AC,
 *                             U+06AE -> kaf U+0643.
 *   6. stripArabicDiacritics  Remove harakat and Quranic marks U+064B-U+065F, superscript alef
 *                             U+0670 and tatweel U+0640 only. Arabic-Indic digits U+0660-U+0669
 *                             are letters-or-digits and are kept.
 * Then text is split into words (maximal runs of letters, marks and digits), each word is split
 * into subtokens at camelCase, acronym and letter/digit boundaries, and everything is lowercased.
 *
 * Coverage limits (documented, not bugs): multi-character confusables such as "rn" for "m" and
 * digit-for-letter substitutions ("0" for "o") are not normalised. Letter-spaced words and markup
 * inside a word or phrase are handled by the scanner (scan.mjs), not here.
 */

/** Tokenizer version recorded in the denylist file; bump when any step below changes. */
export const TOKENIZER_VERSION = 2;

/**
 * Step 1: NFKC compatibility normalisation.
 * @param {string} text
 * @returns {string}
 */
export function nfkc(text) {
  return text.normalize("NFKC");
}

// Cf and Default_Ignorable_Code_Point overlap but neither contains the other (U+0600 is Cf only,
// U+3164 is Default_Ignorable only). Controls: every Cc except U+0009, U+000A and U+000D, written
// as a set difference (`v` flag) so the pattern holds no control-character escapes.
const INVISIBLE_CHARS = /[[\p{Cf}\p{Default_Ignorable_Code_Point}\p{Cc}]--[\t\n\r]]/gv;

/**
 * Step 2: remove invisible characters: format characters (Cf), default-ignorable code points
 * (including the Hangul fillers, which are letters that render blank) and control characters
 * other than tab, line feed and carriage return.
 * @param {string} text
 * @returns {string}
 */
export function stripInvisibleChars(text) {
  return text.replace(INVISIBLE_CHARS, "");
}

// Marks directly after a base letter of a script the skeleton maps to Latin, or after a
// Common-script character (digits, punctuation, spaces, line breaks).
const MARKS_ON_LATIN_LIKE_BASE =
  /([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Common}])\p{M}+/gu;
const LEADING_MARKS = /^\p{M}+/u;
// Generic combining diacritics blocks: Combining Diacritical Marks (+ Extended, + Supplement),
// Combining Diacritical Marks for Symbols, Combining Half Marks. Never Arabic marks. Checked by
// code point because combining marks inside a regex character class are easy to misread.
const GENERIC_COMBINING_RANGES = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
];
const ANY_MARK = /\p{M}/gu;

/**
 * @param {string} mark
 * @returns {boolean}
 */
function isGenericCombiningMark(mark) {
  const cp = mark.codePointAt(0);
  return GENERIC_COMBINING_RANGES.some(([low, high]) => cp >= low && cp <= high);
}

/**
 * Step 3: drop accents and other combining marks from Latin-like text (NFD, strip, NFC).
 * @param {string} text
 * @returns {string}
 */
export function stripLatinMarks(text) {
  return text
    .normalize("NFD")
    .replace(LEADING_MARKS, "")
    .replace(MARKS_ON_LATIN_LIKE_BASE, "$1")
    .replace(ANY_MARK, (mark) => (isGenericCombiningMark(mark) ? "" : mark))
    .normalize("NFC");
}

/**
 * Confusable table for step 4: single code points whose glyph is (near-)identical to a basic
 * Latin letter, mapped with case preserved so camelCase boundaries survive. Coverage: Cyrillic
 * (including the Cyrillic Supplement letters used in homoglyph attacks and the lower-case
 * letters that look like Latin small capitals), Greek, Armenian, IPA / Latin Extended letters
 * that NFKC leaves alone, and the Latin small capitals used for "small caps" fancy text (they
 * are lower-case letters, so they map to lower-case ASCII). Full-width and mathematical forms
 * are already folded by NFKC in step 1.
 * @type {ReadonlyMap<string, string>}
 */
export const CONFUSABLES = new Map([
  // Cyrillic capitals
  ["\u0405", "S"],
  ["\u0406", "I"],
  ["\u0408", "J"],
  ["\u0410", "A"],
  ["\u0412", "B"],
  ["\u0415", "E"],
  ["\u041A", "K"],
  ["\u041C", "M"],
  ["\u041D", "H"],
  ["\u041E", "O"],
  ["\u0420", "P"],
  ["\u0421", "C"],
  ["\u0422", "T"],
  ["\u0423", "Y"],
  ["\u0425", "X"],
  ["\u04AE", "Y"],
  ["\u04BA", "H"],
  ["\u04C0", "I"],
  ["\u051A", "Q"],
  ["\u051C", "W"],
  // Cyrillic small letters
  ["\u0430", "a"],
  ["\u0432", "b"],
  ["\u0433", "r"],
  ["\u0435", "e"],
  ["\u043A", "k"],
  ["\u043C", "m"],
  ["\u043D", "h"],
  ["\u043E", "o"],
  ["\u043F", "n"],
  ["\u0440", "p"],
  ["\u0441", "c"],
  ["\u0442", "t"],
  ["\u0443", "y"],
  ["\u0445", "x"],
  ["\u044C", "b"],
  ["\u0455", "s"],
  ["\u0456", "i"],
  ["\u0458", "j"],
  ["\u0461", "w"],
  ["\u0475", "v"],
  ["\u04AF", "y"],
  ["\u04BB", "h"],
  ["\u04BD", "e"],
  ["\u04CF", "l"],
  ["\u0501", "d"],
  ["\u051B", "q"],
  ["\u051D", "w"],
  // Greek capitals
  ["\u037F", "J"],
  ["\u0391", "A"],
  ["\u0392", "B"],
  ["\u0395", "E"],
  ["\u0396", "Z"],
  ["\u0397", "H"],
  ["\u0399", "I"],
  ["\u039A", "K"],
  ["\u039C", "M"],
  ["\u039D", "N"],
  ["\u039F", "O"],
  ["\u03A1", "P"],
  ["\u03A4", "T"],
  ["\u03A5", "Y"],
  ["\u03A7", "X"],
  ["\u03F9", "C"],
  // Greek small letters
  ["\u03B1", "a"],
  ["\u03B3", "y"],
  ["\u03B9", "i"],
  ["\u03BA", "k"],
  ["\u03BD", "v"],
  ["\u03BF", "o"],
  ["\u03C1", "p"],
  ["\u03C5", "u"],
  ["\u03C7", "x"],
  ["\u03C9", "w"],
  ["\u03F2", "c"],
  ["\u03F3", "j"],
  // Armenian small letters
  ["\u0563", "q"],
  ["\u0566", "q"],
  ["\u0570", "h"],
  ["\u0578", "n"],
  ["\u057D", "u"],
  ["\u0581", "g"],
  ["\u0585", "o"],
  // IPA and Latin Extended letters
  ["\u0131", "i"],
  ["\u01C0", "l"],
  ["\u0237", "j"],
  ["\u0251", "a"],
  ["\u0261", "g"],
  ["\u0269", "i"],
  ["\u026A", "i"],
  ["\u028F", "y"],
  // Latin small capitals (IPA Extensions, Phonetic Extensions, Latin Extended-D)
  ["\u0262", "g"],
  ["\u0274", "n"],
  ["\u0280", "r"],
  ["\u0299", "b"],
  ["\u029C", "h"],
  ["\u029F", "l"],
  ["\u1D00", "a"],
  ["\u1D04", "c"],
  ["\u1D05", "d"],
  ["\u1D07", "e"],
  ["\u1D0A", "j"],
  ["\u1D0B", "k"],
  ["\u1D0C", "l"],
  ["\u1D0D", "m"],
  ["\u1D0F", "o"],
  ["\u1D11", "o"],
  ["\u1D18", "p"],
  ["\u1D1B", "t"],
  ["\u1D1C", "u"],
  ["\u1D20", "v"],
  ["\u1D21", "w"],
  ["\u1D22", "z"],
  ["\u1D29", "p"],
  ["\uA730", "f"],
  ["\uA731", "s"],
  ["\uA7AF", "q"],
]);

const CONFUSABLE_PATTERN = new RegExp(`[${[...CONFUSABLES.keys()].join("")}]`, "gu");

/**
 * Enclosed Latin capitals that NFKC does not fold (symbols, not letters, so without this step
 * they would vanish as separators): first code point of each A-Z block.
 */
export const ENCLOSED_LETTER_BLOCKS = Object.freeze([
  0x1f150, // NEGATIVE CIRCLED LATIN CAPITAL LETTER A
  0x1f170, // NEGATIVE SQUARED LATIN CAPITAL LETTER A
  0x1f1e6, // REGIONAL INDICATOR SYMBOL LETTER A
]);
const ENCLOSED_PATTERN = /[\u{1F150}-\u{1F169}\u{1F170}-\u{1F189}\u{1F1E6}-\u{1F1FF}]/gu;

/**
 * Step 4: confusable skeleton (single code point look-alikes -> ASCII, case preserved; enclosed
 * letters -> ASCII capitals).
 * @param {string} text
 * @returns {string}
 */
export function toSkeleton(text) {
  return text
    .replace(CONFUSABLE_PATTERN, (ch) => CONFUSABLES.get(ch) ?? ch)
    .replace(ENCLOSED_PATTERN, (ch) => {
      const cp = ch.codePointAt(0);
      const block = ENCLOSED_LETTER_BLOCKS.findLast((start) => cp >= start);
      return String.fromCharCode(0x41 + cp - block);
    });
}

const ARABIC_ALEF_FORMS = /[\u0622\u0623\u0625\u0671\u0672\u0673]/gu;

/**
 * Step 5: fold Arabic letter variants that are routinely interchanged in writing.
 * @param {string} text
 * @returns {string}
 */
export function foldArabic(text) {
  return text
    .replace(ARABIC_ALEF_FORMS, "\u0627")
    .replace(/[\u0629\u06BE\u06C1\u06C3\u06D5]/gu, "\u0647")
    .replace(/[\u0649\u06CC\u06CD\u06CE\u06D0]/gu, "\u064A")
    .replace(/[\u06A9\u06AA\u06AB\u06AC\u06AE]/gu, "\u0643");
}

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u0640]/gu;

/**
 * Step 6: remove Arabic diacritics (U+064B-U+065F, U+0670) and tatweel (U+0640). Nothing else:
 * in particular the Arabic-Indic digits U+0660-U+0669 are kept.
 * @param {string} text
 * @returns {string}
 */
export function stripArabicDiacritics(text) {
  return text.replace(ARABIC_DIACRITICS, "");
}

const PRINTABLE_ASCII = /^[\x20-\x7e\t]*$/u;

/**
 * Apply steps 1-6. Case is preserved (lowercasing happens after subtoken splitting).
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  // Every step is the identity on ASCII text, the common case for source files.
  if (PRINTABLE_ASCII.test(text)) return text;
  return stripArabicDiacritics(
    foldArabic(toSkeleton(stripLatinMarks(stripInvisibleChars(nfkc(text))))),
  );
}

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const SUBTOKEN_BOUNDARY = new RegExp(
  [
    "(?<=\\p{Ll}\\p{M}*)(?=\\p{Lu})", // camelCase: lower -> Upper
    "(?<=\\p{Lu}\\p{M}*)(?=\\p{Lu}\\p{M}*\\p{Ll})", // acronym: HTTPServer -> HTTP | Server
    "(?<=[\\p{L}\\p{M}])(?=\\p{N})", // letter -> digit
    "(?<=\\p{N})(?=\\p{L})", // digit -> letter
  ].join("|"),
  "u",
);

/**
 * Split already-normalised text into words: maximal runs of letters, marks and digits. Anything
 * else (spaces, punctuation, `_`, `-`, `.`, `@`, `/`, replacement characters) is a boundary.
 * @param {string} normalized
 * @returns {string[]} words with their original case
 */
export function splitWords(normalized) {
  return normalized.match(WORD) ?? [];
}

/**
 * Split one word at camelCase, acronym and letter/digit boundaries.
 * @param {string} word a word from splitWords (case preserved)
 * @returns {string[]}
 */
export function splitSubtokens(word) {
  return word.split(SUBTOKEN_BOUNDARY).filter(Boolean);
}

/**
 * @typedef {object} Word
 * @property {string} text lowercased word (the whole run between separators)
 * @property {string[]} parts lowercased subtokens of the word
 */

/**
 * Tokenize one line (or any text without line bookkeeping) into lowercased words and subtokens.
 * @param {string} line
 * @returns {Word[]}
 */
export function tokenizeWords(line) {
  return splitWords(normalizeText(line)).map((word) => ({
    text: word.toLowerCase(),
    parts: splitSubtokens(word).map((part) => part.toLowerCase()),
  }));
}

/**
 * Flat, lowercased subtoken list for a string (used for denylist entries).
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return tokenizeWords(text).flatMap((word) => word.parts);
}

/**
 * Number of code points in a string (denylist lengths are measured in code points).
 * @param {string} text
 * @returns {number}
 */
export function codePointLength(text) {
  let n = 0;
  for (const _ of text) n += 1;
  return n;
}
