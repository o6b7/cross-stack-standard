---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Adopter dependency updates: a Renovate template, with Dependabot documented

## Context and Problem Statement

Adopters pin exact versions and SHA-pinned actions ([0032](0032-supply-chain-pinning.md)), so
patches arrive only if something proposes them. An update bot with default settings does harm in
this toolchain:

- Each Expo SDK pins exact companion versions (SDK 57: `react` 19.2.3, `react-native` 0.86.3,
  `typescript` ~6.0.3, `jest` ~29.7.0, among others). Renovate's `expo` monorepo group covers only
  packages from the Expo repository, so `react` and `react-native` would move on their own.
- Some majors silently weaken gates: TypeScript 6.1 and later is outside typescript-eslint's
  supported range, ESLint 10 crashes the Next.js and Expo lint configurations with default
  settings, and jest-expo fails on Jest 30 ([0059](0059-javascript-toolchain-pins.md)).
- A release-age delay keeps brand-new releases out, but it also delays a framework's security
  patch. Updates Renovate classifies as security updates bypass the delay, but only for advisories
  in the databases it reads, which can lag a framework's own advisories by days.
- Renovate automerges a grouped branch only when every update in it may automerge.

Which update configuration do the adopter templates ship?

## Decision Drivers

- Framework security patches are proposed at once.
- Majors that weaken gates are held until the gates support them.
- Expo's SDK lockstep is respected.
- Review load stays bounded; nothing that can break a build merges unreviewed.
- Action digests stay pinned.
- Teams that cannot install a third-party app still have a documented path.

## Considered Options

- A Renovate template, with a documented Dependabot alternative
- A Dependabot template only
- No template; each team configures its own bot

## Decision Outcome

Chosen option: "A Renovate template, with a documented Dependabot alternative", because Renovate
expresses every rule above with maintained presets and per-package rules, while Dependabot needs
hand-written group patterns and sends security updates only to the default branch.

- **Base.** `config:recommended`, plus `:semanticCommits` and `helpers:pinGitHubActionDigests`,
  which `config:recommended` does not include; `group:allNonMajor`; a `minimumReleaseAge` delay
  (for example `"3 days"`), with `pinDigest` updates exempted as Renovate documents. The delay is
  set globally rather than through Renovate's `security:minimumReleaseAge*` presets, which cover
  npm but not Packagist.
- **Frameworks.** `next`, `laravel/framework` and `expo` form their own group without automerge.
  Majors never automerge. The template ships with automerge off; a team that enables it for other
  non-major updates uses Renovate's documented rule (minor and patch, current version not 0.x) and
  must require status checks first.
- **Next.js fast lane.** Patch updates of `next` get their own group with no release-age delay and
  immediate pull request creation; the security floor check backs this up
  ([0071](0071-nextjs-security-floor.md)).
- **Expo lockstep.** SDK-locked packages (`expo`, `expo-*`, `react`, `react-dom`, `react-native`,
  `@react-native/*`, `jest`, `jest-expo`, `@types/jest`, `typescript`, `eslint-config-expo` and
  the other SDK-bundled modules) are disabled for regular updates and move only in SDK-upgrade pull
  requests that run `npx expo install --fix`.
- **Held majors.** `allowedVersions` rules hold TypeScript below 6.1, ESLint below 10 and, on the
  mobile track, Jest below 30. Lifting a hold follows a Standard release that supports it.
  `vitest` and `@vitest/*` update together, because the coverage package requires the exact
  Vitest version.
- **Dependabot.** A documented `dependabot.yml` for `npm`, `composer` and `github-actions`, with
  hand-written `groups`, `ignore` entries for the held majors and SDK-locked packages, and
  `cooldown` (GitHub.com applies a default three-day cooldown to version updates).
- **Gate packages.** Once the packages are published, their updates arrive through the same bot
  ([0017](0017-vendored-gate-packages.md)); until then `upgrade` replaces the vendored copies.
- **Installation.** The Renovate app (Mend Renovate Community Cloud, free for public and private
  repositories) or the self-hosted Renovate action. Renovate reads its configuration from the
  default branch only.

### Consequences

- Good, because security patches for the web framework are proposed without the release-age
  delay.
- Good, because a TypeScript, ESLint or Jest major cannot quietly disable a gate.
- Good, because Expo upgrades stay whole: the SDK and its companions move together.
- Bad, because the recommended path depends on a third-party app with repository access.
- Bad, because held majors need a person to lift the hold later.
- Bad, because the Dependabot alternative is weaker: groups are written by hand, there are no
  maintained monorepo groups, and security updates always target the default branch.

### Confirmation

- A `doctor` check reads the project's Renovate or Dependabot configuration and requires the
  frameworks group without automerge, the held majors and, on mobile, the SDK lock. GUARDED;
  evasions: the bot is not installed, its pull requests are ignored, or a person bumps a held
  package by hand. The toolchain pin checks catch the last case for TypeScript and ESLint
  ([0059](0059-javascript-toolchain-pins.md)).
- Validity of the Renovate template: Review, checked before each release. A CI job running
  `renovate-config-validator --strict` is not built yet: it needs Node.js 24.11 or later, and
  `npx --package renovate@<exact version>` pins only the top-level package while its transitive
  dependencies resolve unlocked ([0032](0032-supply-chain-pinning.md)). Adding that job, with a
  locked install, is a revisit item.
- Merging update pull requests promptly is Review.

The check has a clean and a violation fixture ([0004](0004-fail-then-pass.md)); the rule enters
the registry as REVIEW and takes this label when it passes both.

## Pros and Cons of the Options

### A Renovate template, with a documented Dependabot alternative

- Good, because `group:monorepos` and `group:allNonMajor` group npm, Composer and Actions updates.
- Good, because `minimumReleaseAge` is settable per package and datasource.
- Bad, because it requires installing an app or running a self-hosted job.

### A Dependabot template only

- Good, because it is built into GitHub and updates SHA-pinned actions with their version
  comments.
- Good, because its `cooldown` settings can exclude a package such as `next` from the delay.
- Bad, because its groups and holds are hand-written patterns with no maintained monorepo groups.

### No template; each team configures its own bot

- Good, because teams keep full control.
- Bad, because default configurations group SDK-locked packages and propose gate-weakening
  majors.

## More Information

- Renovate: <https://docs.renovatebot.com/>; options (`minimumReleaseAge`, `allowedVersions`,
  `packageRules`): <https://docs.renovatebot.com/configuration-options/>; release age:
  <https://docs.renovatebot.com/key-concepts/minimum-release-age/>; automerge:
  <https://docs.renovatebot.com/key-concepts/automerge/>; presets:
  <https://docs.renovatebot.com/presets-config/>.
- Dependabot options (`groups`, `ignore`, `cooldown`, `target-branch`):
  <https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference>.
- Expo install: <https://docs.expo.dev/more/expo-cli/>; typescript-eslint supported versions:
  <https://typescript-eslint.io/users/dependency-versions/>; jest-expo on Jest 30:
  <https://github.com/expo/expo/issues/48808>.
- Preset contents, SDK pins and hosting terms: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0017](0017-vendored-gate-packages.md), [0032](0032-supply-chain-pinning.md),
  [0033](0033-maintainers-dependency-updater.md), [0059](0059-javascript-toolchain-pins.md),
  [0071](0071-nextjs-security-floor.md).
- Governs: the dependency-update rules in the adopter templates for every track.
