---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Tier model: at most ten Tier-1 invariants; Tier 2 by declared criteria

## Context and Problem Statement

Not every project needs the whole Standard. A weekend prototype does not need layer tables and a
decision log, but it does need its credentials kept out of script-readable storage and its server
to authorize every action. A long-lived, multi-developer or multi-tenant product needs both. If
everything is mandatory, small projects decline the Standard; if everything is optional, the rules
that prevent incidents get skipped too. An agent also needs the highest-value rules in its context
all the time, and always-loaded text is expensive ([0022](0022-context-budget.md)).

Which rules apply to every adopting project, which apply only to some, and who decides?

## Decision Drivers

- A short, memorable set of non-negotiables, each traceable to enforceable rules.
- Structure rules only where their cost pays off.
- The decision is explicit and recorded, never guessed by an agent.
- The non-negotiables must be in context even when no matching file has been read.

## Considered Options

- Two tiers: at most ten Tier-1 invariants for everyone, Tier 2 by declared criteria
- One flat tier: every rule applies to every project
- Per-rule opt-in with no tiers
- Tier inferred automatically from repository signals

## Decision Outcome

Chosen option: "Two tiers: at most ten Tier-1 invariants for everyone, Tier 2 by declared
criteria", because it keeps the incident-preventing rules universal and short, and ties the cost of
structure rules to properties that make them worthwhile.

**Tier 1** applies to every adopting project. It is capped at ten invariants, each mapped to rule
IDs in the registry through the rules' `tier` field:

1. Stack-first ([0006](0006-stack-first.md)).
2. Server authority ([0012](0012-backend-authority.md)).
3. Credentials are short-lived, revocable and never script-readable.
4. Untrusted input is hardened at the boundary.
5. One generated wire contract, when the api-contract module is on
   ([0054](0054-generated-api-contract.md)).
6. Secrets and the supply chain are protected.
7. The project is declared and green.
8. Gates are never weakened ([0005](0005-explicit-exceptions.md)).
9. The locale contract, when the i18n module is on.
10. Tenant isolation, when the tenancy module is on.

**Tier 2** adds layer tables, file placement, service discipline, frontend patterns and a decision
log ([0001](0001-record-architecture-decisions.md)). It applies when at least two of these hold:
the project is multi-tenant, has more than one developer, or is long-lived.

- The tier is declared in `.cross-stack/standard.json` (`"tier": 1` or `2`). When it is not
  declared, the agent asks instead of assuming, and the SessionStart reminder says so.
- Declining Tier 2 while two of its criteria hold needs a recorded reason in the project's
  decision log, which the manifest references under `decisions`
  ([0023](0023-adopter-manifest-and-upgrade.md)); the declared criteria are an option of the
  process rule on declaring the tier.
- The Tier-1 invariants are also written into the managed CLAUDE.md block, because path-scoped
  rule files load only when Claude reads a matching file, not when it creates one.

### Consequences

- Good, because every adopter gets the rules that prevent the costliest incidents.
- Good, because small projects adopt without paying for structure they do not need.
- Good, because the invariant list is short enough to sit in always-loaded context.
- Bad, because the cap forces some important rules into Tier 2 or under a broader invariant.
- Bad, because "long-lived" is a judgement; the team declares it rather than a tool.
- Bad, because a Tier-1 project can grow into Tier 2 without anyone re-declaring the tier.

### Confirmation

The manifest schema accepts only `1` or `2` for `tier`; the script gate that validates the manifest
against it is tracked in the registry and stays REVIEW until it ships
([0002](0002-gates-over-guidelines.md)). The SessionStart hook's "tier not declared: ask" output is
covered by its hook fixtures. The ten-invariant cap, the mapping of each invariant to rule IDs and the
recorded reason for declining Tier 2 are checked in review.

## Pros and Cons of the Options

### Two tiers: at most ten Tier-1 invariants for everyone, Tier 2 by declared criteria

- Good, because the universal set is small and every item is enforceable.
- Bad, because the boundary between tiers needs judgement.

### One flat tier: every rule applies to every project

- Good, because it is simple to explain.
- Bad, because small projects would decline the whole Standard, losing the invariants too.

### Per-rule opt-in with no tiers

- Good, because it is maximally flexible.
- Bad, because the rules that prevent incidents would be switched off first.

### Tier inferred automatically from repository signals

- Good, because nobody has to declare anything.
- Bad, because signals such as contributor counts or repository age misjudge forks, monorepos and
  new products that are meant to live for years.

## More Information

- Path-scoped rules (`paths:` front matter in `.claude/rules/`) and when they load:
  <https://code.claude.com/docs/en/memory.md>, recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Manifest schema: [`schemas/standard.schema.json`](../../schemas/standard.schema.json).
- Related: [0009](0009-tracks-profiles-and-scope.md), [0010](0010-opt-in-modules.md),
  [0022](0022-context-budget.md).
- Governs: the `tier` field of every rule, the Tier-1 invariant list in the skill and the managed
  CLAUDE.md block, and the process rule on declaring the tier.
