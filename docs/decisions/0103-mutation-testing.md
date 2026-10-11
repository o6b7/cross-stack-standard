---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Mutation testing on domain logic with Pest

## Context and Problem Statement

Coverage floors ([0091](0091-coverage-floors.md)) show which lines ran during the tests, not
whether any test would notice if those lines were wrong. A common defect is a test that calls a
domain service and asserts only that no exception was thrown: the service is fully covered, and a
flipped comparison or a removed guard still passes. Domain rules (state machines, pricing,
scoring, derived values) are where such a gap costs the most.

Pest 5 includes mutation testing: `pest --mutate` changes the code under test in small ways (for
example, a flipped operator or a removed statement) and reports each mutation no test caught. It
accepts `--parallel`, `--min=<score>` and `--class=<namespace>`, and needs Xdebug 3 or PCOV; without
a coverage driver it exits 1 ("Mutation testing requires code coverage to be enabled."). Tests
declare which code they target with `covers()` or `mutates()`; alternatively
`--everything --covered-only` mutates everything covered. A line can be excluded with an inline
`@pest-mutate-ignore` comment.

Should the Standard measure test strength on domain logic, and at what cost to pull requests?

## Decision Drivers

- Test strength matters most where business rules live ([0040](0040-backend-layering.md),
  [0041](0041-action-pattern.md)).
- No new tool: Pest is already the runner ([0036](0036-pest-replaces-phpunit-runner.md)).
- Mutation runs are slow; pull-request feedback must stay fast.
- A floor starts from the measured state and only rises.

## Considered Options

- Pest mutation testing scoped to domain namespaces, scheduled or label-triggered, with a minimum
  score
- Mutation testing of the whole application on every pull request
- A separate mutation framework
- Coverage floors only

## Decision Outcome

Chosen option: "Pest mutation testing scoped to domain namespaces, scheduled or label-triggered,
with a minimum score", because it reuses the installed runner and spends mutation time only where a
missed mutation means a wrong business rule.

- **Command.** `./vendor/bin/pest --mutate --parallel --class=<domain namespace> --min=<score>` in a
  CI job with PCOV (`shivammathur/setup-php` with `coverage: pcov`). The domain namespaces are the
  Action namespace and the configured domain-service namespaces, declared as this rule's options
  in the manifest's `rules` section ([0023](0023-adopter-manifest-and-upgrade.md)).
- **Targeting.** Tests of domain classes declare `covers()` or `mutates()`. Pest mutates only code
  that tests declare this way (short of `--everything`), so an undeclared domain class would go
  unmeasured without any error; the declaration check below closes that gap.
- **Score.** Configurable per project. The template's example is 60; `adopt` measures the current
  score and writes it as the floor, which may only rise, as coverage floors do
  ([0091](0091-coverage-floors.md)).
- **When it runs.** On a schedule and on a pull-request label, as a non-required job
  ([0090](0090-ci-contract.md)); not on every pull request.
- **Exclusions.** Every `@pest-mutate-ignore` has a comment next to it saying why the mutation
  cannot matter.

### Consequences

- Good, because weak domain tests show up as surviving mutations with file and line.
- Good, because no dependency is added; mutation testing ships with Pest 5.
- Bad, because a regression in test strength surfaces after merge, on the next scheduled or
  labelled run.
- Bad, because domain tests carry `covers()` or `mutates()` declarations that must follow renames.
- Bad, because PHP 8.3 projects on the Pest 4 fallback are covered only once the template is
  proven on that line.

### Confirmation

- Fail-then-pass fixtures ([0004](0004-fail-then-pass.md)): a domain class with a strong test
  passes the minimum score; the same class with an assertion-free test fails it.
- The floor is ratchet-only: the baseline check fails when it drops below the base branch's value.
- Domain tests declaring `covers()` or `mutates()`: a script check that every test file in the
  configured domain test directories calls one of them. GUARDED, because a test can declare a
  target it does not exercise, and a domain test placed elsewhere is not checked.
- Reasons next to ignore markers: Review.

## Pros and Cons of the Options

### Pest mutation testing scoped to domain namespaces, scheduled or label-triggered, with a minimum score

- Good, because it reuses Pest and its coverage driver setup.
- Bad, because feedback is delayed.

### Mutation testing of the whole application on every pull request

- Good, because every change is checked immediately.
- Bad, because runtime grows with every mutation across controllers, resources and glue code,
  where a surviving mutation rarely matters.

### A separate mutation framework

- Good, because a dedicated framework such as Infection offers more mutators and report
  formats.
- Bad, because it adds a second tool for the same concern ([0007](0007-one-mechanism-per-concern.md)),
  configured beside the runner.

### Coverage floors only

- Good, because they are already in place.
- Bad, because covered code with meaningless assertions passes.

## More Information

- Pest mutation testing: <https://pestphp.com/docs/mutation-testing>; Infection:
  <https://infection.github.io/>; coverage drivers:
  <https://pestphp.com/docs/test-coverage>; setup-php coverage input:
  <https://github.com/shivammathur/setup-php>.
- Flags, driver behaviour and pins observed with Pest 5.2.1:
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0036](0036-pest-replaces-phpunit-runner.md), [0091](0091-coverage-floors.md),
  [0039](0039-backend-testing-floor.md), [0040](0040-backend-layering.md).
- Governs: the Laravel test-strength rules.
- Becomes accepted when the template ships and its fixtures pass; until then it is on the roadmap.
