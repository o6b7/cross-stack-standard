/**
 * Entry-point detection for the repository's command-line scripts.
 *
 * Node resolves the main module to its real path, so comparing `import.meta.url` with
 * `process.argv[1]` as given fails whenever the invocation path goes through a symbolic link, and
 * the script would then exit 0 without running (fail-open). Comparing real paths does not.
 *
 * @module scripts/lib/entry
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether the module at `moduleUrl` is the process entry point (symbolic links resolved).
 *
 * @param {string} moduleUrl the calling module's `import.meta.url`
 * @param {string | undefined} [argv1] the script path the process was started with
 * @returns {boolean}
 */
export function isEntryPoint(moduleUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
