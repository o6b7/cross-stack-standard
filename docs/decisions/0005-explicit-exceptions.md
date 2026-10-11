---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Exceptions are explicit: dated allowlist entries, shrink-only baselines and described disable comments

## Context and Problem Statement

Every real codebase needs exceptions: legacy code that predates a rule, a vendor file, a case the
rule did not foresee. How an exception is written decides whether the gate stays meaningful. A
common defect is a free-text magic comment used as an escape hatch (for example a comment that
tells a pagination check to skip the next line): any author or agent can add it, it never expires,
and no tool counts how many exist. Another is an allowlist kept as an undated constant inside a
test file, which only grows. Under delivery pressure the cheapest path to a green build becomes
weakening the gate itself.

How are exceptions to a gate expressed so that each one is visible, justified, owned and bounded
in time, and the total can only go down?

## Decision Drivers

- Every exception names a reason and someone who removes it.
- Exceptions expire or shrink; they never accumulate silently.
- Prefer each tool's native suppression mechanism over an invented one.
- Brownfield adoption must be possible without fixing everything on day one.

## Considered Options

- Dated allowlist files, native shrink-only baselines and described inline disables only
- Free-form inline escape comments
- No exceptions: every violation must be fixed before adoption

## Decision Outcome

Chosen option: "Dated allowlist files, native shrink-only baselines and described inline disables
only", because each exception becomes a reviewed, counted artefact, and brownfield projects can
still adopt every gate at once.

- **Allowlists.** Gates without a native baseline read `.cross-stack/allowlists/<RULE-ID>.json`:
  `{ "rule": "<RULE-ID>", "entries": [{ "match", "reason", "expires", "owner" }] }`, validated by
  [`schemas/allowlist.schema.json`](../../schemas/allowlist.schema.json). An entry past its
  `expires` date (UTC) fails the build.
- **Baselines.** Each tool's native baseline is used and is shrink-only: ESLint bulk suppressions
  (`eslint-suppressions.json`), the PHPStan baseline (`phpstan-baseline.neon`, counted as the sum
  of its `count` values), dependency-cruiser's known-violations file and the jscpd baseline
  (`--baseline` with `--fail-on-new-clones`). A sanctioned `baseline:update` script regenerates a
  baseline and fails if it grew.
- **Inline JavaScript and TypeScript.** The only escape is
  `// eslint-disable-next-line <rule> -- <reason>`, held by
  `@eslint-community/eslint-comments/require-description`,
  `@eslint-community/eslint-comments/no-use` allowing only `eslint-disable-next-line`, and
  `linterOptions.reportUnusedDisableDirectives: "error"` so a stale disable fails.
- **Inline PHP.** The only escape is `@phpstan-ignore <identifier> (<reason>)`, with
  `reportIgnoresWithoutComments: true` (PHPStan 2.1.41 or later), which also rejects
  `@phpstan-ignore-line` and `@phpstan-ignore-next-line`; `reportUnmatchedIgnoredErrors` stays on
  so a stale ignore fails.
- **Never weaken a gate to reach green.** Fix the code, add a dated entry, or record a waiver in a
  decision record ([0001](0001-record-architecture-decisions.md)). Agent edits to baselines,
  allowlists and gate configs are intercepted ([0021](0021-gate-file-protection.md)).

### Consequences

- Good, because every exception is in a file a reviewer sees in the diff, with a reason, an owner
  and an end date.
- Good, because native baselines keep the tools' own semantics: ESLint bulk suppressions count
  violations per file and rule, so a new violation in a suppressed file still fails.
- Good, because brownfield projects adopt every gate at once and pay the debt down over time.
- Bad, because expiry dates create chores: an entry that is still needed must be renewed with a
  fresh reason.
- Bad, because a determined author can still add a described disable with a weak reason; the
  description makes it visible, and review judges it.

### Confirmation

The allowlist check (schema validity and expiry) and the baseline check (fails when a baseline
grows) are script gates in each track's `check`. The described-disable requirements are ESLint and
PHPStan checks in the shipped configurations, each proven by its own fixtures
([0004](0004-fail-then-pass.md)). Edits to these files by an agent require
confirmation ([0021](0021-gate-file-protection.md)), and CODEOWNERS covers them. Whether a reason is
good enough is a review item.

## Pros and Cons of the Options

### Dated allowlist files, native shrink-only baselines and described inline disables only

- Good, because exceptions are counted, owned and bounded.
- Bad, because it needs a schema, two checks and a sanctioned update script.

### Free-form inline escape comments

- Good, because they are quick to add.
- Bad, because nothing counts, dates or owns them, and an agent can add one to silence any gate.

### No exceptions: every violation must be fixed before adoption

- Good, because the rule set stays pure.
- Bad, because no existing project could adopt the gates, so none would.

## More Information

- ESLint bulk suppressions: <https://eslint.org/docs/latest/use/suppressions>;
  `reportUnusedDisableDirectives`: <https://eslint.org/docs/latest/use/configure/configuration-files>.
- `require-description`:
  <https://eslint-community.github.io/eslint-plugin-eslint-comments/rules/require-description.html>.
- PHPStan ignores and baselines: <https://phpstan.org/user-guide/ignoring-errors>,
  <https://phpstan.org/user-guide/baseline>.
- dependency-cruiser known violations:
  <https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md>; jscpd:
  <https://github.com/kucherenko/jscpd>. Versions and observed behaviour are recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0002](0002-gates-over-guidelines.md), [0021](0021-gate-file-protection.md),
  [0038](0038-larastan-levels-shrink-only-baseline.md).
- Governs: the process rules on allowlists, baselines and inline suppressions in every track.
