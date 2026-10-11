# BFF auth and Next.js sessions

A cookie-based backend-for-frontend in Next.js in front of a bearer-token API: the browser never
sees the token, every mutation passes a same-origin check, and each Route Handler and Server Action
checks the session again ([ADR 0073][0073], [ADR 0074][0074], [ADR 0070][0070]). The `bff-auth`
module needs the web track with the `next` profile; it is on by default when the tracks include
`web` (profile `next`) and `laravel` ([ADR 0011][0011]). A project that already uses an installed
auth library for this concern keeps it and switches the module off. Rules marked Tier 1 apply to
every project with the module on; the others apply once the project declares Tier 2.

## Before you write auth code

The BFF proxy, cookie helpers and auth routes are security-critical plumbing, designed to come from
versioned kit templates and be consumed, never re-derived from prose ([ADR 0010][0010]). If the
project has no kit-provided BFF modules, or they differ from what these rules describe, treat the
work as unknown territory: stop and ask before hand-writing cookie, proxy or origin-check code.

## Rules

### Session re-verification (every Next.js project)

- **SEC-034** Re-verify the session in every Route Handler and Server Action, and authorize in the backend _(Tier 1; next profile)_
- **SEC-033** Limit the proxy session redirect to a cookie-presence check that never authorizes _(next profile)_
- **SEC-072** Export no runtime segment config from `proxy.ts` _(next profile)_

### Cookies and the token

- **SEC-036** Write session cookies per the cookie contract: `__Host-` prefix, HttpOnly, Secure, explicit SameSite _(Tier 1; next profile)_
- **SEC-037** Write and clear session cookies only in the session module _(next profile)_
- **SEC-038** Never hand the token to page JavaScript in the login response _(Tier 1; next profile)_
- **SEC-039** Expire every session cookie on sign-out, a failed upstream logout and a relayed 401 included _(next profile)_
- **SEC-040** Keep the session-presence predicates in agreement, treating an empty cookie as signed out _(next profile)_
- **SEC-059** Expire the session cookie before the backend token _(next profile)_
- **WEB-045** Reconcile the session hint with the token cookie in the proxy on every navigation _(next profile)_
- **WEB-046** Clear the profile cache and hard-navigate to the locale's login page on a non-login 401 _(next profile)_

### Cross-site request defense

- **SEC-035** Refuse cross-site, missing and null origins on mutating requests in the same-origin check _(Tier 1; next profile)_
- **SEC-067** Call the shared same-origin check in every mutating Route Handler _(Tier 1; next profile)_
- **SEC-068** List only exact hosts as Server Action allowed origins, never null or a wildcard _(Tier 1; next profile)_
- **SEC-070** Change nothing in GET and HEAD Route Handlers: no cookie writes, no mutating upstream calls _(next profile)_

### The proxy

- **SEC-041** Forward only allow-listed headers through the BFF, never Cookie, Host or a client Authorization _(next profile)_
- **SEC-042** Keep BFF path forwarding inside the configured API base path _(next profile)_
- **SEC-043** Give route files only to the catch-all, the auth routes and allowlisted handlers _(next profile)_
- **SEC-044** Call only the same-origin BFF from the browser, never the API origin _(next profile)_
- **SEC-032** Keep the upstream API base URL in server-side env, never in a public-prefixed variable _(next profile)_
- **WEB-044** List every private route segment in the protected-segments declaration the proxy reads _(next profile)_
- **WEB-047** Compare auth endpoint paths as exact shared constants, never by substring _(next profile)_
- **WEB-048** Return RFC 9457 problem details for every error the BFF creates itself _(next profile)_
- **WEB-049** Reject request bodies above the shared upload limit with 413 in the BFF, before buffering _(next profile)_

### Without a BFF (React SPA profile, after 1.0)

- **WEB-052** Send credentials and the XSRF token from the SPA client, and fetch the CSRF cookie first _(react-spa profile; off by default)_
- **SEC-060** Choose cookie-session SPA auth without a BFF only through an ADR that confirms its constraints _(react-spa profile; off by default)_

## Sanctioned patterns

**Session re-verification.** The proxy (`proxy.ts`) is a UX-only session redirect: it reads the
session cookie and redirects signed-out navigations to sign-in, never authorizes, never queries a
database, and exports no `runtime`. Every Route Handler, Server Action and Server Component that
reads private data calls the shared server-side session helper, which confirms the session with the
backend or forwards the credential to a backend call that authenticates it. A handler that cannot
verify returns 401. Authorization stays with the API; public handlers are listed by name.

**Token to cookie.** The API issues a short-lived bearer token (Sanctum tokens need `expiration`
set). The BFF login handler moves it into a cookie and strips it from the JSON sent to the browser.
Cookies are written and cleared only in the session module:

```text
Set-Cookie: __Host-session=<token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=<seconds>
```

`SameSite=Strict` where the login flow allows. The cookie's max-age is below the token's expiry, so
the cookie always dies first; both values are documented side by side in `.env.example`. Sign-out, a
failed upstream logout and a relayed 401 all expire every session cookie. An empty cookie counts as
signed out in every presence check.

**Same-origin check.** Every exported `POST`, `PUT`, `PATCH` and `DELETE` Route Handler calls one
shared `assertSameOrigin` first. When `Sec-Fetch-Site` is present only `same-origin` passes;
otherwise `Origin` must be present, not `null`, and exactly equal to the application's origin.
Anything else gets 403 before any work. `experimental.serverActions.allowedOrigins` lists exact
hosts only: never `"null"`, never `"*"`, no label wildcards. GET and HEAD handlers change nothing:
no cookie writes, no mutating upstream calls. Matching is by exact origin, never by registrable
domain, because SameSite does not separate sibling subdomains.

**The proxy.** One catch-all Route Handler forwards to the API, attaching `Authorization: Bearer`
server-side and allow-listing headers in both directions (never `Cookie`, `Host` or a client
`Authorization`; upstream `Set-Cookie` never reaches the browser). The browser calls only the
same-origin BFF, never the API origin. The upstream base URL lives only in server-side env. For the
upstream path:

1. take the decoded segment array, never a joined string;
2. reject empty segments, `.`, `..`, and segments containing `/`, `\` or control characters;
3. re-encode each segment with `encodeURIComponent` and resolve against the base URL with a trailing
   slash;
4. assert the same origin and the base-path prefix;
5. take the query only from `request.nextUrl.search`, fetch with `redirect: "manual"`, and return
   400 before any fetch when a check fails.

Bodies above the shared upload limit get 413 before buffering. Errors the BFF creates itself are
problem details. Cookie names, login and home paths, protected segments and auth endpoint paths are
declared once and imported; auth endpoints are compared as exact constants, never by substring. On a
non-login 401, the client clears the profile cache and hard-navigates to the locale's login page.

**Deployment.** The ingress owns `x-forwarded-host` and overwrites any client value, because the
Server Action origin check reads it.

**Without a BFF.** A same-site stateful session (the React SPA profile, or a Next.js app that
chooses it) is allowed only when the API and every front end share a site, there are no custom
tenant domains and no non-browser clients, and the project records this in its own ADR.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them, and do not describe them as
enforced by a gate. The `route-handler-session` and `same-origin-mutations` lint rules, the
upstream-URL tests and the cookie-contract checks arrive in later 0.x releases. `enforcement` in
`${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for each ID.

## Decision records

- [ADR 0010][0010]: Opt-in modules declared in the project manifest, installed as whole units
- [ADR 0011][0011]: Default module set
- [ADR 0070][0070]: Proxy redirects are UX only; every Route Handler and Server Action checks the session again
- [ADR 0073][0073]: bff-auth module: a cookie-based BFF for Next.js in front of a bearer-token API
- [ADR 0074][0074]: CSRF defense for the cookie BFF: same-origin checks, SameSite cookies, side-effect-free GETs

[0010]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0010-opt-in-modules.md
[0011]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0011-default-module-set.md
[0070]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0070-proxy-ux-only-session-reverification.md
[0073]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0073-bff-auth-module.md
[0074]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0074-bff-csrf-defense.md
