---
status: accepted
date: 2026-09-26
decision-makers: Qusai Abdullah
---

# Default module set

## Context and Problem Statement

A project declares its optional modules in `.cross-stack/standard.json`
([0010](0010-opt-in-modules.md)). Each module is `true`, `false` or an object, and a project may
leave any module out. Something has to decide what an omitted module means, and that decision is
what every new adopter meets on the first `check` run after adopting.

Defaults that are too narrow leave a Laravel plus Next.js project without the contract and locale
gates it needs unless someone knows to switch them on. Defaults that are too broad fail the first
run on concerns the project does not have, such as tenant isolation in a single-tenant app.
Defaults are also part of the versioning contract: switching a default on later can newly fail an
adopter's build, which makes it a MAJOR change ([0024](0024-versioning.md)).

Which modules are on when the manifest does not say?

## Decision Drivers

- The first run after adopting fails only on concerns the project actually has.
- A full-stack project gets the cross-stack gates without first having to discover the modules.
- A default follows from facts the manifest already records (tracks, profile, locales), never from
  a guess about the code.
- Modules that install third-party tools or need an external account stay an explicit choice.
- Changing a default later is expensive, so the first set should be one the Standard can keep.

## Considered Options

- Defaults derived from the declared tracks, profile and locales
- Every module off by default
- Every module that applies to the declared tracks on by default

## Decision Outcome

Chosen option: "Defaults derived from the declared tracks, profile and locales", because it gives
full-stack projects the contract and locale gates on the first run, while a single-stack or
single-locale project gets none of the modules it has no use for.

| Module          | Default | Condition or reason                                                                                                                                                                                                           |
| --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-contract`  | on      | `tracks` includes `laravel`; the `resource` success shape ([0052](0052-api-success-shape.md)), RFC 9457 errors ([0053](0053-rfc-9457-problem-details.md)) and the generated contract ([0054](0054-generated-api-contract.md)) |
| `i18n`          | on      | `locales` lists more than one locale                                                                                                                                                                                          |
| `bff-auth`      | on      | `tracks` includes `web` with the `next` profile, and also `laravel`                                                                                                                                                           |
| `tenancy`       | off     | multi-tenancy is a product fact the kit cannot infer from manifests                                                                                                                                                           |
| `design`        | off     | on when adopt installs the impeccable companion the user ticked ([0106](0106-companion-plugins.md))                                                                                                                           |
| `browser-check` | off     | on when adopt installs the Chrome DevTools MCP companion the user ticked ([0106](0106-companion-plugins.md))                                                                                                                  |
| `observability` | off     | needs an error-tracking account ([0099](0099-observability-module.md))                                                                                                                                                        |

- **Explicit values win.** A value in the manifest always overrides the default, for example
  `"bff-auth": false` for a Next.js app that keeps its own authentication.
- **Where the defaults live.** They are documented in the configuration docs. The published
  manifest schema gains them when this record is accepted: the four unconditional defaults as
  schema `default` values, the three conditional ones in the module's schema description. Until
  then the schema carries no module defaults. `adopt` writes the resolved module set into the
  manifest, so the file itself states what is on.
- **Changing them.** Switching a default on later is a MAJOR release for every project whose
  manifest omits that module ([0024](0024-versioning.md)).

### Consequences

- Good, because a Laravel plus Next.js project gets problem-details errors, the generated contract
  and the BFF gates without extra configuration.
- Good, because single-stack and single-locale projects run none of the cross-stack modules.
- Good, because no third-party tool, MCP server or external account is enabled by default.
- Good, because the defaults depend only on manifest fields, so `adopt`, `doctor` and the gates
  resolve the same set.
- Bad, because conditional defaults are harder to explain than "everything off".
- Bad, because a full-stack project that does not want a BFF has to switch `bff-auth` off.
- Bad, because every later change to a default is a MAJOR release.

### Confirmation

The manifest is validated against the published schema by the Standard's configuration check,
which runs in every track's `check`. That the configuration docs, the schema descriptions and the
resolved defaults agree is a Review item on any change to them, and a changed default is checked
against the versioning policy in release review.

## Pros and Cons of the Options

### Defaults derived from the declared tracks, profile and locales

- Good, because each default matches a condition the project has declared.
- Good, because the most common full-stack shape is covered on the first run.
- Neutral, because the rule is a short table rather than one word.
- Bad, because every new track or profile needs its own default decision.

### Every module off by default

- Good, because the first run is as small as possible and the rule needs no table.
- Good, because every module the project runs is one it chose.
- Bad, because most full-stack projects would run without contract and locale gates, and the
  Standard's cross-stack value would depend on adopters finding the modules.

### Every module that applies to the declared tracks on by default

- Good, because nothing applicable is missed.
- Bad, because `tenancy` would fail single-tenant apps, and `design` and `browser-check` would
  install third-party tools that nobody chose.

## More Information

- JSON Schema `default` keyword: <https://json-schema.org/draft/2020-12/json-schema-validation#section-9.2>
- RFC 9457, Problem Details for HTTP APIs: <https://www.rfc-editor.org/rfc/rfc9457>
- Related: [0010](0010-opt-in-modules.md) (modules),
  [0023](0023-adopter-manifest-and-upgrade.md) (the manifest), [0024](0024-versioning.md)
  (SemVer by build impact), [0052](0052-api-success-shape.md),
  [0053](0053-rfc-9457-problem-details.md) and [0054](0054-generated-api-contract.md)
  (api-contract), [0057](0057-tenancy-module.md) (tenancy), [0073](0073-bff-auth-module.md)
  (bff-auth), [0077](0077-i18n-module.md) (i18n).
- Governs: the default state of the api-contract, i18n, bff-auth, tenancy, design, browser-check
  and observability module rules, and the configuration rules that validate the manifest.
- Whether this record is accepted is a maintainer decision, recorded by changing its status.
