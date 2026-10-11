#!/usr/bin/env node
/**
 * sanitize-output: make command output safe to paste into a pull request body, an issue or
 * release notes. Machine-specific absolute paths are replaced with stable tokens (the same
 * replacement the fixture runner applies to gate output):
 *
 *   the repository root            -> <root>
 *   the system temporary directory -> <tmp>   (also /tmp, /private/tmp, /var/folders/…/T and
 *                                              $RUNNER_TEMP / $TMPDIR / $TEMP / $TMP)
 *   the home directory             -> ~
 *
 * Terminal escape sequences are removed as well. Text comes from standard input or from files and
 * goes to standard output. Run the result through the brand guard before publishing it:
 *
 *   npm test 2>&1 | node scripts/sanitize-output.mjs > body.md
 *   node scripts/check-brand-leak.mjs --stdin --label "pull request body" < body.md
 *
 * Exit codes: 0 written, 2 usage error or unreadable input.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { sanitizeOutput } from "./lib/fixtures/output.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = `Usage: node scripts/sanitize-output.mjs [file...] [--root <dir>]

Replace the repository root, temporary directories and the home directory in command output with
<root>, <tmp> and ~, and strip terminal escape sequences, so the output can be pasted into a pull
request, an issue or release notes. Reads standard input when no file is given.

Options:
  --root <dir>   repository root to replace (default: this script's repository)
  --help         print this help

Exit codes: 0 written, 2 usage error or unreadable input.`;

/**
 * Real path of a directory, or the path itself when it cannot be resolved.
 * @param {string} dir
 * @returns {string}
 */
function real(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

/**
 * The path replacements for this machine, longest first after expansion by sanitizeOutput.
 * @param {{ root: string, env?: NodeJS.ProcessEnv, home?: string, tmp?: string }} options
 * @returns {Array<[string, string]>}
 */
export function replacementsFor({
  root,
  env = process.env,
  home = os.homedir(),
  tmp = os.tmpdir(),
}) {
  const temps = [tmp, env.RUNNER_TEMP, env.TMPDIR, env.TEMP, env.TMP, "/private/tmp", "/tmp"]
    .filter((dir) => typeof dir === "string" && dir.length > 1)
    .flatMap((dir) => [dir.replace(/[\\/]+$/u, ""), real(dir)]);
  return [
    [root, "<root>"],
    [real(root), "<root>"],
    ...temps.map((dir) => /** @type {[string, string]} */ ([dir, "<tmp>"])),
    [home, "~"],
    [real(home), "~"],
  ];
}

/**
 * Sanitise a text for publication.
 * @param {string} text
 * @param {{ root: string, env?: NodeJS.ProcessEnv, home?: string, tmp?: string }} options
 * @returns {string}
 */
export function sanitizeForPublishing(text, options) {
  // macOS per-user temporary directories (/var/folders/xx/yyyy/T/…) that are not this process's
  // own temporary directory still identify the machine.
  const generic = text.replace(
    /\/(?:private\/)?var\/folders\/[^/\s]+\/[^/\s]+\/T(?=[/\s]|$)/gu,
    "<tmp>",
  );
  return sanitizeOutput(generic, replacementsFor(options));
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, stdin?: () => string, env?: NodeJS.ProcessEnv }} [io]
 * @returns {number} exit code
 */
export function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { root: { type: "string" }, help: { type: "boolean", short: "h" } },
    });
  } catch (error) {
    stderr.write(`sanitize-output: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  const root = path.resolve(values.root ?? DEFAULT_ROOT);
  let text;
  try {
    text =
      positionals.length === 0
        ? (io.stdin ?? (() => fs.readFileSync(0, "utf8")))()
        : positionals.map((file) => fs.readFileSync(file, "utf8")).join("");
  } catch (error) {
    stderr.write(`sanitize-output: cannot read the input (${error.code ?? error.message})\n`);
    return 2;
  }
  stdout.write(sanitizeForPublishing(text, { root, env: io.env ?? process.env }));
  return 0;
}

const invokedDirectly = (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
