/**
 * Path helpers for the fixture runner. Fixture and host files name paths with POSIX separators;
 * these helpers validate them and map them onto the local file system.
 *
 * @module
 */
import path from "node:path";

/**
 * Convert a local path to POSIX separators (for output and reports).
 *
 * @param {string} p Local path.
 * @returns {string} The same path with `/` separators.
 */
export function toPosix(p) {
  return p.split(path.sep).join("/");
}

/**
 * Return the path of `to` relative to `from`, with POSIX separators.
 *
 * @param {string} from Base directory.
 * @param {string} to Target path.
 * @returns {string} Relative POSIX path.
 */
export function relPosix(from, to) {
  return toPosix(path.relative(from, to));
}

/**
 * Check that `rel` is a safe relative POSIX path: not empty, not absolute, no drive letter, no
 * backslash, no NUL, and no empty, `.` or `..` segment. Mirrors `$defs.relativePath` in
 * `schemas/fixture.schema.json`.
 *
 * @param {unknown} rel Candidate path.
 * @returns {boolean} True when the path is safe to join onto a base directory.
 */
export function isSafeRelativePath(rel) {
  if (typeof rel !== "string" || rel.length === 0) return false;
  if (rel.includes("\\") || rel.includes("\0")) return false;
  if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return false;
  return rel.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/**
 * Resolve a safe relative POSIX path inside `baseDir`.
 *
 * @param {string} baseDir Absolute base directory.
 * @param {string} rel Relative POSIX path.
 * @param {string} [what] Label used in the error message.
 * @returns {string} Absolute local path inside `baseDir`.
 * @throws {Error} When the path is unsafe or resolves outside `baseDir`.
 */
export function resolveInside(baseDir, rel, what = "path") {
  if (!isSafeRelativePath(rel)) {
    throw new Error(
      `${what} must be a relative POSIX path without "." or ".." segments: ${JSON.stringify(rel)}`,
    );
  }
  const abs = path.resolve(baseDir, ...rel.split("/"));
  const back = path.relative(baseDir, abs);
  if (back === "" || back.startsWith("..") || path.isAbsolute(back)) {
    throw new Error(`${what} resolves outside its base directory: ${JSON.stringify(rel)}`);
  }
  return abs;
}
