---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Own MIT ESLint plugin; no-commented-code written in-house

## Context and Problem Statement

Several of the Standard's web and mobile rules need checks that no core ESLint rule expresses:
physical-direction utilities inside class strings, client-side pagination helpers, per-locale
field suffixes, inline query keys, session re-verification in Route Handlers, and same-origin
guards on mutations. They need one home, one naming scheme and one test harness, so that the
registry can prove each rule exists ([0003](0003-rule-registry.md)).

Commented-out code is one of those rules. A common defect is a standard that forbids it in prose
and never gates it. The obvious gate is `sonarjs/no-commented-code` from `eslint-plugin-sonarjs`.
But that package's `package.json` says `LGPL-3.0-only`, while the `LICENSE` file shipped in every
release from 3.0.0 (2024-12-02) to the current 4.2.1 is the SONAR Source-Available License v1.0.
It grants rights only for a "Non-competitive Purpose", which excludes, among other things, using
AI technology that is not part of the program to ingest, interpret, analyze or interact with the
data the program provides. The Standard feeds lint output to Claude through its feedback hook
([0020](0020-feedback-hooks.md)), which is exactly that use. This is not legal advice, but an MIT
kit cannot hand those terms to its adopters ([0028](0028-license.md)). The last LGPL releases,
2.0.4 and 1.0.4, accept only ESLint `^8 || ^9`.

Where do the Standard's custom JavaScript rules live, and what gates commented-out code?

## Decision Drivers

- Everything the Standard ships, and everything its gates require, is MIT-compatible and neither
  copyleft nor source-available ([0028](0028-license.md)).
- One namespace for custom rules, each verifiable by ID in the registry.
- Rules keep working on ESLint 9.39 and 10 ([0059](0059-javascript-toolchain-pins.md)).
- Heuristic rules are labelled honestly, with their evasions listed ([0002](0002-gates-over-guidelines.md)).

## Considered Options

- An own MIT ESLint plugin, `cross-stack`, with an in-house `no-commented-code`
- `eslint-plugin-sonarjs` 3.0.0 or later for commented-out code
- `eslint-plugin-sonarjs` pinned to 2.0.4, the last LGPL release
- Core `no-restricted-syntax` selectors only, no plugin

## Decision Outcome

Chosen option: "An own MIT ESLint plugin, `cross-stack`, with an in-house `no-commented-code`",
because it is the only option that keeps the whole gate path under a permissive license while
giving every custom rule a stable, checkable ID.

- **The plugin.** ESLint plugin namespace `cross-stack`, MIT, shipped in the shared ESLint config
  package and vendored to adopters with it in 1.0 ([0017](0017-vendored-gate-packages.md)). Its
  rules include `no-commented-code`, `no-physical-direction`, `no-client-pagination`,
  `bilingual-field`, `no-inline-query-key`, `route-handler-session`, `same-origin-mutations` and
  the token rules such as `no-raw-color`. Rules use only `context.filename` and
  `context.sourceCode`, which exist on both ESLint majors, and read paths and names from rule
  options that the shared config fills from the `rules` section of `.cross-stack/standard.json`
  ([0023](0023-adopter-manifest-and-upgrade.md)).
- **`cross-stack/no-commented-code`.** It reports a comment, or a run of consecutive line
  comments, whose text parses as JavaScript or TypeScript statements and has code shape rather
  than prose shape. Directives (`eslint-…`, `@ts-…`), JSDoc blocks and license headers are
  skipped. It is GUARDED, with its evasions listed below.
- **PHP.** A heuristic custom PHPStan rule in the Laravel package
  ([0037](0037-phpstan-rules-and-reflection-tests.md)) applies the same test to PHP comments. It
  is GUARDED for the same reasons.
- **Proof.** Every custom rule has a clean and a violation fixture ([0004](0004-fail-then-pass.md)),
  a registry entry naming `cross-stack/<rule>` as its gate, and is enabled at error in the
  shipped config for its track.
- **Escapes.** A false positive is reworded, or silenced with a described
  `eslint-disable-next-line` or `@phpstan-ignore` comment ([0005](0005-explicit-exceptions.md)).

### Consequences

- Good, because adopters and agents run every gate without a license question.
- Good, because each custom rule has one ID, one fixture pair and one registry entry, so a rule
  cannot be claimed without shipping.
- Good, because the rules run unchanged on ESLint 9 and 10.
- Bad, because the Standard maintains parsing heuristics that a mature plugin has tuned for years;
  early releases will have more false positives.
- Bad, because every custom rule is code to keep working across ESLint and TypeScript releases.

### Confirmation

- `node scripts/check-registry.mjs` fails when a rule names a `cross-stack/<rule>` gate that the
  plugin does not export, or that the shipped config does not enable, or that has no violation
  fixture. `node scripts/run-fixtures.mjs` runs each rule against its clean fixture (must pass)
  and its violation fixture (must fail and print the rule ID).
- `cross-stack/no-commented-code` and the PHPStan rule are GUARDED. Evasions: commented code
  interleaved with prose lines so that the block no longer parses; a fragment that does not parse
  on its own; code placed inside a JSDoc block, which the rule skips.
- The license of each gate dependency is checked in review when it is added
  ([0006](0006-stack-first.md) requires a decision record for every new dependency).

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### An own MIT ESLint plugin, `cross-stack`, with an in-house `no-commented-code`

- Good, because the license, the rule IDs and the ESLint-version support are under the project's
  control.
- Bad, because the heuristics start untuned.

### `eslint-plugin-sonarjs` 3.0.0 or later for commented-out code

- Good, because its commented-code rule is mature and needs no type information.
- Bad, because its source-available terms restrict exactly how the Standard uses lint output, and
  adopters would inherit them.

### `eslint-plugin-sonarjs` pinned to 2.0.4, the last LGPL release

- Good, because it is LGPL-licensed and has the same rule.
- Bad, because it is frozen, gets no fixes, excludes ESLint 10, and would put a copyleft package
  in the gate path.

### Core `no-restricted-syntax` selectors only, no plugin

- Good, because nothing new has to be maintained.
- Bad, because selectors cannot parse comment text, resolve bindings or read class strings, so
  most of these rules cannot be expressed at all.

## More Information

- ESLint custom rules: <https://eslint.org/docs/latest/extend/custom-rules>; plugins:
  <https://eslint.org/docs/latest/extend/plugins>.
- `eslint-plugin-sonarjs`: <https://www.npmjs.com/package/eslint-plugin-sonarjs>; its license
  history by release is recorded in [verified-versions.md](../maintainers/verified-versions.md).
- PHPStan custom rules: <https://phpstan.org/developing-extensions/rules>.
- Related: [0003](0003-rule-registry.md), [0028](0028-license.md),
  [0060](0060-javascript-lint-baseline.md), [0092](0092-dead-code-and-duplication-gates.md).
- Governs: the commented-out code rules on the web, mobile and Laravel tracks, and the packaging
  and registration of every `cross-stack/*` ESLint rule.
