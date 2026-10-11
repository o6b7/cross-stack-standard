/**
 * Test-only preload (`node --import <this file> hook.mjs …`) that records what a hook run does,
 * so a test can prove that an opted-out project loads no handler and starts no child process.
 *
 * When `HOOK_TEST_SPY_LOG` names a file, each line appended to it is one of:
 *
 *   child_process.<function> <program>     any child process the run starts
 *   load <url>                             any module resolved under scripts/handlers/
 *
 * Child processes: the functions of node:child_process are wrapped and the change is pushed to
 * ES module importers with syncBuiltinESMExports(), before the entry point is loaded. Handler
 * loads: a module resolution hook (spy-loader.mjs) registered with node:module.
 */

import fs from "node:fs";
import { createRequire, register, syncBuiltinESMExports } from "node:module";
import process from "node:process";

const log = process.env.HOOK_TEST_SPY_LOG;

if (log) {
  const require = createRequire(import.meta.url);
  const childProcess = require("node:child_process");
  for (const name of [
    "spawn",
    "spawnSync",
    "execFile",
    "execFileSync",
    "fork",
    "exec",
    "execSync",
  ]) {
    const original = childProcess[name];
    childProcess[name] = function spied(...args) {
      fs.appendFileSync(log, `child_process.${name} ${String(args[0])}\n`);
      return original.apply(this, args);
    };
  }
  syncBuiltinESMExports();
  register("./spy-loader.mjs", { parentURL: import.meta.url, data: { log } });
}
