<!-- Generated copy of docs/rules/. Do not edit; run npm run build:agent-skill. -->

# Web and mobile rules

Rules for both JavaScript client tracks, web and mobile: lint, type-checking, formatting, locale files and client code shared by the two. They apply to a project that has either track and never to the Laravel track.

44 rules: 0 FORCED, 0 GUARDED, 44 REVIEW; 39 awaiting promotion to a gated level. Target levels: 18 FORCED, 21 GUARDED, 5 REVIEW. Back to the [rule index](README.md).

| ID | Title | Tier | Enforcement | Target |
| --- | --- | --- | --- | --- |
| [WEB-011](#web-011) | Read environment variables only through the typed, schema-validated env module | 2 | REVIEW | GUARDED |
| [WEB-012](#web-012) | Never paginate a server page on the client | 2 | REVIEW | GUARDED |
| [WEB-013](#web-013) | Drive lists from the server: send page, filters and sort to the API and render its total | 2 | REVIEW | REVIEW |
| [WEB-021](#web-021) | Write no explicit any, form edit state and view-model bridges included | 1 | REVIEW | FORCED |
| [WEB-022](#web-022) | Lint with the framework preset plus the strict and stylistic type-checked TypeScript configs | 1 | REVIEW | FORCED |
| [WEB-023](#web-023) | Use named exports, and default-export only where the framework requires it | 2 | REVIEW | FORCED |
| [WEB-024](#web-024) | Run the formatter in check mode in every JavaScript check chain | 1 | REVIEW | GUARDED |
| [WEB-025](#web-025) | Cap file length at the configured line limit | 2 | REVIEW | FORCED |
| [WEB-026](#web-026) | Cap the cyclomatic complexity of every function | 2 | REVIEW | FORCED |
| [WEB-027](#web-027) | Commit no commented-out JavaScript or TypeScript code | 2 | REVIEW | GUARDED |
| [WEB-033](#web-033) | Define query keys in per-domain queryOptions() factories, never as inline arrays outside hooks | 2 | REVIEW | GUARDED |
| [WEB-039](#web-039) | Poll live data through the server-state cache; import a realtime client only with a recorded ADR | 2 | REVIEW | GUARDED |
| [WEB-040](#web-040) | Log only through the logger module; no direct console calls | 2 | REVIEW | GUARDED |
| [WEB-050](#web-050) | Cap block nesting depth | 2 | REVIEW | FORCED |
| [WEB-051](#web-051) | Cap function length | 2 | REVIEW | FORCED |
| [WEB-053](#web-053) | Leave no untracked TODO, FIXME, HACK or XXX marker in JavaScript or TypeScript | 2 | REVIEW | GUARDED |
| [MOB-026](#mob-026) | Type-check every JavaScript track in TypeScript strict mode | 1 | REVIEW | GUARDED |
| [MOB-027](#mob-027) | Ban TypeScript suppression comments except a described @ts-expect-error | 1 | REVIEW | FORCED |
| [SEC-058](#sec-058) | Use client permission checks only to hide or disable UI, and authorize every action on the server | 1 | REVIEW | REVIEW |
| [SEC-066](#sec-066) | Import the error-tracking SDK only in the logger module | 2 | REVIEW | FORCED |
| [I18N-013](#i18n-013) | Use logical properties in style objects, never physical left and right | 1 | REVIEW | GUARDED |
| [I18N-014](#i18n-014) | Pair every physical value with its right-to-left counterpart and mirror directional icons | 2 | REVIEW | REVIEW |
| [I18N-016](#i18n-016) | Put user-facing copy in message files, not JSX literals | 1 | REVIEW | GUARDED |
| [I18N-017](#i18n-017) | Write no source literal in a script used only by non-source locales | 2 | REVIEW | FORCED |
| [I18N-019](#i18n-019) | Never render backend \*\_label fields as labels on a client | 1 | REVIEW | GUARDED |
| [I18N-033](#i18n-033) | Give every configured locale the source locale's keys, grouping plural forms by base key | 1 | REVIEW | FORCED |
| [I18N-034](#i18n-034) | Leave no locale value empty or whitespace-only | 1 | REVIEW | FORCED |
| [I18N-035](#i18n-035) | Allow a value identical to the source locale's only for an allowlisted key | 1 | REVIEW | FORCED |
| [I18N-036](#i18n-036) | Use the same placeholders for a key in every locale, parsed with the track's message syntax | 1 | REVIEW | FORCED |
| [I18N-037](#i18n-037) | Read multilingual content only through the localized-field helper, never \*\_&lt;locale> keys | 1 | REVIEW | GUARDED |
| [I18N-038](#i18n-038) | Show a screen's own copy for expected errors, keyed by problem type, with server detail as fallback | 2 | REVIEW | REVIEW |
| [I18N-040](#i18n-040) | Read the browser or device locale only in the language module, and never switch it automatically | 1 | REVIEW | GUARDED |
| [I18N-042](#i18n-042) | Match each locale's plural forms to the categories Intl.PluralRules reports for it | 1 | REVIEW | FORCED |
| [UI-003](#ui-003) | Use design tokens, never raw color literals | 2 | REVIEW | GUARDED |
| [UI-011](#ui-011) | Render loading, error and empty states through the shared state primitives | 2 | REVIEW | REVIEW |
| [PROC-008](#proc-008) | Import a deprecated library only inside its declared legacy paths, so new code uses the winner | 1 | REVIEW | GUARDED |
| [PROC-015](#proc-015) | Never let the ESLint bulk-suppressions file grow | 1 | REVIEW | GUARDED |
| [PROC-016](#proc-016) | Describe the reason in every ESLint disable directive | 1 | REVIEW | FORCED |
| [PROC-025](#proc-025) | Allow inline ESLint exceptions only as eslint-disable-next-line comments | 1 | REVIEW | FORCED |
| [PROC-027](#proc-027) | Never let the dependency-cruiser known-violations baseline grow | 1 | REVIEW | GUARDED |
| [PROC-031](#proc-031) | Name the disabled rules in every ESLint directive and fail unused directives | 1 | REVIEW | GUARDED |
| [PROC-032](#proc-032) | Keep ESLint, TypeScript, @types/node and Node inside the Standard's supported ranges | 1 | REVIEW | FORCED |
| [PROC-033](#proc-033) | Run dependency-cruiser only through the kit wrapper that fails when nothing was cruised | 1 | REVIEW | GUARDED |
| [CI-010](#ci-010) | Run ESLint at zero warnings in every JavaScript check chain | 1 | REVIEW | GUARDED |

## WEB-011

**Read environment variables only through the typed, schema-validated env module.**

The cross-stack/env-module-only rule reports process.env and globalThis.process access, destructuring of process or its env, imports of process and node:process and declarations that alias process outside the env modules and root config files on web and mobile, and each env module validates at load with the installed schema library.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/env-module-only` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-011.envModules` (planned) |
| Decision | [ADR 0069](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0069-typed-env-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-011/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- a computed key built at run time, such as globalThis\[name\]
- process reached through a value passed in from another module
- eval or new Function
- files excluded from linting

## WEB-012

**Never paginate a server page on the client.**

A custom lint rule flags configured client paginator helpers and a table library's client-side pagination model on web and mobile, because paginating one server page on the client silently hides records; the only escape is a described disable comment for data provably complete in memory.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-client-pagination` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-012.clientHelpers` (planned) |
| Decision | [ADR 0049](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0049-server-driven-collections.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-012/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- a paginator helper aliased, wrapped or renamed
- hand-written slicing such as items.slice(page \* size, ...)
- a paginator from a library the rule does not list

## WEB-013

**Drive lists from the server: send page, filters and sort to the API and render its total.**

Web and mobile list screens send page, filters and sort to the API and drive their UI from the server's total, and never filter or sort a server page on the client unless the data is provably complete in memory.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0049](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0049-server-driven-collections.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-021

**Write no explicit any, form edit state and view-model bridges included.**

@typescript-eslint/no-explicit-any from the strict type-checked config fails every explicit any on web and mobile, form edit state and view-model bridges included, while the no-unsafe rules cover implicit any flows.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `@typescript-eslint/no-explicit-any` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-021/` |
| Adoption | Baseline: existing occurrences go into ESLint bulk suppressions (eslint --suppress-all), shrink-only under check-baselines. |

## WEB-022

**Lint with the framework preset plus the strict and stylistic type-checked TypeScript configs.**

A config check resolves the ESLint configuration for a sample source file on each JavaScript track and fails unless marker rules from the framework preset (next or expo), strictTypeChecked and stylisticTypeChecked are at error with the project service enabled.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-eslint-config` / `presets` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-022/` |
| Adoption | Baseline: promote warnings to errors, then record existing errors with ESLint bulk suppressions (eslint --suppress-all), shrink-only under check-baselines. |

## WEB-023

**Use named exports, and default-export only where the framework requires it.**

The core no-restricted-exports rule with every restrictDefaultExports option on bans default exports on web and mobile, and it is turned off only for the files the framework requires to default-export, such as pages, layouts, route files and config files.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `no-restricted-exports` / `restrictDefaultExports` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-023.defaultExportGlobs` (planned) |
| Decision | [ADR 0062](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-023/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

## WEB-024

**Run the formatter in check mode in every JavaScript check chain.**

A sub-check reads package.json and requires the check script of each JavaScript track to run a format:check member that runs Prettier, or the declared formatter, in check mode over the whole project, rejecting a swallowed exit such as || true and a narrowed path or glob, with the lint rules the formatter owns turned off.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `format-check` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-024/` |
| Adoption | Fix first: format the codebase once in a dedicated commit before the member is added. |

Known evasions:

- the formatter's ignore file excludes source paths
- format:check delegates to a wrapper script whose command the sub-check does not follow

## WEB-025

**Cap file length at the configured line limit.**

Core max-lines, counting code lines only with blank lines and comments skipped, fails files above the configured limit, by default 300 lines on web and 250 on mobile.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `max-lines` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-025.maxLines` (planned) |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-025/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

## WEB-026

**Cap the cyclomatic complexity of every function.**

Core complexity fails any function above the configured cyclomatic complexity on web and mobile, as its own rule with its own gate and fixture, separate from nesting depth and function length.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `complexity` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-026.max` (planned) |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-026/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

## WEB-027

**Commit no commented-out JavaScript or TypeScript code.**

The Standard's own MIT rule cross-stack/no-commented-code parses comment bodies and fails comments that hold code on web and mobile, because version control already keeps old code and commented copies rot.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-commented-code` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0061](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0061-own-eslint-plugin-no-commented-code.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-027/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- commented code interleaved with prose lines so the block no longer parses
- a fragment that does not parse as code on its own
- code placed inside a JSDoc block, which the rule skips

## WEB-033

**Define query keys in per-domain queryOptions() factories, never as inline arrays outside hooks.**

A custom lint rule flags array literals passed as queryKey or as the key argument of query-client invalidate, set, get, refetch and cancel calls outside the allowed directories, which default to features/\*/hooks on web and the domain hooks folder on mobile.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-inline-query-key` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-033.allowedPaths` (planned) |
| Decision | [ADR 0064](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0064-query-key-factories-and-url-state.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-033/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- a key array assigned to a variable before it is passed
- a key built by a helper outside the allowed directories
- query-client methods called through an alias or wrapper
- a key defined in the wrong feature's hooks folder

## WEB-039

**Poll live data through the server-state cache; import a realtime client only with a recorded ADR.**

Live surfaces on web and mobile poll through the server-state cache, and a module-boundary lint rule reports static and dynamic imports of realtime client libraries unless the manifest's decisions section references an existing ADR.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/module-boundary` / `realtime-clients` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `decisions.<name>` (planned), `rules.WEB-039.libraries` (planned) |
| Decision | [ADR 0056](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0056-polling-before-push.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-039/` |
| Adoption | Fix first: an existing realtime client needs an ADR referenced from the manifest's decisions section. |

Known evasions:

- the global WebSocket or EventSource, which needs no import
- a realtime library the rule does not list

## WEB-040

**Log only through the logger module; no direct console calls.**

Core no-console plus no-restricted-globals on console, which also catches aliasing through a local binding, fail direct console use on web and mobile everywhere except the logger module.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `no-console` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-040.loggerModule` (planned) |
| Decision | [ADR 0088](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0088-structured-redacted-logging.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-040/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- console reached through a globalThis or window member access

## WEB-050

**Cap block nesting depth.**

Core max-depth fails blocks nested deeper than the configured depth on web and mobile, with a lenient default so existing code mostly passes and the rest starts in bulk suppressions.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `max-depth` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-050.max` (planned) |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-050/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

## WEB-051

**Cap function length.**

Core max-lines-per-function fails functions longer than the configured number of code lines on web and mobile, with a lenient default so existing code mostly passes and the rest starts in bulk suppressions.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `max-lines-per-function` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-051.max` (planned) |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-051/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

## WEB-053

**Leave no untracked TODO, FIXME, HACK or XXX marker in JavaScript or TypeScript.**

The Standard's own cross-stack/no-untracked-todo rule reads every comment on web and mobile, case-insensitively, and fails on a marker without a ticket reference matching the configured pattern, for example TODO(ABC-123):, because core no-warning-comments cannot admit a referenced marker.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-untracked-todo` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-053.ticketPattern` (planned) |
| Decision | [ADR 0093](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0093-todo-policy.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/WEB-053/` |
| Adoption | Baseline: existing untracked markers go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- synonyms outside the marker list, such as TBD or LATER
- a reference that matches the pattern but names no real ticket

## MOB-026

**Type-check every JavaScript track in TypeScript strict mode.**

The resolved compiler options of each web and mobile tsconfig, extends chain included, set strict to true and switch off none of its member flags, the sub-check fails when the typecheck script runs tsc with -p or --project pointing at an unchecked tsconfig, and tsconfig files are gate-protected.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-tsconfig` / `strict` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/MOB-026/` |
| Adoption | Fix first: the Expo and Next.js templates already set strict: true; a project without it fixes the reported tsc errors before the check is enabled. |

Known evasions:

- source files left out of the checked tsconfig's include or files lists
- a typecheck member that calls tsc through a wrapper script the sub-check does not follow

## MOB-027

**Ban TypeScript suppression comments except a described @ts-expect-error.**

@ts-ignore and @ts-nocheck are reported and @ts-expect-error is allowed only with a description, so every silenced type error is visible, explained and flagged once it no longer applies.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `@typescript-eslint/ban-ts-comment` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/MOB-027/` |
| Adoption | Baseline: existing @ts-ignore comments become described @ts-expect-error comments or go into ESLint bulk suppressions, shrink-only. |

## SEC-058

**Use client permission checks only to hide or disable UI, and authorize every action on the server.**

Web and mobile clients may hide or disable controls a user cannot use, but the backend authorizes every action, which reviewers confirm.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 2: Server authority |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0012](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0012-backend-authority.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## SEC-066

**Import the error-tracking SDK only in the logger module.**

With the observability module, the cross-stack/module-boundary rule resolves static, dynamic, require and export-from specifiers and reports the configured SDK packages outside the logger module and the framework instrumentation files.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `cross-stack/module-boundary` / `error-tracking-sdk` |
| Tier | 2 |
| Module | `observability` |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-066.enabled` (planned), `modules.observability.sdkPackages` (planned) |
| Decision | [ADR 0099](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0099-observability-module.md) |
| Since | 1.1.0 |
| Violation fixture | planned — `test/fixtures/client/violations/SEC-066/` |
| Adoption | Opt-in: arrives with the observability module after 1.0 and is turned on through rules.SEC-066.enabled. |

## I18N-013

**Use logical properties in style objects, never physical left and right.**

cross-stack/no-physical-direction reads inline styles, same-file style objects and React Native style sheets and reports physical side properties, shorthands, corner radii and left or right textAlign and float values whenever a configured locale is right-to-left.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-physical-direction` / `styleObjects` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0081](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0081-logical-direction-styling.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-013/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- style objects imported from another module
- keys or values computed at run time

## I18N-014

**Pair every physical value with its right-to-left counterpart and mirror directional icons.**

Where a value must stay physical, the same place carries its right-to-left counterpart (the rtl: variant on the web, a direction check on mobile) and a described disable comment, and elements such as back chevrons or edge slide-ins mirror with the direction.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0081](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0081-logical-direction-styling.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## I18N-016

**Put user-facing copy in message files, not JSX literals.**

react/jsx-no-literals with noStrings and a project allowlist reports JSX text and string attributes in web and mobile components, tests and fixtures excepted, so every visible string passes through the message files that parity checks.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `react/jsx-no-literals` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.i18n.allowedStrings` (planned) |
| Decision | [ADR 0078](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0078-labels-and-multilingual-content.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-016/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- copy held in variables, constants or objects outside JSX
- props excluded by the rule's ignore list

## I18N-017

**Write no source literal in a script used only by non-source locales.**

cross-stack/no-locale-script-literal matches string, template and JSX text literals in JavaScript and TypeScript source, test files excepted, against the Unicode scripts of the configured non-source locales, presentation forms included, so right-to-left and other translated text lives only in message files.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `cross-stack/no-locale-script-literal` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0078](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0078-labels-and-multilingual-content.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-017/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

## I18N-019

**Never render backend \*\_label fields as labels on a client.**

cross-stack/no-label-field-read reports reads of properties ending in \_label through dot access, literal computed keys and destructuring in web and mobile code, so enum and status labels render from the client's message files.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-label-field-read` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0078](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0078-labels-and-multilingual-content.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-019/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- presentation fields named without the \_label suffix
- keys built at run time

## I18N-033

**Give every configured locale the source locale's keys, grouping plural forms by base key.**

The parity checker flattens each locale's message files and compares key sets with the source locale in both directions, grouping plural forms under their base key so a locale with other plural categories is not reported as missing keys.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `i18n-parity` / `keys` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0080](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0080-locale-parity.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-033/` |
| Adoption | Allowlist: dated entries for keys a brownfield locale still lacks. |

## I18N-034

**Leave no locale value empty or whitespace-only.**

The parity checker fails on any message value in any configured locale that is empty after trimming, because an empty string renders blank UI instead of falling back.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `i18n-parity` / `non-empty` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0080](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0080-locale-parity.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-034/` |
| Adoption | Allowlist: dated entries for values a brownfield locale still lacks. |

## I18N-035

**Allow a value identical to the source locale's only for an allowlisted key.**

The parity checker compares each non-source value with the source value after normalizing whitespace and fails on equality unless the key has a dated allowlist entry or matches a configured ignore pattern such as a placeholder-only value.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `i18n-parity` / `untranslated` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales`, `modules.i18n.parityIgnore` (planned) |
| Decision | [ADR 0080](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0080-locale-parity.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-035/` |
| Adoption | Allowlist: dated entries for intentional copies such as brand names and units. |

## I18N-036

**Use the same placeholders for a key in every locale, parsed with the track's message syntax.**

The parity checker parses messages as ICU on the web and as i18next interpolation on mobile, including unescaped, formatted and nesting forms, and compares placeholder names per key, using the union across plural forms and allowing count to be absent from zero, one and two forms.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `i18n-parity` / `placeholders` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0080](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0080-locale-parity.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-036/` |
| Adoption | Allowlist: dated entries for mismatches being fixed in a brownfield locale. |

## I18N-037

**Read multilingual content only through the localized-field helper, never \*\_&lt;locale> keys.**

cross-stack/localized-field-access reports dot, computed-literal, optional-chain and destructuring access to keys ending in \_&lt;locale> for the configured locales outside the helper module, with form and mutation code exempt by override because writes address each locale field on purpose.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/localized-field-access` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales`, `modules.i18n.localizedFieldHelper` (planned) |
| Decision | [ADR 0078](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0078-labels-and-multilingual-content.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-037/` |
| Adoption | Baseline: existing reads go into ESLint bulk suppressions, shrink-only; unrelated names that end in a locale suffix get dated allowlist entries. |

Known evasions:

- keys built at run time, such as template literals
- wrappers that read the locale fields without the helper

## I18N-038

**Show a screen's own copy for expected errors, keyed by problem type, with server detail as fallback.**

For failures a screen expects, clients render their own message-file copy selected by the RFC 9457 problem type and show the server's localized detail only when no local copy exists.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## I18N-040

**Read the browser or device locale only in the language module, and never switch it automatically.**

cross-stack/no-locale-auto-detection reports navigator.language and navigator.languages reads, device-locale getters of the configured localization packages and browser language-detector imports outside the language module, so the URL, the per-app system language or the persisted in-app choice decides the language.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-locale-auto-detection` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.i18n.languageModule` (planned), `modules.i18n.deviceLocalePackages` (planned) |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-040/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- server code reading the Accept-Language request header
- detection libraries outside the configured catalogue
- computed or globalThis access to navigator

## I18N-042

**Match each locale's plural forms to the categories Intl.PluralRules reports for it.**

The parity checker groups plural keys by base key and requires each locale's categories to equal new Intl.PluralRules(locale).resolvedOptions().pluralCategories, applying the same comparison to ICU plural selectors on the web, so correct Arabic plurals pass and missing forms fail.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `i18n-parity` / `plurals` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0080](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0080-locale-parity.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/I18N-042/` |
| Adoption | Allowlist: dated entries for plural keys being completed in a brownfield locale. |

## UI-003

**Use design tokens, never raw color literals.**

Class strings, style objects, SVG props and string literals in web and mobile source name colors only through design tokens, with no hex, rgb(), hsl(), oklch(), color() or named color values outside the configured token source.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-raw-color` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.UI-003.tokenSources` (planned) |
| Decision | [ADR 0066](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0066-design-tokens.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/UI-003/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a color assembled from string fragments at run time
- a numeric color such as 0xffffff
- a raw color in a CSS file outside the token source, which ESLint does not lint

## UI-011

**Render loading, error and empty states through the shared state primitives.**

Web and mobile screens show loading, error and empty states through the shared skeleton, error-state and empty-state primitives rather than hand-rolled per-page blocks, so request states look and behave the same everywhere.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0065](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0065-ui-primitives-and-request-states.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review as screens are touched. |

## PROC-008

**Import a deprecated library only inside its declared legacy paths, so new code uses the winner.**

In web and mobile source, a static, dynamic, require or export-from import of a package declared deprecated for a concern is reported outside that concern's declared legacy paths, so the migration to the winner only moves forward.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/module-boundary` / `deprecated-library` |
| Tier | 1 — invariant 1: Stack-first |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `stack.<concern>.deprecated`, `stack.<concern>.legacyPaths` (planned) |
| Decision | [ADR 0007](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0007-one-mechanism-per-concern.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/PROC-008/` |
| Adoption | Baseline: the deprecated library's current import sites are declared as its legacy paths, so only new imports fail. |

Known evasions:

- a module inside the declared legacy paths that re-exports the deprecated library to new code

## PROC-015

**Never let the ESLint bulk-suppressions file grow.**

No file and rule pair in the committed ESLint bulk-suppressions file gains suppressions and no new pair appears compared with the base branch in pull-request CI, and every lint script uses the committed suppressions file rather than --suppressions-location elsewhere, so recorded lint debt only shrinks.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-baselines` / `eslint-suppressions` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0005](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/PROC-015/` |
| Adoption | Baseline: adopt sets the kit rules to error before running eslint --suppress-all, so existing violations become the starting suppressions and no warning is left outside the baseline. |

Known evasions:

- a change pushed without a pull request, where no base-branch comparison runs
- ESLint run outside the checked scripts with another suppressions location

## PROC-016

**Describe the reason in every ESLint disable directive.**

Every eslint-disable, eslint-disable-line and eslint-disable-next-line comment ends with a -- description giving its reason, so each inline exception explains itself in review.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `@eslint-community/eslint-comments/require-description` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0005](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/PROC-016/` |
| Adoption | Baseline: existing directives without a description go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

## PROC-025

**Allow inline ESLint exceptions only as eslint-disable-next-line comments.**

The eslint-comments no-use rule allows only eslint-disable-next-line directives, so file-wide, block and same-line disables and inline rule configuration fail lint; PROC-031 covers naming the disabled rules and unused directives.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `@eslint-community/eslint-comments/no-use` / `eslint-disable-next-line` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0005](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/PROC-025/` |
| Adoption | Baseline: existing block and same-line disables go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

## PROC-027

**Never let the dependency-cruiser known-violations baseline grow.**

The committed dependency-cruiser known-violations file gains no entry compared with the base branch in pull-request CI, and every depcruise invocation in the check scripts reads that file through --ignore-known, so a fixed violation stays fixed and a new one cannot be recorded as known.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-baselines` / `depcruise` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0005](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/PROC-027/` |
| Adoption | Baseline: adopt writes the current violations to the known-violations file, which becomes the starting point that can only shrink. |

Known evasions:

- a change pushed without a pull request, where no base-branch comparison runs
- dependency-cruiser run outside the checked scripts with another known-violations file

## PROC-031

**Name the disabled rules in every ESLint directive and fail unused directives.**

A config check resolves the ESLint configuration for a sample file on each JavaScript track and fails unless @eslint-community/eslint-comments/no-unlimited-disable is at error and linterOptions.reportUnusedDisableDirectives is "error", so a directive names its rules and a stale one fails lint.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-eslint-config` / `disable-directives` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0005](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/PROC-031/` |
| Adoption | Nothing needed: adopt removes unused directives with eslint --fix and records existing unlimited disables as ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a later config object that turns either setting off for files outside the sample files the check resolves

## PROC-032

**Keep ESLint, TypeScript, @types/node and Node inside the Standard's supported ranges.**

The kit's doctor check, run in each JavaScript track's check chain, reads the resolved eslint, typescript and @types/node versions and the engines field and fails outside the supported ranges, such as TypeScript 7 or later, under which typed lint rules and dependency-cruiser stop checking without failing.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `doctor` / `toolchain-pins` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0059](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0059-javascript-toolchain-pins.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/PROC-032/` |
| Adoption | Fix first: a project outside the ranges pins the supported versions, which adopt proposes, before the check is enabled. |

## PROC-033

**Run dependency-cruiser only through the kit wrapper that fails when nothing was cruised.**

The kit's check-depcruise wrapper runs dependency-cruiser with JSON output and fails when summary.totalCruised is 0 or summary.error is above 0, because an unsupported TypeScript version or a wrong path makes dependency-cruiser pass silently and its exit status wraps at 256.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-depcruise` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0059](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0059-javascript-toolchain-pins.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/PROC-033/` |
| Adoption | Nothing needed: adopt points the boundaries member of each JavaScript check chain at the wrapper. |

Known evasions:

- a check member that calls depcruise directly instead of through the wrapper

## CI-010

**Run ESLint at zero warnings in every JavaScript check chain.**

A token check requires every ESLint invocation in the JavaScript check scripts to pass --max-warnings=0 and the mobile chain to call ESLint directly rather than expo lint, so warnings cannot pile up unseen.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `lint-zero-warnings` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0060](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/client/violations/CI-010/` |
| Adoption | Baseline: bulk suppressions record errors, not warnings, so adopt sets the kit's rules to error before recording existing findings in the shrink-only suppressions file. |

Known evasions:

- ESLint called through a wrapper script or binary name the token check does not recognise
- a warning-level rule switched off in the project config instead of fixed
