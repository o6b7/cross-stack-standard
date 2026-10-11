---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Background contexts pin the tenant or declare cross-tenant access

## Context and Problem Statement

The tenant scope ([0057](0057-tenancy-module.md)) takes the tenant from the authenticated user.
Queued jobs, console commands, scheduled tasks and webhook handlers have no authenticated user, so
a scope that simply does nothing without a user reads across every tenant in exactly the code that
runs unattended.

Two defects are common. A tenant pin kept in a static property survives from one job to the next in
a long-running worker, and if only the creating hook reads it, reads stay unscoped anyway. And a
cross-tenant declaration written as a comment cannot be verified: a gate that strips comments
before matching never sees it, and a gate that reads comments accepts any text.

Laravel Context provides the pieces for a safer pin. Its repository is a scoped container binding,
and the queue worker forgets scoped instances between jobs. Context present at dispatch is
dehydrated into the job payload and hydrated back when the job starts processing.

How does background code touch tenant-scoped models safely?

## Decision Drivers

- Unscoped background reads fail closed.
- A pin cannot leak from one job to the next.
- Deliberate cross-tenant work is declared in a form a gate can read, with a reason.
- The pin follows work from the request into the jobs it dispatches.

## Considered Options

- A `TenantContext` backed by Laravel Context, failing closed, with an attribute for cross-tenant
  code
- A static process-wide tenant pin
- A comment marker declaring cross-tenant access
- Passing the tenant id to each job and scoping by hand in `handle()`

## Decision Outcome

Chosen option: "A `TenantContext` backed by Laravel Context, failing closed, with an attribute for
cross-tenant code", because the framework resets and propagates the pin, and the declaration is
structured data a reflection gate can verify.

- **Rule.** Background code that touches tenant-scoped models pins the tenant, iterates tenants
  explicitly, or declares cross-tenant access.
- **The pin.** `TenantContext` stores the tenant in Laravel Context: cleared between jobs by the
  worker, carried into the payload of jobs dispatched under it, restored when they are processed.
- **Scope order.** Authenticated user, then the pinned context, then a declared cross-tenant block,
  then fail closed in background contexts. The only unconditional pass-through is the
  authentication lookup that resolves a token to its user. The creating hook stamps the tenant from
  the context and throws in a background context with no pin.
- **Nesting.** `TenantContext::run($tenantId, $callback)` and `crossTenant($reason, $callback)`
  restore the previous value in `finally`, which covers seeders, commands, nested code and jobs run
  on the sync driver or with `dispatchSync`.
- **Declaration.** Cross-tenant access is declared with `#[CrossTenant(reason: '...')]`. The gate
  reads it by reflection over every concrete queued class (jobs, listeners, mailables,
  notifications); a blank reason fails, and a comment-only declaration fails.

### Consequences

- Good, because a forgotten pin fails loudly instead of reading every tenant's rows.
- Good, because the worker, not project code, clears the pin between jobs.
- Good, because every cross-tenant operation carries a stated reason that review can challenge.
- Bad, because commands and seeders must wrap tenant work in `run()` or `crossTenant()`.
- Bad, because the scope depends on the Context API; a framework change there is re-verified by the
  tests below on every upgrade.

### Confirmation

- A reflection test over every concrete queued class asserts the tenant-aware middleware or trait,
  or a `#[CrossTenant]` attribute with a non-blank reason. FORCED
  ([0037](0037-phpstan-rules-and-reflection-tests.md)).
- Behavioural tests, shipped complete: pinned reads are scoped; an unpinned background read fails
  closed; a worker processing a job for tenant A and then one for tenant B does not carry the pin
  over; a job dispatched under a pin inherits it; the previous value is restored after a throw.
  GUARDED, because they prove the mechanism, not every job's use of it.
- The background isolation suite covers every tenant-aware queued class (set equality between the
  classes found by reflection and the suite's dataset). GUARDED.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### A `TenantContext` backed by Laravel Context, failing closed, with an attribute for cross-tenant code

- Good, because reset and propagation come from the framework and are testable.
- Bad, because nested and synchronous execution need the explicit restore in `finally`.

### A static process-wide tenant pin

- Good, because it is one line.
- Bad, because it leaks across jobs in a long-running worker unless every path resets it.

### A comment marker declaring cross-tenant access

- Good, because it is easy to write.
- Bad, because a gate cannot tell a real declaration from any other comment, and one that strips
  comments never sees it.

### Passing the tenant id to each job and scoping by hand in `handle()`

- Good, because each job is explicit.
- Bad, because every query in the job must remember the clause, which is the defect the global scope
  exists to prevent.

## More Information

- Laravel Context: <https://laravel.com/docs/13.x/context>, including
  <https://laravel.com/docs/13.x/context#dehydrating> and
  <https://laravel.com/docs/13.x/context#hydrated>.
- Framework source (v13.33.0): the scoped binding and the payload hooks in
  <https://github.com/laravel/framework/blob/v13.33.0/src/Illuminate/Log/Context/ContextServiceProvider.php>;
  the worker's reset between jobs in
  <https://github.com/laravel/framework/blob/v13.33.0/src/Illuminate/Queue/QueueServiceProvider.php>.
- Related: [0037](0037-phpstan-rules-and-reflection-tests.md), [0055](0055-background-jobs.md),
  [0057](0057-tenancy-module.md).
- Governs: the tenancy module's background-context rules.
