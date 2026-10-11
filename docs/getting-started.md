# Getting started

This guide takes a project from nothing to a first session under the Cross-Stack Standard. It
takes a few minutes. For the full adoption options (brownfield baselines, tiers, modules), read
[Adopting](adopting.md) next.

> **0.1.0 is an early release.** Six rules are GUARDED by shipped hooks and 379 are REVIEW guidance;
> track gates land in later 0.x releases. The portable Agent Skill also works in Gemini CLI, Codex
> and other compatible hosts. This guide covers the Claude Code plugin; see the [README](../README.md#use-with-gemini-cli-codex-and-other-coding-agents)
> for the portable skill. See the [roadmap](../ROADMAP.md).

## Before you start

- **Claude Code.** The plugin is validated in CI with Claude Code 2.1.282. A minimum supported
  version is not stated yet.
- **Node.js 22.13 or later** on your `PATH`. Every hook runs with `node`, including in
  Laravel-only projects.
- **A supported project** (or an empty folder for a new one):

  | Track     | Stack                                                                                      |
  | --------- | ------------------------------------------------------------------------------------------ |
  | `laravel` | A Laravel JSON API ([details](tracks/laravel.md))                                          |
  | `web`     | Next.js 16 with the App Router ([details](tracks/web.md)); a React SPA profile comes later |
  | `mobile`  | Expo / React Native ([details](tracks/mobile.md))                                          |

  A repository can hold several tracks, for example a Laravel API and a Next.js app side by side.

## 1. Install the plugin

In a Claude Code session, in your repository:

```text
/plugin marketplace add o6b7/cross-stack-standard
/plugin install cross-stack-standard@cross-stack-standard
```

`/plugin install` opens the plugin's details. Choose the scope:

| Scope   | Where it is recorded                               | Who gets the plugin                                                                                 |
| ------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| User    | Your user settings                                 | You, in every project                                                                               |
| Project | The repository's committed `.claude/settings.json` | Everyone who trusts the repository once the marketplace is registered there too (`adopt` does that) |
| Local   | `.claude/settings.local.json` (not committed)      | You, in this repository only                                                                        |

For a team, choose **Project**, or commit the settings snippet from the
[README](../README.md#team-rollout), which also pins a release. Then run `/reload-plugins` (or
start a new session) so the hooks and skills load.

From a terminal instead:

```sh
claude plugin marketplace add o6b7/cross-stack-standard
claude plugin install cross-stack-standard@cross-stack-standard --scope project
```

Check what is installed with `claude plugin details cross-stack-standard`.

## 2. Adopt the project

```text
/cross-stack-standard:adopt
```

`adopt` is a skill you run yourself; Claude never starts it on its own. It:

1. detects the tracks in the repository (a Laravel `composer.json`, a Next.js or Expo
   `package.json`), reporting every track it finds;
2. asks for your **tier** when none is declared: Tier 1 applies the invariants to every project,
   Tier 2 adds the full Standard for projects that are multi-tenant, have more than one developer,
   or are long-lived;
3. proposes the modules that fit your tracks and locales;
4. writes `.cross-stack/standard.json`, the project tool and the Claude Code files, merging into
   any `CLAUDE.md` your framework generator created and leaving `AGENTS.md` untouched.

Claude Code asks before each write under `.claude/` (outside bypass-permissions mode), because it
protects that folder. The details are in [Adopting](adopting.md#what-adopt-writes).

Starting from an empty folder? Run `/cross-stack-standard:new-project` instead: it scaffolds with
the framework's official generator and then adopts.

## 3. Work as usual

Start a new session (or `/clear`). The plugin now works alongside you:

| When                                | What happens                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The session starts                  | A few lines tell Claude the project's tracks, tier (or "tier not declared: ask") and to use the `cross-stack-standard` skill before changing application code.        |
| Claude edits a file                 | Your installed formatter (Prettier or Pint) formats it, then ESLint runs on that file; lint errors go straight back to Claude as `file:line rule message` lines.      |
| Claude finishes a turn              | Your `check:fast` script runs within a time budget (90 seconds by default); if it fails, Claude sees the failing command and the end of its output and keeps working. |
| Claude tries to edit a gate file    | You are asked first, with the reason: gate configurations, baselines, allowlists, CI workflows and the opt-out line are protected.                                    |
| Claude runs a gate-skipping command | You are asked first, for example for `git commit --no-verify` or a baseline regenerated outside its sanctioned script.                                                |

Each step skips silently when its tool or script is not installed, and nothing in the hooks uses
the network. Ask Claude for a change the way you normally would; the skill makes it name the rule
IDs it follows, stop and ask in unfamiliar territory, and paste the real output of the checks it
ran.

## 4. Check where you stand

```text
/cross-stack-standard:doctor
/cross-stack-standard:audit
```

- `doctor` checks Node.js, git, the Claude Code CLI, the manifest, the opt-out status, the size of
  the managed `CLAUDE.md` block, the rule files and the plugin enablement, and explains each result.
  It changes nothing without asking.
- `audit` is a read-only report of the project against the rules that apply to it, citing rule IDs.
  In 0.1.0, it is the most direct way to review existing code against the catalog's 379 REVIEW
  rules; six rules have a shipped GUARDED hook.

Use the plugin's skills by their full names: `/doctor` and `/upgrade` without the prefix are
built-in Claude Code commands.

## 5. Next steps

- Commit `.cross-stack/` and the Claude Code files `adopt` wrote, so the team shares them.
- Read the rules for your tracks: [Laravel](tracks/laravel.md), [Web](tracks/web.md),
  [Mobile](tracks/mobile.md), and the full [rule catalog](rules/README.md).
- Decide how you receive updates: [Upgrading](upgrading.md).
- Learn how labels, exceptions and gate-file protection work: [How enforcement works](enforcement.md).
- Tune the hooks and modules: [Configuration](configuration.md).
- To switch the Standard off for a project or a session, see
  [Opting out](../README.md#opting-out).
