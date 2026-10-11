#!/usr/bin/env node
/**
 * Test stub standing in for ESLint (`eslint [options] <file>`). The PostToolUse tests copy this
 * package into a temporary project's node_modules/eslint; the hook resolves it like the real
 * one (package.json "bin", run with process.execPath).
 *
 * It prints a report in ESLint's JSON format (`--format json`) and exits like ESLint: 0 clean,
 * 1 problems (an error, or more warnings than `--max-warnings`), 2 a crash. The linted file
 * drives it:
 *
 *   lint-error <rule> <message>     an error on that line, at the marker's column
 *   lint-warning <rule> <message>   a warning
 *   lint-fatal <message>            a parse error (no rule id)
 *   lint-multiline <rule>           an error whose message spans lines
 *   STUB:eslint-many=<n>            n errors
 *   STUB:eslint-crash               ESLint's crash output, exit 2
 *   STUB:eslint-bad-json            text instead of JSON, exit 1
 *   STUB:eslint-exit=<n>            exit n with no output
 *   STUB:eslint-noise               a line printed before the JSON report
 *   STUB:eslint-hang                never ends
 *   STUB:eslint-hang-tree           starts a child process, then never ends
 *
 * With HOOK_STUB_LOG set, each run appends one JSON line: tool, argv, cwd, pid (and the pid of
 * the child it started) and the environment variables the hook sets for tools.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const argv = process.argv.slice(2);
const file = argv.at(-1);
const source = fs.readFileSync(file, "utf8");

function record(extra = {}) {
  const log = process.env.HOOK_STUB_LOG;
  if (!log) return;
  const env = Object.fromEntries(
    [
      "PAO_DISABLE",
      "NO_COLOR",
      "FORCE_COLOR",
      "npm_config_update_notifier",
      "COREPACK_ENABLE_NETWORK",
      "COREPACK_ENABLE_DOWNLOAD_PROMPT",
      "NEXT_TELEMETRY_DISABLED",
    ].map((name) => [name, process.env[name] ?? null]),
  );
  const line = { tool: "eslint", argv, cwd: process.cwd(), pid: process.pid, env, ...extra };
  fs.appendFileSync(log, `${JSON.stringify(line)}\n`);
}

if (source.includes("STUB:eslint-hang")) {
  let childPid = null;
  if (source.includes("STUB:eslint-hang-tree")) {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
      stdio: "ignore",
      shell: false,
    });
    childPid = child.pid;
  }
  record({ childPid });
  setInterval(() => {}, 1000);
} else {
  record();
  main();
}

function main() {
  if (source.includes("STUB:eslint-crash")) {
    process.stderr.write(
      "\nOops! Something went wrong! :(\n\nESLint: 9.39.5\n\n" +
        'TypeError: Key "rules": Key "no-such-rule": Could not find "no-such-rule" in plugin "@".\n' +
        "    at throwRuleNotFoundError (node_modules/eslint/lib/config/config.js:100:16)\n",
    );
    process.exit(2);
  }
  if (source.includes("STUB:eslint-bad-json")) {
    process.stdout.write("src/a.ts: 1 problem\n");
    process.exit(1);
  }
  const exitMatch = /STUB:eslint-exit=(\d+)/.exec(source);
  if (exitMatch) process.exit(Number(exitMatch[1]));

  const messages = [];
  const manyMatch = /STUB:eslint-many=(\d+)/.exec(source);
  if (manyMatch) {
    for (let index = 1; index <= Number(manyMatch[1]); index += 1) {
      messages.push(error(index, 1, "no-magic-numbers", `No magic number: ${index}.`));
    }
  }
  source.split("\n").forEach((text, index) => {
    const line = index + 1;
    let match = /lint-(error|warning) (\S+) (.+)$/.exec(text);
    if (match) {
      const message = error(line, match.index + 1, match[2], match[3].trim());
      if (match[1] === "warning") message.severity = 1;
      messages.push(message);
      return;
    }
    match = /lint-fatal (.+)$/.exec(text);
    if (match) {
      messages.push({
        ruleId: null,
        nodeType: null,
        fatal: true,
        severity: 2,
        message: match[1].trim(),
        line,
        column: match.index + 1,
      });
      return;
    }
    match = /lint-multiline (\S+)/.exec(text);
    if (match) {
      messages.push(error(line, match.index + 1, match[1], "First line.\n    Second line."));
    }
  });

  const errorCount = messages.filter((message) => message.severity === 2).length;
  const warningCount = messages.length - errorCount;
  const report = [
    {
      filePath: path.resolve(file),
      messages,
      suppressedMessages: [],
      errorCount,
      fatalErrorCount: messages.filter((message) => message.fatal).length,
      warningCount,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      ...(messages.length > 0 ? { source } : {}),
      usedDeprecatedRules: [],
    },
  ];
  if (source.includes("STUB:eslint-noise")) process.stdout.write("Loaded the project config.\n");
  process.stdout.write(`${JSON.stringify(report)}\n`);

  const maxArg = argv.find((arg) => arg.startsWith("--max-warnings="));
  const maxWarnings = maxArg === undefined ? -1 : Number(maxArg.split("=")[1]);
  const tooManyWarnings = maxWarnings >= 0 && warningCount > maxWarnings;
  if (tooManyWarnings) {
    process.stderr.write(`ESLint found too many warnings (maximum: ${maxWarnings}).\n`);
  }
  process.exitCode = errorCount > 0 || tooManyWarnings ? 1 : 0;
}

function error(line, column, ruleId, message) {
  return { ruleId, severity: 2, message, line, column, nodeType: "Identifier" };
}
