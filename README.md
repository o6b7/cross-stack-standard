# Cross-Stack Standard

**Gates, not guidelines.** One engineering standard for Laravel APIs, Next.js web apps, and Expo /
React Native apps, available as a Claude Code plugin and a portable Agent Skill.

> **Status: 0.1.0 — early release: the plugin, hooks, skills and full rule catalog are in place;
> most rules are guidance (REVIEW) until their gates land in 0.x releases — see
> [ROADMAP](ROADMAP.md).**

## Why

A skill or a style guide cannot enforce anything; a failing build can. The Cross-Stack Standard is
built to turn architecture, security and internationalization rules for Laravel APIs, Next.js web
apps and Expo mobile apps into gates (linters, static analysis, architecture tests, CI steps and
optional Claude Code hooks) that fail when a rule is broken, whoever or whatever wrote the code.
Every rule says honestly which kind of protection it has today, so nobody mistakes a recommendation
for a guarantee.

| Label       | Meaning                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| **FORCED**  | A gate fails the build on every violation. There is no known way around it.                    |
| **GUARDED** | A gate fails the build on the direct form of the violation. The rule lists its known evasions. |
| **REVIEW**  | No gate yet. The active agent follows the rule through the skill, and code review checks it.   |

A rule is labelled FORCED or GUARDED only when its gate ships and its violation fixture has been
seen failing in CI ([ADR 0002](docs/decisions/0002-gates-over-guidelines.md),
[ADR 0004](docs/decisions/0004-fail-then-pass.md)). Every rule also records a **target**: the
label it reaches once its gate lands. In 0.1.0 six rules are GUARDED and every other
rule is REVIEW; see
[Rule catalog](#rule-catalog) and [How enforcement works](docs/enforcement.md).

## Install in 60 seconds

In a Claude Code session, in the repository you want to adopt:

```text
/plugin marketplace add o6b7/cross-stack-standard
/plugin install cross-stack-standard@cross-stack-standard
/cross-stack-standard:adopt
```

- `/plugin install` opens the plugin's details, where you **pick the scope**: **User** (every
  project on your machine), **Project** (enabled in the repository's committed
  `.claude/settings.json`; `adopt` also registers the marketplace there, so teammates get the
  plugin once they trust the folder) or **Local** (only you, only in this repository, in
  `.claude/settings.local.json`).
- `/cross-stack-standard:adopt` detects your tracks, asks for your tier, and writes
  `.cross-stack/standard.json` and the Claude Code files described in
  [Adopting](docs/adopting.md).
- From a terminal, the first two steps are `claude plugin marketplace add o6b7/cross-stack-standard`
  and `claude plugin install cross-stack-standard@cross-stack-standard --scope project`.

The Claude Code hooks and project tool need Node.js 22.13 or later on your `PATH`. Without it the
hooks cannot start; Claude Code reports a non-blocking hook error and the session carries on. The
CI validator is pinned to Claude Code 2.1.296, and local strict validation passed on that version.
A minimum supported version is not stated yet.

**Always-on context cost:** Claude Code's plugin projection is about 927 tokens, including five
user-only skills whose descriptions stay out of runtime context. The core skill description is
about 220 tokens; the SessionStart summary is about 90; the managed `CLAUDE.md` block is about 910
in an adopted project. Runtime `/context` has not yet been measured in an authenticated session.
Figures and method: [release guide](docs/maintainers/release.md#context-budget).

Next: [Getting started](docs/getting-started.md) walks through the first session.

## Use with Gemini CLI, Codex and other coding agents

The provider-neutral core skill is in `skills/cross-stack-standard/`. Gemini CLI can install it
directly from this repository:

```sh
gemini skills install https://github.com/o6b7/cross-stack-standard.git --path skills/cross-stack-standard
```

For Codex, from a clone of this repository, copy the folder into your user skills directory:

```sh
mkdir -p ~/.codex/skills
cp -R skills/cross-stack-standard ~/.codex/skills/
```

Other hosts that support the Agent Skills format can install the same directory through their skill
manager. It includes the rule index, track references and its own MIT license, so it does not depend
on the Claude Code plugin path.

| Host                     | What is included                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Claude Code              | Full plugin: commands, hooks and Claude-specific skills                                    |
| Gemini CLI               | The portable skill and bundled rule references                                             |
| Codex                    | The portable skill and bundled rule references                                             |
| Other Agent Skills hosts | The portable skill and bundled rule references, subject to each host's discovery and tools |

The portable skill does not install Claude Code hooks or make Claude slash commands available in
other hosts. Use the project's own check commands there; report which checks actually ran.

## Staying up to date

Claude Code turns auto-update on by default only for Anthropic's official marketplaces (and
marketplaces added from claude.ai). For third-party marketplaces, this one included,
**auto-update is off by default**.

- **Turn it on:** `/plugin` → **Marketplaces** → select `cross-stack-standard` → **Enable
  auto-update**. Claude Code then checks in interactive sessions and shows
  `Plugin updated: … · Run /reload-plugins to apply`. The settings reference also documents
  `"autoUpdate": true` next to `source` on an `extraKnownMarketplaces` entry.
- **Update by hand:**

  ```sh
  claude plugin marketplace update cross-stack-standard
  claude plugin update cross-stack-standard@cross-stack-standard --scope project
  ```

  Use the scope you installed with. In a session, `/plugin` → **Installed** → **Update now** does
  the same.

- **Apply without restarting:** `/reload-plugins`.
- **Pin a release:** add the marketplace at a tag, or set `"ref": "v0.1.0"` in the team settings
  below. A tag ruleset in this repository restricts updating and deleting tags, so a pin keeps
  resolving to the reviewed content. Move to a newer release by editing the `ref`.

  ```text
  /plugin marketplace add o6b7/cross-stack-standard#v0.1.0
  ```

- **No early-access channel in 0.1.0.** There is no `#dev` pin to follow
  ([ADR 0026](docs/decisions/0026-no-early-access-channel.md)); contributors run unreleased code
  with `claude --plugin-dir` ([CONTRIBUTING](CONTRIBUTING.md)).
- **Files in your repository do not change when the plugin updates.** Gate files and templates
  that `adopt` copied are updated by `/cross-stack-standard:upgrade`, which proposes the changes on
  a branch for review ([Upgrading](docs/upgrading.md)). Once the gate packages are published,
  package updates will reach them through your dependency updater too.

## Team rollout

Commit this to the repository's `.claude/settings.json`, so everyone who opens the repository in
Claude Code gets the same plugin at the same release:

```json
{
  "extraKnownMarketplaces": {
    "cross-stack-standard": {
      "source": { "source": "github", "repo": "o6b7/cross-stack-standard", "ref": "v0.1.0" }
    }
  },
  "enabledPlugins": { "cross-stack-standard@cross-stack-standard": true }
}
```

Claude Code applies a repository's marketplace settings only after each person accepts the
workspace trust dialog; in untrusted folders, including `claude -p` runs, they are ignored without
a message. Organizations can force-enable or block the plugin, and restrict marketplaces, with
[managed settings](https://code.claude.com/docs/en/plugins/org.md): managed `enabledPlugins`,
`strictKnownMarketplaces` and, if you use `allowManagedHooksOnly`, a managed force-enable so the
plugin's hooks still run.

## What you get per track

| Track                             | Scope                                                                  | Gates and tools (planned)                                                                                                                                                      | 0.1.0 status                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [Laravel](docs/tracks/laravel.md) | JSON API: layering, validation, authorization, API contract, tenancy   | Pest architecture presets and tests, custom PHPStan rules on Larastan with a shrink-only baseline, framework-reflection tests, Pint, jscpd, `composer audit`                   | 151 rules, all REVIEW (guidance); gates planned                                                               |
| [Web](docs/tracks/web.md)         | Next.js 16 App Router: layers, server state, env, BFF auth, a11y, i18n | ESLint with strict type-checked typescript-eslint and the Standard's own ESLint plugin, dependency-cruiser, Vitest architecture tests, knip, jscpd, Prettier, Playwright + axe | 88 web rules plus 44 shared web and mobile rules, all REVIEW; gates planned                                   |
| [Mobile](docs/tracks/mobile.md)   | Expo: folder contract, storage, API client, RTL contract               | ESLint with eslint-config-expo and the Standard's own plugin, dependency-cruiser, Jest tests, i18n parity checker                                                              | 52 mobile rules plus 44 shared web and mobile rules, all REVIEW; gates planned                                |
| All tracks                        | Secrets, supply chain, exceptions, CI, working procedure               | gitleaks, dependency audits, lefthook, commitlint, reusable CI workflows, the project tool `.cross-stack/bin/cross-stack.mjs`                                                  | Shared: 50 rules, 6 GUARDED and 44 REVIEW; the project tool's manifest and allowlist checks ship              |
| Agent Skills layer                | Provider-neutral instructions and rule references                      | `skills/cross-stack-standard/`                                                                                                                                                 | Available to Gemini CLI, Codex and other Agent Skills hosts; no Claude-specific hooks or commands             |
| Claude Code layer                 | Detection, per-edit feedback, fast gate, gate-file protection          | The plugin's six hook events and six skills                                                                                                                                    | Hooks and skills ship; four core rules and SEC-074 / SEC-075 for companion consent are GUARDED by CI fixtures |

The Claude Code hooks do their work in 0.1.0: SessionStart names the project's tracks and tier,
PostToolUse formats and lints each edited file with your installed tools, Stop runs your `check:fast`
script (in an adopted project that defines one) before Claude ends a turn, and PreToolUse asks before
an edit or shell command touches a gate file. UserPromptSubmit and PostToolUseFailure support the
companion integrations. The four core hook rules and two companion-consent rules are GUARDED with
clean and violation fixtures. The portable Agent Skill gives other hosts the same rule guidance but
does not provide these Claude Code hooks.

## Modules

Modules are opt-in capabilities declared in `.cross-stack/standard.json` and installed as whole
units ([ADR 0010](docs/decisions/0010-opt-in-modules.md)). Defaults follow from the tracks and
locales you declare ([ADR 0011](docs/decisions/0011-default-module-set.md)); an explicit value
always wins.

**Companion plugins.** The marketplace also pins five third-party plugins to reviewed commits:
caveman (terse replies, off until `/caveman`), impeccable (design review), the Figma MCP server,
Playwright MCP for routine browser checks and Chrome DevTools MCP for advanced diagnostics.
`/cross-stack-standard:adopt` offers them in one question and installs only the ones you approve
([ADR 0106](docs/decisions/0106-companion-plugins.md),
[ADR 0108](docs/decisions/0108-playwright-mcp-for-browser-checks.md)).

| Module          | What it adds                                                                  | Default                                               |
| --------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `api-contract`  | Resource success shape, RFC 9457 problem details, generated TypeScript types  | On with the `laravel` track                           |
| `i18n`          | Configured locales, RTL derived per locale, parity, logical-direction styling | On when `locales` lists more than one locale          |
| `bff-auth`      | Cookie BFF for Next.js in front of the API: session, CSRF, header allow-list  | On with `web` (profile `next`) and `laravel`          |
| `tenancy`       | Tenant scoping that fails closed, isolation suites, background tenant context | Off                                                   |
| `design`        | Rules for the impeccable companion: audit, critique and polish of UI changes  | On when adopt installs impeccable                     |
| `browser-check` | Routine Playwright MCP checks; Chrome DevTools MCP for advanced diagnostics   | On when adopt records consent for either browser tool |
| `observability` | Error tracking across stacks (planned after 1.0)                              | Off                                                   |

```json
{
  "$schema": "https://raw.githubusercontent.com/o6b7/cross-stack-standard/v0.1.0/plugins/cross-stack-standard/data/standard.schema.json",
  "version": "0.1.0",
  "tracks": ["laravel", "web"],
  "profile": "next",
  "tier": 2,
  "modules": { "api-contract": true, "bff-auth": true, "i18n": true, "tenancy": false },
  "locales": ["en", "ar"]
}
```

The schema is published with every release; `$schema` points at the one for the version you
adopted, so editors complete and validate the file. Hook settings live under `hooks` in the same
file. Every field, default and environment variable is in [Configuration](docs/configuration.md).

## Rule catalog

The [rule catalog](docs/rules/README.md) is generated from the single registry,
[`registry/rules.json`](registry/rules.json): **385 rules**, each citing a
[decision record](docs/decisions/README.md).

| Level   | Enforcement in 0.1.0 | Target |
| ------- | -------------------- | ------ |
| FORCED  | 0                    | 100    |
| GUARDED | 4                    | 225    |
| REVIEW  | 379                  | 58     |

321 rules are waiting for their gate; 58 stay code-review rules by design. By scope: Laravel 151,
web 88, mobile 52, web and mobile 44, shared 48. 127 rules are Tier 1 (every adopting project);
256 are Tier 2 (multi-tenant, team or long-lived projects).

## Arabic and RTL, first-class

Right-to-left support is designed in, not bolted on. Declare `"locales": ["en", "ar"]` and the
`i18n` module derives each locale's direction from a fixed list of right-to-left locales.

| Area               | What the Standard requires                                                           | Rules                                            |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Logical direction  | `ms-*`/`me-*`, `text-start`, logical style properties; never physical left and right | I18N-012, I18N-013, I18N-014                     |
| Locale file parity | Same keys, no empty values, no untranslated copies, same placeholders, plural forms  | I18N-033, I18N-034, I18N-035, I18N-036, I18N-042 |
| Web routing        | Locale-prefixed URLs, no auto-detection, `lang` and `dir` on the document root       | I18N-021, I18N-026, I18N-027                     |
| Mobile direction   | `supportedLocales` declared; direction changes only in one `setAppLanguage()`        | I18N-029, I18N-030                               |
| Server messages    | Translation keys, locale set before auth and throttling, recipient locale for mail   | I18N-001, I18N-002, I18N-003                     |

**Enforced now:** none of these by a gate. In 0.1.0 they are REVIEW rules that Claude follows
through the portable skill and Claude Code's `audit` reports; 37 of the 43 i18n rules have a FORCED or GUARDED target, and
their gates (the Standard's `no-physical-direction` ESLint rule, the parity checker, routing tests
and the Expo config check) are on the [ROADMAP](ROADMAP.md). Details:
[Internationalization and RTL](docs/i18n-rtl.md).

## Opting out

| Scope                           | How                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| One project, every hook         | The line `cross-stack-standard: declined` in `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`           |
| One project, from configuration | `"disabled": true` in `.cross-stack/standard.json`                                                           |
| One session or shell            | `CROSS_STACK_STANDARD_DISABLE=1 claude`                                                                      |
| Only the Stop gate              | `CROSS_STACK_STANDARD_STOP_GATE=0`, or `"hooks": { "stop": { "enabled": false } }` in the manifest           |
| The whole plugin, for you       | `"cross-stack-standard@cross-stack-standard": false` under `enabledPlugins` in `.claude/settings.local.json` |

An opted-out project gets no hook output and no child processes. The first three switches silence
the hooks; the opt-out line also tells the core skill not to apply the Standard, while the other two
leave the skills in use. `enabledPlugins` set to `false` turns off the whole plugin. The plugin treats adding the opt-out line or `"disabled": true` as a protected change: if
Claude tries it, you are asked first.

## FAQ

**Does this send my code anywhere?** The plugin does not. Its hooks and the project tool run
locally, make no network calls and collect no telemetry. They run your project's own tools
(formatters, ESLint, your `check:fast` script), which behave as they always do, including any
network access your scripts make. Hook output that goes to Claude (the SessionStart summary, lint
findings, a failing check) becomes part of the conversation, which Claude Code sends to the model
under Anthropic's terms and your account's settings, as with any other context. The
`new-project` skill runs the framework generators, which download packages, only after you approve
the exact commands. The companion plugins that involve third-party services are installed only when you tick them in
adopt; the [FAQ](docs/faq.md#does-this-send-my-code-anywhere) lists every endpoint they can reach
and the switches that turn each one off.

**Is anything enforced in 0.1.0?** The hooks run, and the project tool validates the manifest and
allowlists. Six rules are GUARDED by those hooks; the other gates arrive track by track in 0.x
releases ([ROADMAP](ROADMAP.md)).

**Does it work on Windows?** It is built for it: hooks run `node` directly with no shell, and the
hook test suite runs on Linux, macOS and Windows in CI. An end-to-end run inside Claude Code on
Windows has not been recorded yet.

More in the [FAQ](docs/faq.md) and the [comparison with other approaches](docs/comparison.md).

## Documentation

- [Getting started](docs/getting-started.md) · [Adopting](docs/adopting.md) ·
  [Configuration](docs/configuration.md) ·
  [Upgrading](docs/upgrading.md) · [How enforcement works](docs/enforcement.md)
- Tracks: [Laravel](docs/tracks/laravel.md) · [Web](docs/tracks/web.md) ·
  [Mobile](docs/tracks/mobile.md) · [Internationalization and RTL](docs/i18n-rtl.md)
- [Security model](docs/security.md) · [FAQ](docs/faq.md) · [Comparison](docs/comparison.md) ·
  [Rules](docs/rules/README.md) · [Decisions](docs/decisions/README.md) · [Roadmap](ROADMAP.md)

## Contributing, security and license

- [Contributing](CONTRIBUTING.md): the branch model, local checks, and how a rule is proposed and
  promoted.
- [Security policy](SECURITY.md): report vulnerabilities privately, never in a public issue.
- [Code of conduct](CODE_OF_CONDUCT.md) (Contributor Covenant 3.0) and
  [governance](GOVERNANCE.md).
- License: [MIT](LICENSE).

## Author

Qusai Abdullah · GitHub [@o6b7](https://github.com/o6b7) ·
[LinkedIn](https://www.linkedin.com/in/qusaiabdullah/) ·
[qusaii.abdullah@gmail.com](mailto:qusaii.abdullah@gmail.com)
