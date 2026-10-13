/**
 * Tests for the marketplace catalog, the plugin manifest and hooks.json.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { REPO_ROOT, VERSION, readJson, tempDir, which } from "./helpers.mjs";

const PLUGIN_DIR = path.join(REPO_ROOT, "plugins/cross-stack-standard");
const marketplace = readJson(path.join(REPO_ROOT, ".claude-plugin/marketplace.json"));
const plugin = readJson(path.join(PLUGIN_DIR, ".claude-plugin/plugin.json"));
const hooks = readJson(path.join(PLUGIN_DIR, "hooks/hooks.json"));

const AUTHOR = {
  name: "Qusai Abdullah",
  email: "qusaii.abdullah@gmail.com",
  url: "https://github.com/o6b7",
};
const REPOSITORY = "https://github.com/o6b7/cross-stack-standard";
/** The companion plugins the marketplace pins and adopt offers, in catalog order. */
const COMPANIONS = ["caveman", "impeccable", "figma", "playwright-mcp", "chrome-devtools-mcp"];

describe("marketplace.json", () => {
  test("names the marketplace and its owner", () => {
    assert.equal(marketplace.name, "cross-stack-standard");
    assert.equal(marketplace.owner.name, "Qusai Abdullah");
    assert.equal(marketplace.owner.email, AUTHOR.email);
  });

  test("carries the release version in metadata only", () => {
    assert.equal(marketplace.metadata.version, VERSION);
    assert.ok(marketplace.metadata.description.length > 20);
    assert.equal(marketplace.version, undefined, "top-level version would be a second copy");
  });

  test("defines no $schema, because the documentation names no official schema", () => {
    assert.equal(marketplace.$schema, undefined);
    assert.equal(plugin.$schema, undefined);
  });

  test("lists the Standard first, by relative path, without an entry version", () => {
    const [entry] = marketplace.plugins;
    assert.equal(entry.name, "cross-stack-standard");
    assert.equal(entry.source, "./plugins/cross-stack-standard");
    assert.equal(
      entry.version,
      undefined,
      "plugin.json holds the version; a second copy can only drift",
    );
    assert.equal(entry.license, "MIT");
    assert.equal(typeof entry.category, "string");
    const target = path.join(REPO_ROOT, entry.source, ".claude-plugin/plugin.json");
    assert.ok(fs.existsSync(target), `${entry.source} has a plugin manifest`);
  });

  test("lists the five companion plugins after the Standard, each pinned to a full commit", () => {
    const companions = marketplace.plugins.slice(1);
    assert.deepEqual(
      companions.map((entry) => entry.name),
      COMPANIONS,
    );
    for (const entry of companions) {
      assert.equal(typeof entry.source, "object", `${entry.name}: a git source, never a path`);
      assert.ok(["git-subdir", "url"].includes(entry.source.source), `${entry.name}: source`);
      assert.match(entry.source.url, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/, entry.name);
      assert.match(entry.source.sha, /^[0-9a-f]{40}$/, `${entry.name}: a full commit SHA`);
      assert.match(entry.description, /^Companion of the Cross-Stack Standard: /, entry.name);
    }
  });

  test("a companion is never a dependency, so nothing installs without the user's yes", () => {
    assert.equal(plugin.dependencies, undefined);
    for (const entry of marketplace.plugins)
      assert.equal(entry.dependencies, undefined, entry.name);
  });

  test("adopt installs every companion, and only from this marketplace", () => {
    const adopt = fs.readFileSync(path.join(PLUGIN_DIR, "skills/adopt/SKILL.md"), "utf8");
    for (const name of COMPANIONS) {
      assert.match(adopt, new RegExp(`claude plugin install ${name}@cross-stack-standard `), name);
    }
    assert.doesNotMatch(adopt, /claude plugin install [\w-]+@(?!cross-stack-standard\b)/);
  });

  test("the caveman and impeccable companions load no hooks, as the user chose", () => {
    const byName = Object.fromEntries(marketplace.plugins.map((entry) => [entry.name, entry]));
    assert.deepEqual(byName.caveman.skills, [
      "./caveman",
      "./caveman-commit",
      "./caveman-review",
      "./caveman-help",
    ]);
    // Their git-subdir paths hold no plugin.json, so the entry is the whole manifest: no hooks.
    for (const name of ["caveman", "impeccable", "chrome-devtools-mcp"]) {
      assert.equal(byName[name].source.source, "git-subdir", name);
      assert.equal(byName[name].hooks, undefined, name);
    }
    const playwright = byName["playwright-mcp"];
    assert.equal(playwright.source.source, "url");
    assert.equal(playwright.source.url, "https://github.com/microsoft/playwright-mcp.git");
    assert.equal(playwright.source.sha, "f183dad4a52965583e3cc1d59b88cdc279e2e57d");
    assert.equal(playwright.version, "0.0.83");
    assert.equal(playwright.hooks, undefined);
    assert.equal(
      playwright.skills,
      undefined,
      "the upstream repo does not provide a browser skill",
    );
    const playwrightServer = playwright.mcpServers.playwright;
    assert.equal(playwrightServer.command, "npx");
    assert.ok(playwrightServer.args.includes("@playwright/mcp@0.0.83"));
    for (const flag of ["--isolated", "--headless", "--no-webmcp", "--console-level"]) {
      assert.ok(playwrightServer.args.includes(flag), flag);
    }
    assert.equal(playwrightServer.args.at(-1), "error");
    assert.ok(
      !playwrightServer.args.includes("--caps"),
      "leave optional high-volume capabilities off",
    );
    assert.equal(
      playwright.metadata.crossStack.toolPrefix,
      "mcp__plugin_playwright-mcp_playwright__",
    );
    assert.equal(playwright.metadata.crossStack.module, "browser-check");
    assert.ok(
      fs.existsSync(path.join(PLUGIN_DIR, "skills/playwright/SKILL.md")),
      "the Standard supplies its own browser workflow skill",
    );
    assert.equal(playwright.license, "Apache-2.0");
    const chrome = byName["chrome-devtools-mcp"].mcpServers["chrome-devtools"];
    for (const flag of [
      "--isolated",
      "--no-usage-statistics",
      "--no-performance-crux",
      "--redact-network-headers",
    ]) {
      assert.ok(chrome.args.includes(flag), flag);
    }
    assert.ok(chrome.args.includes(`chrome-devtools-mcp@${byName["chrome-devtools-mcp"].version}`));
  });

  test("entry display fields equal plugin.json, since the entry overrides them", () => {
    const [entry] = marketplace.plugins;
    for (const field of [
      "displayName",
      "description",
      "author",
      "homepage",
      "repository",
      "license",
      "keywords",
    ]) {
      assert.deepEqual(entry[field], plugin[field], field);
    }
  });
});

describe("plugin.json", () => {
  test("identity fields", () => {
    assert.equal(plugin.name, "cross-stack-standard");
    assert.equal(plugin.displayName, "Cross-Stack Standard");
    assert.equal(plugin.version, VERSION);
    assert.deepEqual(plugin.author, AUTHOR);
    assert.equal(plugin.homepage, REPOSITORY);
    assert.equal(plugin.repository, REPOSITORY);
    assert.equal(plugin.license, "MIT");
  });

  test("description says what the plugin is and when to use it", () => {
    assert.match(plugin.description, /Laravel/);
    assert.match(plugin.description, /Next\.js/);
    assert.match(plugin.description, /React Native/);
    assert.match(plugin.description, /Use it when/);
    assert.ok(plugin.description.length <= 1024);
  });

  test("keywords are unique kebab-case strings", () => {
    assert.ok(plugin.keywords.length > 0);
    assert.equal(new Set(plugin.keywords).size, plugin.keywords.length);
    for (const keyword of plugin.keywords) assert.match(keyword, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  test("never abbreviates the project name", () => {
    const text = JSON.stringify([plugin, marketplace]);
    assert.doesNotMatch(text, /\b(?:CSS|XSS)\b/);
  });
});

describe(".claude-plugin directories", () => {
  test("hold only their manifest (components placed there never load)", () => {
    assert.deepEqual(fs.readdirSync(path.join(REPO_ROOT, ".claude-plugin")), ["marketplace.json"]);
    assert.deepEqual(fs.readdirSync(path.join(PLUGIN_DIR, ".claude-plugin")), ["plugin.json"]);
  });
});

describe("hooks.json", () => {
  test("has a top-level hooks object and nothing unexpected", () => {
    assert.equal(typeof hooks.hooks, "object");
    assert.ok(hooks.hooks !== null && !Array.isArray(hooks.hooks));
    for (const key of Object.keys(hooks)) assert.ok(["description", "hooks"].includes(key), key);
  });

  test("every handler runs node on the single entry point, which exists", () => {
    for (const [event, matchers] of Object.entries(hooks.hooks)) {
      assert.ok(Array.isArray(matchers), `${event} is a list of matchers`);
      for (const matcher of matchers) {
        for (const handler of matcher.hooks) {
          assert.equal(handler.type, "command", event);
          assert.equal(handler.command, "node", `${event} uses exec form`);
          assert.equal(handler.args[0], "${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs", event);
          assert.ok(fs.existsSync(path.join(PLUGIN_DIR, "scripts/hook.mjs")), "entry point exists");
        }
      }
    }
  });
});

describe("claude CLI", { skip: which("claude") ? false : "claude is not installed" }, () => {
  const run = (t, args) => {
    const config = tempDir(t, "cross-stack-claude-config-");
    const result = spawnSync("claude", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 120_000,
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: config,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
    });
    if (result.error) throw result.error;
    return result;
  };

  test("validate --strict accepts the marketplace and the plugin", (t) => {
    for (const target of [REPO_ROOT, PLUGIN_DIR]) {
      const result = run(t, ["plugin", "validate", target, "--strict", "--json"]);
      assert.equal(result.status, 0, `${target}\n${result.stdout}${result.stderr}`);
      const report = JSON.parse(result.stdout);
      assert.equal(report.success, true);
      assert.deepEqual(report.manifest.errors, []);
      assert.deepEqual(report.manifest.warnings, []);
    }
  });

  test("the plugin loads without errors", (t) => {
    const result = run(t, ["--plugin-dir", PLUGIN_DIR, "plugin", "list", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const [loaded] = JSON.parse(result.stdout).filter((entry) =>
      entry.id.startsWith("cross-stack-standard@"),
    );
    assert.ok(loaded, "the plugin is listed");
    assert.equal(loaded.enabled, true);
    assert.equal(loaded.version, VERSION);
    assert.deepEqual(loaded.errors ?? [], []);
    assert.deepEqual(loaded.errorDetails ?? [], []);
  });
});
