---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Larastan levels with a shrink-only baseline

## Context and Problem Statement

Static analysis with Larastan (PHPStan for Laravel) only helps if its level is high enough to
matter, reachable for an existing codebase, and never lowered to make a build pass. PHPStan has
levels 0 to 10: level 6 reports missing type hints, level 7 partially wrong union types, level 8
calls on nullable values. A new project can start high; an existing one often has many findings
at the higher levels. PHPStan's baseline records known errors so that only new ones fail, but a
baseline that anyone can regenerate hides every new error the moment it is rewritten. A common
defect is a documented level that disagrees with the shipped configuration.

What level does the Standard require, and how is it kept from sliding?

## Decision Drivers

- New projects start strict; existing projects can adopt on day one.
- Known debt is visible and only ever shrinks.
- The configured level can be checked mechanically; documentation cannot drift from it.
- No green build by suppressing framework or skeleton code.

## Considered Options

- Level by project type, with a committed, shrink-only baseline and a config floor check
- One high level for every project, with whatever baseline that produces
- A low starting level with a documented ratchet and no baseline

## Decision Outcome

Chosen option: "Level by project type, with a committed, shrink-only baseline and a config floor
check", because it is strict where that is cheap, adoptable where it is not, and mechanically
checked in both cases.

- **Tools.** Larastan 3.12 with PHPStan 2.2.
- **Greenfield.** Level 8 over `app`, `database`, `routes` and `tests`. `config/` is left out: on
  the stock Laravel 13 skeleton with the API scaffolding it reports two errors from level 7 up,
  both in config files the skeleton provides, which a project would otherwise have to suppress.
- **Brownfield.** Level 6 plus `phpstan-baseline.neon`, generated with
  `vendor/bin/phpstan analyse --generate-baseline --allow-empty-baseline` and included from the
  configuration (without the flag, a clean project exits 1 instead of writing an empty baseline).
- **Strict reporting.** `reportUnmatchedIgnoredErrors: true`, so a baseline entry that no longer
  matches fails the run, and `reportIgnoresWithoutComments: true`, so every inline
  `@phpstan-ignore` carries a reason ([0005](0005-explicit-exceptions.md)). The floor check reads
  the effective, merged configuration, so a local override file cannot lower the level or turn
  these parameters off unnoticed.
- **Shrink-only.** The error count is the sum of the baseline's `count` entries (not the number of
  entries) plus inline ignores. CI compares it with the base branch and fails on growth. The
  sanctioned `baseline:update` script regenerates the baseline and fails if the count grew; other
  edits to the baseline are protected ([0021](0021-gate-file-protection.md)).
- **Upward cadence.** The level never drops. Raising it on a cadence (for example one level per
  quarter) is a GUARDED process rule, backed by a script that reports how many errors the next
  level would add.

### Consequences

- Good, because the shipped configuration, not prose, is the source of truth for the level.
- Good, because new code in an existing project is held to level 6 at once, and debt only shrinks.
- Good, because stale baseline entries fail the run, which forces the baseline to follow fixes.
- Bad, because a brownfield project stays at level 6 until someone schedules the next level.
- Bad, because fixing a baselined error also fails the run until the baseline is regenerated
  (PHPStan reports a count lower than recorded), so every fix includes a `baseline:update` run.

### Confirmation

The floor check fails when the effective level is below the floor for the project type, when
either report parameter is off, or when a required path is missing. The baseline growth check runs
in CI against the base branch. Both have violation fixtures ([0004](0004-fail-then-pass.md)). The
upward cadence is GUARDED: the script reports, and the team decides when to raise the level.

## Pros and Cons of the Options

### Level by project type, with a committed, shrink-only baseline and a config floor check

- Good, because every project can adopt it on the first day without lowering its bar later.
- Bad, because it needs a floor check and a growth check in addition to PHPStan itself.

### One high level for every project, with whatever baseline that produces

- Good, because it is simple to state.
- Bad, because an existing project would begin with a very large baseline of nullable and
  union-type findings, which makes the ratchet hard to review.

### A low starting level with a documented ratchet and no baseline

- Good, because it produces no baseline file.
- Bad, because nothing forces progress, and new code is analysed at the lowest level.

## More Information

- PHPStan baseline: <https://phpstan.org/user-guide/baseline>; rule levels:
  <https://phpstan.org/user-guide/rule-levels>; ignoring errors:
  <https://phpstan.org/user-guide/ignoring-errors>; configuration reference:
  <https://phpstan.org/config-reference>.
- Larastan: <https://github.com/larastan/larastan>.
- Pins and skeleton measurements: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0005](0005-explicit-exceptions.md), [0021](0021-gate-file-protection.md),
  [0036](0036-pest-replaces-phpunit-runner.md).
- Governs: the Laravel static-analysis rules (level floor, report parameters, baseline growth,
  described ignores and the level cadence).
