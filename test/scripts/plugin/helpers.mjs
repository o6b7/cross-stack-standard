/**
 * Shared helpers for the plugin tests (manifests, schemas, build-plugin-data, cross-stack.mjs).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The kit's project tool, as it lives in the templates. */
export const BIN_TEMPLATE = path.join(
  REPO_ROOT,
  "plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs",
);

/** The build script. */
export const BUILD_SCRIPT = path.join(REPO_ROOT, "scripts/build-plugin-data.mjs");

/** The version in VERSION. */
export const VERSION = fs.readFileSync(path.join(REPO_ROOT, "VERSION"), "utf8").trim();

/**
 * Creates a temporary directory that is removed after the test.
 *
 * @param {import("node:test").TestContext} t
 * @param {string} [prefix]
 * @returns {string}
 */
export function tempDir(t, prefix = "cross-stack-plugin-") {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Writes a file, creating its directories. Objects are written as JSON.
 *
 * @param {string} file
 * @param {string|Buffer|object} content
 */
export function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data =
    typeof content === "string" || Buffer.isBuffer(content)
      ? content
      : `${JSON.stringify(content, null, 2)}\n`;
  fs.writeFileSync(file, data);
}

/**
 * Reads a JSON file.
 *
 * @param {string} file
 * @returns {any}
 */
export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Runs a Node.js script and captures its output.
 *
 * @param {string} script
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
export function runNode(script, args, options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? os.tmpdir(),
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Loads a root devDependency (e.g. ajv) when it is installed; null otherwise, so tests that need
 * it can skip before `npm ci`.
 *
 * @param {string} specifier
 * @returns {any|null}
 */
export function optionalDevDependency(specifier) {
  try {
    return createRequire(path.join(REPO_ROOT, "package.json"))(specifier);
  } catch {
    return null;
  }
}

/**
 * Finds an executable on PATH; null when absent.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function which(name) {
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd"] : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${name}${extension}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Not here.
      }
    }
  }
  return null;
}

/**
 * Copies the sources the build reads into a scratch repository root: VERSION, schemas/, the kit
 * tool and a registry.
 *
 * @param {import("node:test").TestContext} t
 * @param {{ rules?: object[], version?: string }} [options]
 * @returns {string} The scratch root.
 */
export function scratchRepo(t, { rules = sampleRules(), version = VERSION } = {}) {
  const root = tempDir(t, "cross-stack-build-");
  write(path.join(root, "VERSION"), `${version}\n`);
  write(path.join(root, "LICENSE"), "MIT License\n\nCopyright (c) 2026 Example Holder\n");
  for (const name of ["standard.schema.json", "allowlist.schema.json", "protected-paths.json"]) {
    let text = fs.readFileSync(path.join(REPO_ROOT, "schemas", name), "utf8");
    if (version !== VERSION) text = text.replaceAll(`/v${VERSION}/`, `/v${version}/`);
    write(path.join(root, "schemas", name), text);
  }
  // Start from an empty generated block, as a fresh checkout of a changed schema would.
  const bin = fs
    .readFileSync(BIN_TEMPLATE, "utf8")
    .replace(
      /const GENERATED = [\s\S]*?;\n(?=\/\/ <\/cross-stack-standard:generated>)/,
      "const GENERATED = {};\n",
    );
  write(
    path.join(
      root,
      "plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs",
    ),
    bin,
  );
  write(
    path.join(root, ".claude-plugin/marketplace.json"),
    fs.readFileSync(path.join(REPO_ROOT, ".claude-plugin/marketplace.json"), "utf8"),
  );
  write(path.join(root, "registry/rules.json"), {
    $schema: "./rules.schema.json",
    version: 1,
    rules,
  });
  return root;
}

/**
 * A small, valid registry.
 *
 * @returns {object[]}
 */
export function sampleRules() {
  return [
    {
      id: "WEB-002",
      title: "Second rule",
      track: "web",
      tier: 1,
      module: null,
      enforcement: "REVIEW",
      targetEnforcement: "FORCED",
      gate: null,
      evasions: [],
      decision: "0001",
      defaultEnabled: true,
      since: "1.0.0",
      configurable: [],
      profiles: ["next"],
      summary: "A web rule.",
    },
    {
      id: "BE-001",
      title: "First rule",
      track: "laravel",
      tier: 2,
      module: "tenancy",
      enforcement: "FORCED",
      gate: { kind: "pest", id: "BE-001 isolates tenants" },
      evasions: [],
      decision: "0002",
      defaultEnabled: false,
      since: "1.0.0",
      configurable: [],
      summary: "A Laravel rule.",
    },
  ];
}
