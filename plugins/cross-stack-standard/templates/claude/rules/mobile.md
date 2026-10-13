---
paths:
  - "app/**"
  - "src/**/*.{ts,tsx}"
---

<!--
cross-stack-standard v0.1.0
SPDX-License-Identifier: MIT
Copyright (c) 2026 Qusai Abdullah
Copied to .claude/rules/mobile.md by /cross-stack-standard:adopt and replaced by
/cross-stack-standard:upgrade. Keep project rules in a file of your own.
-->

# Mobile track: highest-value rules

Claude Code loads this file when Claude reads a file under the Expo Router `app/` directory or a
TypeScript file under `src/`, not when it creates one; the Tier-1 invariants are also in the
CLAUDE.md block. Each line is a rule from the Standard's registry. Apply it, cite its ID, and use
the `cross-stack-standard` skill for everything else on the track.

Status: in this version of the kit every rule below is REVIEW, guidance that you and code review
apply. A rule marked "review rule" stays that way by design; the others have a planned gate. The
registry marks none of them FORCED or GUARDED yet, so never report one as enforced by a gate.

## Tier 1: every project

- SEC-049 (review rule): Keep auth tokens only in the OS secure store and credentials out of the
  storage module.
- SEC-050: Import unencrypted key-value stores only from the storage module.
- SEC-052: Import the secure store only in the credential wrapper, used only by the API client and
  auth.
- SEC-053: Send the secure-store bearer token and JSON Accept and locale headers on every API
  request.
- SEC-058 (review rule): Use client permission checks only to hide or disable UI, and authorize
  every action on the server.
- WEB-021: Write no explicit `any`, form edit state and view-model bridges included.
- MOB-027: Ban TypeScript suppression comments except a described `@ts-expect-error`.
- MOB-026: Type-check every JavaScript track in TypeScript strict mode.

## Tier 2: when the manifest declares tier 2

- MOB-013: Keep server data only in the server-state cache: API access flows through query hooks.
- MOB-014: Create exactly one query client, in the query provider module.
- MOB-016: Normalize API failures in one module; screens never read raw HTTP statuses or bodies.
- MOB-017: Map every error response to a typed app-error kind per the configured format and
  statuses.
- MOB-011: Import through the root path alias; no parent-relative imports.
- SEC-054: Clear the token and call the unauthorized handler on a 401 from any call except login.
- UI-019: Declare an accessibility role on every touchable.

## Modules: when the module is on

- MOB-019 (api-contract): Take backend resource and enum types from the generated, committed API
  contract.
- I18N-013 (i18n): Use logical properties in style objects, never physical left and right.
- I18N-029 (i18n, Tier 2): Change layout direction and reload for a language only in the
  `setAppLanguage()` utility.
- I18N-030 (i18n, Tier 2): Declare every configured locale in `supportedLocales` and never set
  `supportsRTL` or `forcesRTL`.
