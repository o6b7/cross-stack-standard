/**
 * Fingerprint of a project's working state, and the per-project record of the last states the
 * Stop gate passed and failed on. The Stop hook skips its gate when the fingerprint equals the
 * last green one, so a turn that changed nothing costs only this computation.
 *
 * What the fingerprint covers:
 *
 * - In a git work tree:
 *   - every changed and untracked file reported by `git status --porcelain=v1 -z
 *     --untracked-files=all --ignore-submodules=none -- .` run in the project directory, as its
 *     path plus a hash of its content (a second edit to an already-changed file therefore gives
 *     a new fingerprint), plus the commit `HEAD` points at, so committing a change is a new
 *     state too. The status letters are not included: staging a file does not change what the
 *     gate checks;
 *   - every tracked file that `git status` does not compare with the work tree because the
 *     index marks it skip-worktree or assume-unchanged (`git ls-files -v`: tag `S` or a
 *     lower-case tag), with the hash of its content;
 *   - the content of the repository's `info/exclude` file and of the global excludes file
 *     (`core.excludesFile`, else `$XDG_CONFIG_HOME/git/ignore` or `~/.config/git/ignore`), so a
 *     new exclude pattern is a new state;
 *   - each repository inside the project that the status reports as a single entry (a nested
 *     repository `?? web/`, a submodule ` M web`): its own `HEAD`, changed files, flagged files
 *     and exclude files, recursively, within {@link FINGERPRINT_LIMITS};
 *   - each track root the caller passes (`trackRoots`) that the status above does not cover: a
 *     nested repository or a submodule gets its own git state as above; a directory that is not
 *     part of the repository's committed tree (ignored, or not added yet) is walked as below.
 *
 *   Git runs with `--no-optional-locks`, so reading the status never takes the index lock that
 *   a concurrent git command may need, and with `core.fsmonitor` turned off, so a file-system
 *   monitor hook cannot decide what the status reports.
 * - Outside git, when git is not installed, or when the project sits below the root of a
 *   repository whose committed tree does not contain it: every file under the project, found
 *   by a bounded walk that skips the same dependency, build and tool directories as track
 *   detection ({@link PRUNED_DIRS}), every dot-directory except `.cross-stack`, and the cache
 *   files that tools rewrite on every run ({@link WALK_IGNORED_FILES}, `*.tsbuildinfo`). Each
 *   file contributes its `lstat` signature: size, modification time and change time in
 *   nanoseconds, and inode. The signature is cheap and does not depend on timing, and a tool can
 *   reset a modification time but not a change time.
 * - A caller-supplied `extra` value (the Stop gate passes its plan: command, directories and
 *   tool availability), so a changed gate configuration is a new state.
 *
 * In git mode, content is hashed with SHA-256 up to the byte caps of {@link FINGERPRINT_LIMITS};
 * a file above them contributes its `lstat` signature. No descriptor depends on how long the
 * computation takes. Anything that makes the fingerprint incomplete (too many files or nested
 * repositories, a walk past its limits, the time limit, unreadable git output) returns a null
 * fingerprint: the caller then runs its gate and records nothing. A missed skip costs one gate
 * run; a wrong skip would hide a failure.
 *
 * The record lives in `${CLAUDE_PLUGIN_DATA}/<project-key>.json`, which Claude Code keeps across
 * plugin updates. Without that variable (or when it points inside the project) a directory under
 * the system temporary directory is used. Nothing is ever written inside the project.
 *
 * @module plugins/cross-stack-standard/scripts/lib/fingerprint
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { PRUNED_DIRS } from "./detect.mjs";
import { isWithin, samePath, toPosix } from "./project.mjs";
import { runTool, toolEnv } from "./spawn.mjs";

/** Version of the fingerprint format; part of every fingerprint. */
export const FINGERPRINT_VERSION = 2;

/** Bounds of one fingerprint computation. */
export const FINGERPRINT_LIMITS = Object.freeze({
  /** Files described (changed, flagged or walked); more makes the fingerprint incomplete. */
  maxEntries: 20_000,
  /** Largest file whose content is hashed; larger files contribute their `lstat` signature. */
  maxFileBytes: 8 * 1024 * 1024,
  /** Content hashed in total; files after that contribute their `lstat` signature. */
  maxHashBytes: 128 * 1024 * 1024,
  /** Directories one walk reads at most. */
  maxDirs: 5_000,
  /** Deepest directory level a walk enters (the walked directory is level 0). */
  maxDepth: 16,
  /** Repositories inside the project (nested repositories, submodules) read at most. */
  maxNestedRepos: 32,
  /** Deepest level of a repository inside a repository (a nested repository is level 1). */
  maxNestingDepth: 4,
  /** Time for the whole computation, git included, in milliseconds. */
  timeMs: 5_000,
  /** Largest output read from one git command. */
  maxGitOutputBytes: 16 * 1024 * 1024,
});

/** Dot-directories the walk enters: the Standard's own configuration. */
export const WALKED_DOT_DIRS = Object.freeze([".cross-stack"]);

/**
 * Cache files the walk leaves out: linters and test runners rewrite them on every run, so the
 * state after a gate run would never equal the state before it. A git project normally ignores
 * them in `.gitignore`. Files ending in `.tsbuildinfo` are left out as well.
 */
export const WALK_IGNORED_FILES = Object.freeze([
  ".eslintcache",
  ".stylelintcache",
  ".phpunit.result.cache",
  ".php-cs-fixer.cache",
  ".php_cs.cache",
]);

/** Directory under the system temporary directory used when no plugin data directory is set. */
export const FALLBACK_STATE_DIR = "cross-stack-standard-data";

/** Version of the state file format. */
export const STATE_VERSION = 1;

const PRUNED = new Set(PRUNED_DIRS);
const WALKED_DOTS = new Set(WALKED_DOT_DIRS);
const WALK_IGNORED = new Set(WALK_IGNORED_FILES);
const WALK_IGNORED_SUFFIXES = Object.freeze([".tsbuildinfo"]);
const HEX64 = /^[0-9a-f]{64}$/;
const IS_WINDOWS = process.platform === "win32";

/**
 * Options every git command of the fingerprint runs with: no optional locks, and no
 * file-system monitor (git reads an empty `core.fsmonitor` as off, whether it expects a
 * boolean or a hook path).
 */
const GIT_OPTIONS = Object.freeze(["--no-optional-locks", "-c", "core.fsmonitor="]);

/**
 * @typedef {object} StatusEntry
 * @property {string} status The two status letters (`XY`).
 * @property {string} path Path relative to the repository root, with `/` separators.
 * @property {string} [origPath] The source path of a rename or copy.
 */

/**
 * Parses the output of `git status --porcelain=v1 -z`. Each entry is `XY <path>` followed by
 * NUL; a rename or copy is followed by one more NUL-terminated field, its source path.
 *
 * @param {string} text
 * @returns {StatusEntry[] | null} null when the output does not have that shape.
 */
export function parsePorcelainZ(text) {
  // Every entry ends with NUL, so non-empty output does too (the newline format does not).
  if (text !== "" && !text.endsWith("\0")) return null;
  const fields = text.split("\0");
  /** @type {StatusEntry[]} */
  const entries = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === "") {
      if (index === fields.length - 1) break;
      return null;
    }
    if (field.length < 4 || field[2] !== " ") return null;
    const status = field.slice(0, 2);
    /** @type {StatusEntry} */
    const entry = { status, path: field.slice(3) };
    if (/[RC]/.test(status)) {
      index += 1;
      if (index >= fields.length || fields[index] === "") return null;
      entry.origPath = fields[index];
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * @typedef {object} FlaggedEntry
 * @property {string} tag The `git ls-files -v` tag: `S` (skip-worktree) or a lower-case letter
 *   (assume-unchanged).
 * @property {string} path Path relative to the repository root, with `/` separators.
 */

/**
 * The entries of `git ls-files -v -z` output that `git status` does not compare with the work
 * tree: skip-worktree (`S`) and assume-unchanged (any lower-case tag).
 *
 * @param {string} text
 * @returns {FlaggedEntry[] | null} null when the output does not have that shape.
 */
export function parseFlaggedLsFiles(text) {
  if (text !== "" && !text.endsWith("\0")) return null;
  /** @type {FlaggedEntry[]} */
  const flagged = [];
  for (const field of text.split("\0").slice(0, -1)) {
    if (field.length < 3 || field[1] !== " ") return null;
    const tag = field[0];
    if (tag === "S" || (tag >= "a" && tag <= "z")) flagged.push({ tag, path: field.slice(2) });
  }
  return flagged;
}

/**
 * @typedef {object} GitState
 * @property {"repo" | "none" | "error"} kind `none`: not a work tree, git is not installed, or
 *   the enclosing repository's committed tree does not contain the directory.
 * @property {string} [topLevel] The repository root (kind `repo`).
 * @property {string | null} [head] The commit `HEAD` points at; null before the first commit.
 * @property {StatusEntry[]} [entries] Changed and untracked files inside the directory.
 * @property {FlaggedEntry[]} [flagged] Skip-worktree and assume-unchanged files inside it.
 * @property {string[]} [excludeFiles] Absolute paths of the exclude files git reads.
 * @property {string} [reason] Why the state is `none` or `error`.
 */

/** The global excludes file git reads when `core.excludesFile` is not set. */
function defaultExcludesFile(env) {
  const xdg = env.XDG_CONFIG_HOME;
  if (typeof xdg === "string" && xdg !== "" && path.isAbsolute(xdg)) {
    return path.join(xdg, "git", "ignore");
  }
  const home = env.HOME || env.USERPROFILE;
  return typeof home === "string" && path.isAbsolute(home)
    ? path.join(home, ".config", "git", "ignore")
    : null;
}

/** The failure of a git command whose output the state needs, or null. */
function gitFailure(name, run) {
  if (run.error !== null) return `${name}: ${run.error.code}`;
  if (run.timedOut) return `${name} timed out`;
  if (run.exitCode !== 0) return `${name} exited with code ${run.exitCode}`;
  if (run.truncated) return `${name} output exceeded its cap`;
  return null;
}

/**
 * Reads the git state of a directory: the repository root, `HEAD`, the changed, untracked and
 * flagged files under the directory, and the exclude files that decide what the status shows.
 * With `probe`, only the repository root and `HEAD` are read.
 *
 * @param {{ root: string, env?: Record<string, string | undefined>, timeoutMs: number, maxOutputBytes?: number, probe?: boolean }} options
 * @returns {Promise<GitState>}
 */
export async function readGitState({
  root,
  env = process.env,
  timeoutMs,
  maxOutputBytes = FINGERPRINT_LIMITS.maxGitOutputBytes,
  probe = false,
}) {
  const started = performance.now();
  const remaining = () => Math.max(1, Math.floor(timeoutMs - (performance.now() - started)));
  const git = (args) =>
    runTool({
      command: "git",
      args: [...GIT_OPTIONS, ...args],
      cwd: root,
      env: toolEnv(env),
      timeoutMs: remaining(),
      maxBufferBytes: maxOutputBytes,
    });

  // `--verify -q HEAD` prints nothing and exits 1 before the first commit; the top level and
  // the exclude file are printed either way. Exit 128 means the directory is not in a work tree.
  const revParse = await git([
    "rev-parse",
    "--show-toplevel",
    "--git-path",
    "info/exclude",
    "--verify",
    "-q",
    "HEAD",
  ]);
  if (revParse.error !== null) return { kind: "none", reason: `git: ${revParse.error.code}` };
  if (revParse.timedOut) return { kind: "error", reason: "git rev-parse timed out" };
  const lines = revParse.stdout.split(/\r?\n/).filter((line) => line !== "");
  if (revParse.exitCode !== 0 && !(revParse.exitCode === 1 && lines.length === 2)) {
    return { kind: "none", reason: `not a git work tree (git exit code ${revParse.exitCode})` };
  }
  const [topLevel, excludePath, headLine] = lines;
  if (topLevel === undefined || !path.isAbsolute(topLevel) || excludePath === undefined) {
    return { kind: "error", reason: "git rev-parse printed no repository root" };
  }
  const head =
    revParse.exitCode === 0 && /^[0-9a-f]{40,64}$/.test(headLine ?? "") ? headLine : null;

  // A directory below the repository root must be part of the committed tree. Otherwise it may
  // be ignored by an enclosing repository (a home directory kept in git with everything
  // ignored), where the status would stay empty whatever changes.
  if (!samePath(canonicalPath(topLevel), canonicalPath(root))) {
    const tracked = await git(["rev-parse", "--verify", "-q", "HEAD:./"]);
    if (tracked.timedOut) return { kind: "error", reason: "git rev-parse timed out" };
    if (tracked.error !== null || tracked.exitCode !== 0) {
      return { kind: "none", reason: "the enclosing git repository does not track the project" };
    }
  }
  if (probe) return { kind: "repo", topLevel: path.resolve(topLevel), head };

  const statusArgs = ["status", "--porcelain=v1", "-z", "--untracked-files=all"];
  const [status, lsFiles, excludesConfig] = await Promise.all([
    git([...statusArgs, "--ignore-submodules=none", "--", "."]),
    git(["ls-files", "-v", "-z", "--full-name", "--", "."]),
    git(["config", "--path", "--get", "core.excludesFile"]),
  ]);
  const failure = gitFailure("git status", status) ?? gitFailure("git ls-files", lsFiles);
  if (failure !== null) return { kind: "error", reason: failure };
  const entries = parsePorcelainZ(status.stdout);
  if (entries === null) return { kind: "error", reason: "git status output could not be parsed" };
  const flagged = parseFlaggedLsFiles(lsFiles.stdout);
  if (flagged === null) return { kind: "error", reason: "git ls-files output could not be parsed" };

  // `git config --get` exits 1 when the key is not set; git then reads the default file. A
  // relative value is relative to the work tree's root, where git runs its status.
  let excludesFile;
  if (excludesConfig.exitCode === 1 && excludesConfig.error === null) {
    excludesFile = defaultExcludesFile(env);
  } else {
    const configFailure = gitFailure("git config", excludesConfig);
    if (configFailure !== null) return { kind: "error", reason: configFailure };
    const value = excludesConfig.stdout.replace(/\r?\n$/, "");
    excludesFile = value === "" ? null : path.resolve(topLevel, value);
  }
  const excludeFiles = [path.resolve(root, excludePath)];
  if (excludesFile !== null) excludeFiles.push(excludesFile);

  return { kind: "repo", topLevel: path.resolve(topLevel), head, entries, flagged, excludeFiles };
}

/**
 * @typedef {object} WalkResult
 * @property {string[] | null} files Root-relative paths with `/`; null when incomplete.
 * @property {string | null} reason Why the walk is incomplete.
 * @property {number} dirs
 */

function walkIgnoredFile(name) {
  return WALK_IGNORED.has(name) || WALK_IGNORED_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * Lists a directory's files for a fingerprint outside git: breadth-first, symbolic links listed
 * but not followed, pruned directories and tool caches skipped. Exceeding any bound makes the
 * result incomplete.
 *
 * @param {string} root
 * @param {{ limits?: Partial<typeof FINGERPRINT_LIMITS>, deadline?: number, now?: () => number }} [options]
 *   `deadline` is a value of the clock `now` (default `performance.now()`).
 * @returns {WalkResult}
 */
export function walkProjectFiles(root, options = {}) {
  const limits = { ...FINGERPRINT_LIMITS, ...options.limits };
  const now = options.now ?? (() => performance.now());
  const deadline = options.deadline ?? now() + limits.timeMs;
  const files = [];
  const queue = [{ dir: root, rel: "", depth: 0 }];
  let dirs = 0;
  for (let head = 0; head < queue.length; head += 1) {
    if (dirs >= limits.maxDirs) return { files: null, reason: "too many directories", dirs };
    if (now() > deadline) return { files: null, reason: "time limit", dirs };
    const { dir, rel, depth } = queue[head];
    let listing;
    try {
      listing = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // An unreadable directory is listed as one entry, so the result stays deterministic.
      if (rel !== "") files.push(`${rel}/`);
      continue;
    }
    dirs += 1;
    for (const entry of listing) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (PRUNED.has(entry.name)) continue;
        if (entry.name.startsWith(".") && !WALKED_DOTS.has(entry.name)) continue;
        if (depth + 1 > limits.maxDepth) return { files: null, reason: "too deep", dirs };
        queue.push({ dir: path.join(dir, entry.name), rel: childRel, depth: depth + 1 });
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (walkIgnoredFile(entry.name)) continue;
        files.push(childRel);
        if (files.length > limits.maxEntries) {
          return { files: null, reason: "too many files", dirs };
        }
      }
    }
  }
  return { files, reason: null, dirs };
}

/**
 * The `lstat` signature of one path: `stat:<size>:<mtimeNs>:<ctimeNs>:<ino>` for a file,
 * `link:<target>`, `dir`, `other:<mode>`, `missing`, or `error:<code>`. It does not depend on
 * timing, and a rewrite changes the change time even when the modification time is reset.
 *
 * @param {string} file Absolute path.
 * @returns {string}
 */
export function signaturePath(file) {
  let stat;
  try {
    stat = fs.lstatSync(file, { bigint: true });
  } catch (error) {
    return error?.code === "ENOENT" || error?.code === "ENOTDIR"
      ? "missing"
      : `error:${error?.code ?? "?"}`;
  }
  if (stat.isSymbolicLink()) {
    try {
      return `link:${fs.readlinkSync(file)}`;
    } catch (error) {
      return `error:${error?.code ?? "?"}`;
    }
  }
  if (stat.isDirectory()) return "dir";
  if (!stat.isFile()) return `other:${stat.mode}`;
  return `stat:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.ino}`;
}

/**
 * The fingerprint contribution of one path in git mode: `sha256:<hex>` of its content, or its
 * {@link signaturePath} above the byte caps and for anything that is not a regular file. The
 * caps count bytes, never time, so the same tree always gives the same descriptors.
 *
 * @param {string} file Absolute path.
 * @param {{ hashed: number, limits: typeof FINGERPRINT_LIMITS }} state `hashed` is updated
 *   with the bytes read.
 * @returns {string}
 */
export function describePath(file, state) {
  const signature = signaturePath(file);
  if (!signature.startsWith("stat:")) return signature;
  const size = Number(signature.split(":")[1]);
  if (size > state.limits.maxFileBytes || state.hashed + size > state.limits.maxHashBytes) {
    return signature;
  }
  try {
    const content = fs.readFileSync(file);
    state.hashed += content.length;
    return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
  } catch (error) {
    return `error:${error?.code ?? "?"}`;
  }
}

/**
 * @typedef {object} Fingerprint
 * @property {string | null} fingerprint 64 hex characters; null when incomplete.
 * @property {"git" | "walk"} mode
 * @property {number} files Files included.
 * @property {string | null} reason Why the fingerprint is null, or why git was not used.
 * @property {number} durationMs
 * @property {Map<string, string>} records What was hashed: `<kind>\t<path>` → descriptor.
 */

/**
 * Computes the fingerprint of a project's working state (see the module description).
 *
 * @param {object} options
 * @param {string} options.root The project directory.
 * @param {Record<string, string | undefined>} [options.env] Environment for git.
 * @param {unknown} [options.extra] Any JSON value to include (the gate plan).
 * @param {string[]} [options.trackRoots] Directories inside the project the gate runs in.
 * @param {Partial<typeof FINGERPRINT_LIMITS>} [options.limits]
 * @param {number} [options.timeLimitMs] Time for the whole computation (default
 *   `limits.timeMs`).
 * @param {() => number} [options.now] Clock in milliseconds for the time limit (tests pass
 *   their own).
 * @returns {Promise<Fingerprint>}
 */
export async function computeFingerprint({
  root,
  env = process.env,
  extra = null,
  trackRoots = [],
  limits: limitOverrides = {},
  timeLimitMs,
  now = () => performance.now(),
}) {
  const limits = { ...FINGERPRINT_LIMITS, ...limitOverrides };
  const started = now();
  const deadline = started + Math.max(1, timeLimitMs ?? limits.timeMs);
  const pastDeadline = () => now() > deadline;
  /** @type {Map<string, string>} */
  const records = new Map();
  const hashState = { hashed: 0, limits };
  let files = 0;
  let mode = "walk";
  const result = (fields) => ({
    fingerprint: null,
    mode,
    files,
    reason: null,
    durationMs: Math.round(now() - started),
    records,
    ...fields,
  });

  const readState = (dir, probe = false) =>
    readGitState({
      root: dir,
      env,
      timeoutMs: Math.max(1, deadline - now()),
      maxOutputBytes: limits.maxGitOutputBytes,
      probe,
    });

  /** Adds one file record; returns a problem when that exceeds the cap. */
  const addFile = (key, value) => {
    if (!records.has(key)) files += 1;
    records.set(key, value);
    return files > limits.maxEntries ? `more than ${limits.maxEntries} files` : null;
  };

  /** Walks `dir` into records `<kind>\t<prefix>/<file>`; returns a problem or null. */
  const addWalk = (dir, kind, prefix) => {
    const walk = walkProjectFiles(dir, { limits, deadline, now });
    if (walk.files === null) return `walk stopped: ${walk.reason}`;
    for (const rel of walk.files) {
      if (pastDeadline()) return "time limit";
      const key = `${kind}\t${prefix === "" ? rel : `${prefix}/${rel}`}`;
      const problem = addFile(key, signaturePath(path.join(dir, ...rel.split("/"))));
      if (problem !== null) return problem;
    }
    return null;
  };

  const git = await readState(root);
  if (pastDeadline()) return result({ reason: "time limit" });
  if (git.kind === "error") return result({ mode: "git", reason: git.reason });

  let problem = null;
  if (git.kind === "none") {
    problem = addWalk(root, "file", "");
  } else {
    mode = "git";
    problem = await addGitStates({
      git,
      root,
      trackRoots,
      limits,
      records,
      hashState,
      addFile,
      addWalk,
      readState,
      pastDeadline,
    });
  }
  if (problem !== null) return result({ reason: problem });

  const hash = crypto.createHash("sha256");
  hash.update(`cross-stack-standard fingerprint v${FINGERPRINT_VERSION}\n`);
  hash.update(`${JSON.stringify({ mode, extra })}\n`);
  for (const key of [...records.keys()].sort()) {
    hash.update(`${JSON.stringify([key, records.get(key)])}\n`);
  }
  return result({
    fingerprint: hash.digest("hex"),
    reason: git.kind === "none" ? (git.reason ?? null) : null,
  });
}

/**
 * The git-mode part of {@link computeFingerprint}: the main repository's state, the
 * repositories inside it, and the track roots git does not cover. Record keys are paths
 * relative to the main repository's root.
 *
 * @returns {Promise<string | null>} A problem that makes the fingerprint incomplete, or null.
 */
async function addGitStates({
  git,
  root,
  trackRoots,
  limits,
  records,
  hashState,
  addFile,
  addWalk,
  readState,
  pastDeadline,
}) {
  const mainTop = canonicalPath(git.topLevel);
  const keyOf = (abs) => toPosix(path.relative(mainTop, canonicalPath(abs))) || ".";
  /** Canonical roots of the repositories already read in full. */
  const readInFull = new Set([mainTop]);
  let nested = 0;

  /**
   * Adds one repository's state: the main one (depth 0) or one inside it.
   *
   * @param {GitState} state
   * @param {number} depth
   * @returns {Promise<string | null>}
   */
  const addRepo = async (state, depth) => {
    const top = canonicalPath(/** @type {string} */ (state.topLevel));
    records.set(`head\t${keyOf(top)}`, state.head ?? "none");
    for (const file of /** @type {string[]} */ (state.excludeFiles)) {
      records.set(`exclude\t${toPosix(file)}`, describePath(file, hashState));
    }
    const entries = /** @type {StatusEntry[]} */ (state.entries);
    if (entries.length > limits.maxEntries) return `more than ${limits.maxEntries} changed files`;
    for (const entry of entries) {
      for (const rel of entry.origPath === undefined
        ? [entry.path]
        : [entry.path, entry.origPath]) {
        // A name git could not print as UTF-8 cannot be read back reliably.
        if (rel.includes("�")) return `unreadable file name ${rel}`;
        if (pastDeadline()) return "time limit";
        const abs = path.join(top, ...rel.split("/").filter((part) => part !== ""));
        const key = keyOf(abs);
        if (records.has(`file\t${key}`)) continue;
        const value = describePath(abs, hashState);
        const problem =
          value === "dir"
            ? await addNested(abs, entry.status, top, depth + 1)
            : addFile(`file\t${key}`, value);
        if (problem !== null) return problem;
      }
    }
    for (const { tag, path: rel } of /** @type {FlaggedEntry[]} */ (state.flagged)) {
      if (pastDeadline()) return "time limit";
      const abs = path.join(top, ...rel.split("/"));
      // A flagged file that is not in the work tree (a sparse checkout) is read by nothing; it
      // counts once it appears.
      if (signaturePath(abs) === "missing") continue;
      const problem = addFile(`flag\t${keyOf(abs)}`, `${tag}:${describePath(abs, hashState)}`);
      if (problem !== null) return problem;
    }
    return null;
  };

  /**
   * Adds a directory that the status of the repository `parentTop` reports as one entry, or a
   * track root inside another repository: its own git state, or a walk when git does not
   * describe it.
   *
   * @param {string} dir
   * @param {string} status The status letters, or `root` for a track root.
   * @param {string} parentTop
   * @param {number} depth
   * @returns {Promise<string | null>}
   */
  const addNested = async (dir, status, parentTop, depth) => {
    nested += 1;
    if (nested > limits.maxNestedRepos) {
      return `more than ${limits.maxNestedRepos} nested repositories`;
    }
    if (depth > limits.maxNestingDepth) {
      return `nested repositories deeper than ${limits.maxNestingDepth} levels`;
    }
    const state = await readState(dir);
    if (pastDeadline()) return "time limit";
    if (state.kind === "error") return `${keyOf(dir)}: ${state.reason}`;
    if (state.kind === "none") return addWalk(dir, "walk", keyOf(dir));
    const top = canonicalPath(/** @type {string} */ (state.topLevel));
    const ownRoot = samePath(top, canonicalPath(dir));
    if (samePath(top, parentTop)) {
      // Not a repository of its own: the parent's status lists the files inside it.
      records.set(`dir\t${keyOf(dir)}`, status);
      return null;
    }
    if (ownRoot) {
      if (readInFull.has(top)) return null;
      readInFull.add(top);
    }
    return addRepo(state, depth);
  };

  const problem = await addRepo(git, 0);
  if (problem !== null) return problem;

  for (const dir of trackRoots) {
    if (samePath(canonicalPath(dir), canonicalPath(root))) continue;
    if (pastDeadline()) return "time limit";
    const key = keyOf(dir);
    if (!isDirectory(dir)) {
      records.set(`root\t${key}`, "missing");
      continue;
    }
    const probe = await readState(dir, true);
    if (pastDeadline()) return "time limit";
    let rootProblem = null;
    if (probe.kind === "error") {
      rootProblem = `${key}: ${probe.reason}`;
    } else if (probe.kind === "none") {
      // Not in the committed tree of its repository (ignored, or not added yet): walk it.
      rootProblem = addWalk(dir, "walk", key);
    } else {
      const top = canonicalPath(/** @type {string} */ (probe.topLevel));
      // Inside the main repository's committed tree, or a repository read in full already:
      // covered. Otherwise the track root lies in a repository of its own.
      if (!samePath(top, mainTop) && !readInFull.has(top)) {
        rootProblem = await addNested(dir, "root", mainTop, 1);
      }
    }
    if (rootProblem !== null) return rootProblem;
  }
  return null;
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The paths whose descriptors differ between two fingerprints' records, sorted.
 *
 * @param {Map<string, string>} a
 * @param {Map<string, string>} b
 * @returns {string[]} Record keys without their kind (`file\tsrc/a.js` → `src/a.js`).
 */
export function changedPaths(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys]
    .filter((key) => a.get(key) !== b.get(key))
    .map((key) => key.slice(key.indexOf("\t") + 1))
    .sort();
}

/**
 * A path in canonical form even when it does not exist yet: the nearest existing ancestor's
 * real path joined with the rest (on macOS the temporary directory is reached through a link).
 *
 * @param {string} value
 * @returns {string}
 */
export function canonicalPath(value) {
  const rest = [];
  let current = path.resolve(value);
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(value);
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * The key naming a project's state file: a SHA-256 prefix of its canonical path (lower-cased on
 * Windows, where paths are case-insensitive).
 *
 * @param {string} projectRoot
 * @returns {string} 32 hex characters.
 */
export function projectKey(projectRoot) {
  const canonical = canonicalPath(projectRoot);
  const normalised = IS_WINDOWS ? canonical.toLowerCase() : canonical;
  return crypto.createHash("sha256").update(normalised).digest("hex").slice(0, 32);
}

/**
 * The directory that holds project state files: `dataDir` (`CLAUDE_PLUGIN_DATA`) when it is an
 * absolute path outside the project, else a directory under the system temporary directory
 * when that is outside the project, else null (nothing is recorded).
 *
 * @param {{ dataDir?: string | null, projectRoot: string, tmpDir?: string }} options
 * @returns {string | null}
 */
export function stateDirFor({ dataDir, projectRoot, tmpDir = os.tmpdir() }) {
  const root = canonicalPath(projectRoot);
  const candidates = [];
  if (typeof dataDir === "string" && dataDir !== "" && path.isAbsolute(dataDir)) {
    candidates.push(dataDir);
  }
  if (typeof tmpDir === "string" && tmpDir !== "") {
    candidates.push(path.join(tmpDir, FALLBACK_STATE_DIR));
  }
  for (const candidate of candidates) {
    const dir = canonicalPath(candidate);
    if (!isWithin(dir, root)) return dir;
  }
  return null;
}

/**
 * The state file of a project, or null when there is nowhere to keep one.
 *
 * @param {{ dataDir?: string | null, projectRoot: string, tmpDir?: string }} options
 * @returns {string | null}
 */
export function stateFileFor(options) {
  const dir = stateDirFor(options);
  return dir === null ? null : path.join(dir, `${projectKey(options.projectRoot)}.json`);
}

function readState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function readStopFingerprint(options, name) {
  const file = stateFileFor(options);
  if (file === null) return null;
  const value = readState(file)?.stop?.[name];
  return typeof value === "string" && HEX64.test(value) ? value : null;
}

/**
 * The fingerprint of the last state the Stop gate passed on, or null.
 *
 * @param {{ dataDir?: string | null, projectRoot: string, tmpDir?: string }} options
 * @returns {string | null}
 */
export function readGreenFingerprint(options) {
  return readStopFingerprint(options, "greenFingerprint");
}

/**
 * The fingerprint of the last state the Stop gate failed on (and blocked the stop), or null.
 *
 * @param {{ dataDir?: string | null, projectRoot: string, tmpDir?: string }} options
 * @returns {string | null}
 */
export function readFailingFingerprint(options) {
  return readStopFingerprint(options, "failingFingerprint");
}

/**
 * Replaces the `stop` key of a project's state file with `update(previous)`; other keys are
 * kept. The file is replaced atomically (written next to it, then renamed). Never throws.
 *
 * @param {{ dataDir?: string | null, projectRoot: string, tmpDir?: string }} options
 * @param {(previous: Record<string, any>) => Record<string, unknown>} update
 * @returns {string | null} The state file, or null when nothing was written.
 */
function writeStopState(options, update) {
  const file = stateFileFor(options);
  if (file === null) return null;
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const state = readState(file);
    const previous = state.stop;
    state.version = STATE_VERSION;
    state.project = toPosix(canonicalPath(options.projectRoot));
    state.stop = update(
      previous !== null && typeof previous === "object" && !Array.isArray(previous) ? previous : {},
    );
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
    return file;
  } catch {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Nothing more to clean up.
    }
    return null;
  }
}

/**
 * Records the fingerprint of a state the Stop gate passed on, and clears the failing record.
 * Other keys of the state file are kept. Never throws.
 *
 * @param {{ dataDir?: string | null, projectRoot: string, tmpDir?: string, fingerprint: string, now?: Date }} options
 * @returns {string | null} The state file, or null when nothing was written.
 */
export function recordGreenFingerprint({ fingerprint, now = new Date(), ...options }) {
  if (typeof fingerprint !== "string" || !HEX64.test(fingerprint)) return null;
  return writeStopState(options, () => ({
    greenFingerprint: fingerprint,
    recordedAt: now.toISOString(),
  }));
}

/**
 * Records the fingerprint of a state the Stop gate failed on; the green record is kept. When
 * the next stop carries `stop_hook_active` and the state is still this one, Claude changed
 * nothing since the block, and the stop goes through. Never throws.
 *
 * @param {{ dataDir?: string | null, projectRoot: string, tmpDir?: string, fingerprint: string, now?: Date }} options
 * @returns {string | null} The state file, or null when nothing was written.
 */
export function recordFailingFingerprint({ fingerprint, now = new Date(), ...options }) {
  if (typeof fingerprint !== "string" || !HEX64.test(fingerprint)) return null;
  return writeStopState(options, (previous) => ({
    ...(typeof previous.greenFingerprint === "string"
      ? { greenFingerprint: previous.greenFingerprint, recordedAt: previous.recordedAt }
      : {}),
    failingFingerprint: fingerprint,
    failedAt: now.toISOString(),
  }));
}
