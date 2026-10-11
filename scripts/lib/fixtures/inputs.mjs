/**
 * Fingerprint of everything a fixture run's verdict depends on in the repository: the rule's
 * registry entry, the files of its clean, clean-overlay and violation fixture directories, the
 * host definition (with the hosts it includes), and the gate's own implementation (the plugin's
 * hook scripts and data for hook gates, the kit tool for script gates). The fixture runner records it with every
 * result; check-registry recomputes it, so a report produced before a fixture, host or registry
 * change is rejected as stale instead of being trusted.
 *
 * @module
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Version of the fingerprint recipe; part of every digest. */
export const INPUTS_VERSION = 2;

/**
 * Repository paths (files or directories) that implement a gate kind, relative to the root. A
 * change to any of them makes an older fixture report stale.
 */
export const GATE_IMPLEMENTATION = Object.freeze({
  hook: [
    "plugins/cross-stack-standard/hooks/hooks.json",
    "plugins/cross-stack-standard/scripts",
    "plugins/cross-stack-standard/data/protected-paths.json",
    "plugins/cross-stack-standard/data/standard.schema.json",
    "scripts/lib/fixtures/hook-gate.mjs",
  ],
  script: ["plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs"],
});

/**
 * JSON with object keys sorted at every level (a stable form of a value).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Files below a directory, sorted, as `/`-separated relative paths (symbolic links hash their
 * target text). A missing directory has no files.
 *
 * @param {string} dir
 * @returns {Array<{ rel: string, abs: string, link: boolean }>}
 */
function listTree(dir) {
  const out = [];
  const visit = (abs, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) out.push({ rel: childRel, abs: childAbs, link: true });
      else if (entry.isDirectory()) visit(childAbs, childRel);
      else if (entry.isFile()) out.push({ rel: childRel, abs: childAbs, link: false });
    }
  };
  visit(dir, "");
  return out;
}

/**
 * host.json files of a host and every host it includes (breadth first, each once).
 *
 * @param {string} harnessDir
 * @param {string} hostName
 * @returns {Array<{ name: string, file: string }>}
 */
function hostFiles(harnessDir, hostName) {
  const seen = new Set();
  const queue = [hostName];
  const files = [];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name) || typeof name !== "string") continue;
    seen.add(name);
    const file = path.join(harnessDir, name, "host.json");
    files.push({ name, file });
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const entry of Array.isArray(raw.include) ? raw.include : []) queue.push(entry?.host);
    } catch {
      // A missing or broken host hashes as absent; the run itself reports the problem.
    }
  }
  return files;
}

/**
 * Digest of a fixture run's inputs.
 *
 * @param {object} options
 * @param {object} options.rule The rule's registry entry, as it appears in rules.json.
 * @param {string} options.hostName Host the run used.
 * @param {string} options.fixturesDir Absolute `test/fixtures` directory.
 * @param {string} options.harnessDir Absolute `test/harness` directory.
 * @returns {string} `sha256:<hex>`
 */
export function fixtureInputsDigest({ rule, hostName, fixturesDir, harnessDir }) {
  const hash = createHash("sha256");
  const add = (label, data) => {
    hash.update(`${label}\u0000`);
    hash.update(data);
    hash.update("\u0000");
  };
  add("version", String(INPUTS_VERSION));
  add("rule", stableStringify(rule));
  const trackDir = path.join(fixturesDir, String(rule.track));
  const layers = [
    ["clean", path.join(trackDir, "clean")],
    ["cleanOverlay", path.join(trackDir, "clean-overlays", String(rule.id))],
    ["violation", path.join(trackDir, "violations", String(rule.id))],
  ];
  for (const [label, dir] of layers) {
    for (const file of listTree(dir)) {
      add(`${label}:${file.link ? "link" : "file"}:${file.rel}`, readForHash(file));
    }
  }
  const repoRoot = path.resolve(fixturesDir, "..", "..");
  for (const rel of GATE_IMPLEMENTATION[rule?.gate?.kind] ?? []) {
    const abs = path.join(repoRoot, rel);
    let stat = null;
    try {
      stat = fs.statSync(abs);
    } catch {
      add(`gate:${rel}`, "<missing>");
      continue;
    }
    if (stat.isDirectory()) {
      for (const file of listTree(abs)) {
        add(`gate:${rel}/${file.rel}`, readForHash(file));
      }
    } else {
      add(`gate:${rel}`, readForHash({ abs, link: false }));
    }
  }
  for (const host of hostFiles(harnessDir, hostName)) {
    let content = "";
    try {
      content = fs.readFileSync(host.file);
    } catch {
      content = "<missing>";
    }
    add(`host:${host.name}`, content);
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * @param {{ abs: string, link: boolean }} file
 * @returns {Buffer | string}
 */
function readForHash(file) {
  try {
    return file.link ? fs.readlinkSync(file.abs) : fs.readFileSync(file.abs);
  } catch {
    return "<unreadable>";
  }
}
