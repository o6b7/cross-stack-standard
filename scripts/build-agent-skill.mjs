#!/usr/bin/env node
/**
 * Synchronizes the provider-neutral Agent Skill's bundled rule reference pages from docs/rules/.
 * Generated copies keep Gemini CLI and other Agent Skills hosts independent of the Claude plugin
 * directory layout. Node.js built-ins only.
 *
 * Exit codes: 0 up to date / written, 1 stale output, 2 usage or internal error.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SELF = "scripts/build-agent-skill.mjs";
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "docs/rules";
const OUTPUT = "skills/cross-stack-standard/references/rules";
const GITHUB_DECISION_BASE =
  "https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/";
const GENERATED_BANNER =
  "<!-- Generated copy of docs/rules/. Do not edit; run npm run build:agent-skill. -->";
const HELP = `Usage: node ${SELF} [--check] [--root <dir>]

Copies the generated rule index and track pages into the portable Agent Skill package.

Options:
  --check        Write nothing; fail when the bundled pages are out of date
  --root <dir>   Repository root (default: the repository holding this script)
  --help         Show this help

Exit codes: 0 up to date or written, 1 stale output, 2 usage or internal error.
`;

function parseOptions(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      check: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      root: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (positionals.length) throw new Error(`Unexpected argument: ${positionals[0]}`);
  return { ...values, root: path.resolve(values.root ?? DEFAULT_ROOT) };
}

function generatedFiles(root) {
  const sourceDir = path.join(root, SOURCE);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Rule docs directory is missing: ${SOURCE}`);
  }
  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      let content = fs.readFileSync(path.join(sourceDir, name), "utf8");
      content = content.replace(
        /^<!-- Generated from registry\/rules\.json — do not edit\. Regenerate: node scripts\/generate-rule-docs\.mjs -->/,
        GENERATED_BANNER,
      );
      content = content.replaceAll("../decisions/", GITHUB_DECISION_BASE);
      return [name, content];
    });
}

function actualFiles(root) {
  const outDir = path.join(root, OUTPUT);
  if (!fs.existsSync(outDir)) return [];
  if (!fs.statSync(outDir).isDirectory())
    throw new Error(`Output path is not a directory: ${OUTPUT}`);
  return fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

function run({ root, check }) {
  const expected = generatedFiles(root);
  const expectedNames = expected.map(([name]) => name);
  const actualNames = actualFiles(root);
  const mismatches = [];

  for (const name of expectedNames) {
    const outputPath = path.join(root, OUTPUT, name);
    const content = expected.find(([file]) => file === name)[1];
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== content) {
      mismatches.push(name);
      if (!check) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, content);
      }
    }
  }

  const staleNames = actualNames.filter((name) => !expectedNames.includes(name));
  for (const name of staleNames) {
    mismatches.push(name);
    if (!check) fs.rmSync(path.join(root, OUTPUT, name));
  }

  if (check && mismatches.length) {
    console.error(`${SELF}: bundled rule references are stale: ${mismatches.join(", ")}`);
    console.error(`Run: node ${SELF}`);
    return 1;
  }
  console.log(`${SELF}: ${expected.length} reference pages ${check ? "current" : "synchronized"}.`);
  return 0;
}

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  process.exitCode = run(options);
} catch (error) {
  console.error(`${SELF}: ${error.message}`);
  process.exitCode = 2;
}
