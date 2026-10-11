# Roadmap

Where the Cross-Stack Standard is, and what comes next. Plans change; the
[changelog](CHANGELOG.md) records what actually shipped, and every release lists the rule IDs it
promoted.

## Where we are: 0.1.0

0.1.0 ships the foundation:

- the Claude Code plugin and its marketplace, with six hook events across the core gates and
  companion integrations;
- the core `cross-stack-standard` skill and the `adopt`, `upgrade`, `new-project`, `audit` and
  `doctor` skills;
- a provider-neutral Agent Skill in `skills/cross-stack-standard/`, installable in Gemini CLI, Codex and
  other hosts that support Agent Skills; the package includes its rule index and track references;
- the kit templates, the project manifest and its published schema, and the project tool with its
  manifest and allowlist checks;
- the full rule registry, 385 rules each backed by a decision record, and the generated
  [rule catalog](docs/rules/README.md);
- the documentation.

**Six rules are GUARDED and 379 are REVIEW in 0.1.0.** 321 REVIEW rules target a future gate; 58
stay code-review rules by design. The portable Agent Skill provides guidance in compatible hosts;
the automatic hooks and management workflows are Claude Code-specific. A rule is promoted only in
the release that ships its gate together with a clean fixture that passes and a violation fixture
that fails in CI
([ADR 0004](docs/decisions/0004-fail-then-pass.md)).

## The road to 1.0

Gates land track by track, in this order. Each stage ships as one or more 0.x minor releases;
version numbers are assigned at release time.

| Stage | Track                      | Gates that land                                                                                                                                                                                                                                                                                                                                                      | Rules to promote for 1.0                                           |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1     | Laravel                    | The Laravel harness (Laravel 13, PHP 8.4, Pest 5); Pest presets and architecture tests; custom PHPStan rules; framework-reflection meta-tests (resolved middleware, route-to-policy); the Larastan baseline and ratchet; the `api-contract` renderer and OpenAPI export; the `tenancy` module and its isolation suites                                               | 129                                                                |
| 2     | Web                        | The web harness; the shared ESLint config and the `cross-stack` ESLint plugin; dependency-cruiser and Vitest architecture tests; the typed env module and query-key rules; knip, jscpd, Prettier and coverage checks; the `bff-auth` module (same-origin checks, cookie contract, BFF URL builder); client-side contract generation; the Playwright and axe template | 72 web, plus the web side of 38 shared web and mobile rules        |
| 3     | Mobile                     | The mobile harness; the Expo ESLint configuration; storage and structure rules; the locale parity checker with plural categories (verified on the Hermes engine); the RTL contract and error kinds; the Expo SDK 58 decision                                                                                                                                         | 45 mobile, plus the mobile side of the shared web and mobile rules |
| 4     | Shared, security, workflow | gitleaks and dependency audits; lefthook, commitlint and pull request templates for adopters; the Renovate template (with Dependabot documented); reusable CI workflows per track; `doctor` checks; promotion of the hook rules (PROC-013, PROC-022, PROC-026, PROC-030) once a hook harness runs them                                                               | 34                                                                 |

Seven more rules with a gated target belong to the `observability` module and the `react-spa`
profile and are planned after 1.0.

**Before 1.0, a 0.x minor release can fail a build that passed before.** Promoting a default-on
rule from REVIEW is exactly that kind of change. The release notes name every promoted rule and
how existing projects adopt it (a baseline, dated allowlist entries or an opt-in switch), and
`/cross-stack-standard:upgrade` brings the new gate files in for review
([Upgrading](docs/upgrading.md)).

## Release gate for 1.0

1.0.0 ships only when every item below holds; until then releases stay 0.x.

| Item                                                                                                                   | Status in 0.1.0                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `claude plugin validate --strict` passes for the marketplace and the plugin                                            | Workflow is configured; local strict validation passes. Remote CI has not run yet                        |
| CI is green on `dev`: lint, hook tests, registry check, fixture matrix, generated docs, version drift, integrity       | Single required `ci-ok` workflow is configured; a green `dev` run is pending the GitHub bootstrap        |
| Every FORCED or GUARDED rule has a gate, a passing clean fixture and a failing violation fixture                       | Open: 0 of 318 rules targeted for 1.0 promoted; the Laravel, web and mobile harnesses are not built yet  |
| Every default-on rule is at its target level (`node scripts/check-registry.mjs --release`)                             | Open                                                                                                     |
| Nothing third-party is fetched at a moving ref; every tool, action and MCP server is pinned                            | In place by policy ([ADR 0032](docs/decisions/0032-supply-chain-pinning.md)); re-checked at each release |
| Hooks are tested on Linux, macOS and Windows, and fail open when `node` is missing                                     | CI matrix is configured; remote runs and the manual missing-`node` confirmation are still pending        |
| The always-on context cost is measured and published; `SKILL.md` stays under 500 lines and the managed block under 200 | Open: measured at release ([release guide](docs/maintainers/release.md#context-budget))                  |
| `adopt` works end to end on freshly generated Laravel, Next.js and Expo apps                                           | Open: the smoke workflow is not built yet                                                                |
| `upgrade` is demonstrated from an earlier kit snapshot to the current version                                          | Open                                                                                                     |
| At least three evaluation scenarios per track, with the rule IDs each should cite                                      | Open                                                                                                     |
| A minimum supported Claude Code version is tested and stated                                                           | Open                                                                                                     |
| Documentation is complete and accurate                                                                                 | In place for 0.1.0; updated with every stage                                                             |

## After 1.0

Each item has a decision record. The React profile is accepted for a 1.x minor release; the others
are proposed and not yet scheduled.

| Item                                                                                                 | Decision                                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| React single-page profile (`react-spa`, Vite), opt-in                                                | [0075](docs/decisions/0075-react-spa-profile-after-1-0.md)   |
| Explicit Intl formatting, including Hijri calendars and numbering systems, with one shared formatter | [0096](docs/decisions/0096-explicit-intl-formatting.md)      |
| Translatable content storage: per-locale columns or JSON translations, never mixed                   | [0097](docs/decisions/0097-translatable-content-storage.md)  |
| Migration safety: expand and contract, destructive operations allowlisted                            | [0098](docs/decisions/0098-migration-safety.md)              |
| `observability` module: error tracking across stacks with request ids and personal-data scrubbing    | [0099](docs/decisions/0099-observability-module.md)          |
| Static application security testing template: Semgrep, with CodeQL as a JavaScript option            | [0100](docs/decisions/0100-sast-template.md)                 |
| Mobile on-device flows with Maestro, including a right-to-left flow                                  | [0101](docs/decisions/0101-maestro-on-device-flows.md)       |
| Web performance budgets with Lighthouse CI and size-limit                                            | [0102](docs/decisions/0102-web-performance-budgets.md)       |
| Mutation testing of domain logic with Pest                                                           | [0103](docs/decisions/0103-mutation-testing.md)              |
| Organization rollout: rulesets as code and an adoption dashboard across a GitHub organization        | [0104](docs/decisions/0104-org-rollout-tooling.md)           |
| Evaluations of Deptrac, the React Compiler and eslint-plugin-boundaries                              | [0105](docs/decisions/0105-architecture-tool-evaluations.md) |

Also under consideration after 1.0: publishing the gate packages to npm and Packagist, so adopters
can update them through their dependency updater, and revisiting an early-access channel if
adopters ask for one ([ADR 0026](docs/decisions/0026-no-early-access-channel.md)).

## Influencing the roadmap

Open an issue: a [bug report](https://github.com/o6b7/cross-stack-standard/issues/new/choose), a
feature request, a false-positive report or a rule proposal. Rule proposals follow the process in
[GOVERNANCE.md](GOVERNANCE.md).
