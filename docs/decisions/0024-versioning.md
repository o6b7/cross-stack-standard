---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Versioning the Standard: one VERSION, stamped and drift-checked; SemVer defined by adopter build impact

## Context and Problem Statement

The Standard ships as several artifacts that must agree: the plugin, the marketplace entry, the kit
templates, the gate packages and the manifest schema adopters point at. A common defect is version
strings that disagree across files (hooks, architecture tests and configuration each claiming a
different version), which makes it impossible to say what a project adopted. Claude Code adds a
hard constraint: an installed plugin updates only when its computed version changes, and a
`version` in `plugin.json` keeps users on their cached copy however many commits are pushed.

A standard also needs its own meaning of SemVer. Its "public API" is the set of builds it can fail.

How is the Standard versioned, and what does each kind of bump promise adopters?

## Decision Drivers

- One number identifies one release of every artifact.
- Plugin updates must actually reach users.
- An adopter must be able to tell from the version whether an upgrade can break their build.
- Registries with their own versioning rules (Packagist) must not be fought.

## Considered Options

- One `VERSION` file, stamped into every artifact, drift-checked in CI
- Independent versions per artifact
- Versions derived from git tags at build time, with nothing committed
- No plugin version, so every commit counts as an update

## Decision Outcome

Chosen option: "One `VERSION` file, stamped into every artifact, drift-checked in CI", because it
is the only option that keeps a single meaning for a version while still changing the plugin
version that Claude Code compares.

- **Single source.** `VERSION` holds the version. `node scripts/stamp-version.mjs` writes it into
  `plugin.json` `version`, the marketplace `metadata.version` (the plugin entry carries no
  `version`, since `plugin.json` wins), every `package.json`, the `$schema` URL of the manifest
  template, and the template header comments `cross-stack-standard vX.Y.Z`.
  `node scripts/check-version-drift.mjs` fails CI on any mismatch.
- **Composer.** Publishable `composer.json` files carry no `version`: Composer recommends omitting
  it when the version can be inferred from VCS tags, as Packagist does. Packagist infers versions
  from the tags of the repository that holds `composer.json` at its root, so publishing
  `packages/laravel` from this monorepo likely needs a read-only split repository. This is
  verified before the first publish ([verified-versions.md](../maintainers/verified-versions.md),
  Unverified), and the answer revisits this bullet.
- **SemVer by build impact.** MAJOR: a change that can newly fail an adopter's build (a new
  default-on FORCED or GUARDED rule, promoting a default-on rule from REVIEW, a stricter threshold,
  a raised minimum version, a removed or renamed option). MINOR: new opt-in rules, modules, tracks,
  profiles, skills and documentation. PATCH: fixes, false-positive reductions and documentation
  fixes. When in doubt, the higher bump.
- **Rule lifecycle.** A new rule lands opt-in in a MINOR and becomes default-on only in a MAJOR.
  A rule whose profile or module ships after the current release records the planned version in
  `since` and stays default-off until then. At a release, a default-on rule must already be at its
  target level: a rule whose gate has not shipped is released default-off, because promoting a
  default-on rule later would be a MAJOR change.
- **Changelog.** `CHANGELOG.md` follows Keep a Changelog 1.1.0; every pull request that changes
  more than `docs/` or `test/` adds an entry under `## [Unreleased]`, and a release renames that
  section to the version and date.
- **First version.** `1.0.0` only if the release gate passes in full; otherwise `0.x.y` with a
  written list of what blocks `1.0.0`. Before `1.0.0`, a MINOR may carry changes that would be
  MAJOR later, and the notes say so.

### Consequences

- Good, because one number answers "what did this project adopt" and "did the plugin update".
- Good, because adopters can hold MAJOR upgrades until they plan for new failures.
- Bad, because every release must run the stamp script; forgetting it fails CI rather than
  silently shipping a stale version.
- Bad, because a small default flip forces a MAJOR, so defaults change rarely and in batches.

### Confirmation

`check-version-drift` runs in CI. `node scripts/check-registry.mjs --release`, run before each
release, fails when a default-on rule is below its target level or its `since` is later than
`VERSION`. `claude plugin validate --strict` fails if a marketplace entry
ever declares a `version` that disagrees with `plugin.json`. `release.yml` fails unless the tag
equals `v` plus `VERSION`. `node scripts/check-changelog.mjs` requires the Unreleased entry. The choice of bump is checked in
review against the policy in [release.md](../maintainers/release.md#versioning-policy).

## Pros and Cons of the Options

### One `VERSION` file, stamped into every artifact, drift-checked in CI

- Good, because it is simple to explain and mechanically checked.
- Bad, because packages that could evolve separately are released together.

### Independent versions per artifact

- Good, because each artifact moves at its own pace.
- Bad, because adopters would need a compatibility matrix between plugin, templates and packages.

### Versions derived from git tags at build time, with nothing committed

- Good, because nothing to stamp.
- Bad, because the plugin is installed from repository files, so `plugin.json` must hold the
  version at the tagged commit.

### No plugin version, so every commit counts as an update

- Good, because every commit reaches users automatically.
- Bad, because the version becomes a commit SHA with no SemVer meaning, so adopters cannot tell a
  breaking upgrade from a fix.

## More Information

- Plugin version resolution and updates:
  <https://code.claude.com/docs/en/plugins/loading.md#how-claude-code-computes-the-version>,
  <https://code.claude.com/docs/en/plugins/host-marketplace.md#release-a-new-version>.
- Composer `version`: <https://getcomposer.org/doc/04-schema.md#version>.
- Semantic Versioning 2.0.0: <https://semver.org/spec/v2.0.0.html>; Keep a Changelog 1.1.0:
  <https://keepachangelog.com/en/1.1.0/>. Recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0023](0023-adopter-manifest-and-upgrade.md), [0025](0025-release-tooling.md),
  [0027](0027-branching-model.md).
- Governs: the `since` and `defaultEnabled` fields of every rule, and this repository's version and
  changelog checks.
