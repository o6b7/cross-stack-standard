/**
 * The fail-then-pass fixture runner.
 *
 * For every selected rule and every host its violation fixture lists, the runner builds two work
 * directories from the host and the fixture layers and runs the rule's gate in each:
 *
 * - clean run (`clean/` + the rule's `clean-overlays/<ID>/`): the gate must exit 0;
 * - violation run (the same plus `violations/<ID>/`): the gate must fail and print the rule id.
 *
 * @module
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { removeTree } from "./cleanup.mjs";
import { evaluateClean, evaluateViolation } from "./evaluate.mjs";
import { FIXTURE_FILE, FixtureConfigError, loadLayer } from "./fixture-config.mjs";
import { fixtureInputsDigest } from "./inputs.mjs";
import { declaredVars, loadHost, placeholderValues } from "./host.mjs";
import { RULE_ID_PREFIXES, createIdScanner } from "./ids.mjs";
import { sanitizeOutput } from "./output.mjs";
import { relPosix } from "./paths.mjs";
import { buildBaseEnv, runProcess, tailLines } from "./process.mjs";
import { TRACKS, fixtureDirs, loadRegistry, selectRules } from "./registry.mjs";
import { expandArgv, expandString } from "./template.mjs";
import { buildWorkdir, expandEnv } from "./workdir.mjs";

/** Default timeout of one gate run. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Default timeout of one host setup command. */
export const DEFAULT_SETUP_TIMEOUT_MS = 600_000;

/** Output lines kept in the report for a failed run. */
export const OUTPUT_TAIL_LINES = 60;

/** Error for invalid options (the CLI maps it to exit code 2). */
export class UsageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "UsageError";
  }
}

/**
 * Default number of parallel rule runs: up to four, leaving one CPU free.
 *
 * @returns {number} Job count.
 */
export function defaultJobs() {
  return Math.max(1, Math.min(4, os.availableParallelism() - 1));
}

/**
 * @typedef {object} RunnerOptions
 * @property {string} root Repository root.
 * @property {string} [registryFile] Registry path (default `<root>/registry/rules.json`).
 * @property {string} [harnessDir] Hosts directory (default `<root>/test/harness`).
 * @property {string} [fixturesDir] Fixtures directory (default `<root>/test/fixtures`).
 * @property {string[]} [rules] Rule ids to run.
 * @property {string | null} [track] Track filter.
 * @property {string | null} [host] Host filter.
 * @property {number} [jobs] Parallel rule runs.
 * @property {number | null} [timeoutMs] Gate timeout override.
 * @property {number | null} [setupTimeoutMs] Setup timeout override.
 * @property {boolean} [skipSetup] Skip host setup commands.
 * @property {boolean} [keepTemp] Keep work directories.
 * @property {string | null} [tempDir] Parent of the temporary run directory.
 * @property {Record<string, string>} [vars] Host variable overrides.
 * @property {NodeJS.ProcessEnv} [env] Environment to start from (default `process.env`).
 * @property {AbortSignal} [signal] Abort signal.
 * @property {(result: object, progress: { done: number, total: number }) => void} [onResult]
 *   Called as each result completes.
 * @property {(src: string, dest: string) => void} [link] Link function (tests).
 */

function gateSummary(gate) {
  return gate ? { kind: gate.kind, id: gate.id, discriminator: gate.discriminator ?? null } : null;
}

function emptyClean() {
  return { ok: false, exitCode: null, signal: null, timedOut: false, durationMs: 0, reasons: [] };
}

function emptyViolation() {
  return {
    ...emptyClean(),
    idPrinted: false,
    unexpectedIds: [],
    alsoFired: [],
  };
}

function baseResult(rule, host, fixture) {
  return {
    rule: rule.id,
    track: rule.track,
    host,
    gate: gateSummary(rule.gate),
    fixture,
    inputs: null,
    ok: false,
    clean: emptyClean(),
    violation: emptyViolation(),
    durationMs: 0,
    error: null,
    warnings: [],
  };
}

/**
 * Base names of the files in fixture layers that contain a rule id in either form (an allowlist
 * file must be named after its rule, for example). Output tokens that contain such a name are
 * removed before ids are searched, so a file name can never count as a printed id, even when a
 * gate prints it without a directory.
 *
 * @param {Array<import("./fixture-config.mjs").Layer | null>} layers
 * @param {(text: string) => string[]} scan Rule-id scanner.
 * @returns {string[]}
 */
export function layerNamesWithIds(layers, scan) {
  const names = new Set();
  const visit = (abs) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (scan(entry.name).length > 0) names.add(entry.name);
      if (entry.isDirectory()) visit(path.join(abs, entry.name));
    }
  };
  for (const layer of layers) if (layer) visit(layer.dir);
  names.delete(FIXTURE_FILE);
  return [...names].sort();
}

/**
 * Whether an idPattern source names the gate id (backslash escapes ignored).
 *
 * @param {string} source
 * @param {{ id: string }} gate
 * @returns {boolean}
 */
export function idPatternNamesGate(source, gate) {
  return source.replaceAll("\\", "").includes(gate.id);
}

/**
 * Resolve options, load the registry and hosts, and list the rule × host runs without running.
 *
 * @param {RunnerOptions} options Runner options.
 * @returns {object} Plan: resolved paths, selection, jobs and results for configuration errors.
 * @throws {UsageError | import("./registry.mjs").RegistryError} On invalid options or registry.
 */
export function planFixtures(options) {
  const root = path.resolve(options.root);
  const registryFile = options.registryFile ?? path.join(root, "registry", "rules.json");
  const harnessDir = options.harnessDir ?? path.join(root, "test", "harness");
  const fixturesDir = options.fixturesDir ?? path.join(root, "test", "fixtures");
  if (options.track && !TRACKS.includes(options.track)) {
    throw new UsageError(`unknown track "${options.track}" (known: ${TRACKS.join(", ")})`);
  }
  const registry = loadRegistry(registryFile, relPosix(root, registryFile));
  let selection;
  try {
    selection = selectRules(registry, {
      fixturesDir,
      ruleIds: options.rules ?? [],
      track: options.track ?? null,
    });
  } catch (err) {
    throw new UsageError(err.message, { cause: err });
  }
  const knownIds = new Set(registry.byId.keys());
  const hostCache = new Map();
  const jobs = [];
  const configErrors = [];

  for (const rule of selection.selected) {
    const dirs = fixtureDirs(fixturesDir, rule);
    const fixture = relPosix(root, dirs.violation);
    let layers;
    try {
      layers = {
        clean: loadLayer(dirs.clean, {
          role: "clean",
          label: relPosix(root, dirs.clean),
          knownIds,
        }),
        cleanOverlay: loadLayer(dirs.cleanOverlay, {
          role: "cleanOverlay",
          label: relPosix(root, dirs.cleanOverlay),
          knownIds,
        }),
        violation: loadLayer(dirs.violation, { role: "violation", label: fixture, knownIds }),
      };
      const pattern = layers.violation.config.expect.idPattern;
      if (pattern && rule.gate && !idPatternNamesGate(pattern, rule.gate)) {
        throw new FixtureConfigError(
          `${fixture}/fixture.json: expect.idPattern must name the gate id ${rule.gate.id}, ` +
            "so it can only match the gate's own finding",
        );
      }
    } catch (err) {
      if (!(err instanceof FixtureConfigError)) throw err;
      if (options.host && !rawHostsInclude(dirs.violation, options.host)) continue;
      const result = baseResult(rule, null, fixture);
      result.error = err.message;
      configErrors.push(result);
      continue;
    }
    for (const hostName of layers.violation.config.hosts) {
      if (options.host && hostName !== options.host) continue;
      const job = { rule, hostName, layers, fixture, host: null, error: null };
      try {
        job.host = loadHost(hostName, { harnessDir, root, cache: hostCache });
      } catch (err) {
        job.error = err.message;
      }
      jobs.push(job);
    }
  }

  const cliVarNames = Object.keys(options.vars ?? {});
  if (cliVarNames.length > 0) {
    const declared = harnessVars(harnessDir, root, hostCache);
    for (const name of cliVarNames) {
      if (!declared.has(name)) {
        const known = declared.size > 0 ? [...declared].sort().join(", ") : "none";
        throw new UsageError(
          `--var ${name} is not declared by any harness host (declared: ${known})`,
        );
      }
    }
  }
  // A missing fixture has no host, so a host-filtered run cannot attribute it.
  if (options.host) selection.missing = [];

  return { root, registryFile, harnessDir, fixturesDir, registry, selection, jobs, configErrors };
}

/**
 * Best-effort host attribution for an invalid violation fixture: true unless its raw `hosts`
 * array is readable and does not name `host`.
 *
 * @param {string} dir Violation fixture directory.
 * @param {string} host Host filter.
 * @returns {boolean} Whether the fixture may belong to the host.
 */
function rawHostsInclude(dir, host) {
  try {
    const hosts = JSON.parse(fs.readFileSync(path.join(dir, "fixture.json"), "utf8")).hosts;
    return !Array.isArray(hosts) || hosts.includes(host);
  } catch {
    return true;
  }
}

/**
 * Variable names declared by any valid host in the harness directory (for `--var` typo checks).
 *
 * @param {string} harnessDir Hosts directory.
 * @param {string} root Repository root.
 * @param {Map<string, object>} cache Host cache.
 * @returns {Set<string>} Declared variable names.
 */
function harnessVars(harnessDir, root, cache) {
  const names = new Set();
  let entries;
  try {
    entries = fs.readdirSync(harnessDir, { withFileTypes: true });
  } catch {
    return names;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const host = loadHost(entry.name, { harnessDir, root, cache });
      for (const name of declaredVars(host)) names.add(name);
    } catch {
      // Invalid or unrelated directories are reported when a rule selects them.
    }
  }
  return names;
}

async function pool(items, limit, worker, signal) {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length && !signal?.aborted) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
}

/**
 * Run the fixture matrix.
 *
 * @param {RunnerOptions} options Runner options.
 * @returns {Promise<{ plan: object, results: object[], setup: object[], durationMs: number,
 *   tempRoot: string | null }>} Raw results (see `report.mjs` to build the report).
 * @throws {UsageError | import("./registry.mjs").RegistryError} On invalid options or registry.
 */
export async function runFixtures(options) {
  const started = performance.now();
  const plan = planFixtures(options);
  const { root, registry, jobs } = plan;
  const cliVars = options.vars ?? {};
  const signal = options.signal;
  const keepTemp = options.keepTemp === true;
  const scan = createIdScanner(new Set([...RULE_ID_PREFIXES, ...registry.prefixes]));
  const results = new Array(jobs.length).fill(null);
  const setupLog = [];
  let done = 0;

  if (jobs.length === 0) {
    const durationMs = Math.round(performance.now() - started);
    return { plan, results: plan.configErrors, setup: setupLog, durationMs, tempRoot: null };
  }

  const tempParent = path.resolve(options.tempDir ?? os.tmpdir());
  fs.mkdirSync(tempParent, { recursive: true });
  const runRoot = fs.realpathSync(fs.mkdtempSync(path.join(tempParent, "csf-")));
  const gitConfigGlobal = path.join(runRoot, "gitconfig");
  fs.writeFileSync(gitConfigGlobal, "");
  const baseEnv = buildBaseEnv(options.env ?? process.env, { gitConfigGlobal, ceiling: runRoot });
  const workRoot = path.join(runRoot, "w");
  fs.mkdirSync(workRoot);
  const home = os.homedir();
  const scrub = (text) =>
    sanitizeOutput(text, [
      [runRoot, "<tmp>"],
      [root, "<root>"],
      [home, "~"],
    ]);

  const setupMemo = new Map();
  const ensureSetup = (host) => {
    if (options.skipSetup) return Promise.resolve();
    let pending = setupMemo.get(host.name);
    if (!pending) {
      pending = (async () => {
        for (const entry of host.include) await ensureSetup(entry.host);
        const t0 = performance.now();
        const values = placeholderValues(host, { repoRoot: root, cliVars });
        const env = { ...baseEnv, ...expandEnv(host.env, values, `${host.label} env`) };
        const timeoutMs = options.setupTimeoutMs ?? host.setupTimeoutMs ?? DEFAULT_SETUP_TIMEOUT_MS;
        const entry = { host: host.name, ok: true, commands: host.setup.length, durationMs: 0 };
        setupLog.push(entry);
        try {
          for (const [index, template] of host.setup.entries()) {
            const where = `${host.label} setup[${index}]`;
            const argv = expandArgv(template, values, where);
            const result = await runProcess({ argv, cwd: host.dir, env, timeoutMs, signal });
            if (result.exitCode !== 0) {
              const why =
                result.error ?? (result.timedOut ? "timed out" : `exit ${result.exitCode}`);
              const tail = tailLines(result.output, 20).join("\n");
              throw new Error(
                `${where} (${argv.join(" ")}) failed: ${why}${tail ? `\n${tail}` : ""}`,
              );
            }
          }
        } catch (err) {
          entry.ok = false;
          entry.error = err.message;
          throw err;
        } finally {
          entry.durationMs = Math.round(performance.now() - t0);
        }
      })();
      setupMemo.set(host.name, pending);
    }
    return pending;
  };

  const runVariant = async (job, index, variant, layers) => {
    const { rule, host } = job;
    const gate = host.gates[rule.gate.kind];
    const workdir = path.join(workRoot, `${String(index + 1).padStart(4, "0")}-${variant}`);
    const timeoutMs = options.timeoutMs ?? gate.timeoutMs ?? host.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const t0 = performance.now();
    const outcome = {
      exitCode: null,
      signal: null,
      timedOut: false,
      error: null,
      output: "",
      timeoutMs,
    };
    let copy = null;
    let junit = null;
    const warnings = [];
    try {
      const built = await buildWorkdir({
        host,
        layers,
        workdir,
        env: baseEnv,
        repoRoot: root,
        cliVars,
        timeoutMs,
        signal,
        link: options.link,
      });
      copy = built.copy;
      const values = placeholderValues(host, {
        repoRoot: root,
        workdir,
        base: built.base,
        head: built.head,
        rule,
        cliVars,
      });
      const where = `${host.label} gates.${rule.gate.kind}`;
      const argv = expandArgv(gate.argv, values, `${where}.argv`);
      const cwd = gate.cwd
        ? path.resolve(workdir, expandString(gate.cwd, values, `${where}.cwd`))
        : workdir;
      const env = {
        ...baseEnv,
        ...expandEnv(host.env, values, `${host.label} env`),
        ...expandEnv(gate.env, values, `${where}.env`),
      };
      const stdinFile = gate.stdin
        ? path.resolve(workdir, expandString(gate.stdin, values, `${where}.stdin`))
        : null;
      const junitFile = gate.junit
        ? path.resolve(workdir, expandString(gate.junit, values, `${where}.junit`))
        : null;
      const proc = await runProcess({ argv, cwd, env, timeoutMs, stdinFile, signal });
      if (junitFile) {
        try {
          junit = fs.readFileSync(junitFile, "utf8");
        } catch {
          junit = null;
        }
      }
      Object.assign(outcome, {
        exitCode: proc.exitCode,
        signal: proc.signal,
        timedOut: proc.timedOut,
        error: proc.error ?? (proc.aborted ? "aborted" : null),
        output: sanitizeOutput(proc.output, [
          [workdir, "<workdir>"],
          [runRoot, "<tmp>"],
          [root, "<root>"],
          [home, "~"],
        ]),
      });
    } catch (err) {
      outcome.error = scrub(err.message);
    } finally {
      if (!keepTemp) {
        const removed = removeTree(workdir);
        if (!removed.ok) warnings.push(scrub(removed.error));
      }
    }
    outcome.junit = junit;
    const run = {
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      timedOut: outcome.timedOut,
      durationMs: Math.round(performance.now() - t0),
    };
    if (copy) run.copy = copy;
    if (keepTemp) run.workdir = workdir;
    return { run, outcome, warnings };
  };

  const runJob = async (job, index) => {
    const t0 = performance.now();
    const { rule, layers } = job;
    const result = baseResult(rule, job.hostName, job.fixture);
    result.inputs = fixtureInputsDigest({
      rule,
      hostName: job.hostName,
      fixturesDir: plan.fixturesDir,
      harnessDir: plan.harnessDir,
    });
    try {
      if (job.error) throw new Error(job.error);
      if (!rule.gate) throw new Error(`${rule.id} has no gate in the registry`);
      const { host } = job;
      if (!host.gates[rule.gate.kind]) {
        throw new Error(
          `host "${host.name}" has no gate command for kind "${rule.gate.kind}" (${host.label})`,
        );
      }
      for (const layer of [layers.clean, layers.cleanOverlay]) {
        if (layer?.config && !layer.config.hosts.includes(host.name)) {
          throw new Error(`${layer.label}/fixture.json does not list host "${host.name}"`);
        }
      }
      await ensureSetup(host);

      const config = layers.violation.config;
      const gate = host.gates[rule.gate.kind];
      const junitTest = gate.junit ? rule.gate.id : null;
      const fileNames = layerNamesWithIds(
        [layers.clean, layers.cleanOverlay, layers.violation],
        scan,
      );
      const cleanLayers = [layers.clean, layers.cleanOverlay].filter(Boolean);
      const clean = await runVariant(job, index, "clean", cleanLayers);
      result.warnings.push(...clean.warnings);
      const cleanVerdict = evaluateClean(clean.outcome, {
        scan,
        idPattern: config.expect.idPattern,
        junitTest,
        fileNames,
      });
      result.clean = { ok: cleanVerdict.ok, ...clean.run, reasons: cleanVerdict.reasons };
      if (!cleanVerdict.ok) {
        result.clean.outputTail = tailLines(clean.outcome.output, OUTPUT_TAIL_LINES);
      }

      const violation = await runVariant(job, index, "violation", [
        ...cleanLayers,
        layers.violation,
      ]);
      result.warnings.push(...violation.warnings);
      const verdict = evaluateViolation(violation.outcome, {
        ruleId: rule.id,
        gateId: rule.gate.id,
        discriminator: rule.gate.discriminator ?? null,
        alsoFires: config.alsoFires,
        idPattern: config.expect.idPattern,
        failExitCodes: gate.failExitCodes,
        scan,
        cleanIds: cleanVerdict.printedIds,
        junitTest,
        fileNames,
      });
      result.violation = {
        ok: verdict.ok,
        ...violation.run,
        idPrinted: verdict.idPrinted,
        unexpectedIds: verdict.unexpectedIds,
        alsoFired: verdict.alsoFired,
        reasons: verdict.reasons,
      };
      if (!verdict.ok) {
        result.violation.outputTail = tailLines(violation.outcome.output, OUTPUT_TAIL_LINES);
      }
      result.ok = cleanVerdict.ok && verdict.ok;
    } catch (err) {
      result.error = scrub(err.message);
      result.ok = false;
    }
    result.durationMs = Math.round(performance.now() - t0);
    results[index] = result;
    done += 1;
    options.onResult?.(result, { done, total: jobs.length });
  };

  const cleanupWarnings = [];
  try {
    await pool(jobs, options.jobs ?? defaultJobs(), runJob, signal);
  } finally {
    if (!keepTemp) {
      // A background process a gate left behind could recreate files: retry once, then report.
      let removed = removeTree(runRoot);
      if (removed.ok && fs.existsSync(runRoot)) removed = removeTree(runRoot);
      if (!removed.ok || fs.existsSync(runRoot)) {
        cleanupWarnings.push(scrub(removed.error ?? `${runRoot} was recreated after removal`));
      }
    }
  }

  jobs.forEach((job, index) => {
    if (results[index]) return;
    const result = baseResult(job.rule, job.hostName, job.fixture);
    result.error = "aborted before this run started";
    results[index] = result;
  });

  const order = new Map(registry.rules.map((rule, index) => [rule.id, index]));
  const all = [...results, ...plan.configErrors].sort(
    (a, b) => order.get(a.rule) - order.get(b.rule),
  );
  return {
    plan,
    results: all,
    setup: setupLog,
    warnings: cleanupWarnings,
    durationMs: Math.round(performance.now() - started),
    tempRoot: keepTemp ? runRoot : null,
  };
}
