# Laravel track

Rules for a Laravel JSON API: quality floor, routing, validation, authorization, serialization,
layering, models, lists, jobs, files and logging. Rules marked Tier 1 apply to every project with
the Laravel track; the others apply once the project declares Tier 2. Module rules live in their own
references: [api-contract.md](api-contract.md) (response path, problem details, the OpenAPI export),
[tenancy.md](tenancy.md), [i18n-rtl.md](i18n-rtl.md) and, for the observability module planned after
1.0, [security.md](security.md).

## Rules

### Quality floor and tests

- **BE-001** Declare `strict_types=1` in every namespaced PHP file _(Tier 1)_
- **BE-002** Format PHP with Pint against a committed configuration that names its preset _(Tier 1)_
- **BE-003** Pass Larastan at the project's level, with every parameter, return and property typed _(Tier 1)_
- **BE-004** Keep the effective Larastan level, analysed paths and unmatched-ignore reporting at the floor _(Tier 1)_
- **BE-005** Never let the PHPStan baseline grow _(Tier 1)_
- **BE-006** Never lower the PHPStan level, and raise it by the recorded due date
- **BE-007** Pass the Pest php preset: no debug, diagnostic or raw output calls such as `var_dump`, `dump` or `echo`
- **BE-008** Leave no untracked TODO, FIXME, HACK or XXX marker: each one carries a ticket reference
- **BE-009** Commit no commented-out PHP code
- **BE-010** Document in `.env.example` every `env()` key that project config files read
- **BE-011** Run the test suite against uncached configuration
- **BE-012** Pin a hermetic test environment in `phpunit.xml` with `force="true"`
- **BE-013** Meet the configured backend test-coverage floor _(Tier 1)_
- **BE-014** Add no new PHP copy-paste clones beyond the committed jscpd baseline
- **BE-022** Exercise every API route in at least one feature test
- **BE-097** Name regression tests after the invariant they protect
- **BE-098** Write every inline PHPStan suppression as `@phpstan-ignore` with an identifier and a reason _(Tier 1)_
- **BE-107** Fail the test run on incomplete and risky tests _(Tier 1)_
- **SEC-071** Ship the mandated auth and authorization suites complete, with no todo, skipped or incomplete test
- **CI-001** Run format, analysis, tests with the coverage floor and baseline growth in the Laravel chain _(Tier 1)_
- **I18N-009** Leave no server locale plumbing behind while the i18n module is off _(Tier 1)_

### Routing

- **BE-015** Serve every API route under a version prefix _(off by default)_
- **BE-016** Shape API URIs as kebab-case plural resources, with state transitions as POST sub-resource verbs _(off by default)_
- **BE-017** Route every request to a controller action; no route closures
- **SEC-002** Map GET and HEAD routes only to index, show or allowlisted read actions _(Tier 1)_

### Requests and validation

- **BE-018** Type the input of every POST, PUT and PATCH action as a FormRequest
- **BE-019** Keep validation in FormRequests; no inline validation in the HTTP layer
- **BE-020** Name store and update requests `Store{Model}Request` and `Update{Model}Request`
- **BE-058** Set server-derived fields in `prepareForValidation()`, never from client input
- **BE-059** Keep wire field names equal to storage column names
- **BE-060** Keep FormRequest `messages()` keys matched to rules that exist
- **SEC-013** Persist only validated input in write actions, never raw request input _(Tier 1)_
- **SEC-014** Pair a key-only guarded model with the strip middleware, creating hook and validated writes _(Tier 1)_

### Authentication and authorization

- **BE-021** Authorize each endpoint at exactly one site with exactly one policy ability
- **BE-051** Decide single-record access in policies and list visibility in a scope that mirrors them
- **SEC-003** Declare `authorize()` in every FormRequest and never return a constant true from it _(Tier 1)_
- **SEC-004** Resolve every non-public route to an existing policy ability, and allowlist public routes _(Tier 1)_
- **SEC-005** Require authentication on every non-public API route _(Tier 1)_
- **BE-023** Answer failed logins with one generic problem detail
- **SEC-009** Return the access token at the documented response path from the token login route _(off by default)_
- **SEC-010** Revoke the current access token on logout _(Tier 1; off by default)_
- **SEC-011** Give access tokens a finite expiration at or below the configured bound _(Tier 1; off by default)_

### Responses

- **BE-024** Declare an allowed response type as the return type of every controller action
- **BE-049** Serialize models only through API Resources in the HTTP layer
- **BE-050** Define each wire shape once: one Resource per shape, summary Resources for nested relations
- **SEC-012** Expose no exception message, class or trace in error responses when debug is off _(Tier 1)_

### Layering

- **BE-029** Never service-locate outside service providers: no `app()`, `resolve()`, `App::make` or container calls
- **BE-030** Add no pass-through layers: single-step CRUD and list queries stay in the controller
- **BE-031** Add a service only for a domain rule used outside HTTP; make shared multi-step writes Actions
- **BE-032** Add no repository or speculative layer classes (Repository, Manager, Handler, UseCase, Interactor)
- **BE-033** Implement every Action as an invokable class in `App\Actions`
- **BE-034** Keep raw SQL, the DB facade and transactions out of the HTTP layer
- **BE-035** Keep services plain classes with no interface and no base class
- **BE-036** Place each kind of class in the namespace the configured placement map assigns it
- **BE-037** Pass the Pest laravel preset: framework class conventions and no `env()` outside config
- **BE-038** Promote and mark readonly every constructor parameter of controllers, services and Actions _(off by default)_
- **BE-039** Keep controllers under the configured line count
- **BE-040** Keep HTTP, validation and response concerns out of models

### Models and enums

- **BE-041** Declare casts in the `casts()` method, not the `$casts` property _(off by default)_
- **BE-042** Name database columns in `snake_case` _(off by default)_
- **BE-043** Cast every status, state, type and role column to a string-backed enum
- **BE-044** Make every enum a native string-backed enum
- **BE-045** Name enum cases in the configured style with `snake_case` backing values _(off by default)_
- **BE-046** Never compare enum-cast attributes to string literals; use the enum
- **BE-047** Keep presentation data such as colors off enums; the API emits semantic state only
- **BE-048** Emit enum values only; never add `*_label` display fields to Resources
- **BE-052** Generate sequential codes with a database sequence or retry on unique violation, never max + 1
- **BE-053** Enable Eloquent strict mode outside production _(off by default)_

### Lists

- **BE-054** Paginate every list (index) route
- **BE-055** Sanitize and hard-cap `per_page`, falling back to the default on invalid input
- **BE-056** Accept only declared filter and sort keys; reject unknown keys with 400 _(off by default)_
- **BE-057** Use one filter idiom per project for list queries

### Rate limiting and unsafe functions

- **SEC-006** Rate-limit every unauthenticated API route with a bounded limiter _(Tier 1)_
- **SEC-007** Rate-limit every mutating authenticated API route with a bounded limiter _(off by default)_
- **SEC-008** Cap attempts per minute on the login, password change and password reset routes
- **SEC-001** Call no insecure PHP functions such as `eval`, `exec`, `md5`, `sha1`, `unserialize` or `rand` _(Tier 1)_

### Background jobs

- **BE-084** Queue every mailable and notification
- **BE-085** Pass identifiers to queued classes, never the authenticated user, the request or closures
- **BE-086** Declare tries or retryUntil, backoff and timeout on every job and queued listener
- **BE-087** Make jobs safe to retry: idempotent, guarded on current state, fast to fail on permanent errors
- **BE-088** Schedule pruning of failed jobs whenever the application has queued classes
- **BE-089** Surface a failed job's owed result to the affected user or tenant _(off by default)_

### Files

- **BE-083** Route all file uploads through the declared upload requests _(off by default)_
- **SEC-022** Give every upload rule a size cap and type and extension allowlists without script formats
- **SEC-023** Enforce the morph map so polymorphic parent types come from an explicit allowlist _(off by default)_
- **SEC-024** Authorize file access by ownership of the file or its parent record, never by login alone
- **SEC-025** Store uploads under the validated extension, never a name derived from the sniffed type

### Logging, health, live data and audit

- **BE-090** Log with a constant message and pass variable data in the context array
- **BE-091** Log ids and stable codes, never models, tenant rows or per-locale column dumps
- **SEC-027** Redact credentials and personal data in every log channel
- **BE-094** Keep the liveness route unauthenticated, dependency-free and free of version detail
- **SEC-029** Put readiness checks and infrastructure detail behind operator authorization
- **BE-095** Poll for live surfaces; add server broadcasting packages only with a recorded decision
- **SEC-030** Make broadcast channels private and authorized, and tenant-scoped with the tenancy module
- **BE-096** Record audit events only through the audit-trail mechanism declared in the stack table

## Sanctioned patterns

**Thin controller** ([ADR 0040][0040], [ADR 0043][0043], [ADR 0044][0044], [ADR 0045][0045]).
Single-step CRUD stays in the controller: `store(StoreOrderRequest $request): OrderResource` returns
`new OrderResource(Order::create($request->validated()))`, and `StoreOrderRequest::authorize()`
returns one policy check such as `$this->user()->can('create', Order::class)`. Without a FormRequest
(index, show, delete) the controller authorizes once with `Gate::authorize()`, the `can` middleware
or `#[Authorize]`.

**Action** for a multi-step write that at least two entry points run (HTTP, a job, a command, a
listener) ([ADR 0041][0041]): one invokable class in `App\Actions` named verb then noun, constructor
injection only, a validated array or DTO in, models or values out, one transaction inside. With a
single caller it is inlined. **Services** exist only for a domain rule that runs without HTTP (a
state machine, scoring, rendering for an external system): plain classes, no interface, no base
class, with state guards as named predicates (`canCancel()`). No repositories.

```php
final class SubmitOrder // App\Actions, in a file that declares strict_types=1
{
    public function __construct(private readonly StockLedger $ledger) {}

    public function __invoke(Order $order, array $validated): Order
    {
        return DB::transaction(fn (): Order => $this->ledger->reserve($order, $validated));
    }
}
```

**Routing** ([ADR 0042][0042]): `apiPrefix: 'api/v1'` in `withRouting()`; `Route::apiResource()` for
kebab-case plural resources; a state transition is `POST /api/v1/orders/{order}/submit` served by an
invokable controller that calls the transition's Action. GET and HEAD never change state.

**Resources** ([ADR 0045][0045]): `OrderItemResource::collection($this->whenLoaded('items'))` for
collections; `$this->whenLoaded('customer', fn () => new CustomerResource($this->customer))` for a
singular relation; `OrderResource::collection($paginator)` so `links` and `meta` survive; a summary
Resource instead of an inline array for a nested model.

**Models and enums** ([ADR 0046][0046], [ADR 0047][0047]): explicit `$fillable`, or
`$guarded = ['id']` only together with the server-owned-field middleware, a `creating` hook and
validated-only writes (SEC-014); casts
in `casts()`; status-like columns cast to string-backed enums in `App\Enums` and compared by case;
no labels or colors on the wire; eager-load lists as model constants; generated codes from a
sequence or an insert that retries on `UniqueConstraintViolationException`, never `max() + 1`.

**Lists** ([ADR 0049][0049]): every index paginates; `per_page` is validated and clamped, falling
back to the default; declared filters and sorts only, unknown keys answered with 400. If
`spatie/laravel-query-builder` is installed it is the idiom; otherwise a `when()` chain over
validated parameters.

**Jobs** ([ADR 0055][0055]): mail and notifications implement `ShouldQueue`; jobs receive
identifiers (a model counts), never the request, the guard's user or a closure; each job declares
`tries` or `retryUntil()`, a backoff and a timeout below the connection's `retry_after`; jobs are
idempotent and re-check state; `queue:prune-failed` is scheduled; `failed()` tells the user a result
is not coming.

**Logging** ([ADR 0088][0088]): `Log::info('Order submitted', ['order_id' => $order->id])`: a
constant message, identifiers in the context, never models or row dumps; a redaction processor on
every channel through `tap`.

**Quality and tests** ([ADR 0036][0036], [ADR 0038][0038], [ADR 0039][0039], [ADR 0090][0090]): Pest
with the `php`, `security` and `laravel` presets; architecture tests in `tests/Unit/ArchTest.php`,
each name starting with its rule ID in brackets; Larastan at level 8 for greenfield (`app`,
`database`, `routes`, `tests`) or 6 plus a shrink-only baseline for brownfield, with
`reportUnmatchedIgnoredErrors` and `reportIgnoresWithoutComments` on; `failOnIncomplete` and
`failOnRisky` on the root `<phpunit>` element; every `<env>` the suite relies on carries
`force="true"`; route-coverage and policy-ability meta-tests; scenario tests named after the
invariant they protect.

**Rate limits and status codes** ([ADR 0050][0050]): a named limiter on every unauthenticated route
and every mutating authenticated route, strict attempt caps on login and password routes, and the
throttle headers kept so `Retry-After` reaches the client. The status vocabulary is in
[api-contract.md](api-contract.md); failed logins get one generic answer whatever the cause.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them when writing and reviewing code, and
do not describe them as enforced by a gate. The Pest architecture tests, custom PHPStan rules,
reflection meta-tests and CI steps that will enforce them arrive in later 0.x releases; until then
the hooks and the project's own Pint, Larastan and Pest runs are the only mechanical checks.
`enforcement` in `${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for each ID.

## Decision records

- [ADR 0036][0036]: Pest replaces the PHPUnit runner; architecture presets
- [ADR 0038][0038]: Larastan levels with a shrink-only baseline
- [ADR 0039][0039]: Backend testing floor: meta-tests, invariant-named scenarios and security suites that fail when empty
- [ADR 0040][0040]: Backend layering: thin controllers, disciplined services, no repositories
- [ADR 0041][0041]: One sanctioned Action pattern for reusable multi-step writes
- [ADR 0042][0042]: API routing: URI-versioned, resourceful and controller-only
- [ADR 0043][0043]: Authorization: a single site and a single policy ability for each endpoint
- [ADR 0044][0044]: Request validation: Store and Update FormRequests; wire names equal storage names
- [ADR 0045][0045]: API Resources are the only model-to-JSON layer
- [ADR 0046][0046]: Enums: string-backed, value-only on the wire, no presentation data
- [ADR 0047][0047]: Model conventions: a complete mass-assignment posture, casts() and race-safe generated codes
- [ADR 0049][0049]: Server-driven collections: declared filters and sorts, capped pages, no client pagination over a server page
- [ADR 0050][0050]: Every unauthenticated and every mutating API route is rate-limited
- [ADR 0055][0055]: Background job conventions: queue slow work, pass identifiers, declare a retry policy
- [ADR 0088][0088]: Structured and redacted logging
- [ADR 0090][0090]: CI contract: a reusable per-track workflow that runs exactly the check members

[0036]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0036-pest-replaces-phpunit-runner.md
[0038]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0038-larastan-levels-shrink-only-baseline.md
[0039]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0039-backend-testing-floor.md
[0040]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0040-backend-layering.md
[0041]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0041-action-pattern.md
[0042]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0042-api-routing.md
[0043]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0043-single-authorization-site.md
[0044]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0044-form-request-validation.md
[0045]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0045-resources-only-serialization.md
[0046]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0046-enums-on-the-wire.md
[0047]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0047-model-conventions.md
[0049]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0049-server-driven-collections.md
[0050]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0050-rate-limiting.md
[0055]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0055-background-jobs.md
[0088]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0088-structured-redacted-logging.md
[0090]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0090-ci-contract.md
