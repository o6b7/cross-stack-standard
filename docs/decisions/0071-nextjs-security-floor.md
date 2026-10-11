---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Next.js security floor in one data file, gate-enforced

## Context and Problem Statement

Next.js ships security fixes only on the newest minor of each supported major. In five months of
2026 the lowest safe 16.x release moved from 16.2.6 to 16.2.11, then 16.3.3, then 16.3.6. The
16.0, 16.1 and 16.2 lines have no patched release for the critical August and September advisories,
so "any 16.x" is not a safe floor. The framework team now announces security releases in advance:
16.3.7 is announced for 2026-09-30.

The usual safety nets lag. The critical advisory fixed in 16.3.6 (GHSA-vcvr-r3jv-pc5j, remote code
execution in `next/og`) was published only as a repository advisory. Days later, npm's bulk
advisory endpoint (used by `npm audit`) and OSV still reported nothing for the affected versions, and
the advisory was absent from the global GitHub Advisory Database, so Dependabot alerts and Renovate
vulnerability pull requests did not fire either. A common defect is a project whose only defence is
an audit step that stays green while a known critical advisory applies.

Where does the Standard record the minimum patched Next.js version, and how is it enforced?

## Decision Drivers

- The floor must not depend on advisory databases catching up.
- Docs, templates and gates must never disagree about the number.
- Raising the floor must be one reviewed change, not a search through the repository.
- A patched release must reach adopters quickly.

## Considered Options

- One data file read by docs, templates and a CI floor check
- Rely on `npm audit`, OSV and update bots
- Write the minimum version into docs and templates by hand
- Pin an exact Next.js version in the templates, with no floor

## Decision Outcome

Chosen option: "One data file read by docs, templates and a CI floor check", because it is the only
option that enforces the floor on the day an advisory is published and keeps every copy of the
number in step.

- **One source when the gate ships.** When SEC-045 is implemented, the minimum patched version will
  live in one data file shipped with the plugin. The docs, the templates' `next` range and the floor
  check will all read it. SEC-045 is still REVIEW in 0.1.0, so that shared data file and check do not
  ship yet. The current Next.js scaffold pins create-next-app 16.3.8, the patched release published
  on 2026-09-30. Re-check the upstream security release announced for 2026-10-14 before tagging.
- **Independent of databases.** The floor is set from the framework's own advisories and security
  release posts, not from what `npm audit` or OSV report. Audits still run as a second net
  ([0084](0084-secret-scanning-and-dependency-audits.md)).
- **Fast lane.** The adopter Renovate template gives `next` patch updates no release-age delay, so a
  patched release is proposed at once ([0095](0095-adopter-dependency-updates.md)).
- **Raising it.** A floor change follows the upstream-event policy
  ([0032](0032-supply-chain-pinning.md)): a `chore(deps)` pull request that updates the data file
  and [verified-versions.md](../maintainers/verified-versions.md) together, with the advisory
  links. The same pull request moves the smoke apps' `create-next-app` pin, which writes its own
  `next` version exactly ([0004](0004-fail-then-pass.md)).

The floor is part of the security model, not a substitute for it: the proxy is UX only and every
Route Handler and Server Action checks the session again
([0070](0070-proxy-ux-only-session-reverification.md)).

### Consequences

- Good, because a vulnerable `next` fails `check` even while audit tools report nothing.
- Good, because docs, templates and gates cannot drift apart.
- Bad, because adopters must upgrade within a minor line promptly after each security release, or
  their build fails.
- Bad, because someone has to watch the framework's advisories; the floor is only as fresh as the
  last watch.

### Confirmation

- The kit's floor check, run by `doctor --ci` in the web track's `check` chain, compares the `next`
  version resolved in the lockfile with the floor and fails below it. FORCED, because it reads the
  installed version, not the declared range.
- In this repository, a freshness test fails when a doc or template states a Next.js minimum that
  differs from the data file.
- A non-required watch job on the integration branch compares the floor with the framework's
  published releases and advisories and reports when a raise is due. It informs; it does not gate.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### One data file read by docs, templates and a CI floor check

- Good, because enforcement does not wait for any database.
- Bad, because the watch and the raise are manual work.

### Rely on `npm audit`, OSV and update bots

- Good, because nothing extra is maintained.
- Bad, because a repository-only advisory is invisible to all of them, as happened in September 2026.

### Write the minimum version into docs and templates by hand

- Good, because it is simple.
- Bad, because copies drift, and nothing fails when a project runs below the minimum.

### Pin an exact Next.js version in the templates, with no floor

- Good, because builds are reproducible.
- Bad, because it says nothing about safety and still needs someone to move the pin.

## More Information

- Framework advisories: <https://github.com/vercel/next.js/security/advisories>; the advisory that
  lagged: <https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j>.
- Security releases: <https://nextjs.org/blog/august-2026-security-release>,
  <https://nextjs.org/blog/nextjs-security-update-september-22-2026>,
  <https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026>; the advance-notice
  programme: <https://nextjs.org/blog/next-security-release-program>.
- Renovate vulnerability alerts: <https://docs.renovatebot.com/configuration-options/#vulnerabilityalerts>.
- Related: [0032](0032-supply-chain-pinning.md), [0070](0070-proxy-ux-only-session-reverification.md),
  [0072](0072-nextjs-16-only.md), [0095](0095-adopter-dependency-updates.md).
- Governs: the web security rule for the minimum patched Next.js version and the pin check behind
  it.
