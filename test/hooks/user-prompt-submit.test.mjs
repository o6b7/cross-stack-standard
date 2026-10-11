/**
 * UserPromptSubmit: the caveman plan-mode guard adds its reminder in plan mode only, never
 * blocks the prompt, and stays silent where the Standard is opted out.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { importPlugin, makeProject, projectFixture } from "./helpers/project.mjs";
import { fixtureVars, runHook, stdinFixture } from "./helpers/run-hook.mjs";

const { PLAN_MODE_REMINDER } = await importPlugin("scripts/handlers/user-prompt-submit.mjs");

function run(project, mode, env = {}) {
  return runHook({
    event: "UserPromptSubmit",
    stdin: stdinFixture(`user-prompt-submit/${mode}`, fixtureVars(project.root)),
    projectDir: project.root,
    env,
  });
}

describe("UserPromptSubmit: caveman plan-mode guard", () => {
  test("plan mode adds the reminder as context for the turn", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const result = await run(project, "plan");
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(result.json, {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: PLAN_MODE_REMINDER,
      },
    });
    assert.match(PLAN_MODE_REMINDER, /caveman is suspended/);
    assert.match(PLAN_MODE_REMINDER, /resumes on the turns after plan mode ends/);
  });

  test("every other mode adds nothing", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const result = await run(project, "default");
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });

  test("a project without a detected track still gets the guard", async (t) => {
    const project = makeProject(t);
    const result = await run(project, "plan");
    assert.equal(result.json?.hookSpecificOutput?.additionalContext, PLAN_MODE_REMINDER);
  });

  test("silent in an opted-out project and with the environment switch", async (t) => {
    const declined = makeProject(t, { "CLAUDE.md": "cross-stack-standard: declined\n" });
    for (const result of [
      await run(declined, "plan"),
      await run(makeProject(t), "plan", { CROSS_STACK_STANDARD_DISABLE: "1" }),
    ]) {
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    }
  });
});
