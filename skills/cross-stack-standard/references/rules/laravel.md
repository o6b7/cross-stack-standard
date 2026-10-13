<!-- Generated copy of docs/rules/. Do not edit; run npm run build:agent-skill. -->

# Laravel rules

Rules for the Laravel track: a JSON API with its architecture, validation, authorization, persistence and tests.

151 rules: 0 FORCED, 0 GUARDED, 151 REVIEW; 132 awaiting promotion to a gated level. Target levels: 48 FORCED, 84 GUARDED, 19 REVIEW. Back to the [rule index](README.md).

| ID | Title | Tier | Enforcement | Target |
| --- | --- | --- | --- | --- |
| [BE-001](#be-001) | Declare strict_types=1 in every namespaced PHP file | 1 | REVIEW | FORCED |
| [BE-002](#be-002) | Format PHP with Pint against a committed configuration that names its preset | 1 | REVIEW | FORCED |
| [BE-003](#be-003) | Pass Larastan at the project's level, with every parameter, return and property typed | 1 | REVIEW | FORCED |
| [BE-004](#be-004) | Keep the effective Larastan level, analysed paths and unmatched-ignore reporting at the floor | 1 | REVIEW | GUARDED |
| [BE-005](#be-005) | Never let the PHPStan baseline grow | 1 | REVIEW | GUARDED |
| [BE-006](#be-006) | Never lower the PHPStan level, and raise it by the recorded due date | 2 | REVIEW | GUARDED |
| [BE-007](#be-007) | Pass the Pest php preset: no debug, diagnostic or raw output calls such as var_dump, dump or echo | 2 | REVIEW | GUARDED |
| [BE-008](#be-008) | Leave no untracked TODO, FIXME, HACK or XXX marker: each one carries a ticket reference | 2 | REVIEW | GUARDED |
| [BE-009](#be-009) | Commit no commented-out PHP code | 2 | REVIEW | GUARDED |
| [BE-010](#be-010) | Document in .env.example every env() key that project config files read | 2 | REVIEW | GUARDED |
| [BE-011](#be-011) | Run the test suite against uncached configuration | 2 | REVIEW | FORCED |
| [BE-012](#be-012) | Pin a hermetic test environment in phpunit.xml with force="true" | 2 | REVIEW | GUARDED |
| [BE-013](#be-013) | Meet the configured backend test-coverage floor | 1 | REVIEW | GUARDED |
| [BE-014](#be-014) | Add no new PHP copy-paste clones beyond the committed jscpd baseline | 2 | REVIEW | GUARDED |
| [BE-015](#be-015) | Serve every API route under a version prefix | 2 | REVIEW | FORCED |
| [BE-016](#be-016) | Shape API URIs as kebab-case plural resources, with state transitions as POST sub-resource verbs | 2 | REVIEW | GUARDED |
| [BE-017](#be-017) | Route every request to a controller action; no route closures | 2 | REVIEW | FORCED |
| [BE-018](#be-018) | Type the input of every POST, PUT and PATCH action as a FormRequest | 2 | REVIEW | FORCED |
| [BE-019](#be-019) | Keep validation in FormRequests; no inline validation in the HTTP layer | 2 | REVIEW | FORCED |
| [BE-020](#be-020) | Name store and update requests Store{Model}Request and Update{Model}Request | 2 | REVIEW | GUARDED |
| [BE-021](#be-021) | Authorize each endpoint at exactly one site with exactly one policy ability | 2 | REVIEW | GUARDED |
| [BE-022](#be-022) | Exercise every API route in at least one feature test | 2 | REVIEW | GUARDED |
| [BE-023](#be-023) | Answer failed logins with one generic problem detail | 2 | REVIEW | FORCED |
| [BE-024](#be-024) | Declare an allowed response type as the return type of every controller action | 2 | REVIEW | FORCED |
| [BE-025](#be-025) | Build JSON responses only through the sanctioned response path; never hand-roll them | 1 | REVIEW | FORCED |
| [BE-026](#be-026) | Emit the configured success shape exactly: no ad-hoc top-level keys and no double data wrapping | 1 | REVIEW | GUARDED |
| [BE-027](#be-027) | Render every API exception as RFC 9457 problem details from one renderer, with errors on 422 | 1 | REVIEW | GUARDED |
| [BE-028](#be-028) | Use the status vocabulary: 409 for state and concurrency conflicts, 422 only for validation | 2 | REVIEW | REVIEW |
| [BE-029](#be-029) | Never service-locate outside service providers: no app(), resolve(), App::make or container calls | 2 | REVIEW | GUARDED |
| [BE-030](#be-030) | Add no pass-through layers: single-step CRUD and list queries stay in the controller | 2 | REVIEW | REVIEW |
| [BE-031](#be-031) | Add a service only for a domain rule used outside HTTP; make shared multi-step writes Actions | 2 | REVIEW | REVIEW |
| [BE-032](#be-032) | Add no repository or speculative layer classes (Repository, Manager, Handler, UseCase, Interactor) | 2 | REVIEW | GUARDED |
| [BE-033](#be-033) | Implement every Action as an invokable class in App\\Actions | 2 | REVIEW | FORCED |
| [BE-034](#be-034) | Keep raw SQL, the DB facade and transactions out of the HTTP layer | 2 | REVIEW | FORCED |
| [BE-035](#be-035) | Keep services plain classes with no interface and no base class | 2 | REVIEW | FORCED |
| [BE-036](#be-036) | Place each kind of class in the namespace the configured placement map assigns it | 2 | REVIEW | FORCED |
| [BE-037](#be-037) | Pass the Pest laravel preset: framework class conventions and no env() outside config | 2 | REVIEW | GUARDED |
| [BE-038](#be-038) | Promote and mark readonly every constructor parameter of controllers, services and Actions | 2 | REVIEW | FORCED |
| [BE-039](#be-039) | Keep controllers under the configured line count | 2 | REVIEW | FORCED |
| [BE-040](#be-040) | Keep HTTP, validation and response concerns out of models | 2 | REVIEW | FORCED |
| [BE-041](#be-041) | Declare casts in the casts() method, not the $casts property | 2 | REVIEW | FORCED |
| [BE-042](#be-042) | Name database columns in snake_case | 2 | REVIEW | FORCED |
| [BE-043](#be-043) | Cast every status, state, type and role column to a string-backed enum | 2 | REVIEW | GUARDED |
| [BE-044](#be-044) | Make every enum a native string-backed enum | 2 | REVIEW | FORCED |
| [BE-045](#be-045) | Name enum cases in the configured style with snake_case backing values | 2 | REVIEW | FORCED |
| [BE-046](#be-046) | Never compare enum-cast attributes to string literals; use the enum | 2 | REVIEW | GUARDED |
| [BE-047](#be-047) | Keep presentation data such as colors off enums; the API emits semantic state only | 2 | REVIEW | GUARDED |
| [BE-048](#be-048) | Emit enum values only; never add \*\_label display fields to Resources | 2 | REVIEW | GUARDED |
| [BE-049](#be-049) | Serialize models only through API Resources in the HTTP layer | 2 | REVIEW | FORCED |
| [BE-050](#be-050) | Define each wire shape once: one Resource per shape, summary Resources for nested relations | 2 | REVIEW | REVIEW |
| [BE-051](#be-051) | Decide single-record access in policies and list visibility in a scope that mirrors them | 2 | REVIEW | REVIEW |
| [BE-052](#be-052) | Generate sequential codes with a database sequence or retry on unique violation, never max + 1 | 2 | REVIEW | REVIEW |
| [BE-053](#be-053) | Enable Eloquent strict mode outside production | 2 | REVIEW | FORCED |
| [BE-054](#be-054) | Paginate every list (index) route | 2 | REVIEW | GUARDED |
| [BE-055](#be-055) | Sanitize and hard-cap per_page, falling back to the default on invalid input | 2 | REVIEW | GUARDED |
| [BE-056](#be-056) | Accept only declared filter and sort keys; reject unknown keys with 400 | 2 | REVIEW | GUARDED |
| [BE-057](#be-057) | Use one filter idiom per project for list queries | 2 | REVIEW | REVIEW |
| [BE-058](#be-058) | Set server-derived fields in prepareForValidation(), never from client input | 2 | REVIEW | REVIEW |
| [BE-059](#be-059) | Keep wire field names equal to storage column names | 2 | REVIEW | REVIEW |
| [BE-060](#be-060) | Keep FormRequest messages() keys matched to rules that exist | 2 | REVIEW | GUARDED |
| [BE-061](#be-061) | Run the server-owned-field strip middleware first in the resolved API middleware stack | 1 | REVIEW | FORCED |
| [BE-062](#be-062) | Apply the active-tenant middleware to every authenticated API route | 1 | REVIEW | FORCED |
| [BE-063](#be-063) | Wire tenancy into the user model only through the shipped traits; never redefine the tenant relation | 2 | REVIEW | FORCED |
| [BE-064](#be-064) | Migrate the tenancy schema: a tenants table with non-null feature flags and tenant columns on users | 2 | REVIEW | FORCED |
| [BE-065](#be-065) | Seed a valid tenancy state: an operator, the default tenant and no rows without a tenant | 2 | REVIEW | GUARDED |
| [BE-066](#be-066) | Build isolation-test fixtures from scratch; never depend on seeded tenants | 2 | REVIEW | GUARDED |
| [BE-067](#be-067) | Ship the tenant-isolation suites complete, with no todo, skipped or incomplete test | 1 | REVIEW | GUARDED |
| [BE-068](#be-068) | Scope list endpoints silently to the caller's tenant: foreign rows absent and totals tenant-only | 1 | REVIEW | GUARDED |
| [BE-069](#be-069) | Apply the sub-tenant scope in every listing over a sub-tenant model | 2 | REVIEW | GUARDED |
| [BE-070](#be-070) | Apply sub-tenant scoping only through the model-attached scope | 2 | REVIEW | GUARDED |
| [BE-071](#be-071) | Block a disabled tenant at login and on existing tokens with one shared predicate and message | 2 | REVIEW | GUARDED |
| [BE-072](#be-072) | Grant the platform bypass only to operators without a tenant, and honor it at every layer | 2 | REVIEW | GUARDED |
| [BE-073](#be-073) | Fail closed for a user without a resolvable tenant: no rows, no create and 403 on requests | 2 | REVIEW | GUARDED |
| [BE-074](#be-074) | Define the platform-bypass predicate once and call it from every tenancy layer | 2 | REVIEW | GUARDED |
| [BE-075](#be-075) | Resolve the tenant from the authenticated user, never from headers, hosts or request parameters | 1 | REVIEW | REVIEW |
| [BE-076](#be-076) | Let a tenant's host decide only pre-login branding and login affinity, never data scoping | 2 | REVIEW | REVIEW |
| [BE-077](#be-077) | Consume the tenancy mechanism from the vendored package, never from a copied or edited version | 2 | REVIEW | GUARDED |
| [BE-078](#be-078) | Gate tenant features with the feature middleware keyed to the feature enum | 2 | REVIEW | GUARDED |
| [BE-079](#be-079) | Never re-implement a tenant feature check inline in a controller | 2 | REVIEW | GUARDED |
| [BE-080](#be-080) | Test a 403 for every tenant-feature key used in the route table | 2 | REVIEW | GUARDED |
| [BE-081](#be-081) | Cache tenant data only through the tenant-aware helper that prefixes keys with the tenant id | 2 | REVIEW | GUARDED |
| [BE-082](#be-082) | Never send a push notification to a device token outside the notification's tenant | 2 | REVIEW | REVIEW |
| [BE-083](#be-083) | Route all file uploads through the declared upload requests | 2 | REVIEW | GUARDED |
| [BE-084](#be-084) | Queue every mailable and notification | 2 | REVIEW | GUARDED |
| [BE-085](#be-085) | Pass identifiers to queued classes, never the authenticated user, the request or closures | 2 | REVIEW | GUARDED |
| [BE-086](#be-086) | Declare tries or retryUntil, backoff and timeout on every job and queued listener | 2 | REVIEW | FORCED |
| [BE-087](#be-087) | Make jobs safe to retry: idempotent, guarded on current state, fast to fail on permanent errors | 2 | REVIEW | REVIEW |
| [BE-088](#be-088) | Schedule pruning of failed jobs whenever the application has queued classes | 2 | REVIEW | FORCED |
| [BE-089](#be-089) | Surface a failed job's owed result to the affected user or tenant | 2 | REVIEW | GUARDED |
| [BE-090](#be-090) | Log with a constant message and pass variable data in the context array | 2 | REVIEW | FORCED |
| [BE-091](#be-091) | Log ids and stable codes, never models, tenant rows or per-locale column dumps | 2 | REVIEW | GUARDED |
| [BE-092](#be-092) | Propagate one request id: adopt or generate it, bind it to the log context and echo it on responses | 2 | REVIEW | FORCED |
| [BE-093](#be-093) | Report errors to the error tracker only from the central exception funnel | 2 | REVIEW | GUARDED |
| [BE-094](#be-094) | Keep the liveness route unauthenticated, dependency-free and free of version detail | 2 | REVIEW | GUARDED |
| [BE-095](#be-095) | Poll for live surfaces; add server broadcasting packages only with a recorded decision | 2 | REVIEW | GUARDED |
| [BE-096](#be-096) | Record audit events only through the audit-trail mechanism declared in the stack table | 2 | REVIEW | REVIEW |
| [BE-097](#be-097) | Name regression tests after the invariant they protect | 2 | REVIEW | REVIEW |
| [BE-098](#be-098) | Write every inline PHPStan suppression as @phpstan-ignore with an identifier and a reason | 1 | REVIEW | FORCED |
| [BE-099](#be-099) | Export the OpenAPI document with scramble:export --fail-on-unknown on every CI run | 1 | REVIEW | GUARDED |
| [BE-100](#be-100) | Strip server-owned fields from body, query and JSON input, nested keys included | 1 | REVIEW | GUARDED |
| [BE-101](#be-101) | Stamp the tenant on create from the acting user, else the pinned context; refuse neither | 1 | REVIEW | GUARDED |
| [BE-102](#be-102) | Scope background reads to the pinned tenant context and fail closed when nothing is pinned | 1 | REVIEW | GUARDED |
| [BE-103](#be-103) | Never resolve the authenticated user inside the tenant scope | 2 | REVIEW | GUARDED |
| [BE-104](#be-104) | Apply tenant feature gates to every tenant user, admins included; exempt only the platform bypass | 2 | REVIEW | GUARDED |
| [BE-105](#be-105) | Let the authenticated user's tenant take precedence over a pinned tenant context | 2 | REVIEW | GUARDED |
| [BE-106](#be-106) | Reference tenants with restrict-on-delete foreign keys and non-nullable business tenant columns | 2 | REVIEW | FORCED |
| [BE-107](#be-107) | Fail the test run on incomplete and risky tests | 1 | REVIEW | GUARDED |
| [SEC-001](#sec-001) | Call no insecure PHP functions such as eval, exec, md5, sha1, unserialize or rand | 1 | REVIEW | GUARDED |
| [SEC-002](#sec-002) | Map GET and HEAD routes only to index, show or allowlisted read actions | 1 | REVIEW | GUARDED |
| [SEC-003](#sec-003) | Declare authorize() in every FormRequest and never return a constant true from it | 1 | REVIEW | FORCED |
| [SEC-004](#sec-004) | Resolve every non-public route to an existing policy ability, and allowlist public routes | 1 | REVIEW | GUARDED |
| [SEC-005](#sec-005) | Require authentication on every non-public API route | 1 | REVIEW | FORCED |
| [SEC-006](#sec-006) | Rate-limit every unauthenticated API route with a bounded limiter | 1 | REVIEW | GUARDED |
| [SEC-007](#sec-007) | Rate-limit every mutating authenticated API route with a bounded limiter | 2 | REVIEW | GUARDED |
| [SEC-008](#sec-008) | Cap attempts per minute on the login, password change and password reset routes | 2 | REVIEW | GUARDED |
| [SEC-009](#sec-009) | Return the access token at the documented response path from the token login route | 2 | REVIEW | FORCED |
| [SEC-010](#sec-010) | Revoke the current access token on logout | 1 | REVIEW | FORCED |
| [SEC-011](#sec-011) | Give access tokens a finite expiration at or below the configured bound | 1 | REVIEW | FORCED |
| [SEC-012](#sec-012) | Expose no exception message, class or trace in error responses when debug is off | 1 | REVIEW | GUARDED |
| [SEC-013](#sec-013) | Persist only validated input in write actions, never raw request input | 1 | REVIEW | GUARDED |
| [SEC-014](#sec-014) | Pair a key-only guarded model with the strip middleware, creating hook and validated writes | 1 | REVIEW | GUARDED |
| [SEC-015](#sec-015) | Apply the tenant scope to every model whose table has the tenant column, with no exceptions | 1 | REVIEW | FORCED |
| [SEC-016](#sec-016) | Give every table the tenant column unless it is a declared global table | 1 | REVIEW | FORCED |
| [SEC-017](#sec-017) | Scope every model with a sub-tenant column by the sub-tenant trait or a dated allowlist entry | 1 | REVIEW | FORCED |
| [SEC-018](#sec-018) | Cover every tenant-scoped model and tenant-aware job in the isolation suites | 1 | REVIEW | GUARDED |
| [SEC-019](#sec-019) | Validate foreign keys to tenant-scoped tables with the tenant-scoped exists rule | 1 | REVIEW | GUARDED |
| [SEC-020](#sec-020) | Pin the tenant or declare cross-tenant access with a reason in every background class | 1 | REVIEW | GUARDED |
| [SEC-021](#sec-021) | Answer cross-tenant direct access with 404, never 403 | 1 | REVIEW | GUARDED |
| [SEC-022](#sec-022) | Give every upload rule a size cap and type and extension allowlists without script formats | 2 | REVIEW | GUARDED |
| [SEC-023](#sec-023) | Enforce the morph map so polymorphic parent types come from an explicit allowlist | 2 | REVIEW | FORCED |
| [SEC-024](#sec-024) | Authorize file access by ownership of the file or its parent record, never by login alone | 2 | REVIEW | REVIEW |
| [SEC-025](#sec-025) | Store uploads under the validated extension, never a name derived from the sniffed type | 2 | REVIEW | GUARDED |
| [SEC-027](#sec-027) | Redact credentials and personal data in every log channel | 2 | REVIEW | GUARDED |
| [SEC-028](#sec-028) | Keep the error tracker from sending personal data by default | 2 | REVIEW | FORCED |
| [SEC-029](#sec-029) | Put readiness checks and infrastructure detail behind operator authorization | 2 | REVIEW | REVIEW |
| [SEC-030](#sec-030) | Make broadcast channels private and authorized, and tenant-scoped with the tenancy module | 2 | REVIEW | REVIEW |
| [SEC-069](#sec-069) | Throw when a record is created with an explicit foreign tenant id | 1 | REVIEW | GUARDED |
| [SEC-071](#sec-071) | Ship the mandated auth and authorization suites complete, with no todo, skipped or incomplete test | 2 | REVIEW | GUARDED |
| [I18N-001](#i18n-001) | Take user-visible server messages from translation keys, never literal sentences | 1 | REVIEW | GUARDED |
| [I18N-002](#i18n-002) | Implement HasLocalePreference on every notifiable model | 2 | REVIEW | FORCED |
| [I18N-003](#i18n-003) | Set the locale before authentication, throttling and route-model binding on every API route | 1 | REVIEW | FORCED |
| [I18N-004](#i18n-004) | Set the application locale only in the locale middleware and the locale-scoping helpers | 2 | REVIEW | GUARDED |
| [I18N-005](#i18n-005) | Keep the backend's supported-locales config equal to the manifest's locales list | 2 | REVIEW | FORCED |
| [I18N-006](#i18n-006) | Keep server lang files in parity across the configured locales | 1 | REVIEW | FORCED |
| [I18N-007](#i18n-007) | Define every statically referenced server translation key in every configured locale | 1 | REVIEW | GUARDED |
| [I18N-008](#i18n-008) | Translate the attribute name of every validated field in every configured locale | 2 | REVIEW | GUARDED |
| [I18N-009](#i18n-009) | Leave no server locale plumbing behind while the i18n module is off | 1 | REVIEW | GUARDED |
| [I18N-011](#i18n-011) | Store each model's multilingual content with one declared strategy, never a mix | 2 | REVIEW | REVIEW |
| [I18N-043](#i18n-043) | Answer in the requested configured locale, falling back to the default for an unlisted one | 2 | REVIEW | GUARDED |
| [CI-001](#ci-001) | Run format, analysis, tests with the coverage floor and baseline growth in the Laravel chain | 1 | REVIEW | GUARDED |
| [CI-017](#ci-017) | Publish a backend-only repository's OpenAPI document as a versioned artifact after its export | 1 | REVIEW | GUARDED |

## BE-001

**Declare strict_types=1 in every namespaced PHP file.**

Every file in the application and database namespaces declares strict_types=1, checked by a Pest architecture test, and Pint's declare_strict_types fixer adds the declaration to route and config files as well.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-001] every namespaced PHP file declares strict types` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-001.namespaces` (planned) |
| Decision | [ADR 0089](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0089-formatter-config-and-strict-types.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-001/` |
| Adoption | Allowlist: brownfield files get dated ->ignoring() entries that only shrink and the Pint fixer runs on changed files, never a mass rewrite, because strict types turn scalar coercion into type errors. |

## BE-002

**Format PHP with Pint against a committed configuration that names its preset.**

A committed pint.json names the laravel preset plus individually justified rules, pint --test runs as its own check step, and the edit hook and pre-commit format changed files automatically.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — ci: `format` / `laravel-quality` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0089](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0089-formatter-config-and-strict-types.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-002/` |
| Adoption | Nothing needed: adopt runs Pint once over the project and commits the result before the check is enabled. |

## BE-003

**Pass Larastan at the project's level, with every parameter, return and property typed.**

phpstan analyse with the Larastan extension passes at the project's level (8 for greenfield projects, at least 6 for brownfield ones), so a missing type fails the run and existing errors live only in the shrink-only baseline.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — ci: `analyse` / `laravel-quality` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0038](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0038-larastan-levels-shrink-only-baseline.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-003/` |
| Adoption | Baseline: brownfield projects start at level 6 with existing errors recorded in phpstan-baseline.neon. |

## BE-004

**Keep the effective Larastan level, analysed paths and unmatched-ignore reporting at the floor.**

The check reads the merged parameters and the composer analyse script, and fails when the level is below the floor for the project type, app, database, routes or tests is not analysed, an exclusion has no dated allowlist entry, reportUnmatchedIgnoredErrors is off, or the script passes --level, -l, -c, --configuration or narrowed paths.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-phpstan-config` / `floor` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-004.minLevel` (planned) |
| Decision | [ADR 0038](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0038-larastan-levels-shrink-only-baseline.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-004/` |
| Adoption | Nothing needed: adopt writes the floor for the project type and keeps an existing configuration that is stricter. |

Known evasions:

- PHPStan run outside the composer analyse script, such as directly in a CI step or git hook, with a lower level or another configuration
- a wrapper script the analyse script calls, whose flags the check does not read

## BE-005

**Never let the PHPStan baseline grow.**

The check counts every baseline entry, failing on one without a count, every ignoreErrors entry in the effective configuration and every inline ignore, and fails when the total exceeds the base branch's in pull-request CI; the sanctioned baseline:update script regenerates the baseline and fails if the total grew.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-baselines` / `phpstan` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0038](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0038-larastan-levels-shrink-only-baseline.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-005/` |
| Adoption | Baseline: adopt generates the baseline with --allow-empty-baseline, and only baseline:update rewrites it afterwards. |

Known evasions:

- a change pushed without a pull request, where no base-branch comparison runs
- an existing ignoreErrors pattern broad enough to absorb a new error with the same message

## BE-006

**Never lower the PHPStan level, and raise it by the recorded due date.**

The check compares the effective level with the base branch and fails on any decrease, and once the recorded next-raise date has passed it fails unless the level went up or a dated allowlist entry with a reason moved the date; it also reports how many errors the next level would add.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-phpstan-config` / `ratchet` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-006.nextLevelDue` (planned) |
| Decision | [ADR 0038](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0038-larastan-levels-shrink-only-baseline.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-006/` |
| Adoption | Nothing needed: adopt records the level at adoption as the starting point and a first due date one quarter ahead. |

Known evasions:

- a level raise paid for with new ignoreErrors patterns instead of fixes
- a due date moved through an allowlist entry whose reason is boilerplate

## BE-007

**Pass the Pest php preset: no debug, diagnostic or raw output calls such as var_dump, dump or echo.**

The Pest php preset runs under an architecture test named with this rule's ID and fails on any name-resolved use of the debug, diagnostic and output functions it lists, across every non-test namespace including factories and seeders.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-007] php preset: no debug or diagnostic output` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0036](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0036-pest-replaces-phpunit-runner.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-007/` |
| Adoption | Allowlist: the kit ships a dated ->ignoring() list for console commands and seeders that print output. |

Known evasions:

- a banned function called dynamically, through call_user_func() or a variable function
- output written through error_log() or fwrite() to a standard stream

## BE-008

**Leave no untracked TODO, FIXME, HACK or XXX marker: each one carries a ticket reference.**

A custom PHPStan rule checks every comment, case-insensitively, and fails on a marker that does not match the configured ticket pattern, for example TODO(ABC-123):, while existing markers start in the baseline.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.noUntrackedTodo` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-008.ticketPattern` (planned) |
| Decision | [ADR 0093](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0093-todo-policy.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-008/` |
| Adoption | Baseline: existing untracked markers go into the PHPStan baseline, which only shrinks. |

Known evasions:

- synonyms outside the marker list, such as TBD or LATER
- a reference that matches the pattern but names no real ticket

## BE-009

**Commit no commented-out PHP code.**

A heuristic custom PHPStan rule fails on comments whose body parses as PHP statements, docblock prose excluded, and existing findings start in the baseline.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.noCommentedOutCode` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0061](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0061-own-eslint-plugin-no-commented-code.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-009/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

Known evasions:

- commented fragments that do not parse as complete statements
- code pasted into docblock prose

## BE-010

**Document in .env.example every env() key that project config files read.**

The check walks config/ recursively, classifies each file as project or framework-known, and fails when a literal env() or Env::get() key read by a project file is missing from .env.example, where a commented key counts as documented.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-env-example` / `laravel-config` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-010.frameworkConfigFiles` (planned) |
| Decision | [ADR 0085](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0085-environment-files.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-010/` |
| Adoption | Nothing needed: adopt classifies the existing config files and appends the missing keys to .env.example. |

Known evasions:

- keys built from variables or constants are not seen
- a project file classified as framework-known is not checked

## BE-011

**Run the test suite against uncached configuration.**

A test asserts that the configuration is not cached when the suite runs, so a cached config file can never override the values pinned in phpunit.xml, however the runner is invoked.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-011] the test suite runs against uncached configuration` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0090](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0090-ci-contract.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-011/` |
| Adoption | Nothing needed: the kit's phpunit.xml and test bootstrap never cache configuration. |

## BE-012

**Pin a hermetic test environment in phpunit.xml with force="true".**

A test parses phpunit.xml and fails unless each configured environment key (by default an in-memory SQLite database, array cache, session and mail drivers and the sync queue) has its configured value and force="true".

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-012] phpunit.xml pins a hermetic test environment` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-012.env` (planned) |
| Decision | [ADR 0090](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0090-ci-contract.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-012/` |
| Adoption | Nothing needed: adopt merges the pinned entries into the existing phpunit.xml. |

Known evasions:

- a key that affects requests or tenancy but is missing from the configured list stays unpinned

## BE-013

**Meet the configured backend test-coverage floor.**

A local test:coverage script runs pest --coverage --min=&lt;floor> (PCOV in CI, Xdebug documented) as its own CI step, with the floor measured at adoption and only ever raised.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — ci: `coverage` / `laravel-quality` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-013.min` (planned) |
| Decision | [ADR 0091](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0091-coverage-floors.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-013/` |
| Adoption | Baseline: the floor starts at the coverage measured at adoption and ratchets up; doctor reports a missing coverage driver. |

Known evasions:

- coverage exclusions in the phpunit.xml source element or ignore annotations in code
- tests that execute lines without asserting on their results

## BE-014

**Add no new PHP copy-paste clones beyond the committed jscpd baseline.**

jscpd runs over the PHP sources with the committed baseline and --fail-on-new-clones instead of a global percentage threshold, so a new clone fails even when nobody regenerates the baseline; PROC-034 keeps the baseline itself shrink-only.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-duplication` / `php` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0092](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0092-dead-code-and-duplication-gates.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-014/` |
| Adoption | Baseline: existing clones go into the committed jscpd baseline, which only shrinks. |

Known evasions:

- near-duplicates below the minimum clone size
- clones with renamed identifiers or reordered statements

## BE-015

**Serve every API route under a version prefix.**

A route-table test fails when a route in the api middleware group does not match the configured version pattern (api/v&lt;n>/ by default); the greenfield template enables it, and a live unversioned API records the exception instead.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-015] every API route is served under the version prefix` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-015.enabled` (planned), `rules.BE-015.versionPrefix` (planned) |
| Decision | [ADR 0042](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0042-api-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-015/` |
| Adoption | Opt-in: off by default so a live unversioned API is not broken; the greenfield template enables it. |

## BE-016

**Shape API URIs as kebab-case plural resources, with state transitions as POST sub-resource verbs.**

A route-table test checks that static URI segments are kebab-case plurals and that non-resourceful actions are POST {resources}/{id}/{verb} routes served by invokable controllers.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-016] API URIs are kebab-case plural resources` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-016.enabled` (planned) |
| Decision | [ADR 0042](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0042-api-routing.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-016/` |
| Adoption | Opt-in: off by default; irregular plurals and existing URIs go into dated allowlist entries. |

Known evasions:

- the plural check is a heuristic, so irregular plurals rely on allowlist entries
- a state transition written as a PATCH of a status field on the resource

## BE-017

**Route every request to a controller action; no route closures.**

A route-table test fails when an application route's action is a closure, with framework-registered routes such as the health route excluded by their source.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-017] every route resolves to a controller action` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0042](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0042-api-routing.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-017/` |
| Adoption | Nothing needed: adopt replaces the framework's stub closures (the welcome page and the user route added by the API installer) with controller actions. |

## BE-018

**Type the input of every POST, PUT and PATCH action as a FormRequest.**

Reflection over the route table fails when a POST, PUT or PATCH action has no parameter typed as a FormRequest subclass, and a body-less write needs a dated allowlist entry.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-018] every write action takes a FormRequest` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0044](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0044-form-request-validation.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-018/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

## BE-019

**Keep validation in FormRequests; no inline validation in the HTTP layer.**

A type-aware custom PHPStan rule fails on validator(), the Validator facade, the validation factory's make() and the request's validate() methods anywhere in App\\Http outside FormRequest classes.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — phpstan: `crossStack.noInlineValidation` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0044](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0044-form-request-validation.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-019/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

## BE-020

**Name store and update requests Store{Model}Request and Update{Model}Request.**

A custom PHPStan rule checks the FormRequest parameter of store() and update() on resource controllers against the model name derived from the controller name.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.requestNamedAfterModel` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0044](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0044-form-request-validation.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-020/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

Known evasions:

- a controller whose name does not reveal its model, so the expected request name cannot be derived
- store and update methods outside resource controllers are not checked

## BE-021

**Authorize each endpoint at exactly one site with exactly one policy ability.**

A meta-test over the route table fails when an action with a non-trivial FormRequest authorize() also authorizes in the controller, or when an endpoint references more than one ability.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-021] each endpoint authorizes once with one ability` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0043](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0043-single-authorization-site.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-021/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

Known evasions:

- authorization performed inside a service the action calls
- ability names built at run time

## BE-022

**Exercise every API route in at least one feature test.**

A listener records every route matched while the feature suite runs, and a final assertion fails for any registered API route that was never matched.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-022] every API route is exercised by a feature test` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0039](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0039-backend-testing-floor.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-022/` |
| Adoption | Allowlist: untested routes at adoption go into a dated allowlist that only shrinks. |

Known evasions:

- a trivial request that asserts nothing still counts as coverage

## BE-023

**Answer failed logins with one generic problem detail.**

A contract test sends an unknown account and a wrong password to the login route and fails unless both return the same status and the same body, problem details when the api-contract module is on, so responses never reveal which accounts exist.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-023] failed logins return one generic problem detail` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0053](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0053-rfc-9457-problem-details.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-023/` |
| Adoption | Nothing needed: the kit's login response already answers both failures the same way. |

## BE-024

**Declare an allowed response type as the return type of every controller action.**

Reflection over public controller actions fails when the declared return type is missing or outside the configured set of Resources, resource collections and response classes, and Larastan then proves each return matches it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-024] every controller action declares an allowed response type` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-024.allowedReturnTypes` (planned) |
| Decision | [ADR 0045](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0045-resources-only-serialization.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-024/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

## BE-025

**Build JSON responses only through the sanctioned response path; never hand-roll them.**

A type-aware custom PHPStan rule fails on the response() helper, the Response facade, the response factory and direct JsonResponse construction outside the configured response emitter and the exception renderer.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — phpstan: `crossStack.noHandRolledResponse` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-025.responseEmitter` (planned) |
| Decision | [ADR 0052](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0052-api-success-shape.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-025/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

## BE-026

**Emit the configured success shape exactly: no ad-hoc top-level keys and no double data wrapping.**

A listener checks every 2xx JSON body in the feature suite against the configured shape (resource or envelope), including links and meta on paginated bodies, no data.data nesting and deletes per shape, with binary responses exempt.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-026] every JSON success response matches the configured shape` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.api-contract.shape` (planned) |
| Decision | [ADR 0052](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0052-api-success-shape.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-026/` |
| Adoption | Nothing needed: the shape defaults to resource, and a project that already answers with an envelope sets modules.api-contract.shape to envelope. |

Known evasions:

- responses that no feature test exercises

## BE-027

**Render every API exception as RFC 9457 problem details from one renderer, with errors on 422.**

A test raises each mapped exception (validation, authentication, authorization, not found, method, throttle, HTTP and generic) through a route the renderer's API predicate covers and asserts application/problem+json with type, title and status, the right status code, and the field-to-messages map in errors on 422.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-027] every API exception renders as problem details` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-027.pathPrefix` (planned) |
| Decision | [ADR 0053](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0053-rfc-9457-problem-details.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-027/` |
| Adoption | Allowlist: an existing API scopes the renderer to a new version prefix (rules.BE-027.pathPrefix) or keeps legacy routes on their old error body through dated entries, because problem+json changes what shipped clients read. |

Known evasions:

- controllers or middleware that build their own error bodies
- routes outside the renderer's API predicate

## BE-028

**Use the status vocabulary: 409 for state and concurrency conflicts, 422 only for validation.**

Reviewers check that abort() and exception status choices follow the vocabulary (409 for conflicts, 422 for validation, 400 for unknown filter or sort keys, 429 for rate limits), each mapped to a problem type.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0048](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0048-http-status-vocabulary.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-029

**Never service-locate outside service providers: no app(), resolve(), App::make or container calls.**

An architecture test bans app(), resolve() and the App facade, container and application classes everywhere in App except App\\Providers, resolved by name from the AST.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-029] no service location outside providers` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-029/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

Known evasions:

- app() or resolve() invoked dynamically, through call_user_func() or a variable function

## BE-030

**Add no pass-through layers: single-step CRUD and list queries stay in the controller.**

Reviewers reject per-entity services, query classes and empty stub layers, keeping single-step reads and writes inline in thin controllers.

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
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-031

**Add a service only for a domain rule used outside HTTP; make shared multi-step writes Actions.**

Reviewers check each new service against the boundary: state machines, scoring and external rendering are services, multi-step writes reused across entry points are Actions, and a one-caller abstraction is inlined.

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
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-032

**Add no repository or speculative layer classes (Repository, Manager, Handler, UseCase, Interactor).**

An architecture test bans the configured speculative suffixes across App, framework-shaped classes excepted, and fails when an App\\Repositories namespace exists.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-032] no repository or speculative layer classes` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-032.suffixes` (planned) |
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-032/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

Known evasions:

- synonym suffixes outside the configured list, such as Store, Gateway, Dao or Processor

## BE-033

**Implement every Action as an invokable class in App\\Actions.**

An architecture test fails when a class in App\\Actions is not invokable, so multi-step writes shared by controllers, jobs and commands use one Action shape that takes validated arrays or DTOs.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-033] actions are invokable` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0041](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0041-action-pattern.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-033/` |
| Adoption | Fix first: an existing App\\Actions class without \_\_invoke gains one before the check is enabled. |

## BE-034

**Keep raw SQL, the DB facade and transactions out of the HTTP layer.**

A type-aware custom PHPStan rule fails on DB facade calls, database connection methods (transactions included) and raw query-builder methods anywhere in App\\Http, so raw SQL lives in model scopes and transactions in services or Actions.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — phpstan: `crossStack.noRawDatabaseInHttp` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-034/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

## BE-035

**Keep services plain classes with no interface and no base class.**

An architecture test fails when a class in App\\Services extends a class or implements an interface.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-035] services are plain classes` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-035/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

## BE-036

**Place each kind of class in the namespace the configured placement map assigns it.**

A configurable namespace-to-kind map expands into architecture expectations in both directions, for example traits in Concerns, Scope implementations in App\\Models\\Scopes and ShouldQueue only in jobs, listeners, mail and notifications.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-036] classes follow the placement map` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-036.placement` (planned) |
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-036/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

## BE-037

**Pass the Pest laravel preset: framework class conventions and no env() outside config.**

The Pest laravel preset runs under an architecture test named with this rule's ID, keeps enums in App\\Enums, class suffixes and base classes, resourceful-only controller methods and queued mailables and jobs, and bans env() outside config; the debug functions it also bans are BE-007's property.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-037] laravel preset` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0036](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0036-pest-replaces-phpunit-runner.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-037/` |
| Adoption | Allowlist: the kit ships a dated ->ignoring() list, one rule ID per entry, for stock and kit code the preset rejects. |

Known evasions:

- a banned function called dynamically, through call_user_func() or a variable function

## BE-038

**Promote and mark readonly every constructor parameter of controllers, services and Actions.**

Reflection over controllers, services and Actions fails when a constructor parameter is not promoted or not readonly; a collaborator created with new inside a method is a review item.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-038] collaborators are promoted readonly constructor parameters` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-038.enabled` (planned) |
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-038/` |
| Adoption | Opt-in: off by default. |

## BE-039

**Keep controllers under the configured line count.**

An architecture test fails when a class in App\\Http\\Controllers, controller concerns included, reaches the configured line count.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-039] controllers stay under the line limit` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-039.maxLines` (planned) |
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-039/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

## BE-040

**Keep HTTP, validation and response concerns out of models.**

An architecture test fails when a class in App\\Models uses the request, response, validator, auth or session helpers or their facades and classes.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-040] models stay out of HTTP` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0040](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-040/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

## BE-041

**Declare casts in the casts() method, not the $casts property.**

Reflection over App\\Models fails when a model declares its own $casts property.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-041] models declare casts in casts()` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-041.enabled` (planned) |
| Decision | [ADR 0047](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0047-model-conventions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-041/` |
| Adoption | Opt-in: off by default. |

## BE-042

**Name database columns in snake_case.**

A test reads the migrated schema and fails when a column name is not snake_case, with pre-existing tables in dated allowlist entries.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-042] every column name is snake_case` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-042.enabled` (planned) |
| Decision | [ADR 0047](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0047-model-conventions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-042/` |
| Adoption | Opt-in: off by default; pre-existing tables go into dated allowlist entries. |

## BE-043

**Cast every status, state, type and role column to a string-backed enum.**

A test reads the migrated schema and fails when a column matching the configured names is not cast to a backed enum in its model's casts().

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-043] status-like columns are cast to string-backed enums` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-043.columns` (planned) |
| Decision | [ADR 0046](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0046-enums-on-the-wire.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-043/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

Known evasions:

- status-like columns named outside the configured list, such as kind or phase

## BE-044

**Make every enum a native string-backed enum.**

An architecture test fails when an enum in App\\Enums is not string-backed, and the laravel preset keeps every enum in that namespace.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-044] enums are string-backed` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0046](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0046-enums-on-the-wire.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-044/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

## BE-045

**Name enum cases in the configured style with snake_case backing values.**

Reflection over App\\Enums fails when a case name breaks the configured style or a backing value is not snake_case.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-045] enum cases follow the naming style` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-045.enabled` (planned), `rules.BE-045.caseStyle` (planned) |
| Decision | [ADR 0046](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0046-enums-on-the-wire.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-045/` |
| Adoption | Opt-in: off by default. |

## BE-046

**Never compare enum-cast attributes to string literals; use the enum.**

A type-aware custom PHPStan rule fails when a where-style query argument or a strict comparison on an attribute that the model casts to a backed enum is a string literal.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.noEnumColumnLiteral` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0046](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0046-enums-on-the-wire.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-046/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

Known evasions:

- string values held in variables or constants
- raw SQL fragments and query scopes that take plain strings

## BE-047

**Keep presentation data such as colors off enums; the API emits semantic state only.**

An architecture test fails when an enum declares a method from the configured presentation list (color() by default), so clients map state to design tokens.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-047] enums carry no presentation data` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-047.methods` (planned) |
| Decision | [ADR 0046](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0046-enums-on-the-wire.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-047/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

Known evasions:

- presentation methods outside the configured list, such as colour, hex or tone
- color values emitted directly from Resources

## BE-048

**Emit enum values only; never add \*\_label display fields to Resources.**

A custom PHPStan rule fails on literal output keys ending in \_label in a Resource's toArray(), because clients render labels from their own message files.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.noResourceLabelField` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0046](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0046-enums-on-the-wire.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-048/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

Known evasions:

- display keys that do not end in \_label, such as status_display
- output keys built at run time

## BE-049

**Serialize models only through API Resources in the HTTP layer.**

A type-aware custom PHPStan rule fails on toArray(), toJson(), jsonSerialize(), attribute dumps, json_encode() and array casts of models or Eloquent collections anywhere in App\\Http outside App\\Http\\Resources.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — phpstan: `crossStack.noModelSerializationOutsideResource` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0045](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0045-resources-only-serialization.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-049/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

## BE-050

**Define each wire shape once: one Resource per shape, summary Resources for nested relations.**

Reviewers reject inline {id, name} relation maps and duplicate shapes, and composite payloads get their own Resource.

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
| Decision | [ADR 0045](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0045-resources-only-serialization.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-051

**Decide single-record access in policies and list visibility in a scope that mirrors them.**

Reviewers check that each policy and its visibility scope cross-reference each other and that policies do no list filtering.

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
| Decision | [ADR 0043](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0043-single-authorization-site.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-052

**Generate sequential codes with a database sequence or retry on unique violation, never max + 1.**

Reviewers check every code-generation path for race safety, because reading the current maximum and adding one issues duplicates under concurrency.

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
| Decision | [ADR 0047](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0047-model-conventions.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-053

**Enable Eloquent strict mode outside production.**

A test asserts that lazy loading, silently discarded attributes and missing-attribute access fail in the testing environment, so N+1 relation loads fail the suite.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-053] Eloquent strict mode is on outside production` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-053.enabled` (planned) |
| Decision | [ADR 0047](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0047-model-conventions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-053/` |
| Adoption | Opt-in: off by default until existing lazy loads are fixed. |

## BE-054

**Paginate every list (index) route.**

A behavioural route-table test calls each GET index route as the configured actor and fails unless the body has the paginator shape with a server total.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-054] every index route paginates` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-054.actor` (planned) |
| Decision | [ADR 0049](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0049-server-driven-collections.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-054/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

Known evasions:

- list actions not named index
- index routes whose parameters the test dataset cannot build are skipped

## BE-055

**Sanitize and hard-cap per_page, falling back to the default on invalid input.**

A behavioural test calls each paginated route with negative, non-numeric and oversized per_page values and fails unless it answers 200 with a page size within the cap.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-055] per_page is sanitized and capped` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-055.defaultPerPage` (planned), `rules.BE-055.maxPerPage` (planned) |
| Decision | [ADR 0049](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0049-server-driven-collections.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-055/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

Known evasions:

- paginated routes the test dataset cannot call

## BE-056

**Accept only declared filter and sort keys; reject unknown keys with 400.**

A behavioural test sends an unknown filter key and an unknown sort key to each list route and fails unless both answer 400, with the installed query-builder package as the preferred mechanism.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-056] unknown filter and sort keys are rejected` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-056.enabled` (planned) |
| Decision | [ADR 0049](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0049-server-driven-collections.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-056/` |
| Adoption | Opt-in: off by default. |

Known evasions:

- list routes the test dataset cannot call
- unknown keys under a parameter name the test does not probe

## BE-057

**Use one filter idiom per project for list queries.**

Reviewers check that new list actions use the project's declared idiom: the installed query-builder package, or otherwise the when() chain.

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
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-058

**Set server-derived fields in prepareForValidation(), never from client input.**

Reviewers check that owner, actor and other derived fields are pinned server-side in the FormRequest rather than accepted from the request body.

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
| Decision | [ADR 0044](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0044-form-request-validation.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-059

**Keep wire field names equal to storage column names.**

Reviewers reject aliasing in validated() output and Resources; an unavoidable alias is applied in both the Store and Update requests and emitted from a real source.

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
| Decision | [ADR 0044](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0044-form-request-validation.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-060

**Keep FormRequest messages() keys matched to rules that exist.**

A reflection test instantiates each FormRequest and fails when a messages() key (attribute.rule) has no matching rule in rules().

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-060] FormRequest messages match existing rules` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0044](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0044-form-request-validation.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-060/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

Known evasions:

- rules() that depend on route parameters or request state cannot be evaluated

## BE-061

**Run the server-owned-field strip middleware first in the resolved API middleware stack.**

A test resolves the HTTP kernel, gathers the global and route middleware of every api route (asserting the route set is not empty) and fails unless the strip middleware is present and runs before route-model binding.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-061] the strip middleware runs first on every API route` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-061/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

## BE-062

**Apply the active-tenant middleware to every authenticated API route.**

A test over the resolved middleware stack of every api route fails when a route that gathers an auth guard does not also gather the active-tenant middleware, with exceptions only as dated allowlist entries.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-062] every authenticated API route checks the active tenant` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-062/` |
| Adoption | Opt-in: part of the tenancy module; existing exceptions go into dated allowlist entries. |

## BE-063

**Wire tenancy into the user model only through the shipped traits; never redefine the tenant relation.**

Reflection over the configured user model fails unless tenant() and the tenancy predicates exist and are declared by the shipped scope and predicate traits.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-063] the user model wires tenancy through the shipped traits` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.userModel` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-063/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

## BE-064

**Migrate the tenancy schema: a tenants table with non-null feature flags and tenant columns on users.**

A schema test fails unless the tenants table exists with a non-null, defaulted feature column and the user table carries the configured tenant, sub-tenant and operator columns, because otherwise every schema-driven tenancy gate passes vacuously.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-064] the tenancy schema is migrated` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.column` (planned), `modules.tenancy.subTenantColumns` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-064/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

## BE-065

**Seed a valid tenancy state: an operator, the default tenant and no rows without a tenant.**

A test runs the default seeder chain and fails unless an operator satisfies the bypass predicate, the configured default tenant exists and no tenant table holds a row without a tenant, operators excepted.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-065] seeding leaves a valid tenancy state` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.defaultTenant` (planned), `modules.tenancy.operatorRole` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-065/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- rows created outside the default seeder chain

## BE-066

**Build isolation-test fixtures from scratch; never depend on seeded tenants.**

A token scan of the isolation test files fails on seeder calls, seed properties and reads of the default-tenant configuration.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-066] isolation tests build their own fixtures` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-066/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- seeding through a shared base test case or helper outside the scanned files

## BE-067

**Ship the tenant-isolation suites complete, with no todo, skipped or incomplete test.**

The check asserts that every mandated isolation test name exists and reads PHP tokens, ignoring comments and strings, to fail on ->todo(, ->skip(, markTestIncomplete( and markTestSkipped( in those suites, with waivers only as dated allowlist entries.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-security-suites` / `tenant-isolation` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0039](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0039-backend-testing-floor.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-067/` |
| Adoption | Opt-in: part of the tenancy module; the suites ship complete and run against the kit's plumbing. |

Known evasions:

- a mandated test edited to assert nothing meaningful
- a skip or early return hidden in a helper outside the scanned suite files

## BE-068

**Scope list endpoints silently to the caller's tenant: foreign rows absent and totals tenant-only.**

A dataset-driven isolation test calls the index route of every tenant model as a user of another tenant and fails unless it answers 200 with no foreign rows and a total that counts only the caller's rows.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-068] list endpoints are scoped to the caller tenant` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-068/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- totals computed by a separate unscoped count path the dataset does not exercise

## BE-069

**Apply the sub-tenant scope in every listing over a sub-tenant model.**

A dataset-driven isolation test fails when a sub-tenant-restricted user listing a sub-tenant model sees rows of another sub-tenant.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-069] sub-tenant listings apply the sub-tenant scope` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-069/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- sibling rows reached through eager-loaded relations
- listings served outside index routes

## BE-070

**Apply sub-tenant scoping only through the model-attached scope.**

An architecture test confines the sub-tenant trait to App\\Models, and a token scan fails on hand-written sub-tenant where() clauses in controllers.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-070] sub-tenant scoping stays on models` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-070/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a controller helper method that wraps the sub-tenant filter

## BE-071

**Block a disabled tenant at login and on existing tokens with one shared predicate and message.**

A complete feature test disables a tenant and fails unless login and requests with existing tokens answer 403 with the shared message key and re-enabling restores both, and a token scan confirms the login flow calls the shared predicate.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-071] suspending a tenant rejects new logins and requests with live tokens` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-071/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a login flow that checks the tenant status column directly with its own message

## BE-072

**Grant the platform bypass only to operators without a tenant, and honor it at every layer.**

A complete feature test fails unless an operator bound to a tenant never bypasses, the operator flag is cast to boolean, and a tenantless operator lists rows of two tenants and keeps access when a tenant is disabled.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-072] only tenantless operators bypass tenancy` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.operatorRole` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-072/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a predicate override that drops the no-tenant condition on a path the tests do not exercise

## BE-073

**Fail closed for a user without a resolvable tenant: no rows, no create and 403 on requests.**

Complete feature tests fail unless a non-bypassing user whose tenant is null or missing sees zero rows (never a whereNull match), fails the scoped exists rule, cannot create and gets 403, and an unassigned sub-tenant user sees an empty list.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-073] users without a resolvable tenant fail closed` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-073/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a predicate override that treats a missing tenant row as active on a path the tests do not exercise
- a query that drops the tenant scope with withoutGlobalScope()

## BE-074

**Define the platform-bypass predicate once and call it from every tenancy layer.**

Reflection fails when a class other than the predicate trait declares a bypass method, and a token scan bans the operator role literal and operator flag column outside the predicate and seeders.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-074] the platform-bypass predicate is defined once` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.operatorRole` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-074/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a role check hidden behind a helper function

## BE-075

**Resolve the tenant from the authenticated user, never from headers, hosts or request parameters.**

Reviewers check every tenant resolution path, and any other resolution strategy needs its own decision record.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

## BE-076

**Let a tenant's host decide only pre-login branding and login affinity, never data scoping.**

Reviewers check host-resolver call sites once host mapping is configured for the tenancy module, and data scoping always follows the authenticated user.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `modules.tenancy.hostMapping` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 1.0.0 |
| Adoption | Opt-in: applies only when host mapping is enabled. |

## BE-077

**Consume the tenancy mechanism from the vendored package, never from a copied or edited version.**

A test fails unless the configured trait, scope and middleware classes resolve to the package namespace and no application class redeclares a mechanism class name, and template copies are verified against version-stamped hashes.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-077] the tenancy mechanism comes from the package` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.mechanismClasses` (planned) |
| Decision | [ADR 0010](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0010-opt-in-modules.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-077/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a look-alike mechanism under a different class name

## BE-078

**Gate tenant features with the feature middleware keyed to the feature enum.**

A route-table test fails when a tenant-feature middleware argument does not parse to a case of the feature enum.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-078] tenant-feature middleware keys match the feature enum` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-078/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a route that should be feature-gated but omits the middleware

## BE-079

**Never re-implement a tenant feature check inline in a controller.**

A custom PHPStan rule fails when a controller calls the tenant's feature check directly instead of relying on the feature middleware.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.noInlineTenantFeatureCheck` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-079/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- reading the tenant's feature list directly
- checking the feature in a service the controller calls

## BE-080

**Test a 403 for every tenant-feature key used in the route table.**

A test collects the feature keys from route middleware and fails when a key is referenced by no feature test.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-080] every tenant-feature key has a 403 test` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-080/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a test that names the feature key without asserting a 403

## BE-081

**Cache tenant data only through the tenant-aware helper that prefixes keys with the tenant id.**

An architecture test confines the Cache facade and the cache() helper to the tenant-aware cache helper.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-081] cache access goes through the tenant-aware helper` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-081/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a cache repository or store injected by type

## BE-082

**Never send a push notification to a device token outside the notification's tenant.**

Reviewers check that every push fan-out query is tenant-scoped.

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
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

## BE-083

**Route all file uploads through the declared upload requests.**

Reflection over FormRequest rules() fails when a request outside the configured upload requests contains file, image, mimes or File rules.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-083] file rules appear only in the upload requests` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-083.enabled` (planned), `rules.BE-083.uploadRequests` (planned) |
| Decision | [ADR 0087](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0087-file-uploads.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-083/` |
| Adoption | Opt-in: off by default until the upload requests are declared. |

Known evasions:

- an uploaded file handled without any validation rule

## BE-084

**Queue every mailable and notification.**

An architecture test fails when a class extending Mailable or Notification does not implement ShouldQueue, keeping slow and failure-prone delivery out of the request cycle.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-084] mailables and notifications are queued` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0055](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0055-background-jobs.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-084/` |
| Adoption | Allowlist: existing violations get dated ->ignoring() entries that only shrink. |

Known evasions:

- sendNow() delivers a queued mailable or notification synchronously
- mail sent with Mail::raw() or a closure instead of a mailable class

## BE-085

**Pass identifiers to queued classes, never the authenticated user, the request or closures.**

Reflection over the constructors of queued classes fails on a parameter typed as an authenticatable, a request or a closure.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-085] queued classes receive identifiers only` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0055](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0055-background-jobs.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-085/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

Known evasions:

- untyped or mixed constructor parameters
- an object that wraps the request or the user

## BE-086

**Declare tries or retryUntil, backoff and timeout on every job and queued listener.**

Reflection fails when a queued class in App\\Jobs or App\\Listeners does not itself declare a tries property or retryUntil(), a backoff property or method, and a timeout property.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-086] every queued class declares a retry policy` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0055](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0055-background-jobs.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-086/` |
| Adoption | Allowlist: existing violations get dated entries in the rule's allowlist file, which only shrink. |

## BE-087

**Make jobs safe to retry: idempotent, guarded on current state, fast to fail on permanent errors.**

Reviewers check each handle() against the retry-safety checklist: unique or non-overlapping execution where needed, idempotency keys for side effects and fail() for permanent errors.

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
| Decision | [ADR 0055](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0055-background-jobs.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-088

**Schedule pruning of failed jobs whenever the application has queued classes.**

A test inspects the scheduler and fails when queued classes exist but queue:prune-failed is not scheduled, while triaging failed jobs as a dead-letter queue stays a review item.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-088] failed-job pruning is scheduled` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0055](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0055-background-jobs.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-088/` |
| Adoption | Nothing needed: the kit's scheduler template schedules queue:prune-failed. |

## BE-089

**Surface a failed job's owed result to the affected user or tenant.**

Reflection fails when a queued class does not declare failed(), and jobs that owe no result are listed in dated allowlist entries.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-089] every queued class declares failed()` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-089.enabled` (planned) |
| Decision | [ADR 0055](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0055-background-jobs.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-089/` |
| Adoption | Opt-in: off by default. |

Known evasions:

- an empty failed() body

## BE-090

**Log with a constant message and pass variable data in the context array.**

A type-aware custom PHPStan rule fails when the message argument of a Log facade call, logger() or a logger-interface method is not a constant string, so interpolation, concatenation and sprintf() are rejected.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — phpstan: `crossStack.noDynamicLogMessage` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0088](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0088-structured-redacted-logging.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-090/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

## BE-091

**Log ids and stable codes, never models, tenant rows or per-locale column dumps.**

A type-aware custom PHPStan rule fails when a log context value is a model, an Eloquent collection or a toArray() result.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.noModelInLogContext` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0088](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0088-structured-redacted-logging.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-091/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

Known evasions:

- a model encoded with json_encode() before it is logged

## BE-092

**Propagate one request id: adopt or generate it, bind it to the log context and echo it on responses.**

A test fails unless the request-id middleware is in the resolved API stack, a request without the header gets a generated id echoed back, and the id sits in Laravel Context so queued jobs inherit it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-092] one request id is propagated` |
| Tier | 2 |
| Module | `observability` |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-092.enabled` (planned), `modules.observability.requestIdHeader` (planned) |
| Decision | [ADR 0099](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0099-observability-module.md) |
| Since | 1.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-092/` |
| Adoption | Opt-in: arrives with the observability module after 1.0 and is turned on through rules.BE-092.enabled. |

## BE-093

**Report errors to the error tracker only from the central exception funnel.**

An architecture test confines the error-tracking SDK namespace to the exception configuration and the logger module.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-093] the error tracker is used only in the reporting funnel` |
| Tier | 2 |
| Module | `observability` |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.BE-093.enabled` (planned) |
| Decision | [ADR 0099](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0099-observability-module.md) |
| Since | 1.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-093/` |
| Adoption | Opt-in: arrives with the observability module after 1.0 and is turned on through rules.BE-093.enabled. |

Known evasions:

- report() calls scattered through catch blocks
- exceptions swallowed without being reported

## BE-094

**Keep the liveness route unauthenticated, dependency-free and free of version detail.**

A feature test calls the configured health route (the framework's /up by default) without credentials and fails unless it answers 200 with no version or infrastructure strings.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-094] the liveness route is public and bare` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.BE-094.route` (planned) |
| Decision | [ADR 0051](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0051-health-endpoints.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-094/` |
| Adoption | Nothing needed: the framework's /up route already passes. |

Known evasions:

- a custom liveness route that touches the database without printing any detail

## BE-095

**Poll for live surfaces; add server broadcasting packages only with a recorded decision.**

A test reads composer.json and fails when a broadcasting package, such as a websocket server or a push-service SDK, is required without an entry under decisions in .cross-stack/standard.json that references an existing project decision record.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-095] broadcasting packages need a recorded decision` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `decisions.<name>` (planned) |
| Decision | [ADR 0056](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0056-polling-before-push.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-095/` |
| Adoption | Nothing needed: adopt records a decision reference for an installed broadcasting package. |

Known evasions:

- a hand-rolled websocket or server-sent events endpoint that needs no listed package

## BE-096

**Record audit events only through the audit-trail mechanism declared in the stack table.**

Reviewers check that the stack table declares the audit-trail mechanism and that each new feature writes its audit events through it rather than through a second, ad-hoc log.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `stack.audit-trail.use` (planned) |
| Decision | [ADR 0007](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0007-one-mechanism-per-concern.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review; adopt pre-fills the audit-trail entry of the stack table from the installed packages. |

## BE-097

**Name regression tests after the invariant they protect.**

Reviewers check that scenario and regression tests are named after the invariant they protect and carry a docblock describing the failure they guard against.

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
| Decision | [ADR 0039](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0039-backend-testing-floor.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review. |

## BE-098

**Write every inline PHPStan suppression as @phpstan-ignore with an identifier and a reason.**

The check fails when the effective configuration does not set reportIgnoresWithoutComments: true, so PHPStan rejects an ignore without a reason, and when a @phpstan-ignore-line or @phpstan-ignore-next-line comment without an identifier appears.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-phpstan-config` / `ignore-comments` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0005](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-098/` |
| Adoption | Baseline: existing undescribed ignores become baseline entries that only shrink. |

## BE-099

**Export the OpenAPI document with scramble:export --fail-on-unknown on every CI run.**

A local contract:export script, run as its own CI step, exports the document with literal servers, info.version and ui.title in the published Scramble config and fails on unknown types.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — ci: `contract-export` / `laravel-quality` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.api-contract.exportCommand` (planned), `modules.api-contract.openapiPath` (planned) |
| Decision | [ADR 0054](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0054-generated-api-contract.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-099/` |
| Adoption | Nothing needed: adopt publishes the Scramble config with the literal values the export needs. |

Known evasions:

- a response shape the generator infers loosely without reporting it as unknown
- error bodies documented differently from what the problem-details renderer emits

## BE-100

**Strip server-owned fields from body, query and JSON input, nested keys included.**

A complete test sends the configured server-owned fields (the tenant column and the operator flag by default) at the top level and nested in form, query and JSON input through an API route and fails if any of them reaches the controller.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-100] server-owned fields are stripped from every input` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.serverOwnedFields` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-100/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a server-owned column missing from the configured field list
- input read from the raw request body instead of the parsed input

## BE-101

**Stamp the tenant on create from the acting user, else the pinned context; refuse neither.**

Complete tests fail unless a created record takes the acting user's tenant, falls back to the pinned tenant context when no user is authenticated, and throws in a background context that has no pin.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-101] creates are stamped with the tenant` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-101/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- Model::insert(), upsert() and query-builder inserts skip model events
- saveQuietly() and withoutEvents() skip the creating hook

## BE-102

**Scope background reads to the pinned tenant context and fail closed when nothing is pinned.**

Complete tests fail unless pinned reads are scoped, an unpinned background read returns nothing, a worker that processes tenant A then tenant B does not carry the pin over, a job dispatched under a pin inherits it, and run() and crossTenant() restore the previous value after a throw.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-102] background reads follow the pinned tenant context` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0058](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0058-background-tenant-context.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-102/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- background reads through the query builder instead of scoped models
- withoutGlobalScope() calls in background code

## BE-103

**Never resolve the authenticated user inside the tenant scope.**

A complete test authenticates a token for a tenant-scoped user model and fails if the lookup recurses or skips the scope, because the scope reads the already-resolved user and lets only the token-to-user lookup through.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-103] the tenant scope never resolves the user itself` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0058](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0058-background-tenant-context.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-103/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a user lookup inside the scope on a path that token authentication in the tests does not reach

## BE-104

**Apply tenant feature gates to every tenant user, admins included; exempt only the platform bypass.**

A complete test of the feature middleware fails unless a tenant admin is blocked from a disabled feature, a user whose tenant is missing is blocked, and only a tenantless operator passes.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-104] tenant feature gates apply to tenant admins` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-104/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- a controller or policy shortcut that skips the feature middleware for tenant admins

## BE-105

**Let the authenticated user's tenant take precedence over a pinned tenant context.**

A complete test pins one tenant, authenticates a user of another and fails unless reads and creates follow the user's tenant.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[BE-105] the user's tenant wins over a pinned context` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0058](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0058-background-tenant-context.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-105/` |
| Adoption | Opt-in: part of the tenancy module, installed with it as a complete unit. |

Known evasions:

- code that reads the pinned context directly instead of going through the scope and the creating hook

## BE-106

**Reference tenants with restrict-on-delete foreign keys and non-nullable business tenant columns.**

A test reads the migrated schema and fails when the users table or a business table references tenants with null-on-delete or cascade (cascade only through a dated allowlist entry), or when a business table's tenant column is nullable, so deleting a tenant is an explicit offboarding step.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[BE-106] tenant foreign keys restrict deletion` |
| Tier | 2 |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-106/` |
| Adoption | Opt-in: part of the tenancy module; existing cascades need a migration or a dated allowlist entry. |

## BE-107

**Fail the test run on incomplete and risky tests.**

The check fails unless the root phpunit element sets failOnIncomplete="true" and failOnRisky="true" and the test script passes --fail-on-incomplete, and it fails on --do-not-fail-on-incomplete or --do-not-fail-on-risky in the composer scripts and shipped workflows, while failOnSkipped stays off for legitimate environment skips.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-security-suites` / `runner-flags` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0039](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0039-backend-testing-floor.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/BE-107/` |
| Adoption | Nothing needed: adopt merges both attributes into phpunit.xml and the flag into the test script. |

Known evasions:

- pest run directly, outside the scripts and workflows the check reads, with a --do-not-fail-on-\* flag or -c pointing at another phpunit configuration
- a test whose assertion is trivially true, which is neither incomplete nor risky

## SEC-001

**Call no insecure PHP functions such as eval, exec, md5, sha1, unserialize or rand.**

The Pest security preset scans the application namespace for insecure functions such as eval, exec, shell_exec, system, md5, sha1, uniqid, rand, mt_rand, unserialize, extract and assert, with exceptions only through dated ->ignoring() allowlist entries.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-001] application code uses no insecure PHP functions` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0036](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0036-pest-replaces-phpunit-runner.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-001/` |
| Adoption | Allowlist: ship the exact ->ignoring() list (rand() in factories, echo in seeders and commands), each entry with the rule ID and an expiry date; brownfield hits get dated entries. |

Known evasions:

- dynamic invocation through call_user_func or a variable function
- the backtick shell operator
- an insecure function missing from the preset list

## SEC-002

**Map GET and HEAD routes only to index, show or allowlisted read actions.**

A route-table test maps every GET and HEAD route to an index, show or allowlisted read-only action, because RFC 9110 defines both methods as safe and browsers, caches and crawlers send them without the user's intent, so a state-changing GET invites request forgery.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-002] GET and HEAD routes map only to read actions` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0042](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0042-api-routing.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-002/` |
| Adoption | Allowlist: ship the framework's GET email-verification route and any existing GET logout route as default entries with reasons, and check only application controller actions. |

Known evasions:

- a write performed inside an index or show action

## SEC-003

**Declare authorize() in every FormRequest and never return a constant true from it.**

A custom PHPStan rule fails a FormRequest that does not declare authorize(), which Laravel treats as authorized, and one whose inferred return type is the constant true (return true, return !false, return (bool) 1); a helper returning bool passes, so SEC-004's policy-ability meta-test does the real authorization check.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — phpstan: `crossStack.noBareAuthorizeTrue` |
| Tier | 1 — invariant 2: Server authority |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0043](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0043-single-authorization-site.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-003/` |
| Adoption | Baseline: existing hits go into the shrink-only PHPStan baseline; new requests cannot add one. |

## SEC-004

**Resolve every non-public route to an existing policy ability, and allowlist public routes.**

A policy-ability meta-test extracts the ability and model of every non-public route from its FormRequest, controller Gate calls, can middleware or attribute, and asserts that the model's policy defines that method; public routes come from a dated allowlist.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-004] every non-public route resolves to an existing policy ability` |
| Tier | 1 — invariant 2: Server authority |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-005.publicRoutes` (planned) |
| Decision | [ADR 0043](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0043-single-authorization-site.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-004/` |
| Adoption | Allowlist: adopt generates a dated entry (reason plus expiry) for each existing route without a policy, shares the public-route list with SEC-005 and never offers a silent skip. |

Known evasions:

- a dynamic ability string
- a Gate::define closure instead of a policy
- authorize() called on a dead branch
- Gate::allows() called with its result ignored

## SEC-005

**Require authentication on every non-public API route.**

A route-table test over the resolved middleware stack (global plus gathered route middleware, groups expanded, a non-empty route set asserted) requires the configured authentication middleware on every API route outside the public allowlist, and an unauthenticated request gets 401.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-005] every non-public API route requires authentication` |
| Tier | 1 — invariant 2: Server authority |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-005.authMiddleware` (planned), `rules.SEC-005.publicRoutes` (planned) |
| Decision | [ADR 0043](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0043-single-authorization-site.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-005/` |
| Adoption | Allowlist: the shipped default list holds the framework's public routes (health, sanctum/csrf-cookie, broadcasting/auth) so a fresh install passes; brownfield public routes get dated entries. |

## SEC-006

**Rate-limit every unauthenticated API route with a bounded limiter.**

A route-table test over the resolved middleware stack requires a middleware derived from the framework's ThrottleRequests on every API route without authentication, resolves each named limiter through the RateLimiter and fails on Limit::none() or no limit, with exceptions only through dated allowlist entries.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-006] every unauthenticated API route is rate-limited` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-005.publicRoutes` (planned) |
| Decision | [ADR 0050](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0050-rate-limiting.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-006/` |
| Adoption | Allowlist: reads the same shipped public-route list as SEC-005, so the framework's own public routes do not fail a fresh install. |

Known evasions:

- a finite limit set so high that it never throttles
- a limiter key callback that gives every request its own bucket

## SEC-007

**Rate-limit every mutating authenticated API route with a bounded limiter.**

When enabled, the same resolved-stack test requires a throttle whose named limiter resolves to a finite limit on every authenticated POST, PUT, PATCH and DELETE route; it is off by default because turning it on fails most existing projects at once.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-007] every mutating authenticated API route is rate-limited` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-007.enabled` (planned) |
| Decision | [ADR 0050](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0050-rate-limiting.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-007/` |
| Adoption | Opt-in: enable it once the API group carries a throttle, with dated allowlist entries for the remaining routes. |

Known evasions:

- a finite limit set so high that it never throttles
- a limiter key callback that gives every request its own bucket

## SEC-008

**Cap attempts per minute on the login, password change and password reset routes.**

A test resolves the named limiters on the configured credential routes and asserts that their maximum attempts per minute are at or below the configured cap.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-008] credential routes cap attempts per minute` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-008.credentialRoutes` (planned), `rules.SEC-008.maxAttemptsPerMinute` (planned) |
| Decision | [ADR 0050](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0050-rate-limiting.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-008/` |
| Adoption | Fix first: configure the credential routes at adoption and give any route on the generic API limiter a stricter named limiter. |

Known evasions:

- a credential route missing from the configured list
- a limiter whose key or response callback weakens the cap

## SEC-009

**Return the access token at the documented response path from the token login route.**

When the API issues its own bearer tokens, declared by configuring the token login route, a contract test with factory data calls that route and asserts that the token sits at the configured path the BFF and the mobile client read; the test ships complete so it cannot pass while empty.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-009] login returns the access token at the documented path` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-009.loginRoute` (planned), `rules.SEC-009.tokenPath` (planned) |
| Decision | [ADR 0083](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-009/` |
| Adoption | Opt-in: turned on by declaring the token login route and token path at adoption to match the existing contract; an API that authenticates through cookie sessions, Passport or an external identity provider leaves them unset. |

## SEC-010

**Revoke the current access token on logout.**

When the API issues its own bearer tokens, declared by configuring the token login route, a contract test captures a token at login, calls the configured logout route and asserts that the same token then gets 401.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-010] logout revokes the current access token` |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-009.loginRoute` (planned), `rules.SEC-010.logoutRoute` (planned) |
| Decision | [ADR 0083](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-010/` |
| Adoption | Opt-in: applies once the token login route is declared (rules.SEC-009.loginRoute); a logout that only forgets the token on the client fails until it deletes the current token. |

## SEC-011

**Give access tokens a finite expiration at or below the configured bound.**

When the API issues its own bearer tokens, declared by configuring the token login route, a configuration test asserts that the token guard's expiration is set and at or below the configured upper bound, because a token issued without an expiration stays valid until someone revokes it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-011] access tokens have a finite expiration` |
| Tier | 1 — invariant 3: Credentials are short-lived, revocable and never script-readable |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-009.loginRoute` (planned), `rules.SEC-011.maxTokenMinutes` (planned) |
| Decision | [ADR 0083](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0083-credential-and-client-storage.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-011/` |
| Adoption | Opt-in: applies once the token login route is declared; an existing API whose tokens never expire records a dated allowlist entry until its token-strategy decision (SEC-055) sets a lifetime. |

## SEC-012

**Expose no exception message, class or trace in error responses when debug is off.**

With debug off, a renderer test raises a generic exception through an API route and asserts a generic body with no exception message, class name or stack trace, in any response format, and with the api-contract module on also a problem-details response.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-012] error responses hide exception internals when debug is off` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0053](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0053-rfc-9457-problem-details.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-012/` |
| Adoption | Nothing needed: the kit's central renderer satisfies it; a project renderer that copies exception messages switches to generic details first. |

Known evasions:

- an HttpException message passed through verbatim
- a custom exception handler that bypasses the central renderer

## SEC-013

**Persist only validated input in write actions, never raw request input.**

A type-aware PHPStan rule fails raw request accessors (all, input, only, except, post, json, collect and magic properties) inside controller write actions, so only validated() or safe() data reaches models.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.rawRequestInput` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0047](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0047-model-conventions.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-013/` |
| Adoption | Baseline: existing hits go into the shrink-only PHPStan baseline; new write actions must use validated() or safe(). |

Known evasions:

- raw input read in a service and merged with validated()
- query-string reads inside a write action

## SEC-014

**Pair a key-only guarded model with the strip middleware, creating hook and validated writes.**

When the configured base model guards only its key, a test asserts that the server-owned-field strip middleware is in the resolved API group, a creating hook stamps the configured server-owned fields from the authenticated context and the raw-input rule (SEC-013) is enabled, and with the tenancy module also that the hook refuses a foreign tenant id.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-014] a key-only guarded model has the strip middleware, creating hook and validated writes` |
| Tier | 1 — invariant 4: Untrusted input is hardened at the boundary |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-014.baseModel` (planned), `rules.SEC-014.serverOwnedFields` (planned) |
| Decision | [ADR 0047](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0047-model-conventions.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-014/` |
| Adoption | Nothing needed: a project whose models list their fillable attributes passes, and one that guards only the key gets the strip middleware and the creating hook from the kit. |

Known evasions:

- a model that extends Model directly instead of the base model

## SEC-015

**Apply the tenant scope to every model whose table has the tenant column, with no exceptions.**

A test walks the migrated schema, maps each table that carries the tenant column to its model and fails when that model lacks the configured tenant-scope trait; by design no allowlist or baseline can excuse a miss.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-015] every model whose table has the tenant column uses the tenant scope` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.column` (planned), `modules.tenancy.scopeTrait` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-015/` |
| Adoption | Fix first: by design the tenancy module is adopted only once every tenant table's model carries the trait. |

## SEC-016

**Give every table the tenant column unless it is a declared global table.**

An inverse schema test fails any migrated table, uploads and device tokens included, that lacks the tenant column and is not in the declared global-table list.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-016] every non-global table has the tenant column` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.globalTables` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-016/` |
| Adoption | Nothing needed: adopt lists the existing shared tables as declared global tables for review. |

## SEC-017

**Scope every model with a sub-tenant column by the sub-tenant trait or a dated allowlist entry.**

A schema-reading test requires every model whose table carries a configured sub-tenant column to use the sub-tenant trait or to appear in the allowlist with a reason and an expiry date.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-017] every sub-tenant model is scoped or allowlisted` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.subTenantColumns` (planned), `modules.tenancy.subTenantTrait` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-017/` |
| Adoption | Allowlist: unscoped sub-tenant models get dated entries that name their controller-level mechanism. |

## SEC-018

**Cover every tenant-scoped model and tenant-aware job in the isolation suites.**

Set equality between the tenant models found in the migrated schema, the tenant-aware queued classes found by reflection and the datasets of the HTTP and background isolation suites fails when a subject is missing, and incomplete tests fail the run.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-018] the isolation suites cover every tenant model and tenant-aware job` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.tenancy.isolationTestGlobs` (planned) |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-018/` |
| Adoption | Nothing needed: adopt seeds the dataset from the schema and reflection, so the suite starts complete. |

Known evasions:

- a dataset entry whose test asserts nothing meaningful

## SEC-019

**Validate foreign keys to tenant-scoped tables with the tenant-scoped exists rule.**

A reflection test evaluates each FormRequest's rules(), splits pipe strings, resolves Rule::exists and class-string forms and fails on a plain exists against a tenant table, while the package suite proves the scoped rule returns 422 for a foreign id.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-019] tenant foreign keys use the tenant-scoped exists rule` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-019/` |
| Adoption | Allowlist: requests whose rules() cannot be evaluated get dated entries until they are refactored. |

Known evasions:

- a table named through a variable
- an exists rule applied in a controller or service
- rules() that need route context to evaluate

## SEC-020

**Pin the tenant or declare cross-tenant access with a reason in every background class.**

Reflection over every concrete queued class (jobs, listeners, mailables, notifications), console command, scheduled event and controller behind an unauthenticated route requires the tenant-aware middleware or trait backed by TenantContext, or #\[CrossTenant(reason: '...')\]; a blank reason or a comment-only declaration fails.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-020] every background entrypoint pins the tenant or declares cross-tenant access` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0058](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0058-background-tenant-context.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-020/` |
| Adoption | Nothing needed: adopt adds the tenant-aware middleware to existing queued classes or a #\[CrossTenant\] attribute with a reason; scheduled closures become jobs or commands. |

Known evasions:

- a queued closure, such as dispatch(function () {...}), a closure in Bus::chain or dispatchAfterResponse, which is not a class
- a defer() callback
- the marker is present but handle() drops the tenant scope with withoutGlobalScope()

## SEC-021

**Answer cross-tenant direct access with 404, never 403.**

A dataset-driven isolation test calls the show, update and delete routes of every tenant model with another tenant's id and asserts 404, so a foreign record's existence is never confirmed.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-021] cross-tenant direct access answers 404` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-021/` |
| Adoption | Fix first: the global tenant scope yields 404 before authorization; routes that load records without it are fixed. |

Known evasions:

- a route whose parameters the dataset cannot build

## SEC-022

**Give every upload rule a size cap and type and extension allowlists without script formats.**

Reflection over FormRequest rules() requires every file rule to carry max:, content-derived types (mimes or File::types) and extensions:, and rejects svg, image:allow_svg, html and xml.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-022] every upload rule has a size cap and type allowlists` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-022.maxKilobytes` (planned), `rules.SEC-022.allowedTypes` (planned) |
| Decision | [ADR 0087](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0087-file-uploads.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-022/` |
| Adoption | Allowlist: the reflection test has no native baseline, so adopt records existing upload requests as dated entries in .cross-stack/allowlists/SEC-022.json, which only shrink. |

Known evasions:

- rules built at runtime or wrapped in custom rule objects
- a type trusted from the client Content-Type header in a controller

## SEC-023

**Enforce the morph map so polymorphic parent types come from an explicit allowlist.**

A test asserts that Relation::requiresMorphMap() is on and that upload requests constrain the parent-type field with an In rule, so a client cannot name an arbitrary model class.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-023] the morph map is enforced` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-023.enabled` (planned) |
| Decision | [ADR 0087](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0087-file-uploads.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-023/` |
| Adoption | Opt-in: enabling it needs a morph map that covers every existing polymorphic type, because an enforced map rejects unmapped classes. |

## SEC-024

**Authorize file access by ownership of the file or its parent record, never by login alone.**

Upload, download and delete abilities check that the caller owns the file or its parent record, which reviewers confirm in the file policies.

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
| Decision | [ADR 0087](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0087-file-uploads.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review against the file abilities in existing policies. |

## SEC-025

**Store uploads under the validated extension, never a name derived from the sniffed type.**

A custom PHPStan rule disallows UploadedFile::store(), storePublicly() and Storage::putFile() on uploads in favour of storeAs() with the validated extension, because a name derived from the sniffed type can turn an upload into an executable file.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.storeWithoutExtension` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0087](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0087-file-uploads.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-025/` |
| Adoption | Baseline: existing calls go into the shrink-only PHPStan baseline. |

Known evasions:

- another storage write with a computed name, such as Storage::put() with hashName()

## SEC-027

**Redact credentials and personal data in every log channel.**

The kit's log processor redacts the configured credential keys (authorization, token, password, cookie) and personal-data keys, and a test asserts that every configured log channel carries it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-027] every log channel carries the redaction processor` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-027.redactKeys` (planned), `rules.SEC-027.personalDataKeys` (planned) |
| Decision | [ADR 0088](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0088-structured-redacted-logging.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-027/` |
| Adoption | Nothing needed: adopt adds the processor to every configured channel. |

Known evasions:

- personal data under a key missing from the redaction list

## SEC-028

**Keep the error tracker from sending personal data by default.**

With the observability module, a configuration test asserts that the error tracker's send-default-personal-data option is off; the rule stays off by default until the observability decision is accepted.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[SEC-028] error reporting sends no default personal data` |
| Tier | 2 |
| Module | `observability` |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.SEC-028.enabled` (planned) |
| Decision | [ADR 0099](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0099-observability-module.md) |
| Since | 1.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-028/` |
| Adoption | Opt-in: arrives with the observability module after 1.0 and is turned on through rules.SEC-028.enabled. |

## SEC-029

**Put readiness checks and infrastructure detail behind operator authorization.**

The readiness route carries the operator ability and the public liveness route exposes no dependency or infrastructure detail, which reviewers confirm.

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
| Decision | [ADR 0051](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0051-health-endpoints.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review against the readiness route's ability. |

## SEC-030

**Make broadcast channels private and authorized, and tenant-scoped with the tenancy module.**

Once broadcasting is adopted by ADR, every channel is private with an authorization callback, and with the tenancy module each callback checks the tenant, which reviewers confirm in the channel definitions.

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
| Decision | [ADR 0056](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0056-polling-before-push.md) |
| Since | 0.1.0 |
| Adoption | Nothing needed: checked in review against the channel authorization callbacks. |

## SEC-069

**Throw when a record is created with an explicit foreign tenant id.**

A shipped feature test has a non-platform user create a tenant-scoped record with another tenant's id and asserts that the tenant trait's creating hook throws instead of saving it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[SEC-069] creating a record with a foreign tenant id throws` |
| Tier | 1 — invariant 10: Tenant isolation, when the tenancy module is on |
| Module | `tenancy` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0057](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-069/` |
| Adoption | Nothing needed: the behaviour ships with the tenant trait and the test ships complete. |

Known evasions:

- inserts through the query builder or the DB facade skip model events
- saveQuietly() or withoutEvents() skip the creating hook

## SEC-071

**Ship the mandated auth and authorization suites complete, with no todo, skipped or incomplete test.**

The check asserts that every mandated test of the authentication and authorization suites exists and reads PHP tokens, ignoring comments and strings, to fail on ->todo(, ->skip(, markTestIncomplete( and markTestSkipped( in those suites, with waivers only as dated allowlist entries; BE-107 owns the runner flags.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-security-suites` / `security-suites` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0039](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0039-backend-testing-floor.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/SEC-071/` |
| Adoption | Allowlist: a suite that cannot run yet needs a dated allowlist waiver; failOnSkipped stays off so environment skips elsewhere keep working. |

Known evasions:

- a mandated test whose assertions are trivially true
- a skip or incomplete call made through a helper the token scan does not recognise

## I18N-001

**Take user-visible server messages from translation keys, never literal sentences.**

A custom PHPStan rule requires the message arguments of abort(), Response::deny(), the response helper and problem-detail title and detail to be \_\_() or trans() calls, so every message the API returns can be localized.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.literalUserMessage` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-001/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

Known evasions:

- a literal sentence held in a variable or constant before it is passed
- a message set inside a custom exception class
- problem-detail fields assembled in an array outside the checked calls

## I18N-002

**Implement HasLocalePreference on every notifiable model.**

A reflection test over app/ requires every class that uses the Notifiable trait to implement HasLocalePreference, so mail and notifications render in the recipient's stored locale rather than the request's.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[I18N-002] every notifiable model implements HasLocalePreference` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-002/` |
| Adoption | Allowlist: dated entries per model until its locale preference is stored. |

## I18N-003

**Set the locale before authentication, throttling and route-model binding on every API route.**

With two or more configured locales, a test resolves the HTTP kernel, gathers the global and route middleware of every api/ route (asserting the set is not empty) and fails when the locale middleware is missing or runs after authentication, throttling or SubstituteBindings, so 401, 404 and 429 messages are localized too.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[I18N-003] every api route sets the locale before auth, throttle and bindings` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-003/` |
| Adoption | Nothing needed: the kit's bootstrap template prepends the locale middleware to the api group. |

## I18N-004

**Set the application locale only in the locale middleware and the locale-scoping helpers.**

A custom PHPStan rule reports setLocale() calls outside the locale middleware and the helpers that switch the locale for a block and restore it, so no request value changes the locale without passing the configured-locale allowlist.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.setLocaleOutsideMiddleware` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-004/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

Known evasions:

- a request value passed to setLocale() inside an allowed helper
- a dynamically named method call or call_user_func

## I18N-005

**Keep the backend's supported-locales config equal to the manifest's locales list.**

A test compares the backend's single supported-locales config list with the locales in .cross-stack/standard.json and fails on any difference, so the API accepts exactly the configured locales and falls back to the default for any other.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[I18N-005] supported locales config equals the manifest locales` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-005/` |
| Adoption | Nothing needed: adopt writes the config list from the manifest. |

## I18N-006

**Keep server lang files in parity across the configured locales.**

A test loads lang/&lt;locale>/\*.php and lang/&lt;locale>.json for every configured locale and fails on a missing or extra key, an empty value, a :placeholder mismatch or a value identical to the source locale's without a dated allowlist entry.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — pest: `[I18N-006] server lang files are in parity across locales` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales`, `modules.i18n.parityIgnore` (planned) |
| Decision | [ADR 0080](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0080-locale-parity.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-006/` |
| Adoption | Allowlist: dated entries for framework strings a brownfield locale still lacks. |

## I18N-007

**Define every statically referenced server translation key in every configured locale.**

A custom PHPStan rule resolves literal keys passed to \_\_(), trans(), trans_choice() and Lang::get() against the group and JSON lang files of each configured locale, so a missing key never renders as its raw name.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — phpstan: `crossStack.missingTranslationKey` |
| Tier | 1 — invariant 9: The locale contract, when the i18n module is on |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0080](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0080-locale-parity.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-007/` |
| Adoption | Baseline: existing findings go into the PHPStan baseline, which only shrinks. |

Known evasions:

- keys built at run time or passed through a variable
- keys resolved through a wrapper function the rule does not know

## I18N-008

**Translate the attribute name of every validated field in every configured locale.**

A reflection test reads each FormRequest's rules() and requires an attributes() entry or a validation.attributes lang entry for every field in every configured locale, so validation messages never show raw field names.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[I18N-008] validation attribute names are translated for every locale` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-008/` |
| Adoption | Allowlist: dated entries per FormRequest until its attribute names are translated. |

Known evasions:

- rules() that need route or user context cannot be evaluated by reflection
- validation run outside FormRequests

## I18N-009

**Leave no server locale plumbing behind while the i18n module is off.**

When the i18n module is off, a test fails on a second locale directory under lang/, setLocale() calls or a locale middleware in app/ and bootstrap/, and \*\_&lt;locale> columns in the migrated schema, so a project wires localization completely or not at all.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[I18N-009] ships no server locale plumbing without the i18n module` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-009/` |
| Adoption | Fix first: remove leftover locale fragments or switch the module on; a project that published only the default locale's lang files already passes. |

Known evasions:

- locale fragments the scan does not recognise, such as per-locale branches in plain PHP
- locale-suffixed columns whose suffix is outside the scanned language codes

## I18N-011

**Store each model's multilingual content with one declared strategy, never a mix.**

A model uses either per-locale columns or JSON translations for all of its translatable attributes, chosen by the documented criteria, and reviewers reject a model that mixes the two.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.I18N-011.enabled` (planned) |
| Decision | [ADR 0097](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0097-translatable-content-storage.md) |
| Since | 1.0.0 |
| Adoption | Opt-in: turned on through rules.I18N-011.enabled once the translatable-storage decision is accepted. |

## I18N-043

**Answer in the requested configured locale, falling back to the default for an unlisted one.**

A feature test sends a request that fails validation with each configured Accept-Language and with an unlisted one and asserts the message language and the fallback, so the locale middleware is proven to work and not merely registered.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — pest: `[I18N-043] api messages follow the requested locale and fall back for an unlisted one` |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `locales` |
| Decision | [ADR 0077](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/I18N-043/` |
| Adoption | Nothing needed: the kit ships the test against its own validation route. |

Known evasions:

- endpoints the test does not exercise
- messages built without the translator

## CI-001

**Run format, analysis, tests with the coverage floor and baseline growth in the Laravel chain.**

A CI-parity sub-check reads composer.json and requires the check script to run pint --test, Larastan, the Pest suite with its coverage floor and the baseline-growth check, plus a check:fast script for the Stop hook, while dependency audits stay out of both because they need the network.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `laravel-check-members` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0090](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0090-ci-contract.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/CI-001/` |
| Adoption | Nothing needed: adopt writes check and check:fast into composer.json and keeps any stricter existing member; doctor reports a missing PCOV or Xdebug coverage driver. |

Known evasions:

- a member script redefined as a no-op or with its failure swallowed, for example by appending || true
- a member run with weakened flags, such as a narrowed path list

## CI-017

**Publish a backend-only repository's OpenAPI document as a versioned artifact after its export.**

With the api-contract module on and no client track in the repository, a workflow check asserts that an upload step follows the export step in the reusable Laravel workflow and that the artifact name carries the document's info.version, so standalone clients can pin a version.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-workflows` / `contract-artifact` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.api-contract.artifact` (planned) |
| Decision | [ADR 0054](https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0054-generated-api-contract.md) |
| Since | 0.1.0 |
| Violation fixture | planned — `test/fixtures/laravel/violations/CI-017/` |
| Adoption | Nothing needed: the reusable Laravel workflow ships the upload step after the export step. |

Known evasions:

- info.version left unchanged when the document changes, so two different documents share one artifact name
- an artifact retention period shorter than the time standalone clients take to pin a version
