/**
 * A `.gitignore` matcher for walking a checkout that has no git metadata yet (before `git init`,
 * or an exported tree), so tools see the same files `git ls-files --others --exclude-standard`
 * would list. Node.js built-ins only.
 *
 * Supported (gitignore(5)): comments, escaped `\#` and `\!`, trailing-space trimming, `!`
 * negation, directory-only patterns (trailing `/`), anchoring (a `/` at the start or in the
 * middle), `*`, `?`, bracket expressions, and `**` (leading, trailing and in the middle), with
 * one `.gitignore` per directory whose patterns are relative to that directory and override the
 * parent's. As in git, a file inside an ignored directory cannot be re-included: the walk does
 * not enter ignored directories. Not read: `.git/info/exclude` and `core.excludesFile`, which
 * belong to one clone rather than to the tree.
 *
 * @module scripts/lib/gitignore
 */
import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {object} IgnoreRule
 * @property {RegExp} regex matches a path relative to the rule's base directory
 * @property {boolean} negate
 * @property {boolean} directoryOnly
 * @property {string} base `/`-separated directory of the `.gitignore`, relative to the root ("")
 */

/**
 * Translate one gitignore glob (already stripped of `!`, the leading `/` and the trailing `/`)
 * into a regular expression body.
 * @param {string} glob
 * @returns {string}
 */
function globBody(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "\\" && i + 1 < glob.length) {
      out += glob[i + 1].replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
      i += 1;
    } else if (c === "*" && glob[i + 1] === "*") {
      const atStart = i === 0 || glob[i - 1] === "/";
      const atEnd = i + 2 === glob.length;
      if (atStart && glob[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else if (atStart && atEnd) {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if (c === "*") {
      out += "[^/]*";
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "[") {
      const end = glob.indexOf("]", i + 2);
      if (end === -1) {
        out += "\\[";
      } else {
        let body = glob.slice(i + 1, end);
        if (body.startsWith("!")) body = `^${body.slice(1)}`;
        out += `[${body.replace(/\\/gu, "\\\\")}]`;
        i = end;
      }
    } else {
      out += c.replace(/[.+^${}()|[\]\\/]/gu, "\\$&");
    }
  }
  return out;
}

/**
 * Parse the text of one `.gitignore`.
 * @param {string} text
 * @param {string} [base] directory of the file relative to the walk root (`/`-separated, "" for
 *   the root)
 * @returns {IgnoreRule[]}
 */
export function parseGitignore(text, base = "") {
  const rules = [];
  for (const raw of text.split(/\r?\n/u)) {
    let line = raw.replace(/(?<!\\)\s+$/u, "");
    if (line === "" || line.startsWith("#")) continue;
    let negate = false;
    if (line.startsWith("!")) {
      negate = true;
      line = line.slice(1);
    } else if (line.startsWith("\\!") || line.startsWith("\\#")) {
      line = line.slice(1);
    }
    const directoryOnly = line.endsWith("/");
    if (directoryOnly) line = line.replace(/\/+$/u, "");
    if (line === "") continue;
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    const body = globBody(line);
    rules.push({
      regex: new RegExp(anchored ? `^${body}$` : `^(?:.*/)?${body}$`, "u"),
      negate,
      directoryOnly,
      base,
    });
  }
  return rules;
}

/**
 * Whether a path is ignored by a rule list (the last matching rule wins).
 * @param {IgnoreRule[]} rules rules in precedence order (parents first)
 * @param {string} relPath `/`-separated path relative to the walk root
 * @param {boolean} isDirectory
 * @returns {boolean}
 */
export function isIgnored(rules, relPath, isDirectory) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) continue;
    let local = relPath;
    if (rule.base) {
      if (!relPath.startsWith(`${rule.base}/`)) continue;
      local = relPath.slice(rule.base.length + 1);
    }
    if (rule.regex.test(local)) ignored = !rule.negate;
  }
  return ignored;
}

/**
 * @param {string} file
 * @returns {string | null}
 */
function readOptional(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Walk a directory tree the way git would list it without an index: every `.gitignore` on the
 * way applies, `.git` is never entered, symbolic links are listed but not followed.
 * @param {string} root absolute directory
 * @param {{ onError?: (abs: string, error: Error) => void }} [options]
 * @returns {Array<{ path: string, abs: string, directory?: boolean, symlink?: boolean }>} entries
 *   with root-relative `/`-separated paths (an empty directory is listed as a directory entry)
 */
export function walkUnignored(root, { onError } = {}) {
  const out = [];
  const visit = (abs, rel, inherited) => {
    let names;
    try {
      names = fs.readdirSync(abs).sort();
    } catch (error) {
      if (onError) onError(abs, error);
      return;
    }
    const own = readOptional(path.join(abs, ".gitignore"));
    const rules = own === null ? inherited : [...inherited, ...parseGitignore(own, rel)];
    let listed = 0;
    for (const name of names) {
      if (name === ".git") continue;
      const childAbs = path.join(abs, name);
      const childRel = rel ? `${rel}/${name}` : name;
      let stat;
      try {
        stat = fs.lstatSync(childAbs);
      } catch (error) {
        if (onError) onError(childAbs, error);
        continue;
      }
      const directory = stat.isDirectory();
      if (isIgnored(rules, childRel, directory)) continue;
      listed += 1;
      if (directory) visit(childAbs, childRel, rules);
      else if (stat.isFile() || stat.isSymbolicLink()) {
        out.push({ path: childRel, abs: childAbs, symlink: stat.isSymbolicLink() });
      }
    }
    if (listed === 0 && rel) out.push({ path: rel, abs, directory: true });
  };
  visit(root, "", []);
  return out;
}
