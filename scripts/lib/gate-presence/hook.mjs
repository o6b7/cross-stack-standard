/**
 * Gate presence for `hook` gates: the plugin's `hooks.json` routes the gate's event (and, with
 * a discriminator, a matcher covering that tool) to the hook entry script, and the entry script
 * exists.
 *
 * @module scripts/lib/gate-presence/hook
 */

import path from "node:path";
import { isFile, readText } from "./files.mjs";

/**
 * Whether a hook matcher selects a tool, following the documented matcher rules: empty or `*`
 * matches everything; a matcher made only of letters, digits, `_`, `-`, spaces, `|` and `,` is
 * an exact list; anything else is an unanchored JavaScript regular expression.
 *
 * @param {unknown} matcher
 * @param {string} tool
 * @returns {boolean}
 */
export function matcherCovers(matcher, tool) {
  if (matcher === undefined || matcher === null || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  if (/^[A-Za-z0-9_\- |,]+$/.test(matcher)) {
    return matcher
      .split(/[|,]/)
      .map((name) => name.trim())
      .includes(tool);
  }
  try {
    return new RegExp(matcher).test(tool);
  } catch {
    return false;
  }
}

/**
 * Text a command hook runs (command plus exec-form args), with `\` normalised to `/`.
 *
 * @param {any} hook
 * @returns {string}
 */
function commandText(hook) {
  const parts = [hook?.command, ...(Array.isArray(hook?.args) ? hook.args : [])];
  return parts
    .filter((part) => typeof part === "string")
    .join(" ")
    .replace(/\\/g, "/");
}

/**
 * Checks a `hook` gate. `gate.id` is the event (e.g. `PreToolUse`); `gate.discriminator` is an
 * optional tool name the routing matcher must cover.
 *
 * @param {{ id: string, discriminator?: string }} gate
 * @param {object} _rule
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ present: boolean, evidence: string }}
 */
export function checkHookGate(gate, _rule, ctx) {
  const { config, pluginRoot, entry } = ctx.locations.hook;
  const text = readText(path.join(ctx.root, config));
  if (text === null) return { present: false, evidence: `${config} not found` };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { present: false, evidence: `${config} is not valid JSON (${error.message})` };
  }
  const groups = parsed?.hooks?.[gate.id];
  if (!Array.isArray(groups) || groups.length === 0) {
    return { present: false, evidence: `${config} has no ${gate.id} hooks` };
  }
  const entryRef = `\${CLAUDE_PLUGIN_ROOT}/${entry}`;
  const entryPath = `${pluginRoot}/${entry}`;
  const candidates = groups.filter((group) =>
    gate.discriminator === undefined ? true : matcherCovers(group?.matcher, gate.discriminator),
  );
  if (candidates.length === 0) {
    return {
      present: false,
      evidence: `${config} has no ${gate.id} matcher covering ${gate.discriminator}`,
    };
  }
  for (const group of candidates) {
    const hooks = Array.isArray(group?.hooks) ? group.hooks : [];
    const routed = hooks.find(
      (hook) => hook?.type === "command" && commandText(hook).includes(entryRef),
    );
    if (!routed) continue;
    if (!isFile(path.join(ctx.root, pluginRoot, entry))) {
      return {
        present: false,
        evidence: `${config} routes ${gate.id} to ${entryPath}, which does not exist`,
      };
    }
    const matcher =
      typeof group.matcher === "string" && group.matcher !== ""
        ? ` (matcher ${group.matcher})`
        : "";
    return { present: true, evidence: `${config} routes ${gate.id}${matcher} to ${entryPath}` };
  }
  const scope = gate.discriminator === undefined ? "" : ` for ${gate.discriminator}`;
  return {
    present: false,
    evidence: `${config} routes no ${gate.id} hook${scope} to ${entryPath}`,
  };
}
