---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Stack-first: the installed library wins; Standard enforcement tools are pre-exempted

## Context and Problem Statement

Agents write code from what they have seen most, not from what a project installed. Left alone
they hand-write a date formatter next to an installed date library, add a second form library, or
pull in a new HTTP client because it is familiar. Each addition is small; together they leave a
project with two ways to do everything and no rule for which one new code uses. A standard that
itself adds tools (a test runner, static analysis, dead-code and duplication checks) must not break
the same principle it asks adopters to follow.

How does the Standard decide what code uses for a given concern, and how do its own tools fit?

## Decision Drivers

- The project's installed libraries are its decisions; the Standard should not override them.
- New dependencies must be deliberate and recorded.
- Hand-written replacements for library features must be rare and explained.
- The Standard's enforcement tools must be adoptable without contradicting the rule.

## Considered Options

- Stack-first: a declared concern-to-library table, a preference order and pre-exempted enforcement
  tools
- A fixed library set mandated by the Standard
- No rule on libraries

## Decision Outcome

Chosen option: "Stack-first: a declared concern-to-library table, a preference order and
pre-exempted enforcement tools", because it keeps every project's existing choices, makes new
dependencies explicit, and lets the Standard ship its gates without special pleading.

- **The table.** The project records, in the `stack` section of its manifest
  (`.cross-stack/standard.json`, [0023](0023-adopter-manifest-and-upgrade.md)), which installed
  library serves each concern: styling, state, server state, forms, validation, HTTP, i18n, dates,
  test runner, end-to-end tests, icons, charts, auth, environment and logging. A script checks
  that every named package is installed; the manifest schema gains the `stack` section with that
  check.
- **Preference order.** Use the library's idiomatic API first, then its documented escape hatch,
  and write code by hand only when neither can express the need, with a comment naming what the
  library could not do. An outdated library is upgraded rather than worked around.
- **No competitors.** Never add a library that competes with an installed one, test runners
  included. A new runtime dependency lands with a decision record naming the alternatives
  considered ([0001](0001-record-architecture-decisions.md)).
- **Pre-exempted enforcement tools.** The dev tools the Standard ships for its gates (Pest,
  Larastan, dependency-cruiser, knip, jscpd, lefthook, commitlint, gitleaks) are exempt. Pest
  replaces the PHPUnit runner and runs existing PHPUnit test classes unchanged, so it is not a
  second runner ([0036](0036-pest-replaces-phpunit-runner.md)).
- **Agent-oriented dev tools.** Tools such as `laravel/pao` (compact test output for agents) and
  `laravel/pail` (log tailing) are optional, pinned suggestions that `doctor` may print. The
  Standard never requires them and never removes them.
- **Overlapping mechanisms.** When two installed mechanisms already serve one concern, the project
  declares a winner ([0007](0007-one-mechanism-per-concern.md)).

### Consequences

- Good, because the Standard adapts to each project's stack instead of imposing one.
- Good, because every new dependency leaves a record of why it was chosen over the alternatives.
- Good, because hand-written code that bypasses a library must say why, which makes it easy to
  question in review.
- Bad, because the pre-exempted list is a judgement call; adding a tool to it needs its own
  decision record.
- Bad, because "competing" is only partly mechanical: the check knows a curated catalogue of
  library groups, and a library outside it passes.

### Confirmation

Three script gates are planned in the registry: the table check (every named package is installed),
the competing-library check over the curated catalogue, and a check that a pull request adding a
runtime dependency also adds a decision record. They are GUARDED, with their evasions listed, once
they ship; until then these rules are REVIEW ([0002](0002-gates-over-guidelines.md)). The preference
order (idiomatic API, escape hatch, commented hand-written code) is checked in review.

## Pros and Cons of the Options

### Stack-first: a declared concern-to-library table, a preference order and pre-exempted enforcement tools

- Good, because it respects existing decisions and still lets the gates ship.
- Bad, because each project's table must be written and kept current.

### A fixed library set mandated by the Standard

- Good, because every project would look the same.
- Bad, because existing projects would face a migration before any rule helped them.
- Bad, because the Standard would take on every library's release cycle.

### No rule on libraries

- Good, because it costs nothing.
- Bad, because agents keep adding familiar libraries next to installed ones.

## More Information

- Pest runs PHPUnit tests: <https://pestphp.com/docs/writing-tests>; installation into an existing
  project: <https://pestphp.com/docs/installation>.
- The Laravel 13 application skeleton already lists `laravel/pao` and `laravel/pail` in
  `require-dev`: <https://github.com/laravel/laravel/blob/13.x/composer.json>. Observed behaviour is
  recorded in [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0007](0007-one-mechanism-per-concern.md), [0014](0014-working-procedure.md),
  [0023](0023-adopter-manifest-and-upgrade.md) (the manifest field),
  [0036](0036-pest-replaces-phpunit-runner.md).
- Governs: the stack-first rules (the concern table, the preference order, no competing libraries,
  new-dependency records) in every track.
