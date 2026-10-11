/**
 * Gate command of the `hook` harness host: runs one Claude Code hook of the plugin the way
 * Claude Code does and turns its answer into the exit-code contract of every gate (0 clean,
 * 1 violation found, 2 the run could not judge anything).
 *
 *   node scripts/lib/fixtures/hook-gate.mjs --plugin <plugin dir> --event <Event> [--tool <Tool>]
 *     < hook-input.json
 *
 * One run:
 *
 * 1. Read the hook input (one JSON object) from stdin. `cwd` defaults to `CLAUDE_PROJECT_DIR`
 *    (the work directory), and `hook_event_name` to the event; a different event is an error.
 * 2. Find the command the plugin's `hooks/hooks.json` routes for the event, and for the input's
 *    `tool_name` (the matcher must cover it, and with `--tool`, the same matcher must cover that
 *    tool too, so the fixture exercises the rule's own route). No route is an error: Claude Code
 *    would not run the hook at all.
 * 3. Run that command (`node` is this Node.js, `${CLAUDE_PLUGIN_ROOT}` the plugin directory),
 *    with no shell, the input on stdin, `CLAUDE_PLUGIN_ROOT` and a temporary `CLAUDE_PLUGIN_DATA`
 *    (removed afterwards), within the hooks.json timeout.
 * 4. Judge the answer ({@link interpretHookRun}) and print a verdict line followed by the hook's
 *    own stdout and stderr.
 *
 * The rule id comes from the hook itself where the hook names it (the PreToolUse
 * `additionalContext` lists the rules its protection serves). Stop and PostToolUse report the
 * failing command or the lint problems, not a rule id; their violation fixtures match the
 * verdict line, which names the event and the tool (`expect.idPattern`).
 *
 * @module scripts/lib/fixtures/hook-gate
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { isEntryPoint } from "../entry.mjs";
import { matcherCovers } from "../gate-presence/hook.mjs";

/** Exit codes of this command. */
export const EXIT = Object.freeze({ CLEAN: 0, VIOLATION: 1, ERROR: 2 });

/** Events whose answer this command can judge. */
export const GATE_EVENTS = Object.freeze(["PreToolUse", "PostToolUse", "Stop"]);

/** PreToolUse decisions that stop a tool call for the user (a finding). */
const BLOCKING_DECISIONS = new Set(["ask", "deny"]);

/** The placeholder hooks.json uses for the plugin directory. */
const PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";

const DEFAULT_TIMEOUT_SECONDS = 60;
const KILL_GRACE_MS = 1_000;

/** Usage or configuration error (exit 2). */
export class HookGateError extends Error {
  constructor(message) {
    super(message);
    this.name = "HookGateError";
  }
}

/**
 * The gate label printed on the verdict line: the event, and the tool when the rule names one
 * (`PreToolUse:Bash`, `Stop`).
 *
 * @param {string} event
 * @param {string | null} tool
 * @returns {string}
 */
export function gateLabel(event, tool) {
  return tool ? `${event}:${tool}` : event;
}

/**
 * The command hooks.json routes for an event and a tool.
 *
 * @param {unknown} config Parsed hooks.json.
 * @param {{ event: string, toolName: string | null, tool: string | null }} route `toolName` is
 *   the input's tool; `tool` the rule's discriminator, which the same matcher must cover.
 * @returns {{ command: string, args: string[], timeoutSeconds: number, matcher: string | null }}
 * @throws {HookGateError} When nothing routes the event and tool to a command hook.
 */
export function routedCommand(config, { event, toolName, tool }) {
  const groups = /** @type {any} */ (config)?.hooks?.[event];
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new HookGateError(`hooks.json has no ${event} hooks`);
  }
  for (const group of groups) {
    const matcher = typeof group?.matcher === "string" ? group.matcher : null;
    if (toolName !== null && !matcherCovers(group?.matcher, toolName)) continue;
    if (tool !== null && !matcherCovers(group?.matcher, tool)) continue;
    const hook = (Array.isArray(group?.hooks) ? group.hooks : []).find(
      (entry) => entry?.type === "command" && typeof entry.command === "string",
    );
    if (!hook) continue;
    const args = Array.isArray(hook.args) ? hook.args.map(String) : [];
    const timeoutSeconds =
      Number.isFinite(hook.timeout) && hook.timeout > 0 ? hook.timeout : DEFAULT_TIMEOUT_SECONDS;
    return { command: hook.command, args, timeoutSeconds, matcher };
  }
  const what = [toolName && `tool ${toolName}`, tool && `the rule's tool ${tool}`]
    .filter(Boolean)
    .join(" and ");
  throw new HookGateError(
    `hooks.json routes no ${event} command hook${what ? ` for ${what}` : ""}; Claude Code would not run it`,
  );
}

/**
 * The hook input with `cwd` and `hook_event_name` filled in.
 *
 * @param {string} text Hook input as read from stdin.
 * @param {{ event: string, projectDir: string }} context
 * @returns {Record<string, any>}
 * @throws {HookGateError} When the input is not a JSON object or names another event.
 */
export function prepareInput(text, { event, projectDir }) {
  let input;
  try {
    input = JSON.parse(text);
  } catch (error) {
    throw new HookGateError(`the hook input on stdin is not JSON: ${error.message}`);
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new HookGateError("the hook input on stdin must be a JSON object");
  }
  if (input.hook_event_name !== undefined && input.hook_event_name !== event) {
    throw new HookGateError(
      `the hook input is for ${JSON.stringify(input.hook_event_name)}, but the gate is ${event}`,
    );
  }
  return { ...input, cwd: input.cwd ?? projectDir, hook_event_name: event };
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Judge one hook run.
 *
 * - PreToolUse: no output and exit 0 is clean; a `permissionDecision` of `ask` or `deny` is a
 *   violation, unless its reason says the protection check could not complete (the hook fails
 *   closed, and a check that did not run proves nothing).
 * - PostToolUse and Stop: exit 0 with no output is clean; exit 2 with feedback on stderr is a
 *   violation. Exit 0 with a `systemMessage` means the hook skipped its check (a tool that is
 *   not installed, a budget that ran out, a crash it failed open on): not a pass.
 * - Anything else is an error.
 *
 * @param {object} run
 * @param {string} run.event
 * @param {number | null} run.exitCode
 * @param {string | null} [run.signal]
 * @param {boolean} [run.timedOut]
 * @param {string} run.stdout
 * @param {string} run.stderr
 * @param {string[]} [run.incompleteMarkers] Texts of a PreToolUse reason that mean the check could
 *   not complete.
 * @returns {{ verdict: "clean" | "violation" | "error", detail: string }}
 */
export function interpretHookRun({
  event,
  exitCode,
  signal = null,
  timedOut = false,
  stdout,
  stderr,
  incompleteMarkers = [],
}) {
  const error = (detail) => ({ verdict: "error", detail });
  if (timedOut) return error("the hook ran past its hooks.json timeout");
  if (signal) return error(`the hook was killed by ${signal}`);
  if (!GATE_EVENTS.includes(event)) return error(`${event} is not an event this gate can judge`);
  const out = stdout.trim();
  const json = out === "" ? null : parseJsonObject(out);

  if (event === "PreToolUse") {
    if (exitCode !== 0) return error(`the hook exited ${exitCode}; PreToolUse answers with exit 0`);
    if (out === "") return { verdict: "clean", detail: "the hook let the tool call through" };
    const specific = json?.hookSpecificOutput;
    const decision = specific?.permissionDecision;
    if (specific?.hookEventName !== "PreToolUse" || !BLOCKING_DECISIONS.has(decision)) {
      return error("the hook printed output that is neither silence nor an ask or deny decision");
    }
    const reason = String(specific.permissionDecisionReason ?? "");
    if (incompleteMarkers.some((marker) => marker !== "" && reason.includes(marker))) {
      return error(`the protection check could not complete (decision ${decision})`);
    }
    return { verdict: "violation", detail: `the hook answered ${decision}` };
  }

  if (exitCode === 2) {
    if (stderr.trim() === "") return error("the hook exited 2 without feedback on stderr");
    return { verdict: "violation", detail: "the hook blocked with exit 2" };
  }
  if (exitCode !== 0) return error(`the hook exited ${exitCode}`);
  if (out === "") return { verdict: "clean", detail: "the hook passed" };
  if (typeof json?.systemMessage === "string") {
    return error(`the hook skipped its check: ${json.systemMessage}`);
  }
  return error("the hook exited 0 with unexpected output");
}

/**
 * The verdict line printed before the hook's output.
 *
 * @param {{ verdict: string, detail: string }} judged
 * @param {string} label From {@link gateLabel}.
 * @returns {string}
 */
export function verdictLine(judged, label) {
  const word = { clean: "passed", violation: "violation", error: "error" }[judged.verdict];
  return `hook ${label} ${word}: ${judged.detail}`;
}

/**
 * Texts of the PreToolUse answer that mean the protection check could not complete, from the
 * plugin's own modules (both guard their command-line code, so importing them runs nothing).
 * Empty when they cannot be loaded (the hook run then decides alone).
 *
 * @param {string} pluginRoot
 * @returns {Promise<string[]>}
 */
export async function loadIncompleteMarkers(pluginRoot) {
  const markers = [];
  const load = async (rel, name) => {
    try {
      const mod = await import(pathToFileURL(path.join(pluginRoot, rel)).href);
      if (typeof mod[name] === "string") markers.push(mod[name]);
    } catch {
      // A missing module is reported by the hook run itself.
    }
  };
  await load("scripts/hook.mjs", "PROTECTION_UNAVAILABLE");
  await load("scripts/handlers/pre-tool-use.mjs", "INCOMPLETE_SENTENCE");
  return markers;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

/**
 * Run a command with no shell, `input` on stdin, within `timeoutMs`.
 *
 * @returns {Promise<{ exitCode: number | null, signal: string | null, timedOut: boolean,
 *   stdout: string, stderr: string }>}
 */
function runHook({ command, args, cwd, env, input, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], shell: false });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.stdin.on("error", () => {
      // A hook that exits before reading its input closes the pipe; its exit code decides.
    });
    child.stdin.end(input);
  });
}

/** Usage text for `--help`. */
export const USAGE = `Usage: node scripts/lib/fixtures/hook-gate.mjs --plugin <dir> --event <Event> [--tool <Tool>] < hook-input.json

Runs one hook of the plugin at <dir> the way Claude Code does (the command hooks/hooks.json routes
for the event and the input's tool_name) with the hook input from stdin, and maps its answer to a
gate exit code. The gate command of the fixture harness's hook host (test/harness/README.md).

Options:
  --plugin <dir>   The plugin directory (holds hooks/hooks.json and scripts/hook.mjs)
  --event <Event>  The hook event: PreToolUse, PostToolUse or Stop (the rule's gate id)
  --tool <Tool>    The rule's gate discriminator; the matcher that routes the input's tool must
                   cover it too
  --help           Show this help

Environment: CLAUDE_PROJECT_DIR names the project (the fixture's work directory).

Exit codes: 0 the hook found nothing, 1 a violation (a PreToolUse ask or deny; a Stop or
PostToolUse exit 2 with feedback), 2 nothing was judged (a usage error, no route, a skipped check,
a crash or a timeout).`;

function parseArgs(argv) {
  const options = { plugin: null, event: null, tool: null };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const key = { "--plugin": "plugin", "--event": "event", "--tool": "tool" }[name];
    if (!key || index + 1 >= argv.length) {
      throw new HookGateError(
        `usage: hook-gate.mjs --plugin <dir> --event <Event> [--tool <Tool>] < input.json (got ${name})`,
      );
    }
    options[key] = argv[index + 1];
    index += 1;
  }
  if (!options.plugin || !options.event) {
    throw new HookGateError("hook-gate.mjs needs --plugin <dir> and --event <Event>");
  }
  return options;
}

/**
 * Run the gate command.
 *
 * @param {string[]} argv Arguments after the script path.
 * @param {{ env?: NodeJS.ProcessEnv, stdin?: () => Promise<string>,
 *   write?: (text: string) => void }} [io]
 * @returns {Promise<number>} Exit code.
 */
export async function main(argv, io = {}) {
  const env = io.env ?? process.env;
  const write = io.write ?? ((text) => process.stdout.write(text));
  let dataDir = null;
  if (argv.includes("--help") || argv.includes("-h")) {
    write(`${USAGE}\n`);
    return EXIT.CLEAN;
  }
  try {
    const options = parseArgs(argv);
    const projectDir = env.CLAUDE_PROJECT_DIR;
    if (!projectDir) throw new HookGateError("CLAUDE_PROJECT_DIR must name the project");
    const pluginRoot = path.resolve(options.plugin);
    const label = gateLabel(options.event, options.tool);

    const input = prepareInput(await (io.stdin ?? readStdin)(), {
      event: options.event,
      projectDir,
    });
    const configFile = path.join(pluginRoot, "hooks", "hooks.json");
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    } catch (error) {
      throw new HookGateError(`cannot read ${configFile}: ${error.message}`);
    }
    const toolName = typeof input.tool_name === "string" ? input.tool_name : null;
    const route = routedCommand(config, { event: options.event, toolName, tool: options.tool });
    if (route.command !== "node") {
      throw new HookGateError(`hooks.json runs "${route.command}", expected node in exec form`);
    }
    const args = route.args.map((arg) => arg.replaceAll(PLUGIN_ROOT_VAR, pluginRoot));

    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "csf-hook-data-"));
    const run = await runHook({
      command: process.execPath,
      args,
      cwd: projectDir,
      env: {
        ...env,
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_PLUGIN_DATA: dataDir,
        // Never the machine's own Claude Code configuration (the companion gates read
        // installed_plugins.json): the fixture's mocked .claude-config/ when it has one, else an
        // empty directory.
        CLAUDE_CONFIG_DIR: fs.existsSync(path.join(projectDir, ".claude-config"))
          ? path.join(projectDir, ".claude-config")
          : path.join(dataDir, "claude-config"),
      },
      input: `${JSON.stringify(input)}\n`,
      timeoutMs: route.timeoutSeconds * 1000,
    });
    const judged = interpretHookRun({
      event: options.event,
      ...run,
      incompleteMarkers:
        options.event === "PreToolUse" ? await loadIncompleteMarkers(pluginRoot) : [],
    });
    const exit = run.exitCode === null ? run.signal : run.exitCode;
    write(`${verdictLine(judged, label)} (hook exit ${exit})\n`);
    if (run.stdout.trim() !== "") write(`--- hook stdout\n${run.stdout.trimEnd()}\n`);
    if (run.stderr.trim() !== "") write(`--- hook stderr\n${run.stderr.trimEnd()}\n`);
    return { clean: EXIT.CLEAN, violation: EXIT.VIOLATION, error: EXIT.ERROR }[judged.verdict];
  } catch (error) {
    const message = error instanceof HookGateError ? error.message : String(error?.stack ?? error);
    write(`hook-gate: ${message}\n`);
    return EXIT.ERROR;
  } finally {
    if (dataDir !== null) fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
  }
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
