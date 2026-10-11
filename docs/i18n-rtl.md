# Internationalization and right-to-left layouts

Arabic and other right-to-left languages are a first-class part of the Standard, not an
afterthought. This page explains the `i18n` module, what it requires on each track, and exactly
what is enforced today.

> **Status in 0.1.0.** None of the rules on this page is enforced by a gate yet. All are REVIEW:
> Claude follows them through the skill and `/cross-stack-standard:audit` reports them. Of the 43
> rules in the `i18n` module, 13 target FORCED, 24 target GUARDED and 6 stay REVIEW by design. The
> Target column below shows where each rule is headed; the [roadmap](../ROADMAP.md) shows when.

## Turning it on

Declare your locales in `.cross-stack/standard.json`. The first entry is the source locale:

```json
{
  "tracks": ["laravel", "web", "mobile"],
  "modules": { "i18n": true },
  "locales": ["en", "ar"]
}
```

The module is on by default whenever `locales` lists more than one locale
([ADR 0011](decisions/0011-default-module-set.md)). Locales are canonical BCP 47 tags (`en`, `ar`,
`ar-SA`); the manifest schema rejects other forms. Each locale's direction comes from one
hard-coded list of right-to-left locales, never from a per-project setting that could drift
(I18N-044). With the module off, the project carries no locale plumbing at all (I18N-009): there is
no half-state ([ADR 0077](decisions/0077-i18n-module.md)).

## Direction-safe styling

Layouts use logical directions, so the same code renders correctly left-to-right and right-to-left
([ADR 0081](decisions/0081-logical-direction-styling.md)).

| Instead of                                  | Use                                   |
| ------------------------------------------- | ------------------------------------- |
| `ml-*`, `mr-*`, `pl-*`, `pr-*` (Tailwind)   | `ms-*`, `me-*`, `ps-*`, `pe-*`        |
| `left-*`, `right-*`                         | `inset-s-*`, `inset-e-*`              |
| `text-left`, `text-right`                   | `text-start`, `text-end`              |
| `marginLeft`, `right` (web style objects)   | `marginInlineStart`, `insetInlineEnd` |
| `marginLeft`, `paddingRight` (React Native) | `marginStart`, `paddingEnd`           |

| Rule     | Requirement                                                                                           | Target  |
| -------- | ----------------------------------------------------------------------------------------------------- | ------- |
| I18N-012 | Logical-direction utility classes on the web, never physical left and right                           | GUARDED |
| I18N-013 | Logical properties in style objects on web and mobile                                                 | GUARDED |
| I18N-014 | A value that must stay physical carries its right-to-left counterpart; directional icons are mirrored | REVIEW  |

Planned gate: the Standard's own ESLint rule `cross-stack/no-physical-direction`, active whenever the
configured locales include a right-to-left locale. Existing violations go into ESLint's bulk
suppressions, which only shrink.

## Locale files stay in step

Missing, empty or untranslated strings are what users actually see go wrong, so parity is checked
per key, per locale ([ADR 0080](decisions/0080-locale-parity.md)).

| Rule     | Requirement                                                                                           | Target  |
| -------- | ----------------------------------------------------------------------------------------------------- | ------- |
| I18N-033 | Every locale has the source locale's keys (plural forms grouped by base key)                          | FORCED  |
| I18N-034 | No empty or whitespace-only values                                                                    | FORCED  |
| I18N-035 | A value identical to the source locale's only for an allowlisted key                                  | FORCED  |
| I18N-036 | The same placeholders in every locale, parsed with the track's syntax (ICU on web, i18next on mobile) | FORCED  |
| I18N-042 | Each locale's plural forms match what `Intl.PluralRules` reports for it (Arabic has six)              | FORCED  |
| I18N-015 | Web code references only keys that exist in the source locale's typed messages                        | GUARDED |
| I18N-031 | Mobile code references only keys that exist in the source locale's typed resources                    | GUARDED |
| I18N-006 | Server language files stay in parity across the configured locales                                    | FORCED  |
| I18N-007 | Every statically referenced server translation key exists in every locale                             | GUARDED |
| I18N-010 | A person writes or reviews translations; none are generated just to satisfy parity                    | REVIEW  |

Planned gates: one parity checker shared by web and mobile, a Pest test and a PHPStan rule on the
server.

## Copy lives in message files

| Rule     | Requirement                                                                                            | Target  |
| -------- | ------------------------------------------------------------------------------------------------------ | ------- |
| I18N-016 | User-facing copy in message files, not JSX literals                                                    | GUARDED |
| I18N-017 | No source-script literal in a script used only by non-source locales                                   | FORCED  |
| I18N-018 | Never pick copy by comparing the locale with a literal                                                 | GUARDED |
| I18N-019 | Never render backend `*_label` fields as labels on a client                                            | GUARDED |
| I18N-037 | Read multilingual content only through the localized-field helper, never `*_<locale>` keys             | GUARDED |
| I18N-020 | The localized-field helper prefers the reader's locale and falls back through the chain                | GUARDED |
| I18N-038 | Screens show their own copy for expected errors, keyed by problem type, with server detail as fallback | REVIEW  |

Labels come from message files; user-entered multilingual content goes through one helper
([ADR 0078](decisions/0078-labels-and-multilingual-content.md)).

## Web (Next.js)

URLs carry the locale, and nothing switches it behind the user's back
([ADR 0079](decisions/0079-web-locale-routing.md)).

| Rule     | Requirement                                                                                 | Target  |
| -------- | ------------------------------------------------------------------------------------------- | ------- |
| I18N-021 | Every route is locale-prefixed, with no auto-detection and a project-specific locale cookie | GUARDED |
| I18N-026 | Every page route sits under the locale segment                                              | FORCED  |
| I18N-023 | Navigate only through the locale-aware wrappers                                             | GUARDED |
| I18N-024 | Never hand-build locale-prefixed hrefs                                                      | GUARDED |
| I18N-025 | One helper derives the current locale from the URL, accepting only configured locales       | GUARDED |
| I18N-027 | `lang` and `dir` on the document root follow the active locale                              | GUARDED |
| I18N-022 | A pinned business time zone in the i18n request configuration                               | GUARDED |
| I18N-039 | The web client sends the active UI locale as `Accept-Language`                              | GUARDED |

With next-intl installed these map to its routing options (`localePrefix: "always"`,
`localeDetection: false`, a named `localeCookie`) and `createNavigation`; another installed i18n
library gets the equivalent configuration, following stack-first.

## Mobile (Expo)

The operating system's per-app language setting is the primary path; one utility is the fallback
for an in-app picker ([ADR 0082](decisions/0082-mobile-rtl-contract.md)).

| Rule     | Requirement                                                                                            | Target  |
| -------- | ------------------------------------------------------------------------------------------------------ | ------- |
| I18N-030 | Every configured locale is declared in `supportedLocales`; `supportsRTL` and `forcesRTL` are never set | FORCED  |
| I18N-029 | Layout direction changes, and the reload for a language, happen only in `setAppLanguage()`             | GUARDED |
| I18N-040 | Only the language module reads the device locale, and it never switches automatically                  | GUARDED |

`setAppLanguage()` persists the choice through the storage module, applies the direction when it
must change and reloads the app once, with a guard against reload loops. The contract is
re-verified at every Expo SDK upgrade.

## Laravel

The server phrases messages in the reader's language, because only it can word field-level
validation errors correctly.

| Rule     | Requirement                                                                                    | Target  |
| -------- | ---------------------------------------------------------------------------------------------- | ------- |
| I18N-003 | The locale is set before authentication, throttling and route-model binding on every API route | FORCED  |
| I18N-043 | Responses use the requested configured locale, falling back to the default                     | GUARDED |
| I18N-001 | User-visible server messages come from translation keys, never literal sentences               | GUARDED |
| I18N-002 | Every notifiable model implements `HasLocalePreference`, so mail uses the recipient's locale   | FORCED  |
| I18N-004 | Only the locale middleware and the locale-scoping helpers set the application locale           | GUARDED |
| I18N-005 | The backend's supported locales equal the manifest's `locales`                                 | FORCED  |
| I18N-008 | Every validated field's attribute name is translated in every configured locale                | GUARDED |

## Planned after 1.0

- **Explicit Intl formatting**, including Hijri calendars and Arabic-Indic digits: calendar and
  numbering system always passed, one shared formatter, locale digits normalized in numeric input
  (I18N-032, off by default; [ADR 0096](decisions/0096-explicit-intl-formatting.md)).
- **Translatable content storage**: per-locale columns or JSON translations, never mixed within a
  model (I18N-011, off by default; [ADR 0097](decisions/0097-translatable-content-storage.md)).
- **On-device RTL flows** with Maestro, to prove the mobile direction switch on a device
  ([ADR 0101](decisions/0101-maestro-on-device-flows.md)).

## What you can do in 0.1.0

1. Declare `locales` in the manifest, so the skill scopes these rules to your project.
2. Ask Claude for localized work as usual; the skill makes it cite the rule IDs above.
3. Run `/cross-stack-standard:audit` to see where existing code departs from them.
4. Watch the [changelog](../CHANGELOG.md): each release that lands an i18n gate lists the promoted
   rule IDs and how existing code adopts them, and `/cross-stack-standard:upgrade` brings the gate
   files in for review.

The generated pages list every rule with its planned gate: [web](rules/web.md),
[mobile](rules/mobile.md), [web and mobile](rules/client.md), [Laravel](rules/laravel.md) and
[shared](rules/shared.md).
