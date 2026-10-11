/**
 * build-plugin-data: generates everything the installed plugin needs at runtime from the
 * repository's sources. An installed plugin is a copy of plugins/cross-stack-standard/ only, so
 * the registry, the schemas and the gate packages must be copied into it.
 *
 *   VERSION, registry/rules.json, schemas/*.json
 *     -> plugins/cross-stack-standard/data/
 *          rules.json                  runtime subset of the rule registry
 *          standard.schema.json        manifest schema (published; adopters' "$schema" points here)
 *          allowlist.schema.json       allowlist schema
 *          protected-paths.json        built-in PreToolUse protection list
 *          companions.json             pinned companion plugins, from .claude-plugin/marketplace.json
 *          version.json                kit version and schema ids
 *          template-hashes/<v>.json    SHA-256 of every kit template file at version <v>
 *     -> the generated block of templates/shared/cross-stack/bin/cross-stack.mjs (embedded schemas)
 *   packages/<name>/ -> templates/<track>/vendor/<name>/ for every entry of VENDORED_PACKAGES
 *   LICENSE -> plugins/cross-stack-standard/LICENSE (verbatim: the licence must travel with
 *     every installed copy of the plugin, which contains nothing outside that folder)
 *
 * Output is deterministic. `--check` changes nothing and exits 1 when anything is out of date,
 * which is how CI catches hand edits and forgotten rebuilds. template-hashes files of earlier
 * versions are kept: the upgrade skill compares an adopter's files with the version they adopted.
 * The manifest of a released version is frozen: once CHANGELOG.md has a dated section for
 * VERSION, a template change that would rewrite template-hashes/<VERSION>.json is refused until
 * VERSION moves on (to the next pre-release), so a released manifest never describes later
 * templates. `--refreeze` lifts that for the release branch itself, before the tag.
 *
 * Node.js built-ins only; no network.
 *
 * Usage: node scripts/build-plugin-data.mjs [--check] [--refreeze] [--json] [--root <dir>]
 * Exit codes: 0 up to date or written, 1 out of date or invalid sources, 2 usage or internal error.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  assertSchemaSubset,
  parseJsonWithLines,
} from "../plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs";
import { parseChangelog } from "./release-notes.mjs";

const SELF = "scripts/build-plugin-data.mjs";
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Repository-relative locations the build reads and writes. */
export const PATHS = Object.freeze({
  version: "VERSION",
  changelog: "CHANGELOG.md",
  registry: "registry/rules.json",
  standardSchema: "schemas/standard.schema.json",
  allowlistSchema: "schemas/allowlist.schema.json",
  protectedPaths: "schemas/protected-paths.json",
  marketplace: ".claude-plugin/marketplace.json",
  data: "plugins/cross-stack-standard/data",
  templates: "plugins/cross-stack-standard/templates",
  bin: "plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs",
  license: "LICENSE",
  pluginLicense: "plugins/cross-stack-standard/LICENSE",
});

/** Registry fields the plugin needs at runtime, in output order. */
export const RUNTIME_RULE_FIELDS = Object.freeze([
  "id",
  "title",
  "track",
  "tier",
  "module",
  "enforcement",
  "gate",
  "defaultEnabled",
  "profiles",
]);

/**
 * @typedef {object} VendoredPackage
 * @property {string} source  Repository-relative package directory under packages/.
 * @property {string[]} targets  Template-relative directories `<track>/vendor/<name>`; the adopt
 *   skill copies them to the project's .cross-stack/vendor/.
 * @property {string[]} [include]  Package-relative files and directories to copy. Defaults to
 *   package.json, the entries of its "files" list, and README/LICENSE/CHANGELOG when present.
 */

/**
 * Gate packages vendored into the kit. The packages are not published, so adopters install them
 * offline from the kit copy (npm `file:` dependency, Composer `path` repository). Each track phase
 * adds its package here once it is built, for example:
 *   { source: "packages/eslint-config", targets: ["web/vendor/eslint-config", "mobile/vendor/eslint-config"] }
 *
 * @type {ReadonlyArray<VendoredPackage>}
 */
export const VENDORED_PACKAGES = Object.freeze([]);

/** Data subdirectories that other generators own; this build leaves them alone. */
export const DATA_RESERVED_DIRS = Object.freeze(["probes"]);

const GENERATED_BEGIN = "// <cross-stack-standard:generated>";
const GENERATED_END = "// </cross-stack-standard:generated>";
const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
const SCHEMA_ID_BASE = "https://raw.githubusercontent.com/o6b7/cross-stack-standard";
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RULE_ID = /^(?:BE|WEB|MOB|SEC|I18N|UI|PROC|CI)-[0-9]{3}$/;
const RULE_TRACKS = ["laravel", "web", "mobile", "client", "shared"];
const ENFORCEMENT = ["FORCED", "GUARDED", "REVIEW"];
const PROFILES = ["next", "react-spa"];
const VENDOR_TARGET = /^(?:laravel|web|mobile|shared)\/vendor\/[a-z0-9][a-z0-9._-]*$/;
const SKIPPED_DIRS = new Set(["node_modules", ".git"]);
const SKIPPED_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const GENERATED_NOTE = "Generated by scripts/build-plugin-data.mjs. Do not edit.";

/** A problem in a source file; reported as a finding (exit 1). */
class SourceProblem extends Error {
  /**
   * @param {string} file Repository-relative path.
   * @param {string} message
   * @param {number} [line]
   */
  constructor(file, message, line = 1) {
    super(message);
    this.file = file;
    this.line = line;
  }
}

/** A problem with how the script was invoked (exit 2). */
class UsageError extends Error {}

// ---------------------------------------------------------------------------------------------
// Formatting and hashing
// ---------------------------------------------------------------------------------------------

/**
 * Serialises JSON the way Prettier formats a .json file (objects always expanded; arrays of
 * primitives on one line when they fit in `printWidth`), so generated files pass the repository's
 * format check without being excluded from it.
 *
 * @param {unknown} value
 * @param {number} [printWidth]
 * @returns {string} The text, ending with a newline.
 */
export function formatJson(value, printWidth = 100) {
  const print = (node, indent, usedWidth, trailing) => {
    if (Array.isArray(node)) {
      if (node.length === 0) return "[]";
      const primitives = node.every((item) => item === null || typeof item !== "object");
      if (primitives) {
        const flat = `[${node.map((item) => JSON.stringify(item)).join(", ")}]`;
        if (usedWidth + flat.length + trailing <= printWidth) return flat;
      }
      const inner = `${indent}  `;
      const items = node.map(
        (item, index) =>
          `${inner}${print(item, inner, inner.length, index < node.length - 1 ? 1 : 0)}`,
      );
      return `[\n${items.join(",\n")}\n${indent}]`;
    }
    if (node !== null && typeof node === "object") {
      const entries = Object.entries(node);
      if (entries.length === 0) return "{}";
      const inner = `${indent}  `;
      const members = entries.map(([key, child], index) => {
        const prefix = `${inner}${JSON.stringify(key)}: `;
        return `${prefix}${print(child, inner, prefix.length, index < entries.length - 1 ? 1 : 0)}`;
      });
      return `{\n${members.join(",\n")}\n${indent}}`;
    }
    return JSON.stringify(node);
  };
  return `${print(value, "", 0, 0)}\n`;
}

/**
 * True when a buffer looks like text (no NUL byte in its first 8,000 bytes, as git decides).
 *
 * @param {Buffer} buffer
 */
export function isText(buffer) {
  return !buffer.subarray(0, 8000).includes(0);
}

/**
 * Converts CRLF line endings to LF in text; binary content is returned unchanged.
 *
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
export function normalizeEol(buffer) {
  if (!isText(buffer) || !buffer.includes(13)) return buffer;
  return Buffer.from(buffer.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
}

/**
 * SHA-256 of a kit file as recorded in template-hashes (text hashed with LF line endings, so a
 * checkout with CRLF endings hashes the same).
 *
 * @param {Buffer} buffer
 * @returns {string} Lower-case hex digest.
 */
export function templateHash(buffer) {
  return crypto.createHash("sha256").update(normalizeEol(buffer)).digest("hex");
}

// ---------------------------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------------------------

function abs(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function readSource(root, relativePath) {
  try {
    return fs.readFileSync(abs(root, relativePath));
  } catch (error) {
    if (error.code === "ENOENT") throw new SourceProblem(relativePath, "not found");
    throw error;
  }
}

function readJsonSource(root, relativePath) {
  const text = normalizeEol(readSource(root, relativePath)).toString("utf8");
  const parsed = parseJsonWithLines(text);
  if (!parsed.ok) throw new SourceProblem(relativePath, parsed.message, parsed.line);
  if (parsed.duplicates.length > 0) {
    const [first] = parsed.duplicates;
    throw new SourceProblem(relativePath, `duplicate key at ${first.pointer}`, first.line);
  }
  return { text, value: parsed.value, lines: parsed.lines };
}

/** Fields every companion entry carries under `metadata.crossStack`, and their types. */
export const COMPANION_FIELDS = Object.freeze({
  title: "string",
  purpose: "string",
  scope: "string",
  module: "string|null",
  toolPrefix: "string|null",
  access: "string",
  network: "string",
  license: "string",
  fallback: "string",
  skills: "string[]",
  agents: "string[]",
});

/**
 * The runtime list of companion plugins: every marketplace entry other than the Standard itself,
 * with its pin (`source.sha`) and its `metadata.crossStack` block. Problems name the entry.
 *
 * @param {{ value: any, lines: Map<string, number> }} source The parsed marketplace.json.
 * @returns {{ companions: object[], problems: SourceProblem[] }}
 */
export function companionData(source) {
  const problems = [];
  const companions = [];
  const plugins = Array.isArray(source.value?.plugins) ? source.value.plugins : [];
  const marketplace = String(source.value?.name ?? "");
  plugins.forEach((entry, index) => {
    if (entry?.name === "cross-stack-standard") return;
    const pointer = `/plugins/${index}`;
    const fail = (message, at = pointer) =>
      problems.push(
        new SourceProblem(
          PATHS.marketplace,
          `${entry?.name}: ${message}`,
          lineOf(source.lines, at),
        ),
      );
    const sha = entry?.source?.sha;
    if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
      fail("source.sha must be a full commit SHA", `${pointer}/source`);
      return;
    }
    const meta = entry?.metadata?.crossStack;
    if (meta === null || typeof meta !== "object") {
      fail("needs a metadata.crossStack block");
      return;
    }
    for (const [field, type] of Object.entries(COMPANION_FIELDS)) {
      const value = meta[field];
      const ok = type
        .split("|")
        .some((t) =>
          t === "null"
            ? value === null
            : t === "string[]"
              ? Array.isArray(value) &&
                value.every((item) => typeof item === "string" && item !== "")
              : typeof value === t,
        );
      if (!ok) fail(`metadata.crossStack.${field} must be ${type}`, `${pointer}/metadata`);
    }
    if (!["project", "user"].includes(meta.scope)) {
      fail('metadata.crossStack.scope must be "project" or "user"', `${pointer}/metadata`);
    }
    companions.push({
      name: entry.name,
      marketplace,
      version: typeof entry.version === "string" ? entry.version : null,
      sha,
      ...Object.fromEntries(Object.keys(COMPANION_FIELDS).map((field) => [field, meta[field]])),
    });
  });
  return { companions, problems };
}

function lineOf(lines, pointer) {
  let current = pointer;
  while (!lines.has(current) && current !== "")
    current = current.slice(0, current.lastIndexOf("/"));
  return lines.get(current) ?? 1;
}

/**
 * Lists the files under a directory, recursively, as `/`-separated paths relative to it, sorted by
 * code unit. Skips node_modules, .git and operating-system clutter; refuses symbolic links, which
 * the kit cannot carry portably. A missing directory lists as empty.
 *
 * @param {string} root Repository root.
 * @param {string} relativeDir Repository-relative directory.
 * @returns {string[]}
 */
export function listFiles(root, relativeDir) {
  const files = [];
  const walk = (dirRelative) => {
    let entries;
    try {
      entries = fs.readdirSync(abs(root, dirRelative), { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" && dirRelative === relativeDir) return;
      throw error;
    }
    for (const entry of entries) {
      const child = `${dirRelative}/${entry.name}`;
      if (entry.isSymbolicLink())
        throw new SourceProblem(child, "symbolic links are not allowed here");
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(child);
      } else if (entry.isFile() && !SKIPPED_FILES.has(entry.name)) {
        files.push(child.slice(relativeDir.length + 1));
      }
    }
  };
  walk(relativeDir);
  return files.sort(compareCodeUnits);
}

function compareCodeUnits(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isInside(relativePath, dir) {
  return relativePath === dir || relativePath.startsWith(`${dir}/`);
}

function isSafeRelative(relativePath) {
  return (
    typeof relativePath === "string" &&
    relativePath !== "" &&
    !relativePath.startsWith("/") &&
    !relativePath.includes("\\") &&
    !/^[A-Za-z]:/.test(relativePath) &&
    !relativePath
      .split("/")
      .some((segment) => segment === ".." || segment === "." || segment === "")
  );
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

function readVersion(root) {
  const version = normalizeEol(readSource(root, PATHS.version)).toString("utf8").trim();
  if (!SEMVER.test(version))
    throw new SourceProblem(PATHS.version, `"${version}" is not a SemVer version`);
  return version;
}

function loadSchema(root, relativePath, version, problems) {
  let source;
  try {
    source = readJsonSource(root, relativePath);
  } catch (error) {
    if (error instanceof SourceProblem) {
      problems.push(error);
      return null;
    }
    throw error;
  }
  const schema = source.value;
  const report = (pointer, message) =>
    problems.push(new SourceProblem(relativePath, message, lineOf(source.lines, pointer)));
  try {
    assertSchemaSubset(schema);
  } catch (error) {
    report("", `${error.message} (the kit's validator in cross-stack.mjs must support it first)`);
  }
  if (schema?.$schema !== SCHEMA_DIALECT) report("/$schema", `"$schema" must be ${SCHEMA_DIALECT}`);
  const expectedId = `${SCHEMA_ID_BASE}/v${version}/${PATHS.data}/${path.posix.basename(relativePath)}`;
  if (schema?.$id !== expectedId) {
    report("/$id", `"$id" must be ${expectedId} (run node scripts/stamp-version.mjs)`);
  }
  return source;
}

/**
 * Checks the shape of the protected-paths source: unique ids, safe globs, compilable patterns.
 *
 * @param {{ value: any, lines: Map<string, number> }} source
 * @returns {SourceProblem[]}
 */
export function validateProtectedPaths(source) {
  const problems = [];
  const data = source.value;
  const report = (pointer, message) =>
    problems.push(new SourceProblem(PATHS.protectedPaths, message, lineOf(source.lines, pointer)));
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    report("", "must be a JSON object");
    return problems;
  }
  const ids = new Set();
  const lists = { paths: true, contentRules: false, commands: true, allowCommands: false };
  for (const [listName, required] of Object.entries(lists)) {
    const list = data[listName];
    if (list === undefined && !required) continue;
    if (!Array.isArray(list)) {
      report(`/${listName}`, `"${listName}" must be an array`);
      continue;
    }
    list.forEach((entry, index) => {
      const pointer = `/${listName}/${index}`;
      if (entry === null || typeof entry !== "object") {
        report(pointer, "must be an object");
        return;
      }
      if (typeof entry.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
        report(`${pointer}/id`, "needs a kebab-case id");
      } else if (ids.has(entry.id)) {
        report(`${pointer}/id`, `repeats the id "${entry.id}"`);
      } else {
        ids.add(entry.id);
      }
      if (typeof entry.description !== "string" || entry.description.trim() === "") {
        report(`${pointer}/description`, "needs a description");
      }
      if ("globs" in entry || listName === "paths" || listName === "contentRules") {
        if (!Array.isArray(entry.globs) || entry.globs.length === 0) {
          report(`${pointer}/globs`, "needs a non-empty globs list");
        } else {
          entry.globs.forEach((glob, globIndex) => {
            if (!isSafeRelative(glob)) {
              report(`${pointer}/globs/${globIndex}`, `"${glob}" is not a project-relative glob`);
            }
          });
        }
      }
      if (listName !== "paths") {
        const key = listName === "contentRules" ? "addedPattern" : "pattern";
        const pattern = entry[key];
        if (typeof pattern !== "string" || pattern === "") {
          report(`${pointer}/${key}`, `needs a regular expression in "${key}"`);
        } else {
          try {
            new RegExp(pattern, `${entry.flags ?? ""}u`);
          } catch (error) {
            report(`${pointer}/${key}`, `invalid regular expression: ${error.message}`);
          }
        }
      }
      for (const pointerValue of entry.jsonPointers ?? []) {
        if (typeof pointerValue !== "string" || !pointerValue.startsWith("/")) {
          report(`${pointer}/jsonPointers`, `"${pointerValue}" is not a JSON Pointer`);
        }
      }
    });
  }
  return problems;
}

/**
 * Reads registry/rules.json (`{ "rules": [...] }` or a bare array) and returns the runtime subset
 * of every rule, sorted by id. Full validation is check-registry's job; this only refuses data
 * the runtime could not use.
 *
 * @param {string} root
 * @returns {{ rules: object[], problems: SourceProblem[] }}
 */
export function loadRuntimeRules(root) {
  const source = readJsonSource(root, PATHS.registry);
  const problems = [];
  const report = (pointer, message) =>
    problems.push(new SourceProblem(PATHS.registry, message, lineOf(source.lines, pointer)));

  let list;
  let base;
  if (Array.isArray(source.value)) {
    list = source.value;
    base = "";
  } else if (Array.isArray(source.value?.rules)) {
    list = source.value.rules;
    base = "/rules";
  } else {
    report("", 'must be an array of rules or an object with a "rules" array');
    return { rules: [], problems };
  }

  const seen = new Set();
  const rules = [];
  list.forEach((raw, index) => {
    const pointer = `${base}/${index}`;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      report(pointer, "a rule must be an object");
      return;
    }
    const before = problems.length;
    const field = (name, valid, expected) => {
      if (!valid(raw[name])) report(`${pointer}/${name}`, `"${name}" must be ${expected}`);
    };
    field(
      "id",
      (v) => typeof v === "string" && RULE_ID.test(v),
      "a rule ID (a track prefix and three digits)",
    );
    field("title", (v) => typeof v === "string" && v.trim() !== "", "a non-empty string");
    field("track", (v) => RULE_TRACKS.includes(v), `one of ${RULE_TRACKS.join(", ")}`);
    field("tier", (v) => v === 1 || v === 2, "1 or 2");
    field(
      "module",
      (v) => v === undefined || v === null || (typeof v === "string" && v !== ""),
      "null or a module name",
    );
    field("enforcement", (v) => ENFORCEMENT.includes(v), `one of ${ENFORCEMENT.join(", ")}`);
    field(
      "gate",
      (v) =>
        v === undefined ||
        v === null ||
        (typeof v === "object" &&
          !Array.isArray(v) &&
          typeof v.kind === "string" &&
          typeof v.id === "string"),
      'null or an object with "kind" and "id"',
    );
    field("defaultEnabled", (v) => typeof v === "boolean", "true or false");
    field(
      "profiles",
      (v) =>
        v === undefined || v === null || (Array.isArray(v) && v.every((p) => PROFILES.includes(p))),
      `absent or a list of ${PROFILES.join(", ")}`,
    );
    if (typeof raw.id === "string") {
      if (seen.has(raw.id)) report(`${pointer}/id`, `duplicate rule id ${raw.id}`);
      seen.add(raw.id);
    }
    if (problems.length > before) return;

    const gate =
      raw.gate === undefined || raw.gate === null
        ? null
        : {
            kind: raw.gate.kind,
            id: raw.gate.id,
            ...(raw.gate.discriminator === undefined
              ? {}
              : { discriminator: raw.gate.discriminator }),
          };
    const values = {
      id: raw.id,
      title: raw.title,
      track: raw.track,
      tier: raw.tier,
      module: raw.module ?? null,
      enforcement: raw.enforcement,
      gate,
      defaultEnabled: raw.defaultEnabled,
      profiles: raw.profiles ?? null,
    };
    rules.push(Object.fromEntries(RUNTIME_RULE_FIELDS.map((name) => [name, values[name]])));
  });
  rules.sort((a, b) => compareCodeUnits(a.id, b.id));
  return { rules, problems };
}

// ---------------------------------------------------------------------------------------------
// Vendoring
// ---------------------------------------------------------------------------------------------

function vendoredIncludes(root, pkg) {
  if (pkg.include !== undefined) return pkg.include;
  const manifestPath = `${pkg.source}/package.json`;
  let manifest;
  try {
    manifest = JSON.parse(readSource(root, manifestPath).toString("utf8"));
  } catch (error) {
    if (error instanceof SourceProblem) {
      throw new SourceProblem(
        pkg.source,
        'has no package.json; give the vendored entry an "include" list',
      );
    }
    throw new SourceProblem(manifestPath, `invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(manifest.files)) {
    throw new SourceProblem(
      manifestPath,
      'has no "files" list; give the vendored entry an "include" list',
    );
  }
  const extras = fs
    .readdirSync(abs(root, pkg.source))
    .filter((name) => /^(?:readme|license|licence|changelog)(?:\.[a-z]+)?$/i.test(name))
    .sort(compareCodeUnits);
  return ["package.json", ...manifest.files, ...extras];
}

/**
 * Plans the vendored copies: maps every target file (repository-relative) to its content.
 *
 * @param {string} root
 * @param {ReadonlyArray<VendoredPackage>} packages
 * @returns {Map<string, Buffer>}
 */
export function planVendoring(root, packages) {
  const planned = new Map();
  const targetsSeen = new Set();
  for (const pkg of packages) {
    if (!isSafeRelative(pkg.source) || !pkg.source.startsWith("packages/")) {
      throw new SourceProblem(
        SELF,
        `vendored source "${pkg.source}" must be a directory under packages/`,
      );
    }
    if (!Array.isArray(pkg.targets) || pkg.targets.length === 0) {
      throw new SourceProblem(pkg.source, "a vendored package needs at least one target");
    }
    const files = new Set();
    for (const include of vendoredIncludes(root, pkg)) {
      if (!isSafeRelative(include) || /[*?[\]{}!]/.test(include)) {
        throw new SourceProblem(
          pkg.source,
          `include entry "${include}" must be a plain relative path`,
        );
      }
      const includePath = `${pkg.source}/${include}`;
      let stats;
      try {
        stats = fs.lstatSync(abs(root, includePath));
      } catch {
        throw new SourceProblem(includePath, "listed for vendoring but not found");
      }
      if (stats.isSymbolicLink())
        throw new SourceProblem(includePath, "symbolic links are not allowed here");
      if (stats.isDirectory()) {
        for (const file of listFiles(root, includePath)) files.add(`${include}/${file}`);
      } else {
        files.add(include);
      }
    }
    for (const target of pkg.targets) {
      if (!VENDOR_TARGET.test(target)) {
        throw new SourceProblem(
          pkg.source,
          `target "${target}" must look like <track>/vendor/<name>`,
        );
      }
      if (targetsSeen.has(target))
        throw new SourceProblem(pkg.source, `target "${target}" is used twice`);
      targetsSeen.add(target);
      for (const file of [...files].sort(compareCodeUnits)) {
        planned.set(
          `${PATHS.templates}/${target}/${file}`,
          readSource(root, `${pkg.source}/${file}`),
        );
      }
    }
  }
  return planned;
}

// ---------------------------------------------------------------------------------------------
// The kit tool's generated block
// ---------------------------------------------------------------------------------------------

/**
 * Replaces the generated block of cross-stack.mjs with `data`.
 *
 * @param {string} text Current file content (LF line endings).
 * @param {object} data Value of the GENERATED constant.
 * @returns {string}
 */
export function renderGeneratedBlock(text, data) {
  const begin = text.indexOf(GENERATED_BEGIN);
  const end = text.indexOf(GENERATED_END);
  if (
    begin === -1 ||
    end === -1 ||
    end < begin ||
    text.indexOf(GENERATED_BEGIN, begin + 1) !== -1
  ) {
    throw new SourceProblem(
      PATHS.bin,
      `needs exactly one "${GENERATED_BEGIN}" … "${GENERATED_END}" block`,
    );
  }
  const block = [
    GENERATED_BEGIN,
    "// Written by scripts/build-plugin-data.mjs from VERSION and schemas/*.json. Do not edit by hand.",
    "// prettier-ignore",
    `const GENERATED = ${JSON.stringify(data, null, 2)};`,
    GENERATED_END,
  ].join("\n");
  return `${text.slice(0, begin)}${block}${text.slice(end + GENERATED_END.length)}`;
}

// ---------------------------------------------------------------------------------------------
// Plan, compare, write
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} Plan
 * @property {Map<string, Buffer>} files  Every generated file (repository-relative) and its content.
 * @property {(relativePath: string) => boolean} isManaged  True for paths inside generated areas,
 *   where a file that is not planned is stale.
 * @property {(relativePath: string) => boolean} isKept  True for files inside generated areas
 *   that the build leaves alone (earlier template-hashes, reserved directories).
 */

/**
 * Computes the full expected state from the sources without touching the disk.
 *
 * @param {{ root: string, vendored?: ReadonlyArray<VendoredPackage> }} options
 * @returns {{ plan: Plan|null, problems: SourceProblem[] }}
 */
export function planBuild({ root, vendored = VENDORED_PACKAGES }) {
  const problems = [];
  const collect = (fn) => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof SourceProblem) {
        problems.push(error);
        return null;
      }
      throw error;
    }
  };

  const version = collect(() => readVersion(root));
  if (version === null) return { plan: null, problems };

  const standard = loadSchema(root, PATHS.standardSchema, version, problems);
  const allowlist = loadSchema(root, PATHS.allowlistSchema, version, problems);
  const protectedPaths = collect(() => readJsonSource(root, PATHS.protectedPaths));
  if (protectedPaths) problems.push(...validateProtectedPaths(protectedPaths));
  const marketplace = collect(() => readJsonSource(root, PATHS.marketplace));
  const companions = marketplace ? companionData(marketplace) : null;
  if (companions) problems.push(...companions.problems);
  const registry = collect(() => loadRuntimeRules(root));
  if (registry) problems.push(...registry.problems);
  const vendoredFiles = collect(() => planVendoring(root, vendored));
  const binText = collect(() => normalizeEol(readSource(root, PATHS.bin)).toString("utf8"));
  const bin =
    binText === null
      ? null
      : collect(() =>
          renderGeneratedBlock(binText, {
            version,
            standardSchema: standard?.value ?? {},
            allowlistSchema: allowlist?.value ?? {},
          }),
        );
  const templateFiles = collect(() => listFiles(root, PATHS.templates));
  const license = collect(() => readSource(root, PATHS.license));
  if (problems.length > 0) return { plan: null, problems };

  const files = new Map();
  const data = (name) => `${PATHS.data}/${name}`;
  const hashesName = `template-hashes/${version}.json`;

  files.set(
    data("rules.json"),
    Buffer.from(
      formatJson({
        $comment: `${GENERATED_NOTE} Source: ${PATHS.registry}.`,
        version,
        rules: registry.rules,
      }),
    ),
  );
  files.set(data("standard.schema.json"), Buffer.from(standard.text));
  files.set(data("allowlist.schema.json"), Buffer.from(allowlist.text));
  files.set(data("protected-paths.json"), Buffer.from(protectedPaths.text));
  files.set(
    data("companions.json"),
    Buffer.from(
      formatJson({
        $comment: `${GENERATED_NOTE} Source: ${PATHS.marketplace}.`,
        version: 1,
        companions: companions.companions,
      }),
    ),
  );
  files.set(PATHS.pluginLicense, license);

  // Kit templates as they will be after this build: vendored copies replaced, bin regenerated.
  const isVendorPath = (relativePath) => /^[^/]+\/vendor\//.test(relativePath);
  const kit = new Set(templateFiles.filter((file) => !isVendorPath(file)));
  for (const [target, content] of vendoredFiles) {
    kit.add(target.slice(PATHS.templates.length + 1));
    files.set(target, content);
  }
  files.set(PATHS.bin, Buffer.from(bin));

  const hashes = {};
  for (const file of [...kit].sort(compareCodeUnits)) {
    const repoPath = `${PATHS.templates}/${file}`;
    hashes[file] = templateHash(files.get(repoPath) ?? fs.readFileSync(abs(root, repoPath)));
  }
  files.set(
    data(hashesName),
    Buffer.from(
      formatJson({
        $comment: `${GENERATED_NOTE} SHA-256 of every kit template file at version ${version}, for the upgrade skill; text files are hashed with LF line endings.`,
        version,
        algorithm: "sha256",
        files: hashes,
      }),
    ),
  );
  files.set(
    data("version.json"),
    Buffer.from(
      formatJson({
        $comment: GENERATED_NOTE,
        name: "cross-stack-standard",
        version,
        ruleCount: registry.rules.length,
        templateFileCount: kit.size,
        templateHashes: hashesName,
        schemas: { standard: standard.value.$id, allowlist: allowlist.value.$id },
      }),
    ),
  );

  const historyFile = /^template-hashes\/[^/]+\.json$/;
  const plan = {
    files,
    isManaged: (relativePath) =>
      isInside(relativePath, PATHS.data) ||
      (isInside(relativePath, PATHS.templates) &&
        isVendorPath(relativePath.slice(PATHS.templates.length + 1))),
    isKept: (relativePath) => {
      if (!isInside(relativePath, PATHS.data)) return false;
      const inData = relativePath.slice(PATHS.data.length + 1);
      if (DATA_RESERVED_DIRS.some((dir) => isInside(inData, dir))) return true;
      return (
        historyFile.test(inData) &&
        SEMVER.test(inData.slice("template-hashes/".length, -".json".length))
      );
    },
  };
  return { plan, problems };
}

/**
 * The next patch pre-release of a version, as a suggestion (`1.2.3` -> `1.2.4-dev.0`).
 *
 * @param {string} version
 * @returns {string}
 */
export function nextPrerelease(version) {
  const [major, minor, patch] = version.split(/[-+]/)[0].split(".").map(Number);
  return `${major}.${minor}.${patch + 1}-dev.0`;
}

function firstDifferentLine(expected, actual) {
  if (!isText(expected) || !isText(actual)) return 1;
  const a = expected.toString("utf8").split("\n");
  const b = actual.toString("utf8").split("\n");
  const limit = Math.max(a.length, b.length);
  for (let i = 0; i < limit; i += 1) if (a[i] !== b[i]) return i + 1;
  return 1;
}

/**
 * Compares a plan with the disk.
 *
 * @param {string} root
 * @param {Plan} plan
 * @returns {{ changed: Array<{path: string, line: number, reason: string}>, stale: string[], unchanged: number }}
 */
export function comparePlan(root, plan) {
  const changed = [];
  let unchanged = 0;
  for (const [relativePath, expected] of plan.files) {
    let actual;
    try {
      actual = fs.readFileSync(abs(root, relativePath));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      changed.push({ path: relativePath, line: 1, reason: "missing" });
      continue;
    }
    const want = normalizeEol(expected);
    const have = normalizeEol(actual);
    if (want.equals(have)) unchanged += 1;
    else
      changed.push({
        path: relativePath,
        line: firstDifferentLine(want, have),
        reason: "out of date",
      });
  }
  const stale = [];
  const areas = [PATHS.data, ...listVendorDirs(root)];
  for (const area of areas) {
    for (const file of listFiles(root, area)) {
      const relativePath = `${area}/${file}`;
      if (
        !plan.files.has(relativePath) &&
        plan.isManaged(relativePath) &&
        !plan.isKept(relativePath)
      ) {
        stale.push(relativePath);
      }
    }
  }
  return { changed, stale: stale.sort(compareCodeUnits), unchanged };
}

function listVendorDirs(root) {
  let tracks = [];
  try {
    tracks = fs.readdirSync(abs(root, PATHS.templates), { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return tracks
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${PATHS.templates}/${entry.name}/vendor`)
    .filter((dir) => fs.existsSync(abs(root, dir)))
    .sort(compareCodeUnits);
}

function removeEmptyDirs(root, relativeDir, stopAt) {
  let current = relativeDir;
  while (current !== stopAt && isInside(current, stopAt)) {
    const absolute = abs(root, current);
    if (!fs.existsSync(absolute) || fs.readdirSync(absolute).length > 0) return;
    fs.rmdirSync(absolute);
    current = current.slice(0, current.lastIndexOf("/"));
  }
}

/**
 * @typedef {object} BuildResult
 * @property {boolean} ok
 * @property {"write"|"check"} mode
 * @property {string[]} written  Files written (write mode).
 * @property {string[]} removed  Stale files removed (write mode).
 * @property {Array<{id: string, path: string, line: number, message: string}>} findings
 *   Out-of-date files (check mode) and source problems (both modes).
 * @property {number} unchanged
 */

/**
 * Whether CHANGELOG.md records `version` as released (a dated `## [X.Y.Z] - YYYY-MM-DD` section).
 *
 * @param {string} root
 * @param {string} version
 * @returns {boolean}
 */
export function isReleasedVersion(root, version) {
  let text;
  try {
    text = fs.readFileSync(abs(root, PATHS.changelog), "utf8");
  } catch {
    return false;
  }
  return parseChangelog(text).sections.some(
    (section) => section.version === version && Boolean(section.date),
  );
}

/**
 * Builds the plugin data, or with `check` only reports what is out of date.
 *
 * @param {{ root?: string, check?: boolean, refreeze?: boolean, vendored?: ReadonlyArray<VendoredPackage> }} [options]
 * @returns {BuildResult}
 */
export function buildPluginData({
  root = DEFAULT_ROOT,
  check = false,
  refreeze = false,
  vendored = VENDORED_PACKAGES,
} = {}) {
  const mode = check ? "check" : "write";
  const failed = (problems) => ({
    ok: false,
    mode,
    written: [],
    removed: [],
    unchanged: 0,
    findings: problems.map((problem) => ({
      id: "source-invalid",
      path: problem.file,
      line: problem.line,
      message: problem.message,
    })),
  });
  const { plan, problems } = planBuild({ root, vendored });
  if (!plan) return failed(problems);
  let comparison;
  try {
    comparison = comparePlan(root, plan);
  } catch (error) {
    if (error instanceof SourceProblem) return failed([error]);
    throw error;
  }
  const { changed, stale, unchanged } = comparison;
  const version = JSON.parse(plan.files.get(`${PATHS.data}/version.json`).toString("utf8")).version;
  const frozen = `${PATHS.data}/template-hashes/${version}.json`;
  const rewritesFrozen = changed.find(
    (entry) => entry.path === frozen && entry.reason !== "missing",
  );
  if (rewritesFrozen && !refreeze && isReleasedVersion(root, version)) {
    return {
      ok: false,
      mode,
      written: [],
      removed: [],
      unchanged,
      findings: [
        {
          id: "released-hashes",
          path: frozen,
          line: rewritesFrozen.line,
          message:
            `belongs to the released version ${version} (CHANGELOG.md has its dated section) and ` +
            "cannot change; set VERSION to the next pre-release (for example " +
            `${nextPrerelease(version)}) and run node scripts/stamp-version.mjs first`,
        },
      ],
    };
  }
  if (check) {
    const findings = [
      ...changed.map((entry) => ({
        id: "data-drift",
        path: entry.path,
        line: entry.line,
        message: `${entry.reason}; run node scripts/build-plugin-data.mjs`,
      })),
      ...stale.map((relativePath) => ({
        id: "data-drift",
        path: relativePath,
        line: 1,
        message:
          "is not generated by this build; remove it or run node scripts/build-plugin-data.mjs",
      })),
    ];
    return { ok: findings.length === 0, mode, written: [], removed: [], unchanged, findings };
  }

  const written = [];
  for (const entry of changed) {
    const target = abs(root, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, plan.files.get(entry.path));
    written.push(entry.path);
  }
  for (const relativePath of stale) {
    fs.rmSync(abs(root, relativePath));
    const area = isInside(relativePath, PATHS.data) ? PATHS.data : PATHS.templates;
    removeEmptyDirs(root, relativePath.slice(0, relativePath.lastIndexOf("/")), area);
  }
  return { ok: true, mode, written, removed: stale, unchanged, findings: [] };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

const USAGE = `Usage: node scripts/build-plugin-data.mjs [--check] [--refreeze] [--json] [--root <dir>]

Generates ${PATHS.data}/ from ${PATHS.registry}, schemas/ and VERSION,
embeds the schemas in the kit's cross-stack.mjs, vendors the gate packages into the kit,
copies LICENSE into the plugin and records the SHA-256 of every kit template file.

Options:
  --check        Change nothing; exit 1 when a generated file is out of date.
  --refreeze     Allow rewriting the template hashes of a version CHANGELOG.md already dates
                 (only on that version's release branch, before its tag).
  --json         Print a machine-readable report.
  --root <dir>   Repository root (default: the repository this script belongs to).
  -h, --help     Show this help.

Exit codes: 0 up to date or written, 1 out of date or invalid sources, 2 usage or internal error.`;

/**
 * Runs the CLI.
 *
 * @param {string[]} argv Arguments after the script path.
 * @param {{ stdout?: (text: string) => void, stderr?: (text: string) => void }} [io]
 * @returns {number} Exit code.
 */
export function main(argv, io = {}) {
  const out = io.stdout ?? ((text) => process.stdout.write(text));
  const err = io.stderr ?? ((text) => process.stderr.write(text));
  try {
    let values;
    try {
      ({ values } = parseArgs({
        args: argv,
        options: {
          check: { type: "boolean" },
          refreeze: { type: "boolean" },
          json: { type: "boolean" },
          root: { type: "string" },
          help: { type: "boolean", short: "h" },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch (error) {
      throw new UsageError(error.message);
    }
    if (values.help) {
      out(`${USAGE}\n`);
      return 0;
    }
    const root = values.root === undefined ? DEFAULT_ROOT : path.resolve(values.root);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new UsageError(`--root ${values.root} is not a directory`);
    }

    const result = buildPluginData({
      root,
      check: Boolean(values.check),
      refreeze: Boolean(values.refreeze),
    });
    if (values.json) {
      out(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      for (const finding of result.findings) {
        out(`${finding.id} ${finding.path}:${finding.line} ${finding.message}\n`);
      }
      for (const file of result.written) out(`wrote ${file}\n`);
      for (const file of result.removed) out(`removed ${file}\n`);
      out(`${summarize(result)}\n`);
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof UsageError) {
      err(`build-plugin-data: ${error.message}\n\n${USAGE}\n`);
      return 2;
    }
    err(
      `build-plugin-data: internal error: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    return 2;
  }
}

function summarize(result) {
  const name = result.mode === "check" ? "build-plugin-data --check" : "build-plugin-data";
  if (result.findings.some((finding) => finding.id === "source-invalid")) {
    return `${name}: ${result.findings.length} problem(s) in the sources; nothing was generated`;
  }
  if (result.findings.some((finding) => finding.id === "released-hashes")) {
    return `${name}: the released template hashes would change; nothing was generated`;
  }
  if (result.mode === "check") {
    return result.ok
      ? `${name}: up to date (${result.unchanged} generated files)`
      : `${name}: ${result.findings.length} file(s) out of date`;
  }
  const changes = result.written.length + result.removed.length;
  return changes === 0
    ? `${name}: up to date (${result.unchanged} generated files)`
    : `${name}: wrote ${result.written.length}, removed ${result.removed.length}, unchanged ${result.unchanged}`;
}

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2));

/** True when Node runs this file directly (not when a test imports it). */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  const real = (target) => {
    try {
      return fs.realpathSync(target);
    } catch {
      return path.resolve(target);
    }
  };
  return real(process.argv[1]) === real(fileURLToPath(import.meta.url));
}
