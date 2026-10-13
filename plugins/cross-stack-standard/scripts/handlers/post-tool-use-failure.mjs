/**
 * PostToolUseFailure (matcher: the companions' MCP tools) and the companion part of PostToolUse:
 * the health record of the companion plugins (ADR 0106).
 *
 * - A companion tool call that succeeds marks the companion `ok`.
 * - One that fails marks it `failed` with the first line of the error, and adds a note for
 *   Claude: the failure, and the companion's fallback, which Claude offers the user instead of
 *   claiming a result. An interrupted call (`is_interrupt`) records nothing.
 *
 * For each browser companion, the session's current page follows each call (lib/companions.mjs
 * `pageAfter`): the opened URL after a successful navigation, unknown after back, a page switch,
 * a closed page or a failed call, so the PreToolUse gate never works from a page it cannot vouch
 * for. Each browser server has its own page record.
 *
 * Each change of status is written to the companion log. Without `CLAUDE_PLUGIN_DATA` nothing is
 * recorded, and the failure note is still returned.
 *
 * @module plugins/cross-stack-standard/scripts/handlers/post-tool-use-failure
 */

import {
  appendLog,
  companionForTool,
  loadCompanions,
  pageAfter,
  readCurrentPage,
  writeCurrentPage,
  writeHealth,
} from "../lib/companions.mjs";

/**
 * The companion that serves the call, or null.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 */
function companionOf(ctx) {
  const toolName = ctx.input.tool_name;
  if (typeof toolName !== "string") return null;
  return companionForTool(toolName, loadCompanions(ctx.pluginRoot));
}

/**
 * Marks the companion healthy after a successful call (PostToolUse).
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {import("../lib/io.mjs").HookResult}
 */
export function recordCompanionSuccess(ctx) {
  const companion = companionOf(ctx);
  if (companion === null) return { exitCode: 0 };
  if (["chrome-devtools-mcp", "playwright-mcp"].includes(companion.name)) {
    const tool = ctx.input.tool_name.slice(companion.toolPrefix.length);
    const current = readCurrentPage(ctx.dataDir, ctx.input.session_id, companion.name);
    const next = pageAfter(tool, ctx.input.tool_input ?? {}, current);
    if (next !== current)
      writeCurrentPage(ctx.dataDir, ctx.input.session_id, next, new Date(), companion.name);
  }
  const previous = writeHealth(ctx.dataDir, companion.name, "ok", null);
  if (previous !== "ok") {
    appendLog(ctx.dataDir, {
      event: "health",
      companion: companion.name,
      status: "ok",
      tool: ctx.input.tool_name,
    });
  }
  return { exitCode: 0 };
}

/**
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {import("../lib/io.mjs").HookResult}
 */
export default function postToolUseFailure(ctx) {
  const companion = companionOf(ctx);
  if (companion === null) return { exitCode: 0 };
  if (["chrome-devtools-mcp", "playwright-mcp"].includes(companion.name)) {
    // A navigation that failed may have left the browser anywhere.
    writeCurrentPage(ctx.dataDir, ctx.input.session_id, null, new Date(), companion.name);
  }
  if (ctx.input.is_interrupt === true) return { exitCode: 0 };
  const detail =
    typeof ctx.input.error === "string" && ctx.input.error.trim() !== ""
      ? ctx.input.error.trim().split(/\r?\n/)[0]
      : "the tool reported an error";
  writeHealth(ctx.dataDir, companion.name, "failed", detail);
  appendLog(ctx.dataDir, {
    event: "health",
    companion: companion.name,
    status: "failed",
    tool: ctx.input.tool_name,
    detail,
  });
  const note =
    `Cross-Stack Standard: ${companion.title} failed (${detail.slice(0, 200)}). Do not claim a ` +
    `result from it. Tell the user in one line and offer the fallback: ${companion.fallback}`;
  return {
    exitCode: 0,
    json: {
      hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: note },
    },
  };
}
