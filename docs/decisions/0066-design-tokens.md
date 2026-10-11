---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Design tokens are the single styling source

## Context and Problem Statement

Raw values creep into every styling surface: hex codes in class strings, numbers in style objects,
colours in SVG attributes and chart options. A rebrand, a dark mode or a contrast fix then turns
into a search across the codebase, and each copy is a chance to miss one. Variants named after
colours ("gold") stop making sense when the palette changes. A fallback such as
`var(--accent, #fff)` hides a renamed or missing token by quietly rendering a hard-coded colour. A
second styling system next to the installed one (a preprocessor, or a CSS-in-JS library) splits the
source of truth. Light and dark palettes defined separately drift apart key by key.

Where do styling values come from, and how is that checked?

## Decision Drivers

- One place to change any colour, spacing, size, radius or font size.
- Themes and dark mode are token changes, not code changes.
- The styling system is the one the project installed ([0006](0006-stack-first.md)).
- Violations are caught by tools, with evasions stated.

## Considered Options

- One token source, tokens everywhere else, one styling system
- Tokens recommended, literals tolerated
- A design-system package owned by the Standard

## Decision Outcome

Chosen option: "One token source, tokens everywhere else, one styling system", because it makes
every visual change a one-file change and can be checked mechanically.

- **One source.** On the web, tokens are defined once in the installed styling system's theme (for
  example the theme block of a Tailwind CSS 4 stylesheet); other CSS may only alias them. On
  mobile, tokens live in one typed token module.
- **No raw colours.** Hex values, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`,
  `color()` and named colours are not written in class strings, style objects or SVG and style
  props; the token source is exempt. Colour tokens are referenced without fallback values.
- **Other scales.** Spacing, sizes, radii and font sizes come from tokens: on the web through the
  styling system's scale, on mobile through the token module rather than numeric literals.
- **Semantic names.** Brand variants are routed through tokens and named for their role
  (`featured`), not their colour (`gold`). Clients map domain states to colour tokens in one
  module per domain; the API sends states, never colours ([0046](0046-enums-on-the-wire.md)).
- **Charts and SVG.** Libraries that take colour strings get them from one chart-token module,
  which turns tokens into `var()` references and derives transparency with `color-mix()`. Colour
  references are composed nowhere else.
- **One styling system.** No preprocessor stylesheets or CSS-in-JS libraries beside the installed
  styling system; the banned list is derived from the declared one
  ([0007](0007-one-mechanism-per-concern.md)).
- **Light and dark.** On mobile both palettes are declared to satisfy one shared interface, so a
  missing or extra key fails type-checking. On the web, the dark theme redefines the same custom
  properties in the token source.
- The design module reviews against these tokens ([0034](0034-design-module.md)); direction-aware
  styling is separate ([0081](0081-logical-direction-styling.md)).

### Consequences

- Good, because a rebrand, a dark mode or a contrast fix edits one file.
- Good, because reviewers read intent (`featured`, `danger`) instead of colour values.
- Good, because a missing token fails visibly instead of falling back silently.
- Bad, because a one-off value needs a token before it can be used.
- Bad, because the literal checks are syntactic and do not read every file type.
- Bad, because chart libraries need the bridge module instead of taking tokens directly.

### Confirmation

- `cross-stack/no-raw-color`: GUARDED. Evasions: a colour assembled at runtime from fragments or
  numbers; colours inside stylesheet rules, which ESLint does not read; colours in JSON or image
  assets.
- `cross-stack/no-token-fallback`: GUARDED. Evasion: a fallback assembled from fragments.
- `cross-stack/no-inline-color-token` confines colour references to the chart-token module:
  GUARDED. Evasion: a reference assembled from fragments.
- `cross-stack/one-styling-system`: GUARDED. Evasions: a CSS-in-JS library outside the known list;
  styles injected at runtime.
- A stylesheet check asserts that custom properties outside the token source are pure aliases of
  tokens: FORCED target.
- Mobile: a rule flags numeric literals on spacing, size, radius and typography style keys, with a
  configurable allowed set such as `0` and `1` (GUARDED target, off by default); `tsc --noEmit`
  fails when a palette misses a key of the shared interface (GUARDED; evasions: `as` casts, or
  optional keys in the interface).
- Semantic naming and the per-domain state mapping are checked in review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### One token source, tokens everywhere else, one styling system

- Good, because every visual decision has one home.
- Bad, because it adds friction to quick experiments.

### Tokens recommended, literals tolerated

- Good, because nothing blocks a quick change.
- Bad, because literals accumulate until a theme change is a project of its own.

### A design-system package owned by the Standard

- Good, because every adopter would share tested primitives and tokens.
- Bad, because it would replace each project's own brand and styling system, against stack-first.

## More Information

- CSS `var()` and fallbacks: <https://developer.mozilla.org/en-US/docs/Web/CSS/var>;
  `color-mix()`: <https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix>.
- Tailwind CSS theme variables: <https://tailwindcss.com/docs/theme>.
- TypeScript `satisfies`:
  <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html>.
- Related: [0006](0006-stack-first.md), [0034](0034-design-module.md),
  [0065](0065-ui-primitives-and-request-states.md), [0081](0081-logical-direction-styling.md).
- Governs: the web and mobile design-token rules (token source, colour literals, fallbacks, chart
  colours, one styling system, palette parity).
