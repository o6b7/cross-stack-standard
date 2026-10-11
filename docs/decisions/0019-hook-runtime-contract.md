---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Hook runtime contract: one Node entry point that honours opt-out, stays offline, fails open and is fixture-tested

## Context and Problem Statement

The plugin's hooks run at session start, after edits, before protected edits and at the end of
every turn, in every adopter repository, on macOS, Linux and Windows. They run outside the
sandbox with the user's privileges. A hook that crashes, hangs or reaches the network degrades
every session it touches.

Platform details constrain the design. A command hook without `args` runs in a shell (`sh -c`,
Git Bash on Windows, or PowerShell when Git Bash is missing), so quoting and tools differ by
platform; with `args` it is spawned directly, with no shell. On Windows, `.cmd` and `.bat` shims
cannot be launched without a shell. Stderr from a hook that exits 0 is visible only in the debug
log. A hook that cannot start is reported as a non-blocking error, and a hook that times out has
its output discarded. A common defect is one hook honouring the project's opt-out while another
ignores it.

What contract does every hook of the Standard follow?

## Decision Drivers

- The opt-out is honoured by every hook, without exception.
- Hooks never make network calls and never download tools.
- The same code runs on macOS, Linux and Windows.
- A broken or slow hook never stops a session.
- Every behaviour is proven by a test, not by reading the code.

## Considered Options

- One Node entry point in exec form, shared by every event
- One Node script per event, each importing a shared guard
- Shell scripts using standard Unix tools

## Decision Outcome

Chosen option: "One Node entry point in exec form, shared by every event", because a single
entry point makes the opt-out and the safety rules impossible to skip, and exec form removes the
shell from every platform.

- **One entry point.** Every `hooks.json` entry has the form
  `{"type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs", "<event>"]}`.
  The entry point's first step is the shared opt-out guard
  ([0018](0018-project-detection.md)); an opted-out project gets exit 0, no output and no child
  processes. A meta-test fails when any `hooks.json` entry bypasses the entry point.
- **Offline.** Tools are resolved only from the project: the JavaScript entry of a package's bin in
  `node_modules`, and `vendor/bin`. Never `npx`, never a package-manager download. Update notifiers
  and telemetry are switched off in child processes, using variable names recorded in
  [verified-versions.md](../maintainers/verified-versions.md) before use.
- **Portable.** Tools are spawned as `process.execPath` plus the resolved `.js` entry (and `php`
  plus the PHP entry), never through `.cmd` shims or `shell: true`. Paths are normalised, because
  Windows passes backslash-separated file paths. The hook suite runs on Linux, macOS and Windows.
- **Fail open.** User-visible notices use the JSON `systemMessage` field on stdout. A missing
  `node` surfaces as the platform's non-blocking hook error, and `doctor` checks for Node. Time
  budgets are enforced inside the script, with the hook's `timeout` set above the budget, because a
  platform timeout discards the output and fails open.
- **Fixture-tested.** Every hook has stdin-JSON fixtures that assert its exit code, stdout and
  stderr, including one case per opt-out source and a case with `node` absent from `PATH`.

### Consequences

- Good, because the opt-out, offline and portability rules live in one code path.
- Good, because there is no dependency on a shell, `jq` or GNU tools.
- Good, because every behaviour an adopter relies on has a fixture.
- Bad, because hooks need Node on `PATH`; backend-only teams install Node 22.13 or later, which
  the Laravel track already needs for its tooling.
- Bad, because failing open means a machine without Node silently loses the hooks apart from the
  platform's hook-error notice; the process rules list this as a known evasion.
- Bad, because in-script budgets have to be tuned per event and measured on real hardware.

### Confirmation

The hook test suite runs in CI on Ubuntu, macOS and Windows and includes the entry-point
meta-test, the per-source opt-out cases, a network-blocked case that must finish within the
budget, and the missing-Node case. A repository lint bans `shell: true` in scripts, and the
isolated-plugin smoke run ([0016](0016-self-contained-plugin-runtime.md)) runs the fixtures
against an installed-style copy.

## Pros and Cons of the Options

### One Node entry point in exec form, shared by every event

- Good, because no hook can skip the guard.
- Good, because exec form behaves the same on every platform.
- Bad, because every event pays for loading the shared dispatcher.

### One Node script per event, each importing a shared guard

- Good, because each script is small and independent.
- Bad, because the guard can be forgotten in a new script; only a meta-test would notice.

### Shell scripts using standard Unix tools

- Good, because they are quick to write.
- Bad, because they depend on a shell and on tools such as `jq` that Windows and minimal images
  lack, and JSON handled with `grep` is fragile.

## More Information

- Exec form, exit codes, `systemMessage`, timeouts and failing open:
  <https://code.claude.com/docs/en/hooks.md>
- Plugin path variables: <https://code.claude.com/docs/en/plugins/manifest-reference.md#environment-variables>
- Spawning `.bat` and `.cmd` files on Windows:
  <https://nodejs.org/docs/latest-v22.x/api/child_process.html#spawning-bat-and-cmd-files-on-windows>
- Related: [0016](0016-self-contained-plugin-runtime.md), [0018](0018-project-detection.md),
  [0020](0020-feedback-hooks.md), [0021](0021-gate-file-protection.md).
- Governs: the hook rules (opt-out honoured by every hook, offline tool resolution, fail-open
  behaviour) and the hook test suite.
