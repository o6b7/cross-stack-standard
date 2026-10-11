/**
 * Input sources shared by the brand-leak guard and the narrative lint: the repository tree (git
 * or a filesystem walk that honours .gitignore), explicit paths, the git index and the identity
 * of the next commit, commit messages and identities, paths and file contents added in history,
 * ref names and tag metadata, and pre-push ranges. Git is invoked without a shell; nothing here
 * touches the network.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { walkUnignored } from "../gitignore.mjs";

/**
 * Directory names never entered when walking explicit `--paths` arguments (at any depth), and
 * by the tree walk of a checkout that has no root .gitignore.
 */
export const WALK_EXCLUDES = Object.freeze(["_input", "_work", "node_modules", "vendor", ".git"]);

/** The all-zero object id git uses for "no commit" (a new or deleted ref). */
export const NULL_OID = /^0+$/u;

/** Error raised when git fails or an input cannot be read (CLI exit code 2). */
export class SourceError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "SourceError";
  }
}

/**
 * Convert a native path to a `/`-separated one.
 * @param {string} path
 * @returns {string}
 */
export function toPosix(path) {
  return sep === "/" ? path : path.split(sep).join("/");
}

/**
 * Run git in `root` and return stdout as a Buffer.
 * @param {string} root
 * @param {string[]} args
 * @param {{ input?: string | Buffer, allowFailure?: boolean }} [options]
 * @returns {Buffer | null} null when the command failed and allowFailure is set
 * @throws {SourceError}
 */
export function git(root, args, { input, allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
  if (result.error) {
    if (allowFailure) return null;
    throw new SourceError(`cannot run git (${result.error.code ?? result.error.message})`);
  }
  if (result.status !== 0) {
    if (allowFailure) return null;
    const detail = result.stderr.toString("utf8").trim().split("\n")[0];
    throw new SourceError(`git ${args[0]} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

/**
 * Whether `root` is the top level of a git work tree (a subdirectory does not count).
 * @param {string} root
 * @returns {boolean}
 */
export function isGitRoot(root) {
  const out = git(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (!out) return false;
  const top = out.toString("utf8").trim();
  try {
    return resolve(top) === resolve(root) || realEqual(top, root);
  } catch {
    return false;
  }
}

function realEqual(a, b) {
  const stat = (p) => lstatSync(p, { bigint: true });
  const sa = stat(a);
  const sb = stat(b);
  return sa.ino === sb.ino && sa.dev === sb.dev;
}

/**
 * Absolute path of a file under the git common directory of the repository that contains
 * `root` (shared by every worktree of a clone; never tracked), or null outside a git repository.
 * @param {string} root
 * @param {string} relPath `/`-separated path under the common directory
 * @returns {string | null}
 */
export function gitCommonPath(root, relPath) {
  const out = git(root, ["rev-parse", "--git-common-dir"], { allowFailure: true });
  if (!out) return null;
  const dir = out.toString("utf8").trim();
  if (!dir) return null;
  return join(isAbsolute(dir) ? dir : resolve(root, dir), ...relPath.split("/"));
}

/**
 * @typedef {object} FileEntry
 * @property {string} path display path (`/`-separated; relative to the root when inside it)
 * @property {string} [abs] absolute path on disk (absent for index blobs)
 * @property {Buffer} [content] content when already known (index blobs)
 * @property {boolean} [directory] an empty directory (name only)
 * @property {boolean} [nameOnly] scan the name only (for example a submodule entry)
 * @property {number} nameStart index of the first path component whose name is scanned
 */

/**
 * Files of a git work tree: tracked files plus untracked files that are not ignored
 * (`git ls-files --cached --others --exclude-standard`), as entries relative to the root.
 * @param {string} root
 * @returns {FileEntry[]}
 */
export function gitTrackedFiles(root) {
  const out = git(root, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--full-name",
  ]);
  return [...new Set(splitNul(out))].map((path) => ({ path, abs: join(root, path), nameStart: 0 }));
}

/**
 * Walk a directory (or take a single file) without following symlinks, skipping WALK_EXCLUDES.
 * @param {string} start absolute file or directory
 * @param {(abs: string) => { path: string, nameStart: number }} describe display info for a path
 * @returns {FileEntry[]}
 */
export function walk(start, describe) {
  const files = [];
  const visit = (abs) => {
    let stat;
    try {
      stat = lstatSync(abs);
    } catch (error) {
      throw new SourceError(`cannot read ${describe(abs).path} (${error.code ?? error.message})`);
    }
    if (stat.isDirectory()) {
      const names = readdirSync(abs).sort();
      if (names.length === 0) files.push({ ...describe(abs), abs, directory: true });
      for (const name of names) {
        if (!WALK_EXCLUDES.includes(name)) visit(join(abs, name));
      }
    } else if (stat.isFile() || stat.isSymbolicLink()) {
      files.push({ ...describe(abs), abs, symlink: stat.isSymbolicLink() });
    }
  };
  visit(start);
  return files;
}

/**
 * Files of the whole tree: `git ls-files` in a git root; otherwise a filesystem walk that applies
 * every .gitignore (negations included), so it lists what git would track. A checkout without a
 * root .gitignore falls back to the fixed WALK_EXCLUDES.
 * @param {string} root
 * @returns {{ files: FileEntry[], mode: "git" | "walk" }}
 */
export function treeFiles(root) {
  if (isGitRoot(root)) return { files: gitTrackedFiles(root), mode: "git" };
  if (!existsSync(join(root, ".gitignore"))) {
    const describe = (abs) => ({ path: toPosix(relative(root, abs)), nameStart: 0 });
    return { files: walk(root, describe).filter((f) => f.path !== ""), mode: "walk" };
  }
  const files = walkUnignored(root, {
    onError: (abs, error) => {
      throw new SourceError(
        `cannot read ${toPosix(relative(root, abs))} (${error.code ?? error.message})`,
      );
    },
  }).map((entry) => ({ ...entry, nameStart: 0 }));
  return { files, mode: "walk" };
}

/**
 * Files under explicit path arguments (files or directories). Paths inside the root are shown
 * relative to it and every component is name-scanned; paths outside it are shown as given and
 * only the argument's own name and what lies below it are name-scanned.
 * @param {string} root
 * @param {string[]} paths
 * @param {string} [cwd]
 * @returns {FileEntry[]}
 */
export function pathFiles(root, paths, cwd = process.cwd()) {
  const files = [];
  for (const arg of paths) {
    const abs = resolve(cwd, arg);
    const rel = relative(root, abs);
    const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    const describe = inside
      ? (p) => ({ path: toPosix(relative(root, p)) || ".", nameStart: 0 })
      : (() => {
          const base = toPosix(arg).replace(/\/+$/u, "");
          const nameStart = Math.max(0, base.split("/").length - 1);
          return (p) => ({ path: toPosix(join(arg, relative(abs, p))), nameStart });
        })();
    files.push(...walk(abs, describe));
  }
  return files;
}

/**
 * Staged files (added, copied, modified, renamed) with their content from the index. A
 * submodule (gitlink) entry has no content here but its path is still name-scanned.
 * @param {string} root
 * @returns {FileEntry[]}
 */
export function stagedFiles(root) {
  const changed = new Set(
    splitNul(git(root, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"])),
  );
  if (changed.size === 0) return [];
  const blobs = [];
  const names = [];
  for (const record of splitNul(git(root, ["ls-files", "--stage", "-z"]))) {
    const match = /^(\d{6}) ([0-9a-f]+) \d+\t(.*)$/su.exec(record);
    if (!match || !changed.has(match[3])) continue;
    if (match[1] === "160000") names.push({ path: match[3], nameOnly: true, nameStart: 0 });
    else blobs.push({ path: match[3], oid: match[2], nameStart: 0 });
  }
  const contents = readBlobs(
    root,
    blobs.map((e) => e.oid),
  );
  return [
    ...blobs.map((e) => ({ path: e.path, content: contents.get(e.oid), nameStart: 0 })),
    ...names,
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Read blobs with one `git cat-file --batch` call.
 * @param {string} root
 * @param {string[]} oids
 * @returns {Map<string, Buffer>}
 */
export function readBlobs(root, oids) {
  const unique = [...new Set(oids)];
  const blobs = new Map();
  if (unique.length === 0) return blobs;
  const out = git(root, ["cat-file", "--batch"], { input: `${unique.join("\n")}\n` });
  let i = 0;
  while (i < out.length) {
    const eol = out.indexOf(0x0a, i);
    if (eol < 0) break;
    const header = out.subarray(i, eol).toString("utf8").split(" ");
    if (header[1] === "missing" || header.length < 3) {
      i = eol + 1;
      continue;
    }
    const size = Number(header[2]);
    blobs.set(header[0], out.subarray(eol + 1, eol + 1 + size));
    i = eol + 1 + size + 1;
  }
  return blobs;
}

/**
 * @typedef {object} Identity
 * @property {string} name
 * @property {string} email
 */

/**
 * @typedef {object} CommitMessage
 * @property {string} sha full commit id
 * @property {string} message raw message (subject and body)
 * @property {Identity} author
 * @property {Identity} committer
 */

/**
 * Commit messages and identities for `git log` revision arguments (a range such as
 * `base..head`, refs, `--all`, or `<sha> --not --remotes`).
 * @param {string} root
 * @param {string[]} revisions
 * @returns {CommitMessage[]}
 */
export function commitMessages(root, revisions) {
  const out = git(root, [
    "log",
    "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e",
    ...revisions,
    "--",
  ]).toString("utf8");
  return out
    .split("\x1e")
    .map((chunk) => chunk.replace(/^\n/u, ""))
    .filter((chunk) => chunk.split("\x1f").length >= 6)
    .map((chunk) => {
      const [sha, authorName, authorEmail, committerName, committerEmail, ...rest] =
        chunk.split("\x1f");
      return {
        sha,
        message: rest.join("\x1f"),
        author: { name: authorName, email: authorEmail },
        committer: { name: committerName, email: committerEmail },
      };
    });
}

/**
 * Every path added (or renamed into place) by the commits of `git log` revision arguments.
 * @param {string} root
 * @param {string[]} revisions
 * @returns {string[]} unique `/`-separated paths
 */
export function addedPaths(root, revisions) {
  const out = git(root, [
    "log",
    "--format=",
    "--name-only",
    "-z",
    "--diff-filter=AR",
    ...revisions,
    "--",
  ]);
  return [
    ...new Set(
      splitNul(out)
        .map((p) => p.replace(/^\n+/u, ""))
        .filter(Boolean),
    ),
  ];
}

/**
 * @typedef {object} HistoryBlob
 * @property {string} sha the first commit (newest first, as git log lists them) that introduces
 *   this content
 * @property {string} path the path it has in that commit
 * @property {string} oid blob id
 */

/**
 * Every file content (blob) added or modified by the commits of `git log` revision arguments,
 * including content that a later commit removed again: pushed history publishes every commit,
 * not only the tip. Merge commits are compared with their first parent, so a conflict
 * resolution counts; submodule entries are skipped. Each blob is listed once.
 * @param {string} root
 * @param {string[]} revisions
 * @returns {HistoryBlob[]}
 */
export function historyBlobs(root, revisions) {
  const out = git(root, [
    "log",
    "--format=%x1e%H",
    "--raw",
    "--no-abbrev",
    "--no-renames",
    "--diff-merges=first-parent",
    "--diff-filter=AMT",
    "-z",
    ...revisions,
    "--",
  ]).toString("utf8");
  const seen = new Set();
  const blobs = [];
  for (const chunk of out.split("\x1e").filter(Boolean)) {
    const fields = chunk.split("\0");
    const sha = fields[0].trim();
    for (let i = 1; i + 1 < fields.length; i += 2) {
      const meta = /^\n?:(\d{6}) (\d{6}) [0-9a-f]+ ([0-9a-f]+) [A-Z]\d*$/u.exec(fields[i]);
      if (!meta) {
        i -= 1; // resynchronise on a stray field
        continue;
      }
      const [, , newMode, oid] = meta;
      if (newMode === "160000" || NULL_OID.test(oid) || seen.has(oid)) continue;
      seen.add(oid);
      blobs.push({ sha, path: fields[i + 1], oid });
    }
  }
  return blobs;
}

/**
 * @typedef {object} RefInfo
 * @property {string} name full ref name (e.g. refs/heads/dev)
 * @property {string} message annotated tag message, or ""
 * @property {Identity | null} tagger annotated tag's tagger, or null
 */

/**
 * Ref names (branches, tags, remote-tracking refs), annotated tag messages and taggers.
 * @param {string} root
 * @param {string[]} [patterns] for-each-ref patterns; all refs when empty
 * @returns {RefInfo[]}
 */
export function refs(root, patterns = []) {
  const out = git(root, [
    "for-each-ref",
    "--format=%(refname)%1f%(objecttype)%1f%(taggername)%1f%(taggeremail)%1f%(contents)%1e",
    ...patterns,
  ]).toString("utf8");
  return out
    .split("\x1e")
    .map((chunk) => chunk.replace(/^\n/u, ""))
    .filter((chunk) => chunk.includes("\x1f"))
    .map((chunk) => {
      const [name, type, taggerName, taggerEmail, ...contents] = chunk.split("\x1f");
      const tag = type === "tag";
      return {
        name,
        message: tag ? contents.join("\x1f") : "",
        tagger: tag ? { name: taggerName, email: taggerEmail.replace(/^<|>$/gu, "") } : null,
      };
    });
}

/**
 * The author and committer identity the next commit in `root` will carry (`git var`), as
 * configured by user.name/user.email or the GIT_AUTHOR_* / GIT_COMMITTER_* variables.
 * @param {string} root
 * @returns {Array<{ role: "author" | "committer", identity: Identity }>} roles git can resolve
 */
export function nextCommitIdentities(root) {
  const identities = [];
  for (const [role, variable] of [
    ["author", "GIT_AUTHOR_IDENT"],
    ["committer", "GIT_COMMITTER_IDENT"],
  ]) {
    const out = git(root, ["var", variable], { allowFailure: true });
    if (!out) continue;
    const match = /^(.*?) <([^>]*)> \d+ [+-]\d{4}$/u.exec(out.toString("utf8").trim());
    if (match) identities.push({ role, identity: { name: match[1], email: match[2] } });
  }
  return identities;
}

/**
 * Revision arguments for each ref of a `pre-push` hook's standard input
 * (`<local ref> <local sha> <remote ref> <remote sha>` per line): the commits the push would
 * publish. Deletions are skipped; a new remote ref covers the commits no remote-tracking ref has.
 * @param {string} stdin
 * @returns {Array<{ localRef: string, remoteRef: string, revisions: string[] }>}
 */
export function prePushRanges(stdin) {
  const ranges = [];
  for (const line of stdin.split(/\r?\n/u)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length !== 4) continue;
    const [localRef, localSha, remoteRef, remoteSha] = fields;
    if (NULL_OID.test(localSha)) continue;
    const revisions = NULL_OID.test(remoteSha)
      ? [localSha, "--not", "--remotes"]
      : [`${remoteSha}..${localSha}`];
    ranges.push({ localRef, remoteRef, revisions });
  }
  return ranges;
}

/**
 * Read a file entry's bytes (a symbolic link reads as its target path, as git stores it).
 * @param {FileEntry} entry
 * @returns {Buffer | null} null for directories, name-only entries and files that vanished
 * @throws {SourceError}
 */
export function readEntry(entry) {
  if (entry.content) return entry.content;
  if (!entry.abs || entry.directory || entry.nameOnly) return null;
  try {
    const stat = lstatSync(entry.abs);
    if (stat.isSymbolicLink()) return Buffer.from(readlinkSync(entry.abs), "utf8");
    if (stat.isDirectory()) return null;
    return readFileSync(entry.abs);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new SourceError(`cannot read ${entry.path} (${error.code ?? error.message})`);
  }
}

// git's scissors line: the comment character, a space, dashes, " >8 ", dashes.
const SCISSORS = /^\S{1,2} -+ >8 -+$/u;

/**
 * The part of a commit message file that can end up in the commit. Everything below a scissors
 * line is dropped (git always does that); comment lines are kept, because git keeps them too
 * when the message comes from `-m`/`-F` without an editor, with `--cleanup=verbatim` or
 * `whitespace`, or when `core.commentChar` is another character. Scanning git's own template
 * comments as well is the price of never letting a kept line through.
 * @param {string} text
 * @returns {string}
 */
export function commitMessageText(text) {
  const lines = text.split(/\r?\n/u);
  const scissors = lines.findIndex((line) => SCISSORS.test(line));
  return (scissors >= 0 ? lines.slice(0, scissors) : lines).join("\n");
}

/**
 * Read all of standard input.
 * @returns {string}
 */
export function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch (error) {
    if (error.code === "EAGAIN" || error.code === "EOF") return "";
    throw new SourceError(`cannot read standard input (${error.code ?? error.message})`);
  }
}

/**
 * @param {Buffer | null} buffer
 * @returns {string[]}
 */
function splitNul(buffer) {
  if (!buffer) return [];
  return buffer
    .toString("utf8")
    .split("\0")
    .filter((s) => s.length > 0);
}
