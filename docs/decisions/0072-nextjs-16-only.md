---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# Supported Next.js line: 16.x only

## Context and Problem Statement

Next.js publishes a support policy with two supported majors at a time. 16.x is the Active LTS
line, released on 2025-10-21. 15.x is in Maintenance LTS, which receives only critical bug fixes
and essential security updates; each major stays in Maintenance LTS for two years after its initial
release, which puts the end of 15.x at about 2026-10-21, a few weeks from now. The policy page gives
no explicit end date.

The web track is written against 16.x. Next.js 16 renamed the `middleware` file convention to
`proxy`, which always runs on the Node.js runtime, and removed synchronous access to request APIs
such as `cookies()`. The proxy rules, the bff-auth templates and the lint rules assume both. The
security floor also differs per line: `>=16.3.6` on 16.x and `>=15.5.24` on 15.x today, with
16.3.7 and 15.5.27 announced ([0071](0071-nextjs-security-floor.md)).

Which Next.js lines does the Standard support in 1.0?

## Decision Drivers

- Supported lines must receive security fixes for as long as the Standard claims to support them.
- Every supported line doubles floors, template variants and fixture hosts.
- Adopters on an older line need a clear path, not a silent failure.

## Considered Options

- Support Next.js 16.x only
- Support 16.x and 15.x, each with its own patched floor, until 15.x reaches end of life

## Decision Outcome

Chosen option: "Support Next.js 16.x only", because 15.x leaves maintenance within weeks of the
first release, and supporting it would double the floor data, template variants and fixture hosts
for that short window.

- Templates, rules, fixtures and the floor data target 16.x only.
- A project on 15.x upgrades before adopting the web track; the framework's version 16 upgrade
  guide and codemods cover the move.
- Revisit only if adopters report being blocked on 15.x. A future major is a new decision.

### Consequences

- Good, because one set of templates and fixtures stays small and fully tested.
- Good, because no adopter is steered onto a line about to lose security fixes.
- Bad, because a project that cannot upgrade yet cannot adopt the web track until it does.

### Confirmation

The floor check ([0071](0071-nextjs-security-floor.md)) fails every 15.x release, because each
one is below `16.3.6`. The web fixture host and the smoke app run on 16.x only. Whether this record
is accepted is a maintainer decision, recorded by changing its status.

## Pros and Cons of the Options

### Support Next.js 16.x only

- Good, because every rule is tested on the line it governs.
- Bad, because 15.x projects must upgrade first.

### Support 16.x and 15.x, each with its own patched floor, until 15.x reaches end of life

- Good, because 15.x projects could adopt immediately.
- Bad, because the proxy rules, auth templates and fixtures would need `middleware` variants and a
  second floor, all for a line that stops receiving fixes about a month after they ship.

## More Information

- Support policy: <https://nextjs.org/support-policy>.
- Version 16 upgrade guide (proxy rename, async request APIs, codemods):
  <https://nextjs.org/docs/app/guides/upgrading/version-16>.
- Floors per line: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0059](0059-javascript-toolchain-pins.md), [0071](0071-nextjs-security-floor.md).
- Governs: the supported-version scope of every web rule for the `next` profile.
