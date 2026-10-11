---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Gate-file protection: PreToolUse ask, permission rules and CODEOWNERS, labelled GUARDED

## Context and Problem Statement

A gate protects a project only while its configuration stays intact. When a build turns red, an
agent can make it green without fixing the code: lower an analysis level, add a suppression,
regenerate a baseline, delete an architecture test, skip the git hooks with `--no-verify`, or opt
the project out of the Standard. A common defect is protecting these files only with a CODEOWNERS
entry, which catches the change in review, after the agent has already reported the work as done.

How does the Standard stop an agent from weakening gates while keeping deliberate configuration
changes possible, and how is that protection labelled honestly?

## Decision Drivers

- The label must not overstate the guarantee ([0002](0002-gates-over-guidelines.md)).
- Protection should hold in as many Claude Code permission modes as the platform allows.
- A deliberate change (an upgrade, a new module, a reviewed threshold) needs a person to approve
  it, not a way around the protection.
- The protected list must follow the gates the kit actually ships and be extensible per project.
- Opting out must not become an escape from a blocking gate.

## Considered Options

- CODEOWNERS and branch rulesets only
- A PreToolUse hook that returns `deny` for every protected change
- A PreToolUse `ask` hook, permission rules written by `adopt`, and CODEOWNERS, labelled GUARDED
- The same combination, labelled FORCED

## Decision Outcome

Chosen option: "A PreToolUse `ask` hook, permission rules written by `adopt`, and CODEOWNERS,
labelled GUARDED", because it stops the agent at the moment of the edit with a reason, adds platform
rules that hold in every permission mode, keeps a person able to approve a deliberate change, and
claims only what the mechanism guarantees.

- **Protected paths.** A data file in the plugin's generated runtime data lists them: analyser and
  linter configurations and baselines (PHPStan, ESLint and its bulk suppressions,
  dependency-cruiser and its known violations, Prettier, Pint, knip, jscpd), architecture tests,
  test-runner configuration including coverage thresholds, the `scripts` sections of
  `package.json` and `composer.json`, `.cross-stack/**`, `.github/workflows/**`, CODEOWNERS,
  lefthook and commitlint configuration, update-bot and secret-scanner configuration, and the
  project's `.claude/settings.json`. The list is derived from the kit's gate templates, and a
  project extends it with `hooks.preToolUse.protect` in `.cross-stack/standard.json`.
- **Shell inspection.** On `Bash` and `PowerShell`, the hook asks before commands that bypass or
  weaken a gate: `--no-verify` and `git commit -n`, variables that turn lefthook off or redirect
  it, `core.hooksPath`, `#gitleaks:allow` and gitleaks configuration overrides, test-runner flags
  that stop failing on incomplete or skipped tests, Composer and npm audit overrides (for example
  `npm audit --audit-level=none`), baseline deletion or regeneration, and in-place edits,
  redirects, copies or moves onto a protected path. The sanctioned `<tool>:baseline:update`
  scripts, which regenerate a baseline and fail when it grows ([0005](0005-explicit-exceptions.md)),
  are not inspected. Projects add patterns with `hooks.preToolUse.protectCommands`.
- **Decision shape.** The hook returns `permissionDecision: "ask"` with a reason for the user and
  `additionalContext` for Claude, because the reason of an `ask` is shown to the user only.
- **Permission rules.** Plugin settings apply only `agent` and `subagentStatusLine`, so a plugin
  cannot ship permission rules. `adopt` therefore writes them into the project's
  `.claude/settings.json`: `permissions.ask` for gate configurations and `permissions.deny` for
  baselines and allowlists, which change only through the sanctioned scripts or by hand.
- **Opt-out protection.** Adding the line `cross-stack-standard: declined` to a `CLAUDE.md`
  file, or setting `disabled` in `.cross-stack/**`, is a protected change, whether it arrives
  through an edit or through a shell command (`>>`, `tee`, `Add-Content`, `Set-Content`).
- **Human backstop.** The kit's CODEOWNERS template covers the gate files and branch rulesets
  require review ([0094](0094-developer-workflow-templates.md)).
- **Label.** The protection rules are GUARDED. Their registry `evasions` name bypass permission
  mode with hook-only protection, shell forms the patterns do not recognise, edits made outside
  Claude Code, a person approving the prompt, and hooks inactive when `node` is missing
  ([0019](0019-hook-runtime-contract.md)).

### Consequences

- Good, because the agent learns why the edit is protected at the moment it tries, instead of in
  review.
- Good, because the `deny` and `ask` permission rules hold in every mode, including
  `bypassPermissions`, for the file tools they name.
- Good, because deliberate changes stay one confirmation away.
- Bad, because shell inspection is pattern matching: it has false positives (a prompt) and false
  negatives (an unlisted command), which is why the label is GUARDED.
- Bad, because a baseline or allowlist change under `deny` needs a person or a sanctioned script.

### Confirmation

Hook fixtures in `test/hooks/` feed stdin JSON for every protected path class, every command
pattern, the opt-out line through an edit and through the shell, and the sanctioned
`baseline:update` scripts, and assert the decision; they follow the fail-then-pass law
([0004](0004-fail-then-pass.md)). A repository test checks that every gate file in the kit's
templates is covered by the protected-path data. `check-registry` requires the non-empty
`evasions` list. Whether an adopted project keeps its permission rules and CODEOWNERS entries is
checked in review.

## Pros and Cons of the Options

### CODEOWNERS and branch rulesets only

- Good, because the hosting platform enforces them at merge time with no runtime cost.
- Bad, because they act after the change; locally the agent reports a green build that depends on
  a weakened gate.

### A PreToolUse hook that returns `deny` for every protected change

- Good, because Claude Code documents `deny` as blocking even in `bypassPermissions` mode.
- Bad, because it also blocks changes the user asked for, which pushes users to disable the hook or
  the plugin.
- Bad, because a false positive from shell pattern matching becomes a hard stop.

### A PreToolUse `ask` hook, permission rules written by `adopt`, and CODEOWNERS, labelled GUARDED

- Good, because each layer covers a gap in another: the hook explains, the permission rules hold
  in every mode, CODEOWNERS and rulesets catch what reaches a pull request.
- Bad, because `adopt` must write project settings, and those settings can be edited.

### The same combination, labelled FORCED

- Bad, because a hook's `ask` is not among the actions that no permission mode auto-approves, and
  unlisted shell forms or edits outside Claude Code still pass; the label would overstate.

## More Information

- Hook decisions (`allow`, `deny`, `ask`, `defer`; the `ask` reason reaches the user only):
  <https://code.claude.com/docs/en/hooks.md>; `deny` in `bypassPermissions`:
  <https://code.claude.com/docs/en/hooks-guide.md>.
- Actions no mode auto-approves (explicit `ask` rules), deny rules in every mode, and built-in
  protected paths: <https://code.claude.com/docs/en/permission-modes.md>.
- Plugin settings keys: <https://code.claude.com/docs/en/plugins/components.md#default-settings>.
  Verification is recorded in [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0002](0002-gates-over-guidelines.md), [0005](0005-explicit-exceptions.md),
  [0019](0019-hook-runtime-contract.md), [0094](0094-developer-workflow-templates.md).
- Governs: the process rules on gate-file protection, gate-bypassing shell commands and
  protection of the opt-out line.
