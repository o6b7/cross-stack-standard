---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Locale file parity: keys, empty values, untranslated copies, placeholders and plural categories

## Context and Problem Statement

Message files drift. A parity check that compares only key sets catches a missing key and nothing
else: an empty string, a value pasted untranslated from the source locale, or a translation that
drops `{count}` all pass, and users see blank labels, the wrong language or a broken sentence.

Plurals make exact key parity wrong, not just weak. Languages have different plural categories:
`Intl.PluralRules` gives English `one` and `other`, and Arabic `zero`, `one`, `two`, `few`, `many`
and `other`. i18next stores each category as a suffixed key (`items_one`, `items_few`…), so a
correct Arabic file has more keys than the English one. A common defect is an exact key-set check
that rejects correct Arabic plurals, which pushes translators to delete forms or add meaningless
English keys.

Placeholder syntax also differs per track: the web uses ICU messages (next-intl: `{name}`, plural
and select arguments), and mobile uses i18next, whose default interpolation is `{{name}}`. Finally,
the plural forms only work at run time if the engine implements `Intl.PluralRules`. The Hermes
documentation does not list it, and i18next warns that without it only English-style `_one` and
`_other` forms resolve; whether the Hermes version in React Native 0.86 implements it is unverified.

What does the locale parity gate check?

## Decision Drivers

- Catch every way a translation can be missing, not only missing keys.
- Accept every correct plural form for every configured locale.
- One checker for web and mobile, aware of each message syntax.

## Considered Options

- Syntax-aware parity: keys, values, placeholders and plural categories
- Key-set parity only
- Translator discipline and review, no gate

## Decision Outcome

Chosen option: "Syntax-aware parity: keys, values, placeholders and plural categories", because
each check targets a failure users actually see, and the plural rule comes from the runtime's own
locale data rather than a hand-kept table.

- **Values.** Fail on missing keys, empty strings, and values identical to the source locale for
  keys that are not allowlisted (dated entries, [0005](0005-explicit-exceptions.md)).
- **References.** Every statically referenced namespace and key exists in every locale.
- **Placeholders.** Compared per key with a parser for the track's syntax: ICU on web, i18next
  `{{var}}` (including its unescaped, formatted and nesting forms) on mobile. For plurals, the
  comparison uses the union across a key's forms, and `count` may be absent from the `zero`, `one`
  and `two` forms.
- **Plural categories.** Plural keys are grouped by base key, and each locale's set of categories
  must equal `new Intl.PluralRules(locale).resolvedOptions().pluralCategories`. On the web the same
  comparison applies to the category selectors of ICU `plural` arguments; exact `=n` selectors are
  extra and allowed.
- **One checker.** Web and mobile run the same checker, shipped as a gate package
  ([0017](0017-vendored-gate-packages.md)).
- **Runtime.** `Intl.PluralRules` on the Hermes engine is verified on a device or emulator for the
  pinned Expo SDK. `@formatjs/intl-pluralrules` ships only if that check fails.

### Consequences

- Good, because blank, untranslated and placeholder-breaking translations fail before release.
- Good, because correct Arabic plurals pass without exceptions.
- Bad, because intentional copies (brand names, units) need dated allowlist entries.
- Bad, because keys built at run time cannot be checked for existence.

### Confirmation

- The checker runs in each track's `check` chain. Violation fixtures cover a missing key, an empty
  string, an untranslated copy, a placeholder mismatch in each syntax and a plural-category
  mismatch; the clean fixture includes complete Arabic plurals. FORCED for the file checks, because
  they read the message files exactly.
- Existence of referenced keys: GUARDED, because keys assembled at run time evade it.
- The Hermes check: Review until the device run is recorded in
  [verified-versions.md](../maintainers/verified-versions.md).

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Syntax-aware parity: keys, values, placeholders and plural categories

- Good, because it covers values, placeholders and plurals on both tracks.
- Bad, because it needs two placeholder parsers.

### Key-set parity only

- Good, because it is trivial.
- Bad, because it lets empty and untranslated values through and rejects correct plurals.

### Translator discipline and review, no gate

- Good, because there is nothing to build.
- Bad, because missing translations are found by users.

## More Information

- `Intl.PluralRules`:
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules>.
- i18next plurals: <https://www.i18next.com/translation-function/plurals>; interpolation:
  <https://www.i18next.com/translation-function/interpolation>.
- next-intl message syntax: <https://next-intl.dev/docs/usage/messages>.
- Hermes Intl support: <https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md>; polyfill:
  <https://formatjs.github.io/docs/polyfills/intl-pluralrules/>.
- Related: [0077](0077-i18n-module.md), [0078](0078-labels-and-multilingual-content.md),
  [0082](0082-mobile-rtl-contract.md).
- Governs: the i18n parity rules on web and mobile (keys, values, references, placeholders and
  plural categories).
