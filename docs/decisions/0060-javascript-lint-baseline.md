---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# JavaScript lint baseline: strict type-checked rules, formatter check, size and complexity limits, accessibility as errors

## Context and Problem Statement

Each framework ships a lint preset: `eslint-config-next` (native flat exports `core-web-vitals`
and `typescript`) and `eslint-config-expo/flat`. Neither is strict on its own.
`eslint-config-expo` 57.0.2 has no type-aware linting and no `no-explicit-any`, and several of its
rules are warnings. `eslint-config-next` registers the jsx-a11y plugin but enables only 6 of its
rules. Unchecked formatting, unbounded file size and warnings that never fail a build let quality
drift in ways review does not catch reliably, and the two JavaScript tracks drift apart when each
is configured separately.

What is the common lint baseline for the web and mobile tracks?

## Decision Drivers

- One baseline for both JavaScript tracks, with only framework-specific differences.
- Type-aware rules catch what syntax rules cannot (`any` flows, floating promises).
- A warning that never fails is noise; linters run at zero warnings.
- Accessibility defects on the web are errors, not suggestions.
- Build on the framework presets instead of replacing them ([0006](0006-stack-first.md)).

## Considered Options

- Framework preset plus typescript-eslint strict and stylistic type-checked configs, with zero
  warnings
- The framework preset alone
- typescript-eslint `recommended` (not strict), warnings tolerated
- Another linter in place of ESLint

## Decision Outcome

Chosen option: "Framework preset plus typescript-eslint strict and stylistic type-checked configs,
with zero warnings", because it keeps each framework's rules and adds the checks both presets
lack, identically on both tracks.

- **Presets.** The framework preset (`eslint-config-next` or `eslint-config-expo/flat`) plus
  typescript-eslint `strictTypeChecked` and `stylisticTypeChecked`, with
  `parserOptions.projectService`. On mobile the typed configs are scoped to TypeScript files,
  because the Expo tsconfig includes only `**/*.ts(x)`. `no-explicit-any` (from
  `strictTypeChecked`) applies on both tracks.
- **Zero warnings.** Every ESLint invocation in the check chain passes `--max-warnings=0`.
- **Formatter.** `prettier --check` (`format:check`) is a member of every JavaScript check chain,
  and `eslint-config-prettier/flat` turns off the lint rules the formatter owns.
- **Size and complexity.** `max-lines` (about 300 on web and 250 on mobile, skipping blank lines and
  comments), `complexity`, `max-depth` and `max-lines-per-function` are separate, configurable
  rules, each with its own gate identity.
- **Accessibility.** On the web track, the jsx-a11y `recommended` rules are promoted to error,
  reusing the plugin instance the framework config registers; ESLint rejects a second, different
  plugin object under the same name.
- **Suppressions.** TypeScript suppression comments are banned except `@ts-expect-error` with a
  description (`@typescript-eslint/ban-ts-comment`, as configured by `strictTypeChecked`).
  ESLint disables follow [0005](0005-explicit-exceptions.md). TypeScript `strict` mode is on.
- **Mobile gate.** The lint gate is `eslint . --max-warnings=0`, never `expo lint`: `expo lint`
  lints only `src`, `app` and `components` by default, and writes its own config when it does not
  find an `eslint.config.{js,mjs,cjs}`.

### Consequences

- Good, because both tracks enforce the same rules, and a rule change lands on both.
- Good, because `any`, floating promises and unchecked accessibility defects fail the build.
- Bad, because `strictTypeChecked` on an existing codebase reports many errors at once; adoption
  records them as ESLint bulk suppressions that may only shrink ([0005](0005-explicit-exceptions.md)).
- Bad, because typed linting is slower than syntax-only linting, which the per-file feedback hook
  must budget for ([0020](0020-feedback-hooks.md)).
- Bad, because size and complexity limits are proxies; a justified exception needs a described
  disable comment.

### Confirmation

- A check computes the resolved config for a sample source file (ESLint's
  `calculateConfigForFile`) and asserts that marker rules from the framework preset, from the
  strict and stylistic type-checked configs, and every jsx-a11y `recommended` rule (web) are at
  error. FORCED, because it reads the real configuration.
- `format:check` is a mandatory member of each track's `check` script. The sub-check that the
  script lists it reads `package.json` exactly: FORCED. That CI runs the member is verified by the
  CI-parity check ([0090](0090-ci-contract.md)): GUARDED, because a step can run a different
  command under a member's name.
- `max-lines`, `complexity`, `max-depth`, `max-lines-per-function` and `ban-ts-comment` each fail
  their own violation fixture. FORCED.
- A token check asserts that every ESLint invocation in the check scripts carries
  `--max-warnings=0`, and that the mobile chain does not call `expo lint`. GUARDED, because a
  script can call ESLint indirectly.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Framework preset plus typescript-eslint strict and stylistic type-checked configs, with zero warnings

- Good, because it adds exactly what the presets lack, and keeps them.
- Bad, because it is the slowest and noisiest option on brownfield code.

### The framework preset alone

- Good, because it needs no configuration.
- Bad, because mobile gets no `no-explicit-any` and web gets 6 accessibility rules, and warnings
  pass.

### typescript-eslint `recommended` (not strict), warnings tolerated

- Good, because it is gentler to adopt.
- Bad, because warnings accumulate unseen, and the `any` escape stays open.

### Another linter in place of ESLint

- Good, because some alternatives are much faster.
- Bad, because the Standard's own rules are ESLint rules
  ([0061](0061-own-eslint-plugin-no-commented-code.md)), and the framework presets are ESLint
  configs.

## More Information

- typescript-eslint shared configs: <https://typescript-eslint.io/users/configs>; typed linting:
  <https://typescript-eslint.io/getting-started/typed-linting>; `ban-ts-comment`:
  <https://typescript-eslint.io/rules/ban-ts-comment>.
- Next.js ESLint config: <https://nextjs.org/docs/app/api-reference/config/eslint>; Expo:
  <https://docs.expo.dev/guides/using-eslint/> and `expo lint`:
  <https://docs.expo.dev/more/expo-cli/#lint>.
- ESLint core rules (`max-lines`, `complexity`, `max-depth`, `max-lines-per-function`):
  <https://eslint.org/docs/latest/rules/>; Prettier CLI: <https://prettier.io/docs/cli>;
  eslint-plugin-jsx-a11y: <https://github.com/jsx-eslint/eslint-plugin-jsx-a11y>.
- Preset contents and versions are recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0005](0005-explicit-exceptions.md), [0059](0059-javascript-toolchain-pins.md),
  [0061](0061-own-eslint-plugin-no-commented-code.md).
- Governs: the web and mobile lint-baseline rules (presets, formatter, size and complexity,
  accessibility, suppressions) and the shared zero-warnings rule.
