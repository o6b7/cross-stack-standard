/**
 * Fallback track detection for projects without a manifest: a bounded, breadth-first walk from
 * the project directory that reports every track it finds (a Laravel API next to a Next.js app
 * reports both).
 *
 * Per manifest file:
 * - `composer.json` whose `require` or `require-dev` has `laravel/framework` → `laravel`;
 * - `package.json` whose dependencies (any of `dependencies`, `devDependencies`,
 *   `peerDependencies`, `optionalDependencies`) include `expo`, `expo-router` or `react-native`
 *   → `mobile`, and that file is not also counted as web (every Expo app depends on React);
 * - otherwise a `package.json` with `next` or `react` → `web`.
 *
 * Bounds: directories at most {@link DETECT_LIMITS}.maxDepth levels below the root; build,
 * dependency and tool directories pruned ({@link PRUNED_DIRS}, plus every directory whose name
 * starts with a dot, such as `.git` or `.cross-stack` with its vendored gate packages); symbolic
 * links not followed; caps on directories and elapsed time. A directory with more entries than
 * the per-directory cap (a flat asset, fixture or cache directory) is read only that far and the
 * walk goes on, so one such directory cannot use up the walk; a total entry cap stays behind it
 * as a safety net. A walk stopped by a cap returns what it found and says why it stopped.
 *
 * @module plugins/cross-stack-standard/scripts/lib/detect
 */

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { TRACKS } from "./manifest.mjs";
import { readTextCapped, relativePosix } from "./project.mjs";

/** Directory names never entered. Names starting with a dot are skipped as well. */
export const PRUNED_DIRS = Object.freeze([
  "node_modules",
  "vendor",
  ".git",
  "dist",
  "build",
  ".next",
  ".expo",
  ".turbo",
  ".cache",
  "coverage",
]);

/** Default bounds of the walk. */
export const DETECT_LIMITS = Object.freeze({
  /** Deepest directory level scanned; the root is level 0. */
  maxDepth: 4,
  /** Directories read at most. */
  maxDirs: 2_000,
  /** Entries read from any one directory; the rest of that directory is skipped. */
  maxEntriesPerDir: 5_000,
  /** Directory entries examined in total: a safety net behind the other caps. */
  maxEntries: 100_000,
  /**
   * Elapsed time allowed, in milliseconds. With Node.js start-up and the entry point's own
   * work, SessionStart stays near its 200 ms target.
   */
  timeMs: 150,
  /** Largest manifest file parsed. */
  maxManifestBytes: 1024 * 1024,
});

/** Entries read between two checks of the clock inside one directory. */
const CLOCK_EVERY = 512;

const PRUNED = new Set(PRUNED_DIRS);
const MOBILE_PACKAGES = ["expo", "expo-router", "react-native"];
const WEB_PACKAGES = ["next", "react"];
const DEPENDENCY_BLOCKS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasAny(blocks, names) {
  return blocks.some((block) => names.some((name) => Object.hasOwn(block, name)));
}

/**
 * The track a parsed `package.json` indicates, or null.
 *
 * @param {unknown} pkg
 * @returns {"mobile" | "web" | null}
 */
export function trackFromPackageJson(pkg) {
  if (!isPlainObject(pkg)) return null;
  const blocks = DEPENDENCY_BLOCKS.map((name) => pkg[name]).filter(isPlainObject);
  if (hasAny(blocks, MOBILE_PACKAGES)) return "mobile";
  if (hasAny(blocks, WEB_PACKAGES)) return "web";
  return null;
}

/**
 * The track a parsed `composer.json` indicates, or null.
 *
 * @param {unknown} composer
 * @returns {"laravel" | null}
 */
export function trackFromComposerJson(composer) {
  if (!isPlainObject(composer)) return null;
  const blocks = [composer.require, composer["require-dev"]].filter(isPlainObject);
  return hasAny(blocks, ["laravel/framework"]) ? "laravel" : null;
}

const READERS = {
  "composer.json": trackFromComposerJson,
  "package.json": trackFromPackageJson,
};

/**
 * @typedef {object} Detection
 * @property {string[]} tracks Detected tracks, in schema order.
 * @property {Record<string, string[]>} sources Root-relative manifest paths per track (`/`).
 * @property {null | "dirs" | "entries" | "time"} truncated Why the walk stopped early, if it did.
 * @property {number} dirs Directories read.
 * @property {number} entries Directory entries examined.
 * @property {number} cappedDirs Directories read only up to the per-directory cap.
 * @property {number} durationMs
 */

/**
 * Walks the project and reports every track found.
 *
 * @param {string} root
 * @param {Partial<typeof DETECT_LIMITS>} [limits]
 * @param {() => number} [now] Clock in milliseconds (tests pass their own).
 * @returns {Detection}
 */
export function detectTracks(root, limits = {}, now = () => performance.now()) {
  const bounds = { ...DETECT_LIMITS, ...limits };
  const started = now();
  /** @type {Record<string, string[]>} */
  const sources = Object.fromEntries(TRACKS.map((track) => [track, []]));
  let dirs = 0;
  let entries = 0;
  let cappedDirs = 0;
  let truncated = null;
  const queue = [{ dir: root, depth: 0 }];

  const examine = (dir, depth, entry) => {
    const { name } = entry;
    if (entry.isDirectory()) {
      if (depth < bounds.maxDepth && !PRUNED.has(name) && !name.startsWith(".")) {
        queue.push({ dir: path.join(dir, name), depth: depth + 1 });
      }
      return;
    }
    const read = READERS[name];
    if (read === undefined || !entry.isFile()) return;
    const file = path.join(dir, name);
    const text = readTextCapped(file, bounds.maxManifestBytes);
    if (text === null) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    const track = read(parsed);
    if (track !== null) sources[track].push(relativePosix(root, file));
  };

  walk: for (let head = 0; head < queue.length; head += 1) {
    if (dirs >= bounds.maxDirs) {
      truncated = "dirs";
      break;
    }
    if (now() - started > bounds.timeMs) {
      truncated = "time";
      break;
    }
    const { dir, depth } = queue[head];
    let handle;
    try {
      // Read entry by entry, so a huge directory costs only the part that is read.
      handle = fs.opendirSync(dir, { bufferSize: 256 });
    } catch {
      continue;
    }
    dirs += 1;
    const listing = [];
    try {
      for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) {
        if (listing.length === bounds.maxEntriesPerDir) {
          cappedDirs += 1;
          break;
        }
        listing.push(entry);
        if (listing.length % CLOCK_EVERY === 0 && now() - started > bounds.timeMs) {
          truncated = "time";
          break walk;
        }
      }
    } catch {
      // A directory that fails part-way keeps what was read from it.
    } finally {
      handle.closeSync();
    }
    // Directory order differs between file systems; sorted names make the walk, and the order
    // of the reported sources, the same everywhere (as readdirSync's sorted listing did).
    listing.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of listing) {
      entries += 1;
      if (entries > bounds.maxEntries) {
        truncated = "entries";
        break walk;
      }
      examine(dir, depth, entry);
    }
  }

  return {
    tracks: TRACKS.filter((track) => sources[track].length > 0),
    sources,
    truncated,
    dirs,
    entries,
    cappedDirs,
    durationMs: Math.round((now() - started) * 10) / 10,
  };
}
