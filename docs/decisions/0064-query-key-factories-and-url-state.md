---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Query-key factories with queryOptions() and one URL-state idiom

## Context and Problem Statement

Query keys are the addresses of the server-state cache. Written inline in components, they drift
(`"invoice"` in one place, `"invoices"` in another), and a mistyped key fails silently: the cache
simply misses. A common defect is cross-feature invalidation by a bare string, which stops working
without an error when the owning feature renames its key.

TanStack Query's `queryOptions()` helper returns its input unchanged at runtime, but it binds the
key, the query function and the data type into one definition. `useQuery(groupOptions(1))` and
`queryClient.setQueryData(groupOptions(42).queryKey, data)` are then both typed from that single
definition.

URL state has the same problem at a smaller scale: hand-parsed `URLSearchParams`, router hooks and
a library side by side parse, default and serialise the same parameter differently.

How are query keys defined and shared, and which idiom holds URL state?

## Decision Drivers

- One definition per key, owned by the feature that owns the data.
- Key mistakes fail at compile time or in lint, not as silent cache misses.
- Invalidating a resource reaches every query derived from it.
- One URL-state idiom per project, taken from what is installed ([0006](0006-stack-first.md)).

## Considered Options

- Per-domain `queryOptions()` factories with a hierarchical key grammar and one URL-state idiom
- One central key object for the whole application
- Inline keys, checked in review

## Decision Outcome

Chosen option: "Per-domain `queryOptions()` factories with a hierarchical key grammar and one
URL-state idiom", because it puts each key next to the data it describes and makes every other use
an import.

- **Factories per domain.** Each domain exports `queryOptions()` (and `infiniteQueryOptions()`)
  factories from its hooks folder: `features/<feature>/hooks/` on the web, the domain's hooks
  folder on mobile. The allowed directories are configurable per track.
- **Key grammar.** Keys are hierarchical and resource-first: a root such as `["invoices"]`, then
  for example `["invoices", "list", params]` and `["invoices", "detail", id]`. Each domain exports
  its root, so invalidating the root reaches every list and detail query under it.
- **Cross-feature invalidation** imports the target feature's exported root or factory, never a
  string or array literal. After a mutation, the affected resource root is invalidated.
- **The ban.** `cross-stack/no-inline-query-key` flags array literals passed as `queryKey`, and as
  the key argument of the query client's invalidate, set, get, refetch and cancel calls, outside
  the allowed directories. The only escape is a described disable
  ([0005](0005-explicit-exceptions.md)).
- **Stack-first.** The rule targets the installed server-state library: its options name the key
  property and client methods, and the defaults are TanStack Query's.
- **URL state.** When nuqs is installed it is the idiom: its `NuqsAdapter` from
  `nuqs/adapters/next/app` wraps the App Router root layout, and `nuqs/adapters/react` serves a
  React SPA. Otherwise the router's own search-params API is the idiom. Mobile keeps list state in
  the router's route params. The Standard does not add nuqs to a project; one idiom per project
  applies either way ([0007](0007-one-mechanism-per-concern.md)).
- URL state holds list page, filters and sort ([0049](0049-server-driven-collections.md),
  [0063](0063-client-state-layering.md)), each with a declared type and default.

### Consequences

- Good, because renaming a key is a compile error at every use, not a silent miss.
- Good, because cache reads and writes are typed from the factory.
- Good, because one root invalidation refreshes lists and details together.
- Bad, because every domain carries a factory module even when it has one query.
- Bad, because the ban is syntactic, so keys assembled elsewhere can still slip through.

### Confirmation

- `cross-stack/no-inline-query-key` on the web and mobile tracks: GUARDED. Evasions: a key array
  assigned to a variable before it is passed; a key built by a helper outside the allowed
  directories; query-client methods called through an alias or wrapper; a key defined in the wrong
  feature's hooks folder.
- The key grammar, root invalidation after mutations and the single URL-state idiom are checked in
  review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Per-domain `queryOptions()` factories with a hierarchical key grammar and one URL-state idiom

- Good, because ownership follows the feature boundaries ([0062](0062-frontend-layer-boundaries.md)).
- Bad, because finding every key means looking in each feature's hooks folder.

### One central key object for the whole application

- Good, because every key is in one file.
- Bad, because the file couples every feature, grows without bound, and carries keys without
  their query functions or types.

### Inline keys, checked in review

- Good, because it needs no structure.
- Bad, because drift is invisible in review until a stale screen is reported.

## More Information

- TanStack Query `queryOptions()`:
  <https://tanstack.com/query/latest/docs/framework/react/guides/query-options>; query keys:
  <https://tanstack.com/query/latest/docs/framework/react/guides/query-keys>; invalidation:
  <https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation>.
- nuqs adapters: <https://nuqs.dev/docs/adapters>.
- Versions: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0006](0006-stack-first.md), [0049](0049-server-driven-collections.md),
  [0063](0063-client-state-layering.md).
- Governs: the web and mobile query-key rules and the URL-state idiom.
