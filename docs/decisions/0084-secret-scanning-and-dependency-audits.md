---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Secret scanning and dependency audits in pre-commit and CI

## Context and Problem Statement

Every project carries two supply-side risks. A secret that reaches git history must be rotated,
because removing it from history does not un-publish it. A dependency with a known vulnerability
ships in the next build unless something fails first.

The common shortcuts undermine pinning ([0032](0032-supply-chain-pinning.md)). The gitleaks GitHub
Action is under a proprietary licence, fails in organisation-owned repositories without a licence
secret, and by default downloads gitleaks 8.24.3 without a checksum check. An unrelated npm package
is named `gitleaks`, so `npx gitleaks` fetches third-party code. gitleaks itself is
feature-complete: its README says future releases are security patches only, and its author now
works on Betterleaks.

Audit tools also differ. `npm audit` takes a severity threshold and can omit dev dependencies.
`composer audit` changed its exit codes in Composer 2.10 (0 or 1) and fails on abandoned packages
by default. osv-scanner 2.6.0 has no severity threshold and no flag to skip dev dependencies, so any
finding fails it. All of these need the network.

How do adopters scan for secrets and audit dependencies without weakening pinning or blocking
offline work?

## Decision Drivers

- The scanner and every tool it needs are pinned and checksum-verified.
- Findings block merges; thresholds are chosen, never defaulted to "everything" or "nothing".
- Local gates stay offline; network checks run where the network is expected.
- The kit's own test fixtures must not trip platform secret scanning.

## Considered Options

- A checksum-verified gitleaks binary plus blocking native audits in CI
- The gitleaks GitHub Action
- osv-scanner as the blocking audit
- Platform secret scanning only

## Decision Outcome

Chosen option: "A checksum-verified gitleaks binary plus blocking native audits in CI", because it
keeps every tool pinned and open source and gives each audit a threshold that means "act now".

- **gitleaks 8.30.1** runs as a binary downloaded at that exact version and checked against its
  recorded SHA-256 before it runs. Pre-commit ([0094](0094-developer-workflow-templates.md)) runs
  `gitleaks git --pre-commit --redact --staged`. CI scans the pull request's commit range with
  `gitleaks git --redact --log-opts="<base>..<head>"` (enough fetch depth for both commits) and
  the new commits on pushes. Never the gitleaks Action, and never an npm or `npx` install.
- **Configuration.** `.gitleaks.toml` extends the default rules (`[extend] useDefault = true`) with
  project allowlists. It and `.gitleaksignore` are protected gate files
  ([0021](0021-gate-file-protection.md)). CI passes `--ignore-gitleaks-allow`, so an inline
  `#gitleaks:allow` comment cannot suppress a finding there.
- **Successor.** Betterleaks, MIT-licensed and maintained by gitleaks' authors, is the named
  successor to evaluate. It is not a verified drop-in for `.gitleaks.toml`. Revisit when gitleaks
  stops shipping security releases, or when a Betterleaks release is shown to read existing
  configurations; its release checksums are verified before any migration.
- **Audits, CI only.** Each track's quality job runs a blocking audit
  ([0090](0090-ci-contract.md)): `composer audit --locked --no-dev`, and
  `npm audit --omit=dev --audit-level=high` for npm lockfiles; other package managers use their own
  audit command, chosen from the lockfile, with the same production-only, high-severity threshold.
  Any non-zero exit fails. Audits never run in `check:fast` or the Stop hook, because they need the
  network. A finding that cannot be fixed yet is a dated, reasoned exception
  ([0005](0005-explicit-exceptions.md)), never a lowered threshold.
- **osv-scanner** is an optional scheduled job across all lockfiles, for visibility, not a merge
  gate. Audits see only advisories that reached their databases, which is why the Next.js version
  floor is a separate gate ([0071](0071-nextjs-security-floor.md)).
- **Secret-shaped fixtures.** Tests of credential scanners use synthetic strings that match the
  kit's scanner but no real provider's format, so GitHub push protection and secret scanning stay
  quiet. They are allowed only under a scoped path allowlist for violation fixtures, protected by
  CODEOWNERS. Push protection is never bypassed; a blocked push is fixed by changing the fixture.

### Consequences

- Good, because the scanner runs the same pinned binary locally and in CI, with no licence key.
- Good, because a merge is blocked only by findings worth acting on now.
- Bad, because gitleaks is on a security-patch-only track, so a migration is likely within the life
  of 1.0.
- Bad, because npm-audit thresholds hide moderate findings until the scheduled scan reports them.

### Confirmation

- The secret-scan CI step runs the pinned gitleaks over the commit range, and pre-commit runs it on
  staged changes. GUARDED, because a scanner finds known formats and high-entropy strings; custom
  formats and secrets split or encoded across lines pass, and local hooks can be skipped.
- The tool installer refuses a binary whose checksum does not match its recorded value
  ([0032](0032-supply-chain-pinning.md)).
- A workflow check requires each declared track's quality job to run the configured audit command
  without `continue-on-error`. GUARDED, because the command's arguments can still be changed.
- Gate-weakening commands (`--audit-level=none`, Composer's no-blocking switches, gitleaks
  environment overrides) are on the gate-file guard's command list
  ([0021](0021-gate-file-protection.md)).
- The fixture allowlist's scope and its CODEOWNERS entry are Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### A checksum-verified gitleaks binary plus blocking native audits in CI

- Good, because everything is pinned, open source and threshold-driven.
- Bad, because the workflow downloads and verifies a binary itself.

### The gitleaks GitHub Action

- Good, because it is one `uses:` line.
- Bad, because of its licence terms, the licence secret for organisations, and an unverified,
  older default download.

### osv-scanner as the blocking audit

- Good, because one tool covers every lockfile format.
- Bad, because with no severity threshold, any low finding blocks every merge.

### Platform secret scanning only

- Good, because it needs no setup when available.
- Bad, because repository-level push protection is off by default, and it misses secrets in formats
  the platform does not recognise.

## More Information

- gitleaks: <https://github.com/gitleaks/gitleaks>; the Action and its licence:
  <https://github.com/gitleaks/gitleaks-action>; Betterleaks:
  <https://github.com/betterleaks/betterleaks>.
- `npm audit`: <https://docs.npmjs.com/cli/commands/npm-audit>; `composer audit`:
  <https://getcomposer.org/doc/03-cli.md#audit>; osv-scanner: <https://google.github.io/osv-scanner/>.
- GitHub push protection:
  <https://docs.github.com/en/code-security/concepts/secret-security/push-protection>.
- Versions, checksums and exit codes: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0021](0021-gate-file-protection.md), [0032](0032-supply-chain-pinning.md),
  [0085](0085-environment-files.md), [0094](0094-developer-workflow-templates.md).
- Governs: the secret-scanning rules, the dependency-audit workflow rules and the fixture policy
  for secret-shaped test data.
