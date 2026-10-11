---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Background job conventions: queue slow work, pass identifiers, declare a retry policy

## Context and Problem Statement

Sending mail, calling third-party APIs, generating exports and processing files are slow and fail
for reasons outside the application's control. Done inside a request, they make responses slow and
turn a provider outage into a user-facing error. Laravel's queue moves that work to workers, but
its defaults are deliberately minimal: a job is attempted once, the timeout is 60 seconds unless
configured, and failed jobs accumulate in the `failed_jobs` table until pruned.

Common defects follow. A job reads `auth()` or `request()` and gets nothing, because a worker has
no request or session. A retried job sends the same email twice or charges twice. A job fails
permanently and the user who was waiting for its result is never told.

What must every queued class declare and guarantee?

## Decision Drivers

- Requests stay fast and survive provider outages.
- A retry must be safe, because the queue will retry.
- Failures are visible to operators and to the affected user.
- Gates can check jobs by reflection, which needs declarations on the class itself.

## Considered Options

- Queue slow work, pass identifiers, declare a retry policy and make retries safe
- Rely on framework defaults and worker flags, with review
- Run slow work synchronously in the request

## Decision Outcome

Chosen option: "Queue slow work, pass identifiers, declare a retry policy and make retries safe",
because each part closes a failure mode that the defaults leave open, and most parts are checkable
by reflection.

- **Queue it.** Slow or failure-prone work is queued, including mailables and notifications, which
  implement `ShouldQueue`.
- **Identifiers only.** Queued classes receive identifiers. An Eloquent model counts, because the
  queue serializes it as its identifier and re-retrieves it. They never receive the `Request`, an
  authenticated user taken from the guard, or a closure; the acting user travels as an id.
- **Declared policy.** Every job and queued listener declares, on itself, `tries` or
  `retryUntil()`, a backoff and a timeout (Laravel 13's `#[Tries]`, `#[Backoff]` and `#[Timeout]`
  attributes, or the equivalent properties and methods). The timeout stays below the connection's
  `retry_after`.
- **Safe to retry.** Jobs are idempotent, re-read and guard on current state before acting,
  deduplicate side effects (`ShouldBeUnique`, `WithoutOverlapping` or idempotency keys), and fail
  fast on permanent errors (`$this->fail()`, or `dontRetry()` in `withExceptions()`).
- **Failures.** `queue:prune-failed` runs on a schedule, and failed jobs are triaged as a
  dead-letter queue: retried, fixed or discarded deliberately.
- **Owed results.** When a job owes a user or tenant a result, its `failed()` method surfaces the
  failure to them, by notification or by a visible failed state.
- Tenant context in jobs follows [0058](0058-background-tenant-context.md); a multi-step write run
  from both HTTP and the queue is an Action ([0041](0041-action-pattern.md)); job logs follow
  [0088](0088-structured-redacted-logging.md).

### Consequences

- Good, because requests no longer wait on providers, and transient outages are absorbed by retries.
- Good, because retries cannot duplicate side effects, and permanent errors stop wasting attempts.
- Good, because users learn about failures that concern them.
- Bad, because every job carries a few lines of policy, even when the defaults would do.
- Bad, because queued mail and notifications need a running worker in every environment; tests use
  the framework's fakes.
- Bad, because job timeouts need the PCNTL extension on the worker host.

### Confirmation

- A Pest arch test asserts that mailables and notifications implement `ShouldQueue`. GUARDED,
  because slow work called directly from a controller is not detected.
- Reflection over queued-class constructors rejects parameters typed as `Request`,
  `Authenticatable` or `Closure`. GUARDED, because an untyped parameter evades it; the Larastan
  levels the Standard sets report missing parameter types
  ([0038](0038-larastan-levels-shrink-only-baseline.md)).
- Reflection asserts that every job and queued listener declares `tries` or `retryUntil()`, a
  backoff and a timeout on itself. FORCED.
- A test inspects the scheduler for `queue:prune-failed` whenever queued classes exist. GUARDED.
- Reflection asserts that queued classes declare `failed()`, with an allowlist entry for classes
  that owe nobody a result ([0005](0005-explicit-exceptions.md)). GUARDED.
- Retry safety: REVIEW, against the checklist above.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Queue slow work, pass identifiers, declare a retry policy and make retries safe

- Good, because failure handling is explicit and uniform, and reflection can check it.
- Bad, because it adds declarations to every job.

### Rely on framework defaults and worker flags, with review

- Good, because nothing is added per class.
- Bad, because a single attempt and worker-wide flags fit no job exactly, and nothing makes retries
  safe or failures visible.

### Run slow work synchronously in the request

- Good, because the result is immediate and there is no worker to run.
- Bad, because latency and provider outages land directly on users.

## More Information

- Laravel queues: attempts and timeouts
  <https://laravel.com/docs/13.x/queues#max-job-attempts-and-timeout>, stopping retries
  <https://laravel.com/docs/13.x/queues#stopping-retries-by-exception>, unique jobs
  <https://laravel.com/docs/13.x/queues#unique-jobs>, failed jobs
  <https://laravel.com/docs/13.x/queues#dealing-with-failed-jobs> and pruning
  <https://laravel.com/docs/13.x/queues#pruning-failed-jobs>.
- Queued mail and notifications: <https://laravel.com/docs/13.x/mail#queueing-mail>,
  <https://laravel.com/docs/13.x/notifications#queueing-notifications>.
- Related: [0041](0041-action-pattern.md), [0058](0058-background-tenant-context.md),
  [0088](0088-structured-redacted-logging.md).
- Governs: the Laravel background-job rules.
