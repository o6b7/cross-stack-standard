# Cross-Stack Standard plugin for Claude Code

Gates, not guidelines. One enforceable engineering standard for Laravel, Next.js, React and React
Native (Expo) projects, built for Claude Code.

This folder is the plugin. It is what Claude Code copies when you install
`cross-stack-standard@cross-stack-standard` from the marketplace in this repository. The
repository's top-level README covers the Standard itself: its rules, tracks, tiers and modules.

## Install

From a terminal:

```sh
claude plugin marketplace add o6b7/cross-stack-standard
claude plugin install cross-stack-standard@cross-stack-standard
```

Inside a Claude Code session, the same two steps are
`/plugin marketplace add o6b7/cross-stack-standard` and
`/plugin install cross-stack-standard@cross-stack-standard`.

To enable the plugin for everyone who works on a repository, commit this to its
`.claude/settings.json`:

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

Claude Code applies a repository's marketplace settings only after you accept its workspace trust
dialog.

## What is in this folder

| Path                                | Contents                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude-plugin/plugin.json`        | The plugin manifest. Nothing else belongs in `.claude-plugin/`.                                                                                               |
| `skills/`                           | The core `cross-stack-standard` skill, and the `adopt`, `upgrade`, `new-project`, `audit` and `doctor` skills that you run as `/cross-stack-standard:<name>`. |
| `hooks/hooks.json`                  | Hook registrations. Every event runs one Node.js entry point that checks the project's opt-out first.                                                         |
| `scripts/`                          | The hook entry point and its helpers (Node.js built-ins only).                                                                                                |
| `templates/`                        | The kit that `adopt` copies into a project and `upgrade` reconciles: `shared`, `laravel`, `web`, `mobile`, `ci`, `claude`.                                    |
| `templates/shared/cross-stack/bin/` | `cross-stack.mjs`, the project tool (see below).                                                                                                              |
| `data/`                             | Runtime data generated from the repository's rule registry and schemas. Do not edit it by hand.                                                               |

### Generated data

`data/` is written by `node scripts/build-plugin-data.mjs` at the repository root, and CI fails
when it is out of date. It holds:

- `rules.json`: the fields of every rule that the skills and hooks need at runtime;
- `standard.schema.json`: the JSON Schema of a project's `.cross-stack/standard.json`;
- `allowlist.schema.json`: the JSON Schema of `.cross-stack/allowlists/<RULE-ID>.json`;
- `protected-paths.json`: the files and shell commands the PreToolUse hook asks about;
- `version.json`: the kit version and the published schema URLs;
- `template-hashes/<version>.json`: the SHA-256 of every kit file at each released version, which
  `upgrade` uses to tell your edits apart from the kit's.

## The project tool

`adopt` copies `templates/shared/cross-stack/` to `.cross-stack/` in your project. The tool
`.cross-stack/bin/cross-stack.mjs` is a single file that needs Node.js 22.13 or later and nothing
else: no dependencies and no network access. Your `check` scripts and CI run it.

```sh
node .cross-stack/bin/cross-stack.mjs list-checks
node .cross-stack/bin/cross-stack.mjs check-standard-config
node .cross-stack/bin/cross-stack.mjs check-allowlists
node .cross-stack/bin/cross-stack.mjs help check-allowlists
```

Each check prints one finding per line, `<check> <path>:<line> <message>`, and a summary. Add
`--json` for a machine-readable report. Exit codes: `0` clean, `1` the check failed, `2` usage or
internal error.

- `check-standard-config` validates `.cross-stack/standard.json` against the manifest schema and
  checks that it covers every stack in the project: each Laravel, web or mobile `composer.json` or
  `package.json` it finds (the same search as `detect`) needs its track in `tracks` and its
  directory named under `trackRoots` (a track without an entry uses the project root). It also
  checks what a schema cannot express: locale tags are canonical, custom command patterns
  compile, the `$schema` URL names the recorded version, and that version is not newer than the
  tool itself. `check-standard-config schema` runs only the schema and coverage part; its findings
  start with `check-standard-config:schema`.
- `check-allowlists` validates every allowlist file. Each entry needs a `match`, a `reason`, an
  `owner` and an `expires` date. An entry is valid through its expiry date (UTC) and fails the
  check the day after.

## Project configuration

A project records how it adopted the Standard in `.cross-stack/standard.json`. `adopt` writes it;
`version` is the kit version the project adopted, and `$schema` points at the schema published
with that version, for editor completion:

```json
{
  "$schema": "https://raw.githubusercontent.com/o6b7/cross-stack-standard/v<version>/plugins/cross-stack-standard/data/standard.schema.json",
  "version": "<version>",
  "tracks": ["laravel", "web"],
  "profile": "next",
  "tier": 2,
  "modules": { "api-contract": true, "bff-auth": true, "i18n": true },
  "locales": ["en", "ar"]
}
```

Hook settings live under `hooks` in the same file; environment variables override them.

## Turning it off

Any one of these switches the plugin's hooks off for a project:

- the line `cross-stack-standard: declined` in the project's `CLAUDE.md`, `.claude/CLAUDE.md` or
  `CLAUDE.local.md`;
- `"disabled": true` in `.cross-stack/standard.json`;
- the environment variable `CROSS_STACK_STANDARD_DISABLE=1`.

To turn the whole plugin off in one repository, set
`"cross-stack-standard@cross-stack-standard": false` under `enabledPlugins` in
`.claude/settings.local.json`.

## Privacy

The plugin's hooks and the project tool run locally and make no network calls. They run your
project's own tools (formatters, linters, your `check:fast` script), and those tools behave as they
always do.

## Develop the plugin

From the repository root:

```sh
claude --plugin-dir ./plugins/cross-stack-standard   # load this folder for one session
node scripts/build-plugin-data.mjs                    # regenerate data/ after changing the sources
node scripts/build-plugin-data.mjs --check            # what CI runs
```

## License

MIT, see [LICENSE](LICENSE) (a copy of the repository's `LICENSE`, generated by
`build-plugin-data` so that it travels with every installed copy). Copyright Qusai Abdullah
([@o6b7](https://github.com/o6b7)).
