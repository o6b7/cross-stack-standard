---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# License: MIT

## Context and Problem Statement

The Standard is meant to be copied: `adopt` writes its templates, configuration and vendored gate
code into adopters' repositories, where teams are expected to edit them. The license has to make
that effortless for companies and individuals alike, and every component the Standard ships has
to be compatible with it. Which license covers the plugin, templates, gate packages and
documentation?

## Decision Drivers

- Copying and editing templates inside private and commercial repositories must carry minimal
  obligations.
- One license for everything the repository ships.
- Nothing shipped may be under a copyleft or source-available license.
- A familiar license that needs no legal review for common use.

## Considered Options

- MIT
- Apache-2.0

## Decision Outcome

Chosen option: "MIT", because its only condition is keeping the copyright and permission notice with
copies or substantial portions, which suits a kit whose files are copied and edited in place.

- `LICENSE` holds the MIT text with the copyright holder "Qusai Abdullah"; it is part of the
  repository's first commit.
- Package metadata (`package.json`, `composer.json` and `plugin.json`) uses the SPDX identifier
  `MIT`.
- The Standard ships no source-available or copyleft code. For example, `eslint-plugin-sonarjs`
  ships its `no-commented-code` rule under the SONAR Source-Available License since version 3.0.0,
  so the Standard writes its own MIT rule instead ([0061](0061-own-eslint-plugin-no-commented-code.md)).
- The companion plugins ([0106](0106-companion-plugins.md)) are listed in the marketplace and
  fetched from their own repositories at pinned commits when the user installs them; their code is
  not vendored into this repository, so it needs no `NOTICE` file. If third-party code is ever vendored, its
  license and notices ship with it.

### Consequences

- Good, because adopters can copy, edit and sublicense templates inside their own code with only
  the notice to keep.
- Good, because one license covers code, templates and documentation, so adopters read one file.
- Bad, because MIT has no explicit patent grant, unlike Apache-2.0.

### Confirmation

`node scripts/check-identity.mjs` in the integrity job verifies the copyright holder in every
`LICENSE` file. The SPDX `license` fields, and the license of every new dependency or vendored
file, are checked in review.

## Pros and Cons of the Options

### MIT

- Good, because it is short, widely understood and imposes one condition.
- Bad, because it offers no explicit patent license.

### Apache-2.0

- Good, because it includes an explicit patent grant and patent-retaliation clause.
- Bad, because redistributors must mark modified files with a notice that they were changed and
  carry any `NOTICE` file forward, which is friction for templates that adopters are expected to
  edit.

## More Information

- MIT: <https://opensource.org/license/mit>; SPDX identifier: <https://spdx.org/licenses/MIT.html>.
- Apache License 2.0 (sections 3 and 4): <https://www.apache.org/licenses/LICENSE-2.0>.
- `eslint-plugin-sonarjs` license history and the third-party integrations' licenses are recorded
  in [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0106](0106-companion-plugins.md),
  [0061](0061-own-eslint-plugin-no-commented-code.md).
- Governs: licensing of everything in this repository; no adopter rule.
