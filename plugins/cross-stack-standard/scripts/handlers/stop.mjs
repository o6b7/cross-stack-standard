/**
 * Stop: the fast blocking gate. When Claude finishes a turn, the project's own fast check
 * (`check:fast` by default) runs within a time budget; a failure blocks the stop and feeds the
 * failing command and the end of its output back to Claude.
 *
 * One run, in order (every step before the gate runs is silent and starts no process other than
 * git):
 *
 * 1. Turned off (`hooks.stop.enabled: false`, or `CROSS_STACK_STANDARD_STOP_GATE=0`): exit 0.
 * 2. No manifest: exit 0.
 * 3. The plan: for each directory of the manifest's tracks (`trackRoots`, else the project
 *    directory), a Composer script and an npm script with the configured name, in that order.
 *    No such script anywhere: exit 0.
 * 4. The fingerprint of the working state (lib/fingerprint.mjs), which includes the plan and
 *    covers the track directories. When it equals the last green run's, nothing changed since
 *    the gate passed: exit 0.
 * 5. `stop_hook_active` is true (Claude is already continuing because this gate blocked the last
 *    stop): when the fingerprint equals the one recorded for that failing run, Claude changed
 *    nothing since the block, so blocking again could only loop: exit 0. Otherwise the gate runs
 *    again, so a fix that still fails is caught. Claude Code itself ends the turn after 8
 *    consecutive blocks; the hook adds no cap of its own.
 * 6. Each script runs in turn, as `process.execPath <npm-cli.js> run <name>` and
 *    `php <composer> run-script <name>` (never a `.cmd` or `.bat` shim, never a shell), with
 *    `CI=1` and the quiet, offline-friendly tool environment of lib/spawn.mjs.
 *
 * Results, decided by exit codes only (never by the text a tool prints):
 *
 * - any script exits non-zero: exit 2; stderr names each failing command and its directory,
 *   followed by the last {@link TAIL_LINES} lines of its combined output, without colour codes
 *   and with the home directory shown as `~`. The fingerprint from before the run is recorded
 *   as the failing state (step 5);
 * - otherwise, a script stopped because the budget ran out: exit 0 with a `systemMessage` (the
 *   gate is skipped for this turn; nothing is recorded);
 * - otherwise: exit 0, and the fingerprint from before the run, the state the gate checked, is
 *   recorded as green, provided the fingerprint taken after the run still equals it. When
 *   anything changed while the gate ran (an editor, a background task, a gate that writes files
 *   git does not ignore), nothing is recorded and the next stop runs the gate again; the debug
 *   log names the changed paths. A script whose tool is not installed (npm's entry point,
 *   Composer or PHP) is skipped with a `systemMessage`; the skip is part of the plan, so
 *   installing the tool runs the gate again.
 *
 * @module plugins/cross-stack-standard/scripts/handlers/stop
 */

import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createBudget } from "../lib/budget.mjs";
import {
  changedPaths,
  computeFingerprint,
  FINGERPRINT_LIMITS,
  readFailingFingerprint,
  readGreenFingerprint,
  recordFailingFingerprint,
  recordGreenFingerprint,
} from "../lib/fingerprint.mjs";
import { failOpen, NOTICE_PREFIX } from "../lib/io.mjs";
import { TRACKS } from "../lib/manifest.mjs";
import { isWithin, readTextCapped, relativePosix, samePath } from "../lib/project.mjs";
import { resolveComposer, resolveNpmCli } from "../lib/resolve-tool.mjs";
import { lastLines, runTool, stripAnsi, toolEnv } from "../lib/spawn.mjs";

/** Lines of output shown for each failing command. */
export const TAIL_LINES = 60;

/** Longest output line shown; longer lines (minified code, long paths) are cut. */
export const MAX_LINE_CHARS = 400;

/** Time between terminating and killing a script that ran past the budget. */
export const KILL_GRACE_MS = 1_500;

/** Changed paths named in the debug line of a run whose state changed while the gate ran. */
const MAX_CHANGED_PATHS_SHOWN = 10;

/** Largest composer.json or package.json read for its scripts. */
const MAX_MANIFEST_BYTES = 1024 * 1024;

/** Budget when the entry point passes none (the schema default of `hooks.stop.budgetSeconds`). */
const DEFAULT_BUDGET_SECONDS = 90;

/**
 * Variables set for the gate's scripts on top of lib/spawn.mjs's tool environment: `CI=1`, so
 * test runners and other tools run once, without watch modes or prompts.
 */
export const STOP_ENV = Object.freeze({ CI: "1" });

/**
 * Variables removed from the gate's environment, the same set the fixture harness removes
 * (test/harness/README.md): Claude Code's session variables and the Standard's own switches,
 * so `check:fast` prints what it prints in CI and in a terminal.
 */
const SESSION_PREFIXES = Object.freeze(["CLAUDE", "CROSS_STACK_STANDARD_"]);
const SESSION_NAMES = new Set(["AI_AGENT"]);

const IS_WINDOWS = process.platform === "win32";

/**
 * @typedef {object} PlanEntry
 * @property {"composer" | "npm"} ecosystem
 * @property {string} dir Absolute directory the script runs in.
 * @property {string} rel `dir` relative to the project directory (`.` for the project itself).
 * @property {string} display The command as people type it, e.g. `npm run check:fast`.
 */

const ECOSYSTEMS = Object.freeze([
  {
    ecosystem: "composer",
    file: "composer.json",
    display: (command) => `composer run-script ${command}`,
    defines: (value) =>
      (typeof value === "string" && value.trim() !== "") ||
      (Array.isArray(value) &&
        value.length > 0 &&
        value.every((step) => typeof step === "string" && step.trim() !== "")),
  },
  {
    ecosystem: "npm",
    file: "package.json",
    display: (command) => `npm run ${command}`,
    defines: (value) => typeof value === "string" && value.trim() !== "",
  },
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The directories the gate runs in: the root of each declared track, in track order, without
 * duplicates. A track's root comes from the manifest's `trackRoots` (a project-relative
 * directory, or a list of them); a track without one, and an entry that is not a directory
 * inside the project, use the project directory. A manifest without valid tracks uses the
 * project directory.
 *
 * @param {import("../lib/manifest.mjs").ManifestInfo} info
 * @param {string} projectRoot
 * @returns {{ dirs: string[], problems: string[] }}
 */
export function trackDirs(info, projectRoot) {
  const roots = info.manifest?.trackRoots;
  const tracks = TRACKS.filter((track) => info.tracks.includes(track));
  const dirs = [];
  const problems = [];
  const add = (dir) => {
    if (!dirs.some((known) => samePath(known, dir))) dirs.push(dir);
  };
  if (tracks.length === 0) add(projectRoot);
  for (const track of tracks) {
    const value = isPlainObject(roots) && Object.hasOwn(roots, track) ? roots[track] : ".";
    const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    if (list.length === 0) problems.push(`trackRoots.${track} is not a directory or a list`);
    for (const entry of list.length === 0 ? ["."] : list) {
      const valid = typeof entry === "string" && entry !== "" && !path.isAbsolute(entry);
      const dir = valid ? path.resolve(projectRoot, entry) : null;
      if (dir === null || !isWithin(dir, projectRoot)) {
        problems.push(`trackRoots.${track} entry ${JSON.stringify(entry)} is outside the project`);
        add(projectRoot);
      } else {
        add(dir);
      }
    }
  }
  return { dirs, problems };
}

/**
 * Whether the composer.json or package.json in `dir` defines the script `command`.
 *
 * @param {string} dir
 * @param {(typeof ECOSYSTEMS)[number]} ecosystem
 * @param {string} command
 * @returns {boolean}
 */
function definesScript(dir, ecosystem, command) {
  const text = readTextCapped(path.join(dir, ecosystem.file), MAX_MANIFEST_BYTES);
  if (text === null) return false;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  const scripts = parsed?.scripts;
  return (
    isPlainObject(scripts) && Object.hasOwn(scripts, command) && ecosystem.defines(scripts[command])
  );
}

/**
 * The scripts the gate runs: in each track directory, the Composer script and then the npm
 * script named `command`, when defined.
 *
 * @param {{ manifest: import("../lib/manifest.mjs").ManifestInfo, projectRoot: string, command: string }} options
 * @returns {{ entries: PlanEntry[], problems: string[] }}
 */
export function gatePlan({ manifest, projectRoot, command }) {
  const { dirs, problems } = trackDirs(manifest, projectRoot);
  /** @type {PlanEntry[]} */
  const entries = [];
  for (const dir of dirs) {
    for (const ecosystem of ECOSYSTEMS) {
      if (!definesScript(dir, ecosystem, command)) continue;
      entries.push({
        ecosystem: ecosystem.ecosystem,
        dir,
        rel: relativePosix(projectRoot, dir),
        display: ecosystem.display(command),
      });
    }
  }
  return { entries, problems };
}

/**
 * The environment of the gate's scripts: the hook's environment without Claude Code's session
 * variables and the Standard's switches, then lib/spawn.mjs's tool environment and
 * {@link STOP_ENV}.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
export function gateEnv(env) {
  const base = {};
  for (const [name, value] of Object.entries(env)) {
    const upper = name.toUpperCase();
    if (SESSION_NAMES.has(upper) || SESSION_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
      continue;
    }
    // npm settings that decide how, or whether, a script runs are not taken from the
    // environment: a planted value could make `check:fast` exit 0 without running anything.
    if (NPM_RUN_OVERRIDES.has(upper)) continue;
    base[name] = value;
  }
  return toolEnv(base, STOP_ENV);
}

/** npm settings, as environment variables, that change how a script is run. */
const NPM_RUN_OVERRIDES = new Set([
  "NPM_CONFIG_SCRIPT_SHELL",
  "NPM_CONFIG_NODE_OPTIONS",
  "NPM_CONFIG_IGNORE_SCRIPTS",
  "NPM_CONFIG_SHELL",
]);

/**
 * The shell npm runs scripts with, pinned on the command line so an `.npmrc` `script-shell`
 * setting cannot replace it: npm's own default on each platform.
 *
 * @param {Record<string, string | undefined>} env
 * @param {NodeJS.Platform} [platform]
 * @returns {string}
 */
export function npmScriptShell(env, platform = process.platform) {
  if (platform !== "win32") return "/bin/sh";
  const comspec = env.ComSpec ?? env.COMSPEC;
  return typeof comspec === "string" && comspec !== "" ? comspec : "cmd.exe";
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeHomedir() {
  try {
    return os.homedir();
  } catch {
    return "";
  }
}

/**
 * Spellings of the home directory to replace in output, longest first (a Windows path in both
 * separator styles).
 *
 * @param {string} [home]
 * @returns {string[]}
 */
export function homeSpellings(home = safeHomedir()) {
  const trimmed = typeof home === "string" ? home.replace(/[\\/]+$/, "") : "";
  // A root directory as home would turn every absolute path into `~`.
  if (trimmed === "" || /^[A-Za-z]:$/.test(trimmed)) return [];
  const spellings = new Set([trimmed]);
  // Only expand Windows absolute paths. A POSIX path supplied by a caller or test on Windows
  // should retain its original spelling rather than gaining a second, unrelated backslash form.
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(trimmed)) {
    spellings.add(trimmed.replace(/\\/g, "/"));
    spellings.add(trimmed.replace(/\//g, "\\"));
  }
  return [...spellings].sort((a, b) => b.length - a.length);
}

/**
 * Replaces the home directory with `~` wherever it starts a path (a longer directory name that
 * merely begins with it is left alone). Case-insensitive on Windows.
 *
 * @param {string} text
 * @param {string[]} [homes] From {@link homeSpellings}.
 * @returns {string}
 */
export function sanitizePaths(text, homes = homeSpellings()) {
  let result = text;
  for (const home of homes) {
    const pattern = new RegExp(`${escapeRegExp(home)}(?![\\w.-])`, IS_WINDOWS ? "gi" : "g");
    result = result.replace(pattern, "~");
  }
  return result;
}

/**
 * The end of a command's output as shown to Claude: colour codes removed, carriage-return
 * progress lines reduced to their final text, each line cut to {@link MAX_LINE_CHARS}, the last
 * `count` lines kept, and the home directory shown as `~`.
 *
 * @param {string} output
 * @param {{ count?: number, homes?: string[] }} [options]
 * @returns {{ text: string, shown: number, total: number }}
 */
export function outputTail(output, { count = TAIL_LINES, homes } = {}) {
  const lines = stripAnsi(output)
    .replace(/\r\n/g, "\n")
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => line.slice(line.lastIndexOf("\r") + 1))
    .map((line) => (line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS - 1)}…` : line));
  const total = lines.length === 1 && lines[0] === "" ? 0 : lines.length;
  const text = total === 0 ? "" : lastLines(lines.join("\n"), count);
  return { text: sanitizePaths(text, homes), shown: Math.min(total, count), total };
}

function where(entry) {
  return entry.rel === "." ? "the project directory" : `${entry.rel}/`;
}

/**
 * The stderr block of one failing command.
 *
 * @param {PlanEntry} entry
 * @param {import("../lib/spawn.mjs").ToolResult} result
 * @param {string[]} [homes]
 * @returns {string}
 */
export function failureBlock(entry, result, homes) {
  const status =
    result.exitCode !== null ? `exit code ${result.exitCode}` : `ended by ${result.signal}`;
  const tail = outputTail(result.output, { homes });
  const heading = `\`${entry.display}\` failed in ${where(entry)} (${status}).`;
  if (tail.total === 0) return `${heading} It printed no output.`;
  const label =
    tail.shown < tail.total
      ? `Last ${tail.shown} of ${tail.total} lines of its output:`
      : "Its output:";
  return `${heading} ${label}\n${tail.text}`;
}

/**
 * Resolves the program of each ecosystem once per run.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {(ecosystem: "npm" | "composer") => import("../lib/resolve-tool.mjs").ResolvedTool | null}
 */
function toolResolver(env) {
  const cache = new Map();
  return (ecosystem) => {
    if (!cache.has(ecosystem)) {
      cache.set(ecosystem, ecosystem === "npm" ? resolveNpmCli({ env }) : resolveComposer({ env }));
    }
    return cache.get(ecosystem);
  };
}

const UNAVAILABLE = Object.freeze({
  npm: "npm's JavaScript entry point (npm-cli.js) was not found next to Node.js",
  composer: "Composer (composer.phar, or a composer PHP script) was not found on PATH",
});

/**
 * The command that runs one planned script.
 *
 * @param {{ ecosystem: "npm" | "composer" }} entry
 * @param {{ command: string, args: string[] }} tool
 * @param {string} command The script name.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ command: string, args: string[] }}
 */
export function commandLine(entry, tool, command, env = {}) {
  const args =
    entry.ecosystem === "npm"
      ? [...tool.args, "--script-shell", npmScriptShell(env), "run", command]
      : // Composer's own script timeout (300 s by default) is turned off: the budget decides.
        [...tool.args, "run-script", "--no-interaction", "--no-ansi", "--timeout=0", command];
  return { command: tool.command, args };
}

/**
 * @typedef {object} Outcome
 * @property {PlanEntry} entry
 * @property {"passed" | "failed" | "timeout" | "not-run" | "skipped"} status
 * @property {string} [reason] Why a script was skipped.
 * @property {import("../lib/spawn.mjs").ToolResult} [result]
 */

/**
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {Promise<import("../lib/io.mjs").HookResult>}
 */
export default async function stop(ctx) {
  const { config, log } = ctx;
  const active = ctx.input?.stop_hook_active === true;
  if (config.stop?.enabled === false) {
    log.debug("Stop: the gate is turned off");
    return {};
  }
  if (ctx.manifest === null) {
    log.debug("Stop: no manifest; nothing to run");
    return {};
  }

  const command = config.stop.command;
  const projectRoot = ctx.projectRoot;
  const plan = gatePlan({ manifest: ctx.manifest, projectRoot, command });
  for (const problem of plan.problems) log.debug(`Stop: ${problem}`);
  if (plan.entries.length === 0) {
    log.debug(`Stop: no ${command} script in the track directories; nothing to run`);
    return {};
  }

  const budget =
    ctx.budget ?? createBudget((config.stop.budgetSeconds ?? DEFAULT_BUDGET_SECONDS) * 1000);
  const resolveTool = toolResolver(ctx.env);
  const extra = {
    command,
    plan: plan.entries.map((entry) => ({
      ecosystem: entry.ecosystem,
      dir: entry.rel,
      available: resolveTool(entry.ecosystem) !== null,
    })),
  };
  const trackRoots = [...new Set(plan.entries.map((entry) => entry.dir))];
  const fingerprintOptions = { root: projectRoot, env: ctx.env, extra, trackRoots };
  const storeOptions = { dataDir: ctx.dataDir, projectRoot };

  const before = await computeFingerprint({
    ...fingerprintOptions,
    timeLimitMs: Math.min(FINGERPRINT_LIMITS.timeMs, budget.remainingMs()),
  });
  log.debug(
    `Stop: fingerprint ${before.fingerprint ?? "incomplete"} (${before.mode}, ${before.files} ` +
      `files, ${before.durationMs} ms${before.reason ? `; ${before.reason}` : ""})`,
  );
  if (before.fingerprint !== null && readGreenFingerprint(storeOptions) === before.fingerprint) {
    log.debug("Stop: nothing changed since the last green run");
    return {};
  }
  if (active) {
    if (
      before.fingerprint !== null &&
      readFailingFingerprint(storeOptions) === before.fingerprint
    ) {
      log.debug("Stop: stop_hook_active is set and nothing changed since the blocked run");
      return {};
    }
    log.debug("Stop: stop_hook_active is set and the state changed; the gate runs again");
  }

  const env = gateEnv(ctx.env);
  /** @type {Outcome[]} */
  const outcomes = [];
  for (const entry of plan.entries) {
    const tool = resolveTool(entry.ecosystem);
    if (tool === null) {
      outcomes.push({ entry, status: "skipped", reason: UNAVAILABLE[entry.ecosystem] });
      continue;
    }
    if (budget.expired()) {
      outcomes.push({ entry, status: "not-run" });
      continue;
    }
    const result = await runTool({
      ...commandLine(entry, tool, command, env),
      cwd: entry.dir,
      env,
      timeoutMs: budget.timeoutFor(),
      killGraceMs: KILL_GRACE_MS,
    });
    log.debug(
      `Stop: ${entry.display} in ${entry.rel}: exit ${result.exitCode}, ` +
        `${result.durationMs} ms${result.timedOut ? ", stopped at the budget" : ""}`,
    );
    if (result.error !== null) {
      const reason =
        result.error.code === "ENOENT"
          ? `${path.basename(tool.command)} was not found on PATH`
          : `it could not start (${result.error.message})`;
      outcomes.push({ entry, status: "skipped", reason, result });
    } else if (result.timedOut) {
      outcomes.push({ entry, status: "timeout", result });
    } else {
      outcomes.push({ entry, status: result.ok ? "passed" : "failed", result });
    }
  }
  return report(outcomes, { ctx, command, budget, fingerprintOptions, storeOptions, before });
}

/**
 * Turns the outcomes into the hook result, and records the state the gate checked: as failing
 * when it blocks, as green when it passed and nothing changed while it ran.
 *
 * @param {Outcome[]} outcomes
 * @param {{ ctx: import("../hook.mjs").HookContext, command: string, budget: import("../lib/budget.mjs").Budget, fingerprintOptions: any, storeOptions: any, before: import("../lib/fingerprint.mjs").Fingerprint }} run
 * @returns {Promise<import("../lib/io.mjs").HookResult>}
 */
async function report(
  outcomes,
  { ctx, command, budget, fingerprintOptions, storeOptions, before },
) {
  const budgetSeconds = Math.round(budget.totalMs / 1000);
  const byStatus = (status) => outcomes.filter((outcome) => outcome.status === status);
  const failed = byStatus("failed");
  const stopped = byStatus("timeout");
  const notRun = byStatus("not-run");
  const skipNotes = byStatus("skipped").map(
    ({ entry, reason }) => `${entry.display} in ${where(entry)} was skipped: ${reason}.`,
  );
  const budgetNotes = [
    ...stopped.map(
      ({ entry }) =>
        `${entry.display} in ${where(entry)} was stopped when the ${budgetSeconds} s budget ` +
        "ran out (hooks.stop.budgetSeconds).",
    ),
    ...notRun.map(
      ({ entry }) => `${entry.display} in ${where(entry)} did not start: the budget had run out.`,
    ),
  ];

  if (failed.length > 0) {
    const homes = homeSpellings();
    const notes = [...budgetNotes, ...skipNotes];
    const stderr = [
      `${NOTICE_PREFIX}the Stop gate (${command}) failed, so this stop was blocked.`,
      ...failed.map(({ entry, result }) => failureBlock(entry, /** @type {any} */ (result), homes)),
      ...(notes.length > 0 ? [notes.join("\n")] : []),
    ].join("\n\n");
    if (before.fingerprint !== null) {
      recordFailingFingerprint({ ...storeOptions, fingerprint: before.fingerprint });
    }
    return { exitCode: 2, stderr: `${stderr}\n` };
  }

  if (stopped.length > 0 || notRun.length > 0) {
    return failOpen(
      `stop gate exceeded its budget; run ${command} manually. ` +
        [...budgetNotes, ...skipNotes].join(" "),
    );
  }

  // Green. The state recorded is the one the gate checked, and only when nothing changed while
  // it ran: a write that landed after the gate read its inputs was never checked.
  const problem = await changeDuringRun(before, fingerprintOptions, budget);
  const file =
    problem === null
      ? recordGreenFingerprint({ ...storeOptions, fingerprint: before.fingerprint })
      : null;
  ctx.log.debug(
    file === null
      ? `Stop: green; nothing recorded (${problem ?? "no state directory outside the project"})`
      : `Stop: green; recorded in ${file}`,
  );
  return skipNotes.length > 0 ? failOpen(skipNotes.join(" ")) : {};
}

/**
 * Why the state the gate checked cannot be recorded as green, or null when it can: the
 * fingerprint taken after the run must equal the one taken before it.
 *
 * @param {import("../lib/fingerprint.mjs").Fingerprint} before
 * @param {any} fingerprintOptions
 * @param {import("../lib/budget.mjs").Budget} budget
 * @returns {Promise<string | null>}
 */
async function changeDuringRun(before, fingerprintOptions, budget) {
  if (before.fingerprint === null) return before.reason ?? "no fingerprint";
  const after = await computeFingerprint({
    ...fingerprintOptions,
    timeLimitMs: Math.min(FINGERPRINT_LIMITS.timeMs, budget.remainingMs() + 2_000),
  });
  if (after.fingerprint === before.fingerprint) return null;
  if (after.fingerprint === null) return `no fingerprint after the run: ${after.reason}`;
  const changed = changedPaths(before.records, after.records);
  const more =
    changed.length > MAX_CHANGED_PATHS_SHOWN
      ? ` and ${changed.length - MAX_CHANGED_PATHS_SHOWN} more`
      : "";
  return (
    "the working state changed while the gate ran: " +
    `${changed.slice(0, MAX_CHANGED_PATHS_SHOWN).join(", ")}${more}`
  );
}
