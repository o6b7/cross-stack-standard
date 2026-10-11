/**
 * Removal of work directories that never throws. Gates can leave read-only directories behind
 * (module caches do), and a cleanup failure must never replace a run's verdict or stop the
 * report from being written: it becomes a warning instead.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";

const RETRY_CODES = new Set(["EACCES", "EPERM", "ENOTEMPTY", "EBUSY"]);

/**
 * Give the owner write and execute permission on every directory below `dir` (and on `dir`),
 * so entries inside read-only directories can be unlinked. Errors are ignored.
 *
 * @param {string} dir
 */
function makeWritable(dir) {
  const visit = (current) => {
    try {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory()) return;
      fs.chmodSync(current, stat.mode | 0o700);
      for (const name of fs.readdirSync(current)) visit(path.join(current, name));
    } catch {
      // Best effort: the removal below reports what is left.
    }
  };
  visit(dir);
}

/**
 * Remove a directory tree. On a permission error the tree is made writable and the removal is
 * retried once.
 *
 * @param {string} dir Absolute directory.
 * @returns {{ ok: boolean, error: string | null }} `error` names the code of a failure that
 *   remained, never file contents.
 */
export function removeTree(dir) {
  const attempt = () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  try {
    attempt();
    return { ok: true, error: null };
  } catch (error) {
    if (!RETRY_CODES.has(error.code)) {
      return { ok: false, error: `cannot remove ${dir} (${error.code ?? error.message})` };
    }
  }
  makeWritable(dir);
  try {
    attempt();
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: `cannot remove ${dir} (${error.code ?? error.message})` };
  }
}
