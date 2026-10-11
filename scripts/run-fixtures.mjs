#!/usr/bin/env node
/**
 * Fail-then-pass fixture matrix.
 *
 * For every rule in `registry/rules.json` whose `enforcement` or `targetEnforcement` is FORCED
 * or GUARDED and that has a violation fixture, run the rule's gate on each harness host the
 * fixture lists: the clean fixture must pass, and the violation fixture must fail and print the
 * rule id. Writes `fixture-report.json` (gitignored), which `check-registry` reads.
 *
 * Node.js built-ins only; no network access.
 *
 * Exit codes: 0 every run passed; 1 a run failed or a required fixture is missing; 2 usage or
 * internal error; 130 interrupted.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { RegistryError } from "./lib/fixtures/registry.mjs";
import { buildReport, formatHuman, formatPlan, writeReport } from "./lib/fixtures/report.mjs";
import {
  DEFAULT_TIMEOUT_MS,
  UsageError,
  defaultJobs,
  planFixtures,
  runFixtures,
} from "./lib/fixtures/runner.mjs";
import { toPosix } from "./lib/fixtures/paths.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = `Usage: node scripts/run-fixtures.mjs [options]

Runs the fail-then-pass fixture matrix. For each FORCED or GUARDED rule (or a rule whose
targetEnforcement is) that has test/fixtures/<track>/violations/<ID>/, the rule's gate runs
on every host the fixture lists: on the clean fixture it must exit 0; on the violation
fixture it must fail and print the rule id (PROC-014 or PROC_014).

Options:
  --rule <ID>          Run only this rule (repeatable or comma-separated)
  --track <track>      Run only rules of this track: laravel, web, mobile, client, shared
  --host <name>        Run only on this harness host
  --jobs <n>           Parallel rule runs (default: ${defaultJobs()} on this machine)
  --timeout <ms>       Timeout of each gate run (default: gate or host setting, else ${DEFAULT_TIMEOUT_MS})
  --setup-timeout <ms> Timeout of each host setup command
  --skip-setup         Do not run host setup commands (dependencies are already installed)
  --var <name=value>   Override a host variable, e.g. --var kitBin=/abs/path/cross-stack.mjs
  --keep-temp          Keep the temporary work directories and print where they are
  --temp-dir <dir>     Create work directories under <dir> (use the hosts' device to keep
                       hard links; the default is the system temp directory)
  --report <file>      Report path (default: <root>/fixture-report.json)
  --no-report          Do not write the report file
  --list               Print the planned rule and host runs without running them
  --json               Print the report as JSON instead of text
  --verbose            Also list passing runs
  --quiet              Do not print progress lines on stderr
  --root <dir>         Repository root (default: this repository)
  -h, --help           Show this help

Exit codes: 0 all runs passed, 1 a run failed or a required fixture is missing,
2 usage or internal error, 130 interrupted.
`;

function positiveInt(name, value) {
  if (value === undefined) return null;
  if (!/^[0-9]+$/.test(value) || Number(value) <= 0) {
    throw new UsageError(`--${name} must be a positive integer, got "${value}"`);
  }
  return Number(value);
}

/**
 * Parse command-line arguments.
 *
 * @param {string[]} argv Arguments after the script name.
 * @returns {object} Parsed options.
 * @throws {UsageError} On invalid arguments.
 */
export function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        rule: { type: "string", multiple: true },
        track: { type: "string" },
        host: { type: "string" },
        jobs: { type: "string" },
        timeout: { type: "string" },
        "setup-timeout": { type: "string" },
        "skip-setup": { type: "boolean" },
        var: { type: "string", multiple: true },
        "keep-temp": { type: "boolean" },
        "temp-dir": { type: "string" },
        report: { type: "string" },
        "no-report": { type: "boolean" },
        list: { type: "boolean" },
        json: { type: "boolean" },
        verbose: { type: "boolean" },
        quiet: { type: "boolean" },
        root: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (err) {
    throw new UsageError(err.message, { cause: err });
  }
  const v = parsed.values;
  const rules = (v.rule ?? [])
    .flatMap((item) => item.split(","))
    .map((id) => id.trim())
    .filter(Boolean);
  const vars = {};
  for (const item of v.var ?? []) {
    const eq = item.indexOf("=");
    if (eq <= 0) throw new UsageError(`--var expects name=value, got "${item}"`);
    vars[item.slice(0, eq)] = item.slice(eq + 1);
  }
  if (v.report && v["no-report"]) {
    throw new UsageError("--report and --no-report exclude each other");
  }
  const root = path.resolve(v.root ?? DEFAULT_ROOT);
  return {
    help: v.help === true,
    root,
    rules: [...new Set(rules)],
    track: v.track ?? null,
    host: v.host ?? null,
    jobs: positiveInt("jobs", v.jobs) ?? defaultJobs(),
    timeoutMs: positiveInt("timeout", v.timeout),
    setupTimeoutMs: positiveInt("setup-timeout", v["setup-timeout"]),
    skipSetup: v["skip-setup"] === true,
    vars,
    keepTemp: v["keep-temp"] === true,
    tempDir: v["temp-dir"] ? path.resolve(v["temp-dir"]) : null,
    reportPath: v["no-report"]
      ? null
      : path.resolve(v.report ?? path.join(root, "fixture-report.json")),
    list: v.list === true,
    json: v.json === true,
    verbose: v.verbose === true,
    quiet: v.quiet === true,
  };
}

/**
 * Run the CLI.
 *
 * @param {string[]} argv Arguments after the script name.
 * @returns {Promise<number>} Exit code.
 */
export async function main(argv) {
  let options;
  try {
    options = parseCli(argv);
  } catch (err) {
    process.stderr.write(`run-fixtures: ${err.message}\nRun with --help for usage.\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const controller = new AbortController();
  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
    controller.abort();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    if (options.list) {
      const plan = planFixtures(options);
      process.stdout.write(
        options.json
          ? `${JSON.stringify(
              {
                runs: plan.jobs.map((job) => ({
                  rule: job.rule.id,
                  host: job.hostName,
                  fixture: job.fixture,
                })),
                configErrors: plan.configErrors.map((r) => ({ rule: r.rule, error: r.error })),
                missing: plan.selection.missing.map((rule) => rule.id),
                skipped: plan.selection.skipped,
              },
              null,
              2,
            )}\n`
          : formatPlan(plan),
      );
      return 0;
    }

    const onResult = options.quiet
      ? undefined
      : (result, { done, total }) => {
          const status = result.ok ? "ok" : "FAIL";
          const host = result.host ? ` [${result.host}]` : "";
          const seconds = (result.durationMs / 1000).toFixed(1);
          process.stderr.write(`[${done}/${total}] ${status} ${result.rule}${host} ${seconds} s\n`);
        };
    const run = await runFixtures({ ...options, signal: controller.signal, onResult });
    const report = buildReport(run, options);
    if (options.reportPath) writeReport(options.reportPath, report);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      const shown = options.reportPath
        ? toPosix(path.relative(process.cwd(), options.reportPath))
        : null;
      process.stdout.write(
        formatHuman(report, {
          verbose: options.verbose,
          reportPath: shown,
          tempRoot: run.tempRoot,
        }),
      );
    }
    if (interrupted) return 130;
    return report.summary.ok ? 0 : 1;
  } catch (err) {
    if (err instanceof UsageError || err instanceof RegistryError) {
      process.stderr.write(`run-fixtures: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`run-fixtures: internal error: ${err.stack ?? err.message}\n`);
    return 2;
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = await main(process.argv.slice(2));
}
