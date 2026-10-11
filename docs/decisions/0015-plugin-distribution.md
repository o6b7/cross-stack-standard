---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Distribution as a Claude Code plugin from an in-repo marketplace, enabled per repository

## Context and Problem Statement

The Standard reaches a project through Claude Code: a core skill that Claude loads while working,
hooks that give feedback and run the fast gate, and user-invoked skills that adopt, upgrade,
scaffold, audit and diagnose a project. That bundle has to be installed somewhere.

A common defect of global installation (an installer script that symlinks skills into the user's
directory, adds hooks to user settings and appends a block to a global CLAUDE.md) is that it fires
in every repository on the machine, including unrelated ones. It also cannot be pinned per
project, and it works only on the platforms its installer script was written for. Claude Code now
has plugins, marketplaces and per-repository enablement through committed settings.

How is the Standard distributed and switched on for a project?

## Decision Drivers

- Enabled per repository, and invisible in every other repository.
- Pinned to a released version, with version changes reviewed in a pull request.
- Works on macOS, Linux and Windows without an installer script.
- Minimal always-on context.
- No third-party code arrives without the adopter choosing it.

## Considered Options

- A plugin from an in-repo marketplace, enabled per repository through committed settings
- A user-global installer (symlinked skills, user-level hooks, a global CLAUDE.md block)
- Skills and hooks copied into each repository's `.claude/` directory

## Decision Outcome

Chosen option: "A plugin from an in-repo marketplace, enabled per repository through committed
settings", because it is the platform's own unit of distribution, and it is scoped and versioned
per repository.

- **Marketplace.** This repository hosts `.claude-plugin/marketplace.json` with the name
  `cross-stack-standard`, serving `plugins/cross-stack-standard/` through a relative source. The
  install id is `cross-stack-standard@cross-stack-standard`; the name is not reserved.
- **Per-repository enablement.** Teams commit `.claude/settings.json` with `extraKnownMarketplaces`
  and `enabledPlugins`, pinned to a release tag; the kit ships this as a template. A user opts out
  in one repository with `false` in `.claude/settings.local.json`.

  ```json
  {
    "extraKnownMarketplaces": {
      "cross-stack-standard": {
        "source": { "source": "github", "repo": "o6b7/cross-stack-standard", "ref": "vX.Y.Z" }
      }
    },
    "enabledPlugins": { "cross-stack-standard@cross-stack-standard": true }
  }
  ```

- **Skills.** One model-invoked core skill, `cross-stack-standard`, plus the user-invoked `adopt`,
  `upgrade`, `new-project`, `audit` and `doctor`, each with `disable-model-invocation: true` so
  their descriptions stay out of context. They are documented as `/cross-stack-standard:<name>`,
  because `/doctor` and `/upgrade` are built-in commands that take the bare names.
- **Nothing bundled from third parties.** The plugin ships no third-party skills. The companion
  plugins are separate entries in the same marketplace, pinned to commits and installed by adopt
  only when the user ticks them ([0106](0106-companion-plugins.md)); plugin dependencies cannot be
  optional, so none are declared.
- **Minimum Claude Code version.** It is stated only once it has been tested. The recommended
  floor is 2.1.280: exec-form hook `args` need 2.1.139, the one-step `/plugin install` with
  `--marketplace` needs 2.1.275, and `CLAUDE_CODE_PLUGIN_DIRS` needs 2.1.280.

### Consequences

- Good, because nothing runs in repositories that did not enable the plugin.
- Good, because the version is pinned by tag in committed settings and moves in a reviewed pull
  request.
- Good, because there is no installer script; the platform copies, caches and updates the plugin.
- Bad, because repository settings apply only after the workspace-trust dialog. In untrusted
  folders, including `claude -p` runs, they are ignored without a message, and CI has to trust the
  folder and set `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1`.
- Bad, because plugins cannot ship rules, permission rules or a CLAUDE.md that loads, so `adopt`
  copies those as templates ([0021](0021-gate-file-protection.md),
  [0022](0022-context-budget.md), [0023](0023-adopter-manifest-and-upgrade.md)).
- Bad, because auto-update is off by default for third-party marketplaces, so updates arrive only
  when the pinned ref changes or a user updates.
- Bad, because plugin hooks run with the user's privileges, so adopters must review the plugin like
  any other dependency.

### Confirmation

The CI `plugin validate` job installs the Claude Code CLI at an exact version, runs
`claude plugin validate --strict` on the marketplace root and on the plugin directory, and fails
when `claude --plugin-dir ./plugins/cross-stack-standard plugin list --json` reports load errors.
A repository check that only `plugin.json` or `marketplace.json` sits under a `.claude-plugin/`
directory is added with the skills, because misplaced components pass validation silently.

## Pros and Cons of the Options

### A plugin from an in-repo marketplace, enabled per repository through committed settings

- Good, because scope, version and updates are handled by the platform.
- Bad, because it depends on workspace trust and cannot ship rules or permissions itself.

### A user-global installer (symlinked skills, user-level hooks, a global CLAUDE.md block)

- Good, because one install covers every project on the machine.
- Bad, because it fires in unrelated repositories and cannot be pinned per project.
- Bad, because the installer script ties it to particular platforms and shells.

### Skills and hooks copied into each repository's `.claude/` directory

- Good, because it needs no marketplace.
- Bad, because every repository holds its own copy, and upgrading means copying files by hand.

## More Information

- Marketplaces: <https://code.claude.com/docs/en/plugins/marketplace-reference.md>
- Settings (`extraKnownMarketplaces`, `enabledPlugins`):
  <https://code.claude.com/docs/en/settings-reference.md>
- Plugin dependencies: <https://code.claude.com/docs/en/plugins/dependencies.md>
- Skill command names and `disable-model-invocation`: <https://code.claude.com/docs/en/skills.md>
- Plugin security model: <https://code.claude.com/docs/en/plugins/security.md>
- Versions and behaviours are recorded in [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0016](0016-self-contained-plugin-runtime.md), [0018](0018-project-detection.md),
  [0022](0022-context-budget.md), [0023](0023-adopter-manifest-and-upgrade.md).
- Governs: the process rules on enabling the Standard per repository and the plugin packaging
  checks in this repository's CI.
