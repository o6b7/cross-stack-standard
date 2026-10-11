/**
 * Gate presence for `eslint` gates, by static inspection of the shipped files (no ESLint
 * import; repository scripts use Node.js built-ins only):
 *
 * 1. the rule is defined — `cross-stack/<name>`: a rule module `rules/<name>.{js,mjs,cjs}` in a
 *    vendored gate package; a core rule: `node_modules/eslint/lib/rules/<name>.js` of the
 *    installed ESLint; a third-party plugin rule: not verified statically, because ESLint itself
 *    rejects a config that enables an unknown rule, which the fixture run exercises;
 * 2. a shipped config enables it explicitly. Shipped configs are the template `eslint.config.*`
 *    files and, in a vendored config package, the modules its package.json entry points
 *    (`exports`, `main`) reach through relative imports; a stray file the entry never loads does
 *    not count. Within one file the last setting of the rule wins, and a template config (the
 *    file an adopter runs) that turns the rule off disables it whatever a package says;
 * 3. a FORCED or GUARDED rule needs severity "error" (a warning does not fail a build);
 * 4. with a discriminator (e.g. one `no-restricted-syntax` selector), the discriminator text
 *    appears inside that rule's options array in an enabling entry.
 *
 * For a rule that spans several tracks, scripts/lib/gate-presence/index.mjs runs this adapter
 * once per track and requires every track that ships an ESLint config to enable the rule.
 *
 * @module scripts/lib/gate-presence/eslint
 */

import path from "node:path";
import {
  escapeRegExp,
  isDirectory,
  isFile,
  lineAt,
  listFiles,
  matchBracket,
  readText,
  stripJsComments,
} from "./files.mjs";

const SEVERITY_WORDS = {
  error: "error",
  warn: "warn",
  off: "off",
  2: "error",
  1: "warn",
  0: "off",
};

/**
 * @typedef {object} RuleSetting
 * @property {number} line 1-based line of the entry
 * @property {"error" | "warn" | "off"} severity
 * @property {string | null} options source text of the array (`[...]`) when the entry is one
 */

/**
 * Every entry that sets `ruleId` in a config source, in source order.
 *
 * @param {string} source Config file contents.
 * @param {string} ruleId
 * @returns {RuleSetting[]}
 */
export function findRuleSettings(source, ruleId) {
  const code = stripJsComments(source);
  const key = new RegExp(`(['"\`])${escapeRegExp(ruleId)}\\1\\s*:\\s*`, "g");
  const settings = [];
  for (const match of code.matchAll(key)) {
    const at = match.index + match[0].length;
    const line = lineAt(code, match.index);
    if (code[at] === "[") {
      const end = matchBracket(code, at);
      if (end === -1) continue;
      const options = code.slice(at, end);
      const first = /^\[\s*(?:(['"`])(error|warn|off)\1|([012])(?![0-9]))/.exec(options);
      if (!first) continue;
      settings.push({ line, severity: SEVERITY_WORDS[first[2] ?? first[3]], options });
      continue;
    }
    const plain = /^(?:(['"`])(error|warn|off)\1|([012])(?![0-9]))/.exec(code.slice(at));
    if (plain)
      settings.push({ line, severity: SEVERITY_WORDS[plain[2] ?? plain[3]], options: null });
  }
  return settings;
}

/**
 * The effective (last) explicit setting of `ruleId` in a config source, or `null` when the file
 * does not set it. Kept for callers that only need a yes/no.
 *
 * @param {string} source
 * @param {string} ruleId
 * @returns {{ line: number, severity: string } | null}
 */
export function findEnabledRule(source, ruleId) {
  const last = findRuleSettings(source, ruleId).at(-1);
  return last && last.severity !== "off" ? { line: last.line, severity: last.severity } : null;
}

/**
 * Where the rule is defined, or why that could not be established.
 *
 * @param {string} ruleId
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ ok: boolean, evidence: string }}
 */
function ruleDefinition(ruleId, ctx) {
  const { pluginPrefix, pluginRules, coreRuleDirs } = ctx.locations.eslint;
  if (ruleId.startsWith(`${pluginPrefix}/`)) {
    const name = ruleId.slice(pluginPrefix.length + 1);
    const module = listFiles(ctx.root, pluginRules).find(
      (rel) => path.posix.basename(rel).replace(/\.(?:m|c)?js$/, "") === name,
    );
    return module
      ? { ok: true, evidence: `rule module ${module}` }
      : { ok: false, evidence: `no rule module for ${ruleId} (${pluginRules.join(", ")})` };
  }
  if (!ruleId.includes("/")) {
    const installed = coreRuleDirs.filter((dir) =>
      isDirectory(path.join(ctx.root, ...dir.split("/"))),
    );
    if (installed.length === 0) {
      return {
        ok: false,
        evidence: `cannot verify core rule ${ruleId}: ESLint is not installed (run npm ci)`,
      };
    }
    const hit = installed.find((dir) =>
      isFile(path.join(ctx.root, ...dir.split("/"), `${ruleId}.js`)),
    );
    return hit
      ? { ok: true, evidence: `core rule (${hit}/${ruleId}.js)` }
      : { ok: false, evidence: `${ruleId} is not an ESLint core rule (${installed.join(", ")})` };
  }
  const namespace = ruleId.slice(0, ruleId.lastIndexOf("/"));
  return { ok: true, evidence: `plugin rule of ${namespace} (definition not verified statically)` };
}

const MODULE_EXTENSIONS = ["", ".js", ".mjs", ".cjs", "/index.js", "/index.mjs", "/index.cjs"];
const RELATIVE_SPECIFIER =
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"`])(\.{1,2}\/[^'"`]+)\1|\bimport\s*\(\s*(['"`])(\.{1,2}\/[^'"`]+)\3\s*\)|\brequire\s*\(\s*(['"`])(\.{1,2}\/[^'"`]+)\5\s*\)/g;

/**
 * Entry files a package.json declares (`exports` string leaves, `main`, or `index.js`).
 *
 * @param {any} manifest
 * @returns {string[]} package-relative paths
 */
export function packageEntryPoints(manifest) {
  const entries = new Set();
  const collect = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("./")) entries.add(value.slice(2));
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(manifest?.exports);
  if (typeof manifest?.main === "string") entries.add(manifest.main.replace(/^\.\//, ""));
  if (entries.size === 0) entries.add("index.js");
  return [...entries];
}

/**
 * Modules reachable from a vendored package's entry points through relative imports, as
 * root-relative posix paths (never outside the package directory).
 *
 * @param {string} root
 * @param {string} packageJson root-relative path of the package.json
 * @returns {string[]}
 */
export function packageModuleClosure(root, packageJson) {
  const dir = path.posix.dirname(packageJson);
  let manifest;
  try {
    manifest = JSON.parse(readText(path.join(root, ...packageJson.split("/"))) ?? "");
  } catch {
    return [];
  }
  const resolveModule = (from, specifier) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    if (base !== dir && !base.startsWith(`${dir}/`)) return null;
    return (
      MODULE_EXTENSIONS.map((ext) => `${base}${ext}`).find((candidate) =>
        isFile(path.join(root, ...candidate.split("/"))),
      ) ?? null
    );
  };
  const seen = new Set();
  const queue = packageEntryPoints(manifest)
    .map((entry) => resolveModule(`${dir}/package.json`, `./${entry}`))
    .filter(Boolean);
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const code = stripJsComments(readText(path.join(root, ...file.split("/"))) ?? "");
    for (const match of code.matchAll(RELATIVE_SPECIFIER)) {
      const next = resolveModule(file, match[2] ?? match[4] ?? match[6]);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort();
}

/**
 * The config files an adopter's lint run actually loads: template configs plus the modules
 * reachable from each vendored config package's entry points.
 *
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @param {{ configs: string[], packages?: string[] }} where
 * @returns {{ templates: string[], packages: string[] }}
 */
export function shippedConfigFiles(ctx, where) {
  const notTest = (rel) =>
    !/(?:^|\/)rules\/[^/]+$/.test(rel) && !/(?:^|\/)(?:test|tests|__tests__)\//.test(rel);
  const templates = listFiles(ctx.root, where.configs).filter(notTest);
  const packages = new Set();
  for (const manifest of listFiles(ctx.root, where.packages ?? [])) {
    for (const file of packageModuleClosure(ctx.root, manifest)) {
      if (notTest(file)) packages.add(file);
    }
  }
  return { templates, packages: [...packages].sort() };
}

/**
 * Checks an `eslint` gate.
 *
 * @param {{ id: string, discriminator?: string }} gate
 * @param {{ enforcement?: string }} rule
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ present: boolean, evidence: string }}
 */
export function checkEslintGate(gate, rule, ctx) {
  const { templates, packages } = shippedConfigFiles(ctx, ctx.locations.eslint);
  const definition = ruleDefinition(gate.id, ctx);
  if (!definition.ok) {
    return {
      present: false,
      evidence: definition.evidence,
      ...(templates.length + packages.length === 0 ? { shipped: false } : {}),
    };
  }
  const settingsOf = (rel) =>
    findRuleSettings(readText(path.join(ctx.root, ...rel.split("/"))) ?? "", gate.id);
  const offIn = templates.find((rel) => settingsOf(rel).at(-1)?.severity === "off");
  if (offIn) {
    const line = settingsOf(offIn).at(-1).line;
    return { present: false, evidence: `${gate.id} is turned off in ${offIn}:${line}` };
  }
  const needsError = rule?.enforcement === "FORCED" || rule?.enforcement === "GUARDED";
  let warnOnly = null;
  let withoutDiscriminator = null;
  for (const rel of [...packages, ...templates]) {
    const last = settingsOf(rel).at(-1);
    if (!last || last.severity === "off") continue;
    const where = `${rel}:${last.line}`;
    if (needsError && last.severity !== "error") {
      warnOnly ??= where;
      continue;
    }
    if (gate.discriminator !== undefined) {
      if (!last.options || !last.options.includes(gate.discriminator)) {
        withoutDiscriminator ??= where;
        continue;
      }
      return {
        present: true,
        evidence: `${definition.evidence}; enabled (${last.severity}) at ${where} with "${gate.discriminator}" in its options; static inspection`,
      };
    }
    return {
      present: true,
      evidence: `${definition.evidence}; enabled (${last.severity}) at ${where}; static inspection`,
    };
  }
  if (warnOnly) {
    return {
      present: false,
      evidence: `${gate.id} is only a warning at ${warnOnly}; a ${rule.enforcement} rule needs "error"`,
    };
  }
  if (withoutDiscriminator) {
    return {
      present: false,
      evidence: `${gate.id} is enabled at ${withoutDiscriminator}, but "${gate.discriminator}" is not in that rule's options`,
    };
  }
  const searched = [...templates, ...packages];
  return {
    present: false,
    evidence: `${definition.evidence}; no shipped config enables ${gate.id} explicitly (${searched.length ? searched.join(", ") : "no shipped config found"})`,
    ...(searched.length === 0 ? { shipped: false } : {}),
  };
}
