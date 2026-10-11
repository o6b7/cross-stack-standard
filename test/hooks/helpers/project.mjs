/**
 * Temporary projects and plugin copies for the hook tests. Everything lives under the system
 * temporary directory and is removed after the test that created it.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Repository root. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Test-only variable: the plugin directory the suite tests instead of the repository's. The
 * isolated-plugin smoke copies `plugins/cross-stack-standard/`, and nothing else, outside the
 * repository and points this variable at the copy, so every module import and every hook run
 * uses the copy. The hook never reads it: runHook() removes every `CROSS_STACK_STANDARD_*`
 * variable from the hook's environment.
 */
export const PLUGIN_ROOT_ENV = "CROSS_STACK_STANDARD_PLUGIN_ROOT";

function pluginDir() {
  const override = process.env[PLUGIN_ROOT_ENV];
  if (override === undefined || override === "") {
    return path.join(REPO_ROOT, "plugins", "cross-stack-standard");
  }
  const dir = path.resolve(override);
  if (!fs.existsSync(path.join(dir, "scripts", "hook.mjs"))) {
    throw new Error(
      `${PLUGIN_ROOT_ENV}=${override} is not a plugin directory (no scripts/hook.mjs)`,
    );
  }
  // Canonical, like the path Node gives the entry point it runs (macOS /var is /private/var).
  return fs.realpathSync(dir);
}

/** The plugin directory under test: the repository's, or the copy named by PLUGIN_ROOT_ENV. */
export const PLUGIN_DIR = pluginDir();

/** True when the suite tests a copy of the plugin instead of the repository's directory. */
export const TESTING_PLUGIN_COPY =
  PLUGIN_DIR !== path.join(REPO_ROOT, "plugins", "cross-stack-standard");

/**
 * Imports a module of the plugin under test, for example `scripts/lib/opt-out.mjs`.
 *
 * @param {string} relative Plugin-relative path with `/` separators.
 * @returns {Promise<Record<string, any>>}
 */
export function importPlugin(relative) {
  return import(pathToFileURL(path.join(PLUGIN_DIR, ...relative.split("/"))).href);
}

/** Hook fixtures (stdin inputs and project trees). */
export const FIXTURES_DIR = path.join(REPO_ROOT, "test", "hooks", "fixtures");

function remove(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Creates a temporary directory (its canonical path) that is removed after the test.
 *
 * @param {import("node:test").TestContext} t
 * @param {string} [prefix]
 * @returns {string}
 */
export function tempDir(t, prefix = "cross-stack-hooks-") {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => remove(dir));
  return dir;
}

/**
 * Writes a file, creating its directories. Objects are written as JSON.
 *
 * @param {string} file
 * @param {string | Buffer | object} content
 */
export function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data =
    typeof content === "string" || Buffer.isBuffer(content)
      ? content
      : `${JSON.stringify(content, null, 2)}\n`;
  fs.writeFileSync(file, data);
}

/**
 * @typedef {object} TempProject
 * @property {string} root
 * @property {(relative: string) => string} path Absolute path of a project-relative path.
 * @property {(relative: string, content: string | Buffer | object) => string} write
 * @property {(relative: string) => string} mkdir
 */

/**
 * A temporary project holding `files` (project-relative path → content; objects become JSON).
 *
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string | Buffer | object>} [files]
 * @param {{ parent?: string, name?: string }} [options] `parent` places the project inside an
 *   existing directory (for tests that need something above the project directory).
 * @returns {TempProject}
 */
export function makeProject(t, files = {}, options = {}) {
  let root;
  if (options.parent) {
    root = path.join(options.parent, options.name ?? "project");
    fs.mkdirSync(root, { recursive: true });
  } else {
    root = tempDir(t, "cross-stack-project-");
    if (options.name) {
      root = path.join(root, options.name);
      fs.mkdirSync(root, { recursive: true });
    }
  }
  const project = {
    root,
    path: (relative) => path.join(root, ...relative.split("/")),
    write(relative, content) {
      const file = project.path(relative);
      writeFile(file, content);
      return file;
    },
    mkdir(relative) {
      const dir = project.path(relative);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    },
  };
  for (const [relative, content] of Object.entries(files)) project.write(relative, content);
  return project;
}

/**
 * The files of a project-tree fixture (`fixtures/projects/<name>.json`, `{ "files": {…} }`).
 *
 * @param {string} name
 * @returns {Record<string, string | object>}
 */
export function projectFixture(name) {
  const file = path.join(FIXTURES_DIR, "projects", `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")).files;
}

/**
 * @typedef {object} PluginCopy
 * @property {string} root The copied plugin directory.
 * @property {string} entry Its scripts/hook.mjs.
 * @property {(event: string, source: string) => void} replaceHandler Replaces an event's
 *   handler module with `source`.
 */

const HANDLER_FILES = {
  SessionStart: "session-start.mjs",
  PostToolUse: "post-tool-use.mjs",
  Stop: "stop.mjs",
  PreToolUse: "pre-tool-use.mjs",
};

/**
 * Copies the plugin directory, and nothing else, to a temporary directory: the same isolation
 * an installed plugin has (files outside the plugin folder do not exist there).
 *
 * @param {import("node:test").TestContext} t
 * @returns {PluginCopy}
 */
export function copyPlugin(t) {
  const root = path.join(tempDir(t, "cross-stack-plugin-copy-"), "cross-stack-standard");
  fs.cpSync(PLUGIN_DIR, root, { recursive: true });
  return {
    root,
    entry: path.join(root, "scripts", "hook.mjs"),
    replaceHandler(event, source) {
      writeFile(path.join(root, "scripts", "handlers", HANDLER_FILES[event]), source);
    },
  };
}
