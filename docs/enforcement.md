# How enforcement works

The Standard starts from one principle: instructions alone never stop a violation, and a failing
build does.
This page explains how a rule becomes a gate, what runs where, what is actually enforced in 0.1.0,
and how exceptions work without weakening anything.

## Honesty labels

Every rule in [`registry/rules.json`](../registry/rules.json) carries one label
([ADR 0002](decisions/0002-gates-over-guidelines.md)):

| Label       | Guarantee                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| **FORCED**  | A gate fails the build on every violation, and there is no known way around it.                                     |
| **GUARDED** | A gate fails the build on the direct form of the violation; the rule's `evasions` list names the known ways around. |
| **REVIEW**  | No gate. The active agent follows the rule through the skill, and code review (or Claude Code's `audit`) checks it. |

A rule also names its **target**: the label it reaches once its gate ships. A rule whose target is
REVIEW stays a code-review rule, because no tool can check it reliably (for example PROC-021:
report the real output of the checks you ran).

A label is a claim that has to be proven. A rule is FORCED or GUARDED only when:

1. its gate exists, and `node scripts/check-registry.mjs` finds it (the ESLint rule is registered,
   the Pest test name is discovered, the PHPStan rule is loaded, the script check is in the track's
   `check` chain, and so on);
2. a clean fixture passes that gate and a minimal violation fixture fails it, with the rule's ID in
   the output, in the CI fixture matrix ([ADR 0004](decisions/0004-fail-then-pass.md)).

Everything else is REVIEW, whatever its target. The same law applies to adopters: trust a gate only
after you have seen it fail on a minimal violation (PROC-017).

## What is enforced in 0.1.0

| Layer             | In 0.1.0                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry rules    | 6 are GUARDED (four core hook rules plus two companion-consent rules) and 379 are REVIEW. Targets: 100 FORCED, 227 GUARDED, 58 stay REVIEW.                                                                |
| Claude Code hooks | Run: session detection, per-edit formatting and lint feedback, the Stop fast gate, gate-file protection and companion checks. The four core hook rules and two companion-consent rules are GUARDED.        |
| Project tool      | `check-standard-config` and `check-allowlists` validate the manifest and the allowlists; their rules (PROC-001, PROC-014) have fixtures and stay REVIEW until a shipped track `check` chain runs the tool. |
| Skills            | The core skill scopes the rules to your tracks, tier and modules and cites them by ID; `audit` reports the project against them.                                                                           |
| Track gates       | Not shipped. They land track by track in 0.x releases ([roadmap](../ROADMAP.md)).                                                                                                                          |

So in 0.1.0 most rules are guidance with a clear path to enforcement. What makes that guidance useful
is that it is specific (one property per rule), scoped (only your tracks, tier and modules apply),
cited by ID, and backed by a decision record for each rule.

## How a rule becomes a gate

Rules enter the registry as REVIEW with a target. The pull request that ships a rule's gate also
ships its clean and violation fixtures and flips the label; CI proves the flip. Until then CI stays
green and the label stays honest. At release time the notes list every promoted rule.

Gate kinds used by the registry:

| Kind        | Tool                                                                              | Tracks      |
| ----------- | --------------------------------------------------------------------------------- | ----------- |
| `pest`      | Pest tests: architecture presets, expectations and framework-reflection tests     | Laravel     |
| `phpstan`   | Custom PHPStan rules loaded with Larastan                                         | Laravel     |
| `eslint`    | ESLint rules, including the Standard's own `cross-stack` plugin                   | Web, mobile |
| `depcruise` | dependency-cruiser import rules                                                   | Web, mobile |
| `vitest`    | Vitest architecture and contract tests                                            | Web         |
| `jest`      | Jest tests for the mobile API client                                              | Mobile      |
| `script`    | Checks in the project tool or a vendored gate package, run by the track's `check` | All         |
| `ci`        | A step in the Standard's reusable CI workflow                                     | All         |
| `hook`      | A Claude Code hook of this plugin                                                 | All         |

## Where gates run

| Stage                         | What runs                                               | Blocks?                                                  |
| ----------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| After each edit (PostToolUse) | Formatter and file-scoped ESLint on the edited file     | No: lint errors are fed back to Claude to fix right away |
| End of each turn (Stop)       | The project's `check:fast` script, within a time budget | Yes: Claude keeps working until it passes                |
| Before each commit            | Staged-file checks through lefthook (template planned)  | Yes, unless someone bypasses the Git hooks               |
| Pull request (CI)             | The full `check` chain and the reusable workflow        | Yes: this is the authoritative gate                      |

The hooks give fast feedback inside a session; CI decides. A hook can be switched off or bypassed;
a required CI check cannot, which is why every gated rule also runs in CI.

## The hooks

Every hook runs one Node.js entry point in exec form (`node` with arguments, no shell, on every
platform). Its first step is the opt-out check; an opted-out project gets exit 0, no output and no
child process ([ADR 0019](decisions/0019-hook-runtime-contract.md)). The hooks make no network
calls, resolve tools only from the project (`node_modules`, `vendor/bin`, never `npx` or a
download), enforce their own time budgets and fail open: a hook that breaks never blocks a session.

| Hook                   | What it does                                                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SessionStart**       | Reads `.cross-stack/standard.json`, or detects tracks with a bounded walk (depth 4, build and dependency folders skipped), and adds a few factual lines: tracks, tier or "tier not declared: ask", and the adopt hint when there is no manifest ([ADR 0018](decisions/0018-project-detection.md)). |
| **PostToolUse**        | After `Edit`, `Write` or `NotebookEdit`: runs the installed formatter (Prettier, Pint) on the file, then file-scoped ESLint from the track root, and reports errors as `file:line rule message`. PHPStan per file is opt-in ([ADR 0020](decisions/0020-feedback-hooks.md)).                        |
| **Stop**               | Runs the `check:fast` script (Composer and npm, whichever exist) with `CI=1`, within a 90-second default budget. A failure blocks the stop and shows the failing command and the end of its output. It skips when nothing changed since the last green run, and honours Claude Code's loop guard.  |
| **PreToolUse**         | Asks you before Claude edits a protected file or runs a shell command that skips or weakens a gate ([below](#gate-file-protection)); gates the companion plugins' browser and Figma tools and refuses a declined companion ([ADR 0106](decisions/0106-companion-plugins.md)).                      |
| **PostToolUseFailure** | After a companion MCP tool call fails: records the companion as unhealthy and gives Claude the failure and the fallback to offer instead of a result ([ADR 0106](decisions/0106-companion-plugins.md)). A successful call is recorded by PostToolUse.                                              |
| **UserPromptSubmit**   | In plan mode, adds a reminder that pauses the caveman companion for the turn.                                                                                                                                                                                                                      |

The hook rules are PROC-013 and PROC-026 (protection), PROC-022 (Stop), PROC-030 (PostToolUse),
and SEC-074 and SEC-075 (the companion gates). All six are GUARDED in 0.1.0. Besides the hooks' own tests on Linux, macOS and Windows, the
fixture matrix runs each hook's real entry point on a clean project (it stays silent) and on a
minimal violation (PreToolUse answers `ask`, Stop and PostToolUse exit 2). They are GUARDED, not
FORCED, because each has documented ways around it: the `bypassPermissions` mode, a command form
the patterns do not recognise, time budgets that fail open, and the opt-out.

### Hook settings

Settings live under `hooks` in `.cross-stack/standard.json`, and an environment variable overrides
each one. The ones you are most likely to change:

| Setting                     | Default      | Environment override                          |
| --------------------------- | ------------ | --------------------------------------------- |
| `hooks.stop.enabled`        | `true`       | `CROSS_STACK_STANDARD_STOP_GATE`              |
| `hooks.stop.budgetSeconds`  | `90`         | `CROSS_STACK_STANDARD_STOP_BUDGET_SECONDS`    |
| `hooks.stop.command`        | `check:fast` | `CROSS_STACK_STANDARD_STOP_COMMAND`           |
| `hooks.postToolUse.phpstan` | `false`      | `CROSS_STACK_STANDARD_POST_TOOL_USE_PHPSTAN`  |
| `hooks.preToolUse.protect`  | none         | none: extra project-relative globs to protect |

```json
{
  "hooks": {
    "stop": { "budgetSeconds": 120 },
    "postToolUse": { "phpstan": true },
    "preToolUse": { "protect": ["config/security.php"] }
  }
}
```

`CROSS_STACK_STANDARD_DISABLE=1` turns every hook off. The full list, with value ranges and the
debug switch, is in [Configuration](configuration.md#hook-settings).

## Gate-file protection

A red build can be turned green without fixing anything: lower an analysis level, regenerate a
baseline, delete an architecture test, commit with `--no-verify`, or opt the project out. The
Standard defends against that in layers ([ADR 0021](decisions/0021-gate-file-protection.md)):

1. **The PreToolUse hook** asks you, with the reason, before Claude edits a protected path:
   analyser and linter configurations and their baselines (PHPStan, ESLint and its bulk
   suppressions, dependency-cruiser, Prettier, Pint, knip, jscpd), architecture tests, test-runner
   configuration and coverage thresholds, the `scripts` of `package.json` and `composer.json`,
   `.cross-stack/**`, `.github/workflows/**`, CODEOWNERS, lefthook, commitlint, update-bot and
   secret-scanner configuration, and `.claude/settings.json`. On `Bash` and `PowerShell` it asks
   before `--no-verify`, `git commit -n`, variables that disable lefthook, secret-scanner overrides,
   audit and test-runner overrides, baseline deletion or regeneration, and writes onto a protected
   path. Adding the opt-out line or `"disabled": true` is protected too. The sanctioned
   `baseline:update` scripts, which fail when a baseline grows, are not inspected.
2. **Permission rules** that `adopt` merges into `.claude/settings.json`: `ask` for gate
   configurations and the manifest, `deny` for baselines, which change only through their
   sanctioned scripts. Claude Code applies these in every permission mode. Allowlists and workflows
   rely on the hook and on CODEOWNERS.
3. **CODEOWNERS and branch rulesets**, which catch whatever reaches a pull request.

It is GUARDED, not FORCED, and says so: a hook's `ask` does not hold in bypass-permissions mode,
shell inspection is pattern matching, a person can approve the prompt, edits outside Claude Code are
not seen, and the hooks do not run when `node` is missing. Each of these is listed in the rules'
evasions.

## Exceptions

Exceptions are explicit and visible; none of them weakens a gate
([ADR 0005](decisions/0005-explicit-exceptions.md)):

| Mechanism          | Form                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Allowlist entry    | `.cross-stack/allowlists/<RULE-ID>.json`: `match`, `reason`, `owner`, `expires`; fails the day after it expires (PROC-014)               |
| Baseline           | The tool's own baseline (PHPStan, ESLint bulk suppressions, dependency-cruiser known violations, jscpd), shrink-only                     |
| Inline, JavaScript | `// eslint-disable-next-line <rule> -- <reason>`: one line, named rules, a reason; unused directives fail (PROC-016, PROC-025, PROC-031) |
| Inline, PHP        | `@phpstan-ignore <identifier> (<reason>)`: an identifier and a reason (BE-098)                                                           |

The one thing never allowed is deleting or weakening a gate to get a green build (PROC-012). Fix
the code, or record a dated exception with a reason.

## Scope: tracks, tier and modules

A rule applies to a project only when its track, tier and module apply
([ADR 0009](decisions/0009-tracks-profiles-and-scope.md)):

- **Track scope.** `laravel`, `web` and `mobile` rules apply to projects with that track; `client`
  rules apply to web and mobile; `shared` rules apply to every project.
- **Tier.** Tier 1 rules (127) apply to every adopting project; Tier 2 rules (256) apply once the
  project declares Tier 2 ([ADR 0008](decisions/0008-tiers-and-invariants.md)).
- **Modules.** A module's rules apply while the module is on. A few rules cover an optional part
  of their module or track and have their own switch, named in the rule's `configurable` field.
- **Profiles.** Next.js-only rules carry the `next` profile and are off for other profiles.
