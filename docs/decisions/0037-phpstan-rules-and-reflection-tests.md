---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Rules arch() cannot express: custom PHPStan rules and framework-reflection tests

## Context and Problem Statement

Pest architecture expectations ([0036](0036-pest-replaces-phpunit-runner.md)) work on structure:
namespaces, suffixes, inheritance, attributes and which functions or classes a file uses. Several
Laravel rules look inside method bodies or at runtime state instead. Whether `authorize()` returns
a bare `true`, whether a controller returns a model instead of a Resource, or whether a query
compares a status column with a string literal are facts about expressions and their types. Whether
a middleware actually runs on an API route is a fact about the resolved route table, not about the
text of `bootstrap/app.php`. Whether every tenant-owned table has a scoped model is a fact about
the migrated schema.

A common defect is a registration gate that passes on a bare `use` import while the middleware is
never registered: a check for the class name in the bootstrap file also passes when the class is
registered on the wrong group, only aliased, removed again or placed in a dead branch.

Which gate kinds does the Standard use for these rules?

## Decision Drivers

- Exact gates where the property is decidable; FORCED only where that is honest.
- Checks against what the framework resolves at runtime, not against source text.
- No vacuous passes: an empty route set or schema must fail, not pass.
- Heuristics stay allowed, but are labelled as such.

## Considered Options

- Custom PHPStan rules for expression-level rules, framework reflection for runtime and schema rules
- Custom `arch()` expectations for everything
- Token or regular-expression scans in a test

## Decision Outcome

Chosen option: "Custom PHPStan rules for expression-level rules, framework reflection for runtime
and schema rules", because each works on the level where the property actually lives: the typed
syntax tree, the resolved application, the migrated database.

- **PHPStan rules.** The Laravel gate package ([0017](0017-vendored-gate-packages.md)) ships custom
  rules, registered in its extension with stable identifiers, for: Store and Update FormRequest
  naming per model ([0044](0044-form-request-validation.md)); no bare `return true` in
  `authorize()` ([0043](0043-single-authorization-site.md)); Resources as the only model-to-JSON
  layer ([0045](0045-resources-only-serialization.md)); no `response()->json()` outside the
  response helper; and no literal status strings in queries. PHPStan resolves types, so such a
  rule can be exact: it is labelled FORCED where no evasion is known, and GUARDED where it depends
  on configuration such as which attributes count as statuses.
- **Framework reflection.** Route coverage and policy abilities are Pest tests that read the
  registered routes ([0039](0039-backend-testing-floor.md)). Middleware checks resolve the HTTP
  kernel first, then merge the global middleware with the middleware gathered for each API route,
  and assert that the required classes are present and correctly ordered. Each of these tests first
  asserts that the route set is not empty.
- **Schema.** Tenancy checks run against the migrated schema: they map tables that carry the
  tenant column to their models and assert the scope ([0057](0057-tenancy-module.md)). Architecture
  presets cannot see the schema.
- **Heuristics.** Checks that guess, such as deriving a model name from a controller name, are
  labelled GUARDED, and their known evasions are listed in the registry.

### Consequences

- Good, because the middleware gate fails for a bare import, the wrong group, an unused alias,
  a removal or a dead branch, and accepts global registration, aliases and class-name strings,
  because it compares resolved class names.
- Good, because expression-level rules are exact and give precise file and line output.
- Bad, because custom PHPStan rules must follow PHPStan's rule API across releases; the version is
  pinned and the fixture matrix runs on each bump.
- Bad, because reflection and schema tests need a bootable application and a migrated test
  database, so they belong to the test suite rather than the fast static checks.
- Bad, because they depend on framework behaviour that can change between Laravel majors; the
  fixture matrix covers Laravel 12 and 13.

### Confirmation

`check-registry` proves each PHPStan gate class exists and is registered under its identifier, and
each Pest gate is discovered by its rule ID. The fixture matrix runs every rule's clean and
violation fixtures ([0004](0004-fail-then-pass.md)); the middleware violations include an
import-only bootstrap file and a registration on the web group.

## Pros and Cons of the Options

### Custom PHPStan rules for expression-level rules, framework reflection for runtime and schema rules

- Good, because each check sees exactly what it needs.
- Bad, because it is more code to maintain than expectations.

### Custom `arch()` expectations for everything

- Good, because it would keep one gate style.
- Bad, because expectations cannot inspect method bodies, runtime middleware stacks or the schema.

### Token or regular-expression scans in a test

- Good, because they are quick to write.
- Bad, because they pass on imports and comments that happen to name a class, and fail on valid
  code that registers it by a string.

## More Information

- Writing PHPStan rules: <https://phpstan.org/developing-extensions/rules>.
- Laravel middleware and authorization: <https://laravel.com/docs/13.x/middleware>,
  <https://laravel.com/docs/13.x/authorization>.
- Related: [0036](0036-pest-replaces-phpunit-runner.md), [0039](0039-backend-testing-floor.md),
  [0043](0043-single-authorization-site.md), [0057](0057-tenancy-module.md).
- Governs: the Laravel request, authorization, serialization and response-helper rules, the
  middleware registration rules, and the schema-reading tenancy rules.
