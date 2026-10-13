---
status: accepted
date: 2026-10-12
decision-makers: Qusai Abdullah
---

# Playwright MCP for routine browser checks; Chrome DevTools MCP for advanced diagnostics

## Context and Problem Statement

The `browser-check` module uses Chrome DevTools MCP for routine UI checks and advanced diagnosis.
That server provides a broad set of diagnostic tools even when a task only needs to inspect a local
screen. The project needs a consent-based routine browser companion, with Chrome DevTools available
when its deeper diagnostics are useful.

The requested Microsoft repository, `microsoft/playwright-mcp`, is an MCP server rather than a
standalone skill or CLI. It uses accessibility snapshots and focused page searches, but it still
loads MCP tool schemas into the agent context. How should the Standard integrate it without making
an unsupported token-efficiency claim or weakening the browser safety model?

## Decision Drivers

- Keep browser use optional, consent-based and pinned to exact upstream versions.
- Use focused accessibility queries for routine local UI checks.
- Keep Chrome DevTools MCP for deeper network, performance, console and heap diagnostics.
- Apply the existing consent, host and side-effect gates to both browser servers.
- Document the current upstream dependency risk and the limits of host checks.

## Considered Options

- Keep Chrome DevTools MCP as the only browser companion.
- Replace Chrome DevTools MCP entirely with Playwright MCP.
- Use Playwright MCP for routine checks and retain Chrome DevTools MCP for advanced diagnostics.

## Decision Outcome

Chosen option: use Microsoft Playwright MCP for routine checks and retain Chrome DevTools MCP as
an optional advanced companion. The Standard adds its own small `/cross-stack-standard:playwright`
skill because the linked upstream repository does not provide a routine browser-use skill.

### Pin and install

The marketplace pins [`microsoft/playwright-mcp`](https://github.com/microsoft/playwright-mcp) to
commit `f183dad4a52965583e3cc1d59b88cdc279e2e57d` and starts the Apache-2.0 npm package
`@playwright/mcp@0.0.83`. It requires Node.js 18 or newer. The config uses headless Chromium, an
isolated in-memory browser profile, page-provided WebMCP disabled and console output limited to
errors. It enables no optional capabilities.

The npm package currently pins both `playwright` and `playwright-core` to
`1.64.0-alpha-1790635538000`. This is an upstream stability risk; pinning the MCP wrapper does not
vendor or independently rebuild those dependencies. Record the repository commit, npm integrity,
license, engines and dependency in `docs/maintainers/verified-versions.md` and review them on the
normal dependency-watch cadence.

### Routine use and token use

The Playwright MCP companion is the default for routine local browser checks. The usage skill
prefers `browser_find` for targeted accessibility snippets, shallow snapshots for extra context,
console errors only, and screenshots only when the page structure cannot answer the visual
question. These choices keep returned page content focused. MCP tool schemas still enter context,
so the Standard does not promise that Playwright MCP uses fewer total tokens than CLI-based browser
automation. Microsoft's [Playwright MCP and CLI comparison](https://github.com/microsoft/playwright-mcp#playwright-mcp-vs-playwright-cli)
describes the separate [Playwright CLI with Skills](https://github.com/microsoft/playwright-cli)
as the more token-efficient workflow for coding agents.

Chrome DevTools MCP remains available for deeper request inspection, traces, Lighthouse,
performance, heap snapshots and browser issues the routine workflow cannot explain.

### Permission and safety behavior

The `browser-check` module turns on when `adopt` records consent for either browser companion.
Every MCP call is denied without explicit consent and asks if the companion is not at its pin,
disabled or duplicated. For Playwright MCP, the PreToolUse hook asks unless navigation URLs and the
session's known current page are local or included in `hooks.preToolUse.browserHosts`. It also asks
for back navigation, page evaluation, server-side Playwright code (`browser_run_code_unsafe`), file
uploads or drops, network request details and unknown tools. Chrome DevTools MCP retains its
existing local-host and reviewed-tool gates. `SEC-074` covers both servers.

The hook cannot reliably see a redirect, a page link that navigates, or subresource requests.
Playwright MCP's upstream documentation says the server is not a security boundary. The workflow
therefore uses only local or development hosts and test accounts, checks the resulting URL, treats
page content as untrusted, and asks before form submission or other state changes. Neither browser
server may send observed credentials or personal data into chat, commits, logs or issues.

The server fetches the exact npm package on first start and may download Chromium from Microsoft's
browser CDN. It keeps browser data in memory and does not enable page-provided WebMCP tools.

## Consequences

- Good, because routine checks use focused accessibility data without loading screenshots by
  default.
- Good, because teams can keep Chrome DevTools MCP for detailed diagnostics.
- Good, because both browser tools remain optional, consent-gated and host-checked.
- Bad, because MCP schemas still use context and focused outputs do not prove lower total token use
  than a CLI workflow.
- Bad, because the pinned upstream package currently depends on a Playwright alpha build.
- Bad, because navigation through redirects or page links cannot be fully constrained by the
  PreToolUse hook; local/test environments remain required.

## Confirmation

- `test/hooks/companions.test.mjs` covers the Playwright consent, host checks and prompts for unsafe,
  sensitive and unreviewed tools.
- `test/scripts/plugin/manifests.test.mjs` verifies the repository commit pin, npm package version,
  isolated browser flags, license and Chrome DevTools privacy flags.
- `test/hooks/entry.test.mjs` verifies that the Playwright tools are covered by the companion hook
  matcher.
- `npm run check:plugin-data`, `npm run check:rule-docs` and strict Claude plugin validation check
  generated companion data, registry wording and marketplace manifests.

## More Information

- [Microsoft Playwright MCP repository](https://github.com/microsoft/playwright-mcp)
- [`@playwright/mcp@0.0.83` package metadata](https://github.com/microsoft/playwright-mcp/blob/f183dad4a52965583e3cc1d59b88cdc279e2e57d/package.json)
- [Playwright MCP security note](https://github.com/microsoft/playwright-mcp#security)
- Supersedes the browser-tool choice in [0011](0011-default-module-set.md) and the browser-check
  companion workflow in [0106](0106-companion-plugins.md); other companion decisions remain in
  effect.
