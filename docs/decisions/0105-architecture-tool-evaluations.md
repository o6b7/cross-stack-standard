---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Evaluations: Deptrac, React Compiler and eslint-plugin-boundaries

## Context and Problem Statement

Three tools overlap with gates the Standard already runs, and each could improve them:

- **Deptrac** (`deptrac/deptrac` 4.7.2, MIT, PHP 8.2 or later, built on PHPStan 2, the same major
  Larastan 3 uses; the older `qossmic/deptrac` package is abandoned in its favour) declares layers
  and their allowed dependencies in one configuration file. Laravel layering is currently enforced
  by Pest architecture expectations ([0036](0036-pest-replaces-phpunit-runner.md)) and custom
  PHPStan rules ([0037](0037-phpstan-rules-and-reflection-tests.md)).
- **eslint-plugin-boundaries** (7.2.0, MIT) checks element-to-element imports inside ESLint. Its
  canonical rule is `boundaries/dependencies`; `element-types` is now a deprecated alias of it.
  TypeScript path aliases need `eslint-import-resolver-typescript`. Web layering is currently split
  by what each tool can express: dependency-cruiser for graph rules, ESLint for per-file rules
  ([0062](0062-frontend-layer-boundaries.md)). Running in ESLint would bring boundary feedback into
  the editor and the per-file lint hook ([0020](0020-feedback-hooks.md)).
- **React Compiler** memoizes components at build time. Expo's default template has enabled it
  since SDK 54 (`experiments.reactCompiler: true`, with Babel configured by `babel-preset-expo`),
  and `eslint-config-expo` includes the compiler lint rules of `eslint-plugin-react-hooks` 7.
  Next.js 16 made `reactCompiler: true` stable but not enabled by default; it needs
  `babel-plugin-react-compiler`, and `create-next-app` asks for it with `--react-compiler`,
  defaulting to no. A component opts out with the `"use no memo"` directive.

A common defect is adding such a tool beside the existing gate, so one rule is enforced twice,
the copies drift, and every violation is reported twice. How does the Standard decide on these
tools?

## Decision Drivers

- One declared mechanism per concern ([0007](0007-one-mechanism-per-concern.md)); a new tool
  replaces a gate or is rejected, never added next to it.
- A replacement proves itself on the existing clean and violation fixtures first
  ([0004](0004-fail-then-pass.md)).
- Enforcement tools are exempt from stack-first ([0006](0006-stack-first.md)), but each is still a
  pinned dependency to maintain ([0059](0059-javascript-toolchain-pins.md)).
- Decisions rest on a pilot on real code, not on feature lists.

## Considered Options

- Time-boxed evaluations against stated criteria, each ending in its own ADR
- Adopt all three now
- Reject all three without evaluation

## Decision Outcome

Chosen option: "Time-boxed evaluations against stated criteria, each ending in its own ADR", because
each tool may be better than the gate it would replace, and only a pilot on the fixtures and a real
codebase can show it.

- **Deptrac.** Criteria: expresses every Laravel layer rule now held in Pest expectations and
  PHPStan rules, passes and fails the same fixtures, reports file and line, supports a
  shrink-only baseline for existing code, and runs in comparable time on the smoke app. If it
  wins, it takes over the layer rules only; the Pest `php`, `security` and `laravel` presets stay.
- **eslint-plugin-boundaries.** Criteria: can express the same-feature comparison and the feature
  surface rules that now need dependency-cruiser back-references, resolves aliased imports, and
  keeps lint time acceptable with typed linting. Rules it cannot express, such as cycle detection,
  stay in dependency-cruiser. A rule moves as a whole, with its fixtures, or not at all.
- **React Compiler.** Mobile: the Standard does not turn off what the Expo template enables; each
  `"use no memo"` carries a comment saying why, checked in review. Web: stays opt-in. The pilot
  enables the compiler in one Next.js app, starting with `compilationMode: 'annotation'` (only
  components marked `"use memo"`) before `reactCompiler: true`, and compares build time, test
  results and bundle size ([0102](0102-web-performance-budgets.md)). Enabling the react-hooks 7
  compiler lint rules is evaluated separately, since they work without the compiler.
- **Outcome.** Each evaluation ends in its own ADR, accepted or rejected, linked from here. Until
  then the current gates stay exactly as they are.

### Consequences

- Good, because no rule is ever enforced by two tools at once.
- Good, because each outcome is recorded with the evidence behind it.
- Bad, because improvements such as editor-time boundary feedback wait for an evaluation.
- Bad, because a successful evaluation means migrating rules and fixtures, not only adding a
  dependency.

### Confirmation

- The registry holds exactly one `gate` per rule ([0003](0003-rule-registry.md)), so a migrated
  rule changes its gate rather than gaining a second one; `check-registry` and the fixture matrix
  prove the new gate before the old one is removed.
- Following the evaluation criteria and recording the outcome ADR: Review.

## Pros and Cons of the Options

### Time-boxed evaluations against stated criteria, each ending in its own ADR

- Good, because each decision is made on evidence from the Standard's own fixtures.
- Bad, because the evaluations take maintainer time after 1.0.

### Adopt all three now

- Good, because users get the tools' benefits immediately.
- Bad, because every layer rule would run in two tools until someone removes one copy.

### Reject all three without evaluation

- Good, because nothing changes.
- Bad, because better gates could be missed, and the Expo template's compiler default would be
  left undocumented.

## More Information

- Deptrac: <https://github.com/deptrac/deptrac>.
- eslint-plugin-boundaries rules: <https://www.jsboundaries.dev/docs/rules/>; TypeScript support:
  <https://www.jsboundaries.dev/docs/guides/typescript-support/>.
- React Compiler: <https://react.dev/learn/react-compiler>; in Expo:
  <https://docs.expo.dev/guides/react-compiler/>; in Next.js:
  <https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler>.
- Versions and observed behaviour: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0036](0036-pest-replaces-phpunit-runner.md), [0059](0059-javascript-toolchain-pins.md),
  [0062](0062-frontend-layer-boundaries.md), [0037](0037-phpstan-rules-and-reflection-tests.md),
  [0076](0076-mobile-app-structure.md).
- Governs: no rule yet; the outcome ADRs govern the Laravel and web layering rules and the React
  Compiler settings they change.
