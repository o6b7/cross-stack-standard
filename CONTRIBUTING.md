# Contributing

Thank you for helping improve the Cross-Stack Standard. This page covers how to report problems,
propose rules and send changes. The maintainer guides under [`docs/maintainers/`](docs/maintainers/)
hold the details: [branching](docs/maintainers/branching.md), [releases](docs/maintainers/release.md),
[branch protection](docs/maintainers/branch-protection.md) and
[verified versions](docs/maintainers/verified-versions.md).

Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md). Security problems go
through the [security policy](SECURITY.md), never a public issue.

## Ways to contribute

| You want to                                  | Start here                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Report a bug in the plugin, a skill or a doc | A [bug report](https://github.com/o6b7/cross-stack-standard/issues/new/choose)                               |
| Report a gate that fails on correct code     | A false-positive report, with the smallest code that triggers it                                             |
| Propose a new rule or a change to one        | A rule proposal; the process is in [GOVERNANCE.md](GOVERNANCE.md#how-rules-change-the-rule-proposal-process) |
| Suggest a feature                            | A feature request                                                                                            |
| Fix something yourself                       | Open an issue first for anything larger than a typo, then a pull request (below)                             |

## Set up

You need Node.js 22.13 or later and Git.

```sh
npm ci                                                 # repository tooling; also installs the Git hooks
claude --plugin-dir ./plugins/cross-stack-standard     # load your checkout of the plugin for one session
```

`--plugin-dir` replaces an installed copy of the plugin for that session, so you can try unreleased
changes without touching your normal setup. There is no early-access channel to install instead
([ADR 0026](docs/decisions/0026-no-early-access-channel.md)).

The repository itself opts out of the Standard's hooks (its `CLAUDE.md` holds the opt-out line),
because the fixture apps under `test/` would otherwise make it look like an adopting project.

## Workflow

1. Branch from `dev` with a prefix: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/` or
   `ci/`. See [the branch model](docs/maintainers/branching.md).
2. Install the tooling with `npm ci` (Node.js 22.13 or later). It also installs the Git hooks.
   Maintainers also install the brand-guard key once per clone (see
   [the brand-guard key](#brand-guard-key-maintainers)); without it the brand hooks print a notice
   and pass, and CI runs the guard.
3. Make small commits that follow [Conventional Commits](https://www.conventionalcommits.org/).
4. Add an entry under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) unless you only
   changed `docs/` or `test/`.
5. Open a pull request against `dev` and fill in the template, including the real output of
   the checks you ran. The pull request title becomes the squash-merge commit, so it follows
   Conventional Commits too.
6. The `ci-ok` check must pass before merging.

## Checks you can run locally

```sh
npm test                                  # node:test suites
npm run check                             # every offline check below, in one command
npm run lint && npm run format:check      # ESLint and Prettier
npm run lint:md                           # markdownlint
npm run check:registry                    # registry schema, gates, fixtures, citations
npm run check:rule-docs                   # docs/rules/ matches the registry
npm run check:plugin-data                 # plugins/cross-stack-standard/data/ matches its sources
npm run check:version                     # every version location matches VERSION
npm run check:identity                    # author metadata
npm run check:narrative                   # no internal working notation in the tree
npm run check:integrity                   # tracked-file integrity
npm run fixtures                          # fail-then-pass fixture matrix
node scripts/check-changelog.mjs --base origin/dev
node scripts/install-tool.mjs gitleaks    # pinned gitleaks for the pre-commit hook
```

After changing `registry/rules.json`, `schemas/` or the templates, regenerate the derived files
with `npm run build:rule-docs` and `npm run build:plugin-data` and commit the result.

## Working on rules

`registry/rules.json` is the single source of truth for every rule
([ADR 0003](docs/decisions/0003-rule-registry.md)). The pages under `docs/rules/` and the plugin's
`data/` directory are generated from it; never edit them by hand.

### Adding a rule

1. Agree on the rule in a rule-proposal issue first ([GOVERNANCE.md](GOVERNANCE.md)).
2. Add it to the registry as `REVIEW` with a `targetEnforcement`, a one-sentence `summary`, an
   `adoption` line, its `track`, `tier` and `module`, and the `decision` record it cites. Write a
   new decision record in `docs/decisions/` when no existing one covers it.
3. Cite it by ID wherever it matters (skills, references, templates, docs); `check-registry` fails
   on an ID that is not in the registry.
4. Regenerate `docs/rules/` and the plugin data.

### Promoting a rule to FORCED or GUARDED

A label is a claim that CI must prove ([ADR 0002](docs/decisions/0002-gates-over-guidelines.md),
[ADR 0004](docs/decisions/0004-fail-then-pass.md)). The pull request that promotes a rule ships,
together:

- the gate itself (the ESLint rule, the Pest test named after the rule ID, the PHPStan rule, the
  script check or the CI step), wired into the track's `check` chain;
- a clean fixture that passes the gate, and a minimal violation fixture under
  `test/fixtures/<track>/violations/<RULE-ID>/` that fails it with the rule ID in the output;
- for GUARDED, a non-empty `evasions` list naming the known ways around the gate;
- the label change in the registry, and a CHANGELOG entry that names the rule.

Run the matrix for the rule and check the result before opening the pull request:

```sh
node scripts/run-fixtures.mjs --rule <RULE-ID>
npm run check:registry
```

In the CI fixtures job, `check-registry` also reads the fixture report and fails a FORCED or GUARDED
rule whose violation fixture did not fail.

### Versions, flags and pins

Every tool version, command-line flag, configuration key and checksum the Standard relies on is
verified against its official source and recorded in
[verified-versions.md](docs/maintainers/verified-versions.md) with the date. Add or update a row in
the same pull request that starts relying on a new value.

## Writing docs

- Write for a busy engineer: short sentences, concrete commands, no marketing.
- Be honest about status. Never describe a rule as enforced unless the registry marks it FORCED or
  GUARDED; say "REVIEW in this release, gate planned" instead.
- Cite rules by ID and decisions by number rather than restating them.
- Explain rationale neutrally ("a common defect is …"); `npm run check:narrative` flags internal
  working notation.
- Markdown is checked by markdownlint and Prettier (print width 100).

## Brand-guard key (maintainers)

The brand guard compares keyed digests. The key is a maintainer and CI secret and never enters the
repository. Install it once in each clone, under the clone's `.git/` directory, which Git never
tracks:

```sh
mkdir -p "$(git rev-parse --git-common-dir)/cross-stack-standard"
install -m 600 <path-to-key-file> "$(git rev-parse --git-common-dir)/cross-stack-standard/brand.key"
```

The pre-commit, commit-msg and pre-push hooks then scan staged files, names and the commit identity,
the message, and every commit a push would publish. `CROSS_STACK_STANDARD_BRAND_KEY` (the key) or
`CROSS_STACK_STANDARD_BRAND_KEY_FILE` (a path to it) work too. A key that is present but unreadable
or too short fails the hooks rather than skipping them. Details:
[branch-protection.md](docs/maintainers/branch-protection.md#the-same-key-in-every-maintainer-clone).

## Ground rules

- Rules and their enforcement labels come from `registry/rules.json`; generated docs are never
  edited by hand.
- A gate is never weakened to get a green build. Fix the code, or add a dated allowlist entry with a
  reason.
- Scripts and plugin code use Node.js built-ins only and make no network calls. The two
  exceptions exist for that purpose: `scripts/install-tool.mjs` downloads pinned,
  checksum-verified binaries and `scripts/check-pr.mjs` reads a pull request through `gh`.
- `VERSION` is the only place the version is edited; `node scripts/stamp-version.mjs` writes it
  everywhere else.
- Kit template files are copied into other projects one by one, so each one starts with the
  version header followed by the licence notice (`check-identity` enforces it):

  ```js
  // cross-stack-standard vX.Y.Z
  // SPDX-License-Identifier: MIT
  // Copyright (c) 2026 Qusai Abdullah
  ```

Releases, versioning and branch protection are described in
[release.md](docs/maintainers/release.md), [branching.md](docs/maintainers/branching.md) and
[branch-protection.md](docs/maintainers/branch-protection.md).

## License

By contributing, you agree that your contributions are licensed under the project's
[MIT License](LICENSE).
