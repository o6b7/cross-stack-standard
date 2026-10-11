/**
 * The opt-out guard: every source, for every event, through the real entry point. An opted-out
 * run must exit 0 with empty stdout and stderr, load no handler and start no child process; the
 * spy preload (helpers/spy-preload.mjs) records handler loads and child processes to prove it.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { describe, test } from "node:test";

import {
  copyPlugin,
  importPlugin,
  makeProject,
  projectFixture,
  tempDir,
} from "./helpers/project.mjs";
import { EVENT_FIXTURES, fixtureVars, runHook, stdinFixture } from "./helpers/run-hook.mjs";

const { findOptOutLine, isOptedOut } = await importPlugin("scripts/lib/opt-out.mjs");
const { searchDirsFor } = await importPlugin("scripts/lib/project.mjs");

const EVENTS = Object.keys(EVENT_FIXTURES);

/** One opt-out source: how to set it up, relative to a detectable Laravel + Next.js project. */
const SOURCES = [
  { name: "CROSS_STACK_STANDARD_DISABLE=1", env: { CROSS_STACK_STANDARD_DISABLE: "1" } },
  { name: "CROSS_STACK_STANDARD_DISABLE=true", env: { CROSS_STACK_STANDARD_DISABLE: "true" } },
  {
    name: '"disabled": true in the manifest',
    files: {
      ".cross-stack/standard.json": {
        version: "1.0.0",
        tracks: ["laravel", "web"],
        disabled: true,
      },
    },
  },
  { name: "CLAUDE.md", files: { "CLAUDE.md": "# Project\n\ncross-stack-standard: declined\n" } },
  {
    name: ".claude/CLAUDE.md",
    files: { ".claude/CLAUDE.md": "Notes.\n\n- `cross-stack-standard: declined`\n" },
  },
  { name: "CLAUDE.local.md", files: { "CLAUDE.local.md": "**cross-stack-standard: declined**\n" } },
  {
    name: "CLAUDE.md between the working directory and the project directory",
    files: { "web/CLAUDE.md": "cross-stack-standard: declined\n" },
    cwd: "web/src/app",
  },
];

async function runSpied(t, { event, project, cwd, env, entry }) {
  const spyLog = path.join(tempDir(t, "cross-stack-spy-"), "spy.log");
  const fixture = EVENT_FIXTURES[event][0];
  return runHook({
    event,
    stdin: stdinFixture(fixture, fixtureVars(project.root, cwd ?? project.root)),
    projectDir: project.root,
    env,
    entry,
    spy: true,
    spyLog,
  });
}

function assertOptedOut(result, label) {
  assert.equal(result.exitCode, 0, `${label}: exit code`);
  assert.equal(result.stdout, "", `${label}: stdout`);
  assert.equal(result.stderr, "", `${label}: stderr`);
  assert.deepEqual(result.spy, [], `${label}: no handler loaded, no child process`);
}

describe("every opt-out source silences every event", () => {
  for (const source of SOURCES) {
    for (const event of EVENTS) {
      test(`${source.name} → ${event}`, async (t) => {
        const project = makeProject(t, {
          ...projectFixture("laravel-next-monorepo"),
          ...source.files,
        });
        if (source.cwd) project.mkdir(source.cwd);
        const cwd = source.cwd ? project.path(source.cwd) : project.root;
        const result = await runSpied(t, { event, project, cwd, env: source.env });
        assertOptedOut(result, `${source.name} → ${event}`);
      });
    }
  }
});

describe("the spy sees what a project that did not opt out does", () => {
  test("SessionStart loads its handler and prints context", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const result = await runSpied(t, { event: "SessionStart", project });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Tracks: laravel/m);
    assert.equal(result.spy.length, 1, result.spy.join("\n"));
    assert.match(result.spy[0], /^load file:.*\/scripts\/handlers\/session-start\.mjs$/);
  });

  test("a handler that starts a tool is recorded; opted out, it never runs", async (t) => {
    const plugin = copyPlugin(t);
    plugin.replaceHandler(
      "Stop",
      'import { spawnSync } from "node:child_process";\n' +
        "export default async () => {\n" +
        '  spawnSync(process.execPath, ["-e", "0"]);\n' +
        "  return { exitCode: 0 };\n" +
        "};\n",
    );
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const active = await runSpied(t, { event: "Stop", project, entry: plugin.entry });
    assert.equal(active.exitCode, 0);
    assert.ok(
      active.spy.some((line) => line.startsWith("child_process.spawnSync ")),
      active.spy.join("\n"),
    );
    project.write("CLAUDE.md", "cross-stack-standard: declined\n");
    const optedOut = await runSpied(t, { event: "Stop", project, entry: plugin.entry });
    assertOptedOut(optedOut, "opted out");
  });
});

describe("what does not opt out", () => {
  const cases = [
    { name: "CROSS_STACK_STANDARD_DISABLE=0", env: { CROSS_STACK_STANDARD_DISABLE: "0" } },
    { name: "an empty CROSS_STACK_STANDARD_DISABLE", env: { CROSS_STACK_STANDARD_DISABLE: "" } },
    {
      name: '"disabled": false',
      files: {
        ".cross-stack/standard.json": { version: "1.0.0", tracks: ["laravel"], disabled: false },
      },
    },
    {
      name: "the line inside a backtick fence",
      files: { "CLAUDE.md": "Example:\n\n```md\ncross-stack-standard: declined\n```\n" },
    },
    {
      name: "the line inside a tilde fence",
      files: { "CLAUDE.md": "~~~~\ncross-stack-standard: declined\n~~~~\n" },
    },
    {
      name: "the words inside a sentence",
      files: { "CLAUDE.md": "To opt out, add cross-stack-standard: declined to this file.\n" },
    },
    {
      name: "extra words after the line",
      files: { "CLAUDE.md": "cross-stack-standard: declined for now\n" },
    },
    {
      name: "a different memory file name",
      files: { "AGENTS.md": "cross-stack-standard: declined\n" },
    },
  ];
  for (const item of cases) {
    test(item.name, async (t) => {
      const project = makeProject(t, { ...projectFixture("laravel-next-monorepo"), ...item.files });
      const result = await runSpied(t, { event: "SessionStart", project, env: item.env });
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, /^Tracks: laravel/m, `${item.name}: the hook ran`);
      assert.equal(result.spy.length, 1);
    });
  }

  test("a memory file above the project directory", async (t) => {
    const parent = tempDir(t);
    makeProject(t, { "CLAUDE.md": "cross-stack-standard: declined\n" }, { parent, name: "." });
    const project = makeProject(t, projectFixture("laravel-next-monorepo"), {
      parent,
      name: "app",
    });
    const result = await runSpied(t, { event: "SessionStart", project });
    assert.match(result.stdout, /^Tracks: laravel/m);
  });

  test("a manifest that is not valid JSON (the hook reports it instead)", async (t) => {
    const project = makeProject(t, {
      ...projectFixture("laravel-next-monorepo"),
      ".cross-stack/standard.json": '{ "disabled": true, ',
    });
    const result = await runSpied(t, { event: "SessionStart", project });
    assert.match(result.stdout, /is not valid JSON/);
  });
});

/** Asserts that the hook ran (SessionStart printed the detected tracks). */
function assertRan(result, label) {
  assert.equal(result.exitCode, 0, `${label}: exit code\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /^Tracks: laravel/m, `${label}: the hook ran`);
  assert.equal(result.spy.length, 1, `${label}: ${result.spy.join("\n")}`);
}

describe("a working directory outside the project directory", () => {
  test("its own memory file does not opt the project out", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const elsewhere = makeProject(t, { "CLAUDE.md": "cross-stack-standard: declined\n" });
    const result = await runSpied(t, { event: "SessionStart", project, cwd: elsewhere.root });
    assertRan(result, "outside cwd");
  });

  test('its own manifest with "disabled": true does not opt the project out', async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const elsewhere = makeProject(t, {
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["web"], disabled: true },
    });
    const result = await runSpied(t, { event: "SessionStart", project, cwd: elsewhere.root });
    assertRan(result, "outside manifest");
  });

  test("the opt-out line outside the project leaves the Stop gate on", async (t) => {
    const project = makeProject(t, {
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["web"] },
      "package.json": {
        name: "gate",
        version: "1.0.0",
        private: true,
        scripts: { "check:fast": 'node -e "process.exit(1)"' },
      },
      "src/index.js": "export {};\n",
    });
    const elsewhere = makeProject(t, { "CLAUDE.md": "cross-stack-standard: declined\n" });
    const result = await runHook({
      event: "Stop",
      stdin: stdinFixture("stop/stop", fixtureVars(project.root, elsewhere.root)),
      projectDir: project.root,
      dataDir: path.join(tempDir(t, "cross-stack-data-"), "data"),
      env: { npm_config_cache: path.join(tempDir(t, "cross-stack-npm-"), "cache") },
      timeoutMs: 60_000,
    });
    assert.equal(result.exitCode, 2, `the gate blocks\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /the Stop gate \(check:fast\) failed/);
  });

  test("the project directory's memory file still counts", async (t) => {
    const project = makeProject(t, {
      ...projectFixture("laravel-next-monorepo"),
      "CLAUDE.md": "cross-stack-standard: declined\n",
    });
    const elsewhere = makeProject(t);
    const result = await runSpied(t, { event: "PreToolUse", project, cwd: elsewhere.root });
    assertOptedOut(result, "project dir");
  });
});

describe("links that lead outside the project are not opt-out sources", () => {
  const NO_LINKS = process.platform === "win32" ? "links need extra rights on Windows" : false;

  test("a working directory reached through a directory link", { skip: NO_LINKS }, async (t) => {
    const outside = makeProject(t, { "CLAUDE.md": "cross-stack-standard: declined\n" });
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    fs.symlinkSync(outside.root, project.path("api/tools"), "junction");
    const result = await runSpied(t, {
      event: "SessionStart",
      project,
      cwd: project.path("api/tools"),
    });
    assertRan(result, "cwd through a link");
  });

  test("a memory file that links to a file outside", { skip: NO_LINKS }, async (t) => {
    const outside = makeProject(t, { "notes.md": "cross-stack-standard: declined\n" });
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    fs.symlinkSync(outside.path("notes.md"), project.path("CLAUDE.local.md"), "file");
    assertRan(await runSpied(t, { event: "SessionStart", project }), "memory file link");
  });

  test("a .claude directory that links outside", { skip: NO_LINKS }, async (t) => {
    const outside = makeProject(t, { "CLAUDE.md": "cross-stack-standard: declined\n" });
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    fs.symlinkSync(outside.root, project.path(".claude"), "junction");
    assertRan(await runSpied(t, { event: "SessionStart", project }), ".claude link");
  });

  test(
    'a manifest directory that links to "disabled": true outside',
    { skip: NO_LINKS },
    async (t) => {
      const outside = makeProject(t, {
        "standard.json": { version: "1.0.0", tracks: ["web"], disabled: true },
      });
      const project = makeProject(t, projectFixture("laravel-next-monorepo"));
      fs.symlinkSync(outside.root, project.path(".cross-stack"), "junction");
      assertRan(await runSpied(t, { event: "SessionStart", project }), ".cross-stack link");
    },
  );

  test("a link that stays inside the project still counts", { skip: NO_LINKS }, async (t) => {
    const project = makeProject(t, {
      ...projectFixture("laravel-next-monorepo"),
      "docs/CLAUDE.md": "cross-stack-standard: declined\n",
    });
    fs.symlinkSync(project.path("docs/CLAUDE.md"), project.path("CLAUDE.md"), "file");
    assertOptedOut(await runSpied(t, { event: "SessionStart", project }), "inside link");
  });
});

describe("the opt-out check takes linear time", () => {
  const MIB = 1024 * 1024;
  const LINE_SEPARATOR = "\u2028";
  const pathological = {
    "a 1 MiB line of tabs and spaces": "\t ".repeat(MIB / 2),
    "whitespace, then the words": `${"\t ".repeat(MIB / 4)}cross-stack-standard: declined x`,
    "emphasis runs around the words": `${"*_`".repeat(MIB / 6)}cross-stack-standard:${" ".repeat(1000)}`,
    "a long backtick run before a line separator": `${"`".repeat(MIB / 2)}${LINE_SEPARATOR}`,
    "quote markers and spaces": `${"> \t".repeat(MIB / 6)}#`,
  };

  for (const [name, line] of Object.entries(pathological)) {
    test(`findOptOutLine: ${name}, well under 50 ms`, () => {
      // A mention elsewhere in the file defeats any shortcut for files without the words.
      const text = `# Notes\n\nThe cross-stack-standard skill applies.\n${line}\n`;
      // Best of three, so a busy test machine (other suites run in parallel) cannot fail it.
      let elapsed = Infinity;
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        assert.equal(findOptOutLine(text), 0);
        elapsed = Math.min(elapsed, performance.now() - started);
      }
      assert.ok(elapsed < 50, `${name}: ${elapsed.toFixed(1)} ms`);
    });
  }

  test("a CLAUDE.local.md with a 1 MiB whitespace line: SessionStart still reports", async (t) => {
    const project = makeProject(t, {
      ...projectFixture("laravel-next-monorepo"),
      "CLAUDE.local.md": `Uses the cross-stack-standard skill.\n${"\t ".repeat(MIB / 2 - 64)}\n`,
    });
    const spyLog = path.join(tempDir(t, "cross-stack-spy-"), "spy.log");
    const result = await runHook({
      event: "SessionStart",
      stdin: stdinFixture("session-start/startup", fixtureVars(project.root)),
      projectDir: project.root,
      spy: true,
      spyLog,
      timeoutMs: 20_000,
    });
    assertRan(result, "1 MiB line");
    assert.ok(result.durationMs < 5_000, `took ${result.durationMs} ms`);
  });

  test(
    "a memory file that is a named pipe does not stall the hook",
    { skip: process.platform === "win32" ? "no named pipes in the Windows file system" : false },
    async (t) => {
      const project = makeProject(t, projectFixture("laravel-next-monorepo"));
      const made = spawnSync("mkfifo", [project.path("CLAUDE.local.md")], { shell: false });
      if (made.status !== 0) {
        t.skip("mkfifo is not available");
        return;
      }
      const spyLog = path.join(tempDir(t, "cross-stack-spy-"), "spy.log");
      const result = await runHook({
        event: "SessionStart",
        stdin: stdinFixture("session-start/startup", fixtureVars(project.root)),
        projectDir: project.root,
        spy: true,
        spyLog,
        timeoutMs: 15_000,
      });
      assertRan(result, "named pipe");
    },
  );

  test("a PreToolUse Write carrying a 1 MiB whitespace line finishes quickly", async (t) => {
    const project = makeProject(t, projectFixture("laravel-next-monorepo"));
    const stdin = stdinFixture("pre-tool-use/write", fixtureVars(project.root));
    stdin.tool_input = {
      file_path: project.path("CLAUDE.local.md"),
      content: `cross-stack-standard mention\n${"\t ".repeat(MIB / 2)}\n`,
    };
    const result = await runHook({
      event: "PreToolUse",
      stdin,
      projectDir: project.root,
      timeoutMs: 20_000,
    });
    assert.equal(result.exitCode, 0, `${result.stdout}${result.stderr}`);
    assert.ok(result.durationMs < 5_000, `took ${result.durationMs} ms`);
  });
});

describe("tolerant matching of the opt-out line", () => {
  const positives = [
    "cross-stack-standard: declined",
    "  cross-stack-standard: declined  ",
    "\tcross-stack-standard:declined",
    "- cross-stack-standard: declined",
    "* `cross-stack-standard: declined`",
    "1. cross-stack-standard: declined",
    "> cross-stack-standard: declined",
    "## cross-stack-standard: declined",
    "**cross-stack-standard:** declined",
    "_cross-stack-standard: declined_",
    "Cross-Stack-Standard: DECLINED.",
    "cross-stack-standard : declined",
    "```cross-stack-standard: declined```",
  ];
  for (const line of positives) {
    test(`matches ${JSON.stringify(line)}`, () => {
      assert.equal(findOptOutLine(`# Title\n\n${line}\n`), 3);
    });
  }

  const negatives = [
    "cross-stack-standard: accepted",
    "cross-stack-standard declined",
    "cross-stack-standard: declined, except for web",
    "Add `cross-stack-standard: declined` to opt out.",
    "<!-- cross-stack-standard: declined -->",
    "another-standard: declined",
    "cross-stack-standards: declined",
  ];
  for (const line of negatives) {
    test(`does not match ${JSON.stringify(line)}`, () => {
      assert.equal(findOptOutLine(`${line}\n`), 0);
    });
  }

  test("CRLF line endings, and a line after a closed fence", () => {
    const text = "```\ncode\n```\r\ncross-stack-standard: declined\r\n";
    assert.equal(findOptOutLine(text), 4);
  });

  test("an unclosed fence hides the rest of the file", () => {
    assert.equal(findOptOutLine("```\n\ncross-stack-standard: declined\n"), 0);
  });

  test("a shorter closing fence does not close a longer one", () => {
    assert.equal(findOptOutLine("````\n```\ncross-stack-standard: declined\n````\n"), 0);
  });
});

describe("isOptedOut order (first match wins)", () => {
  test("the environment wins over files, the manifest over memory files", (t) => {
    const project = makeProject(t, {
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["web"], disabled: true },
      "CLAUDE.md": "cross-stack-standard: declined\n",
    });
    const searchDirs = searchDirsFor(project.root, project.root);
    assert.equal(
      isOptedOut({ env: { CROSS_STACK_STANDARD_DISABLE: "yes" }, searchDirs }).source,
      "env",
    );
    const byManifest = isOptedOut({ env: {}, searchDirs });
    assert.equal(byManifest.source, "manifest");
    assert.equal(byManifest.file, project.path(".cross-stack/standard.json"));
    project.write(".cross-stack/standard.json", { version: "1.0.0", tracks: ["web"] });
    const byMemory = isOptedOut({ env: {}, searchDirs });
    assert.deepEqual(
      { source: byMemory.source, file: byMemory.file, line: byMemory.line },
      { source: "memory", file: project.path("CLAUDE.md"), line: 1 },
    );
    assert.deepEqual(byMemory.manifest?.tracks, ["web"], "the manifest read is returned");
  });

  test("the nearest memory file is reported first", (t) => {
    const project = makeProject(t, {
      "CLAUDE.md": "cross-stack-standard: declined\n",
      "api/CLAUDE.local.md": "cross-stack-standard: declined\n",
    });
    const result = isOptedOut({
      env: {},
      searchDirs: searchDirsFor(project.path("api"), project.root),
    });
    assert.equal(result.file, project.path("api/CLAUDE.local.md"));
  });

  test("nothing set: not opted out", (t) => {
    const project = makeProject(t, { "CLAUDE.md": "# Project\n" });
    const result = isOptedOut({ env: {}, searchDirs: searchDirsFor(project.root, project.root) });
    assert.deepEqual(result, {
      optedOut: false,
      source: null,
      file: null,
      line: null,
      manifest: null,
    });
  });
});
