/**
 * Hook input and output. Claude Code writes one JSON object to the hook's stdin and reads the
 * exit code, stdout and stderr:
 *
 * - exit 0: stdout is parsed as JSON when it is JSON (for example `{"systemMessage": "…"}`, a
 *   notice shown to the user); for SessionStart, plain-text stdout is added to Claude's context.
 *   Stderr goes to the debug log only.
 * - exit 2: stderr is fed to Claude (blocking on the events that can block).
 *
 * Every notice of the Standard's hooks therefore travels as a JSON `systemMessage` on stdout,
 * never as stderr with exit 0. Output is written synchronously so that the entry point can exit
 * straight after writing without losing it.
 *
 * @module plugins/cross-stack-standard/scripts/lib/io
 */

import fs from "node:fs";
import process from "node:process";

/** Largest hook input read (a Write of a large file carries its whole content). */
export const MAX_STDIN_BYTES = 64 * 1024 * 1024;

/** How long the entry point waits for stdin to close. */
export const STDIN_TIMEOUT_MS = 10_000;

/** Longest notice, in characters; Claude Code caps a `systemMessage` at 10,000. */
export const MAX_NOTICE_CHARS = 600;

/** Prefix of every user-visible notice. */
export const NOTICE_PREFIX = "Cross-Stack Standard: ";

/**
 * @typedef {object} StdinRead
 * @property {string} text
 * @property {string | null} error Why the input is incomplete (`timeout`, `too large`, …).
 */

/**
 * Reads all of stdin as UTF-8. A terminal on stdin (a manual run) reads as empty input.
 *
 * @param {{ stream?: NodeJS.ReadableStream & { isTTY?: boolean }, timeoutMs?: number, maxBytes?: number }} [options]
 * @returns {Promise<StdinRead>}
 */
export function readStdin(options = {}) {
  const {
    stream = process.stdin,
    timeoutMs = STDIN_TIMEOUT_MS,
    maxBytes = MAX_STDIN_BYTES,
  } = options;
  if (stream.isTTY) return Promise.resolve({ text: "", error: null });
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.removeAllListeners("data");
      if (error !== null && typeof stream.destroy === "function") stream.destroy();
      resolve({ text: Buffer.concat(chunks).toString("utf8"), error });
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        finish("too large");
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => finish(null));
    stream.on("error", (error) => finish(error?.code ?? "read error"));
  });
}

/**
 * Parses the hook input. Anything but a JSON object is rejected with a short reason.
 *
 * @param {StdinRead} read
 * @returns {{ ok: true, input: Record<string, any> } | { ok: false, reason: string }}
 */
export function parseHookInput(read) {
  if (read.error !== null) return { ok: false, reason: `stdin ${read.error}` };
  const text = read.text.startsWith("\uFEFF") ? read.text.slice(1) : read.text;
  if (text.trim() === "") return { ok: false, reason: "empty input" };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "input is not valid JSON" };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "input is not a JSON object" };
  }
  return { ok: true, input: value };
}

/**
 * @typedef {object} HookResult
 * @property {number} [exitCode] 0 (default) or 2; 2 feeds stderr to Claude.
 * @property {string} [stdout] Plain text (SessionStart context).
 * @property {Record<string, any>} [json] Written to stdout as one line of JSON; wins over stdout.
 * @property {string} [stderr]
 */

/**
 * A notice with the Standard's prefix, cut to {@link MAX_NOTICE_CHARS}.
 *
 * @param {string} message
 * @returns {string}
 */
export function notice(message) {
  const text = `${NOTICE_PREFIX}${message}`;
  return text.length <= MAX_NOTICE_CHARS ? text : `${text.slice(0, MAX_NOTICE_CHARS - 1)}…`;
}

/**
 * The fail-open result: exit 0 with a user-visible notice.
 *
 * @param {string} message
 * @returns {HookResult}
 */
export function failOpen(message) {
  return { exitCode: 0, json: { systemMessage: notice(message) } };
}

/**
 * Turns a handler's result into exactly what the process writes. Anything a handler returns
 * that is not a usable result becomes a silent exit 0.
 *
 * @param {HookResult | undefined | null} result
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
export function renderResult(result) {
  const exitCode =
    Number.isInteger(result?.exitCode) && result.exitCode >= 0 && result.exitCode <= 255
      ? result.exitCode
      : 0;
  let stdout = "";
  if (result?.json !== undefined && result.json !== null) {
    stdout = `${JSON.stringify(result.json)}\n`;
  } else if (typeof result?.stdout === "string") {
    stdout = result.stdout;
  }
  const stderr = typeof result?.stderr === "string" ? result.stderr : "";
  return { exitCode, stdout, stderr };
}

/**
 * Writes all of `text` to a file descriptor synchronously, retrying while a non-blocking pipe
 * is full.
 *
 * @param {number} fd
 * @param {string} text
 */
export function writeAllSync(fd, text) {
  const buffer = Buffer.from(text, "utf8");
  let offset = 0;
  let retries = 0;
  while (offset < buffer.length) {
    try {
      offset += fs.writeSync(fd, buffer, offset, buffer.length - offset);
      retries = 0;
    } catch (error) {
      if (error?.code !== "EAGAIN" || retries >= 1000) throw error;
      retries += 1;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    }
  }
}
