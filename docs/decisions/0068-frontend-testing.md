---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Frontend testing: targeted logic tests, colocated, one E2E journey with accessibility checks

## Context and Problem Statement

Frontend test suites tend to fail in one of two directions. Broad component and snapshot suites
break on every markup change while testing little the server does not already decide. No suite at
all leaves untested the few places where the client really does carry a rule: redirect resolution
after sign-in, permission guards that hide actions, session handling, and the BFF's upstream URL
builder, which is a path-traversal target.

Some behaviour exists only when the browser, the proxy, Route Handlers, cookies and the API run
together, and unit tests cannot see it. Next.js documents that Vitest does not support async
Server Components and recommends end-to-end tests for them. A common defect is leaving the
end-to-end journey's placement as an implementation choice, after which it never ships. Tests
kept in aggregate folders drift away from the code they test and outlive it.

What do frontend unit tests cover, where do they live, and which end-to-end test runs in CI?

## Decision Drivers

- Tests go where the client encodes a rule or a security contract.
- Tests move and disappear together with their code.
- One end-to-end run proves the whole chain, accessibility included.
- The installed test runner is used ([0006](0006-stack-first.md)).

## Considered Options

- Targeted logic tests, colocated, and one end-to-end journey with accessibility checks
- Broad component and snapshot coverage
- Backend tests only
- An end-to-end-heavy suite

## Decision Outcome

Chosen option: "Targeted logic tests, colocated, and one end-to-end journey with accessibility
checks", because it spends test effort where the client carries risk and still exercises the
integration nothing else covers.

- **Targets.** Unit tests cover code that mirrors a backend rule ([0012](0012-backend-authority.md))
  or encodes a security contract: redirect resolution, permission guards, session handling, error
  normalisation and, with the bff-auth module, the upstream URL builder
  ([0073](0073-bff-auth-module.md)). Guards are written as pure functions so they can be tested.
  Presentational components are not unit-tested by default.
- **Runners.** The installed runner; the templates use Vitest on the web and jest-expo on mobile.
- **Colocation.** A test sits beside the file it tests, with the same stem
  (`resolve-redirect.test.ts` next to `resolve-redirect.ts`). There are no `__tests__` or other
  aggregate test folders.
- **One journey in CI.** The reusable web workflow ([0090](0090-ci-contract.md)) runs one
  Playwright journey against a seeded backend: sign in, create, read, update and delete one
  resource, sign out. On every journey page, `@axe-core/playwright` scans with the WCAG A and AA
  tags and must report no violations. With the i18n module on, the journey also asserts the
  document's `lang` and `dir` for each configured locale ([0077](0077-i18n-module.md)).
- **Placement is decided.** The journey is part of the CI template, not an adopter's
  implementation choice.
- **Coverage.** Floors follow [0091](0091-coverage-floors.md); security-contract paths can carry a
  higher per-path floor.

### Consequences

- Good, because test effort follows risk instead of markup.
- Good, because the journey catches failures between cookies, proxy, handlers and the API.
- Good, because accessibility regressions on real pages fail CI.
- Bad, because the journey needs a seeded backend in CI and is the slowest job.
- Bad, because one journey covers one path; other flows rely on unit tests and review.
- Bad, because deciding what "encodes a rule" is a judgement.

### Confirmation

- A web architecture test asserts that every test file has a same-stem source file in the same
  directory, which also rejects aggregate folders: FORCED target.
- A CI parity check asserts that the web workflow contains the journey job: GUARDED target
  (evasion: a journey that exists but asserts little).
- The journey's accessibility scan fails on any violation: GUARDED target (automated scans find a
  subset of accessibility defects).
- A per-path Vitest coverage threshold on the configured security-contract paths, off by
  default: GUARDED target.
- Which code deserves a unit test is checked in review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Targeted logic tests, colocated, and one end-to-end journey with accessibility checks

- Good, because it is cheap to keep green and covers the real risks.
- Bad, because UI regressions outside the journey are caught only by review.

### Broad component and snapshot coverage

- Good, because coverage numbers rise quickly.
- Bad, because snapshots break on harmless changes and get updated without being read.

### Backend tests only

- Good, because the server is authoritative and already tested.
- Bad, because client guards, redirects and the BFF chain go untested.

### An end-to-end-heavy suite

- Good, because it tests what users do.
- Bad, because it is slow and flaky at scale, and needs a full stack for every run.

## More Information

- Next.js with Vitest: <https://nextjs.org/docs/app/guides/testing/vitest>.
- Playwright: <https://playwright.dev/docs/intro>; accessibility testing with
  `@axe-core/playwright`: <https://playwright.dev/docs/accessibility-testing>.
- Expo unit testing: <https://docs.expo.dev/develop/unit-testing/>.
- Versions: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0073](0073-bff-auth-module.md), [0091](0091-coverage-floors.md),
  [0102](0102-web-performance-budgets.md).
- Governs: the web and mobile frontend testing rules (test targets, colocation, the end-to-end
  journey and its accessibility scan).
