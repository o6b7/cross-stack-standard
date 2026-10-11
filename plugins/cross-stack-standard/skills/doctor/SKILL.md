---
name: doctor
description: "Checks the environment and the project's Cross-Stack Standard setup: runs the project tool's doctor command (Node.js, git, the Claude Code CLI, the manifest, the opt-out status, the managed CLAUDE.md block size, the path-scoped rule files, the plugin enablement, lefthook, PHP and Composer for Laravel) and explains every result; checks the four pinned companion plugins (caveman, impeccable, Figma MCP, Chrome DevTools MCP) for missing, duplicate or hand-copied installs and offers the fixes. Installs nothing without asking. Run it as /cross-stack-standard:doctor (the built-in /doctor is a different command)."
disable-model-invocation: true
---

# Check the environment and the Standard's setup

The user asked for a health check. Report, explain and propose fixes; do not install or change
anything without the user's yes. `${CLAUDE_PLUGIN_ROOT}` below is the installed plugin.

## Step 1: Run the doctor command

In an adopted project, from its root:

```sh
node .cross-stack/bin/cross-stack.mjs doctor
```

Without `.cross-stack/bin/` (not adopted yet), or when the project's copy answers
`unknown command "doctor"` (an older kit), use the plugin's copy:

```sh
node "${CLAUDE_PLUGIN_ROOT}/templates/shared/cross-stack/bin/cross-stack.mjs" doctor --root .
```

Paste the output verbatim. Each line is `<status> <check> <message>`, with a related rule ID in
brackets; the command exits 1 when any check failed. It works offline: it reads project files and
starts `git`, `claude`, `php` and `composer` only to read their versions. `--json` gives the same
report as JSON. If `node .cross-stack/bin/cross-stack.mjs --version` is older than `version` in
`${CLAUDE_PLUGIN_ROOT}/data/version.json`, suggest `/cross-stack-standard:upgrade`.

## Step 2: Explain each result

Explain every `fail` and `warn` line, and any `skip` that matters here:

- `node`: Node.js 22.13 or later is needed by the project tool and the hooks. Fix: upgrade
  Node.js.
- `git`: git is needed for commit hooks; the Stop hook uses it to see what changed, and without it
  falls back to a slower walk over the project's files. Fix: install git.
- `claude`: the Claude Code CLI version. A minimum supported version is not documented yet; the
  plugin's hooks use exec-form `args`, which need 2.1.139 or later. `skip` means the CLI is not on
  `PATH`, which is normal in CI.
- `manifest`: the `check-standard-config` findings for `.cross-stack/standard.json`. Missing: run
  `/cross-stack-standard:adopt`. Invalid: fix the lines it names.
- `opt-out`: a `warn` names what turns the hooks off: `CROSS_STACK_STANDARD_DISABLE`,
  `"disabled": true` in the manifest, the opt-out line in a `CLAUDE.md` file, or the plugin set to
  `false` under `enabledPlugins`. Opting out is the user's choice; never undo it for them.
- `context-budget`: the managed block plus any `AGENTS.md` that `CLAUDE.md` imports, in lines;
  the limit is under 200. Missing block: run adopt. Too long: move detail into `.claude/rules/`
  files; never trim the user's own text without asking.
- `rules-files`: `.claude/rules/<track>.md` for each declared (or detected) track. Missing: run
  adopt.
- `plugin-enabled`: the committed `.claude/settings.json` registers the marketplace and enables
  the plugin for everyone. A warning only: people can still install the plugin themselves.
- `pre-commit`: checked only when the project has a lefthook configuration. Each git hook it
  defines must be installed by lefthook, and `core.hooksPath` should be unset. Fix: run
  `lefthook install` in the project (ask first).
- `php` and `composer`: checked only for the laravel track. Laravel 13 needs PHP 8.3 or later,
  and Pest 5 needs 8.4.

The rule IDs in brackets are the rules each check relates to. Look up their `enforcement` in
`${CLAUDE_PLUGIN_ROOT}/data/rules.json` before describing them: in 0.1.0 they are all REVIEW, and
doctor is a diagnostic that no check script runs yet, so a failing line is advice, not a failed
gate. Never describe it as enforcement.

## Step 3: Companion plugins

The Standard's marketplace pins four companion plugins that adopt offers: `caveman`, `impeccable`,
`figma` and `chrome-devtools-mcp` (ADR 0106). Run, and paste the output:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/companions.mjs" status --root . --data-dir "${CLAUDE_PLUGIN_DATA}"
node "${CLAUDE_PLUGIN_ROOT}/scripts/companions.mjs" log --tail 20 --data-dir "${CLAUDE_PLUGIN_DATA}"
```

`status` exits 1 when an approved companion is unusable, not at its pin or duplicated. Explain
each line by its state:

- **ready:** installed from this marketplace at the pinned commit, enabled, last call succeeded.
- **unverified:** installed and enabled, not called yet; the first call is the health check.
- **unhealthy:** the last call failed (the detail says why, for Figma usually a missing sign-in in
  `/mcp`). Give the fix and the fallback the line shows.
- **unapproved:** no explicit `true` for it under `companions` in the manifest (never answered,
  or an invalid value). Its tools, skills and installs are denied until the user answers in
  `/cross-stack-standard:adopt`; never write the consent record for them.
- **declined:** the user said No in adopt; nothing to fix. The answer changes only by running
  `/cross-stack-standard:adopt` again.
- **not-installed:** offer the install and run it only after the user's yes:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/companions.mjs" record --root . --data-dir "${CLAUDE_PLUGIN_DATA}" --approve <name> --decline <the others as recorded>`
  prints the command; run it as printed.
- **disabled:** installed but switched off in settings; offer `claude plugin enable <name>@cross-stack-standard`.
- **unpinned:** installed at another commit; offer `claude plugin update <name>@cross-stack-standard`.
- **A second copy** (`figma@claude-plugins-official`, `chrome-devtools-mcp@chrome-devtools-plugins`
  and the like) tracks another commit and starts a second MCP server: offer
  `claude plugin disable <id>` at the scope it was installed; never uninstall it without asking.
- **Copied in by hand:** check for a `~/.claude/skills/caveman*` or `~/.claude/skills/impeccable`
  directory or link, or `~/.claude/agents/impeccable-*.md` files, left by an older install script:
  `warn`. They load next to the plugin's copies. Offer to remove them, after the companion is
  installed from this marketplace, and only with the user's yes.

The log lines are structured JSON (`ts`, `event`: consent, status, gate, install-gate, health;
`companion`, `decision` or `status`, `reason` or `detail`): summarise the recent gates and
failures in plain words.

Then the module switches in `.cross-stack/standard.json` (a module is on when it is `true` or an
object whose `enabled` is not `false`):

- `design` on without `impeccable` installed, or `browser-check` on without `chrome-devtools-mcp`:
  `warn`, fixed by installing the companion or switching the module off. The rules of the module
  (UI-013, UI-021) only apply when the tool is there.
- A project `.mcp.json` server named `chrome-devtools`: `warn`, since it starts a second server
  next to the companion's. The committed `.claude/settings.json` must set neither
  `enabledMcpjsonServers` nor `enableAllProjectMcpServers` (SEC-073).

What each companion does on the network, stated plainly:

- **chrome-devtools-mcp:** its first start downloads `chrome-devtools-mcp@1.10.1` from npm. The
  server runs with `--isolated`, `--no-usage-statistics`, `--no-performance-crux` and
  `--redact-network-headers`, with update checks and usage statistics off. Local and development
  environments with test accounts only, and nothing the browser shows is copied into chat, commits
  or logs (SEC-048).
- **impeccable:** its hooks are not installed. Its engine binary downloads from its GitHub releases
  the first time one of its commands runs, checked only against a checksum file from the same
  release. It checks for updates at most once a day unless `.impeccable/config.json` sets
  `"updateCheck": false` or `IMPECCABLE_NO_UPDATE_CHECK=1` is set; `IMPECCABLE_NO_TELEMETRY=1` or
  `DO_NOT_TRACK=1` stop its choice reporting. Of its commands, the Standard requires only `audit`,
  `critique` and `polish`, each run with the project's existing design tokens (UI-021).
- **figma:** a remote MCP server at `mcp.figma.com`; each user signs in once in `/mcp`.
- **caveman:** four skills and nothing else: no hooks, no proxy, no engine. It stays off until the
  user types `/caveman`, and the Standard's UserPromptSubmit hook pauses it in plan mode.

## Step 4: Summarise

Give the counts (failed, warnings, passed, skipped), the fixes in order of importance, and for
each fix the exact command. Ask before running any command that installs something or changes a
file (`lefthook install`, a plugin install or disable, an edit to settings, removing an old copy). End with the honest status: the
Standard's rules are REVIEW guidance in 0.1.0 with gates planned for later 0.x releases, while the
plugin's hooks run whenever the project has not opted out.
