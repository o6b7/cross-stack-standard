# Security model

This page covers two things: how the plugin itself behaves on your machine, and the security rules
the Standard applies to your application. To report a vulnerability, follow the
[security policy](../SECURITY.md); never open a public issue for one.

## The plugin on your machine

### What it can do

A Claude Code plugin runs with your user privileges, like any development dependency. Claude Code's
own documentation says so plainly: an installed plugin can execute arbitrary code on your machine,
its hooks run outside the sandbox and the permission rules, and its skills enter Claude's context as
instructions. Review a plugin before you install it, and pin it to a release so that what you
reviewed is what runs:

```sh
git clone https://github.com/o6b7/cross-stack-standard.git
claude --plugin-dir ./cross-stack-standard/plugins/cross-stack-standard plugin details cross-stack-standard
```

Claude Code has no plugin code signing. A tag ruleset in this repository restricts updating and
deleting tags, so a `#vX.Y.Z` pin keeps resolving to the files you reviewed; compare two tags before
you move a pin.

### What it runs

| Component    | Runs                                                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hooks        | `node` with the plugin's entry point. It reads your manifest and memory files, and starts only your project's own tools: the formatter and ESLint from `node_modules`, Pint or PHPStan from `vendor/bin`, your `check:fast` script through npm or Composer, and `git` to tell whether anything changed. |
| Project tool | `node .cross-stack/bin/cross-stack.mjs`, a single file with no dependencies. Its checks read `.cross-stack/` and the project's files; `doctor` also starts `git`, `claude`, `php` and `composer` only to read their versions.                                                                           |
| Skills       | Instructions to Claude. `adopt`, `upgrade`, `new-project`, `audit` and `doctor` run only when you invoke them; they act through Claude's normal tools, so your permission settings apply.                                                                                                               |

Tools are resolved only from the project; the hooks never run `npx`, never download a tool and never
use a shell. The plugin's scripts use Node.js built-ins only, so installing the plugin installs no
npm packages. The Stop hook keeps small fingerprints of the last green run and the last failing run
in the plugin's data directory, managed by Claude Code.

### Network and telemetry

- **The hooks and the project tool make no network calls and send no telemetry.**
- **Your tools behave as usual.** A `check:fast` script that downloads something, or a linter
  plugin that phones home, does so whether or not the Standard runs it.
- **Hook output becomes context.** What the hooks print to Claude (the SessionStart summary, lint
  findings, a failing check's output) becomes part of the conversation, which Claude Code sends to
  the model like any other context. The SessionStart summary is a few lines; lint and check output
  is trimmed to the relevant lines, with your home directory shown as `~`.
- **Companion plugins can reach third-party services.** Nothing third-party is installed until you
  tick it in adopt. The [FAQ](faq.md#does-this-send-my-code-anywhere) lists every endpoint the
  companion plugins can reach.

### Fail-open behaviour

A broken hook never blocks your session: hooks enforce their own time budgets, report problems as
a short notice, and exit cleanly. If `node` is missing, the hooks cannot start; Claude Code shows a
non-blocking hook error and carries on without them. `doctor` checks for Node.js.

## Supply chain

Everything the Standard ships or templates is pinned ([ADR 0032](decisions/0032-supply-chain-pinning.md)):

- GitHub Actions by full commit SHA, with the version in a comment;
- binaries such as gitleaks as checksum-verified downloads of an exact version;
- MCP servers and CLI tools at exact versions;
- nothing fetched from a moving branch, anywhere.

Every version, flag and checksum the Standard relies on is recorded with its source and date in
[verified-versions.md](maintainers/verified-versions.md), and a CI watch job flags entries older
than 90 days. The Next.js security floor is recorded there too; with the web gates it moves into
one data file that the templates and a floor check read
([ADR 0071](decisions/0071-nextjs-security-floor.md)).

## Third-party modules

The Standard's marketplace pins four companion plugins to reviewed commits: caveman, impeccable,
the Figma MCP server and the Chrome DevTools MCP server
([ADR 0106](decisions/0106-companion-plugins.md)). `/cross-stack-standard:adopt` offers them in
one question and installs only the ones you tick, with `claude plugin install
<name>@cross-stack-standard`. Never install them from their upstream instructions: those track the
latest commit and turn on hooks the companion entries leave off. In 0.1.0 the related rules
(UI-021, UI-022, SEC-048, SEC-073, UI-013) are REVIEW.

### caveman

Four skills (`caveman`, `caveman-commit`, `caveman-review`, `caveman-help`) and nothing else: no
hooks, no proxy, no engine, no network access. It is off until you type `/caveman`, and the
Standard's UserPromptSubmit hook pauses it in plan mode.

### impeccable (`design` module)

impeccable (Apache-2.0) loads its skill and four agents, without its hooks. It downloads its engine
binary from its GitHub releases the first time one of its commands runs, and it has a daily update
check, choice reporting and other endpoints; the [FAQ](faq.md#does-this-send-my-code-anywhere)
lists them with the switches that turn them off. In 0.1.0 the Standard does not write those
switches for you, and checking the engine's checksum against independently recorded values is
UI-022's planned gate. The Standard mandates three of its commands (audit, critique and polish),
run against the project's own design tokens (UI-021).

### Figma MCP

A remote MCP server at `mcp.figma.com`, with the Figma plugin's skills. It reads what your Figma
account can see, and only after you sign in once in `/mcp`.

### Chrome DevTools MCP (`browser-check` module)

The companion starts `chrome-devtools-mcp` at an exact version, with a temporary browser profile,
usage statistics, CrUX lookups and update checks off, and sensitive network headers redacted.

Chrome DevTools MCP can read everything in the browser it drives, cookies and headers included. Use
it only against local or development environments with test accounts (SEC-048), and never copy what
it observes into chat, commits or logs. Headless runs (`claude -p`, the Agent SDK) load enabled
plugins, so turn the companion off in CI settings with
`"enabledPlugins": { "chrome-devtools-mcp@cross-stack-standard": false }`.

## Security rules for your application

The Standard's `SEC-` rules cover security properties in Laravel APIs, Next.js apps, Expo apps and
the companion tools. Application security rules are REVIEW guidance carried by the portable skill;
Claude Code's `audit` reports them. `SEC-074` and `SEC-075` are GUARDED by the Claude Code
PreToolUse hook, which asks before risky browser or Figma companion actions. Track gates land over
time ([roadmap](../ROADMAP.md)).

| Area                             | Examples                                                                                                     | Decision records                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and authorization | SEC-003, SEC-004, SEC-005 (Laravel); SEC-034 (session checked again in each Route Handler and Server Action) | [0043](decisions/0043-single-authorization-site.md), [0070](decisions/0070-proxy-ux-only-session-reverification.md)                                                                                  |
| Abuse limits                     | SEC-006, SEC-007, SEC-008 (rate limits)                                                                      | [0050](decisions/0050-rate-limiting.md)                                                                                                                                                              |
| Tokens and sessions              | SEC-010, SEC-011 (revocation, expiry); SEC-036, SEC-038, SEC-039 (BFF cookies)                               | [0083](decisions/0083-credential-and-client-storage.md), [0073](decisions/0073-bff-auth-module.md)                                                                                                   |
| Cross-site request forgery       | SEC-035, SEC-067, SEC-068, SEC-070                                                                           | [0074](decisions/0074-bff-csrf-defense.md)                                                                                                                                                           |
| Client storage                   | SEC-046 (web); SEC-049, SEC-050, SEC-052 (mobile secure store and key-value stores)                          | [0083](decisions/0083-credential-and-client-storage.md)                                                                                                                                              |
| Injection and data exposure      | SEC-001, SEC-012, SEC-013, SEC-047 (no raw HTML sinks)                                                       | [0036](decisions/0036-pest-replaces-phpunit-runner.md), [0047](decisions/0047-model-conventions.md), [0053](decisions/0053-rfc-9457-problem-details.md), [0086](decisions/0086-no-raw-html-sinks.md) |
| Uploads                          | SEC-022, SEC-023, SEC-024, SEC-025                                                                           | [0087](decisions/0087-file-uploads.md)                                                                                                                                                               |
| Tenant isolation (`tenancy`)     | SEC-015, SEC-016, SEC-018, SEC-020, SEC-021                                                                  | [0057](decisions/0057-tenancy-module.md), [0058](decisions/0058-background-tenant-context.md)                                                                                                        |
| Secrets and supply chain         | SEC-061, SEC-063 (pinned secret scan), SEC-064, SEC-065, CI-008 (dependency audits)                          | [0084](decisions/0084-secret-scanning-and-dependency-audits.md), [0085](decisions/0085-environment-files.md)                                                                                         |
| Framework floor                  | SEC-045 (Next.js at or above the security floor)                                                             | [0071](decisions/0071-nextjs-security-floor.md)                                                                                                                                                      |
| Logging                          | SEC-027 (redaction), BE-090, BE-091                                                                          | [0088](decisions/0088-structured-redacted-logging.md)                                                                                                                                                |
| Companion-tool consent           | SEC-074 (browser) and SEC-075 (Figma), both GUARDED by the Claude Code hook                                  | [0106](decisions/0106-companion-plugins.md)                                                                                                                                                          |

The full list, with each rule's target label and planned gate, is in the
[rule catalog](rules/README.md).
