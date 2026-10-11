---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Live data by polling first; push channels only by ADR

## Context and Problem Statement

Some screens must stay current without a reload: job progress, status boards, unread counts. Push
channels (WebSockets through a broadcasting server, or server-sent events) deliver updates fastest,
but each adds a long-running server process, a channel-authorization surface, reconnect and
backfill logic, and a second data path next to the server-state cache. A common defect is a push
path that bypasses the cache's authentication, error handling and invalidation, so two sources
show different data on the same screen.

The server-state cache a client already has can poll. In TanStack Query, `refetchInterval`
refetches a query on a timer while it has an active observer, pauses in a background tab unless
`refetchIntervalInBackground` is set, and accepts a function that returns `false` to stop polling
once a job is done.

How do live surfaces get fresh data, and when is a push channel justified?

## Decision Drivers

- One data path per concern ([0007](0007-one-mechanism-per-concern.md),
  [0063](0063-client-state-layering.md)).
- Reuse the existing authentication, error handling and query keys.
- No extra server process until a requirement demands one.
- A push channel is an authorization boundary and must be designed as one.

## Considered Options

- Poll through the server-state cache; add push channels only with a recorded ADR
- Broadcasting as the default for live data
- Realtime connections per feature, as each team sees fit

## Decision Outcome

Chosen option: "Poll through the server-state cache; add push channels only with a recorded ADR",
because polling reuses every mechanism already in place, and push remains available when a
measured requirement needs it.

- **Polling.** Live surfaces poll through the server-state cache with a refetch interval on the
  query's options ([0064](0064-query-key-factories-and-url-state.md)), reusing its auth, caching and
  error handling. Polling stops when the data reaches a terminal state.
- **Push by ADR.** Broadcasting drivers on the backend and realtime client libraries on the clients
  are added only with a recorded ADR ([0001](0001-record-architecture-decisions.md)) that the
  manifest's `decisions` section references ([0023](0023-adopter-manifest-and-upgrade.md)). A module-boundary lint rule catches static imports, dynamic imports
  and `require` of realtime client packages. The rule is GUARDED, because the global `WebSocket`
  and `EventSource` need no import.
- **Channels.** Once adopted, broadcast channels are private and authorized, each through a
  channel authorization callback, and tenant-scoped when the tenancy module is on
  ([0057](0057-tenancy-module.md)).
- **Revisit trigger.** Latency or load requirements that polling cannot meet, such as sub-second
  updates, or poll traffic that costs more than a push server would.

### Consequences

- Good, because live data needs no new infrastructure, dependency or authorization surface.
- Good, because polled data goes through the same cache, keys and error states as everything else.
- Bad, because freshness is bounded by the interval.
- Bad, because server load grows with clients times poll frequency; intervals are chosen per
  surface, not globally.
- Bad, because the rule is GUARDED: a raw `WebSocket` or `EventSource` escapes the lint rule and is
  caught only in review.

### Confirmation

- A module-boundary lint rule on web and mobile reports realtime client imports unless the manifest
  names an existing ADR. GUARDED.
- A Pest test reads `composer.json` and `package.json` and fails on broadcasting dependencies that
  have no ADR reference in the manifest. GUARDED, because a hand-written socket client needs no
  package.
- Private, authorized, tenant-scoped channels: REVIEW. The reviewer reads the channel authorization
  callbacks.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Poll through the server-state cache; add push channels only with a recorded ADR

- Good, because it is the simplest thing that works for most live surfaces.
- Bad, because some surfaces will need an ADR later, when polling stops being enough.

### Broadcasting as the default for live data

- Good, because updates arrive immediately.
- Bad, because every project runs and secures a push server and keeps two data paths consistent,
  whether it needs to or not.

### Realtime connections per feature, as each team sees fit

- Good, because each team picks what fits.
- Bad, because connection handling, authorization and cache consistency are solved several times,
  differently.

## More Information

- TanStack Query polling: <https://tanstack.com/query/latest/docs/framework/react/guides/polling>.
- Laravel channel authorization:
  <https://laravel.com/docs/13.x/broadcasting#authorizing-channels>.
- Related: [0001](0001-record-architecture-decisions.md), [0057](0057-tenancy-module.md),
  [0063](0063-client-state-layering.md).
- Governs: the web and mobile live-data rules and the Laravel broadcasting and channel rules.
