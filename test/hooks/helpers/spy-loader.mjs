/**
 * Module resolution hook for spy-preload.mjs: records every module resolved under
 * `scripts/handlers/`, so a test can tell whether the entry point loaded a handler.
 */

import fs from "node:fs";

let log = null;

/**
 * @param {{ log?: string }} [data]
 */
export function initialize(data) {
  log = data?.log ?? null;
}

/**
 * @param {string} specifier
 * @param {object} context
 * @param {Function} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (log !== null && result.url.includes("/scripts/handlers/")) {
    fs.appendFileSync(log, `load ${result.url}\n`);
  }
  return result;
}
