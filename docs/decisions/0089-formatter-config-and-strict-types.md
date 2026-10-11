---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Formatter configuration is explicit and pinned; PHP declares strict types

## Context and Problem Statement

Pint and Prettier both work with no configuration file. Inside one repository that is defensible,
but a kit installs into many repositories, and implicit defaults hide what is being enforced: a
reader cannot see the style, editors and CI can disagree, and output changes when the tool
changes. Prettier's own installation guide installs an exact version for that reason.

PHP adds a runtime question. Without `declare(strict_types=1)`, PHP silently coerces scalar
arguments (a string `"5"` passed to an `int` parameter), so type declarations only half-protect the
code. The declaration is per file, the stock Laravel 13 skeleton does not add it, and Pest's
`toUseStrictTypes()` fails on the stock `AppServiceProvider` until Pint's `declare_strict_types`
fixer has run. In an existing codebase, adding the declaration changes behaviour: a coercion that
used to succeed becomes a `TypeError`.

What formatter configuration does the kit ship, and how does every PHP file get strict types?

## Decision Drivers

- The enforced style is visible in the repository.
- The same input formats the same way locally, in hooks and in CI.
- Strict types everywhere in new code, without a risky mass rewrite of old code.

## Considered Options

- Explicit, pinned formatter configuration; strict types asserted by a test and added by the
  formatter
- Tool defaults without configuration files
- Strict types in new files only, by convention

## Decision Outcome

Chosen option: "Explicit, pinned formatter configuration; strict types asserted by a test and
added by the formatter", because it shows what is enforced and makes the formatter do the work the
test demands.

- **Pint.** The kit ships `pint.json` with `"preset": "laravel"` plus individually justified rules.
  The one addition is `declare_strict_types`, justified by this ADR. Pint's version comes from the
  Composer lockfile.
- **Prettier.** The JavaScript tracks ship an explicit Prettier configuration that writes out the
  options they rely on, a `.prettierignore`, and Prettier pinned to an exact version.
  `eslint-config-prettier` turns off the stylistic ESLint rules that would fight it
  ([0060](0060-javascript-lint-baseline.md)).
- **Existing configuration.** An explicit configuration already in a project is kept; `adopt` adds
  files only where none exist.
- **Strict types, greenfield.** Every PHP file declares `strict_types=1`. Pint runs once during
  adoption to add the declaration to the skeleton, and keeps new files compliant afterwards.
- **Strict types, brownfield.** No mass rewrite. Unconverted files are dated allowlist entries
  ([0005](0005-explicit-exceptions.md)) that feed the architecture test's ignore list; new files
  must declare strict types from the start, and a file leaves the list when it is converted and its
  tests pass. Pint's fixer is switched on once the list is empty, because before that it would
  rewrite every file at once.
- **Where formatters run.** On the edited file in the PostToolUse hook
  ([0020](0020-feedback-hooks.md)), on staged files in pre-commit
  ([0094](0094-developer-workflow-templates.md)), and as check-chain members `pint --test` and
  `prettier --check .` ([0090](0090-ci-contract.md)). Gates read exit codes only, because Pint
  prints JSON when it detects an agent.

### Consequences

- Good, because the style and its exceptions are readable in two small files.
- Good, because a Prettier or Pint upgrade is a visible dependency change, not a silent reformat.
- Good, because type declarations are enforced at call sites in every converted file.
- Bad, because brownfield projects carry an allowlist until every file is converted.
- Bad, because each new Pint rule needs a written justification.

### Confirmation

- `pint --test` runs in `check` and `check:fast` against the committed `pint.json`. FORCED.
- `prettier --check .` runs as the `format:check` member of each JavaScript track's `check` chain.
  FORCED.
- A Pest architecture test asserts `toUseStrictTypes()` for the `App` and `Database` namespaces,
  with the allowlist-derived ignore list. FORCED. Files outside those namespaces (config, routes,
  bootstrap) are covered by Pint's fixer once it is on.
- The justification of added Pint rules and the explicitness of the Prettier configuration are
  Review; both files are protected gate files ([0021](0021-gate-file-protection.md)).

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Explicit, pinned formatter configuration; strict types asserted by a test and added by the formatter

- Good, because what is enforced is visible, reproducible and self-healing through the formatter.
- Bad, because brownfield adoption needs an exemption list.

### Tool defaults without configuration files

- Good, because there is nothing to maintain, and the defaults are reasonable inside one repository.
- Bad, because a kit's job is to be explicit: readers cannot see the style, and tool upgrades change
  it without a diff to the configuration.

### Strict types in new files only, by convention

- Good, because it avoids any change to old files.
- Bad, because with no test, the convention erodes, and nobody can tell which files are protected.

## More Information

- Laravel Pint, presets and rules: <https://laravel.com/docs/13.x/pint>.
- Prettier installation (exact version) and configuration: <https://prettier.io/docs/install>,
  <https://prettier.io/docs/configuration>; `eslint-config-prettier`:
  <https://github.com/prettier/eslint-config-prettier>.
- PHP strict typing:
  <https://www.php.net/manual/en/language.types.declarations.php#language.types.declarations.strict>.
- Pest architecture testing (`toUseStrictTypes()`): <https://pestphp.com/docs/arch-testing>.
- Versions and the skeleton behaviour: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0020](0020-feedback-hooks.md), [0036](0036-pest-replaces-phpunit-runner.md),
  [0090](0090-ci-contract.md).
- Governs: the PHP and JavaScript formatter rules and the PHP strict-types rule.
