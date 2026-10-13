/**
 * Running project tools: no shell, time box with a kill on overrun (grandchildren included),
 * captured output that never reaches the hook's stdout, and the child environment. A run ends
 * when the tool ends, even when something it started keeps the output pipes open, and nothing it
 * started outlives the run or the hook (on POSIX, where process groups exist). The last parts
 * run tools through the real entry point with a probe handler in a copy of the plugin.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, test } from "node:test";

import { copyPlugin, importPlugin, makeProject, PLUGIN_DIR, tempDir } from "./helpers/project.mjs";
import {
  cleanEnv,
  fileUrl,
  fixtureVars,
  processGone,
  runHook,
  stdinFixture,
} from "./helpers/run-hook.mjs";

const { lastLines, REAPER_DELAY_MS, runTool, stopAllTools, stripAnsi, TOOL_ENV, toolEnv } =
  await importPlugin("scripts/lib/spawn.mjs");
const { resolveNpmCli } = await importPlugin("scripts/lib/resolve-tool.mjs");

const IS_WINDOWS = process.platform === "win32";

/** Skip reason for what only POSIX process groups can do (see the notes in lib/spawn.mjs). */
const POSIX_GROUPS_ONLY = IS_WINDOWS
  ? "Windows has no process groups: taskkill /T reaches a tree only while its root still runs"
  : false;

/** The offline switches every tool gets (docs/maintainers/verified-versions.md). */
const OFFLINE_ENV = {
  npm_config_update_notifier: "false",
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  COREPACK_ENABLE_NETWORK: "0",
  NEXT_TELEMETRY_DISABLED: "1",
};

/** A closed local port: anything that tries the network fails at once and nothing leaves. */
const NO_NETWORK = {
  HTTPS_PROXY: "http://127.0.0.1:9",
  HTTP_PROXY: "http://127.0.0.1:9",
  https_proxy: "http://127.0.0.1:9",
  http_proxy: "http://127.0.0.1:9",
  COREPACK_NPM_REGISTRY: "http://127.0.0.1:9",
  npm_config_registry: "http://127.0.0.1:9/",
};

const node = (source, options = {}) =>
  runTool({ command: process.execPath, args: ["-e", source], cwd: process.cwd(), ...options });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Source of a Node.js process that writes its pid to `pidFile`, then runs forever. */
const foreverWritingPid = (pidFile) =>
  `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ` +
  "setInterval(() => {}, 1000);";

/**
 * Source of a tool that starts `grandchild` (Node.js source) with `stdio`, waits until
 * `pidFile` exists (the grandchild is running), then runs `then`.
 */
const toolStarting = (grandchild, pidFile, { stdio, then }) =>
  `const { spawn } = require("child_process");\n` +
  `spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: ${JSON.stringify(stdio)} }).unref();\n` +
  `const ready = () => require("fs").existsSync(${JSON.stringify(pidFile)}) ? (${then}) : setTimeout(ready, 10);\n` +
  "ready();\n";

/** Waits until a file holds a pid and returns it. */
async function waitForPid(file, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (/^\d+$/.test(text)) return Number(text);
    await sleep(25);
  }
  throw new Error(`no pid in ${file} after ${timeoutMs} ms`);
}

/** Ends a process a test may leave behind where the platform cannot (Windows). */
function cleanUp(t, pid) {
  t.after(() => {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  });
}

describe("toolEnv", () => {
  test("sets the verified opt-outs and plain output, drops FORCE_COLOR, keeps the rest", () => {
    const env = toolEnv(
      { PATH: "/bin", FORCE_COLOR: "3", force_color: "1", HOME: "/home/dev" },
      { EXTRA: "1", HOME: undefined },
    );
    assert.equal(env.PATH, "/bin");
    assert.equal(env.EXTRA, "1");
    assert.equal(env.HOME, undefined);
    assert.equal(env.FORCE_COLOR, undefined);
    assert.equal(env.force_color, undefined);
    for (const [name, value] of Object.entries(TOOL_ENV)) assert.equal(env[name], value, name);
    assert.deepEqual(Object.keys(TOOL_ENV).sort(), [
      "COREPACK_ENABLE_DOWNLOAD_PROMPT",
      "COREPACK_ENABLE_NETWORK",
      "DO_NOT_TRACK",
      "JSCPD_NO_TIPS",
      "NEXT_TELEMETRY_DISABLED",
      "NO_COLOR",
      "PAO_DISABLE",
      "npm_config_update_notifier",
    ]);
  });

  test("npm's update notifier, Corepack's downloads and Next.js telemetry are switched off", () => {
    const env = toolEnv({
      PATH: "/bin",
      // npm reads npm_config_* in any case, so a user's upper-case setting must not win.
      NPM_CONFIG_UPDATE_NOTIFIER: "true",
      COREPACK_ENABLE_NETWORK: "1",
      NEXT_TELEMETRY_DISABLED: "",
    });
    for (const [name, value] of Object.entries(OFFLINE_ENV)) assert.equal(env[name], value, name);
    assert.equal(env.NPM_CONFIG_UPDATE_NOTIFIER, undefined);
  });

  test("the child sees that environment", async () => {
    const result = await node(
      "console.log([process.env.PAO_DISABLE, process.env.DO_NOT_TRACK, process.env.FORCE_COLOR, " +
        "process.env.npm_config_update_notifier, process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT, " +
        "process.env.COREPACK_ENABLE_NETWORK, process.env.NEXT_TELEMETRY_DISABLED].join(','))",
      { env: toolEnv({ ...process.env, FORCE_COLOR: "1" }) },
    );
    assert.equal(result.stdout.trim(), "1,1,,false,0,0,1");
  });

  test("the Stop gate's environment carries the same switches, plus CI=1", async () => {
    const { gateEnv } = await importPlugin("scripts/handlers/stop.mjs");
    const env = gateEnv({ PATH: "/bin", npm_config_update_notifier: "true" });
    for (const [name, value] of Object.entries({ ...TOOL_ENV, ...OFFLINE_ENV, CI: "1" })) {
      assert.equal(env[name], value, name);
    }
  });

  test("npm itself reads the update-notifier switch from that environment", async (t) => {
    const npm = resolveNpmCli({ env: {} });
    if (npm === null) {
      t.skip("this Node.js installation has no bundled npm");
      return;
    }
    const result = await runTool({
      command: npm.command,
      args: [...npm.args, "config", "get", "update-notifier"],
      cwd: tempDir(t),
      env: toolEnv(cleanEnv({ ...NO_NETWORK, npm_config_update_notifier: "true" })),
      timeoutMs: 30_000,
    });
    assert.equal(result.exitCode, 0, result.output);
    assert.equal(result.stdout.trim(), "false");
  });

  test("Corepack refuses to download a package manager instead of reaching the network", async (t) => {
    const binDir = path.dirname(process.execPath);
    const corepack = [
      path.join(binDir, "node_modules", "corepack", "dist", "corepack.js"),
      path.join(binDir, "..", "lib", "node_modules", "corepack", "dist", "corepack.js"),
    ].find((file) => fs.existsSync(file));
    if (corepack === undefined) {
      t.skip("this Node.js installation has no bundled Corepack (Node.js 25 removed it)");
      return;
    }
    const dir = tempDir(t);
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "p", private: true, packageManager: "pnpm@9.99.99" }),
    );
    const env = toolEnv(
      cleanEnv({ ...NO_NETWORK, COREPACK_HOME: path.join(dir, "corepack-home") }),
    );
    const result = await runTool({
      command: process.execPath,
      args: [corepack, "pnpm", "--version"],
      cwd: dir,
      env,
      timeoutMs: 30_000,
    });
    assert.notEqual(result.exitCode, 0, result.output);
    assert.match(result.output, /Network access disabled by the environment/);
  });
});

describe("runTool", () => {
  test("captures stdout, stderr and both interleaved; exit 0 is ok", async () => {
    // The pauses keep the arrival order stable on a busy machine.
    const result = await node(
      'process.stdout.write("out-1\\n"); setTimeout(() => { process.stderr.write("err-1\\n"); ' +
        'setTimeout(() => process.stdout.write("out-2\\n"), 250); }, 250);',
    );
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.equal(result.error, null);
    assert.equal(result.stdout, "out-1\nout-2\n");
    assert.equal(result.stderr, "err-1\n");
    assert.equal(result.output, "out-1\nerr-1\nout-2\n");
  });

  test("a non-zero exit is reported, not thrown", async () => {
    const result = await node("process.exitCode = 3");
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 3);
  });

  test("a missing program resolves with ENOENT", async () => {
    const result = await runTool({
      command: "cross-stack-no-such-program",
      cwd: process.cwd(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "ENOENT");
  });

  test("shell shims and npx are refused without starting anything", async () => {
    for (const command of [
      "npx",
      "NPX.EXE",
      "C:\\tools\\eslint.cmd",
      "run.bat",
      "x.ps1",
      "npx-cli.js",
    ]) {
      const result = await runTool({ command, args: ["--version"], cwd: process.cwd() });
      assert.equal(result.error?.code, "EREFUSED", command);
      assert.equal(result.exitCode, null, command);
    }
  });

  test("stdin is closed, so a tool waiting for input ends", async () => {
    const result = await node(
      'let n = 0; process.stdin.on("data", (c) => (n += c.length)); ' +
        'process.stdin.on("end", () => console.log("eof", n));',
      { timeoutMs: 10_000 },
    );
    assert.equal(result.stdout.trim(), "eof 0");
    assert.equal(result.timedOut, false);
  });

  test("the working directory is honoured, also with spaces in the path", async (t) => {
    const dir = path.join(tempDir(t), "dir with spaces");
    fs.mkdirSync(dir);
    const result = await node("console.log(process.cwd())", { cwd: dir });
    assert.equal(fs.realpathSync(result.stdout.trim()), fs.realpathSync(dir));
  });

  test("a tool that runs too long is killed and reported as timed out", async () => {
    const started = Date.now();
    const result = await node("setInterval(() => {}, 1000)", { timeoutMs: 300, killGraceMs: 500 });
    assert.equal(result.timedOut, true);
    assert.equal(result.ok, false);
    assert.ok(Date.now() - started < 5_000, `took ${Date.now() - started} ms`);
  });

  test("a tool that ignores the polite signal is killed anyway", async () => {
    const started = Date.now();
    const result = await node(
      'process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 1000)',
      { timeoutMs: 500, killGraceMs: 500 },
    );
    assert.equal(result.timedOut, true);
    assert.ok(Date.now() - started < 6_000, `took ${Date.now() - started} ms`);
  });

  test("the time box also stops the tool's own child processes", async (t) => {
    const pidFile = path.join(tempDir(t), "grandchild.pid");
    const started = Date.now();
    const result = await node(
      toolStarting(foreverWritingPid(pidFile), pidFile, {
        stdio: "inherit",
        then: "setInterval(() => {}, 1000)",
      }),
      // Long enough for the grandchild to start on a busy machine.
      { timeoutMs: 5_000, killGraceMs: 500 },
    );
    assert.equal(result.timedOut, true);
    assert.ok(Date.now() - started < 15_000, `took ${Date.now() - started} ms`);
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.ok(await processGone(pid, 10_000), `grandchild ${pid} is still running`);
  });

  test("a helper that keeps the tool's output pipes open does not hold a finished run", async (t) => {
    const pidFile = path.join(tempDir(t), "helper.pid");
    const started = Date.now();
    // `cmd &` in a script, or a daemon started with inherited stdio: the tool itself exits 0 at
    // once; its helper keeps stdout and stderr open and runs forever.
    const result = await node(
      toolStarting(foreverWritingPid(pidFile), pidFile, {
        stdio: "inherit",
        then: 'console.log("checked"), process.exit(0)',
      }),
      { timeoutMs: 60_000 },
    );
    const elapsed = Date.now() - started;
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    if (IS_WINDOWS) cleanUp(t, pid);
    assert.equal(result.ok, true, result.output);
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.equal(result.stdout, "checked\n");
    // Without the exit grace period the run would last the whole 60 s time box.
    assert.ok(elapsed < 20_000, `the run took ${elapsed} ms`);
    if (!IS_WINDOWS) assert.ok(await processGone(pid, 5_000), `helper ${pid} is still running`);
  });

  test("a run that ended inside the time box is not reported as timed out during the grace period", async (t) => {
    // The tool exits at once. Its helper holds the pipes until the test releases it, after the
    // end of the time box but inside the (long) exit grace period.
    const release = path.join(tempDir(t), "release");
    const helper = `const w = () => require("fs").existsSync(${JSON.stringify(release)}) ? process.exit(0) : setTimeout(w, 20); w();`;
    const timeoutMs = 6_000;
    const running = node(
      `require("child_process").spawn(process.execPath, ["-e", ${JSON.stringify(helper)}], ` +
        '{ stdio: "inherit" }).unref(); process.exit(0);',
      { timeoutMs, exitGraceMs: 60_000 },
    );
    await sleep(timeoutMs + 1_500);
    fs.writeFileSync(release, "");
    const result = await running;
    assert.equal(result.timedOut, false);
    assert.equal(result.ok, true, result.output);
  });

  test(
    "a background process the tool leaves behind is stopped when the run ends",
    { skip: POSIX_GROUPS_ONLY },
    async (t) => {
      const pidFile = path.join(tempDir(t), "background.pid");
      const result = await node(
        toolStarting(foreverWritingPid(pidFile), pidFile, {
          stdio: "ignore",
          then: "process.exit(0)",
        }),
        { timeoutMs: 30_000 },
      );
      assert.equal(result.ok, true, result.output);
      const pid = Number(fs.readFileSync(pidFile, "utf8"));
      assert.ok(await processGone(pid, 5_000), `background process ${pid} outlived the run`);
    },
  );

  test("stopAllTools ends a running tool together with the processes it started", async (t) => {
    const pidFile = path.join(tempDir(t), "grandchild.pid");
    const running = node(
      toolStarting(foreverWritingPid(pidFile), pidFile, {
        stdio: "ignore",
        then: "setInterval(() => {}, 1000)",
      }),
      { timeoutMs: 60_000 },
    );
    const pid = await waitForPid(pidFile);
    stopAllTools();
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(result.timedOut, false);
    assert.ok(await processGone(pid, 10_000), `grandchild ${pid} is still running`);
  });

  test("output beyond the cap keeps the newest bytes", async () => {
    const result = await node(
      'const line = "x".repeat(1023) + "\\n"; for (let i = 0; i < 3000; i++) process.stdout.write(line); ' +
        'process.stdout.write("LAST\\n");',
      { maxBufferBytes: 64 * 1024 },
    );
    assert.equal(result.truncated, true);
    assert.ok(result.stdout.length <= 64 * 1024);
    assert.ok(result.stdout.endsWith("LAST\n"));
  });
});

describe("output helpers", () => {
  test("stripAnsi removes colour and hyperlink sequences", () => {
    assert.equal(
      stripAnsi("\u001b[31merror\u001b[39m \u001b]8;;https://x\u0007link\u001b]8;;\u0007"),
      "error link",
    );
  });

  test("lastLines keeps the tail", () => {
    assert.equal(lastLines("a\nb\nc\n", 2), "b\nc");
    assert.equal(lastLines("a\r\nb", 5), "a\nb");
  });
});

describe("through the entry point", () => {
  test("a tool's stdout never reaches the hook's stdout; the handler reports it on stderr", async (t) => {
    const project = makeProject(t, {
      "node_modules/fake-lint/package.json": { name: "fake-lint", bin: { "fake-lint": "cli.js" } },
      "node_modules/fake-lint/cli.js":
        'process.stdout.write("TOOL-STDOUT src/a.ts:1 rule-x message\\n");\n' +
        'process.stderr.write("TOOL-STDERR " + process.env.PAO_DISABLE + "\\n");\n' +
        "process.exitCode = 1;\n",
    });
    const plugin = copyPlugin(t);
    const lib = (name) => JSON.stringify(fileUrl(path.join(plugin.root, "scripts", "lib", name)));
    plugin.replaceHandler(
      "PostToolUse",
      `import { resolveNodeBin } from ${lib("resolve-tool.mjs")};\n` +
        `import { runTool } from ${lib("spawn.mjs")};\n` +
        "export default async (ctx) => {\n" +
        '  const tool = resolveNodeBin({ pkg: "fake-lint", from: ctx.projectRoot });\n' +
        "  const result = await runTool({ command: tool.command, args: tool.args, cwd: ctx.projectRoot,\n" +
        "    timeoutMs: ctx.budget.timeoutFor(10000) });\n" +
        "  return result.ok ? { exitCode: 0 } : { exitCode: 2, stderr: result.output };\n" +
        "};\n",
    );
    const result = await runHook({
      event: "PostToolUse",
      stdin: stdinFixture("post-tool-use/edit", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "TOOL-STDOUT src/a.ts:1 rule-x message\nTOOL-STDERR 1\n");
  });
});

describe("tools do not outlive the hook", () => {
  /**
   * A Stop handler that starts a tool which starts a grandchild (writing its pid to `pidFile`),
   * then never finishes.
   */
  function hangingGateHandler(plugin, pidFile) {
    const spawnModule = fileUrl(path.join(plugin.root, "scripts", "lib", "spawn.mjs"));
    const toolSource = toolStarting(foreverWritingPid(pidFile), pidFile, {
      stdio: "ignore",
      then: "setInterval(() => {}, 1000)",
    });
    plugin.replaceHandler(
      "Stop",
      `import { runTool } from ${JSON.stringify(spawnModule)};\n` +
        "export default (ctx) => {\n" +
        `  runTool({ command: process.execPath, args: ["-e", ${JSON.stringify(toolSource)}], cwd: ctx.cwd, timeoutMs: 600000 });\n` +
        "  return new Promise(() => {});\n" +
        "};\n",
    );
  }

  test("the watchdog stops the tool and the processes the tool started", async (t) => {
    const plugin = copyPlugin(t);
    const pidFile = path.join(tempDir(t), "grandchild.pid");
    hangingGateHandler(plugin, pidFile);
    const project = makeProject(t, {
      ".cross-stack/standard.json": {
        version: "0.0.0",
        tracks: ["web"],
        // Leave time for the tool and grandchild to start before the hook watchdog fires.
        hooks: { stop: { budgetSeconds: 5 } },
      },
    });
    const result = await runHook({
      event: "Stop",
      stdin: stdinFixture("stop/stop", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.match(result.json?.systemMessage ?? "", /ran past its time limit/);
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.ok(await processGone(pid, 10_000), `grandchild ${pid} was left running`);
  });

  test(
    "a hook killed with SIGKILL, where no handler runs, takes its tools' process groups with it",
    { skip: POSIX_GROUPS_ONLY },
    async (t) => {
      const plugin = copyPlugin(t);
      const pidFile = path.join(tempDir(t), "grandchild.pid");
      hangingGateHandler(plugin, pidFile);
      const project = makeProject(t);
      const hook = spawn(process.execPath, [plugin.entry, "Stop"], {
        cwd: project.root,
        env: cleanEnv({ CLAUDE_PROJECT_DIR: project.root, CLAUDE_PLUGIN_ROOT: plugin.root }),
        stdio: ["pipe", "ignore", "ignore"],
        shell: false,
      });
      hook.stdin.end(JSON.stringify(stdinFixture("stop/stop", fixtureVars(project.root))));
      const exited = new Promise((resolve) => hook.on("exit", resolve));
      const pid = await waitForPid(pidFile);
      // The reaper starts once a tool has run for REAPER_DELAY_MS.
      await sleep(REAPER_DELAY_MS + 1_000);
      hook.kill("SIGKILL");
      await exited;
      assert.ok(await processGone(pid, 10_000), `grandchild ${pid} outlived the killed hook`);
    },
  );

  test("the reaper neither keeps a finished hook alive nor outlives it", async (t) => {
    const plugin = copyPlugin(t);
    const spawnModule = fileUrl(path.join(plugin.root, "scripts", "lib", "spawn.mjs"));
    const toolMs = REAPER_DELAY_MS + 500;
    plugin.replaceHandler(
      "PostToolUse",
      `import { reaperPid, runTool } from ${JSON.stringify(spawnModule)};\n` +
        "export default async (ctx) => {\n" +
        `  const result = await runTool({ command: process.execPath, args: ["-e", "setTimeout(() => {}, ${toolMs})"], cwd: ctx.cwd });\n` +
        '  return { exitCode: 2, stderr: `${result.exitCode} ${reaperPid() ?? "none"}\\n` };\n' +
        "};\n",
    );
    const project = makeProject(t);
    const result = await runHook({
      event: "PostToolUse",
      stdin: stdinFixture("post-tool-use/edit", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assert.equal(result.exitCode, 2, result.stdout + result.stderr);
    const [exitCode, reaper] = result.stderr.trim().split(" ");
    assert.equal(exitCode, "0");
    // A reaper that kept the hook alive would hold it until runHook's 30 s limit.
    assert.ok(result.durationMs < toolMs + 15_000, `the hook took ${result.durationMs} ms`);
    if (IS_WINDOWS) {
      assert.equal(reaper, "none", "no reaper on Windows");
      return;
    }
    assert.match(reaper, /^\d+$/, "a reaper was started for a tool that ran past the delay");
    assert.ok(await processGone(Number(reaper), 5_000), `reaper ${reaper} outlived the hook`);
  });
});

describe("the hook scripts stay portable and offline", () => {
  const scriptsDir = path.join(PLUGIN_DIR, "scripts");
  const files = fs
    .readdirSync(scriptsDir, { recursive: true })
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => path.join(scriptsDir, name));

  test("no shell, no npx, no package-manager download, Node.js built-ins only", () => {
    assert.ok(files.length >= 10, files.join("\n"));
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(PLUGIN_DIR, file);
      assert.doesNotMatch(text, /shell:\s*true/, `${rel}: shell: true`);
      assert.doesNotMatch(
        text,
        /import\s*\{[^}]*\bexec(?:Sync)?\b[^}]*\}\s*from\s*["'](?:node:)?child_process["']|child_process\.exec(?:Sync)?\(/,
        `${rel}: exec and execSync always run a shell`,
      );
      // Starting npx, not naming it (the command inspection of PreToolUse lists it).
      assert.doesNotMatch(
        text,
        /\b(?:spawn|spawnSync|execFile|execFileSync|runTool)\(\s*["'`]npx|\bcommand:\s*["'`]npx/,
        `${rel}: runs npx`,
      );
      for (const [, specifier] of text.matchAll(/^\s*import\s[^"']*["']([^"']+)["']/gm)) {
        assert.match(specifier, /^(?:node:|\.\.?\/)/, `${rel}: imports ${specifier}`);
      }
    }
  });
});
