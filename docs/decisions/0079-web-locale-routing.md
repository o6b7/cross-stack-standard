---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Web locale routing: always-prefixed URLs, no auto-detection, one navigation mechanism

## Context and Problem Statement

A multilingual Next.js app has to decide where the locale of a request comes from: the URL, a
cookie, the `Accept-Language` header, or a mix. When several sources can win, the same URL renders
in different languages for different visitors, shared links open in the wrong language, and caches
and crawlers see inconsistent pages. next-intl supports all of these sources through its routing
configuration.

Navigation is the second half. Common defects: links built by hand as `` `/${locale}/orders` ``,
plain `next/link` and `next/navigation` imports that drop or duplicate the prefix, and all of these
mixed in one codebase, so each new screen copies whichever pattern it saw first. A login path
hard-coded with one locale prefix in several layers is the same defect.

How are locales routed and linked on the web?

## Decision Drivers

- One source of truth for the locale of a page.
- A URL means the same content for every visitor.
- One navigation mechanism, checkable by lint.
- The installed library's idiomatic configuration comes first ([0006](0006-stack-first.md)).

## Considered Options

- Always-prefixed URLs, no detection, locale-aware navigation wrappers only
- Prefix only for non-default locales, with detection from headers and cookie
- No prefix; locale from cookie or header only

## Decision Outcome

Chosen option: "Always-prefixed URLs, no detection, locale-aware navigation wrappers only",
because the URL alone then determines the locale, and one set of wrappers keeps every link correct.

- **Routing (next-intl).** `localePrefix: "always"` (the library's default, set explicitly);
  `localeDetection: false`, so only the prefix determines the locale and neither
  `Accept-Language` nor the cookie redirects; `localeCookie` with a project-specific name instead
  of the shared default `NEXT_LOCALE`; a pinned business `timeZone` in the request configuration,
  so server and client format dates the same way. `defaultLocale` is a per-project product
  decision.
- **Navigation.** Locale-prefixed navigation uses only the wrappers from next-intl's
  `createNavigation(routing)`: `Link`, `redirect`, `useRouter`, `usePathname` and `getPathname`.
  Hand-built `` `/${locale}/…` `` hrefs, and imports of the APIs these wrappers replace from
  `next/link` and `next/navigation`, are banned.
- **Scope.** This applies when next-intl is the installed library. Another installed i18n routing
  library gets the equivalent configuration: locale in the URL, no detection, one navigation
  mechanism. The i18n module's locale list feeds `locales`
  ([0077](0077-i18n-module.md)).

### Consequences

- Good, because a shared link always opens in the language it was shared in.
- Good, because caches and crawlers see one language per URL.
- Bad, because a first-time visitor lands on `defaultLocale` rather than their browser language
  until they switch.
- Bad, because every URL carries a prefix, including the default locale's.

### Confirmation

- A cheap lint rule bans the replaced imports from `next/link` and `next/navigation` and template
  literals that start with a locale segment. GUARDED, because string concatenation or a re-export
  evades it.
- The web architecture test imports the routing configuration and asserts `localePrefix`,
  `localeDetection` and a custom cookie name. GUARDED, because it checks the shipped routing module
  only.
- The pinned time zone and `defaultLocale` choice: Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Always-prefixed URLs, no detection, locale-aware navigation wrappers only

- Good, because locale resolution is deterministic and visible.
- Bad, because there is no automatic first-visit language choice.

### Prefix only for non-default locales, with detection from headers and cookie

- Good, because default-locale URLs are shorter and first visits follow the browser.
- Bad, because the same URL can redirect differently per visitor.

### No prefix; locale from cookie or header only

- Good, because URLs are locale-free.
- Bad, because a URL no longer identifies the page's language, which breaks sharing and caching.

## More Information

- next-intl routing configuration (`localePrefix`, `localeDetection`, `localeCookie`):
  <https://next-intl.dev/docs/routing/configuration>; setup: <https://next-intl.dev/docs/routing/setup>;
  navigation APIs: <https://next-intl.dev/docs/routing/navigation>.
- Related: [0006](0006-stack-first.md), [0077](0077-i18n-module.md),
  [0082](0082-mobile-rtl-contract.md).
- Governs: the i18n module's web routing rules and the web navigation rule.
