---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# CSRF defense for the cookie BFF: same-origin checks, SameSite cookies, side-effect-free GETs

## Context and Problem Statement

The bff-auth module keeps the credential in a cookie ([0073](0073-bff-auth-module.md)), so the
browser attaches it to requests that another site triggers. What Next.js provides is partial:

- Route Handlers have no built-in CSRF protection; the framework's security guidance says it has to
  be done by hand there.
- Server Actions compare the `Origin` host with the app's host, taken from `x-forwarded-host` or
  `host`. A request with no `Origin` header is let through with a warning. From 16.0.1 until
  16.1.7, `Origin: null` was treated as missing and passed too.
- `SameSite=Lax` cookies still ride top-level GET navigations, and requests between sibling
  subdomains (`a.example.com` to `b.example.com`) are same-site: the cookie is sent and
  `Sec-Fetch-Site` reports `same-site`.

A common defect is an Origin check that lets requests without an Origin header through, on the
theory that only non-browser callers omit it. OWASP recommends blocking when neither Origin nor
Referer is present, and treats SameSite as defense in depth, not the defense.

How does the Standard stop cross-site requests from using the BFF cookie?

## Decision Drivers

- The check must be impossible to forget on a new mutating handler.
- Missing and `null` origins fail closed.
- Subdomain tenancy must not open a same-site hole.
- No framework default is assumed to cover what it does not.

## Considered Options

- A shared same-origin check on every mutation, explicit SameSite cookies and side-effect-free GETs
- SameSite cookies alone
- Synchronizer or double-submit CSRF tokens
- The framework's built-in checks only

## Decision Outcome

Chosen option: "A shared same-origin check on every mutation, explicit SameSite cookies and
side-effect-free GETs", because Fetch Metadata plus an exact Origin match rejects cross-site and
sibling-subdomain requests without token plumbing, and a lint gate makes the check hard to forget.

- **`assertSameOrigin`.** Every mutating Route Handler calls one shared helper. When
  `Sec-Fetch-Site` is present, only `same-origin` passes. Otherwise `Origin` must be present, not
  `null`, and exactly equal to the application's origin. Anything else gets 403 before any work.
- **Lint gate.** A custom ESLint rule asserts that every exported `POST`, `PUT`, `PATCH` and
  `DELETE` handler in a route file calls the helper.
- **Server Actions.** `experimental.serverActions.allowedOrigins` lists exact hosts only: never
  `"null"`, never a bare `"*"`, and no `*` or `**` label wildcard, although Next.js accepts them,
  because a wildcard admits sibling subdomains (see Subdomain tenancy below). A project that needs
  a wildcard records why in a dated allowlist entry ([0005](0005-explicit-exceptions.md)).
- **Cookies.** `__Host-` prefix, `httpOnly`, `Secure`, `Path=/` and an explicit `SameSite` (`Lax`,
  or `Strict` where the login flow allows); never the browser default.
- **Side-effect-free GETs.** GET and HEAD routes reachable through the BFF change nothing, on the
  Route Handler and on the API, because `Lax` cookies ride top-level navigations. State-changing
  GET handlers are banned.
- **Deployment.** The ingress owns `x-forwarded-host` and overwrites any client-supplied value,
  because the framework's Server Action check reads it and the expected origin is derived from the
  request host.
- **Subdomain tenancy.** Matching is by exact origin, never by registrable domain, because SameSite
  does not separate sibling subdomains ([0057](0057-tenancy-module.md)).

### Consequences

- Good, because a new mutation without the check fails lint.
- Good, because a sibling tenant subdomain cannot post with another tenant's cookie.
- Bad, because a client or intermediary that strips both `Origin` and `Sec-Fetch-Site` cannot
  mutate through the BFF.
- Bad, because deployments must configure the ingress correctly, which no gate can see.

### Confirmation

- Unit tests of `assertSameOrigin` cover `same-origin`, `same-site` and `cross-site` fetch
  metadata, an exact match, a sibling subdomain, a missing Origin and `Origin: null`. FORCED for
  the helper's behaviour, because the tests call it directly.
- The lint rule on exported mutating handlers: GUARDED, because a check reached through an alias or
  called after a side effect can evade it.
- A config check fails on `"null"` or any entry containing `*` in `allowedOrigins`, unless the
  entry is allowlisted: GUARDED, because a value computed at runtime escapes static reading.
- A lint rule fails GET handlers in route files that set or delete cookies or call a mutating
  upstream method: GUARDED. On the API, resourceful routing maps GET to read actions
  ([0042](0042-api-routing.md)); a read action that writes is caught in review.
- Ingress ownership of `x-forwarded-host`: Review, stated in the deployment docs.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### A shared same-origin check on every mutation, explicit SameSite cookies and side-effect-free GETs

- Good, because it needs no token state and blocks sibling subdomains.
- Bad, because it depends on browsers sending Fetch Metadata or Origin.

### SameSite cookies alone

- Good, because there is nothing to write.
- Bad, because OWASP considers it sufficient only when every one of several conditions holds, and
  it does not separate sibling subdomains.

### Synchronizer or double-submit CSRF tokens

- Good, because they do not depend on request headers.
- Bad, because every form and fetch needs token plumbing. A project that cannot meet the
  conditions above (for example, hosts it does not control on its registrable domain) adds a token
  pattern by its own ADR.

### The framework's built-in checks only

- Good, because they are built in.
- Bad, because Route Handlers get none and Server Actions let a missing Origin through.

## More Information

- OWASP CSRF Prevention Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>.
- Server Actions configuration:
  <https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions>; the `null`
  Origin advisory: <https://github.com/vercel/next.js/security/advisories/GHSA-mq59-m269-xvcx>.
  The `*` and `**` label wildcards that `allowedOrigins` accepts are recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Route Handlers and CSRF: <https://nextjs.org/blog/security-nextjs-server-components-actions>.
- Related: [0005](0005-explicit-exceptions.md), [0057](0057-tenancy-module.md),
  [0070](0070-proxy-ux-only-session-reverification.md), [0073](0073-bff-auth-module.md).
- Governs: the bff-auth module's CSRF rules (the same-origin helper and its lint gate, Server
  Action origins, cookie attributes and side-effect-free GETs).
