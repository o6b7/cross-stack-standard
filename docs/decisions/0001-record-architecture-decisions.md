---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Record architecture decisions as MADR records that every rule cites

## Context and Problem Statement

The Standard constrains adopters' code with hundreds of rules across three stacks. Each rule needs
a reason that a contributor, an adopter or an agent can find, and that reason must stay stable
while the rule set grows. A common defect of free-text citations ("see the decision on
envelopes") is that they drift and mis-cite: the cited decision is renumbered, rewritten or never
existed, and nothing notices. A second common defect is that a rewritten decision loses the options
it rejected, so the same debate is reopened without the earlier evidence.

How does the Standard record its decisions so that every rule has one stable, checkable reason?

## Decision Drivers

- Every rule resolves to exactly one reason, by a reference a script can check.
- Rejected options, dissents and revisit triggers survive later edits.
- A widely used format that contributors can read without learning a house style.
- Adopters can use the same mechanism for their own project decisions.

## Considered Options

- MADR 4.0.0 records, one file per decision, cited by number from the rule registry
- One running decision log with numbered sections
- Rationale written inline in each rule's documentation, with no separate records

## Decision Outcome

Chosen option: "MADR 4.0.0 records, one file per decision, cited by number from the rule registry",
because it is the only option whose template has explicit places for rejected options
(Considered Options, Pros and Cons of the Options) and for how compliance is checked
(Confirmation), and one file per number gives a reference that a script can resolve.

- **Format.** Records follow the MADR 4.0.0 template: YAML front matter (`status`, `date`,
  `decision-makers`), then Context and Problem Statement, Considered Options, Decision Outcome
  with Consequences and Confirmation, and the optional sections where they help.
- **Files.** `docs/decisions/NNNN-title-with-dashes.md`: a four-digit number, lowercase, dashes.
- **Stable numbers.** A number is never reused. The status is `proposed`, `accepted`,
  `rejected`, `deprecated` or `superseded by NNNN`. A replaced record keeps its number and file,
  its status becomes `superseded by NNNN`, and the new record links back to it. Reversing an
  accepted decision takes a new record, never an edit of the old one.
- **Nothing dropped.** Dissents, rejected options and revisit triggers are recorded inside the
  record that decided against them.
- **Every rule cites one.** The `decision` field of every rule in `registry/rules.json` names an
  existing record ([0003](0003-rule-registry.md)). Records name the rule areas they govern; the
  registry holds the rule-to-record link, so it is written once.
- **Adopters.** A Tier-2 project ([0008](0008-tiers-and-invariants.md)) keeps its own numbered
  decision log in its decisions directory. A new runtime dependency
  ([0006](0006-stack-first.md)) and a choice made in unknown territory
  ([0014](0014-working-procedure.md)) each land with a record.

### Consequences

- Good, because a missing or mistyped citation is a CI failure instead of a reader's discovery.
- Good, because superseded reasoning stays readable next to its replacement.
- Good, because MADR is documented upstream, so the format needs no local guide.
- Bad, because more than a hundred small files need search or an index to navigate.
- Bad, because the check proves that a reference resolves, not that the record justifies the
  rule; relevance stays a review question.
- Bad, because adding a rule costs a record. This friction is intended.

### Confirmation

`node scripts/check-registry.mjs` runs in CI. The registry schema makes `decision` required on
every rule. A FORCED or GUARDED rule whose number has no `docs/decisions/NNNN-*.md`, or has two
files with that number, fails the check; a REVIEW rule gets a warning, so it can land before its
record exists but cannot be promoted without one. The shape of each record (front matter, sections,
never reusing a number) is checked in review; markdownlint checks only the Markdown.

## Pros and Cons of the Options

### MADR 4.0.0 records, one file per decision, cited by number from the rule registry

- Good, because rejected options and confirmation have fixed sections.
- Good, because each file has a stable number that tooling can resolve.
- Neutral, because the optional sections can be omitted when a decision is simple.
- Bad, because many files.

### One running decision log with numbered sections

- Good, because everything is in one place and easy to read end to end.
- Bad, because section numbers shift when entries are inserted or split, so citations drift.
- Bad, because rewriting a section in place hides what it used to say.

### Rationale written inline in each rule's documentation, with no separate records

- Good, because the reason sits next to the rule.
- Bad, because one decision usually covers several rules, so its reasoning is copied and diverges.
- Bad, because there is no place for options that were rejected.

## More Information

- MADR: <https://adr.github.io/madr/>; template at the pinned release:
  <https://github.com/adr/madr/blob/4.0.0/template/adr-template.md>; release:
  <https://github.com/adr/madr/releases/tag/4.0.0>. Version and template facts are recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0002](0002-gates-over-guidelines.md) (honesty labels),
  [0003](0003-rule-registry.md) (the registry),
  [0008](0008-tiers-and-invariants.md) (Tier 2 includes a decision log),
  [0014](0014-working-procedure.md) (unknown territory ends in a record).
- Governs: the process rules on decision records (every rule cites a record; new runtime
  dependencies and unknown-territory choices are recorded).
- Revisit when MADR publishes a new major template; adopting it takes a new record.
