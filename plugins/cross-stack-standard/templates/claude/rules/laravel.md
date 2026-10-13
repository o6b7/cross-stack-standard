---
paths:
  - "app/**/*.php"
  - "routes/**"
  - "database/**"
  - "config/**"
  - "tests/**"
---

<!--
cross-stack-standard v0.1.0
SPDX-License-Identifier: MIT
Copyright (c) 2026 Qusai Abdullah
Copied to .claude/rules/laravel.md by /cross-stack-standard:adopt and replaced by
/cross-stack-standard:upgrade. Keep project rules in a file of your own.
-->

# Laravel track: highest-value rules

Claude Code loads this file when Claude reads a file under `app/`, `routes/`, `database/`,
`config/` or `tests/`, not when it creates one; the Tier-1 invariants are also in the CLAUDE.md
block. Each line is a rule from the Standard's registry. Apply it, cite its ID, and use the
`cross-stack-standard` skill for everything else on the track.

Status: in this version of the kit every rule below is REVIEW, guidance that you and code review
apply. Each has a planned gate; the registry marks none of them FORCED or GUARDED yet, so never
report one as enforced by a gate.

## Tier 1: every project

- SEC-005: Require authentication on every non-public API route.
- SEC-003: Declare `authorize()` in every FormRequest and never return a constant true from it.
- SEC-004: Resolve every non-public route to an existing policy ability, and allowlist public
  routes.
- SEC-013: Persist only validated input in write actions, never raw request input.
- SEC-006: Rate-limit every unauthenticated API route with a bounded limiter.
- SEC-012: Expose no exception message, class or trace in error responses when debug is off.
- SEC-011 (once the API has a token login route): Give access tokens a finite expiration at or
  below the configured bound.
- BE-001: Declare `strict_types=1` in every namespaced PHP file.
- BE-003: Pass Larastan at the project's level, with every parameter, return and property typed.
- BE-005: Never let the PHPStan baseline grow.
- BE-098: Write every inline PHPStan suppression as `@phpstan-ignore` with an identifier and a
  reason.

## Tier 2: when the manifest declares tier 2

- BE-017: Route every request to a controller action; no route closures.
- BE-018: Type the input of every POST, PUT and PATCH action as a FormRequest.
- BE-019: Keep validation in FormRequests; no inline validation in the HTTP layer.
- BE-049: Serialize models only through API Resources in the HTTP layer.
- BE-054: Paginate every list (index) route.
- BE-033: Implement every Action as an invokable class in `App\Actions`.

## Modules: when the module is on

- BE-027 (api-contract): Render every API exception as RFC 9457 problem details from one
  renderer, with errors on 422.
- I18N-001 (i18n): Take user-visible server messages from translation keys, never literal
  sentences.
- SEC-015 (tenancy): Apply the tenant scope to every model whose table has the tenant column,
  with no exceptions.
