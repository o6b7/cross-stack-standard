/**
 * Time budgets. Claude Code discards the output of a hook that runs past its `timeout` and lets
 * the action proceed, so every limit that matters is enforced inside the script: handlers run
 * tools within a budget, and the entry point's watchdog stops the whole run shortly after it.
 * The `timeout` of each hooks.json entry is set above the largest watchdog this module can
 * return for that event (a test compares them), so the platform timeout is only a backstop.
 *
 * @module plugins/cross-stack-standard/scripts/lib/budget
 */

import { performance } from "node:perf_hooks";

/** Watchdog of events whose work is bounded by the script itself (no configurable budget). */
export const FIXED_WATCHDOG_MS = Object.freeze({
  SessionStart: 5_000,
  PreToolUse: 5_000,
  UserPromptSubmit: 5_000,
  PostToolUseFailure: 5_000,
});

/** Watchdog of an event this module does not know. */
export const DEFAULT_WATCHDOG_MS = 5_000;

/**
 * Time the entry point allows after a configured budget runs out, so a handler can stop its
 * tools (terminate, then kill) and report what happened before the watchdog fires.
 */
export const WATCHDOG_GRACE_MS = 5_000;

/**
 * PostToolUse budget when the manifest sets none. The manifest schema leaves this default open
 * so it can follow measurements of formatter and linter runs on CI hardware. 20 s leaves room
 * for a formatter plus type-aware ESLint on one file (a few seconds each), and PHPStan when a
 * project turns it on; Prettier with ESLint without type information takes about 0.2 s.
 */
export const DEFAULT_POST_TOOL_USE_BUDGET_SECONDS = 20;

/** Events whose budget comes from `hooks.<key>.budgetSeconds` in the resolved config. */
export const CONFIGURED_BUDGETS = Object.freeze({
  PostToolUse: "postToolUse",
  Stop: "stop",
});

/**
 * The configured budget of an event in seconds, or null for events without one.
 *
 * @param {string} event
 * @param {any} config Resolved hook config (see manifest.mjs).
 * @returns {number | null}
 */
export function budgetSeconds(event, config) {
  const key = CONFIGURED_BUDGETS[event];
  if (key === undefined) return null;
  const value = config?.[key]?.budgetSeconds;
  if (Number.isInteger(value) && value > 0) return value;
  return event === "PostToolUse" ? DEFAULT_POST_TOOL_USE_BUDGET_SECONDS : null;
}

/**
 * How long the entry point lets a handler run before it stops the run and fails open.
 *
 * @param {string} event
 * @param {any} config
 * @returns {number} Milliseconds.
 */
export function watchdogMs(event, config) {
  const seconds = budgetSeconds(event, config);
  if (seconds !== null) return seconds * 1000 + WATCHDOG_GRACE_MS;
  return FIXED_WATCHDOG_MS[event] ?? DEFAULT_WATCHDOG_MS;
}

/**
 * The largest watchdog an event can get, given the schema's maximum budget in seconds.
 *
 * @param {string} event
 * @param {number} maxBudgetSeconds
 * @returns {number} Milliseconds.
 */
export function maxWatchdogMs(event, maxBudgetSeconds) {
  if (CONFIGURED_BUDGETS[event] !== undefined) {
    return maxBudgetSeconds * 1000 + WATCHDOG_GRACE_MS;
  }
  return FIXED_WATCHDOG_MS[event] ?? DEFAULT_WATCHDOG_MS;
}

/**
 * @typedef {object} Budget
 * @property {number} totalMs
 * @property {() => number} elapsedMs
 * @property {() => number} remainingMs Never negative.
 * @property {() => boolean} expired
 * @property {(capMs?: number) => number} timeoutFor Time a tool may take now: the remaining
 *   budget, or `capMs` when that is smaller. At least 1 ms, so a timer can always be set.
 */

/**
 * A budget that starts now.
 *
 * @param {number} totalMs
 * @param {() => number} [now] Clock in milliseconds (tests pass their own).
 * @returns {Budget}
 */
export function createBudget(totalMs, now = () => performance.now()) {
  const start = now();
  const elapsedMs = () => now() - start;
  const remainingMs = () => Math.max(0, totalMs - elapsedMs());
  return {
    totalMs,
    elapsedMs,
    remainingMs,
    expired: () => remainingMs() === 0,
    timeoutFor: (capMs = Infinity) => Math.max(1, Math.floor(Math.min(capMs, remainingMs()))),
  };
}
