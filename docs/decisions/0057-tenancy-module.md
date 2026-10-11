---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Tenancy module: model-level scoping verified against the migrated schema, failing closed

## Context and Problem Statement

In a multi-tenant application that shares tables, one missing `where tenant_id = ?` shows one
customer's data to another. The leaks are rarely in the obvious query. Common defects:

- a model whose table has a tenant column but no scope;
- a client-supplied tenant id accepted on create;
- a plain `exists:` validation rule that accepts a foreign tenant's id;
- a **null-tenant hole**: Laravel compiles `where($column, null)` to `IS NULL`, so when a tenant is
  deleted and a null-on-delete foreign key clears its users' tenant id, those orphaned users see
  every row that has no tenant;
- the platform-operator bypass, or the disabled-tenant check, implemented in two places that drift,
  so a missing tenant row blocks a request in one place and not the other;
- a per-route tenant middleware that is silently absent from some routes.

How does the Standard make tenant isolation structural and fail closed, for the projects that need
it?

## Decision Drivers

- Isolation is proven from the real migrated schema, not from lists kept by hand.
- Every tenancy predicate fails closed.
- Each concept (bypass, disabled tenant) has exactly one definition.
- Denials do not reveal that another tenant's record exists.

## Considered Options

- Model-level global scopes verified against the migrated schema, with fail-closed predicates
- Scoping by convention in controllers and queries
- A separate database or schema per tenant

## Decision Outcome

Chosen option: "Model-level global scopes verified against the migrated schema, with fail-closed
predicates", because the scope applies to every query of a model, a schema-reading gate proves no
model is missed, and it needs no per-tenant infrastructure.

- **Opt-in.** The module is off by default under the proposed default set
  ([0011](0011-default-module-set.md)) and enabled in `.cross-stack/standard.json`; it installs
  as a whole unit: mechanism, registration, route-group skeleton, login checks, role seeding,
  default-tenant provisioning, gates and isolation suite ([0010](0010-opt-in-modules.md)). The
  tenant is resolved from the authenticated user; any other strategy needs its own ADR.
- **Scopes.** Every model whose table carries the tenant column uses the tenant global-scope trait,
  with no allowlist for a miss. A sub-tenant column needs the model-attached scope or a dated
  allowlist entry ([0005](0005-explicit-exceptions.md)), plus an isolation test.
- **Writes.** Fields that the server owns are removed at the HTTP boundary by middleware that runs
  first in the API group. The creating hook stamps the tenant and throws when an explicit tenant id differs
  from a non-platform acting user's tenant. No plain `exists:` rule targets a tenant-scoped table;
  the tenant-scoped rule is used instead.
- **Fail closed.** A non-bypassing user without a tenant sees zero rows, never a `whereNull` match;
  for that user the scoped `exists` rule rejects and the creating hook throws. The platform-bypass
  predicate is defined once and requires a null tenant, so a tenant-bound user never bypasses.
- **Deletion.** The users' tenant foreign key and business `tenant_id` columns restrict on delete;
  deleting a tenant is an explicit offboarding step, never a side effect.
- **Disabled tenants.** One predicate serves token issuance and every request, and it fails closed
  when the tenant row is missing.
- **Routes and denials.** Every API route whose resolved middleware includes an auth guard also
  includes the active-tenant middleware. Across the tenant boundary the answer is 404, within it
  403, and lists are scoped silently, with totals counting own rows only
  ([0048](0048-http-status-vocabulary.md)).

### Consequences

- Good, because a leak requires defeating structural gates, not just forgetting a clause.
- Good, because an orphaned or misconfigured user sees nothing instead of everything.
- Bad, because global scopes act implicitly: every `withoutGlobalScope` call needs review.
- Bad, because tenant offboarding must be written as a deliberate flow.
- Bad, because the isolation suites add test time to every run.

### Confirmation

- A Pest test walks the migrated schema, maps tables to models and asserts the tenant trait (Pest
  `arch()` cannot read the schema). FORCED ([0037](0037-phpstan-rules-and-reflection-tests.md)).
- A route-table test over the resolved middleware stack asserts the active-tenant middleware on
  every authenticated API route, and the strip middleware first in the API group. FORCED.
- A reflection test evaluates each FormRequest's `rules()` and fails on a plain `exists` against a
  tenant table. GUARDED, because rules built dynamically can evade it.
- Feature tests shipped complete: an orphaned user sees zero rows, their `exists` check rejects,
  their create throws, deleting a tenant that still has users is refused, and a tenant-bound
  operator never bypasses. GUARDED; incomplete tests fail the run
  ([0039](0039-backend-testing-floor.md)).
- Dataset-driven isolation suites cover 404 across tenants and silent list scoping for every tenant
  model. GUARDED.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Model-level global scopes verified against the migrated schema, with fail-closed predicates

- Good, because scoping is automatic and its coverage is proven.
- Bad, because implicit scoping surprises developers who do not know the module is on.

### Scoping by convention in controllers and queries

- Good, because every constraint is visible at the call site.
- Bad, because one forgotten clause is a leak, and no gate can prove coverage.

### A separate database or schema per tenant

- Good, because isolation is physical.
- Bad, because migrations, connections and backups multiply per tenant, which most projects do not
  need; a project that does records its own ADR.

## More Information

- Laravel global scopes: <https://laravel.com/docs/13.x/eloquent#global-scopes>; foreign key
  actions: <https://laravel.com/docs/13.x/migrations#foreign-key-constraints>; the `IS NULL`
  shortcut in the query builder (v13.33.0):
  <https://github.com/laravel/framework/blob/v13.33.0/src/Illuminate/Database/Query/Builder.php>.
- Related: [0010](0010-opt-in-modules.md), [0039](0039-backend-testing-floor.md),
  [0048](0048-http-status-vocabulary.md), [0058](0058-background-tenant-context.md).
- Governs: the tenancy module's Laravel and security rules (schema scoping, write stamping,
  fail-closed predicates, route middleware and denial vocabulary).
