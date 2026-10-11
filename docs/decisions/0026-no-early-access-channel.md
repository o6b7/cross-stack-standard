---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# No early-access channel in 1.0: releases and tag pins only

## Context and Problem Statement

An early-access channel would let adopters try unreleased changes, for example by pinning the
marketplace to the `dev` branch (`o6b7/cross-stack-standard#dev`). Claude Code, however, has no
release-channel concept: one marketplace serves one version of each plugin at a time, and an
installed plugin updates only when its computed version changes. Unreleased commits on `dev` keep
the version of the last release ([0024](0024-versioning.md)), so a `#dev` pin installs once and
then never updates. Should 1.0 offer an early-access channel, and if so, how?

## Decision Drivers

- Documentation must not promise a channel that does not deliver updates.
- Versions keep one meaning across artifacts; `dev` must not need bot commits to stay installable.
- Contributors still need a simple way to run unreleased code.
- Adopters need a reliable way to freeze a version.

## Considered Options

- CI stamps a unique pre-release version (`X.Y.Z-dev.N`) on every merge to `dev`
- A second marketplace with a different name that points at `dev`
- No channel in 1.0: releases, tag pins and local plugin directories for contributors

## Decision Outcome

Chosen option: "No channel in 1.0: releases, tag pins and local plugin directories for
contributors", because both working alternatives add moving parts that 1.0 does not need, and the
platform offers a simpler path for the people who actually run unreleased code.

- The 1.0 documentation does not advertise a `#dev` pin.
- Contributors load the plugin from a checkout for one session with
  `claude --plugin-dir ./plugins/cross-stack-standard`, which replaces a same-name installed
  plugin for that session.
- Adopters freeze a release with `claude plugin marketplace add o6b7/cross-stack-standard#vX.Y.Z`,
  or with `ref` on the `extraKnownMarketplaces` entry in a committed `.claude/settings.json`, and
  move to a new release by editing that `ref`. A tag pin is as stable as the tag: the tag ruleset
  restricts updating and deleting tags to the repository admin, and immutable releases, if
  enabled, lock them ([0025](0025-release-tooling.md)).
- Revisit after 1.0 if adopters ask for early access.

### Consequences

- Good, because every documented install path delivers what it promises.
- Good, because `dev` history stays free of automated version commits.
- Bad, because adopters who want to preview a change must check out the repository or wait for a
  release.

### Confirmation

Review: changes to the README, CONTRIBUTING, the [branch model](../maintainers/branching.md) and
the install documentation are checked for any `#dev` pin. No gate enforces this.

## Pros and Cons of the Options

### CI stamps a unique pre-release version (`X.Y.Z-dev.N`) on every merge to `dev`

- Good, because a `#dev` pin would then receive every change.
- Bad, because CI must push commits to a protected branch, which needs a credential that bypasses
  the pull-request rule.
- Bad, because every merge becomes an update for early-access users, and stamped versions conflict
  with release branches.

### A second marketplace with a different name that points at `dev`

- Good, because it is the platform's documented recipe for channels (two marketplaces with
  different names pointing at different refs).
- Bad, because it still needs a distinct version on the early-access ref, so it inherits the
  stamping problem above.
- Bad, because a user cannot register two marketplaces with the same name, and removing a
  marketplace uninstalls its plugins, so switching channels is disruptive.

### No channel in 1.0: releases, tag pins and local plugin directories for contributors

- Good, because it needs no new tooling and matches how updates are detected.
- Bad, because there is no zero-effort preview for adopters.

## More Information

- Release channels and version-based updates:
  <https://code.claude.com/docs/en/plugins/host-marketplace.md#run-release-channels>,
  <https://code.claude.com/docs/en/plugins/loading.md#how-claude-code-computes-the-version>.
- Pinning: <https://code.claude.com/docs/en/plugins/host-marketplace.md#hold-users-on-one-version>;
  `--plugin-dir`: <https://code.claude.com/docs/en/plugins/create.md>; `extraKnownMarketplaces`:
  <https://code.claude.com/docs/en/settings-reference.md>. Recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0015](0015-plugin-distribution.md), [0025](0025-release-tooling.md),
  [0027](0027-branching-model.md).
- Governs: the documented install and pinning paths; no adopter rule.
