---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# The installed plugin is self-contained: generated runtime data, Node built-ins only

## Context and Problem Statement

The rule registry, the schemas, the docs and the gate packages live at the repository root. The
plugin's hooks and skills need some of that data at runtime: rule IDs, the manifest schema, the
current version, the protected paths and the template hashes that `upgrade` compares against.

An installed marketplace plugin is a copy of its own directory only, placed in
`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`; files outside the plugin directory are
not copied. During development the plugin is loaded in place with `claude --plugin-dir`, which
hides both problems: files above the plugin root are still there, and Node resolves modules from
the repository's `node_modules`. Claude Code installs a copied plugin's npm dependencies only when
the plugin root has a `package.json` and a supported lockfile, with a 60-second timeout and a
failure that never blocks the plugin.

How does the plugin get its runtime data and code so that it behaves the same installed as in
development?

## Decision Drivers

- The installed copy works on first run, offline, on every platform.
- The development and installed layouts behave identically.
- The registry stays the single source ([0003](0003-rule-registry.md)) without runtime reads
  outside the plugin.
- Hooks carry no third-party supply-chain surface.

## Considered Options

- Generate runtime data into the plugin and use Node built-ins only
- Read the registry and schemas from the repository root at runtime
- Ship npm dependencies with a `package.json` and lockfile inside the plugin
- Symlink the root data into the plugin directory

## Decision Outcome

Chosen option: "Generate runtime data into the plugin and use Node built-ins only", because it is
the only option whose installed copy needs nothing outside itself and nothing from the network.

- **Generated data.** A build step generates `plugins/cross-stack-standard/data/`: the rules, the
  manifest and allowlist schemas, the version, the protected paths and per-version template
  hashes. The generated files are committed, and CI fails when they drift from their sources.
- **Node built-ins only.** Hook and runtime scripts import only `node:` modules and relative files.
  The plugin has no npm dependencies and no lockfile, so nothing is installed when it is copied.
- **State and paths.** Hook state lives in `${CLAUDE_PLUGIN_DATA}`, which survives updates;
  nothing is written under `${CLAUDE_PLUGIN_ROOT}`, which changes with every version. Skill bodies
  write `${CLAUDE_PLUGIN_ROOT}` literally, because Claude Code substitutes it when it loads the
  skill and it is not set in the Bash tool's environment.
- **Tested as a copy.** CI copies only the plugin directory to a temporary directory outside the
  repository, then runs `claude plugin validate --strict`, `plugin list --json` (no errors),
  `plugin details` and the hook fixtures against that copy, with a throwaway configuration
  directory.

### Consequences

- Good, because the installed plugin cannot depend on a file that was not copied.
- Good, because hooks start fast, work offline and pull in no third-party code.
- Good, because runtime data always matches the release it shipped with.
- Bad, because generated files are committed and every registry or schema change needs a
  regeneration.
- Bad, because hook code cannot use npm libraries; YAML parsing, globbing and schema validation
  are written against Node built-ins or kept small.

### Confirmation

`node scripts/build-plugin-data.mjs --check` runs in CI and fails when a generated file is out of
date. ESLint's `no-restricted-imports`
limits scripts under `plugins/cross-stack-standard/` to `node:` built-ins and relative imports.
The isolated-copy smoke run above catches files that exist only in the development layout.

## Pros and Cons of the Options

### Generate runtime data into the plugin and use Node built-ins only

- Good, because the copy is complete and offline.
- Bad, because of the regeneration step and the built-ins-only constraint.

### Read the registry and schemas from the repository root at runtime

- Good, because nothing is duplicated.
- Bad, because the files are absent from an installed copy, so it works only in development.

### Ship npm dependencies with a `package.json` and lockfile inside the plugin

- Good, because hook code can use libraries.
- Bad, because installation happens at copy time with a 60-second limit, a failure that is not
  surfaced, and a network requirement.

### Symlink the root data into the plugin directory

- Good, because a symlink to a file elsewhere in the same marketplace is dereferenced and copied
  into the cache.
- Bad, because symlinks are fragile in Windows checkouts, and a symlink inside `skills/` makes
  `claude plugin validate --strict` fail.

## More Information

- Installed copies and files outside the plugin:
  <https://code.claude.com/docs/en/plugins/loading.md#in-place-and-copied-plugins>
- npm dependencies of a copied plugin:
  <https://code.claude.com/docs/en/plugins/loading.md#node-js-package-dependencies>
- Path variables: <https://code.claude.com/docs/en/plugins/manifest-reference.md#environment-variables>
- Related: [0003](0003-rule-registry.md), [0015](0015-plugin-distribution.md),
  [0017](0017-vendored-gate-packages.md), [0019](0019-hook-runtime-contract.md).
- Governs: the plugin packaging and runtime checks in this repository's CI.
