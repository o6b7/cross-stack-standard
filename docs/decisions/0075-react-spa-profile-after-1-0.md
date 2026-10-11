---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# React SPA profile ships after 1.0

## Context and Problem Statement

The `web` track has two profiles: `next` (Next.js App Router) and `react-spa` (React with Vite)
([0009](0009-tracks-profiles-and-scope.md)). A single-page app is not a smaller Next.js app. It has
no server of its own, so the cookie BFF ([0073](0073-bff-auth-module.md)) and its CSRF rules
([0074](0074-bff-csrf-defense.md)) do not apply; the proxy, Route Handler, Server Action and React
Server Component rules do not apply either.

Its auth path is different. Laravel Sanctum's SPA mode uses no tokens: it uses Laravel's cookie
session, requires the SPA and the API to share a top-level domain, and needs the SPA to request
`/sanctum/csrf-cookie` first and then send the `XSRF-TOKEN` cookie's value in an `X-XSRF-TOKEN`
header; the HTTP client sends credentials. Sanctum's own docs say not to use API tokens to
authenticate a first-party SPA.

The toolchain differs too. The React TypeScript template of `create-vite` 9.2.1 lints with Oxlint
and ships no ESLint config. Its `--eslint` flag switches to ESLint, but installs ESLint 10, while
the Standard pins ESLint 9.39 for now ([0059](0059-javascript-toolchain-pins.md)).

Should the `react-spa` profile ship in 1.0?

## Decision Drivers

- A profile must not ship without its own auth and CSRF rules.
- Untested guidance must not look like tested guidance.
- Adding the profile later must not force re-labelling existing rules.

## Considered Options

- Ship `react-spa` in 1.1 as opt-in; carry the registry's `profiles` field from 1.0
- Ship `react-spa` in 1.0
- Drop the profile and support Next.js only

## Decision Outcome

Chosen option: "Ship `react-spa` in 1.1 as opt-in; carry the registry's `profiles` field from 1.0",
because the profile needs its own auth rule set and a lint decision, and neither can be proven with
fixtures in the 1.0 window.

- **Registry.** Every rule that depends on Next.js carries `profiles: ["next"]` from 1.0, so the
  profile can be added without touching them.
- **Auth rules for 1.1.** Sanctum stateful SPA cookies with credentials, the XSRF-token flow with a
  CSRF-cookie request before the first mutation, and no bearer token held in the SPA. `bff-auth`
  stays Next-only.
- **Lint decision for 1.1.** Scaffold with `--eslint` and bring it onto the pinned ESLint line, or
  support an Oxlint path. It gets its own ADR.
- **Scope.** Next-only rules stay off for the profile. Its guidance stays constraints-only, never
  pseudo-code, until an adopter exercises it.

### Consequences

- Good, because 1.0 does not ship an SPA path with no CSRF rule.
- Good, because the later addition is additive.
- Bad, because SPA teams wait for 1.1, or adopt only the shared and Laravel rules until then.

### Confirmation

Review. The registry schema validates the `profiles` field from 1.0; that every Next-only rule
carries `profiles: ["next"]` is checked when rules are reviewed. Whether this record is accepted is
a maintainer decision, recorded by changing its status.

## Pros and Cons of the Options

### Ship `react-spa` in 1.1 as opt-in; carry the registry's `profiles` field from 1.0

- Good, because the profile arrives with proven rules.
- Bad, because it delays SPA support.

### Ship `react-spa` in 1.0

- Good, because SPA teams are served at once.
- Bad, because the auth rules and the lint path would ship without fixtures behind them.

### Drop the profile and support Next.js only

- Good, because there is less to maintain.
- Bad, because a common front-end shape would have no path at all.

## More Information

- Sanctum SPA authentication: <https://laravel.com/docs/13.x/sanctum#spa-authentication>.
- Vite getting started (`create-vite` templates and flags): <https://vite.dev/guide/>; template
  details: [verified-versions.md](../maintainers/verified-versions.md).
- OWASP on web storage for credentials:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>.
- Related: [0009](0009-tracks-profiles-and-scope.md), [0059](0059-javascript-toolchain-pins.md),
  [0073](0073-bff-auth-module.md).
- Governs: the `profiles` field of every web rule, and the scope of the web track in 1.0.
