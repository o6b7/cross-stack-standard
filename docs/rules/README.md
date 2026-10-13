<!-- Generated from registry/rules.json — do not edit. Regenerate: node scripts/generate-rule-docs.mjs -->

# Rules

Every rule of the Cross-Stack Standard, generated from the rule registry
(`registry/rules.json`). A rule states one enforceable property and carries an honesty label:

- **FORCED**: a gate fails the build on every violation; it is enforced structurally, with no
  known way around it.
- **GUARDED**: a gate fails the build on the direct form; the rule lists its known evasions.
- **REVIEW**: no gate yet; code review applies the rule.

Every rule also names its **target**: the level it reaches once its gate and both fixtures
ship. A rule enters the registry as REVIEW with its target, and the change that ships its gate
promotes it. A rule whose target is REVIEW stays a code-review rule.

A rule is FORCED or GUARDED only when its gate ships and its violation fixture has been seen
failing. The CI fixtures job proves that for every rule: it runs `node scripts/run-fixtures.mjs`
and then `node scripts/check-registry.mjs --fixture-report` on the report. Plain
`node scripts/check-registry.mjs` checks the gates, fixture definitions, decision records and
rule-ID citations, not the fixture results.

## Counts

385 rules: 0 FORCED, 6 GUARDED, 379 REVIEW; 321 awaiting promotion to a gated level. Target levels: 100 FORCED, 227 GUARDED, 58 REVIEW.

| Level | Enforcement | Target |
| --- | --- | --- |
| FORCED | 0 | 100 |
| GUARDED | 6 | 227 |
| REVIEW | 379 | 58 |
| Total | 385 | 385 |

| Track | FORCED | GUARDED | REVIEW | Target FORCED | Target GUARDED | Target REVIEW | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Laravel](laravel.md) | 0 | 0 | 151 | 48 | 84 | 19 | 151 |
| [Web](web.md) | 0 | 0 | 88 | 19 | 56 | 13 | 88 |
| [Mobile](mobile.md) | 0 | 0 | 52 | 13 | 32 | 7 | 52 |
| [Web and mobile](client.md) | 0 | 0 | 44 | 18 | 21 | 5 | 44 |
| [Shared](shared.md) | 0 | 6 | 44 | 2 | 34 | 14 | 50 |

## Tier-1 invariants

Tier 1 applies to every adopting project: at most ten invariants
([ADR 0008](../decisions/0008-tiers-and-invariants.md)), each held by the tier 1 rules that name it. A rule
that belongs to a module applies once the project turns that module on. Tier 2 rules apply
once the project declares Tier 2.

127 of the 385 rules are tier 1; 258 are tier 2.

### 1. Stack-first

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [UI-005](web.md#ui-005) | Style with one system: no preprocessor stylesheets, CSS-in-JS modules or &lt;style jsx> blocks | Web | core | REVIEW | GUARDED |
| [PROC-005](shared.md#proc-005) | Record the stack table in the manifest, every concern filled and every named package installed | Shared | core | REVIEW | GUARDED |
| [PROC-006](shared.md#proc-006) | Prefer the installed library's idiomatic API, then its escape hatch, and explain hand-written code | Shared | core | REVIEW | REVIEW |
| [PROC-007](shared.md#proc-007) | Install at most one library per concern, test runners included | Shared | core | REVIEW | GUARDED |
| [PROC-008](client.md#proc-008) | Import a deprecated library only inside its declared legacy paths, so new code uses the winner | Web and mobile | core | REVIEW | GUARDED |
| [PROC-009](shared.md#proc-009) | Land each new runtime dependency with an ADR that names the alternatives considered | Shared | core | REVIEW | GUARDED |

### 2. Server authority

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [SEC-003](laravel.md#sec-003) | Declare authorize() in every FormRequest and never return a constant true from it | Laravel | core | REVIEW | FORCED |
| [SEC-004](laravel.md#sec-004) | Resolve every non-public route to an existing policy ability, and allowlist public routes | Laravel | core | REVIEW | GUARDED |
| [SEC-005](laravel.md#sec-005) | Require authentication on every non-public API route | Laravel | core | REVIEW | FORCED |
| [SEC-034](web.md#sec-034) | Re-verify the session in every Route Handler and Server Action, and authorize in the backend | Web | core | REVIEW | GUARDED |
| [SEC-058](client.md#sec-058) | Use client permission checks only to hide or disable UI, and authorize every action on the server | Web and mobile | core | REVIEW | REVIEW |
| [PROC-010](shared.md#proc-010) | Keep business rules on the backend, and name and test the source of any deliberate client mirror | Shared | core | REVIEW | REVIEW |

### 3. Credentials are short-lived, revocable and never script-readable

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [SEC-010](laravel.md#sec-010) | Revoke the current access token on logout | Laravel | core | REVIEW | FORCED |
| [SEC-011](laravel.md#sec-011) | Give access tokens a finite expiration at or below the configured bound | Laravel | core | REVIEW | FORCED |
| [SEC-036](web.md#sec-036) | Write session cookies per the cookie contract: \_\_Host- prefix, HttpOnly, Secure, explicit SameSite | Web | `bff-auth` | REVIEW | GUARDED |
| [SEC-038](web.md#sec-038) | Never hand the token to page JavaScript in the login response | Web | `bff-auth` | REVIEW | GUARDED |
| [SEC-046](web.md#sec-046) | Use browser storage only through the storage module, and sessionStorage never | Web | core | REVIEW | GUARDED |
| [SEC-049](mobile.md#sec-049) | Keep auth tokens only in the OS secure store and credentials out of the storage module | Mobile | core | REVIEW | REVIEW |
| [SEC-050](mobile.md#sec-050) | Import unencrypted key-value stores only from the storage module | Mobile | core | REVIEW | FORCED |
| [SEC-052](mobile.md#sec-052) | Import the secure store only in the credential wrapper, used only by the API client and auth | Mobile | core | REVIEW | GUARDED |
| [SEC-053](mobile.md#sec-053) | Send the secure-store bearer token and JSON Accept and locale headers on every API request | Mobile | core | REVIEW | GUARDED |

### 4. Untrusted input is hardened at the boundary

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [SEC-001](laravel.md#sec-001) | Call no insecure PHP functions such as eval, exec, md5, sha1, unserialize or rand | Laravel | core | REVIEW | GUARDED |
| [SEC-002](laravel.md#sec-002) | Map GET and HEAD routes only to index, show or allowlisted read actions | Laravel | core | REVIEW | GUARDED |
| [SEC-006](laravel.md#sec-006) | Rate-limit every unauthenticated API route with a bounded limiter | Laravel | core | REVIEW | GUARDED |
| [SEC-012](laravel.md#sec-012) | Expose no exception message, class or trace in error responses when debug is off | Laravel | core | REVIEW | GUARDED |
| [SEC-013](laravel.md#sec-013) | Persist only validated input in write actions, never raw request input | Laravel | core | REVIEW | GUARDED |
| [SEC-014](laravel.md#sec-014) | Pair a key-only guarded model with the strip middleware, creating hook and validated writes | Laravel | core | REVIEW | GUARDED |
| [SEC-035](web.md#sec-035) | Refuse cross-site, missing and null origins on mutating requests in the same-origin check | Web | `bff-auth` | REVIEW | FORCED |
| [SEC-047](web.md#sec-047) | Write no raw HTML sinks such as dangerouslySetInnerHTML, innerHTML or document.write | Web | core | REVIEW | GUARDED |
| [SEC-067](web.md#sec-067) | Call the shared same-origin check in every mutating Route Handler | Web | `bff-auth` | REVIEW | GUARDED |
| [SEC-068](web.md#sec-068) | List only exact hosts as Server Action allowed origins, never null or a wildcard | Web | `bff-auth` | REVIEW | GUARDED |

### 5. One generated wire contract, when the api-contract module is on

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [BE-025](laravel.md#be-025) | Build JSON responses only through the sanctioned response path; never hand-roll them | Laravel | `api-contract` | REVIEW | FORCED |
| [BE-026](laravel.md#be-026) | Emit the configured success shape exactly: no ad-hoc top-level keys and no double data wrapping | Laravel | `api-contract` | REVIEW | GUARDED |
| [BE-027](laravel.md#be-027) | Render every API exception as RFC 9457 problem details from one renderer, with errors on 422 | Laravel | `api-contract` | REVIEW | GUARDED |
| [BE-099](laravel.md#be-099) | Export the OpenAPI document with scramble:export --fail-on-unknown on every CI run | Laravel | `api-contract` | REVIEW | GUARDED |
| [WEB-018](web.md#web-018) | Use the generated contract types for every wire shape; never redeclare one by hand | Web | `api-contract` | REVIEW | GUARDED |
| [MOB-019](mobile.md#mob-019) | Take backend resource and enum types from the generated, committed API contract | Mobile | `api-contract` | REVIEW | GUARDED |
| [CI-006](shared.md#ci-006) | Regenerate the client API types from the exported contract in CI and fail on any diff | Shared | `api-contract` | REVIEW | GUARDED |
| [CI-007](shared.md#ci-007) | Pin the backend's published OpenAPI artifact in a standalone client and fail CI on type drift | Shared | `api-contract` | REVIEW | GUARDED |
| [CI-017](laravel.md#ci-017) | Publish a backend-only repository's OpenAPI document as a versioned artifact after its export | Laravel | `api-contract` | REVIEW | GUARDED |

### 6. Secrets and the supply chain are protected

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [SEC-045](web.md#sec-045) | Resolve Next.js at or above the Standard's security floor | Web | core | REVIEW | FORCED |
| [SEC-061](shared.md#sec-061) | Inject production secrets at runtime from the platform, never commit or bake them in | Shared | core | REVIEW | REVIEW |
| [SEC-062](shared.md#sec-062) | Give quality jobs no secrets, so no build or test step can need a runtime secret | Shared | core | REVIEW | GUARDED |
| [SEC-063](shared.md#sec-063) | Commit no secret: run a pinned secret scanner over every commit range in CI | Shared | core | REVIEW | GUARDED |
| [SEC-064](shared.md#sec-064) | Keep env example files to keys and placeholders, never secret values | Shared | core | REVIEW | GUARDED |
| [SEC-065](shared.md#sec-065) | Pin third-party tooling: actions to full commit SHAs, MCP servers and CLI tools to exact versions | Shared | core | REVIEW | GUARDED |
| [CI-008](shared.md#ci-008) | Audit production dependencies for known vulnerabilities in every quality job | Shared | core | REVIEW | GUARDED |

### 7. The project is declared and green

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [BE-001](laravel.md#be-001) | Declare strict_types=1 in every namespaced PHP file | Laravel | core | REVIEW | FORCED |
| [BE-002](laravel.md#be-002) | Format PHP with Pint against a committed configuration that names its preset | Laravel | core | REVIEW | FORCED |
| [BE-003](laravel.md#be-003) | Pass Larastan at the project's level, with every parameter, return and property typed | Laravel | core | REVIEW | FORCED |
| [BE-004](laravel.md#be-004) | Keep the effective Larastan level, analysed paths and unmatched-ignore reporting at the floor | Laravel | core | REVIEW | GUARDED |
| [BE-013](laravel.md#be-013) | Meet the configured backend test-coverage floor | Laravel | core | REVIEW | GUARDED |
| [WEB-021](client.md#web-021) | Write no explicit any, form edit state and view-model bridges included | Web and mobile | core | REVIEW | FORCED |
| [WEB-022](client.md#web-022) | Lint with the framework preset plus the strict and stylistic type-checked TypeScript configs | Web and mobile | core | REVIEW | FORCED |
| [WEB-024](client.md#web-024) | Run the formatter in check mode in every JavaScript check chain | Web and mobile | core | REVIEW | GUARDED |
| [WEB-030](web.md#web-030) | Meet the configured unit-test coverage floors | Web | core | REVIEW | GUARDED |
| [MOB-026](client.md#mob-026) | Type-check every JavaScript track in TypeScript strict mode | Web and mobile | core | REVIEW | GUARDED |
| [MOB-031](mobile.md#mob-031) | Meet the configured mobile unit-test coverage floors | Mobile | core | REVIEW | GUARDED |
| [I18N-009](laravel.md#i18n-009) | Leave no server locale plumbing behind while the i18n module is off | Laravel | core | REVIEW | GUARDED |
| [PROC-001](shared.md#proc-001) | Declare tracks, tier and modules in a schema-valid manifest that covers every detected stack | Shared | core | REVIEW | FORCED |
| [PROC-002](shared.md#proc-002) | Declare Tier 2 when at least two tier triggers hold, or record why it is declined | Shared | core | REVIEW | GUARDED |
| [PROC-003](shared.md#proc-003) | Install each declared track and module as a complete unit, and leave no substrate of the others | Shared | core | REVIEW | GUARDED |
| [PROC-021](shared.md#proc-021) | Before claiming done, re-read the diff, run the checks and report their real output verbatim | Shared | core | REVIEW | REVIEW |
| [PROC-022](shared.md#proc-022) | Pass the fast gate before an agent session ends | Shared | core | GUARDED | GUARDED |
| [CI-001](laravel.md#ci-001) | Run format, analysis, tests with the coverage floor and baseline growth in the Laravel chain | Laravel | core | REVIEW | GUARDED |
| [CI-002](web.md#ci-002) | Run typecheck, lint, format, boundaries, dead code and tests with coverage in the web chain | Web | core | REVIEW | GUARDED |
| [CI-003](web.md#ci-003) | Run the production build in the web quality job | Web | core | REVIEW | GUARDED |
| [CI-004](mobile.md#ci-004) | Run typecheck, lint, structure, format, boundaries, dead code and covered tests in the mobile chain | Mobile | core | REVIEW | GUARDED |
| [CI-005](mobile.md#ci-005) | Bundle the app with expo export in the mobile quality job | Mobile | core | REVIEW | GUARDED |
| [CI-009](shared.md#ci-009) | Run every member of each track's check script as its own named CI step | Shared | core | REVIEW | GUARDED |
| [CI-010](client.md#ci-010) | Run ESLint at zero warnings in every JavaScript check chain | Web and mobile | core | REVIEW | GUARDED |
| [CI-011](shared.md#ci-011) | Make every build, deploy or release job depend on the quality job | Shared | core | REVIEW | GUARDED |
| [CI-013](shared.md#ci-013) | Protect the default branch and require the quality check before merge | Shared | core | REVIEW | REVIEW |

### 8. Gates are never weakened

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [BE-005](laravel.md#be-005) | Never let the PHPStan baseline grow | Laravel | core | REVIEW | GUARDED |
| [BE-098](laravel.md#be-098) | Write every inline PHPStan suppression as @phpstan-ignore with an identifier and a reason | Laravel | core | REVIEW | FORCED |
| [BE-107](laravel.md#be-107) | Fail the test run on incomplete and risky tests | Laravel | core | REVIEW | GUARDED |
| [MOB-027](client.md#mob-027) | Ban TypeScript suppression comments except a described @ts-expect-error | Web and mobile | core | REVIEW | FORCED |
| [PROC-011](shared.md#proc-011) | Keep copied gate files equal to the adopted templates, except inside declared configuration regions | Shared | core | REVIEW | GUARDED |
| [PROC-012](shared.md#proc-012) | Never delete or weaken a gate to get green; fix the code, record a dated exception or a waiver | Shared | core | REVIEW | REVIEW |
| [PROC-013](shared.md#proc-013) | Ask the user before an agent edits gate files, baselines, allowlists or CI workflows | Shared | core | GUARDED | GUARDED |
| [PROC-014](shared.md#proc-014) | Give every allowlist entry a reason and an expiry date, and fail CI once the date has passed | Shared | core | REVIEW | FORCED |
| [PROC-015](client.md#proc-015) | Never let the ESLint bulk-suppressions file grow | Web and mobile | core | REVIEW | GUARDED |
| [PROC-016](client.md#proc-016) | Describe the reason in every ESLint disable directive | Web and mobile | core | REVIEW | FORCED |
| [PROC-017](shared.md#proc-017) | Trust a gate only after seeing it fail on a minimal violation and pass on clean code | Shared | core | REVIEW | REVIEW |
| [PROC-018](shared.md#proc-018) | Keep every enabled gate with a shipped probe failing on that probe after adopting or upgrading | Shared | core | REVIEW | GUARDED |
| [PROC-025](client.md#proc-025) | Allow inline ESLint exceptions only as eslint-disable-next-line comments | Web and mobile | core | REVIEW | FORCED |
| [PROC-026](shared.md#proc-026) | Ask the user before an agent runs a shell command that skips or weakens a gate | Shared | core | GUARDED | GUARDED |
| [PROC-027](client.md#proc-027) | Never let the dependency-cruiser known-violations baseline grow | Web and mobile | core | REVIEW | GUARDED |
| [PROC-031](client.md#proc-031) | Name the disabled rules in every ESLint directive and fail unused directives | Web and mobile | core | REVIEW | GUARDED |
| [PROC-032](client.md#proc-032) | Keep ESLint, TypeScript, @types/node and Node inside the Standard's supported ranges | Web and mobile | core | REVIEW | FORCED |
| [PROC-033](client.md#proc-033) | Run dependency-cruiser only through the kit wrapper that fails when nothing was cruised | Web and mobile | core | REVIEW | GUARDED |
| [PROC-034](shared.md#proc-034) | Never let the jscpd duplication baseline grow | Shared | core | REVIEW | GUARDED |

### 9. The locale contract, when the i18n module is on

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [I18N-001](laravel.md#i18n-001) | Take user-visible server messages from translation keys, never literal sentences | Laravel | `i18n` | REVIEW | GUARDED |
| [I18N-003](laravel.md#i18n-003) | Set the locale before authentication, throttling and route-model binding on every API route | Laravel | `i18n` | REVIEW | FORCED |
| [I18N-006](laravel.md#i18n-006) | Keep server lang files in parity across the configured locales | Laravel | `i18n` | REVIEW | FORCED |
| [I18N-007](laravel.md#i18n-007) | Define every statically referenced server translation key in every configured locale | Laravel | `i18n` | REVIEW | GUARDED |
| [I18N-012](web.md#i18n-012) | Use logical-direction utility classes, never physical left and right | Web | `i18n` | REVIEW | GUARDED |
| [I18N-013](client.md#i18n-013) | Use logical properties in style objects, never physical left and right | Web and mobile | `i18n` | REVIEW | GUARDED |
| [I18N-015](web.md#i18n-015) | Reference only translation keys that exist in the source locale's typed web messages | Web | `i18n` | REVIEW | GUARDED |
| [I18N-016](client.md#i18n-016) | Put user-facing copy in message files, not JSX literals | Web and mobile | `i18n` | REVIEW | GUARDED |
| [I18N-019](client.md#i18n-019) | Never render backend \*\_label fields as labels on a client | Web and mobile | `i18n` | REVIEW | GUARDED |
| [I18N-027](web.md#i18n-027) | Set lang and dir on the document root from the active locale | Web | `i18n` | REVIEW | GUARDED |
| [I18N-031](mobile.md#i18n-031) | Reference only translation keys that exist in the source locale's typed mobile resources | Mobile | `i18n` | REVIEW | GUARDED |
| [I18N-033](client.md#i18n-033) | Give every configured locale the source locale's keys, grouping plural forms by base key | Web and mobile | `i18n` | REVIEW | FORCED |
| [I18N-034](client.md#i18n-034) | Leave no locale value empty or whitespace-only | Web and mobile | `i18n` | REVIEW | FORCED |
| [I18N-035](client.md#i18n-035) | Allow a value identical to the source locale's only for an allowlisted key | Web and mobile | `i18n` | REVIEW | FORCED |
| [I18N-036](client.md#i18n-036) | Use the same placeholders for a key in every locale, parsed with the track's message syntax | Web and mobile | `i18n` | REVIEW | FORCED |
| [I18N-037](client.md#i18n-037) | Read multilingual content only through the localized-field helper, never \*\_&lt;locale> keys | Web and mobile | `i18n` | REVIEW | GUARDED |
| [I18N-039](web.md#i18n-039) | Send the active UI locale, not the browser's, as Accept-Language from the web client | Web | `i18n` | REVIEW | GUARDED |
| [I18N-040](client.md#i18n-040) | Read the browser or device locale only in the language module, and never switch it automatically | Web and mobile | `i18n` | REVIEW | GUARDED |
| [I18N-042](client.md#i18n-042) | Match each locale's plural forms to the categories Intl.PluralRules reports for it | Web and mobile | `i18n` | REVIEW | FORCED |

### 10. Tenant isolation, when the tenancy module is on

| ID | Title | Track | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- |
| [BE-061](laravel.md#be-061) | Run the server-owned-field strip middleware first in the resolved API middleware stack | Laravel | `tenancy` | REVIEW | FORCED |
| [BE-062](laravel.md#be-062) | Apply the active-tenant middleware to every authenticated API route | Laravel | `tenancy` | REVIEW | FORCED |
| [BE-067](laravel.md#be-067) | Ship the tenant-isolation suites complete, with no todo, skipped or incomplete test | Laravel | `tenancy` | REVIEW | GUARDED |
| [BE-068](laravel.md#be-068) | Scope list endpoints silently to the caller's tenant: foreign rows absent and totals tenant-only | Laravel | `tenancy` | REVIEW | GUARDED |
| [BE-075](laravel.md#be-075) | Resolve the tenant from the authenticated user, never from headers, hosts or request parameters | Laravel | `tenancy` | REVIEW | REVIEW |
| [BE-100](laravel.md#be-100) | Strip server-owned fields from body, query and JSON input, nested keys included | Laravel | `tenancy` | REVIEW | GUARDED |
| [BE-101](laravel.md#be-101) | Stamp the tenant on create from the acting user, else the pinned context; refuse neither | Laravel | `tenancy` | REVIEW | GUARDED |
| [BE-102](laravel.md#be-102) | Scope background reads to the pinned tenant context and fail closed when nothing is pinned | Laravel | `tenancy` | REVIEW | GUARDED |
| [SEC-015](laravel.md#sec-015) | Apply the tenant scope to every model whose table has the tenant column, with no exceptions | Laravel | `tenancy` | REVIEW | FORCED |
| [SEC-016](laravel.md#sec-016) | Give every table the tenant column unless it is a declared global table | Laravel | `tenancy` | REVIEW | FORCED |
| [SEC-017](laravel.md#sec-017) | Scope every model with a sub-tenant column by the sub-tenant trait or a dated allowlist entry | Laravel | `tenancy` | REVIEW | FORCED |
| [SEC-018](laravel.md#sec-018) | Cover every tenant-scoped model and tenant-aware job in the isolation suites | Laravel | `tenancy` | REVIEW | GUARDED |
| [SEC-019](laravel.md#sec-019) | Validate foreign keys to tenant-scoped tables with the tenant-scoped exists rule | Laravel | `tenancy` | REVIEW | GUARDED |
| [SEC-020](laravel.md#sec-020) | Pin the tenant or declare cross-tenant access with a reason in every background class | Laravel | `tenancy` | REVIEW | GUARDED |
| [SEC-021](laravel.md#sec-021) | Answer cross-tenant direct access with 404, never 403 | Laravel | `tenancy` | REVIEW | GUARDED |
| [SEC-069](laravel.md#sec-069) | Throw when a record is created with an explicit foreign tenant id | Laravel | `tenancy` | REVIEW | GUARDED |

## Index

| ID | Title | Track | Tier | Module | Enforcement | Target |
| --- | --- | --- | --- | --- | --- | --- |
| [BE-001](laravel.md#be-001) | Declare strict_types=1 in every namespaced PHP file | Laravel | 1 | core | REVIEW | FORCED |
| [BE-002](laravel.md#be-002) | Format PHP with Pint against a committed configuration that names its preset | Laravel | 1 | core | REVIEW | FORCED |
| [BE-003](laravel.md#be-003) | Pass Larastan at the project's level, with every parameter, return and property typed | Laravel | 1 | core | REVIEW | FORCED |
| [BE-004](laravel.md#be-004) | Keep the effective Larastan level, analysed paths and unmatched-ignore reporting at the floor | Laravel | 1 | core | REVIEW | GUARDED |
| [BE-005](laravel.md#be-005) | Never let the PHPStan baseline grow | Laravel | 1 | core | REVIEW | GUARDED |
| [BE-006](laravel.md#be-006) | Never lower the PHPStan level, and raise it by the recorded due date | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-007](laravel.md#be-007) | Pass the Pest php preset: no debug, diagnostic or raw output calls such as var_dump, dump or echo | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-008](laravel.md#be-008) | Leave no untracked TODO, FIXME, HACK or XXX marker: each one carries a ticket reference | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-009](laravel.md#be-009) | Commit no commented-out PHP code | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-010](laravel.md#be-010) | Document in .env.example every env() key that project config files read | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-011](laravel.md#be-011) | Run the test suite against uncached configuration | Laravel | 2 | core | REVIEW | FORCED |
| [BE-012](laravel.md#be-012) | Pin a hermetic test environment in phpunit.xml with force="true" | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-013](laravel.md#be-013) | Meet the configured backend test-coverage floor | Laravel | 1 | core | REVIEW | GUARDED |
| [BE-014](laravel.md#be-014) | Add no new PHP copy-paste clones beyond the committed jscpd baseline | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-015](laravel.md#be-015) | Serve every API route under a version prefix | Laravel | 2 | core | REVIEW | FORCED |
| [BE-016](laravel.md#be-016) | Shape API URIs as kebab-case plural resources, with state transitions as POST sub-resource verbs | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-017](laravel.md#be-017) | Route every request to a controller action; no route closures | Laravel | 2 | core | REVIEW | FORCED |
| [BE-018](laravel.md#be-018) | Type the input of every POST, PUT and PATCH action as a FormRequest | Laravel | 2 | core | REVIEW | FORCED |
| [BE-019](laravel.md#be-019) | Keep validation in FormRequests; no inline validation in the HTTP layer | Laravel | 2 | core | REVIEW | FORCED |
| [BE-020](laravel.md#be-020) | Name store and update requests Store{Model}Request and Update{Model}Request | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-021](laravel.md#be-021) | Authorize each endpoint at exactly one site with exactly one policy ability | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-022](laravel.md#be-022) | Exercise every API route in at least one feature test | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-023](laravel.md#be-023) | Answer failed logins with one generic problem detail | Laravel | 2 | core | REVIEW | FORCED |
| [BE-024](laravel.md#be-024) | Declare an allowed response type as the return type of every controller action | Laravel | 2 | core | REVIEW | FORCED |
| [BE-025](laravel.md#be-025) | Build JSON responses only through the sanctioned response path; never hand-roll them | Laravel | 1 | `api-contract` | REVIEW | FORCED |
| [BE-026](laravel.md#be-026) | Emit the configured success shape exactly: no ad-hoc top-level keys and no double data wrapping | Laravel | 1 | `api-contract` | REVIEW | GUARDED |
| [BE-027](laravel.md#be-027) | Render every API exception as RFC 9457 problem details from one renderer, with errors on 422 | Laravel | 1 | `api-contract` | REVIEW | GUARDED |
| [BE-028](laravel.md#be-028) | Use the status vocabulary: 409 for state and concurrency conflicts, 422 only for validation | Laravel | 2 | `api-contract` | REVIEW | REVIEW |
| [BE-029](laravel.md#be-029) | Never service-locate outside service providers: no app(), resolve(), App::make or container calls | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-030](laravel.md#be-030) | Add no pass-through layers: single-step CRUD and list queries stay in the controller | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-031](laravel.md#be-031) | Add a service only for a domain rule used outside HTTP; make shared multi-step writes Actions | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-032](laravel.md#be-032) | Add no repository or speculative layer classes (Repository, Manager, Handler, UseCase, Interactor) | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-033](laravel.md#be-033) | Implement every Action as an invokable class in App\\Actions | Laravel | 2 | core | REVIEW | FORCED |
| [BE-034](laravel.md#be-034) | Keep raw SQL, the DB facade and transactions out of the HTTP layer | Laravel | 2 | core | REVIEW | FORCED |
| [BE-035](laravel.md#be-035) | Keep services plain classes with no interface and no base class | Laravel | 2 | core | REVIEW | FORCED |
| [BE-036](laravel.md#be-036) | Place each kind of class in the namespace the configured placement map assigns it | Laravel | 2 | core | REVIEW | FORCED |
| [BE-037](laravel.md#be-037) | Pass the Pest laravel preset: framework class conventions and no env() outside config | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-038](laravel.md#be-038) | Promote and mark readonly every constructor parameter of controllers, services and Actions | Laravel | 2 | core | REVIEW | FORCED |
| [BE-039](laravel.md#be-039) | Keep controllers under the configured line count | Laravel | 2 | core | REVIEW | FORCED |
| [BE-040](laravel.md#be-040) | Keep HTTP, validation and response concerns out of models | Laravel | 2 | core | REVIEW | FORCED |
| [BE-041](laravel.md#be-041) | Declare casts in the casts() method, not the $casts property | Laravel | 2 | core | REVIEW | FORCED |
| [BE-042](laravel.md#be-042) | Name database columns in snake_case | Laravel | 2 | core | REVIEW | FORCED |
| [BE-043](laravel.md#be-043) | Cast every status, state, type and role column to a string-backed enum | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-044](laravel.md#be-044) | Make every enum a native string-backed enum | Laravel | 2 | core | REVIEW | FORCED |
| [BE-045](laravel.md#be-045) | Name enum cases in the configured style with snake_case backing values | Laravel | 2 | core | REVIEW | FORCED |
| [BE-046](laravel.md#be-046) | Never compare enum-cast attributes to string literals; use the enum | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-047](laravel.md#be-047) | Keep presentation data such as colors off enums; the API emits semantic state only | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-048](laravel.md#be-048) | Emit enum values only; never add \*\_label display fields to Resources | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-049](laravel.md#be-049) | Serialize models only through API Resources in the HTTP layer | Laravel | 2 | core | REVIEW | FORCED |
| [BE-050](laravel.md#be-050) | Define each wire shape once: one Resource per shape, summary Resources for nested relations | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-051](laravel.md#be-051) | Decide single-record access in policies and list visibility in a scope that mirrors them | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-052](laravel.md#be-052) | Generate sequential codes with a database sequence or retry on unique violation, never max + 1 | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-053](laravel.md#be-053) | Enable Eloquent strict mode outside production | Laravel | 2 | core | REVIEW | FORCED |
| [BE-054](laravel.md#be-054) | Paginate every list (index) route | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-055](laravel.md#be-055) | Sanitize and hard-cap per_page, falling back to the default on invalid input | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-056](laravel.md#be-056) | Accept only declared filter and sort keys; reject unknown keys with 400 | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-057](laravel.md#be-057) | Use one filter idiom per project for list queries | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-058](laravel.md#be-058) | Set server-derived fields in prepareForValidation(), never from client input | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-059](laravel.md#be-059) | Keep wire field names equal to storage column names | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-060](laravel.md#be-060) | Keep FormRequest messages() keys matched to rules that exist | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-061](laravel.md#be-061) | Run the server-owned-field strip middleware first in the resolved API middleware stack | Laravel | 1 | `tenancy` | REVIEW | FORCED |
| [BE-062](laravel.md#be-062) | Apply the active-tenant middleware to every authenticated API route | Laravel | 1 | `tenancy` | REVIEW | FORCED |
| [BE-063](laravel.md#be-063) | Wire tenancy into the user model only through the shipped traits; never redefine the tenant relation | Laravel | 2 | `tenancy` | REVIEW | FORCED |
| [BE-064](laravel.md#be-064) | Migrate the tenancy schema: a tenants table with non-null feature flags and tenant columns on users | Laravel | 2 | `tenancy` | REVIEW | FORCED |
| [BE-065](laravel.md#be-065) | Seed a valid tenancy state: an operator, the default tenant and no rows without a tenant | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-066](laravel.md#be-066) | Build isolation-test fixtures from scratch; never depend on seeded tenants | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-067](laravel.md#be-067) | Ship the tenant-isolation suites complete, with no todo, skipped or incomplete test | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [BE-068](laravel.md#be-068) | Scope list endpoints silently to the caller's tenant: foreign rows absent and totals tenant-only | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [BE-069](laravel.md#be-069) | Apply the sub-tenant scope in every listing over a sub-tenant model | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-070](laravel.md#be-070) | Apply sub-tenant scoping only through the model-attached scope | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-071](laravel.md#be-071) | Block a disabled tenant at login and on existing tokens with one shared predicate and message | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-072](laravel.md#be-072) | Grant the platform bypass only to operators without a tenant, and honor it at every layer | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-073](laravel.md#be-073) | Fail closed for a user without a resolvable tenant: no rows, no create and 403 on requests | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-074](laravel.md#be-074) | Define the platform-bypass predicate once and call it from every tenancy layer | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-075](laravel.md#be-075) | Resolve the tenant from the authenticated user, never from headers, hosts or request parameters | Laravel | 1 | `tenancy` | REVIEW | REVIEW |
| [BE-076](laravel.md#be-076) | Let a tenant's host decide only pre-login branding and login affinity, never data scoping | Laravel | 2 | `tenancy` | REVIEW | REVIEW |
| [BE-077](laravel.md#be-077) | Consume the tenancy mechanism from the vendored package, never from a copied or edited version | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-078](laravel.md#be-078) | Gate tenant features with the feature middleware keyed to the feature enum | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-079](laravel.md#be-079) | Never re-implement a tenant feature check inline in a controller | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-080](laravel.md#be-080) | Test a 403 for every tenant-feature key used in the route table | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-081](laravel.md#be-081) | Cache tenant data only through the tenant-aware helper that prefixes keys with the tenant id | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-082](laravel.md#be-082) | Never send a push notification to a device token outside the notification's tenant | Laravel | 2 | `tenancy` | REVIEW | REVIEW |
| [BE-083](laravel.md#be-083) | Route all file uploads through the declared upload requests | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-084](laravel.md#be-084) | Queue every mailable and notification | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-085](laravel.md#be-085) | Pass identifiers to queued classes, never the authenticated user, the request or closures | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-086](laravel.md#be-086) | Declare tries or retryUntil, backoff and timeout on every job and queued listener | Laravel | 2 | core | REVIEW | FORCED |
| [BE-087](laravel.md#be-087) | Make jobs safe to retry: idempotent, guarded on current state, fast to fail on permanent errors | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-088](laravel.md#be-088) | Schedule pruning of failed jobs whenever the application has queued classes | Laravel | 2 | core | REVIEW | FORCED |
| [BE-089](laravel.md#be-089) | Surface a failed job's owed result to the affected user or tenant | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-090](laravel.md#be-090) | Log with a constant message and pass variable data in the context array | Laravel | 2 | core | REVIEW | FORCED |
| [BE-091](laravel.md#be-091) | Log ids and stable codes, never models, tenant rows or per-locale column dumps | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-092](laravel.md#be-092) | Propagate one request id: adopt or generate it, bind it to the log context and echo it on responses | Laravel | 2 | `observability` | REVIEW | FORCED |
| [BE-093](laravel.md#be-093) | Report errors to the error tracker only from the central exception funnel | Laravel | 2 | `observability` | REVIEW | GUARDED |
| [BE-094](laravel.md#be-094) | Keep the liveness route unauthenticated, dependency-free and free of version detail | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-095](laravel.md#be-095) | Poll for live surfaces; add server broadcasting packages only with a recorded decision | Laravel | 2 | core | REVIEW | GUARDED |
| [BE-096](laravel.md#be-096) | Record audit events only through the audit-trail mechanism declared in the stack table | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-097](laravel.md#be-097) | Name regression tests after the invariant they protect | Laravel | 2 | core | REVIEW | REVIEW |
| [BE-098](laravel.md#be-098) | Write every inline PHPStan suppression as @phpstan-ignore with an identifier and a reason | Laravel | 1 | core | REVIEW | FORCED |
| [BE-099](laravel.md#be-099) | Export the OpenAPI document with scramble:export --fail-on-unknown on every CI run | Laravel | 1 | `api-contract` | REVIEW | GUARDED |
| [BE-100](laravel.md#be-100) | Strip server-owned fields from body, query and JSON input, nested keys included | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [BE-101](laravel.md#be-101) | Stamp the tenant on create from the acting user, else the pinned context; refuse neither | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [BE-102](laravel.md#be-102) | Scope background reads to the pinned tenant context and fail closed when nothing is pinned | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [BE-103](laravel.md#be-103) | Never resolve the authenticated user inside the tenant scope | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-104](laravel.md#be-104) | Apply tenant feature gates to every tenant user, admins included; exempt only the platform bypass | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-105](laravel.md#be-105) | Let the authenticated user's tenant take precedence over a pinned tenant context | Laravel | 2 | `tenancy` | REVIEW | GUARDED |
| [BE-106](laravel.md#be-106) | Reference tenants with restrict-on-delete foreign keys and non-nullable business tenant columns | Laravel | 2 | `tenancy` | REVIEW | FORCED |
| [BE-107](laravel.md#be-107) | Fail the test run on incomplete and risky tests | Laravel | 1 | core | REVIEW | GUARDED |
| [WEB-001](web.md#web-001) | Name files and directories under the source root in kebab-case | Web | 2 | core | REVIEW | FORCED |
| [WEB-002](web.md#web-002) | Colocate every test file beside the source file it tests; no aggregate test folders | Web | 2 | core | REVIEW | FORCED |
| [WEB-003](web.md#web-003) | Give feature folders only hooks/, components/ and lib/, always hooks/, with use-\* hook files | Web | 2 | core | REVIEW | FORCED |
| [WEB-004](web.md#web-004) | Put no barrel or re-export modules inside feature folders | Web | 2 | core | REVIEW | FORCED |
| [WEB-005](web.md#web-005) | Import another feature only through its hooks/ or lib/, never its components/ | Web | 2 | core | REVIEW | FORCED |
| [WEB-006](web.md#web-006) | Never import a feature from a shared lib module, directly or transitively | Web | 2 | core | REVIEW | FORCED |
| [WEB-007](web.md#web-007) | Keep the import graph free of cycles | Web | 2 | core | REVIEW | FORCED |
| [WEB-008](web.md#web-008) | Never import app routes from below the route layer | Web | 2 | core | REVIEW | FORCED |
| [WEB-009](web.md#web-009) | Import no React, framework or server-state library in feature lib/ modules | Web | 2 | core | REVIEW | FORCED |
| [WEB-010](web.md#web-010) | Document every key of the typed env schema in the example env file | Web | 2 | core | REVIEW | FORCED |
| [WEB-011](client.md#web-011) | Read environment variables only through the typed, schema-validated env module | Web and mobile | 2 | core | REVIEW | GUARDED |
| [WEB-012](client.md#web-012) | Never paginate a server page on the client | Web and mobile | 2 | core | REVIEW | GUARDED |
| [WEB-013](client.md#web-013) | Drive lists from the server: send page, filters and sort to the API and render its total | Web and mobile | 2 | core | REVIEW | REVIEW |
| [WEB-014](web.md#web-014) | Keep server data only in the server-state cache, never in a client store | Web | 2 | core | REVIEW | REVIEW |
| [WEB-015](web.md#web-015) | Keep list filters in the URL and UI state in components; add a store only for a shared consumer | Web | 2 | core | REVIEW | REVIEW |
| [WEB-016](web.md#web-016) | Keep route pages to composition and layout, and put business logic in features | Web | 2 | core | REVIEW | REVIEW |
| [WEB-017](web.md#web-017) | Declare no TypeScript enums | Web | 2 | core | REVIEW | GUARDED |
| [WEB-018](web.md#web-018) | Use the generated contract types for every wire shape; never redeclare one by hand | Web | 1 | `api-contract` | REVIEW | GUARDED |
| [WEB-019](web.md#web-019) | Render contract types directly; let a view-model only add display fields and keep the raw row | Web | 2 | core | REVIEW | REVIEW |
| [WEB-020](web.md#web-020) | Keep every recommended jsx-a11y rule at error severity | Web | 2 | core | REVIEW | FORCED |
| [WEB-021](client.md#web-021) | Write no explicit any, form edit state and view-model bridges included | Web and mobile | 1 | core | REVIEW | FORCED |
| [WEB-022](client.md#web-022) | Lint with the framework preset plus the strict and stylistic type-checked TypeScript configs | Web and mobile | 1 | core | REVIEW | FORCED |
| [WEB-023](client.md#web-023) | Use named exports, and default-export only where the framework requires it | Web and mobile | 2 | core | REVIEW | FORCED |
| [WEB-024](client.md#web-024) | Run the formatter in check mode in every JavaScript check chain | Web and mobile | 1 | core | REVIEW | GUARDED |
| [WEB-025](client.md#web-025) | Cap file length at the configured line limit | Web and mobile | 2 | core | REVIEW | FORCED |
| [WEB-026](client.md#web-026) | Cap the cyclomatic complexity of every function | Web and mobile | 2 | core | REVIEW | FORCED |
| [WEB-027](client.md#web-027) | Commit no commented-out JavaScript or TypeScript code | Web and mobile | 2 | core | REVIEW | GUARDED |
| [WEB-028](web.md#web-028) | Leave no unused files, exports or dependencies on the web track | Web | 2 | core | REVIEW | GUARDED |
| [WEB-029](web.md#web-029) | Introduce no copy-paste clones beyond the committed duplication baseline | Web | 2 | core | REVIEW | GUARDED |
| [WEB-030](web.md#web-030) | Meet the configured unit-test coverage floors | Web | 1 | core | REVIEW | GUARDED |
| [WEB-031](web.md#web-031) | Unit-test security-contract code to the higher security coverage floor | Web | 2 | core | REVIEW | GUARDED |
| [WEB-032](web.md#web-032) | Run one end-to-end journey (sign-in, CRUD, sign-out) against a seeded backend in the web workflow | Web | 2 | core | REVIEW | GUARDED |
| [WEB-033](client.md#web-033) | Define query keys in per-domain queryOptions() factories, never as inline arrays outside hooks | Web and mobile | 2 | core | REVIEW | GUARDED |
| [WEB-034](web.md#web-034) | Invalidate the resource root key after every mutation | Web | 2 | core | REVIEW | REVIEW |
| [WEB-035](web.md#web-035) | Show mutation feedback once, from the central mutation cache; opt out only with silent meta | Web | 2 | core | REVIEW | REVIEW |
| [WEB-036](web.md#web-036) | Build autosave editors on local state that leads the server copy, invalidating keys on unmount | Web | 2 | core | REVIEW | REVIEW |
| [WEB-037](web.md#web-037) | Create the HTTP client once and send every request through the shared fetcher | Web | 2 | core | REVIEW | GUARDED |
| [WEB-038](web.md#web-038) | Keep the API version segment only in the upstream base URL | Web | 2 | core | REVIEW | GUARDED |
| [WEB-039](client.md#web-039) | Poll live data through the server-state cache; import a realtime client only with a recorded ADR | Web and mobile | 2 | core | REVIEW | GUARDED |
| [WEB-040](client.md#web-040) | Log only through the logger module; no direct console calls | Web and mobile | 2 | core | REVIEW | GUARDED |
| [WEB-041](web.md#web-041) | Mint a request id when absent and forward it on every upstream call | Web | 2 | `observability` | REVIEW | GUARDED |
| [WEB-042](web.md#web-042) | Validate each field on the client in forms above the configured field count | Web | 2 | core | REVIEW | REVIEW |
| [WEB-043](web.md#web-043) | Map server validation errors onto their fields and wire aria-invalid and aria-describedby | Web | 2 | core | REVIEW | REVIEW |
| [WEB-044](web.md#web-044) | List every private route segment in the protected-segments declaration the proxy reads | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [WEB-045](web.md#web-045) | Reconcile the session hint with the token cookie in the proxy on every navigation | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [WEB-046](web.md#web-046) | Clear the profile cache and hard-navigate to the locale's login page on a non-login 401 | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [WEB-047](web.md#web-047) | Compare auth endpoint paths as exact shared constants, never by substring | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [WEB-048](web.md#web-048) | Return RFC 9457 problem details for every error the BFF creates itself | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [WEB-049](web.md#web-049) | Reject request bodies above the shared upload limit with 413 in the BFF, before buffering | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [WEB-050](client.md#web-050) | Cap block nesting depth | Web and mobile | 2 | core | REVIEW | FORCED |
| [WEB-051](client.md#web-051) | Cap function length | Web and mobile | 2 | core | REVIEW | FORCED |
| [WEB-052](web.md#web-052) | Send credentials and the XSRF token from the SPA client, and fetch the CSRF cookie first | Web | 2 | core | REVIEW | GUARDED |
| [WEB-053](client.md#web-053) | Leave no untracked TODO, FIXME, HACK or XXX marker in JavaScript or TypeScript | Web and mobile | 2 | core | REVIEW | GUARDED |
| [MOB-001](mobile.md#mob-001) | Keep top-level source folders within the configured folder contract | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-002](mobile.md#mob-002) | Default-export the screen or layout from every route file | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-003](mobile.md#mob-003) | Create React contexts only inside the contexts folder | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-004](mobile.md#mob-004) | Keep only .ts files, never .tsx, in the utils, constants and types folders | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-005](mobile.md#mob-005) | Define hooks only in the hooks and contexts folders | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-006](mobile.md#mob-006) | Keep the types folder free of runtime code | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-007](mobile.md#mob-007) | Place domain hooks and components in per-domain subfolders, with only cross-cutting ones at the root | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-008](mobile.md#mob-008) | Import no server-state library in route files | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-009](mobile.md#mob-009) | Consume contexts only through their exported provider hook, which throws outside the provider | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-010](mobile.md#mob-010) | Keep tracked file names identical in case to the files on disk | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-011](mobile.md#mob-011) | Import through the root path alias; no parent-relative imports | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-012](mobile.md#mob-012) | Keep list page, filters and sort in navigation params and forward them to the API | Mobile | 2 | core | REVIEW | REVIEW |
| [MOB-013](mobile.md#mob-013) | Keep server data only in the server-state cache: API access flows through query hooks | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-014](mobile.md#mob-014) | Create exactly one query client, in the query provider module | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-015](mobile.md#mob-015) | Show mutation feedback once, from the central mutation cache; opt out only with silent meta | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-016](mobile.md#mob-016) | Normalize API failures in one module; screens never read raw HTTP statuses or bodies | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-017](mobile.md#mob-017) | Map every error response to a typed app-error kind per the configured format and statuses | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-018](mobile.md#mob-018) | Unwrap API responses in one typed function inside the API client; no .data.data downstream | Mobile | 2 | `api-contract` | REVIEW | GUARDED |
| [MOB-019](mobile.md#mob-019) | Take backend resource and enum types from the generated, committed API contract | Mobile | 1 | `api-contract` | REVIEW | GUARDED |
| [MOB-020](mobile.md#mob-020) | Never narrow a value with a type assertion; rely on the generated types or a runtime parser | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-021](mobile.md#mob-021) | Switch mock and live transport only inside the API client module | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-022](mobile.md#mob-022) | Reference public build-time variables statically; never read process.env with a computed key | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-023](mobile.md#mob-023) | Render the Redirect component only in route-group layouts and the entry route | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-024](mobile.md#mob-024) | Validate form fields on the client and map server field errors onto their fields | Mobile | 2 | core | REVIEW | REVIEW |
| [MOB-025](mobile.md#mob-025) | Never send, filter by or reason about the tenant id on the client | Mobile | 2 | `tenancy` | REVIEW | GUARDED |
| [MOB-026](client.md#mob-026) | Type-check every JavaScript track in TypeScript strict mode | Web and mobile | 1 | core | REVIEW | GUARDED |
| [MOB-027](client.md#mob-027) | Ban TypeScript suppression comments except a described @ts-expect-error | Web and mobile | 1 | core | REVIEW | FORCED |
| [MOB-028](mobile.md#mob-028) | Let the HTTP client set the multipart content type and boundary; never set them by hand | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-029](mobile.md#mob-029) | Re-register the device push token when the active tenant changes | Mobile | 2 | `tenancy` | REVIEW | REVIEW |
| [MOB-030](mobile.md#mob-030) | Enable noUncheckedIndexedAccess in the mobile tsconfig | Mobile | 2 | core | REVIEW | FORCED |
| [MOB-031](mobile.md#mob-031) | Meet the configured mobile unit-test coverage floors | Mobile | 1 | core | REVIEW | GUARDED |
| [MOB-032](mobile.md#mob-032) | Leave no unused files, exports or dependencies on the mobile track | Mobile | 2 | core | REVIEW | GUARDED |
| [MOB-033](mobile.md#mob-033) | Introduce no mobile copy-paste clones beyond the committed duplication baseline | Mobile | 2 | core | REVIEW | GUARDED |
| [SEC-001](laravel.md#sec-001) | Call no insecure PHP functions such as eval, exec, md5, sha1, unserialize or rand | Laravel | 1 | core | REVIEW | GUARDED |
| [SEC-002](laravel.md#sec-002) | Map GET and HEAD routes only to index, show or allowlisted read actions | Laravel | 1 | core | REVIEW | GUARDED |
| [SEC-003](laravel.md#sec-003) | Declare authorize() in every FormRequest and never return a constant true from it | Laravel | 1 | core | REVIEW | FORCED |
| [SEC-004](laravel.md#sec-004) | Resolve every non-public route to an existing policy ability, and allowlist public routes | Laravel | 1 | core | REVIEW | GUARDED |
| [SEC-005](laravel.md#sec-005) | Require authentication on every non-public API route | Laravel | 1 | core | REVIEW | FORCED |
| [SEC-006](laravel.md#sec-006) | Rate-limit every unauthenticated API route with a bounded limiter | Laravel | 1 | core | REVIEW | GUARDED |
| [SEC-007](laravel.md#sec-007) | Rate-limit every mutating authenticated API route with a bounded limiter | Laravel | 2 | core | REVIEW | GUARDED |
| [SEC-008](laravel.md#sec-008) | Cap attempts per minute on the login, password change and password reset routes | Laravel | 2 | core | REVIEW | GUARDED |
| [SEC-009](laravel.md#sec-009) | Return the access token at the documented response path from the token login route | Laravel | 2 | core | REVIEW | FORCED |
| [SEC-010](laravel.md#sec-010) | Revoke the current access token on logout | Laravel | 1 | core | REVIEW | FORCED |
| [SEC-011](laravel.md#sec-011) | Give access tokens a finite expiration at or below the configured bound | Laravel | 1 | core | REVIEW | FORCED |
| [SEC-012](laravel.md#sec-012) | Expose no exception message, class or trace in error responses when debug is off | Laravel | 1 | core | REVIEW | GUARDED |
| [SEC-013](laravel.md#sec-013) | Persist only validated input in write actions, never raw request input | Laravel | 1 | core | REVIEW | GUARDED |
| [SEC-014](laravel.md#sec-014) | Pair a key-only guarded model with the strip middleware, creating hook and validated writes | Laravel | 1 | core | REVIEW | GUARDED |
| [SEC-015](laravel.md#sec-015) | Apply the tenant scope to every model whose table has the tenant column, with no exceptions | Laravel | 1 | `tenancy` | REVIEW | FORCED |
| [SEC-016](laravel.md#sec-016) | Give every table the tenant column unless it is a declared global table | Laravel | 1 | `tenancy` | REVIEW | FORCED |
| [SEC-017](laravel.md#sec-017) | Scope every model with a sub-tenant column by the sub-tenant trait or a dated allowlist entry | Laravel | 1 | `tenancy` | REVIEW | FORCED |
| [SEC-018](laravel.md#sec-018) | Cover every tenant-scoped model and tenant-aware job in the isolation suites | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [SEC-019](laravel.md#sec-019) | Validate foreign keys to tenant-scoped tables with the tenant-scoped exists rule | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [SEC-020](laravel.md#sec-020) | Pin the tenant or declare cross-tenant access with a reason in every background class | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [SEC-021](laravel.md#sec-021) | Answer cross-tenant direct access with 404, never 403 | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [SEC-022](laravel.md#sec-022) | Give every upload rule a size cap and type and extension allowlists without script formats | Laravel | 2 | core | REVIEW | GUARDED |
| [SEC-023](laravel.md#sec-023) | Enforce the morph map so polymorphic parent types come from an explicit allowlist | Laravel | 2 | core | REVIEW | FORCED |
| [SEC-024](laravel.md#sec-024) | Authorize file access by ownership of the file or its parent record, never by login alone | Laravel | 2 | core | REVIEW | REVIEW |
| [SEC-025](laravel.md#sec-025) | Store uploads under the validated extension, never a name derived from the sniffed type | Laravel | 2 | core | REVIEW | GUARDED |
| [SEC-026](shared.md#sec-026) | Store attachment ids, never URLs, and serve private files through short-lived signed URLs | Shared | 2 | core | REVIEW | REVIEW |
| [SEC-027](laravel.md#sec-027) | Redact credentials and personal data in every log channel | Laravel | 2 | core | REVIEW | GUARDED |
| [SEC-028](laravel.md#sec-028) | Keep the error tracker from sending personal data by default | Laravel | 2 | `observability` | REVIEW | FORCED |
| [SEC-029](laravel.md#sec-029) | Put readiness checks and infrastructure detail behind operator authorization | Laravel | 2 | core | REVIEW | REVIEW |
| [SEC-030](laravel.md#sec-030) | Make broadcast channels private and authorized, and tenant-scoped with the tenancy module | Laravel | 2 | core | REVIEW | REVIEW |
| [SEC-031](web.md#sec-031) | Import server-only in every module under the configured server paths | Web | 2 | core | REVIEW | FORCED |
| [SEC-032](web.md#sec-032) | Keep the upstream API base URL in server-side env, never in a public-prefixed variable | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [SEC-033](web.md#sec-033) | Limit the proxy session redirect to a cookie-presence check that never authorizes | Web | 2 | core | REVIEW | REVIEW |
| [SEC-034](web.md#sec-034) | Re-verify the session in every Route Handler and Server Action, and authorize in the backend | Web | 1 | core | REVIEW | GUARDED |
| [SEC-035](web.md#sec-035) | Refuse cross-site, missing and null origins on mutating requests in the same-origin check | Web | 1 | `bff-auth` | REVIEW | FORCED |
| [SEC-036](web.md#sec-036) | Write session cookies per the cookie contract: \_\_Host- prefix, HttpOnly, Secure, explicit SameSite | Web | 1 | `bff-auth` | REVIEW | GUARDED |
| [SEC-037](web.md#sec-037) | Write and clear session cookies only in the session module | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [SEC-038](web.md#sec-038) | Never hand the token to page JavaScript in the login response | Web | 1 | `bff-auth` | REVIEW | GUARDED |
| [SEC-039](web.md#sec-039) | Expire every session cookie on sign-out, a failed upstream logout and a relayed 401 included | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [SEC-040](web.md#sec-040) | Keep the session-presence predicates in agreement, treating an empty cookie as signed out | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [SEC-041](web.md#sec-041) | Forward only allow-listed headers through the BFF, never Cookie, Host or a client Authorization | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [SEC-042](web.md#sec-042) | Keep BFF path forwarding inside the configured API base path | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [SEC-043](web.md#sec-043) | Give route files only to the catch-all, the auth routes and allowlisted handlers | Web | 2 | `bff-auth` | REVIEW | FORCED |
| [SEC-044](web.md#sec-044) | Call only the same-origin BFF from the browser, never the API origin | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [SEC-045](web.md#sec-045) | Resolve Next.js at or above the Standard's security floor | Web | 1 | core | REVIEW | FORCED |
| [SEC-046](web.md#sec-046) | Use browser storage only through the storage module, and sessionStorage never | Web | 1 | core | REVIEW | GUARDED |
| [SEC-047](web.md#sec-047) | Write no raw HTML sinks such as dangerouslySetInnerHTML, innerHTML or document.write | Web | 1 | core | REVIEW | GUARDED |
| [SEC-048](web.md#sec-048) | Point browser tooling only at local or dev test accounts, and copy nothing it observes | Web | 2 | `browser-check` | REVIEW | REVIEW |
| [SEC-049](mobile.md#sec-049) | Keep auth tokens only in the OS secure store and credentials out of the storage module | Mobile | 1 | core | REVIEW | REVIEW |
| [SEC-050](mobile.md#sec-050) | Import unencrypted key-value stores only from the storage module | Mobile | 1 | core | REVIEW | FORCED |
| [SEC-051](mobile.md#sec-051) | Take device-storage keys only from the declared, app-namespaced keys module | Mobile | 2 | core | REVIEW | GUARDED |
| [SEC-052](mobile.md#sec-052) | Import the secure store only in the credential wrapper, used only by the API client and auth | Mobile | 1 | core | REVIEW | GUARDED |
| [SEC-053](mobile.md#sec-053) | Send the secure-store bearer token and JSON Accept and locale headers on every API request | Mobile | 1 | core | REVIEW | GUARDED |
| [SEC-054](mobile.md#sec-054) | Clear the token and call the unauthorized handler on a 401 from any call except login | Mobile | 2 | core | REVIEW | GUARDED |
| [SEC-055](mobile.md#sec-055) | Record the native token strategy in a project ADR that the manifest references | Mobile | 2 | core | REVIEW | GUARDED |
| [SEC-056](mobile.md#sec-056) | Clear the token, the server-state cache and the push registration when the session ends | Mobile | 2 | core | REVIEW | REVIEW |
| [SEC-057](mobile.md#sec-057) | Gitignore platform service-credential files and commit only placeholder examples | Mobile | 2 | core | REVIEW | GUARDED |
| [SEC-058](client.md#sec-058) | Use client permission checks only to hide or disable UI, and authorize every action on the server | Web and mobile | 1 | core | REVIEW | REVIEW |
| [SEC-059](web.md#sec-059) | Expire the session cookie before the backend token | Web | 2 | `bff-auth` | REVIEW | REVIEW |
| [SEC-060](web.md#sec-060) | Choose cookie-session SPA auth without a BFF only through an ADR that confirms its constraints | Web | 2 | core | REVIEW | GUARDED |
| [SEC-061](shared.md#sec-061) | Inject production secrets at runtime from the platform, never commit or bake them in | Shared | 1 | core | REVIEW | REVIEW |
| [SEC-062](shared.md#sec-062) | Give quality jobs no secrets, so no build or test step can need a runtime secret | Shared | 1 | core | REVIEW | GUARDED |
| [SEC-063](shared.md#sec-063) | Commit no secret: run a pinned secret scanner over every commit range in CI | Shared | 1 | core | REVIEW | GUARDED |
| [SEC-064](shared.md#sec-064) | Keep env example files to keys and placeholders, never secret values | Shared | 1 | core | REVIEW | GUARDED |
| [SEC-065](shared.md#sec-065) | Pin third-party tooling: actions to full commit SHAs, MCP servers and CLI tools to exact versions | Shared | 1 | core | REVIEW | GUARDED |
| [SEC-066](client.md#sec-066) | Import the error-tracking SDK only in the logger module | Web and mobile | 2 | `observability` | REVIEW | FORCED |
| [SEC-067](web.md#sec-067) | Call the shared same-origin check in every mutating Route Handler | Web | 1 | `bff-auth` | REVIEW | GUARDED |
| [SEC-068](web.md#sec-068) | List only exact hosts as Server Action allowed origins, never null or a wildcard | Web | 1 | `bff-auth` | REVIEW | GUARDED |
| [SEC-069](laravel.md#sec-069) | Throw when a record is created with an explicit foreign tenant id | Laravel | 1 | `tenancy` | REVIEW | GUARDED |
| [SEC-070](web.md#sec-070) | Change nothing in GET and HEAD Route Handlers: no cookie writes, no mutating upstream calls | Web | 2 | `bff-auth` | REVIEW | GUARDED |
| [SEC-071](laravel.md#sec-071) | Ship the mandated auth and authorization suites complete, with no todo, skipped or incomplete test | Laravel | 2 | core | REVIEW | GUARDED |
| [SEC-072](web.md#sec-072) | Export no runtime segment config from proxy.ts | Web | 2 | core | REVIEW | FORCED |
| [SEC-073](web.md#sec-073) | Run Chrome DevTools MCP only from the pinned companion plugin, unapproved in settings | Web | 2 | `browser-check` | REVIEW | GUARDED |
| [SEC-074](shared.md#sec-074) | Ask before browser companions leave development hosts or run unsafe actions | Shared | 2 | core | GUARDED | GUARDED |
| [SEC-075](shared.md#sec-075) | Ask before the Figma companion runs any tool that can change a Figma file | Shared | 2 | core | GUARDED | GUARDED |
| [I18N-001](laravel.md#i18n-001) | Take user-visible server messages from translation keys, never literal sentences | Laravel | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-002](laravel.md#i18n-002) | Implement HasLocalePreference on every notifiable model | Laravel | 2 | `i18n` | REVIEW | FORCED |
| [I18N-003](laravel.md#i18n-003) | Set the locale before authentication, throttling and route-model binding on every API route | Laravel | 1 | `i18n` | REVIEW | FORCED |
| [I18N-004](laravel.md#i18n-004) | Set the application locale only in the locale middleware and the locale-scoping helpers | Laravel | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-005](laravel.md#i18n-005) | Keep the backend's supported-locales config equal to the manifest's locales list | Laravel | 2 | `i18n` | REVIEW | FORCED |
| [I18N-006](laravel.md#i18n-006) | Keep server lang files in parity across the configured locales | Laravel | 1 | `i18n` | REVIEW | FORCED |
| [I18N-007](laravel.md#i18n-007) | Define every statically referenced server translation key in every configured locale | Laravel | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-008](laravel.md#i18n-008) | Translate the attribute name of every validated field in every configured locale | Laravel | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-009](laravel.md#i18n-009) | Leave no server locale plumbing behind while the i18n module is off | Laravel | 1 | core | REVIEW | GUARDED |
| [I18N-010](shared.md#i18n-010) | Have a person write or review translations, never generate them just to satisfy parity | Shared | 2 | `i18n` | REVIEW | REVIEW |
| [I18N-011](laravel.md#i18n-011) | Store each model's multilingual content with one declared strategy, never a mix | Laravel | 2 | `i18n` | REVIEW | REVIEW |
| [I18N-012](web.md#i18n-012) | Use logical-direction utility classes, never physical left and right | Web | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-013](client.md#i18n-013) | Use logical properties in style objects, never physical left and right | Web and mobile | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-014](client.md#i18n-014) | Pair every physical value with its right-to-left counterpart and mirror directional icons | Web and mobile | 2 | `i18n` | REVIEW | REVIEW |
| [I18N-015](web.md#i18n-015) | Reference only translation keys that exist in the source locale's typed web messages | Web | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-016](client.md#i18n-016) | Put user-facing copy in message files, not JSX literals | Web and mobile | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-017](client.md#i18n-017) | Write no source literal in a script used only by non-source locales | Web and mobile | 2 | `i18n` | REVIEW | FORCED |
| [I18N-018](web.md#i18n-018) | Never choose user-facing copy by comparing the locale with a literal | Web | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-019](client.md#i18n-019) | Never render backend \*\_label fields as labels on a client | Web and mobile | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-020](web.md#i18n-020) | Make the localized-field helper prefer the reader's locale and fall back through the chain | Web | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-021](web.md#i18n-021) | Prefix every locale route, never auto-detect, and use the configured locales and a project cookie | Web | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-022](web.md#i18n-022) | Pin the configured business time zone in the i18n request configuration | Web | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-023](web.md#i18n-023) | Navigate only through the locale-aware wrappers, never next/link or the replaced router APIs | Web | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-024](web.md#i18n-024) | Never hand-build locale-prefixed hrefs | Web | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-025](web.md#i18n-025) | Derive the current locale from the URL in one helper that accepts only configured locales | Web | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-026](web.md#i18n-026) | Place every page route under the locale segment | Web | 2 | `i18n` | REVIEW | FORCED |
| [I18N-027](web.md#i18n-027) | Set lang and dir on the document root from the active locale | Web | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-029](mobile.md#i18n-029) | Change layout direction and reload for a language only in the setAppLanguage() utility | Mobile | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-030](mobile.md#i18n-030) | Declare every configured locale in supportedLocales and never set supportsRTL or forcesRTL | Mobile | 2 | `i18n` | REVIEW | FORCED |
| [I18N-031](mobile.md#i18n-031) | Reference only translation keys that exist in the source locale's typed mobile resources | Mobile | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-032](shared.md#i18n-032) | Normalize locale digits in numeric input to the configured numbering system before submission | Shared | 2 | `i18n` | REVIEW | REVIEW |
| [I18N-033](client.md#i18n-033) | Give every configured locale the source locale's keys, grouping plural forms by base key | Web and mobile | 1 | `i18n` | REVIEW | FORCED |
| [I18N-034](client.md#i18n-034) | Leave no locale value empty or whitespace-only | Web and mobile | 1 | `i18n` | REVIEW | FORCED |
| [I18N-035](client.md#i18n-035) | Allow a value identical to the source locale's only for an allowlisted key | Web and mobile | 1 | `i18n` | REVIEW | FORCED |
| [I18N-036](client.md#i18n-036) | Use the same placeholders for a key in every locale, parsed with the track's message syntax | Web and mobile | 1 | `i18n` | REVIEW | FORCED |
| [I18N-037](client.md#i18n-037) | Read multilingual content only through the localized-field helper, never \*\_&lt;locale> keys | Web and mobile | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-038](client.md#i18n-038) | Show a screen's own copy for expected errors, keyed by problem type, with server detail as fallback | Web and mobile | 2 | `i18n` | REVIEW | REVIEW |
| [I18N-039](web.md#i18n-039) | Send the active UI locale, not the browser's, as Accept-Language from the web client | Web | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-040](client.md#i18n-040) | Read the browser or device locale only in the language module, and never switch it automatically | Web and mobile | 1 | `i18n` | REVIEW | GUARDED |
| [I18N-041](shared.md#i18n-041) | Name in place any shortcut that is safe only while a locale cannot reach that screen | Shared | 2 | `i18n` | REVIEW | REVIEW |
| [I18N-042](client.md#i18n-042) | Match each locale's plural forms to the categories Intl.PluralRules reports for it | Web and mobile | 1 | `i18n` | REVIEW | FORCED |
| [I18N-043](laravel.md#i18n-043) | Answer in the requested configured locale, falling back to the default for an unlisted one | Laravel | 2 | `i18n` | REVIEW | GUARDED |
| [I18N-044](web.md#i18n-044) | Derive every configured locale's direction from the one hard-coded right-to-left locale list | Web | 2 | `i18n` | REVIEW | GUARDED |
| [UI-001](web.md#ui-001) | Import no feature code or generated contract types in UI primitives | Web | 2 | core | REVIEW | FORCED |
| [UI-002](web.md#ui-002) | Keep UI primitives from reaching the i18n library, directly or through other modules | Web | 2 | `i18n` | REVIEW | FORCED |
| [UI-003](client.md#ui-003) | Use design tokens, never raw color literals | Web and mobile | 2 | core | REVIEW | GUARDED |
| [UI-004](web.md#ui-004) | Use the z-index token ladder, never arbitrary z-index values | Web | 2 | core | REVIEW | GUARDED |
| [UI-005](web.md#ui-005) | Style with one system: no preprocessor stylesheets, CSS-in-JS modules or &lt;style jsx> blocks | Web | 1 | core | REVIEW | GUARDED |
| [UI-006](web.md#ui-006) | Hand-write CSS only where the utility system falls short, each block with a why-comment | Web | 2 | core | REVIEW | GUARDED |
| [UI-007](web.md#ui-007) | Define design tokens in one source; other CSS may only alias them | Web | 2 | core | REVIEW | GUARDED |
| [UI-008](web.md#ui-008) | Compose chart and SVG color token references only in the chart-token module | Web | 2 | core | REVIEW | GUARDED |
| [UI-009](web.md#ui-009) | Reference color tokens without fallback values | Web | 2 | core | REVIEW | GUARDED |
| [UI-010](web.md#ui-010) | Route overlays through the shared overlay utilities; no createPortal elsewhere | Web | 2 | core | REVIEW | GUARDED |
| [UI-011](client.md#ui-011) | Render loading, error and empty states through the shared state primitives | Web and mobile | 2 | core | REVIEW | REVIEW |
| [UI-012](web.md#ui-012) | Pass an automated accessibility scan, target size included, on every journey page | Web | 2 | core | REVIEW | GUARDED |
| [UI-013](web.md#ui-013) | Browser-check every changed screen before reporting UI work done | Web | 2 | `browser-check` | REVIEW | REVIEW |
| [UI-014](mobile.md#ui-014) | Reference the platform Text and TextInput components only inside the text primitives | Mobile | 2 | core | REVIEW | GUARDED |
| [UI-015](mobile.md#ui-015) | Take spacing, sizes, radii and font sizes from tokens, not numeric literals | Mobile | 2 | core | REVIEW | GUARDED |
| [UI-016](mobile.md#ui-016) | Define styles through the theme style factory | Mobile | 2 | core | REVIEW | GUARDED |
| [UI-017](mobile.md#ui-017) | Type light and dark palettes with one shared interface so their keys cannot drift | Mobile | 2 | core | REVIEW | GUARDED |
| [UI-018](mobile.md#ui-018) | Map domain states to color tokens in one per-domain module, never inline | Mobile | 2 | core | REVIEW | REVIEW |
| [UI-019](mobile.md#ui-019) | Declare an accessibility role on every touchable | Mobile | 2 | core | REVIEW | GUARDED |
| [UI-020](mobile.md#ui-020) | Label icon-only controls, expose selected and disabled state, and meet the minimum touch target | Mobile | 2 | core | REVIEW | REVIEW |
| [UI-021](shared.md#ui-021) | Run impeccable's audit, critique and polish commands on UI changes before calling them done | Shared | 2 | `design` | REVIEW | REVIEW |
| [UI-022](shared.md#ui-022) | Install impeccable only from the pinned companion plugin, without its hooks | Shared | 2 | `design` | REVIEW | GUARDED |
| [PROC-001](shared.md#proc-001) | Declare tracks, tier and modules in a schema-valid manifest that covers every detected stack | Shared | 1 | core | REVIEW | FORCED |
| [PROC-002](shared.md#proc-002) | Declare Tier 2 when at least two tier triggers hold, or record why it is declined | Shared | 1 | core | REVIEW | GUARDED |
| [PROC-003](shared.md#proc-003) | Install each declared track and module as a complete unit, and leave no substrate of the others | Shared | 1 | core | REVIEW | GUARDED |
| [PROC-004](shared.md#proc-004) | Enable the Standard's plugin in the repository's committed .claude/settings.json | Shared | 2 | core | REVIEW | GUARDED |
| [PROC-005](shared.md#proc-005) | Record the stack table in the manifest, every concern filled and every named package installed | Shared | 1 | core | REVIEW | GUARDED |
| [PROC-006](shared.md#proc-006) | Prefer the installed library's idiomatic API, then its escape hatch, and explain hand-written code | Shared | 1 | core | REVIEW | REVIEW |
| [PROC-007](shared.md#proc-007) | Install at most one library per concern, test runners included | Shared | 1 | core | REVIEW | GUARDED |
| [PROC-008](client.md#proc-008) | Import a deprecated library only inside its declared legacy paths, so new code uses the winner | Web and mobile | 1 | core | REVIEW | GUARDED |
| [PROC-009](shared.md#proc-009) | Land each new runtime dependency with an ADR that names the alternatives considered | Shared | 1 | core | REVIEW | GUARDED |
| [PROC-010](shared.md#proc-010) | Keep business rules on the backend, and name and test the source of any deliberate client mirror | Shared | 1 | core | REVIEW | REVIEW |
| [PROC-011](shared.md#proc-011) | Keep copied gate files equal to the adopted templates, except inside declared configuration regions | Shared | 1 | core | REVIEW | GUARDED |
| [PROC-012](shared.md#proc-012) | Never delete or weaken a gate to get green; fix the code, record a dated exception or a waiver | Shared | 1 | core | REVIEW | REVIEW |
| [PROC-013](shared.md#proc-013) | Ask the user before an agent edits gate files, baselines, allowlists or CI workflows | Shared | 1 | core | GUARDED | GUARDED |
| [PROC-014](shared.md#proc-014) | Give every allowlist entry a reason and an expiry date, and fail CI once the date has passed | Shared | 1 | core | REVIEW | FORCED |
| [PROC-015](client.md#proc-015) | Never let the ESLint bulk-suppressions file grow | Web and mobile | 1 | core | REVIEW | GUARDED |
| [PROC-016](client.md#proc-016) | Describe the reason in every ESLint disable directive | Web and mobile | 1 | core | REVIEW | FORCED |
| [PROC-017](shared.md#proc-017) | Trust a gate only after seeing it fail on a minimal violation and pass on clean code | Shared | 1 | core | REVIEW | REVIEW |
| [PROC-018](shared.md#proc-018) | Keep every enabled gate with a shipped probe failing on that probe after adopting or upgrading | Shared | 1 | core | REVIEW | GUARDED |
| [PROC-019](shared.md#proc-019) | Keep a numbered ADR log in the configured decisions directory in a Tier-2 project | Shared | 2 | core | REVIEW | GUARDED |
| [PROC-020](shared.md#proc-020) | Name in each pull request the rule IDs or ADRs its change follows | Shared | 2 | core | REVIEW | GUARDED |
| [PROC-021](shared.md#proc-021) | Before claiming done, re-read the diff, run the checks and report their real output verbatim | Shared | 1 | core | REVIEW | REVIEW |
| [PROC-022](shared.md#proc-022) | Pass the fast gate before an agent session ends | Shared | 1 | core | GUARDED | GUARDED |
| [PROC-023](shared.md#proc-023) | Extract convenience duplication at the third copy, and inline any one-caller abstraction | Shared | 2 | core | REVIEW | REVIEW |
| [PROC-024](shared.md#proc-024) | Extract a duplicated business rule at its second copy, including one rendered on two surfaces | Shared | 2 | core | REVIEW | REVIEW |
| [PROC-025](client.md#proc-025) | Allow inline ESLint exceptions only as eslint-disable-next-line comments | Web and mobile | 1 | core | REVIEW | FORCED |
| [PROC-026](shared.md#proc-026) | Ask the user before an agent runs a shell command that skips or weakens a gate | Shared | 1 | core | GUARDED | GUARDED |
| [PROC-027](client.md#proc-027) | Never let the dependency-cruiser known-violations baseline grow | Web and mobile | 1 | core | REVIEW | GUARDED |
| [PROC-028](shared.md#proc-028) | Ask in the pull request template for the rule IDs a change follows and the real check output | Shared | 2 | core | REVIEW | GUARDED |
| [PROC-029](shared.md#proc-029) | Keep the managed CLAUDE.md block, with any imported AGENTS.md, under 200 lines | Shared | 2 | core | REVIEW | GUARDED |
| [PROC-030](shared.md#proc-030) | Report lint errors in a file back to the agent right after it edits the file | Shared | 2 | core | GUARDED | GUARDED |
| [PROC-031](client.md#proc-031) | Name the disabled rules in every ESLint directive and fail unused directives | Web and mobile | 1 | core | REVIEW | GUARDED |
| [PROC-032](client.md#proc-032) | Keep ESLint, TypeScript, @types/node and Node inside the Standard's supported ranges | Web and mobile | 1 | core | REVIEW | FORCED |
| [PROC-033](client.md#proc-033) | Run dependency-cruiser only through the kit wrapper that fails when nothing was cruised | Web and mobile | 1 | core | REVIEW | GUARDED |
| [PROC-034](shared.md#proc-034) | Never let the jscpd duplication baseline grow | Shared | 1 | core | REVIEW | GUARDED |
| [CI-001](laravel.md#ci-001) | Run format, analysis, tests with the coverage floor and baseline growth in the Laravel chain | Laravel | 1 | core | REVIEW | GUARDED |
| [CI-002](web.md#ci-002) | Run typecheck, lint, format, boundaries, dead code and tests with coverage in the web chain | Web | 1 | core | REVIEW | GUARDED |
| [CI-003](web.md#ci-003) | Run the production build in the web quality job | Web | 1 | core | REVIEW | GUARDED |
| [CI-004](mobile.md#ci-004) | Run typecheck, lint, structure, format, boundaries, dead code and covered tests in the mobile chain | Mobile | 1 | core | REVIEW | GUARDED |
| [CI-005](mobile.md#ci-005) | Bundle the app with expo export in the mobile quality job | Mobile | 1 | core | REVIEW | GUARDED |
| [CI-006](shared.md#ci-006) | Regenerate the client API types from the exported contract in CI and fail on any diff | Shared | 1 | `api-contract` | REVIEW | GUARDED |
| [CI-007](shared.md#ci-007) | Pin the backend's published OpenAPI artifact in a standalone client and fail CI on type drift | Shared | 1 | `api-contract` | REVIEW | GUARDED |
| [CI-008](shared.md#ci-008) | Audit production dependencies for known vulnerabilities in every quality job | Shared | 1 | core | REVIEW | GUARDED |
| [CI-009](shared.md#ci-009) | Run every member of each track's check script as its own named CI step | Shared | 1 | core | REVIEW | GUARDED |
| [CI-010](client.md#ci-010) | Run ESLint at zero warnings in every JavaScript check chain | Web and mobile | 1 | core | REVIEW | GUARDED |
| [CI-011](shared.md#ci-011) | Make every build, deploy or release job depend on the quality job | Shared | 1 | core | REVIEW | GUARDED |
| [CI-012](shared.md#ci-012) | Reuse one quality workflow per track instead of copying its steps | Shared | 2 | core | REVIEW | GUARDED |
| [CI-013](shared.md#ci-013) | Protect the default branch and require the quality check before merge | Shared | 1 | core | REVIEW | REVIEW |
| [CI-014](shared.md#ci-014) | Assign a CODEOWNERS owner to every gate file, allowlist and workflow | Shared | 2 | core | REVIEW | GUARDED |
| [CI-015](shared.md#ci-015) | Run the secret scan, formatters and linters on staged files before each commit | Shared | 2 | core | REVIEW | GUARDED |
| [CI-016](shared.md#ci-016) | Check in CI that commit messages and pull request titles follow Conventional Commits | Shared | 2 | core | REVIEW | GUARDED |
| [CI-017](laravel.md#ci-017) | Publish a backend-only repository's OpenAPI document as a versioned artifact after its export | Laravel | 1 | `api-contract` | REVIEW | GUARDED |
| [CI-018](shared.md#ci-018) | Delay dependency releases, group framework updates without automerge and hold risky majors | Shared | 2 | core | REVIEW | GUARDED |
