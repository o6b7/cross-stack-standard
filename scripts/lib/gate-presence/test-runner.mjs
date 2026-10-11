/**
 * Gate presence for `vitest` and `jest` gates: a test (`it`/`test`) with exactly the gate's
 * title exists in a file the runner includes. Include patterns come from the project's runner
 * configuration (static read of `test.include` for Vitest, `testMatch` for Jest) or the
 * runner's documented defaults. Titles must be string literals.
 *
 * @module scripts/lib/gate-presence/test-runner
 */

import path from "node:path";
import {
  globToRegExp,
  isDirectory,
  isFile,
  listFiles,
  matchBracket,
  readText,
  stripJsComments,
  unescapeJs,
  walkFiles,
} from "./files.mjs";
import { findJsTestTitles } from "./test-titles.mjs";

/** Vitest's default `test.include`. */
export const VITEST_DEFAULT_INCLUDE = Object.freeze(["**/*.{test,spec}.?(c|m)[jt]s?(x)"]);

/** Jest's default `testMatch`. */
export const JEST_DEFAULT_TEST_MATCH = Object.freeze([
  "**/__tests__/**/*.[jt]s?(x)",
  "**/?(*.)+(spec|test).[jt]s?(x)",
]);

const EXTENSIONS = ["ts", "mts", "cts", "js", "mjs", "cjs"];

/**
 * String literals inside the array that starts at `open`.
 *
 * @param {string} code Comment-free source.
 * @param {number} open Index of `[`.
 * @returns {string[]}
 */
function arrayStrings(code, open) {
  const end = matchBracket(code, open);
  if (end === -1) return [];
  const body = code.slice(open + 1, end - 1);
  return [...body.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((match) =>
    unescapeJs(match[2]),
  );
}

/**
 * Reads `test.include` from a Vitest (or Vite) config source, ignoring the nested
 * `coverage`, `typecheck`, `benchmark` and `browser` blocks.
 *
 * @param {string} source
 * @returns {string[] | null} `null` when the config does not set it.
 */
export function readVitestInclude(source) {
  let code = stripJsComments(source);
  const testBlock = /\btest\s*:\s*\{/.exec(code);
  if (!testBlock) return null;
  const open = testBlock.index + testBlock[0].length - 1;
  const end = matchBracket(code, open);
  if (end === -1) return null;
  let block = code.slice(open, end);
  for (;;) {
    const nested = /\b(?:coverage|typecheck|benchmark|browser)\s*:\s*\{/.exec(block);
    if (!nested) break;
    const nestedOpen = nested.index + nested[0].length - 1;
    const nestedEnd = matchBracket(block, nestedOpen);
    if (nestedEnd === -1) break;
    block =
      block.slice(0, nested.index) + " ".repeat(nestedEnd - nested.index) + block.slice(nestedEnd);
  }
  code = block;
  const include = /\binclude\s*:\s*\[/.exec(code);
  return include ? arrayStrings(code, include.index + include[0].length - 1) : null;
}

/**
 * Reads `testMatch` from a Jest config source (JavaScript or JSON).
 *
 * @param {string} source
 * @returns {string[] | null} `null` when the config does not set it.
 */
export function readJestTestMatch(source) {
  const code = stripJsComments(source);
  const match = /(['"]?)testMatch\1\s*:\s*\[/.exec(code);
  return match ? arrayStrings(code, match.index + match[0].length - 1) : null;
}

/**
 * Include globs of a project and where they came from.
 *
 * @param {"vitest" | "jest"} kind
 * @param {import("./locations.mjs").TestProject} project
 * @param {string} projectDir
 * @returns {{ globs: string[], source: string }}
 */
function projectIncludes(kind, project, projectDir) {
  if (project.include) return { globs: project.include, source: "configured include" };
  if (kind === "vitest") {
    for (const base of ["vitest.config", "vite.config"]) {
      for (const ext of EXTENSIONS) {
        const name = `${base}.${ext}`;
        const source = readText(path.join(projectDir, name));
        if (source === null) continue;
        const include = readVitestInclude(source);
        return include
          ? { globs: include, source: `${project.root}/${name}` }
          : { globs: [...VITEST_DEFAULT_INCLUDE], source: "Vitest default include" };
      }
    }
    return { globs: [...VITEST_DEFAULT_INCLUDE], source: "Vitest default include" };
  }
  for (const ext of [...EXTENSIONS, "json"]) {
    const name = `jest.config.${ext}`;
    const source = readText(path.join(projectDir, name));
    if (source === null) continue;
    const testMatch = readJestTestMatch(source);
    if (testMatch) return { globs: testMatch, source: `${project.root}/${name}` };
    return { globs: [...JEST_DEFAULT_TEST_MATCH], source: "Jest default testMatch" };
  }
  const manifest = readText(path.join(projectDir, "package.json"));
  if (manifest !== null) {
    try {
      const testMatch = JSON.parse(manifest)?.jest?.testMatch;
      if (Array.isArray(testMatch)) {
        return { globs: testMatch, source: `${project.root}/package.json` };
      }
    } catch {
      // An unreadable package.json leaves the defaults in place.
    }
  }
  return { globs: [...JEST_DEFAULT_TEST_MATCH], source: "Jest default testMatch" };
}

/**
 * Files of one project that the runner includes, as root-relative posix paths.
 *
 * @param {"vitest" | "jest"} kind
 * @param {import("./locations.mjs").TestProject} project
 * @param {string} root
 * @returns {{ files: { rel: string, via: string }[] }}
 */
function projectFiles(kind, project, root) {
  const files = [];
  const projectDir = path.join(root, ...project.root.split("/"));
  if (isDirectory(projectDir)) {
    const { globs, source } = projectIncludes(kind, project, projectDir);
    const patterns = globs.map((glob) =>
      globToRegExp(glob.replace(/^<rootDir>\//, "").replace(/^\.\//, "")),
    );
    for (const rel of walkFiles(projectDir)) {
      if (patterns.some((pattern) => pattern.test(rel))) {
        files.push({ rel: `${project.root}/${rel}`, via: source });
      }
    }
  }
  for (const rel of listFiles(root, project.extraFiles ?? [])) {
    if (isFile(path.join(root, ...rel.split("/")))) {
      files.push({ rel, via: `runs through ${project.root}` });
    }
  }
  return { files };
}

/**
 * Checks a `vitest` or `jest` gate. `gate.id` is the exact test title.
 *
 * @param {"vitest" | "jest"} kind
 * @param {{ id: string }} gate
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ present: boolean, evidence: string }}
 */
export function checkTestRunnerGate(kind, gate, ctx) {
  const projects = ctx.locations[kind].projects;
  let skippedAt = null;
  for (const project of projects) {
    for (const { rel, via } of projectFiles(kind, project, ctx.root).files) {
      const source = readText(path.join(ctx.root, ...rel.split("/")));
      if (source === null) continue;
      for (const found of findJsTestTitles(source)) {
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
    return {
      present: false,
      evidence: `"${gate.id}" at ${skippedAt} is skipped, a todo or conditional`,
    };
  }
  const searched = projects.map((project) => project.root).join(", ");
  return {
    present: false,
    evidence: `no ${kind} test titled "${gate.id}" in the files included by ${searched}`,
  };
}
