---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# UI primitives: shared focus and overlay utilities, i18n-decoupled, accessible; shared request-state components

## Context and Problem Statement

UI primitives (buttons, inputs, dialogs, popovers, menus, tooltips) are where keyboard and
screen-reader behaviour is won or lost, and where copies drift. Each overlay that writes its own
focus trap and positioning gets one of them slightly wrong. Portals added ad hoc compete for the
top of the stack, and when the stacking tokens are awkward to use, arbitrary values escalate; a
common defect is an arms race of ever larger z-index numbers. Primitives that import the i18n
library, domain types or feature code cannot be reused elsewhere and tie the shared layer to one
product. Loading, empty and error blocks written page by page diverge in wording, layout and
accessibility.

How are UI primitives built, what may they depend on, and how are request states rendered?

## Decision Drivers

- Accessibility is implemented once and inherited everywhere.
- Primitives are reusable: no feature, contract or i18n coupling.
- An installed headless library is used rather than rebuilt ([0006](0006-stack-first.md)).
- One overlay layer and one stacking order.
- Every screen shows loading, empty and error states the same way.

## Considered Options

- Shared primitives over shared utilities or the installed headless library
- A headless component library mandated for every project
- Per-feature components with no shared layer

## Decision Outcome

Chosen option: "Shared primitives over shared utilities or the installed headless library", because
it fixes accessibility and stacking in one place without imposing a library on projects that do
not have one.

- **Shared utilities.** Focus trapping and anchored positioning are shared utilities used by every
  overlay. Overlays render through one overlay layer, the only place `createPortal` is imported.
  Stacking uses one z-index token ladder, exposed as named values that are easier to use than an
  arbitrary number; arbitrary z-index values are banned.
- **Headless library first.** When a headless UI library is installed, the primitives wrap it and
  its focus and positioning replace the utilities. The Standard does not add one.
- **The project owns accessibility** either way. Web primitives pass the accessibility lint rules
  at error ([0060](0060-javascript-lint-baseline.md)) and the journey's automated scan
  ([0068](0068-frontend-testing.md)). On mobile, every touchable declares a role, icon-only
  controls carry an accessibility label, selectable and disabled controls expose their state, and
  touch targets meet a minimum size held in a token (44 by default, configurable).
- **Decoupled.** Primitives import no feature code and no generated contract types
  ([0062](0062-frontend-layer-boundaries.md)). User-facing strings arrive as props, with defaults
  or through one injectable strings object, never through the i18n library
  ([0077](0077-i18n-module.md)).
- **Request states.** Loading, empty and error states render through shared `Skeleton`,
  `EmptyState` and `ErrorState` primitives. Hand-rolled per-page loading, empty or error blocks are
  not allowed.
- **Mobile text.** React Native `Text` and `TextInput` are used only inside the text primitives,
  which apply the typography tokens and text direction in one place
  ([0076](0076-mobile-app-structure.md), [0082](0082-mobile-rtl-contract.md)).
- Styling values come from tokens ([0066](0066-design-tokens.md)).

### Consequences

- Good, because an accessibility fix in a primitive reaches every screen.
- Good, because overlays stack predictably and never fight over the top layer.
- Good, because primitives work in any feature and any locale.
- Bad, because a project with hand-built primitives carries real accessibility work: a keyboard
  and screen-reader pass over the primitives is its own debt until done.
- Bad, because the shared utilities are code the project maintains.
- Bad, because portal components from third-party libraries bypass the overlay layer.

### Confirmation

- `no-restricted-imports` bans `createPortal` from `react-dom` outside the configured overlay
  modules: GUARDED. Evasions: portal components from third-party libraries; per-component focus or
  positioning code that needs no portal.
- `cross-stack/no-arbitrary-z-index` over class strings and style `zIndex` values: GUARDED.
  Evasions: z-index in stylesheet rules; values computed at runtime.
- dependency-cruiser keeps the primitives folder from reaching features, the generated contract
  and the i18n library, transitively included: FORCED target.
- Mobile: a custom rule confines `Text` and `TextInput` to the text primitives (FORCED target),
  and another requires a role on every configured touchable (GUARDED target; evasion: props spread
  through an unregistered wrapper).
- The journey's automated accessibility scan: GUARDED ([0068](0068-frontend-testing.md)).
- Request-state components, labels on icon-only controls and target sizes are checked in review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Shared primitives over shared utilities or the installed headless library

- Good, because it works for projects with and without a headless library.
- Bad, because the accessibility burden stays with the project when no library is installed.

### A headless component library mandated for every project

- Good, because mature libraries handle focus, keyboard and ARIA patterns well.
- Bad, because it adds a dependency to projects that have primitives already, against stack-first.

### Per-feature components with no shared layer

- Good, because each feature moves independently.
- Bad, because every feature re-implements focus, positioning and states, and each gets a
  different subset right.

## More Information

- React `createPortal`: <https://react.dev/reference/react-dom/createPortal>.
- WAI-ARIA Authoring Practices: <https://www.w3.org/WAI/ARIA/apg/>; React Native accessibility:
  <https://reactnative.dev/docs/accessibility>.
- Related: [0006](0006-stack-first.md), [0062](0062-frontend-layer-boundaries.md),
  [0066](0066-design-tokens.md), [0076](0076-mobile-app-structure.md).
- Governs: the web and mobile UI-primitive rules (overlays, stacking, decoupling, accessibility
  duties, request-state components, mobile text primitives).
