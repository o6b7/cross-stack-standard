---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Generated API contract: OpenAPI to committed TypeScript types, drift-checked in CI

## Context and Problem Statement

The backend owns the contract ([0012](0012-backend-authority.md)); web and mobile clients need its
types. Hand-maintained TypeScript mirrors of backend enums and resources drift the moment a case or
field is added, and a regex test that compares PHP and TypeScript source catches only the patterns
its author anticipated.

Scramble (dedoc/scramble, MIT, still 0.x) infers an OpenAPI 3.1.0 document from routes,
FormRequests, Resources and backed enums without annotations. `php artisan scramble:export` writes
it, and `--fail-on-unknown` fails the export when a schema would be an unknown type. The export is
byte-identical across runs, but `servers` derives from `APP_URL` when `scramble.servers` is null,
`info.title` from `APP_NAME` unless `scramble.ui.title` is set, and `info.version` from
`API_VERSION`.

How do clients get backend types that cannot silently drift?

## Decision Drivers

- One source of truth: the backend's own code.
- Drift fails CI instead of reaching a release.
- No second HTTP client next to the installed one ([0006](0006-stack-first.md),
  [0007](0007-one-mechanism-per-concern.md)).
- Stable, permissively licensed tools; works for monorepos and split repositories.

## Considered Options

- Scramble export, openapi-typescript types committed and regenerated in CI
- Scramble export, @hey-api/openapi-ts types plus a generated client
- spatie/laravel-typescript-transformer (PHP types to TypeScript, no OpenAPI)
- Hand-maintained mirrors guarded by regex parity tests

## Decision Outcome

Chosen option: "Scramble export, openapi-typescript types committed and regenerated in CI",
because it derives types from the real backend, adds no runtime code, and leaves HTTP to the
client library the project already has.

- **Scope.** This record belongs to the `api-contract` module ([0010](0010-opt-in-modules.md),
  [0011](0011-default-module-set.md)) and applies only when the module is on. The export applies
  to the Laravel track; the generated types apply to each web or mobile client of that API, in the
  same repository or, in a client-only repository that switches the module on, from the published
  document. A client of an API that publishes no OpenAPI document is outside this record.
- **Export.** The backend runs `php artisan scramble:export --fail-on-unknown`. The published
  Scramble config sets literal `servers`, `info.version` and `ui.title`, so the document does not
  depend on the environment.
- **Types.** openapi-typescript generates runtime-free types, committed on the client. CI exports
  the document, regenerates the types and fails when `git diff --exit-code` shows a difference.
- **Split repositories.** A backend-only repository publishes the exported document as a versioned
  artifact; a standalone client pins that version and regenerates from it in CI.
- **Use.** Clients render contract types directly. A page that needs a view-model keeps the raw API
  row for anything editable, and `any`-typed bridges are banned
  ([0060](0060-javascript-lint-baseline.md)).
- **Replaces** hand-maintained TypeScript enum mirrors and their regex parity tests; enum values on
  the wire follow [0046](0046-enums-on-the-wire.md).
- spatie/laravel-typescript-transformer is documented as the lightweight, enums-only option for a
  project that does not export OpenAPI.
- Open check: openapi-typescript declares a `typescript ^5.x` peer, and the mobile track uses
  TypeScript 6.0 ([0059](0059-javascript-toolchain-pins.md)). If installation fails there, generation
  runs with a pinned compatible TypeScript, or @hey-api/openapi-ts is used at an exact version.

### Consequences

- Good, because adding a field or enum case on the backend changes the client types in the same
  pull request, or CI fails.
- Good, because the types cost nothing at runtime and compete with no installed library.
- Bad, because Scramble is pre-1.0; its inference changes between releases, so it is pinned exactly
  and upgraded deliberately.
- Bad, because inference has limits: `--fail-on-unknown` stops the export until the code, or a
  type hint, makes the shape explicit.
- Bad, because in a monorepo the client's CI job needs PHP to export the document.
- Bad, because problem-details error bodies need a Scramble extension
  ([0053](0053-rfc-9457-problem-details.md)).

### Confirmation

- In a repository holding backend and client, a CI job exports the document, regenerates the types
  and runs `git diff --exit-code`. FORCED.
- A standalone client's CI regenerates from the pinned artifact and diffs. GUARDED, because a stale
  pin passes until someone moves it.
- A client check flags type declarations or string-literal unions whose name or value set equals a
  generated schema or enum. GUARDED once the check exists, because it matches by name and value;
  until then the rule is REVIEW.
- View-models keeping the raw row: REVIEW.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Scramble export, openapi-typescript types committed and regenerated in CI

- Good, because both are MIT, and openapi-typescript is a stable 7.x generator of types only.
- Bad, because it declares a TypeScript 5 peer range (see the open check above).

### Scramble export, @hey-api/openapi-ts types plus a generated client

- Good, because it generates a typed SDK as well as types.
- Bad, because the generated client competes with the installed HTTP and server-state libraries.
- Bad, because it is pre-1.0, shipped ten minor versions in 2026, asks to be pinned exactly, and
  requires Node 22.18 or later, above the Standard's floor.

### spatie/laravel-typescript-transformer (PHP types to TypeScript, no OpenAPI)

- Good, because it is small and turns PHP backed enums into TypeScript unions directly.
- Bad, because it does not describe endpoints, requests or Resources, so most of the contract stays
  hand-written.

### Hand-maintained mirrors guarded by regex parity tests

- Good, because there is no tooling.
- Bad, because drift is the normal state and regex parity tests miss what they do not anticipate.

## More Information

- Scramble: <https://scramble.dedoc.co/> and export: <https://scramble.dedoc.co/usage/export>.
- openapi-typescript: <https://openapi-ts.dev/>; @hey-api/openapi-ts:
  <https://heyapi.dev/openapi-ts/get-started>; spatie/laravel-typescript-transformer:
  <https://github.com/spatie/laravel-typescript-transformer>.
- Versions, peers and the export's determinism are recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0012](0012-backend-authority.md), [0046](0046-enums-on-the-wire.md),
  [0052](0052-api-success-shape.md), [0053](0053-rfc-9457-problem-details.md).
- Governs: the shared API-contract drift rules in CI and the web and mobile rules on using contract
  types.
