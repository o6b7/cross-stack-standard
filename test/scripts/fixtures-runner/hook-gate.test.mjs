/**
 * The `hook` harness host and its gate command, scripts/lib/fixtures/hook-gate.mjs: how a hook's
 * answer maps to the gate exit codes (0 clean, 1 violation, 2 nothing judged), how the command is
 * found in hooks.json, and end to end through the fixture runner, with the real plugin and with a
 * fake plugin whose hook misbehaves.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  EXIT,
  interpretHookRun,
  loadIncompleteMarkers,
  main,
  prepareInput,
  routedCommand,
} from "../../../scripts/lib/fixtures/hook-gate.mjs";
import { REPO_ROOT, readJson, resultFor, runCli, tempDir } from "./helpers.mjs";

const PLUGIN = path.join(REPO_ROOT, "plugins", "cross-stack-standard");
const HOOKS = readJson(path.join(PLUGIN, "hooks", "hooks.json"));

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

describe("interpretHookRun", () => {
  const ask = (reason) =>
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
        additionalContext: "Cross-Stack Standard (rule PROC-013): …",
      },
    });

  test("PreToolUse: silence is clean, ask or deny is a violation", () => {
    const base = { event: "PreToolUse", exitCode: 0, stderr: "" };
    assert.equal(interpretHookRun({ ...base, stdout: "" }).verdict, "clean");
    assert.equal(
      interpretHookRun({ ...base, stdout: ask("a protected file") }).verdict,
      "violation",
    );
    const deny = ask("x").replace('"ask"', '"deny"');
    assert.equal(interpretHookRun({ ...base, stdout: deny }).verdict, "violation");
  });

  test("PreToolUse: an ask because the check could not complete is not a finding", () => {
    const judged = interpretHookRun({
      event: "PreToolUse",
      exitCode: 0,
      stdout: ask("protection check could not complete (boom)"),
      stderr: "",
      incompleteMarkers: ["protection check could not complete"],
    });
    assert.equal(judged.verdict, "error");
  });

  test("PreToolUse: other output or exit codes are errors", () => {
    const base = { event: "PreToolUse", stderr: "" };
    for (const run of [
      { ...base, exitCode: 0, stdout: '{"systemMessage":"skipped"}' },
      { ...base, exitCode: 0, stdout: "not json" },
      { ...base, exitCode: 2, stdout: "" },
      { ...base, exitCode: 1, stdout: "" },
    ]) {
      assert.equal(interpretHookRun(run).verdict, "error", JSON.stringify(run));
    }
  });

  test("Stop and PostToolUse: exit 2 with feedback is a violation, silence is clean", () => {
    for (const event of ["Stop", "PostToolUse"]) {
      const base = { event, stdout: "" };
      assert.equal(interpretHookRun({ ...base, exitCode: 0, stderr: "" }).verdict, "clean");
      assert.equal(
        interpretHookRun({ ...base, exitCode: 2, stderr: "check:fast failed" }).verdict,
        "violation",
      );
    }
  });

  test("Stop and PostToolUse: a skipped check, a crash or a kill is an error", () => {
    for (const event of ["Stop", "PostToolUse"]) {
      for (const run of [
        { exitCode: 0, stdout: '{"systemMessage":"Cross-Stack Standard: npm not found"}' },
        { exitCode: 2, stdout: "", stderr: "" },
        { exitCode: 1, stdout: "" },
        { exitCode: null, signal: "SIGKILL", stdout: "" },
        { exitCode: null, timedOut: true, stdout: "" },
      ]) {
        const judged = interpretHookRun({ event, stderr: "", ...run });
        assert.equal(judged.verdict, "error", `${event} ${JSON.stringify(run)}`);
      }
    }
  });

  test("an event that is not a gate is an error", () => {
    const judged = interpretHookRun({ event: "SessionStart", exitCode: 0, stdout: "", stderr: "" });
    assert.equal(judged.verdict, "error");
  });
});

describe("routedCommand on the plugin's hooks.json", () => {
  test("routes each gate event and tool to the entry point", () => {
    const cases = [
      { event: "PreToolUse", toolName: "Edit", tool: "Edit" },
      { event: "PreToolUse", toolName: "Write", tool: "Edit" },
      { event: "PreToolUse", toolName: "Bash", tool: "Bash" },
      { event: "PostToolUse", toolName: "Edit", tool: "Edit" },
      { event: "Stop", toolName: null, tool: null },
    ];
    for (const route of cases) {
      const found = routedCommand(HOOKS, route);
      assert.equal(found.command, "node");
      assert.deepEqual(found.args, ["${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs", route.event]);
      assert.ok(found.timeoutSeconds > 0);
    }
  });

  test("a tool outside the rule's matcher has no route", () => {
    assert.throws(
      () => routedCommand(HOOKS, { event: "PreToolUse", toolName: "Bash", tool: "Edit" }),
      /routes no PreToolUse command hook/,
    );
    assert.throws(
      () => routedCommand(HOOKS, { event: "PostToolUse", toolName: "Bash", tool: null }),
      /routes no PostToolUse/,
    );
    assert.throws(
      () => routedCommand(HOOKS, { event: "Nope", toolName: null, tool: null }),
      /no Nope/,
    );
  });
});

describe("prepareInput", () => {
  test("fills cwd and the event, keeps the rest", () => {
    const input = prepareInput('{"tool_name":"Bash"}', { event: "PreToolUse", projectDir: "/p" });
    assert.deepEqual(input, { tool_name: "Bash", cwd: "/p", hook_event_name: "PreToolUse" });
  });

  test("rejects input that is not an object or names another event", () => {
    assert.throws(() => prepareInput("[]", { event: "Stop", projectDir: "/p" }), /JSON object/);
    assert.throws(() => prepareInput("{", { event: "Stop", projectDir: "/p" }), /not JSON/);
    assert.throws(
      () => prepareInput('{"hook_event_name":"Stop"}', { event: "PreToolUse", projectDir: "/p" }),
      /but the gate is PreToolUse/,
    );
  });
});

test("the plugin still exports the texts of an incomplete PreToolUse check", async () => {
  const markers = await loadIncompleteMarkers(PLUGIN);
  assert.equal(markers.length, 2, "PROTECTION_UNAVAILABLE and INCOMPLETE_SENTENCE");
  for (const marker of markers) assert.ok(marker.length > 20);
});

/** Run main() on a temporary project with a hook input. */
async function runMain(t, { plugin = PLUGIN, event, tool = null, input, files = {} }) {
  const project = tempDir(t, "csf-hook-project-");
  for (const [rel, text] of Object.entries(files)) write(path.join(project, rel), text);
  let output = "";
  const argv = ["--plugin", plugin, "--event", event, ...(tool ? ["--tool", tool] : [])];
  const code = await main(argv, {
    env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: project },
    stdin: async () => JSON.stringify(input),
    write: (text) => {
      output += text;
    },
  });
  return { code, output };
}

describe("main with the real plugin", () => {
  const edit = (file) => ({
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: { file_path: file, old_string: "a", new_string: "b" },
  });

  test("an ordinary edit passes and a gate-file edit is a violation that names the rule", async (t) => {
    const clean = await runMain(t, { event: "PreToolUse", tool: "Edit", input: edit("src/a.js") });
    assert.equal(clean.code, EXIT.CLEAN, clean.output);
    assert.match(clean.output, /^hook PreToolUse:Edit passed: /);

    const violation = await runMain(t, {
      event: "PreToolUse",
      tool: "Edit",
      input: edit("eslint.config.mjs"),
    });
    assert.equal(violation.code, EXIT.VIOLATION, violation.output);
    assert.match(violation.output, /^hook PreToolUse:Edit violation: the hook answered ask/);
    assert.match(violation.output, /\(rule PROC-013\)/);
  });

  test("a hook input the rule's route does not cover is an error", async (t) => {
    const run = await runMain(t, {
      event: "PreToolUse",
      tool: "Bash",
      input: edit("eslint.config.mjs"),
    });
    assert.equal(run.code, EXIT.ERROR);
    assert.match(run.output, /routes no PreToolUse command hook for tool Edit/);
  });

  test("without CLAUDE_PROJECT_DIR nothing runs", async () => {
    let output = "";
    const code = await main(["--plugin", PLUGIN, "--event", "Stop"], {
      env: { PATH: process.env.PATH },
      stdin: async () => "{}",
      write: (text) => {
        output += text;
      },
    });
    assert.equal(code, EXIT.ERROR);
    assert.match(output, /CLAUDE_PROJECT_DIR/);
  });
});

/**
 * A fake plugin: hooks.json routes every gate event to scripts/hook.mjs, which behaves as the
 * given source says. It records the environment it saw in env.json next to itself.
 */
function fakePlugin(t, source) {
  const dir = tempDir(t, "csf-fake-plugin-");
  const hook = (event, matcher) => ({
    ...(matcher ? { matcher } : {}),
    hooks: [
      {
        type: "command",
        command: "node",
        args: ["${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs", event],
        timeout: 10,
      },
    ],
  });
  const config = {
    hooks: {
      PreToolUse: [hook("PreToolUse", "Edit|Write|NotebookEdit")],
      PostToolUse: [hook("PostToolUse", "Edit|Write|NotebookEdit")],
      Stop: [hook("Stop")],
    },
  };
  write(path.join(dir, "hooks", "hooks.json"), JSON.stringify(config));
  write(
    path.join(dir, "scripts", "hook.mjs"),
    [
      'import fs from "node:fs";',
      'fs.writeFileSync(new URL("./env.json", import.meta.url), JSON.stringify({',
      "  project: process.env.CLAUDE_PROJECT_DIR, root: process.env.CLAUDE_PLUGIN_ROOT,",
      "  data: process.env.CLAUDE_PLUGIN_DATA, cwd: process.cwd(), argv: process.argv.slice(2),",
      '  input: JSON.parse(fs.readFileSync(0, "utf8")) }));',
      source,
    ].join("\n"),
  );
  return dir;
}

describe("main with a fake plugin", () => {
  test("runs the routed command with the project, plugin root and a temporary data dir", async (t) => {
    const plugin = fakePlugin(t, "process.exit(0);");
    const run = await runMain(t, { plugin, event: "Stop", input: { stop_hook_active: false } });
    assert.equal(run.code, EXIT.CLEAN, run.output);
    const seen = readJson(path.join(plugin, "scripts", "env.json"));
    assert.equal(seen.root, plugin);
    assert.deepEqual(seen.argv, ["Stop"]);
    assert.equal(fs.realpathSync(seen.cwd), fs.realpathSync(seen.project));
    assert.equal(seen.input.cwd, seen.project);
    assert.equal(seen.input.hook_event_name, "Stop");
    assert.ok(seen.data && !fs.existsSync(seen.data), "the data directory is removed afterwards");
  });

  test("a Stop hook that blocks is a violation; one that skips or crashes is an error", async (t) => {
    const cases = [
      ['process.stderr.write("check:fast failed\\n"); process.exit(2);', EXIT.VIOLATION],
      ['process.stdout.write(JSON.stringify({ systemMessage: "skipped" }));', EXIT.ERROR],
      ['throw new Error("boom");', EXIT.ERROR],
      ["process.exit(2);", EXIT.ERROR],
    ];
    for (const [source, expected] of cases) {
      const plugin = fakePlugin(t, source);
      const run = await runMain(t, { plugin, event: "Stop", input: {} });
      assert.equal(run.code, expected, `${source}\n${run.output}`);
    }
  });
});

describe("the hook host through the fixture runner", () => {
  const RULE_ID = "PROC-022";

  /** A repository with the real hook host, the real registry entry and a Stop fixture. */
  function makeHookRoot(t) {
    const root = tempDir(t, "csf-hook-root-");
    fs.cpSync(
      path.join(REPO_ROOT, "test", "harness", "hook"),
      path.join(root, "test", "harness", "hook"),
      {
        recursive: true,
      },
    );
    const registry = readJson(path.join(REPO_ROOT, "registry", "rules.json"));
    const rule = registry.rules.find((candidate) => candidate.id === RULE_ID);
    assert.deepEqual(rule.gate, { kind: "hook", id: "Stop" });
    write(path.join(root, "registry", "rules.json"), JSON.stringify({ version: 1, rules: [rule] }));
    const shared = path.join(root, "test", "fixtures", "shared");
    write(path.join(shared, "clean", "fixture.json"), JSON.stringify({ hosts: ["hook"] }));
    write(
      path.join(shared, "clean", "hook-input.json"),
      JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
    );
    const violation = path.join(shared, "violations", RULE_ID);
    write(
      path.join(violation, "fixture.json"),
      JSON.stringify({ hosts: ["hook"], expect: { idPattern: "^hook Stop violation: " } }),
    );
    write(path.join(violation, "block.flag"), "");
    return root;
  }

  function run(root, plugin) {
    const report = path.join(root, "out", "fixture-report.json");
    const result = runCli(root, [
      "--report",
      report,
      "--var",
      `hookGate=${path.join(REPO_ROOT, "scripts", "lib", "fixtures", "hook-gate.mjs")}`,
      "--var",
      `pluginRoot=${plugin}`,
    ]);
    return { ...result, report: readJson(report) };
  }

  test("a hook that blocks only on the violation passes the fail-then-pass check", (t) => {
    const root = makeHookRoot(t);
    const plugin = fakePlugin(
      t,
      [
        'import path from "node:path";',
        'if (fs.existsSync(path.join(process.env.CLAUDE_PROJECT_DIR, "block.flag"))) {',
        '  process.stderr.write("the fast check failed\\n"); process.exit(2);',
        "}",
      ].join("\n"),
    );
    const { status, stdout, report } = run(root, plugin);
    assert.equal(status, 0, stdout);
    const result = resultFor(report, RULE_ID, "hook");
    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    assert.equal(result.violation.exitCode, 1);
    assert.equal(result.violation.idPrinted, true);
  });

  test("a hook that skips its check (a systemMessage) never counts as clean or caught", (t) => {
    const root = makeHookRoot(t);
    const plugin = fakePlugin(
      t,
      'process.stdout.write(JSON.stringify({ systemMessage: "npm is not installed; skipped" }));',
    );
    const { status, report } = run(root, plugin);
    assert.equal(status, 1);
    const result = resultFor(report, RULE_ID, "hook");
    assert.equal(result.ok, false);
    assert.equal(result.clean.exitCode, 2);
    assert.match(result.violation.reasons.join("\n"), /exited 2, expected 1/);
  });
});
