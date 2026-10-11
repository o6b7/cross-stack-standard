---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# Code of conduct: Contributor Covenant 3.0

## Context and Problem Statement

A public project needs a code of conduct that tells contributors what behaviour is expected, how
to report a problem and who acts on reports. Writing one from scratch invites gaps and makes the
document unfamiliar to contributors who have read the common ones. Which code of conduct does the
project adopt, and how is it kept accurate?

## Decision Drivers

- A widely recognised text that contributors already know.
- The current version of that text, with a clear reporting path.
- No local rewording that could weaken or blur it.
- Contact details that stay correct as the project evolves.

## Considered Options

- Contributor Covenant 3.0
- Contributor Covenant 2.1
- A code of conduct written for this project

## Decision Outcome

Chosen option: "Contributor Covenant 3.0", because it is the current version of a code of conduct
that many open-source projects already use.

- `CODE_OF_CONDUCT.md` is the Contributor Covenant 3.0 text, adopted verbatim. Only the
  placeholders are filled in: the means of reporting and the enforcement note.
- Reports go to the maintainer's contact address, the same one `SECURITY.md` lists.
- The Covenant text is licensed CC BY-SA 4.0 and keeps its Attribution section; it is a community
  document and does not change the project's MIT license ([0028](0028-license.md)).
- Revisit when a new major version of the Covenant is published.

### Consequences

- Good, because contributors recognise the document and its expectations.
- Good, because verbatim adoption leaves no room for accidental weakening.
- Bad, because 3.0 was published in 2025, so fewer contributors have read it than 2.1.

### Confirmation

`node scripts/check-identity.mjs` in the integrity job verifies the contact address in
`CODE_OF_CONDUCT.md` and `SECURITY.md`. That the text matches the canonical 3.0 Markdown apart from
the placeholders is checked in review.

## Pros and Cons of the Options

### Contributor Covenant 3.0

- Good, because it is the current version, with sections on encouraged and restricted behaviours,
  reporting, and addressing and repairing harm.
- Bad, because it is recent, so fewer projects use it yet.

### Contributor Covenant 2.1

- Good, because it is widely used and familiar.
- Bad, because it is no longer the current version.

### A code of conduct written for this project

- Good, because it could be tailored.
- Bad, because it is unfamiliar to contributors and easy to get wrong.

## More Information

- Contributor Covenant 3.0: <https://www.contributor-covenant.org/version/3/0/code_of_conduct/>
  (Markdown:
  <https://www.contributor-covenant.org/version/3/0/code_of_conduct/code_of_conduct.md>).
  Recorded in [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0027](0027-branching-model.md), [0028](0028-license.md),
  [0031](0031-maintainers-repository-ci.md).
- Governs: this repository's community files; no adopter rule.
