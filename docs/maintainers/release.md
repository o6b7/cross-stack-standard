# Releasing the Standard

This guide covers how versions are numbered, how a release is cut by hand, how much context the
plugin costs, and which steps need the owner's explicit approval.

- [Versioning policy](#versioning-policy)
- [Release flow](#release-flow)
- [Hotfix flow](#hotfix-flow)
- [What the release workflow checks](#what-the-release-workflow-checks)
- [Context budget](#context-budget)
- [Hard stops](#hard-stops)

## Versioning policy

The Standard is versioned as a whole: the plugin, the marketplace entry, the kit templates and the
gate packages share one version, stored in `VERSION` and written everywhere else by
`node scripts/stamp-version.mjs`. CI fails on any mismatch (`node scripts/check-version-drift.mjs`).

Semantic Versioning answers one question for a standard: **can upgrading break an adopter's
build?**

| Bump      | When                                                       | Examples                                                                                                                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MAJOR** | A change that can newly fail an adopter's build after 1.0. | A new `FORCED` or `GUARDED` rule that is on by default; promoting a default-on rule from `REVIEW` to `FORCED` or `GUARDED`; a stricter threshold (coverage, complexity, PHPStan level); a raised minimum version that an existing project may not meet; a removed or renamed configuration option. |
| **MINOR** | New capability that adopters opt into.                     | A new opt-in rule, module, track or profile; a new skill; a rule promoted inside an opt-in module; new documentation. During 0.x only, an existing default-on `REVIEW` rule may also be promoted, with the affected IDs and adoption impact listed in the release notes.                           |
| **PATCH** | Fixes that cannot fail a build that passed before.         | Bug fixes, false-positive reductions, clearer messages, documentation fixes.                                                                                                                                                                                                                       |

Rules of thumb:

- Judge by the adopter's build, not by the size of the change. A one-line default flip can be
  MAJOR; a large new opt-in module is MINOR.
- When in doubt, take the higher bump.
- Before `1.0.0`, the public API is not yet stable: a `0.x` MINOR release may contain changes that
  would be MAJOR after `1.0.0`, and the release notes say so.
- A default-on rule must have shipped by the release's `since` version. Before `1.0.0`, the release
  check allows default-on rules to remain REVIEW while their gates are built; from `1.0.0` onward,
  every default-on rule must be at its target level. This matches the guidance-first 0.x rollout in
  [ADR 0107](../decisions/0107-pre-1-0-rule-promotion.md).
- `1.0.0` ships only when the release gate passes in full; otherwise the release is `0.x.y` with
  a written list of what blocks `1.0.0`.

Release notes come from `CHANGELOG.md` ([Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)).
Every pull request that touches files outside `docs/` and `test/` adds an entry under
`## [Unreleased]`; CI enforces it with `node scripts/check-changelog.mjs`.

## Release flow

Releases are cut by hand. Nothing in CI creates tags or releases on its own; the release
workflow only runs after a person pushes a `vX.Y.Z` tag. Every step marked **approval** needs the
owner's explicit "yes" first (see [Hard stops](#hard-stops)).

Every command below pins the repository explicitly, so it cannot act on another checkout:

```sh
REPO_DIR=~/path/to/cross-stack-standard   # this repository's working tree
GH_REPO=o6b7/cross-stack-standard
```

Before a commit or push, confirm `git -C "$REPO_DIR" rev-parse --show-toplevel` and
`git -C "$REPO_DIR" remote get-url origin` point where you expect, and that the staged list is
exactly the files you mean to commit (never `git add -A` or `git add .`).

### 1. Prepare the release branch

```sh
git -C "$REPO_DIR" fetch origin
git -C "$REPO_DIR" switch -c release/vX.Y.Z origin/dev
```

1. Decide the version with the [versioning policy](#versioning-policy) and write it to `VERSION`.
   Then run, in this order (stamping rewrites template headers and schema URLs, which the plugin
   data hashes and embeds):

   ```sh
   node scripts/stamp-version.mjs
   node scripts/generate-rule-docs.mjs
   node scripts/build-agent-skill.mjs
   node scripts/build-plugin-data.mjs
   node scripts/check-version-drift.mjs
   node scripts/build-plugin-data.mjs --check
   node scripts/check-identity.mjs --release
   node scripts/check-registry.mjs --release
   ```

   `check-registry --release` always fails when a default-on rule is planned for a later version.
   Before `1.0.0`, it permits default-on REVIEW guidance to remain below target; starting at
   `1.0.0` (including release candidates), it also requires every default-on rule to be at target.
   A pre-1.0 MINOR release that promotes a default-on rule must name its rule IDs and adoption
   impact in the notes.

2. Finalize `CHANGELOG.md`: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` (today's date),
   add a new empty `## [Unreleased]` section above it, and add or update the link definitions at
   the bottom of the file. From now on `data/template-hashes/X.Y.Z.json` is frozen: the upgrade
   skill compares adopters' files with it, so `build-plugin-data` refuses to rewrite it. If a
   template must still change on this release branch before the tag, rebuild with
   `node scripts/build-plugin-data.mjs --refreeze`. CI accepts the pull request: its new dated
   section counts as the changelog entry, and it must name the version in `VERSION`.

   ```md
   [Unreleased]: https://github.com/o6b7/cross-stack-standard/compare/vX.Y.Z...dev
   [X.Y.Z]: https://github.com/o6b7/cross-stack-standard/compare/vA.B.C...vX.Y.Z
   ```

   For the first release, link `[X.Y.Z]` to `https://github.com/o6b7/cross-stack-standard/releases/tag/vX.Y.Z`.

3. Preview the notes exactly as the release workflow will build them:

   ```sh
   node scripts/release-notes.mjs --version X.Y.Z
   ```

4. Run the full-history checks that the release workflow repeats:

   ```sh
   node scripts/check-brand-leak.mjs --all-history
   node scripts/check-narrative.mjs --tree
   node scripts/check-narrative.mjs --commits origin/dev
   ```

5. Commit the stamped files and the changelog explicitly by path with the message
   `chore(release): vX.Y.Z`, push the branch and open the pull request:

   ```sh
   git -C "$REPO_DIR" push -u origin release/vX.Y.Z
   gh pr create --repo "$GH_REPO" --base main --head release/vX.Y.Z \
     --title "chore(release): vX.Y.Z" --body-file <notes-file>
   ```

   Build the body from sanitised output (`node scripts/sanitize-output.mjs` replaces home,
   temporary and repository paths) and pipe it through `node scripts/check-brand-leak.mjs --stdin`
   before posting it.

### 2. Merge into main (approval)

When `ci-ok` is green and the owner approves, merge with a **merge commit** (never squash: a
squashed release breaks the ancestry that the back-merge and future releases rely on):

```sh
gh pr merge <number> --repo "$GH_REPO" --merge
```

### 3. Tag the release (approval)

Create an annotated tag on the merge commit on `main` and push only that tag. The pre-push hook
refuses tags unless `CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH=1` is set for the command, and the tag
ruleset lets only repository admins create tags. Run the push in your own terminal: the committed
`.claude/settings.json` denies tag pushes and the override variable to Claude Code sessions.

```sh
git -C "$REPO_DIR" fetch origin main
git -C "$REPO_DIR" tag -a vX.Y.Z -m "vX.Y.Z" origin/main
git -C "$REPO_DIR" merge-base --is-ancestor vX.Y.Z origin/main && echo "tag is on main"
CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH=1 git -C "$REPO_DIR" push origin refs/tags/vX.Y.Z
```

Never use `git push --tags`: it pushes every local tag.

### 4. Let the release workflow publish (approval covers steps 3–4)

`.github/workflows/release.yml` runs on the tag. It [verifies the tag](#what-the-release-workflow-checks),
builds the notes from `CHANGELOG.md` and creates the GitHub Release with `gh release create`.
Check the result:

```sh
gh release view vX.Y.Z --repo "$GH_REPO"
```

### 5. Back-merge main into dev

Open a pull request from `main` into `dev` and merge it with a **merge commit**, so `dev` contains
the release commit:

```sh
gh pr create --repo "$GH_REPO" --base dev --head main --title "chore(release): back-merge vX.Y.Z into dev" \
  --body "Back-merge of the vX.Y.Z release."
gh pr merge <number> --repo "$GH_REPO" --merge
git -C "$REPO_DIR" fetch origin
git -C "$REPO_DIR" merge-base --is-ancestor origin/main origin/dev && echo "dev contains main"
```

The back-merge needs no changelog entry (CI recognises a pull request from `main`). The next pull
request on `dev` moves `VERSION` on to the next pre-release (for example `X.Y.(Z+1)-dev.0`), runs
`node scripts/stamp-version.mjs` and `node scripts/build-plugin-data.mjs`, and adds its own
`## [Unreleased]` entry. Until then `build-plugin-data` refuses any template change, because it
would rewrite the released version's frozen template hashes.

### 6. Verify the published install

In a throwaway configuration directory, so your own settings are untouched:

```sh
export CLAUDE_CONFIG_DIR="$(mktemp -d)"
claude plugin marketplace add o6b7/cross-stack-standard#vX.Y.Z
claude plugin install cross-stack-standard@cross-stack-standard
claude plugin list
claude plugin details cross-stack-standard
```

The listed version must be `X.Y.Z`.

## Hotfix flow

1. Branch `hotfix/<short-name>` from `origin/main`.
2. Fix, add a `### Fixed` entry, bump the PATCH version, stamp and finalize the changelog as in
   step 1 of the release flow. The new `## [X.Y.Z] - YYYY-MM-DD` section, with the fix in it,
   is the pull request's changelog entry.
3. Open a pull request into `main`; merge it with a merge commit (approval).
4. Tag `vX.Y.Z` on `main` and push the tag (approval); the release workflow publishes.
5. Back-merge `main` into `dev` with a merge commit and check the ancestry, as in step 5.

## What the release workflow checks

`release.yml` runs only on `v*` tags and fails before publishing when any of these is false:

- the tag is `vX.Y.Z` (SemVer, optional pre-release suffix) and equals `v` + the content of
  `VERSION`;
- the tagged commit is an ancestor of `origin/main` (`git merge-base --is-ancestor`); tag filters
  ignore branches, so this is what stops a tag on another branch from being released;
- `check-version-drift` and the release-specific registry gate pass, and generated plugin data
  matches the tagged sources (`build-plugin-data --check`);
- `check-identity --release` passes: author metadata everywhere, the root and distributable
  licenses, README, security policy, code of conduct, CODEOWNERS, and a manifest and license in
  every package directory that exists. Gate packages are optional until they ship;
- the brand guard passes over the full history (every file name ever added, every commit message,
  ref names), and the narrative lint passes on the tree and on every commit message on `main`;
- `CHANGELOG.md` has a dated, non-empty section for the version; the extracted notes pass the brand
  guard and the narrative lint.

Only the final job has `contents: write`, and it runs no repository code: it decodes the notes
built by the verification job and calls `gh release create --verify-tag`.

## Context budget

What the plugin costs in an adopter's context window, measured before each release. "Estimate"
values are character counts divided by four; `details` values come from Claude Code's own
projection.

| Component                    | When it loads                       | Measured with                                        | Tokens                                                                                   | Date       |
| ---------------------------- | ----------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| SessionStart hook output     | Every session                       | Hook output, tokenized                               | ~90 (estimate: 346 characters for a Laravel + Next.js monorepo without a manifest)       | 2026-10-12 |
| Skill names and descriptions | Every session                       | `claude plugin details cross-stack-standard`         | ~927 upper bound (`details`, Claude Code 2.1.296); core ~220, five user-only skills ~710 | 2026-10-12 |
| Skills at runtime            | Every session                       | `/context` (Skills rows) in an authenticated session | not measured yet; needs an authenticated session                                         | —          |
| `CLAUDE.md` managed block    | Every session in an adopted project | File size, tokenized                                 | ~910 (estimate: 60 lines, 3,655 characters)                                              | 2026-10-12 |
| Core skill body (`SKILL.md`) | When the skill runs                 | File size, tokenized                                 | ~4,100 (`details` on-invoke; 245 lines, 17,408 characters)                               | 2026-10-12 |
| Portable Agent Skill body    | When the skill runs                 | File size, tokenized                                 | ~1,180 (estimate: 68 lines, 4,715 characters)                                            | 2026-10-12 |
| Track references             | When a track is read                | File size, tokenized                                 | ~3,700–4,450 each (estimate: Laravel 17,798, web 16,124, mobile 14,759 characters)       | 2026-10-12 |

`claude plugin details` counts skills that the runtime omits (for example user-only skills), so
the table reports both the `details` figure and the runtime `/context` rows.

## Hard stops

These actions need the owner's explicit approval every time, even when a script or checklist
would allow them:

- pushing to `main` (the one exception is the repository's bootstrap commit);
- creating or pushing tags, and creating GitHub Releases;
- publishing packages to npm or Packagist;
- submitting the plugin to a plugin directory;
- force-pushing or rewriting pushed history;
- deleting remote branches other than merged feature branches;
- changing the repository's visibility;
- committing private working files or secrets.

Mechanical backstops make a mistake hard even without a reviewer:

| Backstop                                                                                       | What it stops                                   |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Tag ruleset (all tags: creation, update, deletion restricted to admins)                        | Tags from anyone else, moved or deleted tags    |
| `main` ruleset (pull request with a merge commit, `ci-ok` required, no force push or deletion) | Direct pushes and unreviewed merges into `main` |
| Pre-push hook (`lefthook.yml`)                                                                 | Pushing `main` or any tag from a local clone    |
| `.claude/settings.json` deny and ask rules                                                     | A Claude Code session running the usual forms   |
| `release.yml` ancestry check                                                                   | Releasing a tag that is not on `main`           |
| `"private": true` in every `package.json`                                                      | Accidental `npm publish`                        |
| Brand guard and narrative lint in hooks, CI and the release workflow                           | Publishing text that should stay private        |

The committed `.claude/settings.json` denies Claude Code sessions in this repository the usual
command forms of the hard stops: pushes to `main` (by name, `HEAD:main` or `refs/heads/main`,
also after `git -C <dir>` or `git -c <option>`), force pushes, `--all` and `--mirror`, tag pushes,
`gh release create`, `upload`, `edit` and `delete`, `gh repo edit --visibility`,
`claude plugin tag`, package publishing, and any command that names the
`CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH` override. Remote branch deletion and `gh pr merge` always
ask. Permission rules match command text, so they are a guard against mistakes, not a security
boundary: `sh -c '…'`, a program run by its full path and a quoted subcommand are not matched, and
a bare `git push` from a checked-out `main` names no branch. The rulesets and the pre-push hook
stop those. `test/scripts/ci/claude-settings.test.mjs` lists the commands each rule must and must
not match.
