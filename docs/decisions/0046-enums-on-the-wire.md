---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Enums: string-backed, value-only on the wire, no presentation data

## Context and Problem Statement

Status, state, type and role values cross every boundary in a full-stack project: database
columns, PHP code, API payloads, web and mobile clients. Left as free strings they drift; as
integer-backed enums they are opaque on the wire. Enums also attract presentation data. A
`color()` method returning a hex value couples the API to one client's palette, cannot follow a
theme or dark mode, and every client still keeps its own copy. Label fields in Resources fix the
wire to one locale. A static `options()` list is often written for an endpoint that never ships,
and a hand-maintained TypeScript union mirrors the PHP enum until the day someone adds a case on
one side only.

How are enums defined on the backend and represented on the wire and in clients?

## Considered Options

- Native string-backed enums, values only on the wire, client unions generated from the contract
- Enums that carry labels and colours in API responses
- Integer-backed enums
- Plain string constants

## Decision Outcome

Chosen option: "Native string-backed enums, values only on the wire, client unions generated from
the contract", because the value is the only part every consumer agrees on, and generation keeps the
clients in step without a second list to maintain.

- **Backend shape.** Enums are native PHP string-backed enums in `App\Enums` (the Pest `laravel`
  preset already confines enums there). Status-like columns are cast to their enum in the model's
  `casts()` method ([0047](0047-model-conventions.md)), and queries compare against enum cases,
  never string literals.
- **Backing values are contract.** Renaming a backing value is a breaking API change.
- **`label()`** serves server-rendered output only (mail, notifications, exports) through the
  translator. The API never emits labels; clients render them from their own message files
  ([0078](0078-labels-and-multilingual-content.md)).
- **Domain statics** name groupings once on the enum (for example the set of terminal states), so
  services and queries do not repeat the list.
- **No presentation on enums.** No `color()` returning hex, and no other styling data. The API
  emits the semantic state; each client maps state to a design token in one per-domain module
  ([0066](0066-design-tokens.md)). Colours that users configure (brand colours) are data, stored and
  served as data, and are exempt.
- **`options()`** exists only when an endpoint serves it.
- **Client types** come from the generated contract ([0054](0054-generated-api-contract.md)): the
  OpenAPI generator documents a backed enum as a string schema with its values, and the TypeScript
  generator turns that into a union. TypeScript `enum` declarations and hand-written mirrors are not
  used.

### Consequences

- Good, because adding a case on the backend reaches every client through contract regeneration,
  and the drift check fails until the clients are updated.
- Good, because the API stays locale-neutral and theme-neutral.
- Good, because one module per domain on each client owns the state-to-token mapping, which design
  changes can update in one place.
- Bad, because each client must write its own state-to-token and label mappings.
- Bad, because a client that must display an unknown future value needs a fallback token and label.

### Confirmation

- An architecture test asserts that every enum under `App\Enums` is backed by strings: FORCED.
- An architecture test fails an enum that declares a configured presentation method (default
  `color`): GUARDED, because it matches method names.
- A schema-reading test requires columns with configured status-like names to be cast to a backed
  enum in the owning model: GUARDED, because it matches column names.
- A type-aware custom PHPStan rule fails string literals compared with enum-cast attributes in
  queries and comparisons ([0037](0037-phpstan-rules-and-reflection-tests.md)): GUARDED.
- With the i18n module, a custom PHPStan rule fails Resource output keys ending in `_label`:
  GUARDED.
- On the web track, a lint rule bans TypeScript `enum` declarations: FORCED. Contract drift is
  checked in CI ([0054](0054-generated-api-contract.md)).
- `options()` only when served, domain statics and the per-domain token module are Review.

## Pros and Cons of the Options

### Native string-backed enums, values only on the wire, client unions generated from the contract

- Good, because values are readable in logs, payloads and the database.
- Bad, because presentation mappings live in each client rather than once on the server.

### Enums that carry labels and colours in API responses

- Good, because clients render without mapping code.
- Bad, because the API fixes one locale and one palette, and clients that need tokens or themes
  ignore the fields and keep their own copies anyway.

### Integer-backed enums

- Good, because storage is compact.
- Bad, because values are meaningless on the wire and in logs, and reordering cases is an easy
  mistake.

### Plain string constants

- Good, because nothing new is needed.
- Bad, because nothing ties a column, a comparison or a client to the allowed set.

## More Information

- PHP backed enumerations: <https://www.php.net/manual/en/language.enumerations.backed.php>.
- Attribute casting to enums: <https://laravel.com/docs/13.x/eloquent-mutators#enum-casting>.
- Scramble's documentation of backed enums as string schemas (0.13.45) is recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0054](0054-generated-api-contract.md), [0066](0066-design-tokens.md),
  [0078](0078-labels-and-multilingual-content.md).
- Governs: the Laravel enum rules, the rule on label fields in Resources, and the client rules on
  enum types and state-to-token mapping.
