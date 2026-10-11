---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Health endpoints: a public liveness route, readiness behind operator authorization

## Context and Problem Statement

Load balancers, uptime monitors and orchestrators need a URL that answers "is this process up?".
Laravel ships one: `withRouting(health: '/up')` in `bootstrap/app.php` registers a `GET` route that
returns 200 when the application boots and dispatches the `DiagnosingHealth` event; a listener that
throws turns the answer into a 500. The framework registers it as a closure route outside the `api`
and `web` middleware groups, exempts it from maintenance mode, and answers `{"status":"up"}` to a
JSON request.

Two defects are common. The route grows dependency checks (database, cache, queue), so a slow
database makes an orchestrator restart processes that are healthy; Kubernetes, for example, kills
and restarts a container whose liveness probe fails, while a failing readiness probe only removes
it from traffic. Or the route grows diagnostic output (framework and PHP versions, driver names,
queue depth) that tells an anonymous caller what to attack. The Standard's own route rules would
also flag the framework's closure route, or try to resolve a tenant for it, if it were not
excluded.

What does the public health check expose, and where do dependency checks live?

## Decision Drivers

- A liveness failure must mean "restart me", never "a dependency is slow".
- No anonymous caller learns versions or infrastructure.
- The framework's route is used rather than a hand-written one ([0006](0006-stack-first.md)).
- A fresh install must pass the route gates without special-casing by path.

## Considered Options

- Bare public liveness route; readiness on a separate route behind operator authorization
- One public route that also checks dependencies through `DiagnosingHealth` listeners
- A detailed public status endpoint (versions, drivers, queue depth)
- Every health route behind authentication

## Decision Outcome

Chosen option: "Bare public liveness route; readiness on a separate route behind operator
authorization", because it is the only option that keeps the probe's meaning exact and reveals
nothing, while reusing the framework route.

- **Liveness.** The framework health route (default `/up`, configurable in `withRouting()`) stays
  unauthenticated and dependency-free: no `DiagnosingHealth` listener touches the database, cache,
  queue or an external service. Its body carries no version, host, driver or infrastructure detail.
- **Readiness.** Dependency checks and any diagnostic detail are served by a separate route behind
  operator authorization: an ability checked by middleware, which with the tenancy module is the
  platform-bypass predicate ([0057](0057-tenancy-module.md)). They never appear on the public route.
- **Exclusions.** The framework health route is excluded from the controller-only routing rule
  ([0042](0042-api-routing.md)) and from tenant resolution. The exclusion is by source (the
  framework registers the route), not by path, so a renamed route stays excluded.

### Consequences

- Good, because an orchestrator restarts a process only when the process itself is broken; a
  database incident takes instances out of traffic instead of restarting them in a loop.
- Good, because an anonymous caller learns only up or down.
- Good, because liveness needs no project code at all.
- Bad, because an orchestrator's readiness probe must present a credential or reach the route over
  an internal network, which is extra deployment wiring.
- Neutral, because the liveness route sits outside the `api` prefix, so the API rate-limiting rule
  ([0050](0050-rate-limiting.md)) does not cover it; throttling a probe would make a healthy
  instance look down, so abuse protection for it belongs at the edge.

### Confirmation

- A Pest feature test requests the configured health route without credentials and asserts a 200
  whose body contains none of the configured version and infrastructure patterns: GUARDED, because
  detail phrased in a way the patterns miss passes.
- The route-table tests identify the framework health route by source and skip it; a fixture with a
  renamed health route proves the exclusion.
- Readiness authorization: REVIEW. The reviewer checks that the readiness route carries the
  operator ability and that the liveness route has no dependency listeners.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Bare public liveness route; readiness on a separate route behind operator authorization

- Good, because liveness and readiness keep their distinct meanings.
- Bad, because there are two routes to document and deploy.

### One public route that also checks dependencies through `DiagnosingHealth` listeners

- Good, because one URL answers every question.
- Bad, because a dependency outage becomes a restart storm, and a failing check tells an anonymous
  caller which dependency is down.

### A detailed public status endpoint (versions, drivers, queue depth)

- Good, because operators can debug from a browser.
- Bad, because version and driver detail is reconnaissance for an attacker.

### Every health route behind authentication

- Good, because nothing is public.
- Bad, because load balancers and uptime monitors usually cannot authenticate, so teams bypass the
  rule with an ad-hoc public route.

## More Information

- Laravel health route: <https://laravel.com/docs/13.x/deployment#the-health-route>; registration
  in the framework source (v13.33.0):
  <https://github.com/laravel/framework/blob/v13.33.0/src/Illuminate/Foundation/Configuration/ApplicationBuilder.php>.
- Liveness and readiness probes:
  <https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/>.
- Related: [0042](0042-api-routing.md), [0050](0050-rate-limiting.md),
  [0057](0057-tenancy-module.md).
- Governs: the Laravel health-endpoint rules and the security rule that keeps readiness and
  infrastructure detail behind operator authorization.
