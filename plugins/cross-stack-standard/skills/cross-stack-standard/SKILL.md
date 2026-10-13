---
name: cross-stack-standard
description: "Applies the Cross-Stack Standard, an enforceable engineering standard for Laravel JSON APIs, Next.js and React web apps, and React Native / Expo mobile apps. Use when writing, changing or reviewing application code in a Laravel, Next.js, React, React Native or Expo project: a new feature, endpoint, screen, form, migration, policy, job, hook or test; a refactor; an architecture, layering or file-placement decision; a code review or audit; i18n, locales and RTL layouts; authentication, multi-tenancy or the API contract. Reads .cross-stack/standard.json to scope rules by track, tier and modules, applies stack-first library choices and the Tier-1 invariants, cites rule IDs from the rule registry, and requires real check output before work is reported done. Does not apply when a CLAUDE.md file carries the line cross-stack-standard: declined."
---

# Cross-Stack Standard

The Standard is a registry of rules. Each rule has an ID (`BE-`, `WEB-`, `MOB-`, `SEC-`, `I18N-`,
`UI-`, `PROC-` or `CI-` and three digits), a track, a tier, an optional module and an honesty label.
This skill tells you which rules apply to the project in front of you and how to work under them.
Cite rules by ID; do not restate them from memory. Titles and current labels are in
`${CLAUDE_PLUGIN_ROOT}/data/rules.json`; the full catalogue with rationale is the
[rule index][rules], and every rule cites a decision record (ADR).

## Honesty labels and the 0.1.0 status

- **FORCED**: a gate fails the build on every violation.
- **GUARDED**: a gate fails the build on the direct form; the registry lists the known evasions.
- **REVIEW**: no gate; the author and the reviewer apply the rule.

A label is never ahead of its gate ([ADR 0002][0002]).

In 0.1.0 the plugin ships its hooks, this skill, the user skills, the kit templates and the full
registry, but most rules are REVIEW guidance: each records a planned gate and a target level, and
the gates arrive in later 0.x releases. Therefore:

- Apply every rule in scope, whatever its label.
- Say a gate enforces a rule only when `enforcement` for that ID in
  `${CLAUDE_PLUGIN_ROOT}/data/rules.json` is FORCED or GUARDED. Otherwise write "guidance (REVIEW)
  in 0.1.0; gate planned".
- What runs in 0.1.0: the hooks (session-start detection, format and lint feedback after each edit,
  the `check:fast` Stop gate when the project has a manifest and defines that script, and a
  confirmation prompt before gate files are edited or a gate-weakening command runs) plus whatever
  checks the project itself defines.

## Step 0: standing

Do this before writing or changing application code ([ADR 0018][0018], [ADR 0009][0009],
[ADR 0023][0023]).

1. **Opt-out.** The line `cross-stack-standard: declined` in `CLAUDE.md`, `.claude/CLAUDE.md` or
   `CLAUDE.local.md` means the project declined the Standard: stop using this skill.
   `"disabled": true` in the manifest and `CROSS_STACK_STANDARD_DISABLE=1` turn off the hooks only;
   ask whether the rules still apply.
2. **Manifest.** Read `.cross-stack/standard.json` (schema:
   `${CLAUDE_PLUGIN_ROOT}/data/standard.schema.json`): `version`, `tracks` (`laravel`, `web`,
   `mobile`), `profile` (`next` by default, or `react-spa`), `tier` (`1` or `2`), `modules`
   (`tenancy`, `i18n`, `api-contract`, `bff-auth`, `design`, `browser-check`, `observability`) and
   `locales` (the first entry is the source locale).
3. **Managed block.** Read the block between `<!-- cross-stack-standard:begin -->` and
   `<!-- cross-stack-standard:end -->` in `CLAUDE.md` or `AGENTS.md`, and any `.claude/rules/*.md`
   files the kit copied. Where they disagree with the manifest, the manifest wins; point out the
   drift.
4. **Tier.** If `tier` is missing, ask the user. Do not assume. The Tier-1 invariants apply either
   way; offer the Tier-2 trigger below to help them decide.
5. **No manifest.** Detect the tracks yourself: a `composer.json` requiring `laravel/framework` is
   `laravel`; a `package.json` depending on `expo` or `react-native` is `mobile` (not also web); one
   depending on `next` or `react` is `web`. Check every directory, since monorepos have several
   tracks. Apply stack-first and the Tier-1 invariants for those tracks, ask for the tier, and
   suggest `/cross-stack-standard:adopt`, which writes and validates the manifest. Do not write the
   manifest by hand.
6. **Scope.** A rule applies when all of these hold:
   - its track is declared (`client` rules apply to web and mobile, `shared` rules to every
     project);
   - it is tier 1, or it is tier 2 and the project declares Tier 2;
   - its module, if it has one, is on;
   - its profile, if it has one, matches (Next.js-only rules carry `profiles: ["next"]`);
   - it is on by default. A rule with `defaultEnabled: false` waits for its per-rule switch, which
     the 0.1.0 manifest does not offer yet; treat it as advice unless the user asks for it.
7. **Companions.** Use a companion plugin (caveman, impeccable, Figma MCP, Playwright MCP, Chrome DevTools MCP)
   only when the session-start status line, or
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/companions.mjs" status --root . --data-dir "${CLAUDE_PLUGIN_DATA}"`,
   shows it `ready` or `unverified`, and only when the task needs it. Never claim a result from a
   companion that is not installed, was declined, or whose call failed: say so in one line and
   offer the fallback the status gives ([companions.md](references/companions.md)).

Read the references for what is in scope:

| In scope                                                    | Read                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Laravel track                                               | [laravel.md](references/laravel.md)                                                                      |
| Web track (Next.js; the React SPA profile)                  | [web.md](references/web.md)                                                                              |
| Mobile track (Expo / React Native)                          | [mobile.md](references/mobile.md)                                                                        |
| `api-contract` module, or any client of the API             | [api-contract.md](references/api-contract.md)                                                            |
| `tenancy` module                                            | [tenancy.md](references/tenancy.md)                                                                      |
| `i18n` module, locales, right-to-left layouts               | [i18n-rtl.md](references/i18n-rtl.md)                                                                    |
| `bff-auth` module, Next.js sessions                         | [bff-auth.md](references/bff-auth.md)                                                                    |
| Credentials, secrets, uploads, logging, supply chain        | [security.md](references/security.md)                                                                    |
| Companion plugins, `design` or `browser-check`, UI checks   | [companions.md](references/companions.md); `/cross-stack-standard:playwright` for routine browser checks |
| Adoption, upgrades, the manifest, CI and workflow templates | [adopting-and-upgrading.md](references/adopting-and-upgrading.md)                                        |

## Step 1: stack-first

Before writing code, read `composer.json` and every `package.json`, and fill this table for the
tracks in scope. The installed library owns its concern ([ADR 0006][0006], [ADR 0007][0007]).

| Concern      | Examples of what to look for                                      |
| ------------ | ----------------------------------------------------------------- |
| Styling      | Tailwind CSS, CSS Modules, a React Native theme module            |
| State        | Zustand, Redux Toolkit, Jotai, or none                            |
| Server state | TanStack Query, SWR                                               |
| Forms        | React Hook Form, TanStack Form, Formik, or plain controlled state |
| Validation   | Laravel FormRequests; Zod, Valibot or Yup on clients              |
| HTTP         | Laravel's HTTP client; the app's fetch wrapper, Axios or ky       |
| i18n         | Laravel lang files; next-intl; i18next with react-i18next         |
| Dates        | Carbon; `Intl`, date-fns, Day.js or Luxon                         |
| Test runner  | Pest; Vitest; Jest with jest-expo                                 |
| E2E          | Playwright; the mobile E2E tool the project uses                  |
| Icons        | lucide-react, `@expo/vector-icons` or the project's icon set      |
| Charts       | Recharts, Chart.js, Victory or the project's chart library        |
| Auth         | Sanctum, Fortify or Passport; Auth.js; the `bff-auth` module      |
| Env          | Laravel `config()`; the typed env module, `@t3-oss/env-nextjs`    |
| Logging      | Laravel's `Log` facade; the app's logger module                   |

- Use the installed library's idiomatic API first, then its documented escape hatch. Write code by
  hand only when neither can express the need, with a comment that names what the library could not
  do (PROC-006). Upgrade an outdated library instead of working around it.
- Never add a library that competes with an installed one, test runners included (PROC-007). A
  concern under migration keeps the old library inside its declared legacy paths; new code imports
  only the winner (PROC-008).
- A new runtime dependency lands with an ADR that names the alternatives considered (PROC-009).
- The Standard's gate tools are pre-exempted: Pest (it replaces the PHPUnit runner and runs existing
  PHPUnit classes, so it is not a second runner), Larastan, dependency-cruiser, knip, jscpd,
  lefthook, commitlint, gitleaks and the kit's vendored gate packages.
- Record the table (PROC-005). In 0.1.0 the manifest's `stack` section accepts only
  `competingGroups` and per-concern `deprecated` lists, so keep the full table in the pull request
  description until the schema gains it.

Details: [stack-first.md](references/stack-first.md).

## Tier 1: the ten invariants

Tier 1 applies to every adopting project ([ADR 0008][0008]). Invariants 5, 9 and 10 apply once their
module is on, and a rule that belongs to a module applies only with that module. Rule titles:
[tiers-and-invariants.md](references/tiers-and-invariants.md).

1. **Stack-first**: UI-005, PROC-005, PROC-006, PROC-007, PROC-008, PROC-009.
2. **Server authority**: SEC-003, SEC-004, SEC-005, SEC-034, SEC-058, PROC-010.
3. **Credentials are short-lived, revocable and never script-readable**: SEC-010, SEC-011, SEC-036,
   SEC-038, SEC-046, SEC-049, SEC-050, SEC-052, SEC-053.
4. **Untrusted input is hardened at the boundary**: SEC-001, SEC-002, SEC-006, SEC-012, SEC-013,
   SEC-014, SEC-035, SEC-047, SEC-067, SEC-068.
5. **One generated wire contract, when the api-contract module is on**: BE-025, BE-026, BE-027,
   BE-099, WEB-018, MOB-019, CI-006, CI-007, CI-017.
6. **Secrets and the supply chain are protected**: SEC-045, SEC-061, SEC-062, SEC-063, SEC-064,
   SEC-065, CI-008.
7. **The project is declared and green**: BE-001, BE-002, BE-003, BE-004, BE-013, WEB-021, WEB-022,
   WEB-024, WEB-030, MOB-026, MOB-031, I18N-009, PROC-001, PROC-002, PROC-003, PROC-021, PROC-022,
   CI-001, CI-002, CI-003, CI-004, CI-005, CI-009, CI-010, CI-011, CI-013.
8. **Gates are never weakened**: BE-005, BE-098, BE-107, MOB-027, PROC-011, PROC-012, PROC-013,
   PROC-014, PROC-015, PROC-016, PROC-017, PROC-018, PROC-025, PROC-026, PROC-027, PROC-031,
   PROC-032, PROC-033, PROC-034.
9. **The locale contract, when the i18n module is on**: I18N-001, I18N-003, I18N-006, I18N-007,
   I18N-012, I18N-013, I18N-015, I18N-016, I18N-019, I18N-027, I18N-031, I18N-033, I18N-034,
   I18N-035, I18N-036, I18N-037, I18N-039, I18N-040, I18N-042.
10. **Tenant isolation, when the tenancy module is on**: BE-061, BE-062, BE-067, BE-068, BE-075,
    BE-100, BE-101, BE-102, SEC-015, SEC-016, SEC-017, SEC-018, SEC-019, SEC-020, SEC-021, SEC-069.

## Tier 2

Tier 2 applies when the manifest declares `"tier": 2`. Its trigger is at least two of: the project
is multi-tenant, more than one developer works on it, it is long-lived. When two hold and the
manifest says `1`, say that declining Tier 2 needs a recorded reason (PROC-002). Tier 2 adds layer
tables, file placement, service discipline, frontend patterns and a numbered ADR log (PROC-019): the
tier-2 rules in each track reference.

## Working procedure

Follow these steps on every change ([ADR 0014][0014]).

1. **Name the rule.** State the pattern or rule ID you are following, in your plan and in the pull
   request (PROC-020).
2. **Unknown territory.** When no rule covers the change, or a reference says to stop and ask: read
   the installed library's documentation, name two options with their trade-offs, stop and ask the
   user, then record the outcome as an ADR.
3. **Self-check before claiming done** (PROC-021):
   - re-read the whole diff;
   - run the project's check scripts: `check:fast`, and the full `check` when the change warrants it
     (Composer and/or npm, per track); if the project defines neither, run the checks it has and say
     which;
   - paste their real output verbatim;
   - never claim a check passed without running it; if one could not run, name it and say why.
4. **Feedback loop.** Lint errors reported after an edit and a failing Stop gate come back to you
   (PROC-030, PROC-022). Fix the code; never weaken the gate.

Details: [working-procedure.md](references/working-procedure.md).

## DRY policy

Duplication is judged by what it encodes ([ADR 0013][0013]).

- **Rule of three.** Convenience extraction waits for the third copy (PROC-023).
- **Extract at two** when the copies encode a business rule that must not drift: a threshold, a
  status mapping, a price, an eligibility or permission condition (PROC-024).
- **A one-caller abstraction is a defect.** Inline a wrapper, helper, service, interface or Action
  that has a single call site (PROC-023). Classes the framework requires, such as a policy, a
  request class, a job or an API Resource, do not count.
- **One source for a rule rendered twice**, such as web and PDF, or web and native. The source is
  normally the backend, through the API or the generated contract (PROC-024).

## Process

Gates are proven and never weakened ([ADR 0004][0004], [ADR 0005][0005], [ADR 0021][0021]).

- **Fail-then-pass.** A gate counts only after it has been seen failing on a minimal violation and
  passing on clean code (PROC-017, PROC-018). When you add a test or a check that guards a rule,
  show it failing first.
- **Exceptions are explicit.** Never delete or weaken a gate to get green (PROC-012). Fix the code,
  or add an entry to `.cross-stack/allowlists/<RULE-ID>.json` with `match`, `reason`, `expires` (a
  date) and `owner`; an expired entry fails (PROC-014). Baselines only shrink (BE-005, PROC-015,
  PROC-027, PROC-034). Inline escapes take one form each and carry a reason:
  `eslint-disable-next-line <rule> -- <reason>` (PROC-016, PROC-025, PROC-031),
  `@phpstan-ignore <identifier> (<reason>)` (BE-098) and a described `@ts-expect-error` (MOB-027).
- **Gate files are protected.** Edits to gate configurations, baselines, allowlists, CI workflows
  and `.cross-stack/**` ask the user first (PROC-013), and so do shell commands that skip or weaken
  a gate (PROC-026). Never route around the prompt.

## References

One level deep; each lists its rules with registry titles, the sanctioned patterns and its status.

- Core: [stack-first.md](references/stack-first.md),
  [tiers-and-invariants.md](references/tiers-and-invariants.md),
  [working-procedure.md](references/working-procedure.md).
- Tracks: [laravel.md](references/laravel.md), [web.md](references/web.md),
  [mobile.md](references/mobile.md).
- Modules: [api-contract.md](references/api-contract.md), [tenancy.md](references/tenancy.md),
  [i18n-rtl.md](references/i18n-rtl.md), [bff-auth.md](references/bff-auth.md),
  [companions.md](references/companions.md).
- Cross-cutting: [security.md](references/security.md),
  [adopting-and-upgrading.md](references/adopting-and-upgrading.md).

[rules]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/rules/README.md
[0002]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0002-gates-over-guidelines.md
[0004]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0004-fail-then-pass.md
[0005]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md
[0006]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0006-stack-first.md
[0007]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0007-one-mechanism-per-concern.md
[0008]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0008-tiers-and-invariants.md
[0009]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0009-tracks-profiles-and-scope.md
[0013]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0013-dry-policy.md
[0014]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0014-working-procedure.md
[0018]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0018-project-detection.md
[0021]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0021-gate-file-protection.md
[0023]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0023-adopter-manifest-and-upgrade.md
