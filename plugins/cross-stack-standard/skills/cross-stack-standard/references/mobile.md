# Mobile track

Rules for React Native apps built with Expo and Expo Router, as native clients of the same backend.
Rules marked Tier 1 apply to every project with the mobile track; the others apply once the project
declares Tier 2. Module rules live in [api-contract.md](api-contract.md), [i18n-rtl.md](i18n-rtl.md)
(including the mobile RTL contract) and [tenancy.md](tenancy.md). Rules shared with the web track
are repeated here so this file stands alone.

## Rules

### Folder contract and routes

- **MOB-001** Keep top-level source folders within the configured folder contract
- **MOB-002** Default-export the screen or layout from every route file
- **MOB-003** Create React contexts only inside the contexts folder
- **MOB-004** Keep only .ts files, never .tsx, in the utils, constants and types folders
- **MOB-005** Define hooks only in the hooks and contexts folders
- **MOB-006** Keep the types folder free of runtime code
- **MOB-007** Place domain hooks and components in per-domain subfolders, with only cross-cutting ones at the root _(off by default)_
- **MOB-008** Import no server-state library in route files
- **MOB-009** Consume contexts only through their exported provider hook, which throws outside the provider
- **MOB-010** Keep tracked file names identical in case to the files on disk
- **MOB-011** Import through the root path alias; no parent-relative imports
- **MOB-023** Render the `Redirect` component only in route-group layouts and the entry route
- **WEB-023** Use named exports, and default-export only where the framework requires it

### Server state and the API client

- **MOB-012** Keep list page, filters and sort in navigation params and forward them to the API
- **MOB-013** Keep server data only in the server-state cache: API access flows through query hooks
- **MOB-014** Create exactly one query client, in the query provider module
- **MOB-015** Show mutation feedback once, from the central mutation cache; opt out only with silent meta _(off by default)_
- **MOB-016** Normalize API failures in one module; screens never read raw HTTP statuses or bodies
- **MOB-017** Map every error response to a typed app-error kind per the configured format and statuses
- **MOB-018** Unwrap API responses in one typed function inside the API client; no `.data.data` downstream _(api-contract module)_
- **MOB-019** Take backend resource and enum types from the generated, committed API contract _(Tier 1; api-contract module)_
- **MOB-020** Never narrow a value with a type assertion; rely on the generated types or a runtime parser _(off by default)_
- **MOB-021** Switch mock and live transport only inside the API client module _(off by default)_
- **MOB-024** Validate form fields on the client and map server field errors onto their fields
- **MOB-028** Let the HTTP client set the multipart content type and boundary; never set them by hand
- **WEB-012** Never paginate a server page on the client
- **WEB-013** Drive lists from the server: send page, filters and sort to the API and render its total
- **WEB-033** Define query keys in per-domain `queryOptions()` factories, never as inline arrays outside hooks
- **WEB-039** Poll live data through the server-state cache; import a realtime client only with a recorded ADR

### Credentials and device storage

- **SEC-049** Keep auth tokens only in the OS secure store and credentials out of the storage module _(Tier 1)_
- **SEC-050** Import unencrypted key-value stores only from the storage module _(Tier 1)_
- **SEC-051** Take device-storage keys only from the declared, app-namespaced keys module
- **SEC-052** Import the secure store only in the credential wrapper, used only by the API client and auth _(Tier 1)_
- **SEC-053** Send the secure-store bearer token and JSON Accept and locale headers on every API request _(Tier 1)_
- **SEC-054** Clear the token and call the unauthorized handler on a 401 from any call except login
- **SEC-055** Record the native token strategy in a project ADR that the manifest references _(off by default)_
- **SEC-056** Clear the token, the server-state cache and the push registration when the session ends
- **SEC-057** Gitignore platform service-credential files and commit only placeholder examples
- **SEC-058** Use client permission checks only to hide or disable UI, and authorize every action on the server _(Tier 1)_

### Environment and logging

- **MOB-022** Reference public build-time variables statically; never read `process.env` with a computed key
- **WEB-011** Read environment variables only through the typed, schema-validated env module
- **WEB-040** Log only through the logger module; no direct console calls

### UI, tokens and accessibility

- **UI-003** Use design tokens, never raw color literals
- **UI-011** Render loading, error and empty states through the shared state primitives
- **UI-014** Reference the platform `Text` and `TextInput` components only inside the text primitives
- **UI-015** Take spacing, sizes, radii and font sizes from tokens, not numeric literals _(off by default)_
- **UI-016** Define styles through the theme style factory _(off by default)_
- **UI-017** Type light and dark palettes with one shared interface so their keys cannot drift
- **UI-018** Map domain states to color tokens in one per-domain module, never inline
- **UI-019** Declare an accessibility role on every touchable
- **UI-020** Label icon-only controls, expose selected and disabled state, and meet the minimum touch target

### Lint, types and size

- **WEB-021** Write no explicit any, form edit state and view-model bridges included _(Tier 1)_
- **WEB-022** Lint with the framework preset plus the strict and stylistic type-checked TypeScript configs _(Tier 1)_
- **WEB-024** Run the formatter in check mode in every JavaScript check chain _(Tier 1)_
- **WEB-025** Cap file length at the configured line limit
- **WEB-026** Cap the cyclomatic complexity of every function
- **WEB-050** Cap block nesting depth
- **WEB-051** Cap function length
- **WEB-027** Commit no commented-out JavaScript or TypeScript code
- **WEB-053** Leave no untracked TODO, FIXME, HACK or XXX marker in JavaScript or TypeScript
- **MOB-026** Type-check every JavaScript track in TypeScript strict mode _(Tier 1)_
- **MOB-027** Ban TypeScript suppression comments except a described `@ts-expect-error` _(Tier 1)_
- **MOB-030** Enable `noUncheckedIndexedAccess` in the mobile tsconfig _(off by default)_
- **PROC-032** Keep ESLint, TypeScript, @types/node and Node inside the Standard's supported ranges _(Tier 1)_
- **PROC-033** Run dependency-cruiser only through the kit wrapper that fails when nothing was cruised _(Tier 1)_
- **CI-010** Run ESLint at zero warnings in every JavaScript check chain _(Tier 1)_

### Dead code, duplication, tests and CI

- **MOB-031** Meet the configured mobile unit-test coverage floors _(Tier 1)_
- **MOB-032** Leave no unused files, exports or dependencies on the mobile track
- **MOB-033** Introduce no mobile copy-paste clones beyond the committed duplication baseline
- **CI-004** Run typecheck, lint, structure, format, boundaries, dead code and covered tests in the mobile chain _(Tier 1)_
- **CI-005** Bundle the app with `expo export` in the mobile quality job _(Tier 1)_

## Sanctioned patterns

**Folder contract** ([ADR 0076][0076]). The source root and alias come from `tsconfig.json`:
`src/app` with `@/*` in the current template, or the older root layout in brownfield projects. The
top-level folder list is configuration. Route files default-export their screen or layout and stay
thin (no server-state imports; screens compose hooks); every other module uses named exports. React
contexts are created only in the contexts folder and read only through a provider hook that throws
outside its provider; hooks live only in the hooks and contexts folders; `utils`, `constants` and
`types` hold `.ts` files only, and `types` holds no runtime code. Imports go through the root alias;
file names match their case on disk. Auth redirects live only in route-group layouts and the entry
route.

**Server state** ([ADR 0063][0063], [ADR 0064][0064]). Exactly one query client, created in the
query provider module. Screens reach the API only through query hooks built from per-domain
`queryOptions()` factories. List page, filters and sort live in route params and go to the API;
never page or filter a server page on the device. Live data polls through the cache.

**The API client module** ([ADR 0048][0048], [ADR 0052][0052]). One module owns transport: it
switches mock and live transport, sends the secure-store bearer token with JSON `Accept` and locale
headers, unwraps responses in one typed function (no `.data.data` downstream), and normalizes every
failure into a typed error kind, `conflict` and `rateLimited` included. Screens read kinds, never
raw statuses or bodies. A 401 from any call except login (matched exactly) clears the token, the
query cache and the push registration and calls the registered unauthorized handler. Multipart
requests go through the client, which sets the content type and boundary.

**Credentials and storage** ([ADR 0083][0083]). `expo-secure-store` is the only credential store;
one credential wrapper imports it, and only the API client and the auth context import the wrapper.
Tokens never live in component state, context values, the query cache or a store. Every unencrypted
key-value store (`@react-native-async-storage/async-storage`, `expo-sqlite/kv-store`,
`expo-sqlite/localStorage/install`, `react-native-mmkv`) is imported only from `storage/`, with keys
from one app-namespaced keys module. Platform service-credential files are gitignored; only
placeholder examples are committed. The native token strategy (lifetime, refresh or re-login,
revocation, first launch after a reinstall) is a project ADR.

**Env** ([ADR 0069][0069]). One typed env module validated at load; `EXPO_PUBLIC_*` variables
referenced statically and never holding secrets.

**UI** ([ADR 0065][0065], [ADR 0066][0066]). Styles come from the theme style factory with token
values for color, spacing, sizes, radii and font sizes; light and dark palettes satisfy one shared
interface; domain states map to color tokens in one module per domain. The platform `Text` and
`TextInput` appear only inside the text primitives, which apply typography and text direction. Every
touchable declares an accessibility role; icon-only controls carry a label; selected and disabled
states are exposed; touch targets meet the minimum held in a token (44 by default).

**Lint, types and tests** ([ADR 0059][0059], [ADR 0060][0060], [ADR 0068][0068], [ADR 0091][0091]).
The lint gate is `eslint . --max-warnings=0` with `eslint-config-expo/flat` plus the typed
typescript-eslint configs on TypeScript files, never `expo lint` (it lints only some folders and
writes its own config). TypeScript `strict`. Tests run on the installed runner (jest-expo, for
example), beside their source, with coverage floors measured at adoption.

**CI chain** ([ADR 0090][0090]): typecheck, lint, structure rules, format check, boundaries, dead
code, tests with coverage, and a bundle export with `expo export` for iOS and Android.

**Right-to-left** layouts, `supportedLocales` and the one `setAppLanguage()` path are in
[i18n-rtl.md](i18n-rtl.md).

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them when writing and reviewing code, and
do not describe them as enforced by a gate. The shared ESLint config, dependency-cruiser rules, the
structure checks and the CI template that will enforce them arrive in later 0.x releases; until then
the hooks and the project's own linters, type-checker and tests are the only mechanical checks.
`enforcement` in `${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for each ID.

## Decision records

- [ADR 0048][0048]: HTTP status vocabulary
- [ADR 0052][0052]: API success shape: Resource by default, a documented envelope as an option, never double-wrapped
- [ADR 0059][0059]: JavaScript toolchain pins: ESLint 9.39, TypeScript below 6.1, Node 22.13 or later, Expo SDK 57
- [ADR 0060][0060]: JavaScript lint baseline: strict type-checked rules, formatter check, size and complexity limits, accessibility as errors
- [ADR 0063][0063]: Client state layering: server cache, URL state, local state; no global store mandate
- [ADR 0064][0064]: Query-key factories with queryOptions() and one URL-state idiom
- [ADR 0065][0065]: UI primitives: shared focus and overlay utilities, i18n-decoupled, accessible; shared request-state components
- [ADR 0066][0066]: Design tokens are the single styling source
- [ADR 0068][0068]: Frontend testing: targeted logic tests, colocated, one E2E journey with accessibility checks
- [ADR 0069][0069]: Typed environment module per JavaScript app; raw process.env banned by a three-rule combination
- [ADR 0076][0076]: Mobile app structure: folder contract, text primitives and token styling enforced by lint
- [ADR 0083][0083]: Credential and client storage per platform
- [ADR 0090][0090]: CI contract: a reusable per-track workflow that runs exactly the check members
- [ADR 0091][0091]: Coverage floors per track: configurable, measured at adoption, ratchet-only

[0048]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0048-http-status-vocabulary.md
[0052]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0052-api-success-shape.md
[0059]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0059-javascript-toolchain-pins.md
[0060]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md
[0063]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0063-client-state-layering.md
[0064]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0064-query-key-factories-and-url-state.md
[0065]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0065-ui-primitives-and-request-states.md
[0066]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0066-design-tokens.md
[0068]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0068-frontend-testing.md
[0069]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0069-typed-env-module.md
[0076]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0076-mobile-app-structure.md
[0083]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0083-credential-and-client-storage.md
[0090]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0090-ci-contract.md
[0091]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0091-coverage-floors.md
