---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# Release tooling: a manual release flow with a stamp script; release-please and Changesets rejected

## Context and Problem Statement

A release of the Standard must stamp one version into the plugin, the npm packages, the Composer
package and the templates ([0024](0024-versioning.md)), finalize the changelog, merge `dev`'s
state into `main` ([0027](0027-branching-model.md)), tag `main` and publish release notes. Merging
into `main`, tagging and publishing each need the maintainer's explicit approval, and a tag must
never move once adopters can pin it. Which tool, if any, should automate this?

## Decision Drivers

- One version across plugin, npm, Composer and template files.
- A person approves the merge to `main` and the tag, separately.
- The release workflow must run on the tag and must refuse a tag that is not on `main`.
- Few long-lived credentials in CI.

## Considered Options

- release-please (release pull requests, automatic tags and GitHub Releases)
- Changesets
- A manual release flow with `stamp-version`, a notes script and a tag-triggered workflow

## Decision Outcome

Chosen option: "A manual release flow with `stamp-version`, a notes script and a tag-triggered
workflow", because it versions every artifact from `VERSION`, keeps each approval step explicit, and
needs no token beyond the workflow's own.

- **Flow.** Branch `release/vX.Y.Z` from `dev`; run `stamp-version`, finalize `CHANGELOG.md` and
  run the full-history brand-guard scan; open a pull request to `main` and merge it with a merge commit; the maintainer pushes an
  annotated tag `vX.Y.Z` on `main`; `release.yml` builds the notes from `CHANGELOG.md` and creates
  the GitHub Release; `main` is back-merged into `dev`. The steps are in
  [release.md](../maintainers/release.md).
- **Tag verification.** `release.yml` runs only on `v*` tags and verifies that the tagged commit is
  an ancestor of `origin/main` (`git merge-base --is-ancestor`), because tag filters in a workflow
  are independent of branches. It also checks that the tag equals `v` plus `VERSION`, re-runs the
  drift check, and scans the full history with the brand guard and the narrative lint
  ([0030](0030-maintainers-brand-guard.md)) before the final job, the only one with
  `contents: write`, creates the release.
- **Tag protection.** A tag ruleset restricts creation, update and deletion of every
  `refs/tags/*` ref to the repository admin. Immutable releases are considered as a second lock,
  so a published tag and its assets cannot change.

### Consequences

- Good, because every artifact carries the same version, including files release tools do not know.
- Good, because the merge to `main` and the tag are two deliberate human steps.
- Bad, because the release checklist is manual; a skipped step is caught by the workflow's checks,
  not prevented by a bot.
- Bad, because release notes depend on contributors writing changelog entries, which a CI check
  enforces per pull request.

### Confirmation

`release.yml` enforces the tag checks above and fails before publishing. The notes extraction and
the ancestry check have unit tests, and actionlint checks the workflow. The tag ruleset is read
back through the rulesets API and documented in the branch-protection guide. Following the
checklist itself is a review item.

## Pros and Cons of the Options

### release-please (release pull requests, automatic tags and GitHub Releases)

- Good, because it derives versions and changelog entries from Conventional Commits.
- Bad, because merging its release pull request creates the tag and the GitHub Release
  automatically, which removes the separate approval before tagging.
- Bad, because events caused by `GITHUB_TOKEN`, including tags and releases it creates, do not
  start other workflows (apart from `workflow_dispatch` and `repository_dispatch`); a tag-triggered
  release workflow would need a personal access token or GitHub App token.
- Bad, because its README states that it does not handle complex branch management, while this
  repository integrates on `dev` and releases from `main`.

### Changesets

- Good, because contributors describe each change in a committed changeset file.
- Bad, because it versions only npm `package.json` files, so it cannot drive the plugin, the
  Composer package or the template headers.

### A manual release flow with `stamp-version`, a notes script and a tag-triggered workflow

- Good, because the only moving parts are two small scripts and one workflow in this repository.
- Bad, because the maintainer must follow a checklist.

## More Information

- release-please: <https://github.com/googleapis/release-please>; `GITHUB_TOKEN` and workflow
  triggers:
  <https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows>.
- Changesets scope: <https://github.com/changesets/changesets/blob/main/docs/versioning-apps.md>.
- Tag filters: <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>;
  immutable releases:
  <https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases>.
  Recorded in [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0024](0024-versioning.md), [0026](0026-no-early-access-channel.md),
  [0027](0027-branching-model.md), [0030](0030-maintainers-brand-guard.md).
- Governs: this repository's release process; no adopter rule.
- Revisit if the release cadence makes the manual checklist a bottleneck.
