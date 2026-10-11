---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# CI contract: a reusable per-track workflow that runs exactly the check members

## Context and Problem Statement

Local checks and CI drift apart in predictable ways. CI lists commands by hand, so a member added to
the local `check` script never runs in CI. Jobs are copied between workflow files, and a typo in
one copy goes unnoticed; a common defect is a duplicated quality job whose path filter never matches
anything. One step that runs the whole `check` script hides which member failed. Build errors that
only a production build or a bundle export reveals surface in a later deploy stage. Deploy jobs run
without waiting for quality. And tests read a cached configuration instead of the values in
`phpunit.xml`.

What does CI run for each track, and how is it kept identical to what developers run locally?

## Decision Drivers

- Local equals CI by construction, not by discipline.
- A failure names the member that failed.
- One definition of the quality job per track, reused everywhere.
- Nothing ships unless quality passed; quality jobs run without secrets.

## Considered Options

- One reusable workflow per track whose steps are the `check` members, verified by a parity check
- One CI step that runs the composite `check` script
- Steps copied into each workflow file

## Decision Outcome

Chosen option: "One reusable workflow per track whose steps are the `check` members, verified by a
parity check", because it removes the copies, names each failure, and makes drift between local and
CI a failing check instead of a surprise.

- **Reusable workflows.** Each track has one reusable workflow (`on: workflow_call`), shipped as a
  template and copied by `adopt`. Thin caller workflows, one per trigger, call it. Its steps are the
  members of the track's `check` script, each as its own named step.
- **Laravel** runs the format check (`pint --test`), static analysis (Larastan), tests (Pest, with
  the coverage floor, [0091](0091-coverage-floors.md)) and the baseline-growth check
  ([0038](0038-larastan-levels-shrink-only-baseline.md)).
- **Web** runs typecheck, lint, format check, boundaries (dependency-cruiser), dead code (knip),
  tests with coverage, and the production build.
- **Mobile** runs typecheck, lint, the structure rules, format check, boundaries
  (dependency-cruiser), dead code (knip), tests with coverage, and a bundle export
  (`npx expo export --platform ios --platform android`).
- **`check:fast`.** Each track also defines `check:fast`, the subset the Stop hook runs within its
  time budget ([0020](0020-feedback-hooks.md)).
- **CI-only steps.** Dependency audits and the secret scan ([0084](0084-secret-scanning-and-dependency-audits.md))
  run in the reusable workflow but not in `check`, because audits need the network; module jobs,
  such as the contract drift check ([0054](0054-generated-api-contract.md)) and the end-to-end
  journey ([0068](0068-frontend-testing.md)), are added the same way.
- **`needs: quality`.** Build, deploy and release jobs declare `needs:` on the quality job, or run
  only after it succeeds. Deployment itself stays out of scope ([0009](0009-tracks-profiles-and-scope.md)).
- **Hermetic tests.** Every `<env>` entry in `phpunit.xml` that the suite relies on carries
  `force="true"`, because PHPUnit does not overwrite an existing environment variable without it.
  The suite asserts that configuration is not cached, because a cached configuration ignores the
  `phpunit.xml` values.
- **Posture.** Actions are pinned by full commit SHA with a version comment
  ([0032](0032-supply-chain-pinning.md)); workflows default to `permissions: contents: read`;
  checkout sets `persist-credentials: false`; quality jobs receive no secrets, and the web build and
  mobile bundle export need none ([0085](0085-environment-files.md)).

### Consequences

- Good, because adding a member to `check` without CI running it fails a check.
- Good, because a red run names the failing member.
- Good, because production-build and bundling errors fail the pull request, not a deploy.
- Bad, because adopters with an existing CI must move their quality steps into the reusable
  workflow.
- Bad, because the parity check reads scripts and workflow files, and must follow changes in how
  either is written.

### Confirmation

- A CI-parity check splits each track's `check` script into its members and requires a quality-job
  step for each, without `continue-on-error`, or a call to the track's reusable workflow; it also
  requires the track's mandatory members and a `check:fast` script. GUARDED, because a step can run
  a different command under a member's name.
- A workflow check fails when the member sequence is defined in more than one job instead of being
  called through `workflow_call`, when a job matching the build, deploy or release pattern does not
  depend on the quality job, or when a quality job receives secrets. GUARDED, because job purpose is
  inferred from names.
- The production build and the bundle export fail the job on errors that typecheck and tests miss.
  FORCED, within the job; the parity check guards the step's presence.
- A Pest test asserts the configured `phpunit.xml` environment values and `force="true"`. GUARDED.
  The suite's bootstrap assertion that configuration is not cached is FORCED.
- Requiring the quality check before merge is a repository setting, and is Review
  ([0104](0104-org-rollout-tooling.md)).

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### One reusable workflow per track whose steps are the `check` members, verified by a parity check

- Good, because there is one definition per track and drift fails a check.
- Bad, because it needs the parity script and a template upgrade path ([0023](0023-adopter-manifest-and-upgrade.md)).

### One CI step that runs the composite `check` script

- Good, because it is trivially identical to local.
- Bad, because a failure does not say which member broke, and CI-only steps have nowhere to go.

### Steps copied into each workflow file

- Good, because each file reads on its own.
- Bad, because copies drift, and a fix in one is missed in the others.

## More Information

- Reusing workflows (`workflow_call`):
  <https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows>; `jobs.<job_id>.needs`
  and `permissions`: <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>;
  secure use: <https://docs.github.com/en/actions/reference/security/secure-use>.
- PHPUnit 13 `<env>` and `force`:
  <https://docs.phpunit.de/en/13.0/configuration.html#the-env-element>; Laravel's testing
  environment and the configuration cache: <https://laravel.com/docs/13.x/testing#environment>.
- Expo CLI export: <https://docs.expo.dev/more/expo-cli/>.
- Versions and flags: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0009](0009-tracks-profiles-and-scope.md), [0020](0020-feedback-hooks.md),
  [0032](0032-supply-chain-pinning.md), [0085](0085-environment-files.md).
- Governs: the per-track check-chain and CI-parity rules, the workflow structure rules, the
  deploy-needs-quality rule, the rule that the default branch requires the quality check, and the
  hermetic test-environment rules.
