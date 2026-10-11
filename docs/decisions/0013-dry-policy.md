---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# DRY policy: rule of three, extract at two for business rules, one-caller abstractions are defects

## Context and Problem Statement

Duplication and abstraction both cost something, and two common defects pull in opposite
directions. The first is premature abstraction: a helper, service, base class or wrapper extracted
from one or two call sites, whose shape is a guess and which later grows flags to serve callers it
was never designed for. The second is drifting duplication: a business threshold or a
status-to-label mapping copied into several screens, a PDF template and a native app, then changed
in only some of them. Code assistants make both cheap to produce.

With a web and a mobile client on one backend, a rule can now be copied across clients as well as
within one. When should code be extracted, in a way that a reviewer and an agent apply the same
way?

## Decision Drivers

- Avoid the wrong abstraction as firmly as the drifting copy.
- A business rule has exactly one source, across every client.
- The rule is decidable in review without arguments about taste.
- As much of it as possible is checked by a tool.

## Considered Options

- Rule of three, extract at two for business rules, one-caller abstractions are defects
- Extract at the second copy, always
- No written policy; review taste decides

## Decision Outcome

Chosen option: "Rule of three, extract at two for business rules, one-caller abstractions are
defects", because it separates the two things a duplicate can be: incidental similarity, which is
cheap to keep until the real shape is visible, and a business rule, which is expensive to let
drift.

- **Rule of three.** Convenience extraction waits for the third copy. Two similar blocks stay
  inline until a third shows what they actually share.
- **Extract at two for business rules.** When the copies express a business rule that has to stay
  identical (a threshold, a status mapping, a price or eligibility calculation, a permission
  condition), it gets one source at the second copy.
- **One-caller abstractions are defects.** A wrapper, helper, service, interface or Action
  ([0041](0041-action-pattern.md)) that exists for a single call site is inlined. Classes the
  framework requires, such as a policy, a request class, a job or an API Resource, are not
  abstractions in this sense.
- **One source for a rule rendered twice.** A rule shown in two places, such as a web screen and a
  PDF, or a web screen and a native screen, has one source. Cross-client duplication is in scope
  because the web and mobile clients share one backend; the source is normally the backend
  itself, exposed through the API or the generated contract ([0012](0012-backend-authority.md)).
- **Tool support.** Duplication detection with jscpd and a shrink-only baseline
  ([0092](0092-dead-code-and-duplication-gates.md)) turns the copy-paste part of this policy from
  REVIEW into GUARDED.

### Consequences

- Good, because speculative layers and single-use helpers stop accumulating.
- Good, because every business rule has one owner that all clients read from.
- Good, because a reviewer can cite a rule instead of a preference.
- Bad, because "business rule" versus "incidental similarity" remains a judgement.
- Bad, because two copies of convenience code are tolerated, so the duplication gate's thresholds
  have to allow for them.
- Bad, because jscpd sees textual clones only: a rule re-implemented in different words, or an
  abstraction with one caller, is invisible to it.

### Confirmation

GUARDED for copy-paste clones: jscpd runs in the track `check` with `--baseline` and
`--fail-on-new-clones`, so a new clone above the configured line and token thresholds fails the
build ([0092](0092-dead-code-and-duplication-gates.md)). Known evasions are rewording the copy so
it no longer matches and staying under the thresholds. Extract-at-two, the one-caller rule and the
single-source rule for cross-client rendering are Review.

## Pros and Cons of the Options

### Rule of three, extract at two for business rules, one-caller abstractions are defects

- Good, because each case has a stated threshold.
- Good, because it targets drift where drift is costly.
- Bad, because classifying a duplicate as a business rule needs judgement.

### Extract at the second copy, always

- Good, because it is the simplest rule to state.
- Bad, because two call sites rarely show the real shape, so the abstraction is often wrong and
  then has to be bent or undone.

### No written policy; review taste decides

- Good, because it costs nothing to write.
- Bad, because reviewers and agents apply different tastes, and neither drift nor over-abstraction
  is caught consistently.

## More Information

- jscpd: <https://github.com/kucherenko/jscpd> (version and flags in
  [verified-versions.md](../maintainers/verified-versions.md)).
- Related: [0007](0007-one-mechanism-per-concern.md) (one mechanism per concern),
  [0012](0012-backend-authority.md) (the backend as the single source),
  [0041](0041-action-pattern.md) (Actions fall under the one-caller rule),
  [0092](0092-dead-code-and-duplication-gates.md) (the duplication gate).
- Governs: the process rules on duplication and abstraction, and the duplication gates in the
  laravel, web and mobile tracks.
