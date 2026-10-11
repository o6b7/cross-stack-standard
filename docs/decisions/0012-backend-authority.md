---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# The backend is authoritative; clients mirror the contract and defer business rules

## Context and Problem Statement

The Standard covers one Laravel JSON API and up to two kinds of client: a web app (Next.js, or a
React SPA) and an Expo mobile app. Each client is tempted to re-implement some server logic: a
price or eligibility calculation, a status-transition check, a permission test or a validation
rule. Every copy is a second source of truth that has to change in lockstep with the server, in
another language and often in another repository.

Common defects follow. A client-side permission check is treated as the security boundary. A
validation rule is tightened on the server but not in the form, so users hit errors the UI said
could not happen. A hand-maintained TypeScript mirror of a server enum silently falls behind. With
a web and a mobile client on one backend, each of these can drift twice.

Where do business rules live, and what may a client do with them?

## Decision Drivers

- One place to change a business rule.
- Security cannot depend on code that runs on a device or in a browser the user controls.
- Clients still need instant feedback: disabled buttons, inline validation, optimistic updates.
- Drift between server and client must be detectable before production.
- Every additional client multiplies the cost of each duplicated rule.

## Considered Options

- The backend is authoritative; clients defer, and mirror only deliberately
- Shared client-side rule code (one TypeScript package for web and mobile)
- Clients own the rules they display

## Decision Outcome

Chosen option: "The backend is authoritative; clients defer, and mirror only deliberately",
because it is the only option with a single source of truth for both security and behaviour, and
the generated contract turns the remaining client knowledge into a mechanical check.

- **Rules live on the server.** Web, SPA and mobile clients render server results and send
  intents; they do not re-implement business rules.
- **Deliberate mirrors are named and tested.** A client mirror that exists for UX, such as instant
  form feedback or hiding an action the server will refuse, names its backend source (the request
  class, policy ability or enum) in a comment and is covered by a client test of the same cases
  ([0068](0068-frontend-testing.md)).
- **Client permission checks only shape the UI.** They hide or disable controls. The server
  authorizes every action at one site ([0043](0043-single-authorization-site.md)). The Next.js
  server is a client too: Route Handlers and Server Actions re-verify the session and leave
  authorization to the API ([0070](0070-proxy-ux-only-session-reverification.md)).
- **Client validation is UX only.** The server decides validity and returns field errors as
  problem details with an `errors` member ([0053](0053-rfc-9457-problem-details.md)), which forms
  map back onto their fields ([0067](0067-forms.md)).
- **Wire types are generated.** Types for requests, responses and enums come from the generated
  contract, never from hand-maintained mirrors ([0054](0054-generated-api-contract.md)).

This principle is one of the Tier-1 invariants ([0008](0008-tiers-and-invariants.md)).

### Consequences

- Good, because a rule changes in one place and every client follows.
- Good, because a tampered client cannot grant itself anything: the server checks again.
- Good, because web and mobile behave the same for the same data.
- Bad, because some decisions cost a round trip that a client-side copy would avoid.
- Bad, because offline-first mobile features, which must decide without the server, need their
  own ADR naming which rules are mirrored and how conflicts are reconciled.
- Bad, because telling a deliberate, tested mirror from an accidental copy stays a review
  judgement.

### Confirmation

Partly gated, partly Review. CI regenerates the API contract and fails on drift
([0054](0054-generated-api-contract.md)); the backend's route and policy meta-tests check that
every non-public endpoint has one authorization site ([0043](0043-single-authorization-site.md));
the Next.js session re-verification rule has its own lint gate
([0070](0070-proxy-ux-only-session-reverification.md)). The principle itself, that no client code
re-implements a business rule, is REVIEW: no tool can reliably tell a business rule from
presentation logic.

## Pros and Cons of the Options

### The backend is authoritative; clients defer, and mirror only deliberately

- Good, because security and behaviour share one source.
- Good, because it scales to any number of clients.
- Bad, because clients need a round trip for decisions they could otherwise make locally.

### Shared client-side rule code (one TypeScript package for web and mobile)

- Good, because web and mobile share one copy.
- Bad, because the server still needs the rule in PHP, so there are still two sources in two
  languages.
- Bad, because it invites clients to treat the shared result as authoritative.

### Clients own the rules they display

- Good, because each client can decide offline and without latency.
- Bad, because every client becomes a security boundary it cannot be.
- Bad, because drift is certain as soon as there are two clients.

## More Information

- RFC 9457, Problem Details for HTTP APIs: <https://www.rfc-editor.org/rfc/rfc9457>
- Related: [0043](0043-single-authorization-site.md), [0053](0053-rfc-9457-problem-details.md),
  [0054](0054-generated-api-contract.md), [0067](0067-forms.md),
  [0068](0068-frontend-testing.md), [0070](0070-proxy-ux-only-session-reverification.md),
  [0013](0013-dry-policy.md) (one source for a rule rendered in two places).
- Governs: the Tier-1 server-authority invariant, the web and mobile rules on client validation
  and client-side permission checks, and the API contract rules that replace hand-written mirrors.
