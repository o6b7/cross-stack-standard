# Web track

The `web` track covers a Next.js application on the App Router (profile `next`): its layers, server
state, environment, security floor, accessibility and, with modules, a cookie BFF in front of the
API and locale routing. A React single-page profile (`react-spa`, Vite) ships after 1.0
([ADR 0075](../decisions/0075-react-spa-profile-after-1-0.md)).

> **Status in 0.1.0.** 88 web rules and 44 rules shared with the mobile track, all REVIEW. Of the
> web rules, 19 target FORCED, 56 target GUARDED and 13 stay REVIEW; of the shared web and mobile
> rules, 18 target FORCED, 21 target GUARDED and 5 stay REVIEW. Claude follows them through the
> skill and `/cross-stack-standard:audit` reports them. The gates below are planned, not shipped;
> see the [roadmap](../../ROADMAP.md). Full lists: [web rules](../rules/web.md) and
> [web and mobile rules](../rules/client.md).

## What the planned gates target

| Tool       | Target                                                           | Decision                                                                                        |
| ---------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Next.js    | 16.x only, at or above the Standard's security floor (SEC-045)   | [0072](../decisions/0072-nextjs-16-only.md), [0071](../decisions/0071-nextjs-security-floor.md) |
| ESLint     | 9.39.x, with an ESLint 10 canary; the shared config accepts both | [0059](../decisions/0059-javascript-toolchain-pins.md)                                          |
| TypeScript | Below 6.1 (`~5.9` for Next.js projects), strict mode             | [0059](../decisions/0059-javascript-toolchain-pins.md)                                          |
| Node.js    | 22.13 or later                                                   | [0059](../decisions/0059-javascript-toolchain-pins.md)                                          |

Exact versions and their sources are in [verified-versions.md](../maintainers/verified-versions.md).

## The architecture in one paragraph

Code lives in feature folders with `hooks/`, `components/` and `lib/`; dependencies point one way,
from routes to features to shared code, never back, and without cycles
([ADR 0062](../decisions/0062-frontend-layer-boundaries.md)). Server data lives only in the
server-state cache, list filters in the URL, and UI state in components; a global store needs a
real shared consumer ([ADR 0063](../decisions/0063-client-state-layering.md)). Query keys come from
per-domain `queryOptions()` factories ([ADR 0064](../decisions/0064-query-key-factories-and-url-state.md)).
Lists are driven by the server ([ADR 0049](../decisions/0049-server-driven-collections.md)).
Environment variables are read through one typed, validated module
([ADR 0069](../decisions/0069-typed-env-module.md)). Wire shapes come from generated contract
types ([ADR 0054](../decisions/0054-generated-api-contract.md)). The proxy's session redirect is
UX only: every Route Handler and Server Action checks the session again and leaves authorization to
the backend ([ADR 0070](../decisions/0070-proxy-ux-only-session-reverification.md)).

## Key rules

| Area                 | Rules (target)                                                                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure            | WEB-001 kebab-case names (FORCED), WEB-003 feature folder shape (FORCED), WEB-004 no barrels in features (FORCED)                                                                                                                                                                                                            |
| Boundaries           | WEB-005 cross-feature imports through hooks or lib (FORCED), WEB-006 shared lib never imports features (FORCED), WEB-007 no cycles (FORCED), UI-001 UI primitives stay generic (FORCED)                                                                                                                                      |
| State and data       | WEB-014 server data only in the cache (REVIEW), WEB-033 query-key factories (GUARDED), WEB-012 no client pagination over a server page (GUARDED), WEB-037 one HTTP client (GUARDED)                                                                                                                                          |
| Environment          | WEB-011 env through the typed module (GUARDED), WEB-010 every env key documented (FORCED)                                                                                                                                                                                                                                    |
| TypeScript and lint  | WEB-021 no explicit `any` (FORCED), WEB-022 strict and stylistic type-checked configs (FORCED), MOB-027 no suppression comments (FORCED), WEB-017 no TypeScript enums (GUARDED)                                                                                                                                              |
| Size and complexity  | WEB-025 file length (FORCED), WEB-026 complexity (FORCED), WEB-050 nesting depth (FORCED), WEB-051 function length (FORCED)                                                                                                                                                                                                  |
| Hygiene              | WEB-024 formatter check in `check` (GUARDED), WEB-027 no commented-out code (GUARDED), WEB-028 no dead code (GUARDED), WEB-029 no new clones (GUARDED)                                                                                                                                                                       |
| Security             | SEC-034 re-verify the session in every Route Handler and Server Action (GUARDED), SEC-045 Next.js floor (FORCED), SEC-031 `server-only` in server modules (FORCED), SEC-047 no raw HTML sinks (GUARDED), SEC-046 browser storage only through the storage module (GUARDED), SEC-072 no runtime config in `proxy.ts` (FORCED) |
| Accessibility and UI | WEB-020 jsx-a11y at error (FORCED), UI-003 design tokens, not raw colours (GUARDED), UI-005 one styling system (GUARDED)                                                                                                                                                                                                     |
| Tests                | WEB-030 coverage floors (GUARDED), WEB-002 colocated tests (FORCED)                                                                                                                                                                                                                                                          |

## Modules on this track

| Module          | Web rules | What it adds                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bff-auth`      | 21        | A cookie BFF in front of the bearer-token API: `__Host-` HttpOnly cookies (SEC-036), a same-origin check on every mutation (SEC-035, SEC-067), exact Server Action origins (SEC-068), side-effect-free GET handlers (SEC-070), a header allow-list and path containment for forwarding (SEC-041, SEC-042) ([ADR 0073](../decisions/0073-bff-auth-module.md), [ADR 0074](../decisions/0074-bff-csrf-defense.md)). |
| `i18n`          | 14        | Locale-prefixed routes, locale-aware navigation, `lang` and `dir` on the root, logical-direction classes; see [Internationalization and RTL](../i18n-rtl.md#web-nextjs).                                                                                                                                                                                                                                         |
| `api-contract`  | 1         | Generated contract types for every wire shape (WEB-018), regenerated in CI and diffed (CI-006).                                                                                                                                                                                                                                                                                                                  |
| `browser-check` | 3         | Routine local checks with the pinned Playwright MCP server; Chrome DevTools MCP remains available for advanced diagnostics ([ADR 0108](../decisions/0108-playwright-mcp-for-browser-checks.md)).                                                                                                                                                                                                                 |
| `observability` | 1         | Request ids on upstream calls, planned after 1.0.                                                                                                                                                                                                                                                                                                                                                                |

## Planned gate stack

- **ESLint** with `eslint-config-next`, typescript-eslint `strictTypeChecked` and
  `stylisticTypeChecked`, every recommended jsx-a11y rule at error, and size and complexity limits
  ([ADR 0060](../decisions/0060-javascript-lint-baseline.md)).
- **The Standard's own ESLint plugin**, `cross-stack` (MIT), for the rules generic plugins cannot
  express, for example `no-client-pagination`, `no-inline-query-key`, `env-module-only`,
  `route-handler-session`, `same-origin-mutations`, `no-physical-direction` and `no-commented-code`
  ([ADR 0061](../decisions/0061-own-eslint-plugin-no-commented-code.md)). Its only escape hatch is
  `eslint-disable-next-line <rule> -- <reason>`.
- **dependency-cruiser** for layer boundaries and cycles, run through a wrapper that fails when
  nothing was cruised.
- **Vitest architecture tests** for naming, colocation, feature shape and the route table, evaluated
  by import rather than by pattern matching.
- **knip** for dead code and **jscpd** for duplication, each with a shrink-only baseline
  ([ADR 0092](../decisions/0092-dead-code-and-duplication-gates.md)); **Prettier** in check mode;
  **Vitest coverage** floors measured at adoption ([ADR 0091](../decisions/0091-coverage-floors.md)).
- **A Playwright journey** with an axe accessibility scan in the CI template
  ([ADR 0068](../decisions/0068-frontend-testing.md)).

Existing ESLint violations go into ESLint's bulk suppressions, and dependency-cruiser violations into
its known-violations file; both only shrink.

## Working on this track in 0.1.0

- PostToolUse runs Prettier and then ESLint on each file Claude edits, using the versions installed
  in the project, and feeds errors back as `file:line rule message`.
- The Stop gate runs the `check:fast` npm script when `package.json` defines it. A good `check:fast` runs
  the type-check, ESLint, Prettier in check mode and the fast tests.
- Claude cites the rule IDs above as it works; `/cross-stack-standard:audit` reports an existing
  codebase against them.
