#!/usr/bin/env node
/**
 * @file Fails when any location that repeats the version disagrees with `VERSION`, when a
 * required version field is missing, when the marketplace entry of this plugin declares its own
 * `version`, or when a `composer.json` declares `version`. It checks exactly the locations that
 * `scripts/stamp-version.mjs` writes (both run the same plan from `scripts/lib/versioning.mjs`).
 *
 * Usage: node scripts/check-version-drift.mjs [--json] [--root <dir>]
 *
 * Exit codes: 0 no drift, 1 findings, 2 usage error or a missing/invalid `VERSION`.
 *
 * Node.js built-ins only.
 */

import {
  UsageError,
  VersionFileError,
  driftFindings,
  formatFinding,
  isMainModule,
  parseCli,
  planVersionStamp,
  readVersionFile,
} from "./lib/versioning.mjs";

const USAGE = `Usage: node scripts/check-version-drift.mjs [options]

Checks that every location repeating the version matches VERSION.

Options:
  --json        Print a machine-readable report
  --root <dir>  Repository root (default: this script's repository)
  -h, --help    Show this help

Exit codes: 0 no drift, 1 findings, 2 usage error or missing/invalid VERSION.
Fix drift with: node scripts/stamp-version.mjs`;

/**
 * @typedef {object} DriftReport
 * @property {boolean} ok
 * @property {string} version
 * @property {import("./lib/versioning.mjs").Location[]} locations Every location checked.
 * @property {import("./lib/versioning.mjs").Finding[]} findings
 */

/**
 * Checks `root` for version drift without writing anything.
 * @param {string} root Repository root.
 * @returns {DriftReport}
 * @throws {import("./lib/versioning.mjs").VersionFileError} When `VERSION` is missing or invalid.
 */
export function checkVersionDrift(root) {
  const version = readVersionFile(root);
  const plan = planVersionStamp(root, version);
  const findings = driftFindings(plan);
  return { ok: findings.length === 0, version, locations: plan.locations, findings };
}

/**
 * Runs the drift check.
 * @param {string[]} argv Arguments after the script name.
 * @param {{ stdout: { write(chunk: string): unknown }, stderr: { write(chunk: string): unknown } }} [io]
 * @returns {number} Exit code.
 */
export function main(argv, io = process) {
  let options;
  try {
    options = parseCli(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stderr.write(`check-version-drift: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let report;
  try {
    report = checkVersionDrift(options.root);
  } catch (error) {
    if (!(error instanceof VersionFileError)) throw error;
    if (options.json) {
      io.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    } else {
      io.stderr.write(`check-version-drift: ${error.message}\n`);
    }
    return 2;
  }

  if (options.json) {
    io.stdout.write(
      `${JSON.stringify(
        {
          ok: report.ok,
          version: report.version,
          checked: report.locations.length,
          findings: report.findings,
          locations: report.locations,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    for (const finding of report.findings) io.stdout.write(`${formatFinding(finding)}\n`);
    io.stdout.write(
      `check-version-drift: VERSION ${report.version}; ${report.locations.length} location(s) checked, ` +
        `${report.findings.length} finding(s)\n`,
    );
  }
  return report.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`check-version-drift: internal error: ${error.stack ?? error}\n`);
    process.exitCode = 2;
  }
}
