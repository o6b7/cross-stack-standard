---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Explicit Intl formatting: calendar and numbering system always passed; one shared formatter

## Context and Problem Statement

`Date.prototype.toLocaleDateString()`, `Number.prototype.toLocaleString()` and an `Intl` formatter
built without options take the calendar and the digits from the runtime's locale data. That data
differs by locale tag, by runtime and by version. On Node 22.23.1 (ICU 78.2, CLDR 48),
`new Intl.NumberFormat("ar").resolvedOptions().numberingSystem` is `latn` (Western digits), while
`ar-EG` and `ar-SA` resolve to `arab` (Arabic-Indic digits). Hermes, the React Native engine, does
not support `numberingSystem` in `DateTimeFormat` on iOS. The default calendar also follows the
locale tag (on the same Node version `fa` resolves to `persian` and `th` to `buddhist`), while a
product that wants a Hijri calendar (`islamic-umalqura`, `islamic-civil` and others) must ask for
it. The same value can therefore render differently on the web, on a phone and in a generated PDF.

A common defect is an undocumented digit choice, recorded at most in a comment in a number
utility, with nothing checking it. A related one is numeric input: a user typing Arabic-Indic
digits into a quantity field fails validation or is stored in a different form from other users.

How is locale-sensitive formatting made deterministic across web, native and document output?

## Decision Drivers

- The same value renders the same way on every surface.
- Digits and calendar are a recorded product decision, not a runtime default.
- The approach works on Hermes as well as in browsers and Node.
- Users can type numbers in the digits their keyboard produces.

## Considered Options

- One shared formatter with calendar and numbering system from project configuration
- Explicit options at every call site, no shared module
- Runtime defaults

## Decision Outcome

Chosen option: "One shared formatter with calendar and numbering system from project configuration",
because only a single module can hold the choice, the runtime workarounds and the tests in one
place.

- **Configuration.** The i18n module configuration ([0077](0077-i18n-module.md)) records a calendar
  and a numbering system per locale, for example `gregory` with `latn`, or `islamic-umalqura` with
  `arab`. Both are validated against `Intl.supportedValuesOf("calendar")` and
  `Intl.supportedValuesOf("numberingSystem")`.
- **One formatter.** A shared module formats dates, times, numbers, currency and relative time.
  It always passes `calendar` and `numberingSystem`, as options or as `-u-ca-…-nu-…` locale
  extensions. Web, native and PDFs rendered in JavaScript all use it; a PDF rendered in PHP uses
  PHP's intl extension with the same configured values.
- **Ban.** `toLocaleString()`, `toLocaleDateString()` and `toLocaleTimeString()` without an
  explicit options argument, and `Intl` formatters constructed outside the shared module, fail a
  lint rule on the web and mobile tracks ([0007](0007-one-mechanism-per-concern.md)).
- **Hermes.** Where the runtime ignores `numberingSystem`, the formatter maps the digits after
  formatting, with a comment naming the gap ([0006](0006-stack-first.md)), and a device check
  proves the output.
- **Input.** Numeric input in Arabic-Indic (U+0660 to U+0669) or Extended Arabic-Indic (U+06F0 to
  U+06F9) digits is normalized to the configured numbering system before client validation and
  submission; the backend validates the normalized value ([0012](0012-backend-authority.md)).
- **Scope.** A post-1.0 candidate: implemented if time permits before 1.0, otherwise tracked on
  the roadmap.

### Consequences

- Good, because a date or amount reads the same on every surface and in every runtime version.
- Good, because the digit and calendar choice is visible configuration.
- Bad, because every formatting call moves into one module; brownfield call sites need bulk
  suppressions ([0005](0005-explicit-exceptions.md)) until migrated.
- Bad, because the Hermes digit mapping is hand-written code to keep correct.
- Bad, because the formatter only displays; date arithmetic in a non-Gregorian calendar remains
  the date library's problem.

### Confirmation

If implemented: the lint rule is GUARDED, with a clean and a violation fixture
([0004](0004-fail-then-pass.md)); evasions are calls through a variable holding the method,
computed member access, and an options object built elsewhere without the two keys. Formatter unit
tests pin the output for each configured locale, and a device check covers Hermes. Input
normalization is Review until a gate exists. Until then this record is a proposal.

## Pros and Cons of the Options

### One shared formatter with calendar and numbering system from project configuration

- Good, because one place holds the decision and the runtime workarounds.
- Bad, because it adds a module every screen must use.

### Explicit options at every call site, no shared module

- Good, because nothing new is shared.
- Bad, because every call repeats the choice, and one forgotten option reintroduces the default.

### Runtime defaults

- Good, because it needs no code.
- Bad, because the output depends on the device, the runtime and its locale data version.

## More Information

- `Intl.DateTimeFormat()` options (`calendar`, `numberingSystem`):
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat>;
  `Intl.NumberFormat()`:
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat>;
  `Intl.supportedValuesOf()`:
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf>.
- Hermes Intl support: <https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md>; PHP intl:
  <https://www.php.net/manual/en/book.intl.php>.
- Related: [0077](0077-i18n-module.md), [0080](0080-locale-parity.md),
  [0082](0082-mobile-rtl-contract.md).
- Governs: the i18n formatting rules on the web and mobile tracks and the numeric-input
  normalization rule.
