# Web track

Rules for web clients: Next.js App Router (the `next` profile, the default) and the React SPA
profile (`react-spa`, planned after 1.0). Rules marked Tier 1 apply to every project with the web
track; the others apply once the project declares Tier 2. Rules marked with a profile apply only to
it. Module rules live in [bff-auth.md](bff-auth.md), [api-contract.md](api-contract.md),
[i18n-rtl.md](i18n-rtl.md) and [companions.md](companions.md). Rules
shared with the mobile track are repeated here so this file stands alone.

## Rules

### Layers and files

- **WEB-001** Name files and directories under the source root in kebab-case
- **WEB-002** Colocate every test file beside the source file it tests; no aggregate test folders
- **WEB-003** Give feature folders only `hooks/`, `components/` and `lib/`, always `hooks/`, with `use-*` hook files
- **WEB-004** Put no barrel or re-export modules inside feature folders
- **WEB-005** Import another feature only through its hooks/ or lib/, never its components/
- **WEB-006** Never import a feature from a shared lib module, directly or transitively
- **WEB-007** Keep the import graph free of cycles
- **WEB-008** Never import app routes from below the route layer
- **WEB-009** Import no React, framework or server-state library in feature lib/ modules
- **WEB-016** Keep route pages to composition and layout, and put business logic in features
- **WEB-023** Use named exports, and default-export only where the framework requires it
- **UI-001** Import no feature code or generated contract types in UI primitives
- **SEC-031** Import `server-only` in every module under the configured server paths _(next profile)_

### State and data

- **WEB-012** Never paginate a server page on the client
- **WEB-013** Drive lists from the server: send page, filters and sort to the API and render its total
- **WEB-014** Keep server data only in the server-state cache, never in a client store
- **WEB-015** Keep list filters in the URL and UI state in components; add a store only for a shared consumer
- **WEB-033** Define query keys in per-domain `queryOptions()` factories, never as inline arrays outside hooks
- **WEB-034** Invalidate the resource root key after every mutation
- **WEB-035** Show mutation feedback once, from the central mutation cache; opt out only with silent meta
- **WEB-036** Build autosave editors on local state that leads the server copy, invalidating keys on unmount
- **WEB-037** Create the HTTP client once and send every request through the shared fetcher
- **WEB-038** Keep the API version segment only in the upstream base URL
- **WEB-039** Poll live data through the server-state cache; import a realtime client only with a recorded ADR

### Contract types and forms

- **WEB-017** Declare no TypeScript enums
- **WEB-018** Use the generated contract types for every wire shape; never redeclare one by hand _(Tier 1; api-contract module)_
- **WEB-019** Render contract types directly; let a view-model only add display fields and keep the raw row
- **WEB-042** Validate each field on the client in forms above the configured field count
- **WEB-043** Map server validation errors onto their fields and wire aria-invalid and aria-describedby

### Environment and logging

- **WEB-010** Document every key of the typed env schema in the example env file
- **WEB-011** Read environment variables only through the typed, schema-validated env module
- **WEB-040** Log only through the logger module; no direct console calls

### UI and styling

- **UI-003** Use design tokens, never raw color literals
- **UI-004** Use the z-index token ladder, never arbitrary z-index values
- **UI-005** Style with one system: no preprocessor stylesheets, CSS-in-JS modules or `<style jsx>` blocks _(Tier 1)_
- **UI-006** Hand-write CSS only where the utility system falls short, each block with a why-comment _(off by default)_
- **UI-007** Define design tokens in one source; other CSS may only alias them
- **UI-008** Compose chart and SVG color token references only in the chart-token module
- **UI-009** Reference color tokens without fallback values
- **UI-010** Route overlays through the shared overlay utilities; no `createPortal` elsewhere _(off by default)_
- **UI-011** Render loading, error and empty states through the shared state primitives
- **UI-012** Pass an automated accessibility scan, target size included, on every journey page _(off by default)_
- **WEB-020** Keep every recommended jsx-a11y rule at error severity

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
- **PROC-032** Keep ESLint, TypeScript, @types/node and Node inside the Standard's supported ranges _(Tier 1)_
- **PROC-033** Run dependency-cruiser only through the kit wrapper that fails when nothing was cruised _(Tier 1)_
- **CI-010** Run ESLint at zero warnings in every JavaScript check chain _(Tier 1)_

### Dead code, duplication, tests and CI

- **WEB-028** Leave no unused files, exports or dependencies on the web track
- **WEB-029** Introduce no copy-paste clones beyond the committed duplication baseline
- **WEB-030** Meet the configured unit-test coverage floors _(Tier 1)_
- **WEB-031** Unit-test security-contract code to the higher security coverage floor _(off by default)_
- **WEB-032** Run one end-to-end journey (sign-in, CRUD, sign-out) against a seeded backend in the web workflow _(off by default)_
- **CI-002** Run typecheck, lint, format, boundaries, dead code and tests with coverage in the web chain _(Tier 1)_
- **CI-003** Run the production build in the web quality job _(Tier 1)_

### Security on the web

- **SEC-058** Use client permission checks only to hide or disable UI, and authorize every action on the server _(Tier 1)_
- **SEC-046** Use browser storage only through the storage module, and `sessionStorage` never _(Tier 1)_
- **SEC-047** Write no raw HTML sinks such as `dangerouslySetInnerHTML`, `innerHTML` or `document.write` _(Tier 1)_
- **SEC-045** Resolve Next.js at or above the Standard's security floor _(Tier 1; next profile)_
- **SEC-033** Limit the proxy session redirect to a cookie-presence check that never authorizes _(next profile)_
- **SEC-034** Re-verify the session in every Route Handler and Server Action, and authorize in the backend _(Tier 1; next profile)_
- **SEC-072** Export no runtime segment config from `proxy.ts` _(next profile)_

### React SPA profile (after 1.0)

- **WEB-052** Send credentials and the XSRF token from the SPA client, and fetch the CSRF cookie first _(react-spa profile; off by default)_
- **SEC-060** Choose cookie-session SPA auth without a BFF only through an ADR that confirms its constraints _(react-spa profile; off by default)_

## Sanctioned patterns

**Layers** ([ADR 0062][0062]). Default paths, configurable; dependencies flow downward only:

```text
src/app/                  routes: composition and layout only
src/features/<feature>/   hooks/ (use-*.ts), components/ (private), lib/ (framework-free)
src/components/ui/        UI primitives: no feature code, no contract types, no i18n library
src/lib/                  shared code: never imports a feature
```

Other features are imported only through their `hooks/` or `lib/`. No barrel files, no cycles, named
exports except where Next.js requires a default, kebab-case names (route syntax such as `[id]` and
`(group)` is exempt), and modules under the server paths import `server-only`.

**Server state** ([ADR 0063][0063], [ADR 0064][0064]). Server data lives only in the installed
server-state cache (TanStack Query, for example). Each domain exports its key root and
`queryOptions()` factories from its `hooks/` folder:

```ts
export const invoiceKeys = { root: ["invoices"] as const };

export const invoiceListOptions = (params: InvoiceListParams) =>
  queryOptions({
    queryKey: [...invoiceKeys.root, "list", params],
    queryFn: () => fetchInvoices(params),
  });
```

After a mutation, invalidate the resource root
(`queryClient.invalidateQueries({ queryKey: invoiceKeys.root })`). Live data polls with a refetch
interval that stops at a terminal state; a realtime client needs an ADR. A client store holds only
client state shared by separate trees.

**Lists** ([ADR 0049][0049]). Page, filters and sort live in the URL through the project's one
URL-state idiom (nuqs when installed, with its App Router adapter in the root layout; otherwise the
router's search params), go to the API, and the UI renders the server's total. Never page, filter or
sort a server page in the browser.

**HTTP and env** ([ADR 0069][0069]). One HTTP client instance and one shared fetcher; the API
version segment only in the base URL. The typed env module (`src/lib/env.ts` by default) validates
at load with the installed schema validator and is the only reader of `process.env`; public values
are literal `process.env.NEXT_PUBLIC_*` accesses and never hold secrets.

**Forms** ([ADR 0067][0067]). The installed form library; client validation for forms above about
five fields; the 422 problem's `errors` map is applied to each field, with `aria-invalid` and
`aria-describedby` wired; edit state typed from the generated contract. More than about fifteen
fields, or several steps: stop and ask.

**UI** ([ADR 0065][0065], [ADR 0066][0066]). Tokens defined once in the styling system's theme (a
Tailwind CSS 4 theme block, for example) and only aliased elsewhere; no raw color literals; the
z-index token ladder; overlays through the shared overlay layer, the only place `createPortal`
appears; loading, empty and error states through the shared `Skeleton`, `EmptyState` and
`ErrorState` primitives. An installed headless UI library is wrapped by the primitives.

**Tests** ([ADR 0068][0068], [ADR 0091][0091]). The installed runner (Vitest, for example); tests
beside their source (`resolve-redirect.test.ts` next to `resolve-redirect.ts`); unit tests go first
to code that deliberately repeats a backend rule or carries a security contract; one Playwright
journey (sign in, create, read, update, delete, sign out) with an `@axe-core/playwright` scan on
every page; coverage floors measured at adoption and never lowered.

**Lint and types** ([ADR 0059][0059], [ADR 0060][0060]). The framework ESLint preset plus
typescript-eslint `strictTypeChecked` and `stylisticTypeChecked` with `projectService`;
`--max-warnings=0`; `prettier --check`; jsx-a11y recommended rules at error; TypeScript `strict`;
ESLint, TypeScript, `@types/node` and Node inside the Standard's supported ranges;
dependency-cruiser only through the kit wrapper.

**Next.js security** ([ADR 0070][0070], [ADR 0071][0071], [ADR 0086][0086]). The proxy is a UX-only
session redirect that never authorizes and exports no `runtime`; every Route Handler and Server
Action (and every Server Component that fetches private data) re-verifies the session through the
shared server-side helper and leaves authorization to the API; `next` resolves at or above the
Standard's security floor. Browser storage only through the storage module, never `sessionStorage`,
never a credential. No raw HTML sinks: user rich text needs a project ADR and one sanitizing wrapper
component.

**React SPA profile** ([ADR 0075][0075]). Planned after 1.0; its rules are off by default and its
guidance stays constraints-only. Next.js-only rules (proxy, Route Handlers, Server Actions, Server
Components, `bff-auth`) do not apply to it.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them when writing and reviewing code, and
do not describe them as enforced by a gate. The shared ESLint config, the `cross-stack` ESLint
plugin, dependency-cruiser rules, knip and jscpd baselines and the CI template that will enforce
them arrive in later 0.x releases; until then the hooks and the project's own linters, type-checker
and tests are the only mechanical checks. `enforcement` in `${CLAUDE_PLUGIN_ROOT}/data/rules.json`
is authoritative for each ID.

## Decision records

- [ADR 0049][0049]: Server-driven collections: declared filters and sorts, capped pages, no client pagination over a server page
- [ADR 0059][0059]: JavaScript toolchain pins: ESLint 9.39, TypeScript below 6.1, Node 22.13 or later, Expo SDK 57
- [ADR 0060][0060]: JavaScript lint baseline: strict type-checked rules, formatter check, size and complexity limits, accessibility as errors
- [ADR 0062][0062]: Frontend layer boundaries: one-way dependencies, machine-enforced
- [ADR 0063][0063]: Client state layering: server cache, URL state, local state; no global store mandate
- [ADR 0064][0064]: Query-key factories with queryOptions() and one URL-state idiom
- [ADR 0065][0065]: UI primitives: shared focus and overlay utilities, i18n-decoupled, accessible; shared request-state components
- [ADR 0066][0066]: Design tokens are the single styling source
- [ADR 0067][0067]: Forms: installed form library first, required client validation, server field errors mapped to fields
- [ADR 0068][0068]: Frontend testing: targeted logic tests, colocated, one E2E journey with accessibility checks
- [ADR 0069][0069]: Typed environment module per JavaScript app; raw process.env banned by a three-rule combination
- [ADR 0070][0070]: Proxy redirects are UX only; every Route Handler and Server Action checks the session again
- [ADR 0071][0071]: Next.js security floor in one data file, gate-enforced
- [ADR 0075][0075]: React SPA profile ships after 1.0
- [ADR 0086][0086]: No raw HTML sinks; a sanitizer path only by ADR
- [ADR 0091][0091]: Coverage floors per track: configurable, measured at adoption, ratchet-only

[0049]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0049-server-driven-collections.md
[0059]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0059-javascript-toolchain-pins.md
[0060]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0060-javascript-lint-baseline.md
[0062]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0062-frontend-layer-boundaries.md
[0063]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0063-client-state-layering.md
[0064]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0064-query-key-factories-and-url-state.md
[0065]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0065-ui-primitives-and-request-states.md
[0066]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0066-design-tokens.md
[0067]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0067-forms.md
[0068]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0068-frontend-testing.md
[0069]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0069-typed-env-module.md
[0070]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0070-proxy-ux-only-session-reverification.md
[0071]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0071-nextjs-security-floor.md
[0075]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0075-react-spa-profile-after-1-0.md
[0086]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0086-no-raw-html-sinks.md
[0091]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0091-coverage-floors.md
