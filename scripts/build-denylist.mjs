#!/usr/bin/env node
/**
 * build-denylist: turn a private plaintext denylist into the committed keyed digest file
 * (scripts/brand-denylist.json) used by check-brand-leak.
 *
 * The plaintext path is always given on the command line; there is no default, and a plaintext
 * file inside the repository is refused unless git (or, before `git init`, .gitignore) ignores
 * it. The previous output file, when it was built with the same key, is read so its decoys are
 * kept (no earlier digest disappears). Output never contains an entry: only counts and the key
 * id.
 *
 * Exit codes: 0 written, 2 usage error, missing key, unreadable or invalid input.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  BrandKeyError,
  DenylistError,
  CLONE_KEY_PATH,
  KEY_ENV,
  buildDenylist,
  formatJson,
  loadKey,
  parsePlaintext,
} from "./lib/brand/denylist.mjs";
import { git, gitCommonPath, isGitRoot, toPosix } from "./lib/brand/sources.mjs";
import { isIgnored as matchesIgnore, parseGitignore } from "./lib/gitignore.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DENYLIST_PATH = "scripts/brand-denylist.json";

const USAGE = `Usage: node scripts/build-denylist.mjs <plaintext-file> [options]

Build ${DENYLIST_PATH} from a private plaintext list (one entry per line, '#' comments,
entries of two or three words are phrases). Keep the plaintext outside the repository or in an
ignored directory; never commit it.

Options:
  --key-file <file>   file holding the HMAC key (default: $${KEY_ENV}, the file its _FILE
                      variant names, or .git/${CLONE_KEY_PATH})
  --out <file>        output file (default: ${DENYLIST_PATH} under the root)
  --root <dir>        repository root (default: this script's repository)
  --json              print a JSON summary
  --help              print this help

Exit codes: 0 written, 2 usage error, missing key, unreadable or invalid input.`;

/**
 * Whether a path inside the root is ignored: `git check-ignore` in a git work tree, otherwise
 * the root .gitignore (for a checkout without git metadata; a file inside an ignored directory
 * is ignored, as in git).
 * @param {string} root
 * @param {string} file absolute path inside root
 * @returns {boolean}
 */
function isIgnored(root, file) {
  const rel = toPosix(relative(root, file));
  if (isGitRoot(root)) {
    return git(root, ["check-ignore", "-q", "--", rel], { allowFailure: true }) !== null;
  }
  const gitignore = resolve(root, ".gitignore");
  if (!existsSync(gitignore)) return false;
  const rules = parseGitignore(readFileSync(gitignore, "utf8"));
  const parts = rel.split("/");
  for (let i = 1; i < parts.length; i += 1) {
    if (matchesIgnore(rules, parts.slice(0, i).join("/"), true)) return true;
  }
  return matchesIgnore(rules, rel, false);
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, env?: NodeJS.ProcessEnv, cwd?: string }} [io]
 * @returns {number} exit code
 */
export function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const fail = (message) => {
    stderr.write(`build-denylist: ${message}\n`);
    return 2;
  };
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        "key-file": { type: "string" },
        out: { type: "string" },
        root: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    return fail(`${error.message}\n\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (positionals.length !== 1) {
    return fail(`expected exactly one plaintext file argument\n\n${USAGE}`);
  }
  const root = resolve(cwd, values.root ?? DEFAULT_ROOT);
  const source = resolve(cwd, positionals[0]);
  const out = resolve(cwd, values.out ?? resolve(root, DENYLIST_PATH));

  const rel = relative(root, source);
  const inside = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  if (inside && !isIgnored(root, source)) {
    return fail(
      "refusing to read a plaintext denylist that is inside the repository and not ignored; " +
        "move it outside the repository or into an ignored directory",
    );
  }

  let text;
  try {
    text = readFileSync(source, "utf8");
  } catch (error) {
    return fail(`cannot read the plaintext denylist (${error.code ?? error.message})`);
  }
  let previous = null;
  try {
    previous = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    previous = null;
  }
  let key;
  let denylist;
  let entries;
  try {
    key = loadKey({
      keyFile: values["key-file"] && resolve(cwd, values["key-file"]),
      env,
      cloneKeyFile: gitCommonPath(root, CLONE_KEY_PATH),
    });
    entries = parsePlaintext(text);
    denylist = buildDenylist(entries, key, { previous });
  } catch (error) {
    if (error instanceof BrandKeyError || error instanceof DenylistError)
      return fail(error.message);
    throw error;
  }

  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, formatJson(denylist));
  } catch (error) {
    return fail(`cannot write the denylist (${error.code ?? error.message})`);
  }

  const phrases = entries.filter((entry) => entry.tokens.length > 1).length;
  const previousCount = Number.isInteger(previous?.count) ? previous.count : null;
  const summary = {
    out: toPosix(relative(cwd, out)) || ".",
    count: entries.length,
    paddedCount: denylist.count,
    previousPaddedCount: previousCount,
    phrases,
    singleTokens: entries.length - phrases,
    keptDecoys: previous?.keyId === denylist.keyId && previous?.format === denylist.format,
    keyId: denylist.keyId,
  };
  if (values.json) {
    stdout.write(`${JSON.stringify({ tool: "build-denylist", ...summary }, null, 2)}\n`);
  } else {
    stdout.write(
      `build-denylist: wrote ${summary.out}: ${count(summary.count, "entry", "entries")} ` +
        `(${count(summary.singleTokens, "single token")} and ${count(phrases, "phrase")}; ` +
        `the file shows ${summary.paddedCount}), key ${summary.keyId}` +
        `${summary.keptDecoys ? ", earlier decoys kept" : ""}\n`,
    );
    if (previousCount !== null && denylist.count < previousCount) {
      stderr.write(
        "build-denylist: warning: the padded entry count decreased; CI rejects a shrinking denylist\n",
      );
    }
  }
  return 0;
}

/**
 * "1 file", "2 files".
 * @param {number} n
 * @param {string} noun singular
 * @param {string} [plural]
 * @returns {string}
 */
function count(n, noun, plural = `${noun}s`) {
  return `${n} ${n === 1 ? noun : plural}`;
}

const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
