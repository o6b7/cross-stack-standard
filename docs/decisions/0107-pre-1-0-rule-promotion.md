---
status: accepted
date: 2026-10-12
decision-makers: Qusai Abdullah
---

# Pre-1.0 rule promotion: default-on REVIEW guidance may reach target in 0.x MINOR releases

## Context and Problem Statement

The first release is designed to ship the full rule catalog as honest guidance while Laravel, web
and mobile gates are built. The versioning policy also allows a 0.x MINOR release to introduce a
build failure, provided its notes explain the change. The original release check instead required
every default-on rule to reach its eventual target in every release, which made the documented
guidance-first 0.1 release impossible.

How should the release check protect stable adopters without blocking the planned 0.x rollout?

## Decision Drivers

- Keep the REVIEW label honest while a gate is not shipped.
- Let adopters use the rule guidance before its gate exists.
- Keep build-impacting default promotions visible in pre-1.0 release notes.
- Prevent new default failures in stable releases without a MAJOR version.
- Keep `since` accurate about when a rule first ships.

## Decision Outcome

Chosen option: "Allow target promotions in 0.x MINOR releases; require target levels from 1.0.0",
because this matches the existing SemVer policy and preserves the staged 0.x rollout.

- `since` names the first release that includes a rule as applicable guidance or enforcement. A
  default-on rule cannot have a `since` later than the release version. Rules that belong to a
  profile or module that is not available yet remain default-off and keep the planned version.
- `node scripts/check-registry.mjs --release` checks that availability rule for every release.
  For versions before 1.0.0, it permits a default-on REVIEW rule to remain below its target.
- Starting with 1.0.0, including 1.x prereleases, every default-on rule must be at its target
  level. A later promotion could newly fail an adopter's build and therefore requires a MAJOR
  version.
- A pre-1.0 MINOR release that promotes a default-on rule names its rule IDs, new gate and adoption
  impact in `CHANGELOG.md`. The label changes only in the release that includes the gate and its
  passing clean and failing violation fixtures.

### Consequences

- Good, because projects can use the complete guidance catalog while gates arrive track by track.
- Good, because early build-impacting promotions remain explicit and versioned.
- Good, because the 1.0 release check still requires stable default-on behavior to be complete.
- Bad, because a 0.x MINOR upgrade can newly fail an adopter's build; teams must read those release
  notes before upgrading.

### Confirmation

The registry tests cover a default-on REVIEW rule in 0.1, a future `since` rejection, and the
target-level requirement for 1.0 release candidates and stable releases. CI runs the release check
on pull requests into `main`; the tag workflow runs it again before publishing.

## More Information

- Related: [0024](0024-versioning.md), [0002](0002-gates-over-guidelines.md),
  [0004](0004-fail-then-pass.md).
- Governs: default-on rule availability and promotion in release checks.
