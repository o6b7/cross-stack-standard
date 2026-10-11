---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Logical-direction styling for right-to-left layouts

## Context and Problem Statement

A layout written with physical directions (`margin-left`, `ml-4`, `text-right`, `left: 0`) is
correct in one reading direction only. When the i18n module turns on a right-to-left locale
([0077](0077-i18n-module.md)), every physical value on a mirrored screen is a bug: spacing lands
on the wrong side, corner radii round the wrong corners and icons point backwards. Logical
equivalents (`margin-inline-start`, `ms-4`, `text-start`, `inset-inline-start`) resolve against the
element's direction, so one declaration serves both directions.

Review alone does not hold this line. Physical utilities read naturally to anyone who writes left
to right, they pass every other check, and the defect shows only when someone opens the screen in
a right-to-left locale. A common defect is a rule that requires a right-to-left counterpart for
physical CSS but has no gate behind it, so the requirement exists only in prose.

How does the Standard keep web and mobile styling direction-agnostic?

## Decision Drivers

- One declaration should render correctly in both directions.
- The gate must understand how utility classes are written: variants, important and negative
  prefixes, and the utility framework's own logical names.
- Genuinely physical layout (a chart axis, a map control) must stay possible and visible.

## Considered Options

- Logical utilities and properties everywhere, enforced by a token-based lint rule
- Physical values with a right-to-left counterpart on every use
- A mirrored stylesheet generated at build time

## Decision Outcome

Chosen option: "Logical utilities and properties everywhere, enforced by a token-based lint rule",
because Tailwind, CSS and React Native already ship logical names, so the rule costs nothing at
runtime and every violation has a mechanical fix. The rule is active when the configured locales
include a right-to-left locale.

- **Utility classes (web).** `cross-stack/no-physical-direction` splits each class string into
  utilities, strips variant (`md:`, `hover:`), important and negative prefixes, and checks each
  utility against a physical-to-logical map for the installed Tailwind 4 version:

  | Physical                                  | Logical                              |
  | ----------------------------------------- | ------------------------------------ |
  | `ml-*`, `mr-*`, `pl-*`, `pr-*`            | `ms-*`, `me-*`, `ps-*`, `pe-*`       |
  | `left-*`, `right-*`                       | `inset-s-*`, `inset-e-*`             |
  | `text-left`, `text-right`                 | `text-start`, `text-end`             |
  | `rounded-l/r/tl/tr/bl/br`                 | `rounded-s/e/ss/se/es/ee`            |
  | `border-l`, `border-r` (width and colour) | `border-s`, `border-e`               |
  | `float-left/right`, `clear-left/right`    | `float-start/end`, `clear-start/end` |
  | `scroll-ml/mr/pl/pr`                      | `scroll-ms/me/ps/pe`                 |

  Tailwind 4.2 added `inset-s-*` and `inset-e-*` and deprecated the `start-*` and `end-*` inset
  utilities, which still compile in 4.3.3; from 4.2 on, the rule flags them too. `space-x-*` is
  already logical in Tailwind 4 and stays allowed.

- **Inline styles (web).** Style objects use CSS logical properties: `marginInlineStart` for
  `marginLeft`, `insetInlineEnd` for `right`, `borderStartStartRadius` for `borderTopLeftRadius`,
  and `textAlign: "start"` or `"end"`. The same rule reads inline style objects, same-file style
  identifiers, string keys, shorthands and `textAlign` and `float` values.
- **Style objects (mobile).** React Native's start and end properties replace left and right:
  `marginStart`, `paddingEnd`, `start`, `end`, `borderStartWidth`, `borderTopStartRadius`. Its
  `textAlign` has no start or end value, so `left` and `right` are banned and alignment stays on
  the default `auto`. React Native can swap left and right globally (`swapLeftAndRightInRTL`), but
  then a physical name means its opposite; the Standard uses logical names instead and confines
  that switch with the other direction APIs ([0082](0082-mobile-rtl-contract.md)).
- **Genuinely physical values.** A value that must stay physical carries its right-to-left
  counterpart in the same place (the `rtl:` variant on the web, a direction check on mobile) and a
  described disable comment ([0005](0005-explicit-exceptions.md)). Directional icons and animations,
  such as a back chevron or a slide-in from the leading edge, ship as mirrored pairs.
- **Brownfield.** Existing violations go into ESLint bulk suppressions, which are shrink-only
  ([0005](0005-explicit-exceptions.md)).

### Consequences

- Good, because one class list or style object renders correctly in both directions, with no
  per-direction stylesheet to maintain.
- Good, because the map doubles as the fix list, so violations are cheap to correct.
- Bad, because the map follows Tailwind's naming and must be updated when utilities are renamed, as
  happened with `start-*` and `end-*` in 4.2.
- Bad, because stylesheets outside JavaScript and TypeScript files are not linted.

### Confirmation

- `cross-stack/no-physical-direction` fails violation fixtures for each utility family, each
  prefix form, the deprecated inset names, inline-style keys and values, and mobile style objects.
  GUARDED, because class names assembled at runtime from fragments, CSS files and CSS modules
  (including `@apply`), and style objects imported from another module are not seen.
- Physical-value pairs and mirrored animations are Review. On mobile, the proposed right-to-left
  on-device flow would also exercise the screens it visits ([0101](0101-maestro-on-device-flows.md)).

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Logical utilities and properties everywhere, enforced by a token-based lint rule

- Good, because it uses names the platforms already provide and needs no runtime or build step.
- Bad, because teams must learn the logical names and keep the map current.

### Physical values with a right-to-left counterpart on every use

- Good, because it matches how many developers already think about layout.
- Bad, because every directional value is written twice and one side is easily forgotten; a gate
  can only guess whether the pair is complete.

### A mirrored stylesheet generated at build time

- Good, because existing physical styles keep working unchanged.
- Bad, because it adds a tool next to the installed styling system ([0006](0006-stack-first.md)),
  flips genuinely physical values too and does not reach inline or native styles.

## More Information

- Tailwind logical inset utilities: <https://tailwindcss.com/docs/top-right-bottom-left>; the 4.2.0
  deprecation of `start-*` and `end-*`:
  <https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/CHANGELOG.md>; `float-start` and
  `float-end`: <https://tailwindcss.com/docs/float>; the `rtl:` and `ltr:` variants:
  <https://tailwindcss.com/docs/hover-focus-and-other-states#rtl-support>.
- CSS logical properties:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values>.
- React Native start and end layout props: <https://reactnative.dev/docs/layout-props>; `textAlign`
  values: <https://reactnative.dev/docs/text-style-props>; `swapLeftAndRightInRTL`:
  <https://reactnative.dev/docs/i18nmanager>.
- Versions: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0066](0066-design-tokens.md), [0077](0077-i18n-module.md),
  [0082](0082-mobile-rtl-contract.md), [0005](0005-explicit-exceptions.md).
- Governs: the i18n logical-direction styling rules for utility classes, inline styles and mobile
  style objects, and the review rule for physical-value pairs and mirrored animations.
