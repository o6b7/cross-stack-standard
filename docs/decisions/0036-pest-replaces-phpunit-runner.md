---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Pest replaces the PHPUnit runner; architecture presets

## Context and Problem Statement

Most Laravel rules of the Standard are structural: no repositories, no service location outside
providers, no debug helpers, naming and placement of classes. They need a gate that runs with the
project's normal test command. One way is a hand-written PHPUnit test that walks classes with
reflection and PHP tokens; every rule is then re-implemented by hand, and weak spots are easy to
miss. Pest ships architecture testing with maintained presets (`php`, `security`, `laravel`,
`strict`, `relaxed`) and short expectations for custom rules. The stock Laravel 13 skeleton uses
PHPUnit, and `laravel new --pest` installs Pest instead.

Stack-first ([0006](0006-stack-first.md)) forbids a second test runner. Is adopting Pest a second
runner, and which parts of Pest does the Standard mandate?

## Decision Drivers

- Structural rules run as ordinary tests, with the project's test command.
- Maintained presets over hand-written reimplementations.
- No second test runner and no rewrite of existing tests.
- Supported PHP versions, with any fallback proven in CI.
- Gates discoverable by rule ID, so the registry can prove they run.

## Considered Options

- Pest as the runner, with the `php`, `security` and `laravel` presets and custom expectations
- A hand-written PHPUnit reflection test as the only architecture gate

## Decision Outcome

Chosen option: "Pest as the runner, with the `php`, `security` and `laravel` presets and custom
expectations", because Pest runs existing PHPUnit test classes unchanged, so it replaces the runner
rather than adding a second one, and its presets cover much of the rule set without custom code.

- **Versions.** Pest `^5` (PHP 8.4 or later, built on PHPUnit 13) is the default. Pest `^4` on
  PHP 8.3 is a fallback, claimed only while its CI matrix (Laravel 12, PHP 8.3, Pest 4) passes.
- **The swap.** `adopt` removes `phpunit/phpunit`, requires `pestphp/pest` and
  `pestphp/pest-plugin-laravel` as dev dependencies and runs `./vendor/bin/pest --init`. Existing
  PHPUnit classes keep running; converting them to Pest syntax is optional.
- **Presets.** `arch()->preset()->php()`, `->security()` and `->laravel()`. Not `strict`: it
  requires final classes and no protected methods everywhere, and fails on the stock skeleton.
  Strict types are enforced with `expect(['App', 'Database'])->toUseStrictTypes()` together with
  Pint's `declare_strict_types` rule ([0089](0089-formatter-config-and-strict-types.md)). The `php` preset
  needs the `intl` extension in CI.
- **Custom expectations.** Rules the presets do not cover become short expectations, for example
  `expect('App')->not->toHaveSuffix('Repository')` or
  `expect(['app', 'resolve'])->not->toBeUsed()->ignoring('App\Providers')`
  ([0040](0040-backend-layering.md)). Rules `arch()` cannot express go to PHPStan rules and
  reflection tests ([0037](0037-phpstan-rules-and-reflection-tests.md)).
- **Location and naming.** Architecture tests live in `tests/Unit/ArchTest.php`. Pest runs only
  files ending in `Test.php` inside a configured test suite, so a file such as `tests/Arch.php` is
  silently skipped. Each test name starts with its rule ID, so the registry check can prove the
  test is discovered.
- **Ignoring list.** Presets scan every non-test namespace, factories and seeders included (for
  example `rand()` in a seeder fails the `security` preset). A documented `->ignoring()` list ships,
  and each entry carries a reason.

### Consequences

- Good, because presets are maintained upstream and custom rules are one line each.
- Good, because adopters keep their PHPUnit tests and one command runs everything.
- Bad, because Pest 5 needs PHP 8.4; PHP 8.3 projects depend on the tested Pest 4 fallback.
- Bad, because an expectation on a namespace that does not exist passes vacuously; only the
  violation fixture proves each rule can fail ([0004](0004-fail-then-pass.md)).
- Bad, because preset contents change with Pest releases; the version is pinned and the fixture
  matrix re-runs on every bump.
- Bad, because without the `strict` preset final classes and strict equality are not enforced;
  the Standard sees no evidence that final-everywhere pays for its ceremony.

### Confirmation

Each rule backed by an architecture test is FORCED or GUARDED in the registry. `check-registry`
proves each Pest gate exists and is discovered (`pest --filter '<RULE-ID>'` must run at least one
test), and the fixture matrix runs clean and violation fixtures on Laravel 13 with PHP 8.4 and
Pest 5 (required) and on Laravel 12 with PHP 8.3 and Pest 4 on pushes to `dev`.

## Pros and Cons of the Options

### Pest as the runner, with the `php`, `security` and `laravel` presets and custom expectations

- Good, because presets, custom expectations and the existing test suite share one runner.
- Bad, because adoption touches `composer.json` in brownfield projects.

### A hand-written PHPUnit reflection test as the only architecture gate

- Good, because it needs no new package.
- Bad, because every rule is re-implemented, including what the presets already provide.
- Bad, because token-based checks are easy to fool; a common defect is a registration check that
  passes on a bare `use` import.

## More Information

- Pest architecture testing and presets: <https://pestphp.com/docs/arch-testing>.
- Installation and migration from PHPUnit: <https://pestphp.com/docs/installation>,
  <https://pestphp.com/docs/migrating-from-phpunit-guide>; support policy:
  <https://pestphp.com/docs/support-policy>.
- Pins, preset contents and discovery behaviour observed with Pest 5.2.1:
  [verified-versions.md](../maintainers/verified-versions.md).
- Architecture tools evaluated separately: [0105](0105-architecture-tool-evaluations.md).
- Related: [0006](0006-stack-first.md), [0037](0037-phpstan-rules-and-reflection-tests.md),
  [0038](0038-larastan-levels-shrink-only-baseline.md), [0039](0039-backend-testing-floor.md).
- Governs: the Laravel architecture rules (presets, custom `arch()` expectations, strict types).
