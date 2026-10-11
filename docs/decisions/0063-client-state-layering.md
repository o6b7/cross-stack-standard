---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Client state layering: server cache, URL state, local state; no global store mandate

## Context and Problem Statement

Client state tends to collect in one place. Server responses get copied into a global store and
go stale, so every mutation needs hand-written synchronisation. List filters kept in component
state vanish on reload and cannot be shared as a link. A store added "for later" has one consumer,
which makes it an abstraction with one caller ([0013](0013-dry-policy.md)). And credentials kept
in JavaScript state are readable by any script on the page.

Where does each kind of client state live on the web and mobile tracks?

## Decision Drivers

- Each kind of state has exactly one owner.
- The server stays authoritative for data ([0012](0012-backend-authority.md)).
- Lists are shareable and survive a reload.
- No library is mandated where the project already has one, or needs none ([0006](0006-stack-first.md)).
- Credentials are never script-readable ([0083](0083-credential-and-client-storage.md)).

## Considered Options

- Three layers: the server-state cache, URL state and component state
- A mandated global store for all client state
- Component state only

## Decision Outcome

Chosen option: "Three layers: the server-state cache, URL state and component state", because
each layer is owned by the tool built for it, and none of them needs a library the project does
not already have.

- **Server data** lives only in the installed server-state library's cache. It is read through
  feature hooks and refreshed by invalidation ([0064](0064-query-key-factories-and-url-state.md)),
  never copied into a client store or long-lived component state.
- **URL state** holds list page, filters and sort, and any other view state that should survive a
  reload or be shared, through the project's one URL-state idiom
  ([0064](0064-query-key-factories-and-url-state.md)). Mobile keeps the same values in navigation
  params. Both forward them to the API ([0049](0049-server-driven-collections.md)).
- **Local UI state** (open panels, draft input, the selected tab) stays in the component that owns
  it and is lifted only as far as the nearest common parent. An autosave editor keeps its draft in
  local state while editing and invalidates its query keys on unmount and navigation.
- **No global store mandate.** A client store is added only for client-only state with real
  consumers in separate trees. If a store library is already installed, stack-first keeps it for
  that purpose; it never holds server data.
- **One bounded exception.** A persisted profile cache may hold the signed-in user's
  non-credential profile fields under one declared key, for first paint only. The server response
  replaces it, and sign-out or a 401 outside the login flow clears it. It does not license
  persisting any other server data.
- **Credentials** never live in JavaScript state, a client store or unencrypted storage
  ([0083](0083-credential-and-client-storage.md)).

### Consequences

- Good, because there is no hand-written cache synchronisation: invalidation refreshes every view.
- Good, because lists can be bookmarked, shared and restored.
- Good, because projects without cross-tree client state carry no store at all.
- Bad, because URL state needs parsing, types and defaults for every parameter.
- Bad, because "real cross-tree consumer" is a judgement made in review.
- Bad, because the profile-cache exception needs discipline to stay bounded.

### Confirmation

- Mobile: a dependency-cruiser rule keeps the HTTP library reachable only from the API client
  module, and the API client only from hooks and the auth context, so screens reach server data
  through query hooks. GUARDED target; evasion: a direct call to the platform `fetch`.
- Mobile: a custom rule confines creating the query client to the query provider module. FORCED
  target.
- With the bff-auth module, a test asserts that a 401 outside the login flow clears the profile
  cache ([0073](0073-bff-auth-module.md)). GUARDED target.
- Server data only in the cache, the URL and local split, and store additions are checked in
  review on the web track.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Three layers: the server-state cache, URL state and component state

- Good, because each layer's tool handles caching, sharing or rendering by design.
- Bad, because contributors must decide which layer a new piece of state belongs to.

### A mandated global store for all client state

- Good, because all state is in one inspectable place.
- Bad, because server data in a store duplicates the cache and goes stale, and most projects would
  gain a dependency with a single caller.

### Component state only

- Good, because it is the simplest model.
- Bad, because filters are lost on reload, and server data is refetched or passed down by hand.

## More Information

- TanStack Query overview: <https://tanstack.com/query/latest/docs/framework/react/overview>.
- Next.js `useSearchParams`: <https://nextjs.org/docs/app/api-reference/functions/use-search-params>;
  nuqs: <https://nuqs.dev/>.
- Related: [0013](0013-dry-policy.md), [0049](0049-server-driven-collections.md),
  [0064](0064-query-key-factories-and-url-state.md),
  [0083](0083-credential-and-client-storage.md).
- Governs: the web and mobile client-state rules (server data in the cache, URL and navigation
  state for lists, store additions, the profile-cache exception).
