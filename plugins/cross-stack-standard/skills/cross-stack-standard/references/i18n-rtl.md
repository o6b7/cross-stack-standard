# Internationalization and right-to-left layouts

Configurable locales, server-localized messages, copy in message files, locale parity,
logical-direction styling and the mobile RTL contract. Right-to-left support (Arabic, Hebrew,
Persian, Urdu and the other right-to-left locales) is a first-class part of the Standard, not an
afterthought. The `i18n` module applies when the manifest turns it on; it is on by default when
`locales` lists more than one locale ([ADR 0011][0011], [ADR 0077][0077]). Rules marked Tier 1 apply
to every project with the module on; the others apply once the project declares Tier 2.

## Rules

### Server (Laravel)

- **I18N-001** Take user-visible server messages from translation keys, never literal sentences _(Tier 1; i18n module)_
- **I18N-002** Implement `HasLocalePreference` on every notifiable model _(i18n module)_
- **I18N-003** Set the locale before authentication, throttling and route-model binding on every API route _(Tier 1; i18n module)_
- **I18N-004** Set the application locale only in the locale middleware and the locale-scoping helpers _(i18n module)_
- **I18N-005** Keep the backend's supported-locales config equal to the manifest's locales list _(i18n module)_
- **I18N-006** Keep server lang files in parity across the configured locales _(Tier 1; i18n module)_
- **I18N-007** Define every statically referenced server translation key in every configured locale _(Tier 1; i18n module)_
- **I18N-008** Translate the attribute name of every validated field in every configured locale _(i18n module)_
- **I18N-043** Answer in the requested configured locale, falling back to the default for an unlisted one _(i18n module)_
- **I18N-009** Leave no server locale plumbing behind while the i18n module is off _(Tier 1)_
- **I18N-011** Store each model's multilingual content with one declared strategy, never a mix _(i18n module; off by default)_

### Client copy, labels and content

- **I18N-016** Put user-facing copy in message files, not JSX literals _(Tier 1)_
- **I18N-017** Write no source literal in a script used only by non-source locales
- **I18N-018** Never choose user-facing copy by comparing the locale with a literal
- **I18N-019** Never render backend `*_label` fields as labels on a client _(Tier 1)_
- **I18N-020** Make the localized-field helper prefer the reader's locale and fall back through the chain
- **I18N-037** Read multilingual content only through the localized-field helper, never `*_<locale>` keys _(Tier 1)_
- **I18N-038** Show a screen's own copy for expected errors, keyed by problem type, with server detail as fallback
- **I18N-039** Send the active UI locale, not the browser's, as Accept-Language from the web client _(Tier 1)_
- **I18N-040** Read the browser or device locale only in the language module, and never switch it automatically _(Tier 1)_
- **UI-002** Keep UI primitives from reaching the i18n library, directly or through other modules

### Web locale routing (next-intl)

- **I18N-021** Prefix every locale route, never auto-detect, and use the configured locales and a project cookie _(next profile)_
- **I18N-022** Pin the configured business time zone in the i18n request configuration _(next profile)_
- **I18N-023** Navigate only through the locale-aware wrappers, never `next/link` or the replaced router APIs _(next profile)_
- **I18N-024** Never hand-build locale-prefixed hrefs _(next profile)_
- **I18N-025** Derive the current locale from the URL in one helper that accepts only configured locales _(next profile)_
- **I18N-026** Place every page route under the locale segment _(next profile)_
- **I18N-027** Set `lang` and `dir` on the document root from the active locale _(Tier 1; next profile)_
- **I18N-044** Derive every configured locale's direction from the one hard-coded right-to-left locale list

### Direction and layout

- **I18N-012** Use logical-direction utility classes, never physical left and right _(Tier 1)_
- **I18N-013** Use logical properties in style objects, never physical left and right _(Tier 1)_
- **I18N-014** Pair every physical value with its right-to-left counterpart and mirror directional icons
- **I18N-029** Change layout direction and reload for a language only in the `setAppLanguage()` utility
- **I18N-030** Declare every configured locale in `supportedLocales` and never set `supportsRTL` or `forcesRTL`

### Parity and references

- **I18N-015** Reference only translation keys that exist in the source locale's typed web messages _(Tier 1)_
- **I18N-031** Reference only translation keys that exist in the source locale's typed mobile resources _(Tier 1)_
- **I18N-033** Give every configured locale the source locale's keys, grouping plural forms by base key _(Tier 1)_
- **I18N-034** Leave no locale value empty or whitespace-only _(Tier 1)_
- **I18N-035** Allow a value identical to the source locale's only for an allowlisted key _(Tier 1)_
- **I18N-036** Use the same placeholders for a key in every locale, parsed with the track's message syntax _(Tier 1)_
- **I18N-042** Match each locale's plural forms to the categories `Intl.PluralRules` reports for it _(Tier 1)_

### Process

- **I18N-010** Have a person write or review translations, never generate them just to satisfy parity
- **I18N-032** Normalize locale digits in numeric input to the configured numbering system before submission _(off by default)_
- **I18N-041** Name in place any shortcut that is safe only while a locale cannot reach that screen

## Sanctioned patterns

**Locales and direction.** The manifest's `locales` list is the only source; its first entry is the
source locale. Each locale's direction comes from one hard-coded list of right-to-left locales,
never from a per-locale flag.

**Server** ([ADR 0077][0077]). A locale middleware reads `Accept-Language`, accepts only configured
locales, falls back to the default, and runs before authentication, throttling and route-model
binding. User-visible messages come from translation keys; validation attributes are translated in
every locale. Notifiable models implement `HasLocalePreference`, so mail and notifications use the
recipient's stored locale, not the request's. With the module off, the server carries no locale
plumbing at all (I18N-009).

**Client copy and content** ([ADR 0078][0078]). User-facing copy lives in message files, never in
JSX literals. Enum and status labels render from message files; the API sends values, never
`*_label` fields. User-entered multilingual content is read only through one `localizedField()`
helper that prefers the reader's locale and falls back through the configured chain; forms and
mutations address each locale field on purpose. Screens show their own copy for expected errors,
keyed by the problem `type`, with the server's `detail` as fallback. The web client sends the active
UI locale as `Accept-Language`; the device or browser locale is read only in the language module and
never switches the app automatically.

**Web routing with next-intl** ([ADR 0079][0079]): `localePrefix: "always"` set explicitly,
`localeDetection: false`, a project-specific `localeCookie` name, a pinned business `timeZone`;
every page under the locale segment; navigation only through the `createNavigation(routing)`
wrappers (`Link`, `redirect`, `useRouter`, `usePathname`, `getPathname`), never `next/link` or
hand-built `` `/${locale}/…` `` paths; `lang` and `dir` set on the root `<html>` from the active
locale. Another installed i18n routing library gets the equivalent configuration.

**Logical direction** ([ADR 0081][0081]). Use logical names everywhere; the rule is active whenever
a configured locale is right-to-left.

| Physical (banned)                           | Logical                               |
| ------------------------------------------- | ------------------------------------- |
| `ml-*`, `mr-*`, `pl-*`, `pr-*`              | `ms-*`, `me-*`, `ps-*`, `pe-*`        |
| `left-*`, `right-*`                         | `inset-s-*`, `inset-e-*`              |
| `text-left`, `text-right`                   | `text-start`, `text-end`              |
| `rounded-l/r/tl/tr/bl/br`                   | `rounded-s/e/ss/se/es/ee`             |
| `border-l`, `border-r`                      | `border-s`, `border-e`                |
| `float-left/right`                          | `float-start/end`                     |
| `marginLeft`, `right` (web style objects)   | `marginInlineStart`, `insetInlineEnd` |
| `marginLeft`, `paddingRight` (React Native) | `marginStart`, `paddingEnd`           |

React Native's `textAlign` has no start or end value, so `left` and `right` are banned there and
alignment stays `auto`. A value that must stay physical carries its right-to-left counterpart in the
same place (the `rtl:` variant, or a direction check on mobile) and a described disable comment.
Directional icons and animations (a back chevron, a slide-in from the leading edge) ship as mirrored
pairs.

**Mobile RTL contract** ([ADR 0082][0082]). The `expo-localization` config plugin declares every
configured locale in `supportedLocales`; the app config never sets `supportsRTL: true` or
`forcesRTL`. The user picks the app language in system settings; the app reads it with
`getLocales()` (re-read on Android when the app returns to the foreground), and the root layout
wraps the navigator in Expo Router's `LocaleProvider` with the active direction. When the product
needs an in-app picker, one `setAppLanguage(locale)` persists the choice through the storage module,
applies `allowRTL()` and `forceRTL()` only when the direction must change, and reloads with
`reloadAppAsync()` behind a guard that never reloads twice for the same attempt. Nothing else calls
the direction or reload APIs. The contract is SDK-versioned: re-verify it at every Expo SDK upgrade.

**Parity** ([ADR 0080][0080]). Every locale has the source locale's keys; no empty or
whitespace-only values; a value identical to the source only for an allowlisted key; the same
placeholders per key (ICU on the web, i18next `{{name}}` on mobile); plural forms grouped by base
key and matching the categories `new Intl.PluralRules(locale).resolvedOptions().pluralCategories`
reports; every statically referenced key exists. A person writes or reviews translations; never
generate them just to pass parity.

**Planned options.** Translatable content storage (I18N-011, [ADR 0097][0097]) and locale-digit
normalization (I18N-032, [ADR 0096][0096]) rest on proposed decisions and stay off by default.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them, and do not describe them as
enforced by a gate. The `no-physical-direction` and localized-field lint rules, the parity checker,
the locale middleware tests and the RTL gates arrive in later 0.x releases. `enforcement` in
`${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for each ID.

## Decision records

- [ADR 0011][0011]: Default module set
- [ADR 0077][0077]: i18n module: configurable locales, server-localized messages, no half-state
- [ADR 0078][0078]: Labels render from message files; user-entered multilingual content goes through one helper
- [ADR 0079][0079]: Web locale routing: always-prefixed URLs, no auto-detection, one navigation mechanism
- [ADR 0080][0080]: Locale file parity: keys, empty values, untranslated copies, placeholders and plural categories
- [ADR 0081][0081]: Logical-direction styling for right-to-left layouts
- [ADR 0082][0082]: Mobile RTL contract: OS per-app language first, one setAppLanguage() fallback, direction changed only through it
- [ADR 0096][0096]: Explicit Intl formatting: calendar and numbering system always passed; one shared formatter
- [ADR 0097][0097]: Translatable content storage: per-locale columns or JSON translations, never mixed in one model

[0011]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0011-default-module-set.md
[0077]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0077-i18n-module.md
[0078]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0078-labels-and-multilingual-content.md
[0079]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0079-web-locale-routing.md
[0080]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0080-locale-parity.md
[0081]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0081-logical-direction-styling.md
[0082]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0082-mobile-rtl-contract.md
[0096]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0096-explicit-intl-formatting.md
[0097]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0097-translatable-content-storage.md
