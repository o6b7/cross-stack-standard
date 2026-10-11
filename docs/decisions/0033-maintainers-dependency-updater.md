---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# Maintainers: this repository's dependency updater is Renovate without automerge

## Context and Problem Statement

Everything this repository depends on is pinned exactly ([0032](0032-supply-chain-pinning.md)):
action SHAs, root devDependencies, harness lockfiles for the Laravel, web and mobile hosts. Exact
pins go stale unless something proposes updates. The repository integrates on `dev` and releases
to `main` ([0027](0027-branching-model.md)), so update pull requests must target `dev`. Some
upstream majors break or silently weaken the gates: typescript-eslint supports TypeScript below
6.1 only, ESLint 10 crashes the Next.js and Expo lint configurations with default settings, and
jest-expo still runs on Jest 29 ([0059](0059-javascript-toolchain-pins.md)).

Which updater should this repository run, and how is it configured? (Adopter templates are
decided separately in [0095](0095-adopter-dependency-updates.md).)

## Decision Drivers

- Update pull requests target `dev` and never merge into `main` on their own.
- Grouping keeps the number of pull requests reviewable.
- A release-age delay keeps brand-new releases out until they have settled.
- SHA-pinned actions and their version comments are updated together.
- Majors that break or weaken gates are held until the gates support them.
- The maintainer's own setup mirrors what the Standard recommends to adopters.

## Considered Options

- Renovate (hosted app), configured like the adopter template, without automerge
- Dependabot (built into GitHub)

## Decision Outcome

Chosen option: "Renovate (hosted app), configured like the adopter template, without automerge",
because it dogfoods the adopter template and its grouping and release-age controls fit a repository
with many pinned ecosystems.

- **Configuration.** `config:recommended` with `:semanticCommits` (the recommended preset does not
  include it), grouped non-major updates, a `minimumReleaseAge` delay, and
  `helpers:pinGitHubActionDigests` so action digests and version comments move together.
  `baseBranchPatterns: ["dev"]` sends every pull request to `dev`.
- **No automerge.** Nothing merges without the maintainer, and nothing ever targets `main`.
- **Held majors.** TypeScript 6.1 and later, ESLint 10 and Jest 30 are held by package rules until
  the gates support them; lifting a hold is a `chore(deps)` pull request that updates
  [verified-versions.md](../maintainers/verified-versions.md) and re-runs the fixture matrix.
- **Before the first release.** Renovate reads its configuration only from the default branch, and
  Dependabot's `dependabot.yml` must also live on the default branch. `main` holds no content until
  the first release, so neither bot runs before then unless a configuration-only change to `main`
  is approved outside the release flow. The onboarding pull request is never merged into `main`.
- **Prerequisite.** The maintainer installs the Renovate GitHub app (Mend Renovate Community Cloud,
  free for public and private repositories). Until then this record stays proposed.

### Consequences

- Good, because the repository runs the same updater configuration it ships to adopters, so the
  template is exercised continuously.
- Good, because grouped, delayed updates keep review load predictable.
- Bad, because it depends on a third-party hosted app with access to the repository.
- Bad, because without automerge every update, patches included, waits for the maintainer.
- Bad, because the release-age delay also holds ordinary bug fixes back for days; only updates
  Renovate classifies as security updates bypass it.

### Confirmation

Review. No CI job validates the configuration yet. `renovate-config-validator --strict` exits
non-zero on warnings and errors, but running it needs Node.js 24.11 or later and an install whose
transitive dependencies are locked, which `npx --package renovate@<exact version>` does not give
([0032](0032-supply-chain-pinning.md)); such a job is a revisit item. The held majors are also
protected by the fixture matrix: an update that weakens a gate fails a violation fixture
([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Renovate (hosted app), configured like the adopter template, without automerge

- Good, because presets such as `group:monorepos` (part of `config:recommended`) and
  `group:allNonMajor` group updates across npm, Composer and GitHub Actions.
- Good, because `minimumReleaseAge` is configurable per package or datasource, including Packagist.
- Good, because it matches the adopter template.
- Bad, because it needs an app installation by the repository owner.

### Dependabot (built into GitHub)

- Good, because it is built into GitHub and needs no app.
- Good, because it updates SHA-pinned actions with their version comments, and on GitHub.com it
  applies a default three-day cooldown to version updates.
- Bad, because groups are written by hand with patterns and update types; there are no maintained
  monorepo groups.
- Bad, because security updates always target the default branch, which here is reserved for
  release and hotfix pull requests; `target-branch: dev` applies to version updates only.

## More Information

- Renovate: <https://docs.renovatebot.com/>; configuration options (including
  `baseBranchPatterns` and `minimumReleaseAge`): <https://docs.renovatebot.com/configuration-options/>;
  presets: <https://docs.renovatebot.com/presets-config/>; hosting:
  <https://docs.renovatebot.com/mend-hosted/overview/>.
- Dependabot configuration location:
  <https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependabot-yml-file>;
  options (`cooldown`, `groups`, `target-branch`):
  <https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference>.
- Held majors: <https://typescript-eslint.io/users/dependency-versions/>,
  <https://github.com/typescript-eslint/typescript-eslint/issues/10940>,
  <https://github.com/expo/expo/issues/48808>.
- Related: [0032](0032-supply-chain-pinning.md), [0059](0059-javascript-toolchain-pins.md),
  [0095](0095-adopter-dependency-updates.md).
- Governs: this repository's dependency updates; no adopter rule.
