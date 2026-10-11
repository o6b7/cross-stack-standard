# Claude Code templates

The Claude Code files of the Cross-Stack Standard kit. A plugin cannot ship rule files, permission
rules or a `CLAUDE.md` that loads, so `/cross-stack-standard:adopt` copies or merges these
templates into the project instead, and `/cross-stack-standard:upgrade` reconciles them later
([ADR 0015](../../../../docs/decisions/0015-plugin-distribution.md),
[ADR 0022](../../../../docs/decisions/0022-context-budget.md)). This README itself is not copied.

The Markdown templates start with a version header, `cross-stack-standard vX.Y.Z` plus a licence
notice. The plugin records the hash of every template file for each released version (in its
`data/template-hashes/`), so `upgrade` can tell an untouched copy from one you edited
([ADR 0023](../../../../docs/decisions/0023-adopter-manifest-and-upgrade.md)). JSON cannot carry a
comment, so the JSON templates have no header; they are merged into the project's files rather
than copied over them.

Every rule these files cite is REVIEW in this version of the kit: guidance that Claude and code
review apply. Most have a planned gate; the rule files mark the few that stay review rules by
design. The rule catalogue in `docs/rules/` of the Standard's repository shows each rule's current
and target level.

| Template                | Lands in the project as                    | How it is applied                                    |
| ----------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `claude-md-block.md`    | a block in `CLAUDE.md`                     | merged between markers; the rest of the file is kept |
| `rules/laravel.md`      | `.claude/rules/laravel.md`                 | copied for the `laravel` track                       |
| `rules/web.md`          | `.claude/rules/web.md`                     | copied for the `web` track                           |
| `rules/mobile.md`       | `.claude/rules/mobile.md`                  | copied for the `mobile` track                        |
| `settings.team.json`    | keys in `.claude/settings.json`            | merged; existing keys and rules are kept             |
| `standard.example.json` | reference for `.cross-stack/standard.json` | not copied; `adopt` writes the manifest itself       |

The full reference for the manifest, the hooks and the opt-out switches is
[docs/configuration.md](../../../../docs/configuration.md).

## `claude-md-block.md`

The always-loaded summary of the Standard: what it is, the instruction to use the
`cross-stack-standard` skill before modifying application code, the ten Tier-1 invariants with
their rule IDs, how to run the project's checks, the meaning of the enforcement labels and how a
person opts out.

- Everything between `<!-- cross-stack-standard:begin -->` and
  `<!-- cross-stack-standard:end -->` belongs to the kit. `upgrade` rewrites it; content outside the
  markers is never touched. Keep project notes outside the block.
- The block is merged into the `CLAUDE.md` that a framework generator created; it never replaces
  the file, and `AGENTS.md` is never edited. When only `AGENTS.md` exists, `adopt` creates a
  `CLAUDE.md` that imports it and holds the block
  ([ADR 0022](../../../../docs/decisions/0022-context-budget.md)).
- The block stays at 60 lines or fewer. Keep the whole `CLAUDE.md`, imported files included, under
  200 lines, because longer memory files are followed less reliably.
- The Tier-1 invariants live here as well as in the rule files, because rule files load only when
  Claude reads a matching file, not when it creates one.
- The block names the opt-out switches without spelling out the opt-out line, so writing the block
  never looks like an opt-out to the Standard's PreToolUse hook.
- The `markdownlint-disable MD041` comment turns off markdownlint's first-heading rule, because
  the block often opens a new `CLAUDE.md` with a second-level heading.

## `rules/*.md`

Path-scoped rule files, one per track, each listing the 10 to 20 highest-value rules as the
registry states them, with their IDs. The `paths:` frontmatter uses the YAML-list form of Claude
Code's rule-file syntax:

| Track     | Globs                                                               |
| --------- | ------------------------------------------------------------------- |
| `laravel` | `app/**/*.php`, `routes/**`, `database/**`, `config/**`, `tests/**` |
| `web`     | `src/**/*.{ts,tsx}`, `app/**` (the Next.js App Router directory)    |
| `mobile`  | `app/**` (the Expo Router directory), `src/**/*.{ts,tsx}`           |

- A rule file loads when Claude **reads** a file that matches, not on every tool call and not when
  Claude creates a file.
- The globs assume the track sits at the repository root. When a track lives in a subdirectory,
  prefix every glob with that directory when copying, for example `api/app/**/*.php`.
- Each file has a status line saying that its rules are REVIEW. A change that promotes one of the
  listed rules to FORCED or GUARDED must update that status line too.

## `settings.team.json`

What a team commits to `.claude/settings.json` so that everyone who trusts the repository gets the
plugin and the gate-file permission rules:

- `extraKnownMarketplaces` registers this repository's marketplace, and `enabledPlugins` turns on
  `cross-stack-standard@cross-stack-standard`. Claude Code applies both only after the workspace
  trust dialog is accepted; in an untrusted folder they are ignored without a message, and that
  includes `claude -p` runs in a folder that was never trusted interactively.
- `permissions.ask` names gate configurations: Claude Code asks before Claude edits them, in every
  permission mode, `bypassPermissions` included. `permissions.deny` names baselines, which change
  only through their sanctioned `<tool>:baseline:update` scripts
  ([ADR 0021](../../../../docs/decisions/0021-gate-file-protection.md)).
- The entries name files at the repository root. For a track in a subdirectory, add its paths, for
  example `Edit(api/phpstan.neon.dist)`. The PreToolUse hook asks about every protected location,
  matched with globs, whatever this list says; these rules are the backstop that holds even when
  the hooks are off.
- Auto-update is off by default for third-party marketplaces, and this template keeps it off. The
  Claude Code settings reference documents `"autoUpdate": true` next to `source` in the marketplace
  entry; the `/plugin` → Marketplaces → Enable auto-update toggle writes the same key.
- To hold the team on one release, add `"ref": "vX.Y.Z"` (a release tag) inside `source`; the
  plugin then changes only when that line changes, in a reviewed pull request.

## Companion plugins

The Chrome DevTools MCP server, like the other companion plugins, is no longer a template: it comes
from the `chrome-devtools-mcp` entry in the Standard's marketplace, pinned to a commit and started
with the privacy flags, and `adopt` installs it when the user ticks it
([ADR 0106](../../../../docs/decisions/0106-companion-plugins.md)). Do not add a second
`chrome-devtools` server in `.mcp.json`, and never commit `enabledMcpjsonServers` or
`enableAllProjectMcpServers` (SEC-073).

## `standard.example.json`

A complete `.cross-stack/standard.json` that validates against the published schema: all three
tracks, the `next` profile, Tier 2, every module stated explicitly, `["en","ar"]` as locales, every
hook setting at its default value, and example values for the settings that have no default
(`hooks.preToolUse.protect`, `hooks.preToolUse.protectCommands` and `stack`). Remove what the
project does not use. `node .cross-stack/bin/cross-stack.mjs check-standard-config` validates a
manifest.
