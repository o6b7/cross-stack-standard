/**
 * Child-process helpers for the fixture runner: a bounded, time-boxed `runProcess` that kills
 * the whole process tree on timeout or abort, and ends the gate's process group as soon as the
 * gate exits (POSIX), and the environment every gate runs with.
 *
 * Commands are spawned without a shell (`argv[0]` is resolved from PATH). On Windows this means
 * `.cmd`/`.bat` shims cannot be used; hosts run tools as `{node} <entry.js>` or `php <phar>`.
 *
 * @module
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";

/** Environment prefixes removed from every gate environment (session, VCS and opt-out state). */
export const STRIPPED_ENV_PREFIXES = Object.freeze(["GIT_", "CLAUDE_", "CROSS_STACK_STANDARD_"]);

/** Environment names removed from every gate environment (agent detection and forced colour). */
export const STRIPPED_ENV_NAMES = Object.freeze(["CLAUDECODE", "AI_AGENT", "FORCE_COLOR"]);

/** Environment set for every gate: plain output, CI behaviour, agent-output rewriting off. */
export const FIXED_GATE_ENV = Object.freeze({ PAO_DISABLE: "1", NO_COLOR: "1", CI: "1" });

const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const KILL_GRACE_MS = 1500;
const CLOSE_GRACE_MS = 2000;
const IS_WINDOWS = process.platform === "win32";

/**
 * Build the base environment for gates, setup and prepare commands.
 *
 * Removes variables that would make a run depend on the caller (git hook state such as
 * `GIT_DIR`, agent-session variables, the Standard's own opt-out switches, forced colour) and
 * isolates git from the user's and the system's configuration.
 *
 * @param {NodeJS.ProcessEnv} source Environment to start from (usually `process.env`).
 * @param {{ gitConfigGlobal: string, ceiling: string }} git Path of an empty global git config
 *   file, and the directory above which git must not search for a repository.
 * @returns {Record<string, string>} New environment object.
 */
export function buildBaseEnv(source, { gitConfigGlobal, ceiling }) {
  const env = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const upper = name.toUpperCase();
    if (STRIPPED_ENV_NAMES.includes(upper)) continue;
    if (STRIPPED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix))) continue;
    env[name] = value;
  }
  return {
    ...env,
    ...FIXED_GATE_ENV,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: gitConfigGlobal,
    GIT_CEILING_DIRECTORIES: ceiling,
    GIT_TERMINAL_PROMPT: "0",
  };
}

/**
 * Kill a child process and everything it started.
 *
 * On POSIX the child leads its own process group (spawned detached), so the whole group is
 * signalled. On Windows `taskkill /T /F` ends the tree.
 *
 * @param {import("node:child_process").ChildProcess} child Child process.
 * @param {NodeJS.Signals} [signal] POSIX signal.
 */
export function killTree(child, signal = "SIGKILL") {
  if (child.pid === undefined) return;
  if (IS_WINDOWS) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Already gone.
    }
  }
}

/**
 * @typedef {object} ProcessResult
 * @property {number | null} exitCode Exit code, or null when killed or not started.
 * @property {string | null} signal Terminating signal, if any.
 * @property {boolean} timedOut Whether the timeout killed the process.
 * @property {boolean} aborted Whether an abort signal killed the process.
 * @property {string} output Combined stdout and stderr, in arrival order.
 * @property {boolean} truncated Whether output beyond the limit was dropped.
 * @property {number} durationMs Wall-clock duration.
 * @property {string | null} error Start-up error (for example a missing program), or null.
 */

/**
 * Run a command without a shell, capture its combined output and enforce a timeout.
 *
 * @param {object} options Options.
 * @param {string[]} options.argv Program and arguments.
 * @param {string} options.cwd Working directory.
 * @param {Record<string, string>} options.env Environment.
 * @param {number} options.timeoutMs Timeout; the process tree is killed when it expires.
 * @param {string | null} [options.stdinFile] File piped to stdin (stdin is closed otherwise).
 * @param {number} [options.maxOutputBytes] Output bytes kept (default 16 MiB).
 * @param {AbortSignal} [options.signal] Abort signal; aborting kills the process tree.
 * @returns {Promise<ProcessResult>} Result (never rejects).
 */
export function runProcess({
  argv,
  cwd,
  env,
  timeoutMs,
  stdinFile = null,
  maxOutputBytes,
  signal,
}) {
  const limit = maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const started = performance.now();
  return new Promise((resolve) => {
    const parts = [];
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let startError = null;
    let exitInfo = null;
    const timers = [];

    let stdinData = null;
    if (stdinFile) {
      try {
        stdinData = fs.readFileSync(stdinFile);
      } catch (err) {
        resolve({
          exitCode: null,
          signal: null,
          timedOut: false,
          aborted: false,
          output: "",
          truncated: false,
          durationMs: Math.round(performance.now() - started),
          error: `cannot read stdin file ${stdinFile}: ${err.message}`,
        });
        return;
      }
    }

    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env,
        stdio: [stdinData ? "pipe" : "ignore", "pipe", "pipe"],
        detached: !IS_WINDOWS,
        windowsHide: true,
      });
    } catch (err) {
      startError = err;
    }

    const finish = (code, sig) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      const tailOut = decoders.out.end();
      const tailErr = decoders.err.end();
      if (tailOut) parts.push(tailOut);
      if (tailErr) parts.push(tailErr);
      resolve({
        exitCode: startError ? null : (code ?? exitInfo?.code ?? null),
        signal: startError ? null : (sig ?? exitInfo?.signal ?? null),
        timedOut,
        aborted,
        output: parts.join(""),
        truncated,
        durationMs: Math.round(performance.now() - started),
        error: startError ? `cannot start ${argv[0]}: ${startError.message}` : null,
      });
    };

    const decoders = { out: new StringDecoder("utf8"), err: new StringDecoder("utf8") };
    const onAbort = () => {
      aborted = true;
      terminate();
    };

    if (startError) {
      finish(null, null);
      return;
    }

    const collect = (decoder) => (chunk) => {
      if (bytes >= limit) {
        truncated = true;
        return;
      }
      const room = limit - bytes;
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
      if (slice.length < chunk.length) truncated = true;
      bytes += slice.length;
      parts.push(decoder.write(slice));
    };
    child.stdout.on("data", collect(decoders.out));
    child.stderr.on("data", collect(decoders.err));

    const terminate = () => {
      killTree(child, "SIGTERM");
      timers.push(setTimeout(() => killTree(child, "SIGKILL"), KILL_GRACE_MS));
      timers.push(
        setTimeout(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          finish(null, null);
        }, KILL_GRACE_MS + CLOSE_GRACE_MS),
      );
    };

    child.on("error", (err) => {
      if (child.pid === undefined) {
        startError = err;
        finish(null, null);
      }
    });
    child.on("exit", (code, sig) => {
      exitInfo = { code, signal: sig };
      // The gate's verdict is final once it exits. Anything it started in its process group
      // (a background writer with stdio ignored, a stray watcher) is ended now, so it cannot
      // keep writing into the work directory after the runner removes it.
      if (!IS_WINDOWS) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // The group is already gone.
        }
      }
      // Something in the tree still holds the output pipes: end it after a grace period.
      timers.push(
        setTimeout(() => {
          killTree(child, "SIGKILL");
          child.stdout.destroy();
          child.stderr.destroy();
          finish(code, sig);
        }, CLOSE_GRACE_MS),
      );
    });
    child.on("close", (code, sig) => finish(code, sig));

    if (stdinData) {
      child.stdin.on("error", () => {});
      child.stdin.end(stdinData);
    }

    timers.push(
      setTimeout(() => {
        timedOut = true;
        terminate();
      }, timeoutMs),
    );
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Keep the last `maxLines` lines of a text.
 *
 * @param {string} text Text.
 * @param {number} maxLines Line count.
 * @returns {string[]} Last lines, without trailing empty lines.
 */
export function tailLines(text, maxLines) {
  const trimmed = text.replace(/\s+$/, "");
  if (trimmed === "") return [];
  return trimmed.split(/\r?\n/).slice(-maxLines);
}
