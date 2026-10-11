/**
 * Resolves the project's own tools to a program and arguments that start the same way on
 * macOS, Linux and Windows without a shell:
 *
 * - a Node.js tool → `process.execPath <the JavaScript file its package.json "bin" names>`,
 *   found in `node_modules/<package>` of the start directory or any parent up to a stop
 *   directory (hoisted workspaces);
 * - a Composer tool → `php vendor/bin/<name>` (Composer writes PHP proxy scripts there);
 * - npm itself → `process.execPath <npm-cli.js>`; Composer itself → `php <composer.phar>`.
 *
 * Nothing is ever downloaded: a tool that is not installed resolves to null and the caller
 * skips it. `.cmd`/`.bat` shims in `node_modules/.bin` are never used, because Node.js refuses
 * to spawn them without a shell on Windows, and `npx` is never used, because it can download.
 *
 * @module plugins/cross-stack-standard/scripts/lib/resolve-tool
 */

import path from "node:path";
import process from "node:process";

import { ancestorsUpTo, isFile, isWithin, readTextCapped } from "./project.mjs";

/**
 * @typedef {object} ResolvedTool
 * @property {string} command Program to spawn (`process.execPath` or `php`).
 * @property {string[]} args Arguments that come before the tool's own arguments.
 * @property {string} file The script that runs.
 */

const JS_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
const NODE_SHEBANG = /^#![^\n]*\bnode\b/;
const PHP_START = /^(?:#![^\n]*\bphp\b[^\n]*\n)?\s*<\?php/;

/** `from` and each parent up to `stopAt`; only `from` when `stopAt` is not one of its parents. */
function searchChain(from, stopAt) {
  return isWithin(from, stopAt) ? ancestorsUpTo(from, stopAt) : [path.resolve(from)];
}

function readJson(file) {
  const text = readTextCapped(file, 1024 * 1024);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Whether a file can be run with `node`: a `.js`, `.cjs` or `.mjs` file, or a file whose first
 * line is a Node.js shebang.
 *
 * @param {string} file
 * @returns {boolean}
 */
export function isJavaScriptFile(file) {
  if (!isFile(file)) return false;
  if (JS_EXTENSIONS.has(path.extname(file).toLowerCase())) return true;
  const head = readTextCapped(file, 256);
  return head !== null && NODE_SHEBANG.test(head);
}

/**
 * Whether a file can be run with `php`: it starts with `<?php`, optionally after a PHP shebang
 * (Composer's bin proxies and `composer.phar` both do).
 *
 * @param {string} file
 * @returns {boolean}
 */
export function isPhpScript(file) {
  if (!isFile(file)) return false;
  const head = readTextCapped(file, 512);
  return head !== null && PHP_START.test(head.replace(/\r\n/g, "\n"));
}

/**
 * The file a package.json `bin` field names for one command.
 *
 * @param {unknown} bin The `bin` field.
 * @param {string} packageName
 * @param {string} [binName] Which command; defaults to the package name without its scope, or
 *   the only command.
 * @returns {string | null} Path relative to the package directory.
 */
export function binEntry(bin, packageName, binName) {
  if (typeof bin === "string") {
    const unscoped = packageName.split("/").pop();
    return binName === undefined || binName === unscoped ? bin : null;
  }
  if (bin === null || typeof bin !== "object" || Array.isArray(bin)) return null;
  const names = Object.keys(bin);
  const wanted =
    binName ??
    (Object.hasOwn(bin, packageName.split("/").pop())
      ? packageName.split("/").pop()
      : names.length === 1
        ? names[0]
        : undefined);
  const entry = wanted === undefined ? undefined : bin[wanted];
  return typeof entry === "string" ? entry : null;
}

/**
 * Resolves a Node.js tool installed in the project.
 *
 * @param {{ pkg: string, bin?: string, from: string, stopAt?: string }} options `from` is the
 *   directory to start in (for example the track root); `stopAt` the last directory searched
 *   (default: `from` only).
 * @returns {ResolvedTool & { packageDir: string } | null}
 */
export function resolveNodeBin({ pkg, bin, from, stopAt = from }) {
  for (const dir of searchChain(from, stopAt)) {
    const packageDir = path.join(dir, "node_modules", ...pkg.split("/"));
    const manifest = readJson(path.join(packageDir, "package.json"));
    if (manifest === null) continue;
    const entry = binEntry(manifest.bin, pkg, bin);
    if (entry === null) return null;
    const file = path.resolve(packageDir, entry);
    if (!isWithin(file, packageDir) || !isJavaScriptFile(file)) return null;
    return { command: process.execPath, args: [file], file, packageDir };
  }
  return null;
}

/**
 * Resolves a Composer tool installed in the project (`vendor/bin/<name>`), run with `php`.
 *
 * @param {{ name: string, from: string, stopAt?: string }} options
 * @returns {ResolvedTool | null}
 */
export function resolveVendorBin({ name, from, stopAt = from }) {
  for (const dir of searchChain(from, stopAt)) {
    const file = path.join(dir, "vendor", "bin", name);
    if (!isFile(file)) continue;
    return isPhpScript(file) ? { command: "php", args: [file], file } : null;
  }
  return null;
}

/**
 * Resolves npm's JavaScript entry point: `npm_execpath` when it names `npm-cli.js`, else the
 * copy bundled with the running Node.js (`<prefix>/node_modules/npm` on Windows,
 * `<prefix>/lib/node_modules/npm` elsewhere).
 *
 * @param {{ env?: Record<string, string | undefined>, execPath?: string }} [options]
 * @returns {ResolvedTool | null}
 */
export function resolveNpmCli({ env = process.env, execPath = process.execPath } = {}) {
  const candidates = [];
  const fromEnv = env.npm_execpath;
  if (typeof fromEnv === "string" && /^npm-cli\.c?js$/i.test(path.basename(fromEnv))) {
    candidates.push(fromEnv);
  }
  const binDir = path.dirname(execPath);
  candidates.push(
    path.join(binDir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(binDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  );
  for (const candidate of candidates) {
    const file = path.resolve(candidate);
    if (isJavaScriptFile(file)) return { command: execPath, args: [file], file };
  }
  return null;
}

function pathEntries(env) {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH");
  const value = key === undefined ? "" : (env[key] ?? "");
  return value.split(path.delimiter).filter((entry) => entry !== "");
}

/**
 * Resolves Composer as a PHP script on `PATH`: `composer.phar`, or a `composer` file that is a
 * PHP script (a Unix install). The Windows installer's `composer.bat` sits next to
 * `composer.phar`, which is what this returns.
 *
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {ResolvedTool | null}
 */
export function resolveComposer({ env = process.env } = {}) {
  for (const dir of pathEntries(env)) {
    for (const name of ["composer.phar", "composer"]) {
      const file = path.join(dir, name);
      if (isPhpScript(file)) return { command: "php", args: [file], file };
    }
  }
  return null;
}

/**
 * Whether a program name would need a shell or could download code: `.cmd`, `.bat` and `.ps1`
 * files, and `npx` in any form.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function isRefusedCommand(command) {
  const base = path.basename(command.replace(/\\/g, "/")).toLowerCase();
  if (/\.(?:cmd|bat|ps1)$/.test(base)) return true;
  return /^npx(?:\.exe)?$/.test(base) || /^npx-cli\.c?js$/.test(base);
}
