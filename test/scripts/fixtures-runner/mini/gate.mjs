#!/usr/bin/env node
/**
 * Test double for a gate, used by the fixture-runner tests.
 *
 * It behaves like a linter whose findings are declared in the files it checks: every line of
 * every file under `src/` (in the current directory) may hold one directive.
 *
 *   VIOLATION <ID> <message>        print "<ID> src/<file>:<line> <message>" and fail (exit 1)
 *   PRINT <text>                    print <text> on stderr
 *   EXIT <code>                     exit with <code> at the end
 *   SLEEP <ms|forever>              wait before exiting
 *   SPAWN-SLEEP <pidfile>           start a child process that never ends; write its pid
 *   REQUIRE-FILE <path> <ID>        fail with <ID> when <path> does not exist
 *   MANIFEST-EXPECT <ID> <path> <json>
 *                                   fail with <ID> unless .cross-stack/standard.json has <json>
 *                                   at the dotted <path>
 *   RANGE-CHECK <ID>                fail with <ID> for every commit in --base..--head whose
 *                                   subject contains "VIOLATION"
 *
 * Every run records its arguments and part of its environment in `.gate-run.json`.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};

const RECORDED_ENV = [
  "PAO_DISABLE",
  "NO_COLOR",
  "CI",
  "FORCE_COLOR",
  "GIT_DIR",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "CLAUDECODE",
  "AI_AGENT",
  "CROSS_STACK_STANDARD_DISABLE",
  "FIXTURE_HOST_ENV",
  "FIXTURE_GATE_KIND",
];
fs.writeFileSync(
  ".gate-run.json",
  `${JSON.stringify(
    {
      argv: args,
      cwd: process.cwd(),
      env: Object.fromEntries(RECORDED_ENV.map((name) => [name, process.env[name] ?? null])),
    },
    null,
    2,
  )}\n`,
);

function listFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(abs, rel) : [rel];
    });
}

function lookup(object, dotted) {
  return dotted.split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);
}

let exitCode = 0;
let forcedExit = null;
let sleep = 0;

for (const rel of listFiles("src")) {
  const lines = fs.readFileSync(path.join("src", ...rel.split("/")), "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const [directive, ...rest] = line.trim().split(/\s+/);
    const where = `src/${rel}:${index + 1}`;
    switch (directive) {
      case "VIOLATION":
        process.stdout.write(`${rest[0]} ${where} ${rest.slice(1).join(" ")}\n`);
        exitCode = 1;
        break;
      case "PRINT":
        process.stderr.write(`${rest.join(" ")}\n`);
        break;
      case "EXIT":
        forcedExit = Number(rest[0]);
        break;
      case "SLEEP":
        sleep = rest[0] === "forever" ? Infinity : Number(rest[0]);
        break;
      case "SPAWN-SLEEP": {
        const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], {
          stdio: "ignore",
        });
        fs.writeFileSync(rest[0], String(child.pid));
        break;
      }
      case "REQUIRE-FILE":
        if (!fs.existsSync(rest[0])) {
          process.stdout.write(`${rest[1]} ${rest[0]}:1 required file is missing\n`);
          exitCode = 1;
        }
        break;
      case "MANIFEST-EXPECT": {
        const [id, dotted, ...json] = rest;
        const file = path.join(".cross-stack", "standard.json");
        const manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
        const actual = JSON.stringify(lookup(manifest, dotted));
        const expected = JSON.stringify(JSON.parse(json.join(" ")));
        if (actual !== expected) {
          process.stdout.write(
            `${id} .cross-stack/standard.json:1 ${dotted} is ${actual}, expected ${expected}\n`,
          );
          exitCode = 1;
        }
        break;
      }
      case "RANGE-CHECK": {
        const base = option("base");
        const head = option("head");
        if (!base || !head) {
          process.stderr.write("RANGE-CHECK needs --base and --head\n");
          forcedExit = 3;
          break;
        }
        const log = spawnSync("git", ["log", "--format=%h %s", `${base}..${head}`], {
          encoding: "utf8",
        });
        if (log.status !== 0) {
          process.stderr.write(`git log failed: ${log.stderr}\n`);
          forcedExit = 3;
          break;
        }
        for (const commit of log.stdout.split("\n").filter(Boolean)) {
          if (commit.includes("VIOLATION")) {
            process.stdout.write(`${rest[0]} commit ${commit}\n`);
            exitCode = 1;
          }
        }
        break;
      }
      default:
        break;
    }
  });
}

const finish = () => process.exit(forcedExit ?? exitCode);
if (sleep === Infinity) setInterval(() => {}, 60_000);
else if (sleep > 0) setTimeout(finish, sleep);
else finish();
