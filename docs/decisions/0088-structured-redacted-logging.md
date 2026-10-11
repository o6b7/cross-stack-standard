---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Structured and redacted logging

## Context and Problem Statement

Logs are read by machines that group and alert on them and by people during incidents, and they
are kept outside the database's access controls and retention rules. Three habits break them:

- **Interpolated messages.** `"Order $id failed for $email"` creates a new message for every value,
  so grouping and alerting stop working, and user-controlled text inside the message can forge
  entries (log injection; OWASP asks for carriage returns, line feeds and delimiters to be
  neutralised).
- **Dumped records.** Passing a model or `toArray()` writes whole rows, personal data, other
  tenants' data and every per-locale column into a store that was never meant to hold them.
- **Unredacted channels.** OWASP lists session identifiers, access tokens and passwords among the
  values that should not be recorded directly; one channel without redaction is enough to leak them.

PSR-3 and Laravel's own examples already show the better shape: a constant message with
placeholders, and variable data in the context array. On the JavaScript side, direct `console`
calls bypass whatever redaction the app has and scatter output across the codebase.

How do the tracks log so that logs stay searchable and leak nothing?

## Decision Drivers

- A message identifies an event; data about the event is structured context.
- Logs carry what an investigation needs to find the record, not the record.
- Redaction must hold on every channel, including ones added later.
- One logging path per app ([0007](0007-one-mechanism-per-concern.md)).

## Considered Options

- Constant messages, identifier-only context, redaction on every channel, one JavaScript logger
- Free-form interpolated messages
- Redaction at the log aggregator only

## Decision Outcome

Chosen option: "Constant messages, identifier-only context, redaction on every channel, one
JavaScript logger", because each part is checkable in code and together they keep logs both useful
and safe to keep.

- **Constant messages.** The message argument to `Log::*`, `logger()` and PSR-3 logger methods is a
  constant string. Placeholders such as `{id}` are allowed; variable data goes in the context array.
- **Identifiers, not records.** Context values are ids, enum values, problem types and other stable
  codes. Models, Eloquent collections, `toArray()` results, tenant rows and per-locale column dumps
  never go into a log.
- **Redaction everywhere.** A log processor, attached to every configured channel through the
  channel's `tap` option, redacts configured keys in the context and extra data: authorization,
  token, password and cookie keys, plus the project's list of personal-data keys.
- **Shared context.** Identifiers that belong to every entry of a request or job (user id, tenant
  id) are added once with `Log::withContext()` or `Log::shareContext()`, not repeated per call.
  Queued jobs follow the same rules ([0055](0055-background-jobs.md)).
- **One JavaScript logger.** Web and mobile code log only through the app's logger module, which
  applies the same redaction list; direct `console` calls are banned elsewhere.
- **Observability.** Error tracking and request-id generation and propagation belong to the
  observability module ([0099](0099-observability-module.md)), wired through the same logger.

### Consequences

- Good, because events group by message, and alerts can key on them.
- Good, because a log store holds identifiers that point to data, not copies of the data.
- Good, because a new channel inherits redaction as soon as the test notices it.
- Bad, because investigations take an extra lookup from id to record.
- Bad, because the personal-data key list is project-specific and must be maintained.

### Confirmation

- A type-aware PHPStan rule requires the message argument of `Log::*`, `logger()` and PSR-3 logger
  methods to have a constant string type (no interpolation, concatenation or `sprintf`). FORCED; a
  wrapper that takes a variable message fails inside the wrapper.
- A type-aware PHPStan rule fails context values that are models, Eloquent collections or
  `toArray()` results. GUARDED, because arrays built by hand from model attributes pass.
- A Pest test asserts that every configured channel carries the redaction processor. GUARDED,
  because personal data under a key missing from the list passes.
- ESLint's `no-console` plus `no-restricted-globals` on `console` (which also catches aliasing
  through a local binding), with the logger module exempt. GUARDED, because access through
  `globalThis` or `window` is not reported.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Constant messages, identifier-only context, redaction on every channel, one JavaScript logger

- Good, because every part has a gate and logs stay safe to retain.
- Bad, because writing a log line takes slightly more thought than an interpolated string.

### Free-form interpolated messages

- Good, because it is the quickest to write.
- Bad, because grouping breaks, injected text can forge entries and nothing controls what is
  written.

### Redaction at the log aggregator only

- Good, because it is configured once, centrally.
- Bad, because the data has already left the application, local files and other sinks keep the
  raw values, and switching aggregators loses the rules.

## More Information

- PSR-3, message placeholders and context: <https://www.php-fig.org/psr/psr-3/>.
- Laravel logging, contextual information and `tap`:
  <https://laravel.com/docs/13.x/logging#contextual-information>,
  <https://laravel.com/docs/13.x/logging#customizing-monolog-for-channels>.
- OWASP Logging Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>; CWE-117, improper
  output neutralization for logs: <https://cwe.mitre.org/data/definitions/117.html>.
- Related: [0007](0007-one-mechanism-per-concern.md), [0055](0055-background-jobs.md),
  [0099](0099-observability-module.md).
- Governs: the Laravel log-message, log-context and redaction rules, and the JavaScript
  logger-module rule.
