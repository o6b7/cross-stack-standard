/**
 * Runs the real hook entry point the way Claude Code does: `node <plugin>/scripts/hook.mjs
 * <Event>` with no shell, one JSON object on stdin, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`
 * and `CLAUDE_PLUGIN_DATA` in the environment. It captures the exit code, stdout and stderr.
 *
 * The environment starts from the test process's own, minus every Claude Code session variable
 * and every `CROSS_STACK_STANDARD_*` switch, so a developer's shell cannot change a result.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { FIXTURES_DIR, PLUGIN_DIR } from "./project.mjs";

/** The entry point in the repository's plugin directory. */
export const ENTRY = path.join(PLUGIN_DIR, "scripts", "hook.mjs");

/** The preload that records handler loads and child processes (see spy-preload.mjs). */
const SPY_PRELOAD_FILE = new URL("./spy-preload.mjs", import.meta.url);

const DROPPED_PREFIXES = ["CLAUDE", "CROSS_STACK_STANDARD_"];
const DROPPED_NAMES = new Set([
  "AI_AGENT",
  "FORCE_COLOR",
  "NO_COLOR",
  "NODE_OPTIONS",
  "NODE_TEST_CONTEXT",
  "HOOK_TEST_SPY_LOG",
]);

/**
 * The test process's environment without session and Standard variables, with `extra` applied
 * (`undefined` removes a variable).
 *
 * @param {Record<string, string | undefined>} [extra]
 * @returns {Record<string, string>}
 */
export function cleanEnv(extra = {}) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    const upper = name.toUpperCase();
    if (DROPPED_NAMES.has(upper) || DROPPED_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
      continue;
    }
    env[name] = value;
  }
  for (const [name, value] of Object.entries(extra)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  return env;
}

/**
 * Loads a stdin fixture (`fixtures/stdin/<name>.json`) and replaces `{{name}}` placeholders in
 * its string values: `{{cwd}}`, `{{projectDir}}` and `{{transcriptPath}}` by default.
 *
 * @param {string} name For example `session-start/startup`.
 * @param {Record<string, string>} vars
 * @returns {Record<string, any>}
 */
export function stdinFixture(name, vars) {
  const file = path.join(FIXTURES_DIR, "stdin", `${name}.json`);
  const substitute = (value) => {
    if (typeof value === "string") {
      return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (!Object.hasOwn(vars, key)) throw new Error(`${name}: no value for ${match}`);
        return vars[key];
      });
    }
    if (Array.isArray(value)) return value.map(substitute);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v)]));
    }
    return value;
  };
  return substitute(JSON.parse(fs.readFileSync(file, "utf8")));
}

/**
 * The raw text of a stdin fixture that is deliberately not valid input
 * (`fixtures/stdin/invalid/<name>.txt`).
 *
 * @param {string} name
 * @returns {string}
 */
export function invalidStdinFixture(name) {
  return fs.readFileSync(path.join(FIXTURES_DIR, "stdin", "invalid", `${name}.txt`), "utf8");
}

/** Stdin fixtures of each event, by fixture name. */
export const EVENT_FIXTURES = Object.freeze({
  SessionStart: [
    "session-start/startup",
    "session-start/resume",
    "session-start/clear",
    "session-start/compact",
    "session-start/fork",
  ],
  PreToolUse: [
    "pre-tool-use/edit",
    "pre-tool-use/write",
    "pre-tool-use/notebook-edit",
    "pre-tool-use/bash",
    "pre-tool-use/powershell",
  ],
  PostToolUse: ["post-tool-use/edit", "post-tool-use/write", "post-tool-use/notebook-edit"],
  Stop: ["stop/stop", "stop/stop-active"],
  UserPromptSubmit: ["user-prompt-submit/default"],
  PostToolUseFailure: ["post-tool-use-failure/bash"],
});

/**
 * Placeholder values for a stdin fixture run in `projectDir`.
 *
 * @param {string} projectDir
 * @param {string} [cwd]
 * @returns {Record<string, string>}
 */
export function fixtureVars(projectDir, cwd = projectDir) {
  return {
    cwd,
    projectDir,
    transcriptPath: path.join(projectDir, ".transcript.jsonl"),
  };
}

/**
 * @typedef {object} HookRun
 * @property {number | null} exitCode
 * @property {string | null} signal
 * @property {string} stdout
 * @property {string} stderr
 * @property {any} json Parsed stdout when it is one JSON object, else undefined.
 * @property {string[]} spy Lines the spy recorded (with `spy: true`).
 * @property {number} durationMs
 */

/**
 * Runs the entry point once.
 *
 * @param {object} options
 * @param {string} [options.event] Command-line event; omitted when undefined.
 * @param {string | object} [options.stdin] An object is sent as JSON; a string as-is; undefined
 *   closes stdin at once.
 * @param {string} options.projectDir `CLAUDE_PROJECT_DIR` (and the process's cwd by default).
 * @param {string} [options.cwd] The process's working directory.
 * @param {Record<string, string | undefined>} [options.env] Extra variables.
 * @param {string} [options.entry] Another entry point (a plugin copy).
 * @param {string} [options.dataDir] `CLAUDE_PLUGIN_DATA`.
 * @param {boolean} [options.spy] Preload the spy and return what it recorded.
 * @param {string} [options.spyLog] Where the spy writes (required with `spy`).
 * @param {number} [options.timeoutMs]
 * @returns {Promise<HookRun>}
 */
export function runHook({
  event,
  stdin,
  projectDir,
  cwd = projectDir,
  env = {},
  entry = ENTRY,
  dataDir,
  spy = false,
  spyLog,
  timeoutMs = 30_000,
}) {
  const pluginRoot = path.dirname(path.dirname(entry));
  const childEnv = cleanEnv({
    // Never the developer's own Claude Code configuration: companion status reads it.
    CLAUDE_CONFIG_DIR: path.join(os.tmpdir(), "cross-stack-hooks-no-claude-config"),
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_PLUGIN_DATA: dataDir,
    ...(spy ? { HOOK_TEST_SPY_LOG: spyLog } : {}),
    ...env,
  });
  const nodeArgs = spy ? ["--import", SPY_PRELOAD_FILE.href] : [];
  const args = [...nodeArgs, entry, ...(event === undefined ? [] : [event])];
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`hook run exceeded ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      let json;
      if (stdout.trim().startsWith("{")) {
        try {
          json = JSON.parse(stdout);
        } catch {
          json = undefined;
        }
      }
      let spyLines = [];
      if (spy && fs.existsSync(spyLog)) {
        spyLines = fs.readFileSync(spyLog, "utf8").split("\n").filter(Boolean);
      }
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        json,
        spy: spyLines,
        durationMs: Math.round(performance.now() - started),
      });
    });
    child.stdin.on("error", () => {
      // The hook may exit before reading all input (for example a crash); that is its result.
    });
    if (stdin === undefined) child.stdin.end();
    else child.stdin.end(typeof stdin === "string" ? stdin : JSON.stringify(stdin));
  });
}

/**
 * The file URL of a path (for `import()` in generated handler sources).
 *
 * @param {string} file
 * @returns {string}
 */
export function fileUrl(file) {
  return pathToFileURL(file).href;
}

/**
 * Polls until a process no longer exists.
 *
 * @param {number} pid
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
export async function processGone(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
