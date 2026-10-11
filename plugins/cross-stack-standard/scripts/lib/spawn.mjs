/**
 * Runs project tools for the hooks: no shell, a time box with a kill on overrun, captured
 * output, and an environment that keeps tools quiet and offline.
 *
 * The hook's own stdout is reserved for the JSON Claude Code reads, so a tool's stdout is never
 * passed through: both streams are captured, and a handler that reports tool output writes it
 * to the hook's stderr (which Claude sees when the hook exits 2).
 *
 * A run ends when the tool's own process ends. Something the tool started can keep its stdout
 * and stderr open (`cmd &` in a script, a daemon, a helper started with inherited stdio); the
 * run then settles with the tool's exit code after a short grace period
 * ({@link DEFAULT_EXIT_GRACE_MS}) instead of waiting for those pipes until the time box ends.
 *
 * Process trees on POSIX: each tool leads its own process group, and the whole group is
 * signalled: on overrun (SIGTERM, then SIGKILL after a grace period), after every run (SIGKILL
 * to whatever is left, so nothing the tool started outlives the run), and from
 * {@link stopAllTools}, which the entry point calls from its watchdog, a crash, a signal and the
 * process `exit`. When the hook itself is killed from outside (SIGKILL, or a signal to its own
 * process group), no handler runs; for that case a small detached reaper process holds a pipe
 * from the hook and, when the pipe closes, ends the process groups of the tools still running.
 * The reaper starts once per hook run, when a tool has run for {@link REAPER_DELAY_MS}; a quick
 * run (a formatter, a `git status`) does not pay for a second Node.js start.
 *
 * Process trees on Windows: `taskkill /T /F` ends the tree, synchronously and time-bounded in
 * {@link stopAllTools}, so the hook does not exit before the tree is gone. Two limits remain,
 * because Windows has no process groups and `taskkill /T` finds a tree through its root, the
 * tool's own process:
 * - processes a tool leaves behind after its own process ended cannot be reached;
 * - when Claude Code ends the hook with TerminateProcess (its timeout or an interrupt), no code
 *   runs in the hook; libuv's kill-on-close job object ends the tool's own process, and the
 *   processes the tool started outside Node.js (for example `cmd.exe` under npm) leave that job
 *   and keep running. A reaper cannot help: the root is gone before it could act, and running
 *   the tool outside the job (`detached`) would give console programs it starts their own
 *   window. So there is no reaper on Windows.
 *
 * @module plugins/cross-stack-standard/scripts/lib/spawn
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { isRefusedCommand } from "./resolve-tool.mjs";

/**
 * Variables set for every tool, each recorded with its source in
 * docs/maintainers/verified-versions.md:
 *
 * - `PAO_DISABLE=1`: laravel/pao stops rewriting Pest, PHPUnit and PHPStan output into agent
 *   JSON (it detects Claude Code), so output and rule ids stay readable.
 * - `DO_NOT_TRACK=1`: the cross-tool telemetry opt-out, honoured by the impeccable tools.
 * - `JSCPD_NO_TIPS=1`: jscpd prints no tips or promotional messages.
 * - `npm_config_update_notifier=false`: npm does not check the registry for a newer npm (npm
 *   reads `npm_config_*` variables as its settings).
 * - `COREPACK_ENABLE_NETWORK=0`: a package manager managed by Corepack (pnpm or yarn named in
 *   `packageManager`) is never downloaded; one that is not in Corepack's cache fails with
 *   Corepack's own message instead.
 * - `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`: Corepack never stops to ask before a download.
 * - `NEXT_TELEMETRY_DISABLED=1`: the Next.js CLI sends no telemetry.
 *
 * `NO_COLOR=1` (with `FORCE_COLOR` removed) asks for plain text, the same gate environment the
 * fixture harness uses (test/harness/README.md); output is also stripped of escape sequences
 * before it is shown ({@link stripAnsi}).
 */
export const TOOL_ENV = Object.freeze({
  PAO_DISABLE: "1",
  DO_NOT_TRACK: "1",
  JSCPD_NO_TIPS: "1",
  NO_COLOR: "1",
  npm_config_update_notifier: "false",
  COREPACK_ENABLE_NETWORK: "0",
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  NEXT_TELEMETRY_DISABLED: "1",
});

/** Variables removed from every tool's environment (matched case-insensitively). */
export const TOOL_ENV_REMOVED = Object.freeze(["FORCE_COLOR"]);

/** Default time box of one tool run. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Time between the polite termination and the forced kill of a timed-out tool. */
export const DEFAULT_KILL_GRACE_MS = 2_000;

/**
 * How long a run waits for the tool's output pipes to close after the tool's own process ended,
 * before it settles anyway (something the tool started still holds them).
 */
export const DEFAULT_EXIT_GRACE_MS = 750;

/** Most bytes kept of each captured stream; older output is dropped first. */
export const DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

/** How long a tool runs before the reaper is started (POSIX only). */
export const REAPER_DELAY_MS = 1_000;

/** Longest wait for one synchronous `taskkill` (Windows). */
export const TASKKILL_TIMEOUT_MS = 3_000;

const IS_WINDOWS = process.platform === "win32";

/**
 * The reaper: reads `+<pid>` and `-<pid>` lines (a tool's process group started, and ended);
 * at the end of its input (the hook exited or was killed) it sends SIGTERM to every group still
 * listed, then SIGKILL a second later. Plain CommonJS for `node -e`. Pids of 0 and 1 are
 * ignored: `kill(-1)` would signal every process of the user.
 */
const REAPER_SOURCE = `"use strict";
const groups = new Set();
let pending = "";
const signal = (name) => {
  for (const pid of groups) {
    try { process.kill(-pid, name); } catch { /* the group is gone */ }
  }
};
const reap = () => {
  if (groups.size === 0) process.exit(0);
  signal("SIGTERM");
  setTimeout(() => { signal("SIGKILL"); process.exit(0); }, 1000);
};
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const lines = (pending + chunk).split("\\n");
  pending = lines.pop();
  for (const line of lines) {
    const pid = Number(line.slice(1));
    if (!Number.isSafeInteger(pid) || pid <= 1) continue;
    if (line[0] === "+") groups.add(pid);
    else if (line[0] === "-") groups.delete(pid);
  }
});
process.stdin.on("end", reap);
process.stdin.on("error", reap);
`;

/** @type {Set<import("node:child_process").ChildProcess>} */
const liveTools = new Set();

/**
 * The reaper process: null before it is needed, false when it could not start.
 *
 * @type {import("node:child_process").ChildProcess | null | false}
 */
let reaper = null;

/**
 * Names that are one variable: on Windows every name is case-insensitive; npm reads
 * `npm_config_*` in any case on every platform.
 */
function sameVariable(a, b) {
  if (IS_WINDOWS || /^npm_config_/i.test(b)) return a.toUpperCase() === b.toUpperCase();
  return a === b;
}

/**
 * The environment for a tool: `base` with {@link TOOL_ENV} set, {@link TOOL_ENV_REMOVED}
 * removed, then `extra` applied (`undefined` removes a variable).
 *
 * @param {Record<string, string | undefined>} [base]
 * @param {Record<string, string | undefined>} [extra]
 * @returns {Record<string, string>}
 */
export function toolEnv(base = process.env, extra = {}) {
  const removed = new Set(TOOL_ENV_REMOVED.map((name) => name.toUpperCase()));
  const env = {};
  for (const [name, value] of Object.entries(base)) {
    if (value !== undefined && !removed.has(name.toUpperCase())) env[name] = value;
  }
  const assign = (name, value) => {
    for (const existing of Object.keys(env)) {
      if (sameVariable(existing, name)) delete env[existing];
    }
    if (value !== undefined) env[name] = value;
  };
  for (const [name, value] of Object.entries(TOOL_ENV)) assign(name, value);
  for (const [name, value] of Object.entries(extra)) assign(name, value);
  return env;
}

/**
 * Removes ANSI escape sequences.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex -- ESC and CSI are exactly what is stripped.
  return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "");
}

/**
 * The last `count` lines of a text (a trailing newline does not count as a line).
 *
 * @param {string} text
 * @param {number} count
 * @returns {string}
 */
export function lastLines(text, count) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  return lines.slice(-count).join("\n");
}

/** Keeps the newest bytes of a stream within a cap. */
class TailBuffer {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.chunks = [];
    this.size = 0;
    this.dropped = false;
  }

  push(chunk) {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.maxBytes && this.chunks.length > 1) {
      this.size -= this.chunks.shift().length;
      this.dropped = true;
    }
    if (this.size > this.maxBytes) {
      const only = this.chunks[0];
      this.chunks[0] = only.subarray(only.length - this.maxBytes);
      this.size = this.maxBytes;
      this.dropped = true;
    }
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function taskkillPath() {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  return path.join(systemRoot, "System32", "taskkill.exe");
}

function isRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

/**
 * Signals a tool's process group (POSIX) or ends its process tree (Windows; `sync` waits for
 * `taskkill`, at most {@link TASKKILL_TIMEOUT_MS}).
 */
function killTree(child, signal, { sync = false } = {}) {
  const { pid } = child;
  if (pid === undefined) return;
  if (!IS_WINDOWS) {
    try {
      process.kill(-pid, signal);
    } catch {
      // ESRCH: nothing is left of the group.
    }
    return;
  }
  const args = ["/pid", String(pid), "/T", "/F"];
  const options = { stdio: "ignore", windowsHide: true, shell: false };
  const fallback = () => {
    try {
      child.kill();
    } catch {
      // The process has already exited.
    }
  };
  try {
    if (sync) {
      const result = spawnSync(taskkillPath(), args, { ...options, timeout: TASKKILL_TIMEOUT_MS });
      if (result.error) fallback();
    } else {
      const taskkill = spawn(taskkillPath(), args, options);
      taskkill.on("error", fallback);
      taskkill.unref();
    }
  } catch {
    fallback();
  }
}

/** Tells the reaper that a tool's process group started (`+`) or ended (`-`). */
function tellReaper(sign, pid) {
  if (!reaper || pid === undefined) return;
  try {
    reaper.stdin.write(`${sign}${pid}\n`);
  } catch {
    reaper = false;
  }
}

/** Starts the reaper (once per process, POSIX only) and lists the tools already running. */
function startReaper() {
  if (IS_WINDOWS || reaper !== null) return;
  reaper = false;
  let child;
  try {
    child = spawn(process.execPath, ["-e", REAPER_SOURCE], {
      cwd: path.parse(process.execPath).root,
      // Nothing from the hook's environment (NODE_OPTIONS included) reaches the reaper.
      env: {},
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      windowsHide: true,
      shell: false,
    });
  } catch {
    return;
  }
  const lost = () => {
    if (reaper === child) reaper = false;
  };
  child.on("error", lost);
  child.stdin.on("error", lost);
  // Neither the reaper nor its pipe keeps the hook running.
  child.unref();
  child.stdin.unref();
  reaper = child;
  for (const tool of liveTools) tellReaper("+", tool.pid);
}

/**
 * The reaper's pid, or null when none runs (not needed yet, not started, or Windows). For the
 * debug log and the tests.
 *
 * @returns {number | null}
 */
export function reaperPid() {
  return reaper ? (reaper.pid ?? null) : null;
}

/**
 * Stops every tool that is still running, with the processes it started (process groups on
 * POSIX, process trees on Windows). Synchronous on both, so it is safe in an `exit` handler and
 * right before `process.exit()`.
 */
export function stopAllTools() {
  for (const child of liveTools) killTree(child, "SIGKILL", { sync: true });
  liveTools.clear();
}

process.on("exit", stopAllTools);

/**
 * @typedef {object} ToolResult
 * @property {boolean} ok Exit code 0, not timed out, started.
 * @property {number | null} exitCode
 * @property {string | null} signal
 * @property {boolean} timedOut
 * @property {{ code: string, message: string } | null} error Why the tool did not start
 *   (`ENOENT` when the program is missing; `EREFUSED` for a shim or `npx`).
 * @property {string} stdout
 * @property {string} stderr
 * @property {string} output Both streams interleaved in arrival order.
 * @property {boolean} truncated Older output was dropped to stay within the cap.
 * @property {number} durationMs
 */

/**
 * Runs one tool. Never throws: a missing program, a refused command or a timeout is reported in
 * the result. Stdin is closed, so a tool that would wait for input or start a watch mode runs
 * once and ends. When the run settles, whatever the tool started and left running is ended
 * (POSIX; see the module notes for Windows).
 *
 * @param {{ command: string, args?: string[], cwd: string, env?: Record<string, string | undefined>, timeoutMs?: number, killGraceMs?: number, exitGraceMs?: number, maxBufferBytes?: number }} options
 *   `env` replaces the default {@link toolEnv}() entirely when given.
 * @returns {Promise<ToolResult>}
 */
export function runTool({
  command,
  args = [],
  cwd,
  env = toolEnv(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  killGraceMs = DEFAULT_KILL_GRACE_MS,
  exitGraceMs = DEFAULT_EXIT_GRACE_MS,
  maxBufferBytes = DEFAULT_MAX_BUFFER_BYTES,
}) {
  const started = performance.now();
  const stdout = new TailBuffer(maxBufferBytes);
  const stderr = new TailBuffer(maxBufferBytes);
  const output = new TailBuffer(maxBufferBytes);
  const finish = (fields) => ({
    ok: false,
    exitCode: null,
    signal: null,
    timedOut: false,
    error: null,
    stdout: stdout.text(),
    stderr: stderr.text(),
    output: output.text(),
    truncated: stdout.dropped || stderr.dropped || output.dropped,
    durationMs: Math.round(performance.now() - started),
    ...fields,
  });

  if (isRefusedCommand(command)) {
    return Promise.resolve(
      finish({
        error: {
          code: "EREFUSED",
          message: `${path.basename(command)} is not run by the hooks (shell shims and npx are refused)`,
        },
      }),
    );
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        detached: !IS_WINDOWS,
      });
    } catch (error) {
      resolve(
        finish({ error: { code: error?.code ?? "ESPAWN", message: String(error?.message) } }),
      );
      return;
    }
    liveTools.add(child);
    let settled = false;
    let timedOut = false;
    let exit = null;
    const timers = new Set();
    const after = (ms, callback) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        callback();
      }, ms);
      timers.add(timer);
      return timer;
    };
    const closePipes = () => {
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const settle = (fields) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      liveTools.delete(child);
      // Whatever the tool started and left running goes with it. On Windows only a tree whose
      // root still runs can be reached (a run that settles on a timeout or a start error).
      if (!IS_WINDOWS || isRunning(child)) killTree(child, "SIGKILL");
      tellReaper("-", child.pid);
      resolve(finish({ timedOut, ...fields }));
    };

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
      output.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
      output.push(chunk);
    });
    child.on("error", (error) => {
      settle({ error: { code: error?.code ?? "ESPAWN", message: String(error?.message) } });
    });
    child.on("exit", (code, signal) => {
      exit = { exitCode: code, signal };
      if (!timedOut) {
        // The tool ended inside its time box, so the box no longer applies. Something it
        // started may still hold the output pipes: wait for them only briefly.
        clearTimeout(box);
        timers.delete(box);
        after(exitGraceMs, () => {
          closePipes();
          settle({ ...exit, ok: exit.exitCode === 0 });
        });
        return;
      }
      // A grandchild can keep the pipes open after the tool itself was killed; do not wait
      // for them longer than the grace period.
      after(killGraceMs, () => {
        closePipes();
        settle({ ...exit, ok: false });
      });
    });
    child.on("close", (code, signal) => {
      const final = exit ?? { exitCode: code, signal };
      settle({ ...final, ok: !timedOut && final.exitCode === 0 });
    });

    const box = after(timeoutMs, () => {
      timedOut = true;
      killTree(child, "SIGTERM");
      after(killGraceMs, () => {
        killTree(child, "SIGKILL");
        after(killGraceMs, () => {
          closePipes();
          settle({ ...(exit ?? { exitCode: null, signal: "SIGKILL" }), ok: false });
        });
      });
    });

    if (!IS_WINDOWS && child.pid !== undefined) {
      if (reaper === null) after(REAPER_DELAY_MS, startReaper);
      else tellReaper("+", child.pid);
    }
  });
}
