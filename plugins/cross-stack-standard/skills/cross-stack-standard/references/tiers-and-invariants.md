# Tiers and invariants

Which rules apply to every adopting project, and which only to projects that declare Tier 2
([ADR 0008][0008]). Tier 1 is at most ten invariants, each held by the tier-1 rules listed below. A
rule marked with a module applies once that module is on; a rule marked with a profile applies only
to that web profile.

## Declaring the tier

- The manifest declares `"tier": 1` or `"tier": 2` (PROC-001). When it is missing, ask the user;
  never infer the tier from repository size, age or contributor count.
- Tier 2 is due when at least two of these hold: the project is multi-tenant, more than one
  developer works on it, it is long-lived. Declining Tier 2 while two hold needs a recorded reason
  in the project's decision log (PROC-002).
- Re-check the trigger when the project changes: a new developer, a tenancy requirement or a longer
  planned life can move a Tier-1 project into Tier 2, and the manifest does not update itself.

Tier 2 also requires a decision log:

- **PROC-019** Keep a numbered ADR log in the configured decisions directory in a Tier-2 project

## Tier 1

### 1. Stack-first

The installed library owns its concern; one library per concern; new dependencies by ADR
([ADR 0006][0006]).

- **UI-005** Style with one system: no preprocessor stylesheets, CSS-in-JS modules or `<style jsx>` blocks
- **PROC-005** Record the stack table in the manifest, every concern filled and every named package installed
- **PROC-006** Prefer the installed library's idiomatic API, then its escape hatch, and explain hand-written code
- **PROC-007** Install at most one library per concern, test runners included
- **PROC-008** Import a deprecated library only inside its declared legacy paths, so new code uses the winner
- **PROC-009** Land each new runtime dependency with an ADR that names the alternatives considered

### 2. Server authority

The backend authorizes every action and owns the business rules. Clients render server results and
send intents; client permission checks only hide or disable UI. The Next.js server is a client too:
it re-verifies the session and leaves authorization to the API ([ADR 0012][0012]).

- **SEC-003** Declare `authorize()` in every FormRequest and never return a constant true from it
- **SEC-004** Resolve every non-public route to an existing policy ability, and allowlist public routes
- **SEC-005** Require authentication on every non-public API route
- **SEC-034** Re-verify the session in every Route Handler and Server Action, and authorize in the backend _(next profile)_
- **SEC-058** Use client permission checks only to hide or disable UI, and authorize every action on the server
- **PROC-010** Keep business rules on the backend, and name and test the source of any deliberate client mirror

### 3. Credentials are short-lived, revocable and never script-readable

httpOnly cookies on the web, the OS secure store on mobile, finite and revocable tokens on the API
([ADR 0083][0083]).

- **SEC-010** Revoke the current access token on logout _(off by default)_
- **SEC-011** Give access tokens a finite expiration at or below the configured bound _(off by default)_
- **SEC-036** Write session cookies per the cookie contract: `__Host-` prefix, HttpOnly, Secure, explicit SameSite _(bff-auth module; next profile)_
- **SEC-038** Never hand the token to page JavaScript in the login response _(bff-auth module; next profile)_
- **SEC-046** Use browser storage only through the storage module, and `sessionStorage` never
- **SEC-049** Keep auth tokens only in the OS secure store and credentials out of the storage module
- **SEC-050** Import unencrypted key-value stores only from the storage module
- **SEC-052** Import the secure store only in the credential wrapper, used only by the API client and auth
- **SEC-053** Send the secure-store bearer token and JSON Accept and locale headers on every API request

### 4. Untrusted input is hardened at the boundary

Validated input only, side-effect-free safe methods, rate limits, no raw HTML sinks, same-origin
checks on cookie-authenticated mutations, no internals in error bodies.

- **SEC-001** Call no insecure PHP functions such as `eval`, `exec`, `md5`, `sha1`, `unserialize` or `rand`
- **SEC-002** Map GET and HEAD routes only to index, show or allowlisted read actions
- **SEC-006** Rate-limit every unauthenticated API route with a bounded limiter
- **SEC-012** Expose no exception message, class or trace in error responses when debug is off
- **SEC-013** Persist only validated input in write actions, never raw request input
- **SEC-014** Pair a key-only guarded model with the strip middleware, creating hook and validated writes
- **SEC-035** Refuse cross-site, missing and null origins on mutating requests in the same-origin check _(bff-auth module; next profile)_
- **SEC-047** Write no raw HTML sinks such as `dangerouslySetInnerHTML`, `innerHTML` or `document.write`
- **SEC-067** Call the shared same-origin check in every mutating Route Handler _(bff-auth module; next profile)_
- **SEC-068** List only exact hosts as Server Action allowed origins, never null or a wildcard _(bff-auth module; next profile)_

### 5. One generated wire contract, when the api-contract module is on

One response path, one error format, and client types generated from the exported OpenAPI document,
drift-checked in CI ([ADR 0054][0054]).

- **BE-025** Build JSON responses only through the sanctioned response path; never hand-roll them _(api-contract module)_
- **BE-026** Emit the configured success shape exactly: no ad-hoc top-level keys and no double data wrapping _(api-contract module)_
- **BE-027** Render every API exception as RFC 9457 problem details from one renderer, with errors on 422 _(api-contract module)_
- **BE-099** Export the OpenAPI document with `scramble:export --fail-on-unknown` on every CI run _(api-contract module)_
- **WEB-018** Use the generated contract types for every wire shape; never redeclare one by hand _(api-contract module)_
- **MOB-019** Take backend resource and enum types from the generated, committed API contract _(api-contract module)_
- **CI-006** Regenerate the client API types from the exported contract in CI and fail on any diff _(api-contract module)_
- **CI-007** Pin the backend's published OpenAPI artifact in a standalone client and fail CI on type drift _(api-contract module)_
- **CI-017** Publish a backend-only repository's OpenAPI document as a versioned artifact after its export _(api-contract module)_

### 6. Secrets and the supply chain are protected

No committed secrets, runtime secret injection, pinned third-party tooling, dependency audits and
the Next.js security floor.

- **SEC-045** Resolve Next.js at or above the Standard's security floor _(next profile)_
- **SEC-061** Inject production secrets at runtime from the platform, never commit or bake them in
- **SEC-062** Give quality jobs no secrets, so no build or test step can need a runtime secret
- **SEC-063** Commit no secret: run a pinned secret scanner over every commit range in CI
- **SEC-064** Keep env example files to keys and placeholders, never secret values
- **SEC-065** Pin third-party tooling: actions to full commit SHAs, MCP servers and CLI tools to exact versions
- **CI-008** Audit production dependencies for known vulnerabilities in every quality job

### 7. The project is declared and green

A schema-valid manifest, strict typing, formatting and static analysis, coverage floors, a CI chain
that runs every check member, and a passing fast gate before an agent session ends.

- **BE-001** Declare `strict_types=1` in every namespaced PHP file
- **BE-002** Format PHP with Pint against a committed configuration that names its preset
- **BE-003** Pass Larastan at the project's level, with every parameter, return and property typed
- **BE-004** Keep the effective Larastan level, analysed paths and unmatched-ignore reporting at the floor
- **BE-013** Meet the configured backend test-coverage floor
- **WEB-021** Write no explicit any, form edit state and view-model bridges included
- **WEB-022** Lint with the framework preset plus the strict and stylistic type-checked TypeScript configs
- **WEB-024** Run the formatter in check mode in every JavaScript check chain
- **WEB-030** Meet the configured unit-test coverage floors
- **MOB-026** Type-check every JavaScript track in TypeScript strict mode
- **MOB-031** Meet the configured mobile unit-test coverage floors
- **I18N-009** Leave no server locale plumbing behind while the i18n module is off
- **PROC-001** Declare tracks, tier and modules in a schema-valid manifest that covers every detected stack
- **PROC-002** Declare Tier 2 when at least two tier triggers hold, or record why it is declined
- **PROC-003** Install each declared track and module as a complete unit, and leave no substrate of the others
- **PROC-021** Before claiming done, re-read the diff, run the checks and report their real output verbatim
- **PROC-022** Pass the fast gate before an agent session ends
- **CI-001** Run format, analysis, tests with the coverage floor and baseline growth in the Laravel chain
- **CI-002** Run typecheck, lint, format, boundaries, dead code and tests with coverage in the web chain
- **CI-003** Run the production build in the web quality job
- **CI-004** Run typecheck, lint, structure, format, boundaries, dead code and covered tests in the mobile chain
- **CI-005** Bundle the app with `expo export` in the mobile quality job
- **CI-009** Run every member of each track's check script as its own named CI step
- **CI-010** Run ESLint at zero warnings in every JavaScript check chain
- **CI-011** Make every build, deploy or release job depend on the quality job
- **CI-013** Protect the default branch and require the quality check before merge

### 8. Gates are never weakened

Shrink-only baselines, dated allowlists, described inline escapes, fail-then-pass proof, and a
confirmation before an agent touches a gate file ([ADR 0005][0005]).

- **BE-005** Never let the PHPStan baseline grow
- **BE-098** Write every inline PHPStan suppression as `@phpstan-ignore` with an identifier and a reason
- **BE-107** Fail the test run on incomplete and risky tests
- **MOB-027** Ban TypeScript suppression comments except a described `@ts-expect-error`
- **PROC-011** Keep copied gate files equal to the adopted templates, except inside declared configuration regions
- **PROC-012** Never delete or weaken a gate to get green; fix the code, record a dated exception or a waiver
- **PROC-013** Ask the user before an agent edits gate files, baselines, allowlists or CI workflows
- **PROC-014** Give every allowlist entry a reason and an expiry date, and fail CI once the date has passed
- **PROC-015** Never let the ESLint bulk-suppressions file grow
- **PROC-016** Describe the reason in every ESLint disable directive
- **PROC-017** Trust a gate only after seeing it fail on a minimal violation and pass on clean code
- **PROC-018** Keep every enabled gate with a shipped probe failing on that probe after adopting or upgrading
- **PROC-025** Allow inline ESLint exceptions only as `eslint-disable-next-line` comments
- **PROC-026** Ask the user before an agent runs a shell command that skips or weakens a gate
- **PROC-027** Never let the dependency-cruiser known-violations baseline grow
- **PROC-031** Name the disabled rules in every ESLint directive and fail unused directives
- **PROC-032** Keep ESLint, TypeScript, @types/node and Node inside the Standard's supported ranges
- **PROC-033** Run dependency-cruiser only through the kit wrapper that fails when nothing was cruised
- **PROC-034** Never let the jscpd duplication baseline grow

### 9. The locale contract, when the i18n module is on

Server-localized messages, copy in message files, locale parity, logical-direction styling and one
locale source per client ([ADR 0077][0077]).

- **I18N-001** Take user-visible server messages from translation keys, never literal sentences _(i18n module)_
- **I18N-003** Set the locale before authentication, throttling and route-model binding on every API route _(i18n module)_
- **I18N-006** Keep server lang files in parity across the configured locales _(i18n module)_
- **I18N-007** Define every statically referenced server translation key in every configured locale _(i18n module)_
- **I18N-012** Use logical-direction utility classes, never physical left and right _(i18n module)_
- **I18N-013** Use logical properties in style objects, never physical left and right _(i18n module)_
- **I18N-015** Reference only translation keys that exist in the source locale's typed web messages _(i18n module)_
- **I18N-016** Put user-facing copy in message files, not JSX literals _(i18n module)_
- **I18N-019** Never render backend `*_label` fields as labels on a client _(i18n module)_
- **I18N-027** Set `lang` and `dir` on the document root from the active locale _(i18n module; next profile)_
- **I18N-031** Reference only translation keys that exist in the source locale's typed mobile resources _(i18n module)_
- **I18N-033** Give every configured locale the source locale's keys, grouping plural forms by base key _(i18n module)_
- **I18N-034** Leave no locale value empty or whitespace-only _(i18n module)_
- **I18N-035** Allow a value identical to the source locale's only for an allowlisted key _(i18n module)_
- **I18N-036** Use the same placeholders for a key in every locale, parsed with the track's message syntax _(i18n module)_
- **I18N-037** Read multilingual content only through the localized-field helper, never `*_<locale>` keys _(i18n module)_
- **I18N-039** Send the active UI locale, not the browser's, as Accept-Language from the web client _(i18n module)_
- **I18N-040** Read the browser or device locale only in the language module, and never switch it automatically _(i18n module)_
- **I18N-042** Match each locale's plural forms to the categories `Intl.PluralRules` reports for it _(i18n module)_

### 10. Tenant isolation, when the tenancy module is on

Every tenant-owned model scoped, writes stamped from the acting user, background code pinned or
declared, and failure closed ([ADR 0057][0057]).

- **BE-061** Run the server-owned-field strip middleware first in the resolved API middleware stack _(tenancy module)_
- **BE-062** Apply the active-tenant middleware to every authenticated API route _(tenancy module)_
- **BE-067** Ship the tenant-isolation suites complete, with no todo, skipped or incomplete test _(tenancy module)_
- **BE-068** Scope list endpoints silently to the caller's tenant: foreign rows absent and totals tenant-only _(tenancy module)_
- **BE-075** Resolve the tenant from the authenticated user, never from headers, hosts or request parameters _(tenancy module)_
- **BE-100** Strip server-owned fields from body, query and JSON input, nested keys included _(tenancy module)_
- **BE-101** Stamp the tenant on create from the acting user, else the pinned context; refuse neither _(tenancy module)_
- **BE-102** Scope background reads to the pinned tenant context and fail closed when nothing is pinned _(tenancy module)_
- **SEC-015** Apply the tenant scope to every model whose table has the tenant column, with no exceptions _(tenancy module)_
- **SEC-016** Give every table the tenant column unless it is a declared global table _(tenancy module)_
- **SEC-017** Scope every model with a sub-tenant column by the sub-tenant trait or a dated allowlist entry _(tenancy module)_
- **SEC-018** Cover every tenant-scoped model and tenant-aware job in the isolation suites _(tenancy module)_
- **SEC-019** Validate foreign keys to tenant-scoped tables with the tenant-scoped exists rule _(tenancy module)_
- **SEC-020** Pin the tenant or declare cross-tenant access with a reason in every background class _(tenancy module)_
- **SEC-021** Answer cross-tenant direct access with 404, never 403 _(tenancy module)_
- **SEC-069** Throw when a record is created with an explicit foreign tenant id _(tenancy module)_

## Tier 2

Tier 2 adds layer tables, file placement, service discipline, frontend patterns and a numbered
decision log ([ADR 0001][0001]). Its rules are the tier-2 entries in each track and module
reference: [laravel.md](laravel.md), [web.md](web.md), [mobile.md](mobile.md) and the module
references. In a Tier-1 project, treat them as advice you may mention, never as requirements.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them, and do not describe them as
enforced by a gate. Their gates arrive in later 0.x releases; `enforcement` in
`${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for each ID. The invariant list itself and
the ten-invariant cap are checked in review.

## Decision records

- [ADR 0001][0001]: Record architecture decisions as MADR records that every rule cites
- [ADR 0005][0005]: Exceptions are explicit: dated allowlist entries, shrink-only baselines and described disable comments
- [ADR 0006][0006]: Stack-first: the installed library wins; Standard enforcement tools are pre-exempted
- [ADR 0008][0008]: Tier model: at most ten Tier-1 invariants; Tier 2 by declared criteria
- [ADR 0012][0012]: The backend is authoritative; clients mirror the contract and defer business rules
- [ADR 0054][0054]: Generated API contract: OpenAPI to committed TypeScript types, drift-checked in CI
- [ADR 0057][0057]: Tenancy module: model-level scoping verified against the migrated schema, failing closed
- [ADR 0077][0077]: i18n module: configurable locales, server-localized messages, no half-state
- [ADR 0083][0083]: Credential and client storage per platform

[0001]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0001-record-architecture-decisions.md
[0005]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md
[0006]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0006-stack-first.md
[0008]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0008-tiers-and-invariants.md
[0012]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0012-backend-authority.md
[0054]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0054-generated-api-contract.md
[0057]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md
[0077]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md
[0083]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0083-credential-and-client-storage.md
