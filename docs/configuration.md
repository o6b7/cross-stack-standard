# Configuration

Everything an adopting project can configure: the manifest, the modules and their defaults, the
hooks and their environment variables, allowlists, the Claude Code files the kit writes, the
opt-out switches, team rollout and organisation-wide managed settings.

| File                                     | What it configures                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `.cross-stack/standard.json`             | The manifest: version, tracks, profile, tier, modules, locales, companions, hooks |
| `.cross-stack/allowlists/<RULE-ID>.json` | Dated exceptions to one rule                                                      |
| `CLAUDE.md` (managed block)              | The always-loaded summary: Tier-1 invariants, checks, labels, opt-out             |
| `.claude/rules/<track>.md`               | Path-scoped rules that load when Claude reads a matching file                     |
| `.claude/settings.json`                  | Plugin enablement for the team and permission rules for gate files                |

**Status in 0.1.0.** This release ships the plugin, its hooks, the skills, the templates, the
portable Agent Skill and the full rule registry. Six rules are GUARDED and 379 are REVIEW. Most
rules have a target level of FORCED or GUARDED, and their gates arrive in later 0.x releases; the
rest stay review rules by design. Where this page names a rule, read it as guidance, not as a
build-failing gate, unless the [rule catalogue](rules/README.md) labels it FORCED or GUARDED. How a
rule moves from REVIEW to a gate is described in
[How enforcement works](enforcement.md).

## The manifest

`.cross-stack/standard.json` records what the project adopted. `/cross-stack-standard:adopt`
writes it, `/cross-stack-standard:upgrade` reads its `version`, and the hooks read their settings
from it. It is validated by a published JSON Schema
([`schemas/standard.schema.json`](../schemas/standard.schema.json), copied into the plugin as
`data/standard.schema.json`) that rejects unknown fields
([ADR 0023](decisions/0023-adopter-manifest-and-upgrade.md)).

```json
{
  "$schema": "https://raw.githubusercontent.com/o6b7/cross-stack-standard/vX.Y.Z/plugins/cross-stack-standard/data/standard.schema.json",
  "version": "X.Y.Z",
  "tracks": ["laravel", "web"],
  "profile": "next",
  "tier": 2,
  "modules": { "api-contract": true, "i18n": true, "bff-auth": true, "tenancy": false },
  "locales": ["en", "ar"]
}
```

Replace `X.Y.Z` with the version you adopted. A complete example with every field is
[`standard.example.json`](../plugins/cross-stack-standard/templates/claude/standard.example.json).
Validate a manifest with the project tool:

```sh
node .cross-stack/bin/cross-stack.mjs check-standard-config
```

Besides the schema, the check requires canonical locale tags, command patterns that compile, a
`$schema` URL that points at the recorded `version`, and a `version` no newer than the tool
itself. It prints one finding per line and exits `1` on a problem (PROC-001, REVIEW in 0.1.0).

### Fields

| Field              | Values                                                            | Default                   |
| ------------------ | ----------------------------------------------------------------- | ------------------------- |
| `$schema`          | URL of the schema, pinned to the adopted version                  | none                      |
| `version`          | SemVer of the Standard the project adopted (required)             | none                      |
| `tracks`           | one to three of `laravel`, `web`, `mobile`, no repeats (required) | none                      |
| `profile`          | `next` or `react-spa`; only with the `web` track                  | `next`                    |
| `tier`             | `1` or `2`                                                        | none: Claude asks         |
| `modules`          | an object of module switches, see [Modules](#modules)             | see [Modules](#modules)   |
| `locales`          | BCP 47 tags in canonical form; the first is the source locale     | none                      |
| `disabled`         | `true` turns every hook of the Standard off for the project       | `false`                   |
| `companions`       | the consent record: `true` or `false` per companion plugin        | none: adopt asks          |
| `hooks`            | hook settings, see [Hooks](#hooks)                                | see [Hooks](#hooks)       |
| `allowlistsDir`    | project-relative directory of the allowlist files                 | `.cross-stack/allowlists` |
| `allowlistMaxDays` | furthest an allowlist expiry may lie ahead, 1 to 3650 days        | `365`                     |
| `stack`            | the one-library-per-concern settings, see below                   | none                      |
| `trackRoots`       | project-relative directory (or list) of each track, see below     | the project root          |

- **`tracks`**: `laravel` is a JSON API, `web` is Next.js (App Router) or React, `mobile` is Expo
  / React Native. A single-stack project lists one track and applies that subset
  ([ADR 0009](decisions/0009-tracks-profiles-and-scope.md)).
- **`profile`**: `react-spa` is accepted by the schema, but its rules and templates ship after 1.0
  ([ADR 0075](decisions/0075-react-spa-profile-after-1-0.md)). Next-only rules are scoped off for
  other profiles.
- **`tier`**: Tier 1 is the ten invariants and applies to every project. Tier 2 adds the structure
  rules and is meant for projects where at least two of these hold: multi-tenant, more than one
  developer, long-lived. When the manifest declares no tier, Claude asks instead of assuming
  ([ADR 0008](decisions/0008-tiers-and-invariants.md), PROC-002).
- **`locales`**: tags such as `en`, `ar` or `ar-SA`. Right-to-left direction is derived from the
  locale through one hard-coded list of right-to-left languages (I18N-044), so `ar` gets RTL
  without a separate switch. Required when the `i18n` module is on.
- **`allowlistsDir`**: no leading `/`, no `..` segment and no glob characters.
- **`stack`**: settings of the check that allows one library per concern (PROC-007).
  - `stack.competingGroups`: extra groups of competing packages, each
    `{ "concern": "charts", "packages": ["recharts", "chart.js"] }`, added to the curated
    catalogue the check ships with.
  - `stack.<concern>`: a concern being migrated from one library to another, such as `dates`,
    with `deprecated` listing the packages being left, which may stay installed next to the winner
    until the migration ends (PROC-008). Concern names include `state`, `server-state`, `forms`,
    `validation`, `http`, `dates`, `styling`, `unit-tests` and `e2e-tests`.
- **`trackRoots`**: for a monorepo whose tracks do not sit at the project root, the directory of
  each track, for example `{ "laravel": "api", "web": ["apps/web", "apps/admin"] }`. The Stop
  gate runs each track's `check:fast` there and its change fingerprint covers those directories.
  A track without an entry uses the project root. `check-standard-config` checks the coverage:
  every Laravel, web or mobile manifest it detects must belong to a track listed in `tracks`
  and sit at that track's root; `check-standard-config schema` runs the schema and coverage
  checks alone.

### Fields planned for later releases

A field is added to the schema in the release that ships the gate reading it, and not before
([ADR 0023](decisions/0023-adopter-manifest-and-upgrade.md)). The rule catalogue lists some keys
as planned, for example `rules.<RULE-ID>.<option>` (per-rule options), `decisions.<name>` (references
to the project's own decision records), `stack.<concern>.use` and module options such as
`modules.api-contract.openapiPath`. The 0.1.0 schema rejects them, so leave them out until a
release adds them.

## Modules

Modules are optional capabilities, each installed or removed as a whole unit: files,
registration, gates and tests ([ADR 0010](decisions/0010-opt-in-modules.md)). A module is `true`,
`false`, or an object whose `enabled` defaults to `true`, such as `{ "enabled": false }`.

The 0.1.0 defaults below follow [ADR 0011](decisions/0011-default-module-set.md). They depend only
on manifest facts (tracks, profile, locales), and an explicit value in the manifest always wins.

| Module          | What it covers                                                                                 | 0.1.0 default                                     | Decision                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-contract`  | Resource success shape without double wrapping, RFC 9457 problem details, a generated contract | on when `tracks` includes `laravel`               | [0052](decisions/0052-api-success-shape.md), [0053](decisions/0053-rfc-9457-problem-details.md), [0054](decisions/0054-generated-api-contract.md) |
| `i18n`          | Configured locales, server-localized messages, locale parity, right-to-left layout             | on when `locales` lists more than one locale      | [0077](decisions/0077-i18n-module.md)                                                                                                             |
| `bff-auth`      | Next.js cookie BFF: session cookies, same-origin checks, per-handler session re-verification   | on for `web` with `next` when `laravel` is listed | [0073](decisions/0073-bff-auth-module.md), [0074](decisions/0074-bff-csrf-defense.md)                                                             |
| `tenancy`       | Multi-tenant isolation: tenant scoping, tenant context in background work, isolation suites    | off                                               | [0057](decisions/0057-tenancy-module.md)                                                                                                          |
| `design`        | Rules for the impeccable companion: audit, critique and polish of UI changes                   | on when adopt installs impeccable                 | [0106](decisions/0106-companion-plugins.md)                                                                                                       |
| `browser-check` | Rules for the Chrome DevTools MCP companion: checking changed screens in a browser             | on when adopt installs Chrome DevTools MCP        | [0106](decisions/0106-companion-plugins.md)                                                                                                       |
| `observability` | Error tracking across stacks; reserved, its decision record is still proposed                  | off                                               | [0099](decisions/0099-observability-module.md)                                                                                                    |

- The schema enforces two dependencies: `bff-auth` needs the `web` track with the `next` profile,
  and `i18n` needs `locales`.
- The published schema does not carry these defaults yet. Write every module explicitly, as
  `adopt` does, so the manifest itself states what is on and every tool reads the same set.
- A module's rules apply once the module is on. In 0.1.0 every module rule is REVIEW; their gates
  are planned.
- Switching a default on in a later release is a MAJOR change, because it can fail the build of
  every project whose manifest omits that module ([ADR 0024](decisions/0024-versioning.md)).

### `browser-check`

The module's rules apply when the `chrome-devtools-mcp` companion is installed. The companion's
entry in the Standard's marketplace starts the server this way:

```json
{
  "chrome-devtools": {
    "command": "npx",
    "args": [
      "-y",
      "chrome-devtools-mcp@1.10.1",
      "--isolated",
      "--no-usage-statistics",
      "--no-performance-crux",
      "--redact-network-headers"
    ],
    "env": {
      "CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS": "1",
      "CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS": "1"
    }
  }
}
```

- **Development and local environments with test accounts only.** The server can read everything
  the browser sees, cookies and headers included; never point it at production or a real account,
  and never copy what it observes into chat, commits or logs (SEC-048).
- The version is exact, the browser profile is temporary (`--isolated`), usage statistics and
  CrUX lookups are off, and sensitive network headers are redacted. The update check has no flag,
  only the environment variable (SEC-065, SEC-073).
- Do not add a second `chrome-devtools` server to `.mcp.json`, and never commit
  `enabledMcpjsonServers` or `enableAllProjectMcpServers`.
- `claude -p`, Agent SDK and cloud sessions load enabled plugins. Keep the server out of headless
  and CI runs with `"enabledPlugins": { "chrome-devtools-mcp@cross-stack-standard": false }` in
  their settings.
- A single tool can be denied with a permission rule, for example
  `mcp__plugin_chrome-devtools-mcp_chrome-devtools__evaluate_script`.
- The first start downloads the pinned package from npm.

With the module on, UI work is checked in the browser before it is reported done (UI-013, REVIEW).

### `design`

The module's rules apply when the `impeccable` companion is installed: its skill and four agents,
without its hooks, pinned to a commit in the Standard's marketplace
([ADR 0106](decisions/0106-companion-plugins.md)). The engine checksum and the network endpoints
are on the [Security](security.md) page. Only the audit, critique and polish commands are used,
against the project's own design tokens.

## Hooks

The plugin registers six hook events. Each runs one Node.js entry point, checks the opt-out switches
before doing anything else, makes no network calls, resolves tools only from the project
(`node_modules` and `vendor/bin`, never `npx`) and fails open: a broken or slow hook never blocks
a session ([ADR 0019](decisions/0019-hook-runtime-contract.md)). The project's own tools and
scripts that the hooks run behave as they always do, network access included. The hooks need
`node` on `PATH`; without it, Claude Code reports a non-blocking hook error and the hooks stay
inactive.

| Event              | What it does                                                                                                                                                                     | Rule (0.1.0 label)                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| SessionStart       | Adds factual session context: the tracks, tier, a reminder to use the core skill, and an `adopt` hint when a stack is found without a manifest.                                  | none                                           |
| PostToolUse        | After Claude edits a file, formats it with the project's formatter (Pint, Prettier) and lints it with ESLint; lint errors go back to Claude. PHPStan per file only when enabled. | PROC-030 (GUARDED)                             |
| Stop               | When Claude finishes a turn, runs the project's fast check script within a time budget; a failure keeps Claude working, with the failing command and the end of its output.      | PROC-022 (GUARDED)                             |
| PreToolUse         | Asks before Claude edits protected gate files or runs a shell command that skips or weakens a gate; also asks before risky browser or Figma companion actions.                   | PROC-013, PROC-026, SEC-074, SEC-075 (GUARDED) |
| UserPromptSubmit   | Suspends the caveman companion's clipped prose while Claude is in plan mode.                                                                                                     | none                                           |
| PostToolUseFailure | Records failed companion MCP calls and gives Claude the failure plus a fallback to offer the user.                                                                               | none                                           |

The Stop hook runs the script named by `hooks.stop.command` with Composer
(`composer run-script <name>`) and npm (`npm run <name>`), wherever the project's `composer.json`
or `package.json` defines it. It skips the run when nothing changed since the last passing run,
and exits silently when there is no manifest or no such script. Claude Code itself ends a turn
after 8 consecutive Stop blocks ([ADR 0020](decisions/0020-feedback-hooks.md)).

### Hook settings

Settings live under `hooks` in the manifest. An environment variable overrides the manifest, and
the manifest overrides the default. A value that fails validation is ignored in favour of the
default; it never stops a hook.

| Setting                            | Values                             | Default      | Environment variable                                |
| ---------------------------------- | ---------------------------------- | ------------ | --------------------------------------------------- |
| `hooks.sessionStart.detect`        | boolean                            | `true`       | `CROSS_STACK_STANDARD_SESSION_START_DETECT`         |
| `hooks.postToolUse.phpstan`        | boolean                            | `false`      | `CROSS_STACK_STANDARD_POST_TOOL_USE_PHPSTAN`        |
| `hooks.postToolUse.budgetSeconds`  | integer, 1 to 600                  | `20`         | `CROSS_STACK_STANDARD_POST_TOOL_USE_BUDGET_SECONDS` |
| `hooks.stop.enabled`               | boolean                            | `true`       | `CROSS_STACK_STANDARD_STOP_GATE`                    |
| `hooks.stop.budgetSeconds`         | integer, 1 to 600                  | `90`         | `CROSS_STACK_STANDARD_STOP_BUDGET_SECONDS`          |
| `hooks.stop.command`               | a script name, not a shell command | `check:fast` | `CROSS_STACK_STANDARD_STOP_COMMAND`                 |
| `hooks.preToolUse.protect`         | project-relative globs             | none         | none                                                |
| `hooks.preToolUse.protectCommands` | JavaScript regular expressions     | none         | none                                                |
| `hooks.preToolUse.decision`        | `ask` or `deny`                    | `ask`        | none                                                |
| `hooks.preToolUse.browserHosts`    | host names, `*.` for subdomains    | none         | none                                                |

- The PostToolUse budget default is set by the hook; the schema declares none.
- `hooks.stop.command` must match `^[A-Za-z0-9][A-Za-z0-9:._-]*$`: a script name such as
  `check:fast`, never a command line.
- Boolean environment variables accept `1`, `true`, `yes` or `on`, and `0`, `false`, `no` or
  `off`, in any letter case. Integer variables take digits only.

Two more environment variables are not manifest settings:

| Variable                       | Effect                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `CROSS_STACK_STANDARD_DISABLE` | `1` (or `true`, `yes`, `on`) turns every hook off, for the session it is set in |
| `CROSS_STACK_STANDARD_DEBUG`   | `1` writes the hooks' debug lines to Claude Code's debug log (`claude --debug`) |

Set them in the environment that starts Claude Code, for example
`CROSS_STACK_STANDARD_STOP_GATE=0 claude`.

### Protected paths and commands

The PreToolUse hook reads its built-in list from the plugin's generated
[`data/protected-paths.json`](../plugins/cross-stack-standard/data/protected-paths.json): analyser
and linter configurations and their baselines, architecture tests, test-runner configuration and
coverage thresholds, the `scripts` sections of `package.json` and `composer.json`,
`.cross-stack/**`, `.github/workflows/**`, CODEOWNERS, lefthook, commitlint, update-bot and
secret-scanner configuration, package-manager configuration (`.npmrc`, `.yarnrc`, `.yarnrc.yml`,
`bunfig.toml`, `.pnpmfile.*`), git internals that decide which hooks and files count
(`.git/config`, `.git/hooks/**`, `.git/info/**`), the project's `.claude/settings.json`, and any
edit that switches the Standard off: the opt-out line in a memory file, `disabled` in the
manifest, a `CROSS_STACK_STANDARD_*` override, `disableAllHooks` or disabling the plugin in a
Claude Code settings file
([ADR 0021](decisions/0021-gate-file-protection.md)).

A project extends the list; it cannot shorten it:

```json
{
  "hooks": {
    "preToolUse": {
      "protect": ["deploy/quality/**"],
      "protectCommands": ["\\bmake\\s+baseline\\b"]
    }
  }
}
```

- `protect` globs are project-relative with `/` separators and no leading `/` or `..` segment.
  `**` matches zero or more directories, `*` matches within one path segment, `?` matches one
  character and `{a,b}` matches either alternative.
- `protectCommands` are JavaScript regular expressions, compiled with the `u` flag. They are
  tested against the raw Bash or PowerShell command and against a normalised form with quotes
  removed and compound commands split into segments.
- The sanctioned `<tool>:baseline:update` scripts, which regenerate a baseline and fail when it
  grows, are not inspected: for example `npm run eslint:baseline:update`.

The hook's decision is `ask` by default, which Claude Code does not hold in `bypassPermissions`
mode. Set `hooks.preToolUse.decision` to `deny` to block protected tool calls in every mode;
the user then makes such changes directly. When the check itself cannot complete (an
unexpected error, its time limit, or damaged plugin files), the hook answers `ask` rather than
letting the call through. The permission rules in the team settings and CODEOWNERS with a
branch ruleset are the backstops ([Team rollout](#team-rollout), CI-014).

## Allowlists and baselines

A gate without a native baseline reads its exceptions from `<allowlistsDir>/<RULE-ID>.json`,
validated by [`schemas/allowlist.schema.json`](../schemas/allowlist.schema.json)
([ADR 0005](decisions/0005-explicit-exceptions.md)):

```json
{
  "rule": "SEC-047",
  "entries": [
    {
      "match": "src/features/help/components/legal-notice.tsx",
      "reason": "Renders sanitized CMS HTML until the rich-text component replaces it.",
      "expires": "2026-12-31",
      "owner": "@your-team"
    }
  ]
}
```

- `rule` is the rule ID and must equal the file name without `.json`; the file name must be
  exactly `<RULE-ID>.json`.
- Every entry needs `match` (in the form the rule's gate documents, such as a project-relative
  path or glob), a non-blank `reason`, an `owner` (a GitHub handle, team or email address) and
  `expires` (`YYYY-MM-DD`, UTC).
- An entry is valid through its `expires` date and fails the day after. An expiry further ahead
  than `allowlistMaxDays` (default 365) is a finding, so an exception cannot be made permanent.
  Duplicate `match` values are findings too.

```sh
node .cross-stack/bin/cross-stack.mjs check-allowlists
```

The check ships in the project tool; the rule it holds, PROC-014, is REVIEW in 0.1.0 until its
fixtures prove it.

Gates that have a native baseline use it instead, and every baseline is shrink-only: ESLint bulk
suppressions (`eslint-suppressions.json`, PROC-015), the PHPStan baseline
(`phpstan-baseline.neon`, BE-005), dependency-cruiser known violations (PROC-027) and the jscpd
baseline (PROC-034). Inline escapes take one form per language, always with a reason:
`// eslint-disable-next-line <rule> -- <reason>` (PROC-016, PROC-025, PROC-031) and
`@phpstan-ignore <identifier> (<reason>)` (BE-098).

## Claude Code files

A plugin cannot ship rule files, permission rules or a `CLAUDE.md` that loads, so `adopt` writes
them from the kit's [Claude Code templates](../plugins/cross-stack-standard/templates/claude/README.md)
([ADR 0022](decisions/0022-context-budget.md)).

- **Managed `CLAUDE.md` block.** Everything between `<!-- cross-stack-standard:begin -->` and
  `<!-- cross-stack-standard:end -->` belongs to the kit, and `upgrade` rewrites it. Put project
  notes outside the markers. It is merged into an existing `CLAUDE.md`, never replacing it, and
  `AGENTS.md` is never edited. The block plus any `AGENTS.md` that `CLAUDE.md` imports stays under
  200 lines (PROC-029); keeping the whole file under 200 lines is better still.
- **Path-scoped rules.** `.claude/rules/laravel.md`, `web.md` and `mobile.md` carry `paths:`
  frontmatter. Claude Code loads one when Claude reads a matching file, not when Claude creates a
  file, which is why the Tier-1 invariants also sit in the managed block. When a track lives in a
  subdirectory, its globs need that directory as a prefix.
- **Team settings.** See [Team rollout](#team-rollout).

Writes under `.claude/` are protected by Claude Code itself, so `adopt` and `upgrade` prompt
before they change these files (outside `bypassPermissions` mode).

## Opting out

Opting out is a person's decision. The PreToolUse hook asks before Claude adds the opt-out line,
edits `.cross-stack/`, sets one of the switch variables in a shell command or disables the plugin
from the shell (PROC-013, PROC-026); Claude Code itself asks before edits under `.claude/`.

| Scope                            | How                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| One project, every hook          | the opt-out line (below) in `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`                            |
| One project, every hook          | `"disabled": true` in `.cross-stack/standard.json`                                                           |
| One session or shell, every hook | `CROSS_STACK_STANDARD_DISABLE=1` in the environment that starts Claude Code                                  |
| Only the session-start reminder  | `hooks.sessionStart.detect: false`, or `CROSS_STACK_STANDARD_SESSION_START_DETECT=0`                         |
| Only the Stop gate               | `hooks.stop.enabled: false`, or `CROSS_STACK_STANDARD_STOP_GATE=0`                                           |
| One person, one repository       | `"cross-stack-standard@cross-stack-standard": false` under `enabledPlugins` in `.claude/settings.local.json` |
| A whole organisation             | the same `false` in managed settings, which blocks the plugin at every scope                                 |

The opt-out line is:

```text
cross-stack-standard: declined
```

It must be a line of its own. Indentation, a list or heading marker, a quote marker, backticks or
emphasis around the words, any letter case and a final full stop are tolerated; a line inside a
fenced code block does not count. The hooks check the switches in order and the first match wins:
`CROSS_STACK_STANDARD_DISABLE`, then `disabled` in the manifest, then the opt-out line in the
memory files, searched from the working directory up to the project directory
([ADR 0018](decisions/0018-project-detection.md)).

The first three forms silence the hooks. The opt-out line also tells the core skill not to apply
the Standard; `disabled` and `CROSS_STACK_STANDARD_DISABLE` leave the skills in use.
`enabledPlugins` set to `false` turns off the whole plugin, skills included, before any hook
starts.

## Team rollout

Commit this to the repository's `.claude/settings.json` (the kit's
[`settings.team.json`](../plugins/cross-stack-standard/templates/claude/settings.team.json) adds
the gate-file permission rules to it):

```json
{
  "extraKnownMarketplaces": {
    "cross-stack-standard": {
      "source": { "source": "github", "repo": "o6b7/cross-stack-standard" }
    }
  },
  "enabledPlugins": { "cross-stack-standard@cross-stack-standard": true }
}
```

- Claude Code applies a repository's marketplace settings only after the workspace trust dialog is
  accepted. In an untrusted folder they are ignored without a message, and that includes
  `claude -p` runs in a folder never trusted interactively. In CI, trust the folder and set
  `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` so the plugin is installed before the run starts.
- Once the settings apply, the plugin loads from the marketplace copy; nobody installs it by hand.
  `claude plugin marketplace add o6b7/cross-stack-standard --scope project` writes the marketplace
  entry for you.
- **Pin a release.** Add `"ref": "vX.Y.Z"` inside `source`. The plugin then changes only when that
  line changes, in a reviewed pull request ([ADR 0015](decisions/0015-plugin-distribution.md)).
- **Auto-update** is off by default for third-party marketplaces, including this one. Turn it on
  in `/plugin` → Marketplaces → Enable auto-update, or with `"autoUpdate": true` next to `source`,
  as the Claude Code settings reference documents.
  Updating the plugin never changes the project's own copies of kit files; `upgrade` does that
  ([Upgrading](upgrading.md)).
- **Permission rules.** `permissions.ask` in the template names gate configurations, so Claude Code
  asks before Claude edits them in every permission mode, `bypassPermissions` included.
  `permissions.deny` names baselines, which change only through their `<tool>:baseline:update`
  scripts ([ADR 0021](decisions/0021-gate-file-protection.md)). The entries name files at the
  repository root; add the paths of tracks that live in subdirectories. Allowlists and workflows
  are protected by the PreToolUse hook and by CODEOWNERS.
- When several settings files declare the same marketplace name, the highest-precedence entry wins
  whole; fields are not merged. A user opts out of a project-enabled plugin with `false` in
  `.claude/settings.local.json`.
- The Standard's own rule for this is PROC-004 (REVIEW in 0.1.0).

## Managed settings

Organisations can control the plugin centrally through Claude Code's managed settings:

- `enabledPlugins` with `"cross-stack-standard@cross-stack-standard": true` force-enables the
  plugin; `false` blocks it at every scope and hides it.
- `strictKnownMarketplaces` allowlists marketplace sources, and an empty list blocks every
  marketplace. An organisation that sets it must list this repository's source.
- `allowManagedHooksOnly: true` blocks user, project, local and plugin hooks, except the hooks of
  plugins that managed `enabledPlugins` force-enables. With it, this plugin's hooks run only when
  managed settings force-enable `cross-stack-standard@cross-stack-standard`.
- A managed marketplace entry that sets `autoUpdate` locks it; users cannot toggle it.

The full list of managed keys is in Claude Code's documentation:
[plugins for organisations](https://code.claude.com/docs/en/plugins/org.md) and the
[settings reference](https://code.claude.com/docs/en/settings-reference.md).
