# Governance

This document describes how the Cross-Stack Standard is run: who decides, how rules change, and how
decisions are recorded.

## Maintainer

The project is maintained by **Qusai Abdullah** ([@o6b7](https://github.com/o6b7),
[qusaii.abdullah@gmail.com](mailto:qusaii.abdullah@gmail.com)), who has the final say on changes,
releases and the roadmap. The maintainer reviews pull requests, cuts releases, owns the files that
enforce the Standard (see [`.github/CODEOWNERS`](.github/CODEOWNERS)) and acts as the Community
Moderator under the [code of conduct](CODE_OF_CONDUCT.md).

More maintainers may be invited as the project grows, based on sustained, high-quality
contributions. This document will name them and describe how they share decisions when that
happens.

## Decisions are recorded

Every significant decision is written down as an architecture decision record in
[`docs/decisions/`](docs/decisions/README.md), using the [MADR 4.0.0](https://adr.github.io/madr/)
template ([ADR 0001](docs/decisions/0001-record-architecture-decisions.md)). A record states the
problem, the options considered, the option chosen and why, and how compliance is checked.

- Every rule in [`registry/rules.json`](registry/rules.json) cites exactly one record, and
  `check-registry` fails when that record is missing.
- A record starts as `proposed` and becomes `accepted` when the maintainer settles it.
- Numbers are never reused. A replaced record keeps its file, and its status becomes
  `superseded by NNNN`.
- Discussion happens in the pull request or issue that introduces the record, so the reasoning
  stays public.

## How rules change: the rule-proposal process

New rules, and changes to existing ones, go through a lightweight request-for-comments process.

1. **Propose.** Open an issue with the
   [rule-proposal template](https://github.com/o6b7/cross-stack-standard/issues/new/choose). It asks
   for the one property the rule states, the track and tier, the evidence that the defect is common
   or costly, how a gate could check it (or why it can only be a review rule), the fixtures that
   would prove the gate, and how existing projects would adopt it.
2. **Discuss.** Anyone can comment. The maintainer looks for these properties:
   - one enforceable property per rule, with a clear violation;
   - a gate that could fail on it, or an honest REVIEW target;
   - an adoption path for existing code (a baseline, a dated allowlist, or an opt-in switch);
   - no competing library added to adopters' projects, following
     [stack-first](docs/decisions/0006-stack-first.md);
   - an understood versioning impact: a new default-on gate can fail builds that passed before.
3. **Decide.** The maintainer accepts, asks for changes, or declines, with the reason on the issue.
   An accepted proposal gets a decision record, new or amended.
4. **Land.** The rule enters the registry as REVIEW with its target label, citing the record. It
   is promoted to FORCED or GUARDED only in the pull request that ships its gate with a clean fixture
   that passes and a violation fixture that fails ([ADR 0004](docs/decisions/0004-fail-then-pass.md)).

Removing a rule, weakening one, or changing a default follows the same process, and the release
notes call it out.

## False positives

A gate that fails on correct code is a bug. Report it with the
[false-positive template](https://github.com/o6b7/cross-stack-standard/issues/new/choose). Fixes
that reduce false positives are patch releases. Until a fix ships, use a dated allowlist entry with
a reason; never weaken the gate ([ADR 0005](docs/decisions/0005-explicit-exceptions.md)).

## Releases and versioning

The Standard follows Semantic Versioning judged by adopter build impact
([ADR 0024](docs/decisions/0024-versioning.md)): MAJOR can newly fail a build, MINOR adds opt-in
capability, PATCH cannot fail a build that passed before. Releases are cut by hand by the maintainer
from the `dev` branch through a release branch into `main`, and tagged on `main`
([release guide](docs/maintainers/release.md), [branch model](docs/maintainers/branching.md)).

## Code of conduct

Everyone who takes part follows the [Contributor Covenant 3.0](CODE_OF_CONDUCT.md). Reports go to
the maintainer privately.

## Changing this document

Changes to governance are proposed in a pull request and, when they change how decisions are made,
recorded in a decision record.
