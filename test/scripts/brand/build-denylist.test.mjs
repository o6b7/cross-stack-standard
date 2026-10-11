import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { formatJson, readDenylist } from "../../../scripts/lib/brand/denylist.mjs";
import {
  SYNTHETIC_PLAINTEXT,
  TEST_KEY,
  WORD,
  assertNoLeak,
  initRepo,
  runScript,
  syntheticDenylist,
  tempDir,
  writeFiles,
} from "./helpers.mjs";

const SCRIPT = "scripts/build-denylist.mjs";
const KEY_ENV = { CROSS_STACK_STANDARD_BRAND_KEY: TEST_KEY };

/**
 * A scratch root plus a plaintext list outside it.
 * @param {import("node:test").TestContext} t
 */
function setup(t) {
  const root = tempDir(t);
  const outside = tempDir(t, "brand-plain-");
  const plaintext = join(outside, "denylist.txt");
  writeFiles(outside, { "denylist.txt": SYNTHETIC_PLAINTEXT });
  const run = (args, options = {}) => {
    const result = runScript(SCRIPT, ["--root", root, ...args], {
      cwd: root,
      env: KEY_ENV,
      ...options,
    });
    assertNoLeak(result.stdout + result.stderr);
    return result;
  };
  return { root, plaintext, run };
}

describe("build-denylist", () => {
  it("requires the plaintext path argument (there is no default)", (t) => {
    const { run } = setup(t);
    const result = run([]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /expected exactly one plaintext file argument/u);
  });
  it("writes scripts/brand-denylist.json under the root and reports counts only", (t) => {
    const { root, plaintext, run } = setup(t);
    const result = run([plaintext]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^build-denylist: wrote scripts\/brand-denylist\.json: 4 entries \(2 single tokens and 2 phrases; the file shows 16\), key [0-9a-f]{8}$/mu,
    );
    const written = readFileSync(join(root, "scripts", "brand-denylist.json"), "utf8");
    assertNoLeak(written);
    assert.equal(written, formatJson(syntheticDenylist()));
    assert.deepEqual(
      readDenylist(join(root, "scripts", "brand-denylist.json")),
      syntheticDenylist(),
    );
  });
  it("honours --out, --key-file and --json", (t) => {
    const { root, plaintext, run } = setup(t);
    writeFiles(root, { "k/key": TEST_KEY });
    const result = run([plaintext, "--out", "custom/list.json", "--key-file", "k/key", "--json"], {
      env: {},
    });
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.count, 4);
    assert.equal(summary.paddedCount, 16);
    assert.equal(summary.previousPaddedCount, null);
    assert.equal(summary.keptDecoys, false);
    assert.equal(summary.out, "custom/list.json");
    assert.ok(existsSync(join(root, "custom", "list.json")));
  });
  it("keeps the previous file's decoys on rebuild, so no digest disappears", (t) => {
    const { root, plaintext, run } = setup(t);
    assert.equal(run([plaintext]).status, 0);
    const file = join(root, "scripts", "brand-denylist.json");
    const first = JSON.parse(readFileSync(file, "utf8"));
    assert.match(run([plaintext]).stdout, /earlier decoys kept/u);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), first, "a rebuild is identical");
    const outside = tempDir(t, "brand-plain-");
    writeFiles(outside, { "more.txt": `${SYNTHETIC_PLAINTEXT}\nanotherentry\n` });
    assert.equal(run([join(outside, "more.txt")]).status, 0);
    const grown = JSON.parse(readFileSync(file, "utf8"));
    for (const key of ["digests", "prefixes"]) {
      const now = new Set(grown.tokens[key]);
      assert.ok(first.tokens[key].every((digest) => now.has(digest)));
    }
  });
  it("warns when the padded count decreases", (t) => {
    const { root, run } = setup(t);
    const outside = tempDir(t, "brand-plain-");
    const many = Array.from({ length: 17 }, (_, i) => `entry${"x".repeat(i)}`).join("\n");
    writeFiles(outside, { "many.txt": many });
    assert.equal(run([join(outside, "many.txt")]).status, 0);
    writeFiles(root, { "ignored-dir/small.txt": WORD });
    writeFiles(root, { ".gitignore": "ignored-dir/\n" });
    const shrink = run([join(root, "ignored-dir", "small.txt")]);
    assert.equal(shrink.status, 0);
    assert.match(shrink.stdout, /1 entry \(1 single token and 0 phrases; the file shows 16\)/u);
    assert.match(shrink.stderr, /padded entry count decreased/u);
  });
  it("reads the clone's key file inside a git work tree", (t) => {
    const { root, plaintext, run } = setup(t);
    initRepo(root);
    writeFiles(root, { ".git/cross-stack-standard/brand.key": `${TEST_KEY}\n` });
    const result = run([plaintext], { env: {} });
    assert.equal(result.status, 0, result.stderr);
  });
  it("exits 2 without a key", (t) => {
    const { plaintext, run } = setup(t);
    const result = run([plaintext], { env: {} });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /no brand key/u);
  });
  it("exits 2 for an invalid entry, naming the line only", (t) => {
    const { root, run } = setup(t);
    const outside = tempDir(t, "brand-plain-");
    writeFiles(outside, { "bad.txt": `${WORD}\none two three four\n` });
    const result = run([join(outside, "bad.txt")]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /line 2: entry has 4 tokens/u);
    assert.equal(result.stderr.includes("three"), false);
    assert.equal(existsSync(join(root, "scripts", "brand-denylist.json")), false);
  });
  it("refuses a plaintext file inside the repository unless it is ignored (no git)", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, { "notes/list.txt": WORD });
    const refused = run(["notes/list.txt"]);
    assert.equal(refused.status, 2);
    assert.match(
      refused.stderr,
      /refusing to read a plaintext denylist that is inside the repository/u,
    );
    writeFiles(root, { ".gitignore": "# private\n/notes/\n" });
    assert.equal(run(["notes/list.txt"]).status, 0);
  });
  it("uses git check-ignore inside a git work tree", (t) => {
    const { root, run } = setup(t);
    initRepo(root);
    writeFiles(root, { "private/list.txt": WORD, ".gitignore": "private/*.txt\n" });
    assert.equal(run(["private/list.txt"]).status, 0);
    writeFiles(root, { "public/list.txt": WORD });
    assert.equal(run(["public/list.txt"]).status, 2);
  });
  it("exits 2 for an unreadable plaintext file", (t) => {
    const { run } = setup(t);
    const result = run([join(tempDir(t), "missing.txt")]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot read the plaintext denylist \(ENOENT\)/u);
  });
});
