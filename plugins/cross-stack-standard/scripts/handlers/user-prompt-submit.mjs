/**
 * UserPromptSubmit: the caveman plan-mode guard. The caveman companion plugin gives terse,
 * clipped prose on demand; plan mode is a conversation in which the user reasons with Claude
 * and approves a plan, so there the answer must be complete prose. When the input's
 * `permission_mode` is `plan`, this handler adds one reminder to Claude's context for the turn;
 * in every other mode it adds nothing, so caveman keeps whatever level the user set.
 *
 * Reads nothing but the hook input, starts no process and never blocks the prompt.
 *
 * @module plugins/cross-stack-standard/scripts/handlers/user-prompt-submit
 */

/** The reminder added to the turn while plan mode is active. */
export const PLAN_MODE_REMINDER =
  "Plan mode is active, so caveman is suspended for this turn whatever level was set: answer " +
  "in normal, complete prose, with full sentences, reasoning, trade-offs and questions written " +
  'out, the plan included. This is not "/caveman off": if caveman was on, it resumes on the ' +
  "turns after plan mode ends.";

/**
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {import("../lib/io.mjs").HookResult}
 */
export default function userPromptSubmit(ctx) {
  if (ctx.input.permission_mode !== "plan") return { exitCode: 0 };
  return {
    exitCode: 0,
    json: {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: PLAN_MODE_REMINDER,
      },
    },
  };
}
