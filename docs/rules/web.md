<!-- Generated from registry/rules.json — do not edit. Regenerate: node scripts/generate-rule-docs.mjs -->

# Web rules

Rules for the web track (Next.js App Router). A rule that applies to one profile only says so.

88 rules: 0 FORCED, 0 GUARDED, 88 REVIEW; 75 awaiting promotion to a gated level. Target levels: 19 FORCED, 56 GUARDED, 13 REVIEW. Back to the [rule index](README.md).

| ID | Title | Tier | Enforcement | Target |
| --- | --- | --- | --- | --- |
| [WEB-001](#web-001) | Name files and directories under the source root in kebab-case | 2 | REVIEW | FORCED |
| [WEB-002](#web-002) | Colocate every test file beside the source file it tests; no aggregate test folders | 2 | REVIEW | FORCED |
| [WEB-003](#web-003) | Give feature folders only hooks/, components/ and lib/, always hooks/, with use-\* hook files | 2 | REVIEW | FORCED |
| [WEB-004](#web-004) | Put no barrel or re-export modules inside feature folders | 2 | REVIEW | FORCED |
| [WEB-005](#web-005) | Import another feature only through its hooks/ or lib/, never its components/ | 2 | REVIEW | FORCED |
| [WEB-006](#web-006) | Never import a feature from a shared lib module, directly or transitively | 2 | REVIEW | FORCED |
| [WEB-007](#web-007) | Keep the import graph free of cycles | 2 | REVIEW | FORCED |
| [WEB-008](#web-008) | Never import app routes from below the route layer | 2 | REVIEW | FORCED |
| [WEB-009](#web-009) | Import no React, framework or server-state library in feature lib/ modules | 2 | REVIEW | FORCED |
| [WEB-010](#web-010) | Document every key of the typed env schema in the example env file | 2 | REVIEW | FORCED |
| [WEB-014](#web-014) | Keep server data only in the server-state cache, never in a client store | 2 | REVIEW | REVIEW |
| [WEB-015](#web-015) | Keep list filters in the URL and UI state in components; add a store only for a shared consumer | 2 | REVIEW | REVIEW |
| [WEB-016](#web-016) | Keep route pages to composition and layout, and put business logic in features | 2 | REVIEW | REVIEW |
| [WEB-017](#web-017) | Declare no TypeScript enums | 2 | REVIEW | GUARDED |
| [WEB-018](#web-018) | Use the generated contract types for every wire shape; never redeclare one by hand | 1 | REVIEW | GUARDED |
| [WEB-019](#web-019) | Render contract types directly; let a view-model only add display fields and keep the raw row | 2 | REVIEW | REVIEW |
| [WEB-020](#web-020) | Keep every recommended jsx-a11y rule at error severity | 2 | REVIEW | FORCED |
| [WEB-028](#web-028) | Leave no unused files, exports or dependencies on the web track | 2 | REVIEW | GUARDED |
| [WEB-029](#web-029) | Introduce no copy-paste clones beyond the committed duplication baseline | 2 | REVIEW | GUARDED |
| [WEB-030](#web-030) | Meet the configured unit-test coverage floors | 1 | REVIEW | GUARDED |
| [WEB-031](#web-031) | Unit-test security-contract code to the higher security coverage floor | 2 | REVIEW | GUARDED |
| [WEB-032](#web-032) | Run one end-to-end journey (sign-in, CRUD, sign-out) against a seeded backend in the web workflow | 2 | REVIEW | GUARDED |
| [WEB-034](#web-034) | Invalidate the resource root key after every mutation | 2 | REVIEW | REVIEW |
| [WEB-035](#web-035) | Show mutation feedback once, from the central mutation cache; opt out only with silent meta | 2 | REVIEW | REVIEW |
| [WEB-036](#web-036) | Build autosave editors on local state that leads the server copy, invalidating keys on unmount | 2 | REVIEW | REVIEW |
| [WEB-037](#web-037) | Create the HTTP client once and send every request through the shared fetcher | 2 | REVIEW | GUARDED |
| [WEB-038](#web-038) | Keep the API version segment only in the upstream base URL | 2 | REVIEW | GUARDED |
| [WEB-041](#web-041) | Mint a request id when absent and forward it on every upstream call | 2 | REVIEW | GUARDED |
| [WEB-042](#web-042) | Validate each field on the client in forms above the configured field count | 2 | REVIEW | REVIEW |
| [WEB-043](#web-043) | Map server validation errors onto their fields and wire aria-invalid and aria-describedby | 2 | REVIEW | REVIEW |
| [WEB-044](#web-044) | List every private route segment in the protected-segments declaration the proxy reads | 2 | REVIEW | GUARDED |
| [WEB-045](#web-045) | Reconcile the session hint with the token cookie in the proxy on every navigation | 2 | REVIEW | GUARDED |
| [WEB-046](#web-046) | Clear the profile cache and hard-navigate to the locale's login page on a non-login 401 | 2 | REVIEW | GUARDED |
| [WEB-047](#web-047) | Compare auth endpoint paths as exact shared constants, never by substring | 2 | REVIEW | GUARDED |
| [WEB-048](#web-048) | Return RFC 9457 problem details for every error the BFF creates itself | 2 | REVIEW | GUARDED |
| [WEB-049](#web-049) | Reject request bodies above the shared upload limit with 413 in the BFF, before buffering | 2 | REVIEW | GUARDED |
| [WEB-052](#web-052) | Send credentials and the XSRF token from the SPA client, and fetch the CSRF cookie first | 2 | REVIEW | GUARDED |
| [SEC-031](#sec-031) | Import server-only in every module under the configured server paths | 2 | REVIEW | FORCED |
| [SEC-032](#sec-032) | Keep the upstream API base URL in server-side env, never in a public-prefixed variable | 2 | REVIEW | GUARDED |
| [SEC-033](#sec-033) | Limit the proxy session redirect to a cookie-presence check that never authorizes | 2 | REVIEW | REVIEW |
| [SEC-034](#sec-034) | Re-verify the session in every Route Handler and Server Action, and authorize in the backend | 1 | REVIEW | GUARDED |
| [SEC-035](#sec-035) | Refuse cross-site, missing and null origins on mutating requests in the same-origin check | 1 | REVIEW | FORCED |
| [SEC-036](#sec-036) | Write session cookies per the cookie contract: \_\_Host- prefix, HttpOnly, Secure, explicit SameSite | 1 | REVIEW | GUARDED |
| [SEC-037](#sec-037) | Write and clear session cookies only in the session module | 2 | REVIEW | GUARDED |
| [SEC-038](#sec-038) | Never hand the token to page JavaScript in the login response | 1 | REVIEW | GUARDED |
| [SEC-039](#sec-039) | Expire every session cookie on sign-out, a failed upstream logout and a relayed 401 included | 2 | REVIEW | GUARDED |
| [SEC-040](#sec-040) | Keep the session-presence predicates in agreement, treating an empty cookie as signed out | 2 | REVIEW | GUARDED |
| [SEC-041](#sec-041) | Forward only allow-listed headers through the BFF, never Cookie, Host or a client Authorization | 2 | REVIEW | GUARDED |
| [SEC-042](#sec-042) | Keep BFF path forwarding inside the configured API base path | 2 | REVIEW | GUARDED |
| [SEC-043](#sec-043) | Give route files only to the catch-all, the auth routes and allowlisted handlers | 2 | REVIEW | FORCED |
| [SEC-044](#sec-044) | Call only the same-origin BFF from the browser, never the API origin | 2 | REVIEW | GUARDED |
| [SEC-045](#sec-045) | Resolve Next.js at or above the Standard's security floor | 1 | REVIEW | FORCED |
| [SEC-046](#sec-046) | Use browser storage only through the storage module, and sessionStorage never | 1 | REVIEW | GUARDED |
| [SEC-047](#sec-047) | Write no raw HTML sinks such as dangerouslySetInnerHTML, innerHTML or document.write | 1 | REVIEW | GUARDED |
| [SEC-048](#sec-048) | Point browser tooling only at local or dev test accounts, and copy nothing it observes | 2 | REVIEW | REVIEW |
| [SEC-059](#sec-059) | Expire the session cookie before the backend token | 2 | REVIEW | REVIEW |
| [SEC-060](#sec-060) | Choose cookie-session SPA auth without a BFF only through an ADR that confirms its constraints | 2 | REVIEW | GUARDED |
| [SEC-067](#sec-067) | Call the shared same-origin check in every mutating Route Handler | 1 | REVIEW | GUARDED |
| [SEC-068](#sec-068) | List only exact hosts as Server Action allowed origins, never null or a wildcard | 1 | REVIEW | GUARDED |
| [SEC-070](#sec-070) | Change nothing in GET and HEAD Route Handlers: no cookie writes, no mutating upstream calls | 2 | REVIEW | GUARDED |
| [SEC-072](#sec-072) | Export no runtime segment config from proxy.ts | 2 | REVIEW | FORCED |
| [SEC-073](#sec-073) | Run Chrome DevTools MCP only from the pinned companion plugin, unapproved in settings | 2 | REVIEW | GUARDED |
| [I18N-012](#i18n-012) | Use logical-direction utility classes, never physical left and right | 1 | REVIEW | GUARDED |
| [I18N-015](#i18n-015) | Reference only translation keys that exist in the source locale's typed web messages | 1 | REVIEW | GUARDED |
| [I18N-018](#i18n-018) | Never choose user-facing copy by comparing the locale with a literal | 2 | REVIEW | GUARDED |
| [I18N-020](#i18n-020) | Make the localized-field helper prefer the reader's locale and fall back through the chain | 2 | REVIEW | GUARDED |
| [I18N-021](#i18n-021) | Prefix every locale route, never auto-detect, and use the configured locales and a project cookie | 2 | REVIEW | GUARDED |
| [I18N-022](#i18n-022) | Pin the configured business time zone in the i18n request configuration | 2 | REVIEW | GUARDED |
| [I18N-023](#i18n-023) | Navigate only through the locale-aware wrappers, never next/link or the replaced router APIs | 2 | REVIEW | GUARDED |
| [I18N-024](#i18n-024) | Never hand-build locale-prefixed hrefs | 2 | REVIEW | GUARDED |
| [I18N-025](#i18n-025) | Derive the current locale from the URL in one helper that accepts only configured locales | 2 | REVIEW | GUARDED |
| [I18N-026](#i18n-026) | Place every page route under the locale segment | 2 | REVIEW | FORCED |
| [I18N-027](#i18n-027) | Set lang and dir on the document root from the active locale | 1 | REVIEW | GUARDED |
| [I18N-039](#i18n-039) | Send the active UI locale, not the browser's, as Accept-Language from the web client | 1 | REVIEW | GUARDED |
| [I18N-044](#i18n-044) | Derive every configured locale's direction from the one hard-coded right-to-left locale list | 2 | REVIEW | GUARDED |
| [UI-001](#ui-001) | Import no feature code or generated contract types in UI primitives | 2 | REVIEW | FORCED |
| [UI-002](#ui-002) | Keep UI primitives from reaching the i18n library, directly or through other modules | 2 | REVIEW | FORCED |
| [UI-004](#ui-004) | Use the z-index token ladder, never arbitrary z-index values | 2 | REVIEW | GUARDED |
| [UI-005](#ui-005) | Style with one system: no preprocessor stylesheets, CSS-in-JS modules or &lt;style jsx> blocks | 1 | REVIEW | GUARDED |
| [UI-006](#ui-006) | Hand-write CSS only where the utility system falls short, each block with a why-comment | 2 | REVIEW | GUARDED |
| [UI-007](#ui-007) | Define design tokens in one source; other CSS may only alias them | 2 | REVIEW | GUARDED |
| [UI-008](#ui-008) | Compose chart and SVG color token references only in the chart-token module | 2 | REVIEW | GUARDED |
| [UI-009](#ui-009) | Reference color tokens without fallback values | 2 | REVIEW | GUARDED |
| [UI-010](#ui-010) | Route overlays through the shared overlay utilities; no createPortal elsewhere | 2 | REVIEW | GUARDED |
| [UI-012](#ui-012) | Pass an automated accessibility scan, target size included, on every journey page | 2 | REVIEW | GUARDED |
| [UI-013](#ui-013) | Browser-check every changed screen before reporting UI work done | 2 | REVIEW | REVIEW |
| [CI-002](#ci-002) | Run typecheck, lint, format, boundaries, dead code and tests with coverage in the web chain | 1 | REVIEW | GUARDED |
| [CI-003](#ci-003) | Run the production build in the web quality job | 1 | REVIEW | GUARDED |

## WEB-001

**Name files and directories under the source root in kebab-case.**

Every file and directory name under the web source root is kebab-case, with framework route syntax (\[param\], (group), @slot, \_private) and the profile's special files exempt, so paths and imports stay predictable on every operating system.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[WEB-001] file and directory names under the source root are kebab-case` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-001.exempt` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-001/` |
| Adoption | Allowlist: existing non-kebab names get dated entries in .cross-stack/allowlists/WEB-001.json that may only shrink; greenfield projects start clean. |

## WEB-002

**Colocate every test file beside the source file it tests; no aggregate test folders.**

Every \*.test.\* and \*.spec.\* file has a same-stem source file in the same directory, which also rejects \_\_tests\_\_ and similar aggregate folders, so a test moves and disappears together with the code it covers.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[WEB-002] every test file sits beside a same-stem source file` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-002.testPatterns` (planned) |
| Decision | [ADR 0068](../decisions/0068-frontend-testing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-002/` |
| Adoption | Allowlist: existing aggregate test folders get dated entries in .cross-stack/allowlists/WEB-002.json that may only shrink. |

## WEB-003

**Give feature folders only hooks/, components/ and lib/, always hooks/, with use-\* hook files.**

Each feature folder contains only the hooks/, components/ and lib/ subfolders, hooks/ is always present, and every non-test file in hooks/ is named use-&lt;name>, so every feature exposes the same predictable surface.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[WEB-003] feature folders have the sanctioned shape` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-003.featuresPath` (planned), `rules.WEB-003.allowedSubfolders` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-003/` |
| Adoption | Allowlist: existing non-conforming feature folders get dated entries in .cross-stack/allowlists/WEB-003.json that may only shrink. |

## WEB-004

**Put no barrel or re-export modules inside feature folders.**

Files under the features path never re-export, whether through export \* from, export { x } from or a re-exported imported binding, because the folder path is the public surface and barrels hide cross-feature dependencies from the boundary rules.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — eslint: `cross-stack/no-feature-re-export` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-003.featuresPath` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-004/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

## WEB-005

**Import another feature only through its hooks/ or lib/, never its components/.**

On the resolved import graph a feature reaches another feature only through that feature's hooks/ and lib/, and a feature's own hooks/ and lib/ never import its components/, which closes the re-export route around the rule.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `feature-public-surface-only` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-003.featuresPath` (planned), `rules.WEB-005.publicSurface` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-005/` |
| Adoption | Baseline: existing violations go into the dependency-cruiser known-violations baseline, shrink-only under check-baselines. |

## WEB-006

**Never import a feature from a shared lib module, directly or transitively.**

No module under the shared lib folder reaches the features folder through any chain of resolved imports, so shared code stays generic and a feature can be removed without breaking it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `lib-imports-no-features` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-006.libPath` (planned), `rules.WEB-006.exemptPaths` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-006/` |
| Adoption | Baseline: existing violations go into the dependency-cruiser known-violations baseline, shrink-only under check-baselines. |

## WEB-007

**Keep the import graph free of cycles.**

The resolved import graph of the web source root, type-only imports included, contains no cycle, so modules load in a defined order and can be split or removed independently.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `no-circular` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-007/` |
| Adoption | Baseline: existing violations go into the dependency-cruiser known-violations baseline, shrink-only under check-baselines. |

## WEB-008

**Never import app routes from below the route layer.**

Features, UI primitives, shared lib and shared hooks never resolve an import into the app route folder, so dependencies point from routes downward and never back up.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `no-import-from-app-layer` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-008.appRoot` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-008/` |
| Adoption | Baseline: existing violations go into the dependency-cruiser known-violations baseline, shrink-only under check-baselines. |

## WEB-009

**Import no React, framework or server-state library in feature lib/ modules.**

Modules in a feature's lib/ folder never import React, the web framework or the server-state library, dynamic imports included, so feature logic stays pure and testable without rendering.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `feature-lib-framework-free` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-003.featuresPath` (planned), `rules.WEB-009.frameworkModules` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-009/` |
| Adoption | Baseline: existing violations go into the dependency-cruiser known-violations baseline, shrink-only under check-baselines. |

## WEB-010

**Document every key of the typed env schema in the example env file.**

A web architecture test imports the typed env module and fails when any schema key is missing from the example env file, with keys the platform injects at runtime configurable, so a fresh checkout lists everything the app needs.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[WEB-010] every env schema key is documented in the example env file` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-011.envModules` (planned), `rules.WEB-010.exampleFile` (planned), `rules.WEB-010.runtimeProvided` (planned) |
| Decision | [ADR 0085](../decisions/0085-environment-files.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-010/` |
| Adoption | Fix first: add the missing keys to the example env file at adoption. |

## WEB-014

**Keep server data only in the server-state cache, never in a client store.**

Data fetched from the API is held only in the installed server-state library's cache, never copied into a client store or long-lived component state, so one copy exists and invalidation keeps it fresh.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0063](../decisions/0063-client-state-layering.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-015

**Keep list filters in the URL and UI state in components; add a store only for a shared consumer.**

List filters, sort and page live in the URL through one URL-state idiom (nuqs when installed, otherwise the router's search-params API), other UI state stays in components, and a global store is added only when a real cross-tree consumer exists.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0063](../decisions/0063-client-state-layering.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-016

**Keep route pages to composition and layout, and put business logic in features.**

Files in the route layer assemble feature components and layout and hold no business logic, data transformation or API calls of their own, so features stay reusable and routes stay thin.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-017

**Declare no TypeScript enums.**

A global no-restricted-syntax selector on TSEnumDeclaration bans enums, const and declare enums included, because closed value sets come from the generated contract's string-literal unions or plain const objects, which also keep the code erasable-syntax-only.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `no-restricted-syntax` / `TSEnumDeclaration` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0046](../decisions/0046-enums-on-the-wire.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-017/` |
| Adoption | Baseline: existing enums go into ESLint bulk suppressions, shrink-only, and are replaced by generated unions. |

Known evasions:

- a later config object that redefines no-restricted-syntax for some files, replacing every selector there

## WEB-018

**Use the generated contract types for every wire shape; never redeclare one by hand.**

With the api-contract module, web code takes request, response and enum types from the committed generated contract, and a check flags type aliases, interfaces and string-literal unions whose name or member set duplicates a generated schema or enum.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-contract-mirrors` / `web` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `modules.api-contract.openapiPath` (planned), `modules.api-contract.webTypesPath` (planned) |
| Decision | [ADR 0054](../decisions/0054-generated-api-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-018/` |
| Adoption | Allowlist: existing hand-written mirrors get dated entries in .cross-stack/allowlists/WEB-018.json until they are replaced by generated types. |

Known evasions:

- a hand-written type whose name and member set both differ from the generated schema it mirrors
- a mirror derived through mapped or utility types rather than a literal declaration
- an inline object type or literal union used without a named declaration

## WEB-019

**Render contract types directly; let a view-model only add display fields and keep the raw row.**

Components render generated contract types as they arrive, and where a view-model is needed it only adds derived display fields and keeps the raw API row for anything editable, so edits never round-trip through a lossy mapping.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0054](../decisions/0054-generated-api-contract.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-020

**Keep every recommended jsx-a11y rule at error severity.**

A config check resolves the ESLint configuration for a sample component file and fails unless every jsx-a11y recommended rule is at error, reusing the plugin instance the framework config registers, so accessibility defects fail the build.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-eslint-config` / `a11y-errors` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-020.componentMap` (planned) |
| Decision | [ADR 0060](../decisions/0060-javascript-lint-baseline.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-020/` |
| Adoption | Baseline: existing accessibility errors go into ESLint bulk suppressions, shrink-only; the config check itself needs none. |

## WEB-028

**Leave no unused files, exports or dependencies on the web track.**

knip builds the module graph from the framework's entry points and fails on unused files, exports and dependencies, with existing findings held in an allowlist-backed baseline that may only shrink.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-dead-code` / `web` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0092](../decisions/0092-dead-code-and-duplication-gates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-028/` |
| Adoption | Allowlist: current knip findings are recorded as dated entries in .cross-stack/allowlists/WEB-028.json that may only shrink. |

Known evasions:

- an export tagged @public, which knip does not report
- unused exports of entry files, which knip reports only with --include-entry-exports
- modules reached only through dynamic imports knip cannot resolve
- ignore entries added to the knip configuration

## WEB-029

**Introduce no copy-paste clones beyond the committed duplication baseline.**

jscpd runs over the TypeScript sources with a committed baseline and --fail-on-new-clones, so any new clone fails while existing ones are paid down, instead of a global duplication percentage that lets new copies hide; PROC-034 keeps the baseline shrink-only.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-duplication` / `web` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-029.minLines` (planned), `rules.WEB-029.minTokens` (planned) |
| Decision | [ADR 0092](../decisions/0092-dead-code-and-duplication-gates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-029/` |
| Adoption | Baseline: the jscpd baseline is recorded at adoption, shrink-only under check-baselines. |

Known evasions:

- clones shorter than the configured minimum lines or tokens
- copies reworded or reordered until their tokens differ
- duplication across repositories

## WEB-030

**Meet the configured unit-test coverage floors.**

The web test:coverage run uses Vitest v8 coverage with an explicit include list and fails below the configured thresholds, which are measured at adoption and only move up.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-coverage` / `web` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-030.thresholds` (planned) |
| Decision | [ADR 0091](../decisions/0091-coverage-floors.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-030/` |
| Adoption | Baseline: floors start at the coverage measured at adoption and ratchet upward only. |

Known evasions:

- assertion-free tests that only execute lines
- coverage exclusions and ignore comments

## WEB-031

**Unit-test security-contract code to the higher security coverage floor.**

When enabled, per-path Vitest coverage thresholds hold the configured security-contract paths, such as session modules, redirect resolution, permission guards and the BFF URL builder, to a higher floor than the rest of the code.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-coverage` / `web-security-paths` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | no (opt-in) |
| Configurable | `rules.WEB-031.enabled` (planned), `rules.WEB-031.paths` (planned) |
| Decision | [ADR 0091](../decisions/0091-coverage-floors.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-031/` |
| Adoption | Opt-in: the floor is set to the coverage measured when the rule is enabled. |

Known evasions:

- assertion-free tests that only execute lines
- security-contract code placed outside the configured paths
- coverage exclusions and ignore comments

## WEB-032

**Run one end-to-end journey (sign-in, CRUD, sign-out) against a seeded backend in the web workflow.**

When enabled, the reusable web workflow has a Playwright journey job that runs the local end-to-end command against a seeded backend, and a CI-parity sub-check fails when the job or its command is missing.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `web-e2e-job` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | no (opt-in) |
| Configurable | `rules.WEB-032.enabled` (planned) |
| Decision | [ADR 0068](../decisions/0068-frontend-testing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-032/` |
| Adoption | Opt-in: enabled once the project can start a seeded backend in CI. |

Known evasions:

- a journey that mocks the API or skips the sign-in chain
- a journey that exists but asserts little

## WEB-034

**Invalidate the resource root key after every mutation.**

Every mutation invalidates the affected resource's root key from its query-key factory, and cross-feature invalidation imports the target feature's factory rather than a bare key.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0064](../decisions/0064-query-key-factories-and-url-state.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-035

**Show mutation feedback once, from the central mutation cache; opt out only with silent meta.**

Success and error notifications for mutations are raised in one place, the central mutation cache, and a mutation suppresses them only through the silent meta flag, so no screen shows duplicate or missing feedback.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0007](../decisions/0007-one-mechanism-per-concern.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-036

**Build autosave editors on local state that leads the server copy, invalidating keys on unmount.**

Autosaving editors keep the edited value in local state that leads the server copy, save in the background and invalidate their query keys on unmount and navigation, so a stale cache never overwrites newer input.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0063](../decisions/0063-client-state-layering.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-037

**Create the HTTP client once and send every request through the shared fetcher.**

A cross-stack/confine-api entry lets only the configured client module import the declared HTTP library and only the shared fetcher and the BFF forwarder call the global fetch, so every request goes through one client with the same headers, interceptors and error handling.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `http-client` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-037.library` (planned), `rules.WEB-037.allowedPaths` (planned) |
| Decision | [ADR 0007](../decisions/0007-one-mechanism-per-concern.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-037/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- fetch reached through computed or aliased globalThis access
- a second client instance created inside the sanctioned module

## WEB-038

**Keep the API version segment only in the upstream base URL.**

A global no-restricted-syntax selector flags string and template literals whose request path starts with a version segment matching the configured pattern, such as /v1/ or /api/v1/, so the API version changes in one base URL.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `no-restricted-syntax` / `api-version-literal` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-038.versionPattern` (planned) |
| Decision | [ADR 0042](../decisions/0042-api-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-038/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- a version segment assembled at runtime from a variable or by concatenation
- a later config object that redefines no-restricted-syntax for some files, replacing every selector there

## WEB-041

**Mint a request id when absent and forward it on every upstream call.**

With the observability module, the shared forwarder mints a request id when the incoming request has none, preserves an incoming one and sends it on every upstream call, so one id links browser, BFF and API logs.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[WEB-041] the shared forwarder mints a missing request id and forwards it upstream` |
| Tier | 2 |
| Module | `observability` |
| Profiles | all |
| Enabled by default | no (opt-in) |
| Configurable | `rules.WEB-041.enabled` (planned), `modules.observability.requestIdHeader` (planned) |
| Decision | [ADR 0099](../decisions/0099-observability-module.md) |
| Since | 1.1.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-041/` |
| Adoption | Opt-in: arrives with the observability module after 1.0 and is turned on through rules.WEB-041.enabled. |

Known evasions:

- a second HTTP client or handler that bypasses the shared forwarder

## WEB-042

**Validate each field on the client in forms above the configured field count.**

Forms with more fields than the configured threshold, about five by default, validate each field on the client with the installed form and validation libraries as a UX aid, while the server stays the authority on validity.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.WEB-042.fieldThreshold` (planned) |
| Decision | [ADR 0067](../decisions/0067-forms.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-043

**Map server validation errors onto their fields and wire aria-invalid and aria-describedby.**

The errors member of a 422 problem response is mapped onto the matching form fields, each invalid field sets aria-invalid and references its message through aria-describedby, and the summary message is only the fallback.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0067](../decisions/0067-forms.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## WEB-044

**List every private route segment in the protected-segments declaration the proxy reads.**

A web architecture test imports the routes module, walks every route group under the app root and fails when the first URL segment of a non-public page is missing from the exported protected-segments list that drives the proxy's UX redirect.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[WEB-044] every private route segment is listed in the protected-segments declaration` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `rules.WEB-044.routesModule` (planned), `rules.WEB-044.publicGroups` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-044/` |
| Adoption | Nothing needed: the bff-auth module templates ship the routes module and the test. |

Known evasions:

- a private page placed outside the conventional protected route groups
- the proxy no longer reading the exported list, which the test does not assert
- proxy matcher exclusions such as paths containing a dot

## WEB-045

**Reconcile the session hint with the token cookie in the proxy on every navigation.**

The proxy compares the presence-only session hint cookie with the httpOnly token cookie on every navigation and corrects a drifted hint, so the client never believes it is signed in without a token, or signed out while holding one.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[WEB-045] the proxy reconciles the session hint with the token cookie` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-045/` |
| Adoption | Nothing needed: shipped with the bff-auth module templates. |

Known evasions:

- an early return in the proxy before reconciliation runs
- paths the proxy matcher excludes

## WEB-046

**Clear the profile cache and hard-navigate to the locale's login page on a non-login 401.**

The client's unauthorized handler treats a 401 from any endpoint except login as an expired session: it clears the persisted profile cache and navigates to the login page of the active locale, while a failed login shows its error in place.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[WEB-046] a non-login 401 clears the profile cache and redirects to the login page` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-046/` |
| Adoption | Nothing needed: shipped with the bff-auth module templates. |

Known evasions:

- a second HTTP client without the unauthorized handler

## WEB-047

**Compare auth endpoint paths as exact shared constants, never by substring.**

Code that recognises auth endpoints compares against the declared auth-path constants exactly, and a global no-restricted-syntax selector flags includes, startsWith and endsWith calls on configured auth path literals, because substring matches misfire on similar paths.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `no-restricted-syntax` / `auth-path-substring` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.authPaths` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-047/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- a regular-expression test on the path
- an auth path held in a variable or built at runtime
- a later config object that redefines no-restricted-syntax for some files, replacing every selector there

## WEB-048

**Return RFC 9457 problem details for every error the BFF creates itself.**

Every error response the BFF creates locally, such as an unreachable upstream, a rejected path, a refused origin or a failed login or logout, is application/problem+json with type, title and status, matching the API's error format so clients parse one shape.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[WEB-048] errors the BFF fabricates are RFC 9457 problem details` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0053](../decisions/0053-rfc-9457-problem-details.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-048/` |
| Adoption | Nothing needed: shipped with the bff-auth module templates. |

Known evasions:

- a hand-built error response in a handler the tests do not exercise

## WEB-049

**Reject request bodies above the shared upload limit with 413 in the BFF, before buffering.**

The BFF reads the upload limit from the env key the backend upload rules also read and answers a larger body with 413 before buffering it or calling upstream, so an oversized upload cannot exhaust BFF memory.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[WEB-049] the BFF rejects bodies over the upload limit with 413 before buffering` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.maxBodyKey` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-049/` |
| Adoption | Nothing needed: shipped with the bff-auth module templates. |

Known evasions:

- backend upload rules that read a different key or a literal
- uploads sent directly to the API origin

## WEB-052

**Send credentials and the XSRF token from the SPA client, and fetch the CSRF cookie first.**

In the react-spa profile with cookie-based Sanctum SPA authentication, the shared HTTP client sends credentials and the X-XSRF-TOKEN header, fetches the CSRF cookie before the first state-changing request and never attaches a bearer token.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[WEB-052] the SPA HTTP client sends credentials and the XSRF token` |
| Tier | 2 |
| Module | core |
| Profiles | `react-spa` |
| Enabled by default | no (opt-in) |
| Configurable | `rules.WEB-052.enabled` (planned) |
| Decision | [ADR 0075](../decisions/0075-react-spa-profile-after-1-0.md) |
| Since | 1.1.0 |
| Violation fixture | planned — `test/fixtures/web/violations/WEB-052/` |
| Adoption | Opt-in: arrives with the react-spa profile after 1.0 and is turned on through rules.WEB-052.enabled. |

Known evasions:

- a second HTTP client or a direct fetch call that bypasses the shared client
- a mutation on a code path the test does not exercise before the CSRF cookie is fetched

## SEC-031

**Import server-only in every module under the configured server paths.**

A web architecture test parses every module under the configured server paths and requires an import of server-only, so the framework build fails when client code reaches one.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[SEC-031] every module under the server paths imports server-only` |
| Tier | 2 |
| Module | core |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `rules.SEC-031.serverPaths` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-031/` |
| Adoption | Nothing needed: adopt adds the import to existing modules under the server paths. |

## SEC-032

**Keep the upstream API base URL in server-side env, never in a public-prefixed variable.**

A test imports the typed env module and asserts that the API base URL key exists only in the server schema and that no public-prefixed key matching the API pattern exists in the schema or the example env file.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[SEC-032] the public env schema exposes no API base URL` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `rules.WEB-011.envModules` (planned), `modules.bff-auth.apiUrlKey` (planned) |
| Decision | [ADR 0069](../decisions/0069-typed-env-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-032/` |
| Adoption | Fix first: moving the variable to the server schema is part of adopting bff-auth. |

Known evasions:

- a public variable whose name does not match the API pattern
- a default API URL hardcoded in code

## SEC-033

**Limit the proxy session redirect to a cookie-presence check that never authorizes.**

The Next.js proxy only redirects signed-out visitors by cookie presence, while session validation and authorization happen in Route Handlers, Server Actions and the backend, which reviewers confirm.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0070](../decisions/0070-proxy-ux-only-session-reverification.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review; reviewers move any validation found in the proxy into the handlers. |

## SEC-034

**Re-verify the session in every Route Handler and Server Action, and authorize in the backend.**

The cross-stack/route-handler-session rule flags every exported HTTP method handler in a route file and every exported or inline Server Action that neither calls the configured session helper nor is wrapped by a configured wrapper, and the backend makes the authorization decision.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/route-handler-session` |
| Tier | 1 — invariant 2: Server authority |
| Module | core |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `rules.SEC-034.sessionHelper` (planned), `rules.SEC-034.wrappers` (planned) |
| Decision | [ADR 0070](../decisions/0070-proxy-ux-only-session-reverification.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-034/` |
| Adoption | Allowlist: no bulk suppression for a Tier-1 rule; each existing handler without the check gets a dated allowlist entry. |

Known evasions:

- the session helper is called but its result is ignored
- the helper runs on only some code paths
- the export is produced by a factory the rule does not know
- a Server Component fetches private data outside a Route Handler or Server Action

## SEC-035

**Refuse cross-site, missing and null origins on mutating requests in the same-origin check.**

Unit tests of the shipped assertSameOrigin helper pass only Sec-Fetch-Site same-origin or an exact Origin match and expect 403 before any work for same-site, cross-site, sibling-subdomain, missing and null origins.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[SEC-035] assertSameOrigin refuses cross-site, missing and null origins` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.allowedOrigins` (planned) |
| Decision | [ADR 0074](../decisions/0074-bff-csrf-defense.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-035/` |
| Adoption | Nothing needed: the helper ships with the bff-auth module; clients that strip both Origin and Sec-Fetch-Site can no longer mutate through the BFF. |

## SEC-036

**Write session cookies per the cookie contract: \_\_Host- prefix, HttpOnly, Secure, explicit SameSite.**

A table-driven test over the session module's set, clear and hint writers asserts every Set-Cookie attribute, including an explicit SameSite of Lax or Strict rather than the browser default, clears written as Max-Age=0 with the same attributes and a hint that holds a constant marker.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[SEC-036] session cookie writes match the cookie contract` |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.cookieSlug` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-036/` |
| Adoption | Nothing needed: the session module ships with bff-auth; existing cookies are renamed with the migration playbook. |

Known evasions:

- a cookie written outside the session module
- an ingress that lets clients set the forwarded protocol header

## SEC-037

**Write and clear session cookies only in the session module.**

The cross-stack/session-cookie-single-writer rule flags cookie set and delete calls that name a session cookie, and imports of the session cookie-name constants, outside the session module and its tests.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/session-cookie-single-writer` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.sessionModule` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-037/` |
| Adoption | Baseline: existing writers go into the shrink-only ESLint bulk suppressions. |

Known evasions:

- a cookie name assembled at runtime from unrelated fragments

## SEC-038

**Never hand the token to page JavaScript in the login response.**

A login route test with a mocked upstream asserts that the response JSON holds no token at any path and that Set-Cookie carries it HttpOnly.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[SEC-038] the login response never contains the token` |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.tokenPath` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-038/` |
| Adoption | Nothing needed: the login handler ships with bff-auth. |

Known evasions:

- a new auth handler that relays the upstream body verbatim

## SEC-039

**Expire every session cookie on sign-out, a failed upstream logout and a relayed 401 included.**

Route tests with a mocked upstream assert Max-Age=0 for every token cookie and the hint after a logout that succeeds, gets a 500 or hits a network error, and after the catch-all relays a 401.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[SEC-039] every sign-out event expires all session cookies` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-039/` |
| Adoption | Nothing needed: the logout handler and the catch-all ship with bff-auth. |

Known evasions:

- a second logout path that bypasses the shared clearing helper

## SEC-040

**Keep the session-presence predicates in agreement, treating an empty cookie as signed out.**

One table of cookie states runs against every presence predicate, request-side and server-headers-side, which must return the same answer and treat an empty token cookie as signed out.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[SEC-040] session presence predicates agree on every cookie state` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-040/` |
| Adoption | Nothing needed: the predicates ship with bff-auth. |

Known evasions:

- a new presence check written outside the shared predicates

## SEC-041

**Forward only allow-listed headers through the BFF, never Cookie, Host or a client Authorization.**

A forwarder test with a mocked fetch asserts that outbound headers equal the request allow-list plus the server-set Authorization and the forced JSON headers, and that relayed headers equal the response allow-list.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[SEC-041] forwarded headers match the allow-lists in both directions` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.requestHeaders` (planned), `modules.bff-auth.responseHeaders` (planned), `modules.bff-auth.forcedUpstreamHeaders` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-041/` |
| Adoption | Nothing needed: the forwarder ships with bff-auth. |

Known evasions:

- Cookie, Authorization or Set-Cookie added to an allow-list in configuration
- a handler that forwards with its own fetch call

## SEC-042

**Keep BFF path forwarding inside the configured API base path.**

The proxy builds the upstream URL from the decoded segment array, rejects empty, dot, dot-dot and slash, backslash or control-character segments, re-encodes each one and asserts origin and base-path prefix; tests for traversal, double encoding and query or fragment injection expect 400 before any fetch.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[SEC-042] forwarded paths cannot escape the API base path` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.apiBasePath` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-042/` |
| Adoption | Nothing needed: the URL builder ships with bff-auth and replaces any string-joining proxy. |

Known evasions:

- a handler that builds the upstream URL without the shipped builder
- an encoding missing from the test table

## SEC-043

**Give route files only to the catch-all, the auth routes and allowlisted handlers.**

A web architecture test lists every route file in the app directory and fails any that is not the catch-all proxy, an auth route or a dated allowlist entry; Server Actions are browser-invokable too and are held by SEC-034, not by this list.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[SEC-043] the only route files are the catch-all, the auth routes and allowlisted handlers` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-043/` |
| Adoption | Allowlist: existing dedicated handlers get dated entries that name their reason. |

## SEC-044

**Call only the same-origin BFF from the browser, never the API origin.**

The cross-stack/no-direct-api-origin rule flags absolute http(s) URL literals passed to fetch, HTTP-client factories, EventSource and WebSocket outside the configured server paths.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-direct-api-origin` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `rules.SEC-031.serverPaths` (planned) |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-044/` |
| Adoption | Baseline: existing direct calls go into the shrink-only ESLint bulk suppressions. |

Known evasions:

- an absolute URL assembled from variables at runtime
- an HTTP client instance created with a configurable base URL

## SEC-045

**Resolve Next.js at or above the Standard's security floor.**

The kit's floor check reads the next version resolved in the lockfile and fails below the minimum patched version kept in one data file that docs and templates also read, because audit tools can lag the framework's own advisories.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `doctor` / `next-floor` |
| Tier | 1 — invariant 6: Secrets and the supply chain are protected |
| Module | core |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0071](../decisions/0071-nextjs-security-floor.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-045/` |
| Adoption | Fix first: upgrade next to the floor before adopting; it is a patch-level bump within 16.x. |

## SEC-046

**Use browser storage only through the storage module, and sessionStorage never.**

The scope-aware cross-stack/no-web-storage rule flags the localStorage and sessionStorage globals and member access to them outside the storage module, and sessionStorage everywhere; the module's keys are typed, never hold credentials and are cleared at session end.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-web-storage` |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.SEC-046.storageModule` (planned) |
| Decision | [ADR 0083](../decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-046/` |
| Adoption | Allowlist: no ESLint bulk suppressions for this rule; each existing use needs a dated allowlist entry linked to a migration ADR. |

Known evasions:

- a property name computed at runtime
- a credential written under a non-credential key inside the storage module
- IndexedDB or script-readable document.cookie writes
- keys the storage module fails to clear at session end

## SEC-047

**Write no raw HTML sinks such as dangerouslySetInnerHTML, innerHTML or document.write.**

The cross-stack/no-raw-html rule flags the dangerouslySetInnerHTML key in JSX attributes, spread objects and createElement props, innerHTML and outerHTML assignments and insertAdjacentHTML and document.write calls; rich text renders only through one ADR-approved sanitizing wrapper.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-raw-html` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0086](../decisions/0086-no-raw-html-sinks.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-047/` |
| Adoption | Allowlist: existing sinks get dated entries until they move behind the sanitizing wrapper. |

Known evasions:

- a third-party component that renders an HTML string
- another HTML-parsing API such as DOMParser or Range.createContextualFragment
- a property name computed at runtime

## SEC-048

**Point browser tooling only at local or dev test accounts, and copy nothing it observes.**

Because the Chrome DevTools MCP companion can see cookies and request headers, reviewers verify it is only aimed at local or development environments signed in with test accounts, and that nothing it captures leaves the machine.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `browser-check` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0106](../decisions/0106-companion-plugins.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: adopt states it when it offers the companion, and it is checked in review. |

## SEC-059

**Expire the session cookie before the backend token.**

The cookie max-age is set below the token expiration and both values are documented side by side in each app's example env file, so a user never looks signed in while every call fails.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0073](../decisions/0073-bff-auth-module.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review; adopt writes both values next to each other in the example env files. |

## SEC-060

**Choose cookie-session SPA auth without a BFF only through an ADR that confirms its constraints.**

When the configured web auth variant is the stateful SPA session, the manifest must reference an existing project ADR that confirms one shared site, no custom tenant domains and no non-browser clients, the constraints under which that lighter variant is safe.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-standard-config` / `spa-auth-adr` |
| Tier | 2 |
| Module | core |
| Profiles | `react-spa` |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-060.enabled` (planned), `rules.SEC-060.variant` (planned), `rules.SEC-060.adr` (planned) |
| Decision | [ADR 0075](../decisions/0075-react-spa-profile-after-1-0.md) |
| Since | 1.1.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-060/` |
| Adoption | Opt-in: arrives with the react-spa profile after 1.0; the ADR is written when the stateful variant is declared. |

Known evasions:

- an ADR recorded while one of its constraints does not hold

## SEC-067

**Call the shared same-origin check in every mutating Route Handler.**

The cross-stack/same-origin-mutations rule fails every exported POST, PUT, PATCH and DELETE handler in a route file that does not call the shared assertSameOrigin helper before doing any work.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/same-origin-mutations` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.bff-auth.originHelper` (planned) |
| Decision | [ADR 0074](../decisions/0074-bff-csrf-defense.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-067/` |
| Adoption | Allowlist: no bulk suppression for a Tier-1 rule; existing handlers get dated allowlist entries until they call the helper. |

Known evasions:

- the check is reached through an alias the rule does not resolve
- the check is called after a side effect has already run

## SEC-068

**List only exact hosts as Server Action allowed origins, never null or a wildcard.**

A config check reads experimental.serverActions.allowedOrigins and fails on "null" or any entry containing \*, unless a dated allowlist entry records why, because a wildcard admits sibling tenant subdomains.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-next-config` / `server-action-origins` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0074](../decisions/0074-bff-csrf-defense.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-068/` |
| Adoption | Allowlist: an existing wildcard entry needs a dated allowlist entry with its reason. |

Known evasions:

- an allowedOrigins value computed at runtime

## SEC-070

**Change nothing in GET and HEAD Route Handlers: no cookie writes, no mutating upstream calls.**

The cross-stack/no-mutating-get-handler rule fails exported GET and HEAD handlers in route files that set or delete cookies or call an upstream method other than GET or HEAD, because SameSite=Lax cookies ride top-level navigations.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-mutating-get-handler` |
| Tier | 2 |
| Module | `bff-auth` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0074](../decisions/0074-bff-csrf-defense.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-070/` |
| Adoption | Baseline: existing findings go into the shrink-only ESLint bulk suppressions. |

Known evasions:

- a mutation reached through a helper the rule does not resolve
- a fetch whose method is computed at runtime

## SEC-072

**Export no runtime segment config from proxy.ts.**

A web architecture test imports the proxy module and fails when it exports runtime, because the Next.js 16 proxy runs only on the Node.js runtime and a runtime export is left over from the edge middleware model.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[SEC-072] the proxy exports no runtime segment config` |
| Tier | 2 |
| Module | core |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0070](../decisions/0070-proxy-ux-only-session-reverification.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-072/` |
| Adoption | Fix first: delete the runtime export while renaming middleware to proxy. |

## SEC-073

**Run Chrome DevTools MCP only from the pinned companion plugin, unapproved in settings.**

A doctor check requires chrome-devtools-mcp to come from the Standard's pinned marketplace entry, which runs an exact version with --isolated, --no-usage-statistics, --no-performance-crux and --redact-network-headers, with no second copy beside it and no committed enabledMcpjsonServers or enableAllProjectMcpServers.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `companion-chrome` |
| Tier | 2 |
| Module | `browser-check` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0106](../decisions/0106-companion-plugins.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/SEC-073/` |
| Adoption | Opt-in: adopt offers the companion and installs it at project scope when the user agrees; headless and CI runs disable the server. |

Known evasions:

- a second chrome-devtools-mcp plugin from another marketplace, or a user-scope install outside the project's settings
- a project .mcp.json server of the same name next to the companion
- the server approved in settings.local.json or user settings, which are not committed

## I18N-012

**Use logical-direction utility classes, never physical left and right.**

cross-stack/no-physical-direction splits class strings into utilities, strips variant, important and negative prefixes and reports physical margin, padding, inset, text-align, rounding, border, float, clear and scroll utilities, plus the deprecated start and end inset names, whenever a configured locale is right-to-left.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-physical-direction` / `utilityClasses` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0081](../decisions/0081-logical-direction-styling.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-012/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- class names assembled at run time from fragments
- stylesheets and CSS modules, including @apply, which the rule does not lint

## I18N-015

**Reference only translation keys that exist in the source locale's typed web messages.**

The installed i18n library's type augmentation is generated from the source locale's messages, so the type check rejects an unknown static namespace or key, and the kit's check-typed-keys sub-check fails when the augmentation is missing or out of date.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-typed-keys` / `web-message-keys` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0080](../decisions/0080-locale-parity.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-015/` |
| Adoption | Nothing needed: adopt generates the augmentation; parity gaps are handled by the parity rules. |

Known evasions:

- keys cast to the library's key type or to a looser type
- keys built at run time where the library accepts plain strings

## I18N-018

**Never choose user-facing copy by comparing the locale with a literal.**

cross-stack/no-locale-branching reports conditional, logical, if and switch tests that compare a value with a configured locale literal outside the localized-field helper, so copy comes from message files rather than hard-coded locale branches.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-locale-branching` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `locales`, `modules.i18n.localizedFieldHelper` (planned) |
| Decision | [ADR 0078](../decisions/0078-labels-and-multilingual-content.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-018/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- lookup objects keyed by locale
- string methods such as locale.startsWith()
- comparisons with a variable that holds the locale literal

## I18N-020

**Make the localized-field helper prefer the reader's locale and fall back through the chain.**

A table-driven test over the configured locales asserts that the helper returns the current locale's value, then the default locale's, then the others', skipping empty values.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[I18N-020] localized-field helper follows the locale fallback chain` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `locales`, `modules.i18n.defaultLocale` (planned) |
| Decision | [ADR 0078](../decisions/0078-labels-and-multilingual-content.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-020/` |
| Adoption | Nothing needed: the kit ships the helper and its test. |

Known evasions:

- inputs outside the test table
- a second helper the test does not import

## I18N-021

**Prefix every locale route, never auto-detect, and use the configured locales and a project cookie.**

A test imports the routing configuration and asserts localePrefix always, localeDetection false, locales and defaultLocale equal to the project configuration and a locale cookie name other than the library default, so the URL alone decides the locale.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[I18N-021] locale routing config matches the project config` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `locales`, `modules.i18n.defaultLocale` (planned), `modules.i18n.localeCookie` (planned) |
| Decision | [ADR 0079](../decisions/0079-web-locale-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-021/` |
| Adoption | Fix first: brownfield routing is migrated to the kit's routing module. |

Known evasions:

- a second routing configuration the test does not import

## I18N-022

**Pin the configured business time zone in the i18n request configuration.**

A test asserts that the time zone the request configuration exports is a valid IANA zone equal to the configured business time zone, so server and client render dates identically.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[I18N-022] i18n request config pins the configured time zone` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `modules.i18n.timeZone` (planned) |
| Decision | [ADR 0079](../decisions/0079-web-locale-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-022/` |
| Adoption | Nothing needed: adopt writes the configured zone. |

Known evasions:

- a request configuration that does not use the exported constant

## I18N-023

**Navigate only through the locale-aware wrappers, never next/link or the replaced router APIs.**

A cross-stack/module-boundary entry reports static, dynamic, require and export-from imports of next/link and of useRouter, usePathname, redirect and permanentRedirect from next/navigation outside the i18n navigation module, so every link and redirect keeps the locale prefix.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/module-boundary` / `framework-navigation` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0079](../decisions/0079-web-locale-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-023/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- a third-party link or router component that wraps next/link or next/navigation internally
- a replaced API reached through a namespace import of next/navigation

## I18N-024

**Never hand-build locale-prefixed hrefs.**

A global no-restricted-syntax selector reports template literals whose text starts with a slash followed by the locale identifier anywhere in web code, because the locale-aware wrappers add the prefix, the navigation module included.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `no-restricted-syntax` / `TemplateLiteral[quasis.0.value.raw='/'][expressions.0.name='locale']` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0079](../decisions/0079-web-locale-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-024/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- string concatenation
- a locale variable with another name
- a prefix built by a helper function
- a later config object that redefines no-restricted-syntax for some files, replacing every selector there

## I18N-025

**Derive the current locale from the URL in one helper that accepts only configured locales.**

A test feeds the helper every configured locale, region and script subtags included, plus unknown segments, and asserts that only configured locales are returned and anything else yields the default.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[I18N-025] locale-from-path helper returns only configured locales` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | `locales`, `modules.i18n.defaultLocale` (planned) |
| Decision | [ADR 0079](../decisions/0079-web-locale-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-025/` |
| Adoption | Nothing needed: the kit ships the helper and its test. |

Known evasions:

- pathname splitting outside the helper

## I18N-026

**Place every page route under the locale segment.**

An architecture test lists the page files under the app directory and fails on any outside the locale segment, framework root files excepted, so no screen is reachable without a locale.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — vitest: `[I18N-026] architecture: no page route outside the locale segment` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0079](../decisions/0079-web-locale-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-026/` |
| Adoption | Allowlist: dated entries for legacy pages still being moved under the locale segment. |

## I18N-027

**Set lang and dir on the document root from the active locale.**

cross-stack/html-lang-dir requires the root layout's html element to bind lang and dir to expressions, with the direction taken from the hard-coded right-to-left locale list, so layout and assistive technology follow the active locale.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/html-lang-dir` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | `next` |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0077](../decisions/0077-i18n-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-027/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, shrink-only under check-baselines. |

Known evasions:

- lang or dir bound to an expression that does not derive from the active locale

## I18N-039

**Send the active UI locale, not the browser's, as Accept-Language from the web client.**

A template test drives the BFF proxy, or the SPA API client, with a browser Accept-Language that differs from the active locale and asserts the upstream request carries the active locale, so server messages match the screen.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[I18N-039] sends the active locale as Accept-Language` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0077](../decisions/0077-i18n-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-039/` |
| Adoption | Nothing needed: the kit's proxy and client set the header. |

Known evasions:

- a second HTTP client that bypasses the proxy or the shared client

## I18N-044

**Derive every configured locale's direction from the one hard-coded right-to-left locale list.**

A unit test derives the direction of every configured locale, region and script subtags included, from the shared right-to-left locale list and asserts the result, because Intl.Locale getTextInfo() is missing on Node.js 22 and in some supported browsers.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — vitest: `[I18N-044] every configured locale gets its direction from the right-to-left locale list` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0077](../decisions/0077-i18n-module.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/I18N-044/` |
| Adoption | Nothing needed: the kit ships the list, the helper and the test. |

Known evasions:

- direction computed elsewhere without the shared helper

## UI-001

**Import no feature code or generated contract types in UI primitives.**

No module in the UI primitive folder imports, directly or transitively, from a feature folder or from the generated API contract, so primitives stay reusable and free of domain shapes.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `ui-imports-no-product-code` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.UI-001.uiPath` (planned), `modules.api-contract.webTypesPath` (planned) |
| Decision | [ADR 0062](../decisions/0062-frontend-layer-boundaries.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-001/` |
| Adoption | Baseline: existing edges go into the dependency-cruiser known-violations baseline, which PROC-027 keeps shrink-only. |

## UI-002

**Keep UI primitives from reaching the i18n library, directly or through other modules.**

No module in the UI primitive folder imports the configured i18n library, any of its subpaths or a project module that reaches it, which keeps translation in the calling feature and passes user-facing strings to primitives as props.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — depcruise: `ui-no-i18n-library` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.UI-001.uiPath` (planned), `rules.UI-002.i18nLibrary` (planned) |
| Decision | [ADR 0065](../decisions/0065-ui-primitives-and-request-states.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-002/` |
| Adoption | Baseline: existing edges go into the dependency-cruiser known-violations baseline, which PROC-027 keeps shrink-only. |

## UI-004

**Use the z-index token ladder, never arbitrary z-index values.**

Stacking order comes only from the z-index token ladder: arbitrary z-\[n\] classes, \[z-index:n\] properties, numeric z utilities the theme has removed and numeric zIndex style values are rejected.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-arbitrary-z-index` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.UI-004.ladder` (planned) |
| Decision | [ADR 0065](../decisions/0065-ui-primitives-and-request-states.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-004/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a z-index declared in a CSS file
- a class string assembled at run time

## UI-005

**Style with one system: no preprocessor stylesheets, CSS-in-JS modules or &lt;style jsx> blocks.**

Source files import no .scss, .sass, .less or .styl stylesheet and no CSS-in-JS module outside the styling system declared in the stack table, and render no &lt;style jsx> block, which Next.js supports with no dependency to detect; a competing styling library in the manifest is PROC-007's concern.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/one-styling-system` |
| Tier | 1 — invariant 1: Stack-first |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `stack.styling.use` (planned) |
| Decision | [ADR 0066](../decisions/0066-design-tokens.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-005/` |
| Adoption | Baseline: existing preprocessor or CSS-in-JS imports go into ESLint bulk suppressions (shrink-only) while a declared stack migration removes them. |

Known evasions:

- a CSS-in-JS library missing from the rule's banned list
- a module loaded through a computed dynamic import specifier
- styles injected at run time through a created style element

## UI-006

**Hand-write CSS only where the utility system falls short, each block with a why-comment.**

Every rule block in project CSS outside the token source is preceded by a comment that names what the installed utility system could not express, so hand-written CSS stays the documented escape hatch.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-css` / `escape-hatch-comment` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | no (opt-in) |
| Configurable | `rules.UI-006.enabled` (planned), `rules.UI-007.tokenSource` (planned), `rules.UI-007.cssGlobs` (planned) |
| Decision | [ADR 0006](../decisions/0006-stack-first.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-006/` |
| Adoption | Opt-in: existing uncommented blocks go into a dated allowlist file that shrinks as blocks are commented or removed. |

Known evasions:

- a boilerplate comment that names no limitation
- a CSS file outside the configured globs
- styling written as inline style objects instead of CSS

## UI-007

**Define design tokens in one source; other CSS may only alias them.**

Custom properties declared outside the token source's theme block are pure var() aliases of theme tokens, so every design value has a single definition.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-css` / `token-source` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.UI-007.tokenSource` (planned), `rules.UI-007.cssGlobs` (planned) |
| Decision | [ADR 0066](../decisions/0066-design-tokens.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-007/` |
| Adoption | Allowlist: existing declarations outside the token source get dated entries and move into the source over time. |

Known evasions:

- a CSS file outside the configured globs
- a custom property set in an inline style object or an arbitrary-property class

## UI-008

**Compose chart and SVG color token references only in the chart-token module.**

String and template literals containing var(--color-...) appear only in the configured chart-token module, so charts and SVGs take their colors from one token mapping.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-inline-color-token` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.UI-008.chartTokenModule` (planned) |
| Decision | [ADR 0066](../decisions/0066-design-tokens.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-008/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a token reference assembled from string fragments
- a token value read at run time through getComputedStyle

## UI-009

**Reference color tokens without fallback values.**

A var(--token) reference in string or template literals carries no fallback value, so a missing token fails visibly instead of silently rendering a hard-coded color.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/no-token-fallback` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0066](../decisions/0066-design-tokens.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-009/` |
| Adoption | Baseline: existing violations go into ESLint bulk suppressions, which PROC-015 keeps shrink-only. |

Known evasions:

- a fallback written in a CSS file
- a fallback assembled from string fragments

## UI-010

**Route overlays through the shared overlay utilities; no createPortal elsewhere.**

A cross-stack/confine-api entry lets only the configured overlay modules reach createPortal from react-dom, whether imported by name, through the default or a namespace import or through require, so dialogs, popovers and menus share one focus-trap, positioning and z-index path.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — eslint: `cross-stack/confine-api` / `createPortal` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | no (opt-in) |
| Configurable | `rules.UI-010.enabled` (planned), `rules.UI-010.overlayModules` (planned) |
| Decision | [ADR 0065](../decisions/0065-ui-primitives-and-request-states.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-010/` |
| Adoption | Opt-in: existing portals go into ESLint bulk suppressions until they move behind the overlay utilities. |

Known evasions:

- a portal component from a third-party UI library
- per-component focus-trap or positioning code that needs no portal

## UI-012

**Pass an automated accessibility scan, target size included, on every journey page.**

A local accessibility command, which the end-to-end CI step only calls, scans every page the journey visits plus a UI-primitives fixture page with the WCAG 2.2 AA axe tags, target size included, and fails on any violation.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — ci: `axe-scan` / `web-e2e` |
| Tier | 2 |
| Module | core |
| Profiles | all |
| Enabled by default | no (opt-in) |
| Configurable | `rules.UI-012.enabled` (planned) |
| Decision | [ADR 0068](../decisions/0068-frontend-testing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/UI-012/` |
| Adoption | Opt-in: turned on with the end-to-end job; each known violation gets a dated allowlist entry with a reason. |

Known evasions:

- states and screens the journey never renders
- axe rules or selectors excluded in the scan configuration
- defects automated scanning cannot detect, such as an inaccurate accessible name

## UI-013

**Browser-check every changed screen before reporting UI work done.**

With the browser-check module on, each changed screen is opened with the Chrome DevTools MCP companion against a local or development environment and checked for rendering, console errors and failed requests before UI work is reported done.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `browser-check` |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0106](../decisions/0106-companion-plugins.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: applies to new UI work once the companion is installed and the module is on. |

## CI-002

**Run typecheck, lint, format, boundaries, dead code and tests with coverage in the web chain.**

A CI-parity sub-check reads package.json and requires the check script to run the typecheck, ESLint, the formatter check, dependency-cruiser, knip and the test suite with its coverage thresholds, plus a check:fast script for the Stop hook.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `web-check-members` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0090](../decisions/0090-ci-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/CI-002/` |
| Adoption | Nothing needed: adopt writes check and check:fast into package.json and keeps any stricter existing member. |

Known evasions:

- a member script redefined as a no-op or with its failure swallowed, for example by appending || true
- a member run with weakened flags, such as a narrowed file list

## CI-003

**Run the production build in the web quality job.**

A CI-parity sub-check requires the web quality job, or the reusable web workflow it calls, to have a step that runs the framework's production build without continue-on-error, so errors only a build reveals fail the pull request instead of a later deploy.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `web-build-step` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | all |
| Enabled by default | yes |
| Configurable | `rules.CI-009.qualityJob` (planned) |
| Decision | [ADR 0090](../decisions/0090-ci-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/web/violations/CI-003/` |
| Adoption | Fix first: the reusable web workflow ships the build step; a build that needs a runtime secret is fixed before adopting. |

Known evasions:

- the build step runs a different command under the build step's name
- an if: condition skips the build step
