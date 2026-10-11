---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# bff-auth module: a cookie-based BFF for Next.js in front of a bearer-token API

## Context and Problem Statement

A Next.js front end talking to a separate Laravel API has to keep a credential somewhere. Keeping a
token in browser storage exposes it to any script on the origin; OWASP says not to store tokens in
`localStorage` or `sessionStorage` and to use `HttpOnly; Secure; SameSite` cookies or a
Backend-for-Frontend (BFF). Laravel Sanctum's stateful SPA mode avoids tokens, but it requires the
SPA and the API to share a top-level domain. That rules it out for separate API hosts, per-tenant
custom domains and native clients, which need bearer tokens anyway.

A BFF has its own failure modes, and they are subtle. Common defects:

- The token is also returned in the JSON body, so client code can read it after all.
- The cookie outlives the token, so a user looks signed in while every call fails.
- Cookie names, login paths and protected segments are hard-coded in several layers and drift.
- A catch-all proxy joins the decoded path segments into a string and appends it to the upstream
  base. Next.js resolves literal `..` and `%2e%2e` before routing, but a segment decoded from
  `%2F`, `%5C` or a double-encoded `%252e` still contains a separator or a dot segment. The URL parser inside
  `fetch` resolves it, and the request, carrying the user's bearer token, leaves the API base path
  for another route on the upstream host.

How does the Standard authenticate a Next.js front end against a bearer-token API?

## Decision Drivers

- The credential is never readable by browser JavaScript.
- It works with separate API hosts, custom tenant domains and native clients.
- Security-critical plumbing comes from tested templates, not from prose
  ([0010](0010-opt-in-modules.md)).
- Every value the plumbing depends on is declared once.

## Considered Options

- A cookie BFF in Next.js in front of a bearer-token API (the `bff-auth` module)
- Sanctum stateful SPA sessions (cookies set by the API, same site)
- A bearer token held in browser storage

## Decision Outcome

Chosen option: "A cookie BFF in Next.js in front of a bearer-token API (the `bff-auth` module)",
because it keeps the credential out of JavaScript under every deployment shape, while the API stays
a plain bearer-token API for every client.

- **Token to cookie.** With `bff-auth` on, the API issues a short-lived bearer token (Sanctum tokens
  never expire unless `expiration` is set, so the module sets it). The BFF login Route Handler
  lifts the token from the login response into an `httpOnly`, `Secure`, `__Host-` cookie with an
  explicit `SameSite`, and strips it from the JSON sent to the browser.
- **Proxy.** A catch-all Route Handler attaches `Authorization: Bearer` server-side and
  allow-lists headers in both directions; upstream `Set-Cookie` never reaches the browser.
- **Lifetimes.** The cookie's max-age is set below the token expiry, so the cookie always dies
  first; both values are documented side by side in each app's `.env.example`
  ([0085](0085-environment-files.md)). Any request-body buffering is sized against the backend
  upload limit, and both limits are documented together ([0087](0087-file-uploads.md)).
- **Declared once.** Cookie names, login and home paths, protected segments, auth endpoint paths,
  client storage keys and upstream env names are configuration, imported where used. No substring
  matching on endpoint paths.
- **Credential migration.** When the credential scheme changes, stragglers on the old scheme are
  actively revoked, and the migration states its sunset condition. No migration endpoint ships
  until a migration exists.
- **Upstream URL.** The proxy passes the decoded segment array, never a joined string. It rejects
  empty segments, `.`, `..` and segments containing `/`, `\` or control characters; re-encodes each
  segment with `encodeURIComponent`; resolves against the base with a trailing slash; asserts the
  same origin and the base-path prefix; takes the query only from `request.nextUrl.search`; fetches
  with `redirect: "manual"`; and returns 400 before any fetch when a check fails.
- **Lighter variant.** A same-site stateful session is allowed only when the API and every front
  end share a site, there are no custom tenant domains and no non-browser clients, and the project
  records this in its own ADR.

Session re-verification ([0070](0070-proxy-ux-only-session-reverification.md)), CSRF
([0074](0074-bff-csrf-defense.md)) and storage per platform
([0083](0083-credential-and-client-storage.md)) are separate records. A project already using an
installed auth library for this concern keeps it and does not use the module
([0006](0006-stack-first.md)); under the proposed default set, which turns the module on for
Laravel plus Next.js projects ([0011](0011-default-module-set.md)), that means switching it off.

### Consequences

- Good, because a cross-site scripting bug cannot read the credential.
- Good, because one API serves web, mobile and third-party clients the same way.
- Bad, because every API call takes an extra hop through the BFF.
- Bad, because the BFF is security-critical code the kit must test and keep current.

### Confirmation

- Vitest cases call the shipped URL builder and proxy with `..`, `.`, a decoded `a/../..`, `..\x`,
  a double-encoded `%2e%2e`, an empty segment and query or fragment injection
  (`["users?role=admin"]`, a segment with `#`); each must return 400 with `fetch` never called. A
  legitimate `["items","100%"]` must pass. The violation fixture joins the segments into a string. GUARDED,
  because a handler that bypasses the shipped builder is caught only by review and template-hash
  drift.
- Contract tests assert the cookie flags and prefix, that the token is absent from the login JSON,
  and that the header allow-lists hold in both directions. GUARDED.
- The web architecture test imports the declared protected segments and compares them with the
  route groups. GUARDED. Evasion: which segments are private is inferred from the route-group
  convention, so a private page placed outside the conventional protected route groups is missed.
- Lifetimes, buffering limits and the migration playbook: Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### A cookie BFF in Next.js in front of a bearer-token API (the `bff-auth` module)

- Good, because it works for every host layout and client type.
- Bad, because the BFF adds latency and code.

### Sanctum stateful SPA sessions (cookies set by the API, same site)

- Good, because there is no token and no proxy; Laravel handles CSRF.
- Bad, because the SPA and API must share a top-level domain, so custom tenant domains and native
  clients need a second mechanism.

### A bearer token held in browser storage

- Good, because it is simple.
- Bad, because one cross-site scripting bug discloses every token; OWASP advises against it.

## More Information

- OWASP Session Management Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>.
- Next.js BFF guide: <https://nextjs.org/docs/app/guides/backend-for-frontend>; `cookies()`:
  <https://nextjs.org/docs/app/api-reference/functions/cookies>.
- Sanctum SPA authentication and token expiration: <https://laravel.com/docs/13.x/sanctum>.
- Cookie prefixes: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie>.
- Related: [0010](0010-opt-in-modules.md), [0070](0070-proxy-ux-only-session-reverification.md),
  [0074](0074-bff-csrf-defense.md), [0083](0083-credential-and-client-storage.md).
- Governs: the bff-auth module's web and security rules (cookie handling, the proxy, the upstream
  URL builder, declared configuration and credential migration).
