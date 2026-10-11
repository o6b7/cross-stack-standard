import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ALGORITHM,
  BUCKET_SIZE,
  BrandKeyError,
  DENYLIST_FORMAT,
  DOMAINS,
  DenylistError,
  KEY_ENV,
  KEY_FILE_ENV,
  MIN_JOINED_LENGTH,
  WINDOW_RANGE,
  assertKeyMatches,
  buildDenylist,
  computeKeyId,
  createDigester,
  decoyDigest,
  formatJson,
  loadKey,
  parseDenylistJson,
  parsePlaintext,
  readDenylist,
  tokenPrefix,
  validateDenylist,
} from "../../../scripts/lib/brand/denylist.mjs";
import {
  OTHER_KEY,
  PHRASE,
  ROOT,
  SYNTHETIC_PLAINTEXT,
  TEST_KEY,
  TRIGRAM,
  WORD,
  assertNoLeak,
  syntheticDenylist,
  tempDir,
  testKey,
} from "./helpers.mjs";

describe("keys", () => {
  it("derives an 8-hex key id that differs between keys", () => {
    assert.match(computeKeyId(TEST_KEY), /^[0-9a-f]{8}$/u);
    assert.equal(computeKeyId(TEST_KEY), computeKeyId(TEST_KEY));
    assert.notEqual(computeKeyId(TEST_KEY), computeKeyId(OTHER_KEY));
  });
  it("loads the key from the environment", () => {
    const key = loadKey({ env: { [KEY_ENV]: ` ${TEST_KEY}\n` } });
    assert.deepEqual(key, { secret: TEST_KEY, keyId: computeKeyId(TEST_KEY), source: "env" });
  });
  it("prefers --key-file over the environment and trims the file", (t) => {
    const file = join(tempDir(t), "key");
    writeFileSync(file, `${TEST_KEY}\r\n`);
    const key = loadKey({ keyFile: file, env: { [KEY_ENV]: OTHER_KEY } });
    assert.equal(key.secret, TEST_KEY);
    assert.equal(key.source, "file");
  });
  it("explains a missing key", () => {
    assert.throws(
      () => loadKey({ env: {} }),
      (error) => {
        assert.ok(error instanceof BrandKeyError);
        assert.match(error.message, new RegExp(KEY_ENV, "u"));
        assert.match(error.message, /--key-file/u);
        return true;
      },
    );
  });
  it("rejects a short key and an unreadable key file", (t) => {
    assert.throws(() => loadKey({ env: { [KEY_ENV]: "short" } }), /too short/u);
    assert.throws(() => loadKey({ keyFile: join(tempDir(t), "missing") }), /ENOENT/u);
  });
  it("reads the file named by the _FILE variable, then the clone's key file", (t) => {
    const dir = tempDir(t);
    writeFileSync(join(dir, "named"), `${TEST_KEY}\n`);
    writeFileSync(join(dir, "clone"), `${OTHER_KEY}\n`);
    const named = loadKey({
      env: { [KEY_FILE_ENV]: join(dir, "named") },
      cloneKeyFile: join(dir, "clone"),
    });
    assert.deepEqual([named.secret, named.source], [TEST_KEY, "env-file"]);
    const clone = loadKey({ env: {}, cloneKeyFile: join(dir, "clone") });
    assert.deepEqual([clone.secret, clone.source], [OTHER_KEY, "clone"]);
    const fromEnv = loadKey({ env: { [KEY_ENV]: TEST_KEY }, cloneKeyFile: join(dir, "clone") });
    assert.equal(fromEnv.source, "env");
  });
  it("marks only a key with no source at all as missing", (t) => {
    const dir = tempDir(t);
    const missing = (fn) =>
      assert.throws(fn, (error) => error instanceof BrandKeyError && error.missing === true);
    const broken = (fn, pattern) =>
      assert.throws(
        fn,
        (error) =>
          error instanceof BrandKeyError && error.missing === false && pattern.test(error.message),
      );
    missing(() => loadKey({ env: {} }));
    missing(() => loadKey({ env: { [KEY_ENV]: "  " }, cloneKeyFile: join(dir, "absent") }));
    writeFileSync(join(dir, "short"), "x".repeat(31));
    broken(() => loadKey({ env: {}, cloneKeyFile: join(dir, "short") }), /too short \(31/u);
    broken(() => loadKey({ env: { [KEY_ENV]: "x".repeat(31) } }), /too short/u);
    broken(() => loadKey({ env: { [KEY_FILE_ENV]: join(dir, "absent") } }), /ENOENT/u);
    broken(() => loadKey({ keyFile: join(dir, "absent") }), /ENOENT/u);
    writeFileSync(join(dir, "empty"), "\n");
    broken(() => loadKey({ env: {}, cloneKeyFile: join(dir, "empty") }), /is empty/u);
  });
  it("memoises digests per value", () => {
    const digest = createDigester(TEST_KEY);
    assert.equal(digest("a"), digest("a"));
    assert.match(digest("a"), /^[0-9a-f]{64}$/u);
    assert.notEqual(digest("a"), createDigester(OTHER_KEY)("a"));
  });
});

describe("parsePlaintext", () => {
  it("skips comments and blank lines and classifies entries by token count", () => {
    const entries = parsePlaintext(SYNTHETIC_PLAINTEXT);
    assert.deepEqual(
      entries.map((e) => e.tokens.length),
      [1, 2, 3, 1],
    );
    assert.deepEqual(entries[1].tokens, PHRASE);
  });
  it("normalises entries and drops duplicates", () => {
    const entries = parsePlaintext(
      `${WORD}\n${WORD.toUpperCase()}\n  ${WORD}  \n${PHRASE.join("-")}\n${PHRASE.join(" ")}`,
    );
    assert.equal(entries.length, 2);
  });
  it("rejects over-long phrases and punctuation-only entries by line number, without echoing them", () => {
    assert.throws(
      () => parsePlaintext("okay\none two three four"),
      (error) => {
        assert.ok(error instanceof DenylistError);
        assert.match(error.message, /^line 2: entry has 4 tokens/u);
        assert.equal(error.message.includes("three"), false);
        return true;
      },
    );
    assert.throws(() => parsePlaintext("# c\n---"), /line 2: entry has no letters/u);
  });
});

describe("buildDenylist", () => {
  const denylist = syntheticDenylist();
  const digest = createDigester(TEST_KEY);
  const sets = (list) => [
    list.tokens.digests,
    list.tokens.prefixes,
    list.ngrams.heads,
    list.ngrams["2"],
    list.ngrams["3"],
  ];
  it("records metadata and a count rounded up to the bucket", () => {
    assert.equal(denylist.algorithm, ALGORITHM);
    assert.equal(denylist.format, DENYLIST_FORMAT);
    assert.equal(denylist.tokenizer, 2);
    assert.equal(denylist.keyId, computeKeyId(TEST_KEY));
    assert.equal(denylist.bucket, BUCKET_SIZE);
    assert.equal(denylist.count, BUCKET_SIZE);
  });
  it("stores sorted hex digests and never the plaintext", () => {
    for (const list of sets(denylist)) {
      assert.deepEqual([...list].sort(), list);
      for (const value of list) assert.match(value, /^[0-9a-f]{64}$/u);
    }
    assertNoLeak(JSON.stringify(denylist));
  });
  it("publishes a fixed window range, not the real token lengths", () => {
    const range = [];
    for (let n = WINDOW_RANGE.min; n <= WINDOW_RANGE.max; n += 1) range.push(n);
    assert.deepEqual(denylist.tokens.lengths, range);
    const other = buildDenylist(parsePlaintext("abcdefghijklm"), testKey());
    assert.deepEqual(other.tokens.lengths, range, "a different entry gives the same lengths");
    const long = buildDenylist(parsePlaintext("a".repeat(30)), testKey());
    assert.equal(long.tokens.lengths.at(-1), 30, "a longer token extends the range");
    assert.equal(long.tokens.lengths[0], WINDOW_RANGE.min);
  });
  it("pads every digest set to the bucket size with decoys", () => {
    for (const list of sets(denylist)) assert.equal(list.length, BUCKET_SIZE);
    const many = buildDenylist(
      parsePlaintext(Array.from({ length: 17 }, (_, i) => `entry${"x".repeat(i)}`).join("\n")),
      testKey(),
    );
    assert.equal(many.count, 2 * BUCKET_SIZE);
    assert.equal(many.tokens.digests.length, 2 * BUCKET_SIZE);
    assert.equal(many.ngrams["2"].length, BUCKET_SIZE, "an empty set is padded too");
  });
  it("stores phrase digests, domain-labelled heads and token prefixes", () => {
    assert.ok(denylist.ngrams["2"].includes(digest(PHRASE.join(" "))));
    assert.ok(denylist.ngrams["3"].includes(digest(TRIGRAM.join(" "))));
    assert.ok(denylist.tokens.digests.includes(digest(PHRASE.join(""))));
    assert.ok(denylist.tokens.digests.includes(digest(WORD)));
    assert.ok(denylist.ngrams.heads.includes(digest(`${DOMAINS.head}${PHRASE[0]}`)));
    assert.ok(denylist.tokens.prefixes.includes(digest(`${DOMAINS.prefix}${tokenPrefix(WORD)}`)));
    // A head never equals a token digest, so shared structure is not visible.
    assert.equal(denylist.ngrams.heads.includes(digest(PHRASE[0])), false);
    const tokens = new Set(denylist.tokens.digests);
    assert.ok(denylist.ngrams.heads.every((head) => !tokens.has(head)));
  });
  it("adds a phrase's joined form only when it is long enough", () => {
    const short = buildDenylist(parsePlaintext("ab cd"), testKey());
    assert.ok("abcd".length < MIN_JOINED_LENGTH);
    assert.equal(short.tokens.digests.includes(digest("abcd")), false);
    assert.ok(short.ngrams["2"].includes(digest("ab cd")));
  });
  it("rejects a single-token entry shorter than three code points, by line only", () => {
    assert.throws(() => parsePlaintext("abc\nxy"), /line 2: a single-token entry needs/u);
  });
  it("is deterministic and keeps earlier decoys when an entry is added", () => {
    assert.deepEqual(syntheticDenylist(), denylist);
    const plus = buildDenylist(
      parsePlaintext(`${SYNTHETIC_PLAINTEXT}\nanotherentry\n`),
      testKey(),
      { previous: denylist },
    );
    for (const [before, after] of sets(denylist).map((list, i) => [list, sets(plus)[i]])) {
      const now = new Set(after);
      assert.ok(
        before.every((value) => now.has(value)),
        "no digest of the previous build disappears",
      );
      assert.equal(after.length % BUCKET_SIZE, 0);
    }
  });
  it("keeps earlier decoys only for the same key and format", () => {
    const decoy = decoyDigest(digest, "tokens.digests", 0);
    assert.ok(denylist.tokens.digests.includes(decoy));
    const rotated = buildDenylist(parsePlaintext(SYNTHETIC_PLAINTEXT), testKey(OTHER_KEY), {
      previous: denylist,
    });
    assert.equal(rotated.tokens.digests.includes(decoy), false);
    assert.equal(rotated.tokens.digests.length, BUCKET_SIZE);
  });
});

describe("validateDenylist and readDenylist", () => {
  it("accepts a built denylist and the committed one", () => {
    assert.doesNotThrow(() => validateDenylist(syntheticDenylist()));
    const committed = readDenylist(join(ROOT, "scripts", "brand-denylist.json"));
    assert.ok(committed.count >= BUCKET_SIZE);
    assert.equal(committed.format, DENYLIST_FORMAT);
  });
  it("rejects unsupported or malformed content", () => {
    const base = syntheticDenylist();
    const broken = [
      { ...base, algorithm: "sha256" },
      { ...base, format: 1 },
      { ...base, tokenizer: 99 },
      { ...base, keyId: "XYZ" },
      { ...base, count: -1 },
      { ...base, tokens: { ...base.tokens, digests: ["nothex"] } },
      { ...base, tokens: { ...base.tokens, lengths: [0] } },
      { ...base, tokens: { ...base.tokens, prefixLength: 2 } },
      { ...base, tokens: { ...base.tokens, prefixes: [] } },
      { ...base, ngrams: { heads: [], 2: [] } },
      [],
    ];
    for (const value of broken) assert.throws(() => validateDenylist(value), DenylistError);
  });
  it("rejects narrowed window lengths while token digests exist", () => {
    const base = syntheticDenylist();
    for (const lengths of [[], [99], base.tokens.lengths.filter((n) => n !== 7)]) {
      assert.throws(
        () => validateDenylist({ ...base, tokens: { ...base.tokens, lengths } }),
        /tokens\.lengths must include every length 4-24/u,
      );
    }
  });
  it("reports unreadable files and invalid JSON by position only", (t) => {
    const dir = tempDir(t);
    assert.throws(
      () => readDenylist(join(dir, "missing.json")),
      /cannot read the denylist \(ENOENT\)/u,
    );
    writeFileSync(join(dir, "bad.json"), '{\n  "format": 2,\n  "count": zqxw\n}');
    assert.throws(
      () => readDenylist(join(dir, "bad.json")),
      (error) => {
        assert.match(error.message, /not valid JSON/u);
        assert.equal(error.message.includes("zqxw"), false);
        return true;
      },
    );
  });
  it("refuses a plaintext list without quoting it", (t) => {
    const dir = tempDir(t);
    writeFileSync(join(dir, "plain.txt"), `${WORD}\n${PHRASE.join(" ")}\n`);
    assert.throws(
      () => readDenylist(join(dir, "plain.txt")),
      (error) => {
        assert.ok(error instanceof DenylistError);
        assert.match(error.message, /not a digest file.*never the plaintext list/u);
        assertNoLeak(error.message);
        return true;
      },
    );
    assert.throws(
      () => parseDenylistJson(`\n  ${WORD}`),
      (e) => !e.message.includes(WORD),
    );
    assert.throws(
      () => parseDenylistJson(`{"a": ${WORD}}`),
      (e) => !e.message.includes(WORD),
    );
  });
  it("checks that the key matches", () => {
    assert.doesNotThrow(() => assertKeyMatches(syntheticDenylist(), testKey()));
    assert.throws(() => assertKeyMatches(syntheticDenylist(), testKey(OTHER_KEY)), BrandKeyError);
  });
});

describe("formatJson", () => {
  it("prints objects expanded and short arrays inline, like Prettier with printWidth 100", () => {
    const text = formatJson({ a: [1, 2], b: { c: "d" }, e: [] });
    assert.equal(text, '{\n  "a": [1, 2],\n  "b": {\n    "c": "d"\n  },\n  "e": []\n}\n');
  });
  it("expands an array that does not fit on one line", () => {
    const long = ["x".repeat(60), "y".repeat(60)];
    assert.equal(
      formatJson({ k: long }),
      `{\n  "k": [\n    "${long[0]}",\n    "${long[1]}"\n  ]\n}\n`,
    );
  });
  it("counts the trailing comma when deciding whether a line fits", () => {
    const item = "z".repeat(89); // 100 columns without a comma, 101 with one
    const fits = formatJson({ k: [item] });
    const withComma = formatJson({ k: [item], m: 1 });
    assert.ok(fits.includes(`"k": ["${item}"]\n`));
    assert.ok(withComma.includes('"k": [\n'));
  });
  it("round-trips through JSON.parse and matches the committed file's layout", () => {
    const denylist = syntheticDenylist();
    assert.deepEqual(JSON.parse(formatJson(denylist)), denylist);
    const committed = readFileSync(join(ROOT, "scripts", "brand-denylist.json"), "utf8");
    assert.equal(formatJson(JSON.parse(committed)), committed);
  });
});
