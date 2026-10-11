/**
 * Gate presence for `phpstan` gates: the error identifier appears as a string literal in a
 * PHPStan rule class, and that class is registered in a shipped NEON file (as a `rules:` list
 * item or a service `class:`).
 *
 * @module scripts/lib/gate-presence/phpstan
 */

import path from "node:path";
import {
  escapeRegExp,
  lineAt,
  listFiles,
  readText,
  stripHashComments,
  stripPhpComments,
} from "./files.mjs";

/**
 * Rule classes in a PHP file that contain `identifier` as a string literal.
 *
 * @param {string} source
 * @param {string} identifier
 * @returns {{ fqcn: string, line: number }[]}
 */
export function findRuleClassesWithIdentifier(source, identifier) {
  const code = stripPhpComments(source);
  const literal = new RegExp(`(['"])${escapeRegExp(identifier)}\\1`, "g");
  const hits = [...code.matchAll(literal)].map((match) => match.index);
  if (hits.length === 0) return [];
  const namespace = /^\s*namespace\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*;/m.exec(code)?.[1] ?? "";
  const classes = [...code.matchAll(/\bclass\s+([A-Za-z_]\w*)([^{]*)\{/g)].map((match) => ({
    name: match[1],
    header: match[2],
    start: match.index,
  }));
  const found = [];
  for (const [index, cls] of classes.entries()) {
    const end = classes[index + 1]?.start ?? code.length;
    const hit = hits.find((offset) => offset > cls.start && offset < end);
    if (hit === undefined || !/\bimplements\b[^{]*\bRule\b/.test(cls.header)) continue;
    found.push({
      fqcn: namespace ? `${namespace}\\${cls.name}` : cls.name,
      line: lineAt(code, hit),
    });
  }
  return found;
}

/**
 * Line where a NEON file registers `fqcn`, or `0` when it does not.
 *
 * @param {string} neon
 * @param {string} fqcn
 * @returns {number}
 */
export function neonRegistrationLine(neon, fqcn) {
  const text = stripHashComments(neon);
  const name = `\\\\?${escapeRegExp(fqcn)}`;
  const pattern = new RegExp(
    `^[ \\t]*(?:-[ \\t]*(?:class[ \\t]*:[ \\t]*)?|class[ \\t]*:[ \\t]*)(['"]?)${name}\\1[ \\t]*\\r?$`,
    "m",
  );
  const match = pattern.exec(text);
  return match ? lineAt(text, match.index) : 0;
}

/**
 * Checks a `phpstan` gate. `gate.id` is the error identifier (e.g. `crossStack.noInlineValidation`).
 *
 * @param {{ id: string }} gate
 * @param {object} _rule
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ present: boolean, evidence: string }}
 */
export function checkPhpstanGate(gate, _rule, ctx) {
  const { sources, neon } = ctx.locations.phpstan;
  const classes = [];
  for (const rel of listFiles(ctx.root, sources)) {
    const source = readText(path.join(ctx.root, ...rel.split("/")));
    if (source === null) continue;
    for (const found of findRuleClassesWithIdentifier(source, gate.id)) {
      classes.push({ ...found, rel });
    }
  }
  if (classes.length === 0) {
    return {
      present: false,
      evidence: `no PHPStan rule class uses the identifier ${gate.id} (${sources.join(", ")})`,
    };
  }
  const neonFiles = listFiles(ctx.root, neon);
  for (const cls of classes) {
    for (const rel of neonFiles) {
      const line = neonRegistrationLine(
        readText(path.join(ctx.root, ...rel.split("/"))) ?? "",
        cls.fqcn,
      );
      if (line) {
        return {
          present: true,
          evidence: `identifier ${gate.id} in ${cls.fqcn} (${cls.rel}:${cls.line}), registered in ${rel}:${line}`,
        };
      }
    }
  }
  const names = classes.map((cls) => cls.fqcn).join(", ");
  return {
    present: false,
    evidence: `${names} uses ${gate.id} but no shipped NEON file registers it`,
  };
}
