/**
 * Shared helpers for the registry tooling tests: temporary repository trees, rule factories and
 * a runner for the CLI scripts. Every temporary directory is created under the OS temp dir and
 * removed by `cleanup()`.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the repository under test. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Absolute path of the real registry schema. */
export const SCHEMA_FILE = path.join(REPO_ROOT, "registry", "rules.schema.json");

/**
 * @typedef {object} TempRepo
 * @property {string} root Absolute path.
 * @property {(rel: string, content: string | object) => string} write Writes a file (objects as
 *   JSON) and returns its absolute path.
 * @property {(rel: string) => string} mkdir Creates a directory and returns its absolute path.
 * @property {(rules: object[], extra?: object) => void} registry Writes registry/rules.json.
 * @property {() => void} cleanup Removes the tree.
 */

/**
 * Creates a temporary repository with a copy of the real registry schema.
 *
 * @param {{ schema?: boolean }} [options]
 * @returns {TempRepo}
 */
export function makeRepo({ schema = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "registry-test-"));
  const write = (rel, content) => {
    const file = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`,
    );
    return file;
  };
  const mkdir = (rel) => {
    const dir = path.join(root, ...rel.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  if (schema) write("registry/rules.schema.json", fs.readFileSync(SCHEMA_FILE, "utf8"));
  return {
    root,
    write,
    mkdir,
    registry: (rules, extra = {}) =>
      write("registry/rules.json", { $schema: "./rules.schema.json", version: 1, rules, ...extra }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * A valid REVIEW rule (no gate), with overrides. A tier 1 rule gets invariant 1 unless the
 * overrides name one; a tier 2 rule has no invariant unless the overrides add one.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
export function reviewRule(overrides = {}) {
  const rule = {
    id: "PROC-101",
    title: "A sample process rule for tests",
    track: "shared",
    tier: 1,
    invariant: 1,
    module: null,
    enforcement: "REVIEW",
    gate: null,
    decision: "0001",
    defaultEnabled: true,
    since: "1.0.0",
    summary: "A sample rule used by the registry tooling tests.",
    adoption: "Nothing needed.",
    ...overrides,
  };
  if (rule.tier !== 1 && !Object.hasOwn(overrides, "invariant")) delete rule.invariant;
  return rule;
}

/**
 * A valid FORCED rule with a script gate, with overrides.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
export function forcedRule(overrides = {}) {
  return reviewRule({
    id: "PROC-102",
    enforcement: "FORCED",
    gate: { kind: "script", id: "check-sample" },
    ...overrides,
  });
}

/**
 * A valid GUARDED rule with an eslint gate, with overrides.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
export function guardedRule(overrides = {}) {
  return reviewRule({
    id: "WEB-101",
    track: "web",
    enforcement: "GUARDED",
    gate: { kind: "eslint", id: "cross-stack/no-sample" },
    evasions: ["the helper is renamed"],
    ...overrides,
  });
}

/**
 * Runs a repository script with Node.js.
 *
 * @param {string} script Path relative to the repository root.
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
export function runScript(script, args, { cwd = REPO_ROOT } = {}) {
  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, script), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
