# Fixture harness

Every FORCED or GUARDED rule obeys the fail-then-pass law: its gate passes on a clean fixture
and fails, printing the rule id, on the rule's violation fixture. `scripts/run-fixtures.mjs`
proves it for every rule in `registry/rules.json` and writes `fixture-report.json`, which
`scripts/check-registry.mjs` reads.

This directory holds the **hosts**: minimal projects that a fixture is copied onto before the
gate runs. Fixtures live in `test/fixtures/`.

```text
test/harness/<host>/host.json        how to copy, prepare and run gates in this host
test/harness/<host>/...              the host project (manifests, lockfiles, config)
test/fixtures/<track>/clean/         the clean state of a track (fixture.json required)
test/fixtures/<track>/clean-overlays/<RULE-ID>/   optional rule-specific clean additions
test/fixtures/<track>/violations/<RULE-ID>/       the violation (fixture.json required)
```

`<track>` is the rule's `track` in the registry: `laravel`, `web`, `mobile`, `client` (web and
mobile) or `shared`.

## Running

```sh
node scripts/run-fixtures.mjs                     # the whole matrix
node scripts/run-fixtures.mjs --rule PROC-014     # one rule (repeatable, comma-separated)
node scripts/run-fixtures.mjs --track laravel     # one track
node scripts/run-fixtures.mjs --host repo         # one host
node scripts/run-fixtures.mjs --list              # what would run, without running it
node scripts/run-fixtures.mjs --rule PROC-014 --keep-temp --verbose  # keep work directories
```

Exit codes: `0` every run passed; `1` a run failed or an enforced rule has no violation
fixture; `2` usage or internal error. `--json` prints the report instead of text. `--help`
lists every option.

The runner selects rules from the registry, never from folder listings: every rule whose
`enforcement` or `targetEnforcement` is FORCED or GUARDED and that has a violation fixture. A
FORCED or GUARDED rule without a violation fixture fails the run; a rule that only _targets_
enforcement and has no fixture yet is reported as skipped.

## How one run works

For each selected rule and each host its violation fixture lists, the runner builds two work
directories under a fresh temporary directory:

| Run       | Layers (in order)                                          | Must                       |
| --------- | ---------------------------------------------------------- | -------------------------- |
| clean     | host, `clean/`, `clean-overlays/<ID>/` (if present)        | exit 0                     |
| violation | host, `clean/`, `clean-overlays/<ID>/`, `violations/<ID>/` | fail and print the rule id |

The two runs differ by exactly the violation layer, so the violation is what makes the gate
fail. Building a work directory:

1. Copy the host: included hosts into their subdirectories, then the host's own files
   (`host.json` is never copied). Directories listed in `copy.hardlink` are hard-linked.
2. Apply each layer in order: its files, then `rename`, `remove` and `manifestOverlay`.
3. Git hosts: `git init`, commit everything as `chore: initial fixture state`; then commit
   every layer's `base/` directory, then every layer's `head/` directory (when declared).
4. Run the `prepare` commands of included hosts (in their subdirectories), then of the host.
5. Run the gate command for the rule's `gate.kind`.

A clean run passes when the gate exits 0, prints no rule id at all (a warning or an advisory
finding is not clean) and, when the violation fixture sets `expect.idPattern`, does not match it.

A violation run passes when all of these hold:

- the gate exits non-zero (and with one of `failExitCodes` when the host sets them, which
  separates "violation found" from "tool crashed");
- the output contains the rule id with a hyphen or an underscore (`PROC-014` or `PROC_014`;
  test runners turn test names into identifiers such as `__pest_evaluable_<PREFIX>_<NNN>_…`),
  and the clean run did not print it: an id both runs print (a banner, a passing test's title)
  proves nothing;
- or, instead of the rule id, the output matches `expect.idPattern`, and the matched text names
  the gate id (and the sub-check, when the gate has a discriminator);
- the output contains no other rule id unless the fixture lists it in `alsoFires`;
- when the host's gate declares a `junit` report, the test named after the gate id ran and
  failed (and in the clean run it ran and passed).

Output is judged after escape sequences are stripped and machine paths are replaced (`<workdir>`,
`<tmp>`, `<root>`, `~`). Rule ids are then searched only outside path-like tokens (anything with
a `/`, Windows paths, and any token containing a fixture file or directory name that itself
contains a rule id), so a path can never count as a printed id. Exit codes decide pass or fail;
text is only searched for ids.

Every result records `inputs`, a fingerprint of the rule's registry entry, its fixture
directories and the host definition; `check-registry --fixture-report` recomputes it, so a report
from before a change to any of them is rejected as stale.

## fixture.json

Schema: [`schemas/fixture.schema.json`](../../schemas/fixture.schema.json). Every other file in
a fixture directory is copied onto the work directory at the same relative path.

| Field              | Meaning                                                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosts`            | Required. Hosts the fixture runs on. `clean/` must list every host its rules use.                                                                                                                                                                                      |
| `description`      | Reviewer note: why this violates or satisfies the rule.                                                                                                                                                                                                                |
| `manifestOverlay`  | JSON Merge Patch (RFC 7396) applied to `.cross-stack/standard.json` (created if missing). Use it for modules, profiles, locales and config values. `null` deletes a key.                                                                                               |
| `base`, `head`     | Directories inside the fixture committed as the base and head commits (git hosts only). The gate receives their SHAs through `{base}` and `{head}`.                                                                                                                    |
| `commitMessages`   | `{ "base": "...", "head": "..." }` for those commits (commit-range gates).                                                                                                                                                                                             |
| `remove`           | Work-directory paths deleted after the layer is applied, for rules whose violation is a missing file. Removing a path that does not exist is an error (a stale fixture).                                                                                               |
| `rename`           | Fixture path to work-directory path, for names that cannot be committed as-is (`.env`, `vendor/`, `node_modules/`).                                                                                                                                                    |
| `alsoFires`        | Violation only. Other rule ids this violation is expected to trigger.                                                                                                                                                                                                  |
| `expect.idPattern` | Violation only. Regular expression the output must match instead of the rule id, for tools that print only their own rule name. It must name the gate id (the matched text must contain it), must not match an empty output and must not match the clean run's output. |

Keep fixtures minimal: only the files the gate needs. Put rule-specific context that both runs
need (a module switched on, a config file the gate reads) in `clean-overlays/<ID>/`, so the
violation directory holds only the violation itself. A `clean-overlays/<ID>/fixture.json` is
optional and, when present, must list the rule's hosts.

Add a `$schema` for editor support: `"$schema": "../../../../../schemas/fixture.schema.json"`
in a violation or clean-overlay fixture, `"../../../../schemas/fixture.schema.json"` in
`clean/`.

## host.json

| Field            | Meaning                                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | Required. Equals the directory name.                                                                                                                                                                             |
| `description`    | Required. One line.                                                                                                                                                                                              |
| `git`            | `true` makes every work directory a scratch git repository (see step 3 above).                                                                                                                                   |
| `include`        | `[{ "host": "<name>", "into": "<dir>" }]`: copy another host into a subdirectory (with its own copy rules, setup and prepare).                                                                                   |
| `setup`          | Argv arrays run **once per runner invocation**, in the host directory, before the host's first run: install dependencies here. Keep them idempotent and offline-friendly.                                        |
| `setupTimeoutMs` | Timeout of each setup command (default 600000).                                                                                                                                                                  |
| `prepare`        | Argv arrays run in **every work directory** after the layers and commits, before the gate (for example `composer dump-autoload`).                                                                                |
| `copy.hardlink`  | Directories hard-linked into each work directory (`node_modules`, `vendor`). A missing directory is an error: run the setup first.                                                                               |
| `copy.detach`    | Paths inside a hard-linked directory that are copied instead (files a tool rewrites in place).                                                                                                                   |
| `copy.exclude`   | Patterns not copied. Without `/` a pattern matches a name at any depth; with `/` it matches the full relative path; `*` matches within one segment.                                                              |
| `vars`           | Named templates, used as `{name}`. They may use the built-in placeholders. `--var name=value` overrides one for a run (use an absolute path).                                                                    |
| `env`            | Environment templates for setup, prepare and gates.                                                                                                                                                              |
| `timeoutMs`      | Default gate timeout for this host (default 120000; `--timeout` overrides).                                                                                                                                      |
| `gates.<kind>`   | The command for each gate kind: `argv` (required), `cwd`, `env`, `stdin` (a file piped to the gate, for hook entry points), `junit` (the JUnit report the gate writes; see above), `timeoutMs`, `failExitCodes`. |

Gate kinds: `eslint`, `depcruise`, `vitest`, `jest`, `pest`, `phpstan`, `script`, `ci`, `hook`.
A rule whose gate kind the host does not map fails with a clear message.

### Placeholders

| Placeholder                                          | Value                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `{ruleId}` `{gateKind}` `{gateId}` `{discriminator}` | From the registry rule (gate commands only).                  |
| `{gateIdPattern}`                                    | The gate id with regular-expression characters escaped.       |
| `{workdir}`                                          | The work directory (prepare and gate commands).               |
| `{base}` `{head}`                                    | Base and head commit SHAs; empty when no layer declares them. |
| `{hostDir}` `{repoRoot}` `{node}`                    | The host directory, the repository root, the running Node.js. |

An unknown placeholder is an error when the host is loaded. A nested array in an argv is an
**optional group**, kept only when every placeholder in it has a value:
`["--base", "{base}"]` disappears when there is no base commit, and `["{discriminator}"]`
disappears for rules without a discriminator.

### Gate environment

Gates, setup and prepare commands inherit the caller's environment with these changes, so a
run behaves the same in CI, in a terminal and inside an agent session:

- set: `PAO_DISABLE=1` (plain Pest/PHPUnit/PHPStan output instead of agent JSON),
  `NO_COLOR=1`, `CI=1`, `GIT_TERMINAL_PROMPT=0`;
- git isolation: `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL` pointing at an empty file, and
  `GIT_CEILING_DIRECTORIES` at the run's temporary directory;
- removed: every `GIT_*` variable (a git hook's `GIT_DIR` must never leak into a scratch
  repository), every `CLAUDE_*` and `CROSS_STACK_STANDARD_*` variable (session state and the
  Standard's own opt-out switches), `CLAUDECODE`, `AI_AGENT` and `FORCE_COLOR`.

Commands are spawned without a shell. On Windows, `.cmd` and `.bat` shims cannot be spawned
that way: run Node tools as `{node} node_modules/<pkg>/<bin>.js` and PHP tools as
`php vendor/bin/<tool>` or `php <composer.phar>`.

## Hosts in this directory

| Host   | Purpose                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo` | A scratch git repository with an initial commit, for repository-level gates: workflows, CODEOWNERS, hook configuration, commit ranges (`base`/`head`). |
| `node` | A plain Node.js project with no dependencies, for `script` gates.                                                                                      |
| `hook` | An empty project for `hook` gates: the plugin's real hook entry point runs on the work directory with the fixture's hook input.                        |

Both run `script` gates through the kit's dependency-free binary, named by the `kitBin`
variable (default: `plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs`,
the file `adopt` copies to `.cross-stack/bin/` in a project). Point it at another build with
`--var kitBin=/abs/path/cross-stack.mjs`. The calling convention the binary must accept:

```text
node <kitBin> <gate id> [<discriminator>] --root <work directory> [--base <sha>] [--head <sha>]
```

- `<gate id>` is the registry gate's `id`, a subcommand of the binary (`check-allowlists`).
- `<discriminator>` is passed as a positional sub-check only when the rule has one; a command
  that owns several rules declares it as a positional argument.
- `--root` names the work directory: outside `<project>/.cross-stack/bin/` the binary refuses to
  guess the project.
- `--base` and `--head` are passed only on the `repo` host, and only when the fixture defines
  `base`/`head` commits; commands for commit-range gates accept them.
- Exit code 1 is a finding and 2 a usage or internal error. Both hosts set
  `failExitCodes: [1]`, so a crash never counts as a caught violation.

The binary prints its check id (`check-allowlists <path>:<line> <message>`), not the rule id.
Until it prints rule ids, a script-gate violation fixture sets `expect.idPattern` to match its
finding line. `test/scripts/fixtures-runner/kit-bin.test.mjs` runs the real binary through both
hosts.

## The hook host

`hook` gates (the Claude Code hooks' rules) run the plugin's real entry point the way Claude Code
does. The host's gate command is `scripts/lib/fixtures/hook-gate.mjs`:

```text
node scripts/lib/fixtures/hook-gate.mjs --plugin <plugin dir> --event <gate id> [--tool <discriminator>]
  < <work directory>/hook-input.json        (the gate's stdin, with CLAUDE_PROJECT_DIR=<work directory>)
```

1. It reads the hook input from `hook-input.json`, a file the fixture layers put in the work
   directory: the rule's `clean-overlays/<ID>/hook-input.json` for the clean run, and the
   violation fixture's own copy for the violation run. `cwd` defaults to the work directory and
   `hook_event_name` to the gate's event (a different event is an error). Relative paths in
   `tool_input` resolve against `cwd`.
2. It finds the command `hooks/hooks.json` routes for the event and the input's `tool_name`; the
   same matcher must also cover the rule's discriminator (`Edit` covers `Edit`, `Write` and
   `NotebookEdit`; `Bash` covers `Bash` and `PowerShell`). No route is an error, since Claude Code
   would not run the hook.
3. It runs that command, `node <plugin>/scripts/hook.mjs <Event>`, without a shell, with the input
   on stdin, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT` and a temporary `CLAUDE_PLUGIN_DATA`
   (removed afterwards), within the hooks.json timeout.
4. It maps the answer to the gate exit codes and prints a verdict line
   (`hook <event>[:<tool>] passed|violation|error: …`) followed by the hook's stdout and stderr:

| Event       | Clean (exit 0)    | Violation (exit 1)                                   | Error (exit 2), never a verdict                                                                                         |
| ----------- | ----------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PreToolUse  | no output         | a `permissionDecision` of `ask` or `deny`            | any other output or exit code, and an `ask` whose reason says the protection check could not complete (it fails closed) |
| Stop        | exit 0, no output | exit 2 with the failing command and output on stderr | a `systemMessage` (the check was skipped: a missing tool, the budget), exit 2 with an empty stderr, any other exit      |
| PostToolUse | exit 0, no output | exit 2 with `file:line rule message` lines on stderr | the same as Stop                                                                                                        |

The host sets `failExitCodes: [1]`, so a hook that crashed or skipped its check never counts as a
caught violation, and a clean run passes only when the hook actually ran and found nothing.

The PreToolUse answer names the rules its protection serves in `additionalContext`
(`(rule PROC-013)`), so those fixtures need no pattern. Stop and PostToolUse report the failing
command or the lint problems, not a rule id: their violation fixtures set `expect.idPattern` to
the verdict line, which names the event and the tool (`^hook PostToolUse:Edit violation:`).

The host has two variables: `pluginRoot` (default `{repoRoot}/plugins/cross-stack-standard`) and
`hookGate` (default `{repoRoot}/scripts/lib/fixtures/hook-gate.mjs`). A fixture for a hook that
runs project tools brings a minimal project in its clean overlay: a `package.json` whose
`check:fast` script the Stop hook runs, or an ESLint stub renamed to `node_modules/eslint`
(`rename`) for the PostToolUse hook. `test/scripts/fixtures-runner/hook-gate.test.mjs` covers the
mapping, the routing and a run through the fixture runner.

## Adding a host

The `laravel`, `web`, `mobile` and `fullstack` hosts follow the same contract. They are built with
the gates that need them: the Laravel host with the first Pest and PHPStan gates (it also proves
the hard-link copy with `composer dump-autoload` in `prepare` and `pest --filter`), the web host
with the first ESLint, dependency-cruiser and Vitest gates (`vitest -t`), and the mobile host with
the first Jest and mobile ESLint gates. Until then only `node`, `repo` and `hook` exist, and
every rule that would need another host stays REVIEW.

1. Create `test/harness/<name>/` with the smallest project that runs the track's gates: the
   manifest and **committed lockfile** (`composer.json` + `composer.lock`, `package.json` +
   `package-lock.json`) and the gate configuration. Lockfiles are frozen: they change only in
   `chore(deps)` pull requests that re-run the full matrix.
2. Install dependencies in `setup`, run once per invocation in the host directory. CI may
   cache and install them itself and pass `--skip-setup`. Dependency directories are never
   committed (`.gitignore` covers `node_modules/` and `vendor/`).
3. List the dependency directories in `copy.hardlink`. Each work directory then gets a
   hard-link copy (the `cp -al` equivalent): cheap even for a large `vendor/`, and PHP
   autoloaders that locate files through `__DIR__` resolve inside the work directory rather
   than the host. Symbolic links (such as `node_modules/.bin`) are recreated as links.
4. Hard-linked files share their content with the host. The runner never writes through a
   link (it replaces files instead), but a tool that rewrites files in place would change the
   host. List such paths in `copy.detach`. For Laravel, `composer dump-autoload` rewrites
   `vendor/composer/` and `vendor/autoload.php`: detach both and run the command in `prepare`
   when fixtures add classes that the autoloader must find.
5. Map each gate kind the track uses in `gates`. Set `failExitCodes` where the tool separates
   findings from crashes (ESLint exits 1 for lint errors and 2 for a crash). Run ESLint with
   `--max-warnings=0`, so a warning cannot pass as clean. For test runners (Pest, Vitest, Jest),
   narrow the run to the rule's test with `{gateIdPattern}` and set `junit` to the report the
   tool writes (verify the tool's JUnit flag in `docs/maintainers/verified-versions.md` first),
   so the runner can see that the named test itself failed.
6. Hard links need the work directories on the same device as the host. When the system temp
   directory is elsewhere, the copy falls back to real copies (the report shows
   `"fallback": "EXDEV"`); pass `--temp-dir` on the host's device to keep links.
7. Run `node --test test/scripts/fixtures-runner/` (it validates every `host.json` here) and
   the matrix for one rule of the track.

A Laravel host, as a sketch (verify tool flags against `docs/maintainers/verified-versions.md`
before relying on them):

```json
{
  "name": "laravel",
  "description": "Laravel API skeleton with Pest and PHPStan.",
  "setup": [["composer", "install", "--no-interaction", "--no-progress"]],
  "prepare": [["composer", "dump-autoload", "--no-interaction"]],
  "copy": {
    "hardlink": ["vendor"],
    "detach": ["vendor/composer", "vendor/autoload.php"],
    "exclude": ["storage/logs/*.log"]
  },
  "gates": {
    "pest": { "argv": ["php", "vendor/bin/pest", "--filter", "{gateIdPattern}"] }
  }
}
```

A `fullstack` host composes others instead of installing twice:

```json
{
  "name": "fullstack",
  "description": "Laravel API and Next.js web app side by side, for cross-track contract drift.",
  "include": [
    { "host": "laravel", "into": "api" },
    { "host": "web", "into": "web" }
  ],
  "gates": {
    "ci": {
      "argv": ["{node}", "{kitBin}", "{gateId}", ["{discriminator}"], "--root", "{workdir}"],
      "failExitCodes": [1]
    }
  },
  "vars": {
    "kitBin": "{repoRoot}/plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs"
  }
}
```

## Debugging a failing rule

- `--keep-temp` keeps both work directories and prints where they are; `cd` there and run the
  gate command by hand.
- The report (`fixture-report.json`, gitignored) holds, for every failed run, the reasons and
  the last 60 lines of sanitised output. `--verbose` also lists passing runs.
- `--list` shows which rules and hosts would run, and why a rule is missing or skipped.

## Report

`fixture-report.json`:

```json
{
  "formatVersion": 2,
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "partial": false,
  "filters": { "rules": [], "track": null, "host": null },
  "summary": {
    "ok": true,
    "runs": 1,
    "passed": 1,
    "failed": 0,
    "missingFixtures": 0,
    "skipped": 0,
    "durationMs": 1200
  },
  "setup": [{ "host": "node", "ok": true, "commands": 0, "durationMs": 0 }],
  "warnings": [],
  "results": [
    {
      "rule": "PROC-014",
      "track": "shared",
      "host": "node",
      "gate": { "kind": "script", "id": "check-allowlists", "discriminator": null },
      "fixture": "test/fixtures/shared/violations/PROC-014",
      "inputs": "sha256:…",
      "ok": true,
      "clean": { "ok": true, "exitCode": 0, "timedOut": false, "durationMs": 180, "reasons": [] },
      "violation": {
        "ok": true,
        "exitCode": 1,
        "idPrinted": true,
        "unexpectedIds": [],
        "alsoFired": [],
        "durationMs": 190,
        "reasons": []
      },
      "durationMs": 370,
      "error": null,
      "warnings": []
    }
  ],
  "missingFixtures": [],
  "skipped": []
}
```

`partial` is true when `--rule`, `--track` or `--host` narrowed the run; `check-registry` refuses a
partial report unless it is given `--allow-partial` (local debugging only). `warnings` lists
cleanup problems (for example a read-only directory a gate left behind); they never change a
verdict. Each run also records
`signal`, copy statistics (`copy`) and, with `--keep-temp`, its `workdir`.
