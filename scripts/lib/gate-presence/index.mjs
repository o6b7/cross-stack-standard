/**
 * Pluggable gate-presence adapters: one per gate kind. Each adapter proves, by inspecting the
 * shipped files, that a rule's gate exists, and returns `{ present, evidence }` where evidence
 * is a one-line explanation with root-relative paths.
 *
 * @module scripts/lib/gate-presence
 */

import { checkCiGate } from "./ci.mjs";
import { checkDepcruiseGate } from "./depcruise.mjs";
import { checkEslintGate } from "./eslint.mjs";
import { checkHookGate } from "./hook.mjs";
import { expandLocations, resolveLocations, tracksFor } from "./locations.mjs";
import { checkPestGate } from "./pest.mjs";
import { checkPhpstanGate } from "./phpstan.mjs";
import { checkScriptGate } from "./script.mjs";
import { checkTestRunnerGate } from "./test-runner.mjs";

export { DEFAULT_LOCATIONS, expandLocations, resolveLocations, tracksFor } from "./locations.mjs";

/**
 * @typedef {object} PresenceContext
 * @property {string} root Absolute repository root.
 * @property {import("./locations.mjs").Locations} locations Locations with `{track}` still in
 *   them; checkGatePresence expands them for each rule's tracks before calling an adapter.
 * @property {Map<string, any>} cache Per-run memo shared by the adapters.
 */

/**
 * @typedef {object} PresenceResult
 * @property {boolean} present
 * @property {string} evidence
 * @property {boolean} [shipped] eslint and depcruise adapters only: false when the searched
 *   locations hold no configuration of that kind at all (used by the per-track combination).
 */

/**
 * @callback PresenceAdapter
 * @param {{ kind: string, id: string, discriminator?: string }} gate
 * @param {{ id: string }} rule
 * @param {PresenceContext} ctx
 * @returns {PresenceResult}
 */

/** @type {Readonly<Record<string, PresenceAdapter>>} */
export const ADAPTERS = Object.freeze({
  hook: checkHookGate,
  script: checkScriptGate,
  pest: checkPestGate,
  phpstan: checkPhpstanGate,
  eslint: checkEslintGate,
  depcruise: checkDepcruiseGate,
  vitest: (gate, _rule, ctx) => checkTestRunnerGate("vitest", gate, ctx),
  jest: (gate, _rule, ctx) => checkTestRunnerGate("jest", gate, ctx),
  ci: checkCiGate,
});

/**
 * Creates the context the adapters share during one run.
 *
 * @param {{ root: string, locations?: object }} options `locations` holds per-kind overrides.
 * @returns {PresenceContext}
 */
export function createPresenceContext({ root, locations }) {
  return { root, locations: resolveLocations(locations), cache: new Map() };
}

/**
 * Gate kinds whose configuration is per track: for a rule that spans several tracks (client or
 * shared), every track that ships such a configuration must enable the gate, so a rule meant for
 * web and mobile is not proven by the web configuration alone. A track that ships no
 * configuration of that kind (the adapter reports `shipped: false`) is skipped.
 */
export const PER_TRACK_KINDS = Object.freeze(["eslint", "depcruise"]);

/**
 * Runs an adapter once per track and combines the results.
 *
 * @param {PresenceAdapter} adapter
 * @param {{ kind: string, id: string, discriminator?: string }} gate
 * @param {{ id: string, track?: string }} rule
 * @param {PresenceContext} ctx
 * @param {string[]} tracks
 * @returns {PresenceResult}
 */
function perTrackPresence(adapter, gate, rule, ctx, tracks) {
  const shipped = [];
  for (const track of tracks) {
    const result = adapter(gate, rule, {
      ...ctx,
      locations: expandLocations(ctx.locations, [track]),
    });
    if (result.shipped === false) continue;
    shipped.push({ track, present: result.present, evidence: result.evidence });
  }
  if (shipped.length === 0) {
    return {
      present: false,
      evidence: `no ${gate.kind} configuration ships for any track of the ${rule.track} rule (${tracks.join(", ")})`,
    };
  }
  const missing = shipped.filter((result) => !result.present);
  const list = (results) =>
    results.map((result) => `${result.track}: ${result.evidence}`).join("; ");
  return missing.length > 0
    ? { present: false, evidence: list(missing) }
    : { present: true, evidence: list(shipped) };
}

/**
 * Checks whether a rule's gate exists. Adapter exceptions are reported as absence, never thrown.
 *
 * @param {{ id: string, track?: string, enforcement?: string, gate: { kind: string, id: string, discriminator?: string } | null }} rule
 * @param {PresenceContext} ctx
 * @returns {PresenceResult}
 */
export function checkGatePresence(rule, ctx) {
  const gate = rule?.gate;
  if (!gate || typeof gate !== "object" || typeof gate.id !== "string") {
    return { present: false, evidence: "the rule names no gate" };
  }
  const adapter = ADAPTERS[gate.kind];
  if (!adapter) return { present: false, evidence: `unknown gate kind "${gate.kind}"` };
  try {
    const tracks = tracksFor(rule);
    if (PER_TRACK_KINDS.includes(gate.kind) && tracks.length > 1) {
      return perTrackPresence(adapter, gate, rule, ctx, tracks);
    }
    const locations = expandLocations(ctx.locations, tracks);
    const { present, evidence } = adapter(gate, rule, { ...ctx, locations });
    return { present, evidence };
  } catch (error) {
    return { present: false, evidence: `${gate.kind} adapter failed: ${error.message}` };
  }
}
