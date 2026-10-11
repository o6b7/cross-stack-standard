---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Backend layering: thin controllers, disciplined services, no repositories

## Context and Problem Statement

Laravel applications drift in two opposite directions. Some grow layers that add indirection and
no behaviour: a repository in front of every Eloquent model, a service per entity that forwards
CRUD calls, classes named Manager, Handler or UseCase created before anything needs them, and
dependencies pulled from the container with `app()` or `resolve()` in the middle of a method.
Others keep everything in controllers, so a domain rule that a queued job also needs is copied, and
the copies diverge. An agent writing code without a stated layering copies whichever pattern it
saw last.

Where does backend code belong by default, and which layers are not allowed?

## Decision Drivers

- The fewest layers that express the domain; indirection must earn its place.
- One home for domain rules that must run without HTTP.
- Dependencies visible in constructors, so classes are easy to test.
- A one-caller abstraction is a defect ([0013](0013-dry-policy.md)).
- As much as possible checked by gates rather than by review.

## Considered Options

- Thin controllers, disciplined services, Actions for reused writes, no repositories
- A repository and a service per entity (classic layered architecture)
- Everything in controllers and models
- An Action class for every write

## Decision Outcome

Chosen option: "Thin controllers, disciplined services, Actions for reused writes, no
repositories", because it keeps simple endpoints simple and gives shared domain rules exactly one
home.

- **Controllers.** Single-step CRUD stays inline in a thin controller: the FormRequest validates
  ([0044](0044-form-request-validation.md)), the policy authorizes
  ([0043](0043-single-authorization-site.md)), Eloquent writes, and a Resource serializes
  ([0045](0045-resources-only-serialization.md)).
- **Services.** A service exists only for a cohesive domain rule that must run without HTTP: a state
  machine, scoring or derivation, rendering for an external system such as PDF. Services are plain
  classes, injected through the constructor.
- **Banned.** Repositories; per-entity pass-through services; speculative `Manager`, `Handler`,
  `UseCase` and `Interactor` suffixes; service location with `app()` or `resolve()` outside
  service providers.
- **Guards.** A state-machine guard is a named predicate on the domain service (for example
  `canCancel()`), not an enum comparison repeated in controllers.
- **Static classes.** Allowed only for stateless utilities that were designed static from the start.
- **Reused writes.** A multi-step write reused across entry points (HTTP, queue, console) uses the
  one sanctioned Action pattern ([0041](0041-action-pattern.md)). Multi-write transitions run in a
  database transaction inside the service or Action, not in the HTTP layer.

### Consequences

- Good, because a reader finds CRUD in the controller and domain rules in one service, with no
  forwarding layers in between.
- Good, because constructor injection makes every dependency explicit and replaceable in tests.
- Good, because the bans are mostly mechanical, so agents get fast feedback.
- Bad, because teams used to repositories must give them up; swapping the persistence layer is not
  a goal of this layering.
- Bad, because deciding when logic deserves a service stays a judgement call in review.

### Confirmation

Pest architecture tests ([0036](0036-pest-replaces-phpunit-runner.md)) enforce the suffix bans
(repositories and the speculative suffixes, with a configurable list), the ban on `app()` and
`resolve()` outside `App\Providers`, and the ban on the database facade in the HTTP layer. They are
GUARDED: synonyms such as `Gateway` or `Dao`, `Container::getInstance()->make()` and an injected
container's `make()` evade them, and the registry lists these evasions. Whether logic deserves a
service, whether a service only forwards calls, named guards and static utilities are checked in
review (REVIEW).

## Pros and Cons of the Options

### Thin controllers, disciplined services, Actions for reused writes, no repositories

- Good, because every layer that exists has a job.
- Bad, because the boundary between "inline" and "service" needs judgement.

### A repository and a service per entity (classic layered architecture)

- Good, because it is familiar and uniform.
- Bad, because most of those classes forward calls to Eloquent, which already is the data-access
  layer, and they double the code an agent must keep consistent.

### Everything in controllers and models

- Good, because it has no indirection at all.
- Bad, because rules needed by jobs and commands get copied, and the copies drift.

### An Action class for every write

- Good, because it is uniform.
- Bad, because single-step writes gain a class with one caller, which the DRY policy treats as a
  defect.

## More Information

- Laravel service container and constructor injection: <https://laravel.com/docs/13.x/container>.
- Pest architecture expectations: <https://pestphp.com/docs/arch-testing>.
- Related: [0013](0013-dry-policy.md), [0036](0036-pest-replaces-phpunit-runner.md),
  [0041](0041-action-pattern.md), [0045](0045-resources-only-serialization.md).
- Governs: the Laravel layering rules (controllers, services, suffix bans, service location,
  transactions, static utilities).
