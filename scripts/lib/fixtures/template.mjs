/**
 * Argv templates used in `host.json`.
 *
 * A template is a string with `{name}` placeholders. An argv template is an array whose items are
 * strings or nested arrays; a nested array is an optional group that is kept only when every
 * placeholder in it has a non-empty value (for example `["--base", "{base}"]`).
 *
 * Placeholder values: a string is substituted; `null` or `""` counts as empty; `undefined`
 * means "not available in this context" and is an error when used. A name that is not a key of
 * the values object is an unknown placeholder and is also an error.
 *
 * @module
 */

const PLACEHOLDER_RE = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/**
 * Placeholders every template may use. Hosts add their own through `vars`.
 *
 * - `ruleId`, `gateKind`, `gateId`, `discriminator`: from the registry rule (gate runs only);
 *   `gateIdPattern`: the gate id with regular-expression characters escaped, for filters such
 *   as `pest --filter` that take a pattern.
 * - `workdir`: the temporary project copy the gate runs in (gate and prepare only).
 * - `base`, `head`: commit SHAs of a git host's base and head commits, or empty (gate only).
 * - `hostDir`: the host's source directory; `repoRoot`: the repository root; `node`: the
 *   running Node.js executable.
 */
export const BUILTIN_PLACEHOLDERS = Object.freeze([
  "ruleId",
  "gateKind",
  "gateId",
  "gateIdPattern",
  "discriminator",
  "workdir",
  "base",
  "head",
  "hostDir",
  "repoRoot",
  "node",
]);

/**
 * List the placeholder names used in a template string.
 *
 * @param {string} text Template string.
 * @returns {string[]} Placeholder names in order of appearance (duplicates kept).
 */
export function placeholdersIn(text) {
  return [...text.matchAll(PLACEHOLDER_RE)].map((match) => match[1]);
}

/**
 * Substitute placeholders in a template string.
 *
 * @param {string} text Template string.
 * @param {Record<string, string | null | undefined>} values Placeholder values.
 * @param {string} [where] Context for error messages.
 * @returns {string} Expanded string.
 * @throws {Error} On an unknown or unavailable placeholder.
 */
export function expandString(text, values, where = "template") {
  return text.replace(PLACEHOLDER_RE, (_whole, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`${where}: unknown placeholder {${name}}`);
    }
    const value = values[name];
    if (value === undefined) {
      throw new Error(`${where}: placeholder {${name}} is not available here`);
    }
    return value === null ? "" : String(value);
  });
}

function isEmpty(value) {
  return value === null || value === "";
}

/**
 * Expand an argv template into a flat argument list.
 *
 * @param {Array<string | string[]>} argv Argv template.
 * @param {Record<string, string | null | undefined>} values Placeholder values.
 * @param {string} [where] Context for error messages.
 * @returns {string[]} Expanded arguments.
 * @throws {Error} On an unknown or unavailable placeholder.
 */
export function expandArgv(argv, values, where = "argv") {
  const out = [];
  for (const item of argv) {
    if (Array.isArray(item)) {
      const names = item.flatMap(placeholdersIn);
      for (const name of names) expandString(`{${name}}`, values, where);
      if (names.some((name) => isEmpty(values[name]))) continue;
      for (const part of item) out.push(expandString(part, values, where));
    } else {
      out.push(expandString(item, values, where));
    }
  }
  return out;
}

/**
 * Check statically that a template only uses allowed placeholder names.
 *
 * @param {string | Array<string | string[]>} template String or argv template.
 * @param {Iterable<string>} allowed Allowed placeholder names.
 * @param {string} where Context for error messages.
 * @throws {Error} When a placeholder name is not allowed.
 */
export function assertPlaceholders(template, allowed, where) {
  const allowedSet = new Set(allowed);
  const strings = typeof template === "string" ? [template] : template.flat();
  for (const text of strings) {
    for (const name of placeholdersIn(text)) {
      if (!allowedSet.has(name)) {
        throw new Error(
          `${where}: unknown placeholder {${name}} (known: ${[...allowedSet].sort().join(", ")})`,
        );
      }
    }
  }
}
