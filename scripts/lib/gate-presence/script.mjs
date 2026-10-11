/**
 * Gate presence for `script` gates: a candidate script file exists, its check listing names the
 * gate's sub-check, and a shipped track check chain runs it: the `check` or `check:fast` script
 * of a template package.json or composer.json (following `npm run <x>` and `@<x>` references) or
 * a lefthook.yml job. A check that is listed but that no adopter chain runs is not enforced.
 *
 * For a track rule, that track's chain must run the check; for a shared rule, every track that
 * ships a chain must run it (a track without any chain file is not shipped yet).
 *
 * Contract for script gates: `node <script> <listArgs…>` (`list-checks` for the shared project
 * tool, `--list-checks` for a standalone script) exits 0 and prints one check per line; the first
 * whitespace-separated token of a line is the check id; blank lines and lines starting with `#`
 * are ignored. A check id is the script or command name (`check-allowlists`), or
 * `<name>:<sub-check>` (`check-standard-config:tier-triggers`) when the gate has a discriminator.
 *
 * @module scripts/lib/gate-presence/script
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { escapeRegExp, isFile, readText } from "./files.mjs";

const LIST_TIMEOUT_MS = 15_000;

/**
 * Parses `--list-checks` output into sub-check ids.
 *
 * @param {string} output
 * @returns {string[]}
 */
export function parseCheckList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/)[0]);
}

/**
 * Runs `node <file> <listArgs…>` once per file (cached on the context).
 *
 * @param {string} absolute Script path.
 * @param {string[]} listArgs Arguments that make the script list its checks.
 * @param {{ root: string, cache: Map<string, any> }} ctx
 * @returns {{ ok: true, checks: string[] } | { ok: false, error: string }}
 */
function listChecks(absolute, listArgs, ctx) {
  const key = `script:list:${absolute}:${listArgs.join(" ")}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  let result;
  try {
    const output = execFileSync(process.execPath, [absolute, ...listArgs], {
      cwd: ctx.root,
      encoding: "utf8",
      timeout: LIST_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      windowsHide: true,
    });
    result = { ok: true, checks: parseCheckList(output) };
  } catch (error) {
    const detail =
      error.code === "ETIMEDOUT" ? "timed out" : `exited with ${error.status ?? error.code}`;
    result = { ok: false, error: `${listArgs.join(" ")} ${detail}` };
  }
  ctx.cache.set(key, result);
  return result;
}

/** Scripts an adopter runs as the track's check chain. */
export const CHAIN_ENTRY_SCRIPTS = Object.freeze(["check", "check:fast"]);

/**
 * Commands reachable from the chain entry scripts of a package.json or composer.json `scripts`
 * object: `npm run <x>`, `npm run-script <x>` and `node --run <x>` (npm), `@<x>` (Composer).
 *
 * @param {Record<string, unknown>} scripts
 * @param {"npm" | "composer"} flavour
 * @returns {string[]}
 */
export function reachableScriptCommands(scripts, flavour) {
  const commands = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name) || !(name in scripts)) return;
    seen.add(name);
    const value = scripts[name];
    const list = (Array.isArray(value) ? value : [value]).filter((c) => typeof c === "string");
    for (const command of list) {
      commands.push(command);
      if (flavour === "npm") {
        for (const match of command.matchAll(
          /\b(?:npm\s+run(?:-script)?|node\s+--run)\s+(?:--\S+\s+)*([\w:.-]+)/g,
        )) {
          visit(match[1]);
        }
      } else {
        const ref = /^@([\w:.-]+)/.exec(command.trim());
        if (ref && !["php", "composer", "putenv"].includes(ref[1])) visit(ref[1]);
      }
    }
  };
  for (const name of CHAIN_ENTRY_SCRIPTS) visit(name);
  return commands;
}

/**
 * Commands a chain file runs.
 *
 * @param {string} rel root-relative path (package.json, composer.json or lefthook.yml)
 * @param {string} text file contents
 * @returns {string[]}
 */
export function chainFileCommands(rel, text) {
  const base = path.posix.basename(rel);
  if (base === "package.json" || base === "composer.json") {
    try {
      const scripts = JSON.parse(text)?.scripts;
      if (!scripts || typeof scripts !== "object") return [];
      return reachableScriptCommands(scripts, base === "package.json" ? "npm" : "composer");
    } catch {
      return [];
    }
  }
  // lefthook.yml: every job's run command (the file is small; comments are not commands).
  return text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n")
    .split(/\n(?=\s*-?\s*name:)/)
    .filter((chunk) => /\brun:/.test(chunk));
}

/**
 * Whether a command invokes the check: `<bin> <gate id>` or `<bin> <gate id> <sub-check>`.
 *
 * @param {string} command
 * @param {string[]} binNames script file names that can run the check
 * @param {{ id: string, discriminator?: string }} gate
 * @returns {boolean}
 */
export function commandRunsCheck(command, binNames, gate) {
  const sub =
    gate.discriminator === undefined ? "" : `(?:\\s+${escapeRegExp(gate.discriminator)})?`;
  return binNames.some((bin) => {
    const name = bin.replaceAll("{id}", gate.id);
    const own = name === `${gate.id}.mjs`;
    const pattern = own
      ? new RegExp(`(?:^|[\\s/"'])${escapeRegExp(name)}["']?(?![\\w.-])`)
      : new RegExp(
          `(?:^|[\\s/"'])${escapeRegExp(name)}["']?\\s+${escapeRegExp(gate.id)}${sub}(?![\\w:-])`,
        );
    return pattern.test(command);
  });
}

/**
 * Which tracks' shipped check chains run the check.
 *
 * @param {{ id: string, discriminator?: string }} gate
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ running: string[], missing: string[] }} chain directories that run it, and those
 *   that ship a chain without running it
 */
export function chainsRunningCheck(gate, ctx) {
  const byDir = new Map();
  for (const rel of ctx.locations.script.chains) {
    const text = readText(path.join(ctx.root, ...rel.split("/")));
    if (text === null) continue;
    const dir = path.posix.dirname(rel);
    const commands = byDir.get(dir) ?? [];
    commands.push(...chainFileCommands(rel, text));
    byDir.set(dir, commands);
  }
  const running = [];
  const missing = [];
  for (const [dir, commands] of byDir) {
    const runs = commands.some((command) =>
      commandRunsCheck(command, ctx.locations.script.binNames, gate),
    );
    (runs ? running : missing).push(dir);
  }
  return { running: running.sort(), missing: missing.sort() };
}

/**
 * Checks a `script` gate.
 *
 * @param {{ id: string, discriminator?: string }} gate
 * @param {object} _rule
 * @param {{ root: string, cache: Map<string, any>, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ present: boolean, evidence: string }}
 */
export function checkScriptGate(gate, _rule, ctx) {
  const subCheck = gate.discriminator === undefined ? gate.id : `${gate.id}:${gate.discriminator}`;
  const tried = [];
  const problems = [];
  let listedBy = null;
  for (const candidate of ctx.locations.script.candidates) {
    const rel = candidate.file.replaceAll("{id}", gate.id);
    const listing = candidate.listArgs.join(" ");
    tried.push(rel);
    const absolute = path.join(ctx.root, ...rel.split("/"));
    if (!isFile(absolute)) continue;
    const listed = listChecks(absolute, candidate.listArgs, ctx);
    if (!listed.ok) {
      problems.push(`${rel} ${listed.error}`);
      continue;
    }
    if (listed.checks.includes(subCheck)) {
      listedBy = `${rel} ${listing} lists ${subCheck}`;
      break;
    }
    problems.push(`${rel} ${listing} does not list ${subCheck}`);
  }
  if (!listedBy) {
    if (problems.length) return { present: false, evidence: problems.join("; ") };
    return {
      present: false,
      evidence: `no script file for ${subCheck} (looked for ${tried.join(", ")})`,
    };
  }
  const { running, missing } = chainsRunningCheck(gate, ctx);
  if (running.length === 0 && missing.length === 0) {
    return {
      present: false,
      evidence: `${listedBy}, but no shipped check chain exists to run it (${ctx.locations.script.chains.join(", ")})`,
    };
  }
  if (missing.length > 0) {
    return {
      present: false,
      evidence: `${listedBy}, but the check chain in ${missing.join(", ")} does not run it`,
    };
  }
  return {
    present: true,
    evidence: `${listedBy}; run by the check chain in ${running.join(", ")}`,
  };
}
