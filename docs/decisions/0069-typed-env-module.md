---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Typed environment module per JavaScript app; raw process.env banned by a three-rule combination

## Context and Problem Statement

`process.env` values are untyped strings that may be missing. Read ad hoc across a codebase, a
missing variable surfaces as `undefined` deep inside a request instead of at startup, the same
variable is parsed three ways, and nobody can list what an app needs to run. Bundlers add their own
constraints. Next.js inlines `process.env.NEXT_PUBLIC_X` at build time but not dynamic lookups such
as `process.env[name]` or `const env = process.env; env.NEXT_PUBLIC_X`. Expo inlines only the dot
form `process.env.EXPO_PUBLIC_X`, and `EXPO_PUBLIC_` values ship as plain text in the bundle.

Banning raw access is harder than it looks. ESLint's `no-restricted-properties` with
`{ object: "process", property: "env" }` reports `process.env.X`, `process["env"]`, `process?.env`,
`const { env } = process` and `const { X } = process.env`. It misses the process module imported
by name (`import { env } from "node:process"`, `import proc from "process"`), access through
`globalThis.process.env`, and aliasing (`const p = process; p.env`).

How does each JavaScript app read its environment, and how is raw access kept out?

## Decision Drivers

- A misconfigured environment fails at startup, with the variable named.
- One place lists every variable an app reads, and the example env file documents it
  ([0085](0085-environment-files.md)).
- Public variables are referenced in the form the bundler inlines.
- The installed validator is used ([0006](0006-stack-first.md)).
- The ban's label matches what it actually catches ([0002](0002-gates-over-guidelines.md)).

## Considered Options

- A typed env module per app, with raw access banned by three core ESLint rules
- `@t3-oss/env-nextjs` in every Next.js project
- A single `no-restricted-properties` ban without a module
- Documentation only

## Decision Outcome

Chosen option: "A typed env module per app, with raw access banned by three core ESLint rules",
because it validates at startup on both tracks with no new dependency, and the rule combination
closes every form the single rule misses except a short, listed set.

- **The module.** Each JavaScript app reads its environment in one module, `src/lib/env.ts` by
  default (configurable). It validates at load and exports typed values. On Next.js, server
  variables sit in a module that imports `server-only`, and public variables are referenced as
  literal `process.env.NEXT_PUBLIC_X` member accesses so the build can inline them.
- **Validator.** The installed Standard Schema validator (zod when installed); otherwise a small
  hand-written validator, with a comment saying no validator is installed. An installed typed-env
  library, such as `@t3-oss/env-nextjs`, is the env module under stack-first.
- **Documentation.** Every key in the module's schema appears in the app's example env file.
- **The ban.** Outside the env module and root config files, three core ESLint rules in the shared
  config: `no-restricted-properties` for `process.env` and `globalThis.process`;
  `no-restricted-imports` for `process` and `node:process`; and `no-restricted-syntax` for a
  declaration that aliases `process`. Core rules are used rather than a custom rule in the
  Standard's plugin ([0061](0061-own-eslint-plugin-no-commented-code.md)), because together they
  already catch every common form. The label is GUARDED, with the remaining evasions listed.
- **Public variables.** `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` are referenced statically and never
  hold secrets. On mobile, the framework preset's `expo/no-dynamic-env-var` and
  `expo/no-env-var-destructuring` rules also apply.
- **bff-auth.** With the module on, the upstream API base URL lives only in the server schema;
  there is no public-prefixed API URL ([0073](0073-bff-auth-module.md)).

### Consequences

- Good, because a missing or malformed variable stops the app at startup with its name.
- Good, because the env module and the example file together list everything an app needs.
- Good, because public variables are always in the form the bundler inlines.
- Bad, because a project without a validator carries a small hand-written one.
- Bad, because the ban is evadable by deliberate code, so it stays GUARDED.
- Bad, because root config files are exempt and read the environment directly.

### Confirmation

- The three-rule combination: GUARDED. Evasions: `require("process")`, `globalThis["process"]`,
  `global.process.env`, `Reflect.get(process, "env")`, `eval`, and aliasing by assignment rather
  than declaration.
- A web architecture test imports the env module and asserts that every schema key appears in the
  example env file: FORCED target.
- With bff-auth, a test asserts the API base URL exists only in the server schema and no
  public-prefixed API key exists: GUARDED target.
- The Expo preset's env rules run in the mobile lint gate: GUARDED target.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### A typed env module per app, with raw access banned by three core ESLint rules

- Good, because it works identically on web and mobile and adds no dependency.
- Bad, because the server and public split on Next.js is written by the project.

### `@t3-oss/env-nextjs` in every Next.js project

- Good, because it provides the server and client split and build-time validation ready-made.
- Bad, because it covers Next.js only, is still a 0.x release, and would add a dependency to
  projects that do not have it.

### A single `no-restricted-properties` ban without a module

- Good, because it is one line of configuration.
- Bad, because imports of the process module, `globalThis` access and aliasing pass it.

### Documentation only

- Good, because it costs nothing.
- Bad, because raw reads spread and missing variables fail at runtime.

## More Information

- Next.js environment variables: <https://nextjs.org/docs/app/guides/environment-variables>;
  data security and `server-only`: <https://nextjs.org/docs/app/guides/data-security>.
- Expo environment variables: <https://docs.expo.dev/guides/environment-variables/>.
- ESLint `no-restricted-properties`:
  <https://eslint.org/docs/latest/rules/no-restricted-properties>.
- Standard Schema: <https://standardschema.dev/>; zod: <https://zod.dev/>; `@t3-oss/env-nextjs`:
  <https://env.t3.gg/docs/nextjs>.
- The evasion reproductions and versions: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0006](0006-stack-first.md), [0061](0061-own-eslint-plugin-no-commented-code.md),
  [0085](0085-environment-files.md).
- Governs: the web and mobile environment-access rules (the env module, the raw-access ban,
  public-variable references, env-key documentation).
