#!/usr/bin/env node
/**
 * Synchronizes the provider-neutral Agent Skill's bundled rule reference pages from docs/rules/
 * and copies the repository license into the installable skill directory. Generated copies keep
 * Gemini CLI and other Agent Skills hosts independent of the Claude plugin directory layout.
 * Node.js built-ins only.
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
const SKILL_DIR = "skills/cross-stack-standard";
const LICENSE_SOURCE = "LICENSE";
const LICENSE_OUTPUT = "skills/cross-stack-standard/LICENSE";
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

function scalarValue(raw, label) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "string") throw new Error("not a string");
      return parsed;
    } catch {
      throw new Error(`Invalid quoted ${label} in ${SKILL_DIR}/SKILL.md`);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      throw new Error(`Invalid quoted ${label} in ${SKILL_DIR}/SKILL.md`);
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function validateSkillEntrypoint(root) {
  const rel = `${SKILL_DIR}/SKILL.md`;
  const file = path.join(root, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Skill entrypoint is missing: ${rel}`);
  }
  const source = fs.readFileSync(file, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!frontmatter) throw new Error(`${rel} must start with YAML frontmatter`);

  const nameLine = /^name:\s*(.+?)\s*$/m.exec(frontmatter[1]);
  const descriptionLine = /^description:\s*(.+?)\s*$/m.exec(frontmatter[1]);
  if (!nameLine || !descriptionLine) {
    throw new Error(`${rel} frontmatter must define name and description`);
  }
  const name = scalarValue(nameLine[1], "name");
  const description = scalarValue(descriptionLine[1], "description");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new Error(`${rel} name must be a lowercase hyphenated name of at most 64 characters`);
  }
  if (name !== path.basename(path.join(root, SKILL_DIR))) {
    throw new Error(`${rel} name must match its folder (${path.basename(SKILL_DIR)})`);
  }
  if (!description || description.length > 1024) {
    throw new Error(`${rel} description must contain 1 to 1024 characters`);
  }
  if (!frontmatter[2].trim()) throw new Error(`${rel} has no instruction body`);

  for (const [, link] of frontmatter[2].matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = link.split("#", 1)[0];
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target)) continue;
    if (!fs.existsSync(path.resolve(root, SKILL_DIR, target))) {
      throw new Error(`${rel} links to a missing file: ${target}`);
    }
  }
}

function run({ root, check }) {
  validateSkillEntrypoint(root);
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

  const licenseSource = path.join(root, LICENSE_SOURCE);
  if (!fs.existsSync(licenseSource) || !fs.statSync(licenseSource).isFile()) {
    throw new Error(`Root license is missing: ${LICENSE_SOURCE}`);
  }
  const licenseOutput = path.join(root, LICENSE_OUTPUT);
  const license = fs.readFileSync(licenseSource, "utf8");
  if (!fs.existsSync(licenseOutput) || fs.readFileSync(licenseOutput, "utf8") !== license) {
    mismatches.push("LICENSE");
    if (!check) {
      fs.mkdirSync(path.dirname(licenseOutput), { recursive: true });
      fs.writeFileSync(licenseOutput, license);
    }
  }

  if (check && mismatches.length) {
    console.error(`${SELF}: bundled skill files are stale: ${mismatches.join(", ")}`);
    console.error(`Run: node ${SELF}`);
    return 1;
  }
  console.log(
    `${SELF}: ${expected.length} reference pages and skill license ${check ? "current" : "synchronized"}.`,
  );
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
