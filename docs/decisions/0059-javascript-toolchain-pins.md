---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# JavaScript toolchain pins: ESLint 9.39, TypeScript below 6.1, Node 22.13 or later, Expo SDK 57

## Context and Problem Statement

The web and mobile gates run on ESLint with typed linting, dependency-cruiser, and Vitest on the
web or jest-expo on mobile, on top of each framework's own lint config. The newest majors of those tools do not work together yet:

- ESLint 10 is current, and 9.x reached end of life on 2026-08-06. But `eslint-config-next` 16.3.6
  and `eslint-config-expo` 57.0.2 crash on ESLint 10 with default settings
  (`contextOrFilename.getFilename is not a function`, from eslint-plugin-react's version
  detection). Setting
  `settings.react.version` avoids that crash, but eslint-plugin-import rules still crash and the
  React plugins' peer ranges exclude ESLint 10. create-next-app and `npx expo lint` both install
  ESLint `^9`.
- typescript-eslint supports TypeScript `>=4.8.4 <6.1.0`. TypeScript 7 has no compiler API yet:
  typescript-eslint refuses to run on it, and dependency-cruiser reports "0 modules cruised" and
  exits 0, so the layer gate passes green on code it never read.
- Vitest 5 requires `@types/node` 22 or later, while create-next-app scaffolds `@types/node ^20`.
- Expo SDK 58 is in beta and changes expo-localization's RTL defaults.

Which versions does the Standard pin so that every gate actually runs?

## Decision Drivers

- A gate that silently checks nothing is worse than no gate.
- Stay on the versions the framework configs and scaffolders support.
- Record every trade-off with a revisit trigger, and watch upstream continuously.

## Considered Options

- Pin to what the framework configs and typed linting support today, with an ESLint 10 canary
- Track the latest majors (ESLint 10, TypeScript 7, the Expo SDK 58 beta)
- Leave versions to each project's scaffolder

## Decision Outcome

Chosen option: "Pin to what the framework configs and typed linting support today, with an ESLint
10 canary", because it is the only option under which every gate runs and fails when it should.

- **ESLint 9.39.x** on the Next.js and Expo tracks. The trade-off (an end-of-life major) is
  recorded here, and an ESLint 10 canary job runs the fixtures on ESLint 10. The shared config's
  peer range is `^9.39 || ^10`; `settings.react.version` is always set; the kit's custom rules use
  only `context.filename` and `context.sourceCode`, which exist on both majors.
- **TypeScript below 6.1:** Next.js projects `~5.9`, Expo projects `~6.0.3` (the SDK 57 pin). The
  official TypeScript 6 side-by-side alias is the path for a project that wants the TypeScript 7
  compiler. The kit's doctor check fails when the resolved `typescript` is 7 or later.
  dependency-cruiser is wrapped to fail when nothing was cruised, or when its summary reports
  errors, because its exit status wraps at 256.
- **Node 22.13 or later** everywhere (`engines` and CI); CI runs on Node 24 plus a 22.x job. The
  floor is the highest minimum among the pinned tools: Expo SDK 57 (and ESLint 10, for the move)
  needs 22.13; Vitest 5, knip and dependency-cruiser need 22.12 or later. `adopt` bumps
  `@types/node` to 22 or later for Vitest 5, or pins Vitest 4.
- **Expo SDK 57** for 1.0. The SDK 58 decision is made when mobile work starts, because it changes
  the RTL defaults ([0082](0082-mobile-rtl-contract.md)). SDK-locked packages move only in
  SDK-upgrade pull requests ([0095](0095-adopter-dependency-updates.md)).

### Consequences

- Good, because the framework configs load and typed rules run on every supported project.
- Good, because a TypeScript 7 upgrade fails the doctor check instead of silently disabling the
  layer gate.
- Bad, because ESLint 9 gets no further fixes; it runs at development time only, and the canary
  shows when the move to 10 is possible.
- Bad, because projects stay one TypeScript major behind the latest release.
- Bad, because Next.js projects need an `@types/node` bump to use Vitest 5.

### Confirmation

- The kit's pin checks, run by `doctor --ci` in each track's `check` chain, compare the resolved
  `eslint`, `typescript` and `@types/node` versions and the `engines` field with these pins. FORCED,
  because they read the installed packages.
- The dependency-cruiser wrapper fails on zero cruised modules; a fixture with TypeScript 7
  installed proves it. FORCED.
- The ESLint 10 canary runs the fixtures on every push to the integration branch as a
  non-required job; it informs the revisit, it does not gate merges. CI also runs a Node 22.x job
  next to Node 24.
- The Renovate template holds back the majors that weaken gates (TypeScript 6.1 and later, ESLint
  10, Jest 30) ([0095](0095-adopter-dependency-updates.md)).

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Pin to what the framework configs and typed linting support today, with an ESLint 10 canary

- Good, because every gate is proven to run.
- Bad, because pins need active upkeep as upstream support lands.

### Track the latest majors (ESLint 10, TypeScript 7, the Expo SDK 58 beta)

- Good, because projects start on current releases.
- Bad, because the framework configs crash, and the layer gate passes on code it never analysed.

### Leave versions to each project's scaffolder

- Good, because there is nothing to maintain.
- Bad, because the first TypeScript 7 upgrade silently disables typed linting and the layer gate.

## More Information

- ESLint support policy: <https://eslint.org/version-support/>; ESLint 10 migration:
  <https://eslint.org/docs/latest/use/migrate-to-10.0.0>.
- typescript-eslint supported versions: <https://typescript-eslint.io/users/dependency-versions>;
  TypeScript 7 announcement and the side-by-side install:
  <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>.
- Vitest migration: <https://vitest.dev/guide/migration>; Node.js release schedule:
  <https://github.com/nodejs/Release>; Expo SDK versions: <https://docs.expo.dev/versions/latest/>
  and the SDK 58 beta: <https://expo.dev/changelog/sdk-58-beta>.
- Revisit triggers: ESLint 10 support in eslint-config-next
  (<https://github.com/vercel/next.js/pull/91710>) and eslint-plugin-react
  (<https://github.com/jsx-eslint/eslint-plugin-react/issues/3977>); TypeScript 7 support in
  typescript-eslint (<https://github.com/typescript-eslint/typescript-eslint/issues/10940>); Expo
  SDK 58 stable.
- Exact versions and the reproductions behind them: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0060](0060-javascript-lint-baseline.md), [0061](0061-own-eslint-plugin-no-commented-code.md),
  [0076](0076-mobile-app-structure.md), [0082](0082-mobile-rtl-contract.md),
  [0095](0095-adopter-dependency-updates.md).
- Governs: the web and mobile toolchain and pin rules, and the doctor checks behind them.
