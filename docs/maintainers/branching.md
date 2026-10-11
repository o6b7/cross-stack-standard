# Branch model

The repository has two long-lived branches and short-lived work branches. `main` holds released
code only; `dev` is where work is integrated.

```text
feat/x ─┐ squash                          merge commit
fix/y ──┼──────▶ dev ──▶ release/vX.Y.Z ─────────────▶ main ──▶ tag vX.Y.Z
docs/z ─┘         ▲                                      │
                  └──────────── back-merge (merge commit)┘
```

## Branches

| Branch                                                                 | Created from | Merges into | Merge method | Deleted after merge |
| ---------------------------------------------------------------------- | ------------ | ----------- | ------------ | ------------------- |
| `main`                                                                 | —            | —           | —            | never               |
| `dev`                                                                  | `main`       | —           | —            | never               |
| `feat/*`, `fix/*`, `docs/*`, `chore/*`, `refactor/*`, `test/*`, `ci/*` | `dev`        | `dev`       | squash       | yes                 |
| `release/vX.Y.Z`                                                       | `dev`        | `main`      | merge commit | yes                 |
| `hotfix/*`                                                             | `main`       | `main`      | merge commit | yes                 |
| back-merge (`main` as the head)                                        | —            | `dev`       | merge commit | no (`main` stays)   |

### main

- The **default branch**. `claude plugin marketplace add o6b7/cross-stack-standard` clones the
  default branch, so it must always hold a released state.
- Every release tag `vX.Y.Z` points at a commit on `main`. (`main` also contains the repository's
  bootstrap commit and, through each release merge, the history of `dev`, so not every commit on
  it is itself a release.)
- Changes arrive only through pull requests from `release/*` or `hotfix/*` branches, merged with a
  merge commit.

### dev

- The integration branch. Every feature pull request targets `dev`.
- It accepts squash merges (work branches) and merge commits (the `main` → `dev` back-merge after
  a release). A squashed back-merge would lose the ancestry link to `main`, and the next release
  would then conflict with it.

### Work branches

- Branch from `dev`, name the branch with one of the prefixes above and a short kebab-case
  description (`feat/query-key-rule`).
- Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:`); the commit-msg hook and CI enforce it.
- The pull request is **squash-merged**: its title becomes the commit header on `dev` and the
  branch's commit messages become the body. CI therefore checks the title with commitlint, and the
  brand guard and narrative lint check the title, body, branch name and every commit message.
- The branch is deleted after the merge (the repository deletes head branches automatically).

### release/vX.Y.Z and hotfix/*

Both follow [the release guide](release.md): stamp the version, finalize the changelog, open a
pull request into `main`, merge it with a merge commit, tag `vX.Y.Z` on `main`, let the release
workflow publish, then back-merge `main` into `dev` with a merge commit.

## Pinning a version

Adopters install from the default branch, which always holds the latest release. To freeze a
project on one release, pin the marketplace to its tag:

```sh
claude plugin marketplace add o6b7/cross-stack-standard#vX.Y.Z
```

Tags are immutable in this repository (a tag ruleset forbids updating or deleting them), so a
`#vX.Y.Z` pin always resolves to the same content.

## Unreleased changes

Version 1.0 has no early-access channel. The plugin updates only when its version string changes,
and unreleased commits on `dev` keep the version of the last release, so pinning `#dev` would not
deliver updates reliably. Contributors who want to try unreleased work load the plugin from a
local checkout instead:

```sh
claude --plugin-dir ./plugins/cross-stack-standard
```
