/**
 * Companion plugins (ADR 0106): the consent flow, the status and health checks, the permission
 * gates, the fallbacks and the structured log — the library, the CLI and each hook end to end.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, test } from "node:test";

import { importPlugin, makeProject, PLUGIN_DIR, tempDir } from "./helpers/project.mjs";
import { cleanEnv, runHook } from "./helpers/run-hook.mjs";

const lib = await importPlugin("scripts/lib/companions.mjs");
const {
  appendLog,
  companionStatus,
  gateToolCall,
  hostAllowed,
  inspectCompanionCommand,
  loadCompanions,
  LOG_KEEP,
  LOG_MAX_LINES,
  planConsent,
  readHealth,
  readInstalled,
  readLog,
  statusLine,
  writeHealth,
} = lib;

const COMPANIONS = loadCompanions(PLUGIN_DIR);
const byName = Object.fromEntries(COMPANIONS.map((companion) => [companion.name, companion]));
const NAMES = ["caveman", "impeccable", "figma", "playwright-mcp", "chrome-devtools-mcp"];
const PLAYWRIGHT = "mcp__plugin_playwright-mcp_playwright__";
const CHROME = "mcp__plugin_chrome-devtools-mcp_chrome-devtools__";
const FIGMA = "mcp__plugin_figma_figma__";
const CLI = path.join(PLUGIN_DIR, "scripts", "companions.mjs");
/** Explicit consent for every companion. */
const APPROVED = Object.fromEntries(NAMES.map((name) => [name, true]));

/** An installed_plugins.json map: id -> entries. */
function installedMap(spec) {
  return new Map(Object.entries(spec));
}

function pinned(name) {
  return [{ scope: "project", commit: byName[name].sha, version: byName[name].version }];
}

function status(options = {}) {
  return companionStatus({
    companions: COMPANIONS,
    installed: installedMap(options.installed ?? {}),
    enabled: new Map(Object.entries(options.enabled ?? {})),
    consent: options.consent ?? APPROVED,
    health: options.health ?? {},
  });
}

function stateOf(statuses, name) {
  return statuses.find((entry) => entry.name === name);
}

/** A Claude Code configuration directory with the given installs and user settings. */
function configDir(t, { plugins = {}, enabledPlugins = {} } = {}) {
  const dir = tempDir(t, "cross-stack-claude-config-");
  fs.mkdirSync(path.join(dir, "plugins"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins }),
  );
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ enabledPlugins }));
  return dir;
}

function installEntry(name, { sha = byName[name].sha, scope = "project", projectPath } = {}) {
  return [{ scope, version: byName[name].version ?? "0", gitCommitSha: sha, projectPath }];
}

function manifest(companions) {
  return {
    ".cross-stack/standard.json": {
      version: "0.0.0",
      tracks: ["web"],
      profile: "next",
      tier: 2,
      modules: { design: false, "browser-check": false },
      ...(companions ? { companions } : {}),
    },
  };
}

function runCli(args, { env = {}, cwd = process.cwd() } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: cleanEnv(env),
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("companion data", () => {
  test("lists the five pinned companions with their consent text", () => {
    assert.deepEqual(
      COMPANIONS.map((companion) => companion.name),
      NAMES,
    );
    for (const companion of COMPANIONS) {
      assert.match(companion.sha, /^[0-9a-f]{40}$/, companion.name);
      for (const field of ["purpose", "access", "network", "license", "fallback"]) {
        assert.ok(companion[field].length > 3, `${companion.name}.${field}`);
      }
    }
    assert.equal(byName.caveman.scope, "user");
    assert.equal(byName.impeccable.module, "design");
    assert.equal(byName["playwright-mcp"].module, "browser-check");
    assert.equal(byName["chrome-devtools-mcp"].module, "browser-check");
  });
});

describe("status and health checks", () => {
  test("pinned and enabled: unverified until a call succeeds, then ready", () => {
    const installed = { "figma@cross-stack-standard": pinned("figma") };
    assert.equal(stateOf(status({ installed }), "figma").state, "unverified");
    assert.equal(stateOf(status({ installed }), "figma").usable, true);
    const health = { figma: { status: "ok", at: "x", detail: null } };
    const ready = stateOf(status({ installed, health }), "figma");
    assert.equal(ready.state, "ready");
    assert.match(ready.message, /is ready \(pinned [0-9a-f]{7}\)/);
  });

  test("a failed last call makes it unhealthy, unusable, with the fallback", () => {
    const installed = { "figma@cross-stack-standard": pinned("figma") };
    const health = { figma: { status: "failed", at: "x", detail: "401 Unauthorized" } };
    const figma = stateOf(status({ installed, health }), "figma");
    assert.equal(figma.state, "unhealthy");
    assert.equal(figma.usable, false);
    assert.match(figma.message, /401 Unauthorized/);
    assert.ok(figma.message.includes(byName.figma.fallback));
  });

  test("skills-only companions have no health check and are ready when installed", () => {
    const installed = { "caveman@cross-stack-standard": pinned("caveman") };
    const caveman = stateOf(status({ installed }), "caveman");
    assert.equal(caveman.health, "n/a");
    assert.equal(caveman.state, "ready");
  });

  test("missing, declined, disabled and unpinned are unusable and say why", () => {
    const statuses = status({
      installed: {
        "impeccable@cross-stack-standard": [{ scope: "project", commit: "0".repeat(40) }],
        "chrome-devtools-mcp@cross-stack-standard": pinned("chrome-devtools-mcp"),
      },
      enabled: { "chrome-devtools-mcp@cross-stack-standard": false },
      consent: { ...APPROVED, figma: false },
    });
    assert.equal(stateOf(statuses, "caveman").state, "not-installed");
    assert.equal(stateOf(statuses, "figma").state, "declined");
    assert.match(stateOf(statuses, "figma").message, /declined for this project/);
    assert.equal(stateOf(statuses, "chrome-devtools-mcp").state, "disabled");
    assert.equal(stateOf(statuses, "impeccable").state, "unpinned");
    assert.match(stateOf(statuses, "impeccable").message, /not the Standard's pin/);
    for (const entry of statuses) assert.equal(entry.usable, false, entry.name);
  });

  test("a second copy from another marketplace is reported as a duplicate", () => {
    const figma = stateOf(
      status({
        installed: {
          "figma@cross-stack-standard": pinned("figma"),
          "figma@claude-plugins-official": [{ scope: "user", commit: null }],
        },
      }),
      "figma",
    );
    assert.deepEqual(figma.duplicates, ["figma@claude-plugins-official"]);
    assert.match(figma.message, /Another copy is present/);
    const disabledCopy = stateOf(
      status({
        installed: { "figma@claude-plugins-official": [{ scope: "user", commit: null }] },
        enabled: { "figma@claude-plugins-official": false },
      }),
      "figma",
    );
    assert.deepEqual(disabledCopy.duplicates, [], "a disabled copy is not a duplicate");
  });

  test("installs for another project do not count", (t) => {
    const project = makeProject(t);
    const other = makeProject(t);
    const dir = configDir(t, {
      plugins: {
        "figma@cross-stack-standard": installEntry("figma", { projectPath: other.root }),
        "impeccable@cross-stack-standard": installEntry("impeccable", {
          projectPath: project.root,
        }),
        "caveman@cross-stack-standard": installEntry("caveman", { scope: "user" }),
      },
    });
    const installed = readInstalled(dir, project.root);
    assert.deepEqual([...installed.keys()].sort(), [
      "caveman@cross-stack-standard",
      "impeccable@cross-stack-standard",
    ]);
  });

  test("the session status line appears only when a companion is installed or answered", () => {
    assert.equal(statusLine(status({ consent: {} })), null);
    const line = statusLine(
      status({
        installed: { "figma@cross-stack-standard": pinned("figma") },
        consent: { caveman: false, figma: true },
      }),
    );
    assert.match(line, /^Companions: caveman declined, figma installed, unverified/);
    assert.doesNotMatch(line, /doctor/, "declined and unverified need no fix");
    const broken = statusLine(
      status({
        installed: { "figma@cross-stack-standard": pinned("figma") },
        health: { figma: { status: "failed", at: "x", detail: "401" } },
        consent: { figma: true },
      }),
    );
    assert.match(broken, /figma failed last call; \/cross-stack-standard:doctor explains/);
  });
});

describe("consent flow", () => {
  const none = status();

  test("installs only the approved companions, at their scope, from this marketplace", () => {
    const plan = planConsent({
      companions: COMPANIONS,
      statuses: none,
      approve: ["impeccable", "caveman"],
      decline: ["figma", "playwright-mcp", "chrome-devtools-mcp"],
    });
    assert.deepEqual(plan.consent, {
      caveman: true,
      impeccable: true,
      figma: false,
      "playwright-mcp": false,
      "chrome-devtools-mcp": false,
    });
    assert.deepEqual(
      plan.install.map((step) => step.command),
      [
        "claude plugin install caveman@cross-stack-standard --scope user",
        "claude plugin install impeccable@cross-stack-standard --scope project",
      ],
    );
    assert.deepEqual(
      plan.skipped.map((step) => `${step.name}: ${step.reason}`),
      ["figma: declined", "playwright-mcp: declined", "chrome-devtools-mcp: declined"],
    );
  });

  test("declining everything installs nothing", () => {
    const plan = planConsent({
      companions: COMPANIONS,
      statuses: none,
      approve: [],
      decline: NAMES,
    });
    assert.deepEqual(plan.install, []);
    assert.ok(Object.values(plan.consent).every((value) => value === false));
  });

  test("never installs twice; updates an unpinned copy; offers to disable duplicates", () => {
    const statuses = status({
      installed: {
        "caveman@cross-stack-standard": pinned("caveman"),
        "impeccable@cross-stack-standard": [{ scope: "project", commit: "1".repeat(40) }],
        "figma@claude-plugins-official": [{ scope: "user", commit: null }],
        "chrome-devtools-mcp@cross-stack-standard": pinned("chrome-devtools-mcp"),
      },
    });
    const plan = planConsent({
      companions: COMPANIONS,
      statuses,
      approve: ["caveman", "impeccable", "figma"],
      decline: ["playwright-mcp", "chrome-devtools-mcp"],
    });
    assert.deepEqual(
      plan.install.map((step) => step.command),
      [
        "claude plugin update impeccable@cross-stack-standard --scope project",
        "claude plugin install figma@cross-stack-standard --scope project",
      ],
    );
    assert.deepEqual(plan.skipped[0], {
      name: "caveman",
      reason: "already installed at the pinned commit",
    });
    assert.deepEqual(
      plan.disable.map((step) => step.command),
      [
        "claude plugin disable figma@claude-plugins-official",
        "claude plugin disable chrome-devtools-mcp@cross-stack-standard --scope project",
      ],
    );
  });

  test("every companion must be answered exactly once", () => {
    const answer = (approve, decline) => () =>
      planConsent({ companions: COMPANIONS, statuses: none, approve, decline });
    assert.throws(
      answer(["figma"], []),
      /no answer for caveman, impeccable, playwright-mcp, chrome-devtools-mcp/,
    );
    assert.throws(answer(["figma", ...NAMES], []), /answered twice/);
    assert.throws(answer(["slack", ...NAMES], []), /unknown companion "slack"/);
  });
});

describe("permission gates", () => {
  const ready = status({
    installed: {
      "figma@cross-stack-standard": pinned("figma"),
      "playwright-mcp@cross-stack-standard": pinned("playwright-mcp"),
      "chrome-devtools-mcp@cross-stack-standard": pinned("chrome-devtools-mcp"),
    },
  });
  const gate = (
    toolName,
    toolInput = {},
    statuses = ready,
    browserHosts = [],
    currentPage = null,
  ) =>
    gateToolCall({
      toolName,
      toolInput,
      companions: COMPANIONS,
      statuses,
      browserHosts,
      currentPage,
    });

  test("local and configured development hosts open without a prompt", () => {
    for (const url of [
      "http://localhost:3000/",
      "http://127.0.0.1:8000/admin",
      "http://[::1]:5173/",
      "https://app.test/",
      "http://shop.localhost/",
    ]) {
      assert.equal(gate(`${CHROME}navigate_page`, { url }), null, url);
      assert.equal(gate(`${PLAYWRIGHT}browser_navigate`, { url }), null, url);
    }
    assert.equal(
      gate(`${CHROME}new_page`, { url: "https://staging.example.dev/" }, ready, ["*.example.dev"]),
      null,
    );
    assert.equal(
      gate(`${CHROME}navigate_page`, { type: "reload" }, ready, [], "http://localhost:3000/"),
      null,
      "a reload of a local current page",
    );
    assert.equal(
      gate(`${PLAYWRIGHT}browser_snapshot`, {}, ready, [], "http://localhost:3000/"),
      null,
      "a read on a known local page",
    );
    assert.equal(hostAllowed("evil-localhost", []), false);
  });

  test("any other page, a non-web address, a page script or an upload asks", () => {
    for (const [tool, input, pattern] of [
      ["navigate_page", { url: "https://github.com/" }, /github\.com is not a local/],
      ["new_page", { url: "file:///etc/passwd" }, /not a web address/],
      ["evaluate_script", { function: "() => document.cookie" }, /script in the page/],
      ["upload_file", { filePath: "/tmp/x" }, /upload sends a local file/],
      ["some_future_tool", {}, /not on the Standard's reviewed list/],
    ]) {
      const result = gate(`${CHROME}${tool}`, input);
      assert.equal(result?.decision, "ask", tool);
      assert.match(result.reason, pattern, tool);
    }
    assert.equal(gate(`${CHROME}take_screenshot`, {}, ready, [], "http://localhost:3000/"), null);
  });

  test("Playwright MCP keeps unsafe, sensitive and unreviewed tools behind a confirmation", () => {
    for (const [tool, input, pattern] of [
      ["browser_navigate", { url: "https://example.com/" }, /example\.com is not a local/],
      ["browser_evaluate", { function: "() => document.cookie" }, /runs JavaScript in the page/],
      [
        "browser_run_code_unsafe",
        { code: "async () => process.env" },
        /arbitrary code in the MCP server/,
      ],
      ["browser_file_upload", { paths: ["/tmp/private.txt"] }, /send a local file or data/],
      ["browser_drop", { target: "dropzone", data: {} }, /send a local file or data/],
      ["browser_network_request", { index: 1 }, /expose request headers and bodies/],
      ["browser_find", { text: "token", filename: "captures/find.txt" }, /save browser output/],
      ["browser_future_tool", {}, /not on the Standard's reviewed list/],
    ]) {
      const result = gate(`${PLAYWRIGHT}${tool}`, input, ready, [], "http://localhost:3000/");
      assert.equal(result?.decision, "ask", tool);
      assert.match(result.reason, pattern, tool);
    }
  });

  test("Figma reads pass; anything that can change a file asks", () => {
    for (const tool of ["get_design_context", "get_metadata", "whoami", "search_design_system"]) {
      assert.equal(gate(`${FIGMA}${tool}`), null, tool);
    }
    for (const tool of ["use_figma", "create_new_file", "generate_figma_design", "upload_assets"]) {
      assert.equal(gate(`${FIGMA}${tool}`)?.decision, "ask", tool);
    }
  });

  test("a declined companion is denied with its fallback; an unpinned or duplicated one asks", () => {
    const declined = status({ consent: { ...APPROVED, figma: false } });
    const result = gate(`${FIGMA}get_metadata`, {}, declined);
    assert.equal(result.decision, "deny");
    assert.ok(result.reason.includes(byName.figma.fallback));
    const unpinned = status({
      installed: { "figma@cross-stack-standard": [{ scope: "user", commit: "2".repeat(40) }] },
    });
    assert.equal(gate(`${FIGMA}get_metadata`, {}, unpinned).decision, "ask");
    const duplicated = status({
      installed: {
        "figma@cross-stack-standard": pinned("figma"),
        "figma@claude-plugins-official": [{ scope: "user", commit: null }],
      },
    });
    assert.match(gate(`${FIGMA}get_metadata`, {}, duplicated).reason, /Another copy of Figma MCP/);
  });

  test("after a failed call, the next call carries the fallback for Claude", () => {
    const unhealthy = status({
      installed: { "figma@cross-stack-standard": pinned("figma") },
      health: { figma: { status: "failed", at: "x", detail: "Needs authentication" } },
    });
    const result = gate(`${FIGMA}get_metadata`, {}, unhealthy);
    assert.equal(result.decision, null);
    assert.match(result.context, /Needs authentication/);
    assert.ok(result.context.includes(byName.figma.fallback));
  });

  test("other MCP tools are not the companions' business", () => {
    assert.equal(gate("mcp__github__create_issue"), null);
  });

  test("installing a declined companion is denied; from another marketplace it asks", () => {
    const inspect = (command, consent = APPROVED) =>
      inspectCompanionCommand({ command, companions: COMPANIONS, consent });
    assert.deepEqual(
      inspect("claude plugin install figma@cross-stack-standard --scope project"),
      [],
    );
    assert.equal(
      inspect("claude plugin install figma@cross-stack-standard", { ...APPROVED, figma: false })[0]
        .decision,
      "deny",
    );
    assert.equal(
      inspect("claude plugin install --scope user figma@claude-plugins-official")[0].decision,
      "ask",
    );
    assert.equal(inspect("cd x && claude plugin enable caveman")[0].decision, "ask");
    assert.deepEqual(inspect("claude plugin install some-other-plugin@market"), []);
  });
});

describe("structured log and health record", () => {
  test("entries are JSON lines with a timestamp and an event, trimmed past the cap", (t) => {
    const dir = tempDir(t, "cross-stack-data-");
    const now = new Date("2026-09-26T12:00:00Z");
    assert.equal(appendLog(dir, { event: "gate", companion: "figma", decision: "ask" }, now), true);
    const [entry] = readLog(dir, 5);
    assert.deepEqual(entry, {
      ts: "2026-09-26T12:00:00.000Z",
      event: "gate",
      companion: "figma",
      decision: "ask",
    });
    for (let i = 0; i < LOG_MAX_LINES; i += 1) appendLog(dir, { event: "status", n: i }, now);
    const lines = fs.readFileSync(path.join(dir, lib.LOG_FILE), "utf8").trim().split("\n");
    assert.ok(lines.length <= LOG_MAX_LINES && lines.length >= LOG_KEEP, `${lines.length} lines`);
    fs.appendFileSync(path.join(dir, lib.LOG_FILE), '{"torn":\n');
    assert.equal(readLog(dir, 3).length, 2, "a torn line is skipped");
    assert.equal(appendLog(null, { event: "x" }), false, "no data directory: nothing written");
  });

  test("health is recorded per companion and returns the previous state", (t) => {
    const dir = tempDir(t, "cross-stack-data-");
    assert.equal(writeHealth(dir, "figma", "failed", "a\nb"), null);
    assert.equal(writeHealth(dir, "figma", "ok", null), "failed");
    assert.equal(readHealth(dir).figma.status, "ok");
    assert.equal(writeHealth(null, "figma", "ok", null), null);
  });
});

describe("companions CLI", () => {
  test("describe prints the consent text; status exits 1 for an approved but missing one", (t) => {
    const project = makeProject(t, manifest({ figma: true }));
    const env = { CLAUDE_CONFIG_DIR: configDir(t) };
    const described = runCli(["describe", "--json"], { env });
    assert.equal(described.code, 0);
    assert.deepEqual(
      JSON.parse(described.stdout).map((c) => c.name),
      NAMES,
    );
    const checked = runCli(["status", "--root", project.root], { env });
    assert.equal(checked.code, 1);
    assert.match(checked.stdout, /warn figma: not-installed \(consent approved\)/);
  });

  test("record writes the consent and module switches, logs each answer, prints only approved installs", (t) => {
    const project = makeProject(t, manifest());
    const data = tempDir(t, "cross-stack-data-");
    const env = { CLAUDE_CONFIG_DIR: configDir(t) };
    const result = runCli(
      [
        "record",
        "--root",
        project.root,
        "--data-dir",
        data,
        "--approve",
        "chrome-devtools-mcp,caveman",
        "--decline",
        "impeccable,figma,playwright-mcp",
      ],
      { env },
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(
      result.stdout,
      /install chrome-devtools-mcp: claude plugin install chrome-devtools-mcp@cross-stack-standard --scope project/,
    );
    assert.doesNotMatch(result.stdout, /install (impeccable|figma):/);
    const written = JSON.parse(fs.readFileSync(project.path(".cross-stack/standard.json"), "utf8"));
    assert.deepEqual(written.companions, {
      caveman: true,
      impeccable: false,
      figma: false,
      "playwright-mcp": false,
      "chrome-devtools-mcp": true,
    });
    assert.equal(written.modules.design, false);
    assert.equal(written.modules["browser-check"], true);
    const consent = readLog(data, 10).filter((entry) => entry.event === "consent");
    assert.equal(consent.length, 5);
  });

  test("browser-check is enabled by either browser companion", (t) => {
    for (const [approve, decline, expected] of [
      ["caveman,impeccable,figma,playwright-mcp", "chrome-devtools-mcp", true],
      ["caveman,impeccable,figma,chrome-devtools-mcp", "playwright-mcp", true],
      ["caveman,impeccable,figma", "playwright-mcp,chrome-devtools-mcp", false],
    ]) {
      const project = makeProject(t, manifest());
      const result = runCli(
        ["record", "--root", project.root, "--approve", approve, "--decline", decline],
        { env: { CLAUDE_CONFIG_DIR: configDir(t) } },
      );
      assert.equal(result.code, 0, result.stderr);
      const written = JSON.parse(
        fs.readFileSync(project.path(".cross-stack/standard.json"), "utf8"),
      );
      assert.equal(written.modules["browser-check"], expected);
    }
  });

  test("record refuses partial answers and a missing manifest (exit 2), writing nothing", (t) => {
    const project = makeProject(t, manifest());
    const env = { CLAUDE_CONFIG_DIR: configDir(t) };
    const before = fs.readFileSync(project.path(".cross-stack/standard.json"), "utf8");
    const partial = runCli(["record", "--root", project.root, "--approve", "figma"], { env });
    assert.equal(partial.code, 2);
    assert.match(partial.stderr, /no answer for/);
    assert.equal(fs.readFileSync(project.path(".cross-stack/standard.json"), "utf8"), before);
    const empty = makeProject(t);
    const missing = runCli(["record", "--root", empty.root, "--decline", NAMES.join(",")], { env });
    assert.equal(missing.code, 2);
  });

  test("health and log record and show probes", (t) => {
    const data = tempDir(t, "cross-stack-data-");
    const env = { CLAUDE_CONFIG_DIR: configDir(t) };
    assert.equal(
      runCli(["health", "figma", "failed", "--detail", "no sign-in", "--data-dir", data], { env })
        .code,
      0,
    );
    const shown = runCli(["log", "--tail", "1", "--data-dir", data], { env });
    assert.match(shown.stdout, /"event":"health".*"companion":"figma".*"status":"failed"/);
    assert.equal(runCli(["health", "slack", "ok", "--data-dir", data], { env }).code, 2);
  });
});

describe("hooks end to end", () => {
  function setup(t, { consent = APPROVED, plugins = {} } = {}) {
    const project = makeProject(t, manifest(consent));
    const data = tempDir(t, "cross-stack-data-");
    const env = { CLAUDE_CONFIG_DIR: configDir(t, { plugins }) };
    return { project, data, env };
  }
  const input = (project, event, fields) => ({
    session_id: "00000000-0000-4000-8000-000000000009",
    transcript_path: project.path(".transcript.jsonl"),
    cwd: project.root,
    permission_mode: "default",
    hook_event_name: event,
    ...fields,
  });

  test("PreToolUse asks before the browser opens a non-development site, and logs it", async (t) => {
    const { project, data, env } = setup(t, {
      plugins: { "chrome-devtools-mcp@cross-stack-standard": installEntry("chrome-devtools-mcp") },
    });
    const result = await runHook({
      event: "PreToolUse",
      projectDir: project.root,
      dataDir: data,
      env,
      stdin: input(project, "PreToolUse", {
        tool_name: `${CHROME}navigate_page`,
        tool_input: { url: "https://mail.example.com/" },
      }),
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.json.hookSpecificOutput.permissionDecision, "ask");
    assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /mail\.example\.com/);
    const [entry] = readLog(data, 1);
    assert.equal(entry.event, "gate");
    assert.equal(entry.decision, "ask");
  });

  test("PreToolUse denies a declined companion and a shell install of it", async (t) => {
    const { project, data, env } = setup(t, { consent: { figma: false } });
    const tool = await runHook({
      event: "PreToolUse",
      projectDir: project.root,
      dataDir: data,
      env,
      stdin: input(project, "PreToolUse", { tool_name: `${FIGMA}get_metadata`, tool_input: {} }),
    });
    assert.equal(tool.json.hookSpecificOutput.permissionDecision, "deny");
    const shell = await runHook({
      event: "PreToolUse",
      projectDir: project.root,
      dataDir: data,
      env,
      stdin: input(project, "PreToolUse", {
        tool_name: "Bash",
        tool_input: { command: "claude plugin install figma@cross-stack-standard --scope project" },
      }),
    });
    assert.equal(shell.json.hookSpecificOutput.permissionDecision, "deny");
    assert.match(shell.json.hookSpecificOutput.permissionDecisionReason, /declined/);
  });

  test("PostToolUse records a healthy companion; PostToolUseFailure records the failure and returns the fallback", async (t) => {
    const { project, data, env } = setup(t, {
      plugins: { "figma@cross-stack-standard": installEntry("figma") },
    });
    const ok = await runHook({
      event: "PostToolUse",
      projectDir: project.root,
      dataDir: data,
      env,
      stdin: input(project, "PostToolUse", {
        tool_name: `${FIGMA}whoami`,
        tool_input: {},
        tool_response: { ok: true },
      }),
    });
    assert.equal(ok.exitCode, 0);
    assert.equal(ok.stdout, "");
    assert.equal(readHealth(data).figma.status, "ok");
    const failed = await runHook({
      event: "PostToolUseFailure",
      projectDir: project.root,
      dataDir: data,
      env,
      stdin: input(project, "PostToolUseFailure", {
        tool_name: `${FIGMA}get_metadata`,
        tool_input: {},
        error: "Needs authentication\nmore",
      }),
    });
    assert.equal(failed.exitCode, 0);
    const context = failed.json.hookSpecificOutput.additionalContext;
    assert.equal(failed.json.hookSpecificOutput.hookEventName, "PostToolUseFailure");
    assert.match(context, /Figma MCP failed \(Needs authentication\)/);
    assert.ok(context.includes(byName.figma.fallback));
    assert.equal(readHealth(data).figma.status, "failed");
    assert.deepEqual(
      readLog(data, 5).map((entry) => `${entry.event}:${entry.status}`),
      ["health:ok", "health:failed"],
    );
  });

  test("SessionStart reports the companions at startup", async (t) => {
    const { project, data, env } = setup(t, {
      consent: { caveman: false, impeccable: true },
      plugins: { "impeccable@cross-stack-standard": installEntry("impeccable") },
    });
    const result = await runHook({
      event: "SessionStart",
      projectDir: project.root,
      dataDir: data,
      env,
      stdin: input(project, "SessionStart", { source: "startup" }),
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Companions: caveman declined, impeccable ready\./);
    assert.match(result.stdout, /never claim a result from one that is not/);
    assert.equal(readLog(data, 1)[0].event, "status");
  });
});
