---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Static application security testing template: Semgrep, with CodeQL as a JS/TS option

## Context and Problem Statement

The Standard's lint and static-analysis rules enforce its conventions; they do not look for
injection, unsafe deserialization or other vulnerability patterns. A static application security
testing (SAST) template closes that gap, and the two common choices have constraints that decide
the design:

- CodeQL does not analyse PHP. It covers JavaScript and TypeScript and GitHub Actions workflows;
  code scanning is free on public repositories, and private ones need GitHub Code Security.
- Semgrep's registry has no `p/laravel` ruleset (a scan that references it fails), `p/nextjs`
  serves no rules to the Community Edition, and `p/react` serves four. The Laravel rules available
  to the Community Edition are in `p/php` and `p/default`.
- The Semgrep registry rules are under the Semgrep Rules License v1.0, which does not allow
  distributing them. An MIT kit can reference registry rulesets but cannot ship copies of them
  ([0028](0028-license.md)).
- `semgrep scan` exits 1 on findings only with `--error`; `semgrep ci --config` fails when logged
  in to the Semgrep platform. By default Semgrep sends pseudonymous usage metrics when it pulls
  rules from the registry (`--metrics` defaults to `auto`).
- Registry rulesets are resolved at scan time and carry no version, so their content changes
  while the engine stays pinned.

A common defect is a template that names rulesets which do not exist or are empty, and so reports
a clean scan that checked almost nothing.

Which SAST template does the Standard offer, and how is it configured?

## Decision Drivers

- It covers PHP as well as TypeScript.
- The kit stays MIT; no third-party rule text is shipped.
- The engine is pinned ([0032](0032-supply-chain-pinning.md)); any moving input is declared.
- No usage data is sent by default.
- Findings that fail a build are few enough to be fixed, not ignored.

## Considered Options

- A Semgrep Community Edition template with existing rulesets, CodeQL as an optional extra
- CodeQL only
- Semgrep with framework rulesets (`p/laravel`, `p/nextjs`)
- No SAST template

## Decision Outcome

Chosen option: "A Semgrep Community Edition template with existing rulesets, CodeQL as an optional
extra", because it is the only option that covers PHP, and every ruleset it names actually serves
rules.

- **Engine.** The container image `semgrep/semgrep:1.178.0`, pinned by digest
  `sha256:32e459968daabe7ab86968184a29109b9564aa00392401156f9788452b42786b`.
- **Laravel.** `semgrep scan --config p/default --config p/php --error --metrics=off`.
- **Web and mobile.** The same command with
  `--config p/default --config p/typescript --config p/react`.
- **Rules.** Registry rulesets are referenced, never copied. Only rules written for the kit, under
  MIT, may be shipped with it.
- **Moving input.** Registry rulesets change without a version. This is a declared exception to
  [0032](0032-supply-chain-pinning.md): a new registry rule can add a finding without a code change,
  which the severity threshold and triage absorb.
- **Severity.** The failing step reports only the agreed severities (`--severity`, ERROR by
  default); lower severities may be uploaded as SARIF for review without failing.
- **Suppressions.** `nosemgrep: <rule-id>` comments with a reason, and `.semgrepignore` for paths;
  the ignore file is a protected path ([0021](0021-gate-file-protection.md)), and suppressions are
  reviewed like any other exception ([0005](0005-explicit-exceptions.md)).
- **CodeQL.** Optional for JavaScript, TypeScript and workflows: default setup, or an advanced
  workflow with `github/codeql-action` pinned to its v4.38.2 commit. It is not a Laravel option.
- **Not `semgrep ci`**, unless a team adopts the Semgrep platform.
- **Scope.** A post-1.0 candidate: implemented if time permits before 1.0, otherwise tracked on
  the roadmap.

### Consequences

- Good, because PHP gets vulnerability rules that no lint rule provides.
- Good, because the template names only rulesets that serve rules, and sends no metrics.
- Bad, because Community Edition coverage for Next.js and React specifics is thin; Semgrep
  documents many framework-specific rules as Pro-only.
- Bad, because the unversioned rulesets can turn a build red without a code change.
- Bad, because scans pull rules from the network at run time.

### Confirmation

Review. If the template ships, a workflow check requires the SAST job to run the pinned image
without `continue-on-error`, with `--error` and `--metrics=off`; that rule enters the registry as
REVIEW and moves to GUARDED with clean and violation fixtures ([0004](0004-fail-then-pass.md)).
Whether findings are triaged, rather than suppressed, is Review. Until then this record is a
proposal.

## Pros and Cons of the Options

### A Semgrep Community Edition template with existing rulesets, CodeQL as an optional extra

- Good, because it covers both languages with rulesets that exist.
- Bad, because it depends on registry content that changes over time.

### CodeQL only

- Good, because GitHub offers a default setup, free on public repositories.
- Bad, because the Laravel track would get no analysis at all.

### Semgrep with framework rulesets (`p/laravel`, `p/nextjs`)

- Good, because the names suggest framework coverage.
- Bad, because one does not exist and one is empty for the Community Edition.

### No SAST template

- Good, because it adds no CI time.
- Bad, because vulnerability patterns outside the Standard's rules go unexamined.

## More Information

- Semgrep: <https://semgrep.dev/docs/>; CLI reference (`--error`, `--metrics`, `--severity`):
  <https://semgrep.dev/docs/cli-reference>; ignoring findings:
  <https://semgrep.dev/docs/ignoring-files-folders-code>; rules license:
  <https://semgrep.dev/legal/rules-license>.
- CodeQL: <https://codeql.github.com/docs/>; supported languages:
  <https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/>; default
  setup:
  <https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning>.
- Ruleset contents, image digest and action pins: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0028](0028-license.md), [0032](0032-supply-chain-pinning.md),
  [0084](0084-secret-scanning-and-dependency-audits.md).
- Governs: the SAST template rules on the laravel, web and mobile tracks.
