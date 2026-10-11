// Stand-in for a project's fast check (the npm side) in the Stop hook tests. It reads every file
// under src/ (recursively), prints one line per problem, and exits 1 when a file contains the
// marker LINT_ERROR. Problem lines start with a colour code, which the hook must strip.
//
// Test controls, all optional environment variables:
//   STOP_TEST_LOG       append "npm <directory name>" for each run, to count runs
//   STOP_TEST_ENV_OUT   write the variables the tests inspect to this file, as JSON
//   STOP_TEST_LINES     print this many numbered lines first
//   STOP_TEST_PRINT     print this text first
//   STOP_TEST_MISLEAD   "1": print the opposite summary line (only the exit code may count)
//   STOP_TEST_HANG      "1": never finish; the process id goes to STOP_TEST_PID_FILE
//   STOP_TEST_APPEND_AFTER_SCAN  a path relative to the directory: after src/ has been read,
//                       append a LINT_ERROR line to it (a write that lands while the gate runs)
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const env = process.env;
if (env.STOP_TEST_LOG) {
  fs.appendFileSync(env.STOP_TEST_LOG, `npm ${path.basename(process.cwd())}\n`);
}
if (env.STOP_TEST_ENV_OUT) {
  const names = [
    "CI",
    "PAO_DISABLE",
    "NO_COLOR",
    "FORCE_COLOR",
    "DO_NOT_TRACK",
    "JSCPD_NO_TIPS",
    "CLAUDE_PROJECT_DIR",
    "CLAUDE_PLUGIN_DATA",
    "CLAUDECODE",
    "AI_AGENT",
    "CROSS_STACK_STANDARD_STOP_GATE",
    "STOP_TEST_KEEP",
  ];
  const seen = Object.fromEntries(names.map((name) => [name, env[name] ?? null]));
  fs.writeFileSync(env.STOP_TEST_ENV_OUT, JSON.stringify(seen));
}

if (env.STOP_TEST_HANG === "1") {
  fs.writeFileSync(env.STOP_TEST_PID_FILE, String(process.pid));
  setInterval(() => {}, 1000);
} else {
  const count = Number(env.STOP_TEST_LINES ?? 0);
  for (let line = 1; line <= count; line += 1) console.log(`output line ${line}`);
  if (env.STOP_TEST_PRINT) console.log(env.STOP_TEST_PRINT);

  const root = path.join(process.cwd(), "src");
  const problems = [];
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath ?? entry.path, entry.name);
    if (fs.readFileSync(file, "utf8").includes("LINT_ERROR")) {
      const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
      problems.push(`${rel}:1 fake/no-lint-error LINT_ERROR marker found`);
    }
  }
  for (const problem of problems.sort()) console.error(`\u001b[31m✖\u001b[39m ${problem}`);
  if (env.STOP_TEST_APPEND_AFTER_SCAN) {
    fs.appendFileSync(path.join(process.cwd(), env.STOP_TEST_APPEND_AFTER_SCAN), "LINT_ERROR;\n");
  }

  const mislead = env.STOP_TEST_MISLEAD === "1";
  if (problems.length > 0) {
    console.log(mislead ? "All checks passed" : `${problems.length} problem(s)`);
    process.exitCode = 1;
  } else {
    console.log(mislead ? "FAILED: 3 errors" : "fast check passed");
  }
}
