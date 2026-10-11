/**
 * Unit tests of scripts/lib/fixtures/process.mjs and git.mjs: output capture, timeouts that
 * kill the whole process tree, abort, environment hygiene and deterministic scratch commits.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { FIXTURE_IDENTITY, ScratchRepo } from "../../../scripts/lib/fixtures/git.mjs";
import {
  FIXED_GATE_ENV,
  buildBaseEnv,
  runProcess,
  tailLines,
} from "../../../scripts/lib/fixtures/process.mjs";
import { git, isAlive, tempDir } from "./helpers.mjs";

const node = process.execPath;

function envFor(dir) {
  const gitConfigGlobal = path.join(dir, "gitconfig");
  fs.writeFileSync(gitConfigGlobal, "");
  return buildBaseEnv(process.env, { gitConfigGlobal, ceiling: dir });
}

async function waitUntilDead(pid, ms = 5000) {
  const deadline = Date.now() + ms;
  while (isAlive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  return !isAlive(pid);
}

describe("runProcess", () => {
  test("captures stdout and stderr in order and returns the exit code", async (t) => {
    const dir = tempDir(t);
    const script =
      "process.stdout.write('out1\\n'); setTimeout(() => { process.stderr.write('err2\\n'); process.exit(3); }, 20);";
    const result = await runProcess({
      argv: [node, "-e", script],
      cwd: dir,
      env: envFor(dir),
      timeoutMs: 10_000,
    });
    assert.equal(result.exitCode, 3);
    assert.equal(result.signal, null);
    assert.equal(result.timedOut, false);
    assert.equal(result.error, null);
    assert.equal(result.output, "out1\nerr2\n");
    assert.equal(typeof result.durationMs, "number");
  });

  test("a missing program is reported, not thrown", async (t) => {
    const dir = tempDir(t);
    const result = await runProcess({
      argv: ["no-such-program-csf"],
      cwd: dir,
      env: envFor(dir),
      timeoutMs: 5000,
    });
    assert.equal(result.exitCode, null);
    assert.match(result.error, /cannot start no-such-program-csf/);
  });

  test("the timeout kills the process and its children", async (t) => {
    const dir = tempDir(t);
    const pidFile = path.join(dir, "child.pid");
    const script = [
      "const { spawn } = require('node:child_process');",
      "const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));`,
      "console.log('started');",
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const started = Date.now();
    const result = await runProcess({
      argv: [node, "-e", script],
      cwd: dir,
      env: envFor(dir),
      timeoutMs: 800,
    });
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, null);
    assert.match(result.output, /started/);
    assert.ok(Date.now() - started < 8000);
    const childPid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.equal(await waitUntilDead(childPid), true, "the grandchild was killed");
  });

  test("a background child that keeps the pipes open does not hang the run", async (t) => {
    const dir = tempDir(t);
    const script = [
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });",
      "process.exit(0);",
    ].join("\n");
    const started = Date.now();
    const result = await runProcess({
      argv: [node, "-e", script],
      cwd: dir,
      env: envFor(dir),
      timeoutMs: 20_000,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.ok(Date.now() - started < 10_000, "finished after the close grace period");
  });

  test("an abort signal kills the run", async (t) => {
    const dir = tempDir(t);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const result = await runProcess({
      argv: [node, "-e", "setInterval(() => {}, 1000)"],
      cwd: dir,
      env: envFor(dir),
      timeoutMs: 20_000,
      signal: controller.signal,
    });
    assert.equal(result.aborted, true);
    assert.equal(result.timedOut, false);
    assert.equal(result.exitCode, null);
  });

  test("stdin is fed from a file, and a missing stdin file is an error", async (t) => {
    const dir = tempDir(t);
    const input = path.join(dir, "event.json");
    fs.writeFileSync(input, '{"hook_event_name":"Stop"}');
    const echo =
      "let s=''; process.stdin.on('data', (d) => s += d).on('end', () => process.stdout.write(s));";
    const ok = await runProcess({
      argv: [node, "-e", echo],
      cwd: dir,
      env: envFor(dir),
      timeoutMs: 10_000,
      stdinFile: input,
    });
    assert.equal(ok.output, '{"hook_event_name":"Stop"}');
    const missing = await runProcess({
      argv: [node, "-e", echo],
      cwd: dir,
      env: envFor(dir),
      timeoutMs: 10_000,
      stdinFile: path.join(dir, "nope.json"),
    });
    assert.match(missing.error, /cannot read stdin file/);
  });

  test("output beyond the limit is dropped and flagged", async (t) => {
    const dir = tempDir(t);
    const result = await runProcess({
      argv: [node, "-e", "process.stdout.write('x'.repeat(5000))"],
      cwd: dir,
      env: envFor(dir),
      timeoutMs: 10_000,
      maxOutputBytes: 1000,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.truncated, true);
    assert.equal(result.output.length, 1000);
  });
});

describe("buildBaseEnv", () => {
  test("strips caller state and pins the fixed variables", () => {
    const env = buildBaseEnv(
      {
        PATH: "/bin",
        HOME: "/home/x",
        GIT_DIR: "/outer/.git",
        git_index_file: "/outer/index",
        CLAUDECODE: "1",
        CLAUDE_PROJECT_DIR: "/p",
        AI_AGENT: "claude-code",
        FORCE_COLOR: "1",
        CROSS_STACK_STANDARD_DISABLE: "1",
        CROSS_STACK_STANDARD_STOP_GATE: "0",
        PAO_DISABLE: "0",
        CI: "false",
        UNDEFINED: undefined,
      },
      { gitConfigGlobal: "/tmp/run/gitconfig", ceiling: "/tmp/run" },
    );
    assert.deepEqual(env, {
      PATH: "/bin",
      HOME: "/home/x",
      ...FIXED_GATE_ENV,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/tmp/run/gitconfig",
      GIT_CEILING_DIRECTORIES: "/tmp/run",
      GIT_TERMINAL_PROMPT: "0",
    });
    assert.deepEqual(FIXED_GATE_ENV, { PAO_DISABLE: "1", NO_COLOR: "1", CI: "1" });
  });

  test("tailLines keeps the last lines", () => {
    assert.deepEqual(tailLines("a\nb\r\nc\n\n", 2), ["b", "c"]);
    assert.deepEqual(tailLines("  \n", 5), []);
  });
});

describe("ScratchRepo", () => {
  test("commits with a fixed identity and fixed dates, so SHAs are reproducible", async (t) => {
    const shas = [];
    for (const name of ["one", "two"]) {
      const dir = path.join(tempDir(t), name);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
      const repo = new ScratchRepo(dir, envFor(path.dirname(dir)));
      await repo.init();
      const first = await repo.commitAll("chore: initial fixture state");
      fs.writeFileSync(path.join(dir, "b.txt"), "b\n");
      const second = await repo.commitAll("feat: add b");
      const empty = await repo.commitAll("chore: nothing changed");
      assert.notEqual(first, second);
      assert.notEqual(second, empty);
      assert.equal(git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]), "main");
      assert.equal(
        git(dir, ["log", "-1", "--format=%an <%ae> %at", first]),
        `${FIXTURE_IDENTITY.name} <${FIXTURE_IDENTITY.email}> 1767225600`,
      );
      assert.equal(git(dir, ["log", "-1", "--format=%at", second]), "1767225660");
      shas.push([first, second, empty]);
    }
    assert.deepEqual(shas[0], shas[1]);
  });

  test("git failures surface as errors", async (t) => {
    const dir = tempDir(t);
    const repo = new ScratchRepo(dir, envFor(dir));
    await assert.rejects(repo.commitAll("no repository yet"), /git add --all failed/);
  });
});
