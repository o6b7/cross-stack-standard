---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Forms: installed form library first, required client validation, server field errors mapped to fields

## Context and Problem Statement

Forms sit on the contract boundary, and their error handling follows the API's error format. A
common defect is a form layer designed around one flattened server message: the user reads a
single sentence and has to guess which field is wrong. With problem details and a
per-field `errors` member ([0053](0053-rfc-9457-problem-details.md)), forms can point at the field
instead.

Projects often already have a form library and a schema validator installed. A blanket "no form
library" rule contradicts stack-first; a mandated library contradicts it the other way. Long
forms without client validation make users round-trip to the server for each mistake, and
`any`-typed edit state lets malformed payloads through unnoticed.

How are forms built, validated and connected to server errors, on the web and on mobile?

## Decision Drivers

- The server decides validity; client validation is feedback ([0012](0012-backend-authority.md)).
- Errors appear at the field that caused them, and screen readers announce them.
- Installed libraries are used, and none is added without a decision
  ([0006](0006-stack-first.md)).
- Edit state is typed from the contract.

## Considered Options

- Installed form library first, client validation above a size threshold, server errors on fields
- Plain controlled state for every form, with a single server message
- One mandated form and schema library for every project

## Decision Outcome

Chosen option: "Installed form library first, client validation above a size threshold, server
errors on fields", because it reuses what each project has and puts every error where the user can
act on it.

- **Libraries.** Forms use the installed form and validation libraries. Plain controlled state is
  the baseline only when none is installed; adding one is a dependency decision with a record
  ([0006](0006-stack-first.md)).
- **Client validation.** Forms with more than about five fields (configurable) validate each field
  on the client. On the web an invalid field sets `aria-invalid` and points `aria-describedby` at
  its message; the mobile form primitives expose the same error to screen readers through the
  input's accessibility props. A client check that mirrors a server rule names its server source
  ([0012](0012-backend-authority.md)).
- **Server errors.** A 422 problem-details response carries `errors`, a map of dotted field paths
  to message arrays ([0053](0053-rfc-9457-problem-details.md)). The form maps each path onto its
  field, nested and array fields included. The summary message is shown only for errors that no
  field claims.
- **Typed edit state.** Edit state is typed from the generated contract
  ([0054](0054-generated-api-contract.md)); `any`-typed form state is banned
  ([0060](0060-javascript-lint-baseline.md)).
- **Unknown territory.** Multi-step forms, and forms with more than about fifteen fields, trigger
  the stop-and-ask procedure ([0014](0014-working-procedure.md)). A library added for them is
  recorded in a decision record.

### Consequences

- Good, because users see each error next to its field, and assistive technology announces it.
- Good, because projects keep the form library they already chose.
- Good, because a server rule change surfaces in the form without client changes.
- Bad, because mapping dotted paths onto fields is library-specific code that each project wires.
- Bad, because "about five" and "about fifteen" fields are thresholds applied with judgement.
- Bad, because validation exists on both sides, and only the server copy is authoritative.

### Confirmation

- `@typescript-eslint/no-explicit-any` fails `any`-typed edit state on both tracks: FORCED
  ([0060](0060-javascript-lint-baseline.md)).
- Mobile: the error normalizer's table-driven contract test asserts that a 422 `errors` member
  maps to field errors: GUARDED target.
- The size threshold, the accessibility wiring and the field mapping in each form are checked in
  review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Installed form library first, client validation above a size threshold, server errors on fields

- Good, because it fits every stack and every error the server can report.
- Bad, because each project writes the glue between its form library and the `errors` map.

### Plain controlled state for every form, with a single server message

- Good, because it needs no library and little code.
- Bad, because users cannot tell which field failed, and long forms become painful.

### One mandated form and schema library for every project

- Good, because every project would share the same mapping helper.
- Bad, because it forces a migration on projects that already chose another library.

## More Information

- RFC 9457: <https://www.rfc-editor.org/rfc/rfc9457>; Laravel validation errors:
  <https://laravel.com/docs/13.x/validation>.
- `aria-invalid`:
  <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-invalid>;
  `aria-describedby`:
  <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-describedby>.
- Related: [0006](0006-stack-first.md), [0012](0012-backend-authority.md),
  [0014](0014-working-procedure.md), [0053](0053-rfc-9457-problem-details.md).
- Governs: the web and mobile form rules (library choice, client validation, server field-error
  mapping, typed edit state).
