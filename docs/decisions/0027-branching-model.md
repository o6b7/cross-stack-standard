---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Branching model: main stable and default, dev integration, release and hotfix branches

## Context and Problem Statement

`claude plugin marketplace add o6b7/cross-stack-standard` clones the repository's default branch,
so whatever sits on that branch is what new adopters install. Work in progress must therefore
never land there, while contributors still need a shared place to integrate changes and the
maintainer needs a controlled path for releases and urgent fixes. Which branches exist, how is each
merged, and what protects them?

## Decision Drivers

- The default branch always holds a released state.
- Every release tag points at a commit on the default branch ([0025](0025-release-tooling.md)).
- Readable, linear integration history built from Conventional Commits.
- Ancestry between the integration branch and the release branch must survive every release.
- A solo maintainer must not be locked out, and must not be able to skip checks by accident.

## Considered Options

- Trunk only: work merges into `main`, releases are tags on `main`
- `main` for releases and default, `dev` for integration, with `release/*` and `hotfix/*`
- The same two-branch model with squash-merged back-merges from `main` to `dev`

## Decision Outcome

Chosen option: "`main` for releases and default, `dev` for integration, with `release/*` and
`hotfix/*`", because it keeps the install branch stable, gives contributors one integration
target, and preserves the ancestry that each release and back-merge relies on.

- **main** is the default branch and holds released code. Every release tag points at a commit on
  `main`. Not every commit on `main` is itself a release: the bootstrap commit and the merged
  history of `dev` are there too.
- **dev** is the integration branch. Short-lived `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`,
  `test/` and `ci/` branches start from it, are squash-merged into it and are deleted
  automatically. The squash commit uses the pull request title as its header and the branch's
  commit messages as its body, so the title follows Conventional Commits and is linted.
- **release/vX.Y.Z** starts from `dev` and merges into `main` with a merge commit. `main` is then
  back-merged into `dev` with a merge commit, because a squashed back-merge breaks the ancestry
  and makes the next release conflict. `dev` therefore allows both squash merges and merge
  commits.
- **hotfix/\*** starts from `main`, merges into `main` with a merge commit, is tagged as a patch
  and is back-merged into `dev`.
- **Rulesets.** `main` and `dev` require a pull request and the aggregate `ci-ok` check
  ([0031](0031-maintainers-repository-ci.md)) and block force pushes and deletion. The admin
  bypass on `main` applies only in pull-request mode, so it can merge but not push. No approving
  review is required, because a pull request author cannot approve their own pull request.
- The model is documented in [branching.md](../maintainers/branching.md) and CONTRIBUTING.

### Consequences

- Good, because adopters on the default branch only ever receive releases.
- Good, because `dev` history reads as one Conventional Commit per change.
- Bad, because every release needs two pull requests (release into `main`, back-merge into `dev`).
- Bad, because `dev` accepts two merge methods, so the right one depends on the pull request's
  source branch; the release guide spells this out.

### Confirmation

The branch rulesets enforce the pull request, the `ci-ok` check and the force-push and deletion
bans; their settings are read back through the rulesets API. `release.yml` refuses a tag that is
not an ancestor of `origin/main`. After a back-merge the release guide checks
`git merge-base --is-ancestor origin/main origin/dev`. Choosing the merge method is a review item.

## Pros and Cons of the Options

### Trunk only: work merges into `main`, releases are tags on `main`

- Good, because it is the simplest model.
- Bad, because every merged change reaches adopters installing from the default branch, before it
  is released.

### `main` for releases and default, `dev` for integration, with `release/*` and `hotfix/*`

- Good, because releases are deliberate and the install branch is stable.
- Bad, because back-merges add a step to every release.

### The same two-branch model with squash-merged back-merges from `main` to `dev`

- Good, because `dev` would accept one merge method only.
- Bad, because a squash commit has no link to `main`'s history, so the next release sees the same
  changes twice and conflicts.

## More Information

- Marketplace add and refs:
  <https://code.claude.com/docs/en/plugins/cli-reference.md#plugin-marketplace-add>.
- Rulesets: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets>;
  self-approval:
  <https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews>.
  Recorded in [verified-versions.md](../maintainers/verified-versions.md).
- Conventional Commits: <https://www.conventionalcommits.org/>.
- Related: [0025](0025-release-tooling.md), [0026](0026-no-early-access-channel.md),
  [0031](0031-maintainers-repository-ci.md).
- Governs: this repository's branches and merge methods; no adopter rule.
