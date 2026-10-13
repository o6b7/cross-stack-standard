---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Opt-in modules declared in the project manifest, installed as whole units

## Context and Problem Statement

Multi-tenancy, a fixed set of locales and a response envelope are right for some products and
wrong for others. A public standard cannot assume any of them. Features of this kind are also
dangerous to adopt partially. A common defect is a copied mechanism without its
registration, for example a tenant-scoping trait without the middleware that sets the tenant: every
test passes and nothing is isolated. Another is security-critical plumbing, such as an auth proxy or
cookie helpers, that an agent re-derives from a prose description and gets subtly wrong (a missing
header allow-list, a cookie flag, an origin check).

How does the Standard offer these capabilities without assuming them, and without half-adopted
states?

## Decision Drivers

- Capabilities that only some projects need must be optional and declared.
- A module is either fully present or absent; half-states are the failure mode.
- Security-critical code must come from a versioned, tested source, not from prose.
- Upgrades must be able to replace that code safely.

## Considered Options

- Opt-in modules declared in the manifest, adopted and upgraded as whole units from versioned
  templates
- Keep the capabilities as rules that apply to every project
- Per-rule toggles with no module concept
- A separate plugin per capability

## Decision Outcome

Chosen option: "Opt-in modules declared in the manifest, adopted and upgraded as whole units from
versioned templates", because it removes the product-specific assumptions while making partial
adoption structurally impossible.

- **Modules.** `tenancy`, `i18n` (with a `locales` list), `api-contract`, `bff-auth` (Next.js
  profile only), `design`, `browser-check` and `observability` (after 1.0). They are declared under
  `modules` in `.cross-stack/standard.json` and validated by the published schema. Defaults are a
  separate decision ([0011](0011-default-module-set.md)). `design` and `browser-check` switch on the
  rules for the impeccable and browser companion plugins (Playwright MCP or Chrome DevTools MCP;
  [0106](0106-companion-plugins.md), [0108](0108-playwright-mcp-for-browser-checks.md)).
- **Whole units.** A module is adopted as a complete unit: files, registration, route groups,
  seeds, gates and tests. A module that is not declared leaves no substrate behind: no dormant
  trait, no unused middleware, no half-wired locale.
- **Consumed, not edited.** Security-critical plumbing (the BFF proxy, cookie helpers, auth routes,
  the tenancy mechanism) comes from versioned templates. Projects consume it rather than edit it,
  and an agent never re-derives it from prose. The plugin records a hash of every template file per
  version, so `upgrade` can tell an untouched template from a local change and replace it safely
  ([0023](0023-adopter-manifest-and-upgrade.md)).
- **Module rules follow their module.** A rule that belongs to a module is on whenever the module
  is on (`defaultEnabled: true` in the registry). A module rule stays off inside its module, as a
  second opt-in through its own `rules.<RULE-ID>.enabled` switch or a module option, only when it
  covers an optional sub-feature of the module (such as host-mapped tenants) or rests on a decision
  record that is still proposed or ships after the current release
  ([0024](0024-versioning.md)); the registry names that switch in the rule's `configurable`
  field.
- **Silent-breakage checklist.** Each module's README lists the ways it can break without an error
  (for example a route group that lost its middleware), and every item has a test that fails
  loudly.

### Consequences

- Good, because a project that is not multi-tenant, or ships one locale, or wants a different
  response shape, is not bound by rules written for those cases.
- Good, because a module's gates and tests arrive with it, so adopting a module cannot skip its
  enforcement.
- Good, because upgrades can replace security-critical templates without guessing.
- Bad, because a project that must customise a template takes it over and loses automatic
  upgrades for that file.
- Bad, because module combinations multiply the fixture matrix ([0004](0004-fail-then-pass.md)).

### Confirmation

The manifest schema validates module names, requires `locales` when `i18n` is on, and requires the
`web` track with the `next` profile when `bff-auth` is on. `scripts/build-plugin-data.mjs --check`
keeps the per-version template hashes current in CI. Module rules carry their module in the
registry's `module` field, and their fixtures run with the module enabled. That an undeclared
module leaves no substrate, and that every checklist item has a failing test, are checked in
review.

## Pros and Cons of the Options

### Opt-in modules declared in the manifest, adopted and upgraded as whole units from versioned templates

- Good, because a module is all-or-nothing by construction.
- Bad, because templates constrain how much a project can customise.

### Keep the capabilities as rules that apply to every project

- Good, because every project looks the same.
- Bad, because most projects would carry rules and plumbing they do not need.

### Per-rule toggles with no module concept

- Good, because they are fine-grained.
- Bad, because they allow exactly the half-states this decision exists to prevent.

### A separate plugin per capability

- Good, because each capability versions independently.
- Bad, because rules and gates of one project would come from several versions that were never
  tested together.

## More Information

- Manifest schema: [`schemas/standard.schema.json`](../../schemas/standard.schema.json).
- Related: [0011](0011-default-module-set.md), [0023](0023-adopter-manifest-and-upgrade.md),
  [0057](0057-tenancy-module.md), [0073](0073-bff-auth-module.md), [0077](0077-i18n-module.md).
- Governs: the `module` field of every rule, the manifest's `modules` and `locales` settings, and
  the module templates in the kit.
