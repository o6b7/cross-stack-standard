<!-- Hand-maintained index. Keep it in step with the records: add a row with every new record and
update the status column when a record's front matter changes. -->

# Decision records

Every rule of the Cross-Stack Standard cites one of these records. Each record states the
problem, the options that were considered, the option chosen and why, and how compliance is
checked. Records follow the [MADR 4.0.0](https://adr.github.io/madr/) template and the
conventions in [0001](0001-record-architecture-decisions.md).

- **Numbers are stable.** A number is never reused. A record that is replaced keeps its file, and
  its status becomes `superseded by NNNN`.
- **Status.** A `proposed` record names a recommended option that the maintainer has not yet
  accepted; an `accepted` record is settled. The status lives in each record's front matter; the
  column below mirrors it.
- **Rules.** The `decision` field of every rule in `registry/rules.json` names exactly one record,
  and `node scripts/check-registry.mjs` checks that it exists. The generated
  [rule index](../rules/README.md) lists the rules.
- **Adding a record.** Take the next free number, name the file `NNNN-title-with-dashes.md`, start
  with `status: proposed`, and add a row to the table for its section.

108 records: 96 accepted, 10 proposed, 2 superseded.

## Foundations

| Number                                        | Title                                                                                                  | Status   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions as MADR records that every rule cites                                    | Accepted |
| [0002](0002-gates-over-guidelines.md)         | Gates over guidelines: FORCED, GUARDED and REVIEW honesty labels                                       | Accepted |
| [0003](0003-rule-registry.md)                 | One rule registry is the single source of truth                                                        | Accepted |
| [0004](0004-fail-then-pass.md)                | Fail-then-pass: every gate is proven against a clean and a violation fixture                           | Accepted |
| [0005](0005-explicit-exceptions.md)           | Exceptions are explicit: dated allowlist entries, shrink-only baselines and described disable comments | Accepted |
| [0006](0006-stack-first.md)                   | Stack-first: the installed library wins; Standard enforcement tools are pre-exempted                   | Accepted |
| [0007](0007-one-mechanism-per-concern.md)     | One declared mechanism per cross-cutting concern                                                       | Accepted |
| [0008](0008-tiers-and-invariants.md)          | Tier model: at most ten Tier-1 invariants; Tier 2 by declared criteria                                 | Accepted |
| [0009](0009-tracks-profiles-and-scope.md)     | Tracks, profiles and scope: laravel, web and mobile; unruled areas declared                            | Accepted |
| [0010](0010-opt-in-modules.md)                | Opt-in modules declared in the project manifest, installed as whole units                              | Accepted |
| [0011](0011-default-module-set.md)            | Default module set                                                                                     | Accepted |
| [0012](0012-backend-authority.md)             | The backend is authoritative; clients mirror the contract and defer business rules                     | Accepted |
| [0013](0013-dry-policy.md)                    | DRY policy: rule of three, extract at two for business rules, one-caller abstractions are defects      | Accepted |
| [0014](0014-working-procedure.md)             | Working procedure: name the rule, stop and ask in unknown territory, report real gate output           | Accepted |

## Distribution, runtime and repository maintenance

| Number                                            | Title                                                                                                             | Status                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [0015](0015-plugin-distribution.md)               | Distribution as a Claude Code plugin from an in-repo marketplace, enabled per repository                          | Accepted                                                      |
| [0016](0016-self-contained-plugin-runtime.md)     | The installed plugin is self-contained: generated runtime data, Node built-ins only                               | Accepted                                                      |
| [0017](0017-vendored-gate-packages.md)            | Gate code reaches adopters by vendoring in 1.0; packages stay publish-ready                                       | Accepted                                                      |
| [0018](0018-project-detection.md)                 | Project detection: manifest first, a bounded fallback that emits every track, explicit opt-out                    | Accepted                                                      |
| [0019](0019-hook-runtime-contract.md)             | Hook runtime contract: one Node entry point that honours opt-out, stays offline, fails open and is fixture-tested | Accepted                                                      |
| [0020](0020-feedback-hooks.md)                    | Feedback hooks: per-file lint after edits and a blocking fast Stop gate, on by default                            | Accepted                                                      |
| [0021](0021-gate-file-protection.md)              | Gate-file protection: PreToolUse ask, permission rules and CODEOWNERS, labelled GUARDED                           | Accepted                                                      |
| [0022](0022-context-budget.md)                    | Context budget and deterministic loading: minimal always-on text, path-scoped rule templates, rules cited by ID   | Accepted                                                      |
| [0023](0023-adopter-manifest-and-upgrade.md)      | Adopter manifest, adopt and upgrade                                                                               | Accepted                                                      |
| [0024](0024-versioning.md)                        | Versioning the Standard: one VERSION, stamped and drift-checked; SemVer defined by adopter build impact           | Accepted                                                      |
| [0025](0025-release-tooling.md)                   | Release tooling: a manual release flow with a stamp script; release-please and Changesets rejected                | Accepted                                                      |
| [0026](0026-no-early-access-channel.md)           | No early-access channel in 1.0: releases and tag pins only                                                        | Accepted                                                      |
| [0027](0027-branching-model.md)                   | Branching model: main stable and default, dev integration, release and hotfix branches                            | Accepted                                                      |
| [0028](0028-license.md)                           | License: MIT                                                                                                      | Accepted                                                      |
| [0029](0029-code-of-conduct.md)                   | Code of conduct: Contributor Covenant 3.0                                                                         | Accepted                                                      |
| [0030](0030-maintainers-brand-guard.md)           | Maintainers: keyed-HMAC brand guard on every publishing channel                                                   | Accepted                                                      |
| [0031](0031-maintainers-repository-ci.md)         | Maintainers: repository CI and settings with one aggregate required check, pinned tools and smoke runs on dev     | Accepted                                                      |
| [0032](0032-supply-chain-pinning.md)              | Supply-chain pinning: nothing fetched at a moving ref                                                             | Accepted                                                      |
| [0033](0033-maintainers-dependency-updater.md)    | Maintainers: this repository's dependency updater is Renovate without automerge                                   | Accepted                                                      |
| [0034](0034-design-module.md)                     | design module: impeccable as an optional, pinned integration                                                      | Superseded by [0106](0106-companion-plugins.md)               |
| [0035](0035-browser-check-module.md)              | browser-check module: Chrome DevTools MCP as an opt-in, pinned, privacy-configured template                       | Superseded by [0106](0106-companion-plugins.md)               |
| [0106](0106-companion-plugins.md)                 | Companion plugins: caveman, impeccable, Figma MCP and Chrome DevTools MCP, pinned and offered at adoption         | Extended by [0108](0108-playwright-mcp-for-browser-checks.md) |
| [0107](0107-pre-1-0-rule-promotion.md)            | Pre-1.0 releases may promote default-on REVIEW rules; 1.0 requires target levels                                  | Accepted                                                      |
| [0108](0108-playwright-mcp-for-browser-checks.md) | Playwright MCP for routine browser checks; Chrome DevTools MCP for advanced diagnostics                           | Accepted                                                      |

## Laravel track, with the api-contract and tenancy modules

| Number                                               | Title                                                                                                        | Status   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| [0036](0036-pest-replaces-phpunit-runner.md)         | Pest replaces the PHPUnit runner; architecture presets                                                       | Accepted |
| [0037](0037-phpstan-rules-and-reflection-tests.md)   | Rules arch() cannot express: custom PHPStan rules and framework-reflection tests                             | Accepted |
| [0038](0038-larastan-levels-shrink-only-baseline.md) | Larastan levels with a shrink-only baseline                                                                  | Accepted |
| [0039](0039-backend-testing-floor.md)                | Backend testing floor: meta-tests, invariant-named scenarios and security suites that fail when empty        | Accepted |
| [0040](0040-backend-layering.md)                     | Backend layering: thin controllers, disciplined services, no repositories                                    | Accepted |
| [0041](0041-action-pattern.md)                       | One sanctioned Action pattern for reusable multi-step writes                                                 | Accepted |
| [0042](0042-api-routing.md)                          | API routing: URI-versioned, resourceful and controller-only                                                  | Accepted |
| [0043](0043-single-authorization-site.md)            | Authorization: a single site and a single policy ability for each endpoint                                   | Accepted |
| [0044](0044-form-request-validation.md)              | Request validation: Store and Update FormRequests; wire names equal storage names                            | Accepted |
| [0045](0045-resources-only-serialization.md)         | API Resources are the only model-to-JSON layer                                                               | Accepted |
| [0046](0046-enums-on-the-wire.md)                    | Enums: string-backed, value-only on the wire, no presentation data                                           | Accepted |
| [0047](0047-model-conventions.md)                    | Model conventions: a complete mass-assignment posture, casts() and race-safe generated codes                 | Accepted |
| [0048](0048-http-status-vocabulary.md)               | HTTP status vocabulary                                                                                       | Accepted |
| [0049](0049-server-driven-collections.md)            | Server-driven collections: declared filters and sorts, capped pages, no client pagination over a server page | Accepted |
| [0050](0050-rate-limiting.md)                        | Every unauthenticated and every mutating API route is rate-limited                                           | Accepted |
| [0051](0051-health-endpoints.md)                     | Health endpoints: a public liveness route, readiness behind operator authorization                           | Accepted |
| [0052](0052-api-success-shape.md)                    | API success shape: Resource by default, a documented envelope as an option, never double-wrapped             | Accepted |
| [0053](0053-rfc-9457-problem-details.md)             | Errors as RFC 9457 problem details with an errors extension for validation                                   | Accepted |
| [0054](0054-generated-api-contract.md)               | Generated API contract: OpenAPI to committed TypeScript types, drift-checked in CI                           | Accepted |
| [0055](0055-background-jobs.md)                      | Background job conventions: queue slow work, pass identifiers, declare a retry policy                        | Accepted |
| [0056](0056-polling-before-push.md)                  | Live data by polling first; push channels only by ADR                                                        | Accepted |
| [0057](0057-tenancy-module.md)                       | Tenancy module: model-level scoping verified against the migrated schema, failing closed                     | Accepted |
| [0058](0058-background-tenant-context.md)            | Background contexts pin the tenant or declare cross-tenant access                                            | Accepted |

## Web track, with the bff-auth module

| Number                                               | Title                                                                                                                     | Status   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| [0059](0059-javascript-toolchain-pins.md)            | JavaScript toolchain pins: ESLint 9.39, TypeScript below 6.1, Node 22.13 or later, Expo SDK 57                            | Accepted |
| [0060](0060-javascript-lint-baseline.md)             | JavaScript lint baseline: strict type-checked rules, formatter check, size and complexity limits, accessibility as errors | Accepted |
| [0061](0061-own-eslint-plugin-no-commented-code.md)  | Own MIT ESLint plugin; no-commented-code written in-house                                                                 | Accepted |
| [0062](0062-frontend-layer-boundaries.md)            | Frontend layer boundaries: one-way dependencies, machine-enforced                                                         | Accepted |
| [0063](0063-client-state-layering.md)                | Client state layering: server cache, URL state, local state; no global store mandate                                      | Accepted |
| [0064](0064-query-key-factories-and-url-state.md)    | Query-key factories with queryOptions() and one URL-state idiom                                                           | Accepted |
| [0065](0065-ui-primitives-and-request-states.md)     | UI primitives: shared focus and overlay utilities, i18n-decoupled, accessible; shared request-state components            | Accepted |
| [0066](0066-design-tokens.md)                        | Design tokens are the single styling source                                                                               | Accepted |
| [0067](0067-forms.md)                                | Forms: installed form library first, required client validation, server field errors mapped to fields                     | Accepted |
| [0068](0068-frontend-testing.md)                     | Frontend testing: targeted logic tests, colocated, one E2E journey with accessibility checks                              | Accepted |
| [0069](0069-typed-env-module.md)                     | Typed environment module per JavaScript app; raw process.env banned by a three-rule combination                           | Accepted |
| [0070](0070-proxy-ux-only-session-reverification.md) | Proxy redirects are UX only; every Route Handler and Server Action checks the session again                               | Accepted |
| [0071](0071-nextjs-security-floor.md)                | Next.js security floor in one data file, gate-enforced                                                                    | Accepted |
| [0072](0072-nextjs-16-only.md)                       | Supported Next.js line: 16.x only                                                                                         | Accepted |
| [0073](0073-bff-auth-module.md)                      | bff-auth module: a cookie-based BFF for Next.js in front of a bearer-token API                                            | Accepted |
| [0074](0074-bff-csrf-defense.md)                     | CSRF defense for the cookie BFF: same-origin checks, SameSite cookies, side-effect-free GETs                              | Accepted |
| [0075](0075-react-spa-profile-after-1-0.md)          | React SPA profile ships after 1.0                                                                                         | Accepted |

## Mobile track

| Number                               | Title                                                                                     | Status   |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | -------- |
| [0076](0076-mobile-app-structure.md) | Mobile app structure: folder contract, text primitives and token styling enforced by lint | Accepted |

## Internationalization and right-to-left layouts

| Number                                          | Title                                                                                                            | Status   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| [0077](0077-i18n-module.md)                     | i18n module: configurable locales, server-localized messages, no half-state                                      | Accepted |
| [0078](0078-labels-and-multilingual-content.md) | Labels render from message files; user-entered multilingual content goes through one helper                      | Accepted |
| [0079](0079-web-locale-routing.md)              | Web locale routing: always-prefixed URLs, no auto-detection, one navigation mechanism                            | Accepted |
| [0080](0080-locale-parity.md)                   | Locale file parity: keys, empty values, untranslated copies, placeholders and plural categories                  | Accepted |
| [0081](0081-logical-direction-styling.md)       | Logical-direction styling for right-to-left layouts                                                              | Accepted |
| [0082](0082-mobile-rtl-contract.md)             | Mobile RTL contract: OS per-app language first, one setAppLanguage() fallback, direction changed only through it | Accepted |

## Security, quality and workflow

| Number                                                | Title                                                                                                                     | Status   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| [0083](0083-credential-and-client-storage.md)         | Credential and client storage per platform                                                                                | Accepted |
| [0084](0084-secret-scanning-and-dependency-audits.md) | Secret scanning and dependency audits in pre-commit and CI                                                                | Accepted |
| [0085](0085-environment-files.md)                     | Environment files: curated examples without secrets, every key documented                                                 | Accepted |
| [0086](0086-no-raw-html-sinks.md)                     | No raw HTML sinks; a sanitizer path only by ADR                                                                           | Accepted |
| [0087](0087-file-uploads.md)                          | File uploads: declared upload requests, validated types, ownership-based access, ids instead of URLs                      | Accepted |
| [0088](0088-structured-redacted-logging.md)           | Structured and redacted logging                                                                                           | Accepted |
| [0089](0089-formatter-config-and-strict-types.md)     | Formatter configuration is explicit and pinned; PHP declares strict types                                                 | Accepted |
| [0090](0090-ci-contract.md)                           | CI contract: a reusable per-track workflow that runs exactly the check members                                            | Accepted |
| [0091](0091-coverage-floors.md)                       | Coverage floors per track: configurable, measured at adoption, ratchet-only                                               | Accepted |
| [0092](0092-dead-code-and-duplication-gates.md)       | Dead code and duplication gates: knip and jscpd with shrink-only baselines                                                | Accepted |
| [0093](0093-todo-policy.md)                           | TODO policy: only ticket-referenced markers                                                                               | Accepted |
| [0094](0094-developer-workflow-templates.md)          | Developer workflow templates: pre-commit hooks, Conventional Commits, a real-output PR template, CODEOWNERS on gate files | Accepted |
| [0095](0095-adopter-dependency-updates.md)            | Adopter dependency updates: a Renovate template, with Dependabot documented                                               | Accepted |

## Planned after 1.0

| Number                                        | Title                                                                                           | Status   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| [0096](0096-explicit-intl-formatting.md)      | Explicit Intl formatting: calendar and numbering system always passed; one shared formatter     | Proposed |
| [0097](0097-translatable-content-storage.md)  | Translatable content storage: per-locale columns or JSON translations, never mixed in one model | Proposed |
| [0098](0098-migration-safety.md)              | Migration safety: expand and contract; destructive operations allowlisted                       | Proposed |
| [0099](0099-observability-module.md)          | Observability module: error tracking across stacks with request ids and personal-data scrubbing | Proposed |
| [0100](0100-sast-template.md)                 | Static application security testing template: Semgrep, with CodeQL as a JS/TS option            | Proposed |
| [0101](0101-maestro-on-device-flows.md)       | Mobile on-device E2E flows with Maestro, including an RTL flow                                  | Proposed |
| [0102](0102-web-performance-budgets.md)       | Web performance budgets: Lighthouse CI and size-limit                                           | Proposed |
| [0103](0103-mutation-testing.md)              | Mutation testing on domain logic with Pest                                                      | Proposed |
| [0104](0104-org-rollout-tooling.md)           | Organization rollout tooling: rulesets as code and an adoption dashboard                        | Proposed |
| [0105](0105-architecture-tool-evaluations.md) | Evaluations: Deptrac, React Compiler and eslint-plugin-boundaries                               | Proposed |
