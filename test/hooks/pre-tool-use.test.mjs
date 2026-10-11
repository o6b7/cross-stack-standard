/**
 * PreToolUse: gate-file protection. The table cases in fixtures/pre-tool-use/ run the real entry
 * point with a stdin fixture (the base PreToolUse inputs with the case's tool input) in a copy of
 * a project that holds the usual gate files, and assert the exit code, the one-line JSON decision
 * on stdout and an empty stderr — or complete silence for tool calls that touch no gate. Further
 * tests cover the project's own settings, the configurable decision, Windows paths, letter case,
 * symbolic links, failing open, and the library functions in-process.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, test } from "node:test";

import {
  copyPlugin,
  FIXTURES_DIR,
  importPlugin,
  makeProject,
  PLUGIN_DIR,
  writeFile,
} from "./helpers/project.mjs";
import { fixtureVars, runHook, stdinFixture } from "./helpers/run-hook.mjs";

const {
  COMMAND_SENTENCE,
  GATE_SENTENCE,
  INCOMPLETE_SENTENCE,
  MAX_CONTEXT_CHARS,
  MAX_REASON_CHARS,
  OPT_OUT_SENTENCE,
} = await importPlugin("scripts/handlers/pre-tool-use.mjs");
const {
  applyEdit,
  caseInsensitivePaths,
  changedJsonPointers,
  compileGlob,
  compileProtection,
  expandBraces,
  inspectCommand,
  lexBash,
  lexPowerShell,
  MATCHERS,
  MAX_COMMAND_CHARS,
  parseCommand,
  projectRelativePaths,
  ProtectionIncomplete,
  protectingRules,
  renderSegment,
  wildcardMatch,
} = await importPlugin("scripts/lib/protect.mjs");
const { validateAgainstSchema } = await importPlugin(
  "templates/shared/cross-stack/bin/cross-stack.mjs",
);

const CASES_DIR = path.join(FIXTURES_DIR, "pre-tool-use");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const PROJECT = readJson(path.join(CASES_DIR, "project.json")).files;
const FILE_CASES = readJson(path.join(CASES_DIR, "files.json"));
const COMMAND_CASES = readJson(path.join(CASES_DIR, "commands.json"));
const DATA = readJson(path.join(PLUGIN_DIR, "data", "protected-paths.json"));
const RULES = readJson(path.join(PLUGIN_DIR, "data", "rules.json")).rules;

const CONCURRENCY = Math.max(2, Math.min(8, os.availableParallelism()));

/** The registry rules this hook gates, per tool kind, as the additional context names them. */
function gateRules(discriminator) {
  return RULES.filter(
    (rule) =>
      rule.gate?.kind === "hook" &&
      rule.gate.id === "PreToolUse" &&
      rule.gate.discriminator === discriminator,
  )
    .map((rule) => rule.id)
    .sort();
}
const FILE_RULES = gateRules("Edit");
const SHELL_RULES = gateRules("Bash");

/** Effect of every data entry, by id ("gate" for paths). */
const EFFECTS = new Map(
  [...DATA.paths, ...DATA.contentRules, ...DATA.commands, ...(DATA.pathCommands ?? [])].map(
    (entry) => [entry.id, entry.effect === "opt-out" ? "opt-out" : "gate"],
  ),
);

const BASE_FIXTURE = {
  Edit: "pre-tool-use/edit",
  Write: "pre-tool-use/write",
  NotebookEdit: "pre-tool-use/notebook-edit",
  Bash: "pre-tool-use/bash",
  PowerShell: "pre-tool-use/powershell",
};

/** A base PreToolUse stdin fixture of the tool, with the case's tool input. */
function stdinFor(project, tool, toolInput, cwd = project.root) {
  const input = stdinFixture(
    BASE_FIXTURE[tool] ?? "pre-tool-use/edit",
    fixtureVars(project.root, cwd),
  );
  return { ...input, tool_name: tool, tool_input: toolInput };
}

/** A case path as the tool sends it; a "\" asks for the Windows separator form. */
function toolPath(project, relative) {
  return relative.includes("\\") ? `${project.root}\\${relative}` : project.path(relative);
}

function fileInput(project, testCase) {
  const key = testCase.tool === "NotebookEdit" ? "notebook_path" : "file_path";
  return { [key]: toolPath(project, testCase.path), ...testCase.input };
}

function withRoot(command, project) {
  return command.replaceAll("{{root}}", project.root);
}

function preToolUse(project, stdin, options = {}) {
  return runHook({ event: "PreToolUse", stdin, projectDir: project.root, ...options });
}

function assertSilent(result, label = "") {
  assert.equal(result.exitCode, 0, `${label}: ${result.stdout}${result.stderr}`);
  assert.equal(result.stdout, "", `${label}: stdout`);
  assert.equal(result.stderr, "", `${label}: stderr`);
}

/** The decision object of a run that returned one: exit 0, one JSON line, empty stderr. */
function decisionOf(result) {
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.ok(result.json, `stdout is one JSON object: ${JSON.stringify(result.stdout)}`);
  assert.equal(result.stdout, `${JSON.stringify(result.json)}\n`, "exactly one line");
  assert.deepEqual(Object.keys(result.json), ["hookSpecificOutput"]);
  const output = result.json.hookSpecificOutput;
  assert.deepEqual(Object.keys(output).sort(), [
    "additionalContext",
    "hookEventName",
    "permissionDecision",
    "permissionDecisionReason",
  ]);
  assert.equal(output.hookEventName, "PreToolUse");
  assert.ok(output.permissionDecisionReason.startsWith("Cross-Stack Standard: "));
  assert.ok(output.permissionDecisionReason.length <= MAX_REASON_CHARS);
  assert.ok(output.additionalContext.length <= MAX_CONTEXT_CHARS);
  return output;
}

function entriesOf(output) {
  const match = /Matched protection entries: ([^\n]+)\.$/.exec(output.additionalContext);
  assert.ok(match, output.additionalContext);
  return match[1].split(", ").sort();
}

/**
 * Asserts an `ask` naming exactly `entries`, with the sentences their effects call for.
 *
 * @param {import("./helpers/run-hook.mjs").HookRun} result
 * @param {{ entries: string[], kind: "file" | "shell", optOut?: boolean, reason?: string }} expected
 */
function assertAsk(result, { entries, kind, optOut, reason }) {
  const output = decisionOf(result);
  assert.equal(output.permissionDecision, "ask");
  assert.deepEqual(entriesOf(output), [...entries].sort());
  const effects = entries.map((id) => EFFECTS.get(id) ?? "gate");
  const text = output.permissionDecisionReason;
  assert.equal(text.includes(OPT_OUT_SENTENCE), effects.includes("opt-out"), text);
  const gateSentence = kind === "shell" ? COMMAND_SENTENCE : GATE_SENTENCE;
  assert.equal(text.includes(gateSentence), effects.includes("gate"), text);
  if (optOut !== undefined) assert.equal(effects.includes("opt-out"), optOut, "optOut flag");
  if (reason) assert.ok(text.includes(reason), `reason ${JSON.stringify(text)} lacks ${reason}`);
  const rules = kind === "shell" ? SHELL_RULES : FILE_RULES;
  assert.ok(
    output.additionalContext.startsWith(`Cross-Stack Standard (rule ${rules.join(", ")}): `),
  );
  assert.match(output.additionalContext, /The PreToolUse hook asked the user to confirm/);
  return output;
}

/** Asserts the fail-closed answer: `ask`, saying the check could not complete. */
function assertIncomplete(result) {
  const output = decisionOf(result);
  assert.equal(output.permissionDecision, "ask");
  assert.match(output.permissionDecisionReason, /protection check could not complete \(/);
  assert.ok(output.permissionDecisionReason.includes(INCOMPLETE_SENTENCE));
  assert.match(output.additionalContext, /instead of letting it through unchecked/);
  return output;
}

describe(
  "file tools: every protected path class and the opt-out",
  { concurrency: CONCURRENCY },
  () => {
    for (const testCase of FILE_CASES.ask) {
      test(`${testCase.tool} ${testCase.path}: ${testCase.name}`, async (t) => {
        const project = makeProject(t, { ...PROJECT, ...(testCase.files ?? {}) });
        const result = await preToolUse(
          project,
          stdinFor(project, testCase.tool, fileInput(project, testCase)),
        );
        assertAsk(result, { ...testCase, kind: "file" });
      });
    }
  },
);

describe("file tools: edits that touch no gate stay silent", { concurrency: CONCURRENCY }, () => {
  for (const testCase of FILE_CASES.silent) {
    test(`${testCase.tool} ${testCase.path}: ${testCase.name}`, async (t) => {
      const project = makeProject(t, { ...PROJECT, ...(testCase.files ?? {}) });
      const result = await preToolUse(
        project,
        stdinFor(project, testCase.tool, fileInput(project, testCase)),
      );
      assertSilent(result, testCase.name);
    });
  }

  for (const tool of ["Read", "Grep", "Glob", "MultiEdit"]) {
    test(`${tool} on a protected file is not inspected (reading is not a change)`, async (t) => {
      const project = makeProject(t, PROJECT);
      const input = {
        file_path: project.path("phpstan.neon"),
        pattern: "level",
        path: project.root,
      };
      assertSilent(await preToolUse(project, stdinFor(project, tool, input)), tool);
    });
  }
});

describe("shell tools: every command pattern", { concurrency: CONCURRENCY }, () => {
  for (const testCase of COMMAND_CASES.ask) {
    test(`${testCase.tool}: ${JSON.stringify(testCase.command)}`, async (t) => {
      const project = makeProject(t, { ...PROJECT, ...(testCase.files ?? {}) });
      const cwd = testCase.cwd ? project.path(testCase.cwd) : project.root;
      const stdin = stdinFor(
        project,
        testCase.tool,
        { command: withRoot(testCase.command, project) },
        cwd,
      );
      const result = await preToolUse(project, stdin, { env: testCase.env ?? {} });
      assertAsk(result, { ...testCase, kind: "shell" });
    });
  }
});

describe(
  "shell tools: reads, normal work and sanctioned scripts stay silent",
  { concurrency: CONCURRENCY },
  () => {
    for (const testCase of COMMAND_CASES.silent) {
      test(`${testCase.tool}: ${JSON.stringify(testCase.command)}`, async (t) => {
        const project = makeProject(t, { ...PROJECT, ...(testCase.files ?? {}) });
        const cwd = testCase.cwd ? project.path(testCase.cwd) : project.root;
        const stdin = stdinFor(
          project,
          testCase.tool,
          { command: withRoot(testCase.command, project) },
          cwd,
        );
        assertSilent(
          await preToolUse(project, stdin, { env: testCase.env ?? {} }),
          testCase.command,
        );
      });
    }
  },
);

describe("the case tables cover the whole protection list", () => {
  const fileEntries = new Set(FILE_CASES.ask.flatMap((testCase) => testCase.entries));
  const commandEntries = new Set(COMMAND_CASES.ask.flatMap((testCase) => testCase.entries));

  test("every path class and content rule has a file-tool case", () => {
    const missing = [...DATA.paths, ...DATA.contentRules]
      .map((entry) => entry.id)
      .filter((id) => !fileEntries.has(id));
    assert.deepEqual(missing, []);
  });

  test("every command pattern has a shell case, and both shells are covered", () => {
    const missing = [...DATA.commands, ...DATA.pathCommands]
      .map((entry) => entry.id)
      .filter((id) => !commandEntries.has(id));
    assert.deepEqual(missing, []);
    for (const tool of ["Bash", "PowerShell"]) {
      assert.ok(
        COMMAND_CASES.ask.some((testCase) => testCase.tool === tool),
        tool,
      );
      assert.ok(
        COMMAND_CASES.silent.some((testCase) => testCase.tool === tool),
        tool,
      );
    }
  });

  test("the data file is well formed for the fields only this hook reads", () => {
    const all = [...DATA.paths, ...DATA.contentRules, ...DATA.commands, ...DATA.pathCommands];
    const ids = all.map((entry) => entry.id);
    assert.deepEqual(ids, [...new Set(ids)], "ids are unique across the lists");
    for (const entry of all) {
      if (entry.effect !== undefined)
        assert.ok(["gate", "opt-out"].includes(entry.effect), entry.id);
      const isCommand = DATA.commands.includes(entry) || DATA.pathCommands.includes(entry);
      if (isCommand && entry.matcher !== undefined) {
        assert.ok(MATCHERS.includes(entry.matcher), entry.id);
      }
      for (const key of ["verbs", "words", "targetGlobs"]) {
        if (entry[key] === undefined) continue;
        assert.ok(
          Array.isArray(entry[key]) && entry[key].every((v) => typeof v === "string"),
          entry.id,
        );
      }
    }
    for (const entry of DATA.pathCommands) {
      assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(entry.description);
      assert.doesNotThrow(() => new RegExp(entry.pattern, `${entry.flags ?? ""}u`), entry.id);
    }
    const compiled = compileProtection(DATA);
    assert.deepEqual(compiled.problems, []);
  });
});

describe("the project's own settings", { concurrency: CONCURRENCY }, () => {
  const settings = {
    ...PROJECT,
    ".cross-stack/standard.json": {
      version: "1.0.0",
      tracks: ["web"],
      hooks: {
        preToolUse: {
          protect: ["config/security.php", "notebooks/**"],
          protectCommands: ["\\bdeploy\\.sh\\b"],
        },
      },
    },
    "config/security.php": "<?php\n\nreturn ['csp' => true];\n",
  };

  test("hooks.preToolUse.protect adds files for the file tools", async (t) => {
    const project = makeProject(t, settings);
    const input = {
      file_path: project.path("config/security.php"),
      old_string: "true",
      new_string: "false",
    };
    const result = await preToolUse(project, stdinFor(project, "Edit", input));
    assertAsk(result, {
      entries: ["project-protect"],
      kind: "file",
      reason: "config/security.php is a protected file (listed in hooks.preToolUse.protect)",
    });
  });

  test("a NotebookEdit on a protected notebook asks", async (t) => {
    const project = makeProject(t, settings);
    const input = { notebook_path: project.path("notebooks/report.ipynb"), new_source: "x = 1" };
    const result = await preToolUse(project, stdinFor(project, "NotebookEdit", input));
    assertAsk(result, { entries: ["project-protect"], kind: "file" });
  });

  test("hooks.preToolUse.protect also counts for shell writes and deletions", async (t) => {
    const project = makeProject(t, settings);
    const stdin = stdinFor(project, "Bash", { command: "rm config/security.php" });
    assertAsk(await preToolUse(project, stdin), {
      entries: ["delete-protected-path"],
      kind: "shell",
    });
  });

  test("hooks.preToolUse.protectCommands adds command patterns", async (t) => {
    const project = makeProject(t, settings);
    const stdin = stdinFor(project, "Bash", { command: "./deploy.sh --production" });
    const output = assertAsk(await preToolUse(project, stdin), {
      entries: ["project-command-1"],
      kind: "shell",
    });
    assert.match(
      output.permissionDecisionReason,
      /matches a pattern listed in hooks\.preToolUse\.protectCommands \(deploy\.sh\)/,
    );
  });

  test("the sanctioned baseline scripts are not inspected, even by a project pattern", async (t) => {
    const project = makeProject(t, {
      ...PROJECT,
      ".cross-stack/standard.json": {
        version: "1.0.0",
        tracks: ["web"],
        hooks: { preToolUse: { protectCommands: ["baseline"] } },
      },
    });
    const run = (tool, command) => preToolUse(project, stdinFor(project, tool, { command }));
    for (const command of [
      "npm run phpstan:baseline:update",
      "composer phpstan:baseline:update",
      "composer run-script eslint:baseline:update",
      "pnpm depcruise:baseline:update",
    ]) {
      assertSilent(await run("Bash", command), command);
    }
    assertSilent(await run("PowerShell", "npm run jscpd:baseline:update"), "PowerShell");
    // Only the whole command is exempt: anything chained to it is inspected.
    assertAsk(await run("Bash", "npm run phpstan:baseline:update && echo done"), {
      entries: ["project-command-1"],
      kind: "shell",
    });
    assertAsk(await run("Bash", "npx phpstan:baseline:update"), {
      entries: ["project-command-1"],
      kind: "shell",
    });
  });

  test("the built-in list still applies next to the project's entries", async (t) => {
    const project = makeProject(t, settings);
    const stdin = stdinFor(project, "Bash", { command: "git commit --no-verify -m x" });
    assertAsk(await preToolUse(project, stdin), { entries: ["git-no-verify"], kind: "shell" });
  });
});

describe("the decision", () => {
  test("defaults to ask, and a value other than ask or deny keeps ask", async (t) => {
    const project = makeProject(t, {
      ...PROJECT,
      ".cross-stack/standard.json": {
        version: "1.0.0",
        tracks: ["web"],
        hooks: { preToolUse: { decision: "allow" } },
      },
    });
    const input = { file_path: project.path("pint.json"), content: "{}\n" };
    const output = decisionOf(await preToolUse(project, stdinFor(project, "Write", input)));
    assert.equal(output.permissionDecision, "ask");
  });

  test('hooks.preToolUse.decision "deny" denies, with the reason for Claude', async (t) => {
    // The shipped manifest schema declares the setting; nothing is patched.
    const project = makeProject(t, {
      ...PROJECT,
      ".cross-stack/standard.json": {
        version: "1.0.0",
        tracks: ["web"],
        hooks: { preToolUse: { decision: "deny" } },
      },
    });

    const edit = { file_path: project.path("phpstan.neon"), old_string: "8", new_string: "0" };
    const output = decisionOf(await preToolUse(project, stdinFor(project, "Edit", edit)));
    assert.equal(output.permissionDecision, "deny");
    assert.match(output.permissionDecisionReason, /phpstan\.neon is a protected file/);
    assert.match(
      output.additionalContext,
      /denied this tool call because the project sets hooks\.preToolUse\.decision to "deny"/,
    );

    const shell = stdinFor(project, "Bash", { command: "git commit -n -m wip" });
    const denied = decisionOf(await preToolUse(project, shell));
    assert.equal(denied.permissionDecision, "deny");

    const quiet = stdinFor(project, "Bash", { command: "npm test" });
    assertSilent(await preToolUse(project, quiet), "npm test");

    // The setting is a known one: nothing is reported as ignored.
    const debug = await preToolUse(project, quiet, { env: { CROSS_STACK_STANDARD_DEBUG: "1" } });
    assert.doesNotMatch(debug.stderr, /setting ignored/);
  });

  test("the shipped manifest schema declares decision and trackRoots", () => {
    const schema = readJson(path.join(PLUGIN_DIR, "data", "standard.schema.json"));
    const valid = {
      version: "1.0.0",
      tracks: ["laravel", "web"],
      trackRoots: { laravel: "api", web: ["apps/web", "./apps/admin/"] },
      hooks: { preToolUse: { decision: "deny" } },
    };
    assert.deepEqual(validateAgainstSchema(schema, valid), []);
    for (const invalid of [
      { ...valid, hooks: { preToolUse: { decision: "allow" } } },
      { ...valid, trackRoots: { laravel: "../elsewhere" } },
      { ...valid, trackRoots: { laravel: "/absolute" } },
      { ...valid, trackRoots: { web: [] } },
      { ...valid, trackRoots: { desktop: "app" } },
    ]) {
      assert.notDeepEqual(validateAgainstSchema(schema, invalid), [], JSON.stringify(invalid));
    }
  });
});

describe("paths", () => {
  test("letter case is ignored on Windows and macOS only", async (t) => {
    const project = makeProject(t, PROJECT);
    const input = { file_path: project.path("PHPStan.NEON"), content: "parameters: {}\n" };
    const result = await preToolUse(project, stdinFor(project, "Write", input));
    if (caseInsensitivePaths(process.platform)) {
      assertAsk(result, { entries: ["phpstan-config"], kind: "file" });
    } else {
      assertSilent(result, "case-sensitive platform");
    }
  });

  test(
    "a symbolic link from CLAUDE.md makes its target a memory file",
    { skip: process.platform === "win32" && "needs symlink rights" },
    async (t) => {
      const project = makeProject(t, { ...PROJECT, "AGENTS.md": "# Agents\n" });
      fs.rmSync(project.path("CLAUDE.md"));
      fs.symlinkSync("AGENTS.md", project.path("CLAUDE.md"));
      for (const target of ["AGENTS.md", "CLAUDE.md"]) {
        const input = {
          file_path: project.path(target),
          old_string: "# Agents\n",
          new_string: "# Agents\n\ncross-stack-standard: declined\n",
        };
        const result = await preToolUse(project, stdinFor(project, "Edit", input));
        assertAsk(result, { entries: ["opt-out-line"], kind: "file" });
      }
    },
  );

  test(
    "a path reached through a symbolic link is matched by its real location",
    { skip: process.platform === "win32" && "needs symlink rights" },
    async (t) => {
      const project = makeProject(t, PROJECT);
      fs.symlinkSync(project.path(".github/workflows"), project.path("wf"));
      const input = { file_path: project.path("wf/ci.yml"), content: "name: x\n" };
      const result = await preToolUse(project, stdinFor(project, "Write", input));
      assertAsk(result, { entries: ["ci-workflows"], kind: "file" });
    },
  );

  test("a file outside the project is not the project's gate", async (t) => {
    const project = makeProject(t, PROJECT);
    const elsewhere = makeProject(t, { "phpstan.neon": "parameters: {}\n" });
    const input = { file_path: elsewhere.path("phpstan.neon"), content: "x\n" };
    assertSilent(await preToolUse(project, stdinFor(project, "Write", input)), "outside");
    const stdin = stdinFor(project, "Bash", { command: `rm ${elsewhere.path("phpstan.neon")}` });
    assertSilent(await preToolUse(project, stdin), "outside rm");
  });

  test("a working directory outside the project protects its own gate files", async (t) => {
    const project = makeProject(t, PROJECT);
    const elsewhere = makeProject(t, { "pint.json": "{}\n", "notes.md": "x\n" });
    const write = (file) =>
      stdinFor(
        project,
        "Write",
        { file_path: elsewhere.path(file), content: "{}\n" },
        elsewhere.root,
      );
    assertAsk(await preToolUse(project, write("pint.json")), {
      entries: ["pint-config"],
      kind: "file",
    });
    assertSilent(await preToolUse(project, write("notes.md")), "notes");
  });
});

describe("inputs and failures", { concurrency: CONCURRENCY }, () => {
  const malformed = [
    ["no tool_input", { tool_name: "Edit" }],
    ["tool_input is not an object", { tool_name: "Bash", tool_input: "rm phpstan.neon" }],
    [
      "command is not a string",
      { tool_name: "Bash", tool_input: { command: ["rm", "phpstan.neon"] } },
    ],
    ["empty command", { tool_name: "PowerShell", tool_input: { command: "   " } }],
    ["no file_path", { tool_name: "Write", tool_input: { content: "x" } }],
    ["no tool_name", { tool_input: { command: "rm phpstan.neon" } }],
  ];
  for (const [label, fields] of malformed) {
    test(`${label}: silent`, async (t) => {
      const project = makeProject(t, PROJECT);
      const base = stdinFixture("pre-tool-use/bash", fixtureVars(project.root));
      delete base.tool_name;
      delete base.tool_input;
      assertSilent(await preToolUse(project, { ...base, ...fields }), label);
    });
  }

  test("an opted-out project gets no decision, even for a protected edit", async (t) => {
    const project = makeProject(t, {
      ...PROJECT,
      "CLAUDE.md": "# Notes\n\ncross-stack-standard: declined\n",
    });
    const edit = { file_path: project.path("phpstan.neon"), old_string: "8", new_string: "0" };
    assertSilent(await preToolUse(project, stdinFor(project, "Edit", edit)), "edit");
    const shell = stdinFor(project, "Bash", { command: "rm phpstan-baseline.neon" });
    assertSilent(await preToolUse(project, shell), "shell");
  });

  test("missing protection data fails closed: ask, with the reason", async (t) => {
    const plugin = copyPlugin(t);
    fs.rmSync(path.join(plugin.root, "data", "protected-paths.json"));
    const project = makeProject(t, PROJECT);
    for (const stdin of [
      stdinFor(project, "Edit", {
        file_path: project.path("src/lib/util.ts"),
        old_string: "1",
        new_string: "2",
      }),
      stdinFor(project, "Bash", { command: "npm test" }),
    ]) {
      const output = assertIncomplete(await preToolUse(project, stdin, { entry: plugin.entry }));
      assert.match(
        output.permissionDecisionReason,
        /data\/protected-paths\.json could not be read/,
      );
      assert.match(output.additionalContext, /Reinstalling the plugin restores/);
    }
  });

  test("a data entry that does not compile is skipped; the others still apply", async (t) => {
    const plugin = copyPlugin(t);
    const dataFile = path.join(plugin.root, "data", "protected-paths.json");
    const data = readJson(dataFile);
    data.commands.find((entry) => entry.id === "git-commit-short-n").pattern = "([";
    writeFile(dataFile, data);
    const project = makeProject(t, PROJECT);
    const run = (command, env = {}) =>
      preToolUse(project, stdinFor(project, "Bash", { command }), { entry: plugin.entry, env });
    assertSilent(await run("git commit -n -m wip"), "broken entry");
    assertAsk(await run("git commit --no-verify -m wip"), {
      entries: ["git-no-verify"],
      kind: "shell",
    });
    const debug = await run("npm test", { CROSS_STACK_STANDARD_DEBUG: "1" });
    assert.equal(debug.stdout, "");
    assert.match(debug.stderr, /protection entry skipped: commands git-commit-short-n: /);
  });

  test("several findings: the first three are described and the rest counted", async (t) => {
    const project = makeProject(t, PROJECT);
    const command =
      "LEFTHOOK=0 GITLEAKS_CONFIG=x git commit --no-verify -n -m wip && git push --force && rm phpstan-baseline.neon";
    const output = decisionOf(await preToolUse(project, stdinFor(project, "Bash", { command })));
    assert.equal(output.permissionDecision, "ask");
    assert.match(output.permissionDecisionReason, /; and \d+ more\. /);
    assert.deepEqual(entriesOf(output), [
      "baseline-delete",
      "delete-protected-path",
      "git-commit-short-n",
      "git-no-verify",
      "git-push-force",
      "gitleaks-config-environment",
      "lefthook-disabled",
    ]);
  });
});

describe("library: globs", () => {
  test("the documented dialect", () => {
    const cases = [
      ["**/phpstan.neon", "phpstan.neon", true],
      ["**/phpstan.neon", "api/deep/phpstan.neon", true],
      ["**/phpstan.neon", "phpstan.neon.dist", false],
      [".github/workflows/**", ".github/workflows/a/b.yml", true],
      [".github/workflows/**", "x/.github/workflows/b.yml", false],
      ["**/tests/Arch/**", "tests/Arch/LayersTest.php", true],
      ["src/*.ts", "src/a.ts", true],
      ["src/*.ts", "src/a/b.ts", false],
      ["file?.json", "file1.json", true],
      ["file?.json", "file12.json", false],
      ["**/eslint.config.{js,mjs}", "web/eslint.config.mjs", true],
      ["**/eslint.config.{js,mjs}", "web/eslint.config.ts", false],
      ["a+b(c).json", "a+b(c).json", true],
      ["a.json", "aXjson", false],
    ];
    for (const [glob, file, expected] of cases) {
      assert.equal(compileGlob(glob).test(file), expected, `${glob} ~ ${file}`);
    }
    assert.equal(compileGlob("**/PINT.json").test("pint.json"), false);
    assert.equal(compileGlob("**/PINT.json", { caseInsensitive: true }).test("pint.json"), true);
  });

  test("brace expansion, nested", () => {
    assert.deepEqual(expandBraces("a{b,c{d,e}}f"), ["abf", "acdf", "acef"]);
    assert.deepEqual(expandBraces("{x}"), ["{x}"]);
    assert.deepEqual(expandBraces("no-braces"), ["no-braces"]);
  });
});

describe("library: paths", () => {
  const protection = compileProtection(DATA, { caseInsensitive: true });
  const sensitive = compileProtection(DATA, { caseInsensitive: false });

  test("Windows: backslashes, drive-letter case and the long-path prefix", () => {
    const context = { roots: ["c:\\Repo"], cwd: "C:\\Repo", platform: "win32" };
    const { relatives } = projectRelativePaths("C:\\repo\\API\\PHPStan.neon", context);
    assert.deepEqual(relatives, ["API/PHPStan.neon"]);
    assert.deepEqual(
      protectingRules(protection, relatives[0]).map((rule) => rule.id),
      ["phpstan-config"],
    );
    assert.deepEqual(projectRelativePaths("\\\\?\\C:\\Repo\\pint.json", context).relatives, [
      "pint.json",
    ]);
    assert.deepEqual(projectRelativePaths("D:\\Repo\\pint.json", context).relatives, []);
    assert.deepEqual(projectRelativePaths(".github\\workflows\\ci.yml", context).relatives, [
      ".github/workflows/ci.yml",
    ]);
  });

  test("Linux: letter case matters and a drive-letter path is outside the project", () => {
    const context = { roots: ["/repo"], cwd: "/repo", platform: "linux" };
    const { relatives } = projectRelativePaths("/repo/PHPStan.neon", context);
    assert.deepEqual(relatives, ["PHPStan.neon"]);
    assert.deepEqual(protectingRules(sensitive, relatives[0]), []);
    assert.deepEqual(projectRelativePaths("C:\\temp\\pint.json", context).relatives, []);
    assert.deepEqual(projectRelativePaths("/repo/api\\phpstan.neon", context).relatives, [
      "api/phpstan.neon",
    ]);
  });

  test("macOS: case-insensitive comparison", () => {
    const context = { roots: ["/Users/dev/App"], cwd: "/Users/dev/App", platform: "darwin" };
    assert.deepEqual(projectRelativePaths("/users/DEV/app/pint.json", context).relatives, [
      "pint.json",
    ]);
  });
});

describe("library: edits and JSON Pointers", () => {
  test("applyEdit follows the Edit tool", () => {
    assert.equal(applyEdit("a b a", "a", "x", false), "x b a");
    assert.equal(applyEdit("a b a", "a", "x", true), "x b x");
    assert.equal(applyEdit("a b", "zzz", "x", false), null);
    assert.equal(applyEdit("one\r\ntwo\r\n", "one\ntwo", "1\n2", false), "1\r\n2\r\n");
    assert.equal(applyEdit(null, "", "new file", false), "new file");
    assert.equal(applyEdit(null, "x", "y", false), null);
    assert.equal(applyEdit("$&", "$&", "$1", false), "$1");
  });

  test("changedJsonPointers ignores key order and reports unparsable results", () => {
    const before = JSON.stringify({ scripts: { a: "1", b: "2" }, dependencies: {} });
    const reordered = JSON.stringify({ dependencies: { x: "1" }, scripts: { b: "2", a: "1" } });
    assert.deepEqual(changedJsonPointers(before, reordered, ["/scripts"]), {
      changed: [],
      unknown: false,
    });
    const edited = JSON.stringify({ scripts: { a: "true", b: "2" } });
    assert.deepEqual(changedJsonPointers(before, edited, ["/scripts", "/knip"]), {
      changed: ["/scripts"],
      unknown: false,
    });
    const removed = JSON.stringify({ dependencies: {} });
    assert.deepEqual(changedJsonPointers(before, removed, ["/scripts"]).changed, ["/scripts"]);
    assert.deepEqual(changedJsonPointers(before, "{", ["/scripts"]), {
      changed: ["/scripts"],
      unknown: true,
    });
    const slashKey = JSON.stringify({ config: { "a/b": 1 } });
    assert.deepEqual(
      changedJsonPointers(slashKey, JSON.stringify({ config: { "a/b": 2 } }), ["/config/a~1b"])
        .changed,
      ["/config/a~1b"],
    );
  });
});

describe("library: shell lexing", () => {
  const words = (segment) =>
    segment.tokens.map((token) => (token.kind === "op" ? `<${token.value}>` : token.value));

  test("Bash: quotes, escapes, operators, redirections, comments and continuations", () => {
    const segments = lexBash(
      "echo \"a;b\" 'c d' e\\ f > out.txt 2>&1 | tee -a log # note\nls \\\n  -la && x=$'\\x41' ${IFS}y",
    );
    assert.deepEqual(segments.map(words), [
      ["echo", "a;b", "c d", "e f", "<>>", "out.txt", "<>&>", "1"],
      ["tee", "-a", "log"],
      ["ls", "-la"],
      ["x=A", "y"],
    ]);
    assert.deepEqual(
      segments.map((segment) => segment.sep),
      ["|", ";", "&&", ""],
    );
  });

  test("Bash: here-documents and command substitutions", () => {
    const [cat] = lexBash("cat >> CLAUDE.md <<'EOF'\nline one\nline two\nEOF\necho after");
    assert.deepEqual(words(cat), ["cat", "<>>>", "CLAUDE.md", "<<<>", "line one\nline two"]);
    const [echo] = lexBash('echo $(rm a) `rm b` "$(rm c)"');
    assert.deepEqual(
      echo.nested.map((inner) => inner.text),
      ["rm a", "rm b", "rm c"],
    );
  });

  test("PowerShell: backticks, doubled quotes, here-strings and redirections", () => {
    const segments = lexPowerShell(
      "git commit --no-ver`ify -m 'it''s'; Set-Content -Path a.txt -Value @\"\nhello\n\"@ 2>&1 | Out-Null",
    );
    assert.deepEqual(segments.map(words), [
      ["git", "commit", "--no-verify", "-m", "it's"],
      ["Set-Content", "-Path", "a.txt", "-Value", "hello", "<>&>", "1"],
      ["Out-Null"],
    ]);
  });

  test("nested command strings: bash -c, eval, pwsh -Command/-EncodedCommand, cmd /c", () => {
    const encoded = Buffer.from("Remove-Item x", "utf16le").toString("base64");
    const texts = (command, dialect) =>
      parseCommand(command, dialect)
        .filter((segment) => segment.depth > 0)
        .map((segment) => renderSegment(segment.tokens).text);
    assert.deepEqual(texts("bash -c 'rm a && rm b'", "bash"), ["rm a", "rm b"]);
    assert.deepEqual(texts('eval "rm a"', "bash"), ["rm a"]);
    assert.deepEqual(texts('cmd /c "del a"', "bash"), ["del a"]);
    assert.deepEqual(texts('pwsh -NoProfile -Command "Remove-Item a"', "powershell"), [
      "Remove-Item a",
    ]);
    assert.deepEqual(texts(`pwsh -EncodedCommand ${encoded}`, "powershell"), ["Remove-Item x"]);
    const deep = 'bash -c \'bash -c "bash -c \\"bash -c \\\\\\"bash -c x\\\\\\"\\""\'';
    assert.ok(parseCommand(deep, "bash").every((segment) => segment.depth <= 4));
  });

  test("rendering masks operators inside words and keeps token offsets", () => {
    const [segment] = lexBash("awk '$1 > 5' phpstan.neon > out");
    const { text, starts } = renderSegment(segment.tokens);
    assert.equal(text, "awk $1   5 phpstan.neon > out");
    assert.deepEqual(starts, [0, 4, 11, 24, 26]);
  });
});

/** CPU time of a synchronous call, in milliseconds, with its result or error. */
function cpuTimed(run) {
  const before = process.cpuUsage();
  let value;
  let error = null;
  try {
    value = run();
  } catch (caught) {
    error = caught;
  }
  const used = process.cpuUsage(before);
  return { value, error, cpuMs: (used.user + used.system) / 1000 };
}

describe("library: performance and bounds", () => {
  const protection = compileProtection(DATA, { caseInsensitive: caseInsensitivePaths() });
  const inspect = (command) =>
    inspectCommand({
      command,
      dialect: "bash",
      protection,
      roots: [os.tmpdir()],
      cwd: os.tmpdir(),
    });

  test("a 200 KB here-document is inspected in well under the budget", (t) => {
    const body = "const value = 1; // > | ; {a,b} [c] ? * not a redirect\n".repeat(3_500);
    const run = cpuTimed(() => inspect(`cat > src/big.ts <<'EOF'\n${body}EOF`));
    assert.equal(run.error, null);
    assert.deepEqual(run.value, []);
    // CPU time, not wall time: the suite runs files in parallel.
    assert.ok(run.cpuMs < 2_000, `used ${Math.round(run.cpuMs)} ms of CPU`);
    t.diagnostic(`200 KB here-document: ${Math.round(run.cpuMs)} ms CPU`);
  });

  test("a command over the cap is not inspected: it fails closed", () => {
    const run = cpuTimed(() => inspect(`#${"x".repeat(MAX_COMMAND_CHARS)}\ngit commit -n -m wip`));
    assert.ok(run.error instanceof ProtectionIncomplete, String(run.error));
    assert.match(run.error.message, /characters long/);
  });

  test("hostile repetition stays linear (#11: backtracking patterns, word loops)", () => {
    for (const command of [
      `git commit --no-verify -m wip; echo ${"git commit ".repeat(1_500)}`,
      `echo ${"git commit ".repeat(20_000)}`,
      `echo ${"composer config ".repeat(15_000)}`,
      `echo ${"a ".repeat(70_000)}`,
      `echo "${"cross-stack-standard@".repeat(10_000)}"`,
      `echo LEFTHOOK${" ".repeat(200_000)}x`,
    ]) {
      const run = cpuTimed(() => inspect(command));
      assert.ok(run.error === null || run.error instanceof ProtectionIncomplete, String(run.error));
      assert.ok(run.cpuMs < 2_500, `${command.slice(0, 40)}: ${Math.round(run.cpuMs)} ms`);
    }
  });

  test("brace expansion is iterative and capped (#11)", () => {
    // 5,000 groups: no stack overflow (a word that long cannot name a file).
    const long = cpuTimed(() =>
      inspect(`git commit --no-verify -m x; rm x${"{a,b}".repeat(5_000)}`),
    );
    assert.equal(long.error, null);
    assert.deepEqual(
      long.value.map((finding) => finding.ruleId),
      ["git-no-verify"],
    );
    // 12 groups name 4,096 files, over the cap of 256: the check fails closed.
    const wide = cpuTimed(() => inspect(`rm x${"{a,b}".repeat(12)}`));
    assert.ok(wide.error instanceof ProtectionIncomplete, String(wide.error));
    assert.ok(expandBraces(`x${"{a,b}".repeat(2_000)}`).length <= 256);
    assert.equal(expandBraces(`x${"{a,b}".repeat(8)}`).length, 256);
    assert.equal(expandBraces("{a,{b,c}").join(" "), "{a,b {a,c");
  });

  test("a TypeScript here-document before a --no-verify commit is fast (#26)", () => {
    const code = fs
      .readFileSync(path.join(PLUGIN_DIR, "scripts", "lib", "protect.mjs"), "utf8")
      .split("\n")
      .slice(900, 935)
      .join("\n");
    const run = cpuTimed(() =>
      inspect(`cat > src/copy.mjs <<'EOF'\n${code}\nEOF\ngit commit --no-verify -m wip`),
    );
    assert.equal(run.error, null);
    assert.deepEqual(
      run.value.map((finding) => finding.ruleId),
      ["git-no-verify"],
    );
    assert.ok(run.cpuMs < 1_000, `used ${Math.round(run.cpuMs)} ms of CPU`);
  });

  test("the time budget turns a slow check into ProtectionIncomplete", () => {
    assert.throws(
      () =>
        inspectCommand({
          command: `rm ${Array.from({ length: 5_000 }, (_, i) => `f${i}`).join(" ")}`,
          dialect: "bash",
          protection,
          roots: [os.tmpdir()],
          cwd: os.tmpdir(),
          budgetMs: 0,
        }),
      ProtectionIncomplete,
    );
  });
});

describe("library: wildcards", () => {
  test("wildcardMatch: *, ?, classes, no regular expressions", () => {
    const cases = [
      ["phpstan*", "phpstan.neon", true],
      ["*.neon", "phpstan-baseline.neon", true],
      ["phpstan.ne?n", "phpstan.neon", true],
      ["phpstan.ne[o]n", "phpstan.neon", true],
      ["phpstan.ne[!o]n", "phpstan.neon", false],
      ["[a-c]*", "b.json", true],
      ["*.log", "pint.json", false],
      ["./apps/*", "./apps/api/phpstan.neon", true],
      [`${"*a".repeat(200)}b`, "a".repeat(250), false],
    ];
    for (const [pattern, text, expected] of cases) {
      assert.equal(wildcardMatch(pattern, text), expected, `${pattern} ~ ${text}`);
    }
  });
});

describe("failing closed through the hook (#11)", { concurrency: CONCURRENCY }, () => {
  test("a command over the cap asks, with the reason", async (t) => {
    const project = makeProject(t, PROJECT);
    const command = `#${"x".repeat(1024 * 1024)}\ngit commit --no-verify -m wip`;
    const output = assertIncomplete(
      await preToolUse(project, stdinFor(project, "Bash", { command })),
    );
    assert.match(output.permissionDecisionReason, /characters long/);
  });

  test("too many brace alternatives ask instead of crashing", async (t) => {
    const project = makeProject(t, PROJECT);
    const command = `git commit -m x; rm phpstan${"{a,b}".repeat(12)}`;
    const output = assertIncomplete(
      await preToolUse(project, stdinFor(project, "Bash", { command })),
    );
    assert.match(output.permissionDecisionReason, /brace alternatives/);
  });

  test("a 16 KB repetitive command gets its answer long before the platform timeout", async (t) => {
    const project = makeProject(t, PROJECT);
    const command = `git commit --no-verify -m wip; echo ${"git commit ".repeat(1_500)}`;
    const result = await preToolUse(project, stdinFor(project, "Bash", { command }));
    assertAsk(result, { entries: ["git-no-verify"], kind: "shell" });
    assert.ok(result.durationMs < 9_000, `took ${Math.round(result.durationMs)} ms`);
  });

  test("a here-document body is content, never a path (#26)", async (t) => {
    const project = makeProject(t, PROJECT);
    const command = "cat > notes.md <<'EOF'\nphpstan.neon\n.github/workflows/ci.yml\nEOF";
    assertSilent(await preToolUse(project, stdinFor(project, "Bash", { command })), command);
  });
});

describe("paths: aliases, repository root and home settings", () => {
  test(
    "macOS: the /System/Volumes/Data alias of the project is the project (#22)",
    { skip: process.platform !== "darwin" && "macOS only" },
    async (t) => {
      const project = makeProject(t, PROJECT);
      const alias = `/System/Volumes/Data${fs.realpathSync(project.root)}`;
      if (!fs.existsSync(alias)) {
        t.skip("the data volume alias is not available here");
        return;
      }
      const edit = { file_path: `${alias}/phpstan.neon`, old_string: "8", new_string: "0" };
      assertAsk(await preToolUse(project, stdinFor(project, "Edit", edit)), {
        entries: ["phpstan-config"],
        kind: "file",
      });
      const write = {
        file_path: `${alias}/.cross-stack/standard.json`,
        content: '{"version":"1.0.0","tracks":["web"],"disabled":true}\n',
      };
      assertAsk(await preToolUse(project, stdinFor(project, "Write", write)), {
        entries: ["cross-stack-config", "manifest-disabled"],
        kind: "file",
      });
      for (const [command, entries] of [
        [`rm -rf ${alias}/.github/workflows`, ["delete-protected-path"]],
        [`echo x > ${alias}/phpstan.neon`, ["write-to-protected-path"]],
      ]) {
        assertAsk(await preToolUse(project, stdinFor(project, "Bash", { command })), {
          entries,
          kind: "shell",
        });
      }
    },
  );

  test("a session started in a package protects the repository's root files", async (t) => {
    const files = { ...PROJECT, "lefthook.yml": "pre-commit: {}\n" };
    delete files[".cross-stack/standard.json"];
    delete files[".cross-stack/allowlists/PROC-014.json"];
    const project = makeProject(t, files);
    const packageDir = project.path("apps/web");
    const run = (tool, toolInput) =>
      runHook({
        event: "PreToolUse",
        stdin: stdinFor(project, tool, toolInput, packageDir),
        projectDir: packageDir,
      });
    assertAsk(
      await run("Write", { file_path: project.path(".github/workflows/ci.yml"), content: "x\n" }),
      { entries: ["ci-workflows"], kind: "file" },
    );
    assertAsk(await run("Bash", { command: "rm ../../lefthook.yml" }), {
      entries: ["delete-protected-path"],
      kind: "shell",
    });
    assertSilent(
      await run("Write", { file_path: project.path("apps/web/page.tsx"), content: "x\n" }),
      "package file",
    );
  });

  test(
    "the plugin switched off in the user's settings asks (#18)",
    { skip: process.platform === "win32" && "HOME is not the home directory on Windows" },
    async (t) => {
      const project = makeProject(t, PROJECT);
      const home = makeProject(t, {});
      const write = {
        file_path: home.path(".claude/settings.json"),
        content: '{"enabledPlugins": {"cross-stack-standard@cross-stack-standard": false}}\n',
      };
      const stdin = stdinFor(project, "Write", write);
      assertAsk(await preToolUse(project, stdin, { env: { HOME: home.root } }), {
        entries: ["claude-settings-switch"],
        kind: "file",
      });
      const plain = { ...write, content: '{"theme": "dark"}\n' };
      assertSilent(
        await preToolUse(project, stdinFor(project, "Write", plain), { env: { HOME: home.root } }),
        "theme",
      );
    },
  );

  test("git aliases from GIT_CONFIG_GLOBAL are read offline (#17)", async (t) => {
    const project = makeProject(t, PROJECT);
    const config = project.write("global.gitconfig", "[alias]\n\tsv = commit -n\n");
    const stdin = stdinFor(project, "Bash", { command: "git sv -m wip" });
    assertAsk(await preToolUse(project, stdin, { env: { GIT_CONFIG_GLOBAL: config } }), {
      entries: ["git-commit-short-n"],
      kind: "shell",
    });
  });
});
