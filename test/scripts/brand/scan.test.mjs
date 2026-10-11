import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHmac } from "node:crypto";

import { BrandKeyError } from "../../../scripts/lib/brand/denylist.mjs";
import {
  BrandScanner,
  createFastHmac,
  decodeBytes,
  decodeCssEscapes,
  decodeEscapes,
  joinHyphenatedLines,
  spelledRuns,
  stripMarkup,
} from "../../../scripts/lib/brand/scan.mjs";
import { tokenizeWords } from "../../../scripts/lib/brand/tokenize.mjs";
import { gzip, noise, pdf, png, woff, woff2, zip } from "./binary-samples.mjs";
import {
  ARABIC_WORD,
  OTHER_KEY,
  PHRASE,
  TRIGRAM,
  WORD,
  syntheticDenylist,
  testKey,
} from "./helpers.mjs";

const scanner = () => new BrandScanner(syntheticDenylist(), testKey());
const kinds = (hits) => hits.map((hit) => hit.kind);
const upper = WORD.toUpperCase();
const title = WORD[0].toUpperCase() + WORD.slice(1);
const [p1, p2] = PHRASE;

describe("BrandScanner: single tokens and evasion forms", () => {
  const s = scanner();
  const cases = [
    ["plain word", `this mentions ${WORD} once`, "token"],
    ["camelCase", `const use${title}Config = 1;`, "token"],
    ["PascalCase acronym", `class ${upper}Client {}`, "token"],
    ["alternating case", "ZqXwVuT", "token"],
    ["snake case and env prefix", `CROSS_${upper}_API_KEY=1`, "token"],
    ["kebab case", `my-${WORD}-kit`, "token"],
    ["scoped package", `import x from "@${WORD}/eslint-config";`, "token"],
    ["URL host", `https://${WORD}.example.com/docs`, "token"],
    ["URL path", `https://example.com/org/${WORD}/issues`, "token"],
    ["glued suffix", `${WORD}standard`, "glued"],
    ["glued prefix and suffix", `the${WORD}kit`, "glued"],
    ["letter-digit boundary", `${WORD}2026`, "token"],
    [
      "full-width letters",
      [...WORD].map((c) => String.fromCodePoint(c.codePointAt(0) + 0xfee0)).join(""),
      "token",
    ],
    [
      "mathematical bold letters",
      [...WORD].map((c) => String.fromCodePoint(c.codePointAt(0) - 0x61 + 0x1d41a)).join(""),
      "token",
    ],
    ["zero-width space", `${WORD.slice(0, 3)}\u200B${WORD.slice(3)}`, "token"],
    [
      "soft hyphen and bidi override",
      `${WORD.slice(0, 2)}\u00AD${WORD.slice(2, 5)}\u202E${WORD.slice(5)}`,
      "token",
    ],
    [
      "combining marks",
      `${WORD.slice(0, 2)}\u0301${WORD.slice(2, 6)}\u0308${WORD.slice(6)}`,
      "token",
    ],
    ["precomposed accents", "zqxw\u00FDut".replace("\u00FD", "v\u0300"), "token"],
    ["Cyrillic homoglyph", WORD.replace("x", "\u0445"), "token"],
    ["Greek homoglyph", WORD.replace("v", "\u03BD"), "token"],
    ["Arabic diacritic on a Latin letter", `${WORD.slice(0, 3)}\u064E${WORD.slice(3)}`, "token"],
  ];
  for (const [name, text, kind] of cases) {
    it(`finds a ${name}`, () => {
      assert.deepEqual(kinds(s.scanText(text)), [kind]);
    });
  }
});

describe("BrandScanner: invisible and look-alike characters", () => {
  const s = scanner();
  const split = (filler) => `${WORD.slice(0, 3)}${filler}${WORD.slice(3)}`;
  const cases = [
    ["a Hangul filler (U+3164)", split("\u3164")],
    ["a halfwidth Hangul filler (U+FFA0)", split("\uFFA0")],
    ["a Hangul choseong filler (U+115F)", split("\u115F")],
    ["a Hangul jungseong filler (U+1160)", split("\u1160")],
    ["a combining grapheme joiner", split("\u034F")],
    ["a variation selector", split("\uFE0F")],
    ["a Mongolian vowel separator", split("\u180E")],
    ["a tag character", split("\u{E0020}")],
    ["a C0 control character", split("\u0001")],
    ["a DEL character", split("\u007F")],
    ["a C1 control character", split("\u0085")],
    ["Cyrillic small ka", WORD.replace("z", "z").replace("q", "q").replace("x", "\u0445")],
    [
      "Latin small capitals (fancy text)",
      "\u1D22\uA7AF\u0078\u1D21\u1D20\u1D1C\u1D1B", // z q x w v u t
    ],
    [
      "negative squared letters",
      [...WORD.toUpperCase()]
        .map((c) => String.fromCodePoint(0x1f170 + c.charCodeAt(0) - 65))
        .join(""),
    ],
    [
      "regional indicator letters",
      [...WORD.toUpperCase()]
        .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
        .join(""),
    ],
  ];
  for (const [name, text] of cases) {
    it(`finds a token written with ${name}`, () => {
      assert.deepEqual(kinds(s.scanText(`see ${text} here`)), ["token"]);
    });
  }
  it("folds Cyrillic small ka, em, en, te and ve", () => {
    const local = new BrandScanner(syntheticDenylist("kmhtb\n"), testKey());
    assert.deepEqual(kinds(local.scanText("\u043A\u043C\u043D\u0442\u0432")), ["token"]);
  });
  it("folds the Arabic kaf, yeh and heh variants", () => {
    const kafVariant = ARABIC_WORD.replace("\u0643", "\u06AA");
    const kehehDot = ARABIC_WORD.replace("\u0643", "\u06AC");
    const hehGoal = ARABIC_WORD.replace("\u0629", "\u06C1");
    for (const text of [kafVariant, kehehDot, hehGoal]) {
      assert.equal(s.scanText(text).length, 1, text);
    }
  });
});

describe("BrandScanner: separators and markup", () => {
  const s = scanner();
  const spaced = (sep, text = WORD) => [...text].join(sep);
  const cases = [
    ["letter-spaced with spaces", spaced(" "), "token"],
    ["letter-spaced in capitals", spaced(" ", WORD.toUpperCase()), "token"],
    ["letter-spaced with hyphens", spaced("-"), "token"],
    ["letter-spaced with dots", spaced("."), "token"],
    ["letter-spaced inside a sentence", `the ${spaced(" ")} s project`, "glued"],
    ["split by an inline tag", `${WORD.slice(0, 3)}<b></b>${WORD.slice(3)}`, "token"],
    ["split by a span", `${WORD.slice(0, 3)}<span class="x">${WORD.slice(3)}</span>`, "token"],
    ["split by Markdown emphasis", `${WORD.slice(0, 3)}**${WORD.slice(3)}**`, "token"],
    ["split by a hyphenated line break", `a ${WORD.slice(0, 3)}-\n * ${WORD.slice(3)} b`, "token"],
    ["a phrase split by <br>", `${p1}<br>${p2}`, "token"],
    ["a phrase split by <em>", `${p1} <em>${p2}</em>`, "phrase"],
    ["a phrase split by a Markdown link target", `[${p1}](https://example.com/x) ${p2}`, "phrase"],
    ["a phrase split by a reference link", `[${p1}][1] ${p2}`, "phrase"],
    [
      "a three-word phrase split by tags",
      `${TRIGRAM[0]} <i>${TRIGRAM[1]}</i> ${TRIGRAM[2]}`,
      "phrase",
    ],
  ];
  for (const [name, text, kind] of cases) {
    it(`finds ${name}`, () => {
      assert.deepEqual(kinds(s.scanText(text)), [kind]);
    });
  }
  it("marks hits that only a derived view finds", () => {
    assert.equal(s.scanText(`${p1}<br>${p2}`)[0].via, "markup");
    assert.equal(s.scanText(`${WORD.slice(0, 3)}-\n${WORD.slice(3)}`)[0].via, "hyphenation");
    assert.equal(s.scanText(WORD)[0].via, undefined);
  });
  it("finds letter-spaced names", () => {
    assert.deepEqual(
      s.scanPath(`docs/${spaced("-")}.txt`).map((hit) => hit.components),
      [[1]],
    );
  });
  it("joins runs of one-character words only", () => {
    assert.deepEqual(spelledRuns(tokenizeWords("a b c dd e f")), [{ start: 0, text: "abc" }]);
    assert.deepEqual(spelledRuns(tokenizeWords("a b dd")), []);
  });
  it("strips tags, link targets and emphasis, keeping or removing word boundaries", () => {
    assert.equal(stripMarkup("a<br>b [c](http://x/y(z)) *d*"), "ab [c] d");
    assert.equal(stripMarkup("a<br>b", " "), "a b");
    assert.equal(stripMarkup("x < y and y > z"), "x < y and y > z");
    assert.equal(stripMarkup("plain"), "plain");
  });
  it("joins a hyphenated word break with the next line's first word", () => {
    assert.deepEqual(joinHyphenatedLines(["one tw-", "  // o three", "x"]), [
      "one two",
      "  // o three",
      "x",
    ]);
    assert.deepEqual(joinHyphenatedLines(["a - ", "b"]), ["a - ", "b"]);
  });
});

describe("BrandScanner: Arabic variants", () => {
  const s = scanner();
  const cases = [
    ["exact spelling", ARABIC_WORD],
    ["alef with hamza instead of bare alef", ARABIC_WORD.replace("\u0627", "\u0623")],
    ["alef wasla", ARABIC_WORD.replace("\u0627", "\u0671")],
    ["heh instead of teh marbuta", ARABIC_WORD.replace("\u0629", "\u0647")],
    ["alef maksura instead of yeh", ARABIC_WORD.replace("\u064A", "\u0649")],
    ["Farsi yeh and keheh", ARABIC_WORD.replace("\u064A", "\u06CC").replace("\u0643", "\u06A9")],
    ["harakat and shadda", [...ARABIC_WORD].join("\u064E").replace("\u0642", "\u0642\u0651")],
    ["tatweel", ARABIC_WORD.replace("\u0644", "\u0644\u0640\u0640")],
    ["zero-width non-joiner", ARABIC_WORD.replace("\u0637", "\u200C\u0637")],
    ["presentation forms", ARABIC_WORD.replace("\u0632", "\uFEAF").replace("\u0628", "\uFE91")],
    ["glued to Latin text", `brand${ARABIC_WORD}2026`],
  ];
  for (const [name, text] of cases) {
    it(`finds the ${name}`, () => {
      assert.equal(s.scanText(`\u0646\u0635 ${text} \u0646\u0635`).length, 1);
    });
  }
  it("does not strip Arabic-Indic digits (a word with digits is not the bare token)", () => {
    const withDigits = `${ARABIC_WORD.slice(0, 4)}\u0663${ARABIC_WORD.slice(4)}`;
    assert.deepEqual(s.scanText(withDigits), []);
  });
});

describe("BrandScanner: phrases", () => {
  const s = scanner();
  const cases = [
    ["on one line", `a ${p1} ${p2} b`],
    ["with punctuation between", `${p1}, ${p2}!`],
    ["hyphenated", `${p1}-${p2}`],
    ["snake case", `${p1.toUpperCase()}_${p2.toUpperCase()}`],
    ["camelCase", `${p1}${p2[0].toUpperCase()}${p2.slice(1)}Service`],
    ["across a line wrap inside a JSDoc block", `/**\n * uses the ${p1}\n * ${p2} helper\n */`],
    ["across a Markdown quote", `> the ${p1}\n> ${p2}`],
    ["across line comments", `// ${p1}\r\n// ${p2}`],
    ["glued into one word", `x${p1}${p2}x`],
  ];
  for (const [name, text] of cases) {
    it(`finds the phrase ${name}`, () => {
      assert.equal(s.scanText(text).length, 1);
    });
  }
  it("reports the line of the phrase's first token", () => {
    assert.deepEqual(s.scanText(`one\ntwo ${p1}\n * ${p2}`), [{ line: 2, kind: "phrase" }]);
  });
  it("finds a three-word phrase across lines", () => {
    assert.deepEqual(s.scanText(`${TRIGRAM[0]}\n# ${TRIGRAM[1]}\n# ${TRIGRAM[2]}`), [
      { line: 1, kind: "phrase" },
    ]);
  });
  it("ignores the words alone, reversed or separated by another word", () => {
    assert.deepEqual(s.scanText(`${p1} alone. ${p2} ${p1}. ${p1} and ${p2}`), []);
  });
});

describe("BrandScanner: escaped and encoded text", () => {
  const s = scanner();
  const escape = (text) =>
    [...text].map((c) => `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`).join("");
  it("decodes escape forms", () => {
    assert.equal(decodeEscapes("\\u0041\\u{42}\\x43%44&#69;&#x46;"), "ABCDEF");
    assert.equal(decodeEscapes("%D8%A8"), "\u0628");
    assert.equal(decodeEscapes("a&shy;b"), "a\u00ADb");
    assert.equal(decodeEscapes("plain"), "plain");
  });
  const cases = [
    ["JavaScript unicode escapes", `const s = "${escape(WORD)}";`],
    ["hex escapes", `"${[...WORD].map((c) => `\\x${c.charCodeAt(0).toString(16)}`).join("")}"`],
    ["percent-encoding", `https://example.com/${encodeURIComponent(ARABIC_WORD)}`],
    ["HTML entities", `<p>${[...WORD].map((c) => `&#${c.charCodeAt(0)};`).join("")}</p>`],
    ["an HTML soft hyphen", `<p>${WORD.slice(0, 3)}&shy;${WORD.slice(3)}</p>`],
    [
      "punycode",
      `https://${new URL(`https://${ARABIC_WORD}.example`).hostname.split(".")[0]}.example`,
    ],
  ];
  for (const [name, text] of cases) {
    it(`finds a token hidden with ${name}`, () => {
      const hits = s.scanText(text);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].encoded, true);
    });
  }
  it("decodes octal and CSS escapes in separate views", () => {
    assert.equal(decodeEscapes("\\101\\102"), "AB");
    assert.equal(decodeCssEscapes("\\41 \\000042C"), "ABC");
    const octal = `"${[...WORD].map((c) => `\\${c.charCodeAt(0).toString(8)}`).join("")}"`;
    assert.deepEqual(kinds(s.scanText(octal)), ["token"]);
    const css = `content: "\\${WORD.charCodeAt(0).toString(16)} ${WORD.slice(1)}";`;
    assert.deepEqual(kinds(s.scanText(css)), ["token"]);
  });
  it("finds a token in a base64 data URI, however short", () => {
    const short = `data:text/plain;base64,${Buffer.from(WORD).toString("base64")}`;
    const hits = s.scanText(`url(${short})`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].via, "data-uri");
    assert.equal(hits[0].encoded, true);
    const image = `data:image/png;base64,${Buffer.from(png({ text: `by ${WORD}` })).toString("base64")}`;
    assert.equal(s.scanText(`<img src="${image}">`).length, 1);
  });
  it("decodes a byte run of any length (no call-stack overflow)", () => {
    assert.equal(decodeBytes(new Array(500_000).fill(0xff)).length, 500_000);
    assert.equal(decodeBytes([0xd8, 0xa8]), "\u0628");
    assert.deepEqual(s.scanText(`s = "${"\\xff".repeat(300_000)}";`), []);
  });
  it("does not double-report a line that already has a plain hit", () => {
    assert.equal(s.scanText(`${WORD} ${escape(WORD)}`).length, 1);
  });
});

describe("BrandScanner: ordinary text", () => {
  const s = scanner();
  it("passes generic English and code", () => {
    const text = [
      "A reference implementation of RFC 9457 problem details.",
      "const plumbing = gleefully(zqx, wvut);",
      "Version 1.2.3, H1 headings, SEC-016, \u0660\u0661\u0662.",
    ].join("\n");
    assert.deepEqual(s.scanText(text), []);
  });
  it("reports one hit per word, each on its own line", () => {
    assert.deepEqual(s.scanText(`${WORD} ${WORD}\n\n${WORD}`), [
      { line: 1, kind: "token" },
      { line: 1, kind: "token" },
      { line: 3, kind: "token" },
    ]);
  });
  it("finds a token glued inside a long data-like word", () => {
    assert.deepEqual(kinds(s.scanText(`data:QmFzZTY0Rw${WORD}Q2xpZW50SGVsbG8=`)), ["glued"]);
  });
  it("finds a token hidden in mocking case inside a long word", () => {
    const mocked = [...WORD].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join("");
    assert.deepEqual(kinds(s.scanText(`tHiSiS${mocked}AnDmOrE`)), ["glued"]);
    assert.deepEqual(kinds(s.scanText(`someWordXyzAb${mocked}Qq`)), ["glued"]);
  });
  it("keeps the number of digests near-linear for base64 data", () => {
    const fresh = scanner();
    const base64 = noise(15000).toString("base64");
    assert.deepEqual(fresh.scanText(base64), []);
    assert.ok(fresh.digestCount < base64.length, `${fresh.digestCount} digests`);
  });
  it("caches digests per distinct word", () => {
    const fresh = scanner();
    const text = "lorem ipsum dolor sit amet ".repeat(200);
    fresh.scanText(text);
    const first = fresh.digestCount;
    fresh.scanText(text);
    assert.equal(fresh.digestCount, first, "a second scan of the same words computes no digest");
    assert.ok(first < 60);
  });
});

describe("BrandScanner: the denylist's window lengths only drive the glued pass", () => {
  it("still finds whole words and subtokens when the lengths list is tampered with", () => {
    const denylist = syntheticDenylist();
    for (const lengths of [[], [99]]) {
      const s = new BrandScanner(
        { ...denylist, tokens: { ...denylist.tokens, lengths } },
        testKey(),
      );
      assert.deepEqual(kinds(s.scanText(`plain ${WORD} word`)), ["token"]);
      assert.deepEqual(
        kinds(s.scanText(`const my${WORD[0].toUpperCase()}${WORD.slice(1)}Thing = 1;`)),
        ["token"],
      );
      assert.deepEqual(kinds(s.scanText(`${p1} ${p2}`)), ["phrase"]);
    }
  });
});

describe("createFastHmac", () => {
  it("equals crypto.createHmac for short, block-sized and long keys", () => {
    for (const secret of ["k".repeat(32), "k".repeat(64), "k".repeat(100), "\u00e9".repeat(40)]) {
      const fast = createFastHmac(secret);
      for (const value of ["", "abc", ARABIC_WORD, "x".repeat(1000)]) {
        assert.equal(fast(value), createHmac("sha256", secret).update(value, "utf8").digest("hex"));
      }
    }
  });
});

describe("BrandScanner: names and paths", () => {
  const s = scanner();
  it("finds tokens and glued tokens in file and directory names", () => {
    assert.deepEqual(s.scanPath(`docs/${WORD}-guide.md`), [{ components: [1], kind: "token" }]);
    assert.deepEqual(s.scanPath(`src/my${title}Kit.ts`), [{ components: [1], kind: "token" }]);
    assert.deepEqual(s.scanPath(`src/${WORD}kit.ts`), [{ components: [1], kind: "glued" }]);
  });
  it("finds a phrase that spans two path components", () => {
    assert.deepEqual(s.scanPath(`a/${p1}/${p2}.md`), [{ components: [1, 2], kind: "phrase" }]);
  });
  it("skips components before nameStart", () => {
    assert.deepEqual(s.scanPath(`${WORD}/inside/file.md`, 1), []);
  });
  it("redacts only the components involved", () => {
    assert.equal(
      s.redactPath(`docs/${WORD}-guide/${p1}/${p2}.md`),
      "docs/[redacted]/[redacted]/[redacted]",
    );
    assert.equal(s.redactPath(`keep/this/${WORD}.md`), "keep/this/[redacted]");
    assert.equal(s.redactPath("clean/path.md"), "clean/path.md");
  });
});

describe("BrandScanner: redactText", () => {
  const s = scanner();
  it("redacts chunks with a hit and keeps the rest", () => {
    assert.equal(
      s.redactText(`cannot read docs/${WORD}-x/a.md (ENOENT)`),
      "cannot read [redacted] (ENOENT)",
    );
    assert.equal(s.redactText("nothing to hide here"), "nothing to hide here");
  });
  it("replaces the whole text when a phrase spans chunks", () => {
    assert.equal(s.redactText(`unknown revision ${p1} ${p2}`), "[redacted]");
  });
});

describe("BrandScanner: binary files", () => {
  const s = scanner();
  const cases = [
    ["PNG text chunk", png({ text: `Made by ${title} Studio` }), false],
    ["PNG compressed text chunk", png({ compressedText: `notes: ${p1}\n${p2}` }), true],
    ["PDF UTF-16 title", pdf({ title: `${upper} report` }), false],
    ["PDF compressed content stream", pdf({ streamText: `by ${WORD}` }), true],
    ["ZIP member", zip("word/document.xml", `<w:t>${WORD}</w:t>`), true],
    ["ZIP member name", zip(`${WORD}.txt`, "hello"), false],
    ["gzip data", gzip(`archive of ${WORD}`), true],
    ["WOFF name table", woff(`${title} Sans `), true],
    ["WOFF2 name table", woff2(`${title} Sans`), null],
    ["UTF-16LE text", Buffer.from(`hello ${WORD} there`, "utf16le"), false],
    [
      "plain binary metadata",
      Buffer.concat([noise(64), Buffer.from(`Copyright ${WORD}`), Buffer.from([0])]),
      false,
    ],
    [
      "Arabic UTF-8 metadata",
      Buffer.concat([Buffer.from([0, 1]), Buffer.from(ARABIC_WORD, "utf8"), Buffer.from([0])]),
      false,
    ],
  ];
  for (const [name, buffer, compressed] of cases) {
    it(`finds a token in a ${name}`, () => {
      const hits = s.scanBinary(buffer);
      assert.ok(hits.length >= 1, "at least one hit");
      if (compressed !== null) assert.equal(hits[0].compressed, compressed);
      assert.ok(hits[0].count >= 1);
    });
  }
  it("reports nothing for noise and clean metadata", () => {
    assert.deepEqual(s.scanBinary(noise(32 * 1024)), []);
    assert.deepEqual(s.scanBinary(png({ text: "clean author", compressedText: "clean" })), []);
  });
});

describe("BrandScanner: keys", () => {
  it("refuses a key that does not match the denylist", () => {
    assert.throws(() => new BrandScanner(syntheticDenylist(), testKey(OTHER_KEY)), BrandKeyError);
  });
  it("finds nothing when the denylist was built with another key", () => {
    const other = new BrandScanner(syntheticDenylist(undefined, OTHER_KEY), testKey(OTHER_KEY));
    assert.equal(other.scanText(WORD).length, 1, "same key on both sides still matches");
    const mismatch = syntheticDenylist(undefined, OTHER_KEY);
    mismatch.keyId = testKey().keyId;
    assert.deepEqual(new BrandScanner(mismatch, testKey()).scanText(WORD), []);
  });
});
