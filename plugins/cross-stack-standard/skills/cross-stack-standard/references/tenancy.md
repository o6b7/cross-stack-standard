# Tenancy

Tenant isolation for a multi-tenant Laravel API and its clients: model-level scoping checked against
the migrated schema, writes stamped from the acting user, background code that pins the tenant or
declares cross-tenant access, and failure closed. The `tenancy` module is off by default; it applies
only when the manifest turns it on ([ADR 0057][0057], [ADR 0058][0058]). Rules marked Tier 1 apply
to every project with the module on; the others apply once the project declares Tier 2.

## Before you write tenancy code

The module is designed to be adopted as a whole unit from versioned templates (mechanism,
registration, route-group skeleton, login checks, seeds, isolation suites) and consumed, never
re-derived from prose ([ADR 0010][0010], BE-077). If the project has no vendored tenancy mechanism
under `.cross-stack/vendor/`, or it differs from what these rules describe, treat the work as
unknown territory: stop and ask before hand-writing scoping, stamping or bypass logic.

## Rules

### Scoping and schema

- **SEC-015** Apply the tenant scope to every model whose table has the tenant column, with no exceptions _(Tier 1)_
- **SEC-016** Give every table the tenant column unless it is a declared global table _(Tier 1)_
- **SEC-017** Scope every model with a sub-tenant column by the sub-tenant trait or a dated allowlist entry _(Tier 1)_
- **BE-063** Wire tenancy into the user model only through the shipped traits; never redefine the tenant relation
- **BE-064** Migrate the tenancy schema: a tenants table with non-null feature flags and tenant columns on users
- **BE-069** Apply the sub-tenant scope in every listing over a sub-tenant model
- **BE-070** Apply sub-tenant scoping only through the model-attached scope
- **BE-106** Reference tenants with restrict-on-delete foreign keys and non-nullable business tenant columns

### Resolving the tenant and failing closed

- **BE-075** Resolve the tenant from the authenticated user, never from headers, hosts or request parameters _(Tier 1)_
- **BE-076** Let a tenant's host decide only pre-login branding and login affinity, never data scoping _(off by default)_
- **BE-073** Fail closed for a user without a resolvable tenant: no rows, no create and 403 on requests
- **BE-072** Grant the platform bypass only to operators without a tenant, and honor it at every layer
- **BE-074** Define the platform-bypass predicate once and call it from every tenancy layer
- **BE-071** Block a disabled tenant at login and on existing tokens with one shared predicate and message
- **BE-103** Never resolve the authenticated user inside the tenant scope
- **BE-105** Let the authenticated user's tenant take precedence over a pinned tenant context

### Writes

- **BE-061** Run the server-owned-field strip middleware first in the resolved API middleware stack _(Tier 1)_
- **BE-100** Strip server-owned fields from body, query and JSON input, nested keys included _(Tier 1)_
- **BE-101** Stamp the tenant on create from the acting user, else the pinned context; refuse neither _(Tier 1)_
- **SEC-069** Throw when a record is created with an explicit foreign tenant id _(Tier 1)_
- **SEC-019** Validate foreign keys to tenant-scoped tables with the tenant-scoped exists rule _(Tier 1)_

### Routes, denials and lists

- **BE-062** Apply the active-tenant middleware to every authenticated API route _(Tier 1)_
- **SEC-021** Answer cross-tenant direct access with 404, never 403 _(Tier 1)_
- **BE-068** Scope list endpoints silently to the caller's tenant: foreign rows absent and totals tenant-only _(Tier 1)_

### Background work

- **BE-102** Scope background reads to the pinned tenant context and fail closed when nothing is pinned _(Tier 1)_
- **SEC-020** Pin the tenant or declare cross-tenant access with a reason in every background class _(Tier 1)_

### Features, caching and notifications

- **BE-078** Gate tenant features with the feature middleware keyed to the feature enum
- **BE-079** Never re-implement a tenant feature check inline in a controller
- **BE-080** Test a 403 for every tenant-feature key used in the route table
- **BE-104** Apply tenant feature gates to every tenant user, admins included; exempt only the platform bypass
- **BE-081** Cache tenant data only through the tenant-aware helper that prefixes keys with the tenant id
- **BE-082** Never send a push notification to a device token outside the notification's tenant

### Tests and seeds

- **BE-067** Ship the tenant-isolation suites complete, with no todo, skipped or incomplete test _(Tier 1)_
- **SEC-018** Cover every tenant-scoped model and tenant-aware job in the isolation suites _(Tier 1)_
- **BE-065** Seed a valid tenancy state: an operator, the default tenant and no rows without a tenant
- **BE-066** Build isolation-test fixtures from scratch; never depend on seeded tenants

### Mechanism and clients

- **BE-077** Consume the tenancy mechanism from the vendored package, never from a copied or edited version
- **MOB-025** Never send, filter by or reason about the tenant id on the client
- **MOB-029** Re-register the device push token when the active tenant changes

## Sanctioned patterns

- **The tenant comes from the authenticated user.** Never from a header, a host or a request
  parameter; any other strategy needs its own ADR. A tenant's host may decide only pre-login
  branding and login affinity, and only with the host-mapping option on.
- **Every model whose table has the tenant column uses the tenant scope trait**, with no allowlist
  for a miss. Every table has the tenant column unless it is a declared global table. A sub-tenant
  column needs the model-attached sub-tenant scope or a dated allowlist entry, plus an isolation
  test.
- **Fail closed.** A user without a resolvable tenant who does not bypass sees zero rows (a
  condition that matches nothing, never a `whereNull` match), cannot create, and gets 403 on
  requests. The platform-bypass predicate is defined once, requires a null tenant, and every layer
  calls it; a tenant-bound user never bypasses.
- **Writes.** Middleware that runs first in the API group strips server-owned fields from body,
  query and JSON input, nested keys included. The creating hook stamps the tenant from the acting
  user, else from the pinned context, and throws when an explicit tenant id differs from a
  non-platform user's own. Foreign keys to tenant-scoped tables use the tenant-scoped `exists` rule,
  never a plain `exists:`.
- **Denials.** Across the tenant boundary the answer is 404, so a record's existence is not
  disclosed; inside it, 403. Lists scope silently and totals count own rows only.
- **Background code** pins the tenant, iterates tenants explicitly, or declares cross-tenant access.
  The scope order is: authenticated user, then the pinned context, then a declared cross-tenant
  block, then fail closed.

  ```php
  TenantContext::run($tenantId, fn () => $this->recalculateBalances());

  #[CrossTenant(reason: 'Nightly usage report aggregates every tenant')]
  final class BuildUsageReport implements ShouldQueue
  {
      // ...
  }
  ```

  `TenantContext` stores the pin in Laravel Context: cleared between jobs, carried into jobs
  dispatched under it, and restored in `finally` after nested and synchronous runs. A blank reason
  or a comment-only declaration does not count.

- **Deletion.** Tenant foreign keys restrict on delete and business tenant columns are not nullable;
  deleting a tenant is an explicit offboarding step.
- **Disabled tenants.** One predicate blocks both login and existing tokens with one message, and
  fails closed when the tenant row is missing.
- **Features and caching.** Tenant features are gated by the feature middleware keyed to the feature
  enum, for every tenant user including admins; each feature key used in the route table has a 403
  test. Tenant data is cached only through the helper that prefixes keys with the tenant id.
- **Clients** never send, filter by or reason about the tenant id. Mobile re-registers the push
  token when the active tenant changes.
- **Tests.** Isolation suites ship complete, build their fixtures from scratch and cover every
  tenant-scoped model and tenant-aware job; a skipped or incomplete isolation test fails.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them, and do not describe them as
enforced by a gate. The schema-reading tenancy tests, reflection gates and isolation suites that
will enforce them arrive in later 0.x releases. `enforcement` in
`${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for each ID.

## Decision records

- [ADR 0010][0010]: Opt-in modules declared in the project manifest, installed as whole units
- [ADR 0057][0057]: Tenancy module: model-level scoping verified against the migrated schema, failing closed
- [ADR 0058][0058]: Background contexts pin the tenant or declare cross-tenant access

[0010]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0010-opt-in-modules.md
[0057]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0057-tenancy-module.md
[0058]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0058-background-tenant-context.md
