---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Coverage floors per track: configurable, measured at adoption, ratchet-only

## Context and Problem Statement

A change that adds code without tests passes every lint, type and architecture check. A coverage
floor is the cheapest signal that catches it, but the obvious configurations are weaker than they
look:

- Vitest enforces `coverage.thresholds` only when coverage runs (`vitest run --coverage` or
  `coverage.enabled`); a plain `vitest run` exits 0 below the threshold. By default it also
  measures only the files imported during the run, so a file with no test at all is not counted.
- Jest behaves the same way unless `collectCoverageFrom` names the files to measure.
- Pest's `--coverage --min=<n>` needs a coverage driver (PCOV, or Xdebug 3 in coverage mode);
  without one it exits 1.

A common defect is a standard that asks for tests but has no coverage member in any check chain.
Another is one fixed percentage for every project: unreachable for an existing codebase on the
first day, and too low to matter for a new one.

How does each track enforce a coverage floor that measures what it claims to and never slides?

## Decision Drivers

- A change without tests fails in CI on every track.
- Existing projects adopt without first writing tests; new projects keep the level they start at.
- A floor only ever moves up.
- Code that encodes a security contract is held to a higher floor than the rest.
- The gate runs locally, so its fixtures can prove it ([0004](0004-fail-then-pass.md)).

## Considered Options

- Per-track floors measured at adoption, ratchet-only, with a higher floor for security-contract
  paths
- One fixed percentage for every project
- No coverage gate; rely on the testing floors

## Decision Outcome

Chosen option: "Per-track floors measured at adoption, ratchet-only, with a higher floor for
security-contract paths", because it fails test-less changes from the first day of adoption
without asking an existing project for a number it cannot reach.

- **Laravel.** `test:coverage` runs `pest --coverage --min=<n>` and is a member of the track's
  `check` chain. CI installs PCOV through the setup-php `coverage: pcov` input, which also
  disables Xdebug; Xdebug 3 with `XDEBUG_MODE=coverage` is the documented alternative. With no
  driver the command exits 1, so a missing driver fails instead of skipping.
- **Web.** `vitest run --coverage` with `coverage.provider: "v8"`, an explicit `coverage.include`
  (for example `src/**/*.{ts,tsx}`) with explicit excludes, and `coverage.thresholds` for lines,
  functions, branches and statements. `vitest` and `@vitest/coverage-v8` are pinned to the same
  exact version, which the coverage package's peer range requires.
- **Mobile.** Unit tests run on jest-expo with Jest 29 ([0059](0059-javascript-toolchain-pins.md)):
  `jest --coverage` with `collectCoverageFrom`, so files with no test are counted, and
  `coverageThreshold`.
- **Measured at adoption.** `adopt` runs the coverage command once and writes the measured
  figure, rounded down to a whole percent, as the floor. A stricter floor the project already has
  is kept ([0023](0023-adopter-manifest-and-upgrade.md)). Floors are configurable per track.
- **Ratchet-only.** A floor check reads the effective floors from each tool's configuration and
  fails when one is lower than on the base branch. Raising a floor is an ordinary change.
- **Security-contract paths.** On web and mobile, once a project lists its security-contract paths
  (session handling, redirect and permission guards, client code that mirrors a backend rule),
  per-path thresholds hold them to a higher floor: Vitest glob thresholds, or path and glob keys
  in Jest's `coverageThreshold`. The setting is off until the paths are listed
  ([0068](0068-frontend-testing.md)). Pest's `--min` is one global figure, so on Laravel the
  security contract is held by the mandated suites that fail when empty
  ([0039](0039-backend-testing-floor.md)).
- **Local runs.** Every track has a `test:coverage` script, so the fixture runner can exercise the
  gate and a developer can reproduce a CI failure. The fast Stop gate does not run coverage
  ([0020](0020-feedback-hooks.md)).
- **Label.** GUARDED. The registry lists the evasions: coverage `exclude` settings and
  `phpunit.xml` `<source>` exclusions, coverage-ignore hints in source (`/* v8 ignore … */`,
  `/* istanbul ignore … */`, `@codeCoverageIgnore`), and tests that execute code without
  asserting on it. The coverage configuration is a protected file
  ([0021](0021-gate-file-protection.md)) with a code owner
  ([0094](0094-developer-workflow-templates.md)).

### Consequences

- Good, because untested code lowers the measured figure, and a change that takes it below the
  floor fails the build.
- Good, because the explicit include lists count files that no test imports.
- Good, because each project's floor starts from its own measured value and only rises.
- Bad, because coverage measures execution, not verification; assertion-free tests raise it.
- Bad, because coverage runs are slower, so they stay out of the Stop gate and run in `check`
  and CI.
- Bad, because running the Laravel gate locally needs PCOV or Xdebug installed.

### Confirmation

GUARDED. Each track's coverage gate has a clean fixture and a violation fixture (an untested
source file that drops coverage below the floor) that must fail with the rule ID
([0004](0004-fail-then-pass.md)). The check-chain parity check asserts that the coverage member is
present and that the web chain passes `--coverage` ([0090](0090-ci-contract.md)). The floor check
compares floors with the base branch. Rules enter the registry as REVIEW and take this label when
their gates pass both fixtures.

## Pros and Cons of the Options

### Per-track floors measured at adoption, ratchet-only, with a higher floor for security-contract paths

- Good, because it is adoptable and still strict about new code.
- Bad, because it needs a floor check in addition to each runner's threshold.

### One fixed percentage for every project

- Good, because it is one number to document.
- Bad, because existing projects cannot meet it and new projects can fall far below their real
  level before it fails.

### No coverage gate; rely on the testing floors

- Good, because it avoids a proxy metric.
- Bad, because nothing mechanical notices a pull request that adds code and no tests.

## More Information

- Pest coverage: <https://pestphp.com/docs/test-coverage>; PHPUnit code coverage and ignore
  annotations: <https://docs.phpunit.de/en/13.0/code-coverage.html>; setup-php `coverage` input:
  <https://github.com/shivammathur/setup-php>.
- Vitest coverage: <https://vitest.dev/config/coverage> and <https://vitest.dev/guide/coverage>;
  Jest 29 configuration (`collectCoverageFrom`, `coverageThreshold`):
  <https://jestjs.io/docs/29.7/configuration>.
- Versions and observed exit codes: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0021](0021-gate-file-protection.md), [0039](0039-backend-testing-floor.md),
  [0068](0068-frontend-testing.md), [0090](0090-ci-contract.md).
- Governs: the coverage-floor rules on the laravel, web and mobile tracks, including the higher
  floor for security-contract paths.
