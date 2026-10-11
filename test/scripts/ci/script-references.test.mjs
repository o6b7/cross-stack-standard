/**
 * Cross-reference test: every place that tells a person or a machine to run a repository script
 * (workflows, lefthook, package.json scripts and the Markdown docs) names a script that exists
 * and only options that script accepts, and every `npm run <name>` names a package.json script.
 *
 * Options are checked against each script's own `--help` output, so a renamed or removed flag
 * fails here instead of in CI or in a maintainer's terminal.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { ROOT } from "./helpers.mjs";

/** Directories never scanned: private working files, dependencies, fixtures (deliberate junk). */
const SKIP_DIRS = new Set([".git", ".cache", "_input", "_work", "node_modules", "vendor", "web"]);
const SKIP_PREFIXES = ["test/fixtures/", "test/scripts/fixtures-runner/mini/"];

/** Lines that follow `node scripts/<name>.mjs` up to a shell operator or the end of the code. */
const INVOCATION = /node (scripts\/[\w./-]+\.mjs)([^\n`|;<>#)]*)/g;
const OPTION = /(?:^|\s)(--[a-z][a-z0-9-]*)/g;
const NPM_RUN = /\bnpm run ([a-z][\w:-]*)/g;

/** Repository-relative POSIX paths of every Markdown file that ships with the repository. */
function markdownFiles(dir = ROOT, prefix = "") {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_PREFIXES.some((p) => `${rel}/`.startsWith(p))) {
        continue;
      }
      found.push(...markdownFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".md")) {
      found.push(rel);
    }
  }
  return found.sort();
}

/** Every source as `{ file, lines }`, where each line is one place a command can appear. */
function sources() {
  const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
  const list = [];
  const workflows = readdirSync(path.join(ROOT, ".github", "workflows"))
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => `.github/workflows/${name}`);
  for (const file of [...workflows, "lefthook.yml", ...markdownFiles()]) {
    list.push({ file, lines: read(file).split("\n") });
  }
  const scripts = JSON.parse(read("package.json")).scripts;
  list.push({
    file: "package.json",
    lines: Object.entries(scripts).map(([name, command]) => `"${name}": ${command}`),
  });
  return list;
}

/** `--help` output of each script, computed once. */
const helpCache = new Map();
function helpOf(script) {
  if (!helpCache.has(script)) {
    const result = spawnSync(process.execPath, [path.join(ROOT, script), "--help"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 30_000,
    });
    helpCache.set(script, { status: result.status, text: `${result.stdout}${result.stderr}` });
  }
  return helpCache.get(script);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collect every script invocation with the options it passes. */
function invocations() {
  const found = [];
  for (const { file, lines } of sources()) {
    lines.forEach((line, index) => {
      for (const match of line.matchAll(INVOCATION)) {
        const args = match[2].split("&&")[0];
        const options = [...args.matchAll(OPTION)].map((option) => option[1]);
        found.push({ where: `${file}:${index + 1}`, script: match[1], options });
      }
    });
  }
  return found;
}

describe("script references", () => {
  const calls = invocations();
  const packageScripts = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;

  test("the scan finds the documented invocations", () => {
    const files = new Set(calls.map((call) => call.where.split(":")[0]));
    for (const file of [".github/workflows/ci.yml", "lefthook.yml", "package.json"]) {
      assert.ok(files.has(file), `no invocation found in ${file}`);
    }
    assert.ok(calls.length > 40, `only ${calls.length} invocations found`);
  });

  test("every referenced script exists and prints its usage with --help", () => {
    const problems = [];
    for (const script of new Set(calls.map((call) => call.script))) {
      if (!existsSync(path.join(ROOT, script))) {
        const where = calls.filter((call) => call.script === script).map((call) => call.where);
        problems.push(`${script} does not exist (referenced at ${where.join(", ")})`);
        continue;
      }
      const help = helpOf(script);
      if (help.status !== 0 || !/usage/i.test(help.text)) {
        problems.push(`${script} --help exited ${help.status} without a usage text`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test("every option passed to a script is one its --help documents", () => {
    const problems = [];
    for (const { where, script, options } of calls) {
      if (!existsSync(path.join(ROOT, script))) continue;
      const { text } = helpOf(script);
      for (const option of options) {
        if (option === "--help") continue;
        const documented = new RegExp(`(^|[\\s,\\[(|])${escapeRegExp(option)}(?![a-z0-9-])`, "m");
        if (!documented.test(text)) problems.push(`${where}: ${script} has no ${option} option`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test("every `npm run <name>` names a package.json script", () => {
    const problems = [];
    // Adopter-facing pages and kit templates name scripts in the adopter's own project
    // (for example `check:fast`), not scripts in this repository.
    const adopterFacing = (file) =>
      file === "README.md" ||
      file.startsWith("plugins/cross-stack-standard/") ||
      (file.startsWith("docs/") && !file.startsWith("docs/maintainers/"));
    for (const { file, lines } of sources()) {
      if (adopterFacing(file)) continue;
      lines.forEach((line, index) => {
        for (const match of line.matchAll(NPM_RUN)) {
          if (!Object.hasOwn(packageScripts, match[1])) {
            problems.push(`${file}:${index + 1}: npm run ${match[1]} is not a package.json script`);
          }
        }
      });
    }
    assert.deepEqual(problems, []);
  });
});
