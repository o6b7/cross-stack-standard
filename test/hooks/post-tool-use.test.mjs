/**
 * PostToolUse: the edited file is formatted with the project's own formatter, then linted, and
 * lint problems go back to Claude on stderr with exit 2. Every behaviour runs the real entry
 * point (plugins/cross-stack-standard/scripts/hook.mjs) with a stdin fixture from
 * fixtures/post-tool-use/stdin/ and asserts the exit code, stdout and stderr.
 *
 * The tools are stubs (test/hooks/stubs/): small packages copied into the temporary project's
 * node_modules (ESLint, Prettier) and PHP scripts copied to vendor/bin (Pint, PHPStan). Each stub
 * appends one JSON line per run to HOOK_STUB_LOG, so a test sees which tools ran, with which
 * arguments, from which directory and with which environment. The PHP stubs need php on PATH;
 * without it those tests are skipped and say why. The last group runs the ESLint and Prettier
 * this repository installs, when present, so the stubs cannot drift from the real report format
 * and exit codes.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  copyPlugin,
  importPlugin,
  makeProject,
  projectFixture,
  REPO_ROOT,
  tempDir,
  writeFile,
} from "./helpers/project.mjs";
import { fixtureVars, processGone, runHook, stdinFixture } from "./helpers/run-hook.mjs";

const {
  default: postToolUse,
  editedFile,
  normaliseFilePath,
  SKIPPED_DIRS,
} = await importPlugin("scripts/handlers/post-tool-use.mjs");
const {
  classifyFile,
  configFileNames,
  eslintConfigNames,
  expandBraces,
  firstErrorLine,
  formatProblem,
  interpretFormat,
  interpretLint,
  loadProtectedPaths,
  parseEslintReport,
  parsePhpstanReport,
  pintExcludes,
  prettierIgnoreArgs,
  prettierSignalNames,
  problemReport,
  readPintConfig,
} = await importPlugin("scripts/lib/formatters.mjs");

const STUBS_DIR = path.join(REPO_ROOT, "test", "hooks", "stubs");

/** The environment the stubs record, as the hook sets it for every tool. */
const TOOL_ENV_SEEN = {
  PAO_DISABLE: "1",
  NO_COLOR: "1",
  FORCE_COLOR: null,
  npm_config_update_notifier: "false",
  COREPACK_ENABLE_NETWORK: "0",
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  NEXT_TELEMETRY_DISABLED: "1",
};

const ESLINT_FLAGS = [
  "--max-warnings=0",
  "--no-warn-ignored",
  "--no-error-on-unmatched-pattern",
  "--format",
  "json",
];

const PHP_SKIP = (() => {
  const probe = spawnSync("php", ["-r", "echo 'ok';"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  return probe.stdout === "ok"
    ? false
    : "php is not on PATH; the Pint and PHPStan stubs are PHP scripts";
})();

const REAL_TOOLS_SKIP = ["eslint", "prettier"].every((name) =>
  fs.existsSync(path.join(REPO_ROOT, "node_modules", name, "package.json")),
)
  ? false
  : "this repository's ESLint and Prettier are not installed (run npm ci)";

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** A project from fixtures/post-tool-use/projects/<name>.json, plus `extra` files. */
function postProject(t, name, extra = {}, options = {}) {
  const files = projectFixture(`../post-tool-use/projects/${name}`);
  return makeProject(t, { ...files, ...extra }, options);
}

/** Copies a stub package (eslint, prettier) into `<at>/node_modules/<name>`. */
function installNodeStub(project, name, at = ".") {
  fs.cpSync(path.join(STUBS_DIR, name), project.path(path.posix.join(at, "node_modules", name)), {
    recursive: true,
  });
}

/** Copies a PHP stub (pint, phpstan) to `<at>/vendor/bin/<name>`. */
function installPhpStub(project, name, at = ".") {
  const target = project.path(path.posix.join(at, "vendor", "bin", name));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(STUBS_DIR, "php", `${name}.php`), target);
}

function installWebStubs(project, at = ".") {
  installNodeStub(project, "eslint", at);
  installNodeStub(project, "prettier", at);
}

function installPhpStubs(project, at = ".") {
  installPhpStub(project, "pint", at);
  installPhpStub(project, "phpstan", at);
}

/**
 * Runs PostToolUse for one edited file.
 *
 * @param {import("node:test").TestContext} t
 * @param {import("./helpers/project.mjs").TempProject} project
 * @param {{ file?: string, filePath?: string, fixture?: string, cwd?: string,
 *   env?: Record<string, string | undefined>, spy?: boolean, timeoutMs?: number,
 *   entry?: string }} options
 *   `file` is project-relative; `filePath` is sent exactly as given.
 */
async function runPost(t, project, options) {
  const { file, filePath, fixture = "edit", cwd = project.root, env = {}, spy = false } = options;
  const logDir = tempDir(t, "cross-stack-stub-log-");
  const log = path.join(logDir, "calls.jsonl");
  const vars = { ...fixtureVars(project.root, cwd), filePath: filePath ?? project.path(file) };
  const result = await runHook({
    event: "PostToolUse",
    stdin: stdinFixture(`../post-tool-use/stdin/${fixture}`, vars),
    projectDir: project.root,
    env: { HOOK_STUB_LOG: log, ...env },
    spy,
    spyLog: path.join(logDir, "spy.log"),
    timeoutMs: options.timeoutMs,
    entry: options.entry,
  });
  const calls = fs.existsSync(log)
    ? fs
        .readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  return { ...result, calls };
}

function output(result) {
  return `exit ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
}

function assertSilent(result, label = "") {
  assert.equal(result.exitCode, 0, `${label}\n${output(result)}`);
  assert.equal(result.stdout, "", `${label} stdout`);
  assert.equal(result.stderr, "", `${label} stderr`);
}

function assertNotice(result, pattern) {
  assert.equal(result.exitCode, 0, output(result));
  assert.equal(result.stderr, "", "no stderr on a notice");
  assert.ok(result.json, `stdout is one JSON object: ${JSON.stringify(result.stdout)}`);
  assert.deepEqual(Object.keys(result.json), ["systemMessage"]);
  assert.equal(result.stdout.trim().split("\n").length, 1, "one line of JSON");
  assert.match(result.json.systemMessage, /^Cross-Stack Standard: /);
  assert.match(result.json.systemMessage, pattern);
}

function assertFeedback(result, expectedStderr) {
  assert.equal(result.exitCode, 2, output(result));
  assert.equal(result.stdout, "", "stdout stays empty on exit 2 (tool stdout never leaks)");
  if (typeof expectedStderr === "string") assert.equal(result.stderr, expectedStderr);
  else assert.match(result.stderr, expectedStderr);
}

/**
 * The canonical path the hook uses (it resolves paths with fs.realpathSync.native, which also
 * expands Windows 8.3 short names, such as a runner's temporary directory).
 */
function real(file) {
  return fs.realpathSync.native(file);
}

function tools(result) {
  return result.calls.map((call) => call.tool);
}

// ---------------------------------------------------------------------------------------------
// Which files are checked
// ---------------------------------------------------------------------------------------------

describe("PostToolUse: which files are checked", () => {
  test("a file outside the project directory is skipped and no tool starts", async (t) => {
    const parent = tempDir(t, "cross-stack-parent-");
    const project = postProject(t, "web-app", {}, { parent, name: "project" });
    installWebStubs(project);
    writeFile(path.join(parent, "other", "src", "a.ts"), "// lint-error no-undef boom\n");
    for (const filePath of [path.join(parent, "other", "src", "a.ts"), "../other/src/a.ts"]) {
      const result = await runPost(t, project, { filePath });
      assertSilent(result, filePath);
      assert.deepEqual(result.calls, [], filePath);
    }
  });

  test("files in dependency, VCS, build and tool directories are skipped", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    const files = [
      "node_modules/some-lib/index.js",
      "apps/web/node_modules/some-lib/index.ts",
      "vendor/acme/lib/src/Thing.php",
      ".git/hooks/check.js",
      "dist/app.js",
      "build/app.js",
      ".next/server/page.js",
      ".expo/types/router.d.ts",
      ".turbo/cache/a.json",
      ".cache/a.js",
      "coverage/lcov-report/sorter.js",
    ];
    assert.deepEqual(
      [...SKIPPED_DIRS].sort(),
      [
        ...new Set(
          files.map((file) => file.split("/").find((part) => SKIPPED_DIRS.includes(part))),
        ),
      ].sort(),
      "every skipped directory is exercised",
    );
    for (const file of files) {
      project.write(file, "// lint-error no-undef boom\n");
      const result = await runPost(t, project, { file });
      assertSilent(result, file);
      assert.deepEqual(result.calls, [], file);
    }
  });

  test("non-code files are skipped: text, images, notebooks, Blade templates", async (t) => {
    const web = postProject(t, "web-app");
    installWebStubs(web);
    for (const file of ["README.txt", "public/logo.svg"]) {
      const result = await runPost(t, web, { file });
      assertSilent(result, file);
      assert.deepEqual(result.calls, [], file);
    }
    const notebook = await runPost(t, web, {
      file: "notebooks/report.ipynb",
      fixture: "notebook-edit",
    });
    assertSilent(notebook, "NotebookEdit");
    assert.deepEqual(notebook.calls, []);

    const laravel = postProject(t, "laravel-app");
    installPhpStubs(laravel);
    const blade = await runPost(t, laravel, {
      file: "resources/views/welcome.blade.php",
      env: { CROSS_STACK_STANDARD_POST_TOOL_USE_PHPSTAN: "1" },
    });
    assertSilent(blade, "Blade template");
    assert.deepEqual(blade.calls, []);
  });

  test("a file that does not exist, or a tool input without a path, is skipped", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    const missing = await runPost(t, project, { file: "src/missing.ts" });
    assertSilent(missing, "missing file");
    assert.deepEqual(missing.calls, []);
    const noPath = await runPost(t, project, { fixture: "no-path", filePath: "unused" });
    assertSilent(noPath, "no path");
    assert.deepEqual(noPath.calls, []);
  });

  test("a symbolic link inside the project that points outside it is skipped", async (t) => {
    const outside = makeProject(t, { "secret.ts": "// lint-error no-undef boom\n" });
    const project = postProject(t, "web-app");
    installWebStubs(project);
    try {
      fs.symlinkSync(outside.path("secret.ts"), project.path("src/linked.ts"), "file");
    } catch (error) {
      t.skip(`symbolic links cannot be created here (${error.code})`);
      return;
    }
    const result = await runPost(t, project, { file: "src/linked.ts" });
    assertSilent(result);
    assert.deepEqual(result.calls, []);
  });

  test("nothing installed: silent, and no child process starts", async (t) => {
    const project = postProject(t, "web-app");
    const result = await runPost(t, project, { file: "src/errors.ts", spy: true });
    assertSilent(result);
    assert.ok(
      result.spy.some((line) => line.includes("post-tool-use.mjs")),
      "handler loaded",
    );
    assert.deepEqual(
      result.spy.filter((line) => line.startsWith("child_process.")),
      [],
    );
  });

  test("Prettier pulled in by another package is not used; a legacy .eslintrc is not linted", async (t) => {
    const project = makeProject(t, {
      "package.json": { name: "no-prettier", private: true, dependencies: { "some-lib": "1.0.0" } },
      ".eslintrc.json": "{}\n",
      "src/a.ts": "export const a = 1;   \n// lint-error no-undef boom\n",
    });
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/a.ts" });
    assertSilent(result);
    assert.deepEqual(result.calls, []);
    assert.equal(fs.readFileSync(project.path("src/a.ts"), "utf8").includes("1;   \n"), true);
  });

  test("an opted-out project starts no tool, even with every tool installed", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    const result = await runPost(t, project, {
      file: "src/errors.ts",
      env: { CROSS_STACK_STANDARD_DISABLE: "1" },
    });
    assertSilent(result);
    assert.deepEqual(result.calls, []);
  });
});

// ---------------------------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------------------------

describe("PostToolUse: formatters", () => {
  test("Prettier writes the edited file from the directory that uses it, then ESLint checks it", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    const file = real(project.path("src/app/page.tsx"));
    const result = await runPost(t, project, {
      file: "src/app/page.tsx",
      env: { FORCE_COLOR: "1" },
    });
    assertSilent(result, "clean file after formatting (Prettier's own stdout does not leak)");
    assert.equal(
      fs.readFileSync(file, "utf8"),
      "export default function Page() {\n  return null;\n}\n",
    );
    assert.deepEqual(tools(result), ["prettier", "eslint"]);
    const [prettier, eslint] = result.calls;
    assert.deepEqual(prettier.argv, ["--write", "--ignore-unknown", file]);
    assert.equal(prettier.cwd, real(project.root));
    assert.deepEqual(eslint.argv, [...ESLINT_FLAGS, file]);
    assert.equal(eslint.cwd, real(project.root));
    for (const call of result.calls) assert.deepEqual(call.env, TOOL_ENV_SEEN);
  });

  test("Prettier honours every .prettierignore and .gitignore from the project root down to the directory it runs from", async (t) => {
    // The ignore files sit at the monorepo root; the Prettier signal (.prettierrc) is in
    // apps/web, which is where Prettier runs, and it would read only apps/web's ignore files.
    const project = makeProject(t, {
      ".prettierignore": "apps/web/src/vendor.js\n",
      ".gitignore": "node_modules/\n",
      "apps/web/.prettierrc": "{}\n",
      "apps/web/.gitignore": ".next/\n",
      "apps/web/src/vendor.js": "export const v   =   1   \n",
    });
    installNodeStub(project, "prettier", "apps/web");
    const file = real(project.path("apps/web/src/vendor.js"));
    const result = await runPost(t, project, { file: "apps/web/src/vendor.js", fixture: "write" });
    assertSilent(result);
    assert.deepEqual(tools(result), ["prettier"]);
    const [prettier] = result.calls;
    assert.equal(prettier.cwd, real(project.path("apps/web")));
    assert.deepEqual(prettier.argv, [
      "--write",
      "--ignore-unknown",
      "--ignore-path",
      real(project.path(".gitignore")),
      "--ignore-path",
      real(project.path(".prettierignore")),
      "--ignore-path",
      real(project.path("apps/web/.gitignore")),
      file,
    ]);
  });

  test("json, css, scss, md and yml files get Prettier only", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    for (const file of [
      "styles/site.css",
      "styles/theme.scss",
      "docs/notes.md",
      "config/app.yml",
      "config/app.json",
    ]) {
      const result = await runPost(t, project, { file, fixture: "write" });
      assertSilent(result, file);
      assert.deepEqual(tools(result), ["prettier"], file);
      assert.doesNotMatch(fs.readFileSync(project.path(file), "utf8"), /[ \t]+$/m, file);
    }
  });

  test("a Prettier failure is a notice, and ESLint still runs", async (t) => {
    const project = postProject(t, "web-app", {
      "src/broken.ts": "// STUB:prettier-fail\nexport const a = 1;\n",
    });
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/broken.ts" });
    assertNotice(
      result,
      /Prettier could not format src\/broken\.ts \(exit 2: \[error\] src\/broken\.ts: SyntaxError: Unexpected token \(1:1\)\); the file was left as written\.$/,
    );
    assert.deepEqual(tools(result), ["prettier", "eslint"]);
  });

  test("a Prettier failure next to lint errors: exit 2, the note follows the report", async (t) => {
    const project = postProject(t, "web-app", {
      "src/broken.ts": "// STUB:prettier-fail\n// lint-error no-undef 'x' is not defined.\n",
    });
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/broken.ts" });
    assertFeedback(
      result,
      "ESLint found 1 problem in src/broken.ts (1 error):\n" +
        "src/broken.ts:2:4 no-undef 'x' is not defined.\n" +
        "Note: Prettier could not format src/broken.ts (exit 2: [error] src/broken.ts: " +
        "SyntaxError: Unexpected token (1:1)); the file was left as written.\n",
    );
  });

  test(
    "Pint formats a PHP file as php vendor/bin/pint <file> from the Laravel root, with PAO_DISABLE=1; its output is never read",
    { skip: PHP_SKIP },
    async (t) => {
      const project = postProject(t, "laravel-app");
      installPhpStubs(project);
      const file = real(project.path("app/Models/Invoice.php"));
      const result = await runPost(t, project, { file: "app/Models/Invoice.php" });
      assertSilent(result, 'Pint prints {"result":"fail"} on stdout and exits 0');
      assert.deepEqual(tools(result), ["pint"], "PHPStan is off by default");
      assert.deepEqual(result.calls[0].argv, [file]);
      assert.equal(result.calls[0].cwd, real(project.root));
      assert.deepEqual(result.calls[0].env, TOOL_ENV_SEEN);
      assert.match(fs.readFileSync(file, "utf8"), /public array \$lines = \[\];\n/);

      const monorepo = postProject(t, "monorepo");
      installPhpStub(monorepo, "pint", "api");
      const nested = await runPost(t, monorepo, { file: "api/app/Models/Invoice.php" });
      assertSilent(nested);
      assert.deepEqual(tools(nested), ["pint"]);
      assert.equal(nested.calls[0].cwd, real(monorepo.path("api")));
    },
  );

  test(
    "Pint leaves alone the files pint.json (exclude, notPath, notName) or Pint's own defaults exclude",
    { skip: PHP_SKIP },
    async (t) => {
      const unformatted = "<?php\n\nnamespace App;\n\nfinal class Old { public $a = array();   }\n";
      const project = postProject(t, "laravel-app", {
        "pint.json": {
          preset: "laravel",
          exclude: ["app/Legacy"],
          notPath: ["app/Models/Generated.php"],
          notName: ["*Stub.php"],
        },
        "app/Legacy/Old.php": unformatted,
        "app/Legacy/Deep/Older.php": unformatted,
        "app/Models/Generated.php": unformatted,
        "app/Models/InvoiceStub.php": unformatted,
        "storage/framework/cache.php": unformatted,
        "_ide_helper.php": unformatted,
      });
      installPhpStubs(project);
      for (const file of [
        "app/Legacy/Old.php",
        "app/Legacy/Deep/Older.php",
        "app/Models/Generated.php",
        "app/Models/InvoiceStub.php",
        "storage/framework/cache.php",
        "_ide_helper.php",
      ]) {
        const result = await runPost(t, project, { file });
        assertSilent(result, file);
        assert.deepEqual(result.calls, [], `${file}: Pint did not run`);
        assert.equal(fs.readFileSync(project.path(file), "utf8"), unformatted, file);
      }
      const included = await runPost(t, project, { file: "app/Models/Invoice.php" });
      assertSilent(included);
      assert.deepEqual(tools(included), ["pint"], "a file pint.json does not exclude is formatted");
    },
  );

  test(
    "a Pint failure is a notice judged by its exit code alone",
    { skip: PHP_SKIP },
    async (t) => {
      const project = postProject(t, "laravel-app", {
        "app/Models/Draft.php": "<?php\n\n// STUB:pint-fail\n",
      });
      installPhpStubs(project);
      const result = await runPost(t, project, { file: "app/Models/Draft.php" });
      assertNotice(
        result,
        /Pint could not format app\/Models\/Draft\.php \(exit 1\); the file was left as written\.$/,
      );
    },
  );

  test("php missing from PATH: Pint and PHPStan are skipped silently", async (t) => {
    const project = postProject(t, "laravel-app");
    installPhpStubs(project);
    const emptyBin = tempDir(t, "cross-stack-empty-path-");
    const result = await runPost(t, project, {
      file: "app/Models/Broken.php",
      env: {
        Path: undefined,
        PATH: emptyBin,
        CROSS_STACK_STANDARD_POST_TOOL_USE_PHPSTAN: "1",
      },
    });
    assertSilent(result);
    assert.deepEqual(result.calls, []);
  });
});

// ---------------------------------------------------------------------------------------------
// ESLint
// ---------------------------------------------------------------------------------------------

describe("PostToolUse: ESLint", () => {
  const ERRORS_REPORT =
    "ESLint found 3 problems in src/errors.ts (2 errors, 1 warning):\n" +
    "src/errors.ts:2:4 no-unused-vars 'x' is assigned a value but never used.\n" +
    "src/errors.ts:3:6 no-console Unexpected console statement. (warning)\n" +
    "src/errors.ts:4:4 parse-error Parsing error: Unexpected token\n";

  test("problems: exit 2 with one <path>:<line>:<column> <rule> <message> line each", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    for (const fixture of ["edit", "write"]) {
      const result = await runPost(t, project, { file: "src/errors.ts", fixture });
      assertFeedback(result, ERRORS_REPORT);
    }
  });

  test("runs from the track root, with ESLint hoisted to a workspace root", async (t) => {
    const project = postProject(t, "monorepo");
    installWebStubs(project);
    const file = real(project.path("apps/web/src/app/page.tsx"));
    const result = await runPost(t, project, { file: "apps/web/src/app/page.tsx" });
    assertFeedback(
      result,
      "ESLint found 1 problem in apps/web/src/app/page.tsx (1 error):\n" +
        'apps/web/src/app/page.tsx:4:4 react-hooks/rules-of-hooks React Hook "useState" is called conditionally.\n',
    );
    assert.deepEqual(tools(result), ["prettier", "eslint"]);
    assert.equal(
      result.calls[0].cwd,
      real(project.root),
      "Prettier from the directory with .prettierrc",
    );
    assert.equal(result.calls[1].cwd, real(project.path("apps/web")), "ESLint from the track root");
    assert.deepEqual(result.calls[1].argv, [...ESLINT_FLAGS, file]);
  });

  test("a clean file: exit 0 and no output", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/clean.ts" });
    assertSilent(result);
    assert.deepEqual(tools(result), ["prettier", "eslint"]);
  });

  test("more than 30 problems: 30 lines and a count of the rest", async (t) => {
    const project = postProject(t, "web-app", { "src/many.ts": "// STUB:eslint-many=45\n" });
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/many.ts" });
    assert.equal(result.exitCode, 2, output(result));
    const lines = result.stderr.trimEnd().split("\n");
    assert.equal(lines.length, 32);
    assert.equal(lines[0], "ESLint found 45 problems in src/many.ts (45 errors):");
    assert.equal(lines[1], "src/many.ts:1:1 no-magic-numbers No magic number: 1.");
    assert.equal(lines[30], "src/many.ts:30:1 no-magic-numbers No magic number: 30.");
    assert.equal(lines[31], "(15 more not shown)");
  });

  test("a message that spans lines is kept on one line", async (t) => {
    const project = postProject(t, "web-app", { "src/multi.ts": "// lint-multiline my/rule\n" });
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/multi.ts" });
    assertFeedback(
      result,
      "ESLint found 1 problem in src/multi.ts (1 error):\n" +
        "src/multi.ts:1:4 my/rule First line. Second line.\n",
    );
  });

  test("output printed before the JSON report does not hide the problems", async (t) => {
    const project = postProject(t, "web-app", {
      "src/noisy.ts": "// STUB:eslint-noise\n// lint-error no-undef 'y' is not defined.\n",
    });
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/noisy.ts" });
    assertFeedback(
      result,
      "ESLint found 1 problem in src/noisy.ts (1 error):\nsrc/noisy.ts:2:4 no-undef 'y' is not defined.\n",
    );
  });

  test("an ESLint crash or configuration error (exit 2) is a notice, never feedback", async (t) => {
    const project = postProject(t, "web-app", { "src/crash.ts": "// STUB:eslint-crash\n" });
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/crash.ts" });
    assertNotice(
      result,
      /ESLint could not check src\/crash\.ts \(exit 2: TypeError: Key "rules": Key "no-such-rule": Could not find "no-such-rule" in plugin "@"\.\); lint feedback for this edit was skipped\.$/,
    );
  });

  test("an unreadable report or an unexpected exit code is a notice", async (t) => {
    const cases = [
      ["STUB:eslint-bad-json", /\(exit 1; its JSON report could not be read\)/],
      ["STUB:eslint-exit=1", /\(exit 1; its JSON report could not be read\)/],
      ["STUB:eslint-exit=3", /\(exit 3\); lint feedback for this edit was skipped\./],
    ];
    const project = postProject(t, "web-app");
    installWebStubs(project);
    for (const [marker, pattern] of cases) {
      project.write("src/odd.ts", `// ${marker}\n`);
      const result = await runPost(t, project, { file: "src/odd.ts" });
      assertNotice(result, pattern);
      assert.match(result.json.systemMessage, /ESLint could not check src\/odd\.ts/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// PHPStan
// ---------------------------------------------------------------------------------------------

describe("PostToolUse: PHPStan", { skip: PHP_SKIP }, () => {
  const BROKEN_REPORT =
    "PHPStan found 2 problems in app/Models/Broken.php (2 errors):\n" +
    "app/Models/Broken.php:9 method.notFound Call to an undefined method App\\Models\\Broken::missing().\n" +
    "app/Models/Broken.php:10 return.type Method App\\Models\\Broken::total() should return int but returns string.\n";
  const manifest = (postToolUse) => ({
    ".cross-stack/standard.json": {
      version: "1.0.0",
      tracks: ["laravel"],
      tier: 1,
      hooks: { postToolUse },
    },
  });

  test("off by default: only Pint runs", async (t) => {
    const project = postProject(t, "laravel-app");
    installPhpStubs(project);
    const result = await runPost(t, project, { file: "app/Models/Broken.php" });
    assertSilent(result);
    assert.deepEqual(tools(result), ["pint"]);
  });

  test("hooks.postToolUse.phpstan: errors exit 2 as <path>:<line> <identifier> <message>", async (t) => {
    const project = postProject(t, "laravel-app", manifest({ phpstan: true }));
    installPhpStubs(project);
    const file = real(project.path("app/Models/Broken.php"));
    const result = await runPost(t, project, { file: "app/Models/Broken.php" });
    assertFeedback(result, BROKEN_REPORT);
    assert.deepEqual(tools(result), ["pint", "phpstan"]);
    const phpstan = result.calls[1];
    assert.deepEqual(phpstan.argv, ["analyse", "--error-format=json", "--no-progress", file]);
    assert.equal(phpstan.cwd, real(project.root));
    assert.equal(phpstan.env.PAO_DISABLE, "1");

    const clean = await runPost(t, project, { file: "app/Models/Invoice.php" });
    assertSilent(clean, "a clean PHP file");
    assert.deepEqual(tools(clean), ["pint", "phpstan"]);
  });

  test("CROSS_STACK_STANDARD_POST_TOOL_USE_PHPSTAN overrides the manifest", async (t) => {
    const off = postProject(t, "laravel-app");
    installPhpStubs(off);
    const on = await runPost(t, off, {
      file: "app/Models/Broken.php",
      env: { CROSS_STACK_STANDARD_POST_TOOL_USE_PHPSTAN: "1" },
    });
    assertFeedback(on, BROKEN_REPORT);

    const configured = postProject(t, "laravel-app", manifest({ phpstan: true }));
    installPhpStubs(configured);
    const disabled = await runPost(t, configured, {
      file: "app/Models/Broken.php",
      env: { CROSS_STACK_STANDARD_POST_TOOL_USE_PHPSTAN: "0" },
    });
    assertSilent(disabled);
    assert.deepEqual(tools(disabled), ["pint"]);
  });

  test("a PHPStan crash, or errors that belong to no file, are notices", async (t) => {
    const project = postProject(t, "laravel-app", manifest({ phpstan: true }));
    installPhpStubs(project);
    project.write("app/Models/Crash.php", "<?php\n\n// STUB:phpstan-crash\n");
    assertNotice(
      await runPost(t, project, { file: "app/Models/Crash.php" }),
      /PHPStan could not check app\/Models\/Crash\.php \(exit 255: PHP Fatal error: Allowed memory size of 134217728 bytes exhausted/,
    );
    project.write("app/Models/General.php", "<?php\n\n// STUB:phpstan-general\n");
    assertNotice(
      await runPost(t, project, { file: "app/Models/General.php" }),
      /PHPStan could not check app\/Models\/General\.php \(exit 1: Ignored error pattern #\^Access to an undefined property# was not matched in reported errors\.\); lint feedback for this edit was skipped\.$/,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Time budget
// ---------------------------------------------------------------------------------------------

describe("PostToolUse: time budget", () => {
  test("a linter past the budget is stopped with its process tree; exit 0 with a notice", async (t) => {
    const project = postProject(t, "web-app", { "src/slow.ts": "// STUB:eslint-hang-tree\n" });
    installWebStubs(project);
    const result = await runPost(t, project, {
      file: "src/slow.ts",
      env: { CROSS_STACK_STANDARD_POST_TOOL_USE_BUDGET_SECONDS: "1" },
    });
    assertNotice(
      result,
      /the checks of src\/slow\.ts ran past the PostToolUse budget of 1 s while ESLint was running and were stopped, so this edit got no lint feedback\. hooks\.postToolUse\.budgetSeconds in \.cross-stack\/standard\.json sets the budget\.$/,
    );
    assert.ok(result.durationMs < 8_000, `finished in ${result.durationMs} ms`);
    assert.deepEqual(tools(result), ["prettier", "eslint"]);
    const { pid, childPid } = result.calls[1];
    assert.ok(Number.isInteger(childPid), "the stub started a child process");
    assert.equal(await processGone(pid, 5_000), true, "the linter was stopped");
    assert.equal(await processGone(childPid, 5_000), true, "its child process was stopped");
  });

  test("a formatter past the budget (set in the manifest) stops the run before the linter", async (t) => {
    const project = postProject(t, "web-app", {
      "src/slow.ts": "// STUB:prettier-hang\n",
      ".cross-stack/standard.json": {
        version: "1.0.0",
        tracks: ["web"],
        hooks: { postToolUse: { budgetSeconds: 1 } },
      },
    });
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/slow.ts" });
    assertNotice(result, /budget of 1 s while Prettier was running/);
    assert.deepEqual(tools(result), ["prettier"], "ESLint never starts");
    assert.equal(await processGone(result.calls[0].pid, 5_000), true);
  });

  test("Pint past the budget is stopped too", { skip: PHP_SKIP }, async (t) => {
    const project = postProject(t, "laravel-app", {
      "app/Models/Slow.php": "<?php\n\n// STUB:pint-hang\n",
    });
    installPhpStubs(project);
    const result = await runPost(t, project, {
      file: "app/Models/Slow.php",
      env: { CROSS_STACK_STANDARD_POST_TOOL_USE_BUDGET_SECONDS: "1" },
    });
    assertNotice(result, /budget of 1 s while Pint was running/);
    assert.equal(await processGone(result.calls[0].pid, 5_000), true);
  });
});

// ---------------------------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------------------------

describe("PostToolUse: installed plugin", () => {
  test("a copy of the plugin folder alone finds its data and reports the same problems", async (t) => {
    const plugin = copyPlugin(t);
    const project = postProject(t, "web-app");
    installWebStubs(project);
    const result = await runPost(t, project, { file: "src/errors.ts", entry: plugin.entry });
    assert.equal(result.exitCode, 2, output(result));
    assert.match(result.stderr, /^ESLint found 3 problems in src\/errors\.ts /);
    fs.rmSync(path.join(plugin.root, "data", "protected-paths.json"));
    assertNotice(
      await runPost(t, project, { file: "src/errors.ts", entry: plugin.entry }),
      /the PostToolUse hook failed \(ENOENT: .*protected-paths\.json.*\) and was skipped/,
    );
  });
});

describe("PostToolUse: paths", () => {
  test("normaliseFilePath: Windows separators, drive letters and relative paths", () => {
    const win = { platform: "win32" };
    assert.equal(
      normaliseFilePath("C:\\work\\app\\src\\a.ts", "C:\\work\\app", win),
      "C:\\work\\app\\src\\a.ts",
    );
    assert.equal(
      normaliseFilePath("C:/work/app/src/a.ts", "C:\\work\\app", win),
      "C:\\work\\app\\src\\a.ts",
    );
    assert.equal(normaliseFilePath("src\\a.ts", "C:\\work\\app", win), "C:\\work\\app\\src\\a.ts");
    assert.equal(normaliseFilePath("src/a.ts", "C:\\work\\app", win), "C:\\work\\app\\src\\a.ts");

    const posix = (exists) => ({ platform: "linux", exists: () => exists });
    assert.equal(
      normaliseFilePath("src\\app\\page.tsx", "/work/app", posix(false)),
      "/work/app/src/app/page.tsx",
    );
    assert.equal(
      normaliseFilePath("src\\odd name.ts", "/work/app", posix(true)),
      "/work/app/src\\odd name.ts",
      "a file name that really contains a backslash is kept",
    );
    assert.equal(
      normaliseFilePath("/work/app/src/a.ts", "/elsewhere", posix(false)),
      "/work/app/src/a.ts",
    );
    assert.equal(
      normaliseFilePath("../app/src/a.ts", "/work/other", posix(false)),
      "/work/app/src/a.ts",
    );
  });

  test("a path with backslash separators reaches the tools as a normal path", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    const result = await runPost(t, project, { filePath: "src\\errors.ts" });
    assert.equal(result.exitCode, 2, output(result));
    assert.match(result.stderr, /^ESLint found 3 problems in src\/errors\.ts /);
    assert.equal(result.calls[1].argv.at(-1), real(project.path("src/errors.ts")));
  });

  test("editedFile explains each skip (shown with CROSS_STACK_STANDARD_DEBUG=1)", async (t) => {
    const project = postProject(t, "web-app");
    const ctx = (toolInput) => ({
      input: { tool_input: toolInput },
      cwd: project.root,
      projectDir: project.root,
    });
    assert.deepEqual(editedFile(ctx({})), { skip: "the tool input names no file" });
    assert.deepEqual(editedFile(ctx({ file_path: "/elsewhere/a.ts" })), {
      skip: "outside the project directory",
    });
    assert.deepEqual(editedFile(ctx({ file_path: "dist/a.js" })), { skip: "inside dist/" });
    assert.deepEqual(editedFile(ctx({ file_path: "README.txt" })), {
      skip: "not a file the hook formats or lints",
    });
    assert.deepEqual(editedFile(ctx({ file_path: "src/none.ts" })), {
      skip: "not an existing file",
    });
    assert.deepEqual(editedFile(ctx({ file_path: "src/clean.ts" })).file, {
      file: real(project.path("src/clean.ts")),
      target: "src/clean.ts",
      projectDir: real(project.root),
      kinds: { prettier: true, eslint: true, php: false },
    });

    const debug = await runPost(t, project, {
      file: "README.txt",
      env: { CROSS_STACK_STANDARD_DEBUG: "1" },
    });
    assert.equal(debug.exitCode, 0);
    assert.equal(debug.stdout, "");
    assert.match(
      debug.stderr,
      /PostToolUse: nothing to check \(not a file the hook formats or lints\)/,
    );
  });

  test("the handler also works without a started budget", async (t) => {
    const project = postProject(t, "web-app");
    installWebStubs(project);
    const lines = [];
    const result = await postToolUse({
      input: { tool_input: { file_path: project.path("src/errors.ts") } },
      env: {},
      cwd: project.root,
      projectDir: project.root,
      config: { postToolUse: { phpstan: false, budgetSeconds: 5 } },
      budget: null,
      log: { debug: (line) => lines.push(line) },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /^ESLint found 3 problems in src\/errors\.ts /);
    assert.deepEqual(
      lines.map((line) => line.split(" in ")[0]),
      ["PostToolUse: Prettier", "PostToolUse: ESLint"],
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The real ESLint and Prettier
// ---------------------------------------------------------------------------------------------

describe(
  "PostToolUse: this repository's ESLint 9 and Prettier 3",
  { skip: REAL_TOOLS_SKIP },
  () => {
    function realProject(t, config) {
      const project = makeProject(t, {
        "package.json": {
          name: "real-tools",
          private: true,
          devDependencies: { eslint: "9.39.5", prettier: "3.9.9" },
        },
        "eslint.config.mjs":
          config ??
          'export default [\n  { ignores: ["ignored/**"] },\n  { files: ["**/*.js", "**/*.mjs"], rules: { "no-unused-vars": "error" } },\n];\n',
        "src/[slug]/page.mjs": "const unused = 1;\nexport const answer   =   42\n",
        "src/clean.mjs": "export const answer = 42;\n",
        "ignored/a.mjs": "const unused = 1;\n",
        "config/bad.json": '{"a":\n',
      });
      for (const name of ["eslint", "prettier"]) {
        fs.mkdirSync(project.path("node_modules"), { recursive: true });
        fs.symlinkSync(
          path.join(REPO_ROOT, "node_modules", name),
          project.path(`node_modules/${name}`),
          "junction",
        );
      }
      return project;
    }

    test("a dynamic-segment path is formatted, then no-unused-vars is reported at its position", async (t) => {
      const project = realProject(t);
      const result = await runPost(t, project, { file: "src/[slug]/page.mjs" });
      assertFeedback(
        result,
        "ESLint found 1 problem in src/[slug]/page.mjs (1 error):\n" +
          "src/[slug]/page.mjs:1:7 no-unused-vars 'unused' is assigned a value but never used.\n",
      );
      assert.equal(
        fs.readFileSync(project.path("src/[slug]/page.mjs"), "utf8"),
        "const unused = 1;\nexport const answer = 42;\n",
      );
    });

    test("a clean file and a file ESLint ignores are silent", async (t) => {
      const project = realProject(t);
      assertSilent(await runPost(t, project, { file: "src/clean.mjs" }), "clean");
      assertSilent(await runPost(t, project, { file: "ignored/a.mjs" }), "ignored");
    });

    test("a configuration error and a JSON syntax error are notices", async (t) => {
      const project = realProject(t, 'export default [{ rules: { "no-such-rule": "error" } }];\n');
      assertNotice(
        await runPost(t, project, { file: "src/clean.mjs" }),
        /ESLint could not check src\/clean\.mjs \(exit 2: TypeError: Key "rules": Key "no-such-rule": Could not find "no-such-rule"/,
      );
      assertNotice(
        await runPost(t, project, { file: "config/bad.json" }),
        /Prettier could not format config\/bad\.json \(exit 2: \[error\] config\/bad\.json: SyntaxError: Unexpected token/,
      );
    });

    test("a file the monorepo root's .prettierignore lists stays as written when Prettier runs from a package", async (t) => {
      const project = makeProject(t, {
        "package.json": {
          name: "real-mono",
          private: true,
          devDependencies: { prettier: "3.9.9" },
        },
        ".prettierignore": "apps/web/src/vendor.mjs\n",
        "apps/web/.prettierrc": "{}\n",
        "apps/web/src/vendor.mjs": "export const v   =   1\n",
        "apps/web/src/own.mjs": "export const o   =   1\n",
      });
      fs.mkdirSync(project.path("node_modules"), { recursive: true });
      fs.symlinkSync(
        path.join(REPO_ROOT, "node_modules", "prettier"),
        project.path("node_modules/prettier"),
        "junction",
      );
      const read = (file) => fs.readFileSync(project.path(file), "utf8");
      assertSilent(
        await runPost(t, project, { file: "apps/web/src/vendor.mjs", fixture: "write" }),
      );
      assert.equal(read("apps/web/src/vendor.mjs"), "export const v   =   1\n", "ignored");
      assertSilent(await runPost(t, project, { file: "apps/web/src/own.mjs", fixture: "write" }));
      assert.equal(read("apps/web/src/own.mjs"), "export const o = 1;\n", "formatted");
    });
  },
);

// ---------------------------------------------------------------------------------------------
// Library: lib/formatters.mjs
// ---------------------------------------------------------------------------------------------

describe("formatters library", () => {
  test("config file names come from the plugin's protection list", () => {
    assert.deepEqual(eslintConfigNames(), [
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      "eslint.config.ts",
      "eslint.config.mts",
      "eslint.config.cts",
    ]);
    const prettier = prettierSignalNames();
    for (const name of [
      ".prettierrc",
      ".prettierrc.json",
      "prettier.config.mjs",
      ".prettierignore",
    ]) {
      assert.ok(prettier.includes(name), name);
    }
    assert.ok(!prettier.some((name) => name.includes("*") || name.includes("/")));
    assert.ok(Array.isArray(loadProtectedPaths().paths));
    const list = {
      paths: [{ id: "x", globs: ["**/a.{js,ts}", "**/b", "c", "**/d/e", "**/*.f", "**/a.js"] }],
    };
    assert.deepEqual(configFileNames(list, "x"), ["a.js", "a.ts", "b"]);
    assert.deepEqual(configFileNames(list, "missing"), []);
    assert.deepEqual(configFileNames(null, "x"), []);
  });

  test("expandBraces", () => {
    assert.deepEqual(expandBraces("a.{b,c}.{d,e}"), ["a.b.d", "a.b.e", "a.c.d", "a.c.e"]);
    assert.deepEqual(expandBraces("plain"), ["plain"]);
  });

  test("classifyFile", () => {
    const none = null;
    const web = { prettier: true, eslint: true, php: false };
    const data = { prettier: true, eslint: false, php: false };
    const php = { prettier: false, eslint: false, php: true };
    const expected = {
      "a.ts": web,
      "a.tsx": web,
      "a.mts": web,
      "a.cjs": web,
      "A.JSX": web,
      "a.json": data,
      "a.yaml": data,
      "a.scss": data,
      "a.md": data,
      "a.php": php,
      "a.blade.php": none,
      "a.txt": none,
      "a.ipynb": none,
      Makefile: none,
    };
    for (const [file, kinds] of Object.entries(expected)) {
      assert.deepEqual(classifyFile(file), kinds, file);
    }
  });

  test("parseEslintReport", () => {
    const report = JSON.stringify([
      {
        filePath: "/p/a.ts",
        messages: [
          { ruleId: "r", severity: 2, message: "m", line: 3, column: 5 },
          {
            ruleId: null,
            severity: 1,
            message: "Unused eslint-disable directive.",
            line: 1,
            column: 1,
          },
          {
            ruleId: null,
            fatal: true,
            severity: 2,
            message: "Parsing error: x",
            line: 2,
            column: 1,
          },
          "not an object",
          { severity: 2 },
        ],
      },
    ]);
    const parsed = parseEslintReport(`${report}\n`);
    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.problems.map((p) => [p.line, p.column, p.ruleId, p.message, p.severity]),
      [
        [3, 5, "r", "m", "error"],
        [1, 1, "eslint", "Unused eslint-disable directive.", "warning"],
        [2, 1, "parse-error", "Parsing error: x", "error"],
        [0, 0, "eslint", "(no message)", "error"],
      ],
    );
    assert.deepEqual(parseEslintReport("[]"), { ok: true, problems: [] });
    assert.equal(parseEslintReport(`warning from a plugin\n${report}\n`).problems.length, 4);
    assert.deepEqual(parseEslintReport("nope"), {
      ok: false,
      reason: "its JSON report could not be read",
    });
    assert.deepEqual(parseEslintReport("{}"), {
      ok: false,
      reason: "its JSON report could not be read",
    });
    assert.deepEqual(parseEslintReport('[{"filePath":"/a"}]'), {
      ok: false,
      reason: "its JSON report has an unexpected shape",
    });
  });

  test("parsePhpstanReport: empty map as [], a trait's context, errors outside files", () => {
    assert.deepEqual(
      parsePhpstanReport('{"totals":{"errors":0,"file_errors":0},"files":[],"errors":[]}'),
      {
        ok: true,
        problems: [],
        generalErrors: [],
      },
    );
    const parsed = parsePhpstanReport(
      "PHP Deprecated: something\n" +
        JSON.stringify({
          totals: { errors: 1, file_errors: 2 },
          files: {
            "/p/app/A.php": {
              errors: 1,
              messages: [{ message: "m1", line: 4, identifier: "x.y" }],
            },
            "/p/app/T.php (in context of class App\\A)": {
              errors: 1,
              messages: [{ message: "m2", line: null }],
            },
          },
          errors: ["general", 3],
        }),
    );
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.generalErrors, ["general"]);
    assert.deepEqual(
      parsed.problems.map((p) => [p.file, p.line, p.ruleId, p.message]),
      [
        ["/p/app/A.php", 4, "x.y", "m1"],
        ["/p/app/T.php", 0, "phpstan", "m2 (in context of class App\\A)"],
      ],
    );
    assert.equal(parsePhpstanReport('{"files":"x"}').ok, false);
    assert.equal(parsePhpstanReport("[]").ok, false);
    assert.equal(parsePhpstanReport("").ok, false);
  });

  test("problemReport and formatProblem", () => {
    const problem = (line, severity = "error") => ({
      file: path.join("/p", "src", "a.ts"),
      line,
      column: line,
      ruleId: "r",
      message: `message\n  ${line}`,
      severity,
    });
    const projectDir = path.join("/p");
    assert.equal(
      problemReport({
        tool: "ESLint",
        target: "src/a.ts",
        problems: [problem(1), problem(2, "warning"), problem(3), problem(4), problem(5)],
        projectDir,
        maxLines: 2,
      }),
      "ESLint found 5 problems in src/a.ts (4 errors, 1 warning):\n" +
        "src/a.ts:1:1 r message 1\n" +
        "src/a.ts:2:2 r message 2 (warning)\n" +
        "(3 more not shown)\n",
    );
    assert.equal(formatProblem({ ...problem(0), column: 0 }, projectDir), "src/a.ts r message 0");
    assert.equal(formatProblem({ ...problem(7), column: 0 }, projectDir), "src/a.ts:7 r message 7");
    assert.equal(
      formatProblem({ ...problem(1), file: path.join("/elsewhere", "b.ts") }, projectDir),
      `${path.join("/elsewhere", "b.ts").replace(/\\/g, "/")}:1:1 r message 1`,
    );
    const long = formatProblem({ ...problem(1), message: "x".repeat(1_000) }, projectDir);
    assert.ok(long.length < 300 && long.endsWith("…"), long);
  });

  test("firstErrorLine", () => {
    assert.equal(
      firstErrorLine(
        "\nOops! Something went wrong! :(\n\nESLint: 9.39.5\n\nError: boom\n    at x (y:1:1)\n",
      ),
      "Error: boom",
    );
    assert.equal(
      firstErrorLine("Note: Using configuration file /p/phpstan.neon.\nfirst\n"),
      "first",
    );
    assert.equal(
      firstErrorLine("\u001b[31m[error] a.json: SyntaxError\u001b[39m"),
      "[error] a.json: SyntaxError",
    );
    assert.equal(
      firstErrorLine(
        '\nOops! Something went wrong! :(\n\nESLint: 9.39.5\n\nNo files matching the pattern "a.ts" were found.\n',
      ),
      'No files matching the pattern "a.ts" were found.',
      "without an error line, the crash banner and version line are still skipped",
    );
    assert.equal(firstErrorLine("  \n\n"), "");
    assert.equal(firstErrorLine(""), "");
  });

  test("interpretLint and interpretFormat", () => {
    const eslint = { name: "ESLint" };
    const base = {
      error: null,
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
    };
    assert.deepEqual(interpretLint(eslint, base, "a.ts"), { problems: [], failure: null });
    assert.deepEqual(
      interpretLint(eslint, { ...base, error: { code: "ENOENT", message: "" } }, "a.ts"),
      { problems: [], failure: null },
      "not installed: silent",
    );
    assert.deepEqual(
      interpretLint(eslint, { ...base, error: { code: "EACCES", message: "" } }, "a.ts"),
      { problems: [], failure: "ESLint could not be started (EACCES)." },
    );
    assert.match(
      interpretLint(eslint, { ...base, exitCode: 1, stdout: "[]" }, "a.ts").failure,
      /\(exit 1 with no problems listed\)/,
    );
    assert.match(
      interpretLint(eslint, { ...base, exitCode: null, signal: "SIGKILL" }, "a.ts").failure,
      /\(stopped by SIGKILL\)/,
    );
    assert.match(
      interpretLint(
        { name: "PHPStan" },
        { ...base, exitCode: 1, stdout: '{"files":[],"errors":[]}' },
        "a.php",
      ).failure,
      /\(exit 1 with no errors listed\)/,
    );
    const pint = { name: "Pint" };
    assert.equal(
      interpretFormat(pint, { ...base, exitCode: 1, stderr: "[error] ignored\n" }, "a.php"),
      "Pint could not format a.php (exit 1); the file was left as written.",
      "Pint is judged by its exit code only",
    );
    assert.equal(interpretFormat(pint, base, "a.php"), null);
    assert.equal(
      interpretFormat({ name: "Prettier" }, { ...base, error: { code: "ENOENT" } }, "a.ts"),
      null,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Library: which files the project's formatter config leaves alone
// ---------------------------------------------------------------------------------------------

describe("formatter ignore configuration", () => {
  test("prettierIgnoreArgs: every existing ignore file from the project root down to Prettier's", (t) => {
    const project = makeProject(t, {
      ".gitignore": "dist/\n",
      "apps/.prettierignore": "legacy/\n",
      "apps/web/.prettierignore": "*.gen.ts\n",
      "apps/web/src/.gitignore": "below the Prettier root: not read\n",
    });
    const root = project.path("apps/web");
    assert.deepEqual(prettierIgnoreArgs(root, project.root), [
      "--ignore-path",
      project.path(".gitignore"),
      "--ignore-path",
      project.path("apps/.prettierignore"),
      "--ignore-path",
      project.path("apps/web/.prettierignore"),
    ]);
    assert.deepEqual(prettierIgnoreArgs(project.path("apps"), project.path("apps")), [
      "--ignore-path",
      project.path("apps/.prettierignore"),
    ]);
    assert.deepEqual(prettierIgnoreArgs(tempDir(t), project.root), [], "nothing to read");
  });

  /** Whether Pint leaves `rel` (relative to a Pint root) alone under `config`. */
  function excluded(rel, config = {}) {
    const root = path.resolve("/pint-root");
    return pintExcludes(path.join(root, ...rel.split("/")), root, config);
  }

  test("pintExcludes: Pint's own defaults, dot files and version-control directories", () => {
    for (const rel of [
      "storage/framework/views/abc.php",
      "bootstrap/cache/services.php",
      "node_modules/x/y.php",
      "build/a.php",
      "_ide_helper.php",
      "_ide_helper_models.php",
      "app/_ide_helper_actions.php",
      ".phpstorm.meta.php",
      ".cross-stack/gates/x.php",
      "app/.hidden/a.php",
      "app/CVS/a.php",
    ]) {
      assert.equal(excluded(rel), true, rel);
    }
    for (const rel of ["app/Models/Invoice.php", "routes/api.php", "app/Storage/Disk.php"]) {
      assert.equal(excluded(rel), false, rel);
    }
  });

  test("pintExcludes: exclude names directories (a bare name at any depth, a path at a boundary)", () => {
    const config = { exclude: ["app/Legacy", "Generated/", "app/Old.php"] };
    for (const rel of [
      "app/Legacy/Old.php",
      "app/Legacy/Deep/Older.php",
      "modules/app/Legacy/Old.php",
      "app/Generated/Models/X.php",
      "Generated/X.php",
      "app/Old.php",
    ]) {
      assert.equal(excluded(rel, config), true, rel);
    }
    for (const rel of ["app/LegacyNot/Old.php", "app/Models/Generated.php", "legacy/app/Old.php"]) {
      assert.equal(excluded(rel, config), false, rel);
    }
  });

  test("pintExcludes: notName globs on the file name; notPath substrings, globs and regexes on the path", () => {
    const config = {
      notName: ["*Stub.php", "Seed?.php", "/^Tmp/i"],
      notPath: ["Models/Generated.php", "database/*/Old*.php", "#^tests/Fixtures/#"],
    };
    for (const rel of [
      "app/Models/InvoiceStub.php",
      "database/seeders/Seed1.php",
      "app/tmpFile.php",
      "app/Models/Generated.php",
      "src/Models/Generated.php",
      "database/seeders/OldSeeder.php",
      "tests/Fixtures/Broken.php",
    ]) {
      assert.equal(excluded(rel, config), true, rel);
    }
    for (const rel of [
      "app/Models/Invoice.php",
      "database/seeders/Seed10.php",
      "app/Models/GeneratedAt.phpx",
      "unit/tests/Fixtures/Broken.php",
    ]) {
      assert.equal(excluded(rel, config), false, rel);
    }
  });

  test("pintExcludes: with `in`, files outside those directories are skipped and paths are relative to them", () => {
    const config = { in: ["app", "./database/"], notPath: ["#^Models/Legacy/#"] };
    assert.equal(excluded("app/Models/Invoice.php", config), false);
    assert.equal(excluded("database/seeders/X.php", config), false);
    assert.equal(excluded("routes/api.php", config), true, "outside every `in` directory");
    assert.equal(excluded("app/Models/Legacy/Old.php", config), true, "notPath relative to app/");
    assert.equal(
      excluded("app/Http/Kernel.php", { in: "app" }),
      false,
      "a string is one directory",
    );
  });

  test("pintExcludes: a pattern the hook cannot read leaves the file alone", () => {
    assert.equal(excluded("app/A.php", { notPath: ["/app/x"] }), true, "x modifier");
    assert.equal(excluded("app/A.php", { notName: ["#(unclosed#"] }), true, "invalid regex");
    assert.equal(excluded("app/A.php", { exclude: [42, null], notName: "" }), false, "non-strings");
  });

  test("readPintConfig: pint.json, one level of `extend` merged the way Pint merges it", (t) => {
    const project = makeProject(t, {
      "pint.json": { extend: "config/base.json", notName: ["*Local.php"] },
      "config/base.json": { exclude: ["app/Legacy"], notName: ["*Base.php", "*Other.php"] },
    });
    const config = readPintConfig(project.root);
    // PHP's array_replace_recursive replaces list items by index.
    assert.deepEqual(config.notName, ["*Local.php", "*Other.php"]);
    assert.deepEqual(config.exclude, ["app/Legacy"]);
    assert.deepEqual(readPintConfig(tempDir(t)), {}, "no pint.json");
    const broken = makeProject(t, { "pint.json": "{ not json" });
    assert.deepEqual(readPintConfig(broken.root), {}, "Pint reports its own error");
  });
});
