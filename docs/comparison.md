# Comparison with other approaches

Teams keep a codebase consistent in several ways, and most of them work well for what they aim at.
This page places the Cross-Stack Standard among them honestly, including when it is not the right
choice. The Standard builds on many of these tools rather than replacing them
([ADR 0006](decisions/0006-stack-first.md)).

## At a glance

| Approach                                             | Checked automatically?                            | Architecture across Laravel, web and mobile? | Still holds after day one?                              |
| ---------------------------------------------------- | ------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| Written guidelines (`CLAUDE.md`, `AGENTS.md`, wikis) | No                                                | If someone writes it                         | Only while people remember                              |
| Agent skills and prompt packs                        | No                                                | If someone writes it                         | Only while the agent follows it                         |
| Framework lint and analysis presets                  | Yes                                               | No: generic quality per tool                 | Yes                                                     |
| Architecture tools (import and layer rules)          | Yes                                               | Per tool, once you write the rules           | Yes                                                     |
| Security scanners and review bots                    | Yes                                               | No: vulnerability patterns                   | Yes                                                     |
| Starter templates                                    | At creation                                       | For the starting state                       | Drifts after creation                                   |
| **Cross-Stack Standard**                             | Yes, when a rule's gate ships (six guarded rules) | Yes: one registry for all three              | Yes: `upgrade` for kit files now, CI gates as they ship |

## Written guidelines

A `CLAUDE.md`, an `AGENTS.md` or a style guide is cheap to write and easy to change. Nothing checks
it, though, and long instruction files are followed less reliably: Claude Code's own guidance is to
keep `CLAUDE.md` under 200 lines. The Standard uses a managed `CLAUDE.md` block for the few things
that must always be in context, cites rules by ID instead of restating them, and moves everything
checkable into gates ([ADR 0022](decisions/0022-context-budget.md)).

## Agent skills and prompt packs

A skill loads on demand and costs little context, which is why the Standard ships a portable core
skill for Claude Code, Gemini CLI, Codex and compatible hosts. A skill can guide an agent; it cannot
make a build fail when the instruction is ignored, and it does nothing for code written by people or
other tools. The Claude Code plugin adds hooks that feed lint errors back while Claude works and run
a fast gate before each turn ends. CI gates that ship apply to everyone.

## Framework lint and analysis presets

`eslint-config-next`, `eslint-config-expo`, typescript-eslint, Larastan and Pint are excellent at
generic quality: type safety, framework pitfalls, formatting. They do not know your architecture:
which layer may import which, where authorization happens, how a cookie BFF must treat headers,
how locale files stay in step, or how a tenant scope fails closed. The Standard keeps these presets
as its base, on the versions it pins, and adds rules for those architectural properties on top
([ADR 0060](decisions/0060-javascript-lint-baseline.md),
[ADR 0038](decisions/0038-larastan-levels-shrink-only-baseline.md)).

## Architecture tools

dependency-cruiser, Pest architecture tests, Deptrac and eslint-plugin-boundaries enforce import and
layer rules well. Each is a tool, though: someone still has to decide the rules, write the
configuration for each stack, and prove that each rule actually fails on a violation. The Standard
records those decisions as data in its rule registry; each gate configuration ships with a clean
and a violation fixture for its rule, and the planned gates use dependency-cruiser and Pest
themselves. Deptrac and eslint-plugin-boundaries are under evaluation
([ADR 0105](decisions/0105-architecture-tool-evaluations.md)).

## Security scanners and review bots

Static application security testing (Semgrep, CodeQL) and automated review find vulnerability
patterns and suspicious changes. They complement the Standard rather than overlap with it: the
Standard's security rules are structural (every route resolves to a policy ability, the BFF refuses
cross-site mutations, credentials stay in the secure store), and a SAST template is planned after
1.0 ([ADR 0100](decisions/0100-sast-template.md)). A pinned secret scan and dependency audits are
part of the planned adopter templates
([ADR 0084](decisions/0084-secret-scanning-and-dependency-audits.md)).

## Starter templates

A starter kit gives a good first day. From day two it drifts: the template moves on, the project
edits its copies, and nobody can say which version the project follows. The Standard records the
adopted version in `.cross-stack/standard.json` and a hash of every kit file per release, so
`upgrade` can tell an untouched file from a local edit and propose the difference as a pull request
([ADR 0023](decisions/0023-adopter-manifest-and-upgrade.md)).

## When the Standard is not the right choice

- **You need gates today.** 0.1.0 ships the plugin, hooks, skills and rule catalog; the track gates
  land in 0.x releases ([roadmap](../ROADMAP.md)). Until then the rules are guidance.
- **Your stack is outside the tracks.** Next.js 15 or earlier, a React SPA without Next.js (planned
  after 1.0), server-rendered Laravel front ends, or a mobile stack other than Expo.
- **You want only a lint preset.** If generic quality for one stack is all you need, the framework
  presets alone are simpler.
- **You need Claude Code hook parity in another host.** The portable Agent Skill works in Gemini
  CLI, Codex and other Agent Skills-compatible hosts, but the automatic hooks and management
  workflows in 0.1.0 are specific to Claude Code.
- **You cannot run Node.js 22.13 or later** where Claude Code runs; the hooks need it, Laravel-only
  projects included.
