/**
 * Rule-id helpers: parse registry ids and find the ids a gate printed.
 *
 * Gates print rule ids in two forms: `BE-012` (messages, test names) and `BE_012` (test runners
 * that turn a test name into an identifier, for example `__pest_evaluable_BE_012_strict_types`).
 * Both count as the same id.
 *
 * @module
 */

/** Rule-id prefixes defined by the Standard. */
export const RULE_ID_PREFIXES = Object.freeze([
  "BE",
  "WEB",
  "MOB",
  "SEC",
  "I18N",
  "UI",
  "PROC",
  "CI",
]);

/** Shape of a canonical rule id: an upper-case prefix, a hyphen and three digits. */
export const RULE_ID_RE = /^([A-Z][A-Z0-9]*)-([0-9]{3})$/;

/**
 * Split a canonical rule id into its prefix and number.
 *
 * @param {string} id Canonical id such as `WEB-012`.
 * @returns {{ prefix: string, number: string } | null} Parts, or null when the id is malformed.
 */
export function parseRuleId(id) {
  const match = typeof id === "string" ? RULE_ID_RE.exec(id) : null;
  return match ? { prefix: match[1], number: match[2] } : null;
}

/**
 * The underscore form of a canonical id (`BE-012` becomes `BE_012`).
 *
 * @param {string} id Canonical id.
 * @returns {string} Underscore form.
 */
export function underscoreForm(id) {
  return id.replace("-", "_");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a scanner that finds every rule id printed in a text, in either form.
 *
 * An id matches when it is not preceded by a letter or digit (an underscore is allowed, so
 * `__pest_evaluable_BE_012_x` matches) and not followed by a digit.
 *
 * @param {Iterable<string>} [prefixes] Prefixes to look for; defaults to {@link RULE_ID_PREFIXES}.
 * @returns {(text: string) => string[]} Function returning sorted, unique canonical ids.
 */
export function createIdScanner(prefixes = RULE_ID_PREFIXES) {
  const list = [...new Set(prefixes)].sort((a, b) => b.length - a.length).map(escapeRegExp);
  if (list.length === 0) return () => [];
  const re = new RegExp(`(?<![A-Za-z0-9])(${list.join("|")})[-_]([0-9]{3})(?![0-9])`, "g");
  return (text) => {
    const found = new Set();
    for (const match of text.matchAll(re)) found.add(`${match[1]}-${match[2]}`);
    return [...found].sort();
  };
}
