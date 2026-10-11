---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Proxy redirects are UX only; every Route Handler and Server Action checks the session again

## Context and Problem Statement

Next.js 16 renamed `middleware` to `proxy`. The proxy runs on the Node.js runtime, the `runtime`
option is not available in proxy files, and setting it throws an error; the Edge runtime is not
supported in `proxy`. The proxy sees navigations before they render, so it is tempting to treat it
as the place where access is decided.

It is not a safe place for that. The Next.js documentation says the proxy should make only
optimistic checks that read the session from the cookie, and should not be the only line of
defense. Route Handlers are public HTTP endpoints that any client can call. Server Functions are
not separate routes: they are POST requests to the page that uses them, so a proxy matcher that
excludes a path skips them too, and the documentation says to verify authentication and
authorization inside each one. In 2026 alone, Next.js published several proxy-bypass advisories;
the workaround for one of them was to enforce authorization in the server-side data path instead
of relying on the proxy.

A common defect is presence-only gating: the proxy redirects when the session cookie is missing,
and everything behind it trusts that. It stays safe only while no server-side code returns
private data on the strength of the cookie's presence, a condition nobody checks.

What role does the proxy play, and where is the session verified?

## Decision Drivers

- Every server entry point that acts for a user checks the session itself.
- Authorization stays with the backend ([0012](0012-backend-authority.md)).
- Redirects for signed-out users stay fast and cheap.
- The rule is checked by a gate, not by memory.

## Considered Options

- The proxy as a UX-only redirect; every Route Handler and Server Action checks the session again
- The proxy as the authentication boundary, by cookie presence
- Full session verification against the backend inside the proxy

## Decision Outcome

Chosen option: "The proxy as a UX-only redirect; every Route Handler and Server Action checks
the session again", because it is the only option that stays correct when the proxy is bypassed
or its matcher skips a path.

- **Name and role.** The proxy is documented as the "proxy session redirect (UX only)". It reads
  the session cookie and redirects signed-out navigations to sign-in; it never grants access and
  never queries a database. Its matcher and the protected route segments are declared once.
- **Tier 1.** Every Route Handler and every Server Action checks the session again and leaves
  authorization to the backend. Re-verifying means calling the shared server-side session helper,
  which either confirms the session with the backend or forwards the credential to a backend call
  that authenticates it; a handler that cannot verify returns 401 and never proceeds on the
  cookie's presence. Server Components that fetch private data use the same helper. Public
  handlers, such as sign-in, are listed by name in configuration.
- **Authorization.** The API decides what the user may do ([0043](0043-single-authorization-site.md));
  the Next.js server is a client of it.
- **No `runtime` export.** A check fails when `proxy.ts` exports `runtime`, so the error appears
  in the fast check rather than at build time.
- The patched Next.js floor is [0071](0071-nextjs-security-floor.md); cross-site request defenses
  for the cookie BFF are [0074](0074-bff-csrf-defense.md).

### Consequences

- Good, because a proxy bypass or a skipped matcher cannot expose a handler or an action.
- Good, because the proxy stays a cheap redirect with no backend round trip.
- Good, because every server entry point follows one pattern that a lint rule can see.
- Bad, because each handler pays for a session check, which the helper caches per request.
- Bad, because the public-handler list must be kept current.

### Confirmation

- `cross-stack/route-handler-session` flags each exported HTTP method handler in a `route.ts` file,
  and each exported function in a `"use server"` module or with a function-level `"use server"`
  directive, unless it calls the configured session helper or is wrapped by a configured wrapper:
  GUARDED. Evasions: the helper is called but its result ignored; it is called on only some code
  paths; the export is produced by a factory the rule does not know.
- The `proxy.ts` `runtime` export check: FORCED target.
- With the bff-auth module, the web architecture test compares the proxy's declared protected
  segments with the route groups ([0073](0073-bff-auth-module.md)): GUARDED. Evasion: a private
  page placed outside the conventional protected route groups is not recognised as private.
- That the backend, not the handler, makes the authorization decision is checked in review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### The proxy as a UX-only redirect; every Route Handler and Server Action checks the session again

- Good, because verification sits next to the data, as the framework recommends.
- Bad, because every handler must remember the helper; the lint rule reminds it.

### The proxy as the authentication boundary, by cookie presence

- Good, because it is one check in one file.
- Bad, because a forged or expired cookie passes, bypasses skip it, and Server Actions on excluded
  paths never reach it.

### Full session verification against the backend inside the proxy

- Good, because it rejects expired sessions before rendering.
- Bad, because it adds a backend call to every matched request, and it is still skipped by
  excluded matchers and bypasses, so handlers must verify anyway.

## More Information

- Next.js `proxy`: <https://nextjs.org/docs/app/api-reference/file-conventions/proxy>; upgrading to
  version 16: <https://nextjs.org/docs/app/guides/upgrading/version-16>.
- Authentication guide (optimistic checks, Route Handlers):
  <https://nextjs.org/docs/app/guides/authentication>; backend-for-frontend guide:
  <https://nextjs.org/docs/app/guides/backend-for-frontend>.
- Next.js security advisories: <https://github.com/vercel/next.js/security/advisories>; the July
  2026 security release: <https://nextjs.org/blog/july-2026-security-release>.
- Advisory details and versions: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0012](0012-backend-authority.md), [0071](0071-nextjs-security-floor.md),
  [0073](0073-bff-auth-module.md), [0074](0074-bff-csrf-defense.md).
- Governs: the Next.js proxy and session re-verification rules (the Tier-1 server-authority
  invariant on the web track).
