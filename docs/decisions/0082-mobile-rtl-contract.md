---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Mobile RTL contract: OS per-app language first, one setAppLanguage() fallback, direction changed only through it

## Context and Problem Statement

React Native fixes layout direction at app start. `I18nManager.allowRTL()` and `forceRTL()` take
effect on the next start and are persisted, and React Native documents `forceRTL()` as meant for
development and testing. Expo's localization config plugin also makes these calls when its native
module is created, and its behaviour depends on the SDK:

- On SDK 57, `supportsRTL: true` makes the iOS module call `forceRTL()` with the direction of the
  device language at every module creation, which overwrites a direction chosen inside the app.
- On SDK 58, `supportsRTL` defaults to `true` and `forcesRTL` to `false`, and module creation calls
  `allowRTL(supportsRTL)` and `forceRTL(forcesRTL)` on both platforms. On iOS the device language
  must also be listed in `supportedLocales` for RTL to apply.

Meanwhile, Android 13 and later and current iOS let users pick a language per app in system
settings, once the app declares its supported locales. A common approach sets `supportsRTL: true`
and calls `forceRTL()` wherever the language changes; a common defect that follows is direction
calls and reloads scattered across screens, so the direction after the next start depends on which
code ran last.

How does a mobile app switch language and direction reliably, across SDK upgrades?

## Decision Drivers

- The direction must be right from the first frame after a start.
- Platform features come before app code ([0006](0006-stack-first.md)).
- The contract must survive SDK upgrades that change the plugin's defaults.
- Every direction change goes through one reviewed code path.

## Considered Options

- The OS per-app language first, with one `setAppLanguage()` utility as the in-app fallback
- An in-app language switcher as the primary path
- The device language only, with no per-app choice
- `supportsRTL: true` in the app config, with `forceRTL()` called where the language changes

## Decision Outcome

Chosen option: "The OS per-app language first, with one `setAppLanguage()` utility as the in-app
fallback", because the operating system then owns the switch and the restart, and the one path the
app owns is small enough to prove on a device.

- **Config.** The `expo-localization` config plugin declares `supportedLocales` with every
  configured locale ([0077](0077-i18n-module.md)); this registers the app for the system language
  setting. The config sets neither `supportsRTL: true` nor `forcesRTL`: on SDK 57 the first
  overrides the in-app choice, and Expo's guide notes that the static options cannot be combined
  with a dynamic override.
- **Primary path.** The user picks the app's language in system settings. The app reads it with
  `getLocales()`, re-reading on Android when the app returns to the foreground, since the value can
  change while it runs. The root layout wraps the navigator in Expo Router's `LocaleProvider` with
  the active locale's direction, which updates headers, transitions and gestures; content layout
  direction follows `I18nManager`.
- **Fallback.** When the product needs an in-app picker, one `setAppLanguage(locale)` persists the
  choice through the storage module ([0083](0083-credential-and-client-storage.md)), applies the
  direction with `allowRTL()` and `forceRTL()` when it must change, and reloads with
  `reloadAppAsync()` from `expo`, which works in release and debug builds (`Updates.reloadAsync()`
  rejects in Expo Go, in development and without expo-updates). A guard records the attempt
  before reloading; if the direction still does not match after the reload, as in Expo Go, which
  resets RTL preferences, it does not reload again.
- **Nothing else switches.** No other code changes the language or direction automatically: no
  reload on a device-locale change and no direction calls in screens.
- **Versioned.** The contract is re-verified at every SDK upgrade, starting with the SDK 58
  decision ([0059](0059-javascript-toolchain-pins.md)).

### Consequences

- Good, because the primary path needs no switching code and no forced direction.
- Good, because every direction change lives in one file that reviewers and tests can find.
- Good, because an SDK change to the plugin's defaults touches one ADR and one utility.
- Bad, because an in-app switch restarts the JavaScript app, so in-memory state is lost.
- Bad, because the fallback uses `forceRTL()` in production against React Native's guidance; the
  guard, the confinement rule and the GUARDED label are the price of offering it.
- Bad, because it is not yet verified whether the plugin's creation-time calls run on every
  JavaScript reload or only on a cold start; on SDK 58 the answer decides whether the fallback
  holds.

### Confirmation

- A config check reads the resolved app config, with dynamic config files evaluated, and fails
  when `supportedLocales` misses a configured locale or `supportsRTL` is `true`. FORCED.
- `cross-stack/confine-api`, a scope-aware rule, confines `I18nManager.forceRTL`, `allowRTL` and
  `swapLeftAndRightInRTL` (member, destructured, namespace and `require` forms; an escaping
  `I18nManager` binding is reported) and reload calls to the configured utility. GUARDED, because
  computed access and wrappers in other modules can evade it.
- The reload mechanism stays GUARDED until an on-device Maestro flow switches language, reloads and
  asserts the direction on each supported SDK ([0101](0101-maestro-on-device-flows.md)).

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### The OS per-app language first, with one `setAppLanguage()` utility as the in-app fallback

- Good, because the platform handles the choice and the restart, and the app's own path is small.
- Bad, because apps that need an in-app picker still carry a forced-direction reload.

### An in-app language switcher as the primary path

- Good, because the picker looks the same on every OS version.
- Bad, because every language change forces a direction and a reload, the least verified mechanism.

### The device language only, with no per-app choice

- Good, because it needs no code.
- Bad, because users who run the device in one language cannot use the app in another.

### `supportsRTL: true` in the app config, with `forceRTL()` called where the language changes

- Good, because it follows older guidance literally.
- Bad, because on SDK 57 iOS the plugin re-derives the direction at every module creation, and
  scattered calls make the next start's direction depend on call order.

## More Information

- Expo localization guide (per-app language, RTL support, dynamic override, `LocaleProvider`):
  <https://docs.expo.dev/guides/localization/>; `getLocales()`:
  <https://docs.expo.dev/versions/latest/sdk/localization/>.
- `reloadAppAsync()`: <https://docs.expo.dev/versions/latest/sdk/expo/#reloadappasyncreason>;
  `Updates.reloadAsync()`: <https://docs.expo.dev/versions/latest/sdk/updates/>.
- React Native `I18nManager`: <https://reactnative.dev/docs/i18nmanager>.
- Android per-app language preferences:
  <https://developer.android.com/guide/topics/resources/app-languages>.
- SDK 58 RTL default change: <https://github.com/expo/expo/pull/48086> and
  <https://expo.dev/changelog/sdk-58-beta>; plugin behaviour per SDK:
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0077](0077-i18n-module.md), [0080](0080-locale-parity.md),
  [0081](0081-logical-direction-styling.md), [0101](0101-maestro-on-device-flows.md).
- Governs: the mobile RTL config rule and the rule confining direction and reload calls to the
  language utility.
