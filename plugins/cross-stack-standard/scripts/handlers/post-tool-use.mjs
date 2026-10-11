/**
 * PostToolUse (matcher `Edit|Write|NotebookEdit`, and the companions' MCP tools, whose successful
 * calls mark the companion healthy: see post-tool-use-failure.mjs): formats the file Claude just edited with the
 * project's own formatter, then lints that file and reports the problems back to Claude.
 *
 * For the edited file only (`tool_input.file_path`, or `notebook_path`):
 *
 * 1. Skipped silently when the path is outside the project directory (after resolving symbolic
 *    links), inside a dependency, build or tool directory (`node_modules`, `vendor`, `.git`,
 *    and the rest of the list in lib/detect.mjs), not an existing file, or not a code file.
 * 2. Formatter, when installed: Prettier (js, ts, json, css, scss, md, yml and their variants) or
 *    Pint (php). The run always continues to the linter; a formatter that fails leaves a notice.
 * 3. Linter, when installed: ESLint from the track root (js and ts variants), or PHPStan on the
 *    file when `hooks.postToolUse.phpstan` is true (php). Problems exit 2 with one
 *    `<path>:<line>:<column> <rule> <message>` line each on stderr (at most 30, with a count),
 *    which Claude Code shows to Claude. PostToolUse cannot block: the edit has happened; this is
 *    feedback so Claude fixes the file while it is still in context.
 *
 * Tools and their results are described in lib/formatters.mjs. A tool that is not installed is
 * skipped silently. A tool that crashes or rejects its configuration (ESLint exit 2, PHPStan
 * errors that belong to no file) gives exit 0 with a JSON `systemMessage` for the user: a broken
 * setup never turns into feedback that asks Claude to fix the file.
 *
 * The whole run is time-boxed by `hooks.postToolUse.budgetSeconds` (the entry point starts the
 * budget before calling this handler): every tool gets only the time left, and a tool that runs
 * past it is stopped with its process tree; the hook then exits 0 with a notice. The entry
 * point's watchdog, a few seconds later, is only a backstop.
 *
 * Paths from Claude Code arrive with backslashes on Windows; they are normalised before use, and
 * paths in messages are project-relative with `/` separators.
 *
 * @module plugins/cross-stack-standard/scripts/handlers/post-tool-use
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createBudget, DEFAULT_POST_TOOL_USE_BUDGET_SECONDS } from "../lib/budget.mjs";
import { PRUNED_DIRS } from "../lib/detect.mjs";
import {
  classifyFile,
  interpretFormat,
  interpretLint,
  planEslint,
  planPhpstan,
  planPint,
  planPrettier,
  problemReport,
} from "../lib/formatters.mjs";
import { failOpen } from "../lib/io.mjs";
import { MANIFEST_PATH } from "../lib/manifest.mjs";
import { isFile, isWithin, realPath, relativePosix } from "../lib/project.mjs";
import { runTool } from "../lib/spawn.mjs";
import { recordCompanionSuccess } from "./post-tool-use-failure.mjs";

/** Directory names whose files are never formatted or linted (dependencies, build output). */
export const SKIPPED_DIRS = PRUNED_DIRS;

/** Time between terminating and killing a tool that ran past the budget. */
export const KILL_GRACE_MS = 1_000;

/** Most bytes kept of a tool's output; a JSON report carries the file's source. */
export const MAX_TOOL_OUTPUT_BYTES = 16 * 1024 * 1024;

const SKIPPED = new Set(SKIPPED_DIRS);

/**
 * The absolute path of an edited file. Backslashes are separators on Windows; elsewhere they are
 * turned into `/` only when the path does not exist as written (a Windows-style path, since a
 * real file name with a backslash does exist). A relative path resolves against `cwd`.
 *
 * @param {string} raw `tool_input.file_path` as Claude Code sent it.
 * @param {string} cwd The hook's working directory.
 * @param {{ platform?: string, exists?: (file: string) => boolean }} [options]
 * @returns {string}
 */
export function normaliseFilePath(raw, cwd, options = {}) {
  const { platform = process.platform, exists = (file) => fs.existsSync(file) } = options;
  if (platform === "win32") return path.win32.resolve(cwd, raw);
  let value = raw;
  if (value.includes("\\") && !exists(path.posix.resolve(cwd, value))) {
    value = value.replace(/\\/g, "/");
  }
  return path.posix.resolve(cwd, value);
}

/**
 * @typedef {object} EditedFile
 * @property {string} file Canonical absolute path.
 * @property {string} target Project-relative path with `/` separators, as shown in messages.
 * @property {string} projectDir Canonical project directory.
 * @property {import("../lib/formatters.mjs").FileKinds} kinds
 */

/**
 * The edited file, when it is one the hook formats or lints; otherwise why not.
 *
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {{ file: EditedFile } | { skip: string }}
 */
export function editedFile(ctx) {
  const toolInput = ctx.input?.tool_input;
  const raw = [toolInput?.file_path, toolInput?.notebook_path].find(
    (value) => typeof value === "string" && value !== "",
  );
  if (raw === undefined) return { skip: "the tool input names no file" };

  const file = realPath(normaliseFilePath(raw, ctx.cwd));
  const projectDir = realPath(ctx.projectDir);
  if (!isWithin(file, projectDir) || file === projectDir) {
    return { skip: "outside the project directory" };
  }
  const target = relativePosix(projectDir, file);
  const skippedDir = target.split("/").find((segment) => SKIPPED.has(segment));
  if (skippedDir !== undefined) return { skip: `inside ${skippedDir}/` };
  const kinds = classifyFile(file);
  if (kinds === null) return { skip: "not a file the hook formats or lints" };
  if (!isFile(file)) return { skip: "not an existing file" };
  return { file: { file, target, projectDir, kinds } };
}

/**
 * @param {import("../hook.mjs").HookContext} ctx
 * @returns {Promise<import("../lib/io.mjs").HookResult>}
 */
export default async function postToolUse(ctx) {
  if (typeof ctx.input.tool_name === "string" && ctx.input.tool_name.startsWith("mcp__")) {
    return recordCompanionSuccess(ctx);
  }
  const edited = editedFile(ctx);
  if ("skip" in edited) {
    ctx.log.debug(`PostToolUse: nothing to check (${edited.skip})`);
    return { exitCode: 0 };
  }
  const { file, target, projectDir, kinds } = edited.file;
  const budget =
    ctx.budget ??
    createBudget(
      (ctx.config?.postToolUse?.budgetSeconds ?? DEFAULT_POST_TOOL_USE_BUDGET_SECONDS) * 1000,
    );
  /** Sentences for the user: formatter failures and tool failures. */
  const notes = [];

  const run = async (plan) => {
    const result = await runTool({
      command: plan.command,
      args: plan.args,
      cwd: plan.cwd,
      timeoutMs: budget.timeoutFor(),
      killGraceMs: KILL_GRACE_MS,
      maxBufferBytes: MAX_TOOL_OUTPUT_BYTES,
    });
    ctx.log.debug(
      `PostToolUse: ${plan.name} in ${plan.cwd}: exit ${result.exitCode ?? result.signal}, ` +
        `${result.durationMs} ms${result.timedOut ? ", stopped at the budget" : ""}` +
        `${result.error === null ? "" : `, ${result.error.code}`}`,
    );
    return result;
  };

  const overrun = (toolName) => {
    const seconds = Math.round(budget.totalMs / 1000);
    return failOpen(
      [
        `the checks of ${target} ran past the PostToolUse budget of ${seconds} s while ` +
          `${toolName} was running and were stopped, so this edit got no lint feedback. ` +
          `hooks.postToolUse.budgetSeconds in ${MANIFEST_PATH} sets the budget.`,
        ...notes,
      ].join(" "),
    );
  };

  const formatter = kinds.php
    ? planPint({ file, projectDir })
    : kinds.prettier
      ? planPrettier({ file, projectDir })
      : null;
  if (formatter !== null) {
    const result = await run(formatter);
    if (result.timedOut) return overrun(formatter.name);
    const note = interpretFormat(formatter, result, target);
    if (note !== null) notes.push(note);
  }

  const linter = kinds.eslint
    ? planEslint({ file, projectDir })
    : kinds.php && ctx.config?.postToolUse?.phpstan === true
      ? planPhpstan({ file, projectDir })
      : null;
  if (linter !== null) {
    if (budget.expired()) return overrun(linter.name);
    const result = await run(linter);
    if (result.timedOut) return overrun(linter.name);
    const { problems, failure } = interpretLint(linter, result, target);
    if (problems.length > 0) {
      const report = problemReport({ tool: linter.name, target, problems, projectDir });
      const extra = notes.map((note) => `Note: ${note}\n`).join("");
      return { exitCode: 2, stderr: `${report}${extra}` };
    }
    if (failure !== null) notes.push(failure);
  }

  return notes.length > 0 ? failOpen(notes.join(" ")) : { exitCode: 0 };
}
