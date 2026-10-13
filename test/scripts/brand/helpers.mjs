/**
 * Shared helpers for the brand-guard and narrative-lint tests. Everything here is synthetic: the
 * denylist words are invented nonsense, the key is a fixed test value, and every repository is a
 * scratch directory under the OS temp dir.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDenylist,
  computeKeyId,
  formatJson,
  parsePlaintext,
} from "../../../scripts/lib/brand/denylist.mjs";

/** Repository root. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** A fixed, synthetic 256-bit test key (never used outside tests). */
export const TEST_KEY = "5eed0000c0ffee00ba5eba11feedface5eed0000c0ffee00ba5eba11feedface";
/** A second synthetic key, for mismatch tests. */
export const OTHER_KEY = "0badc0de0badc0de0badc0de0badc0de0badc0de0badc0de0badc0de0badc0de";

/** Synthetic single token. */
export const WORD = "zqxwvut";
/** Synthetic two-word phrase. */
export const PHRASE = ["plumbus", "gleeb"];
/** Synthetic three-word phrase. */
export const TRIGRAM = ["snorf", "blat", "quibble"];
/** Synthetic Arabic-script token (nonsense letters: zain qaf lam alef tah kaf yeh beh teh-marbuta). */
export const ARABIC_WORD = "\u0632\u0642\u0644\u0627\u0637\u0643\u064A\u0628\u0629";

/** Plaintext form of the synthetic denylist. */
export const SYNTHETIC_PLAINTEXT = [
  "# synthetic test denylist",
  WORD,
  "",
  PHRASE.join(" "),
  TRIGRAM.join(" "),
  ARABIC_WORD,
  "",
].join("\n");

/** Lowercase fragments that must never appear in any tool output. */
export const SECRET_FRAGMENTS = [WORD, ...PHRASE, ...TRIGRAM, ARABIC_WORD, "\u0632\u0642\u0644"];

/**
 * The synthetic key as loadKey would return it.
 * @param {string} [secret]
 */
export function testKey(secret = TEST_KEY) {
  return { secret, keyId: computeKeyId(secret), source: "env" };
}

/**
 * Build the synthetic denylist object in memory.
 * @param {string} [plaintext]
 * @param {string} [secret]
 */
export function syntheticDenylist(plaintext = SYNTHETIC_PLAINTEXT, secret = TEST_KEY) {
  return buildDenylist(parsePlaintext(plaintext), testKey(secret));
}

/**
 * Create a temp directory that is removed after the test.
 * @param {import("node:test").TestContext} t
 * @param {string} [prefix]
 * @returns {string} real path of the directory
 */
export function tempDir(t, prefix = "brand-test-") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Write files below a directory (creating parents).
 * @param {string} dir
 * @param {Record<string, string | Uint8Array>} files
 */
export function writeFiles(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

/**
 * Write the synthetic denylist and key file into `dir/.brand/`.
 * @param {string} dir
 * @returns {{ denylist: string, keyFile: string }}
 */
export function writeSyntheticDenylist(dir) {
  const denylist = join(dir, ".brand", "denylist.json");
  const keyFile = join(dir, ".brand", "key");
  writeFiles(dir, {
    ".brand/denylist.json": formatJson(syntheticDenylist()),
    ".brand/key": `${TEST_KEY}\n`,
  });
  return { denylist, keyFile };
}

/**
 * Run a repository script with node.
 * @param {string} script path relative to the repository root, e.g. "scripts/check-pr.mjs"
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, input?: string }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
export function runScript(script, args, { cwd = ROOT, env = {}, input = "" } = {}) {
  const baseEnv = { ...process.env };
  delete baseEnv.CROSS_STACK_STANDARD_BRAND_KEY;
  delete baseEnv.CROSS_STACK_STANDARD_BRAND_KEY_FILE;
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd,
    env: { ...baseEnv, ...env },
    input,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Assert that output contains none of the synthetic denylisted words.
 * @param {string} output
 */
export function assertNoLeak(output) {
  const lower = output.toLowerCase();
  for (const fragment of SECRET_FRAGMENTS) {
    assert.equal(lower.includes(fragment), false, "output repeats a denylisted word");
  }
}

/**
 * Run git in a directory with a fixed identity, failing the test on error.
 * @param {string} dir
 * @param {string[]} args
 * @returns {string} stdout
 */
export function git(dir, args) {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/**
 * Initialise a scratch git repository on branch main.
 * @param {string} dir
 */
export function initRepo(dir) {
  git(dir, ["init", "-q", "-b", "main"]);
  // Keep the next-commit identity checks independent of the developer or CI runner's global
  // Git configuration. The staged brand scan resolves identities from this repository config.
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  git(dir, ["config", "tag.gpgsign", "false"]);
  git(dir, ["config", "core.autocrlf", "false"]);
}

/**
 * Stage everything and commit.
 * @param {string} dir
 * @param {string} message
 * @returns {string} commit id
 */
export function commitAll(dir, message) {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]).trim();
}
