/**
 * The single entry point: hooks.json routing, input parsing, dispatch and failing open.
 * Every behaviour is checked by running plugins/cross-stack-standard/scripts/hook.mjs with a
 * stdin fixture and asserting its exit code, stdout and stderr.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, test } from "node:test";

import { matcherCovers, checkHookGate } from "../../scripts/lib/gate-presence/hook.mjs";
import { resolveLocations } from "../../scripts/lib/gate-presence/locations.mjs";
import {
  copyPlugin,
  importPlugin,
  makeProject,
  PLUGIN_DIR,
  PLUGIN_ROOT_ENV,
  projectFixture,
  REPO_ROOT,
  tempDir,
  TESTING_PLUGIN_COPY,
} from "./helpers/project.mjs";
import {
  cleanEnv,
  ENTRY,
  EVENT_FIXTURES,
  fileUrl,
  fixtureVars,
  invalidStdinFixture,
  processGone,
  runHook,
  stdinFixture,
} from "./helpers/run-hook.mjs";

const { HANDLERS } = await importPlugin("scripts/hook.mjs");
const { maxWatchdogMs, watchdogMs } = await importPlugin("scripts/lib/budget.mjs");
const { SCHEMA_FILE, VALIDATOR_FILE } = await importPlugin("scripts/lib/manifest.mjs");
const { PROTECTED_PATHS_FILE } = await importPlugin("scripts/lib/formatters.mjs");
const { realPath } = await importPlugin("scripts/lib/project.mjs");

const HOOKS_JSON = path.join(PLUGIN_DIR, "hooks", "hooks.json");
const hooksConfig = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8"));
const schema = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_DIR, "data", "standard.schema.json"), "utf8"),
);
const ENTRY_REF = "${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs";
const EVENTS = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "UserPromptSubmit",
];
const COMPANION_MATCHER =
  "mcp__plugin_playwright-mcp_playwright__.*|mcp__plugin_chrome-devtools-mcp_chrome-devtools__.*|mcp__plugin_figma_figma__.*";

function assertSilent(result, label = "") {
  assert.equal(result.exitCode, 0, `${label} exit code\n${result.stdout}${result.stderr}`);
  assert.equal(result.stdout, "", `${label} stdout`);
  assert.equal(result.stderr, "", `${label} stderr`);
}

function assertNotice(result, pattern) {
  assert.equal(result.exitCode, 0, `${result.stdout}${result.stderr}`);
  assert.equal(result.stderr, "");
  assert.ok(result.json, `stdout is one JSON object: ${JSON.stringify(result.stdout)}`);
  assert.deepEqual(Object.keys(result.json), ["systemMessage"]);
  assert.match(result.json.systemMessage, /^Cross-Stack Standard: /);
  assert.match(result.json.systemMessage, pattern);
  assert.equal(result.stdout.trim().split("\n").length, 1, "one line of JSON");
}

/** A PreToolUse run that could not load its protection: `ask`, never a silent pass. */
function assertProtectionUnavailable(result) {
  assert.equal(result.exitCode, 0, `${result.stdout}${result.stderr}`);
  assert.equal(result.stderr, "");
  assert.ok(result.json, `stdout is one JSON object: ${JSON.stringify(result.stdout)}`);
  const output = result.json.hookSpecificOutput;
  assert.equal(output?.hookEventName, "PreToolUse");
  assert.equal(output.permissionDecision, "ask");
  assert.match(output.permissionDecisionReason, /^Cross-Stack Standard: /);
  assert.match(output.permissionDecisionReason, /protection check could not complete/);
  return output;
}

/**
 * A replacement handler that reports the paths the entry point resolved, as a notice, so a
 * test can check them through the real entry point.
 */
const PROBE_HANDLER =
  "export default async (ctx) => ({ json: { systemMessage: JSON.stringify({\n" +
  "  projectDir: ctx.projectDir, projectRoot: ctx.projectRoot,\n" +
  "  manifest: ctx.manifest ? ctx.manifest.path : null,\n" +
  "  repositoryRoot: ctx.repositoryRoot ?? null, searchDirs: ctx.searchDirs,\n" +
  "}) } });\n";

/** True when `target` is `dir` or inside it. */
function isInside(dir, target) {
  const rel = path.relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

describe("plugin under test", () => {
  test(`is the repository's plugin folder, or the copy that ${PLUGIN_ROOT_ENV} names`, (t) => {
    t.diagnostic(`plugin under test: ${PLUGIN_DIR}${TESTING_PLUGIN_COPY ? " (a copy)" : ""}`);
    assert.ok(fs.statSync(HOOKS_JSON).isFile());
    assert.equal(ENTRY, path.join(PLUGIN_DIR, "scripts", "hook.mjs"), "runHook uses this plugin");
    if (TESTING_PLUGIN_COPY) {
      assert.ok(
        !isInside(fs.realpathSync(REPO_ROOT), PLUGIN_DIR),
        `${PLUGIN_ROOT_ENV} must name a copy outside the repository: ${PLUGIN_DIR}`,
      );
    }
  });

  test("every relative import of the hook scripts resolves inside the plugin folder", () => {
    // An installed plugin is a copy of its folder only: a module outside it does not exist there.
    const scriptsDir = path.join(PLUGIN_DIR, "scripts");
    const files = fs
      .readdirSync(scriptsDir, { recursive: true })
      .filter((name) => name.endsWith(".mjs"))
      .map((name) => path.join(scriptsDir, name));
    let checked = 0;
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const specifiers = [
        ...text.matchAll(/^\s*import\s[^"';]*["'](\.\.?\/[^"']+)["']/gm),
        ...text.matchAll(/\bimport\(\s*["'](\.\.?\/[^"']+)["']/g),
      ].map((match) => match[1]);
      for (const specifier of specifiers) {
        const target = path.resolve(path.dirname(file), specifier);
        const where = `${path.relative(PLUGIN_DIR, file)} imports ${specifier}`;
        assert.ok(isInside(PLUGIN_DIR, target), `${where}: outside the plugin folder`);
        assert.ok(fs.statSync(target).isFile(), `${where}: missing`);
        checked += 1;
      }
    }
    assert.ok(checked >= 20, `only ${checked} relative imports found`);
  });

  test("the data files and the settings validator the hooks load ship inside the plugin", async () => {
    for (const file of [SCHEMA_FILE, VALIDATOR_FILE, PROTECTED_PATHS_FILE]) {
      assert.ok(isInside(PLUGIN_DIR, file), `${file} is outside the plugin folder`);
      assert.ok(fs.statSync(file).isFile(), `${file} is missing`);
    }
    // manifest.mjs validates hook settings with this export of the kit tool; without it, every
    // hook setting in a project's manifest would be ignored (with a notice).
    const validator = await import(fileUrl(VALIDATOR_FILE));
    assert.equal(typeof validator.validateAgainstSchema, "function");
  });
});

describe("hooks.json", () => {
  const groups = (event) => hooksConfig.hooks[event] ?? [];
  const allHooks = () =>
    Object.entries(hooksConfig.hooks).flatMap(([event, list]) =>
      list.flatMap((group) => group.hooks.map((hook) => ({ event, group, hook }))),
    );

  test("registers exactly the six events of the Standard", () => {
    assert.deepEqual(Object.keys(hooksConfig).sort(), ["description", "hooks"]);
    assert.deepEqual(Object.keys(hooksConfig.hooks).sort(), [...EVENTS].sort());
  });

  test("every entry runs node on the single entry point in exec form, naming its own event", () => {
    const entries = allHooks();
    assert.ok(entries.length >= EVENTS.length);
    for (const { event, hook } of entries) {
      assert.deepEqual(Object.keys(hook).sort(), ["args", "command", "timeout", "type"], event);
      assert.equal(hook.type, "command", event);
      assert.equal(hook.command, "node", `${event}: exec form needs a real executable`);
      assert.deepEqual(hook.args, [ENTRY_REF, event], `${event} bypasses the entry point`);
    }
    assert.ok(fs.statSync(path.join(PLUGIN_DIR, "scripts", "hook.mjs")).isFile());
  });

  test("matchers use the verified event sources and tool names", () => {
    assert.deepEqual(
      groups("SessionStart").map((group) => group.matcher),
      ["startup|resume|clear|compact|fork"],
    );
    assert.deepEqual(
      groups("PreToolUse")
        .map((group) => group.matcher)
        .sort(),
      ["Bash|PowerShell", "Edit|Write|NotebookEdit", "Skill", COMPANION_MATCHER],
    );
    assert.deepEqual(
      groups("PostToolUse").map((group) => group.matcher),
      ["Edit|Write|NotebookEdit", COMPANION_MATCHER],
    );
    assert.deepEqual(
      groups("PostToolUseFailure").map((group) => group.matcher),
      [COMPANION_MATCHER],
    );
    assert.deepEqual(
      groups("Stop").map((group) => group.matcher),
      [undefined],
      "Stop takes no matcher",
    );
    assert.deepEqual(
      groups("UserPromptSubmit").map((group) => group.matcher),
      [undefined],
      "UserPromptSubmit takes no matcher",
    );
    for (const { group } of allHooks()) {
      assert.doesNotMatch(String(group.matcher ?? ""), /MultiEdit/, "MultiEdit is legacy");
    }
  });

  test("matchers select the intended tools and sources, following the documented rules", () => {
    const covers = (event, name) =>
      groups(event).some((group) => matcherCovers(group.matcher, name));
    for (const source of ["startup", "resume", "clear", "compact", "fork"]) {
      assert.ok(covers("SessionStart", source), source);
    }
    for (const tool of ["Edit", "Write", "NotebookEdit", "Bash", "PowerShell"]) {
      assert.ok(covers("PreToolUse", tool), `PreToolUse ${tool}`);
    }
    for (const tool of ["Edit", "Write", "NotebookEdit"]) {
      assert.ok(covers("PostToolUse", tool), `PostToolUse ${tool}`);
    }
    for (const tool of [
      "mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page",
      "mcp__plugin_figma_figma__use_figma",
    ]) {
      for (const event of ["PreToolUse", "PostToolUse", "PostToolUseFailure"]) {
        assert.ok(covers(event, tool), `${event} ${tool}`);
      }
    }
    assert.ok(!covers("PreToolUse", "mcp__github__create_issue"));
    assert.ok(covers("PreToolUse", "Skill"), "companion skills are gated before use");
    for (const tool of ["Read", "Bash", "Glob", "MultiEdit"]) {
      assert.ok(!covers("PostToolUse", tool), `PostToolUse must not cover ${tool}`);
    }
    assert.ok(!covers("PreToolUse", "Read"));
  });

  test("each timeout sits above the largest in-script watchdog of its event", () => {
    const maxBudget = Math.max(
      schema.properties.hooks.properties.stop.properties.budgetSeconds.maximum,
      schema.properties.hooks.properties.postToolUse.properties.budgetSeconds.maximum,
    );
    for (const { event, hook } of allHooks()) {
      const limit = maxWatchdogMs(event, maxBudget);
      assert.ok(
        hook.timeout * 1000 > limit,
        `${event}: timeout ${hook.timeout} s must exceed the ${limit} ms watchdog`,
      );
      assert.ok(watchdogMs(event, undefined) <= limit, `${event}: default watchdog within max`);
    }
  });

  test("every event has a handler module", () => {
    assert.deepEqual(Object.keys(HANDLERS).sort(), [...EVENTS].sort());
    for (const file of Object.values(HANDLERS)) {
      const absolute = path.join(PLUGIN_DIR, "scripts", file);
      assert.ok(fs.statSync(absolute).isFile(), file);
    }
  });

  test("the registry's hook gates find their routing (gate-presence adapter)", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "registry/rules.json"), "utf8"),
    );
    const rules = (registry.rules ?? registry).filter((rule) => rule.gate?.kind === "hook");
    assert.ok(rules.length > 0, "the registry has hook gates");
    const ctx = { root: REPO_ROOT, locations: resolveLocations() };
    for (const rule of rules) {
      const result = checkHookGate(rule.gate, rule, ctx);
      assert.equal(result.present, true, `${rule.id}: ${result.evidence}`);
    }
    for (const [id, discriminator] of [
      ["PreToolUse", "Bash"],
      ["PreToolUse", "PowerShell"],
      ["PostToolUse", "NotebookEdit"],
      ["SessionStart", undefined],
    ]) {
      const result = checkHookGate({ kind: "hook", id, discriminator }, {}, ctx);
      assert.equal(result.present, true, `${id}/${discriminator}: ${result.evidence}`);
    }
  });
});

describe("dispatch", () => {
  for (const [event, fixtures] of Object.entries(EVENT_FIXTURES)) {
    for (const fixture of fixtures) {
      test(`${fixture}: exit 0 and no output in a project with nothing to report`, async (t) => {
        const project = makeProject(t, { "README.md": "# Notes\n" });
        const result = await runHook({
          event,
          stdin: stdinFixture(fixture, fixtureVars(project.root)),
          projectDir: project.root,
        });
        assertSilent(result, fixture);
      });
    }
  }

  test("without an event argument, the input's hook_event_name selects the handler", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const stdin = stdinFixture("session-start/startup", fixtureVars(project.root));
    const result = await runHook({ stdin, projectDir: project.root });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Tracks: laravel/m);
  });

  test("the event argument wins over hook_event_name", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const stdin = stdinFixture("session-start/startup", fixtureVars(project.root));
    const result = await runHook({ event: "Stop", stdin, projectDir: project.root });
    assertSilent(result);
  });

  test("an unknown event fails open with a notice", async (t) => {
    const project = makeProject(t);
    const stdin = stdinFixture("stop/stop", fixtureVars(project.root));
    assertNotice(
      await runHook({ event: "Notification", stdin, projectDir: project.root }),
      /unknown hook event "Notification"/,
    );
    const { hook_event_name: _name, ...anonymous } = stdin;
    assertNotice(
      await runHook({ stdin: anonymous, projectDir: project.root }),
      /unknown hook event null/,
    );
  });
});

describe("input", () => {
  for (const [name, reason] of [
    ["truncated", /input is not valid JSON/],
    ["array", /input is not a JSON object/],
    ["empty", /empty input/],
  ]) {
    test(`${name} stdin fails open with a notice (exit 0, JSON systemMessage)`, async (t) => {
      const project = makeProject(t);
      for (const event of EVENTS) {
        const result = await runHook({
          event,
          stdin: invalidStdinFixture(name),
          projectDir: project.root,
        });
        assertNotice(result, reason);
      }
    });
  }

  test("unreadable stdin in an opted-out project stays silent", async (t) => {
    const project = makeProject(t, { "CLAUDE.md": "cross-stack-standard: declined\n" });
    for (const event of EVENTS) {
      const result = await runHook({
        event,
        stdin: invalidStdinFixture("truncated"),
        projectDir: project.root,
      });
      assertSilent(result, event);
    }
  });

  test("a byte-order mark before the JSON is accepted", async (t) => {
    const project = makeProject(t, projectFixture("expo-app"));
    const stdin = `\uFEFF${JSON.stringify(stdinFixture("session-start/startup", fixtureVars(project.root)))}`;
    const result = await runHook({ event: "SessionStart", stdin, projectDir: project.root });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Tracks: mobile/m);
  });

  test("a relative cwd in the input resolves against the project directory", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    project.write("web/CLAUDE.md", "cross-stack-standard: declined\n");
    const stdin = stdinFixture("session-start/startup", fixtureVars(project.root, "web"));
    assertSilent(await runHook({ event: "SessionStart", stdin, projectDir: project.root }));
  });
});

describe("failing open", () => {
  const stopStdin = (project) => stdinFixture("stop/stop", fixtureVars(project.root));

  test("a handler that throws: exit 0 with a notice naming the event and the error", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler(
      "Stop",
      'export default async function () { throw new Error("boom"); }\n',
    );
    const project = makeProject(t);
    const result = await runHook({
      event: "Stop",
      stdin: stopStdin(project),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assertNotice(result, /the Stop hook failed \(boom\) and was skipped/);
  });

  test("an error thrown later, outside the handler's promise, also fails open", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler(
      "PostToolUse",
      "export default function () {\n" +
        '  setTimeout(() => { throw new TypeError("late failure"); }, 10);\n' +
        "  return new Promise(() => {});\n" +
        "}\n",
    );
    const project = makeProject(t);
    const result = await runHook({
      event: "PostToolUse",
      stdin: stdinFixture("post-tool-use/edit", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assertNotice(result, /the PostToolUse hook failed \(late failure\)/);
  });

  test("a handler module that fails to load fails open", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler("Stop", "export default function ( {\n");
    const project = makeProject(t);
    const result = await runHook({
      event: "Stop",
      stdin: stopStdin(project),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assertNotice(result, /the Stop hook failed \(.+\) and was skipped/);
  });

  test("a PreToolUse handler module that fails to load fails closed (ask)", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler("PreToolUse", "export default function ( {\n");
    const project = makeProject(t);
    const result = await runHook({
      event: "PreToolUse",
      stdin: stdinFixture("pre-tool-use/bash", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assertProtectionUnavailable(result);
  });

  test("a PreToolUse crash outside the handler fails closed (ask)", async (t) => {
    const plugin = copyPlugin(t);
    // Without the schema, resolving the hooks settings throws before the handler runs.
    fs.rmSync(path.join(plugin.root, "data", "standard.schema.json"));
    const project = makeProject(t);
    const result = await runHook({
      event: "PreToolUse",
      stdin: stdinFixture("pre-tool-use/bash", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assertProtectionUnavailable(result);
  });

  test("an asynchronous PreToolUse failure fails closed (ask)", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler(
      "PreToolUse",
      "export default function () {\n" +
        '  setTimeout(() => { throw new Error("boom"); }, 0);\n' +
        "  return new Promise(() => {});\n" +
        "}\n",
    );
    const project = makeProject(t);
    const result = await runHook({
      event: "PreToolUse",
      stdin: stdinFixture("pre-tool-use/bash", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    const output = assertProtectionUnavailable(result);
    assert.match(output.permissionDecisionReason, /boom/);
  });

  test("a PreToolUse run past its watchdog fails closed (ask)", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler("PreToolUse", "export default () => new Promise(() => {});\n");
    const project = makeProject(t);
    const result = await runHook({
      event: "PreToolUse",
      stdin: stdinFixture("pre-tool-use/bash", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    const output = assertProtectionUnavailable(result);
    assert.match(output.permissionDecisionReason, /time limit/);
    assert.ok(result.durationMs < 15_000, `stopped after ${result.durationMs} ms`);
  });

  test("missing plugin data fails open instead of breaking the session", async (t) => {
    const plugin = copyPlugin(t);
    fs.rmSync(path.join(plugin.root, "data", "standard.schema.json"));
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const result = await runHook({
      event: "SessionStart",
      stdin: stdinFixture("session-start/startup", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assertNotice(result, /the SessionStart hook failed \(ENOENT/);
  });

  test("the watchdog stops a handler that never finishes, and the tools it started", async (t) => {
    const plugin = copyPlugin(t);
    const pidFile = path.join(tempDir(t), "tool.pid");
    const spawnModule = fileUrl(path.join(plugin.root, "scripts", "lib", "spawn.mjs"));
    plugin.replaceHandler(
      "Stop",
      `import { runTool } from ${JSON.stringify(spawnModule)};\n` +
        "export default function (ctx) {\n" +
        "  runTool({\n" +
        "    command: process.execPath,\n" +
        `    args: ["-e", ${JSON.stringify(
          `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
        )}],\n` +
        "    cwd: ctx.cwd,\n" +
        "    timeoutMs: 600000,\n" +
        "  });\n" +
        "  return new Promise(() => {});\n" +
        "}\n",
    );
    const project = makeProject(t, {
      ".cross-stack/standard.json": {
        version: "0.0.0",
        tracks: ["web"],
        hooks: { stop: { budgetSeconds: 1 } },
      },
    });
    const result = await runHook({
      event: "Stop",
      stdin: stopStdin(project),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assertNotice(result, /the Stop hook ran past its time limit \(6 s\) and was stopped/);
    assert.ok(result.durationMs < 15_000, `stopped after ${result.durationMs} ms`);
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.ok(await processGone(pid, 10_000), `tool process ${pid} was left running`);
  });

  test("a handler's exit 2 passes through: stderr for Claude, stdout empty", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler(
      "PostToolUse",
      'export default async () => ({ exitCode: 2, stderr: "src/a.ts:3 no-console Unexpected console\\n" });\n',
    );
    const project = makeProject(t);
    const result = await runHook({
      event: "PostToolUse",
      stdin: stdinFixture("post-tool-use/write", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "src/a.ts:3 no-console Unexpected console\n");
  });

  test("a handler's JSON result is written as one line on stdout", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler(
      "PreToolUse",
      'export default async () => ({ json: { hookSpecificOutput: { hookEventName: "PreToolUse" } } });\n',
    );
    const project = makeProject(t);
    const result = await runHook({
      event: "PreToolUse",
      stdin: stdinFixture("pre-tool-use/edit", fixtureVars(project.root)),
      projectDir: project.root,
      entry: plugin.entry,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, '{"hookSpecificOutput":{"hookEventName":"PreToolUse"}}\n');
  });
});

describe("stopped by the platform", () => {
  test(
    "SIGTERM stops the tools the handler started and exits 0 without output",
    { skip: process.platform === "win32" ? "POSIX signals only" : false },
    async (t) => {
      const plugin = copyPlugin(t);
      const work = tempDir(t);
      const pidFile = path.join(work, "tool.pid");
      const spawnModule = fileUrl(path.join(plugin.root, "scripts", "lib", "spawn.mjs"));
      const toolSource = `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
      plugin.replaceHandler(
        "Stop",
        `import { runTool } from ${JSON.stringify(spawnModule)};\n` +
          "export default (ctx) => {\n" +
          `  runTool({ command: process.execPath, args: ["-e", ${JSON.stringify(toolSource)}], cwd: ctx.cwd, timeoutMs: 600000 });\n` +
          "  return new Promise(() => {});\n" +
          "};\n",
      );
      const project = makeProject(t);
      const child = spawn(process.execPath, [plugin.entry, "Stop"], {
        cwd: project.root,
        env: cleanEnv({ CLAUDE_PROJECT_DIR: project.root }),
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      const out = [];
      const err = [];
      child.stdout.on("data", (chunk) => out.push(chunk));
      child.stderr.on("data", (chunk) => err.push(chunk));
      const closed = new Promise((resolve) => child.on("close", (code) => resolve(code)));
      child.stdin.end(JSON.stringify(stdinFixture("stop/stop", fixtureVars(project.root))));
      const deadline = Date.now() + 10_000;
      while (!fs.existsSync(pidFile) || fs.readFileSync(pidFile, "utf8") === "") {
        assert.ok(Date.now() < deadline, "the tool never started");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const toolPid = Number(fs.readFileSync(pidFile, "utf8"));
      child.kill("SIGTERM");
      assert.equal(await closed, 0);
      assert.equal(Buffer.concat(out).toString("utf8"), "");
      assert.equal(Buffer.concat(err).toString("utf8"), "");
      assert.ok(await processGone(toolPid, 10_000), `tool ${toolPid} was left running`);
    },
  );
});

describe("bootstrap: the entry point protects itself", () => {
  /** A copy of the plugin with one lib module removed (a half-written update, say). */
  function pluginWithout(t, lib) {
    const plugin = copyPlugin(t);
    fs.rmSync(path.join(plugin.root, "scripts", "lib", lib));
    return plugin;
  }

  function runEvent(project, event, entry, env = {}) {
    return runHook({
      event,
      stdin: stdinFixture(EVENT_FIXTURES[event][0], fixtureVars(project.root)),
      projectDir: project.root,
      entry,
      env,
    });
  }

  test("hook.mjs imports nothing but node: built-ins before its guards run", () => {
    const text = fs.readFileSync(ENTRY, "utf8");
    const specifiers = [...text.matchAll(/^\s*import\s[^"';]*["']([^"']+)["']/gm)].map(
      (match) => match[1],
    );
    assert.ok(specifiers.length > 0, "the entry point has imports");
    for (const specifier of specifiers) {
      assert.match(specifier, /^node:/, `static import of ${specifier}`);
    }
  });

  test("CROSS_STACK_STANDARD_DISABLE ends the run before stdin is read", async (t) => {
    const project = makeProject(t, { "CLAUDE.md": "# Project\n" });
    for (const value of ["1", "true", " YES ", "on"]) {
      const started = Date.now();
      const child = spawn(process.execPath, [ENTRY, "PreToolUse"], {
        cwd: project.root,
        env: cleanEnv({ CLAUDE_PROJECT_DIR: project.root, CROSS_STACK_STANDARD_DISABLE: value }),
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      const out = [];
      const err = [];
      child.stdout.on("data", (chunk) => out.push(chunk));
      child.stderr.on("data", (chunk) => err.push(chunk));
      child.stdin.on("error", () => {});
      // stdin stays open: a hook that waited for it would sit out the whole stdin timeout.
      const guard = setTimeout(() => child.kill("SIGKILL"), 20_000);
      const code = await new Promise((resolve) => child.on("close", (exit) => resolve(exit)));
      clearTimeout(guard);
      child.stdin.destroy();
      const elapsed = Date.now() - started;
      assert.equal(code, 0, `${JSON.stringify(value)}: exit code`);
      assert.equal(Buffer.concat(out).toString("utf8"), "", `${JSON.stringify(value)}: stdout`);
      assert.equal(Buffer.concat(err).toString("utf8"), "", `${JSON.stringify(value)}: stderr`);
      assert.ok(elapsed < 5_000, `${JSON.stringify(value)}: exited after ${elapsed} ms`);
    }
  });

  test("a missing lib module: silent when the environment opts out", async (t) => {
    const plugin = pluginWithout(t, "resolve-tool.mjs");
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    for (const event of EVENTS) {
      const result = await runEvent(project, event, plugin.entry, {
        CROSS_STACK_STANDARD_DISABLE: "1",
      });
      assertSilent(result, event);
    }
  });

  test("a missing lib module: silent when a memory file opts out", async (t) => {
    const plugin = pluginWithout(t, "resolve-tool.mjs");
    const project = makeProject(t, {
      ...projectFixture("laravel-next-monorepo"),
      "CLAUDE.md": "cross-stack-standard: declined\n",
    });
    for (const event of EVENTS) assertSilent(await runEvent(project, event, plugin.entry), event);
  });

  test("a missing lib module fails open with a notice", async (t) => {
    const plugin = pluginWithout(t, "resolve-tool.mjs");
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    for (const event of ["SessionStart", "PostToolUse", "Stop"]) {
      const result = await runEvent(project, event, plugin.entry);
      assertNotice(result, new RegExp(`the ${event} hook failed \\(ERR_MODULE_NOT_FOUND`));
      assert.match(result.json.systemMessage, /reinstalling the plugin/i);
    }
  });

  test("a missing opt-out module fails open with a notice", async (t) => {
    const plugin = pluginWithout(t, "opt-out.mjs");
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    assertNotice(
      await runEvent(project, "SessionStart", plugin.entry),
      /the SessionStart hook failed \(ERR_MODULE_NOT_FOUND/,
    );
  });

  for (const lib of ["resolve-tool.mjs", "opt-out.mjs", "io.mjs", "protect.mjs"]) {
    test(`PreToolUse without lib/${lib} fails closed (ask)`, async (t) => {
      const plugin = pluginWithout(t, lib);
      const project = makeProject(t, projectFixture("laravel-next-monorepo"));
      assertProtectionUnavailable(await runEvent(project, "PreToolUse", plugin.entry));
    });
  }
});

describe("project paths: the manifest comes from the project, never from the working directory", () => {
  /** Runs the probe handler (as Stop) and returns the paths the entry point resolved. */
  async function probe(t, { projectDir, cwd = projectDir, plugin }) {
    const result = await runHook({
      event: "Stop",
      stdin: stdinFixture("stop/stop", fixtureVars(projectDir, cwd)),
      projectDir,
      entry: plugin.entry,
    });
    assert.equal(result.exitCode, 0, `${result.stdout}${result.stderr}`);
    assert.ok(result.json?.systemMessage, `probe output: ${result.stdout}${result.stderr}`);
    return JSON.parse(result.json.systemMessage);
  }

  function probePlugin(t) {
    const plugin = copyPlugin(t);
    plugin.replaceHandler("Stop", PROBE_HANDLER);
    return plugin;
  }

  const MANIFEST = { version: "1.0.0", tracks: ["web"] };

  test("a working directory outside the project never supplies the manifest", async (t) => {
    const plugin = probePlugin(t);
    const project = makeProject(t, { ".cross-stack/standard.json": MANIFEST });
    const elsewhere = makeProject(t, {
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["mobile"] },
    });
    const paths = await probe(t, { projectDir: project.root, cwd: elsewhere.root, plugin });
    assert.equal(realPath(paths.manifest), realPath(project.path(".cross-stack/standard.json")));
    assert.equal(realPath(paths.projectRoot), realPath(project.root));
    assert.ok(
      paths.searchDirs.every((dir) => isInside(realPath(project.root), realPath(dir))),
      `memory files are read inside the project only: ${paths.searchDirs.join(", ")}`,
    );
  });

  test("a nested checkout's manifest below the project does not replace the project's", async (t) => {
    const plugin = probePlugin(t);
    const project = makeProject(t, {
      ".cross-stack/standard.json": MANIFEST,
      "third-party/tool/.cross-stack/standard.json": { version: "1.0.0", tracks: ["laravel"] },
      "third-party/tool/src/index.js": "export {};\n",
    });
    const paths = await probe(t, {
      projectDir: project.root,
      cwd: project.path("third-party/tool/src"),
      plugin,
    });
    assert.equal(realPath(paths.manifest), realPath(project.path(".cross-stack/standard.json")));
    assert.equal(realPath(paths.projectRoot), realPath(project.root));
    assert.deepEqual(paths.searchDirs.map(realPath), [
      realPath(project.path("third-party/tool/src")),
      realPath(project.path("third-party/tool")),
      realPath(project.path("third-party")),
      realPath(project.root),
    ]);
  });

  test("a session started in a package directory finds the repository root's manifest", async (t) => {
    const plugin = probePlugin(t);
    const repo = makeProject(t, {
      ".git/HEAD": "ref: refs/heads/main\n",
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["laravel", "web"] },
      "apps/web/package.json": { name: "web" },
    });
    const paths = await probe(t, { projectDir: repo.path("apps/web"), plugin });
    assert.equal(realPath(paths.repositoryRoot), realPath(repo.root));
    assert.equal(realPath(paths.manifest), realPath(repo.path(".cross-stack/standard.json")));
    assert.equal(realPath(paths.projectRoot), realPath(repo.root));
    assert.equal(realPath(paths.projectDir), realPath(repo.path("apps/web")));
    assert.deepEqual(
      paths.searchDirs.map(realPath),
      [realPath(repo.path("apps/web"))],
      "memory files: project only",
    );
  });

  test("a .git file (a worktree or a submodule) marks the repository root too", async (t) => {
    const plugin = probePlugin(t);
    const repo = makeProject(t, {
      ".git": "gitdir: ../main/.git/worktrees/feature\n",
      ".cross-stack/standard.json": MANIFEST,
      "web/src/.keep": "",
    });
    const paths = await probe(t, { projectDir: repo.path("web"), plugin });
    assert.equal(realPath(paths.repositoryRoot), realPath(repo.root));
    assert.equal(realPath(paths.manifest), realPath(repo.path(".cross-stack/standard.json")));
  });

  test("without an enclosing repository, the search stops at the project directory", async (t) => {
    const plugin = probePlugin(t);
    const parent = makeProject(t, { ".cross-stack/standard.json": MANIFEST });
    const project = makeProject(
      t,
      { "README.md": "# App\n" },
      { parent: parent.root, name: "app" },
    );
    const paths = await probe(t, { projectDir: project.root, plugin });
    assert.equal(paths.repositoryRoot, null);
    assert.equal(paths.manifest, null);
    assert.equal(realPath(paths.projectRoot), realPath(project.root));
  });

  test("the nearest repository root wins (a nested repository is its own root)", async (t) => {
    const plugin = probePlugin(t);
    const outer = makeProject(t, {
      ".git/HEAD": "ref: refs/heads/main\n",
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["mobile"] },
      "vendor-src/lib/.git/HEAD": "ref: refs/heads/main\n",
      "vendor-src/lib/pkg/.keep": "",
    });
    const paths = await probe(t, { projectDir: outer.path("vendor-src/lib/pkg"), plugin });
    assert.equal(realPath(paths.repositoryRoot), realPath(outer.path("vendor-src/lib")));
    assert.equal(paths.manifest, null, "the outer repository's manifest is not this project's");
  });

  test(
    "a working directory reached through a link that leads outside the project",
    { skip: process.platform === "win32" ? "directory links need extra rights here" : false },
    async (t) => {
      const plugin = probePlugin(t);
      const outside = makeProject(t, {
        ".cross-stack/standard.json": { version: "1.0.0", tracks: ["mobile"] },
      });
      const project = makeProject(t, { ".cross-stack/standard.json": MANIFEST, "api/.keep": "" });
      fs.symlinkSync(outside.root, project.path("api/tools"), "junction");
      const paths = await probe(t, {
        projectDir: project.root,
        cwd: project.path("api/tools"),
        plugin,
      });
      assert.equal(realPath(paths.manifest), realPath(project.path(".cross-stack/standard.json")));
      assert.deepEqual(paths.searchDirs.map(realPath), [
        realPath(project.path("api")),
        realPath(project.root),
      ]);
    },
  );
});

describe("project paths: the Stop gate runs the project's own check", () => {
  /** A project whose check:fast writes RAN into its directory and exits with `exitCode`. */
  function gateProject(t, exitCode, extra = {}) {
    return makeProject(t, {
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["web"] },
      "package.json": {
        name: "gate",
        version: "1.0.0",
        private: true,
        scripts: { "check:fast": "node check.cjs" },
      },
      "check.cjs":
        'require("fs").writeFileSync(require("path").join(__dirname, "RAN"), "");\n' +
        `process.exit(${exitCode});\n`,
      "src/index.js": "export {};\n",
      ...extra,
    });
  }

  function runStopIn(t, project, cwd) {
    return runHook({
      event: "Stop",
      stdin: stdinFixture("stop/stop", fixtureVars(project.root, cwd)),
      projectDir: project.root,
      dataDir: path.join(tempDir(t, "cross-stack-data-"), "data"),
      env: { npm_config_cache: path.join(tempDir(t, "cross-stack-npm-"), "cache") },
      timeoutMs: 60_000,
    });
  }

  test("a working directory with a foreign manifest: the project's gate runs", async (t) => {
    const project = gateProject(t, 1);
    const foreign = gateProject(t, 0);
    const result = await runStopIn(t, project, foreign.root);
    assert.equal(result.exitCode, 2, `${result.stdout}${result.stderr}`);
    assert.ok(fs.existsSync(project.path("RAN")), "the project's check:fast ran");
    assert.ok(!fs.existsSync(foreign.path("RAN")), "the foreign check:fast never ran");
  });
});

describe("debug logging", () => {
  test("CROSS_STACK_STANDARD_DEBUG=1 writes diagnostics to stderr only", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const stdin = stdinFixture("session-start/startup", fixtureVars(project.root));
    const quiet = await runHook({ event: "SessionStart", stdin, projectDir: project.root });
    const loud = await runHook({
      event: "SessionStart",
      stdin,
      projectDir: project.root,
      env: { CROSS_STACK_STANDARD_DEBUG: "1" },
    });
    assert.equal(loud.exitCode, 0);
    assert.equal(loud.stdout, quiet.stdout, "stdout is unchanged");
    assert.equal(quiet.stderr, "");
    assert.match(loud.stderr, /^\[cross-stack-standard\] SessionStart: cwd /m);
    assert.match(loud.stderr, /^\[cross-stack-standard\] detection: laravel,web in /m);
  });

  test("an opted-out project stays silent in debug mode too", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    project.write("CLAUDE.md", "cross-stack-standard: declined\n");
    const result = await runHook({
      event: "SessionStart",
      stdin: stdinFixture("session-start/startup", fixtureVars(project.root)),
      projectDir: project.root,
      env: { CROSS_STACK_STANDARD_DEBUG: "1" },
    });
    assertSilent(result);
  });
});
