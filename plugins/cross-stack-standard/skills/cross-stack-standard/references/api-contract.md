# API contract

The shape of the wire between a Laravel API and its web and mobile clients: one success shape, RFC
9457 problem details for errors, one status vocabulary, and client types generated from the exported
OpenAPI document. The `api-contract` module holds most of these rules; it is on by default when the
tracks include `laravel` ([ADR 0011][0011]). Rules marked Tier 1 apply to every project with the
module on; the others apply once the project declares Tier 2.

## Rules

### Success shape and errors (Laravel)

- **BE-025** Build JSON responses only through the sanctioned response path; never hand-roll them _(Tier 1)_
- **BE-026** Emit the configured success shape exactly: no ad-hoc top-level keys and no double data wrapping _(Tier 1)_
- **BE-027** Render every API exception as RFC 9457 problem details from one renderer, with errors on 422 _(Tier 1)_
- **BE-028** Use the status vocabulary: 409 for state and concurrency conflicts, 422 only for validation

These hold with or without the module:

- **BE-023** Answer failed logins with one generic problem detail
- **SEC-012** Expose no exception message, class or trace in error responses when debug is off _(Tier 1)_

### Generated contract

- **BE-099** Export the OpenAPI document with `scramble:export --fail-on-unknown` on every CI run _(Tier 1; api-contract module)_
- **CI-017** Publish a backend-only repository's OpenAPI document as a versioned artifact after its export _(Tier 1; api-contract module)_
- **CI-006** Regenerate the client API types from the exported contract in CI and fail on any diff _(Tier 1; api-contract module)_
- **CI-007** Pin the backend's published OpenAPI artifact in a standalone client and fail CI on type drift _(Tier 1; api-contract module)_
- **WEB-018** Use the generated contract types for every wire shape; never redeclare one by hand _(Tier 1; api-contract module)_
- **MOB-019** Take backend resource and enum types from the generated, committed API contract _(Tier 1; api-contract module)_
- **WEB-017** Declare no TypeScript enums
- **WEB-019** Render contract types directly; let a view-model only add display fields and keep the raw row

### Clients reading the wire

- **MOB-016** Normalize API failures in one module; screens never read raw HTTP statuses or bodies
- **MOB-017** Map every error response to a typed app-error kind per the configured format and statuses
- **MOB-018** Unwrap API responses in one typed function inside the API client; no `.data.data` downstream _(api-contract module)_
- **WEB-048** Return RFC 9457 problem details for every error the BFF creates itself _(bff-auth module; next profile)_

## Sanctioned patterns

**Success shape** ([ADR 0052][0052]). The default `resource` shape is what API Resources serialize:
`{data}` for one resource, `{data, links, meta}` for a paginated collection, 204 with no body for a
delete. No ad-hoc top-level keys and no `data.data`. An `envelope` shape (`{data, message}`, built
with `$resource->additional([...])`) is a planned module option: the 0.1.0 manifest schema accepts
only `enabled` for a module, so projects use the `resource` shape until the `shape` option ships.

**Problem details** ([ADR 0053][0053]). Every API exception renders `application/problem+json` with
`type`, `title` and `status`, plus `detail` and `instance` when they carry information, from one
central map in `withExceptions()->render()`:

```json
{
  "type": "https://api.example.com/problems/validation",
  "title": "The given data was invalid.",
  "status": 422,
  "errors": { "items.0.quantity": ["The quantity must be at least 1."] }
}
```

- `errors` appears on 422 only: Laravel's map of dotted field paths to message arrays, unchanged, so
  forms map it straight onto fields.
- `type` URIs are stable per cause; clients key their own localized copy by `type` and fall back to
  `detail`.
- An unknown account and a wrong password produce the same status, `type` and `detail`.
- With debug off, no message, class or trace leaks into any error body.
- The renderer keeps the headers of the framework's throttle exception, so `Retry-After` survives.
- A project with an installed problem-details library uses it instead of hand-writing the renderer.

**Status vocabulary** ([ADR 0048][0048]):

| Status | Meaning                                                                 | Client error kind and action          |
| ------ | ----------------------------------------------------------------------- | ------------------------------------- |
| 400    | Malformed query, such as an unknown filter or sort key                  | Fix the request                       |
| 401    | Not authenticated                                                       | End the session (except login)        |
| 403    | Authenticated but not allowed; with tenancy, inside the caller's tenant | Show a denial                         |
| 404    | Not found; with tenancy, a record in another tenant                     | Show not found                        |
| 409    | Conflict with current state: a refused transition, a concurrent edit    | `conflict`: refresh and retry         |
| 422    | Validation failure only, with field errors                              | Fix the fields                        |
| 429    | Rate limited                                                            | `rateLimited`: wait for `Retry-After` |
| 5xx    | Server failure, no internals in the body                                | Retry later                           |

Automatic retries apply only to network, timeout and server kinds; conflicts and validation failures
are never retried automatically.

**Generated contract** ([ADR 0054][0054]). The backend runs
`php artisan scramble:export --fail-on-unknown`, with literal `servers`, `info.version` and
`ui.title` in the published Scramble config. openapi-typescript turns the document into runtime-free
types committed on each client. In CI the export and the type generation run again, and any change
they leave in the working tree fails the job (`git diff --exit-code`). A
backend-only repository publishes the document as a versioned artifact; a standalone client pins
that version and regenerates from it.

**Using the types.** Wire shapes and enum unions come only from the generated types: no hand-written
interfaces for API data, no TypeScript `enum` declarations. Render contract types directly; a
view-model may only add display fields and keeps the raw row for anything editable. Enum values
arrive as values; labels come from the client's message files.

**Clients.** One module per client normalizes failures into typed error kinds; screens read kinds.
On mobile, one typed function in the API client unwraps responses. With `bff-auth`, errors the BFF
creates itself are problem details too.

## Open checks

Two parts of this module are verified before they are relied on ([ADR 0053][0053],
[ADR 0054][0054]): Scramble documents a 422 as `{message, errors}` under `application/json` by
default, so describing problem details in the exported document needs a Scramble extension; and
openapi-typescript's TypeScript peer range is checked against each client's pinned TypeScript. Treat
both as unknown territory: stop and ask before working around either.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them, and do not describe them as
enforced by a gate. The contract tests, PHPStan rules, lint rules and CI drift jobs that will
enforce them arrive in later 0.x releases. `enforcement` in `${CLAUDE_PLUGIN_ROOT}/data/rules.json`
is authoritative for each ID.

## Decision records

- [ADR 0011][0011]: Default module set
- [ADR 0048][0048]: HTTP status vocabulary
- [ADR 0052][0052]: API success shape: Resource by default, a documented envelope as an option, never double-wrapped
- [ADR 0053][0053]: Errors as RFC 9457 problem details with an errors extension for validation
- [ADR 0054][0054]: Generated API contract: OpenAPI to committed TypeScript types, drift-checked in CI

[0011]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0011-default-module-set.md
[0048]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0048-http-status-vocabulary.md
[0052]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0052-api-success-shape.md
[0053]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0053-rfc-9457-problem-details.md
[0054]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0054-generated-api-contract.md
