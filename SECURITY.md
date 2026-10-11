# Security policy

## Supported versions

| Version | Supported                                 |
| ------- | ----------------------------------------- |
| 0.1.x   | Yes                                       |
| < 0.1   | No (there are no earlier public releases) |

Fixes are released as a new patch version of the latest supported line. While the Standard is in
0.x, only the latest 0.y.x line is supported.

## Reporting a vulnerability

Please report vulnerabilities privately. **Do not open a public issue, pull request or discussion
for a security problem.**

- **Email:** [qusaii.abdullah@gmail.com](mailto:qusaii.abdullah@gmail.com), with a subject that
  starts with `[security] cross-stack-standard`.
- **GitHub private vulnerability reporting:** on the repository's
  [Security tab](https://github.com/o6b7/cross-stack-standard/security), choose **Report a
  vulnerability**. This works once private vulnerability reporting is enabled for the repository;
  if the button is not there, use email.

Include what you can of:

- the affected version (`claude plugin details cross-stack-standard` shows it, and projects record
  it in `.cross-stack/standard.json`);
- the component: a hook, the project tool, a skill, a kit template or a documented practice;
- steps to reproduce, a proof of concept, and the impact you expect;
- whether you want to be credited, and how.

## What happens next

The Standard has one maintainer, so timelines are best effort. The maintainer aims to acknowledge a
report within 7 days, to confirm or rule out the problem and agree a fix and disclosure date with
you, and to publish the fix in a patch release with a security advisory that credits you if you
wish. Please keep the report confidential until then.

## Scope

In scope:

- the plugin's hooks and scripts (`plugins/cross-stack-standard/`), for example a way to make them
  run code they should not, reach the network, or leak data;
- the project tool `.cross-stack/bin/cross-stack.mjs` and every kit template copied into adopting
  projects, including, as they ship, security plumbing such as the BFF proxy, cookie helpers and
  tenancy code;
- skills or documentation that recommend an insecure practice;
- a pin, checksum or verified version in this repository that points at compromised or wrong
  content.

Out of scope, and better reported elsewhere:

- vulnerabilities in third-party tools the Standard uses or integrates (Claude Code, ESLint,
  PHPStan, Pest, impeccable, Chrome DevTools MCP and others): report them to their maintainers;
- a known evasion that a GUARDED rule already lists: open a regular issue if you think it should be
  closed;
- a rule that misses a violation (a false negative) with no security impact: open a regular issue.

## How the plugin is kept safe

The [security model](docs/security.md) describes what the plugin runs, why its hooks make no
network calls, how third-party integrations are pinned and configured, and which security rules the
Standard applies to adopting projects.
