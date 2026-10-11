#!/usr/bin/env node
/**
 * @file Writes the version in `VERSION` into every place that repeats it: the marketplace
 * `metadata.version`, the plugin's `plugin.json`, every `package.json` (and the npm lockfile's
 * workspace entries), template header comments and versioned schema URLs. `composer.json` files
 * are never written. See `scripts/lib/versioning.mjs` for the full list of locations.
 *
 * Usage: node scripts/stamp-version.mjs [--dry-run] [--json] [--root <dir>]
 *
 * Exit codes: 0 stamped (or nothing to do), 2 usage error, invalid `VERSION` or an unreadable
 * manifest (nothing is written when any file cannot be processed).
 *
 * Node.js built-ins only.
 */

import {
  UsageError,
  VersionFileError,
  formatFinding,
  isMainModule,
  parseCli,
  planVersionStamp,
  readVersionFile,
  writePlan,
} from "./lib/versioning.mjs";

const USAGE = `Usage: node scripts/stamp-version.mjs [options]

Writes the version in VERSION into every location that repeats it.

Options:
  --dry-run     List the changes without writing any file
  --json        Print a machine-readable report
  --root <dir>  Repository root (default: this script's repository)
  -h, --help    Show this help

Exit codes: 0 done, 2 usage error or a file that cannot be processed (nothing written).`;

/**
 * Formats one change as `VERSION-STAMP <path>:<line> <location>: <from> -> <to>`.
 * @param {import("./lib/versioning.mjs").Location} change
 * @returns {string}
 */
export function formatChange(change) {
  const from = change.from === null ? "(missing)" : JSON.stringify(change.from);
  return `VERSION-STAMP ${change.file}:${change.line} ${change.location}: ${from} -> ${JSON.stringify(change.to)}`;
}

/**
 * Runs the stamper.
 * @param {string[]} argv Arguments after the script name.
 * @param {{ stdout: { write(chunk: string): unknown }, stderr: { write(chunk: string): unknown } }} [io]
 * @returns {number} Exit code.
 */
export function main(argv, io = process) {
  let options;
  try {
    options = parseCli(argv, { "dry-run": { type: "boolean" } });
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stderr.write(`stamp-version: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const dryRun = Boolean(options["dry-run"]);

  let version;
  try {
    version = readVersionFile(options.root);
  } catch (error) {
    if (!(error instanceof VersionFileError)) throw error;
    return fail(io, options.json, error.message);
  }

  const plan = planVersionStamp(options.root, version);
  const blocking = plan.findings.filter((finding) => finding.id === "VERSION-JSON");
  const warnings = plan.findings.filter((finding) => finding.id !== "VERSION-JSON");
  if (blocking.length > 0) {
    if (options.json) {
      io.stdout.write(
        `${JSON.stringify({ ok: false, version, dryRun, written: 0, changes: plan.changes, errors: blocking, warnings }, null, 2)}\n`,
      );
    } else {
      for (const finding of blocking) io.stderr.write(`${formatFinding(finding)}\n`);
      io.stderr.write(
        `stamp-version: ${blocking.length} file(s) cannot be processed; nothing was written\n`,
      );
    }
    return 2;
  }

  const written = dryRun ? 0 : writePlan(options.root, plan);
  if (options.json) {
    io.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          version,
          dryRun,
          checked: plan.locations.length,
          written,
          files: plan.writes.map((write) => write.file),
          changes: plan.changes,
          warnings,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  for (const change of plan.changes) io.stdout.write(`${formatChange(change)}\n`);
  for (const warning of warnings) io.stderr.write(`warning: ${formatFinding(warning)}\n`);
  const files = plan.writes.length;
  const summary = dryRun
    ? `stamp-version: ${version}; dry run: ${plan.changes.length} change(s) in ${files} file(s) would be written`
    : `stamp-version: ${version}; ${plan.changes.length} change(s) in ${files} file(s) written`;
  const warningNote = warnings.length > 0 ? `; ${warnings.length} warning(s)` : "";
  io.stdout.write(`${summary} (${plan.locations.length} location(s) checked)${warningNote}\n`);
  return 0;
}

/** Reports a fatal error in the requested format and returns exit code 2. */
function fail(io, json, message) {
  if (json) io.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  else io.stderr.write(`stamp-version: ${message}\n`);
  return 2;
}

if (isMainModule(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`stamp-version: internal error: ${error.stack ?? error}\n`);
    process.exitCode = 2;
  }
}
