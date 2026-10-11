<!-- Generated from registry/rules.json — do not edit. Regenerate: node scripts/generate-rule-docs.mjs -->

# Mobile rules

Rules for the mobile track (Expo and React Native).

52 rules: 0 FORCED, 0 GUARDED, 52 REVIEW; 45 awaiting promotion to a gated level. Target levels: 13 FORCED, 32 GUARDED, 7 REVIEW. Back to the [rule index](README.md).

| ID | Title | Tier | Enforcement | Target |
| --- | --- | --- | --- | --- |
| [MOB-001](#mob-001) | Keep top-level source folders within the configured folder contract | 2 | REVIEW | FORCED |
| [MOB-002](#mob-002) | Default-export the screen or layout from every route file | 2 | REVIEW | FORCED |
| [MOB-003](#mob-003) | Create React contexts only inside the contexts folder | 2 | REVIEW | FORCED |
| [MOB-004](#mob-004) | Keep only .ts files, never .tsx, in the utils, constants and types folders | 2 | REVIEW | FORCED |
| [MOB-005](#mob-005) | Define hooks only in the hooks and contexts folders | 2 | REVIEW | GUARDED |
| [MOB-006](#mob-006) | Keep the types folder free of runtime code | 2 | REVIEW | FORCED |
| [MOB-007](#mob-007) | Place domain hooks and components in per-domain subfolders, with only cross-cutting ones at the root | 2 | REVIEW | GUARDED |
| [MOB-008](#mob-008) | Import no server-state library in route files | 2 | REVIEW | FORCED |
| [MOB-009](#mob-009) | Consume contexts only through their exported provider hook, which throws outside the provider | 2 | REVIEW | GUARDED |
| [MOB-010](#mob-010) | Keep tracked file names identical in case to the files on disk | 2 | REVIEW | FORCED |
| [MOB-011](#mob-011) | Import through the root path alias; no parent-relative imports | 2 | REVIEW | FORCED |
| [MOB-012](#mob-012) | Keep list page, filters and sort in navigation params and forward them to the API | 2 | REVIEW | REVIEW |
| [MOB-013](#mob-013) | Keep server data only in the server-state cache: API access flows through query hooks | 2 | REVIEW | GUARDED |
| [MOB-014](#mob-014) | Create exactly one query client, in the query provider module | 2 | REVIEW | FORCED |
| [MOB-015](#mob-015) | Show mutation feedback once, from the central mutation cache; opt out only with silent meta | 2 | REVIEW | GUARDED |
| [MOB-016](#mob-016) | Normalize API failures in one module; screens never read raw HTTP statuses or bodies | 2 | REVIEW | GUARDED |
| [MOB-017](#mob-017) | Map every error response to a typed app-error kind per the configured format and statuses | 2 | REVIEW | GUARDED |
| [MOB-018](#mob-018) | Unwrap API responses in one typed function inside the API client; no .data.data downstream | 2 | REVIEW | GUARDED |
| [MOB-019](#mob-019) | Take backend resource and enum types from the generated, committed API contract | 1 | REVIEW | GUARDED |
| [MOB-020](#mob-020) | Never narrow a value with a type assertion; rely on the generated types or a runtime parser | 2 | REVIEW | GUARDED |
| [MOB-021](#mob-021) | Switch mock and live transport only inside the API client module | 2 | REVIEW | FORCED |
| [MOB-022](#mob-022) | Reference public build-time variables statically; never read process.env with a computed key | 2 | REVIEW | GUARDED |
| [MOB-023](#mob-023) | Render the Redirect component only in route-group layouts and the entry route | 2 | REVIEW | GUARDED |
| [MOB-024](#mob-024) | Validate form fields on the client and map server field errors onto their fields | 2 | REVIEW | REVIEW |
| [MOB-025](#mob-025) | Never send, filter by or reason about the tenant id on the client | 2 | REVIEW | GUARDED |
| [MOB-028](#mob-028) | Let the HTTP client set the multipart content type and boundary; never set them by hand | 2 | REVIEW | GUARDED |
| [MOB-029](#mob-029) | Re-register the device push token when the active tenant changes | 2 | REVIEW | REVIEW |
| [MOB-030](#mob-030) | Enable noUncheckedIndexedAccess in the mobile tsconfig | 2 | REVIEW | FORCED |
| [MOB-031](#mob-031) | Meet the configured mobile unit-test coverage floors | 1 | REVIEW | GUARDED |
| [MOB-032](#mob-032) | Leave no unused files, exports or dependencies on the mobile track | 2 | REVIEW | GUARDED |
| [MOB-033](#mob-033) | Introduce no mobile copy-paste clones beyond the committed duplication baseline | 2 | REVIEW | GUARDED |
| [SEC-049](#sec-049) | Keep auth tokens only in the OS secure store and credentials out of the storage module | 1 | REVIEW | REVIEW |
| [SEC-050](#sec-050) | Import unencrypted key-value stores only from the storage module | 1 | REVIEW | FORCED |
| [SEC-051](#sec-051) | Take device-storage keys only from the declared, app-namespaced keys module | 2 | REVIEW | GUARDED |
| [SEC-052](#sec-052) | Import the secure store only in the credential wrapper, used only by the API client and auth | 1 | REVIEW | GUARDED |
| [SEC-053](#sec-053) | Send the secure-store bearer token and JSON Accept and locale headers on every API request | 1 | REVIEW | GUARDED |
| [SEC-054](#sec-054) | Clear the token and call the unauthorized handler on a 401 from any call except login | 2 | REVIEW | GUARDED |
| [SEC-055](#sec-055) | Record the native token strategy in a project ADR that the manifest references | 2 | REVIEW | GUARDED |
| [SEC-056](#sec-056) | Clear the token, the server-state cache and the push registration when the session ends | 2 | REVIEW | REVIEW |
| [SEC-057](#sec-057) | Gitignore platform service-credential files and commit only placeholder examples | 2 | REVIEW | GUARDED |
| [I18N-029](#i18n-029) | Change layout direction and reload for a language only in the setAppLanguage() utility | 2 | REVIEW | GUARDED |
| [I18N-030](#i18n-030) | Declare every configured locale in supportedLocales and never set supportsRTL or forcesRTL | 2 | REVIEW | FORCED |
| [I18N-031](#i18n-031) | Reference only translation keys that exist in the source locale's typed mobile resources | 1 | REVIEW | GUARDED |
| [UI-014](#ui-014) | Reference the platform Text and TextInput components only inside the text primitives | 2 | REVIEW | GUARDED |
| [UI-015](#ui-015) | Take spacing, sizes, radii and font sizes from tokens, not numeric literals | 2 | REVIEW | GUARDED |
| [UI-016](#ui-016) | Define styles through the theme style factory | 2 | REVIEW | GUARDED |
| [UI-017](#ui-017) | Type light and dark palettes with one shared interface so their keys cannot drift | 2 | REVIEW | GUARDED |
| [UI-018](#ui-018) | Map domain states to color tokens in one per-domain module, never inline | 2 | REVIEW | REVIEW |
| [UI-019](#ui-019) | Declare an accessibility role on every touchable | 2 | REVIEW | GUARDED |
| [UI-020](#ui-020) | Label icon-only controls, expose selected and disabled state, and meet the minimum touch target | 2 | REVIEW | REVIEW |
| [CI-004](#ci-004) | Run typecheck, lint, structure, format, boundaries, dead code and covered tests in the mobile chain | 1 | REVIEW | GUARDED |
| [CI-005](#ci-005) | Bundle the app with expo export in the mobile quality job | 1 | REVIEW | GUARDED |

## MOB-001

**Keep top-level source folders within the configured folder contract.**

Every directory directly under the mobile source root is on the configured folder list, and platform or tooling directories are excluded only through a configurable ignore list, so the app layout cannot drift.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-mobile-structure` / `top-level-folders` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-001.sourceRoot` (planned), `rules.MOB-001.folders` (planned), `rules.MOB-001.ignore` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-001/` |
| Adoption | Allowlist: the source root and folder list come from config and tsconfig, so both the src/app layout and the older root layout pass; extra folders get dated allowlist entries. |

## MOB-002

**Default-export the screen or layout from every route file.**

Each file under the routes directory has a default export, because the file-based router renders only that export; API routes and native-intent files are exempt through a configurable file-name pattern.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `cross-stack/expo-route-default-export` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-002.routesDir` (planned), `rules.MOB-002.exempt` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-002/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

## MOB-003

**Create React contexts only inside the contexts folder.**

createContext is reachable only from files in the configured contexts folder, whether it is imported by name or reached through the default React import, a namespace import or require, so every shared context has one home.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `cross-stack/confine-api` / `createContext` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-003.contextsDir` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-003/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

## MOB-004

**Keep only .ts files, never .tsx, in the utils, constants and types folders.**

A structure check fails on a .tsx file under the configured utils, constants and types folders, and because TypeScript rejects JSX syntax in .ts files, no JSX can live there.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-mobile-structure` / `ts-only-folders` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-004.folders` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-004/` |
| Adoption | Allowlist: existing .tsx files in those folders get dated allowlist entries until they move. |

## MOB-005

**Define hooks only in the hooks and contexts folders.**

A cross-stack/confine-api entry reports functions and variables named like a hook (use followed by a capital letter) declared outside the configured hooks and contexts folders, and the framework preset's rules-of-hooks check rejects hook calls inside functions not named like hooks.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `hook-declarations` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-005.allowedDirs` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-005/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

Known evasions:

- a hook function whose name does not start with use followed by a capital letter

## MOB-006

**Keep the types folder free of runtime code.**

The cross-stack/type-only-module rule, applied through a files override to the configured types folder and used by no other registry rule, reports top-level or exported variables, functions, classes, non-ambient enums and namespaces, default exports and expression statements there, so the folder holds only type-level declarations.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `cross-stack/type-only-module` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-006.typesDir` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-006/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

## MOB-007

**Place domain hooks and components in per-domain subfolders, with only cross-cutting ones at the root.**

Files directly under hooks and components must be on the configured cross-cutting list, and files under hooks/&lt;domain>/ are named use followed by a capital letter, so each domain's code stays together.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-mobile-structure` / `domain-subfolders` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.MOB-007.enabled` (planned), `rules.MOB-007.crossCutting` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-007/` |
| Adoption | Opt-in: off by default; the hooks and components roots follow the configured source root, and files still at a folder root get dated allowlist entries. |

Known evasions:

- domain code in a correctly named file inside another domain's folder
- a domain file added to the configured cross-cutting list

## MOB-008

**Import no server-state library in route files.**

Modules under the routes directory never import the server-state library, so data reaches routes only through screen hooks and route files stay thin.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `mobile-routes-no-server-state` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-002.routesDir` (planned), `rules.MOB-008.serverStateLibrary` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-008/` |
| Adoption | Baseline: dependency-cruiser known-violations, shrink-only under check-baselines:depcruise. |

## MOB-009

**Consume contexts only through their exported provider hook, which throws outside the provider.**

useContext is reachable only from the configured contexts folder, so consumers call each context's exported hook, and that hook throws when used outside its provider instead of returning a silent default.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `useContext` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-003.contextsDir` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-009/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

Known evasions:

- React 19 use(Context) called outside the contexts folder
- a provider hook that returns a default value instead of throwing outside its provider

## MOB-010

**Keep tracked file names identical in case to the files on disk.**

Every path git tracks matches its on-disk entry case-sensitively, and the check fails closed in CI when git is unavailable, so a case-only rename cannot break imports on case-sensitive build machines.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-mobile-structure` / `filename-casing` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-010/` |
| Adoption | Fix first: a git mv of each reported file fixes every finding at adoption. |

## MOB-011

**Import through the root path alias; no parent-relative imports.**

Static, dynamic and require imports whose relative path climbs out of the importing file's directory are reported, so cross-folder imports use the root alias read from tsconfig paths.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `import/no-relative-parent-imports` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-011.pathAlias` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-011/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only; the alias comes from tsconfig paths, so both @/\* to ./src/\* and the older root layout work. |

## MOB-012

**Keep list page, filters and sort in navigation params and forward them to the API.**

A list screen keeps its page, filters and sort in navigation params, the mobile counterpart of URL state, and sends them to the API so the server's paging and totals drive the UI.

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
| Decision | [ADR 0063](../decisions/0063-client-state-layering.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## MOB-013

**Keep server data only in the server-state cache: API access flows through query hooks.**

The HTTP library is reachable only from the API client module, and the API client module only from hooks and the auth context, so screens get server data through query hooks and the cache stays the single copy.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — depcruise: `mobile-api-layer` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-013.clientModule` (planned), `rules.MOB-013.httpLibrary` (planned), `rules.MOB-013.consumers` (planned) |
| Decision | [ADR 0063](../decisions/0063-client-state-layering.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-013/` |
| Adoption | Baseline: dependency-cruiser known-violations, shrink-only under check-baselines:depcruise. |

Known evasions:

- query data copied into component state or a store after it is fetched
- server data persisted to device storage beyond the documented profile-cache exception
- the global fetch() called directly when the HTTP library is the platform fetch

## MOB-014

**Create exactly one query client, in the query provider module.**

The server-state library's QueryClient constructor is reachable only from the configured query provider module and test utilities, so the app has a single cache with one set of defaults.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `cross-stack/confine-api` / `QueryClient` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-014.providerModule` (planned) |
| Decision | [ADR 0063](../decisions/0063-client-state-layering.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-014/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

## MOB-015

**Show mutation feedback once, from the central mutation cache; opt out only with silent meta.**

The configured toast library is reachable only from the query provider module and the toast host, so mutation feedback comes from the central mutation cache and a mutation opts out only through silent meta.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — depcruise: `mobile-toast-confinement` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.MOB-015.enabled` (planned), `rules.MOB-015.library` (planned), `rules.MOB-015.allowedModules` (planned) |
| Decision | [ADR 0007](../decisions/0007-one-mechanism-per-concern.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-015/` |
| Adoption | Opt-in: off by default; enable after mutation toasts move into the query provider, with known violations baselined shrink-only. |

Known evasions:

- mutation results reported through Alert or a hand-rolled notification component
- a toast library that the configuration does not name

## MOB-016

**Normalize API failures in one module; screens never read raw HTTP statuses or bodies.**

A cross-stack/confine-api entry reports member chains that read .response.status or .response.data, with or without optional chaining, outside the configured error-normalizer module, so screens handle typed error kinds instead of raw responses.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `raw-response-read` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-016.errorModule` (planned) |
| Decision | [ADR 0048](../decisions/0048-http-status-vocabulary.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-016/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

Known evasions:

- the status read through destructuring, such as const { status } = error.response
- the error object passed to a helper that reads the response under another property path

## MOB-017

**Map every error response to a typed app-error kind per the configured format and statuses.**

A table-driven contract test shipped with the error normalizer asserts that a response for each status in the configured vocabulary, 409 and 429 included, maps to its own kind, and that a 422 errors member maps to field errors.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — jest: `[MOB-017] maps each configured status and the 422 errors member to typed error kinds` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-017.errorFormat` (planned), `rules.MOB-017.statusVocabulary` (planned) |
| Decision | [ADR 0048](../decisions/0048-http-status-vocabulary.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-017/` |
| Adoption | Nothing needed: the kit ships the normalizer with its test; a project keeping its own normalizer adapts it to the test table. |

Known evasions:

- a status the backend returns but the configured vocabulary omits
- an error body in a format other than the configured one, such as an HTML page from a proxy

## MOB-018

**Unwrap API responses in one typed function inside the API client; no .data.data downstream.**

A cross-stack/confine-api entry reports member chains reading .data.data, in dot or computed-literal form, outside the API client module, so one typed unwrap function owns the success shape and callers never unwrap twice.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `double-data-unwrap` |
| Tier | 2 |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.api-contract.shape` (planned), `rules.MOB-013.clientModule` (planned) |
| Decision | [ADR 0052](../decisions/0052-api-success-shape.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-018/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

Known evasions:

- nested destructuring such as const { data: { data } } = response
- the inner payload read through an intermediate variable, such as const body = response.data; body.data

## MOB-019

**Take backend resource and enum types from the generated, committed API contract.**

A check flags type aliases, interfaces and string-literal unions whose name or member set matches a schema or enum in the generated contract, so the app uses generated types instead of hand-written mirrors that drift from the backend.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-contract-mirrors` / `mobile` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.api-contract.openapiPath` (planned), `modules.api-contract.mobileTypesPath` (planned) |
| Decision | [ADR 0054](../decisions/0054-generated-api-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-019/` |
| Adoption | Allowlist: existing hand-written mirrors get dated entries in .cross-stack/allowlists/MOB-019.json until they are replaced by generated types. |

Known evasions:

- a hand-written type whose name and member set both differ from the generated schema it mirrors
- a mirror derived through mapped or utility types rather than a literal declaration
- an inline object type or literal union used without a named declaration

## MOB-020

**Never narrow a value with a type assertion; rely on the generated types or a runtime parser.**

Type assertions whose target type is narrower than the expression's type, double assertions through unknown included, are reported, so untrusted values are typed by the generated contract or validated by a runtime parser.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `@typescript-eslint/no-unsafe-type-assertion` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.MOB-020.enabled` (planned) |
| Decision | [ADR 0060](../decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-020/` |
| Adoption | Opt-in: off by default because brownfield code asserts widely; enable with ESLint bulk suppressions, shrink-only. |

Known evasions:

- a user-defined type guard that always returns true
- a value typed through a declaration file or overload that misstates its shape

## MOB-021

**Switch mock and live transport only inside the API client module.**

The env module's transport-mode exports are reachable only from the API client module, so hooks and screens run unchanged against the mock and the live backend.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `cross-stack/confine-api` / `transport-mode` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.MOB-021.enabled` (planned), `rules.MOB-021.modeExports` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-021/` |
| Adoption | Opt-in: applies only to projects that use the mock transport. |

## MOB-022

**Reference public build-time variables statically; never read process.env with a computed key.**

Computed process.env reads are reported, because the bundler inlines only static process.env.EXPO_PUBLIC_NAME accesses and a computed read is undefined in the built app.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `expo/no-dynamic-env-var` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0069](../decisions/0069-typed-env-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-022/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

Known evasions:

- destructuring process.env, which only the companion rule expo/no-env-var-destructuring reports
- process.env assigned to another variable and indexed through it

## MOB-023

**Render the Redirect component only in route-group layouts and the entry route.**

The router's Redirect component is reachable only from \_layout files and the configured entry route, so declarative guards and boot routing live in one place per route group.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `Redirect` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-002.routesDir` (planned), `rules.MOB-023.entryRoute` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-023/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

Known evasions:

- a guard written as an imperative router.replace() inside a screen, which the rule does not see

## MOB-024

**Validate form fields on the client and map server field errors onto their fields.**

Forms with more than the configured number of fields validate each field on the client, and the server's 422 errors member is mapped onto the matching fields, with the summary message only as a last resort.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.WEB-042.fieldThreshold` (planned) |
| Decision | [ADR 0067](../decisions/0067-forms.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## MOB-025

**Never send, filter by or reason about the tenant id on the client.**

A global no-restricted-syntax selector reports identifiers, member properties and object or destructuring keys equal to the configured tenant key in mobile source, because the backend derives the tenant from the authenticated user and the client never supplies it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `no-restricted-syntax` / `Identifier[name='tenant_id']` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.column` (planned) |
| Decision | [ADR 0057](../decisions/0057-tenancy-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-025/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

Known evasions:

- the tenant key built dynamically, such as with a template literal or string concatenation
- tenant data read through a generic record accessor
- the key spelled in a different case or form from the configured column
- a later config object that redefines no-restricted-syntax for some files, replacing every selector there

## MOB-028

**Let the HTTP client set the multipart content type and boundary; never set them by hand.**

A global no-restricted-syntax selector reports an object property keyed Content-Type, in any letter case, whose literal value starts with multipart/, because a hand-set header drops the boundary the HTTP client generates for a FormData body.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `no-restricted-syntax` / `[value.value=/^multipart/]` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0087](../decisions/0087-file-uploads.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-028/` |
| Adoption | Baseline: ESLint bulk suppressions, shrink-only under check-baselines:eslint-suppressions. |

Known evasions:

- the header value held in a variable or constant
- the header set through a Headers instance or a set() call
- a later config object that redefines no-restricted-syntax for some files, replacing every selector there

## MOB-029

**Re-register the device push token when the active tenant changes.**

When the user switches the active tenant, the app registers its push token again for the new tenant, so notifications follow the current tenant and stop for the previous one.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](../decisions/0057-tenancy-module.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## MOB-030

**Enable noUncheckedIndexedAccess in the mobile tsconfig.**

When the rule is enabled, the resolved compiler options of the mobile tsconfig set noUncheckedIndexedAccess to true, so indexed reads are typed as possibly undefined.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-tsconfig` / `unchecked-indexed-access` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.MOB-030.enabled` (planned) |
| Decision | [ADR 0060](../decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-030/` |
| Adoption | Opt-in: noUncheckedIndexedAccess yields many tsc errors on brownfield code and tsc has no baseline, so it stays off until the project enables it. |

## MOB-031

**Meet the configured mobile unit-test coverage floors.**

The mobile test:coverage run uses jest --coverage with collectCoverageFrom, so untested files count, and coverageThreshold floors that are measured at adoption and only move up.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-coverage` / `mobile` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-031.thresholds` (planned) |
| Decision | [ADR 0091](../decisions/0091-coverage-floors.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-031/` |
| Adoption | Baseline: floors start at the coverage measured at adoption and ratchet upward only. |

Known evasions:

- assertion-free tests that only execute lines
- coverage exclusions and ignore comments

## MOB-032

**Leave no unused files, exports or dependencies on the mobile track.**

knip builds the module graph from the Expo entry points and fails on unused files, exports and dependencies, with existing findings held as dated allowlist entries that may only shrink.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-dead-code` / `mobile` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0092](../decisions/0092-dead-code-and-duplication-gates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-032/` |
| Adoption | Allowlist: current knip findings are recorded as dated entries in .cross-stack/allowlists/MOB-032.json that may only shrink. |

Known evasions:

- an export tagged @public, which knip does not report
- modules reached only through dynamic imports knip cannot resolve
- ignore entries added to the knip configuration

## MOB-033

**Introduce no mobile copy-paste clones beyond the committed duplication baseline.**

jscpd runs over the mobile TypeScript sources with the committed baseline and --fail-on-new-clones, so any new clone fails while existing ones are paid down; PROC-034 keeps the baseline shrink-only.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-duplication` / `mobile` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-033.minLines` (planned), `rules.MOB-033.minTokens` (planned) |
| Decision | [ADR 0092](../decisions/0092-dead-code-and-duplication-gates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/MOB-033/` |
| Adoption | Baseline: the jscpd baseline is recorded at adoption and kept shrink-only by PROC-034. |

Known evasions:

- clones shorter than the configured minimum lines or tokens
- copies reworded or reordered until their tokens differ

## SEC-049

**Keep auth tokens only in the OS secure store and credentials out of the storage module.**

expo-secure-store is the only credential store and the storage module's keys never hold tokens or other credentials, which reviewers confirm, because a key-name scan misses renamed keys and flags legitimate secure-store writes.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review; reviewers move any credential found in general storage behind the secure-store wrapper. |

## SEC-050

**Import unencrypted key-value stores only from the storage module.**

A dependency-cruiser rule over the resolved import graph (static, dynamic and require) lets only the storage module import @react-native-async-storage/async-storage, expo-sqlite/kv-store, expo-sqlite/localStorage/install and react-native-mmkv.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `mobile-unencrypted-kv-only-in-storage` |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-050.storageModule` (planned) |
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/SEC-050/` |
| Adoption | Baseline: existing imports go into the dependency-cruiser known-violations file (shrink-only under check-baselines), with a codemod to the storage module. |

## SEC-051

**Take device-storage keys only from the declared, app-namespaced keys module.**

The storage module's get, set and remove accept only the key union of the keys module, whose values match the configured app namespace, and a global no-restricted-syntax selector fails storage calls that pass a string or template literal instead of a declared key.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `no-restricted-syntax` / `CallExpression[callee.object.name='storage'][arguments.0.type=/^(Literal\|TemplateLiteral)$/]` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-051.namespace` (planned) |
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/SEC-051/` |
| Adoption | Baseline: existing literal keys go into the shrink-only ESLint bulk suppressions. |

Known evasions:

- a key passed through a variable or cast to the key type
- storage reached through an alias of the storage module
- a later config object that redefines no-restricted-syntax for some files, replacing every selector there

## SEC-052

**Import the secure store only in the credential wrapper, used only by the API client and auth.**

A dependency-cruiser rule lets only the credential wrapper import the secure-store library, and only the API client and the auth context import that wrapper; whether an allowed caller keeps the token out of state and context values is checked in review (SEC-049).

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — depcruise: `mobile-secure-store-confinement` |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-052.credentialModule` (planned), `rules.SEC-052.consumers` (planned) |
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/SEC-052/` |
| Adoption | Baseline: existing imports go into the dependency-cruiser known-violations file, which only shrinks. |

Known evasions:

- the secure-store library reached through a re-export in a module the rule allows
- a second secure-storage library the rule does not list

## SEC-053

**Send the secure-store bearer token and JSON Accept and locale headers on every API request.**

A contract test shipped with the API client puts a token in the mocked secure store and asserts that a request carries Authorization: Bearer, an Accept listing application/json and application/problem+json, the active locale and no cookie credentials.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — jest: `[SEC-053] every request carries the bearer token, Accept and Accept-Language headers` |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.MOB-013.clientModule` (planned) |
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/SEC-053/` |
| Adoption | Fix first: the kit's API client and its contract test ship with the mobile track, and a project keeping its own client adapts it to the contract test. |

Known evasions:

- a second HTTP client instance without the interceptor

## SEC-054

**Clear the token and call the unauthorized handler on a 401 from any call except login.**

A contract test asserts that a 401 on a protected request clears the secure-store token and calls the handler once, while a 401 on the exactly matched login route does neither.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — jest: `[SEC-054] a 401 outside login clears the token and calls the unauthorized handler` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-054.loginRoute` (planned) |
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/SEC-054/` |
| Adoption | Fix first: the kit's interceptor and its contract test ship with the mobile track, and a project keeping its own client adapts it to the contract test. |

Known evasions:

- a second HTTP client instance without the interceptor

## SEC-055

**Record the native token strategy in a project ADR that the manifest references.**

With the mobile track on and the rule enabled, the configured token-strategy ADR must be an existing project decision record that covers token lifetime, refresh or re-login, revocation and reinstall behaviour, and its end-to-end verification against a live backend is checked in review.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-standard-config` / `mobile-auth-adr` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-055.enabled` (planned), `rules.SEC-055.adr` (planned) |
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/SEC-055/` |
| Adoption | Opt-in: enable it through rules.SEC-055.enabled once the token-strategy ADR is written. |

Known evasions:

- an ADR that exists but omits expiry, refresh or logout

## SEC-056

**Clear the token, the server-state cache and the push registration when the session ends.**

Sign-out and a 401 clear everything the session left behind, including the push registration that would otherwise keep delivering notifications to a signed-out device, which reviewers confirm.

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
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review against the sign-out path. |

## SEC-057

**Gitignore platform service-credential files and commit only placeholder examples.**

A check runs git ls-files and git check-ignore against a configurable list of credential file patterns (keystores, .p8 and .p12 keys, build-service and service-account JSON, platform service config) and allows only \*.example placeholders.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-credential-files` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-057.patterns` (planned) |
| Decision | [ADR 0084](../decisions/0084-secret-scanning-and-dependency-audits.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/SEC-057/` |
| Adoption | Fix first: untrack and rotate any committed credential file before adopting. |

Known evasions:

- a credential file under a name missing from the pattern list

## I18N-029

**Change layout direction and reload for a language only in the setAppLanguage() utility.**

cross-stack/confine-api confines I18nManager.forceRTL, allowRTL and swapLeftAndRightInRTL, in member, destructured, namespace and require forms, and reload calls to the configured language utility, which persists the choice, applies the direction and reloads behind a reload-loop guard.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `I18nManager` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.i18n.languageModule` (planned) |
| Decision | [ADR 0082](../decisions/0082-mobile-rtl-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/I18N-029/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- computed member access on I18nManager
- a wrapper in another module that the rule cannot trace

## I18N-030

**Declare every configured locale in supportedLocales and never set supportsRTL or forcesRTL.**

A config check evaluates the resolved app config, dynamic config files included, and fails when the expo-localization plugin's supportedLocales misses a configured locale or supportsRTL or forcesRTL is true, since on SDK 57 those static options override the in-app language choice.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-expo-config` / `supported-locales` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0082](../decisions/0082-mobile-rtl-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/I18N-030/` |
| Adoption | Nothing needed: adopt writes supportedLocales from the manifest. |

## I18N-031

**Reference only translation keys that exist in the source locale's typed mobile resources.**

The type check runs with the i18n library's typed resources generated from the source locale's messages, so an unknown static key fails compilation, and the kit's check-typed-keys sub-check fails when the typed resources are missing or out of date.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-typed-keys` / `mobile-message-keys` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0080](../decisions/0080-locale-parity.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/I18N-031/` |
| Adoption | Nothing needed: adopt generates the typed resources. |

Known evasions:

- keys cast to a plain string or a looser type
- keys built at run time

## UI-014

**Reference the platform Text and TextInput components only inside the text primitives.**

React Native Text and TextInput, in named, namespace, default-member and require forms, through Animated.Text and Animated.createAnimatedComponent(TextInput), plus TextInput from configured extra sources, are referenced only in the configured primitive files, so all text renders through the text primitives.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `text-primitives` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.UI-014.primitives` (planned), `rules.UI-014.extraSources` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/UI-014/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a third-party component that renders platform text internally
- a text component re-exported by a module outside the configured extra sources

## UI-015

**Take spacing, sizes, radii and font sizes from tokens, not numeric literals.**

Numeric literals on the configured spacing, size, radius and typography keys inside mobile style objects are rejected except a small allowed set such as 0 and 1, so layout values come from the token scale.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-raw-style-number` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.UI-015.enabled` (planned), `rules.UI-015.keys` (planned), `rules.UI-015.allowed` (planned) |
| Decision | [ADR 0066](../decisions/0066-design-tokens.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/UI-015/` |
| Adoption | Opt-in: existing literals go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a number routed through a local constant
- a value computed from variables

## UI-016

**Define styles through the theme style factory.**

StyleSheet.create from react-native is called only in the configured style-factory module, so every screen builds its styles from theme tokens through one factory.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `style-factory` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.UI-016.enabled` (planned), `rules.UI-016.styleFactoryModule` (planned) |
| Decision | [ADR 0076](../decisions/0076-mobile-app-structure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/UI-016/` |
| Adoption | Opt-in: existing StyleSheet.create calls go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a plain style object passed straight to a style prop
- styles built in a helper outside the factory
- StyleSheet.create reached through an alias or computed member access

## UI-017

**Type light and dark palettes with one shared interface so their keys cannot drift.**

Each palette in the gate-protected color-token module is declared with satisfies against one shared palette interface, which the kit's check-typed-keys sub-check asserts, so a missing or extra key fails the type check.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-typed-keys` / `palette-interface` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.UI-017.colorModule` (planned) |
| Decision | [ADR 0066](../decisions/0066-design-tokens.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/UI-017/` |
| Adoption | Fix first: an existing palette file adds the satisfies annotation once; the kit's token module ships with it. |

Known evasions:

- a palette declared outside the configured token module
- an as-cast or an any-typed value inside a palette
- optional keys in the shared interface

## UI-018

**Map domain states to color tokens in one per-domain module, never inline.**

The client maps each semantic state the API emits to a color token in one module per domain, and screens import that mapping rather than choosing colors inline.

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
| Decision | [ADR 0046](../decisions/0046-enums-on-the-wire.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review as screens are touched. |

## UI-019

**Declare an accessibility role on every touchable.**

Every element on the configured touchable list, including Pressable, the Touchable components, gesture-handler buttons and registered wrappers, carries accessibilityRole or role, and a prop spread passes only for a registered wrapper that sets the role.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/touchable-has-role` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.UI-019.touchables` (planned) |
| Decision | [ADR 0065](../decisions/0065-ui-primitives-and-request-states.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/UI-019/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a touchable component missing from the configured list
- a role value that misdescribes the control

## UI-020

**Label icon-only controls, expose selected and disabled state, and meet the minimum touch target.**

Icon-only controls carry an accessibility label, selectable and disabled controls expose their state to assistive technology, and touch targets meet the minimum touch-target size token.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.UI-020.minTouchTarget` (planned) |
| Decision | [ADR 0065](../decisions/0065-ui-primitives-and-request-states.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review as controls are touched. |

## CI-004

**Run typecheck, lint, structure, format, boundaries, dead code and covered tests in the mobile chain.**

A CI-parity sub-check reads package.json and requires the check script to run the typecheck, ESLint, the structure rules, the formatter check, dependency-cruiser, knip and the test suite with its coverage thresholds, plus a check:fast script for the Stop hook.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `mobile-check-members` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.CI-004.members` (planned) |
| Decision | [ADR 0090](../decisions/0090-ci-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/CI-004/` |
| Adoption | Nothing needed: adopt writes check and check:fast into package.json, renaming an existing aggregate script rather than keeping two. |

Known evasions:

- a member script redefined as a no-op or with its failure swallowed, for example by appending || true
- a member run with weakened flags, such as a narrowed file list

## CI-005

**Bundle the app with expo export in the mobile quality job.**

A CI-parity sub-check requires the mobile quality job, or the reusable mobile workflow it calls, to have a step that runs npx expo export for iOS and Android without continue-on-error, so Metro resolution and transform errors that typecheck and tests miss fail the pull request.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `mobile-export-step` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.CI-009.qualityJob` (planned) |
| Decision | [ADR 0090](../decisions/0090-ci-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/mobile/violations/CI-005/` |
| Adoption | Fix first: the reusable mobile workflow ships the export step; the bundle must build in mock mode without secrets. |

Known evasions:

- the export step runs a different command under the export step's name
- an if: condition skips the export step
