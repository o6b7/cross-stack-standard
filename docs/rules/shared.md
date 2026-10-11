<!-- Generated from registry/rules.json — do not edit. Regenerate: node scripts/generate-rule-docs.mjs -->

# Shared rules

Rules that apply to every project, whatever its tracks: the project configuration, stack choices, exceptions, the agent hooks and CI.

50 rules: 0 FORCED, 6 GUARDED, 44 REVIEW; 30 awaiting promotion to a gated level. Target levels: 2 FORCED, 34 GUARDED, 14 REVIEW. Back to the [rule index](README.md).

| ID | Title | Tier | Enforcement | Target |
| --- | --- | --- | --- | --- |
| [SEC-026](#sec-026) | Store attachment ids, never URLs, and serve private files through short-lived signed URLs | 2 | REVIEW | REVIEW |
| [SEC-061](#sec-061) | Inject production secrets at runtime from the platform, never commit or bake them in | 1 | REVIEW | REVIEW |
| [SEC-062](#sec-062) | Give quality jobs no secrets, so no build or test step can need a runtime secret | 1 | REVIEW | GUARDED |
| [SEC-063](#sec-063) | Commit no secret: run a pinned secret scanner over every commit range in CI | 1 | REVIEW | GUARDED |
| [SEC-064](#sec-064) | Keep env example files to keys and placeholders, never secret values | 1 | REVIEW | GUARDED |
| [SEC-065](#sec-065) | Pin third-party tooling: actions to full commit SHAs, MCP servers and CLI tools to exact versions | 1 | REVIEW | GUARDED |
| [SEC-074](#sec-074) | Ask before the browser companion opens a non-development site, runs a page script or uploads a file | 2 | GUARDED | GUARDED |
| [SEC-075](#sec-075) | Ask before the Figma companion runs any tool that can change a Figma file | 2 | GUARDED | GUARDED |
| [I18N-010](#i18n-010) | Have a person write or review translations, never generate them just to satisfy parity | 2 | REVIEW | REVIEW |
| [I18N-032](#i18n-032) | Normalize locale digits in numeric input to the configured numbering system before submission | 2 | REVIEW | REVIEW |
| [I18N-041](#i18n-041) | Name in place any shortcut that is safe only while a locale cannot reach that screen | 2 | REVIEW | REVIEW |
| [UI-021](#ui-021) | Run impeccable's audit, critique and polish commands on UI changes before calling them done | 2 | REVIEW | REVIEW |
| [UI-022](#ui-022) | Install impeccable only from the pinned companion plugin, without its hooks | 2 | REVIEW | GUARDED |
| [PROC-001](#proc-001) | Declare tracks, tier and modules in a schema-valid manifest that covers every detected stack | 1 | REVIEW | FORCED |
| [PROC-002](#proc-002) | Declare Tier 2 when at least two tier triggers hold, or record why it is declined | 1 | REVIEW | GUARDED |
| [PROC-003](#proc-003) | Install each declared track and module as a complete unit, and leave no substrate of the others | 1 | REVIEW | GUARDED |
| [PROC-004](#proc-004) | Enable the Standard's plugin in the repository's committed .claude/settings.json | 2 | REVIEW | GUARDED |
| [PROC-005](#proc-005) | Record the stack table in the manifest, every concern filled and every named package installed | 1 | REVIEW | GUARDED |
| [PROC-006](#proc-006) | Prefer the installed library's idiomatic API, then its escape hatch, and explain hand-written code | 1 | REVIEW | REVIEW |
| [PROC-007](#proc-007) | Install at most one library per concern, test runners included | 1 | REVIEW | GUARDED |
| [PROC-009](#proc-009) | Land each new runtime dependency with an ADR that names the alternatives considered | 1 | REVIEW | GUARDED |
| [PROC-010](#proc-010) | Keep business rules on the backend, and name and test the source of any deliberate client mirror | 1 | REVIEW | REVIEW |
| [PROC-011](#proc-011) | Keep copied gate files equal to the adopted templates, except inside declared configuration regions | 1 | REVIEW | GUARDED |
| [PROC-012](#proc-012) | Never delete or weaken a gate to get green; fix the code, record a dated exception or a waiver | 1 | REVIEW | REVIEW |
| [PROC-013](#proc-013) | Ask the user before an agent edits gate files, baselines, allowlists or CI workflows | 1 | GUARDED | GUARDED |
| [PROC-014](#proc-014) | Give every allowlist entry a reason and an expiry date, and fail CI once the date has passed | 1 | REVIEW | FORCED |
| [PROC-017](#proc-017) | Trust a gate only after seeing it fail on a minimal violation and pass on clean code | 1 | REVIEW | REVIEW |
| [PROC-018](#proc-018) | Keep every enabled gate with a shipped probe failing on that probe after adopting or upgrading | 1 | REVIEW | GUARDED |
| [PROC-019](#proc-019) | Keep a numbered ADR log in the configured decisions directory in a Tier-2 project | 2 | REVIEW | GUARDED |
| [PROC-020](#proc-020) | Name in each pull request the rule IDs or ADRs its change follows | 2 | REVIEW | GUARDED |
| [PROC-021](#proc-021) | Before claiming done, re-read the diff, run the checks and report their real output verbatim | 1 | REVIEW | REVIEW |
| [PROC-022](#proc-022) | Pass the fast gate before an agent session ends | 1 | GUARDED | GUARDED |
| [PROC-023](#proc-023) | Extract convenience duplication at the third copy, and inline any one-caller abstraction | 2 | REVIEW | REVIEW |
| [PROC-024](#proc-024) | Extract a duplicated business rule at its second copy, including one rendered on two surfaces | 2 | REVIEW | REVIEW |
| [PROC-026](#proc-026) | Ask the user before an agent runs a shell command that skips or weakens a gate | 1 | GUARDED | GUARDED |
| [PROC-028](#proc-028) | Ask in the pull request template for the rule IDs a change follows and the real check output | 2 | REVIEW | GUARDED |
| [PROC-029](#proc-029) | Keep the managed CLAUDE.md block, with any imported AGENTS.md, under 200 lines | 2 | REVIEW | GUARDED |
| [PROC-030](#proc-030) | Report lint errors in a file back to the agent right after it edits the file | 2 | GUARDED | GUARDED |
| [PROC-034](#proc-034) | Never let the jscpd duplication baseline grow | 1 | REVIEW | GUARDED |
| [CI-006](#ci-006) | Regenerate the client API types from the exported contract in CI and fail on any diff | 1 | REVIEW | GUARDED |
| [CI-007](#ci-007) | Pin the backend's published OpenAPI artifact in a standalone client and fail CI on type drift | 1 | REVIEW | GUARDED |
| [CI-008](#ci-008) | Audit production dependencies for known vulnerabilities in every quality job | 1 | REVIEW | GUARDED |
| [CI-009](#ci-009) | Run every member of each track's check script as its own named CI step | 1 | REVIEW | GUARDED |
| [CI-011](#ci-011) | Make every build, deploy or release job depend on the quality job | 1 | REVIEW | GUARDED |
| [CI-012](#ci-012) | Reuse one quality workflow per track instead of copying its steps | 2 | REVIEW | GUARDED |
| [CI-013](#ci-013) | Protect the default branch and require the quality check before merge | 1 | REVIEW | REVIEW |
| [CI-014](#ci-014) | Assign a CODEOWNERS owner to every gate file, allowlist and workflow | 2 | REVIEW | GUARDED |
| [CI-015](#ci-015) | Run the secret scan, formatters and linters on staged files before each commit | 2 | REVIEW | GUARDED |
| [CI-016](#ci-016) | Check in CI that commit messages and pull request titles follow Conventional Commits | 2 | REVIEW | GUARDED |
| [CI-018](#ci-018) | Delay dependency releases, group framework updates without automerge and hold risky majors | 2 | REVIEW | GUARDED |

## SEC-026

**Store attachment ids, never URLs, and serve private files through short-lived signed URLs.**

Columns, requests and responses carry attachment ids, and private files are reached only through signed URLs generated at read time with a short lifetime, which reviewers confirm.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0087](../decisions/0087-file-uploads.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review; stored URLs are migrated to ids when the owning feature is next changed. |

## SEC-061

**Inject production secrets at runtime from the platform, never commit or bake them in.**

Deployments receive secrets from the platform at runtime, and no image, bundle or build artifact contains one, which reviewers confirm.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 6: Secrets and the supply chain are protected |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0085](../decisions/0085-environment-files.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## SEC-062

**Give quality jobs no secrets, so no build or test step can need a runtime secret.**

A workflow check fails when a quality job, its reusable workflow or the workflow-level env references the secrets context or passes secrets: inherit, so builds, tests and the mobile bundle export run without credentials.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-workflows` / `quality-no-secrets` |
| Tier | 1 — invariant 6: Secrets and the supply chain are protected |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.CI-009.qualityJob` (planned) |
| Decision | [ADR 0085](../decisions/0085-environment-files.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/SEC-062/` |
| Adoption | Fix first: move secret-dependent steps out of the quality job into deploy jobs that need them. |

Known evasions:

- a step that fetches a secret at runtime from a cloud store or file
- a build step with a hardcoded fallback for a missing secret

## SEC-063

**Commit no secret: run a pinned secret scanner over every commit range in CI.**

A CI step runs a checksum-verified, pinned gitleaks over the commit range with the project config and pre-commit runs it on staged changes, covering the source files of every track, so no separate per-track credential regex scan ships; violation fixtures use synthetic secret-shaped strings that match no real provider format.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — ci: `secret-scan` |
| Tier | 1 — invariant 6: Secrets and the supply chain are protected |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-063.config` (planned) |
| Decision | [ADR 0084](../decisions/0084-secret-scanning-and-dependency-audits.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/SEC-063/` |
| Adoption | Fix first: findings in history are rotated, then recorded in the scanner's ignore file under code-owner review. |

Known evasions:

- a custom secret format with no matching scanner rule and low entropy
- a secret split or encoded across strings or lines

## SEC-064

**Keep env example files to keys and placeholders, never secret values.**

An example-file check parses every env example file in the declared track roots and fails when a key matching the configured secret-name patterns, \*\_KEY names included, has a value that is neither empty nor an allowed placeholder.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-env-example` / `no-secret-values` |
| Tier | 1 — invariant 6: Secrets and the supply chain are protected |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `trackRoots.<track>` (planned), `rules.SEC-064.keyPatterns` (planned), `rules.SEC-064.placeholderPatterns` (planned) |
| Decision | [ADR 0085](../decisions/0085-environment-files.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/SEC-064/` |
| Adoption | Fix first: blank the values (and rotate any real secret) before adopting. |

Known evasions:

- a secret stored under a key name the patterns miss
- a real value shaped like a placeholder

## SEC-065

**Pin third-party tooling: actions to full commit SHAs, MCP servers and CLI tools to exact versions.**

A token scan of workflow uses: references (40-hex SHA required), .mcp.json and package scripts (exact versions, no @latest) and shell scripts (no clone or download of an unpinned ref) fails on any moving reference that is not allowlisted.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-pins` |
| Tier | 1 — invariant 6: Secrets and the supply chain are protected |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.SEC-065.scanPaths` (planned) |
| Decision | [ADR 0032](../decisions/0032-supply-chain-pinning.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/SEC-065/` |
| Adoption | Allowlist: adopt offers automated SHA pinning of existing tag-pinned actions, and anything left gets a dated allowlist entry rather than a hard failure. |

Known evasions:

- a tool fetched by a script outside the scanned paths
- a pinned tool that downloads unpinned plugins at runtime

## SEC-074

**Ask before the browser companion opens a non-development site, runs a page script or uploads a file.**

On every Chrome DevTools MCP action the PreToolUse hook asks unless the explicit URL opened, or the session's known current page, is http(s) on a local or browserHosts host; back, forward, page scripts, uploads and unknown tools always ask, and every call is denied without an explicit true in the consent record.

| Property | Value |
| --- | --- |
| Enforcement | GUARDED |
| Target enforcement | GUARDED |
| Gate | hook: `PreToolUse` / `mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `hooks.preToolUse.browserHosts` |
| Decision | [ADR 0106](../decisions/0106-companion-plugins.md) |
| Since | 1.0.0 |
| Violation fixture | `test/fixtures/shared/violations/SEC-074/` |
| Adoption | Nothing needed: development hosts beyond the built-in ones go in hooks.preToolUse.browserHosts. |

Known evasions:

- a page reached from an allowed page by a link or redirect, which opens no new page through the tool
- the bypassPermissions mode skips the ask decision
- a browser MCP server under another name than the companion's
- the project opts out or switches the hooks off (the opt-out line, "disabled": true in the manifest, CROSS_STACK_STANDARD_DISABLE, or the plugin disabled in Claude Code settings), or Node.js is missing, so no hook runs

## SEC-075

**Ask before the Figma companion runs any tool that can change a Figma file.**

Every Figma MCP companion tool that is not a known read (anything that can create, edit or upload to a Figma file) makes the PreToolUse hook ask the user first; reads such as get_design_context and get_metadata pass, and every call is denied when the project declined the companion.

| Property | Value |
| --- | --- |
| Enforcement | GUARDED |
| Target enforcement | GUARDED |
| Gate | hook: `PreToolUse` / `mcp__plugin_figma_figma__use_figma` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0106](../decisions/0106-companion-plugins.md) |
| Since | 1.0.0 |
| Violation fixture | `test/fixtures/shared/violations/SEC-075/` |
| Adoption | Nothing needed: reading designs asks nothing. |

Known evasions:

- the bypassPermissions mode skips the ask decision
- a Figma MCP server under another name than the companion's
- the project opts out or switches the hooks off (the opt-out line, "disabled": true in the manifest, CROSS_STACK_STANDARD_DISABLE, or the plugin disabled in Claude Code settings), or Node.js is missing, so no hook runs

## I18N-010

**Have a person write or review translations, never generate them just to satisfy parity.**

Reviewers check new locale values, because the parity gate catches only missing, empty and source-identical values, not machine output or filler committed to make a check pass.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0080](../decisions/0080-locale-parity.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## I18N-032

**Normalize locale digits in numeric input to the configured numbering system before submission.**

Clients convert Arabic-Indic and Extended Arabic-Indic digits typed into numeric fields to the configured numbering system before client validation and submission, and the backend validates the normalized value.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.I18N-032.enabled` (planned), `modules.i18n.numberingSystem` (planned) |
| Decision | [ADR 0096](../decisions/0096-explicit-intl-formatting.md) |
| Since | 1.0.0 |
| Adoption | Opt-in: turned on through rules.I18N-032.enabled once the explicit Intl formatting decision is accepted. |

## I18N-041

**Name in place any shortcut that is safe only while a locale cannot reach that screen.**

Reviewers reject a shortcut that is safe only because a product choice keeps a locale away from a screen, unless a comment where the shortcut lives names that dependency.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `i18n` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0077](../decisions/0077-i18n-module.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## UI-021

**Run impeccable's audit, critique and polish commands on UI changes before calling them done.**

With the design module on, UI changes go through the impeccable companion's audit, critique and polish commands against the project's own design tokens before they are reported done, and its new-work or redesign modes are never run on an existing product.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | `design` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0106](../decisions/0106-companion-plugins.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: applies to new UI work once the companion is installed and the module is on. |

## UI-022

**Install impeccable only from the pinned companion plugin, without its hooks.**

With the design module on, doctor checks that impeccable comes from the Standard's marketplace entry, pinned to a commit and loading its skill and agents without its hooks, that no second copy is installed or copied in beside it, and reports the engine download and the update-check and telemetry switches.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `companion-impeccable` |
| Tier | 2 |
| Module | `design` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0106](../decisions/0106-companion-plugins.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/UI-022/` |
| Adoption | Opt-in: adopt offers the companion and installs it at project scope when the user agrees. |

Known evasions:

- impeccable installed from another marketplace or copied into the skills directory, outside the Standard's marketplace entry
- the engine binary, which the plugin commit does not pin, replaced after its first download
- only the committed settings are checked where impeccable is not installed, such as in CI

## PROC-001

**Declare tracks, tier and modules in a schema-valid manifest that covers every detected stack.**

The project records its tracks, tier, modules and locales in .cross-stack/standard.json, which validates against the published schema and names a track root under trackRoots for every Laravel, web or mobile manifest in the repository.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-standard-config` / `schema` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `trackRoots.<track>` (planned) |
| Decision | [ADR 0023](../decisions/0023-adopter-manifest-and-upgrade.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-001/` |
| Adoption | Nothing needed: adopt writes the manifest with a track root for every detected manifest, so the check passes from the first run. |

## PROC-002

**Declare Tier 2 when at least two tier triggers hold, or record why it is declined.**

When at least two of the declared tier triggers hold (multi-tenant, more than one developer, long-lived; multi-tenant is implied by the tenancy module), the manifest declares tier 2 or references, under decisions, the project decision record that gives the reason for staying at tier 1.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-standard-config` / `tier-triggers` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.PROC-002.triggers` (planned), `decisions.<name>` (planned) |
| Decision | [ADR 0008](../decisions/0008-tiers-and-invariants.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-002/` |
| Adoption | Nothing needed: adopt asks for the triggers and records tier 2, or writes the decision record that declines it and references it from the manifest. |

Known evasions:

- tier triggers declared falsely in the manifest
- a boilerplate decline reason

## PROC-003

**Install each declared track and module as a complete unit, and leave no substrate of the others.**

doctor checks, for every declared track and module, the version's list of required gate files, plumbing, registrations, tests and path-scoped rule files, and reports substrate left behind by a module that is switched off.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `units-complete` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `tracks`, `modules` |
| Decision | [ADR 0010](../decisions/0010-opt-in-modules.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-003/` |
| Adoption | Nothing needed: adopt installs each declared track and module as a unit; doctor reports leftovers of an undeclared module for removal. |

Known evasions:

- a required file present but hollowed out
- a registration present but unreachable at run time

## PROC-004

**Enable the Standard's plugin in the repository's committed .claude/settings.json.**

The committed .claude/settings.json lists the Standard's marketplace in extraKnownMarketplaces and sets the plugin to true in enabledPlugins, so every contributor's session loads the same skills and hooks.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `plugin-enabled` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0015](../decisions/0015-plugin-distribution.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-004/` |
| Adoption | Nothing needed: adopt merges the two entries into an existing .claude/settings.json without touching its other keys. |

Known evasions:

- the committed value is overridden to false in settings.local.json or user settings
- managed settings disable the plugin for the machine

## PROC-005

**Record the stack table in the manifest, every concern filled and every named package installed.**

The manifest's stack section names the installed library for each configured concern, every named package resolves in the track's package.json or composer.json, and a concern marked none states how it is met instead.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-standard-config` / `stack-table` |
| Tier | 1 — invariant 1: Stack-first |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `stack.<concern>.use` (planned), `stack.<concern>.reason` (planned) |
| Decision | [ADR 0006](../decisions/0006-stack-first.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-005/` |
| Adoption | Nothing needed: adopt pre-fills the table from the installed manifests for the team to review. |

Known evasions:

- the table is accurate but new code ignores it
- a concern missing from the configured concern list

## PROC-006

**Prefer the installed library's idiomatic API, then its escape hatch, and explain hand-written code.**

For each concern the installed library's idiomatic API comes first and its documented escape hatch second, hand-written code carries a comment naming what the library could not express, and an outdated version is upgraded instead of worked around.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 1: Stack-first |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0006](../decisions/0006-stack-first.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## PROC-007

**Install at most one library per concern, test runners included.**

Each concern (state, server state, forms, validation, HTTP, dates, styling, unit tests, end-to-end tests) has one installed library unless a declared migration names the winner and the deprecated loser, and the Standard's own gate tooling is exempt.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-competing-deps` |
| Tier | 1 — invariant 1: Stack-first |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `stack.competingGroups`, `stack.<concern>.deprecated` |
| Decision | [ADR 0006](../decisions/0006-stack-first.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-007/` |
| Adoption | Baseline: existing competing pairs are declared as a migration with a winner and a deprecated loser, which PROC-008 then confines, and the Standard's own enforcement tools are pre-exempted. |

Known evasions:

- a library outside the curated concern catalogue
- a vendored copy or a hand-written equivalent of a second library
- a tool run through npx or a global install with no manifest entry

## PROC-009

**Land each new runtime dependency with an ADR that names the alternatives considered.**

Each package added to the production dependencies of a package.json or composer.json, compared with the base branch, is named in a decision record added or changed in the same change, and that record lists the alternatives considered.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-new-deps-adr` |
| Tier | 1 — invariant 1: Stack-first |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.PROC-019.dir` (planned) |
| Decision | [ADR 0006](../decisions/0006-stack-first.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-009/` |
| Adoption | Nothing needed: only dependencies added after adoption are checked, because the check compares with the base branch. |

Known evasions:

- a boilerplate decision record that names no real alternatives
- code vendored into the repository instead of added as a dependency
- runtime code importing a package declared only as a development dependency

## PROC-010

**Keep business rules on the backend, and name and test the source of any deliberate client mirror.**

Business rules live on the server, client validation is user-experience feedback while the server decides validity, and a deliberate client mirror of a rule names its backend source and has a test that compares the two.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 2: Server authority |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0012](../decisions/0012-backend-authority.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## PROC-011

**Keep copied gate files equal to the adopted templates, except inside declared configuration regions.**

doctor hashes each kit-copied gate file, security plumbing included, outside its declared configuration regions and compares the hash and version header with the template manifest of the version recorded in .cross-stack/standard.json, so a locally weakened copy is reported.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `gate-integrity` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `version` |
| Decision | [ADR 0023](../decisions/0023-adopter-manifest-and-upgrade.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-011/` |
| Adoption | Nothing needed: adopt records the adopted version, so only later edits outside the configuration regions are reported. |

Known evasions:

- a weakening made inside a declared configuration region
- an extra project config file the template manifest does not list that overrides a kit setting

## PROC-012

**Never delete or weaken a gate to get green; fix the code, record a dated exception or a waiver.**

A red gate is answered by fixing the code, by a dated allowlist or shrink-only baseline entry, or by a waiver recorded in a decision record, never by deleting the gate, lowering its level or turning its rule off.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0005](../decisions/0005-explicit-exceptions.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## PROC-013

**Ask the user before an agent edits gate files, baselines, allowlists or CI workflows.**

Before an agent edits a gate configuration, baseline, allowlist or CI workflow, or adds the opt-out line, the PreToolUse hook asks the user, and the edit goes ahead only with that approval; shell commands that bypass a gate are PROC-026's.

| Property | Value |
| --- | --- |
| Enforcement | GUARDED |
| Target enforcement | GUARDED |
| Gate | hook: `PreToolUse` / `Edit` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `hooks.preToolUse.protect`, `hooks.preToolUse.protectCommands` |
| Decision | [ADR 0021](../decisions/0021-gate-file-protection.md) |
| Since | 1.0.0 |
| Violation fixture | `test/fixtures/shared/violations/PROC-013/` |
| Adoption | Nothing needed: adopt also writes permissions.ask rules for gate configurations and permissions.deny rules for baselines and allowlists into .claude/settings.json, which hold in every permission mode. |

Known evasions:

- a write through a tool, generated script or indirect command the matcher does not recognise
- the bypassPermissions mode skips the ask decision
- the project opts out or switches the hooks off (the opt-out line, "disabled": true in the manifest, CROSS_STACK_STANDARD_DISABLE, or the plugin disabled in Claude Code settings), or Node.js is missing, so no hook runs

## PROC-014

**Give every allowlist entry a reason and an expiry date, and fail CI once the date has passed.**

Entries in .cross-stack/allowlists/ validate against a schema that requires a non-empty reason and an ISO expiry date no further ahead than allowlistMaxDays, and the check fails once an entry's expiry date has passed.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | FORCED |
| Gate | planned — script: `check-allowlists` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `allowlistsDir`, `allowlistMaxDays` |
| Decision | [ADR 0005](../decisions/0005-explicit-exceptions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-014/` |
| Adoption | Allowlist: adopt writes an entry with a reason and an expiry date inside allowlistMaxDays for each existing exception that a gate without a native baseline reports. |

## PROC-017

**Trust a gate only after seeing it fail on a minimal violation and pass on clean code.**

A gate is trusted only after it has been seen failing on a minimal violation and passing on clean code, and a new or changed gate is shown failing before any change relies on it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0004](../decisions/0004-fail-then-pass.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## PROC-018

**Keep every enabled gate with a shipped probe failing on that probe after adopting or upgrading.**

doctor --probe copies each enabled rule's shipped violation probe, generated from a subset of the rule fixtures, into a scratch copy of the project, runs the rule's gate and requires a failure that names the rule, so a probed gate that was wired wrongly or silently disabled is found.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — ci: `doctor-probe` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0004](../decisions/0004-fail-then-pass.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-018/` |
| Adoption | Nothing needed: the probes run in the upgrade skill and a scheduled workflow, never as a required check on every pull request. |

Known evasions:

- project ignore globs that exclude real code but not the probe location
- the scheduled workflow is disabled or stops running, so probes run only when upgrading

## PROC-019

**Keep a numbered ADR log in the configured decisions directory in a Tier-2 project.**

When the manifest declares tier 2, the configured decisions directory exists and every record in it parses as MADR with a number, a status and a date.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `adr-log` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.PROC-019.dir` (planned) |
| Decision | [ADR 0001](../decisions/0001-record-architecture-decisions.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-019/` |
| Adoption | Nothing needed: adopt creates the decisions directory with a first record when tier 2 is declared. |

Known evasions:

- decisions made without a record
- a record that parses but states no real alternatives

## PROC-020

**Name in each pull request the rule IDs or ADRs its change follows.**

The pull request body cites at least one rule ID that exists in the registry or one decision record of the project, so reviewers can check the change against what it claims to follow.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-pr-cites-rule` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.PROC-020.enabled` (planned) |
| Decision | [ADR 0014](../decisions/0014-working-procedure.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-020/` |
| Adoption | Opt-in: a team turns it on through rules.PROC-020.enabled once its pull request template asks for rule IDs. |

Known evasions:

- citing a rule or decision record unrelated to the change
- a change merged without a pull request

## PROC-021

**Before claiming done, re-read the diff, run the checks and report their real output verbatim.**

Before reporting work as done, the agent re-reads its diff, runs the project's check scripts and pastes their real output verbatim, and never claims that a check it did not run has passed.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0014](../decisions/0014-working-procedure.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## PROC-022

**Pass the fast gate before an agent session ends.**

When an agent finishes a turn, the project's fast check runs within a time budget, and a failure blocks the stop with the failing command and the end of its output.

| Property | Value |
| --- | --- |
| Enforcement | GUARDED |
| Target enforcement | GUARDED |
| Gate | hook: `Stop` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `hooks.stop.enabled`, `hooks.stop.budgetSeconds`, `hooks.stop.command` |
| Decision | [ADR 0020](../decisions/0020-feedback-hooks.md) |
| Since | 1.0.0 |
| Violation fixture | `test/fixtures/shared/violations/PROC-022/` |
| Adoption | Baseline: adopt makes check:fast green through shrink-only baselines and dated allowlist entries before the Stop gate runs, and a project that cannot yet sets hooks.stop.enabled to false. |

Known evasions:

- the stop gate is turned off in the project config or with CROSS_STACK_STANDARD_STOP_GATE=0
- a check that runs past the time budget fails open
- the loop guard lets the next stop through when nothing changed since a blocked one
- a project without a manifest or a check:fast script is skipped
- a script whose tool (npm, Composer or PHP) is not installed is skipped with a notice
- the project opts out or switches the hooks off (the opt-out line, "disabled": true in the manifest, CROSS_STACK_STANDARD_DISABLE, or the plugin disabled in Claude Code settings), or Node.js is missing, so no hook runs

## PROC-023

**Extract convenience duplication at the third copy, and inline any one-caller abstraction.**

Convenience duplication is extracted only at its third copy, and an abstraction with a single caller, an Action included, is treated as a defect to inline.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0013](../decisions/0013-dry-policy.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## PROC-024

**Extract a duplicated business rule at its second copy, including one rendered on two surfaces.**

A duplicated business rule is extracted at its second copy, including a rule rendered on two surfaces such as web and PDF or web and native, so the copies cannot drift.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0013](../decisions/0013-dry-policy.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review. |

## PROC-026

**Ask the user before an agent runs a shell command that skips or weakens a gate.**

Before an agent runs a shell command that skips or weakens a gate, such as --no-verify, git commit -n, a lefthook-disabling variable, an audit or test-runner override, a baseline deleted or regenerated outside its baseline:update script, a write onto a protected file or an appended opt-out line, the user is asked and the command runs only with that approval.

| Property | Value |
| --- | --- |
| Enforcement | GUARDED |
| Target enforcement | GUARDED |
| Gate | hook: `PreToolUse` / `Bash` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `hooks.preToolUse.protectCommands` |
| Decision | [ADR 0021](../decisions/0021-gate-file-protection.md) |
| Since | 1.0.0 |
| Violation fixture | `test/fixtures/shared/violations/PROC-026/` |
| Adoption | Nothing needed: the sanctioned baseline:update scripts, which regenerate a baseline and fail when it grows, are not inspected, so routine baseline maintenance asks nothing. |

Known evasions:

- a command form the patterns do not recognise, such as one built inside a script file or passed through an alias
- the bypassPermissions mode skips the ask decision
- a command run in the developer's own terminal, outside Claude Code
- the project opts out or switches the hooks off (the opt-out line, "disabled": true in the manifest, CROSS_STACK_STANDARD_DISABLE, or the plugin disabled in Claude Code settings), or Node.js is missing, so no hook runs

## PROC-028

**Ask in the pull request template for the rule IDs a change follows and the real check output.**

A doctor check requires the repository's pull request template to hold a section for the rule IDs or ADRs a change follows, a section for pasting the real output of the project's check and a checkbox confirming that the output is real and current.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `pr-template` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0094](../decisions/0094-developer-workflow-templates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-028/` |
| Adoption | Nothing needed: adopt copies the kit template, or merges the sections into an existing pull request template. |

Known evasions:

- the sections are left empty or filled with output no real run produced
- a pull request opened through the API or a CLI without the template body

## PROC-029

**Keep the managed CLAUDE.md block, with any imported AGENTS.md, under 200 lines.**

The block between the cross-stack-standard begin and end markers, together with any AGENTS.md that CLAUDE.md imports, stays under 200 lines, so the always-loaded context stays small and track detail lives in path-scoped rule files.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `context-budget` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0022](../decisions/0022-context-budget.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-029/` |
| Adoption | Nothing needed: adopt merges the block into existing CLAUDE.md and AGENTS.md files; a project whose AGENTS.md is long moves detail into path-scoped rule files. |

Known evasions:

- project text outside the managed block, or in other files that CLAUDE.md imports, is not counted
- CLAUDE.local.md and user-level memory files add always-loaded text the check cannot see

## PROC-030

**Report lint errors in a file back to the agent right after it edits the file.**

After an agent edits or writes a file, the project's installed formatter formats it and file-scoped ESLint runs from the track root within a time budget, and lint errors go back to the agent as file:line rule message lines, so they are fixed while the file is still in context.

| Property | Value |
| --- | --- |
| Enforcement | GUARDED |
| Target enforcement | GUARDED |
| Gate | hook: `PostToolUse` / `Edit` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `hooks.postToolUse.budgetSeconds`, `hooks.postToolUse.phpstan` |
| Decision | [ADR 0020](../decisions/0020-feedback-hooks.md) |
| Since | 1.0.0 |
| Violation fixture | `test/fixtures/shared/violations/PROC-030/` |
| Adoption | Nothing needed: the hook only reports, and a project without a formatter or ESLint installed is skipped. |

Known evasions:

- the hook cannot undo or block the edit, so reported errors remain until the agent fixes them or the Stop gate runs
- a formatter or linter that is not installed is skipped silently
- a linter that crashes or rejects its configuration leaves a notice for the user instead of feedback
- a run past the time budget fails open
- a file changed through a shell command rather than an edit tool is not checked
- PHP files get lint feedback only when hooks.postToolUse.phpstan is true
- the project opts out or switches the hooks off (the opt-out line, "disabled": true in the manifest, CROSS_STACK_STANDARD_DISABLE, or the plugin disabled in Claude Code settings), or Node.js is missing, so no hook runs

## PROC-034

**Never let the jscpd duplication baseline grow.**

The committed jscpd baseline gains no clone compared with the base branch in pull-request CI, every jscpd invocation in the check scripts reads that baseline, and the sanctioned baseline:update script fails on growth, so recorded duplication only shrinks.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-baselines` / `jscpd` |
| Tier | 1 — invariant 8: Gates are never weakened |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0092](../decisions/0092-dead-code-and-duplication-gates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/PROC-034/` |
| Adoption | Baseline: adopt records the existing clones in the committed baseline, which becomes the starting point that can only shrink. |

Known evasions:

- a change pushed without a pull request, where no base-branch comparison runs
- jscpd run outside the checked scripts with another --baseline file

## CI-006

**Regenerate the client API types from the exported contract in CI and fail on any diff.**

With the api-contract module on in a repository holding backend and client, a CI step runs one local command that exports the document with scramble:export --fail-on-unknown, regenerates the committed client types with the configured generator and fails when git diff --exit-code finds a difference.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — ci: `contract-drift` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.api-contract.exportCommand` (planned), `modules.api-contract.openapiPath` (planned), `modules.api-contract.typeGenerator` (planned), `modules.api-contract.webTypesPath` (planned), `modules.api-contract.mobileTypesPath` (planned) |
| Decision | [ADR 0054](../decisions/0054-generated-api-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-006/` |
| Adoption | Nothing needed: the first generated types are committed at adoption, before the step is enabled. |

Known evasions:

- an if: condition skips the drift step
- continue-on-error: true on the drift step

## CI-007

**Pin the backend's published OpenAPI artifact in a standalone client and fail CI on type drift.**

With the api-contract module on in a client-only repository, a CI step runs one local command that fetches the pinned version of the backend's published document, regenerates the committed types and fails on git diff --exit-code.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — ci: `contract-drift-artifact` |
| Tier | 1 — invariant 5: One generated wire contract, when the api-contract module is on |
| Module | `api-contract` |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `modules.api-contract.artifact` (planned), `modules.api-contract.webTypesPath` (planned), `modules.api-contract.mobileTypesPath` (planned) |
| Decision | [ADR 0054](../decisions/0054-generated-api-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-007/` |
| Adoption | Nothing needed: the pin starts at the backend's currently published version and the regenerated types are committed at adoption. |

Known evasions:

- a pin left on a stale artifact version passes until someone moves it
- an artifact published without the backend's own export check

## CI-008

**Audit production dependencies for known vulnerabilities in every quality job.**

A workflow check requires each declared track's quality job to run a blocking production-only audit at high severity (composer audit --locked --no-dev, npm audit --omit=dev --audit-level=high or the lockfile's equivalent) without continue-on-error, in CI only because audits need the network.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-workflows` / `quality-audit` |
| Tier | 1 — invariant 6: Secrets and the supply chain are protected |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.CI-009.qualityJob` (planned) |
| Decision | [ADR 0084](../decisions/0084-secret-scanning-and-dependency-audits.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-008/` |
| Adoption | Allowlist: a finding that cannot be fixed yet becomes a dated, reasoned exception, never a lowered threshold. |

Known evasions:

- the threshold lowered through package-manager configuration the check does not read, such as an audit level in .npmrc
- a finding silenced through the package manager's own ignore settings instead of a dated exception

## CI-009

**Run every member of each track's check script as its own named CI step.**

A CI-parity sub-check splits each track's check script into its members and requires a quality-job step running each one without continue-on-error, or a call to the Standard's reusable track workflow, so local and CI runs stay identical and a failure names its member.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-ci-parity` / `steps` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.CI-009.qualityJob` (planned) |
| Decision | [ADR 0090](../decisions/0090-ci-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-009/` |
| Adoption | Nothing needed: adopt replaces hand-listed quality steps with a thin caller of the reusable track workflow. |

Known evasions:

- a step runs a different command under a member's name
- an if: condition skips a member's step

## CI-011

**Make every build, deploy or release job depend on the quality job.**

A workflow check requires every job whose name matches the build, deploy or release pattern to reach the quality job through needs:, or to run only on a successful workflow_run of the quality workflow, so nothing ships without a green quality run.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-workflows` / `deploy-needs-quality` |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.CI-011.deployJobPattern` (planned), `rules.CI-009.qualityJob` (planned) |
| Decision | [ADR 0090](../decisions/0090-ci-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-011/` |
| Adoption | Fix first: existing build, deploy and release jobs gain needs: on the quality job; deployment itself stays out of scope. |

Known evasions:

- a deployment triggered outside the repository's workflows, such as a hosting platform's git integration
- a deploy job named outside the configured pattern

## CI-012

**Reuse one quality workflow per track instead of copying its steps.**

A workflow check fails when a track's check-member step sequence is defined in more than one job instead of being called through workflow_call, so a fix to the quality job cannot miss a copy.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `check-workflows` / `single-quality-definition` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `rules.CI-009.qualityJob` (planned) |
| Decision | [ADR 0090](../decisions/0090-ci-contract.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-012/` |
| Adoption | Nothing needed: adopt replaces copied quality jobs with thin callers of the reusable track workflow. |

Known evasions:

- a copied job edited so its step list no longer matches the reusable workflow

## CI-013

**Protect the default branch and require the quality check before merge.**

The default branch requires a pull request, lists the reusable workflow's quality check as a required status check and blocks force pushes and deletion; this is a repository setting, so reviewers confirm it.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | REVIEW |
| Gate | none (code review) |
| Tier | 1 — invariant 7: The project is declared and green |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0090](../decisions/0090-ci-contract.md) |
| Since | 1.0.0 |
| Adoption | Nothing needed: checked in review; a repository setting the organization applies. |

## CI-014

**Assign a CODEOWNERS owner to every gate file, allowlist and workflow.**

A doctor check parses CODEOWNERS and requires every protected-path glob, the built-in list plus hooks.preToolUse.protect, to match an owned entry, so gate changes have a human reviewer behind the gate-file guard.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `codeowners` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | `hooks.preToolUse.protect` |
| Decision | [ADR 0094](../decisions/0094-developer-workflow-templates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-014/` |
| Adoption | Nothing needed: adopt generates CODEOWNERS entries from the protected-path list and merges them into an existing file. |

Known evasions:

- the code owner is the author of the change
- no branch rule or ruleset requires code-owner review, so ownership never blocks a merge

## CI-015

**Run the secret scan, formatters and linters on staged files before each commit.**

A doctor check parses the lefthook configuration and requires pre-commit jobs on staged files for the pinned gitleaks scan and for each declared track's formatter and linter, with the hooks installed and core.hooksPath unset.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `pre-commit` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0094](../decisions/0094-developer-workflow-templates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-015/` |
| Adoption | Nothing needed: adopt migrates an existing husky or core.hooksPath setup into lefthook and never leaves two hook managers installed. |

Known evasions:

- --no-verify or LEFTHOOK=0 skips the hooks
- a clone where npm install never ran has no hooks installed
- a lefthook-local override removes a job

## CI-016

**Check in CI that commit messages and pull request titles follow Conventional Commits.**

A CI step runs commitlint with the conventional config over the pull request's commit range and its title, which the workflow reads through env: rather than interpolating it into the script.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — ci: `commitlint` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | no (opt-in) |
| Configurable | `rules.CI-016.enabled` (planned) |
| Decision | [ADR 0094](../decisions/0094-developer-workflow-templates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-016/` |
| Adoption | Opt-in: only pull requests opened after it is turned on through rules.CI-016.enabled are linted; earlier history is left as it is. |

Known evasions:

- the squash commit message edited in the merge dialog after the check ran
- a direct push to a branch that requires no pull request

## CI-018

**Delay dependency releases, group framework updates without automerge and hold risky majors.**

A doctor check reads the Renovate or Dependabot configuration and requires a release-age delay, a group for next, laravel/framework and expo without automerge, holds on the TypeScript, ESLint and mobile Jest majors and, on the mobile track, SDK-locked packages kept out of regular updates.

| Property | Value |
| --- | --- |
| Enforcement | REVIEW |
| Target enforcement | GUARDED |
| Gate | planned — script: `doctor` / `dependency-updates` |
| Tier | 2 |
| Module | core |
| Profiles | n/a |
| Enabled by default | yes |
| Configurable | — |
| Decision | [ADR 0095](../decisions/0095-adopter-dependency-updates.md) |
| Since | 1.0.0 |
| Violation fixture | planned — `test/fixtures/shared/violations/CI-018/` |
| Adoption | Nothing needed: adopt writes the Renovate template, or checks an existing Dependabot configuration for the same delay, groups and holds. |

Known evasions:

- the update bot is not installed, or its pull requests are ignored
- a person bumps a held package by hand
