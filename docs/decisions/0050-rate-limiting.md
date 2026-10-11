---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Every unauthenticated and every mutating API route is rate-limited

## Context and Problem Statement

Unauthenticated routes (login, registration, password reset, public reads) are open to credential
stuffing, enumeration and scraping. Mutating routes, even authenticated ones, are where a runaway
client or a stolen token does the most damage per request. Laravel provides named rate limiters and
the `throttle` middleware, and answers an exceeded limit with 429 and a `Retry-After` header, but
applies nothing by default: on Laravel 13 the stock `api` middleware group contains only
`SubstituteBindings`.

Checking for limits is also easy to get wrong. A common defect is a check that matches middleware
names on the route definition: it cannot see a limiter attached to a route group, which forces
needless exceptions, and any alias that merely starts with `throttle` satisfies it.

Which API routes must be rate-limited, how strictly, and how is that verified?

## Considered Options

- Throttle every unauthenticated and every mutating route, with strict limits on credential routes
- Throttle only the login route
- One global limit on the whole API group
- Rate limiting at the proxy or gateway only

## Decision Outcome

Chosen option: "Throttle every unauthenticated and every mutating route, with strict limits on
credential routes", because it covers the routes attackers and faulty clients actually hit, stays
inside the application where the gates can prove it, and uses the framework's own limiter.

- **Unauthenticated API routes** carry a `throttle` middleware backed by a named limiter.
- **Mutating authenticated routes** (`POST`, `PUT`, `PATCH`, `DELETE`) carry one too, typically
  keyed by the user.
- **Credential routes** (login, password change and password reset) use strict limits, capped at a
  configured number of attempts per minute (for example keyed by the submitted identity and the
  client address).
- **Responses.** A throttled request is a 429 problem-details response
  ([0048](0048-http-status-vocabulary.md), [0053](0053-rfc-9457-problem-details.md)). The exception
  renderer keeps the headers the framework's throttle exception carries, so `Retry-After` reaches
  the client; a renderer that builds a fresh response without them drops it.
- **Exceptions** (for example a webhook endpoint protected by a signature instead) are allowlist
  entries with a reason and an expiry date ([0005](0005-explicit-exceptions.md)).

### Consequences

- Good, because brute-force and enumeration attempts are slowed on every open route.
- Good, because clients receive a standard 429 with a retry delay they can honour.
- Good, because the check sees limits applied at the group level as well as per route.
- Bad, because limits need tuning per deployment; limiters are named so that tuning is a
  configuration change, not a route change.
- Bad, because enabling the mutating-route check on an existing API can fail many routes at once;
  it is configurable so that brownfield projects can add limits before switching it on.

### Confirmation

- A Pest test resolves the full middleware stack of every API route (global middleware plus the
  route's gathered middleware with groups expanded) and requires a middleware derived from the
  framework's `ThrottleRequests` on every route without authentication; exceptions come from the
  allowlist: FORCED ([0037](0037-phpstan-rules-and-reflection-tests.md)).
- The same resolved-stack check applies to every mutating authenticated route: FORCED once enabled.
- A test resolves the named limiters on the configured credential routes and asserts the maximum
  attempts per minute are at or below the configured cap: GUARDED, because a limiter's key and
  response callback are not inspected.
- With the api-contract module, the renderer test raises a throttle exception and asserts a 429
  problem response that keeps `Retry-After` ([0053](0053-rfc-9457-problem-details.md)).

## Pros and Cons of the Options

### Throttle every unauthenticated and every mutating route, with strict limits on credential routes

- Good, because protection follows risk, and the framework's limiter does the work.
- Bad, because there are several limiters to name and tune.

### Throttle only the login route

- Good, because it is the smallest change.
- Bad, because registration, password reset and public reads stay open to automation.

### One global limit on the whole API group

- Good, because one line covers every route.
- Bad, because a limit loose enough for reads is too loose for credentials, and one strict enough for
  credentials breaks normal use.

### Rate limiting at the proxy or gateway only

- Good, because abusive traffic is stopped before it reaches the application.
- Bad, because the application cannot prove the limit exists, and per-user or per-identity keys are
  hard to express there. It is a useful additional layer, not a replacement.

## More Information

- Laravel route rate limiting and the `throttle` middleware:
  <https://laravel.com/docs/13.x/routing#rate-limiting>; the rate limiter itself:
  <https://laravel.com/docs/13.x/rate-limiting>.
- Default middleware groups: <https://laravel.com/docs/13.x/middleware#laravels-default-middleware-groups>.
- RFC 6585 §4, 429 Too Many Requests and `Retry-After`:
  <https://www.rfc-editor.org/rfc/rfc6585.html#section-4>.
- Related: [0037](0037-phpstan-rules-and-reflection-tests.md), [0048](0048-http-status-vocabulary.md),
  [0053](0053-rfc-9457-problem-details.md).
- Governs: the security rules on rate-limiting unauthenticated, mutating and credential routes.
