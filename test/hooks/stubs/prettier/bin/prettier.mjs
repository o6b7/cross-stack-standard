#!/usr/bin/env node
/**
 * Test stub standing in for Prettier (`prettier --write --ignore-unknown <file>`). The
 * PostToolUse tests copy this package into a temporary project's node_modules/prettier; the hook
 * resolves it like the real one (package.json "bin", run with process.execPath).
 *
 * It "formats" the file in place (trailing whitespace removed, tabs turned into two spaces, one
 * final newline) and prints the file name to stdout, as Prettier does. The file drives it:
 *
 *   STUB:prettier-fail        Prettier's syntax-error output on stderr, exit 2
 *   STUB:prettier-hang        never ends
 *   STUB:prettier-hang-tree   starts a child process, then never ends
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
  const line = { tool: "prettier", argv, cwd: process.cwd(), pid: process.pid, env, ...extra };
  fs.appendFileSync(log, `${JSON.stringify(line)}\n`);
}

if (source.includes("STUB:prettier-hang")) {
  let childPid = null;
  if (source.includes("STUB:prettier-hang-tree")) {
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
  const shown = path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/");
  if (source.includes("STUB:prettier-fail")) {
    process.stderr.write(
      `[error] ${shown}: SyntaxError: Unexpected token (1:1)\n[error] > 1 | STUB:prettier-fail\n`,
    );
    process.exit(2);
  }
  const formatted = `${source.replace(/\t/g, "  ").replace(/[ ]+$/gm, "").replace(/\n*$/, "")}\n`;
  if (formatted !== source) fs.writeFileSync(file, formatted);
  process.stdout.write(`${shown} 3ms\n`);
}
