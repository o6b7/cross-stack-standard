<!-- cross-stack-standard:begin -->
<!-- markdownlint-disable MD041 -->
<!--
cross-stack-standard v0.0.0
SPDX-License-Identifier: MIT
Copyright (c) 2026 Qusai Abdullah
Managed block: /cross-stack-standard:upgrade rewrites everything between the markers.
-->

## Cross-Stack Standard

This project follows the Cross-Stack Standard: one engineering standard for Laravel JSON APIs,
Next.js and React web apps and Expo mobile apps. `.cross-stack/standard.json` declares the
project's tracks, tier and modules. `.claude/rules/` holds each track's key rules, which load
when you read a matching file.

- Use the `cross-stack-standard` skill before modifying application code, small changes included.
- Tier 1 applies to every project, Tier 2 when the manifest declares `"tier": 2`. If it declares
  no tier, ask the user; never assume one.
- Name the rule ID you are applying (for example SEC-005) and cite IDs instead of restating rules.

### Tier-1 invariants

1. Stack-first: use the installed library for each concern; never add a competing one (PROC-006, PROC-007).
2. Server authority: the backend authenticates and authorizes every action; client checks only hide UI (SEC-005, SEC-004, SEC-058).
3. Credentials are short-lived, revocable and never readable by scripts (SEC-011, SEC-036, SEC-049).
4. Untrusted input is hardened at the boundary: validated writes, no raw HTML sinks, rate limits (SEC-013, SEC-047, SEC-006).
5. One generated wire contract when `api-contract` is on; never redeclare a wire shape by hand (BE-027, WEB-018, MOB-019).
6. Secrets and the supply chain are protected: commit no secret, pin tools, audit dependencies (SEC-063, SEC-065, CI-008).
7. The project is declared and green: a schema-valid manifest, and the fast check passes before you stop (PROC-001, PROC-022).
8. Gates are never weakened: fix the code or add a dated allowlist entry; ask before editing gate files (PROC-012, PROC-013, PROC-014).
9. Locale contract when `i18n` is on: copy in message files, locales in parity, logical directions (I18N-016, I18N-033, I18N-012).
10. Tenant isolation when `tenancy` is on: the tenant comes from the authenticated user and every model is scoped (BE-075, SEC-015).

### Checks

- While working, run the fast check in each track's directory: `composer run-script check:fast`
  (Laravel) or `npm run check:fast` (web, mobile). When the script exists, the Stop hook also
  runs it at the end of each turn.
- Before you report work as done, re-read the diff, run the full `check` script the same way and
  paste its real output verbatim (PROC-021). Never claim that a check you did not run has passed;
  if a script does not exist yet, say so.
- `node .cross-stack/bin/cross-stack.mjs list-checks` lists the Standard's own project checks.

### Enforcement labels

Each rule has a label: FORCED (a gate fails the build on every violation), GUARDED (a gate fails
the direct form; known evasions are listed) or REVIEW (no gate yet; you and code review apply it).
A rule is REVIEW unless the registry labels it FORCED or GUARDED, and most REVIEW rules have a gate
planned. Apply REVIEW rules as binding guidance; never tell the user a rule is enforced by a gate
unless the registry says so.

### Opting out

Opting out is the user's decision, never yours, and the Standard's hook asks before an edit that
opts out. The user can turn the Standard's hooks off for this project with the opt-out line in
`CLAUDE.md` or by setting `disabled` to `true` in `.cross-stack/standard.json`, or for one session
with `CROSS_STACK_STANDARD_DISABLE=1`. The Standard's configuration guide gives the exact forms.

<!-- cross-stack-standard:end -->
