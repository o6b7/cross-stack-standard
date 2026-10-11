---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Server-driven collections: declared filters and sorts, capped pages, no client pagination over a server page

## Context and Problem Statement

List endpoints fail in quiet ways. An endpoint that accepts any query key silently ignores a
misspelled filter and returns the unfiltered list. An unbounded `per_page` lets one request pull
the whole table. An index action that does not paginate works until the table grows. On the
client, the most damaging defect is pagination, filtering or sorting applied to a page the server
already cut: a common defect is client pagination over the first server page, which silently
hides every record beyond it while the counts still look plausible.

Projects also mix idioms for building list queries, so the same filter is written three ways in
one codebase.

How are collections queried, bounded and paged, and what may clients do with them?

## Decision Drivers

- The server owns the data set; a client never sees more than one page of it.
- Mistakes in a query should fail loudly, not return a different list.
- One idiom per project, chosen by what is installed ([0006](0006-stack-first.md)).

## Considered Options

- Server-driven lists: declared keys, rejected unknowns, capped pages, clients forward parameters
- Permissive queries that ignore unknown keys
- Client-side paging and filtering over a full or partial download

## Decision Outcome

Chosen option: "Server-driven lists: declared keys, rejected unknowns, capped pages, clients forward
parameters", because it keeps the full data set on the server and turns query mistakes into errors.

- **Declared keys.** Each list endpoint declares its accepted filters and sorts and rejects any
  other key with a 400 ([0048](0048-http-status-vocabulary.md)).
- **Bounded pages.** Every index action paginates. `per_page` is always validated and clamped to
  a fixed maximum; a malformed or out-of-range value falls back to the default page size rather than failing or
  being clamped, and the size used is reported in the response's pagination meta.
- **One filtering idiom per project.** If `spatie/laravel-query-builder` is installed, it is the
  idiom; by default it already answers unknown filters and sorts with a 400. Version 7 takes
  variadic arguments
  (`->allowedFilters('status', 'customer_id')`) and has no `*` wildcard, so every key is listed.
  Otherwise the idiom is a `when()` chain over validated query parameters. The rule is uniqueness,
  not a particular idiom.
- **Clients forward, the server counts.** Web and mobile clients keep page, filters and sort in
  navigation state (URL state on the web, [0064](0064-query-key-factories-and-url-state.md)),
  forward them to the API, and drive the UI from the server's total.
- **No client-side paging, filtering or sorting of a server page**, on web and mobile. The only
  escape is a described `eslint-disable-next-line cross-stack/no-client-pagination -- <reason>` for
  data provably complete in memory, such as a small fixed list returned whole
  ([0005](0005-explicit-exceptions.md)).

### Consequences

- Good, because a misspelled filter or sort fails in development instead of returning wrong data.
- Good, because list sizes and response times stay bounded as tables grow.
- Good, because shareable URLs reproduce the same list on the web.
- Bad, because every new filter or sort needs a declaration on the server before a client can use
  it.
- Bad, because small, complete lists need an explicit escape comment to be paged on the client.

### Confirmation

- A behavioural route-table test calls each `GET` index route and asserts a paginated shape with a
  total; provably complete sets are allowlisted with a reason and expiry: GUARDED.
- A behavioural test calls each paginated route with `per_page` values such as `-5`, `abc` and
  `100000` and asserts a successful response whose page size is within the cap: GUARDED.
- A behavioural test calls each list route with an unknown filter and an unknown sort key and
  asserts 400: GUARDED.
- The custom ESLint rule `cross-stack/no-client-pagination` flags configured client paginator
  helpers and a table library's client-side pagination model on web and mobile; its only escape is
  a described disable comment, enforced by the comment-description rule: GUARDED, because a
  hand-written slice of a server page evades it.
- Filtering or sorting a server page on the client, and the one-idiom rule, are Review.

## Pros and Cons of the Options

### Server-driven lists: declared keys, rejected unknowns, capped pages, clients forward parameters

- Good, because the data set, the total and the query rules live in one place.
- Bad, because the server must implement every filter and sort a screen offers.

### Permissive queries that ignore unknown keys

- Good, because clients can experiment without server changes.
- Bad, because a typo returns a different list with a success status, which nobody notices.

### Client-side paging and filtering over a full or partial download

- Good, because interactions feel instant on small data sets.
- Bad, because over a server page it silently hides records, and over a full download it does not
  scale.

## More Information

- Laravel pagination and its JSON shape: <https://laravel.com/docs/13.x/pagination>.
- `spatie/laravel-query-builder` 7 upgrade notes (variadic arguments, no wildcard):
  <https://github.com/spatie/laravel-query-builder/blob/7.3.5/UPGRADING.md>; the version is recorded
  in [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0005](0005-explicit-exceptions.md), [0006](0006-stack-first.md),
  [0042](0042-api-routing.md), [0064](0064-query-key-factories-and-url-state.md).
- Governs: the Laravel list rules (pagination, page-size cap, declared filters and sorts, filter
  idiom) and the web and mobile rules against client-side paging of server pages.
