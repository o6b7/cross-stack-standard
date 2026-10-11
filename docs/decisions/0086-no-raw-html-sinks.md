---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# No raw HTML sinks; a sanitizer path only by ADR

## Context and Problem Statement

React escapes text by default, so most cross-site scripting in a React app enters through a sink
that parses a string as HTML: `dangerouslySetInnerHTML`, `innerHTML` and `outerHTML` writes,
`insertAdjacentHTML` and `document.write`. React's documentation names the first one dangerous for
exactly this reason, and OWASP's prevention guidance treats all of them as unsafe sinks for
untrusted data.

httpOnly cookies ([0083](0083-credential-and-client-storage.md)) keep an injected script from
reading the session, but not from using it: the script runs in the page's origin, so its requests
carry the cookies and pass same-origin checks ([0074](0074-bff-csrf-defense.md)). Script injection
is therefore still account takeover in effect. The usual reason a team reaches for a sink is
user-provided rich text, and each call site then carries its own, often missing, sanitization.

Which HTML sinks may web code use, and how is rich text rendered safely?

## Decision Drivers

- Untrusted input is hardened at the boundary (a Tier-1 invariant,
  [0008](0008-tiers-and-invariants.md)).
- Legitimate rich text must have one safe path, not a ban with no alternative.
- Sanitization must be decided once, not per call site.

## Considered Options

- Ban every raw sink; one sanitizing wrapper component, only by project ADR
- Allow sinks where a sanitizer call is present at the call site
- Ban every raw sink with no sanitizer path
- Rely on eslint-plugin-react's `no-danger` rule alone

## Decision Outcome

Chosen option: "Ban every raw sink; one sanitizing wrapper component, only by project ADR", because
it removes the sinks from everyday code and still gives rich text a single, reviewed route.

- **Banned** in web code: `dangerouslySetInnerHTML` (as a JSX attribute, in spread props and in
  `createElement` props), assignments to `innerHTML` and `outerHTML`, `insertAdjacentHTML`, and
  `document.write`.
- **Rich text** from users needs a project ADR ([0001](0001-record-architecture-decisions.md)) that
  names the sanitizer (an installed one first, [0006](0006-stack-first.md); DOMPurify is a common
  choice) and one wrapper component that sanitizes and renders. The wrapper is the only site where
  the ban is lifted, by a described disable comment that cites the project ADR
  ([0005](0005-explicit-exceptions.md)). Where possible, content is stored and rendered as text or
  structured data rather than HTML.
- **Indirect sinks** go through the same ADR: third-party components that render HTML strings (rich
  text viewers, Markdown renderers with raw HTML enabled) and other HTML-parsing APIs such as
  `Range.createContextualFragment()` or an iframe's `srcdoc`.
- **Mobile.** React Native has no HTML DOM; a WebView given an HTML string is the equivalent sink
  and follows the same ADR requirement in review.
- **Later hardening.** A Trusted Types policy (`require-trusted-types-for 'script'`), which OWASP
  describes for Chromium-based browsers, would make the browser reject plain strings at these sinks;
  it is recorded as a possible addition, not a 1.0 requirement.

### Consequences

- Good, because everyday code has no HTML sinks, and a reviewer knows the one place to look.
- Good, because the sanitizer's configuration is decided and reviewed once.
- Bad, because rich text costs a project ADR and a wrapper before the first use.
- Bad, because indirect sinks inside third-party components are outside the lint rule's reach.

### Confirmation

- `cross-stack/no-raw-html`, a superset of eslint-plugin-react's `no-danger`, flags the
  `dangerouslySetInnerHTML` key in JSX attributes, spread objects and `createElement` props,
  assignments to `innerHTML` and `outerHTML`, and calls to `insertAdjacentHTML` and
  `document.write`. GUARDED, with these evasions listed: third-party components that render HTML,
  other HTML-parsing APIs, and property names computed at runtime.
- The wrapper's sanitizer configuration, the project ADR and WebView HTML on mobile are Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Ban every raw sink; one sanitizing wrapper component, only by project ADR

- Good, because sanitization happens in one reviewed place.
- Bad, because a project with rich text does upfront work.

### Allow sinks where a sanitizer call is present at the call site

- Good, because it is flexible.
- Bad, because a lint rule cannot tell whether the sanitized value is the one rendered, and each
  site may configure the sanitizer differently.

### Ban every raw sink with no sanitizer path

- Good, because it is the simplest rule.
- Bad, because teams that need rich text will find a workaround, usually an indirect sink.

### Rely on eslint-plugin-react's `no-danger` rule alone

- Good, because it is an existing rule.
- Bad, because it covers only the JSX attribute, not DOM writes or `document.write`.

## More Information

- React on `dangerouslySetInnerHTML`:
  <https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html>;
  `no-danger`:
  <https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-danger.md>.
- OWASP Cross Site Scripting Prevention Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>.
- `innerHTML` security considerations:
  <https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML>;
  `createContextualFragment()`:
  <https://developer.mozilla.org/en-US/docs/Web/API/Range/createContextualFragment>; Trusted Types:
  <https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API>.
- DOMPurify: <https://github.com/cure53/DOMPurify>.
- Related: [0005](0005-explicit-exceptions.md), [0087](0087-file-uploads.md).
- Governs: the web raw-HTML sink rule and the review rule for sanitized rich text.
