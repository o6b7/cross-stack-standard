/**
 * Build one work directory: copy the host (hard-linking its dependency directories), apply the
 * fixture layers, create the scratch git history for git hosts, and run the host's `prepare`
 * commands.
 *
 * Order:
 * 1. included hosts into their subdirectories, then the host's own files (`host.json` excluded);
 * 2. each layer in order: files, `rename`, `remove`, then `manifestOverlay`;
 * 3. git hosts: `git init` and the initial commit; then every layer's `base/` in one commit and
 *    every layer's `head/` in one commit (when declared);
 * 4. `prepare` commands of included hosts (in their subdirectories), then of the host.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { copyPath, copyTree, newCopyStats } from "./copy.mjs";
import { FIXTURE_FILE, layerSkipSet } from "./fixture-config.mjs";
import { ScratchRepo } from "./git.mjs";
import { HOST_FILE, placeholderValues } from "./host.mjs";
import { applyMergePatch } from "./merge-patch.mjs";
import { resolveInside } from "./paths.mjs";
import { runProcess, tailLines } from "./process.mjs";
import { expandArgv, expandString } from "./template.mjs";

/** Location of the project manifest that `manifestOverlay` patches. */
export const MANIFEST_PATH = ".cross-stack/standard.json";

/** Default commit messages for git hosts. */
export const DEFAULT_COMMIT_MESSAGES = Object.freeze({
  initial: "chore: initial fixture state",
  base: "chore: base fixture state",
  head: "chore: head fixture state",
});

/**
 * Copy a host and the hosts it includes into `dest`.
 *
 * @param {import("./host.mjs").HostDefinition} host Host definition.
 * @param {string} dest Destination directory.
 * @param {{ stats: import("./copy.mjs").CopyStats, link?: (src: string, dest: string) => void }} options
 *   Statistics to update and an optional link function.
 */
export function copyHost(host, dest, { stats, link }) {
  for (const entry of host.include) {
    const target = resolveInside(dest, entry.into, `${host.label} include "${entry.into}"`);
    copyHost(entry.host, target, { stats, link });
  }
  copyTree(host.dir, dest, {
    hardlink: host.copy.hardlink,
    detach: host.copy.detach,
    exclude: host.copy.exclude,
    skip: new Set([HOST_FILE]),
    stats,
    link,
  });
}

/**
 * Apply a JSON Merge Patch to `.cross-stack/standard.json` in the work directory (created as
 * `{}` when missing). The file is replaced, never edited in place.
 *
 * @param {string} workdir Work directory.
 * @param {Record<string, unknown>} overlay Merge patch.
 * @param {string} label Layer label for messages.
 */
export function applyManifestOverlay(workdir, overlay, label) {
  const file = path.join(workdir, ...MANIFEST_PATH.split("/"));
  let current = {};
  if (fs.existsSync(file)) {
    try {
      current = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      throw new Error(
        `${label}: cannot apply manifestOverlay, ${MANIFEST_PATH} is invalid: ${err.message}`,
        { cause: err },
      );
    }
    fs.unlinkSync(file);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(applyMergePatch(current, overlay), null, 2)}\n`);
}

/**
 * Apply a layer's files, renames, removals and manifest overlay.
 *
 * @param {import("./fixture-config.mjs").Layer} layer Layer.
 * @param {string} workdir Work directory.
 * @param {import("./copy.mjs").CopyStats} stats Statistics to update.
 */
export function applyLayer(layer, workdir, stats) {
  copyTree(layer.dir, workdir, { skip: layerSkipSet(layer), stats });
  const config = layer.config;
  if (!config) return;
  const where = `${layer.label}/${FIXTURE_FILE}`;
  for (const [from, to] of Object.entries(config.rename)) {
    copyPath(
      resolveInside(layer.dir, from, `${where} rename source`),
      resolveInside(workdir, to, `${where} rename target`),
      stats,
    );
  }
  for (const rel of config.remove) {
    const abs = resolveInside(workdir, rel, `${where} remove`);
    let exists = true;
    try {
      fs.lstatSync(abs);
    } catch {
      exists = false;
    }
    if (!exists) throw new Error(`${where}: remove: "${rel}" does not exist in the work directory`);
    fs.rmSync(abs, { recursive: true, force: true });
  }
  if (config.manifestOverlay) applyManifestOverlay(workdir, config.manifestOverlay, where);
}

function lastMessage(layers, key) {
  let message = null;
  for (const layer of layers) message = layer.config?.commitMessages?.[key] ?? message;
  return message;
}

/**
 * Expand an environment template map.
 *
 * @param {Record<string, string>} templates Environment templates.
 * @param {Record<string, string | null | undefined>} values Placeholder values.
 * @param {string} where Context for messages.
 * @returns {Record<string, string>} Expanded environment entries.
 */
export function expandEnv(templates, values, where) {
  const out = {};
  for (const [name, template] of Object.entries(templates)) {
    out[name] = expandString(template, values, `${where}.${name}`);
  }
  return out;
}

async function runPrepare(host, dir, context) {
  for (const entry of host.include) {
    await runPrepare(entry.host, path.join(dir, ...entry.into.split("/")), context);
  }
  const values = placeholderValues(host, {
    repoRoot: context.repoRoot,
    workdir: dir,
    cliVars: context.cliVars,
  });
  const env = { ...context.env, ...expandEnv(host.env, values, `${host.label} env`) };
  for (const [index, template] of host.prepare.entries()) {
    const where = `${host.label} prepare[${index}]`;
    const argv = expandArgv(template, values, where);
    const result = await runProcess({
      argv,
      cwd: dir,
      env,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
    });
    if (result.exitCode !== 0) {
      const why = result.error ?? (result.timedOut ? "timed out" : `exit ${result.exitCode}`);
      const tail = tailLines(result.output, 20).join("\n");
      throw new Error(`${where} (${argv.join(" ")}) failed: ${why}${tail ? `\n${tail}` : ""}`);
    }
  }
}

/**
 * @typedef {object} BuiltWorkdir
 * @property {string} base Base commit SHA, or "" when no layer declares base/head.
 * @property {string} head Head commit SHA, or "" when no layer declares base/head.
 * @property {import("./copy.mjs").CopyStats} copy Copy statistics.
 */

/**
 * Build a work directory for one gate run.
 *
 * @param {object} options Options.
 * @param {import("./host.mjs").HostDefinition} options.host Host.
 * @param {import("./fixture-config.mjs").Layer[]} options.layers Layers in order.
 * @param {string} options.workdir Work directory to create.
 * @param {Record<string, string>} options.env Base environment.
 * @param {string} options.repoRoot Repository root.
 * @param {Record<string, string>} [options.cliVars] Host variable overrides.
 * @param {number} options.timeoutMs Timeout for each prepare command.
 * @param {AbortSignal} [options.signal] Abort signal.
 * @param {(src: string, dest: string) => void} [options.link] Link function (tests).
 * @returns {Promise<BuiltWorkdir>} Commit ids and copy statistics.
 */
export async function buildWorkdir(options) {
  const { host, layers, workdir, env, signal } = options;
  const stats = newCopyStats();
  fs.mkdirSync(workdir, { recursive: true });
  copyHost(host, workdir, { stats, link: options.link });
  for (const layer of layers) applyLayer(layer, workdir, stats);

  const baseLayers = layers.filter((layer) => layer.config?.base);
  const headLayers = layers.filter((layer) => layer.config?.head);
  let base = "";
  let head = "";
  if ((baseLayers.length > 0 || headLayers.length > 0) && !host.git) {
    const names = [...baseLayers, ...headLayers].map((layer) => layer.label).join(", ");
    throw new Error(
      `${names}: base/head need a host with "git": true, but host "${host.name}" has none`,
    );
  }
  if (host.git) {
    const repo = new ScratchRepo(workdir, env, signal);
    await repo.init();
    const initial = await repo.commitAll(DEFAULT_COMMIT_MESSAGES.initial);
    if (baseLayers.length > 0 || headLayers.length > 0) {
      base = initial;
      if (baseLayers.length > 0) {
        for (const layer of baseLayers) {
          copyTree(path.join(layer.dir, ...layer.config.base.split("/")), workdir, { stats });
        }
        base = await repo.commitAll(lastMessage(layers, "base") ?? DEFAULT_COMMIT_MESSAGES.base);
      }
      head = base;
      if (headLayers.length > 0) {
        for (const layer of headLayers) {
          copyTree(path.join(layer.dir, ...layer.config.head.split("/")), workdir, { stats });
        }
        head = await repo.commitAll(lastMessage(layers, "head") ?? DEFAULT_COMMIT_MESSAGES.head);
      }
    }
  }

  await runPrepare(host, workdir, {
    repoRoot: options.repoRoot,
    cliVars: options.cliVars,
    env,
    timeoutMs: options.timeoutMs,
    signal,
  });
  return { base, head, copy: stats };
}
