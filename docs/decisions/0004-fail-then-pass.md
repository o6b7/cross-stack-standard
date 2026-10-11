---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Fail-then-pass: every gate is proven against a clean and a violation fixture

## Context and Problem Statement

A gate that has never been seen failing proves nothing. Gates fail open in quiet ways: Pest runs
only files ending in `Test.php` inside a configured test suite, so an architecture test saved under
another name is silently skipped; a Pest expectation on a namespace that does not exist passes
vacuously; dependency-cruiser reports "no dependency violations found" with zero modules cruised
when it cannot load the installed TypeScript. A common defect is a security test suite shipped as
incomplete templates, which passes CI while it is empty. In each case the build is green and the
rule is unenforced.

How does the Standard prove that each gate catches exactly what its rule claims, and keep proving
it as tools and frameworks move?

## Decision Drivers

- A FORCED or GUARDED label must rest on observed evidence ([0002](0002-gates-over-guidelines.md)).
- The evidence must cover the shipped configuration, discovery and exit code, not only the gate's
  logic.
- Framework generators change; the kit must be re-proven on freshly generated apps.
- Adopters need the same guarantee in their own repositories.

## Considered Options

- A fixture matrix in CI, plus smoke apps from the official generators
- Unit tests of each gate's implementation only
- Manual verification before each release

## Decision Outcome

Chosen option: "A fixture matrix in CI, plus smoke apps from the official generators", because it is
the only option that exercises the gate the way an adopter runs it: shipped config, test discovery,
real exit code.

- **The law.** For every rule that is, or targets, FORCED or GUARDED, `scripts/run-fixtures.mjs`
  runs the rule's gate on a minimal clean fixture, which must pass, and on
  `test/fixtures/<track>/violations/<RULE-ID>/`, which must fail and print the rule ID. Results go
  to `fixture-report.json`, which `check-registry --fixture-report` reads
  ([0003](0003-rule-registry.md)).
- **Hosts.** Minimal pinned harness projects per track, a repository host (a scratch Git
  repository for workflow, CODEOWNERS and commit-range gates) and stdin JSON fixtures for hooks. A
  fixture is overlaid on a temporary copy of its host.
  - Harness hosts live in `test/harness/<host>/`: one per track (`laravel`, `web`, `mobile`), the
    `repo` host, a plain Node.js host for script gates, and a combined `fullstack` host (Laravel
    plus web) for cross-track contract drift. Fixtures live in `test/fixtures/<track>/`, where
    `<track>` is the rule's registry track, so fixtures for `shared` rules live in
    `test/fixtures/shared/`. `test/harness/` and `test/fixtures/shared/` are additions to the
    repository layout, which otherwise keeps fixtures per track.
- **Isolation by assertion.** Tool flags do not isolate one rule in the shipped configuration:
  ESLint's `--rule` merges with the configuration, and adding `--no-config-lookup` drops the very
  configuration the fixture exists to test; dependency-cruiser has no single-rule mode. So every
  other rule that fires on a violation fixture must be declared in its `fixture.json`
  (`alsoFires`), and clean fixtures must be clean for every rule.
- **Smoke apps.** CI generates apps with pinned official generators (`laravel new` from
  laravel/installer 5.32.0 with `--pest --no-boost --no-node --database=sqlite -n` followed by
  `php artisan install:api`; `create-next-app` 16.3.6; `create-expo-app` with an exact template spec
  such as `expo-template-default@57.0.27`, because a bare `--template default` resolves the
  template's `latest` tag), adopts the kit by script and runs each track's `check`.
  `create-next-app` writes its own version of `next` exactly, so its pin moves in the same
  `chore(deps)` pull request that raises the Next.js floor ([0071](0071-nextjs-security-floor.md));
  otherwise the smoke app would fail the floor gate. They run on every push to `dev` and on pull
  requests labelled `run-smoke`. GitHub runs scheduled workflows only on the default branch, so the
  weekly schedule becomes live once `main` carries releases. A failure opens an issue.
- **REVIEW rules.** The skill's behaviour on REVIEW rules is covered by eval scenarios graded on the
  rule IDs the answer cites. Eval runs need paid model credentials; they are run by hand and are
  never a required check.
- **Adopters.** In an adopting project a gate counts only after it has been seen failing: violation
  probes shipped with the plugin run after `adopt` and after `upgrade`.

### Consequences

- Good, because a green matrix means every labelled gate was seen failing on its violation, today,
  with today's pins.
- Good, because a silent fail-open (discovery, vacuous pass, exit code wrap) shows up as a
  violation fixture that passed.
- Good, because smoke apps catch generator changes before adopters do.
- Bad, because hundreds of fixtures on several hosts make CI slow; unaffected jobs are
  skipped on pull requests and everything runs on pushes to `dev`.
- Bad, because harness lockfiles must be frozen and updated deliberately, with a full matrix run.
- Bad, because eval scenarios are manual, so REVIEW behaviour is checked less often than gates.

### Confirmation

CI runs `node scripts/run-fixtures.mjs` and then `node scripts/check-registry.mjs --fixture-report`
on the report; a FORCED or GUARDED rule without a passing clean run and a failing violation run
fails the build. The smoke workflow runs on pushes to `dev`. Eval scenarios are run by hand before
a release, and their results are checked in review.

## Pros and Cons of the Options

### A fixture matrix in CI, plus smoke apps from the official generators

- Good, because it tests the gate end to end, as shipped.
- Bad, because it costs CI time and fixture maintenance.

### Unit tests of each gate's implementation only

- Good, because tests such as ESLint's `RuleTester` are fast and precise about the rule's logic.
- Bad, because they do not show that the shipped config enables the rule, that the runner
  discovers the test, or that the exit code reaches CI. They stay, as package tests, alongside the
  matrix.

### Manual verification before each release

- Good, because it needs no infrastructure.
- Bad, because it does not scale to hundreds of rules and misses regressions between releases.

## More Information

- ESLint `--rule`: <https://eslint.org/docs/latest/use/command-line-interface#--rule>.
- Pest architecture testing: <https://pestphp.com/docs/arch-testing>. The discovery and
  vacuous-pass behaviour described above was observed with Pest 5.2.1 and is recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- dependency-cruiser CLI: <https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md>.
- GitHub `schedule` event:
  <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule>.
- Generators: <https://github.com/laravel/installer>,
  <https://nextjs.org/docs/app/api-reference/cli/create-next-app>,
  <https://docs.expo.dev/more/create-expo/>. Pins and observed behaviour are recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0002](0002-gates-over-guidelines.md), [0003](0003-rule-registry.md),
  [0023](0023-adopter-manifest-and-upgrade.md), [0031](0031-maintainers-repository-ci.md).
- Governs: the fixture and smoke-app process rules, and the adopter-side violation probes.
