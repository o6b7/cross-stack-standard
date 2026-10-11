---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Tracks, profiles and scope: laravel, web and mobile; unruled areas declared

## Context and Problem Statement

The Standard covers a Laravel API, web clients and native mobile clients, used alone or together.
A rule written for one stack is noise, or wrong, in another: a rule about Next.js Route Handlers
means nothing in a Vite single-page app, and a rule about PHP namespaces means nothing to an Expo
app. A standard also tends to overreach: it offers guidance for stacks nobody has run it on, which
reads as tested advice, and it lets readers cite a subsystem as a pattern when nobody has examined
that subsystem. Some areas, such as deployment, are deliberately left to each team.

How is the Standard scoped per stack, and how are the areas it does not rule made visible?

## Decision Drivers

- A project must receive exactly the rules that apply to its stacks.
- Framework-specific rules must not leak into other profiles of the same track.
- Untested guidance must never look like tested guidance.
- The boundary of the Standard must be stated, not implied.

## Considered Options

- Three tracks with profiles, scoped through the registry, and an explicit list of unruled areas
- A Next.js-first Standard with other stacks covered by prose
- One rule set applied to every project regardless of stack

## Decision Outcome

Chosen option: "Three tracks with profiles, scoped through the registry, and an explicit list of
unruled areas", because it gives each project exactly its subset and keeps the Standard honest
about what it has and has not exercised.

- **Tracks.** `laravel` (a JSON API), `web` and `mobile` (Expo / React Native). The `web` track has
  profiles: `next` (Next.js App Router, the default) and `react-spa`, which is reserved and ships
  after 1.0 ([0075](0075-react-spa-profile-after-1-0.md)). A project declares its tracks and
  profile in `.cross-stack/standard.json`; a single-stack project applies its subset, a full-stack
  project applies everything, and shared rules apply to all.
- **Rule scopes beyond one track.** A registry rule belongs to `laravel`, `web` or `mobile`, to
  `client` (both JavaScript client tracks, web and mobile, and never Laravel) or to `shared`
  (every project, whatever its tracks). `client` and `shared` are rule scopes, not tracks a
  project declares. A client rule applies to a project with a web or mobile track, and its gate
  must ship in every client track that ships that kind of configuration, so lint and type-checking
  rules meant for both are not proven by the web configuration alone and never require the
  Laravel check chain to run JavaScript checks.
- **Profiles in the registry.** A rule's `profiles` field limits it to named profiles, so Next-only
  rules (proxy, Route Handlers, Server Actions, React Server Components) are off for other
  profiles.
- **Unexercised guidance.** Guidance for a path no adopter has run yet is marked untested and
  limited to constraints, with no example code, until an adopter runs it.
- **Out of scope.** Container builds, orchestration and continuous deployment are outside the
  Standard beyond the CI quality dependency: build and deploy jobs declare `needs:` on the quality
  job ([0090](0090-ci-contract.md)). Server-rendered Laravel front ends are not a track.
- **Declared, not implied.** Unruled areas are listed explicitly, and no part of any codebase is
  recommended as an example until someone has examined it.

### Consequences

- Good, because a backend-only or mobile-only project sees only rules it can act on.
- Good, because Next-specific security rules cannot misfire in a single-page app.
- Good, because readers can tell tested guidance from constraints.
- Bad, because a full-stack repository whose tracks do not sit at the root must name a root for
  each track in the manifest's `trackRoots` field ([0023](0023-adopter-manifest-and-upgrade.md)),
  which monorepos with unusual layouts have to configure.
- Bad, because server-rendered Laravel apps get only the backend rules, and teams deploying through
  containers get no deployment rules.

### Confirmation

The manifest schema restricts `tracks` to `laravel`, `web` and `mobile` and accepts `profile` only
with the `web` track; the registry schema accepts the rule tracks `laravel`, `web`, `mobile`,
`client` and `shared`, and `profiles` only on web rules. Gate presence expands a client rule to the
web and mobile templates and a shared rule to every template. The configuration script gate that
checks every detected stack has a declared track is tracked in the registry (REVIEW until it ships,
[0002](0002-gates-over-guidelines.md)). The generated rule pages group rules by track. Labelling
of unexercised guidance and the list of unruled areas are checked in review.

## Pros and Cons of the Options

### Three tracks with profiles, scoped through the registry, and an explicit list of unruled areas

- Good, because the rule set follows the project's real stacks.
- Bad, because every rule needs a track and, where relevant, a profile.

### A Next.js-first Standard with other stacks covered by prose

- Good, because effort concentrates on one stack.
- Bad, because mobile and single-page projects would get prose that no gate backs.

### One rule set applied to every project regardless of stack

- Good, because there is nothing to configure.
- Bad, because irrelevant rules train readers to ignore rules.

## More Information

- Manifest schema: [`schemas/standard.schema.json`](../../schemas/standard.schema.json); registry
  schema: [`registry/rules.schema.json`](../../registry/rules.schema.json).
- Next.js App Router: <https://nextjs.org/docs/app>; Expo: <https://docs.expo.dev/>.
- Related: [0010](0010-opt-in-modules.md), [0075](0075-react-spa-profile-after-1-0.md),
  [0090](0090-ci-contract.md).
- Governs: the `track` and `profiles` fields of every rule, the manifest's track declaration, and
  the documented list of unruled areas.
