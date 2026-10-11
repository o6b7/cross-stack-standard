---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Adopter manifest, adopt and upgrade

## Context and Problem Statement

A project that adopts the Standard copies templates, gates and configuration into its own
repository. Later versions change those files. To upgrade safely the kit must know what the project
adopted (version, tracks, tier, modules) and which copied files the project has since edited. A
common defect is an upgrade procedure that replays the changelog by hand: it cannot tell an
untouched file from a locally tightened one, so it either overwrites local work or skips real
fixes. A second common defect is an adoption step that replaces an existing, stricter
configuration with the kit's default and so weakens the project.

How does a project record its adoption, and how do `adopt` and `upgrade` change project files
without losing local decisions or loosening any gate?

## Decision Drivers

- One machine-readable record of what the project adopted, validated against a published schema.
- Adoption never weakens a stricter existing configuration.
- Upgrades distinguish kit-owned files from project edits without needing the old plugin version
  on disk.
- Every change to a project is reviewable as a pull request.

## Considered Options

- A validated manifest plus per-version template hashes, with `upgrade` proposing a pull request
- No manifest: re-detect the project and re-apply the current kit
- A manual upgrade guide that replays changelog entries

## Decision Outcome

Chosen option: "A validated manifest plus per-version template hashes, with `upgrade` proposing a
pull request", because it records intent explicitly, detects local edits mechanically, and keeps a
person in charge of every change.

- **Manifest.** `.cross-stack/standard.json` is validated by a JSON Schema shipped in the
  plugin's data and referenced through a `$schema` URL that `stamp-version` pins to the release tag
  ([0024](0024-versioning.md)). The schema rejects unknown properties, so this record is the single
  inventory of manifest fields: a record that needs a manifest setting names a field listed here.
  The published schema defines `version` (the adopted Standard version), `tracks`, `profile`,
  `tier`, `modules` (each `true`, `false` or `{"enabled": …}`), `locales`, `hooks` (hook settings
  live only here), `disabled` and `allowlistsDir` (the directory of the allowlist files, default
  `.cross-stack/allowlists`, [0005](0005-explicit-exceptions.md)).
- **Fields added with their gates.** Each of these is added to the schema in the release that
  ships the gate reading it, and not before:
  - `trackRoots`: the project-relative directory of each declared track, for repositories whose
    tracks do not sit at the root ([0009](0009-tracks-profiles-and-scope.md)).
  - `stack`: one entry per concern, `stack.<concern>`, with `use` (the installed library, or
    `none`), `reason` (how a concern marked `none` is met), and, while a concern migrates from one
    library to another, `deprecated` (the libraries being left) and `legacyPaths` (where the
    deprecated library may still be imported); the audit trail is one such concern. Where two
    installed mechanisms serve one concern, the entry names the winner and a purpose for each
    ([0006](0006-stack-first.md), [0007](0007-one-mechanism-per-concern.md)).
  - `decisions`: references from a named exception to the project's own decision record, such as
    a realtime push library ([0056](0056-polling-before-push.md)), a broadcasting package or the
    reason for declining Tier 2 ([0008](0008-tiers-and-invariants.md)).
  - `rules`: per-rule options keyed by rule ID, `rules.<RULE-ID>.<option>`, such as layer paths,
    allowed directories, limits and the declared tier triggers, that the shared lint configs and
    script gates read ([0061](0061-own-eslint-plugin-no-commented-code.md)). A value several
    rules read is owned by one rule and named by the others. A rule that is off by default is
    switched on with `rules.<RULE-ID>.enabled`, unless a module option is its switch.
  - Module options beyond `enabled`, added to that module's schema entry with its templates, such
    as the api-contract `shape` ([0052](0052-api-success-shape.md)), the tenancy column or the i18n
    business time zone.
- **Planned keys in the registry.** Each rule lists the keys that tune or switch it in its
  `configurable` field. A rule that is still REVIEW may list a planned key under one of the fields
  above before the schema declares it, and the generated rule pages mark such a key as planned;
  `check-registry` requires every key of a FORCED or GUARDED rule to be declared in the schema, so
  a key reaches the schema in the change that ships the gate reading it. A rule whose text speaks
  of a configured value lists at least one key.
- **adopt** handles greenfield and brownfield projects. It detects tracks
  ([0018](0018-project-detection.md)) and asks for the tier when none is declared. Where the project
  already has a configuration, it compares levels and thresholds (analysis level, coverage floors,
  size and complexity limits) and keeps the stricter value. It writes the manifest, shrink-only
  baselines and allowlists ([0005](0005-explicit-exceptions.md)), the permission rules
  ([0021](0021-gate-file-protection.md)), the vendored gates
  ([0017](0017-vendored-gate-packages.md)), the path-scoped rule files and the managed block
  ([0022](0022-context-budget.md)), merging into the `CLAUDE.md` and `AGENTS.md` files that
  framework generators create.
- **Template hashes.** Each release ships a per-file hash manifest of its templates. After a
  plugin update, older version directories are removed from the local plugin cache (14 days
  later), so `upgrade` compares a project file with the recorded hash of the adopted version
  instead of reading old templates: an unchanged file is replaced, an edited one gets a proposed
  merge for review.
- **upgrade** reads the manifest version, works on a branch and proposes the change as a pull
  request. It respects allowlists and the regions a template declares as project-owned, never
  lowers a level or threshold, and updates the manifest version last. A demo upgrades a synthetic
  kit snapshot stamped `0.0.0-fixture.1` (lower in SemVer than any release, `0.0.0` included) to
  the current version.
- **new-project** scaffolds with the same pinned generators as the smoke apps
  ([0004](0004-fail-then-pass.md)) and then runs `adopt`. **audit** is a read-only report that
  cites rule IDs. **doctor** checks the environment, tool pins and the manifest.
- All five are user-invoked skills, run as `/cross-stack-standard:<name>`.

### Consequences

- Good, because upgrades touch only files the kit still owns, and every change arrives as a
  reviewable pull request.
- Good, because a brownfield project never loses a stricter setting by adopting the Standard.
- Bad, because the hash manifest adds a generated file per release that CI must keep fresh.
- Bad, because writes to `.claude/` are built-in protected paths in Claude Code, so `adopt` and
  `upgrade` prompt the user when they write settings and rule files.

### Confirmation

The manifest is validated against its schema by the `check-standard-config` sub-check in each
track's `check` script. A record that relies on a manifest field missing from the inventory above
is a review finding. CI runs the upgrade demo from the `0.0.0-fixture.1` snapshot and a
freshness check on the hash manifests. The smoke apps run a scripted `adopt` and then each track's
`check` on every push to `dev`. Brownfield `adopt` tests start from configurations stricter than
the kit's and fail if any level or threshold is lowered.

## Pros and Cons of the Options

### A validated manifest plus per-version template hashes, with `upgrade` proposing a pull request

- Good, because intent (tier, modules) is declared, not inferred.
- Good, because local edits are detected without keeping old plugin versions.
- Bad, because the manifest is one more file adopters must keep valid.

### No manifest: re-detect the project and re-apply the current kit

- Good, because nothing extra is committed.
- Bad, because tier and modules cannot be inferred reliably, and re-applying overwrites local edits.

### A manual upgrade guide that replays changelog entries

- Good, because it needs no tooling.
- Bad, because it depends on every adopter reading every entry, and edited files are
  indistinguishable from untouched ones.

## More Information

- JSON Schema 2020-12: <https://json-schema.org/draft/2020-12>; the manifest schema is
  [`schemas/standard.schema.json`](../../schemas/standard.schema.json).
- Cleanup of previous plugin versions:
  <https://code.claude.com/docs/en/plugins/loading.md#cleanup-of-previous-versions>; built-in
  protected paths: <https://code.claude.com/docs/en/permission-modes.md>. Recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0010](0010-opt-in-modules.md), [0015](0015-plugin-distribution.md),
  [0017](0017-vendored-gate-packages.md), [0024](0024-versioning.md); records that use a manifest
  field: [0005](0005-explicit-exceptions.md), [0006](0006-stack-first.md),
  [0007](0007-one-mechanism-per-concern.md), [0009](0009-tracks-profiles-and-scope.md),
  [0011](0011-default-module-set.md), [0052](0052-api-success-shape.md),
  [0056](0056-polling-before-push.md), [0061](0061-own-eslint-plugin-no-commented-code.md).
- Governs: the process rules on the project manifest, allowlists and baselines written at
  adoption, and the configuration checks run by `check`.
