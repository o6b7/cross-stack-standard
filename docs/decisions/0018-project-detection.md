---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Project detection: manifest first, a bounded fallback that emits every track, explicit opt-out

## Context and Problem Statement

At the start of a session the plugin tells Claude which parts of the Standard apply: which tracks
the project has, which tier it declared, and whether it has adopted the Standard at all. The
answer has to be right in monorepos, fast in large trees and silent in projects that opted out.

Several common defects shape this decision. First-match detection labels a Laravel plus Next.js
monorepo as a single stack, so half of it runs without its rules. An unbounded scan walks
`node_modules` or `vendor`, is slow, and finds framework manifests of dependencies. An opt-out that
is read from one file location only, or by one hook only, leaves the project partly opted in.

How does the plugin detect a project, and how does a project switch it off?

## Decision Drivers

- The adopted manifest is authoritative; heuristics only fill in before adoption.
- Every stack in a monorepo is found.
- Detection stays well under a noticeable delay at session start.
- Session-start output is short and factual, because it enters every session's context.
- One opt-out, honoured by every hook ([0019](0019-hook-runtime-contract.md)).

## Considered Options

- Manifest first, a bounded fallback that emits every detected track, explicit opt-out
- Manifest only, with no fallback
- A heuristic scan only

## Decision Outcome

Chosen option: "Manifest first, a bounded fallback that emits every detected track, explicit
opt-out", because it is exact for adopted projects, still useful before adoption, and correct for
monorepos.

- **Manifest first.** `.cross-stack/standard.json` is authoritative for tracks, profile, tier and
  modules.
- **Bounded fallback.** Without a manifest, a walk from the project directory goes at most four
  levels deep, prunes `node_modules`, `vendor`, `.git`, `dist`, `build`, `.next`, `.expo`,
  `.turbo`, `.cache` and `coverage`, caps the number of files read, and targets under 200 ms. It
  reports every track it finds: a `composer.json` requiring `laravel/framework` is `laravel`; a
  `package.json` depending on `expo` or `react-native` is `mobile`, and is not also counted as
  web; one depending on `next` or `react` is `web`.
- **SessionStart output.** The hook matches `startup|resume|clear|compact|fork` and prints a few
  factual lines: the tracks, the tier or "tier not declared: ask", that the `cross-stack-standard`
  skill applies before application code is modified, and, when a stack is found without a
  manifest, a hint to run `/cross-stack-standard:adopt`.
- **Opt-out, first match wins.** `CROSS_STACK_STANDARD_DISABLE=1`; `"disabled": true` in the
  manifest; the line `cross-stack-standard: declined` in `CLAUDE.md`, `.claude/CLAUDE.md` or
  `CLAUDE.local.md`, searched from the hook's working directory up to the project directory and
  matched tolerantly (indentation, a list marker or backticks). An opted-out project gets no output
  from any hook. The platform's own switch, `false` for the plugin in `enabledPlugins`, is
  documented as the hard off-switch.
- **Detection alone.** `hooks.sessionStart.detect: false` in the manifest turns off the
  session-start reminder while the other hooks keep running.

### Consequences

- Good, because monorepos get every track's rules.
- Good, because adopted projects are described exactly, with no guessing.
- Good, because an opt-out in any of the usual memory files silences every hook.
- Bad, because the fallback is a heuristic: a small React docs site inside a Laravel repository is
  reported as a web track until the manifest says otherwise.
- Bad, because stacks deeper than four levels are missed before adoption; `adopt` records them.
- Bad, because the opt-out line is read from disk on every hook run.

### Confirmation

The hook fixture suite ([0019](0019-hook-runtime-contract.md)) covers a manifest project, a
Laravel plus Next.js monorepo without a manifest (both tracks reported), each opt-out source, and
`detect: false`. It also asserts the session-start timing target and output size, and the output
size is part of the context-budget measurement ([0022](0022-context-budget.md)).

## Pros and Cons of the Options

### Manifest first, a bounded fallback that emits every detected track, explicit opt-out

- Good, because it is exact after adoption and helpful before it.
- Bad, because the fallback can be wrong in unusual layouts.

### Manifest only, with no fallback

- Good, because it never guesses.
- Bad, because an installed but not yet adopted project gets no reminder and no adopt hint.

### A heuristic scan only

- Good, because nothing needs to be written to the project.
- Bad, because the tier and modules cannot be inferred, and every session pays for a scan.

## More Information

- SessionStart matchers, context output and its advice to state facts rather than instructions:
  <https://code.claude.com/docs/en/hooks.md>
- `enabledPlugins`: <https://code.claude.com/docs/en/settings-reference.md>
- Related: [0019](0019-hook-runtime-contract.md), [0022](0022-context-budget.md),
  [0023](0023-adopter-manifest-and-upgrade.md), [0009](0009-tracks-profiles-and-scope.md).
- Governs: the process rules on declaring tracks, tier and modules in the manifest, and on the
  opt-out that every hook honours.
