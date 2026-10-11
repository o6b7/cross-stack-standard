# Adopting and upgrading

How a project comes under the Standard and stays current: the user skills, the manifest, brownfield
adoption, upgrades, team rollout and the CI and workflow templates ([ADR 0023][0023],
[ADR 0015][0015], [ADR 0024][0024]). Rules marked Tier 1 apply to every adopting project; the others
apply once the project declares Tier 2.

## The user skills

Only the user runs these; they are not model-invoked. Suggest the right one and let the user start
it:

| Command                             | What it does                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/cross-stack-standard:adopt`       | Detects tracks, asks for tier and modules, writes the manifest, block, settings and rule files |
| `/cross-stack-standard:new-project` | Scaffolds with the pinned official generators, then adopts                                     |
| `/cross-stack-standard:upgrade`     | Moves the project to the installed kit version on a branch, as a pull request                  |
| `/cross-stack-standard:audit`       | Writes a read-only report of the project against the rules, citing rule IDs                    |
| `/cross-stack-standard:doctor`      | Checks the environment, the manifest, the managed block, the rule files and the module pins    |

What `adopt` and `upgrade` write depends on the kit version, and each skill's own instructions are
authoritative for the installed version. In 0.1.0 the kit holds no track gate configurations
(ESLint, PHPStan, Pest architecture tests, CI workflows); they arrive in later 0.x releases through
`/cross-stack-standard:upgrade`.

## Rules

### Declaring the project

- **PROC-001** Declare tracks, tier and modules in a schema-valid manifest that covers every detected stack _(Tier 1)_
- **PROC-002** Declare Tier 2 when at least two tier triggers hold, or record why it is declined _(Tier 1)_
- **PROC-003** Install each declared track and module as a complete unit, and leave no substrate of the others _(Tier 1)_
- **PROC-004** Enable the Standard's plugin in the repository's committed `.claude/settings.json`
- **PROC-011** Keep copied gate files equal to the adopted templates, except inside declared configuration regions _(Tier 1)_
- **PROC-018** Keep every enabled gate with a shipped probe failing on that probe after adopting or upgrading _(Tier 1)_
- **PROC-029** Keep the managed CLAUDE.md block, with any imported AGENTS.md, under 200 lines

### CI and workflow templates

- **CI-009** Run every member of each track's check script as its own named CI step _(Tier 1)_
- **CI-011** Make every build, deploy or release job depend on the quality job _(Tier 1)_
- **CI-012** Reuse one quality workflow per track instead of copying its steps
- **CI-013** Protect the default branch and require the quality check before merge _(Tier 1)_
- **CI-014** Assign a CODEOWNERS owner to every gate file, allowlist and workflow
- **CI-015** Run the secret scan, formatters and linters on staged files before each commit
- **CI-016** Check in CI that commit messages and pull request titles follow Conventional Commits _(off by default)_
- **CI-018** Delay dependency releases, group framework updates without automerge and hold risky majors
- **PROC-028** Ask in the pull request template for the rule IDs a change follows and the real check output

The per-track check chains are in the track references: CI-001 in [laravel.md](laravel.md), CI-002
and CI-003 in [web.md](web.md), CI-004 and CI-005 in [mobile.md](mobile.md).

## The manifest

`.cross-stack/standard.json` is authoritative for tracks, profile, tier and modules, and the schema
rejects unknown keys. A full-stack example that the 0.1.0 schema accepts (`adopt` also writes
`$schema` and `version`, the adopted Standard version):

```json
{
  "tracks": ["laravel", "web", "mobile"],
  "profile": "next",
  "tier": 2,
  "modules": {
    "api-contract": true,
    "i18n": true,
    "bff-auth": true,
    "tenancy": false,
    "design": false,
    "browser-check": false
  },
  "locales": ["en", "ar"]
}
```

- `locales` is required when `i18n` is on; the first entry is the source locale.
- `bff-auth` needs the web track with the `next` profile.
- A module is `true`, `false` or `{ "enabled": … }`; per-module options (such as the api-contract
  success shape) and the `decisions` and `rules` sections are planned and added with the gates that
  read them.
- `trackRoots.<track>` names the directory of each of the track's manifests that is not at the
  project root (a string, or a list); `check-standard-config` fails when a detected manifest's
  directory is missing, and the Stop gate runs `check:fast` in each named directory.
- `hooks.*` tunes the hooks (for example `hooks.stop.command`, `hooks.stop.budgetSeconds`,
  `hooks.preToolUse.protect`); `disabled: true` turns every hook off; `allowlistsDir` and
  `allowlistMaxDays` govern allowlists; `stack` declares competing groups and concerns under
  migration.
- Validate with `node .cross-stack/bin/cross-stack.mjs check-standard-config`.

## Brownfield adoption

- `adopt` never weakens what the project already has. In 0.1.0 that covers the settings it merges
  (a `deny` stays `deny`, a disabled plugin stays disabled, no `allow` is added). Once gate
  configurations ship, it also compares existing levels and thresholds (analysis level, coverage
  floors, size and complexity limits) with the kit's and keeps the stricter value.
- Once a gate ships, existing violations go into the tool's shrink-only baseline or into dated
  allowlist entries, never into a mass rewrite; in 0.1.0 there is nothing to baseline yet. Each
  rule's adoption line in the [rule index][rules] says how that rule will be adopted (an allowlist,
  a baseline, or nothing needed).
- An existing `CLAUDE.md` from a framework generator is merged into, never overwritten, and
  `AGENTS.md` is never edited: the managed block sits between the markers in `CLAUDE.md` and stays
  under 200 lines including any imported `AGENTS.md` (PROC-029).
- Path-scoped rule files under `.claude/rules/` load when Claude reads a matching file, not when it
  creates one, which is why the Tier-1 invariants also sit in the managed block.

## Upgrades

- `upgrade` works on a branch and proposes a pull request. It compares each kit-copied file with the
  recorded hash of the adopted version: an untouched file is replaced, an edited one gets a proposed
  merge. It respects allowlists and project-owned regions, never lowers a level or threshold, and
  updates the manifest `version` last.
- Versions follow SemVer by build impact: a MAJOR release can newly fail an adopter's build (a new
  default-on gated rule, a default-on rule promoted from REVIEW, a stricter threshold, a raised
  minimum version, a removed option). Before 1.0.0 a MINOR release may carry such changes, so in the
  0.x series an upgrade can turn REVIEW guidance into failing gates: read the release notes and run
  the full `check` on the upgrade branch.
- `upgrade` finds edited kit files by their recorded hashes; a check that compares gate files with
  their templates (PROC-011) is planned. As gates ship, violation probes run after adopt and upgrade
  to show each enabled gate still fails when it should (PROC-018).

## Team rollout

Enable the plugin for everyone on a repository with a committed `.claude/settings.json`, pinned to a
release tag (PROC-004):

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

Claude Code applies a repository's marketplace settings only after the workspace-trust dialog.
`adopt` also merges permission rules there (`permissions.ask` for gate configurations,
`permissions.deny` for baselines and allowlists), because a plugin cannot ship permission rules.

## Opting out

- **Per project:** the line `cross-stack-standard: declined` in `CLAUDE.md`, `.claude/CLAUDE.md` or
  `CLAUDE.local.md`. Adding it is a protected change that asks for confirmation.
- **Hooks only:** `"disabled": true` in the manifest, or `CROSS_STACK_STANDARD_DISABLE=1` for one
  session; `CROSS_STACK_STANDARD_STOP_GATE=0` turns off only the Stop gate.
- **Hard off-switch for one user:** `false` for `cross-stack-standard@cross-stack-standard` under
  `enabledPlugins` in `.claude/settings.local.json`.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them, and do not describe them as
enforced by a gate. The project tool's `check-standard-config` command is part of the 0.1.0 kit;
PROC-001 stays REVIEW until a shipped track `check` chain runs it, and the workflow, pin and
probe checks arrive in later 0.x releases. `enforcement` in `${CLAUDE_PLUGIN_ROOT}/data/rules.json`
is authoritative for each ID.

## Decision records

- [ADR 0015][0015]: Distribution as a Claude Code plugin from an in-repo marketplace, enabled per repository
- [ADR 0023][0023]: Adopter manifest, adopt and upgrade
- [ADR 0024][0024]: Versioning the Standard: one VERSION, stamped and drift-checked; SemVer defined by adopter build impact

[rules]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/rules/README.md
[0015]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0015-plugin-distribution.md
[0023]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0023-adopter-manifest-and-upgrade.md
[0024]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0024-versioning.md
