---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Frontend layer boundaries: one-way dependencies, machine-enforced

## Context and Problem Statement

Web frontends lose their shape one import at a time. A feature reaches into another feature's
components, a shared UI primitive imports a domain type, a helper in `lib/` imports a feature,
and a cycle appears. After that, no feature can be changed or removed on its own.

The tools see these rules differently. Core ESLint's `no-restricted-imports` matches the import
specifier as written; it does not know which feature the importing file belongs to, so it cannot
say "another feature's components" and it treats aliases and relative paths as different strings.
dependency-cruiser works on the resolved import graph and supports back-references, so a rule can
compare the importer's feature with the target's. A common defect is a standard that claims every
boundary is enforced twice, by ESLint and by dependency-cruiser, when some exist only in one tool
and nothing checks the duplication.

What are the web layers, which way may dependencies point, and which tool enforces each rule?

## Decision Drivers

- Dependencies point one way, so a feature can change or disappear without ripples.
- Boundary rules are checked on the resolved graph, including relative, aliased and transitive
  imports.
- Each rule has exactly one gate; duplicated gates drift and double-report.
- The rules adapt to configured paths instead of assuming one layout.

## Considered Options

- One-way layers, each rule in the one tool that can express it
- Every boundary in both ESLint and dependency-cruiser
- ESLint only
- Conventions checked in review

## Decision Outcome

Chosen option: "One-way layers, each rule in the one tool that can express it", because it
covers every boundary on the resolved graph and reports each violation once.

- **Layers** (default paths, configurable): routes in `src/app/`, features in
  `src/features/<feature>/`, shared UI primitives in `src/components/ui/`, shared code in
  `src/lib/`. Dependencies flow routes, then features, then `ui/` and `lib/`. Nothing below the
  route layer imports from `src/app/`, and there are no circular imports.
- **Feature surface.** Across features, only `hooks/` and `lib/` are importable; `components/`
  stay private to the feature that owns them. A feature's own `hooks/` and `lib/` do not import its
  `components/`, which closes the re-export route around the rule.
- **Shared layers stay generic.** `ui/` and `lib/` never import features, directly or
  transitively. `ui/` imports no generated contract types and no i18n library or fixed message
  namespace ([0065](0065-ui-primitives-and-request-states.md)).
- **Feature shape.** A feature folder holds only `hooks/`, `components/` and `lib/`; `hooks/` is
  always present and its files are named `use-*`. There are no barrel or re-export modules: the
  folder path is the public surface. Feature `lib/` is framework-free: no React, framework or
  server-state library imports.
- **Server-only code.** Modules under the configured server paths import `server-only`, so the
  Next.js build fails if client code imports them.
- **Exports and names.** Named exports only, except where the framework requires a default export
  (pages, layouts, route conventions, config files). File and directory names are kebab-case;
  framework route syntax such as `[id]` and `(group)` is exempt.
- **One tool per rule.** Graph rules (feature surface, shared layers, route layer, cycles,
  framework-free `lib/`) are dependency-cruiser rules; the same-feature comparison uses a `$1`
  back-reference. Per-file rules (no re-exports in features, named exports) are ESLint rules.
  Layout rules (feature shape, kebab-case, the `server-only` marker) are filesystem checks. The
  evaluation of eslint-plugin-boundaries ([0105](0105-architecture-tool-evaluations.md)) may
  replace a gate, never add a second one.
- Route pages compose and lay out; business logic lives in features. The mobile folder contract is
  separate ([0076](0076-mobile-app-structure.md)).

### Consequences

- Good, because features can be moved, split or deleted without hunting for hidden consumers.
- Good, because relative, aliased and transitive imports are all caught.
- Good, because each violation appears once, from the tool that owns the rule.
- Bad, because three mechanisms are involved, and contributors must know which one owns a rule.
- Bad, because dependency-cruiser needs TypeScript below 7 and a wrapper that fails when nothing
  was cruised ([0059](0059-javascript-toolchain-pins.md)).
- Bad, because existing codebases start with a known-violations baseline that may only shrink
  ([0005](0005-explicit-exceptions.md)).

### Confirmation

- dependency-cruiser rules over the resolved graph: feature surface only, shared layers import no
  features, nothing imports the route layer, no cycles, framework-free feature `lib/`. FORCED
  targets.
- ESLint: `cross-stack/no-feature-re-export`, and the core rule `no-restricted-exports` with
  `restrictDefaultExports` (`direct`, `named`, `defaultFrom`, `namedFrom` and `namespaceFrom` all
  on), turned off for the framework's required-default files. A core rule needs no plugin, so it
  behaves the same on ESLint 9.39 and 10; eslint-plugin-import's `no-default-export` crashes on
  ESLint 10. FORCED targets.
- Filesystem checks in the web architecture test: feature shape, kebab-case names, and the
  `server-only` import in every module under the server paths. FORCED targets.
- "Route pages only compose" is checked in review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### One-way layers, each rule in the one tool that can express it

- Good, because every rule runs where it can be expressed exactly.
- Bad, because the configuration is spread over three files.

### Every boundary in both ESLint and dependency-cruiser

- Good, because ESLint reports some violations in the editor.
- Bad, because ESLint cannot express the same-feature rule, so "both" is untrue for the most
  important boundary, and the copies drift.

### ESLint only

- Good, because one tool gives fast editor feedback.
- Bad, because core rules match specifiers, not the resolved graph; a plugin that resolves
  imports is the subject of a separate evaluation.

### Conventions checked in review

- Good, because it costs nothing to set up.
- Bad, because boundary erosion is gradual and rarely visible in one diff.

## More Information

- dependency-cruiser rules reference:
  <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>; CLI and
  config format: <https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md>.
- ESLint `no-restricted-imports`: <https://eslint.org/docs/latest/rules/no-restricted-imports>;
  `no-restricted-exports` and its `restrictDefaultExports` option:
  <https://eslint.org/docs/latest/rules/no-restricted-exports>.
- Next.js `server-only`: <https://nextjs.org/docs/app/guides/data-security>.
- Versions and observed behaviour: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0059](0059-javascript-toolchain-pins.md), [0063](0063-client-state-layering.md),
  [0065](0065-ui-primitives-and-request-states.md), [0105](0105-architecture-tool-evaluations.md).
- Governs: the web layering rules (layer direction, feature surface, feature shape, server-only
  modules, exports and file names).
