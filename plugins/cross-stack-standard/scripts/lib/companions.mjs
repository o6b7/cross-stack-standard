/**
 * Companion plugins (ADR 0106): the consent record, the installation and health status, the
 * permission gates for their tools, the install plan and the structured log. Shared by the hooks
 * (SessionStart, PreToolUse, PostToolUse, PostToolUseFailure) and by scripts/companions.mjs, which
 * the adopt and doctor skills run.
 *
 * Sources, all local files:
 * - `data/companions.json`: the pinned companions, generated from the marketplace.
 * - `.cross-stack/standard.json` → `companions`: the user's yes or no per companion.
 * - `<config>/plugins/installed_plugins.json`: what Claude Code installed, with the commit.
 * - `enabledPlugins` in the user, project and local settings files.
 * - `<data>/companions-health.json`: the outcome of the last call to each companion's tools.
 *
 * - `<config>/skills/<skill>` and `<config>/agents/<agent>.md`: hand copies of a companion's
 *   skills or agents left by an older install script, reported as duplicates.
 * - `<data>/browser-pages.json`: the browser companion's current page, per session.
 *
 * `<config>` is `CLAUDE_CONFIG_DIR`, else `~/.claude`; `<data>` is `CLAUDE_PLUGIN_DATA`. Nothing
 * here touches the network or starts a process. The gates fail closed and never approve a call:
 * they answer `ask` or `deny`, or stay silent and leave the normal permission flow in charge.
 * Consent is fail-closed: only an explicit `true` in the manifest permits a companion; `false`,
 * a missing or invalid value, a missing or unreadable manifest all deny its use and its install.
 *
 * @module plugins/cross-stack-standard/scripts/lib/companions
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

/** The marketplace that pins the companions. */
export const MARKETPLACE = "cross-stack-standard";

/** Hosts the browser companion may open without asking, besides the project's `browserHosts`. */
export const LOCAL_HOSTS = Object.freeze([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "0.0.0.0",
  "*.localhost",
  "*.test",
]);

/** Chrome DevTools MCP tools that neither open a page nor run or upload anything. */
export const CHROME_SAFE_TOOLS = Object.freeze(
  new Set([
    "click",
    "close_page",
    "drag",
    "emulate",
    "fill",
    "fill_form",
    "get_console_message",
    "get_network_request",
    "handle_dialog",
    "hover",
    "lighthouse_audit",
    "list_console_messages",
    "list_network_requests",
    "list_pages",
    "performance_analyze_insight",
    "performance_start_trace",
    "performance_stop_trace",
    "press_key",
    "resize_page",
    "select_page",
    "take_heapsnapshot",
    "take_screenshot",
    "take_snapshot",
    "type_text",
    "wait_for",
  ]),
);

/** Chrome DevTools MCP tools that open a page, checked against the allowed hosts. */
export const CHROME_NAVIGATION_TOOLS = Object.freeze(new Set(["navigate_page", "new_page"]));

/** Figma MCP tools that only read. Every other Figma tool can change a file and asks. */
export const FIGMA_READ_TOOLS = Object.freeze(
  new Set([
    "download_assets",
    "get_code_connect_map",
    "get_code_connect_suggestions",
    "get_context_for_code_connect",
    "get_design_context",
    "get_figjam",
    "get_generative_plugin",
    "get_libraries",
    "get_metadata",
    "get_motion_context",
    "get_screenshot",
    "get_shader",
    "get_variable_defs",
    "list_file_components_for_code_connect",
    "list_file_shaders",
    "list_generative_plugins",
    "list_shaders",
    "search_design_system",
    "weave_find_model",
    "weave_get_model_run_output",
    "weave_get_tool_inputs",
    "weave_get_tool_run_output",
    "weave_list_tools",
    "whoami",
  ]),
);

export const LOG_FILE = "companions.log.jsonl";
export const PAGES_FILE = "browser-pages.json";

/** Sessions whose current browser page is kept; older ones are dropped. */
export const PAGES_KEEP = 50;
export const HEALTH_FILE = "companions-health.json";

/** The log keeps at most this many lines; older lines are dropped down to {@link LOG_KEEP}. */
export const LOG_MAX_LINES = 1_000;
export const LOG_KEEP = 800;

const MAX_DETAIL_CHARS = 200;

/**
 * @typedef {object} Companion
 * @property {string} name
 * @property {string} marketplace
 * @property {string | null} version
 * @property {string} sha
 * @property {string} title
 * @property {string} purpose
 * @property {"project" | "user"} scope
 * @property {string | null} module
 * @property {string | null} toolPrefix
 * @property {string} access
 * @property {string} network
 * @property {string} license
 * @property {string} fallback
 * @property {string[]} skills Skill names, as the plugin provides them.
 * @property {string[]} agents Agent names, as the plugin provides them.
 */

/**
 * @typedef {object} CompanionStatus
 * @property {string} name
 * @property {string} title
 * @property {"approved" | "declined" | "unanswered"} consent Only `approved` permits use.
 * @property {"pinned" | "wrong-commit" | "missing"} install
 * @property {string | null} commit The installed commit, when known.
 * @property {boolean} enabled
 * @property {string[]} duplicates Enabled copies of the same plugin from other marketplaces.
 * @property {"ok" | "failed" | "unverified" | "n/a"} health
 * @property {string | null} healthDetail
 * @property {"ready" | "unverified" | "unhealthy" | "declined" | "unapproved" | "not-installed" | "disabled" | "unpinned"} state
 * @property {boolean} usable Approved, installed from the pin, enabled, last call not failed.
 * @property {string} message One line for the user: the state, and the fallback when not usable.
 */

function cut(text, max) {
  const line = String(text ?? "").split(/\r?\n/)[0];
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The pinned companions, from the plugin's generated data. Empty when the file is missing.
 *
 * @param {string} pluginRoot
 * @returns {Companion[]}
 */
export function loadCompanions(pluginRoot) {
  const data = readJsonFile(path.join(pluginRoot, "data", "companions.json"));
  return Array.isArray(data?.companions) ? data.companions : [];
}

/**
 * Claude Code's configuration directory.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function claudeConfigDir(env) {
  const value = env.CLAUDE_CONFIG_DIR;
  return typeof value === "string" && value !== "" ? value : path.join(os.homedir(), ".claude");
}

/**
 * Installed plugins by id (`name@marketplace`), from `installed_plugins.json`: the entries that
 * apply to this project (user scope, or a project or local install whose `projectPath` is the
 * project, or that names no project).
 *
 * @param {string} configDir
 * @param {string} projectRoot
 * @returns {Map<string, { scope: string, commit: string | null, version: string | null }[]>}
 */
export function readInstalled(configDir, projectRoot) {
  const data = readJsonFile(path.join(configDir, "plugins", "installed_plugins.json"));
  const out = new Map();
  const plugins = data?.plugins;
  if (plugins === null || typeof plugins !== "object") return out;
  const here = path.resolve(projectRoot);
  for (const [id, entries] of Object.entries(plugins)) {
    if (!Array.isArray(entries)) continue;
    const applies = entries.filter((entry) => {
      if (entry === null || typeof entry !== "object") return false;
      if (entry.scope === "user" || typeof entry.projectPath !== "string") return true;
      return path.resolve(entry.projectPath) === here;
    });
    if (applies.length === 0) continue;
    out.set(
      id,
      applies.map((entry) => ({
        scope: String(entry.scope ?? ""),
        commit: typeof entry.gitCommitSha === "string" ? entry.gitCommitSha : null,
        version: typeof entry.version === "string" ? entry.version : null,
      })),
    );
  }
  return out;
}

/**
 * `enabledPlugins` merged in Claude Code's precedence: user settings, then the project's
 * `.claude/settings.json`, then `.claude/settings.local.json`.
 *
 * @param {string} configDir
 * @param {string} projectRoot
 * @returns {Map<string, boolean>}
 */
export function readEnabled(configDir, projectRoot) {
  const out = new Map();
  for (const file of [
    path.join(configDir, "settings.json"),
    path.join(projectRoot, ".claude", "settings.json"),
    path.join(projectRoot, ".claude", "settings.local.json"),
  ]) {
    const enabled = readJsonFile(file)?.enabledPlugins;
    if (enabled === null || typeof enabled !== "object" || Array.isArray(enabled)) continue;
    for (const [id, value] of Object.entries(enabled)) {
      if (typeof value === "boolean") out.set(id, value);
    }
  }
  return out;
}

/**
 * The consent record from the manifest: `true` approved, `false` declined, absent unanswered.
 *
 * @param {Record<string, any> | null | undefined} manifest
 * @returns {Record<string, boolean>}
 */
export function readConsent(manifest) {
  const record = manifest?.companions;
  if (record === null || typeof record !== "object" || Array.isArray(record)) return {};
  return Object.fromEntries(Object.entries(record).filter(([, v]) => typeof v === "boolean"));
}

/**
 * @param {string | null} dataDir
 * @returns {Record<string, { status: "ok" | "failed", at: string, detail: string | null }>}
 */
export function readHealth(dataDir) {
  if (!dataDir) return {};
  const data = readJsonFile(path.join(dataDir, HEALTH_FILE));
  return data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
}

/**
 * Records the outcome of a call to a companion's tools. Returns the previous status, so the
 * caller logs only changes.
 *
 * @param {string | null} dataDir
 * @param {string} name
 * @param {"ok" | "failed"} status
 * @param {string | null} detail
 * @param {Date} [now]
 * @returns {"ok" | "failed" | null} The previous status.
 */
export function writeHealth(dataDir, name, status, detail, now = new Date()) {
  if (!dataDir) return null;
  const health = readHealth(dataDir);
  const previous = health[name]?.status ?? null;
  health[name] = {
    status,
    at: now.toISOString(),
    detail: detail === null ? null : cut(detail, MAX_DETAIL_CHARS),
  };
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, HEALTH_FILE);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(health, null, 2)}\n`);
  fs.renameSync(temp, file);
  return previous;
}

/**
 * Appends one structured entry (`ts`, `event`, then the given fields) to the log, and trims the
 * log to {@link LOG_KEEP} lines once it passes {@link LOG_MAX_LINES}. Best effort: a log that
 * cannot be written never fails the caller.
 *
 * @param {string | null} dataDir
 * @param {{ event: string, [key: string]: unknown }} entry
 * @param {Date} [now]
 * @returns {boolean} Whether the entry was written.
 */
export function appendLog(dataDir, entry, now = new Date()) {
  if (!dataDir) return false;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, LOG_FILE);
    const record = { ts: now.toISOString(), ...entry };
    for (const key of ["detail", "reason"]) {
      if (typeof record[key] === "string") record[key] = cut(record[key], MAX_DETAIL_CHARS);
    }
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (lines.length > LOG_MAX_LINES) {
      fs.writeFileSync(file, `${lines.slice(-LOG_KEEP).join("\n")}\n`);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The last `tail` log entries, oldest first; unparseable lines are skipped.
 *
 * @param {string | null} dataDir
 * @param {number} [tail]
 * @returns {object[]}
 */
export function readLog(dataDir, tail = 20) {
  if (!dataDir) return [];
  let text;
  try {
    text = fs.readFileSync(path.join(dataDir, LOG_FILE), "utf8");
  } catch {
    return [];
  }
  const entries = [];
  for (const line of text.split("\n").filter(Boolean).slice(-tail)) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A torn line from a concurrent write is skipped.
    }
  }
  return entries;
}

/**
 * The status of every companion.
 *
 * @param {object} options
 * @param {Companion[]} options.companions
 * @param {Map<string, { commit: string | null }[]>} options.installed
 * @param {Map<string, boolean>} options.enabled
 * @param {Record<string, boolean>} options.consent
 * @param {ReturnType<typeof readHealth>} options.health
 * @param {Map<string, string[]>} [options.handCopies] Hand copies per companion name.
 * @returns {CompanionStatus[]}
 */
export function companionStatus({
  companions,
  installed,
  enabled,
  consent,
  health,
  handCopies = new Map(),
}) {
  return companions.map((companion) => {
    const { name, title } = companion;
    const id = `${name}@${companion.marketplace || MARKETPLACE}`;
    const entries = installed.get(id) ?? [];
    const pinned = entries.find((entry) => entry.commit === companion.sha);
    const install = pinned ? "pinned" : entries.length > 0 ? "wrong-commit" : "missing";
    const commit = (pinned ?? entries[0])?.commit ?? null;
    const isEnabled = entries.length > 0 && (enabled.has(id) ? enabled.get(id) : true);
    const duplicates = [...installed.keys()]
      .filter((other) => other !== id && other.split("@")[0] === name)
      .filter((other) => (enabled.has(other) ? enabled.get(other) : true))
      .sort()
      .concat((handCopies.get(name) ?? []).map((copy) => `hand copy ${copy}`));
    const answer = consent[name];
    const consentState =
      answer === true ? "approved" : answer === false ? "declined" : "unanswered";
    const record = health[name];
    const healthState =
      companion.toolPrefix === null
        ? "n/a"
        : record?.status === "ok" || record?.status === "failed"
          ? record.status
          : "unverified";

    let state;
    if (consentState === "declined") state = "declined";
    else if (consentState === "unanswered") state = "unapproved";
    else if (install === "missing") state = "not-installed";
    else if (!isEnabled) state = "disabled";
    else if (install === "wrong-commit") state = "unpinned";
    else if (healthState === "failed") state = "unhealthy";
    else if (healthState === "unverified") state = "unverified";
    else state = "ready";

    const usable = state === "ready" || state === "unverified";
    let message;
    switch (state) {
      case "ready":
        message = `${title} is ready (pinned ${companion.sha.slice(0, 7)}).`;
        break;
      case "unverified":
        message = `${title} is installed; its first call verifies the connection.`;
        break;
      case "unhealthy":
        message = `${title} failed on its last call (${record?.detail ?? "no detail"}). ${companion.fallback}`;
        break;
      case "declined":
        message = `${title} was declined for this project. ${companion.fallback}`;
        break;
      case "unapproved":
        message = `${title} has no recorded consent for this project (companions.${name} must be true in .cross-stack/standard.json); answer it with /cross-stack-standard:adopt. ${companion.fallback}`;
        break;
      case "disabled":
        message = `${title} is installed but disabled. ${companion.fallback}`;
        break;
      case "unpinned":
        message = `${title} is installed at ${commit ? commit.slice(0, 7) : "an unknown commit"}, not the Standard's pin ${companion.sha.slice(0, 7)}; run /cross-stack-standard:doctor.`;
        break;
      default:
        message = companion.fallback;
    }
    if (duplicates.length > 0) {
      message += ` Another copy is present (${duplicates.join(", ")}); run /cross-stack-standard:doctor.`;
    }
    return {
      name,
      title,
      consent: consentState,
      install,
      commit,
      enabled: isEnabled,
      duplicates,
      health: healthState,
      healthDetail: record?.detail ?? null,
      state,
      usable,
      message,
    };
  });
}

/**
 * Hand copies of the companions' skills and agents in the user's configuration directory
 * (`skills/<skill>`, a directory or a link, and `agents/<agent>.md`), per companion name. Only
 * skill names that carry the companion's own name are looked for, so a generic skill of another
 * plugin is never taken for a copy.
 *
 * @param {string} configDir
 * @param {Companion[]} companions
 * @returns {Map<string, string[]>}
 */
export function readHandCopies(configDir, companions) {
  const out = new Map();
  const exists = (file) => {
    try {
      fs.lstatSync(file);
      return true;
    } catch {
      return false;
    }
  };
  for (const companion of companions) {
    const copies = [];
    for (const skill of (companion.skills ?? []).filter((n) => ownsName(companion, n))) {
      if (exists(path.join(configDir, "skills", skill))) copies.push(`skills/${skill}`);
    }
    for (const agent of companion.agents ?? []) {
      if (exists(path.join(configDir, "agents", `${agent}.md`))) copies.push(`agents/${agent}.md`);
    }
    if (copies.length > 0) out.set(companion.name, copies);
  }
  return out;
}

/** The distinctive part of a companion's name (`chrome-devtools-mcp` → `chrome-devtools`). */
function nameToken(companion) {
  return companion.name.replace(/-mcp$/, "");
}

/** Whether a bare skill name is unmistakably the companion's (it carries its name). */
function ownsName(companion, skill) {
  return skill.includes(nameToken(companion));
}

/**
 * The companion that provides a skill: `<companion>:<skill>` for any of its skills, or a bare
 * skill name that carries the companion's name (`impeccable`, `caveman-commit`, `figma-use`).
 *
 * @param {unknown} skill The Skill tool's `skill` input.
 * @param {Companion[]} companions
 * @returns {Companion | null}
 */
export function companionForSkill(skill, companions) {
  if (typeof skill !== "string" || skill === "") return null;
  const [plugin, name] = skill.includes(":") ? skill.split(":", 2) : [null, skill];
  return (
    companions.find((companion) =>
      plugin === null
        ? (companion.skills ?? []).includes(name) && ownsName(companion, name)
        : plugin === companion.name && (companion.skills ?? []).includes(name),
    ) ?? null
  );
}

/**
 * The browser companion's current page in a session, or null when it is not known.
 *
 * @param {string | null} dataDir
 * @param {unknown} sessionId
 * @returns {string | null}
 */
export function readCurrentPage(dataDir, sessionId) {
  if (!dataDir || typeof sessionId !== "string" || sessionId === "") return null;
  const url = readJsonFile(path.join(dataDir, PAGES_FILE))?.[sessionId]?.url;
  return typeof url === "string" && url !== "" ? url : null;
}

/**
 * Records the browser companion's current page in a session (null: no longer known).
 *
 * @param {string | null} dataDir
 * @param {unknown} sessionId
 * @param {string | null} url
 * @param {Date} [now]
 */
export function writeCurrentPage(dataDir, sessionId, url, now = new Date()) {
  if (!dataDir || typeof sessionId !== "string" || sessionId === "") return;
  const file = path.join(dataDir, PAGES_FILE);
  const pages = readJsonFile(file);
  const all = pages !== null && typeof pages === "object" && !Array.isArray(pages) ? pages : {};
  all[sessionId] = {
    url: typeof url === "string" && url !== "" ? url : null,
    at: now.toISOString(),
  };
  const kept = Object.entries(all)
    .sort((a, b) => String(b[1]?.at ?? "").localeCompare(String(a[1]?.at ?? "")))
    .slice(0, PAGES_KEEP);
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(Object.fromEntries(kept), null, 2)}\n`);
  fs.renameSync(temp, file);
}

/**
 * The current page after a successful browser companion call: the opened URL after a
 * navigation to a URL or a new page, unchanged after a reload or a call that does not navigate,
 * and unknown (null) after back, forward, a page switch or a closed page.
 *
 * @param {string} tool The tool name without the companion's prefix.
 * @param {Record<string, any>} input
 * @param {string | null} current
 * @returns {string | null}
 */
export function pageAfter(tool, input, current) {
  if (tool === "new_page") return typeof input?.url === "string" ? input.url : null;
  if (tool === "navigate_page") {
    const type = input?.type ?? (input?.url !== undefined ? "url" : null);
    if (type === "url") return typeof input?.url === "string" ? input.url : null;
    if (type === "reload") return current;
    return null;
  }
  if (tool === "select_page" || tool === "close_page") return null;
  return current;
}

/**
 * Everything the status needs, read from disk.
 *
 * @param {object} options
 * @param {string} options.pluginRoot
 * @param {string} options.projectRoot
 * @param {Record<string, string | undefined>} options.env
 * @param {Record<string, any> | null} options.manifest
 * @param {string | null} options.dataDir
 * @returns {{ companions: Companion[], statuses: CompanionStatus[], consent: Record<string, boolean> }}
 */
export function loadStatus({ pluginRoot, projectRoot, env, manifest, dataDir }) {
  const companions = loadCompanions(pluginRoot);
  const configDir = claudeConfigDir(env);
  const consent = readConsent(manifest);
  const statuses = companionStatus({
    companions,
    installed: readInstalled(configDir, projectRoot),
    enabled: readEnabled(configDir, projectRoot),
    consent,
    health: readHealth(dataDir),
    handCopies: readHandCopies(configDir, companions),
  });
  return { companions, statuses, consent };
}

/**
 * The one-line summary for the session-start reminder, or null when no companion is installed
 * and none was answered.
 *
 * @param {CompanionStatus[]} statuses
 * @returns {string | null}
 */
export function statusLine(statuses) {
  const shown = statuses.filter(
    (status) =>
      status.install !== "missing" ||
      status.consent !== "unanswered" ||
      status.duplicates.length > 0,
  );
  if (shown.length === 0) return null;
  const words = {
    ready: "ready",
    unverified: "installed, unverified",
    unhealthy: "failed last call",
    declined: "declined",
    "not-installed": "not installed",
    disabled: "disabled",
    unpinned: "not at the pinned commit",
    unapproved: "not approved",
  };
  const parts = shown.map(
    (status) =>
      `${status.name} ${words[status.state]}${status.duplicates.length > 0 ? " (another copy present)" : ""}`,
  );
  const act = shown.some(
    (status) =>
      (!status.usable && !["declined", "unapproved"].includes(status.state)) ||
      status.duplicates.length > 0,
  )
    ? "; /cross-stack-standard:doctor explains"
    : "";
  return `Companions: ${parts.join(", ")}${act}.`;
}

/** The rule that goes with the status line at session start. */
export const STATUS_RULE =
  "Use a companion only when it is ready or unverified, and never claim a result from one that is not; say what is unavailable and offer its fallback.";

/**
 * The install plan for the answers to adopt's question: which companions to install, which to
 * skip and why, which copies to offer to disable, and the consent record to write. Every
 * companion must be answered once; an unknown or repeated name throws.
 *
 * @param {object} options
 * @param {Companion[]} options.companions
 * @param {CompanionStatus[]} options.statuses
 * @param {string[]} options.approve
 * @param {string[]} options.decline
 * @returns {{ consent: Record<string, boolean>, install: { name: string, command: string }[], skipped: { name: string, reason: string }[], disable: { id: string, command: string, reason: string }[] }}
 */
export function planConsent({ companions, statuses, approve, decline }) {
  const known = new Set(companions.map((companion) => companion.name));
  const seen = new Set();
  for (const name of [...approve, ...decline]) {
    if (!known.has(name)) throw new Error(`unknown companion "${name}"`);
    if (seen.has(name)) throw new Error(`companion "${name}" is answered twice`);
    seen.add(name);
  }
  const unanswered = [...known].filter((name) => !seen.has(name));
  if (unanswered.length > 0) throw new Error(`no answer for ${unanswered.join(", ")}`);

  const byName = new Map(statuses.map((status) => [status.name, status]));
  const consent = {};
  const install = [];
  const skipped = [];
  const disable = [];
  for (const companion of companions) {
    const { name, scope } = companion;
    const status = byName.get(name);
    const id = `${name}@${companion.marketplace || MARKETPLACE}`;
    const approved = approve.includes(name);
    consent[name] = approved;
    if (!approved) {
      skipped.push({ name, reason: "declined" });
      if (status && status.install !== "missing" && status.enabled) {
        disable.push({
          id,
          command: `claude plugin disable ${id} --scope ${scope}`,
          reason: "declined but installed",
        });
      }
      continue;
    }
    if (status?.install === "pinned") {
      skipped.push({ name, reason: "already installed at the pinned commit" });
    } else if (status?.install === "wrong-commit") {
      install.push({ name, command: `claude plugin update ${id} --scope ${scope}` });
    } else {
      install.push({ name, command: `claude plugin install ${id} --scope ${scope}` });
    }
    for (const other of status?.duplicates ?? []) {
      disable.push({
        id: other,
        command: `claude plugin disable ${other}`,
        reason: "second copy from another marketplace",
      });
    }
  }
  return { consent, install, skipped, disable };
}

/**
 * Whether a host may be opened without asking.
 *
 * @param {string} host Lower-case host name, IPv6 in brackets.
 * @param {string[]} extra The project's `browserHosts`.
 * @returns {boolean}
 */
export function hostAllowed(host, extra = []) {
  return [...LOCAL_HOSTS, ...extra].some((pattern) => {
    const p = pattern.toLowerCase();
    if (p.startsWith("*.")) return host.endsWith(p.slice(1)) && host.length > p.length - 1;
    return host === p;
  });
}

/**
 * The companion that serves a tool, by tool-name prefix.
 *
 * @param {string} toolName
 * @param {Companion[]} companions
 * @returns {Companion | null}
 */
export function companionForTool(toolName, companions) {
  return (
    companions.find(
      (companion) => companion.toolPrefix !== null && toolName.startsWith(companion.toolPrefix),
    ) ?? null
  );
}

/**
 * The consent and installation gate shared by a companion's MCP tools and skills. Fails closed:
 * `deny` unless the project's consent is an explicit `true`; `ask` when the companion is not
 * installed from the Standard's marketplace at its pin and enabled, or another copy is present.
 * Null when the call may go on to the tool's own checks.
 *
 * @param {Companion} companion
 * @param {CompanionStatus | undefined} status
 * @param {string | null} rule
 * @returns {{ decision: "ask" | "deny", reason: string } | null}
 */
export function companionGate(companion, status, rule) {
  const cite = rule ? ` (${rule})` : "";
  if (!status || status.consent === "unanswered") {
    return {
      decision: "deny",
      reason: `${companion.title} has no recorded consent for this project: companions.${companion.name} must be true in .cross-stack/standard.json${cite}. Answer it with /cross-stack-standard:adopt. ${companion.fallback}`,
    };
  }
  if (status.consent === "declined") {
    return {
      decision: "deny",
      reason: `${companion.title} was declined for this project (companions in .cross-stack/standard.json)${cite}. ${companion.fallback}`,
    };
  }
  if (status.install !== "pinned" || !status.enabled) {
    return {
      decision: "ask",
      reason: `${companion.title} is not installed and enabled from the Standard's marketplace at its pinned commit (${status.state}), so this call may reach another copy${cite}; confirm it, or run /cross-stack-standard:doctor.`,
    };
  }
  if (status.duplicates.length > 0) {
    return {
      decision: "ask",
      reason: `Another copy of ${companion.title} is present (${status.duplicates.join(", ")}); this call may reach the unpinned one${cite}. Confirm it, or run /cross-stack-standard:doctor.`,
    };
  }
  return null;
}

/**
 * Whether a URL may be opened, or be the current page, without asking: an http or https URL
 * whose host is local or configured. A missing URL is never taken for a local one.
 *
 * @param {unknown} url
 * @param {string[]} browserHosts
 * @returns {{ ok: true } | { ok: false, why: string }}
 */
export function checkBrowserUrl(url, browserHosts) {
  if (typeof url !== "string" || url.trim() === "") return { ok: false, why: "no URL is known" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, why: `${cut(url, 80)} is not a valid URL` };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, why: `${cut(url, 80)} is not a web address` };
  }
  const host = parsed.hostname.toLowerCase();
  if (!hostAllowed(host, browserHosts)) {
    return {
      ok: false,
      why: `${host} is not a local or configured development host; the browser can see its cookies and headers`,
    };
  }
  return { ok: true };
}

/**
 * The permission gate for one companion MCP tool call. Fails closed:
 *
 * - {@link companionGate}: consent not an explicit `true` denies; a copy not at the pin, not
 *   enabled, or beside another copy asks.
 * - Chrome DevTools MCP, on every action: a navigation to a URL or a new page needs an explicit
 *   http(s) URL on a local or configured host; every other action, a reload included, needs the
 *   session's current page to be known and on such a host; back and forward, a page script, a
 *   file upload and an unknown tool always ask. A missing URL is never taken for a local one.
 * - Figma MCP: any tool that is not a known read asks.
 * - After a failed call: no decision, a note for Claude with the fallback.
 *
 * @param {object} options
 * @param {string} options.toolName
 * @param {Record<string, any>} options.toolInput
 * @param {Companion[]} options.companions
 * @param {CompanionStatus[]} options.statuses
 * @param {string[]} [options.browserHosts]
 * @param {string | null} [options.currentPage] The browser companion's current page URL.
 * @returns {{ companion: string, decision: "ask" | "deny" | null, reason: string, context: string } | null}
 */
export function gateToolCall({
  toolName,
  toolInput,
  companions,
  statuses,
  browserHosts = [],
  currentPage = null,
}) {
  const companion = companionForTool(toolName, companions);
  if (companion === null) return null;
  const status = statuses.find((entry) => entry.name === companion.name);
  const tool = toolName.slice(companion.toolPrefix.length);
  const rule = { "chrome-devtools-mcp": "SEC-074", figma: "SEC-075" }[companion.name] ?? null;
  const result = (decision, reason) => ({
    companion: companion.name,
    decision,
    reason,
    context: `${reason} Tell the user plainly when a companion is unavailable, and offer the fallback: ${companion.fallback}`,
  });

  const gate = companionGate(companion, status, rule);
  if (gate !== null) return result(gate.decision, gate.reason);

  if (companion.name === "chrome-devtools-mcp") {
    const ask = (why) =>
      result(
        "ask",
        `The browser companion: ${why}; confirm this ${tool} call only for a local or test environment (SEC-074, SEC-048).`,
      );
    const target = (url, what) => {
      const check = checkBrowserUrl(url, browserHosts);
      return check.ok ? null : ask(`${what}: ${check.why}`);
    };
    const onCurrentPage = () =>
      currentPage === null
        ? ask(
            "the current page of this session is not known (open the local development URL with navigate_page first)",
          )
        : target(currentPage, `the current page ${cut(currentPage, 80)}`);
    let blocked;
    if (tool === "navigate_page") {
      const type = toolInput?.type ?? (toolInput?.url !== undefined ? "url" : null);
      if (type === "url") blocked = target(toolInput?.url, "the page to open");
      else if (type === "reload") blocked = onCurrentPage();
      else
        blocked = ask(
          `a ${type ?? "navigation"} without a URL leads to a page that cannot be checked`,
        );
    } else if (tool === "new_page") {
      blocked = target(toolInput?.url, "the page to open");
    } else if (tool === "evaluate_script") {
      blocked = ask("a script in the page can read the page's data");
    } else if (tool === "upload_file") {
      blocked = ask("an upload sends a local file to the page");
    } else if (CHROME_SAFE_TOOLS.has(tool)) {
      blocked = onCurrentPage();
    } else {
      blocked = ask(`${tool} is not on the Standard's reviewed list`);
    }
    if (blocked !== null) return blocked;
  }

  if (companion.name === "figma" && !FIGMA_READ_TOOLS.has(tool)) {
    return result(
      "ask",
      `The Figma companion tool ${tool} can change a Figma file; confirm it (SEC-075).`,
    );
  }

  if (status?.state === "unhealthy") {
    return {
      companion: companion.name,
      decision: null,
      reason: "",
      context: `${companion.title} failed on its last call (${status.healthDetail ?? "no detail"}). If this call fails too, stop using it and tell the user: ${companion.fallback}`,
    };
  }
  return null;
}

/**
 * The gate for a Skill tool call to a companion's skill: {@link companionGate}. Null for any
 * other skill, and when the companion may be used.
 *
 * @param {object} options
 * @param {unknown} options.skill
 * @param {Companion[]} options.companions
 * @param {CompanionStatus[]} options.statuses
 * @returns {{ companion: string, decision: "ask" | "deny", reason: string, context: string } | null}
 */
export function gateSkillCall({ skill, companions, statuses }) {
  const companion = companionForSkill(skill, companions);
  if (companion === null) return null;
  const status = statuses.find((entry) => entry.name === companion.name);
  const gate = companionGate(companion, status, null);
  if (gate === null) return null;
  return {
    companion: companion.name,
    decision: gate.decision,
    reason: gate.reason,
    context: `${gate.reason} Do not use the ${String(skill)} skill; tell the user and offer the fallback: ${companion.fallback}`,
  };
}

/**
 * Shell commands that install or enable a companion outside the consent flow. Fails closed:
 * without an explicit `true` in the project's consent record (declined, unanswered, missing or
 * invalid) the answer is `deny`; with it, an install from another marketplace asks. Matches `claude plugin install|i|
 * enable <name>[@<marketplace>]` anywhere in the command.
 *
 * @param {object} options
 * @param {string} options.command
 * @param {Companion[]} options.companions
 * @param {Record<string, boolean>} options.consent
 * @returns {{ companion: string, decision: "ask" | "deny", reason: string }[]}
 */
export function inspectCompanionCommand({ command, companions, consent }) {
  if (typeof command !== "string") return [];
  const names = new Set(companions.map((companion) => companion.name));
  const findings = [];
  const pattern =
    /\bclaude\s+plugins?\s+(install|i|enable)\s+(?:--?[\w-]+(?:[= ][^\s-][^\s]*)?\s+)*([\w.-]+)(?:@([\w.-]+))?/g;
  for (const match of command.matchAll(pattern)) {
    const [, verb, name, marketplace] = match;
    if (!names.has(name)) continue;
    if (consent[name] === false) {
      findings.push({
        companion: name,
        decision: "deny",
        reason: `${name} was declined for this project (companions in .cross-stack/standard.json); change the answer with /cross-stack-standard:adopt first.`,
      });
    } else if (consent[name] !== true) {
      findings.push({
        companion: name,
        decision: "deny",
        reason: `${name} has no recorded consent for this project (companions.${name} must be true in .cross-stack/standard.json); answer it with /cross-stack-standard:adopt first.`,
      });
    } else if (marketplace !== MARKETPLACE) {
      findings.push({
        companion: name,
        decision: "ask",
        reason: `This ${verb === "enable" ? "enables" : "installs"} ${name}${marketplace ? `@${marketplace}` : ""}, not the pinned ${name}@${MARKETPLACE}; confirm only if you want an unpinned copy.`,
      });
    }
  }
  return findings;
}
