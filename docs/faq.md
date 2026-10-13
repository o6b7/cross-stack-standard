# FAQ

- [Status and scope](#status-and-scope)
- [Privacy and security](#privacy-and-security)
- [Day-to-day use](#day-to-day-use)
- [Installing and updating](#installing-and-updating)
- [Contributing](#contributing)

## Status and scope

### Is anything enforced in 0.1.0?

The Claude Code layer runs: the hooks detect the project, format and lint each edited file, run your
`check:fast` script before Claude ends a turn and ask before gate files change, and the project tool
validates the manifest and allowlists. Six rules are GUARDED, each backed by one of those hooks
and proven by a passing and a failing fixture: PROC-013 and PROC-026 (asking before gate files or
gate-weakening commands), PROC-022 (the Stop gate), PROC-030 (lint feedback after an edit), and
SEC-074 and SEC-075 (asking before Chrome DevTools MCP leaves development hosts or the Figma
companion changes a file).
The other 379 rules are REVIEW: Claude follows them through the skill, and
`/cross-stack-standard:audit` and code review check them. The gates arrive track by track in 0.x releases; see the [roadmap](../ROADMAP.md).

### Why ship before the gates exist?

Because the labels are honest either way. A rule becomes FORCED or GUARDED only when its gate ships
and its violation fixture fails in CI; publishing the catalog with REVIEW labels now lets you adopt
the manifest, the Claude Code workflow and the rules as guidance, and receive each gate through
`/cross-stack-standard:upgrade` as it lands. Every rule already names its target label and planned
gate in the [rule catalog](rules/README.md).

### Which stacks are supported?

| Track     | Supported                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `laravel` | Laravel as a JSON API. Server-rendered Laravel front ends are not a track.                                                                                                  |
| `web`     | Next.js 16 with the App Router ([ADR 0072](decisions/0072-nextjs-16-only.md)). React with Vite ships after 1.0 ([ADR 0075](decisions/0075-react-spa-profile-after-1-0.md)). |
| `mobile`  | Expo / React Native, targeting Expo SDK 57 ([ADR 0059](decisions/0059-javascript-toolchain-pins.md)).                                                                       |

Single-stack projects apply their own subset; a repository with several tracks applies each. The
tool versions the planned gates target are in the [track pages](tracks/laravel.md) and
[verified-versions.md](maintainers/verified-versions.md).

### Can I use it without Claude Code?

The gates are ordinary tools (ESLint, dependency-cruiser, Vitest, Pest, PHPStan, CI steps) and, once
they ship, run in any terminal and any CI. The provider-neutral core skill is available to Gemini
CLI, Codex and other hosts that support the Agent Skills format. The Claude Code plugin additionally
provides its hooks and management workflows; those do not run in other hosts. The rules and decision
records are plain Markdown anyone can read.

### What do "client" and "shared" mean in the rule catalog?

They are rule scopes, not tracks. A `client` rule applies to both JavaScript tracks (web and
mobile) and never to Laravel; a `shared` rule applies to every project.

## Privacy and security

### Does this send my code anywhere?

**The plugin does not.** Its hooks and the project tool run locally, make no network calls and
collect no telemetry. In detail:

- **Hooks** run your project's own tools, resolved from `node_modules` and `vendor/bin`, never
  through `npx` or a download. Those tools behave as they always do: if your `check:fast` script
  reaches the network, it still does.
- **Context.** What the hooks print to Claude (the SessionStart summary, lint findings, the tail of
  a failing check) becomes part of the conversation. Claude Code sends the conversation to the
  model under Anthropic's terms and your account's settings, exactly as it does without this
  plugin.
- **Installing and updating** the plugin fetches this repository from GitHub, through Claude Code.
- **`new-project`** runs the framework generators, which download packages, only after you approve
  the exact commands. The other skills install nothing without asking.
- **Claude Code itself** makes its own requests (the model API, and optional traffic such as update
  checks). `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` turns the optional traffic off, including
  plugin auto-update.

The companion plugins bring in third-party software that can reach the network. Adopt installs
each one only when you tick it, from the Standard's marketplace, pinned to a reviewed commit
([ADR 0106](decisions/0106-companion-plugins.md)). caveman loads four skills and nothing else, so
it makes no network calls.

**impeccable (`design` module).** Its skill and four agents, without its hooks. The Standard uses
only its audit, critique and polish commands. In 0.1.0 the Standard does not write impeccable's
settings for you: set the switches in the last column yourself.

| Endpoint                                                    | When                                                                                 | How to turn it off                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `github.com/pbakaus/impeccable/releases/download/engine-v…` | The engine binary, the first time a command runs without one                         | No switch; `IMPECCABLE_BIN` pointing at a binary you installed avoids it               |
| `impeccable.style/api/version`                              | Version check, at most once a day                                                    | `"updateCheck": false` in `.impeccable/config.json`, or `IMPECCABLE_NO_UPDATE_CHECK=1` |
| `impeccable.style/api/chosen`                               | Choice reporting in new-work design flows (audit, critique and polish do not use it) | `IMPECCABLE_NO_TELEMETRY=1` or `DO_NOT_TRACK=1`                                        |
| `impeccable.style/api/roll`                                 | Catalogue fetch in new-work design flows without a local catalogue                   | Not by the telemetry switches; avoid new-work flows, as the Standard does              |
| `impeccable.style/worlds/cards`, Google Fonts               | Preview images and web fonts on some design pages                                    | Not by a switch; they load only on the pages that show them                            |
| OpenAI API                                                  | Only if you set `OPENAI_API_KEY`                                                     | Leave the key unset                                                                    |

The companion does not install impeccable's hooks. The engine download is verified only against a checksum file from the
same release; the Standard records independent checksums in
[verified-versions.md](maintainers/verified-versions.md), and checking them is UI-022's planned
gate.

**Playwright MCP (`browser-check` module).** The marketplace pins Microsoft's repository to
`f183dad4a52965583e3cc1d59b88cdc279e2e57d` and starts `@playwright/mcp@0.0.83` with an isolated
in-memory profile, headless Chromium, page-provided WebMCP disabled and console output limited to
errors. The package currently depends on `playwright` and `playwright-core` at
`1.64.0-alpha-1790635538000`, a known upstream stability risk. The first start fetches the package
from npm and may download Chromium from Microsoft's browser CDN. It can read page contents and
interact with controls. Use local development hosts and test accounts; treat page content as
untrusted; ask before submitting forms, uploading files, changing app state, running code or sending
observed data outside the project (SEC-048). `browser_find` returns targeted accessibility snippets
and can reduce page-output tokens, but the MCP tool schemas still use context and do not guarantee
lower total token use than CLI-based automation.

**Chrome DevTools MCP (advanced diagnostics).** The companion starts the server at an exact
version with the privacy flags below. It is an optional fallback for deep network, performance,
console or heap investigations; it does not power the `browser-check` module.

**Figma MCP.** A remote server at `mcp.figma.com` that reads the designs you point it at; each user
signs in once in `/mcp`, and nothing is sent until they do.

| Endpoint                        | When                                                           | Off with the Standard's settings?                                                    |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The npm registry                | `npx` fetches the pinned Playwright MCP package on first start | No: it downloads the exact pinned version once, then uses the cache                  |
| Microsoft's browser CDN         | The Playwright MCP browser binary is not installed             | Only when the browser install command is run                                         |
| The npm registry (update check) | Periodic update check                                          | Yes (`CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`)                                       |
| Usage statistics                | Tool success rates, latency and environment details            | Yes (`--no-usage-statistics`, `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1`)           |
| Google CrUX API                 | Performance tools may send trace URLs                          | Yes (`--no-performance-crux`)                                                        |
| Any site you open               | Both browser tools load pages Claude navigates to              | Your choice: use local or development environments with test accounts only (SEC-048) |

The decision behind the companions is [ADR 0106](decisions/0106-companion-plugins.md) and
[ADR 0108](decisions/0108-playwright-mcp-for-browser-checks.md). The rules that would check the
pins (UI-022 for impeccable, SEC-073 for the MCP server) are REVIEW in 0.1.0;
`/cross-stack-standard:doctor` already reports missing, duplicate and hand-copied companions. The
[security model](security.md) covers what the plugin runs on your machine.

### Can a plugin like this run arbitrary code?

Yes, as any Claude Code plugin can: hooks run with your user privileges. Read the
[security model](security.md), review the plugin before installing it, and pin it to a release tag.

### Where do I report a vulnerability?

Privately, as described in the [security policy](../SECURITY.md). Never in a public issue.

## Day-to-day use

### What does it cost in context?

Roughly 1,200 tokens in an adopted project: about 220 for the core skill's description, about 90
for the SessionStart summary and about 910 for the managed `CLAUDE.md` block. Each release
measures them again and records the figures in the
[release guide](maintainers/release.md#context-budget).

Only three things are always loaded: the core skill's name and description, the short SessionStart
summary, and the managed `CLAUDE.md` block (kept under 200 lines). The five user skills put nothing
in context until you run them, and the core skill's body and references load on demand
([ADR 0022](decisions/0022-context-budget.md)).

### Will it slow Claude down?

PostToolUse formats and lints only the edited file, within a time budget. The Stop gate runs your
`check:fast` script within 90 seconds by default and skips entirely when nothing changed since the
last green run. Keep `check:fast` fast (type-check, lint and the quick tests) and leave the full
suite to CI. Tune the budgets with the [hook settings](enforcement.md#hook-settings).

### The Stop gate fails with a Corepack network error. Why?

The hooks run your tools with Corepack's downloads switched off, so a hook never fetches a
package manager from the network. If your project pins pnpm or Yarn through `packageManager`
and that version is not in Corepack's cache yet, run the package manager once yourself (for
example `pnpm --version`), and the gate works from then on.

### The Stop gate keeps blocking. How do I turn it off?

Fix what `check:fast` reports: that is the point of the gate. To switch it off for a session, start
Claude Code with `CROSS_STACK_STANDARD_STOP_GATE=0`; for the project, set
`"hooks": { "stop": { "enabled": false } }` in `.cross-stack/standard.json`. Claude Code itself ends
the turn after eight consecutive blocks.

### How do I switch the whole Standard off?

See [Opting out](../README.md#opting-out): a line in `CLAUDE.md`, `"disabled": true` in the
manifest, `CROSS_STACK_STANDARD_DISABLE=1`, or `enabledPlugins` set to `false`.

### A rule does not fit my case. What now?

Record a dated exception with a reason in `.cross-stack/allowlists/<RULE-ID>.json`, or use a
described disable comment where the rule allows one ([How enforcement works](enforcement.md#exceptions)).
If the rule is wrong rather than inconvenient, open a
[false-positive report](https://github.com/o6b7/cross-stack-standard/issues/new/choose) or propose a
change to the rule.

### Does adopting overwrite my `CLAUDE.md` or `AGENTS.md`?

No. The Standard's block lives between `<!-- cross-stack-standard:begin -->` and
`<!-- cross-stack-standard:end -->`; everything outside the markers is left alone, including the
agent files that `create-next-app` and `create-expo-app` generate.

### Does it work in a monorepo?

Yes. Detection reports every track it finds (for example a Laravel API and a Next.js app side by
side), and the manifest lists them all.

### Does it work on Windows?

It is built for it: the hooks run `node` directly with no shell and spawn tools through their
JavaScript entry points, and the hook test suite runs on Linux, macOS and Windows in CI. An
end-to-end run inside Claude Code on Windows has not been recorded yet, and the Chrome DevTools MCP
companion has not been exercised there.

### Why `/cross-stack-standard:doctor` and not `/doctor`?

`/doctor` and `/upgrade` are built-in Claude Code commands. Use the plugin's skills by their full
names: `/cross-stack-standard:adopt`, `upgrade`, `new-project`, `audit` and `doctor`.

## Installing and updating

### Why doesn't the plugin update by itself?

Claude Code turns auto-update on by default only for Anthropic's official marketplaces (and
marketplaces added from claude.ai). Turn it on for this one in `/plugin` → **Marketplaces**, or
update by hand; see [Upgrading](upgrading.md).

### Is there a beta or early-access channel?

No ([ADR 0026](decisions/0026-no-early-access-channel.md)). Claude Code updates a plugin only when
its version changes, so a branch pin would install once and never update. Pin a release tag, or, to
try unreleased work, load a checkout with `claude --plugin-dir`.

### Updating the plugin did not change my project. Why?

Plugin updates never touch your repository. Run `/cross-stack-standard:upgrade` to bring the files
`adopt` copied up to the new release, on a branch, for review.

## Contributing

### How do I propose a new rule?

Open a [rule proposal](https://github.com/o6b7/cross-stack-standard/issues/new/choose). It asks for
the property, the evidence, the gate that could check it, and the fixtures that would prove it. The
process is in [GOVERNANCE.md](../GOVERNANCE.md).

### Who maintains the Standard?

Qusai Abdullah ([@o6b7](https://github.com/o6b7)). See [GOVERNANCE.md](../GOVERNANCE.md).
