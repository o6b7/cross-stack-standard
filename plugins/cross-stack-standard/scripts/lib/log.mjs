/**
 * Debug logging for maintainers. Off unless `CROSS_STACK_STANDARD_DEBUG=1`; then each line goes
 * to stderr, which Claude Code writes to its debug log (`claude --debug`) when the hook exits 0.
 * Stderr of a hook that exits 2 is shown to Claude, so debug lines are for local diagnosis only.
 *
 * The entry point creates the logger only after the opt-out check: an opted-out project gets
 * no output of any kind, debug mode included.
 *
 * @module plugins/cross-stack-standard/scripts/lib/log
 */

import fs from "node:fs";

/** Environment variable that turns debug logging on. */
export const DEBUG_ENV = "CROSS_STACK_STANDARD_DEBUG";

const PREFIX = "[cross-stack-standard]";

/**
 * @typedef {object} Logger
 * @property {boolean} enabled
 * @property {(message: string) => void} debug
 * @property {(error: unknown) => string} describe One-line description of an error.
 */

/**
 * @param {Record<string, string | undefined>} env
 * @param {(text: string) => void} [write] Receives each finished line (default: stderr).
 * @returns {Logger}
 */
export function createLogger(env, write = writeStderr) {
  const enabled = env[DEBUG_ENV] === "1";
  return {
    enabled,
    debug(message) {
      if (enabled) write(`${PREFIX} ${message}\n`);
    },
    describe: describeError,
  };
}

/**
 * One-line description of an error: its code (when it has one) and message, without the stack.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeError(error) {
  if (error instanceof Error) {
    const code = /** @type {any} */ (error).code;
    const prefix = typeof code === "string" && !error.message.startsWith(code) ? `${code}: ` : "";
    return `${prefix}${error.message}`.split(/\r?\n/)[0];
  }
  return String(error).split(/\r?\n/)[0];
}

function writeStderr(text) {
  try {
    fs.writeSync(2, text);
  } catch {
    // A closed stderr must never turn a debug line into a failure.
  }
}
