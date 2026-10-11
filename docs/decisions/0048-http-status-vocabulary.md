---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# HTTP status vocabulary

## Context and Problem Statement

A client decides what to do next from the status code: fix the form, refresh and try again, wait,
sign in, or give up. That only works if the server uses each status for one meaning and every
client handles every status the server sends.

Two problems are common. Servers use 422 for everything that "cannot be processed", including a
state transition that is not allowed right now; the client then shows field errors for a request
whose fields were fine. And clients map only the statuses their authors remembered. A common defect
is a client error map that omits 409 and 429, so conflicts and throttling surface as a generic
"something went wrong" and are retried blindly.

Which statuses does the API use for which conditions, and how do clients consume them?

## Decision Drivers

- Each status must imply one client action.
- The vocabulary must match the HTTP semantics clients and intermediaries already assume.
- Clients must be unable to leave a status unhandled without a test failing.

## Considered Options

- A fixed vocabulary with one meaning per status, mapped to problem types and to typed client error
  kinds
- 422 for every unprocessable request, with a code in the body
- 400 for every client error, with a code in the body

## Decision Outcome

Chosen option: "A fixed vocabulary with one meaning per status, mapped to problem types and to
typed client error kinds", because it follows RFC 9110 and lets clients act on the status alone.

| Status | Used for                                                                                           | Client action                 |
| ------ | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| 400    | Malformed query, such as an unknown filter or sort key ([0049](0049-server-driven-collections.md)) | Fix the request               |
| 401    | Not authenticated                                                                                  | End the session (see below)   |
| 403    | Authenticated but not allowed; with tenancy, a record inside the caller's tenant                   | Show a denial                 |
| 404    | Not found; with tenancy, a record in another tenant, whose existence is not disclosed              | Show not found                |
| 409    | Conflict with the current state: a refused state transition or a concurrent change                 | Refresh and retry             |
| 422    | Validation failure only, with field errors ([0053](0053-rfc-9457-problem-details.md))              | Fix the fields                |
| 429    | Rate limited ([0050](0050-rate-limiting.md))                                                       | Wait, honouring `Retry-After` |
| 5xx    | Server failure, with no internals in the body                                                      | Retry later                   |

- **Problem types.** Each status is rendered as an RFC 9457 problem with its own problem type
  ([0053](0053-rfc-9457-problem-details.md)), so clients can key localized copy by type.
- **One normalizer per client.** Web and mobile clients turn every failure (HTTP, network, timeout)
  into a typed error kind in one module; screens read kinds, never raw statuses or bodies. Every
  status in the vocabulary has its own kind, including `conflict` and `rateLimited`.
- **Retries follow kinds.** Automatic retries apply only to network, timeout and server kinds; a
  rate-limited retry waits for `Retry-After`. Conflicts and validation failures are never retried
  automatically.
- **401.** A 401 from any call except the login call clears the session (credentials and the
  server-state cache) and invokes the registered unauthorized handler, which returns the user to
  sign-in ([0083](0083-credential-and-client-storage.md)). A 401 from login is a credentials error
  shown on the form. The login call is matched exactly, never by substring.

### Consequences

- Good, because 409 and 422 lead to different, correct user experiences: refresh versus fix the
  fields.
- Good, because on mobile a status missing from the normalizer fails the table-driven contract
  test; on the web this is Review until its test ships.
- Good, because tenant boundaries do not leak existence through 403 versus 404.
- Bad, because server authors must choose between 409 and 422 deliberately; review catches the
  wrong choice, no tool can.
- Bad, because every client carries a message key per kind in every locale.

### Confirmation

- The status a server chooses for a condition is Review: a machine cannot tell a conflict from a
  validation failure.
- With the api-contract module, a renderer test raises each mapped exception through an API route
  and asserts the status and problem type ([0053](0053-rfc-9457-problem-details.md)): GUARDED.
- With the tenancy module, dataset-driven isolation tests assert 404 across the tenant boundary
  ([0057](0057-tenancy-module.md)): GUARDED.
- On mobile, a table-driven contract test shipped with the error normalizer maps each configured
  status to a distinct kind, and a lint rule confines reads of raw response status and data to the
  normalizer module: GUARDED.
- The 401 handling has contract tests on mobile and, with the bff-auth module, on the web
  ([0073](0073-bff-auth-module.md)): GUARDED. The web normalizer's status table is Review until its
  contract test ships.

## Pros and Cons of the Options

### A fixed vocabulary with one meaning per status, mapped to problem types and to typed client error kinds

- Good, because status alone drives the client's next step, and intermediaries see standard codes.
- Bad, because the vocabulary must be kept in step across the server renderer and every client.

### 422 for every unprocessable request, with a code in the body

- Good, because the server needs only one failure path.
- Bad, because clients must parse bodies to tell an invalid field from a refused transition.

### 400 for every client error, with a code in the body

- Good, because it is simple.
- Bad, because it discards the distinctions RFC 9110 defines and that clients need.

## More Information

- RFC 9110, client error status codes: <https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5>
  (400 in §15.5.1, 404 in §15.5.5, 409 in §15.5.10, 422 in §15.5.21).
- RFC 6585 §4, 429 Too Many Requests: <https://www.rfc-editor.org/rfc/rfc6585.html#section-4>.
- RFC 9457, problem details: <https://www.rfc-editor.org/rfc/rfc9457.html>.
- Related: [0049](0049-server-driven-collections.md), [0050](0050-rate-limiting.md),
  [0053](0053-rfc-9457-problem-details.md), [0083](0083-credential-and-client-storage.md).
- Governs: the API-contract status rules, the mobile error-normalizer rules and the client
  unauthorized-handling rules.
