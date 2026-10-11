---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Mobile on-device E2E flows with Maestro, including an RTL flow

## Context and Problem Statement

The mobile gates are static: lint, dependency rules, type checks and Jest tests. None of them
runs the app on a device. The mobile direction contract ([0082](0082-mobile-rtl-contract.md))
depends on behaviour that only a device shows: one `setAppLanguage()` persists the language,
changes the layout direction and reloads the app with `reloadAppAsync()` from `expo`. Whether the
direction survives that reload and a later cold start is platform- and SDK-dependent. In SDK 58,
expo-localization calls `allowRTL(supportsRTL)` and `forceRTL(forcesRTL)` on every app start, and
whether that reset also runs on a JavaScript reload is unverified. A common defect is an in-app
language switcher that works once in development and then reverts direction, or loops, after a
restart. For this reason 0082 keeps the direction-change mechanism GUARDED.

Maestro drives iOS and Android apps from YAML flows (`appId`, then a list of commands such as
`launchApp`, `tapOn` and `assertVisible`) and runs them with `maestro test`. Its docs state that a
locale cannot be set inside a flow or through `maestro test`; it is set when the device starts,
with `maestro start-device --device-locale ar_SA`.

How does the Standard prove the main mobile journey and the RTL contract on real devices, and
where do those runs belong in CI?

## Decision Drivers

- The direction contract is promoted only on on-device evidence, per supported SDK
  ([0002](0002-gates-over-guidelines.md)).
- Direction is asserted from screen positions, not from the app's own report of it.
- Emulators and simulators are slow and costly, and iOS simulators run only on macOS.
- Every tool is pinned and checksum-verified ([0032](0032-supply-chain-pinning.md)).
- Web keeps one E2E journey ([0068](0068-frontend-testing.md)); mobile should not need more.

## Considered Options

- Maestro flows in a scheduled or manual job, on both platforms and each supported SDK
- Maestro flows as a required pull-request check
- Detox
- No on-device tests; keep the contract GUARDED indefinitely

## Decision Outcome

Chosen option: "Maestro flows in a scheduled or manual job, on both platforms and each supported
SDK", because it produces the device evidence 0082 needs without putting emulator cost and flakiness
on every pull request, and needs no change to the app's test runner.

- **Main journey.** One flow per app covers the main journey (sign in, a list, a detail, one
  write) on Android and iOS. Flows live in `.maestro/` and use test IDs, which Maestro matches with
  `id:`, rather than visible text.
- **RTL flows.** (1) _OS locale:_ the device starts with `--device-locale ar_SA`; the flow launches
  the app and asserts Arabic text and right-to-left layout. (2) _In-app switcher:_ the app starts
  in a left-to-right locale; the flow taps the switcher, waits for the reload, asserts the new
  direction, relaunches with `launchApp` (which stops the app first by default) and asserts that
  the direction persisted and that the app settled on one screen without a reload loop; it then
  switches back. Direction is asserted with Maestro's `leftOf` and `rightOf` selectors on test IDs,
  for example that a header's leading control is right of the title.
- **Promotion condition.** Both RTL flows pass on Android and iOS on SDK 57 and SDK 58. Only then
  may 0082's direction-change rules move from GUARDED, in the pull request that records the runs.
  A later failure of the scheduled job opens an issue, and the label returns to GUARDED until the
  flows pass again.
- **Where it runs.** A template workflow on a schedule and on manual dispatch, not a required
  pull-request check. Android runs on an emulator; iOS needs a macOS runner. EAS Workflows' `maestro`
  job type is documented as an alternative for teams with an EAS account.
- **Pinning.** Maestro CLI 2.10.0 (Apache-2.0, needs Java 17 or later) is installed from its
  `cli-2.10.0` release archive, verified against a SHA-256 that is recorded in
  [verified-versions.md](../maintainers/verified-versions.md) before the template ships. The
  install script is not piped to a shell: it honours `MAESTRO_VERSION` but verifies no checksum.

### Consequences

- Good, because the RTL contract's label rests on device runs per SDK, not on documentation.
- Good, because pull requests stay fast; device cost is paid on a schedule.
- Good, because flows are plain YAML, readable by reviewers and agents, with no test runner added
  to the app.
- Bad, because a regression can merge and surface only in the next scheduled run.
- Bad, because the app needs stable test IDs on the controls the flows touch.
- Bad, because iOS runs need macOS runners or an EAS account, which cost more than Linux minutes.

### Confirmation

- The template workflow is checked by actionlint, and a repository test asserts the Maestro
  download URL and checksum match the pin.
- Fail-then-pass ([0004](0004-fail-then-pass.md)): the RTL flow must pass on a fixture app and
  fail on a variant of it whose `setAppLanguage()` skips the direction change.
- The promotion of 0082's rules is checked in review against the linked runs for both SDKs and
  both platforms.

## Pros and Cons of the Options

### Maestro flows in a scheduled or manual job, on both platforms and each supported SDK

- Good, because flows need no app-side test harness and can run against a release build.
- Bad, because feedback arrives after merge.

### Maestro flows as a required pull-request check

- Good, because a broken journey never merges.
- Bad, because every pull request waits for emulator boot and build, and device flakiness blocks
  unrelated changes.

### Detox

- Good, because tests are written in JavaScript next to the app.
- Bad, because it needs its own configuration and a dedicated test build per platform inside the
  app project, where Maestro drives the ordinary build from outside.

### No on-device tests; keep the contract GUARDED indefinitely

- Good, because it costs nothing.
- Bad, because the direction contract can never leave GUARDED on evidence.

## More Information

- Maestro: <https://maestro.dev/>; installation: <https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli>;
  locales: <https://docs.maestro.dev/maestro-flows/flow-control-and-logic/test-in-different-locales>;
  relational selectors: <https://docs.maestro.dev/reference/selectors/relational-selectors>;
  `launchApp`: <https://docs.maestro.dev/reference/commands-available/launchapp>.
- EAS Workflows E2E: <https://docs.expo.dev/eas/workflows/examples/e2e-tests/>; expo-localization
  RTL: <https://docs.expo.dev/guides/localization/#rtl-support>; `reloadAppAsync`:
  <https://docs.expo.dev/versions/latest/sdk/expo/#reloadappasyncreason>.
- Pins and the open reload question: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0068](0068-frontend-testing.md), [0082](0082-mobile-rtl-contract.md),
  [0059](0059-javascript-toolchain-pins.md), [0032](0032-supply-chain-pinning.md).
- Governs: the mobile E2E rules and the evidence for the mobile RTL direction rules.
- Becomes accepted when the template ships and its fixture passes; until then it is on the
  roadmap.
