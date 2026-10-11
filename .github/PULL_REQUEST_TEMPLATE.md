<!-- markdownlint-disable-file MD041 -->
<!--
The pull request title becomes the squash-merge commit header on dev, so it must follow
Conventional Commits (for example "feat(web): add the query-key factory rule"), 100 characters
at most. CI checks the title, the body and the branch name.
-->

## What and why

<!-- What changes, and the reason. Link the issue or discussion if there is one. -->

## Rules touched

<!-- Rule IDs added, changed, promoted or removed (for example PROC-014, PROC-022), or "none". -->

## Checklist

- [ ] The title follows Conventional Commits and fits in 100 characters.
- [ ] `CHANGELOG.md` has a new entry under `## [Unreleased]` (not needed when only `docs/` or `test/` change).
- [ ] Tests cover the change, and `npm test` passes locally.
- [ ] A rule is labelled `FORCED` or `GUARDED` only when its gate ships in this pull request and its violation fixture fails; new rules enter as `REVIEW`.
- [ ] No gate was weakened to get a green build (exceptions are dated allowlist entries with a reason).
- [ ] Generated files are regenerated, not edited by hand (`docs/rules/`, `plugins/cross-stack-standard/data/`).
- [ ] New or changed versions, flags and pins are recorded in `docs/maintainers/verified-versions.md`.

## Gate output

<!--
Paste the real output of the checks you ran (for example `npm test`, `npm run check`,
`node scripts/run-fixtures.mjs`), piped through `node scripts/sanitize-output.mjs`, which replaces
home-directory, temporary and repository paths with `~`, `<tmp>` and `<root>`.
-->

```text

```
