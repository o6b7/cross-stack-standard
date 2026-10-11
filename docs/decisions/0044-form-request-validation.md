---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Request validation: Store and Update FormRequests; wire names equal storage names

## Context and Problem Statement

Laravel can validate input in a controller (`$request->validate()`, the `Validator` facade,
`validator()`) or in a FormRequest class. Inline validation scatters rules across controllers, is
easy to forget on one write path, and is invisible to tools that read FormRequests: the route-table
gates and the OpenAPI generator, which documents FormRequest rules as the request body
([0054](0054-generated-api-contract.md)).

A second problem is renaming. When a field arrives under one name and is stored under another, the
alias has to be applied in every request that writes the column and reversed in the Resource that
reads it. A common defect is an alias that exists in only one of the Store and Update requests, so
one write path silently drops the field while the Resource emits a name the client never sent.

Where does write validation live, how are the classes named, and how do wire names relate to
columns?

## Considered Options

- A FormRequest on every write, named per model, with wire names equal to column names
- Inline validation in controllers
- One shared request per model for store and update
- A separate data-object layer that maps wire names to columns

## Decision Outcome

Chosen option: "A FormRequest on every write, named per model, with wire names equal to column
names", because it keeps every rule in a class the framework, the gates and the contract generator
all understand, and removes the mapping step where aliases drift.

- **Every `POST`, `PUT` and `PATCH` action takes a FormRequest.** A write with no body (for example
  a state transition with no payload) is declared in an allowlist with a reason
  ([0005](0005-explicit-exceptions.md)). Validation anywhere else in `App\Http` is banned.
- **Naming.** Resource writes use `Store{Model}Request` and `Update{Model}Request`
  (`StoreOrderRequest`, `UpdateOrderRequest`). Transition requests are named after the transition
  (`SubmitOrderRequest`). The Pest `laravel` preset already requires the `Request` suffix and the
  FormRequest base class.
- **Wire names equal column names.** `validated()` output goes to the model or the Action
  ([0041](0041-action-pattern.md)) without renaming. When an alias cannot be avoided, it lives in
  both the Store and the Update request, and the Resource emits the field from a real source, never
  from a name that only the request knows.
- **Writes use validated input only** (`validated()` or `safe()`), never raw request accessors
  ([0047](0047-model-conventions.md)).
- **Authorization** stays in the same class's `authorize()` ([0043](0043-single-authorization-site.md)).
- **Custom messages** (`messages()`) are keyed only to rules that exist.
- **Failures** are 422 responses whose RFC 9457 `errors` member uses the same field names
  ([0053](0053-rfc-9457-problem-details.md)), so clients map them straight onto form fields
  ([0067](0067-forms.md)).

### Consequences

- Good, because each write's rules are in one class that tests, gates and the OpenAPI export read.
- Good, because the name a client sends, the name stored and the name returned are the same, so
  round trips need no mapping code on any client.
- Good, because 422 field keys line up with form fields without translation tables.
- Bad, because column names become part of the public contract; renaming a column is an API change
  handled like any other breaking change ([0042](0042-api-routing.md)).
- Bad, because Store and Update requests often share most rules; shared rules move to one place
  (for example a concern trait used by both requests) rather than being copied.

### Confirmation

- A route-table reflection test asserts that every `POST`, `PUT` and `PATCH` action has a parameter
  typed as a FormRequest subclass, with body-less writes allowlisted: FORCED.
- A type-aware custom PHPStan rule fails `validator()`, the `Validator` facade, the validation
  factory's `make()` and `Request::validate()` in `App\Http` outside FormRequest classes
  ([0037](0037-phpstan-rules-and-reflection-tests.md)): FORCED.
- A check derives the model from each resource controller and asserts that `store()` and `update()`
  take `Store{Model}Request` and `Update{Model}Request`: GUARDED, because the model name is derived
  from the controller name.
- A reflection test compares each FormRequest's `messages()` keys with its `rules()`: GUARDED.
- Wire-name equality and the alias rule are Review.

## Pros and Cons of the Options

### A FormRequest on every write, named per model, with wire names equal to column names

- Good, because validation and authorization run before the controller body, in the order the
  framework defines.
- Bad, because it adds two classes per resource; generators (`make:request`) keep the cost low.

### Inline validation in controllers

- Good, because rules sit next to the code that uses them.
- Bad, because gates and the contract generator cannot see them, and a forgotten call leaves a write
  unvalidated.

### One shared request per model for store and update

- Good, because there is one class to maintain.
- Bad, because create and update rules differ (required versus sometimes, uniqueness ignoring the
  current row), so the class fills with conditionals.

### A separate data-object layer that maps wire names to columns

- Good, because the API can use names independent of the schema.
- Bad, because every mapping is written twice (in and out) on every path, which is where the alias
  defect above comes from.

## More Information

- Form request validation and the validated input API:
  <https://laravel.com/docs/13.x/validation#form-request-validation>,
  <https://laravel.com/docs/13.x/validation#working-with-validated-input>.
- Validation error response format: <https://laravel.com/docs/13.x/validation#validation-error-response-format>.
- Scramble's FormRequest inference is recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0037](0037-phpstan-rules-and-reflection-tests.md),
  [0045](0045-resources-only-serialization.md), [0053](0053-rfc-9457-problem-details.md).
- Governs: the Laravel validation rules (FormRequest per write, no inline validation, request
  naming, wire and storage names, message keys).
