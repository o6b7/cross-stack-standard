# Companion plugins

Four third-party plugins that the Standard's marketplace pins to reviewed commits and that
`/cross-stack-standard:adopt` offers, all recommended, in one question ([ADR 0106][0106]). Each is
installed only when the user ticks it. Two of them back a module: `design` is on when `impeccable`
is installed, and `browser-check` is on when `chrome-devtools-mcp` is ([ADR 0011][0011]).

| Companion             | Use it for                                         | Module          |
| --------------------- | -------------------------------------------------- | --------------- |
| `caveman`             | Terse replies, only when the user types `/caveman` | none            |
| `impeccable`          | Design review of UI changes                        | `design`        |
| `figma`               | Reading designs, components and tokens from Figma  | none            |
| `chrome-devtools-mcp` | Checking the running app in a real browser         | `browser-check` |

Rules marked Tier 1 apply to every project with the module on; the others apply once the project
declares Tier 2.

## Before each use

1. **Only when the task needs it** (lazy use): a companion's skills and MCP tools load on demand;
   do not open the browser or Figma for work that does not need them.
2. **Check the state.** The session-start line `Companions: …` gives each one's state; for the
   current state, run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/companions.mjs" status --root . --data-dir "${CLAUDE_PLUGIN_DATA}"`.
   Use it only when it is `ready` or `unverified`.
3. **The first call is the health check.** For an `unverified` MCP companion, start with a
   read-only call: `whoami` for Figma; for Chrome DevTools MCP, `navigate_page` to the local
   development URL, given explicitly (for example `http://localhost:3000/`). The hooks record
   success or failure; after a failure the state is `unhealthy`.
4. **Otherwise, fall back.** For `unapproved`, `declined`, `not-installed`, `disabled`,
   `unpinned` or `unhealthy`, tell the user in one line what is unavailable and why, and offer the
   fallback the status line gives. Never describe a result the companion did not produce.

## Permission gates

The Standard's PreToolUse hook fails closed. It answers these calls with `ask` (the user confirms)
or `deny`, logs each decision, and never approves a call on the user's behalf. Consent means an
explicit `true` under `companions` in `.cross-stack/standard.json`; `false`, a missing or invalid
value, and a missing or unreadable manifest all count as no consent.

| Call                                                                                                                                                                                                                                                                      | Decision            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Any MCP tool or skill of a companion without consent                                                                                                                                                                                                                      | deny, with fallback |
| A shell command that installs or enables a companion without consent                                                                                                                                                                                                      | deny                |
| Any MCP tool or skill of a companion not installed from the Standard's marketplace at its pin, disabled, or beside another copy (another marketplace, or a hand copy in `~/.claude/skills` or `~/.claude/agents`)                                                         | ask                 |
| A shell command that installs or enables a companion from another marketplace                                                                                                                                                                                             | ask                 |
| Chrome DevTools MCP opening a page (`navigate_page` to a URL, `new_page`) whose explicit URL is not http(s) on localhost, 127.0.0.1, [::1], 0.0.0.0, `*.localhost`, `*.test` or the project's `hooks.preToolUse.browserHosts`; a missing URL is never taken for localhost | ask                 |
| Any other Chrome DevTools MCP action, reads, screenshots and reloads included, when the session's current page is not known or not on those hosts                                                                                                                         | ask                 |
| Chrome DevTools MCP back or forward (the resulting page cannot be checked), a page script, a file upload, or a tool not on the reviewed list                                                                                                                              | ask                 |
| A Figma MCP tool that is not a known read (anything that can change a file)                                                                                                                                                                                               | ask                 |

The current page is tracked per session: the explicit URL of the last successful navigation or new
page; unknown again after back, forward, a page switch, a closed page or a failed navigation.

## Rules

### design module (impeccable)

- **UI-021** Run impeccable's audit, critique and polish commands on UI changes before calling them done
- **UI-022** Install impeccable only from the pinned companion plugin, without its hooks

### browser-check module (Chrome DevTools MCP)

- **UI-013** Browser-check every changed screen before reporting UI work done
- **SEC-048** Point browser tooling only at local or dev test accounts, and copy nothing it observes
- **SEC-073** Run Chrome DevTools MCP only from the pinned companion plugin, unapproved in settings
- **SEC-074** Ask before the browser companion opens a non-development site, runs a page script or uploads a file

### Figma MCP

- **SEC-075** Ask before the Figma companion runs any tool that can change a Figma file

### What both review against

- **UI-003** Use design tokens, never raw color literals
- **UI-007** Define design tokens in one source; other CSS may only alias them
- **UI-012** Pass an automated accessibility scan, target size included, on every journey page _(off by default)_
- **UI-019** Declare an accessibility role on every touchable
- **UI-020** Label icon-only controls, expose selected and disabled state, and meet the minimum touch target
- **I18N-012** Use logical-direction utility classes, never physical left and right _(Tier 1; i18n module)_
- **I18N-014** Pair every physical value with its right-to-left counterpart and mirror directional icons _(i18n module)_

## Sanctioned patterns

**Installing.**

- Install a companion only from the Standard's marketplace (`<name>@cross-stack-standard`), which
  pins its commit and loads only the parts listed below. Never run an upstream install command:
  those track the latest commit and turn on hooks and always-on modes.
- A second copy from another marketplace, or a copy linked into `~/.claude/skills`, loads beside
  the pinned one; `/cross-stack-standard:doctor` finds them and offers to disable or remove them.

**caveman.**

- Four skills: `/caveman`, `/caveman-commit`, `/caveman-review`, `/caveman-help`. No hooks, so it
  is off until the user types `/caveman`.
- In plan mode the Standard's UserPromptSubmit hook adds a reminder that pauses it for the turn:
  write the plan and the questions in complete prose.
- Terse mode never shortens what the working procedure requires in full: paste real check output
  verbatim (PROC-021), and write options and questions out completely.

**impeccable (design module).**

- Loads its skill and its four agents, without its hooks. Its engine binary downloads on the first
  run of one of its commands, and some commands reach the network; the Standard's FAQ lists the
  endpoints and their switches.
- The Standard mandates three commands, `audit`, `critique` and `polish`, run against the
  project's own design tokens. Never use new-work or redesign modes on an existing product.
- Before reporting UI work done, run the audit on the changed screens and fix or report what it
  finds (UI-021).

**Figma.**

- The Figma MCP server is remote (`mcp.figma.com`); each user signs in once in `/mcp`.
- A design from Figma is an input, not a new design system: map it onto the project's existing
  tokens and components (UI-003, UI-007) instead of copying raw values.

**Chrome DevTools MCP (browser-check module).**

- The companion runs an exact version of `chrome-devtools-mcp` with an isolated temporary profile,
  usage statistics and CrUX lookups off, sensitive network headers redacted and update checks off.
  Do not add a second `chrome-devtools` server in `.mcp.json`.
- Committed settings never set `enabledMcpjsonServers` or `enableAllProjectMcpServers`; headless
  and CI runs disable the server.
- Point it only at local or development environments signed in with seeded test accounts. Never copy
  cookies, tokens, headers or personal data it can see into chat, commits, logs or issues.
- Before reporting UI work done, open every changed screen: check the console for errors, the
  network panel for failed requests, keyboard focus, and both directions when a right-to-left locale
  is configured; attach what you observed, not what you expected (UI-013).
- Without the companion, say that the UI was not checked in a browser; never imply it was.

## Status

SEC-074 and SEC-075 are GUARDED by the PreToolUse gates above. The other rules in this file are
REVIEW guidance: apply them, and do not describe them as enforced by a gate. UI-013, UI-021 and
SEC-048 stay review rules by design; the project tool's `doctor` checks for the companion pins
(UI-022, SEC-073) arrive in later 0.x releases, while `companions.mjs status` already verifies
each installed commit against its pin.
`enforcement` in `${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for each ID.

## Decision records

- [ADR 0011][0011]: Default module set
- [ADR 0106][0106]: Companion plugins: caveman, impeccable, Figma MCP and Chrome DevTools MCP, pinned and offered at adoption

[0011]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0011-default-module-set.md
[0106]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0106-companion-plugins.md
