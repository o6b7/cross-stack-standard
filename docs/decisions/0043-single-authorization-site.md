---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Authorization: a single site and a single policy ability for each endpoint

## Context and Problem Statement

Laravel offers several places to authorize a request: a FormRequest's `authorize()` method, a
`Gate::authorize()` call in the controller action, the `can` middleware on the route, and the
`#[Authorize]` controller attribute. Its documentation also allows `authorize()` to simply
`return true` when authorization happens elsewhere.

Used freely, these produce endpoints where nobody can say which check is authoritative:

- a FormRequest that returns `true` plus a check in the controller means validation runs before
  authorization, so an unauthorized caller receives field errors (422) instead of a denial (403);
- two abilities checked on one endpoint (for example `update` and `manage`) make the effective rule
  a conjunction that no policy states;
- a common defect is a gate that only proves some authorize call exists: it passes an endpoint
  whose ability is misspelled or missing from the policy.

How is each endpoint authorized so that a reader, and a test, can find the one rule that decides?

## Decision Drivers

- The server authorizes every action ([0012](0012-backend-authority.md)).
- Denial must happen before validation, so that errors never disclose data to unauthorized callers.
- A route-table meta-test must be able to map each route to one policy ability.

## Considered Options

- Exactly one site per endpoint (FormRequest when present, controller otherwise) and one ability
- FormRequest `authorize()` only, on every endpoint
- Route middleware (`can`) only
- Any combination, reviewed case by case

## Decision Outcome

Chosen option: "Exactly one site per endpoint (FormRequest when present, controller otherwise) and
one ability", because it follows the framework's own request lifecycle and gives every route a
single, machine-readable answer to "who may call this".

- **When the endpoint has a FormRequest**, its `authorize()` checks exactly one policy ability, for
  example `return $this->user()->can('update', $this->order);`. The controller does not authorize
  again.
- **Otherwise** (typically index, show and delete), the controller authorizes with one ability:
  a `Gate::authorize()` call in the action, or the `can` middleware or `#[Authorize]` attribute for
  that action, which are the same site written declaratively.
- **Banned:** a bare `return true` (or any constant-true body) in `authorize()`; a second
  authorization site on the same endpoint; more than one ability per endpoint. A rule that needs
  several conditions is one policy method that states them.
- **Public routes** (login, liveness) are declared in an allowlist with a reason and an expiry date
  ([0005](0005-explicit-exceptions.md)).
- **Lists** are filtered by a query scope that mirrors the policy's view rule; the scope and the
  policy method reference each other in comments ([0047](0047-model-conventions.md)).
- Client-side permission checks only hide or disable controls; they never replace this check.

### Consequences

- Good, because an unauthorized caller is denied before validation runs.
- Good, because each route maps to one policy method, which the meta-test can verify exists.
- Good, because policy methods become the complete, reviewable statement of access rules.
- Bad, because an endpoint that genuinely combines two concerns needs a dedicated policy method
  instead of two stacked checks.
- Bad, because the meta-test reads abilities statically; an ability name computed at runtime cannot
  be resolved and needs an allowlist entry.

### Confirmation

- A custom PHPStan rule in the kit's Laravel package fails a FormRequest `authorize()` whose return
  type PHPStan infers as the constant `true` (so `return true`, `return !false` and
  `return (bool) 1` all fail) ([0037](0037-phpstan-rules-and-reflection-tests.md)): FORCED.
- The policy-ability meta-test ([0039](0039-backend-testing-floor.md)) iterates the registered
  routes, extracts the ability and model from the FormRequest, the controller's `Gate` calls, the
  `can` middleware or the attribute, and asserts that the model's policy defines that method; public
  routes come from the allowlist: GUARDED, because extraction is static.
- A reflection test on the same extraction fails an endpoint with a non-trivial `authorize()` that
  also authorizes in the controller, or that references more than one distinct ability: GUARDED.
- Scope-to-policy mirroring is Review.

## Pros and Cons of the Options

### Exactly one site per endpoint (FormRequest when present, controller otherwise) and one ability

- Good, because it matches where the framework already runs authorization for each endpoint shape.
- Bad, because contributors must know which of two sites applies; the rule is short enough to state
  in one line.

### FormRequest `authorize()` only, on every endpoint

- Good, because there is a single site everywhere.
- Bad, because read and delete endpoints would need FormRequests that validate nothing, which adds
  empty classes.

### Route middleware (`can`) only

- Good, because the route table shows every rule.
- Bad, because checks that depend on validated input or on several bound models become awkward
  strings, and the FormRequest still runs its own `authorize()`.

### Any combination, reviewed case by case

- Good, because it needs no rules.
- Bad, because it produces the duplicated and stacked checks described above, and no gate can tell
  a correct endpoint from a wrong one.

## More Information

- Authorizing form requests (including the documented `return true` option):
  <https://laravel.com/docs/13.x/validation#authorizing-form-requests>.
- Authorizing through the `Gate` facade, middleware and attributes:
  <https://laravel.com/docs/13.x/authorization#authorizing-actions-using-policies>,
  <https://laravel.com/docs/13.x/authorization#via-middleware>.
- Related: [0012](0012-backend-authority.md), [0037](0037-phpstan-rules-and-reflection-tests.md),
  [0039](0039-backend-testing-floor.md), [0047](0047-model-conventions.md).
- Governs: the Laravel authorization rules and the security rules on policy abilities and trivial
  `authorize()` bodies.
