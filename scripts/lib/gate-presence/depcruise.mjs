/**
 * Gate presence for `depcruise` gates: a dependency-cruiser rule with that `name` exists in a
 * shipped configuration: a template `.dependency-cruiser.*` file, or a module a vendored config
 * package's entry point reaches (static inspection of the config source, comments ignored). For a
 * rule that spans several tracks, every track that ships a configuration must declare the rule
 * (see scripts/lib/gate-presence/index.mjs).
 *
 * @module scripts/lib/gate-presence/depcruise
 */

import path from "node:path";
import { shippedConfigFiles } from "./eslint.mjs";
import { escapeRegExp, lineAt, readText, stripJsComments } from "./files.mjs";

/**
 * Line where a config declares a rule `name`, or `0`.
 *
 * @param {string} source JavaScript or JSON config source.
 * @param {string} name
 * @returns {number}
 */
export function findDepcruiseRuleName(source, name) {
  const code = stripJsComments(source);
  const pattern = new RegExp(
    `(?:^|[{,\\s])(['"]?)name\\1\\s*:\\s*(['"\`])${escapeRegExp(name)}\\2`,
  );
  const match = pattern.exec(code);
  return match ? lineAt(code, match.index + match[0].indexOf("name")) : 0;
}

/**
 * Checks a `depcruise` gate. `gate.id` is the rule `name`.
 *
 * @param {{ id: string }} gate
 * @param {object} _rule
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ present: boolean, evidence: string }}
 */
export function checkDepcruiseGate(gate, _rule, ctx) {
  const shipped = shippedConfigFiles(ctx, ctx.locations.depcruise);
  const configs = [...shipped.templates, ...shipped.packages];
  for (const rel of configs) {
    const line = findDepcruiseRuleName(
      readText(path.join(ctx.root, ...rel.split("/"))) ?? "",
      gate.id,
    );
    if (line) {
      return { present: true, evidence: `rule "${gate.id}" at ${rel}:${line}; static inspection` };
    }
  }
  const searched = configs.length ? configs.join(", ") : ctx.locations.depcruise.configs.join(", ");
  return {
    present: false,
    evidence: `no dependency-cruiser rule named "${gate.id}" in ${searched}`,
    ...(configs.length === 0 ? { shipped: false } : {}),
  };
}
