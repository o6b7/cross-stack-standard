---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Credential and client storage per platform

## Context and Problem Statement

A credential that script can read is disclosed by the first injected script. OWASP's session
guidance says not to keep tokens, session ids or any credential in `localStorage` or
`sessionStorage`, and to use `HttpOnly; Secure; SameSite` cookies or a backend-for-frontend
instead. On mobile the equivalent risk is a general-purpose key-value store: AsyncStorage and
expo-sqlite's key-value store are unencrypted, while expo-secure-store encrypts values on the
device.

Clients also keep legitimate non-credential data locally: a selected locale, a dismissed banner, a
cached profile. Without one place for that data, credentials and preferences end up in the same
stores, and nothing clears either at sign-out. A common defect is a gate that scans `setItem` calls
for credential-like key names: it misses a token stored under a renamed key and flags legitimate
secure-store writes.

Where may each platform keep credentials and other client data, and how is that enforced?

## Decision Drivers

- Credentials are short-lived, revocable and never script-readable (a Tier-1 invariant,
  [0008](0008-tiers-and-invariants.md)).
- Enforcement should follow imports, which a tool can resolve, not key names, which it cannot.
- Local data must have one owner that clears it when the session ends.

## Considered Options

- Platform credential stores, with every other store behind one module and structural import
  boundaries
- Tokens in general storage, guarded by a key-name scan
- Tokens encrypted in application code before they reach general storage

## Decision Outcome

Chosen option: "Platform credential stores, with every other store behind one module and structural
import boundaries", because it puts credentials where script or plain files cannot reach them and
turns the rule into an import graph a tool can check.

On the web:

- Credentials live only in httpOnly cookies set by the server; with the bff-auth module, the BFF
  sets them ([0073](0073-bff-auth-module.md)). No token sits in script-readable storage, in
  JavaScript state or in a URL.
- Browser storage is used only through one storage module whose keys are typed and never hold credentials
  and clears them at session end.
- `sessionStorage` is banned everywhere. OWASP's HTML5 guidance prefers it to `localStorage` when
  persistence is not needed, but neither may hold credentials, and one API with one explicit
  clear-at-sign-out lifecycle is simpler to review. This is a documented simplification.

On mobile:

- expo-secure-store is the only credential store. One credential wrapper module imports it, and
  only the API client and the auth context import that wrapper; tokens never live in component
  state, context values, the server-state cache or a client store.
- Every unencrypted key-value store (`@react-native-async-storage/async-storage`,
  `expo-sqlite/kv-store`, `expo-sqlite/localStorage/install`, `react-native-mmkv`) is importable
  only from `storage/`, which exposes typed, non-credential keys.
- Every API call sends `Authorization: Bearer` with the secure-store token, and no cookie
  credentials.
- A 401 from any call except login (matched exactly) ends the session: the token, the server-state
  cache ([0063](0063-client-state-layering.md)) and the device's push registration are cleared, and
  the registered unauthorized handler runs ([0048](0048-http-status-vocabulary.md)).
- A Laravel API that issues its own bearer tokens declares its token login route in the manifest;
  it then returns the token at a documented response path, revokes the current token on logout
  and gives tokens a finite expiration at or below a configured bound. An API that authenticates
  through cookie sessions, Passport or an external identity provider declares no login route, and
  these rules do not apply to it.
- The native token strategy (lifetime, refresh or re-login, revocation, and what happens on first
  launch after a reinstall) is recorded in a project ADR and verified end to end (login, expiry,
  refresh, logout) against a live backend.

**Brownfield.** Existing mobile imports go into dependency-cruiser's known-violations file, which is
shrink-only. Existing web storage access is not bulk-suppressed: each use is a dated allowlist entry
that names its migration ([0005](0005-explicit-exceptions.md)), because a silent suppression would
hide a Tier-1 breach.

### Consequences

- Good, because an injected script cannot read a credential on the web, and a copied app data
  directory holds no plain-text token on mobile.
- Good, because the checks follow resolved imports, so renaming a key changes nothing.
- Good, because sign-out and a 401 clear everything the session left behind.
- Bad, because the secure store is small (some iOS releases refused values above about 2 KB) and
  absent on web, so it holds tokens only.
- Bad, because iOS keychain entries can survive a reinstall, which the token strategy must handle.
- Bad, because web apps lose `sessionStorage` even for harmless per-tab data.

### Confirmation

- The mobile key-value boundary is a dependency-cruiser rule over the resolved import graph
  (static, dynamic and `require` imports). FORCED.
- The secure-store confinement is a dependency-cruiser rule. GUARDED, because a caller allowed to
  read the token can still copy it into state.
- `cross-stack/no-web-storage`, a scope-aware rule, flags the `localStorage` and `sessionStorage`
  globals and member access to them (identifier or literal key) outside the storage module, and
  `sessionStorage` everywhere. GUARDED, because computed property names built at runtime evade it,
  and values written under a non-credential key are not inspected.
- Contract tests shipped with the mobile API client assert the bearer header and the 401 handling,
  including an exactly matched login route. GUARDED.
- Clearing the push registration and the end-to-end token verification are Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Platform credential stores, with every other store behind one module and structural import boundaries

- Good, because it uses the platforms' own protections and a checkable import graph.
- Bad, because it needs a storage module and a credential wrapper in every app.

### Tokens in general storage, guarded by a key-name scan

- Good, because it needs no new modules.
- Bad, because the scan misses renamed keys, flags legitimate secure-store writes and leaves the
  token readable anyway.

### Tokens encrypted in application code before they reach general storage

- Good, because any store could then hold the ciphertext.
- Bad, because the key must live somewhere the app can read, usually the bundle, and it
  re-implements what the platform keystore already does ([0006](0006-stack-first.md)).

## More Information

- OWASP Session Management Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>; HTML5
  Security Cheat Sheet (local storage):
  <https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html>.
- expo-secure-store: <https://docs.expo.dev/versions/latest/sdk/securestore/>; AsyncStorage:
  <https://docs.expo.dev/versions/latest/sdk/async-storage/>; expo-sqlite key-value storage:
  <https://docs.expo.dev/versions/latest/sdk/sqlite/>.
- Web Storage API: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API>.
- Versions: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0012](0012-backend-authority.md), [0048](0048-http-status-vocabulary.md),
  [0063](0063-client-state-layering.md), [0073](0073-bff-auth-module.md).
- Governs: the credential-storage rules for web and mobile, the browser-storage and mobile
  key-value boundary rules, the mobile API-client authentication and 401 rules, and the backend
  bearer-token rules (token response path, logout revocation, finite expiration).
