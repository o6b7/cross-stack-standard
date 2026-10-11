import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { compareDenylists } from "../../../scripts/check-denylist-shrink.mjs";
import {
  BUCKET_SIZE,
  buildDenylist,
  formatJson,
  parsePlaintext,
} from "../../../scripts/lib/brand/denylist.mjs";
import {
  OTHER_KEY,
  SYNTHETIC_PLAINTEXT,
  WORD,
  commitAll,
  initRepo,
  runScript,
  syntheticDenylist,
  tempDir,
  testKey,
  writeFiles,
} from "./helpers.mjs";

const SCRIPT = "scripts/check-denylist-shrink.mjs";
// Rebuilds pass the previous file, as build-denylist does, so its decoys are kept.
const rebuild = (plaintext, previous, secret) =>
  buildDenylist(parsePlaintext(plaintext), testKey(secret), { previous });
const FULL = syntheticDenylist();
const SMALLER = rebuild(`${WORD}\n`, FULL);
const LARGER = rebuild(`${SYNTHETIC_PLAINTEXT}\nextraword\n`, FULL);
const SWAPPED = rebuild(SYNTHETIC_PLAINTEXT.replace(WORD, "otherword"), FULL);
const REKEYED = rebuild(SYNTHETIC_PLAINTEXT.replace(WORD, "otherword"), FULL, OTHER_KEY);
// FULL has 4 entries; 13 more make 17 (two buckets), 12 more make 16 (one bucket).
const extra = (n) => Array.from({ length: n }, (_, i) => `entry${"x".repeat(i)}`).join("\n");
const TWO_BUCKETS = rebuild(`${SYNTHETIC_PLAINTEXT}\n${extra(13)}`, FULL);
const BACK_TO_ONE = rebuild(`${SYNTHETIC_PLAINTEXT}\n${extra(12)}`, TWO_BUCKETS);
const TAMPERED_LENGTHS = { ...FULL, tokens: { ...FULL.tokens, lengths: [99] } };

describe("compareDenylists", () => {
  it("accepts an equal or larger list", () => {
    assert.deepEqual(compareDenylists(FULL, FULL), { problems: [], digestsCompared: true });
    assert.deepEqual(compareDenylists(FULL, LARGER).problems, []);
    assert.deepEqual(compareDenylists(FULL, TWO_BUCKETS).problems, []);
  });
  it("rejects a lower (bucketed) count", () => {
    assert.equal(TWO_BUCKETS.count, 2 * BUCKET_SIZE);
    assert.ok(
      compareDenylists(TWO_BUCKETS, BACK_TO_ONE).problems.includes(
        `entry count decreased from ${2 * BUCKET_SIZE} to ${BUCKET_SIZE}`,
      ),
    );
  });
  it("rejects removed entries inside the same bucket by their digests", () => {
    const { problems } = compareDenylists(FULL, SMALLER);
    assert.equal(FULL.count, SMALLER.count);
    assert.ok(problems.some((p) => /single-token digest\(s\) from the base are missing/u.test(p)));
    assert.ok(problems.some((p) => /2-gram digest\(s\)/u.test(p)));
    assert.ok(problems.some((p) => /3-gram digest\(s\)/u.test(p)));
  });
  it("rejects a swapped entry when the key is the same", () => {
    const { problems } = compareDenylists(FULL, SWAPPED);
    assert.ok(problems.includes("1 single-token digest(s) from the base are missing"));
  });
  it("rejects narrowed window lengths and a changed prefix length", () => {
    const { problems } = compareDenylists(FULL, TAMPERED_LENGTHS);
    assert.ok(
      problems.some((p) => /window length\(s\) 4, 5, .* from the base are missing/u.test(p)),
    );
    const prefix = { ...FULL, tokens: { ...FULL.tokens, prefixLength: 2 } };
    assert.ok(
      compareDenylists(FULL, prefix).problems.includes("prefix length changed from 3 to 2"),
    );
  });
  it("rejects an algorithm change, and a format change unless allowed", () => {
    const algorithm = { ...FULL, algorithm: "sha256" };
    assert.match(compareDenylists(FULL, algorithm).problems[0], /algorithm changed/u);
    const oldFormat = { ...FULL, format: 1, count: 4 };
    assert.match(compareDenylists(oldFormat, FULL).problems[0], /file format changed from 1 to 2/u);
    assert.deepEqual(compareDenylists(oldFormat, FULL, { allowFormatChange: true }), {
      problems: [],
      digestsCompared: false,
    });
  });
  it("compares only counts after a key change", () => {
    assert.deepEqual(compareDenylists(FULL, REKEYED), { problems: [], digestsCompared: false });
  });
});

describe("check-denylist-shrink CLI", () => {
  /**
   * @param {import("node:test").TestContext} t
   * @param {object} base
   * @param {object} current
   */
  function files(t, base, current) {
    const dir = tempDir(t);
    writeFiles(dir, { "base.json": formatJson(base), "current.json": formatJson(current) });
    return (args = []) =>
      runScript(
        SCRIPT,
        ["--base", join(dir, "base.json"), "--current", join(dir, "current.json"), ...args],
        {
          cwd: dir,
        },
      );
  }

  it("passes when nothing was removed", (t) => {
    const result = files(t, FULL, LARGER)();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /check-denylist-shrink: ok: base 16, current 16 entries/u);
  });
  it("fails when the count decreased", (t) => {
    const result = files(t, TWO_BUCKETS, BACK_TO_ONE)();
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /^BRAND-DENYLIST scripts\/brand-denylist\.json:0 entry count decreased from 32 to 16$/mu,
    );
  });
  it("fails for a swapped entry and prints JSON on request", (t) => {
    const result = files(t, FULL, SWAPPED)(["--json"]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.digestsCompared, true);
    assert.ok(report.problems.includes("1 single-token digest(s) from the base are missing"));
  });
  it("refuses a current file whose window lengths were narrowed (tampered lengths)", (t) => {
    const result = files(t, FULL, TAMPERED_LENGTHS)();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /tokens\.lengths must include every length 4-24/u);
  });
  it("notes a key change", (t) => {
    const result = files(t, FULL, REKEYED)();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /key, tokenizer or format changed; digests not compared/u);
  });
  it("fails a format change unless it is allowed", (t) => {
    const run = files(t, { ...FULL, format: 1, count: 4 }, FULL);
    const refused = run();
    assert.equal(refused.status, 1);
    assert.match(refused.stdout, /file format changed from 1 to 2/u);
    assert.equal(run(["--allow-format-change"]).status, 0);
  });
  it("never quotes a plaintext list passed as the base", (t) => {
    const dir = tempDir(t);
    writeFiles(dir, { "plain.txt": `${SYNTHETIC_PLAINTEXT}`, "ok.json": formatJson(FULL) });
    const result = runScript(SCRIPT, ["--base", "plain.txt", "--current", "ok.json"], { cwd: dir });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /the base denylist is not a digest file/u);
    assert.equal(result.stderr.includes(WORD), false);
  });
  it("rejects bad usage and invalid files with exit 2", (t) => {
    const dir = tempDir(t);
    writeFiles(dir, { "bad.json": "{}", "ok.json": formatJson(FULL) });
    const run = (args) => runScript(SCRIPT, args, { cwd: dir });
    assert.equal(run([]).status, 2);
    assert.equal(run(["--base", "ok.json", "--base-ref", "HEAD"]).status, 2);
    const invalid = run(["--base", "bad.json", "--current", "ok.json"]);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /invalid denylist/u);
    assert.equal(run(["--base", "missing.json", "--current", "ok.json"]).status, 2);
  });

  describe("--base-ref", () => {
    /** @param {import("node:test").TestContext} t */
    function repo(t) {
      const root = tempDir(t);
      initRepo(root);
      writeFiles(root, { "README.md": "x" });
      const empty = commitAll(root, "chore: init");
      writeFiles(root, { "scripts/brand-denylist.json": formatJson(FULL) });
      const withList = commitAll(root, "chore: add denylist");
      const run = (args) => runScript(SCRIPT, ["--root", root, ...args], { cwd: root });
      return { root, empty, withList, run };
    }

    it("compares against the file at a git revision", (t) => {
      const { root, withList, run } = repo(t);
      assert.equal(run(["--base-ref", withList]).status, 0);
      writeFiles(root, { "scripts/brand-denylist.json": formatJson(SMALLER) });
      const shrunk = run(["--base-ref", withList]);
      assert.equal(shrunk.status, 1);
      assert.match(shrunk.stdout, /single-token digest\(s\) from the base are missing/u);
    });
    it("passes when the base revision has no denylist yet", (t) => {
      const { empty, run } = repo(t);
      const result = run(["--base-ref", empty]);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /the base revision has no scripts\/brand-denylist\.json/u);
    });
    it("exits 2 for an unknown revision", (t) => {
      const { run } = repo(t);
      const result = run(["--base-ref", "no-such-branch"]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /base revision "no-such-branch" not found/u);
    });
  });
});
