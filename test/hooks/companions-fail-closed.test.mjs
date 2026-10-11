/**
 * Regressions for the companion gates failing closed, run through the real hook entry point with
 * a mocked Claude Code configuration (installed_plugins.json in a temporary directory): no
 * install, no network. Covers consent (only an explicit true permits a companion, in every
 * missing, invalid or false form), Chrome DevTools MCP on every action against the session's
 * current page, Figma reads and writes, Skill calls, shell installs and enables, and hand copies.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { importPlugin, makeProject, PLUGIN_DIR, tempDir } from "./helpers/project.mjs";
import { runHook } from "./helpers/run-hook.mjs";

const { loadCompanions, loadStatus } = await importPlugin("scripts/lib/companions.mjs");

const COMPANIONS = loadCompanions(PLUGIN_DIR);
const byName = Object.fromEntries(COMPANIONS.map((companion) => [companion.name, companion]));
const NAMES = COMPANIONS.map((companion) => companion.name);
const APPROVED = Object.fromEntries(NAMES.map((name) => [name, true]));
const CHROME = "mcp__plugin_chrome-devtools-mcp_chrome-devtools__";
const FIGMA = "mcp__plugin_figma_figma__";
const BLOCKED = ["ask", "deny"];

/** A mocked Claude Code configuration with every companion installed at its pin. */
function pinnedConfig(t) {
  const dir = tempDir(t, "cross-stack-claude-config-");
  fs.mkdirSync(path.join(dir, "plugins"), { recursive: true });
  const plugins = Object.fromEntries(
    COMPANIONS.map((c) => [
      `${c.name}@cross-stack-standard`,
      [{ scope: "user", version: c.version ?? "0", gitCommitSha: c.sha }],
    ]),
  );
  fs.writeFileSync(
    path.join(dir, "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins }),
  );
  return dir;
}

const MANIFEST = { version: "0.0.0", tracks: ["web"], profile: "next", tier: 2, modules: {} };

/**
 * A project and a hook runner. `manifest`: an object (merged into a valid manifest), a raw
 * string written as-is, or null for no manifest at all.
 */
function setup(t, manifest) {
  const files = {};
  if (typeof manifest === "string") files[".cross-stack/standard.json"] = manifest;
  else if (manifest !== null) files[".cross-stack/standard.json"] = { ...MANIFEST, ...manifest };
  const project = makeProject(t, files);
  const env = { CLAUDE_CONFIG_DIR: pinnedConfig(t) };
  const dataDir = tempDir(t, "cross-stack-data-");
  const call = async (event, fields, session = "session-1") => {
    const result = await runHook({
      event,
      projectDir: project.root,
      dataDir,
      env,
      stdin: {
        session_id: session,
        cwd: project.root,
        permission_mode: "default",
        hook_event_name: event,
        ...fields,
      },
    });
    assert.equal(result.exitCode, 0, result.stderr);
    if (result.stdout.trim() === "") return "silent";
    return result.json?.hookSpecificOutput?.permissionDecision ?? "note";
  };
  const pre = (tool, toolInput, session) =>
    call("PreToolUse", { tool_name: tool, tool_input: toolInput }, session);
  const post = (tool, toolInput, session) =>
    call("PostToolUse", { tool_name: tool, tool_input: toolInput, tool_response: {} }, session);
  return { project, env, pre, post, call };
}

describe("consent fails closed: only an explicit true permits a companion", () => {
  const cases = [
    ["no manifest", null],
    ["no companions record", {}],
    ["companions record not an object", { companions: "yes" }],
    ["values not booleans", { companions: Object.fromEntries(NAMES.map((n) => [n, "yes"])) }],
    ["an unparseable manifest", "{not json"],
    ["explicit false", { companions: Object.fromEntries(NAMES.map((n) => [n, false])) }],
  ];
  for (const [label, manifest] of cases) {
    test(`${label}: every companion use and install is denied`, async (t) => {
      const { pre } = setup(t, manifest);
      const denied = [
        [`${CHROME}navigate_page`, { type: "url", url: "http://localhost:3000/" }],
        [`${CHROME}take_screenshot`, {}],
        [`${FIGMA}get_metadata`, {}],
        [`${FIGMA}use_figma`, {}],
        ["Skill", { skill: "impeccable" }],
        ["Skill", { skill: "caveman" }],
        ["Skill", { skill: "impeccable:impeccable" }],
        ["Skill", { skill: "figma:figma-use" }],
        ["Bash", { command: "claude plugin install figma@cross-stack-standard --scope project" }],
        ["Bash", { command: "claude plugin install --scope user caveman@cross-stack-standard" }],
        ["Bash", { command: "claude plugin enable chrome-devtools-mcp@cross-stack-standard" }],
        ["Bash", { command: "claude plugin i impeccable" }],
      ];
      for (const [tool, input] of denied) {
        assert.equal(await pre(tool, input), "deny", `${tool} ${JSON.stringify(input)}`);
      }
    });
  }

  test("explicit true permits reads, skills and pinned installs", async (t) => {
    const { pre } = setup(t, { companions: APPROVED });
    assert.equal(await pre(`${FIGMA}get_metadata`, {}), "silent");
    assert.equal(await pre("Skill", { skill: "impeccable" }), "silent");
    assert.equal(await pre("Skill", { skill: "caveman:caveman-commit" }), "silent");
    assert.equal(
      await pre("Bash", {
        command: "claude plugin install figma@cross-stack-standard --scope project",
      }),
      "silent",
    );
    assert.equal(
      await pre("Bash", { command: "claude plugin install figma@claude-plugins-official" }),
      "ask",
      "an unpinned copy still asks",
    );
  });

  test("a skill that is not a companion's is never gated", async (t) => {
    const { pre } = setup(t, null);
    assert.equal(await pre("Skill", { skill: "run" }), "silent");
    assert.equal(await pre("Skill", { skill: "troubleshooting" }), "silent", "generic bare name");
    assert.equal(
      await pre("Skill", { skill: "chrome-devtools-mcp:troubleshooting" }),
      "deny",
      "the qualified name is the companion's",
    );
  });
});

describe("Chrome DevTools MCP fails closed on every action", () => {
  test("no known current page: reads, screenshots and reloads ask", async (t) => {
    const { pre } = setup(t, { companions: APPROVED });
    for (const tool of ["take_screenshot", "list_pages", "list_console_messages", "click"]) {
      assert.ok(BLOCKED.includes(await pre(`${CHROME}${tool}`, {})), tool);
    }
    assert.ok(BLOCKED.includes(await pre(`${CHROME}navigate_page`, { type: "reload" })));
  });

  test("a missing or invalid URL is never taken for localhost", async (t) => {
    const { pre } = setup(t, { companions: APPROVED });
    for (const input of [
      { type: "url" },
      { type: "url", url: "" },
      { type: "url", url: "not a url" },
      { type: "url", url: "javascript:alert(1)" },
      { type: "url", url: "file:///etc/hosts" },
    ]) {
      assert.ok(
        BLOCKED.includes(await pre(`${CHROME}navigate_page`, input)),
        JSON.stringify(input),
      );
    }
    assert.ok(BLOCKED.includes(await pre(`${CHROME}new_page`, {})), "new_page without a URL");
  });

  test("an explicit localhost URL is allowed, and so is work on that page", async (t) => {
    const { pre, post } = setup(t, { companions: APPROVED });
    const open = { type: "url", url: "http://localhost:3000/settings" };
    assert.equal(await pre(`${CHROME}navigate_page`, open), "silent");
    await post(`${CHROME}navigate_page`, open);
    assert.equal(await pre(`${CHROME}take_screenshot`, {}), "silent");
    assert.equal(await pre(`${CHROME}list_console_messages`, {}), "silent");
    assert.equal(await pre(`${CHROME}navigate_page`, { type: "reload" }), "silent");
    assert.ok(BLOCKED.includes(await pre(`${CHROME}evaluate_script`, {})), "scripts always ask");
    assert.ok(BLOCKED.includes(await pre(`${CHROME}upload_file`, {})), "uploads always ask");
  });

  test("unapproved hosts ask, as target and as current page", async (t) => {
    const { pre, post } = setup(t, { companions: APPROVED });
    for (const url of [
      "https://mail.example.com/",
      "http://10.0.0.5/",
      "http://localhost.evil.com/",
    ]) {
      assert.ok(BLOCKED.includes(await pre(`${CHROME}navigate_page`, { type: "url", url })), url);
    }
    await post(`${CHROME}navigate_page`, { type: "url", url: "https://mail.example.com/" });
    for (const tool of ["take_screenshot", "list_network_requests", "click"]) {
      assert.ok(BLOCKED.includes(await pre(`${CHROME}${tool}`, {})), tool);
    }
    assert.ok(BLOCKED.includes(await pre(`${CHROME}navigate_page`, { type: "reload" })));
  });

  test("back, forward, a page switch, a closed page or a failed navigation forget the page", async (t) => {
    const { pre, post, call } = setup(t, { companions: APPROVED });
    const local = { type: "url", url: "http://localhost:3000/" };
    for (const [tool, input] of [
      ["navigate_page", { type: "back" }],
      ["navigate_page", { type: "forward" }],
      ["select_page", { pageId: 2 }],
      ["close_page", { pageId: 1 }],
    ]) {
      await post(`${CHROME}navigate_page`, local);
      assert.equal(await pre(`${CHROME}take_screenshot`, {}), "silent");
      assert.ok(BLOCKED.includes(await pre(`${CHROME}${tool}`, input)) || tool !== "navigate_page");
      await post(`${CHROME}${tool}`, input);
      assert.ok(BLOCKED.includes(await pre(`${CHROME}take_screenshot`, {})), `after ${tool}`);
    }
    await post(`${CHROME}navigate_page`, local);
    await call("PostToolUseFailure", {
      tool_name: `${CHROME}navigate_page`,
      tool_input: { type: "url", url: "http://localhost:4000/" },
      error: "Navigation timeout",
    });
    assert.ok(BLOCKED.includes(await pre(`${CHROME}take_screenshot`, {})), "after a failure");
  });

  test("a page is per session: another session never inherits it", async (t) => {
    const { pre, post } = setup(t, { companions: APPROVED });
    await post(`${CHROME}navigate_page`, { type: "url", url: "http://localhost:3000/" }, "a");
    assert.equal(await pre(`${CHROME}take_screenshot`, {}, "a"), "silent");
    assert.ok(BLOCKED.includes(await pre(`${CHROME}take_screenshot`, {}, "b")));
  });

  test("a configured development host is allowed only when listed", async (t) => {
    const url = "https://app.example.dev/";
    const listed = setup(t, {
      companions: APPROVED,
      hooks: { preToolUse: { browserHosts: ["*.example.dev"] } },
    });
    assert.equal(await listed.pre(`${CHROME}navigate_page`, { type: "url", url }), "silent");
    const unlisted = setup(t, { companions: APPROVED });
    assert.ok(BLOCKED.includes(await unlisted.pre(`${CHROME}navigate_page`, { type: "url", url })));
  });
});

describe("Figma MCP reads and writes", () => {
  test("reads pass and writes ask with consent; both are denied without it", async (t) => {
    const approved = setup(t, { companions: APPROVED });
    assert.equal(await approved.pre(`${FIGMA}get_design_context`, {}), "silent");
    assert.equal(await approved.pre(`${FIGMA}use_figma`, {}), "ask");
    assert.equal(await approved.pre(`${FIGMA}some_new_tool`, {}), "ask", "unknown tools ask");
    const declined = setup(t, { companions: { ...APPROVED, figma: false } });
    assert.equal(await declined.pre(`${FIGMA}get_design_context`, {}), "deny");
    assert.equal(await declined.pre(`${FIGMA}use_figma`, {}), "deny");
  });
});

describe("duplicates: hand copies beside the pinned companion", () => {
  test("hand-copied skills and agents are reported and make companion use ask", async (t) => {
    const { pre, env, project } = setup(t, { companions: APPROVED });
    const config = env.CLAUDE_CONFIG_DIR;
    fs.mkdirSync(path.join(config, "skills", "impeccable"), { recursive: true });
    fs.mkdirSync(path.join(config, "skills", "caveman-commit"), { recursive: true });
    fs.mkdirSync(path.join(config, "agents"), { recursive: true });
    fs.writeFileSync(path.join(config, "agents", "impeccable-documenter.md"), "x");
    const { statuses } = loadStatus({
      pluginRoot: PLUGIN_DIR,
      projectRoot: project.root,
      env,
      manifest: { companions: APPROVED },
      dataDir: null,
    });
    const find = (name) => statuses.find((status) => status.name === name).duplicates;
    assert.deepEqual(find("impeccable"), [
      "hand copy skills/impeccable",
      "hand copy agents/impeccable-documenter.md",
    ]);
    assert.deepEqual(find("caveman"), ["hand copy skills/caveman-commit"]);
    assert.equal(await pre("Skill", { skill: "impeccable" }), "ask");
    assert.equal(await pre("Skill", { skill: "caveman" }), "ask");
    assert.equal(byName.figma.skills.length > 0, true);
  });
});
