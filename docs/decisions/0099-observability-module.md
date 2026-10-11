---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Observability module: error tracking across stacks with request ids and personal-data scrubbing

## Context and Problem Statement

Without error tracking, production failures reach a team as user reports. Adding a tracking SDK
naively creates new problems. Report calls spread into every `catch` block, so reporting behaves
differently in each feature. Personal data (request bodies, cookies, user identifiers) is sent to
a third-party service by default settings or by a careless `extra` payload. And a failure on the
web or mobile client cannot be connected to the API request, or to the queued job, that caused it.

A common defect is direct SDK calls scattered through application code, with default data capture
left on and no identifier shared between the client, the backend-for-frontend and the API.

How does an optional module add error tracking across the Laravel, web and mobile tracks without
these defects?

## Decision Drivers

- One reporting path per application.
- Personal-data capture is off unless a project turns it on deliberately.
- One user action can be followed through client, backend-for-frontend, API and jobs.
- Sending data to a third party is opt-in ([0010](0010-opt-in-modules.md)).
- An error tracker the project already uses wins ([0006](0006-stack-first.md)).

## Considered Options

- An opt-in module wired through the logger module and the central exception funnel
- Direct SDK use wherever an error is caught
- Structured logs only, no error tracker

## Decision Outcome

Chosen option: "An opt-in module wired through the logger module and the central exception funnel",
because it gives one reporting path per application and puts the privacy settings in one reviewed
place.

- **Module.** `observability`, off under the proposed default set
  ([0011](0011-default-module-set.md)). Sentry is the worked example: `sentry/sentry-laravel`
  4.28.0, `@sentry/nextjs` 11.0.0 and `@sentry/react-native` 8.28.0 are the current releases at the
  time of writing.
- **Wiring.** The SDK is imported only by the logger module
  ([0088](0088-structured-redacted-logging.md)) and by the central exception funnel: Laravel's
  `withExceptions()` configuration, the framework's instrumentation files on Next.js, and the root
  error boundary on React Native.
- **Personal data.** The SDK's default personal-data capture stays off (`send_default_pii` in the
  Laravel configuration, `sendDefaultPii` in the JavaScript SDKs). A before-send hook removes
  authorization headers, cookies and the configured personal-data fields. Every event carries the
  environment, the release and the request id.
- **Request id.** Adopted from the incoming request-id header at the edge when it is well formed
  (bounded length and character set, because it lands in logs), otherwise generated. It is bound
  to the log context (Laravel `Context` on the backend, so queued jobs inherit it), echoed on the
  response, and forwarded on every upstream call by the backend-for-frontend and the clients
  ([0073](0073-bff-auth-module.md)).
- **SDK majors.** A new major is reviewed before the module targets it; `@sentry/nextjs` 11.0.0
  appeared on 2026-09-23, while the 10.x line was still maintained.
- **Scope.** A post-1.0 candidate: implemented if time permits before 1.0, otherwise tracked on
  the roadmap.

### Consequences

- Good, because errors reach the team with enough context to act, and one id links client, API
  and job.
- Good, because the privacy settings sit in one module and one configuration file.
- Bad, because a third-party service receives error data; the module is opt-in for that reason.
- Bad, because the scrubbing list must be kept current as new personal-data fields appear.
- Bad, because SDK majors arrive often and need review before each move.

### Confirmation

If implemented, the module's rules enter the registry as REVIEW and move up with clean and
violation fixtures ([0004](0004-fail-then-pass.md)): an architecture test and an import-boundary
lint rule that allow the SDK only in the logger module and the exception funnel; a configuration
test that default personal-data capture is off; a feature test that a request without the header
gets an id that is echoed and present in the log context; and a unit test that the
backend-for-frontend forwards it upstream. Scrubbing completeness is Review. Until then this record
is a proposal.

## Pros and Cons of the Options

### An opt-in module wired through the logger module and the central exception funnel

- Good, because reporting, privacy and correlation each have one home.
- Bad, because it needs module plumbing on three stacks.

### Direct SDK use wherever an error is caught

- Good, because it is quick to add.
- Bad, because reporting and data capture differ from one call site to the next.

### Structured logs only, no error tracker

- Good, because no data leaves the project's own infrastructure.
- Bad, because nobody is alerted, and client-side failures are not collected at all.

## More Information

- Sentry: <https://docs.sentry.io/>; Laravel: <https://docs.sentry.io/platforms/php/guides/laravel/>;
  Next.js: <https://docs.sentry.io/platforms/javascript/guides/nextjs/>; React Native:
  <https://docs.sentry.io/platforms/react-native/>.
- Laravel Context: <https://laravel.com/docs/13.x/context>; error handling:
  <https://laravel.com/docs/13.x/errors>.
- SDK versions: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0010](0010-opt-in-modules.md), [0011](0011-default-module-set.md),
  [0058](0058-background-tenant-context.md) (the same context carries the tenant into jobs),
  [0088](0088-structured-redacted-logging.md).
- Governs: the observability module's rules on the laravel, web and mobile tracks (reporting path,
  personal-data capture, request-id propagation).
