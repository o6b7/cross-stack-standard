/**
 * Where each gate-presence adapter looks for gate files. Every path is a posix path or glob
 * relative to the repository root.
 *
 * Only shipped locations count: the plugin, the kit templates an adopter copies, and the gate
 * packages as they are vendored into those templates (`templates/<track>/vendor/<name>/`, written
 * by scripts/build-plugin-data.mjs from packages/ and drift-checked). The repository's own
 * sources under packages/ and the fixture hosts under test/harness/ never prove a gate exists,
 * because an installed plugin carries neither.
 *
 * `{track}` in a location stands for each track the rule applies to: the rule's own track; for a
 * client rule, the two JavaScript client tracks (web, mobile); for a shared rule, every track
 * (shared, laravel, web, mobile). Tests and future layouts pass overrides to
 * {@link resolveLocations}.
 *
 * @module scripts/lib/gate-presence/locations
 */

const PLUGIN = "plugins/cross-stack-standard";
const TEMPLATES = `${PLUGIN}/templates`;
const VENDOR = `${TEMPLATES}/{track}/vendor`;

/** Tracks a rule's gate can ship in, by registry track. */
export const TRACK_TEMPLATES = Object.freeze({
  laravel: ["laravel"],
  web: ["web"],
  mobile: ["mobile"],
  client: ["web", "mobile"],
  shared: ["shared", "laravel", "web", "mobile"],
});

/**
 * @typedef {object} TestProject
 * @property {string} root Project directory (holds the runner configuration).
 * @property {string[]} [testDirs] Pest only: test directories to use instead of the testsuites
 *   declared in `phpunit.xml`.
 * @property {string[]} [include] Vitest/Jest only: include globs (relative to `root`) to use
 *   instead of the ones read from the runner configuration.
 * @property {string[]} [extraFiles] Globs relative to the repository root whose tests run through
 *   this project (for example a vendored test-factory package the project's test file calls).
 */

/**
 * @typedef {object} Locations
 * @property {{ config: string, pluginRoot: string, entry: string }} hook
 * @property {{ candidates: { file: string, listArgs: string[] }[], chains: string[], binNames: string[] }} script
 *   Candidate script files (`{id}` is replaced by the gate id) with the arguments that list their
 *   checks; the track check-chain definitions (package.json, composer.json, lefthook.yml) that
 *   must run the check; the file names the kit binary is invoked by.
 * @property {{ projects: TestProject[] }} pest
 * @property {{ sources: string[], neon: string[] }} phpstan
 * @property {{ pluginPrefix: string, pluginRules: string[], coreRuleDirs: string[], configs: string[], packages: string[] }} eslint
 *   `configs` are the template config files; `packages` the package.json files of vendored
 *   config packages, whose entry points (and what they import) also count as shipped configs.
 * @property {{ configs: string[], packages: string[] }} depcruise
 * @property {{ projects: TestProject[] }} vitest
 * @property {{ projects: TestProject[] }} jest
 * @property {{ workflows: string[] }} ci
 */

/** @type {Readonly<Locations>} */
export const DEFAULT_LOCATIONS = Object.freeze({
  hook: {
    config: `${PLUGIN}/hooks/hooks.json`,
    pluginRoot: PLUGIN,
    // The single hook entry point every hooks.json command must route through.
    entry: "scripts/hook.mjs",
  },
  script: {
    candidates: [
      // Shared script gates ship as one dependency-free tool that adopt copies to
      // .cross-stack/bin/cross-stack.mjs; its `list-checks` command prints one check per line.
      { file: `${TEMPLATES}/shared/cross-stack/bin/cross-stack.mjs`, listArgs: ["list-checks"] },
      // A standalone script gate answers `--list-checks` the same way.
      { file: `${PLUGIN}/scripts/{id}.mjs`, listArgs: ["--list-checks"] },
      // A vendored gate package with its own command (such as i18n-parity) ships its bin in the
      // track's vendor directory and answers `--list-checks` too.
      { file: `${VENDOR}/{id}/bin/{id}.mjs`, listArgs: ["--list-checks"] },
    ],
    // The check chains an adopter runs (`check`, `check:fast`, pre-commit): a script gate is
    // shipped only when one of them runs it.
    chains: [
      `${TEMPLATES}/{track}/package.json`,
      `${TEMPLATES}/{track}/composer.json`,
      `${TEMPLATES}/{track}/lefthook.yml`,
    ],
    binNames: ["cross-stack.mjs", "{id}.mjs"],
  },
  pest: {
    projects: [{ root: `${TEMPLATES}/{track}`, testDirs: ["tests"] }],
  },
  phpstan: {
    sources: [`${VENDOR}/*/src/**/*.php`],
    neon: [
      `${TEMPLATES}/{track}/**/*.neon`,
      `${TEMPLATES}/{track}/**/*.neon.dist`,
      `${VENDOR}/*/**/*.neon`,
      `${VENDOR}/*/**/*.neon.dist`,
    ],
  },
  eslint: {
    pluginPrefix: "cross-stack",
    pluginRules: [`${VENDOR}/*/**/rules/*.{js,mjs,cjs}`],
    coreRuleDirs: ["node_modules/eslint/lib/rules"],
    configs: [`${TEMPLATES}/{track}/**/eslint.config.{js,mjs,cjs}`],
    packages: [`${VENDOR}/*/package.json`],
  },
  depcruise: {
    configs: [`${TEMPLATES}/{track}/**/.dependency-cruiser.{js,cjs,mjs,json}`],
    packages: [`${VENDOR}/*/package.json`],
  },
  vitest: {
    projects: [{ root: `${TEMPLATES}/{track}`, extraFiles: [`${VENDOR}/*/src/**/*.{js,mjs,ts}`] }],
  },
  jest: {
    projects: [{ root: `${TEMPLATES}/{track}`, extraFiles: [`${VENDOR}/*/src/**/*.{js,mjs,ts}`] }],
  },
  ci: {
    workflows: [`${TEMPLATES}/ci/**/*.{yml,yaml}`],
  },
});

/**
 * Merges per-kind overrides onto the defaults (one level deep: each kind's object is shallow
 * merged, so an override of `eslint.configs` replaces that list only).
 *
 * @param {Partial<Record<keyof Locations, object>>} [overrides]
 * @returns {Locations}
 */
export function resolveLocations(overrides = {}) {
  const merged = {};
  for (const kind of new Set([...Object.keys(DEFAULT_LOCATIONS), ...Object.keys(overrides)])) {
    merged[kind] = { ...DEFAULT_LOCATIONS[kind], ...overrides[kind] };
  }
  return /** @type {Locations} */ (merged);
}

/**
 * Tracks whose templates a rule's gate may ship in.
 *
 * @param {{ track?: string }} rule
 * @returns {string[]}
 */
export function tracksFor(rule) {
  return TRACK_TEMPLATES[rule?.track] ?? [];
}

/**
 * Expands `{track}` in every location for the given tracks: a string becomes one entry per
 * track, a script candidate (an object with a `file`) one candidate per track, and a test project
 * one project per track. Strings without the placeholder are kept once.
 *
 * @param {Locations} locations
 * @param {string[]} tracks
 * @returns {Locations}
 */
export function expandLocations(locations, tracks) {
  const expandString = (value) =>
    value.includes("{track}") ? tracks.map((track) => value.replaceAll("{track}", track)) : [value];
  const expand = (value) => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      return value.flatMap((item) => {
        if (typeof item === "string") return expandString(item);
        if (item && typeof item === "object" && typeof item.file === "string") {
          return expandString(item.file).map((file) => ({ ...item, file }));
        }
        if (item && typeof item === "object" && typeof item.root === "string") {
          const roots = expandString(item.root);
          return roots.map((root, index) => {
            const track = item.root.includes("{track}") ? tracks[index] : null;
            const sub = (list) =>
              list?.flatMap((entry) =>
                track ? [entry.replaceAll("{track}", track)] : expandString(entry),
              );
            return {
              ...item,
              root,
              ...(item.extraFiles ? { extraFiles: sub(item.extraFiles) } : {}),
            };
          });
        }
        return [expand(item)];
      });
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, expand(inner)]));
    }
    return value;
  };
  return /** @type {Locations} */ (expand(locations));
}
