---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Feedback hooks: per-file lint after edits and a blocking fast Stop gate, on by default

## Context and Problem Statement

Gates in CI catch a violation only after the pull request is opened, long after Claude wrote the
code. Claude Code offers two moments to bring the feedback forward. A PostToolUse hook runs after
a tool call; exiting 2 shows its stderr to Claude, but it cannot block, because the tool already
ran. A Stop hook runs whenever Claude finishes responding; exiting 2 blocks the stop and feeds the
reason back. Its input carries `stop_hook_active` when Claude is already continuing because of a
Stop hook, and Claude Code ends the turn after 8 consecutive blocks.

A common defect is a Stop hook that is opt-in only, runs the full test suite, never exits 2 and has
no loop guard: it is slow where it runs, never blocks, and is absent in most projects.

How do the Standard's hooks turn gate results into feedback during the session?

## Decision Drivers

- Claude sees lint errors in the file it just edited, straight away.
- A turn does not end with the fast gate red.
- Latency stays bounded after each edit and at the end of each turn.
- No loops, and no reruns when nothing changed.
- The full suite stays in CI.

## Considered Options

- Per-file format and lint after edits, plus a blocking Stop gate running `check:fast`, on by
  default
- The same hooks, with the Stop gate opt-in
- A Stop gate that runs the full `check` suite

## Decision Outcome

Chosen option: "Per-file format and lint after edits, plus a blocking Stop gate running
`check:fast`, on by default", because it gives feedback at both moments within a bounded time,
and a gate that is off by default is absent where it matters.

**PostToolUse** (`Edit|Write|NotebookEdit`):

- It formats the edited file with the project's formatter when one is installed (Pint for PHP,
  Prettier for JavaScript, TypeScript, JSON, CSS and Markdown), then runs file-scoped ESLint from
  the track root, so the right configuration and `tsconfig` resolve.
- On lint errors it exits 2 with trimmed `file:line rule message` lines. Claude receives them; the
  edit is not undone.
- Per-file PHPStan is opt-in (`hooks.postToolUse.phpstan`) because it adds seconds to every edit.
  Child processes run with `PAO_DISABLE=1`, which stops laravel/pao from rewriting test and
  analysis output for agents, and results are judged by exit code.
- It is time-boxed and skips silently when a tool is not installed.

**Stop**:

- On by default; `CROSS_STACK_STANDARD_STOP_GATE=0` or `hooks.stop.enabled: false` turns it off.
- It runs the project's `check:fast` script (`hooks.stop.command`) within an in-script budget, 90
  seconds by default (`hooks.stop.budgetSeconds`). A run over budget is stopped by the script
  instead of being left to the platform timeout.
- When `stop_hook_active` is set (Claude is already continuing after a block), it lets the turn end
  only if nothing changed since the failing run; any change runs the gate again, and the platform's
  cap on consecutive blocks is the loop backstop.
- On failure it exits 2 with the failing command and the last ~60 lines of its output; the exit
  code decides, never a summary line.
- It skips when nothing changed since the last green run, using a fingerprint of the paths and
  contents of changed and untracked files, so a second edit to an already-changed file runs the
  gate again. The fingerprint is taken before the gate runs, and nothing is recorded when files
  change during the run. It also covers nested repositories, submodules and track roots outside the
  committed tree, files hidden with `--assume-unchanged` or `--skip-worktree`, and the git exclude
  files. Outside git it uses file metadata. Files that `check:fast` itself writes (caches) must be
  gitignored, or the skip never engages. The shortcut can still be steered by an agent that edits
  ignore rules, so PreToolUse asks before those edits. With no manifest or no `check:fast` script
  it exits 0 silently.

### Consequences

- Good, because lint errors are fixed while the file is still in Claude's context.
- Good, because a turn ends with `check:fast` green or with Claude told exactly why not.
- Good, because conversational turns with no changes pay only for the fingerprint.
- Bad, because every edit waits for a formatter and a typed ESLint run, which takes seconds.
- Bad, because a failing gate can hold a turn open for up to 8 consecutive blocks.
- Bad, because `check:fast` has to be kept fast by each project; the Standard only enforces the
  budget.

### Confirmation

Hook fixtures ([0019](0019-hook-runtime-contract.md)) cover a PostToolUse lint error (exit 2 with
the rule id), a clean edit, a missing tool, a failing and a passing `check:fast`,
`stop_hook_active`, the budget, the unchanged-tree skip, a re-edit of an already-changed file after
a green run, the no-manifest case and each off switch. The full suite runs in CI
([0090](0090-ci-contract.md)).

## Pros and Cons of the Options

### Per-file format and lint after edits, plus a blocking Stop gate running `check:fast`, on by default

- Good, because feedback arrives at the edit and at the end of the turn.
- Bad, because it adds latency to both.

### The same hooks, with the Stop gate opt-in

- Good, because nobody waits for a gate they did not ask for.
- Bad, because most projects never switch it on, so turns end with the gate red.

### A Stop gate that runs the full `check` suite

- Good, because it catches everything CI would.
- Bad, because the full suite does not fit a per-turn budget, and a platform timeout would discard
  its result.

## More Information

- PostToolUse and Stop behaviour, `stop_hook_active` and the consecutive-block limit:
  <https://code.claude.com/docs/en/hooks.md>
- laravel/pao output rewriting and `PAO_DISABLE`: recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0019](0019-hook-runtime-contract.md), [0021](0021-gate-file-protection.md),
  [0090](0090-ci-contract.md), [0014](0014-working-procedure.md) (report real gate output).
- Governs: the hook rules for PostToolUse feedback and the Stop gate, and the process rule that
  each track provides a `check:fast` script.
