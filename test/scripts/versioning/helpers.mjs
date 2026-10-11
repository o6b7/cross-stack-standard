/**
 * @file Shared helpers for the versioning and identity script tests: temporary repository trees,
 * file snapshots and CLI runners. Not a test file itself.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of the repository under test. */
export const REPO_ROOT = path.resolve(here, "..", "..", "..");

/** Absolute paths of the scripts under test. */
export const SCRIPTS = Object.freeze({
  stamp: path.join(REPO_ROOT, "scripts", "stamp-version.mjs"),
  drift: path.join(REPO_ROOT, "scripts", "check-version-drift.mjs"),
  identity: path.join(REPO_ROOT, "scripts", "check-identity.mjs"),
});

/**
 * Creates a temporary directory holding `files`. String values are written verbatim, Buffers as
 * bytes, and anything else as pretty JSON with a trailing newline.
 * @param {Record<string, string | Buffer | object>} files Repository-relative POSIX paths.
 * @returns {string} The directory.
 */
export function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cross-stack-versioning-"));
  writeFiles(root, files);
  return root;
}

/**
 * Writes (or overwrites) files in an existing tree.
 * @param {string} root
 * @param {Record<string, string | Buffer | object>} files
 */
export function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const data =
      typeof content === "string" || Buffer.isBuffer(content)
        ? content
        : `${JSON.stringify(content, null, 2)}\n`;
    fs.writeFileSync(abs, data);
  }
}

/**
 * Removes a temporary tree.
 * @param {string} root
 */
export function removeTree(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

/**
 * Reads a file of a tree as UTF-8.
 * @param {string} root
 * @param {string} rel
 * @returns {string}
 */
export function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split("/")), "utf8");
}

/**
 * Reads and parses a JSON file of a tree.
 * @param {string} root
 * @param {string} rel
 * @returns {any}
 */
export function readJson(root, rel) {
  return JSON.parse(read(root, rel));
}

/**
 * Captures every file of a tree (relative POSIX path → bytes as base64) to detect writes.
 * @param {string} root
 * @returns {Map<string, string>}
 */
export function snapshot(root) {
  const out = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else
        out.set(
          path.relative(root, abs).split(path.sep).join("/"),
          fs.readFileSync(abs).toString("base64"),
        );
    }
  };
  walk(root);
  return out;
}

/**
 * Runs a script as a child process with the current Node.js binary.
 * @param {string} script Absolute path.
 * @param {string[]} args
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
export function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Calls a script's exported `main` in-process with captured output.
 * @param {(argv: string[], io: object) => number} main
 * @param {string[]} argv
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function callMain(main, argv) {
  let stdout = "";
  let stderr = "";
  const io = {
    stdout: { write: (chunk) => (stdout += chunk) },
    stderr: { write: (chunk) => (stderr += chunk) },
  };
  const code = main(argv, io);
  return { code, stdout, stderr };
}

export const OLD = "1.0.0";
export const NEW = "1.2.3";
export const SCHEMA_BASE = "https://raw.githubusercontent.com/o6b7/cross-stack-standard";

/**
 * A repository tree that exercises every version location, with every stamped value at `from`
 * and `VERSION` at `to`. Files that must never be written are included as well.
 * @param {{ from?: string, to?: string }} [options]
 * @returns {Record<string, string | Buffer | object>}
 */
export function versionTree({ from = OLD, to = NEW } = {}) {
  const url = (v, rest) => `${SCHEMA_BASE}/v${v}/${rest}`;
  return {
    VERSION: `${to}\n`,
    ".claude-plugin/marketplace.json": {
      name: "cross-stack-standard",
      owner: { name: "Qusai Abdullah" },
      metadata: { description: "Marketplace.", version: from },
      plugins: [{ name: "cross-stack-standard", source: "./plugins/cross-stack-standard" }],
    },
    // Hand-formatted: the short array must stay on one line after stamping.
    "plugins/cross-stack-standard/.claude-plugin/plugin.json": `{\n  "name": "cross-stack-standard",\n  "version": "${from}",\n  "keywords": ["laravel", "web"]\n}\n`,
    "package.json": {
      name: "repo-tooling",
      version: from,
      private: true,
      workspaces: ["packages/*"],
      devDependencies: { "@cross-stack-standard/eslint-config": from, eslint: "9.39.5" },
    },
    "package-lock.json": {
      name: "repo-tooling",
      version: from,
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "repo-tooling",
          version: from,
          workspaces: ["packages/*"],
          devDependencies: { "@cross-stack-standard/eslint-config": from, eslint: "9.39.5" },
        },
        "node_modules/@cross-stack-standard/eslint-config": {
          resolved: "packages/eslint-config",
          link: true,
        },
        "node_modules/eslint": { version: "9.39.5", dev: true },
        "packages/eslint-config": {
          name: "@cross-stack-standard/eslint-config",
          version: from,
          peerDependencies: { eslint: "^9.39.0" },
        },
      },
    },
    "packages/eslint-config/package.json": {
      name: "@cross-stack-standard/eslint-config",
      version: from,
      peerDependencies: { eslint: "^9.39.0" },
    },
    "packages/eslint-config/index.js": `// cross-stack-standard v${from}: managed file\nexport default [];\n`,
    "packages/eslint-config/CHANGELOG.md": `# Changelog\n\n## cross-stack-standard v0.9.0\n`,
    "packages/eslint-config/test/fixtures/old-header.js": "// cross-stack-standard v0.9.0\n",
    "packages/eslint-config/node_modules/dep/index.js": "// cross-stack-standard v0.9.0\n",
    "packages/laravel/composer.json": {
      name: "o6b7/cross-stack-standard-laravel",
      description: `Laravel gates (cross-stack-standard v${from}).`,
      type: "library",
    },
    "packages/laravel/src/Rule.php": `<?php\n\ndeclare(strict_types=1);\n\n// cross-stack-standard v${from}\n`,
    "packages/laravel/vendor/acme/lib/composer.json": { name: "acme/lib", version: "3.0.0" },
    "packages/laravel/vendor/acme/lib/Lib.php": "<?php // cross-stack-standard v0.9.0\n",
    "plugins/cross-stack-standard/templates/shared/lefthook.yml": `# cross-stack-standard v${from}\npre-commit:\n  commands: {}\n`,
    "plugins/cross-stack-standard/templates/claude/standard.json": {
      $schema: url(from, "plugins/cross-stack-standard/data/standard.schema.json"),
      tracks: ["web"],
    },
    "plugins/cross-stack-standard/templates/web/package.json": {
      name: "web-app",
      version: from,
      private: true,
      devDependencies: {
        "@cross-stack-standard/eslint-config": `^${from}`,
        "@cross-stack-standard/i18n-parity": "file:.cross-stack/vendor/i18n-parity",
        "@cross-stack-standard/vitest-arch": "*",
        "left-pad": from,
      },
    },
    "plugins/cross-stack-standard/templates/laravel/package.json": {
      scripts: { prepare: "lefthook install" },
    },
    "plugins/cross-stack-standard/templates/web/vendor/eslint-config/package.json": {
      name: "@cross-stack-standard/eslint-config",
      version: from,
    },
    "plugins/cross-stack-standard/templates/laravel/vendor/cross-stack-standard-laravel/composer.json":
      { name: "o6b7/cross-stack-standard-laravel", type: "library" },
    "plugins/cross-stack-standard/templates/web/deep.md": `${"line\n".repeat(25)}<!-- cross-stack-standard v0.9.0 -->\n`,
    "plugins/cross-stack-standard/templates/web/logo.png": Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]),
      Buffer.from("cross-stack-standard v0.9.0"),
    ]),
    "schemas/standard.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: url(from, "plugins/cross-stack-standard/data/standard.schema.json"),
      type: "object",
    },
    "registry/rules.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: url(from, "registry/rules.schema.json"),
    },
    "plugins/cross-stack-standard/data/standard.schema.json": {
      $id: url(from, "plugins/cross-stack-standard/data/standard.schema.json"),
    },
    "docs/configuration.md": `See ${url("0.9.0", "schemas/standard.schema.json")}\n`,
  };
}

/** Files of {@link versionTree} that the stamper must never modify. */
export const NEVER_WRITTEN = Object.freeze([
  "packages/eslint-config/CHANGELOG.md",
  "packages/eslint-config/test/fixtures/old-header.js",
  "packages/eslint-config/node_modules/dep/index.js",
  "packages/laravel/composer.json",
  "packages/laravel/vendor/acme/lib/composer.json",
  "packages/laravel/vendor/acme/lib/Lib.php",
  "plugins/cross-stack-standard/templates/laravel/package.json",
  "plugins/cross-stack-standard/templates/laravel/vendor/cross-stack-standard-laravel/composer.json",
  "plugins/cross-stack-standard/templates/web/deep.md",
  "plugins/cross-stack-standard/templates/web/logo.png",
  "docs/configuration.md",
]);
