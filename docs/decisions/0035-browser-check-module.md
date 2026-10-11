---
status: superseded by 0106
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# browser-check module: Chrome DevTools MCP as an opt-in, pinned, privacy-configured template

## Context and Problem Statement

Checking a change in a real browser (console errors, network calls, layout, accessibility) is
useful to an agent, and Chrome DevTools MCP (Apache-2.0) provides it. It also exposes the browser's
contents to the MCP client, including cookies and request headers. Its defaults are not private:
usage statistics are on, performance tools may send trace URLs to the Chrome UX Report API, the
server checks the npm registry for updates, and without `--isolated` the browser profile persists
between runs. The upstream instructions use `@latest`, and the upstream Claude Code plugin starts
the server in every project without any privacy flag. Unknown command-line flags only print a
warning, so a misspelled privacy flag is silently ignored.

How does the Standard offer browser checks without starting a browser server for every adopter or
leaking data by default?

## Decision Drivers

- Opt-in per project; the Standard's plugin never starts an MCP server by itself.
- An exact version and explicit privacy flags that are proven to exist in that version.
- Each developer approves the server; committed settings never approve it for everyone.
- Headless and CI runs never start it.
- Only development environments and test accounts are exposed to it.

## Considered Options

- An opt-in project `.mcp.json` template, pinned and privacy-configured (the `browser-check` module)
- An MCP server declared by the Standard's plugin
- The upstream plugin or `claude mcp add … @latest`

## Decision Outcome

Chosen option: "An opt-in project `.mcp.json` template, pinned and privacy-configured (the
`browser-check` module)", because it is the only option that is off by default, pinned, and
configured for privacy.

- **Template.** With the `browser-check` module on ([0010](0010-opt-in-modules.md)), the project
  gets an `.mcp.json` entry that runs
  `npx -y chrome-devtools-mcp@1.10.1 --isolated --no-usage-statistics --no-performance-crux --redact-network-headers`
  with `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1` and `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1` in
  its environment. `--isolated` uses a temporary profile deleted when the browser closes;
  `--redact-network-headers` redacts headers the tool considers sensitive; the update check has no
  flag, only the environment variable.
- **Approval.** Claude Code asks each developer before it uses a project-scoped server. Committed
  settings never set `enabledMcpjsonServers` or `enableAllProjectMcpServers`, which in a trusted
  folder would approve the server for everyone. Non-interactive runs (`claude -p`, Agent SDK and cloud sessions) load
  project servers without asking, so headless and CI settings list the server in
  `disabledMcpjsonServers`, which wins in every mode.
- **Flag check.** A repository test compares every flag in the template with the option list of the
  pinned version, so a renamed or misspelled flag fails the build instead of being ignored.
- **Plugin conflict.** `doctor` warns when the upstream `chrome-devtools-mcp` plugin is enabled
  globally, because it runs a second server without these flags.
- **Lock depth.** `npx` pins only the top-level package. Version 1.10.1 bundles its code and has no
  runtime dependencies, so the exact version covers all of its JavaScript; teams that want a
  lockfile-level guarantee install it as a pinned devDependency and point `.mcp.json` at the local
  binary.
- **Use.** Development and local environments with seeded test accounts only. Cookies, tokens and
  headers the server can read are never copied into chat, commits or logs. Projects may deny single
  tools, such as script evaluation, with permission rules.

### Consequences

- Good, because nothing starts unless a project opts in and a developer approves it.
- Good, because the privacy flags are proven to exist in the pinned version.
- Bad, because the upstream plugin's bundled skills are not available through a bare `.mcp.json`.
- Bad, because the first start downloads the pinned package from npm.
- Bad, because keeping production data out of the browser is a practice, not a gate.

### Confirmation

The flag check runs in this repository's test suite. `doctor` warns about a globally enabled
upstream plugin. That committed settings carry no MCP approvals, and which environments and
accounts the browser uses, are checked in review (REVIEW).

## Pros and Cons of the Options

### An opt-in project `.mcp.json` template, pinned and privacy-configured (the `browser-check` module)

- Good, because it is per project, pinned and configured.
- Bad, because each developer approves it once, and teams must opt in explicitly.

### An MCP server declared by the Standard's plugin

- Good, because it would work with no setup.
- Bad, because it would start a browser server in every adopting project, including those that
  never asked for one.

### The upstream plugin or `claude mcp add … @latest`

- Good, because it includes upstream's skills and updates itself.
- Bad, because it floats to new versions and leaves usage statistics and CrUX lookups on.

## More Information

- Chrome DevTools MCP, its options and security notes:
  <https://github.com/ChromeDevTools/chrome-devtools-mcp>.
- Claude Code project-scoped MCP servers and approvals: <https://code.claude.com/docs/en/mcp>;
  settings keys: <https://code.claude.com/docs/en/settings>; MCP permission rules:
  <https://code.claude.com/docs/en/permissions>.
- Pins and flag defaults: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0010](0010-opt-in-modules.md), [0032](0032-supply-chain-pinning.md),
  [0034](0034-design-module.md).
- Governs: the `browser-check` module's template, doctor checks and the repository flag test.
