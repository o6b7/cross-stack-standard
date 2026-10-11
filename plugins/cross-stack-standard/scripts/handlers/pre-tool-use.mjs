/**
 * PreToolUse (matchers `Edit|Write|NotebookEdit` and `Bash|PowerShell`): gate-file protection.
 *
 * - File tools: the edited path (normalised, relative to the project, compared case-insensitively
 *   on Windows and macOS) is checked against the protected globs of `data/protected-paths.json`
 *   and the project's `hooks.preToolUse.protect`. `package.json` and `composer.json` count only
 *   when the edit changes their protected keys. An edit that adds the opt-out line to a
 *   `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` file, or sets `"disabled": true` under
 *   `.cross-stack/`, counts too.
 * - Shell tools: the command is checked against the built-in patterns (skipping git hooks,
 *   turning lefthook or audits off, deleting or regenerating baselines, writing protected files,
 *   appending the opt-out line, …) and the project's `hooks.preToolUse.protectCommands`. The
 *   sanctioned `<tool>:baseline:update` scripts are not inspected.
 *
 * A match returns Claude Code's PreToolUse decision `ask` (or `deny` when the project sets
 * `hooks.preToolUse.decision` to `"deny"`) with a reason for the user and `additionalContext`
 * for Claude, because the reason of an `ask` reaches the user only. Anything else exits 0 with
 * no output, which leaves the normal permission flow in charge.
 *
 * The check fails closed: when it cannot complete (the protection data is missing, the command
 * is longer than the inspector reads, a bound such as the time budget is hit, or an unexpected
 * error occurs) the result is `ask` with the reason, never a silent pass. `deny` is only ever the
 * answer to a finding the project chose to deny.
 *
 * Companion plugins (ADR 0106, lib/companions.mjs), matcher
 * `mcp__plugin_chrome-devtools-mcp_chrome-devtools__.*|mcp__plugin_figma_figma__.*` and the shell
 * and `Skill` matchers, failing closed: a call to a companion without an explicit `true` in the
 * project's consent record is denied with its fallback; a copy not at the pin or a
 * duplicate asks; the browser companion asks on every action unless the page it opens, or the
 * session's current page, is an explicit URL on a local or project host, and always before a
 * page script or an upload; the Figma companion asks before any tool that can change a file;
 * and a shell command that installs or enables a companion without that consent is denied, one that installs it from
 * another marketplace asks. Every companion decision is written to the companion log.
 *
 * `ask` does not hold in the `bypassPermissions` mode, and a command form the checks do not
 * recognise passes, so the protection is labelled GUARDED; the permission rules that `adopt`
 * writes and CODEOWNERS are the other layers.
 *
 * @module plugins/cross-stack-standard/scripts/handlers/pre-tool-use
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendLog,
  gateSkillCall,
  gateToolCall,
  inspectCompanionCommand,
  loadStatus,
  readCurrentPage,
} from "../lib/companions.mjs";
import { isWithin } from "../lib/project.mjs";
import {
  caseInsensitivePaths,
  compileProtection,
  inspectCommand,
  inspectFileEdit,
  loadProtectionList,
  ProtectionIncomplete,
} from "../lib/protect.mjs";

/** Tool names handled as file edits. */
export const FILE_TOOLS = Object.freeze(new Set(["Edit", "Write", "NotebookEdit"]));

/** Tool names handled as shell commands, with the grammar of each. */
export const SHELL_TOOLS = Object.freeze({ Bash: "bash", PowerShell: "powershell" });

/** Decisions a project may choose; the first is the default. */
export const DECISIONS = Object.freeze(["ask", "deny"]);

/** The user-facing sentence for an edit to a quality gate. */
export const GATE_SENTENCE =
  "This edits a quality gate; weakening gates to make a build pass is not allowed; confirm only if you intend to change the Standard's configuration.";

/** The user-facing sentence for a command that bypasses or weakens a gate. */
export const COMMAND_SENTENCE =
  "This command bypasses or weakens a quality gate; weakening gates to make a build pass is not allowed; confirm only if you intend to change the Standard's configuration.";

/** The user-facing sentence for a change that turns the Standard off. */
export const OPT_OUT_SENTENCE =
  "This turns the Standard's hooks off for the project; confirm only if you intend to opt the project out of the Standard.";

/** The user-facing sentence when the check could not complete. */
export const INCOMPLETE_SENTENCE =
  "The check could not complete, so this tool call needs confirmation; confirm only if it does not weaken a quality gate or turn the Standard off.";

/** Longest reason, in characters. */
export const MAX_REASON_CHARS = 1_000;

/** Longest additional context, in characters (Claude Code moves text over 10,000 to a file). */
export const MAX_CONTEXT_CHARS = 2_000;

/** Findings described in full before the rest are counted. */
const FINDINGS_LISTED = 3;

const PREFIX = "Cross-Stack Standard: ";

let rulesCache = null;

/**
 * Ids of the registry rules whose gate is this hook for a tool kind (`Edit` or `Bash`), from the
 * plugin's generated rule data. Empty when the data cannot be read.
 *
 * @param {string} pluginRoot
 * @param {"Edit" | "Bash"} discriminator
 * @returns {string[]}
 */
export function gateRuleIds(pluginRoot, discriminator) {
  if (rulesCache === null) {
    try {
      const file = path.join(pluginRoot, "data", "rules.json");
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      rulesCache = Array.isArray(data?.rules) ? data.rules : [];
    } catch {
      rulesCache = [];
    }
  }
  return rulesCache
    .filter(
      (rule) =>
        rule?.gate?.kind === "hook" &&
        rule.gate.id === "PreToolUse" &&
        rule.gate.discriminator === discriminator,
    )
    .map((rule) => String(rule.id))
    .sort();
}

/**
 * The decision for protected tool calls: `hooks.preToolUse.decision` when it is `ask` or
 * `deny`, else `ask`.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {"ask" | "deny"}
 */
export function decisionFor(ctx) {
  const value = ctx.config?.preToolUse?.decision;
  return DECISIONS.includes(value) ? value : DECISIONS[0];
}

function lowerFirst(text) {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

function upperFirst(text) {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

function cut(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * One finding as a clause.
 *
 * @param {import("../lib/protect.mjs").Finding} finding
 * @returns {string}
 */
export function describeFinding(finding) {
  // Command and content descriptions are verb phrases ("Skips git hooks"); path descriptions
  // are names that may start with a product name ("Laravel Pint configuration").
  const description = lowerFirst(finding.description);
  if (finding.source === "path") {
    let text = `${finding.path} is a protected file (${finding.description})`;
    if (finding.pointers && finding.pointers.length > 0) {
      const pointers = finding.pointers.join(", ");
      text += finding.unknown
        ? `; the edit could not be checked, so it counts as a change to ${pointers}`
        : `; the edit changes ${pointers}`;
    }
    return text;
  }
  if (finding.source === "content") return `this edit to ${finding.path} ${description}`;
  return `this command ${description} (${finding.path ?? finding.match})`;
}

function summarise(findings) {
  const listed = findings.slice(0, FINDINGS_LISTED).map(describeFinding);
  const more = findings.length - listed.length;
  const text = listed.join("; ");
  // A clause may start with a file name, whose case is kept.
  const opening = text.startsWith("this ") ? upperFirst(text) : text;
  return `${opening}${more > 0 ? `; and ${more} more` : ""}.`;
}

/**
 * The hook result for protected findings: Claude Code's PreToolUse `hookSpecificOutput` with
 * the decision, a reason (shown to the user for `ask`, to Claude for `deny`) and
 * `additionalContext` for Claude.
 *
 * @param {object} options
 * @param {import("../lib/protect.mjs").Finding[]} options.findings
 * @param {"file" | "shell"} options.kind
 * @param {"ask" | "deny"} options.decision
 * @param {string[]} options.ruleIds
 * @returns {import("../lib/io.mjs").HookResult}
 */
export function decisionResult({ findings, kind, decision, ruleIds }) {
  const sentences = [];
  if (findings.some((finding) => finding.effect === "opt-out")) sentences.push(OPT_OUT_SENTENCE);
  if (findings.some((finding) => finding.effect !== "opt-out")) {
    sentences.push(kind === "shell" ? COMMAND_SENTENCE : GATE_SENTENCE);
  }
  const summary = summarise(findings);
  const reason = cut(`${PREFIX}${summary} ${sentences.join(" ")}`, MAX_REASON_CHARS);

  const rules = ruleIds.length > 0 ? ` (rule ${ruleIds.join(", ")})` : "";
  const outcome =
    decision === "deny"
      ? "The PreToolUse hook denied this tool call because the project sets " +
        'hooks.preToolUse.decision to "deny"; the user makes this change directly.'
      : "The PreToolUse hook asked the user to confirm this tool call.";
  const entries = [...new Set(findings.map((finding) => finding.ruleId))].join(", ");
  const context = cut(
    `Cross-Stack Standard${rules}: ${summary} ${outcome} Under the Standard, a failing gate is ` +
      "fixed in the code, or with a dated allowlist entry that has a reason. Gate configuration, " +
      "baselines and the opt-out change only when the user intends it, and baselines are " +
      "regenerated only by the project's <tool>:baseline:update scripts. " +
      `Matched protection entries: ${entries}.`,
    MAX_CONTEXT_CHARS,
  );
  return {
    exitCode: 0,
    json: {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
        additionalContext: context,
      },
    },
  };
}

/**
 * The hook result when the check could not complete: `ask`, with why.
 *
 * @param {unknown} error
 * @param {string[]} ruleIds
 * @returns {import("../lib/io.mjs").HookResult}
 */
export function incompleteResult(error, ruleIds) {
  const why = cut(
    (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0] || "unknown error",
    300,
  );
  const reason = cut(
    `${PREFIX}the gate-file protection check could not complete (${why}). ${INCOMPLETE_SENTENCE}`,
    MAX_REASON_CHARS,
  );
  const rules = ruleIds.length > 0 ? ` (rule ${ruleIds.join(", ")})` : "";
  const hint =
    error instanceof ProtectionIncomplete
      ? " Split a very long command, or use the Edit and Write tools for file changes."
      : " Reinstalling the plugin restores its files if they are damaged.";
  const context = cut(
    `Cross-Stack Standard${rules}: the PreToolUse protection check could not complete (${why}), ` +
      "so the hook asked the user to confirm this tool call instead of letting it through " +
      `unchecked.${hint}`,
    MAX_CONTEXT_CHARS,
  );
  return {
    exitCode: 0,
    json: {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
        additionalContext: context,
      },
    },
  };
}

/**
 * Directories the protected globs are relative to: the project root (where `.cross-stack/`
 * lives), the project directory, the repository root, and the working directory when it lies
 * outside all of them.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {string[]}
 */
export function protectionRoots(ctx) {
  const roots = [ctx.projectRoot, ctx.projectDir];
  if (typeof ctx.repositoryRoot === "string" && ctx.repositoryRoot !== "") {
    roots.push(ctx.repositoryRoot);
  }
  if (!roots.some((root) => isWithin(ctx.cwd, root))) roots.push(ctx.cwd);
  return [...new Set(roots)];
}

/**
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {Promise<import("../lib/io.mjs").HookResult>}
 */
export default async function preToolUse(ctx) {
  const toolName = ctx.input.tool_name;
  const toolInput = ctx.input.tool_input;
  if (typeof toolName !== "string" || toolInput === null || typeof toolInput !== "object") {
    return {};
  }
  if (toolName.startsWith("mcp__")) return companionToolGate(ctx, toolName, toolInput);
  if (toolName === "Skill") return companionSkillGate(ctx, toolInput);
  const dialect = Object.hasOwn(SHELL_TOOLS, toolName) ? SHELL_TOOLS[toolName] : null;
  if (!FILE_TOOLS.has(toolName) && dialect === null) return {};
  if (dialect !== null) {
    const companionResult = companionCommandGate(ctx, toolInput.command);
    if (companionResult !== null) return companionResult;
  }

  const kind = dialect === null ? "file" : "shell";
  const discriminator = kind === "shell" ? "Bash" : "Edit";
  let findings;
  try {
    findings = inspect(ctx, toolName, toolInput, dialect);
  } catch (error) {
    // Fail closed: a check that could not complete asks rather than letting the call through.
    ctx.log.debug(`${toolName}: protection check incomplete: ${error?.stack ?? error}`);
    return incompleteResult(error, gateRuleIds(ctx.pluginRoot, discriminator));
  }
  if (findings.length === 0) return {};

  const decision = decisionFor(ctx);
  ctx.log.debug(`${toolName}: ${decision} for ${findings.map((f) => f.ruleId).join(", ")}`);
  return decisionResult({
    findings,
    kind,
    decision,
    ruleIds: gateRuleIds(ctx.pluginRoot, discriminator),
  });
}

/**
 * Loads the protection list and inspects one tool call.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @param {string} toolName
 * @param {Record<string, any>} toolInput
 * @param {"bash" | "powershell" | null} dialect
 * @returns {import("../lib/protect.mjs").Finding[]}
 */
function inspect(ctx, toolName, toolInput, dialect) {
  const settings = ctx.config?.preToolUse ?? {};
  const protection = compileProtection(loadProtectionList(path.join(ctx.pluginRoot, "data")), {
    protect: settings.protect ?? [],
    protectCommands: settings.protectCommands ?? [],
    caseInsensitive: caseInsensitivePaths(),
  });
  for (const problem of protection.problems) ctx.log.debug(`protection entry skipped: ${problem}`);
  const roots = protectionRoots(ctx);
  const home = os.homedir();
  return dialect === null
    ? inspectFileEdit({
        toolName,
        toolInput,
        protection,
        roots,
        cwd: ctx.cwd,
        searchDirs: ctx.searchDirs,
        home,
        env: ctx.env,
      })
    : inspectCommand({
        command: toolInput.command,
        dialect,
        protection,
        roots,
        cwd: ctx.cwd,
        projectDir: ctx.projectDir,
        home,
        env: ctx.env,
      });
}

/**
 * The status inputs of the companion gates.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 */
function companionContext(ctx) {
  return loadStatus({
    pluginRoot: ctx.pluginRoot,
    projectRoot: ctx.projectRoot,
    env: ctx.env,
    manifest: ctx.manifest?.manifest ?? null,
    dataDir: ctx.dataDir,
  });
}

/**
 * A PreToolUse result with a decision (or, for `null`, only context for Claude).
 *
 * @param {"ask" | "deny" | null} decision
 * @param {string} reason
 * @param {string} context
 * @returns {import("../lib/io.mjs").HookResult}
 */
function companionResult(decision, reason, context) {
  const output = { hookEventName: "PreToolUse" };
  if (decision !== null) {
    output.permissionDecision = decision;
    output.permissionDecisionReason = cut(`${PREFIX}${reason}`, MAX_REASON_CHARS);
  }
  output.additionalContext = cut(`Cross-Stack Standard: ${context}`, MAX_CONTEXT_CHARS);
  return { exitCode: 0, json: { hookSpecificOutput: output } };
}

/**
 * The pre-call gate of a companion's MCP tool.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @param {string} toolName
 * @param {Record<string, any>} toolInput
 * @returns {import("../lib/io.mjs").HookResult}
 */
export function companionToolGate(ctx, toolName, toolInput) {
  const { companions, statuses } = companionContext(ctx);
  const gate = gateToolCall({
    toolName,
    toolInput,
    companions,
    statuses,
    browserHosts: ctx.config?.preToolUse?.browserHosts ?? [],
    currentPage: readCurrentPage(ctx.dataDir, ctx.input.session_id),
  });
  if (gate === null) return {};
  appendLog(ctx.dataDir, {
    event: "gate",
    companion: gate.companion,
    tool: toolName,
    decision: gate.decision ?? "note",
    reason: gate.reason || gate.context,
  });
  ctx.log.debug(`${toolName}: companion gate ${gate.decision ?? "note"}`);
  return companionResult(gate.decision, gate.reason, gate.context);
}

/**
 * The install gate for shell commands that install or enable a companion.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @param {unknown} command
 * @returns {import("../lib/io.mjs").HookResult | null}
 */
export function companionCommandGate(ctx, command) {
  if (typeof command !== "string" || !/\bclaude\s+plugins?\s/.test(command)) return null;
  const { companions, consent } = companionContext(ctx);
  const findings = inspectCompanionCommand({ command, companions, consent });
  if (findings.length === 0) return null;
  const decision = findings.some((finding) => finding.decision === "deny") ? "deny" : "ask";
  const reason = findings.map((finding) => finding.reason).join(" ");
  for (const finding of findings) {
    appendLog(ctx.dataDir, {
      event: "install-gate",
      companion: finding.companion,
      decision: finding.decision,
      reason: finding.reason,
    });
  }
  return companionResult(
    decision,
    reason,
    `${reason} Companions are installed only through /cross-stack-standard:adopt, from the Standard's marketplace, after the user's yes.`,
  );
}

/**
 * The pre-call gate of a companion's skill (the Skill tool).
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @param {Record<string, any>} toolInput
 * @returns {import("../lib/io.mjs").HookResult}
 */
export function companionSkillGate(ctx, toolInput) {
  const { companions, statuses } = companionContext(ctx);
  const gate = gateSkillCall({ skill: toolInput.skill, companions, statuses });
  if (gate === null) return {};
  appendLog(ctx.dataDir, {
    event: "gate",
    companion: gate.companion,
    tool: `Skill:${String(toolInput.skill)}`,
    decision: gate.decision,
    reason: gate.reason,
  });
  return companionResult(gate.decision, gate.reason, gate.context);
}
