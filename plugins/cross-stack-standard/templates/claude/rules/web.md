---
paths:
  - "src/**/*.{ts,tsx}"
  - "app/**"
---

<!--
cross-stack-standard v0.1.0
SPDX-License-Identifier: MIT
Copyright (c) 2026 Qusai Abdullah
Copied to .claude/rules/web.md by /cross-stack-standard:adopt and replaced by
/cross-stack-standard:upgrade. Keep project rules in a file of your own.
-->

# Web track: highest-value rules

Claude Code loads this file when Claude reads a TypeScript file under `src/` or a file under the
Next.js `app/` directory, not when it creates one; the Tier-1 invariants are also in the
CLAUDE.md block. Each line is a rule from the Standard's registry. Apply it, cite its ID, and use
the `cross-stack-standard` skill for everything else on the track. Rules marked "Next.js" apply
only to the `next` profile.

Status: in this version of the kit every rule below is REVIEW, guidance that you and code review
apply. A rule marked "review rule" stays that way by design; the others have a planned gate. The
registry marks none of them FORCED or GUARDED yet, so never report one as enforced by a gate.

## Tier 1: every project

- SEC-034 (Next.js): Re-verify the session in every Route Handler and Server Action, and
  authorize in the backend.
- SEC-058 (review rule): Use client permission checks only to hide or disable UI, and authorize
  every action on the server.
- SEC-047: Write no raw HTML sinks such as `dangerouslySetInnerHTML`, `innerHTML` or
  `document.write`.
- SEC-046: Use browser storage only through the storage module, and `sessionStorage` never.
- SEC-045 (Next.js): Resolve Next.js at or above the Standard's security floor.
- UI-005: Style with one system: no preprocessor stylesheets, CSS-in-JS modules or `<style jsx>`
  blocks.
- WEB-021: Write no explicit `any`, form edit state and view-model bridges included.
- MOB-027: Ban TypeScript suppression comments except a described `@ts-expect-error`.
- PROC-016: Describe the reason in every ESLint disable directive.

## Tier 2: when the manifest declares tier 2

- WEB-011: Read environment variables only through the typed, schema-validated env module.
- WEB-012: Never paginate a server page on the client.
- WEB-014 (review rule): Keep server data only in the server-state cache, never in a client
  store.
- WEB-033: Define query keys in per-domain `queryOptions()` factories, never as inline arrays
  outside hooks.
- WEB-005: Import another feature only through its `hooks/` or `lib/`, never its `components/`.
- SEC-031 (Next.js): Import `server-only` in every module under the configured server paths.
- UI-003: Use design tokens, never raw color literals.

## Modules: when the module is on

- WEB-018 (api-contract): Use the generated contract types for every wire shape; never redeclare
  one by hand.
- SEC-035 (bff-auth, Next.js): Refuse cross-site, missing and null origins on mutating requests in
  the same-origin check.
- I18N-012 (i18n): Use logical-direction utility classes, never physical left and right.
- I18N-016 (i18n): Put user-facing copy in message files, not JSX literals.
