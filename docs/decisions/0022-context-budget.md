---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Context budget and deterministic loading: minimal always-on text, path-scoped rule templates, rules cited by ID

## Context and Problem Statement

Text that is always loaded costs tokens in every session of every adopter, whether or not the task
touches the Standard, and long instruction files are followed less reliably. For this plugin the
always-on surface is the core skill's name and description, the SessionStart hook output and the
managed block in the project's `CLAUDE.md`. Everything else (the skill body, its references) loads
on demand, which is only useful if the important rules are present when Claude touches matching
files. A third problem is drift: a rule restated in several places ends up saying different
things.

How does the Standard keep its always-on cost small, make the key rules load deterministically, and
avoid paraphrase drift?

## Decision Drivers

- Always-on text is paid for in every session; it must be measured, not estimated.
- Tier-1 invariants ([0008](0008-tiers-and-invariants.md)) must be in context before Claude
  writes a new file, not only after it reads one.
- The mechanisms must exist in the platform: plugins have no rules component.
- Projects scaffolded by framework generators already contain agent files that must survive.

## Considered Options

- The skill alone: description in context, body and references on demand
- The whole rule set in always-on text (`CLAUDE.md` or SessionStart output)
- Layered loading: minimal always-on text, path-scoped rule templates, skill and references on
  demand
- A path-scoped core skill (`paths:` frontmatter)

## Decision Outcome

Chosen option: "Layered loading: minimal always-on text, path-scoped rule templates, skill and
references on demand", because each layer uses a documented loading mechanism for what it is good
at, and the cost of each is measurable.

- **Core skill.** `SKILL.md` stays under 500 lines. Its `description` states what the skill does
  and when to use it, with concrete trigger terms, in at most 1,024 characters (Claude Code shortens
  the listing to 1,536 characters for `description` plus `when_to_use`). References are one level
  deep and each is linked from `SKILL.md`; deterministic work lives in scripts.
- **User-invoked skills.** `adopt`, `upgrade`, `new-project`, `audit` and `doctor` set
  `disable-model-invocation: true`, so their descriptions are not in context.
- **Path-scoped rules.** Plugins cannot ship rules, so `adopt` copies `.claude/rules/laravel.md`,
  `web.md` and `mobile.md` with `paths:` frontmatter. They load when Claude reads a matching file,
  not when it creates one, so the Tier-1 invariants are also written into the managed block.
- **No `paths:` on the core skill.** A path-scoped skill is hidden from the `/` menu until a
  matching file is read, which would make the Standard unavailable at the start of a task.
- **Managed block.** Between `<!-- cross-stack-standard:begin -->` and
  `<!-- cross-stack-standard:end -->`, under 200 lines including any `AGENTS.md` it imports. It
  is merged into the `CLAUDE.md` and `AGENTS.md` files that Laravel, `create-next-app` and
  `create-expo-app` generate; content outside the markers is never overwritten.
- **SessionStart output.** A few factual lines (tracks, tier or "tier not declared: ask", use the
  skill before modifying application code), because plain stdout from SessionStart enters context.
- **Rules cited by ID.** Skills, references, templates and docs cite rule IDs from the registry
  ([0003](0003-rule-registry.md)) instead of restating rule text.
- **Measured cost.** Before each release the always-on cost is recorded with the CLI version as
  three numbers: the `claude plugin details` figure (an upper bound, since it counts user-only
  skills), the plugin's rows in the runtime `/context` view, and the measured SessionStart output
  per track case. The figures live in the README and
  [release.md](../maintainers/release.md#context-budget).

### Consequences

- Good, because the per-session cost is small and published, and any growth is visible.
- Good, because key rules reach the model on the paths where they matter, independent of skill
  activation.
- Bad, because Tier-1 text appears in two layers (managed block and rule files). Both cite rule
  IDs rather than restating rules, and `check-registry` rejects an ID that no longer exists.
- Bad, because the rule files depend on `adopt`; a project that skips it gets only the skill.

### Confirmation

The plugin-validation CI job lints `SKILL.md` length and description size. `doctor --ci` fails
when the managed block, with its imports, reaches 200 lines. `check-registry` fails when a skill,
reference, template or doc cites a rule ID that is not in the registry. A CI check compares the
`claude plugin details` figure with the recorded one, and hook tests bound the SessionStart output
size. Growth of the recorded figures is a review item.

## Pros and Cons of the Options

### The skill alone: description in context, body and references on demand

- Good, because the always-on cost is one description.
- Bad, because nothing guarantees the body loads before code is written.

### The whole rule set in always-on text (`CLAUDE.md` or SessionStart output)

- Good, because every rule is always present.
- Bad, because hundreds of rules cost thousands of tokens per session and exceed the documented
  200-line guidance for `CLAUDE.md`, which reduces adherence.

### Layered loading: minimal always-on text, path-scoped rule templates, skill and references on demand

- Good, because each layer is small and loads for a reason.
- Bad, because there are four places to keep consistent, which the registry-ID rule makes
  checkable.

### A path-scoped core skill (`paths:` frontmatter)

- Good, because it might defer the skill's cost until a matching file is read (unverified: one
  measurement listed such a skill at full cost; see
  [verified-versions.md](../maintainers/verified-versions.md)).
- Bad, because the skill is invisible before that read, including for tasks that start by
  creating files.

## More Information

- Skills: <https://code.claude.com/docs/en/skills.md>; authoring guidance:
  <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>; description
  limit: <https://agentskills.io/specification>.
- Rules, `paths:` and `CLAUDE.md` size: <https://code.claude.com/docs/en/memory.md>; path-scoped
  skills and rules trigger on reads:
  <https://github.com/anthropics/claude-code/issues/49835>,
  <https://github.com/anthropics/claude-code/issues/93248>.
- Measuring a plugin: <https://code.claude.com/docs/en/plugins/measure.md>; SessionStart context:
  <https://code.claude.com/docs/en/hooks.md>. Recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0003](0003-rule-registry.md), [0008](0008-tiers-and-invariants.md),
  [0015](0015-plugin-distribution.md), [0018](0018-project-detection.md),
  [0023](0023-adopter-manifest-and-upgrade.md).
- Governs: the process rules on context budget, the managed block and path-scoped rule files.
