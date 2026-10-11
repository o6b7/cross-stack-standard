---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# Companion plugins: caveman, impeccable, Figma MCP and Chrome DevTools MCP, pinned and offered at adoption

## Context and Problem Statement

Teams that follow the Standard work with four third-party Claude Code tools: caveman (terse replies
on demand), impeccable (design review), the Figma MCP server (reading designs) and the Chrome
DevTools MCP server (checking the running app in a browser). Each publishes its own Claude Code
plugin, and each upstream install tracks its latest commit and turns on more than a team needs:
caveman's plugin activates terse mode in every session and ships a proxy and an engine under
another licence; impeccable's plugin installs a PostToolUse and a Stop hook; the Chrome DevTools
plugin starts its server without the privacy flags. [0034](0034-design-module.md) and
[0035](0035-browser-check-module.md) made two of them manual, opt-in steps that `doctor` printed,
and caveman was left out. In practice that meant nobody had the tools, or everyone installed the
unpinned upstream copies.

How does the Standard give every team all four tools with one confirmation, pinned and quiet,
without forcing them on anyone?

## Decision Drivers

- One install flow: the user answers one question and gets every tool they ticked.
- Nothing is downloaded or installed without the user's yes.
- Every companion is pinned to a reviewed commit, not to a moving tag or branch
  ([0032](0032-supply-chain-pinning.md)).
- Each companion loads only what the team uses: no always-on modes, no hooks the team did not
  choose, privacy flags on.
- The Standard itself stays installable on its own.

## Considered Options

- Required plugin dependencies of the Standard's plugin
- Companion entries in the Standard's marketplace, offered by adopt and checked by doctor
- A second "full" plugin that depends on the Standard and the companions
- `doctor` prints the upstream installs ([0034](0034-design-module.md),
  [0035](0035-browser-check-module.md))

## Decision Outcome

Chosen option: "Companion entries in the Standard's marketplace, offered by adopt and checked by
doctor", because it is the only option that is pinned, quiet and one confirmation away, while
leaving every tool the user's choice.

- **Marketplace entries.** `.claude-plugin/marketplace.json` lists `caveman`, `impeccable`, `figma`
  and `chrome-devtools-mcp` after the Standard. Each entry fetches the upstream repository at a
  full commit SHA:

  | Companion             | Upstream                           | Pin                                                        | What the entry loads                                                                                                                                                                                                                    |
  | --------------------- | ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `caveman`             | JuliusBrussee/caveman              | v2.7.0, `8b0c1d3699b8d83e87fe4605b378da20c41555e0`         | The `skills/` directory only, and of it four skills: `caveman`, `caveman-commit`, `caveman-review`, `caveman-help`. No hooks, no proxy, no engine.                                                                                      |
  | `impeccable`          | pbakaus/impeccable                 | skill-v4.3.1, `cd12f8660e2dde57b9615c8a6b8ea674101f9cfc`   | The `.claude/` directory: the skill and its four agents, without the plugin's hooks.                                                                                                                                                    |
  | `figma`               | figma/mcp-server-guide             | plugin 2.2.111, `d638a5e055e8d95e0394a94350860398cf424b74` | The upstream plugin as published: the remote Figma MCP server and its skills.                                                                                                                                                           |
  | `chrome-devtools-mcp` | ChromeDevTools/chrome-devtools-mcp | v1.10.1, `e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df`        | The `skills/` directory (seven skills) and, from the entry, the server `npx -y chrome-devtools-mcp@1.10.1 --isolated --no-usage-statistics --no-performance-crux --redact-network-headers` with update checks and usage statistics off. |

  Where an entry fetches a subdirectory without a `plugin.json`, the entry is the whole manifest,
  so it decides exactly which skills, agents and servers load and that no hooks do.

- **Consent, one yes or no per companion.** `/cross-stack-standard:adopt` asks four questions in
  one prompt, each with Yes (recommended) and No and the companion's purpose, access, network use
  and licence (from `metadata.crossStack` in the marketplace, generated into the plugin's
  `data/companions.json`). `scripts/companions.mjs record` writes the answers to `companions` in
  `.cross-stack/standard.json`, sets the `design` and `browser-check` modules from the impeccable
  and Chrome DevTools MCP answers ([0010](0010-opt-in-modules.md)), logs each decision and prints
  the install commands for the approved companions only: project scope for `impeccable`, `figma`
  and `chrome-devtools-mcp`, user scope for `caveman`. Every companion must be answered; no answer
  is No. A companion already installed at its pin is not installed again; one at another commit
  is updated; a second copy from another marketplace is offered for disabling.
- **Status and health checks.** The status of each companion comes from Claude Code's
  `installed_plugins.json` (the installed commit against the pin), `enabledPlugins`, the consent
  record and the last call's outcome: `ready`, `unverified`, `unhealthy`, `declined`,
  `not-installed`, `disabled` or `unpinned`, plus any duplicate copy. The SessionStart hook reports
  it at startup, `companions.mjs status` on demand. A companion's first tool call is its health
  check: PostToolUse records success, PostToolUseFailure records the failure.
- **Before each call, failing closed.** Only an explicit `true` in the consent record permits a
  companion: `false`, a missing or invalid value, or a missing or unreadable manifest deny its MCP
  tools, its skills (the Skill tool) and its shell installs and enables. The PreToolUse hook asks
  before a call to a copy not at its pin, disabled, or beside another copy, including hand copies
  in `~/.claude/skills` and `~/.claude/agents`. The core skill uses a
  companion only when its state is `ready` or `unverified`, and only when the task needs it; the
  companions' skills and MCP tools load on demand.
- **Least privilege.** The PreToolUse hook asks before the browser companion opens a page whose
  explicit URL is not on a local or project host, and on every other action (reads, screenshots
  and reloads included) unless the session's current page is known and on such a host; the page
  is tracked per session from successful navigations and forgotten after back, forward, a page
  switch, a closed page or a failed navigation, and a missing URL is never taken for localhost. It
  always asks before a page script, a file upload or an unreviewed tool (SEC-074), and before any Figma tool that is not a known read (SEC-075). It denies a shell
  command that installs a declined companion and asks before one that installs a companion from
  another marketplace. It never approves a call on the user's behalf.
- **Graceful fallback.** Each companion carries a fallback message. An unusable companion's status
  line, a denied call and a failed call (through PostToolUseFailure's context for Claude) all give
  the user one line on what is unavailable and the safe alternative.
- **Structured log.** Consent answers, status checks, gate decisions and health changes are JSON
  lines (`ts`, `event`, `companion`, `decision` or `status`, `reason` or `detail`) in
  `${CLAUDE_PLUGIN_DATA}/companions.log.jsonl`, capped at 1,000 lines; `companions.mjs log` and
  `doctor` show them.
- **Doctor checks.** `/cross-stack-standard:doctor` runs `status` and `log` and explains each state,
  including copies left in `~/.claude/skills` by an older install script, and offers each fix only
  with the user's yes.
- **caveman stays off until asked.** Without its hooks, caveman is on only after the user types
  `/caveman`. The Standard's UserPromptSubmit hook adds a reminder in plan mode that pauses it for
  the turn, because a plan is a conversation that needs complete prose, and caveman never shortens
  pasted check output (PROC-021).
- **Rules.** SEC-074 and SEC-075 are GUARDED by the PreToolUse gates; UI-013 and UI-021 apply when
  their module is on; UI-022 and SEC-073 keep the planned project-tool doctor checks of the pins;
  SEC-048 keeps browser tooling on test accounts.

### Consequences

- Good, because a new team gets all four tools with one question and the reviewed commits.
- Good, because each tool loads only what the team uses: no always-on terse mode, no extra hooks,
  the browser server in an isolated profile.
- Good, because the Standard installs on its own for a team that wants none of them.
- Bad, because the marketplace now carries four entries whose pins this project must review and
  move for each upstream release.
- Bad, because `figma` is the upstream plugin as published, so its contents follow that commit
  rather than a reduced entry.
- Bad, because impeccable's engine binary is not pinned by the plugin commit: it downloads on the
  first command and is checked only against a checksum file from the same release.
- Bad, because an existing copy from another marketplace stays installed until the user disables it.

### Confirmation

- `test/hooks/companions.test.mjs`: the consent flow (only approved companions installed, every
  one answered once, no second install, duplicates offered for disabling), each status and health
  state, every permission gate, the fallback messages, the structured log and its cap, the CLI
  (`describe`, `status`, `record`, `health`, `log`) and the hooks end to end (PreToolUse,
  PostToolUse, PostToolUseFailure, SessionStart).
- The fixture matrix proves SEC-074 and SEC-075: the PreToolUse hook stays silent for a local page
  and a Figma read, and answers `ask` for a public site and a Figma edit.
- `test/scripts/plugin/manifests.test.mjs`: each companion entry fetches a GitHub repository at a
  full commit SHA, caveman loads exactly its four skills, no companion loads hooks, the Chrome
  DevTools server carries its privacy flags, and the Standard declares no dependencies.
- An install into a throwaway configuration directory confirmed each entry: four caveman skills
  and no hooks; the impeccable skill and four agents and no hooks; the Figma server and fourteen
  skills; the Chrome DevTools server with its flags and seven skills.

## Pros and Cons of the Options

### Required plugin dependencies of the Standard's plugin

- Good, because one `claude plugin install` would install everything.
- Bad, because dependencies cannot be optional: every adopter would carry all four tools, and
  disabling one disables the Standard.
- Bad, because every session would pay the four tools' listing cost (about 2,700 tokens).

### Companion entries in the Standard's marketplace, offered by adopt and checked by doctor

- Good, because it is pinned, quiet and chosen by the user.
- Bad, because the install happens in adopt, one step after the plugin install.

### A second "full" plugin that depends on the Standard and the companions

- Good, because one install command would give the whole set.
- Bad, because it is all or nothing again, only one level up, and a second plugin to maintain.

### `doctor` prints the upstream installs

- Good, because the Standard carries no third-party entries.
- Bad, because the tools are installed by hand or not at all, and the upstream copies are unpinned
  and load hooks and always-on modes.

## More Information

- Plugin sources, `git-subdir` and `sha`:
  <https://code.claude.com/docs/en/plugins/marketplace-reference>; plugin dependencies:
  <https://code.claude.com/docs/en/plugins/dependencies>.
- Upstreams: <https://github.com/JuliusBrussee/caveman>, <https://github.com/pbakaus/impeccable>,
  <https://github.com/figma/mcp-server-guide>, <https://github.com/ChromeDevTools/chrome-devtools-mcp>.
- Pins and observed behaviour: [verified-versions.md](../maintainers/verified-versions.md).
- Supersedes [0034](0034-design-module.md) and [0035](0035-browser-check-module.md). Related:
  [0010](0010-opt-in-modules.md), [0011](0011-default-module-set.md),
  [0032](0032-supply-chain-pinning.md), [0066](0066-design-tokens.md).
- Governs: the companion marketplace entries, `scripts/companions.mjs`, `scripts/lib/companions.mjs`,
  adopt's companion questions, doctor's companion checks, the companion hooks and the plan-mode
  reminder.
