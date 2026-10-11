/**
 * SessionStart: tells Claude, in a few factual lines, which parts of the Standard apply.
 *
 * - With `.cross-stack/standard.json`: its tracks, profile, tier and enabled modules.
 * - Without it: the tracks found by the bounded fallback walk (see lib/detect.mjs), and a hint
 *   that `/cross-stack-standard:adopt` sets the project up.
 * - Always: the tier, or "tier not declared: ask", and that the cross-stack-standard skill is
 *   used before application code is modified.
 * - The startup capability check of the companion plugins (lib/companions.mjs): one status line
 *   and the rule for using them, when any companion is installed or was answered in adopt.
 *
 * Silent when nothing is detected and there is no manifest, and when
 * `hooks.sessionStart.detect` is false (or `CROSS_STACK_STANDARD_SESSION_START_DETECT=0`).
 *
 * Plain-text stdout of a SessionStart hook is added to Claude's context (Claude Code caps it at
 * 10,000 characters). This output stays under {@link MAX_OUTPUT_CHARS}, because it enters
 * every session, and is written as statements of fact, as the hooks documentation advises.
 *
 * The repository controls the manifest and the file names, so only validated values reach the
 * context: the version when it is a SemVer string of at most {@link MAX_VERSION_CHARS}
 * characters (else "version invalid"), module names the schema knows, counts instead of the
 * text of unknown entries, and every other repository-supplied value (paths, problem messages)
 * with control and format characters replaced and cut to its own cap. Each line has a cap too,
 * so one field cannot push the rest of the reminder out.
 *
 * @module plugins/cross-stack-standard/scripts/handlers/session-start
 */

import { appendLog, loadStatus, STATUS_RULE, statusLine } from "../lib/companions.mjs";
import { detectTracks } from "../lib/detect.mjs";
import { loadStandardSchema, MANIFEST_PATH } from "../lib/manifest.mjs";

/** Upper bound on the output, in characters. */
export const MAX_OUTPUT_CHARS = 1_000;

/** Upper bound on one line, in characters. */
export const MAX_LINE_CHARS = 300;

/** Longest version shown; a longer value is reported as invalid. */
export const MAX_VERSION_CHARS = 32;

/** Upper bound on one listed problem message. */
const MAX_PROBLEM_CHARS = 100;

/** Upper bound on one detected manifest path. */
const MAX_PATH_CHARS = 80;

/** Manifest paths listed per detected track before the rest are counted. */
const SOURCES_PER_TRACK = 2;

/** Problems listed before the rest are counted. */
const PROBLEMS_LISTED = 3;

const SKILL_LINE =
  "Project rule: use the cross-stack-standard skill before modifying application code.";
const ADOPT_LINE =
  "Not adopted yet: /cross-stack-standard:adopt writes the manifest and installs the gates.";

/** Control, format, surrogate and line/paragraph separator characters. */
const UNSAFE_CHARS = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu;

/**
 * A repository-supplied value made safe for one line of context: unsafe characters replaced
 * with `?`, and cut to `max` characters.
 *
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
export function cleanValue(value, max) {
  const text = String(value)
    .slice(0, max + 1)
    .replace(UNSAFE_CHARS, "?");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function tierLine(tier) {
  return tier === null ? "Tier not declared: ask." : `Tier: ${tier}.`;
}

function listWithMore(items, limit) {
  const shown = items.slice(0, limit).join(", ");
  return items.length > limit ? `${shown} +${items.length - limit} more` : shown;
}

function problemsLine(label, problems) {
  if (problems.length === 0) return null;
  const listed = problems.map((problem) => cleanValue(problem, MAX_PROBLEM_CHARS));
  return `${label}: ${listWithMore(listed, PROBLEMS_LISTED)}.`;
}

/** The lines that fit the output cap, each cut to its own cap; a line that does not fit is skipped. */
function cap(lines) {
  let text = "";
  for (const line of lines) {
    const next = `${text}${cleanValue(line, MAX_LINE_CHARS)}\n`;
    if (next.length > MAX_OUTPUT_CHARS) continue;
    text = next;
  }
  return text;
}

/** The manifest schema the settings were validated with, or null when it cannot be read. */
function schemaOrNull() {
  try {
    return loadStandardSchema();
  } catch {
    return null;
  }
}

/**
 * Whether a manifest `version` may be shown: a string of at most {@link MAX_VERSION_CHARS}
 * characters that matches the schema's SemVer pattern.
 *
 * @param {unknown} value
 * @param {Record<string, any> | null} schema
 * @returns {boolean}
 */
export function isShowableVersion(value, schema) {
  if (typeof value !== "string" || value.length > MAX_VERSION_CHARS) return false;
  const pattern = schema?.properties?.version?.pattern;
  if (typeof pattern !== "string") return false;
  try {
    return new RegExp(pattern, "u").test(value);
  } catch {
    return false;
  }
}

/**
 * The enabled module names the schema knows, and how many keys of the manifest's `modules` it
 * does not know.
 *
 * @param {import("../lib/manifest.mjs").ManifestInfo} manifest
 * @param {Record<string, any> | null} schema
 * @returns {{ shown: string[], unknown: number }}
 */
function moduleSummary(manifest, schema) {
  const known = new Set(Object.keys(schema?.properties?.modules?.properties ?? {}));
  const raw = manifest.manifest?.modules;
  const keys =
    raw !== null && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : [];
  return {
    shown: manifest.modules.filter((name) => known.has(name)),
    unknown: keys.filter((name) => !known.has(name)).length,
  };
}

/**
 * The manifest's problems, plus a count of unknown module names.
 *
 * @param {import("../lib/manifest.mjs").ManifestInfo} manifest
 * @param {Record<string, any> | null} schema
 * @returns {string[]}
 */
function manifestProblems(manifest, schema) {
  const { unknown } = moduleSummary(manifest, schema);
  if (unknown === 0) return manifest.problems;
  const entries = unknown === 1 ? "1 unknown entry" : `${unknown} unknown entries`;
  return [...manifest.problems, `"modules" has ${entries}`];
}

/**
 * Lines for a project that has a manifest with usable tracks.
 *
 * @param {import("../lib/manifest.mjs").ManifestInfo} manifest
 * @param {Record<string, any> | null} schema
 * @returns {string[]}
 */
function manifestLines(manifest, schema) {
  const raw = manifest.manifest?.version;
  const version =
    raw === undefined ? "" : `, version ${isShowableVersion(raw, schema) ? raw : "invalid"}`;
  const profile =
    manifest.profile !== null && manifest.tracks.includes("web")
      ? ` (web profile ${manifest.profile})`
      : "";
  const { shown } = moduleSummary(manifest, schema);
  return [
    `Cross-Stack Standard project (${MANIFEST_PATH}${version}).`,
    `Tracks: ${manifest.tracks.join(", ")}${profile}.`,
    tierLine(manifest.tier),
    ...(shown.length > 0 ? [`Modules: ${shown.join(", ")}.`] : []),
  ];
}

/**
 * Lines for tracks found by the fallback walk.
 *
 * @param {import("../lib/detect.mjs").Detection} detection
 * @param {boolean} hasManifest
 * @returns {string[]}
 */
function detectedLines(detection, hasManifest) {
  const tracks = detection.tracks.map((track) => {
    const sources = detection.sources[track].map((source) => cleanValue(source, MAX_PATH_CHARS));
    return `${track} (${listWithMore(sources, SOURCES_PER_TRACK)})`;
  });
  const lines = [
    hasManifest
      ? `Cross-Stack Standard: ${MANIFEST_PATH} lists no usable tracks; tracks detected from project files.`
      : `Cross-Stack Standard: no ${MANIFEST_PATH}; tracks detected from project files.`,
    `Tracks: ${tracks.join(", ")}.`,
  ];
  if (detection.truncated !== null) {
    lines.push(
      `Detection stopped early (${detection.truncated} limit); deeper stacks may be missing.`,
    );
  }
  return lines;
}

/**
 * The companion status line and its rule, or nothing. Status problems never fail the reminder.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {string[]}
 */
export function companionLines(ctx) {
  try {
    const { statuses } = loadStatus({
      pluginRoot: ctx.pluginRoot,
      projectRoot: ctx.projectRoot,
      env: ctx.env,
      manifest: ctx.manifest?.manifest ?? null,
      dataDir: ctx.dataDir,
    });
    const line = statusLine(statuses);
    if (line === null) return [];
    appendLog(ctx.dataDir, {
      event: "status",
      source: "session-start",
      companions: Object.fromEntries(statuses.map((status) => [status.name, status.state])),
    });
    return [line, STATUS_RULE];
  } catch (error) {
    ctx.log.debug(`companion status skipped: ${error?.message ?? error}`);
    return [];
  }
}

/**
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {Promise<import("../lib/io.mjs").HookResult>}
 */
export default async function sessionStart(ctx) {
  if (ctx.config.sessionStart.detect === false) return { exitCode: 0 };
  const { manifest } = ctx;
  const configProblems = problemsLine("Settings ignored", ctx.configProblems);
  const schema = manifest === null ? null : schemaOrNull();

  if (manifest !== null && manifest.tracks.length > 0) {
    const lines = [
      ...manifestLines(manifest, schema),
      SKILL_LINE,
      ...companionLines(ctx),
      problemsLine(`${MANIFEST_PATH} problems`, manifestProblems(manifest, schema)),
      configProblems,
    ].filter((line) => line !== null);
    return { exitCode: 0, stdout: cap(lines) };
  }

  const detection = detectTracks(ctx.projectRoot);
  ctx.log.debug(
    `detection: ${detection.tracks.join(",") || "none"} in ${detection.durationMs} ms ` +
      `(${detection.dirs} dirs, ${detection.entries} entries, truncated ${detection.truncated})`,
  );

  if (detection.tracks.length === 0) {
    if (manifest === null) return { exitCode: 0 };
    const lines = [
      `Cross-Stack Standard project (${MANIFEST_PATH}); no tracks could be determined.`,
      tierLine(manifest.tier),
      SKILL_LINE,
      ...companionLines(ctx),
      problemsLine(`${MANIFEST_PATH} problems`, manifestProblems(manifest, schema)),
      configProblems,
    ].filter((line) => line !== null);
    return { exitCode: 0, stdout: cap(lines) };
  }

  const lines = [
    ...detectedLines(detection, manifest !== null),
    tierLine(manifest?.tier ?? null),
    SKILL_LINE,
    ...companionLines(ctx),
    manifest === null
      ? ADOPT_LINE
      : problemsLine(`${MANIFEST_PATH} problems`, manifestProblems(manifest, schema)),
    configProblems,
  ].filter((line) => line !== null);
  return { exitCode: 0, stdout: cap(lines) };
}
