/**
 * A machine without Node.js on PATH: the mechanical half of failing open.
 *
 * Every hooks.json entry is an exec-form command (`"command": "node"` with `args`), which Claude
 * Code spawns directly, with no shell. With no `node` on PATH that spawn fails to start: no
 * process exists, so no script of the Standard runs and nothing is written. This test spawns
 * each hooks.json command exactly that way and proves it.
 *
 * The platform half — Claude Code reports a hook that cannot start as a non-blocking error and
 * the session continues — is documented platform behaviour (the hooks reference; recorded in
 * docs/maintainers/verified-versions.md, "Hook output visibility and fail-open"). It cannot be
 * exercised without Claude Code itself, so a manual check in an authenticated session covers it
 * before a release.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, test } from "node:test";

import { makeProject, PLUGIN_DIR, projectFixture, tempDir } from "./helpers/project.mjs";
import { fixtureVars, stdinFixture } from "./helpers/run-hook.mjs";

const hooksConfig = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_DIR, "hooks", "hooks.json"), "utf8"),
);

/** Every distinct command hooks.json runs, with `${CLAUDE_PLUGIN_ROOT}` substituted. */
function hookCommands() {
  const seen = new Map();
  for (const [event, groups] of Object.entries(hooksConfig.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        const args = hook.args.map((arg) => arg.replaceAll("${CLAUDE_PLUGIN_ROOT}", PLUGIN_DIR));
        seen.set(JSON.stringify([hook.command, ...args]), { event, command: hook.command, args });
      }
    }
  }
  return [...seen.values()];
}

/**
 * An environment whose PATH holds only `dirs`. Windows keeps the system root, which a started
 * process needs; every other PATH spelling is removed (Windows names it `Path`).
 */
function envWithPath(dirs, extra = {}) {
  const env = { PATH: dirs.join(path.delimiter), ...extra };
  if (process.platform === "win32") {
    env.SystemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  }
  return env;
}

/**
 * Spawns like Claude Code's exec form: no shell, the command resolved on PATH.
 *
 * @returns {Promise<{ started: boolean, error: NodeJS.ErrnoException | null, exitCode: number | null, stdout: string, stderr: string }>}
 */
function spawnExecForm({ command, args, cwd, env, stdin }) {
  return new Promise((resolve) => {
    let started = false;
    const out = [];
    const err = [];
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    child.on("spawn", () => {
      started = true;
      if (stdin !== undefined) child.stdin.end(stdin);
    });
    child.stdout?.on("data", (chunk) => out.push(chunk));
    child.stderr?.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => {
      resolve({
        started,
        error,
        exitCode: null,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
    child.on("close", (exitCode) => {
      resolve({
        started,
        error: null,
        exitCode,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}

describe("node missing from PATH", () => {
  const commands = hookCommands();

  test("every hooks.json entry depends on node being on PATH (exec form, no shell fallback)", () => {
    assert.ok(commands.length >= 4);
    for (const { event, command } of commands) assert.equal(command, "node", event);
  });

  for (const { event, command, args } of commands) {
    test(`${event}: the command cannot start, so nothing runs and nothing is written`, async (t) => {
      const project = makeProject(t, projectFixture("laravel-next-monorepo"));
      const emptyBin = tempDir(t, "cross-stack-empty-path-");
      const result = await spawnExecForm({
        command,
        args,
        cwd: emptyBin,
        env: envWithPath([emptyBin], { CLAUDE_PROJECT_DIR: project.root }),
      });
      assert.equal(result.started, false, "no process was created");
      assert.equal(result.error?.code, "ENOENT", String(result.error));
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
      assert.deepEqual(fs.readdirSync(emptyBin), [], "nothing was written");
    });
  }

  const nodeDir = path.dirname(process.execPath);
  const nodeIsNamedNode =
    path.basename(process.execPath, path.extname(process.execPath)) === "node";

  test(
    "control: the same command starts once node is on PATH",
    { skip: nodeIsNamedNode ? false : "the running Node.js binary is not named node" },
    async (t) => {
      const project = makeProject(t, projectFixture("laravel-next-monorepo"));
      const { command, args } = commands.find((entry) => entry.event === "SessionStart");
      const result = await spawnExecForm({
        command,
        args,
        cwd: project.root,
        env: envWithPath([nodeDir], { CLAUDE_PROJECT_DIR: project.root }),
        stdin: JSON.stringify(stdinFixture("session-start/startup", fixtureVars(project.root))),
      });
      assert.equal(result.started, true);
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /^Tracks: laravel/m);
    },
  );
});
