---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Maintainers: repository CI and settings with one aggregate required check, pinned tools and smoke runs on dev

## Context and Problem Statement

This repository ships a plugin, gate packages, templates, a rule registry and several hundred
fixtures. A change must not reach `dev` or `main` unless every check it could affect ran and
passed. GitHub makes that harder than it looks. Required checks from a workflow skipped by a
`paths:` filter stay pending and block merging, while a job skipped by an `if:` condition reports
success. A job skipped because a job it needs failed may not block merging at all. The full matrix
(three operating systems, several PHP versions, framework smoke apps) is too slow to run on every
pull request. And scheduled workflows run only on the default branch, which holds no content until
the first release.

How does the repository gate merges reliably, keep CI affordable, and apply to itself what it asks
adopters to do?

## Decision Drivers

- A merge is blocked exactly when an affected check did not succeed, never by a check left pending.
- One stable check name in the rulesets, independent of job names and matrix entries.
- Least privilege for the workflow token; no credentials left on the runner's disk.
- Heavy jobs run on pull requests only when affected, and always before anything reaches `main`.
- The repository dogfoods its own workflow templates and hooks.

## Considered Options

- One workflow with a `changes` classifier and a single aggregate required check, `ci-ok`
- Every job listed as a required check, with `paths:` filters on the workflows
- Every job always runs, and every job is a required check

## Decision Outcome

Chosen option: "One workflow with a `changes` classifier and a single aggregate required check,
`ci-ok`", because it is the only option that blocks on every affected failure without leaving checks
pending and without running the whole matrix on every pull request.

- **Triggers and token.** `ci.yml` runs on pull requests to `dev` and `main` and on pushes to both.
  Top-level `permissions: contents: read`; checkout uses `persist-credentials: false`; untrusted
  pull request text (title, body, branch name) reaches scripts only through `env:`. Workflows with
  required jobs have no `paths:` filters; jobs are skipped with job-level `if:` instead.
- **Classifier and aggregate.** A `changes` job classifies the diff (plugin, hooks, fixtures);
  workflow or dependency changes select everything, and pushes to `dev` and `main` run every job.
  `ci-ok` runs with `if: always()`, needs every other job, and passes only when each one finished
  as `success`, or as `skipped` while `changes` reported it unaffected. It is the only required
  status check in the `dev` and `main` rulesets.
- **Jobs.** Plugin validation with the Claude Code CLI installed at an exact version (asserted with
  `claude --version`, throwaway config directory, non-essential traffic disabled):
  `claude plugin validate --strict` on the marketplace and the plugin, `plugin list --json` must
  report no load errors, and `plugin details` prints the component inventory. Lint: ESLint,
  Prettier, markdownlint, actionlint and shellcheck, the last two as pinned, checksum-verified
  binaries ([0032](0032-supply-chain-pinning.md)). Tests: the Node test suite on Node 24 and the
  22.13 floor; hook tests on Linux, macOS and Windows, including the case where `node` is missing
  from `PATH` ([0019](0019-hook-runtime-contract.md)). Registry check and generated-docs freshness
  ([0003](0003-rule-registry.md)); the fail-then-pass fixture matrix
  ([0004](0004-fail-then-pass.md)); an isolated-plugin smoke that loads a copy of the plugin folder
  alone ([0016](0016-self-contained-plugin-runtime.md)). Integrity: version drift, the brand guard
  ([0030](0030-maintainers-brand-guard.md)), gitleaks, no gitignored private working directory or
  `.env` file tracked, and a CHANGELOG entry present.
- **Smoke apps and schedules.** Smoke apps from the official generators run on every push to `dev`
  and on pull requests labelled `run-smoke`; generation runs with a read-only token and a separate
  job with `issues: write` reports failures. Link checks, the `verified-versions.md` staleness scan
  and upstream canaries run on every push to `dev` as non-required jobs. Weekly schedules take over
  once `main` carries releases, because scheduled workflows run on the latest commit of the default
  branch, and in a public repository they are disabled after 60 days without repository activity.
  `release.yml` runs on `v*` tags only ([0025](0025-release-tooling.md)).
- **Repository settings.** Rulesets for `main`, `dev` and tags ([0027](0027-branching-model.md));
  a read-only default workflow token; Actions may not approve pull requests; actions must be
  pinned to a full commit SHA; private vulnerability reporting and secret-scanning push protection
  are enabled where the plan offers them. Every setting is read back through the API after it is
  applied. The repository runs its own lefthook hooks, commitlint and pull request template
  ([0094](0094-developer-workflow-templates.md)), with one stated exception: its pre-commit
  gitleaks job skips with a notice when the binary is missing, where the adopter template fails,
  because CI always runs gitleaks.

### Consequences

- Good, because one check name in the rulesets survives job renames and matrix changes.
- Good, because a failed dependency cannot pass silently: `ci-ok` inspects every result itself.
- Good, because pull requests stay affordable while every push to `dev` runs the full matrix, so
  nothing reaches a release branch unrun.
- Bad, because the classifier is code: a wrong pattern could skip an affected job on a pull
  request. Pushes to `dev` run everything, so such a miss is caught after merge, before a release.
- Bad, because smoke and scheduled checks cannot block a merge; their failures surface on `dev`.
- Bad, because the full matrix is expensive; a private repository on a plan with capped minutes
  would have to move the macOS, Windows and smoke jobs to manual runs.

### Confirmation

`test/scripts/ci/workflows.test.mjs` asserts the workflow contract: the triggers and the absence of
path filters, `ci-ok` needing every job and always running, every conditional job gated by a
`changes` output that `ci-ok` checks, the verdict and classification logic, read-only default
tokens, no persisted credentials, SHA-pinned actions and the verified CLI pin. actionlint runs in
the lint job. The ruleset payloads in [branch-protection.md](../maintainers/branch-protection.md)
are read back after every change; that comparison is a review step.

## Pros and Cons of the Options

### One workflow with a `changes` classifier and a single aggregate required check, `ci-ok`

- Good, because skips are explicit and audited in one place.
- Bad, because the aggregate job and classifier need their own tests.

### Every job listed as a required check, with `paths:` filters on the workflows

- Good, because it needs no aggregate job.
- Bad, because a workflow skipped by a path filter leaves its required checks pending, which blocks
  unrelated pull requests; renaming a job also breaks the rulesets.

### Every job always runs, and every job is a required check

- Good, because nothing can be skipped by mistake.
- Bad, because every documentation change pays for three operating systems and the full fixture
  matrix, and the ruleset still lists many fragile check names.

## More Information

- Required checks and skipped workflows:
  <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks>.
- Workflow token permissions and SHA pinning:
  <https://docs.github.com/en/actions/reference/security/secure-use>.
- `schedule` event (default branch, 60-day inactivity):
  <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule>.
- Private vulnerability reporting API:
  <https://docs.github.com/rest/repos/repos#enable-private-vulnerability-reporting-for-a-repository>;
  push protection:
  <https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection>.
- Exact pins: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0004](0004-fail-then-pass.md), [0027](0027-branching-model.md),
  [0030](0030-maintainers-brand-guard.md), [0032](0032-supply-chain-pinning.md),
  [0090](0090-ci-contract.md) (the adopter-side CI contract).
- Governs: this repository's own workflows and settings; no adopter rule.
