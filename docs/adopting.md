# Adopting the Standard

`adopt` brings an existing project under the Standard; `new-project` creates one that starts under
it. Both are skills you run yourself (`/cross-stack-standard:adopt`,
`/cross-stack-standard:new-project`); Claude never starts them on its own. The decisions behind
this page are [ADR 0023](decisions/0023-adopter-manifest-and-upgrade.md) (manifest, adopt and
upgrade), [ADR 0010](decisions/0010-opt-in-modules.md) (modules) and
[ADR 0008](decisions/0008-tiers-and-invariants.md) (tiers).

> **What 0.1.0 installs.** 0.1.0 records how the project adopted the Standard and sets up the Claude
> Code side: the manifest, the project tool, the managed `CLAUDE.md` block, path-scoped rule files
> and permission rules. Six rules are GUARDED by shipped hooks; the remaining 379 are REVIEW, so
> the active agent follows them through the skill and review checks them. The track gate
> configurations (ESLint, dependency-cruiser, Pest architecture
> tests, PHPStan rules, CI workflows) arrive with their gates in 0.x releases, and
> `/cross-stack-standard:upgrade` brings them in. See the [roadmap](../ROADMAP.md).

## Decide four things

`adopt` asks about anything it cannot detect. Knowing the answers up front makes it quick.

| Decision | Options                                                                  | Notes                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tracks   | `laravel`, `web`, `mobile` (one or more)                                 | Detected from `composer.json` and `package.json` files; every detected track is reported ([ADR 0018](decisions/0018-project-detection.md)).                                                      |
| Profile  | `next` for the `web` track                                               | Next.js 16 App Router ([ADR 0072](decisions/0072-nextjs-16-only.md)). The `react-spa` profile ships after 1.0 ([ADR 0075](decisions/0075-react-spa-profile-after-1-0.md)).                       |
| Tier     | `1` or `2`                                                               | Tier 1: the ten invariants, for every project. Tier 2: the full Standard, for a project that meets two or more triggers: it is multi-tenant, several developers work on it, or it is long-lived. |
| Modules  | `api-contract`, `i18n`, `bff-auth`, `tenancy`, `design`, `browser-check` | Defaults follow from tracks and locales ([ADR 0011](decisions/0011-default-module-set.md)); `observability` is planned after 1.0.                                                                |

Tier 2 is a product decision, so `adopt` asks instead of guessing. Declining Tier 2 when two
triggers hold is allowed; record why (PROC-002).

## Greenfield: a new project

In an empty folder:

```text
/cross-stack-standard:new-project
```

`new-project` scaffolds each track with the framework's official generator at a pinned version and
then runs `adopt`. A new project starts with the strict defaults: nothing to baseline, nothing to
allowlist.

## Brownfield: an existing project

In the repository root:

```text
/cross-stack-standard:adopt
```

`adopt` is conservative with existing code:

- **It never weakens a stricter configuration.** In 0.1.0 that covers the settings it merges: a
  `deny` rule stays `deny`, a plugin someone switched off stays off, and no `allow` rule is added.
  Once track gate configurations ship, `adopt` also compares an existing analysis level, coverage
  floor or size or complexity limit with the Standard's and keeps the stricter value.
- **It merges, never overwrites.** The managed block goes between
  `<!-- cross-stack-standard:begin -->` and `<!-- cross-stack-standard:end -->` in `CLAUDE.md`.
  Content outside the markers stays as it is, including what `create-next-app` and
  `create-expo-app` wrote there, and `AGENTS.md` is never edited.
- **Existing violations become baselines, not failures.** When a gate lands, today's violations go
  into its native baseline (the PHPStan baseline, ESLint bulk suppressions, dependency-cruiser known
  violations, a jscpd baseline). Baselines are shrink-only: new violations fail, and fixing old ones
  shrinks the file ([ADR 0005](decisions/0005-explicit-exceptions.md)).

## What adopt writes

| Path                               | Purpose                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.cross-stack/standard.json`       | The manifest: adopted version, tracks, profile, tier, modules, locales and hook settings, validated by the published schema.                                                                   |
| `.cross-stack/bin/cross-stack.mjs` | The project tool: one Node.js file with no dependencies and no network access. It runs `check-standard-config`, `check-allowlists` and `doctor`.                                               |
| `CLAUDE.md` (managed block)        | The Tier-1 invariants and pointers, by rule ID, kept under 200 lines including any imported `AGENTS.md` (PROC-029).                                                                            |
| `.claude/rules/<track>.md`         | Path-scoped rule files for each track. Claude Code loads one when Claude reads a matching file (not when it creates one).                                                                      |
| `.claude/settings.json`            | Merged, never replaced: the plugin enablement (PROC-004) and permission rules, `ask` for gate configurations and the manifest, `deny` for baselines. Optionally a `ref` that pins the release. |

Plugins cannot ship rule files, permission rules or a `CLAUDE.md` that loads, which is why `adopt`
copies these into the project ([ADR 0015](decisions/0015-plugin-distribution.md),
[ADR 0022](decisions/0022-context-budget.md)). `adopt` shows the whole plan and writes nothing until
you agree; after that, Claude Code asks before each write under `.claude/` (outside
bypass-permissions mode) and the plugin's own hook asks before each write under `.cross-stack/`.
A track that lives in a subdirectory (for example `api/`) gets its rule-file globs and permission
entries prefixed with that directory. Every field is described in [Configuration](configuration.md).

Commit all of it. Review the diff like any other pull request: the manifest is the record of what
the project agreed to.

## Exceptions: allowlists with an expiry date

A rule that allows exceptions reads them from `.cross-stack/allowlists/<RULE-ID>.json`, a file you
create when you need the first exception:

```json
{
  "rule": "WEB-001",
  "entries": [
    {
      "match": "src/components/UserCard.tsx",
      "reason": "Renamed with the design-system migration; import sites move first.",
      "expires": "2027-03-31",
      "owner": "@your-team"
    }
  ]
}
```

Every entry needs a `match` (in the form the rule's gate documents), a `reason`, an `owner` and an
`expires` date. An entry is valid through its expiry date (UTC) and fails the check the day after.
By default an expiry may lie at most 365 days ahead (`allowlistMaxDays` in the manifest), so an
exception cannot be made permanent with a far-future date (PROC-014). Check the files at any time:

```sh
node .cross-stack/bin/cross-stack.mjs check-allowlists
node .cross-stack/bin/cross-stack.mjs check-standard-config
```

Both print one finding per line and exit `1` on a failure, so they drop straight into CI.

## Modules after adoption

Modules are installed and removed as whole units: files, registration, route groups, seeds and
tests ([ADR 0010](decisions/0010-opt-in-modules.md)). To turn one on, set it to `true` in the
manifest and run `/cross-stack-standard:adopt` again: on a project already at the plugin's version
it keeps your settings and installs what is missing. `design` follows impeccable, and `browser-check`
is on when adopt records consent for Playwright MCP or Chrome DevTools MCP; the other modules record the
choice, and their rules apply as guidance.
To turn a module off, set it to `false` and remove what it installed. The `i18n` module also needs a
`locales` list whose first entry is the source locale.

## Companion plugins

Adopt offers five companion plugins in one question: caveman, impeccable, the Figma MCP server,
Playwright MCP for routine browser checks, and Chrome DevTools MCP for advanced diagnostics. Each
comes from the Standard's marketplace, pinned to a reviewed commit, and is installed only when you
approve it: impeccable, Figma, Playwright and Chrome DevTools MCP at project scope for the whole
team, caveman at user scope. New plugins load in the next session. Read
[Security](security.md#third-party-modules) for what each one can reach, and run
`/cross-stack-standard:doctor` later to find missing, duplicate or hand-copied copies
([ADR 0106](decisions/0106-companion-plugins.md),
[ADR 0108](decisions/0108-playwright-mcp-for-browser-checks.md)).

## Rolling out to a team

1. Commit `.cross-stack/`, the managed block, `.claude/rules/` and `.claude/settings.json`, which
   also enables the project-scope companion plugins for the team. Never commit `.claude/settings.local.json` or `CLAUDE.local.md`.
2. Pin the plugin to a release in `.claude/settings.json` (the snippet in the
   [README](../README.md#team-rollout)), so everyone runs the same version and upgrades arrive as
   reviewed pull requests.
3. Protect the gate files with CODEOWNERS and a branch ruleset that requires review; the
   plugin's PreToolUse check stops agents in the moment, and review catches everything else
   ([ADR 0021](decisions/0021-gate-file-protection.md)).
4. Run the project tool's checks in CI until the Standard's reusable workflows land.

## Undoing an adoption

To pause the Standard, opt out ([README](../README.md#opting-out)). To remove it, delete
`.cross-stack/`, the managed block between its markers, the `.claude/rules/` files it added and its
entries in `.claude/settings.json`, then disable or uninstall the plugin. Uninstalling the plugin
does not touch files it wrote into your repository.
