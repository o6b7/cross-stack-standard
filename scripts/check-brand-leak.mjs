#!/usr/bin/env node
/**
 * check-brand-leak: fail when text, file names, binary metadata, commit messages, commit and tag
 * identities, or ref names contain a token or phrase from the keyed brand denylist
 * (scripts/brand-denylist.json).
 *
 * The denylist holds HMAC-SHA-256 digests only. The key comes from --key-file, the environment
 * (CROSS_STACK_STANDARD_BRAND_KEY, or CROSS_STACK_STANDARD_BRAND_KEY_FILE naming a file), or the
 * clone's own key file `.git/cross-stack-standard/brand.key`. Findings name a location and a
 * kind; the matched text is never printed, and path components that match are shown as
 * `[redacted]`.
 *
 * Exit codes: 0 clean, 1 findings, 2 usage error, missing or unusable key, unreadable input or
 * internal error.
 */
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { isBinary } from "./lib/brand/binary.mjs";
import {
  BrandKeyError,
  CLONE_KEY_PATH,
  DenylistError,
  KEY_ENV,
  KEY_FILE_ENV,
  loadKey,
  readDenylist,
} from "./lib/brand/denylist.mjs";
import { BrandScanner } from "./lib/brand/scan.mjs";
import {
  SourceError,
  addedPaths,
  commitMessageText,
  commitMessages,
  git,
  gitCommonPath,
  historyBlobs,
  nextCommitIdentities,
  pathFiles,
  prePushRanges,
  readBlobs,
  readEntry,
  readStdin,
  refs,
  stagedFiles,
  toPosix,
  treeFiles,
} from "./lib/brand/sources.mjs";

const ID = "BRAND-LEAK";
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DENYLIST_PATH = "scripts/brand-denylist.json";

const USAGE = `Usage: node scripts/check-brand-leak.mjs [mode] [options]

Scan for denylisted brand tokens and phrases (keyed digests in ${DENYLIST_PATH}).

Modes (pick one; --tree is the default):
  --tree                  every file of the repository (git ls-files in a git work tree, else a
                          walk that applies .gitignore, negations included)
  --paths <path...>       the given files and directories (skips _input/, _work/,
                          node_modules/, vendor/ and .git/ below them)
  --staged                staged file contents and names, and the author and committer
                          identity of the next commit (pre-commit)
  --stdin                 text from standard input (PR titles, bodies, release notes)
  --commit-msg <file>     a commit message file (commit-msg hook); everything above a scissors
                          line is scanned, comment lines included
  --commits <range>       commit messages, author and committer identities, added paths and
                          every file content added or changed in a revision range (base..head)
  --pre-push              the same for every ref a git pre-push hook reports on standard input
  --all-history [ref...]  the same over all history, plus ref names, tag messages and taggers
                          of the given refs (default: all refs)

Options:
  --names-only            scan file and directory names only (--tree, --paths, --staged)
  --key-file <file>       file holding the HMAC key (default: $${KEY_ENV}, then the file named
                          by $${KEY_FILE_ENV}, then .git/${CLONE_KEY_PATH})
  --skip-without-key      exit 0 with a notice when no key source exists at all (contributor
                          hooks); a key that exists but cannot be read or is too short still
                          exits 2
  --denylist <file>       denylist file (default: ${DENYLIST_PATH} under the root)
  --root <dir>            repository root (default: this script's repository)
  --label <name>          location label for --stdin (default: <stdin>)
  --json                  print a JSON report
  --help                  print this help

Exit codes: 0 clean, 1 findings, 2 usage error, missing or unusable key, unreadable input or
internal error.`;

const KIND_TEXT = {
  token: "denylisted token",
  glued: "denylisted token glued inside a longer word",
  phrase: "denylisted phrase",
};

const VIA_TEXT = {
  escapes: " (in escaped or encoded text)",
  markup: " (split by markup)",
  hyphenation: " (split by a hyphenated line break)",
  "data-uri": " (in an embedded base64 data URI)",
};

/** Error for invalid command-line usage (exit code 2). */
class UsageError extends Error {}

/**
 * @typedef {object} Finding
 * @property {string} id
 * @property {string} path display location (redacted)
 * @property {number} line 1-based line, or 0 for names, identities and binary data
 * @property {"token" | "glued" | "phrase"} kind
 * @property {"content" | "name" | "binary" | "message" | "ref" | "identity"} source
 * @property {string} message
 */

const MODES = [
  "tree",
  "paths",
  "staged",
  "stdin",
  "commit-msg",
  "commits",
  "pre-push",
  "all-history",
];

/**
 * Parse argv into options.
 * @param {string[]} argv
 */
function parseOptions(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        tree: { type: "boolean" },
        paths: { type: "boolean" },
        staged: { type: "boolean" },
        stdin: { type: "boolean" },
        "commit-msg": { type: "string" },
        commits: { type: "string" },
        "pre-push": { type: "boolean" },
        "all-history": { type: "boolean" },
        "names-only": { type: "boolean" },
        "key-file": { type: "string" },
        "skip-without-key": { type: "boolean" },
        denylist: { type: "string" },
        root: { type: "string" },
        label: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw new UsageError(error.message);
  }
  const { values, positionals } = parsed;
  const modes = MODES.filter((mode) => values[mode] !== undefined);
  if (modes.length > 1) throw new UsageError(`choose one mode (got --${modes.join(", --")})`);
  const mode = modes[0] ?? "tree";
  if (positionals.length > 0 && mode !== "paths" && mode !== "all-history") {
    throw new UsageError(`unexpected argument for --${mode}`);
  }
  if (mode === "paths" && positionals.length === 0) {
    throw new UsageError("--paths needs at least one path");
  }
  if (values["names-only"] && !["tree", "paths", "staged"].includes(mode)) {
    throw new UsageError("--names-only applies to --tree, --paths and --staged");
  }
  return { mode, values, positionals };
}

/**
 * Collect findings for the selected mode.
 * @param {BrandScanner} scanner
 * @param {{ mode: string, values: Record<string, any>, positionals: string[] }} options
 * @param {string} root
 * @param {string} cwd
 * @param {() => string} stdin reads standard input
 */
function run(scanner, { mode, values, positionals }, root, cwd, stdin) {
  /** @type {Finding[]} */
  const findings = [];
  const stats = {
    files: 0,
    textFiles: 0,
    binaryFiles: 0,
    names: 0,
    texts: 0,
    commits: 0,
    blobs: 0,
    identities: 0,
    refs: 0,
  };
  const add = (path, line, kind, source, detail = "") => {
    findings.push({
      id: ID,
      path,
      line,
      kind,
      source,
      message: `${KIND_TEXT[kind]}${detail}`,
    });
  };

  const scanNames = (entries, where) => {
    const reported = new Set();
    const prefixes = new Set();
    for (const entry of entries) {
      const components = entry.path.split("/");
      for (let i = entry.nameStart; i < components.length; i += 1) {
        prefixes.add(components.slice(0, i + 1).join("/"));
      }
      for (const hit of scanner.scanPath(entry.path, entry.nameStart)) {
        const prefix = components.slice(0, Math.max(...hit.components) + 1).join("/");
        const key = `${prefix}\u0000${hit.kind}`;
        if (reported.has(key)) continue;
        reported.add(key);
        add(scanner.redactPath(prefix), 0, hit.kind, "name", ` in a ${where}`);
      }
    }
    stats.names += prefixes.size;
  };

  const scanText = (text, location, source) => {
    for (const hit of scanner.scanText(text)) {
      add(location, hit.line, hit.kind, source, hit.via ? VIA_TEXT[hit.via] : "");
    }
  };

  const scanBuffer = (buffer, location, countAsFile) => {
    if (isBinary(buffer)) {
      if (countAsFile) stats.binaryFiles += 1;
      for (const hit of scanner.scanBinary(buffer)) {
        const where = hit.compressed ? "compressed or encoded data at byte offset" : "byte offset";
        const times = hit.count > 1 ? `, ${hit.count} occurrences` : "";
        add(
          location,
          0,
          hit.kind,
          "binary",
          ` in a binary string (${where} ${hit.offset}${times})`,
        );
      }
    } else {
      if (countAsFile) stats.textFiles += 1;
      scanText(buffer.toString("utf8"), location, "content");
    }
  };

  const scanIdentity = (identity, location) => {
    stats.identities += 1;
    // Name and email are scanned as text (an email splits into words at "@" and "."); neither
    // is ever printed, and one finding per identity is enough to locate it.
    const rank = { token: 0, glued: 1, phrase: 2 };
    const best = scanner
      .scanText(`${identity.name}\n${identity.email}`)
      .map((hit) => hit.kind)
      .sort((a, b) => rank[a] - rank[b])[0];
    if (best) add(location, 0, best, "identity", " in a name or email address");
  };

  const scanEntries = (entries) => {
    scanNames(entries, "file or directory name");
    if (values["names-only"]) return;
    for (const entry of entries) {
      const buffer = readEntry(entry);
      if (!buffer) continue;
      stats.files += 1;
      scanBuffer(buffer, scanner.redactPath(entry.path), true);
    }
  };

  const scanHistory = (revisions) => {
    for (const commit of commitMessages(root, revisions)) {
      stats.commits += 1;
      const location = `commit:${commit.sha.slice(0, 12)}`;
      scanText(commit.message, location, "message");
      scanIdentity(commit.author, `${location}:author`);
      scanIdentity(commit.committer, `${location}:committer`);
    }
    const paths = addedPaths(root, revisions).map((path) => ({ path, nameStart: 0 }));
    scanNames(paths, "path added in history");
    const blobs = historyBlobs(root, revisions);
    const contents = readBlobs(
      root,
      blobs.map((blob) => blob.oid),
    );
    for (const blob of blobs) {
      const buffer = contents.get(blob.oid);
      if (!buffer) continue;
      stats.blobs += 1;
      scanBuffer(buffer, `commit:${blob.sha.slice(0, 12)}:${scanner.redactPath(blob.path)}`, false);
    }
  };

  switch (mode) {
    case "tree":
      scanEntries(treeFiles(root).files);
      break;
    case "paths":
      scanEntries(pathFiles(root, positionals, cwd));
      break;
    case "staged":
      scanEntries(stagedFiles(root));
      if (!values["names-only"]) {
        for (const { role, identity } of nextCommitIdentities(root)) {
          scanIdentity(identity, `identity:${role}`);
        }
      }
      break;
    case "stdin":
      stats.texts += 1;
      scanText(stdin(), values.label ?? "<stdin>", "message");
      break;
    case "commit-msg": {
      const file = resolve(cwd, values["commit-msg"]);
      const entry = { path: toPosix(values["commit-msg"]), abs: file, nameStart: 0 };
      const buffer = readEntry(entry);
      if (!buffer) throw new SourceError(`cannot read ${scanner.redactPath(entry.path)}`);
      stats.texts += 1;
      scanText(
        commitMessageText(buffer.toString("utf8")),
        scanner.redactPath(entry.path),
        "message",
      );
      break;
    }
    case "commits":
      scanHistory([values.commits]);
      break;
    case "pre-push":
      for (const range of prePushRanges(stdin())) scanHistory(range.revisions);
      break;
    case "all-history": {
      scanHistory(positionals.length > 0 ? positionals : ["--all"]);
      const patterns = positionals
        .map((ref) => git(root, ["rev-parse", "--symbolic-full-name", ref], { allowFailure: true }))
        .map((out) => (out ? out.toString("utf8").trim() : ""))
        .filter(Boolean);
      if (positionals.length === 0 || patterns.length > 0) {
        for (const ref of refs(root, patterns)) {
          stats.refs += 1;
          const location = `ref:${scanner.redactPath(ref.name)}`;
          for (const hit of scanner.scanPath(ref.name)) {
            add(location, 0, hit.kind, "ref", " in a ref name");
          }
          if (ref.message) scanText(ref.message, location, "message");
          if (ref.tagger) scanIdentity(ref.tagger, `${location}:tagger`);
        }
      }
      break;
    }
    default:
      throw new UsageError(`unknown mode ${mode}`);
  }
  return { findings, stats };
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, env?: NodeJS.ProcessEnv, cwd?: string, stdin?: () => string }} [io]
 * @returns {number} exit code
 */
export function main(argv, io = {}) {
  const stderr = io.stderr ?? process.stderr;
  try {
    return mainUnguarded(argv, io);
  } catch (error) {
    // Never echo an unexpected error's message: it could quote scanned text.
    const code = error?.code ? ` ${error.code}` : "";
    stderr.write(
      `check-brand-leak: internal error (${error?.name ?? "Error"}${code}); the message is not ` +
        "shown because it could quote scanned text\n",
    );
    return 2;
  }
}

/**
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, env?: NodeJS.ProcessEnv, cwd?: string, stdin?: () => string }} io
 * @returns {number}
 */
function mainUnguarded(argv, io) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const stdin = io.stdin ?? readStdin;
  let options;
  try {
    options = parseOptions(argv);
  } catch (error) {
    stderr.write(`check-brand-leak: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (options.values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  const root = resolve(cwd, options.values.root ?? DEFAULT_ROOT);
  const started = process.hrtime.bigint();
  let key;
  try {
    key = loadKey({
      keyFile: options.values["key-file"] && resolve(cwd, options.values["key-file"]),
      env,
      cloneKeyFile: gitCommonPath(root, CLONE_KEY_PATH),
    });
  } catch (error) {
    if (!(error instanceof BrandKeyError)) throw error;
    if (error.missing && options.values["skip-without-key"]) {
      stderr.write(`check-brand-leak: skipped, ${error.message}\n`);
      return 0;
    }
    stderr.write(`check-brand-leak: ${error.message}\n`);
    return 2;
  }
  let result;
  let scanner = null;
  try {
    const denylist = readDenylist(
      resolve(cwd, options.values.denylist ?? resolve(root, DENYLIST_PATH)),
    );
    scanner = new BrandScanner(denylist, key);
    result = run(scanner, options, root, cwd, stdin);
  } catch (error) {
    if (
      error instanceof BrandKeyError ||
      error instanceof DenylistError ||
      error instanceof SourceError ||
      error instanceof UsageError
    ) {
      // Messages can echo a path or ref name; never let them repeat a denylisted word.
      const message = scanner ? scanner.redactText(error.message) : error.message;
      stderr.write(`check-brand-leak: ${message}\n`);
      return 2;
    }
    throw error;
  }
  const { findings, stats } = result;
  const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const summary = {
    findings: findings.length,
    ...stats,
    keyId: key.keyId,
    ms,
  };
  if (options.values.json) {
    stdout.write(
      `${JSON.stringify({ tool: "check-brand-leak", mode: options.mode, ok: findings.length === 0, summary, findings }, null, 2)}\n`,
    );
  } else {
    for (const f of findings) stdout.write(`${f.id} ${f.path}:${f.line} ${f.message}\n`);
    stdout.write(`${formatSummary(options.mode, summary)}\n`);
  }
  return findings.length > 0 ? 1 : 0;
}

/**
 * One-line human summary.
 * @param {string} mode
 * @param {Record<string, number | string>} s
 * @returns {string}
 */
function formatSummary(mode, s) {
  const parts = [];
  if (s.files || s.names) {
    parts.push(
      `${count(s.files, "file")} (${s.textFiles} text, ${s.binaryFiles} binary)`,
      count(s.names, "name"),
    );
  }
  if (s.texts) parts.push(count(s.texts, "text input"));
  if (s.commits) parts.push(count(s.commits, "commit"));
  if (s.blobs) parts.push(count(s.blobs, "file version"));
  if (s.identities) parts.push(count(s.identities, "identity", "identities"));
  if (s.refs) parts.push(count(s.refs, "ref"));
  const scanned = parts.length > 0 ? parts.join(", ") : "nothing";
  return `check-brand-leak: ${count(s.findings, "finding")} [${mode}] scanned ${scanned} in ${s.ms} ms (key ${s.keyId})`;
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
