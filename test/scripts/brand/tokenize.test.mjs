import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONFUSABLES,
  TOKENIZER_VERSION,
  codePointLength,
  foldArabic,
  nfkc,
  normalizeText,
  splitSubtokens,
  splitWords,
  stripArabicDiacritics,
  stripInvisibleChars,
  stripLatinMarks,
  toSkeleton,
  tokenize,
  tokenizeWords,
} from "../../../scripts/lib/brand/tokenize.mjs";

const hex = (text) => [...text].map((ch) => ch.codePointAt(0).toString(16).padStart(4, "0"));

describe("step 1: nfkc", () => {
  it("folds full-width letters to ASCII", () => {
    assert.equal(nfkc("\uFF41\uFF42\uFF23"), "abC");
  });
  it("folds mathematical alphanumerics and circled letters", () => {
    assert.equal(nfkc("\u{1D41A}\u{1D41B}"), "ab");
    assert.equal(nfkc("\u24D0\u24D1"), "ab");
  });
  it("expands ligatures", () => {
    assert.equal(nfkc("\uFB01le"), "file");
  });
  it("folds Arabic presentation forms to base letters", () => {
    assert.deepEqual(hex(nfkc("\uFE8D\uFEDF")), ["0627", "0644"]);
  });
});

describe("step 2: stripInvisibleChars", () => {
  it("removes zero-width characters, bidi controls, soft hyphen, word joiner and BOM", () => {
    const hidden = [
      "\u200B",
      "\u200C",
      "\u200D",
      "\u00AD",
      "\u202E",
      "\u2066",
      "\u2060",
      "\uFEFF",
      "\u061C",
    ];
    assert.equal(
      stripInvisibleChars(`a${hidden.join("b")}c`),
      `a${"b".repeat(hidden.length - 1)}c`,
    );
  });
  it("removes the Hangul fillers, which are letters (Lo) that render blank", () => {
    for (const filler of ["\u115F", "\u1160", "\u3164", "\uFFA0"]) {
      assert.equal(stripInvisibleChars(`ab${filler}cd`), "abcd", hex(filler)[0]);
    }
  });
  it("removes the combining grapheme joiner, variation selectors and tag characters", () => {
    for (const ignorable of ["\u034F", "\uFE0F", "\u180B", "\u{E0041}", "\u{E0100}"]) {
      assert.equal(stripInvisibleChars(`ab${ignorable}cd`), "abcd", hex(ignorable)[0]);
    }
  });
  it("removes C0 and C1 controls but keeps tab, line feed and carriage return", () => {
    for (const control of [
      "\u0000",
      "\u0001",
      "\u0008",
      "\u000B",
      "\u000C",
      "\u001F",
      "\u007F",
      "\u0085",
      "\u009F",
    ]) {
      assert.equal(stripInvisibleChars(`ab${control}cd`), "abcd", hex(control)[0]);
    }
    assert.equal(stripInvisibleChars("a\tb\nc\rd"), "a\tb\nc\rd");
  });
  it("keeps tatweel, which is a letter modifier rather than a format character", () => {
    assert.equal(stripInvisibleChars("\u0628\u0640\u0628"), "\u0628\u0640\u0628");
  });
  it("keeps ordinary Hangul syllables", () => {
    assert.equal(stripInvisibleChars("\uD55C\uAE00"), "\uD55C\uAE00");
  });
});

describe("step 3: stripLatinMarks", () => {
  it("removes precomposed and combining accents on Latin letters", () => {
    assert.equal(stripLatinMarks("\u00E9t\u00E9"), "ete");
    assert.equal(stripLatinMarks("e\u0301te\u0300\u0327"), "ete");
  });
  it("removes marks on Greek and Cyrillic letters and a leading stray mark", () => {
    assert.equal(stripLatinMarks("\u0439"), "\u0438");
    assert.equal(stripLatinMarks("\u03AC"), "\u03B1");
    assert.equal(stripLatinMarks("\u0301abc"), "abc");
  });
  it("removes Arabic marks placed on a Latin letter", () => {
    assert.equal(stripLatinMarks("ab\u064Ec"), "abc");
  });
  it("leaves Arabic letters composed and keeps Arabic diacritics for step 6", () => {
    assert.deepEqual(hex(stripLatinMarks("\u0623\u0628\u064E")), ["0623", "0628", "064e"]);
  });
  it("removes generic combining diacritics even on Arabic letters", () => {
    assert.deepEqual(hex(stripLatinMarks("\u0628\u0301\u0628")), ["0628", "0628"]);
  });
});

describe("step 4: toSkeleton", () => {
  it("maps Cyrillic look-alikes to ASCII with case preserved", () => {
    assert.equal(toSkeleton("\u0430\u0435\u043E\u0440\u0441\u0445"), "aeopcx");
    assert.equal(toSkeleton("\u0410\u0420\u0421"), "APC");
  });
  it("maps Greek, Armenian and IPA look-alikes", () => {
    assert.equal(toSkeleton("\u03BF\u03BD\u03B1"), "ova");
    assert.equal(toSkeleton("\u0585\u057D"), "ou");
    assert.equal(toSkeleton("\u0131\u0251\u0261"), "iag");
  });
  it("maps the Cyrillic lower-case letters that look like Latin small capitals", () => {
    assert.equal(toSkeleton("\u043A\u043C\u043D\u0442\u0432"), "kmhtb");
  });
  it("maps the Latin small capitals used for small-caps fancy text", () => {
    const smallCaps =
      "\u1D00\u0299\u1D04\u1D05\u1D07\uA730\u0262\u029C\u026A\u1D0A\u1D0B\u029F\u1D0D" +
      "\u0274\u1D0F\u1D18\uA7AF\u0280\uA731\u1D1B\u1D1C\u1D20\u1D21\u028F\u1D22";
    assert.equal(toSkeleton(smallCaps), "abcdefghijklmnopqrstuvwyz");
  });
  it("leaves ASCII and letters without a Latin look-alike unchanged", () => {
    assert.equal(toSkeleton("plain ASCII 123"), "plain ASCII 123");
    assert.equal(toSkeleton("\u0436\u0628"), "\u0436\u0628");
  });
  it("maps only single non-ASCII code points to single ASCII letters", () => {
    for (const [from, to] of CONFUSABLES) {
      assert.equal([...from].length, 1);
      assert.ok(from.codePointAt(0) > 0x7f);
      assert.match(to, /^[A-Za-z]$/u);
    }
  });
});

describe("step 5: foldArabic", () => {
  it("folds every alef form to bare alef", () => {
    for (const alef of ["\u0622", "\u0623", "\u0625", "\u0671", "\u0672", "\u0673"]) {
      assert.equal(foldArabic(alef), "\u0627");
    }
  });
  it("folds teh marbuta to heh, alef maksura and Farsi yeh to yeh, keheh to kaf", () => {
    assert.equal(foldArabic("\u0629"), "\u0647");
    assert.equal(foldArabic("\u0649"), "\u064A");
    assert.equal(foldArabic("\u06CC"), "\u064A");
    assert.equal(foldArabic("\u06A9"), "\u0643");
  });
  it("leaves other letters alone", () => {
    assert.equal(foldArabic("\u0628\u062A\u062B abc"), "\u0628\u062A\u062B abc");
  });
});

describe("step 6: stripArabicDiacritics", () => {
  it("removes every mark in U+064B-U+065F, superscript alef and tatweel", () => {
    let marks = "\u0670\u0640";
    for (let cp = 0x064b; cp <= 0x065f; cp += 1) marks += String.fromCodePoint(cp);
    assert.equal(stripArabicDiacritics(`\u0628${marks}\u062A`), "\u0628\u062A");
  });
  it("keeps Arabic-Indic and extended Arabic-Indic digits", () => {
    const digits = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
    const extended = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
    assert.equal(stripArabicDiacritics(digits + extended), digits + extended);
  });
});

describe("normalizeText", () => {
  it("returns printable ASCII unchanged (fast path)", () => {
    const ascii = "const x_y = a.b-c@d/e; // TODO\tdone";
    assert.equal(normalizeText(ascii), ascii);
  });
  it("applies all steps in order", () => {
    const input = "\uFF42\u200B\u0430n\u00E1n\u0430 \u0623\u0640\u0628\u064E\u0629";
    assert.equal(normalizeText(input), "banana \u0627\u0628\u0647");
  });
});

describe("splitWords", () => {
  it("splits at every non-letter, non-digit character", () => {
    assert.deepEqual(splitWords("a-b_c.d@e/f g:h#i+j"), [
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
    ]);
  });
  it("keeps digits (including Arabic-Indic digits) inside words", () => {
    assert.deepEqual(splitWords("v2 \u0628\u0663"), ["v2", "\u0628\u0663"]);
  });
  it("treats the replacement character as a boundary", () => {
    assert.deepEqual(splitWords("ab\uFFFDcd"), ["ab", "cd"]);
  });
});

describe("splitSubtokens", () => {
  it("splits camelCase and PascalCase", () => {
    assert.deepEqual(splitSubtokens("useFooBar"), ["use", "Foo", "Bar"]);
  });
  it("splits acronyms before a capitalised word", () => {
    assert.deepEqual(splitSubtokens("HTTPServer"), ["HTTP", "Server"]);
    assert.deepEqual(splitSubtokens("parseJSONBody"), ["parse", "JSON", "Body"]);
  });
  it("splits at letter/digit transitions, Latin and Arabic", () => {
    assert.deepEqual(splitSubtokens("abc123def"), ["abc", "123", "def"]);
    assert.deepEqual(splitSubtokens("\u0628\u0628\u0663\u0664"), ["\u0628\u0628", "\u0663\u0664"]);
  });
  it("does not split an all-caps or all-lowercase word", () => {
    assert.deepEqual(splitSubtokens("ENV"), ["ENV"]);
    assert.deepEqual(splitSubtokens("plain"), ["plain"]);
  });
});

describe("tokenizeWords and tokenize", () => {
  it("lowercases words and subtokens", () => {
    assert.deepEqual(tokenizeWords("FooBar baz"), [
      { text: "foobar", parts: ["foo", "bar"] },
      { text: "baz", parts: ["baz"] },
    ]);
  });
  it("flattens subtokens", () => {
    assert.deepEqual(tokenize("MY_APP_Key fooBar"), ["my", "app", "key", "foo", "bar"]);
  });
  it("exposes a tokenizer version for the denylist file", () => {
    assert.equal(TOKENIZER_VERSION, 2);
  });
});

describe("codePointLength", () => {
  it("counts code points, not UTF-16 units", () => {
    assert.equal(codePointLength("a\u{1D41A}b"), 3);
    assert.equal(codePointLength(""), 0);
  });
});
