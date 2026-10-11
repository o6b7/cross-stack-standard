# Mobile track

The `mobile` track covers an Expo / React Native app that talks to the same API as the web client:
its folder contract, server state, API client and error handling, credential storage, accessible
primitives and the right-to-left contract.

> **Status in 0.1.0.** 52 mobile rules and 44 rules shared with the web track, all REVIEW. Of the
> mobile rules, 13 target FORCED, 32 target GUARDED and 7 stay REVIEW; 9 are Tier 1. Claude follows
> them through the skill and `/cross-stack-standard:audit` reports them. The gates below are
> planned, not shipped; see the [roadmap](../../ROADMAP.md). Full lists:
> [mobile rules](../rules/mobile.md) and [web and mobile rules](../rules/client.md).

## What the planned gates target

| Tool       | Target                                                                                                | Decision                                               |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Expo       | SDK 57; the SDK 58 decision is made when mobile gate work starts, because it changes the RTL defaults | [0059](../decisions/0059-javascript-toolchain-pins.md) |
| ESLint     | 9.39.x with `eslint-config-expo`, run as `eslint` at zero warnings                                    | [0059](../decisions/0059-javascript-toolchain-pins.md) |
| TypeScript | `~6.0.3` (the SDK 57 pin), strict mode                                                                | [0059](../decisions/0059-javascript-toolchain-pins.md) |
| Node.js    | 22.13 or later                                                                                        | [0059](../decisions/0059-javascript-toolchain-pins.md) |

Exact versions and their sources are in [verified-versions.md](../maintainers/verified-versions.md).

## The architecture in one paragraph

The source tree follows a folder contract, to be checked by lint as the mobile gates ship: route
files default-export their screen,
contexts live in `contexts/`, hooks in `hooks/` and `contexts/`, and `utils/`, `constants/` and
`types/` hold plain TypeScript ([ADR 0076](../decisions/0076-mobile-app-structure.md)). Server data
lives only in the server-state cache, reached through query hooks, with one query client
([ADR 0063](../decisions/0063-client-state-layering.md)). One API client unwraps responses and
normalizes every failure into a typed error kind covering the whole status vocabulary, 409 and 429
included ([ADR 0048](../decisions/0048-http-status-vocabulary.md)). Tokens live only in the OS
secure store behind one credential wrapper, and unencrypted key-value stores are importable only
from the storage module ([ADR 0083](../decisions/0083-credential-and-client-storage.md)). Text and
inputs go through shared primitives, and styles through tokens.

## Key rules

| Area                    | Rules (target)                                                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure               | MOB-001 folder contract (FORCED), MOB-002 route files default-export (FORCED), MOB-003 contexts only in `contexts/` (FORCED), MOB-011 root alias imports (FORCED), MOB-010 file-name case (FORCED)                                                                                       |
| State and data          | MOB-008 no server-state library in route files (FORCED), MOB-013 API access through query hooks (GUARDED), MOB-014 one query client (FORCED)                                                                                                                                             |
| API client and errors   | MOB-016 normalize failures in one module (GUARDED), MOB-017 typed error kinds (GUARDED), MOB-022 static env reads (GUARDED)                                                                                                                                                              |
| Storage and credentials | SEC-050 key-value stores only from the storage module (FORCED), SEC-052 secure store only in the credential wrapper (GUARDED), SEC-049 tokens only in the secure store (REVIEW), SEC-053 token and locale headers on every request (GUARDED), SEC-054 clear the token on a 401 (GUARDED) |
| UI and accessibility    | UI-014 text primitives (GUARDED), UI-019 an accessibility role on every touchable (GUARDED), UI-017 one palette interface for light and dark (GUARDED)                                                                                                                                   |
| Shared with web         | WEB-021 no explicit `any` (FORCED), MOB-026 strict type-checking (GUARDED), WEB-025 file length (FORCED), WEB-027 no commented-out code (GUARDED), WEB-033 query-key factories (GUARDED)                                                                                                 |
| Quality                 | MOB-031 coverage floors (GUARDED), MOB-032 no dead code (GUARDED), MOB-033 no new clones (GUARDED), CI-005 `expo export` in the quality job (GUARDED)                                                                                                                                    |

## Modules on this track

| Module         | Mobile rules | What it adds                                                                                                                                                                                                                                                           |
| -------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n`         | 3            | `supportedLocales` without `supportsRTL` (I18N-030), direction changes only in `setAppLanguage()` (I18N-029), typed translation keys (I18N-031), plus the shared web and mobile parity and copy rules; see [Internationalization and RTL](../i18n-rtl.md#mobile-expo). |
| `api-contract` | 2            | Generated contract types (MOB-019) and one typed unwrap function, with no `.data.data` downstream (MOB-018).                                                                                                                                                           |
| `tenancy`      | 2            | The client never sends or reasons about the tenant id (MOB-025); the push token is re-registered when the tenant changes (MOB-029).                                                                                                                                    |

## Planned gate stack

- **ESLint** with `eslint-config-expo`, typed rules on TypeScript files and the Standard's own
  `cross-stack` plugin (for example `expo-route-default-export`, `touchable-has-role`,
  `no-raw-style-number` and `no-physical-direction`), at zero warnings
  ([ADR 0060](../decisions/0060-javascript-lint-baseline.md)).
- **dependency-cruiser** for structural rules such as the storage and credential boundaries and the
  route-file imports, with a shrink-only known-violations baseline for existing apps.
- **Project checks** for the folder contract, the Expo config and the tsconfig.
- **Jest tests** for the API client: headers, 401 handling and the error-kind mapping.
- **The shared parity checker** for locale files, with plural categories checked against
  `Intl.PluralRules`; its behaviour on the Hermes engine is verified on a device or emulator for the
  pinned SDK ([ADR 0080](../decisions/0080-locale-parity.md)).
- **knip, jscpd and coverage floors**, each with a shrink-only baseline, and an `expo export`
  bundle in the quality job ([ADR 0090](../decisions/0090-ci-contract.md)).

On-device flows with Maestro, including a right-to-left flow, are planned after 1.0
([ADR 0101](../decisions/0101-maestro-on-device-flows.md)).

## Working on this track in 0.1.0

- PostToolUse runs Prettier and then ESLint on each file Claude edits, with the project's installed
  versions.
- The Stop gate runs the `check:fast` npm script when `package.json` defines it. A good `check:fast` runs
  the type-check, ESLint at zero warnings, Prettier in check mode and the fast tests.
- Claude cites the rule IDs above as it works; `/cross-stack-standard:audit` reports an existing
  app against them.
