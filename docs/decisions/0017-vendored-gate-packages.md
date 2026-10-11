---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Gate code reaches adopters by vendoring in 1.0; packages stay publish-ready

## Context and Problem Statement

Many gates are code the Standard writes itself: custom ESLint rules and shared flat configs, a
dependency-cruiser configuration, an architecture-test factory for Vitest, an i18n parity checker,
and a Laravel package with custom PHPStan rules, Pest helpers and problem-details helpers. That
code lives in `packages/` so it can be built, tested and eventually published on its own, letting
adopters take gate updates through their dependency bot instead of by copying files.

Publishing to npm and Packagist is deferred beyond 1.0, and the installed plugin does not contain
`packages/` ([0016](0016-self-contained-plugin-runtime.md)). Until the packages are published, an
adopter project has no registry to install them from.

How does gate code reach adopter projects in 1.0?

## Decision Drivers

- `check` works in an adopter project with no access to unpublished packages.
- The gate code an adopter runs matches the Standard version they adopted.
- Package boundaries, tests and metadata stay intact, so publishing later is a small step.
- Supply-chain pinning holds: nothing is installed from a moving ref
  ([0032](0032-supply-chain-pinning.md)).

## Considered Options

- Vendor the built packages into the kit; `adopt` installs them from a local path
- Publish the packages to npm and Packagist for 1.0
- Install the packages from this repository through git dependencies
- Copy the gate sources directly into each adopter's source tree

## Decision Outcome

Chosen option: "Vendor the built packages into the kit; `adopt` installs them from a local path",
because it is the only option that works offline today and keeps the packages whole for later
publishing.

- **Packages.** `packages/` holds `eslint-config` (web and mobile flat configs and the
  `cross-stack` ESLint plugin), `dependency-cruiser-config`, `vitest-arch`, `i18n-parity` and
  `laravel` (Composer package `o6b7/cross-stack-standard-laravel`). Each is built and tested with
  its track.
- **Vendoring.** The plugin build step copies the built packages into the kit templates, and
  `adopt` copies them to `.cross-stack/vendor/` in the project. It wires an npm `file:`
  devDependency, and a Composer `path` repository plus `require-dev` entry with an explicit
  `options.versions` value set to the kit version, because Composer otherwise infers a path
  package's version from its VCS state or its `composer.json`, and assumes `dev-master` when
  neither resolves.
- **One file for script gates.** The shared script gates and `doctor` ship as one dependency-free
  file, `.cross-stack/bin/cross-stack.mjs`, called by the track `check` scripts and the reusable
  workflows.
- **Third-party dependencies.** Gate dependencies from third parties (for example
  `typescript-eslint` and `eslint-plugin-jsx-a11y`) install from the registries as pinned
  devDependencies of the project. npm does not install the dependencies of a package linked by
  local path, so they are declared by the project itself.
- **Publish-ready, not published.** Every package keeps its metadata, README, standalone tests and
  a passing `npm pack` or `composer validate`. Once the packages are published, adopters move to
  registry versions and bot-driven updates ([0095](0095-adopter-dependency-updates.md)). Packagist
  reads `composer.json` from a repository root, so publishing `packages/laravel` likely needs a
  read-only split repository; this is verified before publishing
  ([0024](0024-versioning.md), [verified-versions.md](../maintainers/verified-versions.md)).
- **Upgrades.** `upgrade` replaces the vendored copies by template hash
  ([0023](0023-adopter-manifest-and-upgrade.md)).
- **Exit criterion.** A smoke app, adopted with no network access to the unpublished packages,
  passes `check`.

### Consequences

- Good, because gate code works without any package registry account or network access to it.
- Good, because the gate code always matches the adopted Standard version.
- Good, because the vendored code is visible and reviewable in the adopter's diff.
- Bad, because adopter repositories carry vendored files, which add size and diff noise on each
  upgrade.
- Bad, because gate updates arrive only through `upgrade`, not through Renovate or Dependabot.
- Bad, because vendored copies must not be edited locally; `.cross-stack/**` is a protected path
  ([0021](0021-gate-file-protection.md)).
- Bad, because moving to published packages later is a migration adopters have to run.

### Confirmation

`node scripts/build-plugin-data.mjs --check` in CI fails when the vendored copies in the kit are out
of date. Each package's own tests run in its track's CI job. The smoke workflow, added with the
`adopt` skill, generates apps with each framework's official generator, adopts them and runs each
track's `check` against the vendored packages; it proves the exit criterion above.

## Pros and Cons of the Options

### Vendor the built packages into the kit; `adopt` installs them from a local path

- Good, because it works offline and matches the adopted version.
- Bad, because of vendored files in adopter repositories and upgrade-only updates.

### Publish the packages to npm and Packagist for 1.0

- Good, because adopters get standard dependency updates from the start.
- Bad, because publishing is a separate, deliberate step that 1.0 does not depend on.

### Install the packages from this repository through git dependencies

- Good, because nothing is copied into the adopter repository.
- Bad, because every install fetches from the network, and pinning would need commit SHAs in every
  adopter manifest.

### Copy the gate sources directly into each adopter's source tree

- Good, because it needs no packaging at all.
- Bad, because package boundaries, tests and upgrade by hash are lost, and the sources mix with
  application code.

## More Information

- Composer path repositories and the `versions` option:
  <https://getcomposer.org/doc/05-repositories.md#path>
- npm local paths (`file:`): <https://docs.npmjs.com/cli/v11/configuring-npm/package-json#local-paths>
- Related: [0016](0016-self-contained-plugin-runtime.md), [0023](0023-adopter-manifest-and-upgrade.md),
  [0024](0024-versioning.md) (the version is not stamped into the publishable `composer.json`),
  [0032](0032-supply-chain-pinning.md), [0095](0095-adopter-dependency-updates.md).
- Governs: the kit's installation of gate packages and the pin and configuration checks that
  verify the vendored copies.
