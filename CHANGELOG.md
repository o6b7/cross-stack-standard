# Changelog

All notable changes to the Cross-Stack Standard are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as it applies to a standard: a
MAJOR release can newly fail an adopter's build. The full policy is in
[docs/maintainers/release.md](docs/maintainers/release.md#versioning-policy).

Every pull request that changes anything outside `docs/` and `test/` adds an entry under
`## [Unreleased]`, in one of the categories Added, Changed, Deprecated, Removed, Fixed or
Security. A release renames that section to the version and its date.

## [Unreleased]

### Added

- A provider-neutral Agent Skill at `skills/cross-stack-standard/` for Gemini CLI, Codex and other hosts
  that support Agent Skills, with bundled rule references synchronized from `docs/rules/`.
- A build and check command for the portable skill's generated rule references.
- Companion plugins (ADR 0106): the marketplace pins caveman, impeccable, the Figma MCP server and
  the Chrome DevTools MCP server to full commits. `adopt` offers them, all recommended, in one
  question and installs only the ones the user ticks; `doctor` reports missing, duplicate and
  hand-copied copies. caveman loads four skills and no hooks, impeccable its skill and agents
  without hooks, and Chrome DevTools MCP runs with its privacy flags.
- A UserPromptSubmit hook that pauses caveman in plan mode.
- Companion consent, status and safety: one yes or no per companion in adopt, recorded under
  `companions` in the manifest; `scripts/companions.mjs` (`describe`, `status`, `plan`, `record`,
  `health`, `log`); startup and per-call status and health checks (SessionStart, PostToolUse and a
  new PostToolUseFailure hook); fallback messages; a structured companion log; and PreToolUse gates
  that refuse a declined companion, ask before the browser companion leaves development hosts or
  runs page scripts (SEC-074, GUARDED) and before Figma writes (SEC-075, GUARDED). New manifest key
  `hooks.preToolUse.browserHosts`.
- Companion gates fail closed: only an explicit `true` consent permits a companion's MCP tools,
  skills (the Skill tool, now gated) and shell installs or enables; the browser companion checks the
  session's current page on every action; hand-copied companion skills and agents count as
  duplicates.
- Repository CI: a single required `ci-ok` check over lint, tests (Node 24 and the Node 22.13
  floor), registry and generated-file checks, strict plugin validation with a pinned Claude Code
  CLI, integrity checks (brand guard, narrative lint, gitleaks, changelog entry, Conventional
  Commits pull request titles) and the fail-then-pass fixture matrix.
- A `dev` watch workflow for link checking, `verified-versions.md` staleness issues and
  upstream canaries, and a tag-triggered release workflow that verifies the tag is on `main`
  before publishing release notes from this changelog.
- Repository tooling: pinned, checksum-verified tool installer (`scripts/install-tool.mjs`),
  release-notes extraction, changelog and repository-integrity checks, lefthook hooks,
  commitlint, ESLint, Prettier and markdownlint configuration, LF line endings on every OS
  (`.gitattributes`) and `npm run check` for every offline check.
- The rule registry (`registry/rules.json`) and its JSON Schema, `check-registry` (schema,
  unique gates, gate presence for every gate kind, fixture results, rule-ID citations and
  decision records) and the generated rule documentation under `docs/rules/`.
- The fail-then-pass fixture runner (`scripts/run-fixtures.mjs`) with the `repo` and `node`
  harness hosts, the `fixture.json` schema and a machine-readable `fixture-report.json`.
- The plugin and marketplace skeleton, the project manifest and allowlist schemas, the
  protected-paths data file, the dependency-free project tool `cross-stack.mjs`
  (`check-standard-config`, `check-allowlists`) and `build-plugin-data`, which generates the
  plugin's runtime data and template hashes.
- Versioning tooling: `VERSION` as the single source, `stamp-version`, `check-version-drift` and
  `check-identity`.
- A keyed brand-leak guard with a hashed denylist, a narrative lint for internal working
  notation, a denylist-shrink check and a local pull-request checker for maintainers.
- Maintainer documentation for the versioning policy, the release flow, the branch model and
  branch protection.
- Brand guard coverage: commit messages (including `#` lines), author, committer and tagger
  identities, every file version a push would publish, text behind escapes, markup, hyphenated
  line breaks, data URIs and PDF strings, and invisible or look-alike characters. Errors never
  quote scanned text, and `scripts/sanitize-output.mjs` removes local paths from command output
  before it is posted.
- Fixture runner evidence rules: ids inside file paths do not count, a violation's id must be
  absent from the clean run, `expect.idPattern` must name the gate id, test-runner hosts are
  judged from their JUnit report, and every result carries an inputs fingerprint so
  `check-registry` rejects stale or partial reports.
- `check-changelog` recognises release, hotfix and back-merge pull requests, and
  `build-plugin-data` refuses to rewrite the template hashes of a released version.
- The project manifest's `allowlistMaxDays` setting (default 365) caps how far ahead an
  allowlist entry may expire, and the schema declares the `stack` keys.
- The plugin folder carries a copy of `LICENSE`, generated and drift-checked by
  `build-plugin-data`, so every installed copy includes the licence; kit template files carry
  an `SPDX-License-Identifier: MIT` and copyright line in their header (`check-identity`).
- A committed `.claude/settings.json` that denies Claude Code sessions in this repository the
  usual forms of pushing `main`, force pushes, tag pushes, GitHub Releases and package
  publishing, and always asks before remote branch deletion and pull-request merges.
- The rule registry's `client` track for rules that apply to both JavaScript client tracks (web
  and mobile) and never to Laravel; gate presence requires an ESLint or dependency-cruiser gate
  of a multi-track rule in every track that ships such a configuration, and finds a vendored
  gate package's own command (`templates/<track>/vendor/<name>/bin/<name>.mjs --list-checks`).
- `check-registry --release`: a default-on rule must be at its target level, and its `since` must
  not be later than `VERSION`, before a release.
- Registry rules list planned manifest keys (under `trackRoots`, `stack`, `decisions`, `rules` or
  `modules`) while they are REVIEW; `check-registry` requires the keys of a FORCED or GUARDED rule
  to be declared in the manifest schema and a key for every rule that speaks of a configured
  value, and the generated rule pages mark planned keys.
- The `hook` harness host: hook-gated rules run the plugin's real hook entry point through
  `hooks/hooks.json` with a fixture's hook input, and a PreToolUse `ask` or `deny`, or a Stop or
  PostToolUse exit 2, counts as the violation. The four hook rules PROC-013, PROC-022, PROC-026
  and PROC-030 are GUARDED, with clean and violation fixtures in the matrix.
- Fixtures for PROC-001 and PROC-014 on the `node` host. Both stay REVIEW until a shipped track
  `check` chain runs the project tool.

### Changed

- The Next.js scaffold uses create-next-app 16.3.8, which includes the September 30 security fixes.
- Root checks exclude the separate local `web/` application from the plugin release tree.
- The `design` and `browser-check` modules now switch on the rules for the impeccable and Chrome
  DevTools MCP companion plugins instead of printing upstream installs; the
  `templates/claude/mcp.browser-check.json` template is removed, and ADR 0034 and 0035 are
  superseded by ADR 0106.
- `check-standard-config` also fails when the manifest does not cover a detected stack: every
  Laravel, web or mobile manifest in the project needs its track in `tracks` and its directory
  named under `trackRoots`. `check-standard-config schema` runs the schema and coverage part
  alone, and `list-checks` lists it as `check-standard-config:schema`.

- Registry rule titles are imperative and at most 100 characters, every rule carries an adoption
  line that starts with Nothing needed, Fix first, Baseline, Allowlist or Opt-in, and the
  generated rule pages print profiles as n/a outside the web track.
