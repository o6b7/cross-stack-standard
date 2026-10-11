---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# API Resources are the only model-to-JSON layer

## Context and Problem Statement

A Laravel controller can turn a model into JSON in many ways: return the model, call `toArray()`
or `toJson()`, pass it to `response()->json()`, or `json_encode()` it. Each of these emits every
visible attribute, including columns added later, and each defines the wire shape in a different
place. The OpenAPI generator documents Resources, not ad-hoc arrays
([0054](0054-generated-api-contract.md)), so shapes built outside Resources also escape the
generated contract.

Resources have sharp edges of their own. `JsonResource::withoutWrapping()` affects only the
outermost response; paginated collections are always wrapped in `data` with `links` and `meta`.
Verified on Laravel 13.33: nesting a Resource's rendered response inside another array produces
`data.data`, and wrapping a paginated Resource collection in a hand-built array silently drops
`links` and `meta`.

What is the single place where models become JSON, and which Resource idioms are fixed?

## Considered Options

- API Resources as the only serialization layer, with fixed idioms
- Return models and rely on `$hidden` and `$visible`
- Hand-built arrays in controllers
- A separate data-object package for output

## Decision Outcome

Chosen option: "API Resources as the only serialization layer, with fixed idioms", because
Resources are the framework's documented transformation layer, the contract generator reads them,
and one class per shape makes each shape reviewable.

- **Only Resources serialize models in the HTTP layer.** Controllers return a Resource or a
  Resource collection, never a model, an Eloquent collection or an array built from one. No
  `toArray()`, `toJson()`, `json_encode()` or `response()->json()` carrying a model in `App\Http`
  outside `App\Http\Resources`.
- **Conditional relations use one form per case.** Inside `::collection()`, `whenLoaded` is passed
  bare: `OrderItemResource::collection($this->whenLoaded('items'))`. A singular relation uses the
  closure form: `$this->whenLoaded('customer', fn () => new CustomerResource($this->customer))`.
  In Laravel 13.33 the closure form returns `null` for a loaded but empty relation without calling
  the closure, so a nullable relation never builds a Resource around `null`.
- **No inline shapes.** An inline `['id' => ..., 'name' => ...]` map for a related model becomes a
  summary Resource. A composite payload (several models in one response) gets its own Resource
  instead of a flattened Resource with raw arrays spliced in.
- **One definition per wire shape.** Two endpoints that return the same shape use the same
  Resource.
- **Never double-wrapped.** Paginated results are returned as `Resource::collection($paginator)`,
  so `links` and `meta` survive; rendered responses are never embedded in other payloads. The
  success shape itself is set by [0052](0052-api-success-shape.md).

### Consequences

- Good, because a new column never reaches the wire unless a Resource adds it.
- Good, because every shape has one class that the contract generator, reviews and tests share.
- Good, because relations appear only when the controller loaded them, which keeps N+1 queries out
  of serialization.
- Bad, because small endpoints need a Resource class even for two fields.
- Bad, because summary Resources multiply; naming them consistently (`CustomerSummaryResource`) is
  a review item.

### Confirmation

- A type-aware custom PHPStan rule fails `toArray()`, `toJson()`, `jsonSerialize()` and
  `attributesToArray()` on model or Eloquent collection types, and `json_encode()` of them, in
  `App\Http` outside `App\Http\Resources` ([0037](0037-phpstan-rules-and-reflection-tests.md)):
  FORCED within its scope.
- A reflection test requires each public controller action to declare a return type from the
  allowed response types, and Larastan checks the returned values against it
  ([0038](0038-larastan-levels-shrink-only-baseline.md)).
- With the api-contract module, a contract test observes every successful JSON response in the
  feature suite and fails on `data.data` nesting and on paginated bodies without `links` and
  `meta` ([0052](0052-api-success-shape.md)): GUARDED, because it sees only exercised routes.
- The `whenLoaded` forms, summary Resources and one definition per shape are Review; duplication
  detection catches literal copies ([0092](0092-dead-code-and-duplication-gates.md)).

## Pros and Cons of the Options

### API Resources as the only serialization layer, with fixed idioms

- Good, because the framework, the contract generator and the gates all understand Resources.
- Bad, because it is more code than returning a model.

### Return models and rely on `$hidden` and `$visible`

- Good, because there is nothing extra to write.
- Bad, because the model's storage shape becomes the API, and a new column is published by default.

### Hand-built arrays in controllers

- Good, because the shape is visible where it is used.
- Bad, because shapes are duplicated per endpoint, escape the contract generator and lose
  pagination metadata when wrapped by hand.

### A separate data-object package for output

- Good, because output types can double as input types.
- Bad, because it competes with the installed Resource layer ([0006](0006-stack-first.md)) and adds
  a dependency for a job the framework already does.

## More Information

- Eloquent API Resources, data wrapping and conditional relationships:
  <https://laravel.com/docs/13.x/eloquent-resources>,
  <https://laravel.com/docs/13.x/eloquent-resources#data-wrapping>,
  <https://laravel.com/docs/13.x/eloquent-resources#conditional-relationships>.
- The wrapping behaviour of Laravel 13.33 (including the dropped `links` and `meta`) is recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0037](0037-phpstan-rules-and-reflection-tests.md), [0040](0040-backend-layering.md),
  [0052](0052-api-success-shape.md), [0054](0054-generated-api-contract.md).
- Governs: the Laravel serialization rules (Resources only, one shape per Resource, no double
  wrapping).
