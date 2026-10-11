---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# One sanctioned Action pattern for reusable multi-step writes

## Context and Problem Statement

Backend layering ([0040](0040-backend-layering.md)) keeps single-step CRUD inline in thin
controllers and allows services only for cohesive domain rules. That leaves one kind of code
without a home: a write with several steps (several rows, a transaction, events or follow-up jobs)
that more than one entry point runs. Submitting an order from an HTTP endpoint and from a nightly
job, or closing a period from a controller and from a console command, are typical cases.

Without a sanctioned home, the write ends up copied into each entry point and the copies drift,
or a job calls controller code, or a per-entity "service" grows into the pass-through layer that
0040 bans. Where does a reusable multi-step write live, and what may it depend on?

## Decision Drivers

- One definition of each business write, whichever entry point runs it.
- Jobs and commands must be able to call it without HTTP objects.
- Enforceable with the architecture presets the kit already runs ([0036](0036-pest-replaces-phpunit-runner.md)).
- No ceremony for writes that have a single caller ([0013](0013-dry-policy.md)).

## Considered Options

- Invokable `App\Actions\{Verb}{Noun}` classes for multi-step writes with more than one caller
- Services only, with no Action layer
- A command bus (command objects plus handlers and a dispatcher)
- An Action for every write

## Decision Outcome

Chosen option: "Invokable `App\Actions\{Verb}{Noun}` classes for multi-step writes with more than
one caller", because it gives shared writes exactly one home that HTTP, queues and the console can
all call, with the smallest shape the presets can check.

- **When.** A write with more than one step that at least two entry points (controllers, jobs,
  console commands, listeners) run. Single-step CRUD stays in the controller. An Action with one
  caller is a one-caller abstraction and is inlined until a second caller appears.
- **Shape.** One class per write in `App\Actions`, named verb then noun (`SubmitOrder`,
  `ClosePeriod`), with a single public `__invoke()`. Collaborators arrive through constructor
  injection; callers receive the Action by injection too (controller method injection, a job's
  `handle()` parameters), never through `app()` or `resolve()` (0040).
- **Inputs and outputs.** An Action takes a validated array (`$request->validated()`) or a DTO,
  never a FormRequest, a Request or a Resource, and returns models or plain values, never an HTTP
  response. The controller turns the result into a Resource
  ([0045](0045-resources-only-serialization.md)). Validation and authorization stay at the endpoint
  ([0043](0043-single-authorization-site.md), [0044](0044-form-request-validation.md)); an Action
  trusts its caller to have done both.
- **Steps that must succeed together** run in one transaction owned by the Action, since the HTTP
  layer holds no transactions (0040). A refused state change is reported as a conflict
  ([0048](0048-http-status-vocabulary.md)).
- **State transitions** are exposed as invokable controllers ([0042](0042-api-routing.md)) that call
  the transition's Action. Transitions are the usual case of a write that jobs and commands also
  run; when HTTP is truly the only caller, the invokable controller holds the write inline until a
  second caller appears.
- **Stack-first.** A project that already has an actions package installed follows that package's
  conventions instead ([0006](0006-stack-first.md)).

### Consequences

- Good, because a shared write has one definition, and queue and console code call it without
  building HTTP objects.
- Good, because the `App\Http` boundary is already enforced by the preset, so an Action cannot
  quietly start depending on request or response classes.
- Good, because a command, a job and an endpoint test can each exercise the same class.
- Bad, because deciding when a write "deserves" an Action is a judgement that review must make.
- Bad, because DTOs or array shapes become a second description of the input next to the
  FormRequest rules; Larastan array shapes or DTO types keep them honest.

### Confirmation

- `arch()->expect('App\Actions')->toBeInvokable()` in the kit's architecture test: FORCED. On
  Pest 5.2.1 it fails an Action that exposes only `handle()`.
- The Pest `laravel` preset's `expect('App\Http')->toOnlyBeUsedIn(['App\Http', 'App\Providers'])`:
  FORCED. On Pest 5.2.1 an Action that type-hints a FormRequest or uses a Resource fails it.
- The same preset limits controller public methods to the resourceful set plus `__invoke` and
  `middleware`, so a transition written as a `submit()` method fails and becomes an invokable
  controller.
- The kit's architecture test keeps one documented `->ignoring()` list for the presets (for
  example request concern traits). Actions need no entry there, because the `laravel` preset does
  not flag `App\Actions` (verified on Pest 5.2.1); adding `App\Actions` to it is a review finding.
- The one-caller rule, the multi-step threshold and the verb-noun name are Review. Duplication
  detection ([0092](0092-dead-code-and-duplication-gates.md)) catches copies of a write that
  should have become an Action.

## Pros and Cons of the Options

### Invokable `App\Actions\{Verb}{Noun}` classes for multi-step writes with more than one caller

- Good, because the shape is one class and one method, checkable by an architecture test.
- Good, because it fits the framework's own container injection for controllers and jobs.
- Bad, because it adds a directory that contributors must learn to use only past two callers.

### Services only, with no Action layer

- Good, because there is one fewer concept.
- Bad, because there is no home for a write shared by HTTP and a queue: it either becomes a
  per-entity service, which 0040 bans, or is copied into each entry point.

### A command bus (command objects plus handlers and a dispatcher)

- Good, because commands are serializable and can be queued uniformly.
- Bad, because every write needs two classes plus a dispatcher, the `Handler` suffix is one of the
  speculative layers 0040 bans, and the indirection hides which code runs.

### An Action for every write

- Good, because the rule is simple to state.
- Bad, because most writes have one caller, so it mass-produces the one-caller abstractions that
  0013 treats as defects.

## More Information

- Pest architecture testing and presets: <https://pestphp.com/docs/arch-testing>; preset source at
  the pinned version: <https://github.com/pestphp/pest/blob/v5.2.1/src/ArchPresets/Laravel.php>.
- Dependency injection in controllers and jobs:
  <https://laravel.com/docs/13.x/controllers#dependency-injection-and-controllers>,
  <https://laravel.com/docs/13.x/queues#handle-method-dependency-injection>.
- Verified versions: [verified-versions.md](../maintainers/verified-versions.md) (Pest presets and
  custom arch expectations).
- Related: [0013](0013-dry-policy.md), [0040](0040-backend-layering.md),
  [0042](0042-api-routing.md), [0055](0055-background-jobs.md).
- Governs: the Laravel layering rules for Actions and state-transition controllers.
