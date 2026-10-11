---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Backend testing floor: meta-tests, invariant-named scenarios and security suites that fail when empty

## Context and Problem Statement

A Laravel project can have a large, well-written test suite and still ship an endpoint that no
test calls, or a route whose policy ability does not exist. Scenario tests prove what they cover;
nothing in them notices what they do not cover. Security suites have a second problem. PHPUnit's
`failOnIncomplete`, `failOnRisky` and `failOnSkipped` all default to `false`, so a suite whose
tests are marked incomplete or skipped exits 0. Pest's `->todo()` is reported as skipped, so it
passes even when incomplete tests fail the run. A common defect is a security suite that passes
while it is empty or skipped.

What is the minimum a backend test suite must prove, and how does the Standard keep mandated suites
from passing without testing anything?

## Decision Drivers

- Untested or unauthorized routes are found by a test, not by a reviewer.
- Tests explain which invariant they protect, so a failure is readable.
- A mandated suite cannot pass while empty, incomplete or skipped.
- Legitimate environment-dependent skips keep working elsewhere.

## Considered Options

- A two-meta-test floor, invariant-named scenarios and complete security suites
- Coverage percentage only
- Security suites shipped as templates for the project to complete

## Decision Outcome

Chosen option: "A two-meta-test floor, invariant-named scenarios and complete security suites",
because it is the only option that catches a missing test or ability mechanically and cannot be
satisfied by an empty suite.

- **Floor.** Two meta-tests that read the registered routes at runtime. Route coverage: a listener
  records every route matched while the feature suite runs, and a final assertion fails for any
  registered API route that was never matched. Policy abilities: every non-public route must
  resolve to an ability that the model's policy defines, found through the FormRequest
  `authorize()`, a controller authorization call, `can:` middleware or resource authorization;
  public routes are listed in a dated allowlist ([0005](0005-explicit-exceptions.md)).
- **Above the floor.** Scenario and regression tests are named after the invariant they protect,
  with a docblock that describes the failure they guard against.
- **Security suites.** Shipped complete and dataset-driven, running against the kit's own
  plumbing; project-specific inputs come from datasets that fail with a clear message when empty.
  `failOnIncomplete="true"` and `failOnRisky="true"` are set on the root `<phpunit>` element, and
  the `test` script also passes `--fail-on-incomplete`.
- **Token gate.** A gate reads PHP tokens (so comments and strings do not count) and fails on
  `->todo(`, `->skip(`, `markTestIncomplete(` and `markTestSkipped(` in the mandated suites, and a
  check asserts that every mandated test name exists. A waiver is a dated allowlist entry, never a
  skipped test.
- **Skips elsewhere.** `failOnSkipped` stays off globally, so tests that skip for a missing
  extension or service still work.
- **Tenancy.** With the tenancy module on, the isolation suite and the denial vocabulary (404
  across the tenant boundary, 403 within it, silent scoping on lists) are added
  ([0057](0057-tenancy-module.md)). Coverage floors are a separate decision
  ([0091](0091-coverage-floors.md)).

### Consequences

- Good, because a new route without a test or without a policy ability fails the build.
- Good, because a security suite cannot be green while it tests nothing.
- Good, because invariant names make failures and regressions readable.
- Bad, because brownfield projects start with routes the meta-tests reject; adoption records them
  in a shrink-only list or dated allowlist entries, which then need work.
- Bad, because the meta-tests extract abilities by static and runtime inspection, so unusual
  authorization styles can evade them; they are labelled GUARDED with their evasions listed.
- Bad, because the complete security suites depend on the kit's plumbing; a project that replaces
  it must keep the suites passing.

### Confirmation

The route-coverage and policy-ability meta-tests are GUARDED Pest gates; the fail-on settings and
the token gate are checked by `doctor` and a script sub-check in the track's `check` chain. A
violation fixture with one `->todo()`, one `markTestIncomplete()` and one test without assertions
must make the test command exit non-zero ([0004](0004-fail-then-pass.md)). Invariant naming is
checked in review (REVIEW).

## Pros and Cons of the Options

### A two-meta-test floor, invariant-named scenarios and complete security suites

- Good, because each part closes a specific way a green build can lie.
- Bad, because it adds tests and checks the project must keep green.

### Coverage percentage only

- Good, because it is one number.
- Bad, because a high percentage says nothing about which routes lack a test or an ability.

### Security suites shipped as templates for the project to complete

- Good, because they fit any project.
- Bad, because unfinished templates pass by default, which is exactly the defect to prevent.

## More Information

- PHPUnit configuration (`failOnIncomplete`, `failOnRisky`, `failOnSkipped`):
  <https://docs.phpunit.de/en/13.0/configuration.html>.
- Pest skipping and datasets: <https://pestphp.com/docs/skipping-tests>,
  <https://pestphp.com/docs/datasets>; Laravel authorization:
  <https://laravel.com/docs/13.x/authorization>.
- Related: [0036](0036-pest-replaces-phpunit-runner.md),
  [0037](0037-phpstan-rules-and-reflection-tests.md), [0057](0057-tenancy-module.md),
  [0091](0091-coverage-floors.md).
- Governs: the Laravel testing rules (route coverage, policy abilities, security-suite
  completeness, test naming).
