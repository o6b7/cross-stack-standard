/**
 * Gate presence for `pest` gates: a Pest test whose description equals the gate id — and names
 * the rule ID, so a failing run prints it — exists in a file under a testsuite directory of a
 * configured Laravel project (the fixture host or the kit template).
 *
 * @module scripts/lib/gate-presence/pest
 */

import path from "node:path";
import { isDirectory, isFile, readText, walkFiles } from "./files.mjs";
import { findPestTestTitles } from "./test-titles.mjs";

const PHPUNIT_CONFIGS = ["phpunit.xml", "phpunit.xml.dist", "phpunit.dist.xml"];

/**
 * @typedef {object} Testsuite
 * @property {string} name
 * @property {{ path: string, suffix: string }[]} directories
 * @property {string[]} files
 */

/**
 * Reads the `<testsuite>` entries of a PHPUnit configuration.
 *
 * @param {string} xml
 * @returns {Testsuite[]}
 */
export function parsePhpunitTestsuites(xml) {
  const text = xml.replace(/<!--[\s\S]*?-->/g, "");
  const suites = [];
  for (const suite of text.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g)) {
    const name = /\bname\s*=\s*"([^"]*)"/.exec(suite[1])?.[1] ?? "";
    const directories = [...suite[2].matchAll(/<directory\b([^>]*)>([^<]+)<\/directory>/g)].map(
      (dir) => ({
        path: dir[2].trim(),
        suffix: /\bsuffix\s*=\s*"([^"]*)"/.exec(dir[1])?.[1] ?? "Test.php",
      }),
    );
    const files = [...suite[2].matchAll(/<file\b[^>]*>([^<]+)<\/file>/g)].map((file) =>
      file[1].trim(),
    );
    suites.push({ name, directories, files });
  }
  return suites;
}

/**
 * Whether a test title names the rule (`BE-012` or `BE_012`).
 *
 * @param {string} title
 * @param {string} ruleId
 * @returns {boolean}
 */
export function titleNamesRule(title, ruleId) {
  const [prefix, number] = String(ruleId).split("-");
  if (!prefix || !number) return false;
  return new RegExp(`(?<![A-Za-z0-9])${prefix}[-_]${number}(?![0-9])`).test(title);
}

/**
 * Test files of one project: `{ file, source }` pairs with root-relative posix paths.
 *
 * @param {import("./locations.mjs").TestProject} project
 * @param {string} root
 * @returns {{ files: { rel: string, via: string }[], note?: string }}
 */
function projectTestFiles(project, root) {
  const projectDir = path.join(root, ...project.root.split("/"));
  if (!isDirectory(projectDir)) return { files: [], note: `${project.root} does not exist` };
  const files = [];
  const addDir = (dir, suffix, via) => {
    for (const rel of walkFiles(path.join(projectDir, ...dir.split("/")))) {
      if (rel.endsWith(suffix)) files.push({ rel: `${project.root}/${dir}/${rel}`, via });
    }
  };
  if (project.testDirs) {
    for (const dir of project.testDirs) {
      addDir(dir.replace(/^\.\/|\/$/g, ""), "Test.php", `test directory ${project.root}/${dir}`);
    }
    return { files };
  }
  const configName = PHPUNIT_CONFIGS.find((name) => isFile(path.join(projectDir, name)));
  if (!configName) return { files: [], note: `${project.root} has no phpunit.xml` };
  const configRel = `${project.root}/${configName}`;
  for (const suite of parsePhpunitTestsuites(readText(path.join(projectDir, configName)) ?? "")) {
    const via = `testsuite ${suite.name || "(unnamed)"} of ${configRel}`;
    for (const dir of suite.directories) {
      addDir(dir.path.replace(/^\.\/|\/$/g, ""), dir.suffix, via);
    }
    for (const file of suite.files) {
      files.push({ rel: `${project.root}/${file.replace(/^\.\//, "")}`, via });
    }
  }
  return { files };
}

/**
 * Checks a `pest` gate.
 *
 * @param {{ id: string }} gate
 * @param {{ id: string }} rule
 * @param {{ root: string, cache: Map<string, any>, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ present: boolean, evidence: string }}
 */
export function checkPestGate(gate, rule, ctx) {
  if (!titleNamesRule(gate.id, rule.id)) {
    return {
      present: false,
      evidence: `the Pest test description "${gate.id}" must contain the rule ID ${rule.id} so a failing run prints it`,
    };
  }
  const notes = [];
  let skippedAt = null;
  for (const project of ctx.locations.pest.projects) {
    const { files, note } = projectTestFiles(project, ctx.root);
    if (note) notes.push(note);
    for (const { rel, via } of files) {
      const source = readText(path.join(ctx.root, ...rel.split("/")));
      if (source === null) continue;
      for (const found of findPestTestTitles(source)) {
        if (found.title !== gate.id) continue;
        if (found.skipped) {
          skippedAt ??= `${rel}:${found.line}`;
          continue;
        }
        return {
          present: true,
          evidence: `${found.fn}("${gate.id}") at ${rel}:${found.line} (${via})`,
        };
      }
    }
  }
  if (skippedAt) {
    return { present: false, evidence: `"${gate.id}" at ${skippedAt} is skipped or a todo` };
  }
  const searched = ctx.locations.pest.projects.map((project) => project.root).join(", ");
  const extra = notes.length ? `; ${notes.join("; ")}` : "";
  return {
    present: false,
    evidence: `no Pest test "${gate.id}" in the testsuites of ${searched}${extra}`,
  };
}
