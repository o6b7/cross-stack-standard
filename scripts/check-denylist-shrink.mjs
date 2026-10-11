#!/usr/bin/env node
/**
 * check-denylist-shrink: fail when the brand denylist lost entries compared with a base version
 * (CI runs it against the pull request's base branch).
 *
 * Checks, in order:
 *   1. the algorithm is unchanged, and the file format is unchanged unless --allow-format-change
 *      is given (a format change is a reviewed, one-off event);
 *   2. the current entry count (rounded up to the padding bucket) is not lower than the base;
 *   3. when both files use the same key and tokenizer, every base digest (tokens, token
 *      prefixes, phrase heads, 2- and 3-grams) is still present, so an entry cannot be swapped
 *      for another one while the count stays the same, and every base window length is still
 *      listed with the same prefix length, so the glued-substring pass cannot be narrowed.
 * The base comes from a file (--base) or from a git revision (--base-ref, read with `git show`);
 * a base revision without the file (the change that introduces it) passes.
 *
 * Exit codes: 0 not shrunk, 1 shrunk or weakened, 2 usage error or unreadable/invalid denylist.
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  DenylistError,
  parseDenylistJson,
  readDenylist,
  validateDenylist,
} from "./lib/brand/denylist.mjs";
import { SourceError, git } from "./lib/brand/sources.mjs";

const ID = "BRAND-DENYLIST";
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DENYLIST_PATH = "scripts/brand-denylist.json";

const USAGE = `Usage: node scripts/check-denylist-shrink.mjs (--base <file> | --base-ref <rev>) [options]

Fail when ${DENYLIST_PATH} has fewer entries than the base version, changes its algorithm or
format, or (same key and tokenizer) lost a base digest or a base window length.

Options:
  --base <file>           base denylist file
  --base-ref <rev>        read the base from a git revision, e.g. origin/dev
  --current <file>        current denylist (default: ${DENYLIST_PATH} under the root)
  --allow-format-change   accept a different file format (counts are still compared)
  --root <dir>        repository root (default: this script's repository)
  --json              print a JSON report
  --help              print this help

Exit codes: 0 not shrunk, 1 shrunk or weakened, 2 usage error or unreadable/invalid denylist.`;

/**
 * The fields of a base denylist that can be compared even when it has another format.
 * @param {unknown} value parsed JSON
 * @returns {Record<string, any>}
 * @throws {DenylistError}
 */
export function looseDenylist(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DenylistError("invalid denylist: not a JSON object");
  }
  const list = /** @type {Record<string, any>} */ (value);
  if (!Number.isInteger(list.count) || list.count < 0) {
    throw new DenylistError("invalid denylist: bad count");
  }
  return list;
}

/**
 * Compare two denylists.
 * @param {Record<string, any>} base base denylist (validated, or loose when its format differs)
 * @param {import("./lib/brand/denylist.mjs").Denylist} current
 * @param {{ allowFormatChange?: boolean }} [options]
 * @returns {{ problems: string[], digestsCompared: boolean }}
 */
export function compareDenylists(base, current, { allowFormatChange = false } = {}) {
  const problems = [];
  if (base.algorithm !== current.algorithm) {
    problems.push(
      `algorithm changed from ${JSON.stringify(base.algorithm)} to ${JSON.stringify(current.algorithm)}`,
    );
  }
  const sameFormat = base.format === current.format;
  if (!sameFormat && !allowFormatChange) {
    problems.push(
      `file format changed from ${JSON.stringify(base.format)} to ${JSON.stringify(current.format)}; ` +
        "a format change is reviewed on its own (--allow-format-change)",
    );
  }
  if (current.count < base.count) {
    problems.push(`entry count decreased from ${base.count} to ${current.count}`);
  }
  const digestsCompared =
    sameFormat && base.keyId === current.keyId && base.tokenizer === current.tokenizer;
  if (digestsCompared) {
    const sets = [
      ["single-token", base.tokens.digests, current.tokens.digests],
      ["token prefix", base.tokens.prefixes ?? [], current.tokens.prefixes ?? []],
      ["phrase head", base.ngrams.heads, current.ngrams.heads],
      ["2-gram", base.ngrams["2"], current.ngrams["2"]],
      ["3-gram", base.ngrams["3"], current.ngrams["3"]],
    ];
    for (const [label, before, after] of sets) {
      const now = new Set(after);
      const missing = before.filter((digest) => !now.has(digest)).length;
      if (missing > 0) problems.push(`${missing} ${label} digest(s) from the base are missing`);
    }
    const lengths = new Set(current.tokens.lengths);
    const lost = base.tokens.lengths.filter((length) => !lengths.has(length));
    if (lost.length > 0) {
      problems.push(
        `window length(s) ${lost.join(", ")} from the base are missing (the glued-substring ` +
          "pass would skip them)",
      );
    }
    if (base.tokens.prefixLength !== current.tokens.prefixLength) {
      problems.push(
        `prefix length changed from ${base.tokens.prefixLength} to ${current.tokens.prefixLength}`,
      );
    }
  }
  return { problems, digestsCompared };
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, cwd?: string }} [io]
 * @returns {number} exit code
 */
export function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const cwd = io.cwd ?? process.cwd();
  const fail = (message) => {
    stderr.write(`check-denylist-shrink: ${message}\n`);
    return 2;
  };
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        base: { type: "string" },
        "base-ref": { type: "string" },
        current: { type: "string" },
        "allow-format-change": { type: "boolean" },
        root: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    return fail(`${error.message}\n\n${USAGE}`);
  }
  if (values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (Boolean(values.base) === Boolean(values["base-ref"])) {
    return fail(`pass exactly one of --base and --base-ref\n\n${USAGE}`);
  }
  const root = resolve(cwd, values.root ?? DEFAULT_ROOT);
  const report = (payload, human) => {
    if (values.json) {
      stdout.write(`${JSON.stringify({ tool: "check-denylist-shrink", ...payload }, null, 2)}\n`);
    } else {
      stdout.write(`${human}\n`);
    }
  };

  let current;
  let base;
  try {
    current = readDenylist(resolve(cwd, values.current ?? resolve(root, DENYLIST_PATH)));
    const parseBase = (text) => {
      const parsed = parseDenylistJson(text, "the base denylist");
      return /** @type {any} */ (parsed)?.format === current.format
        ? validateDenylist(parsed)
        : looseDenylist(parsed);
    };
    if (values.base) {
      let text;
      try {
        text = readFileSync(resolve(cwd, values.base), "utf8");
      } catch (error) {
        throw new DenylistError(`cannot read the base denylist (${error.code ?? error.message})`);
      }
      base = parseBase(text);
    } else {
      const spec = `${values["base-ref"]}:${DENYLIST_PATH}`;
      const out = git(root, ["show", spec], { allowFailure: true });
      if (out === null) {
        // Distinguish "file absent at that revision" from "revision unknown".
        const known = git(
          root,
          ["rev-parse", "--verify", "--quiet", `${values["base-ref"]}^{commit}`],
          {
            allowFailure: true,
          },
        );
        if (known === null) {
          throw new SourceError(`base revision ${JSON.stringify(values["base-ref"])} not found`);
        }
        report(
          { ok: true, base: null, current: current.count, problems: [] },
          `check-denylist-shrink: ok: the base revision has no ${DENYLIST_PATH}; current count ${current.count}`,
        );
        return 0;
      }
      base = parseBase(out.toString("utf8"));
    }
  } catch (error) {
    if (error instanceof DenylistError || error instanceof SourceError) return fail(error.message);
    throw error;
  }

  const { problems, digestsCompared } = compareDenylists(base, current, {
    allowFormatChange: values["allow-format-change"] === true,
  });
  const ok = problems.length === 0;
  const lines = problems.map((problem) => `${ID} ${DENYLIST_PATH}:0 ${problem}`);
  const note = digestsCompared
    ? ""
    : " (key, tokenizer or format changed; digests not compared, review the change)";
  lines.push(
    `check-denylist-shrink: ${ok ? "ok" : "failed"}: base ${base.count}, current ${current.count} entries${note}`,
  );
  report(
    { ok, base: base.count, current: current.count, digestsCompared, problems },
    lines.join("\n"),
  );
  return ok ? 0 : 1;
}

const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
