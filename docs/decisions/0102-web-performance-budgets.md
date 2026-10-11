---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Web performance budgets: Lighthouse CI and size-limit

## Context and Problem Statement

Web performance erodes one dependency at a time. A date library, an icon set imported whole or a
client component that pulls a server-sized module each add a little JavaScript, and no single pull
request looks responsible. A common defect is a performance check that runs once at launch and is
never repeated, or a budget set so loose that it never fails.

Two tools cover the two halves. size-limit measures built files against a declared limit (Brotli
by default) and fails when one is exceeded; its `@size-limit/preset-app` also runs headless Chrome
to time script execution. Lighthouse CI runs Lighthouse against URLs several times
(`collect.numberOfRuns`, default 3), aggregates the runs and asserts scores and metrics
(`minScore`, `maxNumericValue`). Both tools have currency issues: `@lhci/cli` 0.15.1 was released
in June 2025 and bundles Lighthouse 12.6.1 while Lighthouse is at 13.5.0, and size-limit 14 needs
Node `^22.19.0 || ^24.5.0 || >=26`, above the Standard's 22.13 floor
([0059](0059-javascript-toolchain-pins.md)).

How does the Standard keep bundle size and page performance from regressing without flaky
pull-request checks?

## Decision Drivers

- Budgets come from the project's measured state, not from a universal number.
- Budgets only get stricter unless someone records why ([0005](0005-explicit-exceptions.md)).
- Pull-request checks must be deterministic; timing-based checks are noisy on shared runners.
- Reports must not leave the project's CI by default.
- Tool versions are checked before a template pins them.

## Considered Options

- size-limit on file size in the web check, Lighthouse CI in a separate non-blocking job
- Lighthouse CI only
- size-limit only
- No budgets; performance is a review item

## Decision Outcome

Chosen option: "size-limit on file size in the web check, Lighthouse CI in a separate non-blocking
job", because byte size is deterministic enough to block a merge, while lab metrics vary between
runs and are better tracked than gated per pull request.

- **Bundle budgets.** size-limit with the file plugin measures the built client chunks, one named
  budget per configured path group (shared chunks, and the chunks of each key route). It runs in
  the web track's `check` after the build. Time measurements (`preset-app`) are not used in the
  gate.
- **Page budgets.** Lighthouse CI asserts performance and accessibility scores and a few metrics on
  the key routes, aggregated over several runs. It runs on a schedule and on a pull-request label,
  as a non-required job ([0090](0090-ci-contract.md)). Uploads use the `filesystem` target; the
  `temporary-public-storage` target, which makes reports readable by anyone with the link, is
  never configured.
- **Measured and ratchet-only.** `adopt` builds the app, measures the current sizes and scores and
  writes them as the budgets, as coverage floors are set ([0091](0091-coverage-floors.md)).
  Lowering a budget is a normal change; raising one needs a dated, reasoned exception, and the
  budget file is a protected gate file ([0021](0021-gate-file-protection.md)).
- **Currency first.** Before the template pins versions, the maintainer re-checks whether a
  Lighthouse CI release bundles the current Lighthouse major, and chooses between raising the
  project's Node floor to 22.19 for size-limit 14 or pinning an earlier size-limit major. Both are
  recorded in the verified-versions table.

### Consequences

- Good, because a bundle regression fails the pull request that causes it, naming the budget.
- Good, because budgets start from the real state, so adoption is not blocked on day one.
- Good, because Lighthouse reports stay inside the project's CI artifacts.
- Bad, because page-level regressions surface only on the scheduled or labelled run.
- Bad, because Lighthouse CI lags Lighthouse; if it stays behind, the job reports on an older
  audit set.
- Bad, because size budgets need a production build in the check, which lengthens it.

### Confirmation

- The size gate: fail-then-pass fixtures ([0004](0004-fail-then-pass.md)), where a clean app passes
  and an app with an added large import fails with the budget's name. GUARDED, because code
  loaded outside the measured chunks escapes it.
- Ratchet-only budgets: the shrink-only check compares the budget file with the base branch.
- Lighthouse CI assertions are a non-required job; their use is a Review item, and the rule stays
  REVIEW.

## Pros and Cons of the Options

### size-limit on file size in the web check, Lighthouse CI in a separate non-blocking job

- Good, because each tool runs where its signal is reliable.
- Bad, because two configurations are maintained.

### Lighthouse CI only

- Good, because one tool covers user-facing metrics.
- Bad, because lab metrics vary between runs, and a blocking job would fail on noise.

### size-limit only

- Good, because it is fast and deterministic.
- Bad, because it misses render-blocking resources, layout shift and slow server responses.

### No budgets; performance is a review item

- Good, because it costs nothing.
- Bad, because gradual growth is invisible in any single diff.

## More Information

- Lighthouse CI: <https://github.com/GoogleChrome/lighthouse-ci>; configuration (upload targets,
  `numberOfRuns`, assertions):
  <https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md>.
- size-limit: <https://github.com/ai/size-limit>.
- Versions and engines: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0068](0068-frontend-testing.md), [0091](0091-coverage-floors.md),
  [0059](0059-javascript-toolchain-pins.md), [0106](0106-companion-plugins.md) (interactive
  Lighthouse audits by an agent, which do not replace a CI budget).
- Governs: the web performance budget rules.
- Becomes accepted when the template ships and its fixtures pass; until then it is on the roadmap.
