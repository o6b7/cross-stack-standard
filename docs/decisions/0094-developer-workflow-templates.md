---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Developer workflow templates: pre-commit hooks, Conventional Commits, a real-output PR template, CODEOWNERS on gate files

## Context and Problem Statement

CI catches problems after a push; a secret committed locally is already in history by then. Git
hooks run earlier, but installing them reliably has become harder:

- lefthook installs its hooks from a dependency `postinstall` script. npm 12 blocks dependency
  lifecycle scripts unless the root package's `allowScripts` policy approves them, so the hooks
  silently do not install. In lefthook 2.1.14 that script also refuses to install over an
  existing `core.hooksPath`.
- husky sets `core.hooksPath`, so two hook managers in one repository conflict.

Two more gaps sit around the commit itself. Squash merges use the pull request title as the commit
message, so linting only the branch commits misses the message that lands. A common defect is a
pull request that says the checks passed without showing their output; another is a gate file
changed in review without anyone responsible for gates noticing.

Which workflow templates does the Standard ship, and how are they installed and checked?

## Decision Drivers

- Secrets and formatting problems are caught before they enter history.
- Hook installation works under npm 12 without a per-package approval.
- One hook manager per repository ([0006](0006-stack-first.md), [0007](0007-one-mechanism-per-concern.md)).
- Commit messages are machine-readable, including the squash message.
- A pull request shows real gate output ([0014](0014-working-procedure.md)).
- A change to a gate file reaches a named human reviewer ([0021](0021-gate-file-protection.md)).
- Backend-only repositories get the same workflow.

## Considered Options

- lefthook via a root `prepare` script, commitlint, a pull request template and a CODEOWNERS
  template
- husky with lint-staged
- CI only, no local hooks

## Decision Outcome

Chosen option: "lefthook via a root `prepare` script, commitlint, a pull request template and a
CODEOWNERS template", because root lifecycle scripts still run under npm 12, lefthook runs PHP and
JavaScript tools from one configuration, and every template is derived from data the kit already
keeps.

- **lefthook.** lefthook 2.1 as a devDependency, installed by the root script
  `"prepare": "lefthook install"`, not by its dependency `postinstall`. `doctor` checks that the
  hooks are installed and that `core.hooksPath` is unset.
- **pre-commit.** Jobs on `{staged_files}`, for the declared tracks only: the pinned,
  checksum-verified gitleaks binary (`gitleaks git --pre-commit --redact --staged`), Pint, Prettier
  and ESLint. The official gitleaks is not distributed through npm or Composer; when the binary is
  missing, the template's job fails with install instructions instead of skipping
  ([0084](0084-secret-scanning-and-dependency-audits.md)). This repository's own hook is the one
  stated exception: it skips with a notice and the install command, so an outside contributor can
  commit without the binary, and CI always scans
  ([0031](0031-maintainers-repository-ci.md)).
- **Commit messages.** A `commit-msg` job runs `commitlint --edit {1}` with `commitlint.config.mjs`
  extending `@commitlint/config-conventional` (the `.mjs` name avoids Node's module-type warning in
  packages without `"type": "module"`). commitlint 21 needs Node 22.12 or later. The CI template
  lints the pull request's commit range and its title, read through `env:` rather than interpolated
  into the script.
- **Existing hook manager.** `adopt` detects husky (a `.husky/` directory or `core.hooksPath`),
  moves its hook commands into the lefthook configuration in a proposed change and resets the hooks
  path. It never leaves two hook managers installed.
- **Pull request template.** Sections for the rule IDs touched and for pasting the real output of
  the project's `check`, and a checkbox confirming that the output is real and current.
- **CODEOWNERS.** Generated from the protected-path list, as the human counterpart to the hook
  ([0021](0021-gate-file-protection.md)). It blocks a merge only where a branch rule or ruleset
  requires code-owner review; the docs say so.
- **Backend-only repositories.** A Laravel repository without a `package.json` gets a minimal one
  (lefthook `prepare`, commitlint, jscpd and the kit's script entry). Node 22.13 or later is a
  documented prerequisite ([0059](0059-javascript-toolchain-pins.md)).
- **Protection.** Every lefthook and commitlint configuration name, `lefthook-local.*` and
  CODEOWNERS are protected paths; `--no-verify` and `LEFTHOOK=0` are inspected shell forms
  ([0021](0021-gate-file-protection.md)).

### Consequences

- Good, because leaks and lint failures stop at the commit instead of in CI.
- Good, because hooks install under npm 12 with no `allowScripts` entry.
- Good, because reviewers see real output, and gate changes have an owner.
- Bad, because hooks live per clone and can be skipped; CI stays the backstop.
- Bad, because every developer machine needs the gitleaks binary.
- Bad, because a PHP-only team gains a Node toolchain for workflow tools.
- Bad, because Conventional Commits imposes a convention on teams that had none.

### Confirmation

- `doctor` parses the hook configuration and requires a secret-scan, formatter and lint job per
  declared track, installed hooks and no `core.hooksPath`. GUARDED; evasions: `--no-verify`,
  `LEFTHOOK=0`, a clone where `npm install` never ran, `lefthook-local` overrides.
- The CI commitlint job checks the commit range and the title. GUARDED; evasion: editing the
  squash message in the merge dialog.
- A CODEOWNERS check requires every protected-path glob to match an owned entry. GUARDED; it is
  only as strong as the branch rule that requires code-owner review.
- Whether pasted output is real is Review.

Each gate has a clean and a violation fixture ([0004](0004-fail-then-pass.md)). Rules enter the
registry as REVIEW and take these labels when their gates pass both fixtures.

## Pros and Cons of the Options

### lefthook via a root `prepare` script, commitlint, a pull request template and a CODEOWNERS template

- Good, because one hook tool serves PHP and JavaScript and installs from a root script.
- Bad, because gitleaks and lefthook come from outside Composer.

### husky with lint-staged

- Good, because it is common in JavaScript projects.
- Bad, because it is two packages for one job, JavaScript-oriented, and conflicts with any other
  manager through `core.hooksPath`.

### CI only, no local hooks

- Good, because nothing runs on developer machines.
- Bad, because a secret is in history before CI sees it.

## More Information

- lefthook: <https://github.com/evilmartians/lefthook> (Node installation:
  <https://github.com/evilmartians/lefthook/blob/master/docs/installation/node.md>); npm 12
  install-script policy: <https://github.com/npm/cli/blob/latest/CHANGELOG.md>.
- commitlint: <https://github.com/conventional-changelog/commitlint>; Conventional Commits 1.0.0:
  <https://www.conventionalcommits.org/en/v1.0.0/>; gitleaks: <https://github.com/gitleaks/gitleaks>.
- CODEOWNERS:
  <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners>.
- Versions, configuration names and bypass variables:
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0014](0014-working-procedure.md), [0021](0021-gate-file-protection.md),
  [0084](0084-secret-scanning-and-dependency-audits.md),
  [0095](0095-adopter-dependency-updates.md).
- Governs: the workflow rules for pre-commit hooks, commit messages, pull request evidence and
  code ownership of gate files.
