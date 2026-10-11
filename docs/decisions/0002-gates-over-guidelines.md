---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Gates over guidelines: FORCED, GUARDED and REVIEW honesty labels

## Context and Problem Statement

A rule that exists only as prose depends on every reader, human or agent, remembering and applying
it. Agents in particular follow reliably what a tool reports back to them, and only unevenly what
is merely written down. Standards also overstate themselves: a common defect is a rule labelled as
enforced ("covered by the architecture test") whose gate never shipped, or covers a narrower case
than the rule. Readers then trust a guarantee that nobody provides. The same happens to
documentation claims such as "this check runs in CI" when nothing verifies them.

How does the Standard say how strongly each rule is enforced, so that the claim is never ahead of
what actually runs?

## Decision Drivers

- Adopters and agents must know which rules a machine will catch and which rely on review.
- The claim must be checkable at any commit, not only at release time.
- Gates are built incrementally, and CI must stay green meanwhile.
- Some rules cannot be gated honestly and still matter.

## Considered Options

- Three honesty labels tied to gate evidence, with a target level for gates not yet built
- A binary enforced / not enforced label
- Labels that state the intended enforcement from the start
- Prose guidance with no labels

## Decision Outcome

Chosen option: "Three honesty labels tied to gate evidence, with a target level for gates not yet
built", because it separates "no known evasion" from "catches the common form", makes every
evasion explicit, and lets the label change only when the evidence does.

- **FORCED**: a structural gate with no known evasion within its scope.
- **GUARDED**: a gate that fails on the common form of the violation but has documented evasions.
  The registry requires a non-empty `evasions` list for every GUARDED rule.
- **REVIEW**: no gate. Code review applies the rule, and eval scenarios cover the skill's
  behaviour on REVIEW rules ([0004](0004-fail-then-pass.md)).

A label is never ahead of its gate. A new rule enters the registry as REVIEW with a
`targetEnforcement` of FORCED or GUARDED, and is promoted only in the pull request that ships its
gate together with a clean fixture and a violation fixture ([0004](0004-fail-then-pass.md)).
The release report lists every rule whose target is unmet, and those rules are published as
REVIEW.

Any mechanically checkable claim in the documentation or in the managed CLAUDE.md block is either
backed by a gate or states when it was last verified. External facts (versions, flags, platform
behaviour) live in [verified-versions.md](../maintainers/verified-versions.md) with their source and
date, and a non-required job on every push to `dev` (and a weekly schedule once `main` carries
releases) flags every entry older than 90 days ([0031](0031-maintainers-repository-ci.md)).

When a mechanism cannot hold in every mode, the label is downgraded rather than overstated. For
example, gate-file protection returns an `ask` decision from a PreToolUse hook; Claude Code
documents only `deny` (or exit code 2) as blocking in `bypassPermissions` mode, so that protection
is GUARDED, not FORCED ([0021](0021-gate-file-protection.md)).

### Consequences

- Good, because a FORCED label can be relied on, and a GUARDED rule tells reviewers exactly where
  to look.
- Good, because CI stays green while gates are built, and releases do not overclaim.
- Bad, because an evasions list documents how to get around a gate. Anyone reading the gate's
  source could find the same gaps; publishing them directs reviewers to them.
- Bad, because early releases publish many rules as REVIEW, so the headline counts are smaller.
- Bad, because "no known evasion" is a judgement. When an evasion is found, the rule moves to
  GUARDED with the evasion listed.

### Confirmation

`node scripts/check-registry.mjs` runs in CI: the registry schema restricts `enforcement` to the
three labels and requires `evasions` for GUARDED; every FORCED or GUARDED rule must have a gate
that exists for its kind, a violation fixture directory and, with `--fixture-report`, a clean pass
and a violation failure with its ID printed. The generated rule index under `docs/rules/` counts
the rules awaiting promotion. Documentation claims without a gate or a date are a review item; the
staleness of recorded facts is checked by that non-required job on `dev`.

## Pros and Cons of the Options

### Three honesty labels tied to gate evidence, with a target level for gates not yet built

- Good, because the label is derived from evidence the registry check can read.
- Good, because the target level records intent without claiming it.
- Bad, because contributors must learn three labels and a target field.

### A binary enforced / not enforced label

- Good, because it is simple.
- Bad, because a heuristic gate and a structural gate carry the same label, so readers over-trust
  the heuristic one.

### Labels that state the intended enforcement from the start

- Good, because the final shape of the Standard is visible early.
- Bad, because it reproduces the defect this decision exists to prevent: a label with no gate.

### Prose guidance with no labels

- Good, because it costs nothing to write.
- Bad, because nobody can tell which rules a build will catch.

## More Information

- Claude Code hook decisions and permission modes: <https://code.claude.com/docs/en/hooks.md>,
  <https://code.claude.com/docs/en/permission-modes.md> (verification recorded in
  [verified-versions.md](../maintainers/verified-versions.md)).
- Registry schema: [`registry/rules.schema.json`](../../registry/rules.schema.json).
- Related: [0001](0001-record-architecture-decisions.md), [0003](0003-rule-registry.md),
  [0004](0004-fail-then-pass.md), [0021](0021-gate-file-protection.md),
  [0031](0031-maintainers-repository-ci.md) (the staleness scan).
- Governs: the enforcement label of every rule, and the process rules on documentation claims.
