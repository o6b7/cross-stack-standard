/**
 * Stop: the fast blocking gate and the fingerprint it skips on.
 *
 * - Library: the `git status --porcelain=v1 -z` parser, the fingerprint (git and walk modes,
 *   caps, nested repositories, files hidden from git status, a walk that does not depend on
 *   timing, the deadline), and the per-project state file under `CLAUDE_PLUGIN_DATA`.
 * - Handler helpers: track directories, the plan, the output tail, path sanitising, the gate's
 *   environment.
 * - End to end, through the real entry point with stdin fixtures: every silent path (turned
 *   off, no manifest, no script), a green run that is recorded and skipped next time, a re-edit
 *   of an already-changed file, `stop_hook_active` after a block, a write that lands while the
 *   gate runs, nested repositories, submodules and ignored track roots, skip-worktree and
 *   assume-unchanged files and exclude files, a failure that blocks with the output tail, the
 *   budget, both ecosystems, `trackRoots`, a missing Composer, and a blocked network.
 *
 * The project scripts are stand-ins from fixtures/stop/gate/: they fail when a file under src/
 * contains the marker LINT_ERROR, and append a line to a log outside the project for every run.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, test } from "node:test";

import { FIXTURES_DIR, importPlugin, makeProject, tempDir } from "./helpers/project.mjs";
import { cleanEnv, fixtureVars, processGone, runHook, stdinFixture } from "./helpers/run-hook.mjs";

const {
  gateEnv,
  gatePlan,
  homeSpellings,
  MAX_LINE_CHARS,
  outputTail,
  sanitizePaths,
  TAIL_LINES,
  trackDirs,
} = await importPlugin("scripts/handlers/stop.mjs");
const {
  canonicalPath,
  computeFingerprint,
  describePath,
  FALLBACK_STATE_DIR,
  FINGERPRINT_LIMITS,
  parsePorcelainZ,
  projectKey,
  readFailingFingerprint,
  readGreenFingerprint,
  recordFailingFingerprint,
  recordGreenFingerprint,
  signaturePath,
  stateDirFor,
  stateFileFor,
  WALK_IGNORED_FILES,
  walkProjectFiles,
} = await importPlugin("scripts/lib/fingerprint.mjs");
const { readManifest } = await importPlugin("scripts/lib/manifest.mjs");
const { resolveComposer } = await importPlugin("scripts/lib/resolve-tool.mjs");
const { TOOL_ENV } = await importPlugin("scripts/lib/spawn.mjs");

const STOP_FIXTURES = path.join(FIXTURES_DIR, "stop");
const IS_WINDOWS = process.platform === "win32";
const HEX64 = /^[0-9a-f]{64}$/;
const BLOCK_HEADER =
  "Cross-Stack Standard: the Stop gate (check:fast) failed, so this stop was blocked.";

const CLEAN = "export const value = 1;\n";
const CLEAN_2 = "export const value = 2;\n";
const CLEAN_3 = "export const value = 3;\n";
const BROKEN = "export const value = LINT_ERROR;\n";

/**
 * Time limit of the library-level fingerprints: far above the default, so a loaded machine
 * cannot turn an expected value into an incomplete (null) fingerprint.
 */
const ROOMY_MS = 120_000;

// --- fixtures and sandboxes ---------------------------------------------------------------------

/**
 * Waits long enough for a rewrite to get a new modification time on file systems whose
 * timestamps follow a coarse clock tick (a few milliseconds on Linux).
 */
function coarseClockTick() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

/**
 * The files of a Stop project fixture (`fixtures/stop/projects/<name>.json`); a value
 * `{ "$fixture": "gate/check.mjs" }` is replaced by that file's content.
 */
function stopFixture(name) {
  const spec = JSON.parse(
    fs.readFileSync(path.join(STOP_FIXTURES, "projects", `${name}.json`), "utf8"),
  );
  return Object.fromEntries(
    Object.entries(spec.files).map(([rel, content]) => [
      rel,
      content !== null && typeof content === "object" && typeof content.$fixture === "string"
        ? fs.readFileSync(path.join(STOP_FIXTURES, ...content.$fixture.split("/")), "utf8")
        : content,
    ]),
  );
}

/** Names of the git variables in the test process's environment (a git hook sets some). */
const INHERITED_GIT_VARS = Object.keys(process.env).filter((name) =>
  name.toUpperCase().startsWith("GIT_"),
);

/** The name of the PATH variable as this process spells it (`Path` on Windows). */
const PATH_KEY = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";

/**
 * A per-test sandbox outside the project: the run log, the plugin data directory, a temporary
 * directory, an npm cache and an empty git configuration. `env` isolates every git command (the
 * hook's included) from the developer's configuration and from any enclosing repository.
 */
function sandbox(t) {
  const dir = tempDir(t, "cross-stack-stop-");
  const tmp = path.join(dir, "tmp");
  fs.mkdirSync(tmp);
  const gitConfig = path.join(dir, "gitconfig");
  fs.writeFileSync(gitConfig, "");
  const log = path.join(dir, "runs.log");
  const osTmp = fs.realpathSync(os.tmpdir());
  let spies = 0;
  return {
    dir,
    tmp,
    log,
    dataDir: path.join(dir, "plugin-data"),
    env: {
      ...Object.fromEntries(INHERITED_GIT_VARS.map((name) => [name, undefined])),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CEILING_DIRECTORIES: [...new Set([osTmp, os.tmpdir()])].join(path.delimiter),
      STOP_TEST_LOG: log,
      npm_config_cache: path.join(dir, "npm-cache"),
      TMPDIR: tmp,
      TEMP: tmp,
      TMP: tmp,
    },
    runs() {
      return fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
    },
    spyLog() {
      spies += 1;
      return path.join(dir, `spy-${spies}.log`);
    },
  };
}

/**
 * Runs the Stop hook for a project, the way Claude Code does. `CLAUDE_PLUGIN_DATA` is the
 * sandbox's data directory unless `dataDir` is given (`undefined` leaves the variable unset).
 */
function runStop(box, project, options = {}) {
  const { active = false, env = {}, spy } = options;
  return runHook({
    event: "Stop",
    stdin: stdinFixture(active ? "stop/stop-active" : "stop/stop", fixtureVars(project.root)),
    projectDir: project.root,
    env: { ...box.env, ...env },
    dataDir: Object.hasOwn(options, "dataDir") ? options.dataDir : box.dataDir,
    spy: spy === true,
    spyLog: spy === true ? box.spyLog() : undefined,
    timeoutMs: 60_000,
  });
}

function assertSilent(result, label = "") {
  const details = `${label}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
  assert.equal(result.exitCode, 0, details);
  assert.equal(result.stdout, "", details);
  assert.equal(result.stderr, "", details);
}

function assertBlocked(result) {
  assert.equal(result.exitCode, 2, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.equal(result.stdout, "", "a blocking run writes nothing to stdout");
  assert.ok(result.stderr.startsWith(`${BLOCK_HEADER}\n\n`), result.stderr);
  assert.ok(!result.stderr.includes("\u001b"), "colour codes are stripped");
}

function assertNotice(result, pattern) {
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.ok(result.json, `stdout is one JSON object: ${result.stdout}`);
  assert.match(result.json.systemMessage, pattern);
}

/** Programs of the child processes the spy saw. */
function childPrograms(result) {
  return result.spy
    .filter((line) => line.startsWith("child_process."))
    .map((line) => line.slice(line.indexOf(" ") + 1));
}

/** Every file below a directory (relative, `/`), for proving the hook wrote nothing there. */
function listTree(root) {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) =>
      path
        .relative(root, path.join(entry.parentPath ?? entry.path, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .filter((rel) => rel !== ".git" && !rel.startsWith(".git/"))
    .sort();
}

// --- git ------------------------------------------------------------------------------------------

const GIT_UNAVAILABLE =
  spawnSync("git", ["--version"], { encoding: "utf8", shell: false }).status === 0
    ? false
    : "git is not installed";

function git(box, cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    env: cleanEnv(box.env),
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

function commitAll(box, cwd, message = "change") {
  git(box, cwd, ["add", "-A"]);
  git(box, cwd, [
    "-c",
    "user.name=Stop Test",
    "-c",
    "user.email=stop-test@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    message,
  ]);
}

function initRepo(box, cwd) {
  git(box, cwd, ["init", "-q"]);
  commitAll(box, cwd, "init");
}

/** Adds a pattern to the repository's .git/info/exclude (created when git's template lacks it). */
function appendExclude(project, pattern) {
  const exclude = path.join(project.root, ".git", "info", "exclude");
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.appendFileSync(exclude, `${pattern}\n`);
}

// --- tools ----------------------------------------------------------------------------------------

function composerUnavailable() {
  if (resolveComposer({ env: process.env }) === null) {
    return "Composer (composer.phar, or a composer PHP script) is not on PATH";
  }
  const php = spawnSync("php", ["-r", "echo PHP_MAJOR_VERSION;"], {
    encoding: "utf8",
    shell: false,
  });
  if (php.error || php.status !== 0) return "php is not on PATH";
  if (Number(php.stdout.trim()) < 8) return "the Composer fixture needs PHP 8 or later";
  return false;
}

/** Skip reason for the Composer half of the end-to-end tests, or false when it can run. */
const COMPOSER_UNAVAILABLE = composerUnavailable();

/**
 * A PATH holding only `node` and, on POSIX, `sh` (npm looks the script shell up on PATH): no
 * git, no php, no composer. On Windows npm uses `ComSpec`, and `node.cmd` is run by that shell.
 */
function nodeOnlyPath(box) {
  const bin = path.join(box.dir, "node-only-bin");
  fs.mkdirSync(bin);
  if (IS_WINDOWS) {
    fs.writeFileSync(path.join(bin, "node.cmd"), `@"${process.execPath}" %*\r\n`);
  } else {
    fs.symlinkSync(process.execPath, path.join(bin, "node"));
    fs.symlinkSync("/bin/sh", path.join(bin, "sh"));
  }
  return { [PATH_KEY]: bin };
}

async function closedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeAllListeners("error");
      resolve();
    });
  });
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// ==================================================================================================
// Library: lib/fingerprint.mjs
// ==================================================================================================

describe("git status --porcelain=v1 -z parser", () => {
  const { cases } = JSON.parse(
    fs.readFileSync(path.join(STOP_FIXTURES, "porcelain", "cases.json"), "utf8"),
  );
  for (const { name, output, entries } of cases) {
    test(name, () => {
      assert.deepEqual(parsePorcelainZ(output), entries);
    });
  }
});

describe("fingerprint in a git work tree", { skip: GIT_UNAVAILABLE }, () => {
  const fingerprintOf = (box, project, extra = null) =>
    computeFingerprint({
      root: project.root,
      env: cleanEnv(box.env),
      extra,
      timeLimitMs: ROOMY_MS,
    });

  test("it is a function of the working state: paths, contents and HEAD", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { "src/app.js": CLEAN, "README.md": "# app\n" });
    initRepo(box, project.root);

    const clean = await fingerprintOf(box, project);
    assert.equal(clean.mode, "git");
    assert.match(clean.fingerprint, HEX64);
    assert.equal(clean.files, 0, "a clean tree has no changed files");

    project.write("src/app.js", CLEAN_2);
    const edited = await fingerprintOf(box, project);
    assert.notEqual(edited.fingerprint, clean.fingerprint);
    assert.equal(edited.files, 1);

    // Same size, same status line (" M src/app.js"): only the content differs.
    project.write("src/app.js", CLEAN_3);
    const reEdited = await fingerprintOf(box, project);
    assert.notEqual(reEdited.fingerprint, edited.fingerprint, "a re-edit changes the fingerprint");

    project.write("src/app.js", CLEAN_2);
    assert.equal((await fingerprintOf(box, project)).fingerprint, edited.fingerprint, "same state");

    git(box, project.root, ["add", "src/app.js"]);
    assert.equal(
      (await fingerprintOf(box, project)).fingerprint,
      edited.fingerprint,
      "staging does not change what the gate checks",
    );

    project.write("src/app.js", CLEAN);
    git(box, project.root, ["add", "src/app.js"]);
    assert.equal((await fingerprintOf(box, project)).fingerprint, clean.fingerprint, "reverted");

    fs.rmSync(project.path("README.md"));
    const deleted = await fingerprintOf(box, project);
    assert.notEqual(deleted.fingerprint, clean.fingerprint, "a deletion counts");

    commitAll(box, project.root, "remove readme");
    const committed = await fingerprintOf(box, project);
    assert.equal(committed.files, 0);
    assert.notEqual(committed.fingerprint, clean.fingerprint, "a new HEAD is a new state");
  });

  test("untracked files inside new directories count, with their content", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { "src/app.js": CLEAN });
    initRepo(box, project.root);
    const clean = await fingerprintOf(box, project);

    project.write("src/feature/deep/new.js", CLEAN);
    const added = await fingerprintOf(box, project);
    assert.notEqual(added.fingerprint, clean.fingerprint);
    assert.equal(added.files, 1, "the file itself is listed, not only its directory");

    project.write("src/feature/deep/new.js", CLEAN_2);
    assert.notEqual((await fingerprintOf(box, project)).fingerprint, added.fingerprint);
  });

  test("ignored files do not count", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { ".gitignore": "cache/\n", "src/app.js": CLEAN });
    initRepo(box, project.root);
    const clean = await fingerprintOf(box, project);
    project.write("cache/result.json", "{}\n");
    assert.equal((await fingerprintOf(box, project)).fingerprint, clean.fingerprint);
  });

  test("the caller's extra value (the gate plan) is part of it", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { "src/app.js": CLEAN });
    initRepo(box, project.root);
    const a = await fingerprintOf(box, project, { command: "check:fast" });
    const b = await fingerprintOf(box, project, { command: "verify:quick" });
    assert.notEqual(a.fingerprint, b.fingerprint);
  });

  test("a renamed file counts under both paths", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { "src/old name.js": CLEAN });
    initRepo(box, project.root);
    git(box, project.root, ["mv", "src/old name.js", "src/new name.js"]);
    const renamed = await fingerprintOf(box, project);
    assert.equal(renamed.files, 2);
    project.write("src/new name.js", CLEAN_2);
    assert.notEqual((await fingerprintOf(box, project)).fingerprint, renamed.fingerprint);
  });

  test("a project tracked below the repository root uses git; paths outside it do not count", async (t) => {
    const box = sandbox(t);
    const repo = makeProject(t, { "web/src/app.js": CLEAN, "api/app.php": "<?php\n" });
    initRepo(box, repo.root);
    const web = { root: repo.path("web") };
    const before = await fingerprintOf(box, web);
    assert.equal(before.mode, "git");
    repo.write("api/app.php", "<?php\n// changed\n");
    assert.equal((await fingerprintOf(box, web)).fingerprint, before.fingerprint);
    repo.write("web/src/app.js", CLEAN_2);
    assert.notEqual((await fingerprintOf(box, web)).fingerprint, before.fingerprint);
  });

  test("a project that an enclosing repository ignores falls back to the walk", async (t) => {
    const box = sandbox(t);
    const outer = makeProject(t, { ".gitignore": "*\n!.gitignore\n" });
    initRepo(box, outer.root);
    const project = makeProject(t, { "src/app.js": CLEAN }, { parent: outer.root, name: "app" });
    const before = await fingerprintOf(box, project);
    assert.equal(before.mode, "walk");
    assert.match(before.reason, /enclosing git repository does not track the project/);
    project.write("src/app.js", CLEAN_2);
    assert.notEqual((await fingerprintOf(box, project)).fingerprint, before.fingerprint);
  });

  test("more changed files than the cap: no fingerprint", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { "src/a.js": CLEAN });
    initRepo(box, project.root);
    project.write("src/b.js", CLEAN);
    project.write("src/c.js", CLEAN);
    const result = await computeFingerprint({
      root: project.root,
      env: cleanEnv(box.env),
      limits: { maxEntries: 1 },
      timeLimitMs: ROOMY_MS,
    });
    assert.equal(result.fingerprint, null);
    assert.match(result.reason, /more than 1 changed files/);
  });

  test("a nested repository contributes its HEAD and its changed files, within bounds", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { "README.md": "# app\n" });
    initRepo(box, project.root);
    project.write("web/src/app.js", CLEAN);
    initRepo(box, project.path("web"));
    project.write("web/inner/lib.js", CLEAN);
    initRepo(box, project.path("web/inner"));
    assert.equal(git(box, project.root, ["status", "--porcelain"]), "?? web/\n");

    const clean = await fingerprintOf(box, project);
    assert.match(clean.fingerprint, HEX64);
    project.write("web/src/app.js", CLEAN_2);
    const edited = await fingerprintOf(box, project);
    assert.notEqual(edited.fingerprint, clean.fingerprint, "an edit inside the nested repository");
    commitAll(box, project.path("web"));
    const committed = await fingerprintOf(box, project);
    assert.notEqual(committed.fingerprint, edited.fingerprint, "a commit in the nested repository");
    project.write("web/inner/lib.js", CLEAN_2);
    assert.notEqual(
      (await fingerprintOf(box, project)).fingerprint,
      committed.fingerprint,
      "an edit two repositories down",
    );

    for (const limits of [{ maxNestedRepos: 1 }, { maxNestingDepth: 1 }]) {
      const bounded = await computeFingerprint({
        root: project.root,
        env: cleanEnv(box.env),
        limits,
        timeLimitMs: ROOMY_MS,
      });
      assert.equal(bounded.fingerprint, null, JSON.stringify(limits));
      assert.match(bounded.reason, /nested repositories/);
    }
  });

  test("files hidden from git status by index flags or exclude files still count", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { "src/app.js": CLEAN, "src/lib.js": CLEAN });
    initRepo(box, project.root);
    const clean = await fingerprintOf(box, project);

    project.write("src/app.js", BROKEN);
    git(box, project.root, ["update-index", "--skip-worktree", "src/app.js"]);
    assert.equal(git(box, project.root, ["status", "--porcelain"]), "", "git status hides it");
    const skipped = await fingerprintOf(box, project);
    assert.notEqual(skipped.fingerprint, clean.fingerprint, "skip-worktree");

    project.write("src/lib.js", BROKEN);
    git(box, project.root, ["update-index", "--assume-unchanged", "src/lib.js"]);
    const assumed = await fingerprintOf(box, project);
    assert.notEqual(assumed.fingerprint, skipped.fingerprint, "assume-unchanged");
    project.write("src/lib.js", CLEAN_2);
    const reEdited = await fingerprintOf(box, project);
    assert.notEqual(reEdited.fingerprint, assumed.fingerprint, "a re-edit of a flagged file");

    appendExclude(project, "src/hidden.js");
    const excluded = await fingerprintOf(box, project);
    assert.notEqual(excluded.fingerprint, reEdited.fingerprint, ".git/info/exclude");
  });
});

describe("fingerprint outside git", () => {
  const walkFingerprint = (box, project, limits) =>
    computeFingerprint({
      root: project.root,
      env: cleanEnv(box.env),
      limits,
      timeLimitMs: ROOMY_MS,
    });

  test("without git on PATH, the walk covers the project's files and their content", async (t) => {
    const box = sandbox(t);
    box.env = { ...box.env, ...nodeOnlyPath(box) };
    const project = makeProject(t, {
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["web"] },
      "src/app.js": CLEAN,
    });
    const before = await walkFingerprint(box, project);
    assert.equal(before.mode, "walk");
    assert.match(before.reason, /git: ENOENT/);
    assert.equal(before.files, 2);

    await coarseClockTick();
    project.write("src/app.js", CLEAN_2);
    const after = await walkFingerprint(box, project);
    assert.notEqual(after.fingerprint, before.fingerprint);

    await coarseClockTick();
    project.write(".cross-stack/standard.json", { version: "1.0.0", tracks: ["mobile"] });
    assert.notEqual((await walkFingerprint(box, project)).fingerprint, after.fingerprint);
  });

  test("dependency, build and tool directories are skipped; .cross-stack is kept", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, {
      "src/app.js": CLEAN,
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["web"] },
      ".cross-stack/vendor/pkg/index.js": "1\n",
      "node_modules/pkg/index.js": "1\n",
      "vendor/autoload.php": "<?php\n",
      "dist/app.js": "1\n",
      "web/.next/cache.json": "{}\n",
      ".idea/workspace.xml": "<x/>\n",
      ".env": "KEY=\n",
    });
    const walk = walkProjectFiles(project.root);
    assert.deepEqual(walk.files?.sort(), [".cross-stack/standard.json", ".env", "src/app.js"]);

    const before = await walkFingerprint(box, project);
    for (const rel of [
      "node_modules/pkg/index.js",
      "vendor/autoload.php",
      "dist/app.js",
      ".cross-stack/vendor/pkg/index.js",
    ]) {
      project.write(rel, "changed\n");
    }
    assert.equal((await walkFingerprint(box, project)).fingerprint, before.fingerprint);
  });

  test("a walk past its bounds gives no fingerprint", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { "a.js": "1\n", "b.js": "2\n", "deep/er/c.js": "3\n" });
    const cases = [
      [{ maxEntries: 2 }, /too many files/],
      [{ maxDepth: 1 }, /too deep/],
      [{ maxDirs: 1 }, /too many directories/],
    ];
    for (const [limits, reason] of cases) {
      const result = await walkFingerprint(box, project, limits);
      assert.equal(result.fingerprint, null, JSON.stringify(limits));
      assert.match(result.reason, reason);
    }
  });

  test("every walked file contributes its lstat signature: size, mtime, ctime, inode", async (t) => {
    const project = makeProject(t, { "src/app.js": CLEAN });
    const file = project.path("src/app.js");
    const stat = fs.lstatSync(file, { bigint: true });
    const expected = `stat:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.ino}`;
    assert.equal(signaturePath(file), expected);
    assert.equal(signaturePath(project.path("gone.js")), "missing");
    assert.equal(signaturePath(project.root), "dir");

    // Same size and, after a reset, the same modification time: the change time still differs.
    const { atime, mtime } = fs.statSync(file);
    await coarseClockTick();
    project.write("src/app.js", CLEAN_2);
    fs.utimesSync(file, atime, mtime);
    assert.notEqual(signaturePath(file), expected, "resetting mtime does not hide a rewrite");
  });

  test("an unchanged tree gives the same fingerprint however long the walk takes", async (t) => {
    const box = sandbox(t);
    box.env = { ...box.env, ...nodeOnlyPath(box) };
    const content = "x".repeat(16 * 1024);
    const files = Object.fromEntries(
      Array.from({ length: 2_000 }, (_, index) => [`src/file-${index}.js`, content]),
    );
    const project = makeProject(t, files);
    const values = [];
    for (let run = 0; run < 4; run += 1) {
      const result = await computeFingerprint({
        root: project.root,
        env: cleanEnv(box.env),
        timeLimitMs: 40,
      });
      values.push(result.fingerprint);
    }
    const complete = new Set(values.filter((value) => value !== null));
    t.diagnostic(`time limit 40 ms: ${values.filter((v) => v === null).length} of 4 incomplete`);
    assert.ok(complete.size <= 1, `complete fingerprints differ: ${[...complete].join(", ")}`);
  });

  test("past the deadline the fingerprint is null, never a partial value", async (t) => {
    const box = sandbox(t);
    box.env = { ...box.env, ...nodeOnlyPath(box) };
    const project = makeProject(t, { "a.js": "1\n", "b.js": "2\n", "src/c.js": "3\n" });
    const reference = await computeFingerprint({
      root: project.root,
      env: cleanEnv(box.env),
      timeLimitMs: ROOMY_MS,
    });
    assert.match(reference.fingerprint, HEX64);
    let nulls = 0;
    for (let ticks = 0; ticks < 40; ticks += 1) {
      // A clock that stands still for `ticks` readings, then jumps past every deadline.
      let readings = 0;
      const now = () => (readings++ < ticks ? 0 : 1e9);
      const result = await computeFingerprint({
        root: project.root,
        env: cleanEnv(box.env),
        now,
      });
      if (result.fingerprint === null) {
        nulls += 1;
        assert.match(result.reason, /time limit/);
      } else {
        assert.equal(result.fingerprint, reference.fingerprint, `clock jump after ${ticks}`);
      }
    }
    assert.ok(nulls > 0, "a deadline that passes gives no fingerprint");
  });

  test("known tool caches do not count in the walk", async (t) => {
    const box = sandbox(t);
    box.env = { ...box.env, ...nodeOnlyPath(box) };
    const project = makeProject(t, { "src/app.js": CLEAN });
    const options = { root: project.root, env: cleanEnv(box.env), timeLimitMs: ROOMY_MS };
    const before = await computeFingerprint(options);
    for (const rel of WALK_IGNORED_FILES) project.write(`web/${rel}`, "{}\n");
    project.write("tsconfig.tsbuildinfo", "{}\n");
    const after = await computeFingerprint(options);
    assert.equal(after.fingerprint, before.fingerprint);
  });

  test("content is hashed up to the caps; above them size and modification time count", (t) => {
    const project = makeProject(t, { "small.txt": "abc", "large.txt": "0123456789" });
    const state = () => ({
      hashed: 0,
      limits: { ...FINGERPRINT_LIMITS, maxFileBytes: 5 },
      deadline: Number.POSITIVE_INFINITY,
    });
    assert.match(describePath(project.path("small.txt"), state()), /^sha256:[0-9a-f]{64}$/);
    assert.match(describePath(project.path("large.txt"), state()), /^stat:10:/);
    const totalCapped = { ...state(), hashed: FINGERPRINT_LIMITS.maxHashBytes };
    assert.match(describePath(project.path("small.txt"), totalCapped), /^stat:3:/);
    assert.equal(describePath(project.path("gone.txt"), state()), "missing");
    assert.equal(describePath(project.root, state()), "dir");
  });

  test(
    "a symbolic link contributes its target and is not followed",
    { skip: IS_WINDOWS ? "symbolic links need extra rights on Windows" : false },
    (t) => {
      const project = makeProject(t, { "real/file.txt": "x\n" });
      fs.symlinkSync("real", project.path("link"));
      const state = { hashed: 0, limits: FINGERPRINT_LIMITS, deadline: Number.POSITIVE_INFINITY };
      assert.equal(describePath(project.path("link"), state), "link:real");
      assert.deepEqual(walkProjectFiles(project.root).files?.sort(), ["link", "real/file.txt"]);
    },
  );
});

describe("state file", () => {
  test("the key is stable per project and differs between projects", (t) => {
    const a = makeProject(t);
    const b = makeProject(t);
    assert.match(projectKey(a.root), /^[0-9a-f]{32}$/);
    assert.equal(projectKey(a.root), projectKey(`${a.root}${path.sep}`));
    assert.notEqual(projectKey(a.root), projectKey(b.root));
  });

  test("it lives in CLAUDE_PLUGIN_DATA, else under the temporary directory, never in the project", (t) => {
    const project = makeProject(t);
    const outside = tempDir(t);
    const tmpDir = tempDir(t);
    assert.equal(
      stateFileFor({ dataDir: outside, projectRoot: project.root, tmpDir }),
      path.join(canonicalPath(outside), `${projectKey(project.root)}.json`),
    );
    const fallback = path.join(canonicalPath(tmpDir), FALLBACK_STATE_DIR);
    assert.equal(stateDirFor({ dataDir: null, projectRoot: project.root, tmpDir }), fallback);
    assert.equal(
      stateDirFor({ dataDir: "relative/dir", projectRoot: project.root, tmpDir }),
      fallback,
    );
    assert.equal(
      stateDirFor({ dataDir: project.path(".data"), projectRoot: project.root, tmpDir }),
      fallback,
      "a data directory inside the project is not used",
    );
    assert.equal(
      stateDirFor({
        dataDir: project.path(".data"),
        projectRoot: project.root,
        tmpDir: project.path("tmp"),
      }),
      null,
      "with no directory outside the project, nothing is kept",
    );
  });

  test("a green fingerprint round-trips; other keys are kept; bad input is refused", (t) => {
    const project = makeProject(t);
    const dataDir = path.join(tempDir(t), "data");
    const options = { dataDir, projectRoot: project.root, tmpDir: tempDir(t) };
    assert.equal(readGreenFingerprint(options), null);

    const first = "a".repeat(64);
    const file = recordGreenFingerprint({ ...options, fingerprint: first });
    assert.equal(file, stateFileFor(options));
    assert.equal(readGreenFingerprint(options), first);

    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(state.version, 1);
    assert.equal(state.project, canonicalPath(project.root).split(path.sep).join("/"));
    assert.equal(state.stop.greenFingerprint, first);
    assert.ok(!Number.isNaN(Date.parse(state.stop.recordedAt)));

    fs.writeFileSync(file, JSON.stringify({ ...state, other: { kept: true } }));
    recordGreenFingerprint({ ...options, fingerprint: "b".repeat(64) });
    const updated = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(updated.other, { kept: true });
    assert.equal(updated.stop.greenFingerprint, "b".repeat(64));

    assert.equal(recordGreenFingerprint({ ...options, fingerprint: "not a fingerprint" }), null);
    assert.equal(readGreenFingerprint(options), "b".repeat(64));

    fs.writeFileSync(file, "{ not json");
    assert.equal(readGreenFingerprint(options), null, "a damaged file reads as no record");
    assert.ok(recordGreenFingerprint({ ...options, fingerprint: first }));
    assert.equal(readGreenFingerprint(options), first);
    assert.deepEqual(
      fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith(".tmp")),
      [],
      "no temporary files are left behind",
    );
  });

  test("a failing fingerprint keeps the green one; a green run clears it", (t) => {
    const project = makeProject(t);
    const options = { dataDir: path.join(tempDir(t), "data"), projectRoot: project.root };
    assert.equal(readFailingFingerprint(options), null);
    assert.ok(recordFailingFingerprint({ ...options, fingerprint: "c".repeat(64) }));
    assert.equal(readFailingFingerprint(options), "c".repeat(64));
    assert.equal(readGreenFingerprint(options), null);

    recordGreenFingerprint({ ...options, fingerprint: "a".repeat(64) });
    assert.equal(readFailingFingerprint(options), null, "cleared by a green run");
    recordFailingFingerprint({ ...options, fingerprint: "d".repeat(64) });
    assert.equal(readGreenFingerprint(options), "a".repeat(64), "the green record is kept");
    assert.equal(readFailingFingerprint(options), "d".repeat(64));
    assert.equal(recordFailingFingerprint({ ...options, fingerprint: "nope" }), null);
  });
});

// ==================================================================================================
// Handler helpers: handlers/stop.mjs
// ==================================================================================================

describe("plan", () => {
  const info = (project) => readManifest(project.path(".cross-stack/standard.json"));

  test("track directories come from trackRoots, in track order, without duplicates", (t) => {
    const project = makeProject(t, {
      ".cross-stack/standard.json": {
        version: "1.0.0",
        tracks: ["mobile", "web", "laravel"],
        trackRoots: { laravel: "api", web: ["web", "./web/"], mobile: "." },
      },
    });
    const { dirs, problems } = trackDirs(info(project), project.root);
    assert.deepEqual(dirs, [project.path("api"), project.path("web"), project.root]);
    assert.deepEqual(problems, []);
  });

  test("an unusable trackRoots entry falls back to the project directory", (t) => {
    const project = makeProject(t, {
      ".cross-stack/standard.json": {
        version: "1.0.0",
        tracks: ["laravel", "web", "mobile"],
        trackRoots: { laravel: "../elsewhere", web: path.resolve("/absolute"), mobile: 5 },
      },
    });
    const { dirs, problems } = trackDirs(info(project), project.root);
    assert.deepEqual(dirs, [project.root]);
    assert.equal(problems.length, 3, problems.join("\n"));
  });

  test("a manifest without valid tracks uses the project directory", (t) => {
    const project = makeProject(t, { ".cross-stack/standard.json": "{ not json" });
    assert.deepEqual(trackDirs(info(project), project.root).dirs, [project.root]);
  });

  test("only defined scripts are planned: Composer first, then npm, per directory", (t) => {
    const fullstack = makeProject(t, stopFixture("fullstack-roots"));
    assert.deepEqual(
      gatePlan({
        manifest: info(fullstack),
        projectRoot: fullstack.root,
        command: "check:fast",
      }).entries.map(({ ecosystem, rel, display }) => [ecosystem, rel, display]),
      [
        ["composer", "api", "composer run-script check:fast"],
        ["npm", "web", "npm run check:fast"],
      ],
    );
    const shared = makeProject(t, stopFixture("fullstack"));
    assert.deepEqual(
      gatePlan({
        manifest: info(shared),
        projectRoot: shared.root,
        command: "check:fast",
      }).entries.map(({ ecosystem, rel }) => [ecosystem, rel]),
      [
        ["composer", "."],
        ["npm", "."],
      ],
    );
    const none = makeProject(t, stopFixture("no-script"));
    assert.deepEqual(
      gatePlan({ manifest: info(none), projectRoot: none.root, command: "check:fast" }).entries,
      [],
    );
  });
});

describe("output shown to Claude", () => {
  test(`the last ${TAIL_LINES} lines, without colour codes or progress redraws`, () => {
    const output = [
      ...Array.from({ length: 100 }, (_, index) => `line ${index + 1}`),
      "\u001b[31merror\u001b[39m in file",
      "progress 10%\rprogress 100%",
    ].join("\r\n");
    const tail = outputTail(`${output}\n\n`, { homes: [] });
    const lines = tail.text.split("\n");
    assert.equal(tail.total, 102);
    assert.equal(tail.shown, TAIL_LINES);
    assert.equal(lines.length, TAIL_LINES);
    assert.equal(lines[0], "line 43");
    assert.equal(lines.at(-2), "error in file");
    assert.equal(lines.at(-1), "progress 100%");
  });

  test("long lines are cut; empty output is reported as such", () => {
    const tail = outputTail("x".repeat(MAX_LINE_CHARS * 2), { homes: [] });
    assert.equal(tail.text.length, MAX_LINE_CHARS);
    assert.ok(tail.text.endsWith("…"));
    assert.deepEqual(outputTail("", { homes: [] }), { text: "", shown: 0, total: 0 });
  });

  test("the home directory becomes ~ where it starts a path", () => {
    const homes = homeSpellings("/home/dev/");
    assert.deepEqual(homes, ["/home/dev"]);
    assert.equal(
      sanitizePaths("at /home/dev/app/x.js:3 and /home/dev, not /home/developer/x", homes),
      "at ~/app/x.js:3 and ~, not /home/developer/x",
    );
    const windows = homeSpellings("C:\\Users\\dev");
    assert.deepEqual(windows.sort(), ["C:/Users/dev", "C:\\Users\\dev"]);
    assert.equal(
      sanitizePaths("C:\\Users\\dev\\app\\x.ts and C:/Users/dev/app/y.ts", windows),
      "~\\app\\x.ts and ~/app/y.ts",
    );
    assert.deepEqual(homeSpellings("/"), [], "a root home replaces nothing");
    assert.deepEqual(homeSpellings("C:\\"), []);
    assert.deepEqual(homeSpellings(""), []);
  });

  test("the gate's environment: CI and the quiet tool settings on, session variables off", () => {
    const env = gateEnv({
      PATH: "/bin",
      FORCE_COLOR: "1",
      CLAUDECODE: "1",
      CLAUDE_PROJECT_DIR: "/p",
      CLAUDE_PLUGIN_DATA: "/d",
      AI_AGENT: "claude",
      CROSS_STACK_STANDARD_STOP_GATE: "1",
      KEEP_ME: "yes",
    });
    // lib/spawn.mjs owns the quiet tool settings; the ones this gate relies on are pinned here.
    assert.deepEqual(env, { PATH: "/bin", KEEP_ME: "yes", ...TOOL_ENV, CI: "1" });
    for (const [name, value] of Object.entries({
      PAO_DISABLE: "1",
      DO_NOT_TRACK: "1",
      JSCPD_NO_TIPS: "1",
      NO_COLOR: "1",
    })) {
      assert.equal(env[name], value, name);
    }
  });
});

// ==================================================================================================
// End to end: the real entry point
// ==================================================================================================

describe("silent paths start no process", () => {
  const failingWebProject = (t, manifestExtra = {}) =>
    makeProject(t, {
      ...stopFixture("npm"),
      ".cross-stack/standard.json": { version: "1.0.0", tracks: ["web"], ...manifestExtra },
      "src/app.js": BROKEN,
    });

  for (const value of ["0", "false", "off", "no"]) {
    test(`CROSS_STACK_STANDARD_STOP_GATE=${value}`, async (t) => {
      const box = sandbox(t);
      const project = failingWebProject(t);
      const result = await runStop(box, project, {
        env: { CROSS_STACK_STANDARD_STOP_GATE: value },
        spy: true,
      });
      assertSilent(result);
      assert.deepEqual(childPrograms(result), []);
      assert.deepEqual(box.runs(), []);
    });
  }

  test("hooks.stop.enabled: false in the manifest; the environment variable overrides it", async (t) => {
    const box = sandbox(t);
    const project = failingWebProject(t, { hooks: { stop: { enabled: false } } });
    const off = await runStop(box, project, { spy: true });
    assertSilent(off);
    assert.deepEqual(childPrograms(off), []);

    const on = await runStop(box, project, { env: { CROSS_STACK_STANDARD_STOP_GATE: "1" } });
    assertBlocked(on);
    assert.deepEqual(box.runs().length, 1);
  });

  test("stop_hook_active with the gate turned off", async (t) => {
    const box = sandbox(t);
    const project = failingWebProject(t);
    const result = await runStop(box, project, {
      active: true,
      env: { CROSS_STACK_STANDARD_STOP_GATE: "0" },
      spy: true,
    });
    assertSilent(result);
    assert.deepEqual(childPrograms(result), []);
    assert.deepEqual(box.runs(), []);
  });

  test("no manifest", async (t) => {
    const box = sandbox(t);
    const { ".cross-stack/standard.json": _manifest, ...files } = stopFixture("npm");
    const project = makeProject(t, { ...files, "src/app.js": BROKEN });
    const result = await runStop(box, project, { spy: true });
    assertSilent(result);
    assert.deepEqual(childPrograms(result), []);
  });

  test("no check:fast script (only check in npm; an empty list in Composer)", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("no-script"));
    const result = await runStop(box, project, { spy: true });
    assertSilent(result);
    assert.deepEqual(childPrograms(result), []);
  });
});

describe("green runs are recorded and skipped", { skip: GIT_UNAVAILABLE }, () => {
  test("a green run records the fingerprint; an unchanged tree skips the gate", async (t) => {
    const box = sandbox(t);
    // A directory name with spaces: nothing on the way may go through a shell.
    const project = makeProject(t, stopFixture("npm"), { name: "stop gate project" });
    initRepo(box, project.root);
    project.write("src/app.js", CLEAN_2);

    assertSilent(await runStop(box, project), "green");
    assert.deepEqual(box.runs(), ["npm stop gate project"]);
    const stateFile = path.join(box.dataDir, `${projectKey(project.root)}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    assert.match(state.stop.greenFingerprint, HEX64);

    const skipped = await runStop(box, project, { spy: true });
    assertSilent(skipped, "skipped");
    assert.deepEqual(box.runs().length, 1, "the gate did not run again");
    assert.ok(
      childPrograms(skipped).every((program) => program === "git"),
      `only git ran: ${childPrograms(skipped).join(", ")}`,
    );

    const timings = [];
    for (let run = 0; run < 3; run += 1) timings.push((await runStop(box, project)).durationMs);
    t.diagnostic(`Stop skip (unchanged tree), end to end: best of 3 = ${Math.min(...timings)} ms`);
    assert.equal(box.runs().length, 1);
  });

  test("a re-edit of an already-changed file runs the gate again, and a failure blocks", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("npm"));
    initRepo(box, project.root);

    project.write("src/app.js", CLEAN_2);
    assertSilent(await runStop(box, project));
    assert.equal(box.runs().length, 1);

    // Same file, same size, still " M src/app.js" in git status: only the content changed.
    project.write("src/app.js", CLEAN_3);
    assertSilent(await runStop(box, project));
    assert.equal(box.runs().length, 2, "the content change ran the gate again");

    project.write("src/app.js", BROKEN);
    const blocked = await runStop(box, project);
    assertBlocked(blocked);
    assert.match(blocked.stderr, /src\/app\.js:1 fake\/no-lint-error LINT_ERROR marker found/);
    assert.equal(box.runs().length, 3);

    const again = await runStop(box, project);
    assertBlocked(again);
    assert.equal(box.runs().length, 4, "a failing state is never recorded, so it runs again");

    project.write("src/app.js", CLEAN_3);
    assertSilent(await runStop(box, project));
    assert.equal(box.runs().length, 4, "back to the last green state: skipped");
  });

  test("a new untracked file after a green run runs the gate", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("npm"));
    initRepo(box, project.root);
    assertSilent(await runStop(box, project));
    project.write("src/feature/new.js", BROKEN);
    const result = await runStop(box, project);
    assertBlocked(result);
    assert.match(result.stderr, /src\/feature\/new\.js:1 fake\/no-lint-error/);
  });

  test("a changed hooks.stop.command runs the gate again with the new script", async (t) => {
    const box = sandbox(t);
    const files = stopFixture("npm");
    files["package.json"].scripts["verify:quick"] = "node check.mjs";
    const project = makeProject(t, files);
    initRepo(box, project.root);
    assertSilent(await runStop(box, project));
    assertSilent(
      await runStop(box, project, { env: { CROSS_STACK_STANDARD_STOP_COMMAND: "verify:quick" } }),
    );
    assert.equal(box.runs().length, 2);
  });
});

describe("stop_hook_active: the gate checks Claude's fix", () => {
  test("unchanged since the blocked run: the stop goes through without running the gate", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { ...stopFixture("npm"), "src/app.js": BROKEN });
    assertBlocked(await runStop(box, project));
    assert.equal(box.runs().length, 1);
    const stored = { dataDir: box.dataDir, projectRoot: project.root };
    assert.match(readFailingFingerprint(stored), HEX64, "the failing state is recorded");

    const unchanged = await runStop(box, project, { active: true, spy: true });
    assertSilent(unchanged, "Claude changed nothing: no loop, no second block");
    assert.equal(box.runs().length, 1, "the gate did not run");
    assert.ok(
      childPrograms(unchanged).every((program) => program === "git"),
      `only git ran: ${childPrograms(unchanged).join(", ")}`,
    );
  });

  test("a change that still fails is blocked again; a fix passes and is recorded", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { ...stopFixture("npm"), "src/app.js": BROKEN });
    assertBlocked(await runStop(box, project));

    project.write("src/other.js", BROKEN);
    const worse = await runStop(box, project, { active: true });
    assertBlocked(worse);
    assert.match(worse.stderr, /src\/other\.js:1 fake\/no-lint-error/);
    assert.equal(box.runs().length, 2, "the gate ran again");

    project.write("src/app.js", CLEAN);
    const partial = await runStop(box, project, { active: true });
    assertBlocked(partial);
    assert.doesNotMatch(partial.stderr, /src\/app\.js:1/);
    assert.equal(box.runs().length, 3);

    fs.rmSync(project.path("src/other.js"));
    assertSilent(await runStop(box, project, { active: true }), "fixed");
    assert.equal(box.runs().length, 4);
    const stored = { dataDir: box.dataDir, projectRoot: project.root };
    assert.match(readGreenFingerprint(stored), HEX64);
    assert.equal(readFailingFingerprint(stored), null, "a green run clears the failing record");
  });

  test("no record of a failing run: the gate runs", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { ...stopFixture("npm"), "src/app.js": BROKEN });
    assertBlocked(await runStop(box, project, { active: true }));
    assert.equal(box.runs().length, 1);
  });
});

describe("a write that lands while the gate runs", () => {
  for (const mode of ["git", "walk"]) {
    test(
      `${mode}: the state the gate checked is not recorded when it changed during the run`,
      { skip: mode === "git" ? GIT_UNAVAILABLE : false },
      async (t) => {
        const box = sandbox(t);
        const project = makeProject(t, stopFixture("npm"));
        if (mode === "git") initRepo(box, project.root);
        const stored = { dataDir: box.dataDir, projectRoot: project.root };

        // The gate reads src/, passes, and a write lands in src/app.js before it exits.
        const raced = await runStop(box, project, {
          env: { STOP_TEST_APPEND_AFTER_SCAN: "src/app.js" },
        });
        assertSilent(raced, "the gate itself passed");
        assert.equal(readGreenFingerprint(stored), null, "nothing is recorded");

        const next = await runStop(box, project);
        assertBlocked(next);
        assert.match(next.stderr, /src\/app\.js:1 fake\/no-lint-error/);
        assert.equal(box.runs().length, 2);
      },
    );
  }

  test("a quiet run records the state from before the run", async (t) => {
    const box = sandbox(t);
    // Force the intended walk mode and avoid spending the fingerprint deadline probing Git.
    box.env = { ...box.env, ...nodeOnlyPath(box) };
    const project = makeProject(t, stopFixture("npm"));
    assertSilent(await runStop(box, project));
    assertSilent(await runStop(box, project));
    assert.equal(box.runs().length, 1, "recorded, then skipped");
  });
});

describe(
  "nested repositories, submodules and ignored track roots",
  { skip: GIT_UNAVAILABLE },
  () => {
    /** The web-root fixture without its web/ files, and those files keyed relative to web/. */
    function splitWebFixture() {
      const files = stopFixture("web-root");
      const outer = {};
      const web = {};
      for (const [rel, content] of Object.entries(files)) {
        if (rel.startsWith("web/")) web[rel.slice(4)] = content;
        else outer[rel] = content;
      }
      return { outer, web };
    }

    test("web/ is a repository of its own inside the project", async (t) => {
      const box = sandbox(t);
      const { outer, web } = splitWebFixture();
      const project = makeProject(t, outer);
      initRepo(box, project.root);
      for (const [rel, content] of Object.entries(web)) project.write(`web/${rel}`, content);
      initRepo(box, project.path("web"));
      assert.equal(git(box, project.root, ["status", "--porcelain"]), "?? web/\n");

      assertSilent(await runStop(box, project));
      assertSilent(await runStop(box, project));
      assert.equal(box.runs().length, 1, "recorded, then skipped");

      project.write("web/src/app.js", BROKEN);
      assert.equal(git(box, project.root, ["status", "--porcelain"]), "?? web/\n");
      const blocked = await runStop(box, project);
      assertBlocked(blocked);
      assert.match(blocked.stderr, /src\/app\.js:1 fake\/no-lint-error/);

      project.write("web/src/app.js", CLEAN);
      commitAll(box, project.path("web"), "a commit in web/");
      assertSilent(await runStop(box, project));
      assert.equal(box.runs().length, 3, "a new HEAD in web/ runs the gate");
    });

    test("web/ is a submodule", async (t) => {
      const box = sandbox(t);
      const { outer, web } = splitWebFixture();
      const library = makeProject(t, web);
      initRepo(box, library.root);
      const project = makeProject(t, outer);
      initRepo(box, project.root);
      // A local path with `/` separators on every OS; file-protocol submodules need an opt-in.
      const source = library.root.split(path.sep).join("/");
      git(box, project.root, [
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "-q",
        source,
        "web",
      ]);
      commitAll(box, project.root, "add the submodule");

      assertSilent(await runStop(box, project));
      project.write("web/src/app.js", CLEAN_2);
      assertSilent(await runStop(box, project));
      assert.equal(box.runs().length, 2);
      assert.equal(git(box, project.root, ["status", "--porcelain"]), " M web\n");

      // The superproject's status line stays " M web": only the submodule's content changed.
      project.write("web/src/app.js", BROKEN);
      assert.equal(git(box, project.root, ["status", "--porcelain"]), " M web\n");
      assertBlocked(await runStop(box, project));
    });

    test("web/ is ignored by the enclosing repository", async (t) => {
      const box = sandbox(t);
      const project = makeProject(t, { ...stopFixture("web-root"), ".gitignore": "web/\n" });
      initRepo(box, project.root);
      assert.equal(git(box, project.root, ["status", "--porcelain"]), "");

      assertSilent(await runStop(box, project));
      assertSilent(await runStop(box, project));
      assert.equal(box.runs().length, 1, "recorded, then skipped");

      project.write("web/src/app.js", BROKEN);
      assertBlocked(await runStop(box, project));
    });
  },
);

describe("files that git status does not show", { skip: GIT_UNAVAILABLE }, () => {
  async function greenRepo(t) {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("npm"));
    initRepo(box, project.root);
    assertSilent(await runStop(box, project));
    assert.equal(box.runs().length, 1);
    return { box, project };
  }

  for (const flag of ["--skip-worktree", "--assume-unchanged"]) {
    test(`a tracked file marked ${flag} after a failing edit`, async (t) => {
      const { box, project } = await greenRepo(t);
      project.write("src/app.js", BROKEN);
      git(box, project.root, ["update-index", flag, "src/app.js"]);
      assert.equal(git(box, project.root, ["status", "--porcelain"]), "");
      assertBlocked(await runStop(box, project));
    });
  }

  test("a new file listed in .git/info/exclude", async (t) => {
    const { box, project } = await greenRepo(t);
    project.write("src/new.js", BROKEN);
    appendExclude(project, "src/new.js");
    assert.equal(git(box, project.root, ["status", "--porcelain"]), "");
    assertBlocked(await runStop(box, project));
  });

  test("a new file hidden by core.excludesFile", async (t) => {
    const { box, project } = await greenRepo(t);
    const list = path.join(box.dir, "excludes");
    fs.writeFileSync(list, "src/new.js\n");
    project.write("src/new.js", BROKEN);
    git(box, project.root, ["config", "core.excludesFile", list]);
    assert.equal(git(box, project.root, ["status", "--porcelain"]), "");
    assertBlocked(await runStop(box, project));
  });

  test("a new file hidden by the default global excludes file", async (t) => {
    const { box, project } = await greenRepo(t);
    const xdg = path.join(box.dir, "xdg");
    box.env = { ...box.env, XDG_CONFIG_HOME: xdg };
    fs.mkdirSync(path.join(xdg, "git"), { recursive: true });
    fs.writeFileSync(path.join(xdg, "git", "ignore"), "");
    assertSilent(await runStop(box, project), "an empty excludes file is a new state");

    project.write("src/new.js", BROKEN);
    fs.writeFileSync(path.join(xdg, "git", "ignore"), "src/new.js\n");
    assert.equal(git(box, project.root, ["status", "--porcelain"]), "");
    assertBlocked(await runStop(box, project));
  });
});

describe("outside git", () => {
  test("green, skipped, re-run after an edit; nothing is written inside the project", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("npm"));
    const before = listTree(project.root);

    assertSilent(await runStop(box, project));
    assertSilent(await runStop(box, project));
    assert.equal(box.runs().length, 1);

    project.write("src/app.js", CLEAN_2);
    assertSilent(await runStop(box, project));
    assert.equal(box.runs().length, 2);
    project.write("src/app.js", CLEAN);
    assert.deepEqual(listTree(project.root), before);
  });
});

describe("state location", () => {
  test("without CLAUDE_PLUGIN_DATA the record goes under the temporary directory", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("npm"));
    const before = listTree(project.root);
    assertSilent(await runStop(box, project, { dataDir: undefined }));
    const file = path.join(box.tmp, FALLBACK_STATE_DIR, `${projectKey(project.root)}.json`);
    assert.ok(fs.existsSync(file), `${file} exists`);
    assert.deepEqual(listTree(project.root), before);
    assertSilent(await runStop(box, project, { dataDir: undefined }));
    assert.equal(box.runs().length, 1, "the fallback record is read back");
  });

  test("a CLAUDE_PLUGIN_DATA inside the project is not written to", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("npm"));
    assertSilent(await runStop(box, project, { dataDir: project.path(".plugin-data") }));
    assert.equal(fs.existsSync(project.path(".plugin-data")), false);
    assert.ok(fs.existsSync(path.join(box.tmp, FALLBACK_STATE_DIR)));
  });
});

describe("failures block with the command and the end of its output", () => {
  test(`exit 2; the failing command, its directory and the last ${TAIL_LINES} lines`, async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { ...stopFixture("npm"), "src/app.js": BROKEN });
    const result = await runStop(box, project, { env: { STOP_TEST_LINES: "100" } });
    assertBlocked(result);

    const [, block] = result.stderr.split("\n\n");
    const [heading, ...tail] = block.trimEnd().split("\n");
    assert.match(
      heading,
      /^`npm run check:fast` failed in the project directory \(exit code 1\)\. Last 60 of \d+ lines of its output:$/,
    );
    assert.equal(tail.length, TAIL_LINES);
    assert.ok(tail.includes("✖ src/app.js:1 fake/no-lint-error LINT_ERROR marker found"), block);
    assert.ok(tail.includes("output line 100"));
    assert.ok(!tail.includes("output line 1"), "older lines are dropped");
    assert.equal(readGreenFingerprint({ dataDir: box.dataDir, projectRoot: project.root }), null);
  });

  test(
    "a planted npm script shell cannot turn a failing check:fast green",
    { skip: process.platform === "win32" ? "POSIX shells only" : false },
    async (t) => {
      // `true -c "<script>"` exits 0 without running anything; the gate pins npm's own shell.
      const box = sandbox(t);
      const project = makeProject(t, {
        ...stopFixture("npm"),
        "src/app.js": BROKEN,
        ".npmrc": "script-shell=true\n",
      });
      assertBlocked(await runStop(box, project));
      const viaEnv = makeProject(t, { ...stopFixture("npm"), "src/app.js": BROKEN });
      assertBlocked(
        await runStop(box, viaEnv, {
          env: { npm_config_script_shell: "true", NPM_CONFIG_NODE_OPTIONS: "--version" },
        }),
      );
    },
  );

  test("only the exit code counts, never the text a tool prints", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, { ...stopFixture("npm"), "src/app.js": BROKEN });
    const env = { STOP_TEST_MISLEAD: "1" };
    const failed = await runStop(box, project, { env });
    assertBlocked(failed);
    assert.match(failed.stderr, /All checks passed/);

    project.write("src/app.js", CLEAN);
    assertSilent(await runStop(box, project, { env }), "prints FAILED but exits 0");
  });

  test("the home directory in the output is shown as ~", async (t) => {
    const box = sandbox(t);
    const home = path.join(box.dir, "home");
    fs.mkdirSync(home);
    const project = makeProject(t, { ...stopFixture("npm"), "src/app.js": BROKEN });
    const result = await runStop(box, project, {
      env: {
        HOME: home,
        USERPROFILE: home,
        STOP_TEST_PRINT: `config at ${path.join(home, "projects", "app", "config.json")}`,
      },
    });
    assertBlocked(result);
    const expected = ["~", "projects", "app", "config.json"].join(path.sep);
    assert.ok(result.stderr.includes(`config at ${expected}`), result.stderr);
    assert.ok(!result.stderr.includes(home), "the home path itself is gone");
  });

  test("the gate's environment: CI=1, PAO_DISABLE=1, NO_COLOR=1; session variables removed", async (t) => {
    const box = sandbox(t);
    const out = path.join(box.dir, "env.json");
    const project = makeProject(t, stopFixture("npm"));
    assertSilent(
      await runStop(box, project, {
        env: {
          STOP_TEST_ENV_OUT: out,
          STOP_TEST_KEEP: "kept",
          FORCE_COLOR: "3",
          CLAUDECODE: "1",
          AI_AGENT: "claude-code",
          CROSS_STACK_STANDARD_STOP_GATE: "1",
        },
      }),
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(out, "utf8")), {
      CI: "1",
      PAO_DISABLE: "1",
      NO_COLOR: "1",
      FORCE_COLOR: null,
      DO_NOT_TRACK: "1",
      JSCPD_NO_TIPS: "1",
      CLAUDE_PROJECT_DIR: null,
      CLAUDE_PLUGIN_DATA: null,
      CLAUDECODE: null,
      AI_AGENT: null,
      CROSS_STACK_STANDARD_STOP_GATE: null,
      STOP_TEST_KEEP: "kept",
    });
  });
});

describe("budget", () => {
  test("a gate past its budget is stopped with its process tree: exit 0 and a notice", async (t) => {
    const box = sandbox(t);
    // Git discovery is unrelated to process-tree termination and can be slow for an outside-git
    // temp project on some hosts. Keep this budget test independent of that probe.
    box.env = { ...box.env, ...nodeOnlyPath(box) };
    const pidFile = path.join(box.dir, "gate.pid");
    const files = stopFixture("web-mobile-roots");
    files[".cross-stack/standard.json"].hooks = { stop: { budgetSeconds: 5 } };
    const project = makeProject(t, files);
    const result = await runStop(box, project, {
      env: { STOP_TEST_HANG: "1", STOP_TEST_PID_FILE: pidFile },
    });
    assertNotice(
      result,
      /^Cross-Stack Standard: stop gate exceeded its budget; run check:fast manually\. /,
    );
    assert.match(
      result.json.systemMessage,
      /npm run check:fast in apps\/web\/ was stopped when the 5 s budget ran out \(hooks\.stop\.budgetSeconds\)\./,
    );
    assert.match(
      result.json.systemMessage,
      /npm run check:fast in apps\/mobile\/ did not start: the budget had run out\./,
    );
    assert.ok(result.durationMs >= 4_900, `ran ${result.durationMs} ms`);
    assert.ok(
      result.durationMs < 9_500,
      `stopped by the handler, not the watchdog: ${result.durationMs} ms`,
    );
    t.diagnostic(`budget 5 s: the hook ended after ${result.durationMs} ms`);

    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.ok(await processGone(pid, 5_000), `the gate's process ${pid} was stopped`);
    assert.deepEqual(box.runs(), ["npm web"]);
    assert.equal(readGreenFingerprint({ dataDir: box.dataDir, projectRoot: project.root }), null);
  });

  test("with the network blocked, npm itself adds no wait (proxy and registry on a closed port)", async (t) => {
    let port;
    try {
      port = await closedPort();
    } catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES") {
        t.skip("this sandbox does not allow loopback listeners");
        return;
      }
      throw error;
    }
    const box = sandbox(t);
    const proxy = `http://127.0.0.1:${port}`;
    const project = makeProject(t, stopFixture("npm"));
    const result = await runStop(box, project, {
      env: {
        HTTPS_PROXY: proxy,
        HTTP_PROXY: proxy,
        https_proxy: proxy,
        http_proxy: proxy,
        npm_config_registry: `${proxy}/`,
        CROSS_STACK_STANDARD_STOP_BUDGET_SECONDS: "30",
      },
    });
    assertSilent(result);
    assert.equal(box.runs().length, 1);
    assert.ok(result.durationMs < 15_000, `finished in ${result.durationMs} ms`);
    t.diagnostic(`network blocked: green run in ${result.durationMs} ms`);
  });
});

describe("ecosystems and track roots", () => {
  test("npm in each track root from trackRoots; the project directory's script is not run", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("web-mobile-roots"));
    assertSilent(await runStop(box, project));
    assert.deepEqual(box.runs(), ["npm web", "npm mobile"]);

    project.write("apps/mobile/src/index.js", BROKEN);
    const result = await runStop(box, project);
    assertBlocked(result);
    assert.match(
      result.stderr,
      /^`npm run check:fast` failed in apps\/mobile\/ \(exit code 1\)\./m,
    );
    assert.doesNotMatch(result.stderr, /failed in apps\/web\//);
    assert.deepEqual(box.runs(), ["npm web", "npm mobile", "npm web", "npm mobile"]);
  });

  test("a manifest that cannot be parsed still runs the gate in the project directory", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, {
      ...stopFixture("npm"),
      ".cross-stack/standard.json": "{ not json",
      "src/app.js": BROKEN,
    });
    assertBlocked(await runStop(box, project));
  });

  test("without Composer on PATH, its script is skipped with a notice; npm still runs", async (t) => {
    const box = sandbox(t);
    const project = makeProject(t, stopFixture("fullstack"));
    const env = nodeOnlyPath(box);
    const first = await runStop(box, project, { env });
    assertNotice(
      first,
      /^Cross-Stack Standard: composer run-script check:fast in the project directory was skipped: Composer \(composer\.phar, or a composer PHP script\) was not found on PATH\.$/,
    );
    assert.deepEqual(box.runs().length, 1);
    assert.match(box.runs()[0], /^npm /);

    assertSilent(await runStop(box, project, { env }), "recorded; unchanged");
    assert.equal(box.runs().length, 1);

    project.write("src/app.js", BROKEN);
    const blocked = await runStop(box, project, { env });
    assertBlocked(blocked);
    assert.match(
      blocked.stderr,
      /composer run-script check:fast in the project directory was skipped/,
    );
  });

  test(
    "Composer and npm in one directory: both run, Composer first",
    { skip: COMPOSER_UNAVAILABLE },
    async (t) => {
      const box = sandbox(t);
      const project = makeProject(t, stopFixture("fullstack"));
      const name = path.basename(project.root);
      assertSilent(await runStop(box, project));
      assert.deepEqual(box.runs(), [`composer ${name}`, `npm ${name}`]);

      project.write("src/app.js", BROKEN);
      const result = await runStop(box, project);
      assertBlocked(result);
      assert.match(
        result.stderr,
        /^`composer run-script check:fast` failed in the project directory \(exit code 1\)\./m,
      );
      assert.match(
        result.stderr,
        /^`npm run check:fast` failed in the project directory \(exit code 1\)\./m,
      );
      assert.equal(result.stderr.match(/fake\/no-lint-error/g)?.length, 2);
    },
  );

  test(
    "Composer in api/ and npm in web/ from trackRoots",
    { skip: COMPOSER_UNAVAILABLE },
    async (t) => {
      const box = sandbox(t);
      const project = makeProject(t, stopFixture("fullstack-roots"));
      assertSilent(await runStop(box, project));
      assert.deepEqual(box.runs(), ["composer api", "npm web"]);

      project.write("api/src/App.php", "<?php\n\n// LINT_ERROR\n");
      const result = await runStop(box, project);
      assertBlocked(result);
      assert.match(
        result.stderr,
        /^`composer run-script check:fast` failed in api\/ \(exit code 1\)\./m,
      );
      assert.match(result.stderr, /src\/App\.php:1 fake\/no-lint-error/);
      assert.doesNotMatch(result.stderr, /failed in web\//);
    },
  );

  test(
    "a Composer gate past its budget is stopped too",
    { skip: COMPOSER_UNAVAILABLE || GIT_UNAVAILABLE },
    async (t) => {
      const box = sandbox(t);
      const files = stopFixture("composer");
      files["composer.json"].scripts["check:fast"] = ['@php -r "sleep(60);"'];
      files[".cross-stack/standard.json"].hooks = { stop: { budgetSeconds: 5 } };
      const project = makeProject(t, files);
      // Keep Git discovery on the test path from consuming the budget before Composer starts.
      initRepo(box, project.root);
      const result = await runStop(box, project);
      assertNotice(
        result,
        /stop gate exceeded its budget; run check:fast manually\. composer run-script check:fast in the project directory was stopped when the 5 s budget ran out/,
      );
      assert.ok(result.durationMs < 10_500, `ran ${result.durationMs} ms`);
    },
  );
});
