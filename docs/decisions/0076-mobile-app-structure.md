---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Mobile app structure: folder contract, text primitives and token styling enforced by lint

## Context and Problem Statement

An Expo app has few structural constraints of its own, so each team invents a layout, and an agent
invents a new one per screen. The current Expo default template (SDK 57) puts routes in `src/app`
next to `src/components`, `src/hooks` and `src/constants`, and maps the `@/*` alias to `./src/*` in
`tsconfig.json`. Older projects keep `app/` at the root, and the blank template has no router and no
alias.

Structure rules checked by regular expressions over source text are weak. Common defects: a route
file passes a "default export" check because `export default` appears inside a comment; a context
passes a "throws outside its provider" check because the expected phrase appears in a comment; a
fixed folder list copied from one app rejects every other valid layout. `npx expo lint` also lints
only the `src`, `app` and `components` folders when given no paths.

How is the mobile structure defined and enforced?

## Decision Drivers

- The layout follows the framework template and still accepts existing projects.
- Checks read syntax, not text, so comments cannot satisfy or break them.
- One place per concern: screens, state, hooks, styling, text, transport and guards.

## Considered Options

- A folder contract enforced by ESLint and dependency-cruiser, configured from `tsconfig.json`
- A regular-expression structure script
- Follow the template by convention, with no gate

## Decision Outcome

Chosen option: "A folder contract enforced by ESLint and dependency-cruiser, configured from
`tsconfig.json`", because both tools work on the parsed source and module graph, so the rules can be
exact.

- **Layout.** The root and alias are read from `tsconfig.json`: `src/app` with `@/*` as in the
  current template, or the older root layout for brownfield projects. The top-level folder list is
  configuration.
- **Routes.** Route files default-export the screen or layout (API route files are exempt) and stay
  thin: no server-state imports; screens compose feature hooks
  ([0063](0063-client-state-layering.md)). Named exports everywhere else.
- **Contexts and hooks.** `createContext` appears only in the contexts folder. Each context is read
  only through its provider hook, which throws outside the provider. Hooks are defined only in the
  hooks folder.
- **Plain modules.** `utils`, `constants` and `types` hold no JSX; `types` holds no runtime code.
- **Imports and names.** Imports go through the root alias, never parent-relative paths. Tracked
  file names match the on-disk case.
- **Styling and text.** Styles come from the theme style factory with token values
  ([0066](0066-design-tokens.md)). Text renders only through the text primitives; the platform
  `Text` is banned elsewhere ([0065](0065-ui-primitives-and-request-states.md)).
- **Transport and guards.** The mock/live transport switch lives only inside the API client module.
  Auth guards and redirects live only in route-group layouts and the single entry route.
- **Residual checks.** What neither tool can express, the top-level folder list and file-name case
  against git, runs in the kit's dependency-free check script, which reads the file system and git,
  not source text.

The gate is `eslint . --max-warnings=0`, never `expo lint` ([0060](0060-javascript-lint-baseline.md)).

### Consequences

- Good, because a comment cannot satisfy or break a structure rule.
- Good, because new screens land in predictable places.
- Bad, because the contract is stricter than the template, so brownfield apps need moves or dated
  allowlist entries ([0005](0005-explicit-exceptions.md)).
- Bad, because lint configuration grows with each rule.

### Confirmation

- FORCED where the syntax is exact: the platform `Text` import, `createContext` outside the
  contexts folder, JSX in a `.ts` file, a default export outside the route folder, a parent-relative
  import, a missing route default export.
- GUARDED where aliases or computed values can evade: colour literals assembled at run time, a
  context read through a re-export, a hook defined as an unexported arrow, route files importing
  server state through an intermediate module, the transport switch and guard placement.
- The residual script's folder and case checks: FORCED; the case check fails closed in CI when git
  is unavailable.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### A folder contract enforced by ESLint and dependency-cruiser, configured from `tsconfig.json`

- Good, because rules are exact and fixtures prove them.
- Bad, because a few layout facts need a small script beside them.

### A regular-expression structure script

- Good, because it is quick to write.
- Bad, because comments and formatting both defeat it, and it hard-codes one app's folders.

### Follow the template by convention, with no gate

- Good, because there is nothing to maintain.
- Bad, because nothing stops drift.

## More Information

- Expo project structure and the `src` folder: <https://docs.expo.dev/router/reference/src-directory/>;
  template contents: [verified-versions.md](../maintainers/verified-versions.md).
- `expo lint` behaviour: <https://docs.expo.dev/more/expo-cli/#lint>; ESLint in Expo:
  <https://docs.expo.dev/guides/using-eslint/>.
- dependency-cruiser rules: <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>.
- Related: [0059](0059-javascript-toolchain-pins.md), [0060](0060-javascript-lint-baseline.md),
  [0065](0065-ui-primitives-and-request-states.md), [0066](0066-design-tokens.md).
- Governs: the mobile structure rules (folder contract, placement, imports, file-name case) and the
  mobile text and styling rules.
