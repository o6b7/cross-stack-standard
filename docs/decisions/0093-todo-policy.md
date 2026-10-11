---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# TODO policy: only ticket-referenced markers

## Context and Problem Statement

Marker comments (`TODO`, `FIXME`, `HACK`, `XXX`) record known debt next to the code it concerns.
Left alone they accumulate until nobody knows which still apply, who owns them or whether the
work was done elsewhere. Code assistants add them freely when they stop short of a complete fix.

A common defect is the opposite reaction: a blanket ban on markers. The ban is satisfied by
rewording the note ("later: handle the empty case") or deleting it, so the debt stays and only its
record disappears. Another is treating a marker as permission to leave debug output in place.

Which marker comments may stay in code, and how is that checked on every track?

## Decision Drivers

- Known debt stays visible in the code and in the team's tracker.
- The rule is checkable by a gate on every track, offline.
- The reference format fits any tracker.
- Existing markers do not block adoption and are paid down over time
  ([0005](0005-explicit-exceptions.md)).

## Considered Options

- Ticket-referenced markers only, with a configurable reference pattern
- Ban every marker
- Allow any marker

## Decision Outcome

Chosen option: "Ticket-referenced markers only, with a configurable reference pattern", because it
keeps debt visible and owned without rewarding the author who hides it.

- **The rule.** A comment that contains `TODO`, `FIXME`, `HACK` or `XXX` as a word
  (case-insensitive) must carry a ticket reference right after the marker, in the shape
  `TODO(ABC-123): what remains`. The reference pattern is configurable per project: a tracker key
  such as `ABC-123`, an issue number such as `#123`, or an issue URL.
- **PHP.** A custom PHPStan rule in the Laravel package
  ([0037](0037-phpstan-rules-and-reflection-tests.md)) inspects every comment. Existing untracked
  markers go into the PHPStan baseline, which only shrinks
  ([0038](0038-larastan-levels-shrink-only-baseline.md)).
- **JavaScript and TypeScript.** A rule in the Standard's own ESLint plugin
  ([0061](0061-own-eslint-plugin-no-commented-code.md)) reads every comment with the same pattern.
  Core `no-warning-comments` reports every comment containing a listed term and cannot admit a
  referenced marker. Existing untracked markers are recorded as ESLint bulk suppressions
  ([0005](0005-explicit-exceptions.md)).
- **Debug output stays banned regardless.** A marker never excuses it. On PHP, `dd`, `ddd`,
  `dump`, `ray`, `var_dump` and the other debug functions are banned through Pest's `php` and
  `laravel` architecture presets ([0036](0036-pest-replaces-phpunit-runner.md)). On web and mobile,
  `console` is allowed only inside the logger module ([0088](0088-structured-redacted-logging.md)).

### Consequences

- Good, because every remaining marker points to a ticket where it can be prioritised and closed.
- Good, because an agent that stops short must either name a ticket or finish the work.
- Good, because adoption does not require clearing old markers first.
- Bad, because the gate checks the shape of a reference, not whether the ticket exists or is still
  open; references go stale when tickets close.
- Bad, because a team without a tracker has to choose a reference scheme, such as issue numbers.

### Confirmation

GUARDED. The PHPStan rule and the ESLint rule each have a clean fixture (`TODO(ABC-123): …`) and a
violation fixture (`TODO: …`) that must fail with the rule ID ([0004](0004-fail-then-pass.md)).
Registry evasions: a well-formed reference to a ticket that does not exist or is closed (the gate
stays offline and checks the shape only), and notes written without a marker word or with a
misspelled one. Whether the referenced ticket is real and open is Review. Rules enter the registry
as REVIEW and take this label when their gates pass both fixtures.

## Pros and Cons of the Options

### Ticket-referenced markers only, with a configurable reference pattern

- Good, because debt is visible and has an owner in the tracker.
- Bad, because it needs a custom rule on each language and a pattern setting.

### Ban every marker

- Good, because it is a one-line rule.
- Bad, because it moves debt out of sight instead of removing it, and rewording defeats it.

### Allow any marker

- Good, because it costs nothing.
- Bad, because markers accumulate with no owner and no way to find which still matter.

## More Information

- ESLint `no-warning-comments`: <https://eslint.org/docs/latest/rules/no-warning-comments>;
  `no-console`: <https://eslint.org/docs/latest/rules/no-console>; custom rules:
  <https://eslint.org/docs/latest/extend/custom-rules>.
- PHPStan custom rules: <https://phpstan.org/developing-extensions/rules>; Pest architecture
  presets: <https://pestphp.com/docs/arch-testing> (preset contents are recorded in
  [verified-versions.md](../maintainers/verified-versions.md)).
- Related: [0005](0005-explicit-exceptions.md), [0036](0036-pest-replaces-phpunit-runner.md),
  [0061](0061-own-eslint-plugin-no-commented-code.md).
- Governs: the marker-comment rules on the laravel, web and mobile tracks; it restates, but does
  not own, the debug-output bans.
