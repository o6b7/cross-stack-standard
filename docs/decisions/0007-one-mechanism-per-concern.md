---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# One declared mechanism per cross-cutting concern

## Context and Problem Statement

Projects accumulate overlapping mechanisms for the same concern: two HTTP clients, a logger module
next to direct console calls, toasts raised from three different places, a field-level audit
package next to a hand-written activity feed. Each was reasonable when added. The damage comes
later, when new code has no rule for which one to use, so it picks at random and the overlap grows.
A common defect is two audit-trail mechanisms with no stated purpose each, where some features
record changes in one, some in the other, and no one can answer "who changed this?" from a single
place. Stack-first ([0006](0006-stack-first.md)) prevents new competitors; this decision handles
the overlaps that already exist, including mechanisms the project built itself.

When two mechanisms serve one concern, which one does new code use?

## Decision Drivers

- New code must have exactly one obvious choice per concern.
- Existing code must not be forced into a big-bang migration.
- The rule must apply to project-built mechanisms, not only to libraries.
- Where a boundary can be enforced by tooling, it should be.

## Considered Options

- Declare a winner and a purpose for each mechanism; new code imports only the winner
- Let overlapping mechanisms coexist, with guidance
- Require immediate migration and removal of the losing mechanism

## Decision Outcome

Chosen option: "Declare a winner and a purpose for each mechanism; new code imports only the
winner", because it stops the overlap from growing on day one without forcing a migration.

- When two mechanisms serve one concern, the project declares a winner and a purpose for each in
  the `stack` section of its manifest ([0023](0023-adopter-manifest-and-upgrade.md)), where lint
  rules can read it. New code imports only the winner. The other stays inside
  its allowlisted files ([0005](0005-explicit-exceptions.md)) until it is removed.
- The rule covers project-built mechanisms as well as libraries: one HTTP client instance and one
  shared fetcher, one logger module ([0088](0088-structured-redacted-logging.md)), one path for
  mutation feedback, one audit-trail mechanism per purpose.
- Where more than one mechanism legitimately exists (for example a field-level audit log and a
  user-facing activity feed), each has a declared purpose, and every new feature names the one it
  writes to.
- Where the winner is declared, module-boundary lint rules enforce it: importing the other
  mechanism outside its allowlisted files fails. Where no boundary can be drawn by imports, the rule
  is REVIEW.

### Consequences

- Good, because the overlap stops growing immediately.
- Good, because the losing mechanism's remaining footprint is a visible, shrinking allowlist.
- Good, because a reviewer can ask one question of each feature: which declared mechanism does it
  use?
- Bad, because declaring purposes takes a decision from the team that tooling cannot make for it.
- Bad, because import boundaries catch direct use only; a wrapper around the losing mechanism
  evades them, so the gated form is GUARDED.

### Confirmation

Module-boundary ESLint rules (and dependency-cruiser rules for layer boundaries) fail when new code
imports a declared loser outside its allowlisted files; the rules and their fixtures are tracked in
the registry. The declaration itself, and the "names its target" requirement for features, are
checked in review.

## Pros and Cons of the Options

### Declare a winner and a purpose for each mechanism; new code imports only the winner

- Good, because it is incremental and enforceable at the import level.
- Bad, because it needs a declaration per concern.

### Let overlapping mechanisms coexist, with guidance

- Good, because it costs nothing now.
- Bad, because new code keeps choosing at random, which is how the overlap started.

### Require immediate migration and removal of the losing mechanism

- Good, because it ends with one mechanism.
- Bad, because the migration blocks adoption and carries its own regression risk.

## More Information

- ESLint `no-restricted-imports`: <https://eslint.org/docs/latest/rules/no-restricted-imports>;
  dependency-cruiser rules:
  <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>.
- Related: [0006](0006-stack-first.md), [0013](0013-dry-policy.md),
  [0088](0088-structured-redacted-logging.md).
- Governs: the stack-first rules on overlapping libraries and the shared rules on single
  mechanisms (HTTP client, logger, mutation feedback, audit trail).
