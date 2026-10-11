---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# API routing: URI-versioned, resourceful and controller-only

## Context and Problem Statement

Laravel mounts `routes/api.php` under `/api` and leaves versioning, URI style and the choice
between closures and controllers to each project. Three problems follow.

- **No evolution path.** Without a version segment, the first breaking change either breaks every
  client at once or forces awkward parallel routes. Mobile clients make this acute: installed app
  versions stay in use long after a release.
- **Inconsistent URIs.** Mixed casing, singular and plural nouns, and state changes squeezed into
  `PUT` bodies make the API harder to learn and to check mechanically.
- **Routes that gates cannot see.** A route closure has no controller class, so the checks that
  reflect over controller actions (FormRequest parameters, authorization sites, return types, the
  presets) never examine it. The stock `php artisan install:api` publishes exactly such a closure
  for `GET /user`.

How are API routes shaped so that they can evolve without breaking clients and every route stays
visible to the gates?

## Considered Options

- URI versioning under `/api/v1`, resourceful kebab-case plural URIs, controller-only routes
- Header or media-type versioning
- No versioning until a breaking change is needed
- Free-form routes, closures allowed

## Decision Outcome

Chosen option: "URI versioning under `/api/v1`, resourceful kebab-case plural URIs,
controller-only routes", because the version prefix costs one line of configuration and the other
two conventions make the route table a reliable input for gates.

- **Versioning.** A new API mounts under `/api/v1`, set once with `apiPrefix: 'api/v1'` in
  `withRouting()` in `bootstrap/app.php`. A breaking change ships as `/api/v2` next to `v1` until
  clients have moved. An existing unversioned API that is already live is recorded as a project
  decision rather than broken; for such projects the version gate is opt-in.
- **Clients** keep the version segment in one configured base URL and never repeat it in request
  paths, so a version move is a one-line change per client.
- **URI shape.** Static segments are kebab-case plural resource nouns (`/api/v1/purchase-orders`).
  Standard operations use resource routes (`Route::apiResource`). A non-resourceful state
  transition is `POST {resources}/{id}/{verb}` (`POST /api/v1/orders/{order}/submit`), served by an
  invokable controller that calls the transition's Action ([0041](0041-action-pattern.md)).
- **Safe methods.** GET and HEAD routes map only to `index`, `show` or an allowlisted read-only
  action. RFC 9110 defines both methods as safe, and browsers, caches, prefetchers and crawlers
  send them without the user's intent, so a state-changing GET invites request forgery whatever
  the client is.
- **Controller-only.** Every application route resolves to a controller action; route closures are
  banned. Routes the framework registers itself, such as the health route configured through
  `withRouting(health: ...)`, are excluded ([0051](0051-health-endpoints.md)).

### Consequences

- Good, because clients get a non-breaking path for future changes, and the choice of when to cut
  `v2` is left until it is needed.
- Good, because every route is visible to the controller-level gates for validation,
  authorization, serialization and rate limiting ([0043](0043-single-authorization-site.md),
  [0044](0044-form-request-validation.md), [0050](0050-rate-limiting.md)).
- Good, because predictable URIs let list, filter and pagination checks iterate the route table
  ([0049](0049-server-driven-collections.md)).
- Bad, because the stock `/user` closure from `install:api` must be replaced by a controller in
  every adopting project; the kit's template ships that controller.
- Bad, because a plural check on English nouns is a heuristic; uncountable or irregular nouns need
  allowlist entries ([0005](0005-explicit-exceptions.md)).

### Confirmation

Route-table tests in the kit's Pest suite, written against the registered routes:

- every route in the API group matches the configured version pattern (default `^api/v\d+/`):
  FORCED within its scope, enabled by the greenfield template and opt-in for a live unversioned
  API;
- every application route's action is a controller method, not a closure (the framework reports a
  closure action as `Closure`): FORCED;
- static URI segments are kebab-case with a plural heuristic, and non-resourceful actions appear
  only as `POST` sub-resource verbs served by invokable controllers: GUARDED, because plurality is
  a heuristic;
- the Pest `laravel` preset limits controller public methods to the resourceful set plus
  `__invoke`, so a transition method on a resource controller fails
  ([0036](0036-pest-replaces-phpunit-runner.md)).

On the clients, a lint rule flags version-segment literals in request paths outside the
configured base URL: GUARDED, because a path assembled at runtime evades it.

## Pros and Cons of the Options

### URI versioning under `/api/v1`, resourceful kebab-case plural URIs, controller-only routes

- Good, because the version is visible in logs, caches and documentation.
- Good, because the framework's `apiPrefix` option expresses it in one line.
- Bad, because URIs change when the version does, which clients must follow through their base URL.

### Header or media-type versioning

- Good, because URIs stay stable across versions.
- Bad, because the version is invisible in logs and links, harder to test by hand, and needs custom
  routing middleware in Laravel.

### No versioning until a breaking change is needed

- Good, because nothing is added up front.
- Bad, because the first breaking change must then be introduced under a live contract, which is
  exactly when it is most expensive.

### Free-form routes, closures allowed

- Good, because small endpoints are quick to write.
- Bad, because closures escape every controller-level gate and URI style drifts per author.

## More Information

- Laravel API routes and the `apiPrefix` option: <https://laravel.com/docs/13.x/routing#api-routes>.
- Resource and single-action controllers:
  <https://laravel.com/docs/13.x/controllers#api-resource-routes>,
  <https://laravel.com/docs/13.x/controllers#single-action-controllers>.
- `install:api` behaviour on Laravel 13.33.0 is recorded in
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0041](0041-action-pattern.md), [0043](0043-single-authorization-site.md),
  [0049](0049-server-driven-collections.md), [0051](0051-health-endpoints.md).
- Governs: the Laravel routing rules (version prefix, URI shape, safe GET and HEAD routes,
  controller-only routes) and the client rule on the API base URL.
