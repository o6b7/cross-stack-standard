---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Dead code and duplication gates: knip and jscpd with shrink-only baselines

## Context and Problem Statement

Two kinds of decay pass review easily. Dead code (files nothing imports, exports nothing uses,
dependencies nothing requires) keeps costing: dependencies to patch, misleading search results,
and patterns an agent may copy. Copy-paste duplication lets a rule drift between copies, which the
DRY policy forbids but cannot see on its own ([0013](0013-dry-policy.md)). Compiler and lint checks
for unused variables work inside one file; they do not notice an unused export, file or package.

A common defect is a duplication gate configured as a percentage. jscpd's `--threshold` is one
duplicated-lines percentage across every scanned file, so a single new clone in a large codebase
stays under a 3 % threshold, and without `--threshold` or `--exit-code` jscpd exits 0 even when it
finds clones. Both gates also meet existing findings on the first day of adoption.

Which tools gate dead code and duplication, and how do they handle existing findings?

## Decision Drivers

- A new unused export or a new clone fails, whatever the size of the codebase.
- Existing findings do not block adoption, are visible, and are only paid down
  ([0005](0005-explicit-exceptions.md)).
- One duplication tool for TypeScript and PHP.
- Permissively licensed, pinned tools ([0006](0006-stack-first.md) pre-exempts both).

## Considered Options

- knip, plus jscpd with a committed baseline and `--fail-on-new-clones`
- jscpd with a global `--threshold` percentage
- Compiler and lint unused-variable checks only
- Review only

## Decision Outcome

Chosen option: "knip, plus jscpd with a committed baseline and `--fail-on-new-clones`", because
both fail on the new finding itself rather than on an average, and both can adopt existing code.

- **knip (web and mobile).** knip 6.38.0, gated as plain `knip`: the default mode covers
  dependencies and devDependencies, test and configuration files. `knip --production` may run as a
  second step; it does not replace the default run. Framework plugins enable themselves from
  `package.json` (Next.js, Vitest and Expo among them). The configuration is `knip.json` with a
  `$schema` pointing at the knip 6 schema. knip exits 1 on findings and 2 on a configuration or
  internal failure, and both fail the gate. It parses without TypeScript, so the TypeScript pin
  does not affect it ([0059](0059-javascript-toolchain-pins.md)).
- **knip baseline.** knip has no baseline option. `adopt` records each existing finding as a
  dated allowlist entry; the kit's knip gate runs knip with the JSON reporter and fails on any
  finding without a matching entry. Adoption entries are only removed; a later exception is an
  ordinary dated entry with its own reason ([0005](0005-explicit-exceptions.md)).
- **jscpd (every track).** jscpd 5.3.2 with `.jscpd.json` (`minLines`, `minTokens`, formats
  `typescript`, `tsx` and `php`, and `ignore` for `node_modules`, `vendor` and generated code),
  run as `jscpd --baseline .jscpd-baseline.json --fail-on-new-clones --no-tips`. It exits 1 only
  on clones missing from the committed baseline. A `threshold` may remain in the config as a
  ceiling; it is never the gate. Laravel-only repositories run it through their minimal
  `package.json` ([0094](0094-developer-workflow-templates.md)).
- **jscpd engine.** Version 5 is a native engine shipped as per-platform optional npm
  dependencies, so an install with `--omit=optional` or on an unsupported platform has no binary.
  jscpd 4 (the Node engine, 4.3.0) is the fallback there, but it has no baseline flags: on the
  fallback the gate can run only with a percentage threshold, and `doctor` reports the downgrade.
  The CI job runs on a platform with a v5 binary, so the ratchet always holds in CI.
- **Shrink-only and protected.** The baseline check fails when the jscpd baseline grows, and the
  sanctioned `baseline:update` script fails on growth. Both configurations, the baseline and the
  allowlist are protected files ([0021](0021-gate-file-protection.md)).
- **DRY policy.** This moves the copy-paste half of [0013](0013-dry-policy.md) from REVIEW to
  GUARDED. Extract-at-two and the one-caller rule stay REVIEW.
- **Laravel dead code.** No gate in 1.0: routes, container bindings, event discovery and policies
  reach PHP classes by name, which makes an unused-class check unreliable. It stays REVIEW.

### Consequences

- Good, because unused exports, files and dependencies fail on the pull request that creates
  them, and knip also reports dependencies used but not declared.
- Good, because one new clone fails even in a codebase with many old ones.
- Bad, because modules reached only by framework conventions or computed imports can be reported
  falsely, and need a knip entry or an allowlist entry.
- Bad, because jscpd sees textual clones only; a rule re-implemented in different words passes.
- Bad, because the jscpd ratchet depends on a native binary; the Node fallback is weaker.

### Confirmation

Both gates are GUARDED, each with a clean fixture and a violation fixture (a new unused export; a
new clone absent from the baseline) ([0004](0004-fail-then-pass.md)); the baseline growth check
runs in CI against the base branch. Registry evasions for knip: an export tagged `@public`, which
knip does not report, and unused exports of entry files, which knip reports only with
`--include-entry-exports`. For jscpd: clones below `minLines` or `minTokens`, copies reworded or
reordered until the tokens differ, and duplication across repositories. Rules enter the registry
as REVIEW and take this label when their gates pass both fixtures.

## Pros and Cons of the Options

### knip, plus jscpd with a committed baseline and `--fail-on-new-clones`

- Good, because each new finding fails on its own.
- Bad, because it adds two tools, a baseline and allowlist entries to maintain.

### jscpd with a global `--threshold` percentage

- Good, because it needs no baseline file.
- Bad, because a growing codebase absorbs new clones under the average.

### Compiler and lint unused-variable checks only

- Good, because TypeScript and ESLint already provide them.
- Bad, because they cannot see unused exports, files or dependencies.

### Review only

- Good, because it costs nothing to set up.
- Bad, because reviewers do not reliably notice either problem.

## More Information

- knip: <https://knip.dev/>; CLI and exit codes: <https://knip.dev/reference/cli>; production
  mode: <https://knip.dev/features/production-mode>; JSDoc tags:
  <https://knip.dev/reference/jsdoc-tsdoc-tags>; plugins: <https://knip.dev/reference/plugins/next>,
  <https://knip.dev/reference/plugins/expo>.
- jscpd: <https://github.com/kucherenko/jscpd>; the 4.x line:
  <https://www.npmjs.com/package/jscpd/v/4.3.0>.
- Versions, flags and observed exit codes: [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0005](0005-explicit-exceptions.md), [0013](0013-dry-policy.md),
  [0061](0061-own-eslint-plugin-no-commented-code.md) (the other GUARDED code-hygiene gate).
- Governs: the dead-code rules on the web and mobile tracks, the duplication rules on every track,
  and their baselines.
