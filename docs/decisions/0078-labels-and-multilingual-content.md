---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Labels render from message files; user-entered multilingual content goes through one helper

## Context and Problem Statement

A multilingual client shows two kinds of text that look alike but are not:

- **Labels** for enum and status values: fixed vocabulary that belongs to the product's copy.
- **User-entered multilingual content**, such as a product name typed in two languages: data,
  stored per locale.

Mixing them causes quiet bugs. Common defects: the API emits a `status_label` field that is
permanently in one language, and a screen renders it for one locale only, so it is wrong in both;
content is read with a bare `name || name_ar` fallback, which hides missing translations and
hard-codes one locale pair; lint rules that match only `obj.name_ar` miss `obj["name_ar"]` and
destructuring, and flag form code that legitimately writes every locale field. Literal copy in
components drifts out of the message files that parity gates check.

How do clients render labels and multilingual content?

## Decision Drivers

- The enum value is the contract; presentation belongs to each client ([0046](0046-enums-on-the-wire.md)).
- One way to read multilingual content, with one fallback chain.
- All user-facing copy lives where parity gates can see it ([0080](0080-locale-parity.md)).

## Considered Options

- Client-rendered labels, one content helper, lint-enforced
- Server-emitted label fields localized per request
- Fallbacks written at each call site

## Decision Outcome

Chosen option: "Client-rendered labels, one content helper, lint-enforced", because it keeps the
API locale-neutral for labels and gives content one tested reading path.

- **Labels.** Enum and status labels render on the client from message files. The API emits no
  `*_label` presentation fields; server-rendered output such as mail uses the enum's own label
  through the translator ([0046](0046-enums-on-the-wire.md)).
- **Content.** User-entered multilingual content is read only through one `localizedField()` helper,
  which prefers the reader's locale and falls back through the configured chain.
- **Bans.** Bare `x || x_<locale>` fallbacks and direct `*_<locale>` reads are banned. The
  `cross-stack/bilingual-field` rule covers member, computed-literal and destructuring access;
  form and mutation code is exempt by override, because writes address each locale field on
  purpose.
- **Copy.** User-facing copy lives in message files (`react/jsx-no-literals` with `noStrings`).
  Literal right-to-left script text outside message files is banned.
- **Storage.** Per-locale columns versus JSON translations is a separate decision
  ([0097](0097-translatable-content-storage.md)).

### Consequences

- Good, because a label is correct in every locale, and a missing translation shows up in parity
  instead of being hidden by a fallback.
- Good, because the locale suffixes come from configuration, not a hard-coded pair.
- Bad, because each client keeps its own label messages for every enum.
- Bad, because `jsx-no-literals` needs `allowedStrings` for non-copy strings such as symbols.

### Confirmation

- `cross-stack/bilingual-field` on web and mobile: GUARDED, because a key built at run time (for
  example a template literal) evades it.
- `react/jsx-no-literals`: GUARDED, because strings passed through variables or props evade it.
- The right-to-left script ban outside message files: FORCED for string, template and JSX text
  literals.
- With the i18n module, a custom PHPStan rule fails Resource keys ending in `_label`
  ([0046](0046-enums-on-the-wire.md)): GUARDED.
- That content is read through the helper rather than a local copy of it: Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Client-rendered labels, one content helper, lint-enforced

- Good, because labels and content each have one source and one path.
- Bad, because clients carry label messages the server could have sent.

### Server-emitted label fields localized per request

- Good, because clients render without mapping.
- Bad, because responses vary by locale, and clients that need their own wording ignore the field
  and duplicate it anyway.

### Fallbacks written at each call site

- Good, because each screen is self-contained.
- Bad, because fallbacks diverge and hide missing translations.

## More Information

- `react/jsx-no-literals`:
  <https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-literals.md>.
- next-intl messages: <https://next-intl.dev/docs/usage/messages>; i18next:
  <https://www.i18next.com/translation-function/essentials>.
- Related: [0046](0046-enums-on-the-wire.md), [0077](0077-i18n-module.md),
  [0080](0080-locale-parity.md), [0097](0097-translatable-content-storage.md).
- Governs: the i18n rules on label rendering, multilingual field access, literal copy and
  right-to-left script literals, on web and mobile.
