---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# i18n module: configurable locales, server-localized messages, no half-state

## Context and Problem Statement

A public standard cannot assume a fixed pair of languages, yet multilingual and right-to-left
support is where projects fail quietly. Users read two kinds of text: client copy, and messages
the API produces, most visibly validation errors, whose per-field messages depend on the rule, the
field and its parameters. Those messages are only right if the API knows the reader's locale.

The worst state is a partial one. A common defect is aspiration without plumbing: a `locale`
column that nothing reads, an `Accept-Language` header the client sends and the API ignores,
translation branches that are never reached. Everything looks multilingual in review, and users of
a localized screen get errors in the wrong language. Another is an English-first shortcut that is
only safe because of an unwritten product choice, such as an authenticated area that exists in
English only.

Direction is a separate trap: the standard `Intl.Locale.prototype.getTextInfo()` is missing on
Node.js 22 (only a legacy `textInfo` accessor exists) and in browsers that Next.js 16 still
supports, so direction cannot be derived from the runtime consistently.

How does the Standard support several locales, including right-to-left ones?

## Decision Drivers

- Locales are configuration, not an assumed pair.
- Right-to-left support is tested, not assumed.
- Server-produced messages reach users in their language.
- Partial wiring is treated as a defect.

## Considered Options

- An opt-in i18n module with configured locales and server-localized messages
- A locale-blind API: server messages are diagnostics and clients author all copy
- A fixed pair of locales built into every rule

## Decision Outcome

Chosen option: "An opt-in i18n module with configured locales and server-localized messages",
because clients can own copy for known failure causes, but only the server can phrase field-level
validation messages correctly in the reader's language.

- **Locales.** The manifest's `locales` list is the source (the example uses `["en","ar"]`). Text
  direction is derived per locale from a hard-coded list of right-to-left locales. Right-to-left
  support is covered by gates: logical-direction styling ([0081](0081-logical-direction-styling.md)),
  the mobile direction contract ([0082](0082-mobile-rtl-contract.md)) and locale parity
  ([0080](0080-locale-parity.md)).
- **API messages.** A middleware sets the request locale from `Accept-Language`, validated against
  the configured locales, falling back to the default. New projects ship translated validation and
  auth strings and attribute names for every configured locale. Mail, notifications and background
  output use the recipient's stored locale preference, not the request's.
- **No half-state.** A project either wires the server-side locale plumbing or carries zero
  multilingual fragments on the server.
- **Precedence on screens.** Screens prefer their own translated copy, keyed by the problem `type`,
  and fall back to the server's `detail` ([0053](0053-rfc-9457-problem-details.md)).
- **Hidden dependencies.** Where an English-first shortcut depends on a product choice, the
  dependency is named where the shortcut lives.
- **Module.** On by default when more than one locale is configured, under the proposed default
  set ([0011](0011-default-module-set.md)); installed as a whole unit ([0010](0010-opt-in-modules.md)).

### Consequences

- Good, because validation errors arrive in the reader's language on every client.
- Good, because a single-locale project carries no i18n rules or plumbing.
- Bad, because every configured locale needs complete framework translations before release.
- Bad, because the right-to-left locale list is maintained by hand until runtimes expose direction
  everywhere.

### Confirmation

- A Pest test over the resolved middleware stack of every API route requires the locale middleware
  when two or more locales are configured. FORCED, through framework reflection
  ([0037](0037-phpstan-rules-and-reflection-tests.md)).
- Feature tests send an unlisted `Accept-Language` and each configured one, and assert the
  response language and the fallback. GUARDED.
- A unit test derives direction for every configured locale from the list. GUARDED.
- The no-half-state rule, the precedence rule and named dependencies: Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### An opt-in i18n module with configured locales and server-localized messages

- Good, because both client copy and server messages are localized, each where it is best made.
- Bad, because the API and each client carry locale plumbing.

### A locale-blind API: server messages are diagnostics and clients author all copy

- Good, because the API has no translation files.
- Bad, because clients cannot author a message for every validation rule, field and parameter, so
  field errors stay in one language.

### A fixed pair of locales built into every rule

- Good, because the rules are simpler.
- Bad, because every adopter would inherit two languages chosen for someone else's market.

## More Information

- Laravel localization: <https://laravel.com/docs/13.x/localization>; user preferred locales for
  notifications: <https://laravel.com/docs/13.x/notifications#user-preferred-locales>.
- `Intl.Locale.prototype.getTextInfo()`:
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo>.
- Related: [0010](0010-opt-in-modules.md), [0053](0053-rfc-9457-problem-details.md),
  [0078](0078-labels-and-multilingual-content.md), [0080](0080-locale-parity.md).
- Governs: the i18n module's Laravel and i18n rules (locale configuration, direction derivation,
  request and recipient locale, and the no-half-state rule).
