# Laravel track

The `laravel` track covers a Laravel application that serves a JSON API: its layering, validation,
authorization, serialization, jobs, logging and tests. Server-rendered Laravel front ends are not a
track ([ADR 0009](../decisions/0009-tracks-profiles-and-scope.md)).

> **Status in 0.1.0.** 151 rules, all REVIEW. 48 target FORCED, 84 target GUARDED and 19 stay
> REVIEW by design; 46 are Tier 1. Claude follows them through the skill and
> `/cross-stack-standard:audit` reports them. The gates below are planned, not shipped; the
> [roadmap](../../ROADMAP.md) shows when they land. Full list: [Laravel rules](../rules/laravel.md).

## What the planned gates target

| Tool                 | Target                                                                                                       | Decision                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Laravel, PHP, Pest   | Laravel 13 on PHP 8.4 with Pest 5. Pest 4 on PHP 8.3 is a fallback, claimed only while its CI matrix passes. | [0036](../decisions/0036-pest-replaces-phpunit-runner.md)         |
| Larastan and PHPStan | Larastan 3.12 with PHPStan 2.2                                                                               | [0038](../decisions/0038-larastan-levels-shrink-only-baseline.md) |
| Formatter            | Pint, with a committed configuration and strict types                                                        | [0089](../decisions/0089-formatter-config-and-strict-types.md)    |
| Node.js              | 22.13 or later, for the plugin's hooks and the shared checks                                                 | [0059](../decisions/0059-javascript-toolchain-pins.md)            |

Exact versions and their sources are in [verified-versions.md](../maintainers/verified-versions.md).

## The architecture in one paragraph

Routes are versioned and resourceful, and every route goes to a controller action
([ADR 0042](../decisions/0042-api-routing.md)). Input arrives through `Store{Model}Request` and
`Update{Model}Request` FormRequests ([ADR 0044](../decisions/0044-form-request-validation.md)).
Each endpoint is authorized at exactly one site by exactly one policy ability
([ADR 0043](../decisions/0043-single-authorization-site.md)). Controllers stay thin; a service
exists only for a domain rule used outside HTTP, and multi-step writes shared by HTTP and queues are
invokable Actions in `App\Actions`; there are no repositories and no service location
([ADR 0040](../decisions/0040-backend-layering.md), [ADR 0041](../decisions/0041-action-pattern.md)).
Models leave the HTTP layer only through API Resources
([ADR 0045](../decisions/0045-resources-only-serialization.md)), enums are string-backed and travel
as values ([ADR 0046](../decisions/0046-enums-on-the-wire.md)), lists are paginated and capped
([ADR 0049](../decisions/0049-server-driven-collections.md)), and errors are RFC 9457 problem
details ([ADR 0053](../decisions/0053-rfc-9457-problem-details.md)).

## Key rules

| Area             | Rules (target)                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline quality | BE-001 strict types (FORCED), BE-002 Pint (FORCED), BE-003 Larastan (FORCED), BE-005 baseline never grows (GUARDED), BE-098 described ignores (FORCED)                                        |
| Routing          | BE-017 controller actions only (FORCED), SEC-002 GET and HEAD only for reads (GUARDED), SEC-006 rate-limit unauthenticated routes (GUARDED)                                                   |
| Validation       | BE-018 FormRequest on every write (FORCED), BE-019 no inline validation (FORCED), BE-020 request naming (GUARDED)                                                                             |
| Authorization    | SEC-003 real `authorize()` (FORCED), SEC-004 every route resolves to a policy ability (GUARDED), SEC-005 authentication on non-public routes (FORCED), BE-021 one site, one ability (GUARDED) |
| Layering         | BE-029 no service location (GUARDED), BE-032 no repositories (GUARDED), BE-033 Actions are invokable (FORCED), BE-034 no raw SQL in HTTP (FORCED)                                             |
| Serialization    | BE-024 typed controller returns (FORCED), BE-049 Resources only (FORCED), BE-048 no `*_label` fields (GUARDED)                                                                                |
| Models and enums | BE-043 enum casts (GUARDED), BE-044 string-backed enums (FORCED), BE-046 no string comparisons with enum attributes (GUARDED)                                                                 |
| Collections      | BE-054 paginate every index (GUARDED), BE-055 cap `per_page` (GUARDED)                                                                                                                        |
| Jobs             | BE-084 queue mail and notifications (GUARDED), BE-085 pass identifiers (GUARDED), BE-086 retry policy on every job (FORCED)                                                                   |
| Logging          | BE-090 constant messages with context (FORCED), SEC-027 redaction (GUARDED)                                                                                                                   |
| Tests            | BE-011 uncached config (FORCED), BE-013 coverage floor (GUARDED), BE-022 every route tested (GUARDED), BE-107 fail on incomplete and risky tests (GUARDED)                                    |

## Modules on this track

| Module          | Laravel rules | What it adds                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api-contract`  | 6             | One response path (BE-025), the configured success shape without double wrapping (BE-026), one problem-details renderer (BE-027), `scramble:export --fail-on-unknown` in CI (BE-099); client types are generated from it ([ADR 0054](../decisions/0054-generated-api-contract.md)).                                                                    |
| `tenancy`       | 37            | Model-level tenant scoping checked against the migrated schema, failing closed (SEC-015, SEC-016, BE-073), background jobs that pin the tenant or declare cross-tenant access (SEC-020, BE-102), and complete isolation suites (BE-067) ([ADR 0057](../decisions/0057-tenancy-module.md), [ADR 0058](../decisions/0058-background-tenant-context.md)). |
| `i18n`          | 10            | Locale middleware before authentication (I18N-003), translated server messages (I18N-001), recipient locale for mail (I18N-002); see [Internationalization and RTL](../i18n-rtl.md#laravel).                                                                                                                                                           |
| `observability` | 3             | Error tracking and request ids, planned after 1.0 ([ADR 0099](../decisions/0099-observability-module.md)).                                                                                                                                                                                                                                             |

## Planned gate stack

- **Pest architecture tests** in `tests/Unit/ArchTest.php` with the `php`, `security` and `laravel`
  presets and short custom expectations; each test name starts with its rule ID, so the registry
  check can prove it runs. Pest replaces the PHPUnit runner and runs existing PHPUnit classes
  unchanged ([ADR 0036](../decisions/0036-pest-replaces-phpunit-runner.md)).
- **Custom PHPStan rules** for what `arch()` cannot express, such as `crossStack.noBareAuthorizeTrue`,
  `crossStack.requestNamedAfterModel` and `crossStack.noModelSerializationOutsideResource`, and
  **framework-reflection tests** over the resolved middleware stack and the route-to-policy map
  ([ADR 0037](../decisions/0037-phpstan-rules-and-reflection-tests.md)).
- **Larastan levels**: level 8 for new projects, level 6 plus a committed, shrink-only
  `phpstan-baseline.neon` for existing ones, with `reportUnmatchedIgnoredErrors` and an upward
  cadence ([ADR 0038](../decisions/0038-larastan-levels-shrink-only-baseline.md)).
- **A testing floor**: security suites that fail when empty, incomplete or skipped, and a coverage
  floor measured at adoption that only rises ([ADR 0039](../decisions/0039-backend-testing-floor.md),
  [ADR 0091](../decisions/0091-coverage-floors.md)).
- **CI**: Pint, Larastan, Pest with coverage, jscpd for PHP clones, `composer audit` and a pinned
  secret scan, as named steps of one reusable workflow ([ADR 0090](../decisions/0090-ci-contract.md)).

## Working on this track in 0.1.0

- PostToolUse runs Pint on each PHP file Claude edits, when Pint is installed. PHPStan per file is
  off by default because it is slow; turn it on with `hooks.postToolUse.phpstan`.
- The Stop gate runs the `check:fast` Composer script when `composer.json` defines it. A good
  `check:fast` runs Pint in test mode, Larastan and the fast tests.
- Claude cites the rule IDs above as it works; `/cross-stack-standard:audit` reports an existing
  codebase against them.
