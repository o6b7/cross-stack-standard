#!/usr/bin/env node
/**
 * companions: the consent, status and log commands for the companion plugins (ADR 0106), run by
 * the adopt and doctor skills. Node.js built-ins only; reads local files, writes only the
 * project's manifest (`record`) and the plugin's data directory; never installs anything and
 * never touches the network. The install commands it prints are run by the skill, after the
 * user's yes, and the PreToolUse hook refuses one for a companion the user declined.
 *
 *   describe                         the consent text of each companion: purpose, access,
 *                                    network, licence
 *   status                           installation, consent and health of each companion;
 *                                    exit 1 when an approved one is unusable or duplicated
 *   plan   --approve a,b --decline c the install plan for these answers, without writing
 *   record --approve a,b --decline c writes the answers to the manifest (`companions`, and the
 *                                    `design` and `browser-check` modules) and prints the plan
 *   health <name> ok|failed [--detail text]   records the outcome of a probe call
 *   log [--tail N]                   the last entries of the structured log
 *
 * Options: --root <dir> (the project root, default the working directory), --data-dir <dir>
 * (the plugin's data directory, `${CLAUDE_PLUGIN_DATA}` in skills), --json.
 *
 * Exit codes: 0 done, 1 `status` found a problem, 2 usage error or unreadable manifest.
 *
 * @module plugins/cross-stack-standard/scripts/companions
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { appendLog, loadStatus, planConsent, readLog, writeHealth } from "./lib/companions.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(".cross-stack", "standard.json");

/** Modules that follow a companion's answer. */
export const MODULE_OF = Object.freeze({
  impeccable: "design",
  "playwright-mcp": "browser-check",
  "chrome-devtools-mcp": "browser-check",
});

const USAGE = `Usage: node companions.mjs <describe|status|plan|record|health|log> [options]
  plan|record --approve <names> --decline <names>   every companion answered exactly once
  health <name> ok|failed [--detail <text>]
  log [--tail <n>]
Options: --root <dir>  --data-dir <dir>  --json`;

class UsageError extends Error {}

function list(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
}

function readManifest(root, { required }) {
  const file = path.join(root, MANIFEST);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    if (required)
      throw new UsageError(`${MANIFEST} not found under ${root}; write the manifest first`);
    return { file, value: null };
  }
  try {
    return { file, value: JSON.parse(text) };
  } catch (error) {
    throw new UsageError(`${MANIFEST} is not valid JSON (${error.message})`);
  }
}

/**
 * Runs one command. Returns the exit code and the text to print; throws UsageError.
 *
 * @param {string[]} argv
 * @param {{ env?: Record<string, string | undefined>, cwd?: string, now?: Date, pluginRoot?: string }} [context]
 * @returns {{ code: number, out: string }}
 */
export function run(
  argv,
  { env = process.env, cwd = process.cwd(), now = new Date(), pluginRoot = PLUGIN_ROOT } = {},
) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        root: { type: "string" },
        "data-dir": { type: "string" },
        json: { type: "boolean", default: false },
        approve: { type: "string" },
        decline: { type: "string" },
        detail: { type: "string" },
        tail: { type: "string" },
      },
    });
  } catch (error) {
    throw new UsageError(error.message);
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  const root = path.resolve(cwd, values.root ?? ".");
  const dataDir = values["data-dir"] ? path.resolve(cwd, values["data-dir"]) : null;
  const json = values.json;
  const emit = (data, text) => (json ? `${JSON.stringify(data, null, 2)}\n` : text);

  const status = (manifestValue) =>
    loadStatus({ pluginRoot, projectRoot: root, env, manifest: manifestValue, dataDir });

  switch (command) {
    case "describe": {
      const { companions } = status(null);
      const data = companions.map(
        ({ name, title, purpose, access, network, license, scope, sha, version }) => ({
          name,
          title,
          purpose,
          access,
          network,
          license,
          scope,
          pin: `${version ?? "commit"} ${sha}`,
        }),
      );
      const text = data
        .map(
          (c) =>
            `${c.name} (${c.title}), pinned ${c.pin}, ${c.scope} scope\n  ${c.purpose}\n  Access: ${c.access}\n  Network: ${c.network}\n  Licence: ${c.license}\n`,
        )
        .join("");
      return { code: 0, out: emit(data, text) };
    }
    case "status": {
      const { value } = readManifest(root, { required: false });
      const { statuses } = status(value);
      appendLog(
        dataDir,
        {
          event: "status",
          source: "cli",
          companions: Object.fromEntries(statuses.map((s) => [s.name, s.state])),
        },
        now,
      );
      const problem = statuses.some(
        (s) =>
          (s.consent === "approved" && !s.usable) ||
          s.duplicates.length > 0 ||
          s.state === "unpinned",
      );
      const text = statuses
        .map(
          (s) =>
            `${s.usable ? "ok  " : s.consent === "declined" ? "skip" : "warn"} ${s.name}: ${s.state} (consent ${s.consent}). ${s.message}\n`,
        )
        .join("");
      return { code: problem ? 1 : 0, out: emit(statuses, text) };
    }
    case "plan":
    case "record": {
      const approve = list(values.approve);
      const decline = list(values.decline);
      const manifest = readManifest(root, { required: command === "record" });
      const { companions, statuses } = status(manifest.value);
      let plan;
      try {
        plan = planConsent({ companions, statuses, approve, decline });
      } catch (error) {
        throw new UsageError(error.message);
      }
      if (command === "record") {
        const value = manifest.value;
        value.companions = { ...(value.companions ?? {}), ...plan.consent };
        if (value.modules !== null && typeof value.modules === "object") {
          const modules = new Map();
          for (const [name, module] of Object.entries(MODULE_OF)) {
            modules.set(module, (modules.get(module) ?? false) || plan.consent[name] === true);
          }
          for (const [module, enabled] of modules) value.modules[module] = enabled;
        }
        fs.writeFileSync(manifest.file, `${JSON.stringify(value, null, 2)}\n`);
        for (const [name, approved] of Object.entries(plan.consent)) {
          appendLog(
            dataDir,
            { event: "consent", companion: name, decision: approved ? "approved" : "declined" },
            now,
          );
        }
      }
      const text = [
        ...plan.install.map((step) => `install ${step.name}: ${step.command}\n`),
        ...plan.skipped.map((step) => `skip    ${step.name}: ${step.reason}\n`),
        ...plan.disable.map(
          (step) => `offer   disable ${step.id} (${step.reason}): ${step.command}\n`,
        ),
        command === "record"
          ? `recorded ${MANIFEST}: companions ${JSON.stringify(plan.consent)}\n`
          : "",
      ].join("");
      return { code: 0, out: emit(plan, text) };
    }
    case "health": {
      const [name, outcome] = rest;
      const { companions } = status(null);
      if (!companions.some((c) => c.name === name))
        throw new UsageError(`unknown companion "${name}"`);
      if (!["ok", "failed"].includes(outcome)) throw new UsageError("health takes ok or failed");
      if (!dataDir) throw new UsageError("health needs --data-dir");
      writeHealth(dataDir, name, outcome, values.detail ?? null, now);
      appendLog(
        dataDir,
        {
          event: "health",
          companion: name,
          status: outcome,
          source: "probe",
          detail: values.detail ?? null,
        },
        now,
      );
      return { code: 0, out: emit({ name, status: outcome }, `${name}: ${outcome}\n`) };
    }
    case "log": {
      const tail = values.tail === undefined ? 20 : Number(values.tail);
      if (!Number.isInteger(tail) || tail < 1)
        throw new UsageError("--tail takes a positive integer");
      const entries = readLog(dataDir, tail);
      const text =
        entries.length === 0
          ? "no companion log entries\n"
          : entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
      return { code: 0, out: emit(entries, text) };
    }
    default:
      throw new UsageError(command ? `unknown command "${command}"` : "no command");
  }
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    const { code, out } = run(process.argv.slice(2));
    process.stdout.write(out);
    process.exitCode = code;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`companions: ${error.message}\n${USAGE}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
