---
status: superseded by 0106
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# design module: impeccable as an optional, pinned integration

## Context and Problem Statement

Some teams want an agent-driven design review of their interface. impeccable (Apache-2.0) ships a
Claude Code marketplace and plugin with a skill of 23 commands, a PostToolUse hook and a Stop hook.
Its detector is a Rust engine binary that the plugin does not ship: on the first run of any command
or hook, a launcher downloads the binary for the platform from the project's GitHub releases.
Installed command hooks run independently of model tool approval, so that download can happen even
when a session denies the launcher. The skill also checks for updates at most once a day, and one
command reports choices to the project's endpoint unless telemetry is turned off. Its core prompt
encourages bold, out-of-distribution work, which suits new designs but not a working product. The
upstream install command is unpinned, and the default branch currently carries an untagged newer
version.

How does the Standard offer impeccable to teams that want it without making it mandatory,
unpinned or chatty?

## Decision Drivers

- Opt-in: projects that do not enable the module get nothing installed and nothing started.
- A pinned, verifiable version, including the engine binary.
- No network call the team did not choose, and every endpoint documented.
- Only review-style commands, against the project's own design tokens.

## Considered Options

- A plugin dependency of the Standard's plugin
- `doctor` prints the pinned install and verifies it (the `design` module)
- A vendored, pinned copy inside the kit
- The upstream install instructions as they stand

## Decision Outcome

Chosen option: "`doctor` prints the pinned install and verifies it (the `design` module)", because
it is the only option that is both optional and pinned without taking over maintenance of a
third-party project.

- **Module.** `design` is declared in `.cross-stack/standard.json` ([0010](0010-opt-in-modules.md))
  and is off by default under the proposed default set ([0011](0011-default-module-set.md)).
- **Install.** `doctor` prints `claude plugin marketplace add pbakaus/impeccable#skill-v4.3.1`, then
  `claude plugin install impeccable@impeccable --scope project` (for a team-wide install the
  marketplace command also takes `--scope project`). A marketplace `#ref` accepts a tag, not a
  commit, and tags can move, so `doctor` checks that the installed plugin is at commit
  `cd12f8660e2dde57b9615c8a6b8ea674101f9cfc`. When a marketplace named `impeccable` already exists,
  adding it again with a different ref is refused, so `doctor` prints the `ref` edit instead.
- **Engine.** skill-v4.3.1 pairs with engine 0.1.5. The plugin commit does not pin that binary, and
  the launcher checks it only against a checksum file from the same release. The module therefore
  pre-provisions the engine: `doctor` installs it, verifies its SHA-256 against the value recorded
  in [verified-versions.md](../maintainers/verified-versions.md) and points `IMPECCABLE_BIN` at it.
- **Quiet by default.** Templates write `hook.enabled: false` and `updateCheck: false` to
  `.impeccable/config.json` and set `IMPECCABLE_NO_TELEMETRY=1`, `IMPECCABLE_NO_UPDATE_CHECK=1` and
  `DO_NOT_TRACK=1`. The FAQ lists every endpoint the integration can reach: the engine download,
  the daily version check, choice reporting, the catalogue fetch (which the telemetry switches do
  not turn off), preview images and web fonts on some pages.
- **Scope of use.** Only the `audit`, `critique` and `polish` commands are mandated, run against the
  project's own tokens ([0066](0066-design-tokens.md)). New-work or redesign modes are never used on
  an existing product.

### Consequences

- Good, because nothing is installed or started for projects that do not opt in.
- Good, because the plugin commit and the engine binary are both verified, not trusted.
- Good, because the review commands work inside the project's design system instead of replacing it.
- Bad, because installation is a manual, two-command step per project.
- Bad, because a moved tag is detected by `doctor`, not prevented.
- Bad, because each upgrade re-verifies the tag, commit and engine hashes by hand.

### Confirmation

`doctor` checks the installed commit, the engine binary's SHA-256, the `.impeccable/config.json`
values and the environment switches in projects with the module on. The refusal of a same-name
marketplace add is tested in a throwaway Claude Code configuration directory before `doctor`
relies on it. Which impeccable commands a project runs is checked in review (REVIEW).

## Pros and Cons of the Options

### A plugin dependency of the Standard's plugin

- Good, because installation would be automatic.
- Bad, because declared dependencies are installed with the plugin; there is no optional
  dependency, so every adopter would get impeccable and its hooks.
- Bad, because version ranges resolve against `<plugin>--v<version>` tags, which impeccable does
  not publish.

### `doctor` prints the pinned install and verifies it (the `design` module)

- Good, because it is optional, pinned and checkable.
- Bad, because it relies on the team running `doctor` and the printed commands.

### A vendored, pinned copy inside the kit

- Good, because the kit would control the exact files.
- Bad, because the licence requires carrying LICENSE and NOTICE files, the distributable build is
  not committed upstream, and every upstream update becomes this project's work.

### The upstream install instructions as they stand

- Good, because they are the simplest.
- Bad, because they track the default branch and leave hooks, update checks and telemetry on.

## More Information

- impeccable: <https://github.com/pbakaus/impeccable>; privacy and endpoints:
  <https://impeccable.style/privacy>.
- Plugin dependencies: <https://code.claude.com/docs/en/plugins/dependencies>; marketplace sources
  and `#ref`: <https://code.claude.com/docs/en/discover-plugins>.
- Pins, engine hashes and observed behaviour:
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0010](0010-opt-in-modules.md), [0032](0032-supply-chain-pinning.md),
  [0035](0035-browser-check-module.md), [0066](0066-design-tokens.md).
- Governs: the `design` module's doctor checks and templates.
