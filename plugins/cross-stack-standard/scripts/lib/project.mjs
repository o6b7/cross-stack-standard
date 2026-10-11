/**
 * Paths one hook run works with, and the scopes the hooks read files from:
 *
 * - the working directory, `cwd` from the hook input (it follows the session's Bash `cd`, so it
 *   can lie anywhere: another working directory, the scratchpad, a cloned third-party repo);
 * - the project directory, `CLAUDE_PROJECT_DIR`;
 * - the repository root: the nearest directory at or above the project directory that holds
 *   `.git` (a directory, or the file of a worktree or submodule), found without running git;
 * - the opt-out memory directories: the working directory and each parent up to the project
 *   directory, keeping only directories that lie inside the project both as written and after
 *   following symbolic links; the project directory itself is always searched;
 * - the manifest directories: the project directory and each parent up to the repository root.
 *   The working directory never supplies the manifest, so a foreign `.cross-stack/` elsewhere
 *   (or in a nested checkout inside the project) cannot redirect the hooks.
 *
 * Paths from Claude Code arrive with backslashes on Windows; every function here goes through
 * `node:path`, and paths shown to people or to Claude use `/` (see {@link toPosix}).
 *
 * @module plugins/cross-stack-standard/scripts/lib/project
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CASE_INSENSITIVE_PATHS = process.platform === "win32";

/** Upper bound on the directories between the working directory and the project directory. */
const MAX_ANCESTORS = 256;

/**
 * Open flags for reading a file that may turn out to be a FIFO: non-blocking, so opening a named
 * pipe returns at once (and the regular-file check then rejects it) instead of waiting for a
 * writer. Windows has no such flag and no named pipes in the file system.
 */
const READ_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0);

/**
 * A path with `/` separators, for output.
 *
 * @param {string} value
 * @returns {string}
 */
export function toPosix(value) {
  return value.replace(/\\/g, "/");
}

/**
 * The canonical form of a path (symbolic links resolved). For a path that does not exist, the
 * nearest existing ancestor is resolved and the rest appended, so a link on the way is still
 * followed. On macOS the temporary directory is reached through a link (`/var` →
 * `/private/var`), so comparing raw paths would treat one directory as two.
 *
 * @param {string} value
 * @returns {string}
 */
export function realPath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    const parent = path.dirname(resolved);
    if (parent === resolved) return resolved;
    return path.join(realPath(parent), path.basename(resolved));
  }
}

function comparable(value) {
  const resolved = path.resolve(value);
  return CASE_INSENSITIVE_PATHS ? resolved.toLowerCase() : resolved;
}

/**
 * Whether two paths name the same location (case-insensitive on Windows).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function samePath(a, b) {
  return comparable(a) === comparable(b);
}

/**
 * Whether `child` is `parent` or lies inside it.
 *
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
export function isWithin(child, parent) {
  const relative = path.relative(comparable(parent), comparable(child));
  if (relative === "") return true;
  if (path.isAbsolute(relative)) return false;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

/**
 * Whether `target`, after following symbolic links, lies inside `root` (also resolved).
 *
 * @param {string} target
 * @param {string} root
 * @returns {boolean}
 */
export function isWithinReal(target, root) {
  return isWithin(realPath(target), realPath(root));
}

/**
 * `start`, then each parent directory, ending with `stop` (inclusive). When `stop` is not an
 * ancestor, the walk ends at the filesystem root.
 *
 * @param {string} start
 * @param {string} stop
 * @returns {string[]}
 */
export function ancestorsUpTo(start, stop) {
  const dirs = [];
  let current = path.resolve(start);
  for (let count = 0; count < MAX_ANCESTORS; count += 1) {
    dirs.push(current);
    if (samePath(current, stop)) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

function holdsGit(dir) {
  try {
    const stat = fs.statSync(path.join(dir, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

/**
 * The enclosing repository root: the nearest directory at or above `projectDir` (links
 * resolved) that holds `.git` — a directory, or the `.git` file of a worktree or submodule.
 * Git is not run. Null when no such directory exists.
 *
 * A session started in a package directory (`cd apps/web && claude`) gets its package as the
 * project directory; repository-level files such as `.github/workflows/`, `.git/hooks/`,
 * `lefthook.yml` and the root `.cross-stack/` live at this root.
 *
 * @param {string} projectDir
 * @returns {string | null}
 */
export function findRepositoryRoot(projectDir) {
  let current = realPath(projectDir);
  for (let count = 0; count < MAX_ANCESTORS; count += 1) {
    if (holdsGit(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

/**
 * Directories searched for the opt-out line, nearest first, as canonical paths: the working
 * directory and each parent up to the project directory, keeping only the directories that lie
 * inside the project both as written and after following symbolic links. The project directory
 * is always included (last, unless a link leads back to it earlier). A working directory
 * outside the project contributes nothing.
 *
 * @param {string} cwd
 * @param {string} projectDir
 * @returns {string[]}
 */
export function searchDirsFor(cwd, projectDir) {
  const lexicalProject = path.resolve(projectDir);
  const realProject = realPath(projectDir);
  const lexicalCwd = path.resolve(cwd);
  // Either spelling of the project directory counts as written (Claude Code may report either).
  let walk = [];
  if (isWithin(lexicalCwd, lexicalProject)) walk = ancestorsUpTo(lexicalCwd, lexicalProject);
  else if (isWithin(lexicalCwd, realProject)) walk = ancestorsUpTo(lexicalCwd, realProject);
  const dirs = [];
  const add = (dir) => {
    if (!dirs.some((known) => samePath(known, dir))) dirs.push(dir);
  };
  for (const dir of walk) {
    const real = realPath(dir);
    if (isWithin(real, realProject)) add(real);
  }
  add(realProject);
  return dirs;
}

/**
 * Directories searched for the manifest, nearest first: the project directory (canonical) and
 * each parent up to the repository root. Without a repository root, the project directory only.
 *
 * @param {string} projectDir
 * @param {string | null} repositoryRoot
 * @returns {string[]}
 */
export function manifestDirsFor(projectDir, repositoryRoot) {
  const realProject = realPath(projectDir);
  if (repositoryRoot === null || !isWithin(realProject, repositoryRoot)) return [realProject];
  return ancestorsUpTo(realProject, repositoryRoot);
}

function absoluteOrNull(value) {
  return typeof value === "string" && value !== "" && path.isAbsolute(value)
    ? path.resolve(value)
    : null;
}

/**
 * @typedef {object} RunPaths
 * @property {string} cwd The hook's working directory (`cwd` from the input).
 * @property {string} projectDir `CLAUDE_PROJECT_DIR`, or the working directory without it.
 * @property {string} projectReal The project directory with links resolved.
 * @property {string | null} repositoryRoot See {@link findRepositoryRoot}.
 * @property {string[]} searchDirs Opt-out memory directories; see {@link searchDirsFor}.
 * @property {string[]} manifestDirs See {@link manifestDirsFor}.
 * @property {string} manifestScope Files outside it never count as the manifest: the repository
 *   root, else the project directory (canonical).
 */

/**
 * Resolves the paths of one hook run. `cwd` comes from the hook input; without it (or when the
 * input could not be parsed) the project directory stands in, then the process's own directory.
 *
 * @param {{ input?: any, env: Record<string, string | undefined>, processCwd: string }} options
 * @returns {RunPaths}
 */
export function resolveRunPaths({ input, env, processCwd }) {
  const envProject = absoluteOrNull(env.CLAUDE_PROJECT_DIR);
  const base = envProject ?? path.resolve(processCwd);
  const inputCwd = typeof input?.cwd === "string" && input.cwd !== "" ? input.cwd : null;
  const cwd = inputCwd === null ? base : path.resolve(base, inputCwd);
  const projectDir = envProject ?? cwd;
  const projectReal = realPath(projectDir);
  const repositoryRoot = findRepositoryRoot(projectReal);
  return {
    cwd,
    projectDir,
    projectReal,
    repositoryRoot,
    searchDirs: searchDirsFor(cwd, projectDir),
    manifestDirs: manifestDirsFor(projectReal, repositoryRoot),
    manifestScope: repositoryRoot ?? projectReal,
  };
}

/**
 * The first directory of `dirs` that holds `relativePath` as a regular file, joined with it.
 * With `within`, a file whose real path lies outside that directory (a link leading out of the
 * project) is skipped.
 *
 * @param {string[]} dirs
 * @param {string} relativePath
 * @param {{ within?: string | null }} [options]
 * @returns {string | null}
 */
export function findFileUp(dirs, relativePath, { within = null } = {}) {
  for (const dir of dirs) {
    const candidate = path.join(dir, relativePath);
    if (!isFile(candidate)) continue;
    if (within !== null && !isWithinReal(candidate, within)) continue;
    return candidate;
  }
  return null;
}

/**
 * Whether a path is a regular file (after following links).
 *
 * @param {string} file
 * @returns {boolean}
 */
export function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Reads at most `maxBytes` of a file as UTF-8 (a leading byte-order mark removed). Returns null
 * when the file cannot be read or is not a regular file; a named pipe never blocks the read.
 *
 * @param {string} file
 * @param {number} maxBytes
 * @returns {string | null}
 */
export function readTextCapped(file, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(file, READ_FLAGS);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return null;
    const size = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(size);
    let length = 0;
    while (length < size) {
      const read = fs.readSync(fd, buffer, length, size - length, null);
      if (read === 0) break;
      length += read;
    }
    const text = buffer.subarray(0, length).toString("utf8");
    return text.startsWith("﻿") ? text.slice(1) : text;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Closing a descriptor that was opened for reading cannot lose data.
      }
    }
  }
}

/**
 * `file` relative to `root` with `/` separators; `.` for the root itself.
 *
 * @param {string} root
 * @param {string} file
 * @returns {string}
 */
export function relativePosix(root, file) {
  return toPosix(path.relative(root, file)) || ".";
}
