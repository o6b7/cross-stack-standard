# Stack-first

The installed library owns its concern. The Standard adds no library a project does not already
have, except its own gate tools, which are pre-exempted. This is Tier-1 invariant 1 and applies to
every track ([ADR 0006][0006], [ADR 0007][0007]).

## Rules

- **PROC-005** Record the stack table in the manifest, every concern filled and every named package installed _(Tier 1)_
- **PROC-006** Prefer the installed library's idiomatic API, then its escape hatch, and explain hand-written code _(Tier 1)_
- **PROC-007** Install at most one library per concern, test runners included _(Tier 1)_
- **PROC-008** Import a deprecated library only inside its declared legacy paths, so new code uses the winner _(Tier 1)_
- **PROC-009** Land each new runtime dependency with an ADR that names the alternatives considered _(Tier 1)_
- **UI-005** Style with one system: no preprocessor stylesheets, CSS-in-JS modules or `<style jsx>` blocks _(Tier 1)_
- **UI-006** Hand-write CSS only where the utility system falls short, each block with a why-comment _(off by default)_

One declared mechanism per cross-cutting concern, including mechanisms the project built itself:

- **WEB-037** Create the HTTP client once and send every request through the shared fetcher
- **WEB-040** Log only through the logger module; no direct console calls
- **WEB-035** Show mutation feedback once, from the central mutation cache; opt out only with silent meta
- **MOB-015** Show mutation feedback once, from the central mutation cache; opt out only with silent meta _(off by default)_
- **BE-096** Record audit events only through the audit-trail mechanism declared in the stack table
- **BE-095** Poll for live surfaces; add server broadcasting packages only with a recorded decision
- **WEB-039** Poll live data through the server-state cache; import a realtime client only with a recorded ADR

## Building the concern table

Read `composer.json` and every `package.json` (a monorepo has one per track root). For each of the
fifteen concerns, name the installed package that serves it, or `none` with how the concern is met.
Where a concern is `none`, the Standard's pattern for it applies with no new dependency: for example
plain controlled state for forms ([ADR 0067][0067]) or a small hand-written validator in the typed
env module ([ADR 0069][0069]).

| Concern      | Where the choice matters                                                                  |
| ------------ | ----------------------------------------------------------------------------------------- |
| Styling      | One styling system (UI-005); tokens (UI-003, UI-007); hand-written CSS only with a reason |
| State        | Server data never in a client store (WEB-014, MOB-013); a store only for shared UI state  |
| Server state | Query-key factories (WEB-033); one query client on mobile (MOB-014)                       |
| Forms        | The installed form library first; server errors mapped to fields (WEB-043, MOB-024)       |
| Validation   | FormRequests on Laravel (BE-018, BE-019); the installed schema validator on clients       |
| HTTP         | One client instance and one shared fetcher (WEB-037); multipart through it (MOB-028)      |
| i18n         | The installed library's routing and message conventions (I18N-021, I18N-023)              |
| Dates        | The installed date library or `Intl`; one business time zone on the web (I18N-022)        |
| Test runner  | Exactly one per stack (PROC-007); Pest replaces the PHPUnit runner                        |
| E2E          | One web journey with an accessibility scan (WEB-032)                                      |
| Icons        | The installed icon set; directional icons mirrored for RTL (I18N-014)                     |
| Charts       | Colors only through the chart-token module (UI-008)                                       |
| Auth         | An installed auth library keeps the concern; otherwise the `bff-auth` module              |
| Env          | The typed env module (WEB-011, MOB-022); `config()`, never `env()`, in Laravel code       |
| Logging      | The logger module (WEB-040); constant messages with context arrays (BE-090)               |

## Preference order

1. The library's idiomatic API, as its documentation shows it.
2. Its documented escape hatch (a plugin point, a lower-level API, a configuration option).
3. Hand-written code, as the last resort when the API and the escape hatch both fall short, with a
   comment that names the gap:

```ts
// Hand-written: <library> has no API for <need> (see <documentation section>).
// Replace with the library call once it supports this.
```

An outdated library is upgraded, not worked around. A project that already has a package for a
pattern the Standard describes (an actions package, a problem-details library, a typed-env library)
follows that package's conventions instead.

## One mechanism per concern

- When two installed mechanisms serve one concern, the project declares a winner and a purpose for
  each. New code imports only the winner; the other stays inside its declared legacy paths until it
  is removed (PROC-008).
- The same holds for mechanisms the project built: one HTTP client and fetcher, one logger module,
  one path for mutation feedback, one audit-trail mechanism per purpose.
- Where two mechanisms legitimately coexist (a field-level audit log and a user-facing activity
  feed), each has a declared purpose and every new feature names the one it writes to.

## Adding a dependency

Before adding any runtime dependency:

1. Check that no installed package already serves the concern, including the competing groups the
   project declares.
2. Name the alternatives, stop and ask the user, and record the choice in an ADR (PROC-009).
3. Never keep two libraries for one concern (PROC-007), unless one is declared as being migrated
   away from.

The manifest's `stack` section declares extra competing groups and concerns under migration. In
0.1.0 the schema accepts exactly this shape; concern names include `state`, `server-state`, `forms`,
`validation`, `http`, `dates`, `styling`, `unit-tests` and `e2e-tests`:

```json
{
  "stack": {
    "competingGroups": [{ "concern": "charts", "packages": ["recharts", "chart.js"] }],
    "dates": { "deprecated": ["moment"] }
  }
}
```

## Pre-exempted tools

The dev tools the Standard ships for its gates are never competitors: Pest, Larastan,
dependency-cruiser, knip, jscpd, lefthook, commitlint and gitleaks, plus the kit's vendored gate
packages under `.cross-stack/vendor/` once they ship. Pest runs existing PHPUnit test classes unchanged, so
adopting it replaces the runner instead of adding a second one ([ADR 0036][0036]). Agent-oriented
dev tools such as `laravel/pao` and `laravel/pail` are optional suggestions: the Standard neither
requires nor removes them.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them while writing and reviewing code,
and do not describe them as enforced by a gate. Their planned gates (a stack-table check for
PROC-005, a competing-dependency check for PROC-007, an import-boundary lint rule for PROC-008, a
new-dependency ADR check for PROC-009) arrive in later 0.x releases. The `enforcement` field in
`${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative: a rule it marks FORCED or GUARDED has a
shipped gate.

## Decision records

- [ADR 0006][0006]: Stack-first: the installed library wins; Standard enforcement tools are pre-exempted
- [ADR 0007][0007]: One declared mechanism per cross-cutting concern
- [ADR 0036][0036]: Pest replaces the PHPUnit runner; architecture presets
- [ADR 0067][0067]: Forms: installed form library first, required client validation, server field errors mapped to fields
- [ADR 0069][0069]: Typed environment module per JavaScript app; raw process.env banned by a three-rule combination

[0006]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0006-stack-first.md
[0007]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0007-one-mechanism-per-concern.md
[0036]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0036-pest-replaces-phpunit-runner.md
[0067]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0067-forms.md
[0069]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0069-typed-env-module.md
