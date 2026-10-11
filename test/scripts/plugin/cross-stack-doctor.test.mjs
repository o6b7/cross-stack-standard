/**
 * Tests for the `doctor` command of the kit's project tool
 * (templates/shared/cross-stack/bin/cross-stack.mjs). Most tests call runDoctor with a fake
 * program runner, so they do not depend on what is installed on the machine; a few run the
 * command end to end.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  BLOCK_BEGIN,
  BLOCK_END,
  CLAUDE_EXEC_FORM_HOOKS,
  CONTEXT_BUDGET_LINES,
  NODE_FLOOR,
  PLUGIN_ID,
  findOptOutLine,
  formatDoctor,
  runDoctor,
} from "../../../plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs";
import { BIN_TEMPLATE, VERSION, runNode, tempDir, which, write } from "./helpers.mjs";

const SCHEMA_URL = `https://raw.githubusercontent.com/o6b7/cross-stack-standard/v${VERSION}/plugins/cross-stack-standard/data/standard.schema.json`;
const CHECK_IDS = [
  "node",
  "git",
  "claude",
  "manifest",
  "opt-out",
  "context-budget",
  "rules-files",
  "plugin-enabled",
  "pre-commit",
  "php",
  "composer",
];

const manifest = (extra = {}) => ({
  $schema: SCHEMA_URL,
  version: VERSION,
  tracks: ["web"],
  tier: 1,
  ...extra,
});

const block = (bodyLines = 3) =>
  [BLOCK_BEGIN, ...Array.from({ length: bodyLines }, (_, i) => `- line ${i + 1}`), BLOCK_END].join(
    "\n",
  );

const teamSettings = () => ({
  extraKnownMarketplaces: {
    "cross-stack-standard": {
      source: { source: "github", repo: "o6b7/cross-stack-standard" },
    },
  },
  enabledPlugins: { [PLUGIN_ID]: true },
});

/** A project that passes every doctor check (web track). */
function healthyFiles(extra = {}) {
  return {
    ".cross-stack/standard.json": manifest(),
    "CLAUDE.md": `# Project\n\n${block()}\n`,
    ".claude/rules/web.md": "---\npaths: src/**/*.ts\n---\n\n# Web rules\n",
    ".claude/settings.json": teamSettings(),
    "package.json": { name: "web", dependencies: { next: "16.3.6", react: "19.2.8" } },
    ...extra,
  };
}

function project(t, files = {}) {
  const root = tempDir(t, "cross-stack-doctor-");
  for (const [relative, content] of Object.entries(files))
    write(path.join(root, relative), content);
  return root;
}

const found = (stdout, status = 0) => ({ found: true, status, stdout, stderr: "" });
const missing = { found: false, status: null, stdout: "", stderr: "" };

/**
 * A fake program runner. `programs` maps "command arg1 arg2" (or just "command") to a result;
 * anything unmapped is not found. Calls are recorded.
 */
function fakeExec(programs = {}) {
  const calls = [];
  const exec = (command, args) => {
    calls.push([command, ...args].join(" "));
    const full = [command, ...args].join(" ");
    return programs[full] ?? programs[command] ?? missing;
  };
  exec.calls = calls;
  return exec;
}

const standardTools = (extra = {}) =>
  fakeExec({
    "git --version": found("git version 2.50.1\n"),
    "claude --version": found("2.1.282 (Claude Code)\n"),
    "git rev-parse --is-inside-work-tree": found("false\n", 128),
    ...extra,
  });

function doctor(root, options = {}) {
  return runDoctor({
    root,
    env: {},
    nodeVersion: "24.8.0",
    exec: standardTools(),
    cwd: root,
    ...options,
  });
}

const byId = (report, id) => report.checks.find((check) => check.id === id);

describe("runDoctor", () => {
  test("a healthy project passes, with one entry per check in a fixed order", (t) => {
    const report = doctor(project(t, healthyFiles()));
    assert.deepEqual(
      report.checks.map((check) => check.id),
      CHECK_IDS,
    );
    const failing = report.checks.filter((check) => check.status === "fail");
    assert.deepEqual(failing, []);
    assert.equal(report.ok, true);
    assert.equal(byId(report, "php").status, "skip");
    assert.equal(byId(report, "pre-commit").status, "skip");
    assert.match(report.summary, /^doctor: 0 failed, 0 warnings, 8 passed, 3 skipped$/);
  });

  test("runs only local version queries, never an install", (t) => {
    const exec = standardTools();
    doctor(project(t, healthyFiles()), { exec });
    for (const call of exec.calls) {
      assert.match(call, /^(?:git (?:--version|rev-parse|config)|claude --version)/, call);
    }
  });
});

describe("node", () => {
  test(`fails below ${NODE_FLOOR}`, (t) => {
    const root = project(t, healthyFiles());
    assert.equal(byId(doctor(root, { nodeVersion: "22.12.0" }), "node").status, "fail");
    assert.equal(doctor(root, { nodeVersion: "20.19.0" }).ok, false);
    const ok = byId(doctor(root, { nodeVersion: "v22.13.0" }), "node");
    assert.equal(ok.status, "ok");
    assert.match(ok.message, /Node\.js 22\.13\.0/);
  });
});

describe("git and claude", () => {
  test("a missing git fails", (t) => {
    const report = doctor(project(t, healthyFiles()), {
      exec: fakeExec({ "claude --version": found("2.1.282 (Claude Code)") }),
    });
    assert.equal(byId(report, "git").status, "fail");
    assert.equal(report.ok, false);
  });

  test("a missing claude CLI is skipped, an old or silent one warns", (t) => {
    const root = project(t, healthyFiles());
    const git = { "git --version": found("git version 2.50.1") };
    assert.equal(byId(doctor(root, { exec: fakeExec(git) }), "claude").status, "skip");

    const old = byId(
      doctor(root, {
        exec: fakeExec({ ...git, "claude --version": found("2.1.100 (Claude Code)") }),
      }),
      "claude",
    );
    assert.equal(old.status, "warn");
    assert.match(old.message, new RegExp(CLAUDE_EXEC_FORM_HOOKS.replaceAll(".", "\\.")));

    const silent = doctor(root, { exec: fakeExec({ ...git, "claude --version": found("", 1) }) });
    assert.equal(byId(silent, "claude").status, "warn");
    assert.equal(silent.ok, true, "warnings do not fail the report");

    const current = byId(doctor(root), "claude");
    assert.equal(current.status, "ok");
    assert.match(current.message, /not documented yet/);
  });
});

describe("manifest", () => {
  test("a missing or invalid manifest fails with the check's findings", (t) => {
    const root = project(t, healthyFiles());
    fs.rmSync(path.join(root, ".cross-stack"), { recursive: true });
    const absent = byId(doctor(root), "manifest");
    assert.equal(absent.status, "fail");
    assert.equal(absent.rule, "PROC-001");
    assert.match(absent.message, /manifest not found; run \/cross-stack-standard:adopt/);

    write(path.join(root, ".cross-stack/standard.json"), manifest({ tracks: [], tier: 3 }));
    const invalid = byId(doctor(root), "manifest");
    assert.equal(invalid.status, "fail");
    assert.match(invalid.message, /check-standard-config \.cross-stack\/standard\.json:\d+ /);
  });
});

describe("opt-out", () => {
  test("reports the environment variable first", (t) => {
    const root = project(t, healthyFiles());
    for (const value of ["1", "yes", " TRUE ", "on"]) {
      const check = byId(doctor(root, { env: { CROSS_STACK_STANDARD_DISABLE: value } }), "opt-out");
      assert.equal(check.status, "warn", value);
      assert.match(check.message, /CROSS_STACK_STANDARD_DISABLE/);
    }
    for (const value of ["0", "", "no"]) {
      const check = byId(doctor(root, { env: { CROSS_STACK_STANDARD_DISABLE: value } }), "opt-out");
      assert.equal(check.status, "ok", value);
    }
  });

  test('reports "disabled": true in the manifest', (t) => {
    const root = project(
      t,
      healthyFiles({ ".cross-stack/standard.json": manifest({ disabled: true }) }),
    );
    const check = byId(doctor(root), "opt-out");
    assert.equal(check.status, "warn");
    assert.match(check.message, /"disabled": true in \.cross-stack\/standard\.json/);
  });

  test("reports the opt-out line in each memory file, with its line", (t) => {
    for (const file of ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]) {
      const root = project(t, healthyFiles());
      const existing = file === "CLAUDE.md" ? `# Project\n\n${block()}\n` : "";
      write(path.join(root, file), `${existing}\ncross-stack-standard: declined\n`);
      const check = byId(doctor(root), "opt-out");
      assert.equal(check.status, "warn", file);
      assert.match(
        check.message,
        new RegExp(`${file.replaceAll(".", "\\.")}:\\d+ holds the opt-out line`),
      );
    }
  });

  test("searches from the working directory up to the root", (t) => {
    const root = project(t, healthyFiles({ "web/CLAUDE.md": "cross-stack-standard: declined\n" }));
    assert.equal(byId(doctor(root), "opt-out").status, "ok");
    const check = byId(doctor(root, { cwd: path.join(root, "web") }), "opt-out");
    assert.equal(check.status, "warn");
    assert.match(check.message, /web\/CLAUDE\.md:1/);
  });

  test("reports the plugin switched off in settings", (t) => {
    const root = project(
      t,
      healthyFiles({
        ".claude/settings.local.json": { enabledPlugins: { [PLUGIN_ID]: false } },
      }),
    );
    const check = byId(doctor(root), "opt-out");
    assert.equal(check.status, "warn");
    assert.match(check.message, /settings\.local\.json sets/);
  });

  test("the opt-out line is matched tolerantly, but not inside code fences", () => {
    for (const line of [
      "cross-stack-standard: declined",
      "- `cross-stack-standard: declined`",
      "## **Cross-Stack-Standard: Declined**",
      "> cross-stack-standard:declined",
    ]) {
      assert.equal(findOptOutLine(`# Title\n\n${line}\n`), 3, line);
    }
    assert.equal(findOptOutLine("We have cross-stack-standard: declined in mind.\n"), 0);
    assert.equal(findOptOutLine("```md\ncross-stack-standard: declined\n```\n"), 0);
    assert.equal(findOptOutLine("~~~~\n```\ncross-stack-standard: declined\n~~~~\nx\n"), 0);
  });
});

describe("context-budget", () => {
  test("passes a small block and names its size", (t) => {
    const check = byId(doctor(project(t, healthyFiles())), "context-budget");
    assert.equal(check.status, "ok");
    assert.equal(check.rule, "PROC-029");
    assert.match(check.message, /CLAUDE\.md block 5 = 5 lines/);
  });

  test("fails without a block, and ignores markers inside code fences", (t) => {
    const root = project(t, healthyFiles({ "CLAUDE.md": "# Project\n" }));
    assert.equal(byId(doctor(root), "context-budget").status, "fail");
    write(path.join(root, "CLAUDE.md"), `# Project\n\n\`\`\`md\n${block()}\n\`\`\`\n`);
    const check = byId(doctor(root), "context-budget");
    assert.equal(check.status, "fail");
    assert.match(check.message, /no managed block/);
  });

  test("fails on repeated, unclosed or reversed markers", (t) => {
    const root = project(t, healthyFiles());
    for (const text of [
      `${block()}\n${block()}\n`,
      `${BLOCK_BEGIN}\n- x\n`,
      `${BLOCK_END}\n- x\n${BLOCK_BEGIN}\n`,
    ]) {
      write(path.join(root, "CLAUDE.md"), text);
      const check = byId(doctor(root), "context-budget");
      assert.equal(check.status, "fail", text);
      assert.match(check.message, /exactly one begin marker followed by one end marker/);
    }
  });

  test(`counts an imported AGENTS.md and fails at ${CONTEXT_BUDGET_LINES} lines`, (t) => {
    const agents = (lines) =>
      `${Array.from({ length: lines }, (_, i) => `agent ${i}`).join("\n")}\n`;
    // The block is 5 lines (markers + 3 body lines).
    const root = project(
      t,
      healthyFiles({
        "CLAUDE.md": `@AGENTS.md\n\n${block()}\n`,
        "AGENTS.md": agents(CONTEXT_BUDGET_LINES - 6),
      }),
    );
    const under = byId(doctor(root), "context-budget");
    assert.equal(under.status, "ok");
    assert.match(under.message, /CLAUDE\.md block 5 \+ imported AGENTS\.md 194 = 199 lines/);

    write(path.join(root, "AGENTS.md"), agents(CONTEXT_BUDGET_LINES - 5));
    const over = byId(doctor(root), "context-budget");
    assert.equal(over.status, "fail");
    assert.match(over.message, /= 200 lines; keep it under 200/);
  });

  test("does not count an AGENTS.md that is not imported, or imported only in a code fence", (t) => {
    const long = `${"x\n".repeat(400)}`;
    const root = project(
      t,
      healthyFiles({
        "CLAUDE.md": `\`\`\`\n@AGENTS.md\n\`\`\`\n\n${block()}\n`,
        "AGENTS.md": long,
      }),
    );
    assert.equal(byId(doctor(root), "context-budget").status, "ok");
  });

  test("a block inside an imported AGENTS.md counts the whole file once", (t) => {
    const root = project(
      t,
      healthyFiles({
        "CLAUDE.md": "@AGENTS.md\n",
        "AGENTS.md": `# Agents\n\n${block()}\n`,
      }),
    );
    const check = byId(doctor(root), "context-budget");
    assert.equal(check.status, "ok");
    assert.match(check.message, /AGENTS\.md \(with the block\) 7 = 7 lines/);
  });

  test("finds the block in .claude/CLAUDE.md", (t) => {
    const root = project(
      t,
      healthyFiles({ "CLAUDE.md": "# Project\n", ".claude/CLAUDE.md": `${block(1)}\n` }),
    );
    const check = byId(doctor(root), "context-budget");
    assert.equal(check.status, "ok");
    assert.match(check.message, /^\.claude\/CLAUDE\.md block 3/);
  });
});

describe("rules-files", () => {
  test("requires .claude/rules/<track>.md for every declared track", (t) => {
    const root = project(
      t,
      healthyFiles({
        ".cross-stack/standard.json": manifest({ tracks: ["laravel", "web"] }),
      }),
    );
    const check = byId(doctor(root), "rules-files");
    assert.equal(check.status, "fail");
    assert.match(check.message, /missing \.claude\/rules\/laravel\.md;/);
  });

  test("uses detected tracks when the manifest declares none", (t) => {
    const root = project(
      t,
      healthyFiles({
        "mobile/package.json": { dependencies: { expo: "~57.0.25", react: "19.2.3" } },
      }),
    );
    fs.rmSync(path.join(root, ".cross-stack"), { recursive: true });
    const check = byId(doctor(root), "rules-files");
    assert.equal(check.status, "fail");
    assert.match(check.message, /\.claude\/rules\/mobile\.md/);
  });

  test("is skipped without any track", (t) => {
    const root = project(t, { "CLAUDE.md": `${block()}\n` });
    assert.equal(byId(doctor(root), "rules-files").status, "skip");
  });
});

describe("plugin-enabled", () => {
  test("warns when the committed settings do not enable the plugin", (t) => {
    const root = project(t, healthyFiles({ ".claude/settings.json": { permissions: {} } }));
    const check = byId(doctor(root), "plugin-enabled");
    assert.equal(check.status, "warn");
    assert.equal(check.rule, "PROC-004");
    assert.match(check.message, /extraKnownMarketplaces\.cross-stack-standard and enabledPlugins/);
    fs.rmSync(path.join(root, ".claude/settings.json"));
    assert.equal(byId(doctor(root), "plugin-enabled").status, "warn");
  });
});

describe("pre-commit", () => {
  const lefthookYml =
    "pre-commit:\n  jobs:\n    - run: gitleaks git --pre-commit\ncommit-msg:\n  jobs: []\n";

  function gitRepo(t, hooksDir, extra = {}) {
    return standardTools({
      "git rev-parse --is-inside-work-tree": found("true\n"),
      "git rev-parse --git-path hooks": found(`${hooksDir}\n`),
      "git config --get core.hooksPath": found("", 1),
      ...extra,
    });
  }

  test("is skipped without a lefthook configuration", (t) => {
    const check = byId(doctor(project(t, healthyFiles())), "pre-commit");
    assert.equal(check.status, "skip");
  });

  test("warns outside a git work tree", (t) => {
    const root = project(t, healthyFiles({ "lefthook.yml": lefthookYml }));
    const check = byId(doctor(root), "pre-commit");
    assert.equal(check.status, "warn");
    assert.match(check.message, /not a git work tree/);
  });

  test("fails for each configured git hook lefthook has not installed", (t) => {
    const root = project(
      t,
      healthyFiles({
        "lefthook.yml": lefthookYml,
        ".git/hooks/pre-commit": "#!/bin/sh\n# lefthook hook\n",
        ".git/hooks/commit-msg": "#!/bin/sh\n# another manager\n",
      }),
    );
    const check = byId(doctor(root, { exec: gitRepo(t, ".git/hooks") }), "pre-commit");
    assert.equal(check.status, "fail");
    assert.equal(check.rule, "CI-015");
    assert.match(
      check.message,
      /defines commit-msg, pre-commit but lefthook has not installed commit-msg;/,
    );
  });

  test("passes when every configured hook is installed, and warns about core.hooksPath", (t) => {
    const root = project(
      t,
      healthyFiles({
        "lefthook.yml": lefthookYml,
        "hooks/pre-commit": "call lefthook run pre-commit\n",
        "hooks/commit-msg": "call lefthook run commit-msg\n",
      }),
    );
    const ok = byId(doctor(root, { exec: gitRepo(t, "hooks") }), "pre-commit");
    assert.equal(ok.status, "ok");
    assert.match(ok.message, /lefthook installed commit-msg, pre-commit from lefthook\.yml/);

    const exec = gitRepo(t, "hooks", { "git config --get core.hooksPath": found("hooks\n") });
    const warned = byId(doctor(root, { exec }), "pre-commit");
    assert.equal(warned.status, "warn");
    assert.match(warned.message, /core\.hooksPath is set \(hooks\)/);
  });

  test("reads hook names from JSON and TOML configurations, pre-commit by default", (t) => {
    const cases = [
      [".lefthook.json", JSON.stringify({ "pre-push": { jobs: [] }, colors: false }), /pre-push/],
      ["lefthook.toml", "[commit-msg]\nparallel = true\n", /commit-msg/],
      [".config/lefthook.yaml", "colors: false\n", /pre-commit/],
    ];
    for (const [file, text, expected] of cases) {
      const root = project(t, healthyFiles({ [file]: text }));
      const check = byId(doctor(root, { exec: gitRepo(t, ".git/hooks") }), "pre-commit");
      assert.equal(check.status, "fail", file);
      assert.match(check.message, expected, file);
    }
  });

  test("falls back to .git/hooks when git is missing", (t) => {
    const root = project(
      t,
      healthyFiles({
        "lefthook.yml": "pre-commit:\n  jobs: []\n",
        ".git/hooks/pre-commit": "lefthook\n",
      }),
    );
    const report = doctor(root, { exec: fakeExec() });
    assert.equal(byId(report, "pre-commit").status, "ok");
    assert.equal(byId(report, "git").status, "fail");
  });
});

describe("php and composer", () => {
  // A Laravel-only project: the manifest must cover every detected stack, so no web package.
  const laravel = () =>
    healthyFiles({
      ".cross-stack/standard.json": manifest({ tracks: ["laravel"] }),
      ".claude/rules/laravel.md": "# Laravel rules\n",
      "package.json": { name: "api", private: true },
      "composer.json": { require: { "laravel/framework": "^13.0" } },
    });

  test("report versions for the laravel track", (t) => {
    const root = project(t, laravel());
    const exec = standardTools({
      "php --version": found("PHP 8.4.26 (cli) (built: Sep 1 2026)\n"),
      "composer --version": found("Composer version 2.10.3 2026-09-01\n"),
    });
    const report = doctor(root, { exec });
    assert.equal(byId(report, "php").message, "PHP 8.4.26");
    assert.equal(byId(report, "composer").message, "Composer 2.10.3");
    assert.equal(report.ok, true);
  });

  test("warn when missing or when PHP is older than Laravel 13 allows", (t) => {
    const root = project(t, laravel());
    const report = doctor(root);
    assert.equal(byId(report, "php").status, "warn");
    assert.equal(byId(report, "composer").status, "warn");
    const old = doctor(root, {
      exec: standardTools({ "php --version": found("PHP 8.2.29 (cli)") }),
    });
    assert.match(byId(old, "php").message, /older than 8\.3\.0/);
  });
});

describe("formatDoctor", () => {
  test("prints a header, one aligned line per check with its rule, and the summary", () => {
    const text = formatDoctor({
      ok: false,
      summary: "doctor: 1 failed, 0 warnings, 1 passed, 0 skipped",
      checks: [
        { id: "node", status: "ok", message: "Node.js 24.8.0" },
        { id: "context-budget", status: "fail", message: "too long", rule: "PROC-029" },
      ],
    });
    assert.deepEqual(text.split("\n"), [
      `cross-stack-standard ${VERSION} doctor`,
      "ok    node            Node.js 24.8.0",
      "fail  context-budget  too long [PROC-029]",
      "doctor: 1 failed, 0 warnings, 1 passed, 0 skipped",
    ]);
  });
});

describe("the doctor command", () => {
  /** A project with the tool at .cross-stack/bin/, run from an unrelated directory. */
  function installed(t, files, env = {}) {
    const root = project(t, files);
    const bin = path.join(root, ".cross-stack/bin/cross-stack.mjs");
    write(bin, fs.readFileSync(BIN_TEMPLATE));
    const elsewhere = tempDir(t, "cross-stack-cwd-");
    return {
      root,
      run: (...args) =>
        runNode(bin, args, { cwd: elsewhere, env: { CROSS_STACK_STANDARD_DISABLE: "", ...env } }),
    };
  }

  test("exits 1 and prints the failing checks when a program is missing", (t) => {
    const emptyPath = tempDir(t, "cross-stack-path-");
    const { run } = installed(t, healthyFiles(), { PATH: emptyPath });
    const result = run("doctor");
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stderr, "");
    const lines = result.stdout.trim().split("\n");
    assert.equal(lines[0], `cross-stack-standard ${VERSION} doctor`);
    assert.match(result.stdout, /^fail {2}git +git is not on PATH/m);
    assert.match(result.stdout, /^skip {2}claude /m);
    assert.match(lines.at(-1), /^doctor: 1 failed, /);
  });

  test("--json prints the report", (t) => {
    const emptyPath = tempDir(t, "cross-stack-path-");
    const { run } = installed(t, healthyFiles(), { PATH: emptyPath });
    const result = run("doctor", "--json");
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.tool, "cross-stack-standard");
    assert.equal(report.command, "doctor");
    assert.equal(report.version, VERSION);
    assert.equal(report.ok, false);
    assert.deepEqual(
      report.checks.map((check) => check.id),
      CHECK_IDS,
    );
    assert.match(report.summary, /^doctor: /);
  });

  test(
    "exits 0 on a healthy project",
    { skip: which("git") === null && "git is not installed" },
    (t) => {
      const { run } = installed(t, healthyFiles(), { PATH: path.dirname(which("git")) });
      const result = run("doctor");
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /^ok {4}context-budget /m);
    },
  );

  test("usage errors exit 2", (t) => {
    const { run } = installed(t, {});
    for (const [args, expected] of [
      [["doctor", "extra"], /doctor: Unexpected argument 'extra'/],
      [["doctor", "--bogus"], /doctor: Unknown option '--bogus'/],
    ]) {
      const result = run(...args);
      assert.equal(result.status, 2, args.join(" "));
      assert.equal(result.stdout, "");
      assert.match(result.stderr, expected);
    }
    const help = run("help", "doctor");
    assert.equal(help.status, 0);
    assert.match(
      help.stdout,
      /^Usage: node \.cross-stack\/bin\/cross-stack\.mjs doctor \[options\]/,
    );
  });
});
