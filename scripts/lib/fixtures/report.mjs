/**
 * `fixture-report.json` and the human-readable summary of a fixture run.
 *
 * `check-registry` reads the report: every FORCED/GUARDED rule needs a result with
 * `clean.ok` and `violation.ok` (violation failed and printed the id).
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Version of the report format; bump it on an incompatible change. Version 2 records an
 * `inputs` fingerprint with every result (see inputs.mjs) and cleanup `warnings`.
 */
export const REPORT_FORMAT = 2;

const HUMAN_TAIL_LINES = 20;

/**
 * Build the report object.
 *
 * @param {object} run Output of `runFixtures`.
 * @param {{ rules?: string[], track?: string | null, host?: string | null }} filters Filters used.
 * @returns {object} Report.
 */
export function buildReport(run, filters = {}) {
  const { selection, fixturesDir, root } = run.plan;
  const passed = run.results.filter((result) => result.ok).length;
  const failed = run.results.length - passed;
  const missingFixtures = selection.missing.map((rule) => ({
    rule: rule.id,
    track: rule.track,
    enforcement: rule.enforcement,
    fixture: path
      .relative(root, path.join(fixturesDir, rule.track, "violations", rule.id))
      .split(path.sep)
      .join("/"),
  }));
  const partial = Boolean(filters.rules?.length || filters.track || filters.host);
  return {
    formatVersion: REPORT_FORMAT,
    generatedAt: new Date().toISOString(),
    partial,
    filters: {
      rules: filters.rules ?? [],
      track: filters.track ?? null,
      host: filters.host ?? null,
    },
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    summary: {
      ok: failed === 0 && missingFixtures.length === 0,
      runs: run.results.length,
      passed,
      failed,
      missingFixtures: missingFixtures.length,
      skipped: selection.skipped.length,
      durationMs: run.durationMs,
    },
    setup: run.setup,
    warnings: [...(run.warnings ?? []), ...run.results.flatMap((result) => result.warnings ?? [])],
    results: run.results,
    missingFixtures,
    skipped: selection.skipped,
  };
}

/**
 * Write the report as pretty JSON (creating the parent directory).
 *
 * @param {string} file Report path.
 * @param {object} report Report object.
 */
export function writeReport(file, report) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

function fixtureFile(result) {
  return `${result.fixture}/fixture.json:1`;
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Format the report for a terminal: one line per finding
 * (`<ID> <path>:<line> [host] <message>`), the tail of failing output, and a summary line.
 *
 * @param {object} report Report from {@link buildReport}.
 * @param {{ verbose?: boolean, reportPath?: string | null, tempRoot?: string | null }} [options]
 *   `verbose` also lists passing runs; `reportPath` is shown in the summary.
 * @returns {string} Text ending with a newline.
 */
export function formatHuman(report, options = {}) {
  const lines = [];
  for (const result of report.results) {
    const host = result.host ? ` [${result.host}]` : "";
    const kept = ["clean", "violation"].filter((variant) => result[variant]?.workdir);
    if (result.ok) {
      if (options.verbose || kept.length > 0) {
        lines.push(
          `ok ${result.rule}${host} clean exit ${result.clean.exitCode}, violation exit ` +
            `${result.violation.exitCode} (${result.durationMs} ms)`,
        );
      }
    } else {
      const reasons = result.error
        ? [result.error.split("\n")[0]]
        : [...result.clean.reasons, ...result.violation.reasons];
      for (const reason of reasons) {
        lines.push(`${result.rule} ${fixtureFile(result)}${host} ${reason}`);
      }
      const extra = result.error ? result.error.split("\n").slice(1) : [];
      const tail = [
        ...extra,
        ...(result.clean.outputTail ?? []).slice(-HUMAN_TAIL_LINES).map((l) => `clean> ${l}`),
        ...(result.violation.outputTail ?? [])
          .slice(-HUMAN_TAIL_LINES)
          .map((l) => `violation> ${l}`),
      ];
      for (const line of tail) lines.push(`    | ${line}`);
    }
    for (const variant of kept) lines.push(`    kept ${variant}: ${result[variant].workdir}`);
  }
  for (const warning of report.warnings ?? []) lines.push(`warning: ${warning}`);
  for (const missing of report.missingFixtures) {
    lines.push(
      `${missing.rule} ${missing.fixture}/fixture.json:1 enforcement is ${missing.enforcement ?? "set"} ` +
        "but the violation fixture is missing",
    );
  }
  const s = report.summary;
  // With nothing to run, "0 of 0 runs passed" would read like evidence; say what happened.
  const parts = [
    s.runs === 0
      ? "no fixture runs (no selected rule has a violation fixture yet)"
      : `${s.passed} of ${plural(s.runs, "run")} passed`,
  ];
  if (s.failed > 0) parts.push(`${s.failed} failed`);
  if (s.missingFixtures > 0) {
    parts.push(plural(s.missingFixtures, "rule") + " without a required fixture");
  }
  if (s.skipped > 0) {
    parts.push(plural(s.skipped, "rule") + " skipped (targets enforcement, no fixture yet)");
  }
  let summary = `run-fixtures: ${parts.join(", ")} in ${(s.durationMs / 1000).toFixed(1)} s`;
  if (options.reportPath) summary += `; report ${options.reportPath}`;
  if (options.tempRoot) summary += `; work directories kept in ${options.tempRoot}`;
  lines.push(summary);
  return `${lines.join("\n")}\n`;
}

/**
 * Format the planned runs for `--list`.
 *
 * @param {object} plan Output of `planFixtures`.
 * @returns {string} One line per planned run, then missing and skipped rules.
 */
export function formatPlan(plan) {
  const lines = plan.jobs.map((job) => {
    const gate = job.rule.gate;
    const gateText = gate
      ? `${gate.kind}:${gate.id}${gate.discriminator ? `:${gate.discriminator}` : ""}`
      : "no gate";
    return `${job.rule.id} [${job.hostName}] ${gateText} ${job.fixture}`;
  });
  for (const result of plan.configErrors) lines.push(`${result.rule} ${result.error}`);
  for (const rule of plan.selection.missing) lines.push(`${rule.id} missing violation fixture`);
  for (const id of plan.selection.skipped) lines.push(`${id} skipped (no fixture yet)`);
  lines.push(`run-fixtures: ${plural(plan.jobs.length, "planned run")}`);
  return `${lines.join("\n")}\n`;
}
