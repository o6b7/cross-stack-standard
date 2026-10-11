# Upgrading

Two things update separately:

1. **The plugin**: the skills, hooks and runtime data that Claude Code installs from the
   marketplace. Updating it changes nothing in your repository.
2. **Your project's files**: the manifest and every file `adopt` copied (templates, and gate
   configurations once they ship). `/cross-stack-standard:upgrade` updates them, on a branch, for
   review.

Versioning, pinning and the no-channel decision are recorded in
[ADR 0024](decisions/0024-versioning.md), [ADR 0026](decisions/0026-no-early-access-channel.md) and
[ADR 0023](decisions/0023-adopter-manifest-and-upgrade.md).

## What a version number tells you

The Standard follows Semantic Versioning, judged by one question: **can upgrading break your
build?**

| Bump  | Meaning                                 | Examples                                                                                                                 |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| MAJOR | Can newly fail an adopter's build.      | A new default-on FORCED or GUARDED rule, a default-on rule promoted from REVIEW, a stricter threshold, a removed option. |
| MINOR | New capability you opt into.            | A new opt-in rule, module, track or profile, a new skill, documentation.                                                 |
| PATCH | Cannot fail a build that passed before. | Bug fixes, false-positive reductions, clearer messages.                                                                  |

**Before 1.0.0 the public API is not stable.** A 0.x MINOR release may contain changes that would be
MAJOR after 1.0.0, and in 0.x that is the normal case: each release that lands a track's gates
promotes rules from REVIEW, and a promoted rule can fail code that passed before. The release notes
in [CHANGELOG.md](../CHANGELOG.md) list every promoted rule ID. Read them before you move a pin.

## Updating the plugin

### Automatically

By default Claude Code auto-updates only Anthropic's official marketplaces (and marketplaces added
from claude.ai). For this marketplace, auto-update is **off** until you turn it on:

- `/plugin` → **Marketplaces** → select `cross-stack-standard` → **Enable auto-update**; or
- `"autoUpdate": true` next to `source` on the marketplace's `extraKnownMarketplaces` entry, as the
  Claude Code settings reference documents.

With auto-update on, Claude Code checks in interactive sessions, updates the plugin on disk and
shows `Plugin updated: … · Run /reload-plugins to apply`.

### By hand

```sh
claude plugin marketplace update cross-stack-standard
claude plugin update cross-stack-standard@cross-stack-standard --scope project
```

Pass the scope you installed with (`user`, `project` or `local`). In a session, `/plugin` →
**Installed** → **Update now** does the same. Run `/reload-plugins` to apply the update without
restarting.

Claude Code installs an update only when the plugin's version changes, and every release of the
Standard bumps it. `<name> is already at the latest version` means there is no newer release on the
ref you follow.

### Pinned to a release

Teams usually pin the marketplace to a tag, either with `ref` in the committed
`.claude/settings.json` ([README](../README.md#team-rollout)) or for one person with:

```text
/plugin marketplace add o6b7/cross-stack-standard#v0.1.0
```

A tag pin stays put: a tag ruleset in this repository restricts updating and deleting tags. To upgrade,
change the `ref` (for example from `v0.1.0` to the next release) in a pull request. Claude Code
refetches the marketplace and asks you to run `/reload-plugins`.

Two platform behaviours to know:

- Claude Code refuses a second `marketplace add` for the same marketplace name from a different
  source or ref. Change the `ref` in the settings file that declares it instead.
- Removing a marketplace uninstalls every plugin installed from it.

There is no early-access channel. Unreleased commits keep the last release's version, so pinning a
branch such as `#dev` would install once and never update. Contributors load a checkout with
`claude --plugin-dir ./plugins/cross-stack-standard` instead ([CONTRIBUTING](../CONTRIBUTING.md)).

## Updating your project's files

After the plugin is on the new release, run:

```text
/cross-stack-standard:upgrade
```

`upgrade` reads the version recorded in `.cross-stack/standard.json` and compares each file `adopt`
copied with the hash recorded for that file in the adopted release:

- **An unchanged file** is replaced with the new template.
- **A file you edited** is shown as a diff, and you choose: the new template, your file, or a merge
  that `upgrade` proposes. In `CLAUDE.md`, only the region between the Standard's markers changes.
- **Merged files** (`.claude/settings.json`, `.mcp.json`) only gain missing entries: nothing is
  removed, a `deny` stays a `deny`, and no `allow` is added.
- **Levels and thresholds never go down**, and allowlists are validated, never edited.
- **The manifest's `version` is updated last**, so an interrupted upgrade is visible.

`upgrade` asks before it creates a branch, shows the whole change set before applying it, and runs
the project tool's checks and each track's `check` script. It drafts the pull request, with a table
of every file and the real check output; it commits, pushes or opens it only when you ask.

The Standard's gate packages are not published to npm or Packagist yet; until they are, gate code
reaches projects only through `upgrade`. Once they are, your dependency updater can raise their
versions too.

## Rolling back

- **Plugin:** set the `ref` back to the previous tag (or add the marketplace at that tag) and run
  `/reload-plugins`.
- **Project files:** revert the upgrade pull request. The manifest's `version` returns with it.

## A routine for teams

1. Watch the repository's releases, or read [CHANGELOG.md](../CHANGELOG.md), for the promoted rule
   IDs and any MAJOR-level change.
2. Open a pull request that moves the `ref` in `.claude/settings.json` to the new tag.
3. On that branch, run `/cross-stack-standard:upgrade` and commit its changes.
4. Run `/cross-stack-standard:doctor`, then the project's checks; paste their output in the pull
   request.
5. Merge once the checks are green. Fix or baseline new findings; never weaken a gate to get there
   ([How enforcement works](enforcement.md#exceptions)).
