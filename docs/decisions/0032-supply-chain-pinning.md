---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Supply-chain pinning: nothing fetched at a moving ref

## Context and Problem Statement

The Standard runs third-party code in many places: GitHub Actions in its own CI and in adopter
workflow templates, tool binaries, the Claude Code CLI, MCP servers, other Claude Code plugins, and
the generators behind the smoke apps. Anything referenced by a moving name (a version tag, `latest`,
`stable`, a default branch) can change what runs without any change in the repository. Tags can be
moved or deleted. Several popular wrapper actions download the newest tool release at run time
unless told otherwise, and upstream install instructions often say `@latest` or pipe a script from
a default branch into a shell. A common defect is a setup step that clones another project at HEAD.

How does the Standard make every piece of fetched code reviewable and reproducible, for itself and
for adopters?

## Decision Drivers

- The same commit must run the same code next month.
- A change of third-party code must appear as a diff that a reviewer sees.
- Every pinned value needs a recorded, official source and a verification date.
- Security fixes upstream must still reach the project on a known schedule.

## Considered Options

- Immutable pins everywhere, recorded with their sources and re-verified on known events
- Major-version tags (for example `@v7`) and trust in upstream release hygiene
- Loose ranges, relying on a dependency updater alone

## Decision Outcome

Chosen option: "Immutable pins everywhere, recorded with their sources and re-verified on known
events", because only immutable references make a run reproducible and turn every upstream change
into a reviewed diff.

- **Actions.** Every `uses:` names a full 40-character commit SHA from the action's own repository,
  followed by a version comment (`# v7.0.1`); annotated tags are pinned by their peeled commit.
  GitHub documents a full-length SHA as currently the only way to use an action as an immutable
  release. This repository also enables the policy that requires SHA-pinned actions.
- **Binaries.** gitleaks, actionlint, shellcheck and lychee are downloaded at an exact version from
  their release URLs and checked against a recorded SHA-256 before they are unpacked or run.
  Wrapper actions whose default version is `latest` or `stable` are not used.
- **CLIs, servers and plugins.** The Claude Code CLI is installed at an exact npm version and its
  version is asserted. MCP servers run at an exact version, never `@latest`. A third-party plugin
  is installed only from its entry in the Standard's marketplace, which fixes a full commit SHA
  ([0106](0106-companion-plugins.md)). Nothing is cloned or fetched
  at HEAD, and no install step pipes a script from a default branch into a shell.
- **Record.** [verified-versions.md](../maintainers/verified-versions.md) holds each tool, the
  verified value, the official source and the verification date. A job flags every entry older
  than 90 days and opens an issue.
- **Upstream-event policy.** Pins are re-verified when work on a track starts and before each
  release, and when an upstream security release is announced. Every change lands as a
  `chore(deps)` pull request that updates `verified-versions.md` in the same change; harness
  lockfiles change only in such pull requests, with a full fixture run.
- **Adopters.** Workflow templates reference actions and reusable workflows by SHA, binaries by
  checksum and MCP servers by exact version; the adopter Renovate template keeps digests pinned
  ([0095](0095-adopter-dependency-updates.md)).

Where a platform offers only a weaker pin, the gap is stated rather than hidden: a Claude Code
marketplace `#ref` accepts a branch or tag but not a commit, so a check compares the installed
commit; `npx package@x.y.z` pins only the top-level package, so a full lock needs a
devDependency with a lockfile.

### Consequences

- Good, because runs are reproducible and a moved or compromised tag cannot change what runs.
- Good, because every upstream change is a reviewed `chore(deps)` diff with a recorded source.
- Bad, because pins go stale; fixes arrive only through the updater
  ([0033](0033-maintainers-dependency-updater.md)) or the re-verification events. Dependabot
  alerts do not fire for SHA-pinned actions, so the staleness scan and the updater carry that load.
- Bad, because every bump costs a verification step and a fixture run.

### Confirmation

`test/scripts/ci/workflows.test.mjs` fails when a workflow uses an action that is not pinned to a
full SHA with a version comment, or whose SHA and tag are not listed in `verified-versions.md`.
`scripts/install-tool.mjs` refuses a binary whose SHA-256 does not match `scripts/lib/tools.json`;
its tests cover the mismatch and require every checksum to be recorded in `verified-versions.md`.
The staleness scan has its own test. The repository setting that requires SHA-pinned actions is
read back after it is applied. Pins in adopter templates and in prose (install commands, the
companion entries) are checked in review; the companion entries' commits and the Chrome DevTools
server's version and flags are also tested ([0106](0106-companion-plugins.md)).

## Pros and Cons of the Options

### Immutable pins everywhere, recorded with their sources and re-verified on known events

- Good, because it is the only option with reproducible runs and visible upstream changes.
- Bad, because it needs tooling to keep pins fresh.

### Major-version tags (for example `@v7`) and trust in upstream release hygiene

- Good, because patch releases arrive without any work.
- Bad, because a moved tag changes the code that runs with no diff to review.

### Loose ranges, relying on a dependency updater alone

- Good, because updates are cheap.
- Bad, because what runs between updater runs is whatever resolved last; wrapper actions that fetch
  `latest` escape the updater entirely.

## More Information

- Using third-party actions safely:
  <https://docs.github.com/en/actions/reference/security/secure-use>; SHA-pinning policy:
  <https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/>.
- Plugin marketplace sources and `#ref`: <https://code.claude.com/docs/en/discover-plugins>.
- Renovate digest pinning preset: <https://docs.renovatebot.com/presets-helpers/>.
- Related: [0031](0031-maintainers-repository-ci.md), [0033](0033-maintainers-dependency-updater.md),
  [0106](0106-companion-plugins.md),
  [0084](0084-secret-scanning-and-dependency-audits.md).
- Governs: the pinning rules for workflow templates and third-party integrations, and this
  repository's own workflows.
