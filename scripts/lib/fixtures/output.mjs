/**
 * Output normalisation before id scanning and reporting: remove terminal escape sequences and
 * replace machine-specific paths (work directory, temp root, repository root, home directory)
 * with stable tokens. Replacing the work-directory path also keeps a path from ever counting as
 * a printed rule id.
 *
 * @module
 */
import path from "node:path";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_RE = new RegExp(
  `${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)|${ESC}[@-Z\\\\-_]`,
  "g",
);

/**
 * Remove ANSI/VT escape sequences (colours, cursor moves, hyperlinks).
 *
 * @param {string} text Raw output.
 * @returns {string} Plain text.
 */
export function stripAnsi(text) {
  return text.replace(ANSI_RE, "");
}

function variants(p) {
  const forms = new Set([p, p.split(path.sep).join("/"), p.split("/").join("\\")]);
  if (p.startsWith("/private/")) forms.add(p.slice("/private".length));
  return [...forms];
}

/**
 * Strip escape sequences and replace known absolute paths with tokens.
 *
 * @param {string} text Raw output.
 * @param {Array<[string | null | undefined, string]>} replacements Pairs of absolute path and
 *   token (for example `[workdir, "<workdir>"]`); longer paths are replaced first.
 * @returns {string} Sanitised text.
 */
export function sanitizeOutput(text, replacements) {
  let out = stripAnsi(text);
  const pairs = replacements
    .filter(([from]) => typeof from === "string" && from.length > 1)
    .flatMap(([from, token]) => variants(from).map((form) => [form, token]))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [from, token] of pairs) out = out.split(from).join(token);
  return out;
}
