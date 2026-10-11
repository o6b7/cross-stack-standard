---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# API success shape: Resource by default, a documented envelope as an option, never double-wrapped

## Context and Problem Statement

Web, mobile and generated types ([0054](0054-generated-api-contract.md)) all depend on one
predictable shape for successful JSON responses. Laravel's API Resources already define one: a
single resource is wrapped in `data`, and a paginated collection is always `{data, links, meta}`,
even after `JsonResource::withoutWrapping()`. The framework does not double-wrap a resource whose
`toArray()` already returns a `data` key, unless the resource sets `$forceWrapping`.

Hand-built envelopes around Resources are where the shape breaks. Reproduced on Laravel 13.33.0:
placing a paginated resource collection inside `response()->json([...])` silently drops `links` and
`meta`; embedding `->response()->getData(true)` produces `data.data`. A fixed envelope on success
and failure also repeats the HTTP status in a boolean flag and, with no `errors` key, discards the
per-field validation errors that FormRequests produce. Some teams still want a `message` next to
every success payload.

Which success shape does the api-contract module mandate, and how is an envelope offered without
reintroducing those defects?

## Decision Drivers

- Every wire shape has one definition, the Resource ([0045](0045-resources-only-serialization.md)).
- Pagination metadata survives, and `data.data` cannot occur.
- The documentation generator describes the shape without extensions.
- Errors are a separate contract ([0053](0053-rfc-9457-problem-details.md)).

## Considered Options

- `resource` by default; an opt-in `{data, message}` envelope built with `additional()`
- A fixed three-key envelope (success flag, data, message) on success and failure, no `errors` key
- Laravel 13 JSON:API resources as a third mode
- Unwrapped resources (`withoutWrapping()`) as the default

## Decision Outcome

Chosen option: "`resource` by default; an opt-in `{data, message}` envelope built with
`additional()`", because the default is the framework's own shape with no custom serialization, and
the envelope is built through the one API that keeps pagination metadata.

- **`resource` (default).** Responses are API Resources as the framework serializes them: `{data}`
  for one resource, `{data, links, meta}` for a paginated collection. No ad-hoc top-level keys and
  no `data.data`. A delete answers 204 No Content.
- **`envelope` (opt-in).** A `{data, message}`-style body built with
  `$resource->additional(['message' => ...])`; a paginated body becomes
  `{data, links, meta, message}`. Deletes return an envelope body. An envelope is never built by
  nesting a resource inside `response()->json()`.
- **Setting.** The mode is the api-contract module's `shape` option in the manifest, default
  `resource`; `"modules": {"api-contract": {"enabled": true, "shape": "envelope"}}` selects the
  envelope. The manifest schema gains the option with the api-contract templates
  ([0023](0023-adopter-manifest-and-upgrade.md)).
- **Both modes.** A contract test asserts that nothing is double-wrapped and that paginated
  endpoints carry `links` and `meta`. Errors follow [0053](0053-rfc-9457-problem-details.md) in
  either mode.
- **JSON:API.** Laravel 13's `JsonApiResource` (`make:resource --json-api`, media type
  `application/vnd.api+json`) is documented as an option a project may choose by its own ADR. It is
  not a mode of the module.

### Consequences

- Good, because the default needs no response code at all, and Scramble documents it as is.
- Good, because clients read one shape and generated types match it.
- Good, because teams that want a success message get one without a hand-built wrapper.
- Bad, because the mode is a project-wide contract: switching later breaks every client.
- Bad, because an envelope `message` is presentation text on the wire, which needs the i18n module
  when more than one locale is served ([0077](0077-i18n-module.md)).

### Confirmation

- Contract test in the Feature suite: a listener on handled requests checks every 2xx JSON body for
  top-level keys within the configured shape, `links` and `meta` on paginated bodies, and no
  `data.data`. GUARDED, because it sees only the responses the suite exercises.
- A custom PHPStan rule reports the `response()` helper, the `Response` facade and
  `new JsonResponse` outside the configured response emitter and the exception renderer. FORCED
  ([0037](0037-phpstan-rules-and-reflection-tests.md)).
- Reflection over controller actions: each declares a return type from the mode's allowed set, and
  Larastan proves the returns match. FORCED.
- On mobile, a lint rule bans `.data.data` member chains outside the API client module. GUARDED,
  because aliasing evades it.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### `resource` by default; an opt-in `{data, message}` envelope built with `additional()`

- Good, because the default is the framework's shape and the envelope keeps `links` and `meta`.
- Bad, because the kit maintains two modes in its contract test and client templates.

### A fixed three-key envelope (success flag, data, message) on success and failure, no `errors` key

- Good, because every body looks alike.
- Bad, because the flag duplicates the HTTP status, pagination ends up nested inside `data`, and
  without an `errors` key forms cannot map server errors onto fields
  ([0067](0067-forms.md)).

### Laravel 13 JSON:API resources as a third mode

- Good, because JSON:API is a published specification with a first-party implementation.
- Bad, because it brings its own media type, error objects and query conventions; a third mode
  multiplies contract tests and client paths for a minority need.

### Unwrapped resources (`withoutWrapping()`) as the default

- Good, because single resources lose one level of nesting.
- Bad, because paginated collections stay wrapped, so singles and lists differ in shape.

## More Information

- Resource wrapping and pagination: <https://laravel.com/docs/13.x/eloquent-resources#data-wrapping>;
  `additional()`:
  <https://laravel.com/docs/13.x/eloquent-resources#adding-meta-data-when-constructing-resources>;
  JSON:API resources: <https://laravel.com/docs/13.x/eloquent-resources#jsonapi-resources>.
- The wrapping behaviour and the reproduced envelope defects are recorded with their sources in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0023](0023-adopter-manifest-and-upgrade.md) (the `shape` option),
  [0045](0045-resources-only-serialization.md), [0053](0053-rfc-9457-problem-details.md),
  [0054](0054-generated-api-contract.md).
- Governs: the api-contract module's success-shape and response-construction rules on Laravel, and
  the mobile API-client unwrapping rule.
