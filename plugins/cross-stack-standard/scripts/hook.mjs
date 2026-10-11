/**
 * The single entry point of every hook of the Cross-Stack Standard. hooks.json runs it in exec
 * form, with no shell on any platform:
 *
 *   {"type": "command", "command": "node",
 *    "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs", "<Event>"]}
 *
 * This file is a bootstrap: it imports Node.js built-ins only, so nothing can fail before its
 * own guards are in place. One run:
 *
 * 1. Register the crash and signal handlers.
 * 2. `CROSS_STACK_STANDARD_DISABLE` set to a true word: exit 0 with no output, before stdin is
 *    read and before any other module loads.
 * 3. Load the opt-out guard's modules with `import()`, read the hook input from stdin, and run
 *    the opt-out guard (lib/opt-out.mjs). An opted-out project gets exit 0, no stdout, no
 *    stderr, no handler loaded and no child process — also when the input could not be parsed
 *    (the project directory from `CLAUDE_PROJECT_DIR` is checked then) and when a module
 *    needed only after the guard is missing.
 * 4. Unreadable input or an unknown event: fail open (exit 0 with a JSON `systemMessage`).
 * 5. Load the remaining modules, resolve the hooks settings (manifest + environment), arm the
 *    watchdog, load the event's handler from handlers/ and write its result.
 *
 * Fail open, always: an exception, a rejected promise, or a handler that runs past its watchdog
 * ends the run with exit 0 and a `systemMessage` notice, after stopping every tool it started.
 * The one exception is PreToolUse: when the protection cannot run to completion (its modules
 * cannot be loaded, an unexpected error, or the watchdog), the run fails closed with the
 * decision `ask`, so a tool call is never waved through unchecked. Only a handler's deliberate exit 2 reports a problem to Claude. The
 * script never touches the network.
 *
 * Paths: the manifest (and with it the project root, where `.cross-stack/` lives) comes from
 * the project directory and its parents up to the repository root, never from the working
 * directory in the input, which follows the session's `cd` anywhere (see lib/project.mjs).
 *
 * @module plugins/cross-stack-standard/scripts/hook
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);

/** The plugin directory (the parent of scripts/), independent of the environment. */
export const PLUGIN_ROOT = path.resolve(path.dirname(SELF), "..");

/** Handler module of each event, relative to this file. */
export const HANDLERS = Object.freeze({
  SessionStart: "./handlers/session-start.mjs",
  PostToolUse: "./handlers/post-tool-use.mjs",
  Stop: "./handlers/stop.mjs",
  PreToolUse: "./handlers/pre-tool-use.mjs",
  UserPromptSubmit: "./handlers/user-prompt-submit.mjs",
  PostToolUseFailure: "./handlers/post-tool-use-failure.mjs",
});

/** The reason of the `ask` returned when the PreToolUse protection could not be loaded. */
export const PROTECTION_UNAVAILABLE = "protection check could not complete";

// The bootstrap cannot import lib/ before its guards run, so it keeps its own copies of these
// few values; each must match the lib value named beside it.
const DISABLE_ENV = "CROSS_STACK_STANDARD_DISABLE"; // lib/opt-out.mjs OPT_OUT_ENV
const DEBUG_ENV = "CROSS_STACK_STANDARD_DEBUG"; // lib/log.mjs DEBUG_ENV
const TRUE_WORDS = new Set(["1", "true", "yes", "on"]); // lib/manifest.mjs parseSwitch
const NOTICE_PREFIX = "Cross-Stack Standard: "; // lib/io.mjs NOTICE_PREFIX
const MAX_NOTICE_CHARS = 600; // lib/io.mjs MAX_NOTICE_CHARS

/**
 * What every handler receives.
 *
 * @typedef {object} HookContext
 * @property {string} event The event name (a key of {@link HANDLERS}).
 * @property {Record<string, any>} input The parsed hook input.
 * @property {Record<string, string | undefined>} env
 * @property {string} cwd The working directory from the input.
 * @property {string} projectDir `CLAUDE_PROJECT_DIR`, or the working directory.
 * @property {string} projectRoot The directory holding the project's `.cross-stack/` (the
 *   project directory or a parent up to the repository root), else `projectDir`.
 * @property {string | null} repositoryRoot The nearest directory at or above the project
 *   directory that holds `.git`, else null.
 * @property {string[]} searchDirs Directories whose memory files the opt-out guard reads: the
 *   working directory up to the project directory, inside the project only.
 * @property {string} pluginRoot
 * @property {string | null} dataDir `CLAUDE_PLUGIN_DATA`: persistent state across versions.
 * @property {import("./lib/manifest.mjs").ManifestInfo | null} manifest
 * @property {import("./lib/manifest.mjs").HookConfig} config
 * @property {string[]} configProblems Settings that were ignored, and why.
 * @property {import("./lib/budget.mjs").Budget | null} budget Started when the handler is
 *   called; set for events with a configured budget (PostToolUse, Stop).
 * @property {import("./lib/log.mjs").Logger} log
 */

const state = {
  /** @type {boolean | null} null until the opt-out guard has run. */
  optedOut: null,
  /** @type {string | null} */
  event: null,
  finished: false,
  /** @type {any} lib/io.mjs, once loaded. */
  io: null,
  /** @type {any} lib/spawn.mjs, once loaded. */
  spawn: null,
};

function isTrueWord(value) {
  return typeof value === "string" && TRUE_WORDS.has(value.trim().toLowerCase());
}

function notice(message) {
  if (state.io !== null) return state.io.notice(message);
  const text = `${NOTICE_PREFIX}${message}`;
  return text.length <= MAX_NOTICE_CHARS ? text : `${text.slice(0, MAX_NOTICE_CHARS - 1)}…`;
}

function failOpen(message) {
  return { exitCode: 0, json: { systemMessage: notice(message) } };
}

/** One-line description of an error, like lib/log.mjs describeError (which may not load). */
function describe(error) {
  if (error instanceof Error) {
    const code = /** @type {any} */ (error).code;
    const prefix = typeof code === "string" && !error.message.startsWith(code) ? `${code}: ` : "";
    return `${prefix}${error.message}`.split(/\r?\n/)[0];
  }
  return String(error).split(/\r?\n/)[0];
}

function writeAll(fd, text) {
  if (text === "") return;
  if (state.io !== null) {
    state.io.writeAllSync(fd, text);
    return;
  }
  const buffer = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buffer.length) offset += fs.writeSync(fd, buffer, offset);
}

function debugStack(error) {
  if (process.env[DEBUG_ENV] !== "1" || !(error instanceof Error) || !error.stack) return;
  try {
    writeAll(2, `${error.stack}\n`);
  } catch {
    // Debug output is best effort.
  }
}

function stopTools() {
  try {
    state.spawn?.stopAllTools();
  } catch {
    // Nothing more can be stopped.
  }
}

/**
 * Writes a result and exits. Only the first call has an effect.
 *
 * @param {import("./lib/io.mjs").HookResult} result
 */
function finish(result) {
  if (state.finished) return;
  state.finished = true;
  let rendered;
  if (state.io !== null) {
    rendered = state.io.renderResult(result);
  } else {
    // Before lib/io.mjs loads, a result is silent or one line of JSON.
    const json = result?.json ?? null;
    rendered = {
      exitCode: 0,
      stdout: json === null ? "" : `${JSON.stringify(json)}\n`,
      stderr: "",
    };
  }
  try {
    writeAll(1, rendered.stdout);
    writeAll(2, rendered.stderr);
  } catch {
    // A closed stdout or stderr leaves nothing to report to.
  }
  process.exit(rendered.exitCode);
}

/** The event this run serves: the dispatched one, else the command-line argument. */
function currentEvent() {
  if (typeof state.event === "string" && state.event !== "") return state.event;
  const arg = process.argv[2];
  return typeof arg === "string" && arg !== "" ? arg : null;
}

/**
 * The PreToolUse answer when the protection check could not run to completion: `ask`, so the
 * tool call is not waved through unchecked (a failure must never weaken the protection).
 *
 * @param {string} detail What went wrong, for the user and for Claude.
 * @param {string} remedy One sentence on how to recover.
 * @returns {import("./lib/io.mjs").HookResult}
 */
function protectionIncomplete(detail, remedy) {
  const context =
    `Cross-Stack Standard: the PreToolUse hook could not complete its protection check (${detail}), ` +
    `so it asked the user to confirm this tool call. ${remedy}`;
  return {
    exitCode: 0,
    json: {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: notice(`${PROTECTION_UNAVAILABLE} (${detail}). ${remedy}`),
        additionalContext: context.slice(0, 1_000),
      },
    },
  };
}

/**
 * After an unexpected error: `ask` for PreToolUse, a notice (fail open) for every other event;
 * silent for an opted-out project.
 *
 * @param {unknown} error
 */
function crash(error) {
  stopTools();
  if (state.optedOut === true) {
    finish({});
    return;
  }
  debugStack(error);
  const event = currentEvent();
  if (event === "PreToolUse") {
    finish(protectionIncomplete(describe(error), `Set ${DEBUG_ENV}=1 for details.`));
    return;
  }
  const where = event === null ? "hook" : `${event} hook`;
  finish(
    failOpen(
      `the ${where} failed (${describe(error)}) and was skipped. ` +
        `Set ${DEBUG_ENV}=1 for details.`,
    ),
  );
}

/**
 * The result when the plugin's own modules cannot be loaded: silent once opted out; `ask` for
 * PreToolUse (the protection could not run, so the tool call is not waved through); a notice
 * otherwise.
 *
 * @param {string | null | undefined} event
 * @param {unknown} error
 * @returns {import("./lib/io.mjs").HookResult}
 */
function loadFailed(event, error) {
  stopTools();
  if (state.optedOut === true) return {};
  debugStack(error);
  const detail = describe(error);
  if (event === "PreToolUse") {
    return protectionIncomplete(detail, "Reinstalling the plugin restores it.");
  }
  const where = typeof event === "string" && event !== "" ? `${event} hook` : "hook";
  return failOpen(
    `the ${where} failed (${detail}) and was skipped; the plugin's files may be damaged, and ` +
      "reinstalling the plugin restores them.",
  );
}

function armWatchdog(event, ms) {
  setTimeout(() => {
    stopTools();
    if (event === "PreToolUse") {
      finish(
        protectionIncomplete(
          `it ran past its ${Math.ceil(ms / 1000)} s time limit`,
          "Retry the tool call, or split a very large command.",
        ),
      );
      return;
    }
    finish(
      failOpen(
        `the ${event} hook ran past its time limit (${Math.ceil(ms / 1000)} s) and was stopped; ` +
          "its checks were skipped.",
      ),
    );
  }, ms);
}

/**
 * One hook run.
 *
 * @param {string | undefined} argEvent The event from the command line.
 * @returns {Promise<import("./lib/io.mjs").HookResult>}
 */
async function main(argEvent) {
  const env = process.env;

  // Stage 1: what the opt-out guard needs. Nothing that follows the guard runs before it.
  let project;
  let optOut;
  try {
    [state.io, project, optOut] = await Promise.all([
      import("./lib/io.mjs"),
      import("./lib/project.mjs"),
      import("./lib/opt-out.mjs"),
    ]);
  } catch (error) {
    return loadFailed(argEvent, error);
  }

  const io = state.io;
  const parsed = io.parseHookInput(await io.readStdin());
  const input = parsed.ok ? parsed.input : {};
  const paths = project.resolveRunPaths({ input, env, processCwd: process.cwd() });

  const guard = optOut.isOptedOut({
    env,
    searchDirs: paths.searchDirs,
    manifestDirs: paths.manifestDirs,
    memoryRoot: paths.projectReal,
    manifestRoot: paths.manifestScope,
  });
  state.optedOut = guard.optedOut;
  if (guard.optedOut) return {};

  if (!parsed.ok) {
    return failOpen(`the hook input could not be read (${parsed.reason}); this run was skipped.`);
  }
  const event = typeof argEvent === "string" && argEvent !== "" ? argEvent : input.hook_event_name;
  if (typeof event !== "string" || !Object.hasOwn(HANDLERS, event)) {
    return failOpen(
      `unknown hook event ${JSON.stringify(event ?? null)}; the plugin's hooks/hooks.json may be ` +
        "damaged. Reinstalling the plugin restores it.",
    );
  }
  state.event = event;

  // Stage 2: the rest of the runtime and the event's handler.
  let budgetLib;
  let logLib;
  let manifestLib;
  let handler;
  try {
    [budgetLib, logLib, manifestLib, state.spawn] = await Promise.all([
      import("./lib/budget.mjs"),
      import("./lib/log.mjs"),
      import("./lib/manifest.mjs"),
      import("./lib/spawn.mjs"),
    ]);
    handler = (await import(new URL(HANDLERS[event], import.meta.url).href)).default;
    if (typeof handler !== "function") throw new Error(`${HANDLERS[event]} has no default export`);
  } catch (error) {
    return loadFailed(event, error);
  }

  const log = logLib.createLogger(env);
  const manifest = guard.manifest;
  const { config, problems } = await manifestLib.resolveHookConfig({
    manifest: manifest?.manifest ?? null,
    env,
  });
  const limitMs = budgetLib.watchdogMs(event, config);
  armWatchdog(event, limitMs);
  log.debug(
    `${event}: cwd ${paths.cwd}, project ${paths.projectDir}, repository ` +
      `${paths.repositoryRoot ?? "none"}, manifest ${manifest?.path ?? "none"}, ` +
      `watchdog ${limitMs} ms`,
  );
  for (const problem of problems) log.debug(`setting ignored: ${problem}`);

  const seconds = budgetLib.budgetSeconds(event, config);
  /** @type {HookContext} */
  const ctx = {
    event,
    input,
    env,
    cwd: paths.cwd,
    projectDir: paths.projectDir,
    projectRoot: manifest?.dir ?? paths.projectDir,
    repositoryRoot: paths.repositoryRoot,
    searchDirs: paths.searchDirs,
    pluginRoot: PLUGIN_ROOT,
    dataDir:
      typeof env.CLAUDE_PLUGIN_DATA === "string" && env.CLAUDE_PLUGIN_DATA !== ""
        ? env.CLAUDE_PLUGIN_DATA
        : null,
    manifest,
    config,
    configProblems: problems,
    budget: seconds === null ? null : budgetLib.createBudget(seconds * 1000),
    log,
  };
  return handler(ctx);
}

/** True when Node runs this file directly (not when a test imports it). */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  const real = (target) => {
    try {
      return fs.realpathSync(target);
    } catch {
      return path.resolve(target);
    }
  };
  return real(process.argv[1]) === real(SELF);
}

if (isEntryPoint()) {
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      // The platform stopped the hook (a timeout discards output anyway): stop the tools, exit.
      stopTools();
      finish({});
    });
  }
  if (isTrueWord(process.env[DISABLE_ENV])) {
    // The environment switch needs no file and no input: done before stdin is read.
    state.optedOut = true;
    finish({});
  } else {
    main(process.argv[2]).then(finish, crash);
  }
}
