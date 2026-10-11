---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Errors as RFC 9457 problem details with an errors extension for validation

## Context and Problem Statement

Clients need error bodies they can act on: which field failed, why a request was refused, and
which message to show in the user's language. Laravel's default JSON errors are `{message}`, plus
an `errors` map of field to messages on a 422, under `application/json`. That keeps per-field
errors but gives no machine-readable cause beyond the status code, so two different 403 causes
look the same to a client. A common defect in fixed envelopes goes further: validation is
flattened into one sentence, and dotted keys such as `items.3.value` are lost, which makes bulk
row editing impossible to report per field.

RFC 9457 (July 2023, obsoletes RFC 7807) defines `application/problem+json` with the members
`type` (a URI reference, default `about:blank`), `title`, `status`, `detail` and `instance`. Problem
types may define extension members, and clients must ignore extensions they do not recognize. The
RFC's own validation example uses an `errors` array of `{detail, pointer}` objects. Laravel has no
first-party problem-details renderer; `withExceptions()` in `bootstrap/app.php` provides the hooks.

Which error format does the api-contract module mandate, and how do existing Laravel-style clients
keep working?

## Decision Drivers

- Forms map server validation errors onto their fields ([0067](0067-forms.md)).
- Clients that read Laravel's `errors` map keep working.
- Clients get a machine-readable cause to key localized copy on ([0077](0077-i18n-module.md)).
- A 500 never reveals exception messages, classes or traces.
- An error body never tells a caller whether an account exists.

## Considered Options

- RFC 9457 with Laravel's field-to-messages map as the `errors` extension on 422
- RFC 9457 with the RFC example's `errors` array of `{detail, pointer}`
- Laravel's default JSON error bodies
- A fixed envelope with one flattened message and no `errors` key

## Decision Outcome

Chosen option: "RFC 9457 with Laravel's field-to-messages map as the `errors` extension on 422",
because it adopts the standard media type and a machine-readable `type` while keeping the exact
`errors` map Laravel clients and form libraries already consume.

- Every API exception renders `application/problem+json` with `type`, `title` and `status`, plus
  `detail` and `instance` where they carry information.
- A 422 adds `errors`: Laravel's map of dotted field paths to message arrays, unchanged.
- One central map in `withExceptions()->render()` covers validation (422), authentication (401),
  authorization (403), not found (404), method not allowed (405), throttling (429), other HTTP
  exceptions (their own status) and everything else (500 with a generic `detail`). Status choices
  follow [0048](0048-http-status-vocabulary.md).
- Problem `type` URIs are stable identifiers per cause. Clients key localized copy by `type` and
  fall back to `detail`.
- **Login failures are indistinguishable.** An unknown identity and a wrong password return the
  same status, `type` and `detail`, so the error body cannot be used to enumerate accounts.
- **Two properties hold without the module.** A Laravel API with api-contract off still hides
  exception messages, classes and traces when debug is off, and still answers both login failures
  with the same status and body; only the problem-details format depends on the module.
- The renderer is hand-written, because the framework ships none and no Laravel package dominates;
  a project that already has a problem-details library installed uses it
  ([0006](0006-stack-first.md)).
- Scramble documents a 422 as `{message, errors}` under `application/json` by default. Describing
  problem details in the generated OpenAPI document needs a Scramble extension; that spike runs
  before this shape is committed to the generated contract ([0054](0054-generated-api-contract.md)).

### Consequences

- Good, because per-field errors reach forms, including nested and array fields.
- Good, because clients branch on `type` instead of parsing message text.
- Good, because generic RFC 9457 tooling reads the standard members, and ignores the extension as
  the RFC requires.
- Bad, because the `errors` member differs from the RFC's example array, so tooling that expects
  JSON Pointers gets no per-field detail from it.
- Bad, because the renderer is project code the kit must ship, test and keep in step with new
  exception types.
- Bad, because clients must accept `application/problem+json` and parse bodies by content type.

### Confirmation

- A renderer test raises each mapped exception through an API route and asserts the content type,
  `type`, `title` and `status`, the `errors` member on 422 and the status code. GUARDED, because an
  exception type outside the map is caught only by the generic 500 case.
- A contract test proves an unknown user and a wrong password receive the same status, `type` and
  `detail` on login. FORCED.
- With the bff-auth module, errors the BFF fabricates itself use the same format (vitest). GUARDED.
- On mobile, a table-driven test maps a problem body for each configured status, and the 422
  `errors` member, to typed error kinds. GUARDED.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### RFC 9457 with Laravel's field-to-messages map as the `errors` extension on 422

- Good, because it is standard where it matters and compatible where clients already depend on it.
- Bad, because the extension is specific to this problem type and must be documented.

### RFC 9457 with the RFC example's `errors` array of `{detail, pointer}`

- Good, because it follows the RFC's example literally and points at fields with JSON Pointers.
- Bad, because every Laravel-style client and form mapping must be rewritten.

### Laravel's default JSON error bodies

- Good, because nothing needs to be written.
- Bad, because there is no machine-readable cause and no standard media type.

### A fixed envelope with one flattened message and no `errors` key

- Good, because one string is simple to display.
- Bad, because per-field mapping becomes impossible and the cause is lost.

## More Information

- RFC 9457: <https://www.rfc-editor.org/rfc/rfc9457.html> (members in §3.1, extensions in §3.2).
- Laravel exception rendering: <https://laravel.com/docs/13.x/errors#rendering-exceptions>;
  validation error format:
  <https://laravel.com/docs/13.x/validation#validation-error-response-format>.
- The absence of a first-party renderer and the candidate packages (crell/api-problem is the most
  downloaded framework-agnostic one) are recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0048](0048-http-status-vocabulary.md), [0052](0052-api-success-shape.md),
  [0054](0054-generated-api-contract.md), [0067](0067-forms.md), [0077](0077-i18n-module.md).
- Governs: the api-contract module's error-format rules on Laravel, the core Laravel rules that
  keep exception internals out of error responses and make login failures indistinguishable, the
  bff-auth error rule and the mobile error-mapping rule.
