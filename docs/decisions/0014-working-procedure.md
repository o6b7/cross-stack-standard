---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Working procedure: name the rule, stop and ask in unknown territory, report real gate output

## Context and Problem Statement

Rules and gates say what the code must look like; they do not say how the work is done. Both
Claude and human contributors follow the Standard, and the failures of the working process are
well known. A change reports that the tests passed when they were never run, or summarises output
instead of showing it. A new library or pattern appears in unfamiliar territory without anyone
having decided it. Rules are paraphrased from memory until they no longer match the registry.
Deterministic steps, such as stamping a version or regenerating docs, are described in prose and
carried out slightly differently each time.

What procedure do contributors, human or agent, follow so that every claim is checkable and every
new decision is made on purpose?

## Decision Drivers

- Every claim about a check can be verified by the reader.
- A change is traceable to the rule or decision it follows.
- New decisions in unknown territory involve a human and leave a record.
- Deterministic steps produce the same result every time.
- The procedure is short enough to sit in always-loaded context.

## Considered Options

- A short written procedure in the core skill, backed by the PR template, the Stop gate and scripts
- Trust the author's summary of what was checked
- Rely on CI alone and leave the procedure unwritten

## Decision Outcome

Chosen option: "A short written procedure in the core skill, backed by the PR template, the Stop
gate and scripts", because CI proves the result only after the fact, while the procedure keeps
unrun checks from being reported as passing and keeps new decisions from being made silently.

1. **Name the rule.** Name the pattern or rule ID being followed. Pull requests cite the rule IDs
   or ADRs their change follows.
2. **Unknown territory.** Read the installed library's documentation
   ([0006](0006-stack-first.md)), name two options with their trade-offs, stop and ask, then
   record the outcome as an ADR ([0001](0001-record-architecture-decisions.md)).
3. **Before claiming done.** Re-read the diff, run the project's check scripts (`check:fast`, and
   the full `check` where the change warrants it) and paste their real output verbatim.
4. **No unrun claims.** Never claim that a check passed without running it. If a check could not
   run, say which one and why.
5. **Scripts over prose.** Deterministic work (version stamping, generated docs, fixture runs,
   baseline updates) lives in scripts; the skill and the docs call the script instead of
   describing its steps.

The pull-request template carries a section for pasting real gate output
([0094](0094-developer-workflow-templates.md)).

### Consequences

- Good, because reviewers see real output and can spot failures the author missed.
- Good, because rule IDs in pull requests make changes searchable by rule and keep the registry as
  the shared vocabulary.
- Good, because decisions in unknown territory end up as ADRs instead of accidents.
- Bad, because stopping to ask slows autonomous work in unfamiliar areas.
- Bad, because pasted output is long, and home-directory and temporary paths have to be replaced
  before it is published.
- Bad, because most of the procedure cannot be checked mechanically.

### Confirmation

Mostly Review. The mechanical backstops are the Stop gate, which runs `check:fast` whatever the
author claims ([0020](0020-feedback-hooks.md)), and CI, which runs the full `check` on every pull
request ([0090](0090-ci-contract.md)). The core skill's behaviour, naming rule IDs and stopping in
unknown territory, is covered by the plugin's skill-behaviour evaluation scenarios, graded on the
rule IDs in the answer; they run outside the required CI checks because they need model access.

## Pros and Cons of the Options

### A short written procedure in the core skill, backed by the PR template, the Stop gate and scripts

- Good, because it covers what gates cannot see: what was claimed and what was decided.
- Good, because the backstops catch the most costly failure, an unrun check, mechanically.
- Bad, because the written part relies on discipline and review.

### Trust the author's summary of what was checked

- Good, because it costs nothing.
- Bad, because a summary cannot be verified, and an agent's summary can describe checks that
  never ran.

### Rely on CI alone and leave the procedure unwritten

- Good, because CI results are real.
- Bad, because failures surface only after the pull request is opened, and nothing covers new
  decisions made in unknown territory.

## More Information

- Agent Skills best practices (utility scripts for deterministic operations):
  <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
- Related: [0001](0001-record-architecture-decisions.md) (records),
  [0006](0006-stack-first.md) (read the installed library first),
  [0020](0020-feedback-hooks.md) (the Stop gate), [0090](0090-ci-contract.md) (CI runs the same
  checks), [0094](0094-developer-workflow-templates.md) (the PR template).
- Governs: the process rules on citing rule IDs, the unknown-territory protocol, reporting real
  gate output, and keeping deterministic steps in scripts.
