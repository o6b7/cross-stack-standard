/**
 * Directory copies for work directories.
 *
 * Host dependency directories (`node_modules/`, `vendor/`) are copied as hard links, like
 * `cp -al`: the directory structure is recreated and every file is linked, so the copy is cheap
 * and `__DIR__`-based autoloaders resolve inside the work directory. When linking fails because
 * the temp directory is on another device (EXDEV) or the file system refuses links, the copy
 * falls back to real file copies.
 *
 * A hard-linked file shares its content with the host. Every write this module performs first
 * unlinks the destination, so overlays never modify host files. Tools that rewrite files in
 * place under a hard-linked directory (for example `composer dump-autoload` under
 * `vendor/composer/`) need those paths listed in `copy.detach`, which copies them instead.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";

/** Link error codes that make the copy fall back to plain file copies. */
export const LINK_FALLBACK_CODES = Object.freeze([
  "EXDEV",
  "EPERM",
  "ENOTSUP",
  "EMLINK",
  "EACCES",
  "EINVAL",
]);

/**
 * @typedef {object} CopyStats
 * @property {number} linked Files hard-linked.
 * @property {number} copied Files copied.
 * @property {number} symlinks Symbolic links recreated.
 * @property {string | null} fallback First link error code that forced a copy, or null.
 */

/**
 * Create an empty statistics object.
 *
 * @returns {CopyStats} Zeroed statistics.
 */
export function newCopyStats() {
  return { linked: 0, copied: 0, symlinks: 0, fallback: null };
}

function escapeRegExp(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile `copy.exclude` patterns. A pattern without `/` matches an entry name at any depth; a
 * pattern with `/` matches the full relative path. `*` matches any run of characters except `/`.
 *
 * @param {string[]} patterns Exclude patterns.
 * @returns {(rel: string, name: string) => boolean} Matcher.
 */
export function compileExcludes(patterns) {
  const compiled = patterns.map((pattern) => ({
    byName: !pattern.includes("/"),
    re: new RegExp(`^${escapeRegExp(pattern).replaceAll("*", "[^/]*")}$`),
  }));
  return (rel, name) => compiled.some(({ byName, re }) => re.test(byName ? name : rel));
}

/**
 * Remove whatever exists at `dest` (file, link or directory) so a fresh entry can be written
 * without touching a hard-linked original.
 *
 * @param {string} dest Absolute path.
 */
export function clearPath(dest) {
  let stat;
  try {
    stat = fs.lstatSync(dest);
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  if (stat.isDirectory()) fs.rmSync(dest, { recursive: true, force: true });
  else fs.unlinkSync(dest);
}

function ensureDir(dest) {
  let stat = null;
  try {
    stat = fs.lstatSync(dest);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  if (stat && !stat.isDirectory()) fs.unlinkSync(dest);
  if (!stat || !stat.isDirectory()) fs.mkdirSync(dest, { recursive: true });
}

/**
 * Copy one file, replacing whatever exists at the destination.
 *
 * @param {string} src Source file.
 * @param {string} dest Destination path.
 * @param {CopyStats} [stats] Statistics to update.
 */
export function copyFileFresh(src, dest, stats) {
  clearPath(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (stats) stats.copied += 1;
}

/**
 * The target a copied symbolic link should have. A link whose target lies inside the tree being
 * copied points at the matching place in the copy (relative links stay relative, absolute links
 * are rewritten, so nothing written through the copy reaches the original). A link whose target
 * lies outside the tree (an npm `file:` dependency, a Composer `path` repository) points at the
 * original target by absolute path, because a relative target would dangle in the copy.
 *
 * @param {string} src Source link.
 * @param {string} dest Destination link path.
 * @param {string} srcRoot Root of the tree being copied.
 * @param {string} destRoot Root of the copy.
 * @returns {string} Target for the new link.
 */
export function copiedLinkTarget(src, dest, srcRoot, destRoot) {
  const target = fs.readlinkSync(src);
  const resolved = path.resolve(path.dirname(src), target);
  const rel = path.relative(srcRoot, resolved);
  const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (!inside) return resolved;
  const equivalent = path.join(destRoot, rel);
  return path.isAbsolute(target)
    ? equivalent
    : path.relative(path.dirname(dest), equivalent) || ".";
}

function copySymlink(src, dest, stats, roots) {
  clearPath(dest);
  const target = copiedLinkTarget(src, dest, roots.srcRoot, roots.destRoot);
  let type = "file";
  try {
    if (fs.statSync(src).isDirectory()) type = "dir";
  } catch {
    // A dangling link keeps the default type.
  }
  try {
    fs.symlinkSync(target, dest, type);
    stats.symlinks += 1;
  } catch (err) {
    // Windows without symlink rights: copy what the link points to.
    if (err.code !== "EPERM" && err.code !== "EACCES") throw err;
    fs.cpSync(src, dest, { recursive: true, dereference: true });
    stats.copied += 1;
  }
}

/**
 * Copy a directory tree onto `destDir` (merging into existing content).
 *
 * @param {string} srcDir Source directory.
 * @param {string} destDir Destination directory (created when missing).
 * @param {object} [options] Options.
 * @param {string[]} [options.hardlink] Relative paths whose subtrees are hard-linked.
 * @param {string[]} [options.detach] Relative paths inside hard-linked subtrees that are copied.
 * @param {string[]} [options.exclude] Exclude patterns (see {@link compileExcludes}).
 * @param {Set<string>} [options.skip] Exact relative paths to skip (with their subtrees).
 * @param {CopyStats} [options.stats] Statistics to update.
 * @param {(src: string, dest: string) => void} [options.link] Link function (tests inject one).
 * @returns {CopyStats} The statistics object.
 * @throws {Error} When a `hardlink` path does not exist in the source.
 */
export function copyTree(srcDir, destDir, options = {}) {
  const hardlink = new Set(options.hardlink ?? []);
  const detach = new Set(options.detach ?? []);
  const isExcluded = compileExcludes(options.exclude ?? []);
  const skip = options.skip ?? new Set();
  const stats = options.stats ?? newCopyStats();
  const link = options.link ?? fs.linkSync;
  let linkDisabled = false;

  for (const rel of hardlink) {
    if (!fs.existsSync(path.join(srcDir, ...rel.split("/")))) {
      throw new Error(
        `hard-link source "${rel}" is missing in ${srcDir}; install the host's dependencies first`,
      );
    }
  }

  const linkFile = (src, dest) => {
    clearPath(dest);
    if (!linkDisabled) {
      try {
        link(src, dest);
        stats.linked += 1;
        return;
      } catch (err) {
        if (!LINK_FALLBACK_CODES.includes(err.code)) throw err;
        stats.fallback ??= err.code;
        if (err.code !== "EMLINK") linkDisabled = true;
      }
    }
    copyFileFresh(src, dest, stats);
  };

  const roots = { srcRoot: path.resolve(srcDir), destRoot: path.resolve(destDir) };
  const walk = (srcAbs, destAbs, rel, mode) => {
    ensureDir(destAbs);
    for (const entry of fs.readdirSync(srcAbs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (skip.has(childRel) || isExcluded(childRel, entry.name)) continue;
      let childMode = mode;
      if (hardlink.has(childRel)) childMode = "link";
      if (detach.has(childRel)) childMode = "copy";
      const src = path.join(srcAbs, entry.name);
      const dest = path.join(destAbs, entry.name);
      if (entry.isSymbolicLink()) copySymlink(src, dest, stats, roots);
      else if (entry.isDirectory()) walk(src, dest, childRel, childMode);
      else if (entry.isFile()) {
        if (childMode === "link") linkFile(src, dest);
        else copyFileFresh(src, dest, stats);
      }
    }
  };

  walk(srcDir, destDir, "", "copy");
  return stats;
}

/**
 * Copy a file or directory to a new location, replacing what is there.
 *
 * @param {string} src Source file or directory.
 * @param {string} dest Destination path.
 * @param {CopyStats} [stats] Statistics to update.
 */
export function copyPath(src, dest, stats = newCopyStats()) {
  if (fs.lstatSync(src).isDirectory()) {
    clearPath(dest);
    copyTree(src, dest, { stats });
  } else {
    copyFileFresh(src, dest, stats);
  }
}
