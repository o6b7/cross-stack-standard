# Working procedure

How to work under the Standard on every change: name the rule, stop and ask in unknown territory,
prove the result with real output, keep duplication honest and keep exceptions explicit
([ADR 0014][0014], [ADR 0013][0013], [ADR 0005][0005], [ADR 0004][0004]).

## Rules

### Naming, reporting and the feedback loop

- **PROC-020** Name in each pull request the rule IDs or ADRs its change follows _(off by default)_
- **PROC-021** Before claiming done, re-read the diff, run the checks and report their real output verbatim _(Tier 1)_
- **PROC-022** Pass the fast gate before an agent session ends _(Tier 1)_
- **PROC-028** Ask in the pull request template for the rule IDs a change follows and the real check output
- **PROC-030** Report lint errors in a file back to the agent right after it edits the file
- **PROC-019** Keep a numbered ADR log in the configured decisions directory in a Tier-2 project
- **PROC-029** Keep the managed CLAUDE.md block, with any imported AGENTS.md, under 200 lines

### Duplication

- **PROC-023** Extract convenience duplication at the third copy, and inline any one-caller abstraction
- **PROC-024** Extract a duplicated business rule at its second copy, including one rendered on two surfaces
- **BE-014** Add no new PHP copy-paste clones beyond the committed jscpd baseline
- **WEB-029** Introduce no copy-paste clones beyond the committed duplication baseline
- **MOB-033** Introduce no mobile copy-paste clones beyond the committed duplication baseline
- **PROC-034** Never let the jscpd duplication baseline grow _(Tier 1)_

### Exceptions, baselines and protected gates

- **PROC-012** Never delete or weaken a gate to get green; fix the code, record a dated exception or a waiver _(Tier 1)_
- **PROC-013** Ask the user before an agent edits gate files, baselines, allowlists or CI workflows _(Tier 1)_
- **PROC-026** Ask the user before an agent runs a shell command that skips or weakens a gate _(Tier 1)_
- **PROC-014** Give every allowlist entry a reason and an expiry date, and fail CI once the date has passed _(Tier 1)_
- **PROC-011** Keep copied gate files equal to the adopted templates, except inside declared configuration regions _(Tier 1)_
- **BE-005** Never let the PHPStan baseline grow _(Tier 1)_
- **BE-006** Never lower the PHPStan level, and raise it by the recorded due date
- **PROC-015** Never let the ESLint bulk-suppressions file grow _(Tier 1)_
- **PROC-027** Never let the dependency-cruiser known-violations baseline grow _(Tier 1)_
- **PROC-016** Describe the reason in every ESLint disable directive _(Tier 1)_
- **PROC-025** Allow inline ESLint exceptions only as `eslint-disable-next-line` comments _(Tier 1)_
- **PROC-031** Name the disabled rules in every ESLint directive and fail unused directives _(Tier 1)_
- **BE-098** Write every inline PHPStan suppression as `@phpstan-ignore` with an identifier and a reason _(Tier 1)_
- **MOB-027** Ban TypeScript suppression comments except a described `@ts-expect-error` _(Tier 1)_

### Proving gates

- **PROC-017** Trust a gate only after seeing it fail on a minimal violation and pass on clean code _(Tier 1)_
- **PROC-018** Keep every enabled gate with a shipped probe failing on that probe after adopting or upgrading _(Tier 1)_

### Code hygiene

- **BE-008** Leave no untracked TODO, FIXME, HACK or XXX marker: each one carries a ticket reference
- **WEB-053** Leave no untracked TODO, FIXME, HACK or XXX marker in JavaScript or TypeScript
- **BE-009** Commit no commented-out PHP code
- **WEB-027** Commit no commented-out JavaScript or TypeScript code
- **BE-097** Name regression tests after the invariant they protect

## The procedure

1. **Name the rule.** Before writing, say which pattern or rule ID the change follows ("thin
   controller per BE-030, authorized once per BE-021"). The pull request names the same IDs or ADRs,
   and its template asks for them (PROC-020, PROC-028).
2. **Unknown territory.** No rule covers the change, the change needs a new dependency, or a
   reference names a stop-and-ask trigger (for example forms with more than about fifteen fields, or
   multi-step forms, [ADR 0067][0067]):
   1. read the installed library's documentation for the need;
   2. name two options with their trade-offs;
   3. stop and ask the user;
   4. record the outcome as an ADR: numbered, in the project's decision directory, stating the
      context, the options, the choice and how compliance is checked (PROC-019 in Tier 2).
3. **Self-check before claiming done** (PROC-021):
   1. re-read the whole diff, not only the last edit;
   2. run the project's `check:fast` script, and the full `check` when the change touches more than
      one layer, a gate file, a migration or security plumbing: `composer run-script check:fast` in
      a Laravel track root, the npm script of the same name in a web or mobile track root;
   3. paste the real output verbatim with the command line and the exit status (trim a long log only
      at its start, never in the middle or at the end);
   4. if a check could not run (a missing tool, no database, no network), name it and say why; never
      report it as passing.
4. **Scripts over prose.** Deterministic work (version stamping, generated files, baseline updates,
   fixture runs) runs through the project's scripts; do not re-derive their steps by hand.

## What the hooks feed back

The plugin's hooks exist in 0.1.0 and run offline, from the project's own installed tools:

- **After each edit** (PostToolUse): the project's formatter (Pint for PHP, Prettier for JavaScript,
  TypeScript, JSON, CSS and Markdown) formats the edited file when installed, then file-scoped
  ESLint runs from the track root. Lint errors come back to you as `file:line rule message` lines;
  fix them while the file is in context (PROC-030).
- **When you finish a turn** (Stop): the project's `check:fast` script runs within a time budget. A
  failure returns the failing command and the end of its output, and the turn continues so you can
  fix it (PROC-022). With no manifest or no `check:fast` script, nothing runs.
- **Before a gate file is edited or a gate-weakening command runs** (PreToolUse): the user is asked
  to confirm (PROC-013, PROC-026). Asking is the point: explain why the change is needed, or fix the
  code instead.

## DRY policy

- **Rule of three.** Two similar blocks stay inline until a third copy shows what they share
  (PROC-023).
- **Extract at two for business rules.** A threshold, a status mapping, a price, an eligibility or
  permission condition gets one source at its second copy (PROC-024).
- **One-caller abstractions are defects.** Inline a wrapper, helper, service, interface or Action
  with one call site (PROC-023). A policy, request class, job or API Resource is required by the
  framework and does not count.
- **One source for a rule rendered twice** (web and PDF, web and native). The source is normally the
  backend, exposed through the API or the generated contract (PROC-024).
- Copy-paste duplication is measured by jscpd against a committed baseline that never grows (BE-014,
  WEB-029, MOB-033, PROC-034).

## Exceptions

Never delete or weaken a gate to get green (PROC-012). The sanctioned options, in order:

1. Fix the code.
2. Add a dated allowlist entry in `.cross-stack/allowlists/<RULE-ID>.json`:

   ```json
   {
     "rule": "BE-017",
     "entries": [
       {
         "match": "routes/api.php",
         "reason": "Signed webhook callback; moves to a controller with the payments refactor",
         "expires": "<last valid day, YYYY-MM-DD, within allowlistMaxDays>",
         "owner": "@payments-team"
       }
     ]
   }
   ```

   `match` takes the form the rule's gate documents. An expired entry fails, and `expires` may lie
   at most `allowlistMaxDays` (default 365) ahead (PROC-014). Validate the files with
   `node .cross-stack/bin/cross-stack.mjs check-allowlists`.

3. Record a waiver in a decision record when the exception is permanent by design.

Inline escapes have exactly one form per language, each with a reason:

```ts
// eslint-disable-next-line cross-stack/no-client-pagination -- fixed 12-item list, returned whole
```

```php
// @phpstan-ignore argument.type (the vendor stub declares string; this value is nullable)
```

In TypeScript only a described `@ts-expect-error` is allowed (MOB-027). Baselines (ESLint bulk
suppressions, the PHPStan baseline, dependency-cruiser known violations, the jscpd baseline) only
shrink; regenerate them only through the project's `baseline:update` scripts, which fail on growth.

## Fail-then-pass

A gate counts only after it has been seen failing on a minimal violation and passing on clean code
(PROC-017). When you add a test or a check that guards a rule, run it against a deliberate violation
first and show that failure, then show it passing on the real code. As gates ship, the kit adds
violation probes that run after `adopt` and `upgrade` to prove each enabled gate still fails when it
should (PROC-018).

## Status

In 0.1.0 most rules in this file are REVIEW guidance. The hooks described above ship and run, and
their rules (PROC-013, PROC-022, PROC-026, PROC-030) are GUARDED: their fixtures prove each hook
catches a minimal violation, and each has documented ways around it. The project tool's
`check-allowlists` command is part of the 0.1.0 kit; PROC-014 stays REVIEW until a shipped track
`check` chain runs it. `enforcement` in `${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for
each ID.

## Decision records

- [ADR 0004][0004]: Fail-then-pass: every gate is proven against a clean and a violation fixture
- [ADR 0005][0005]: Exceptions are explicit: dated allowlist entries, shrink-only baselines and described disable comments
- [ADR 0013][0013]: DRY policy: rule of three, extract at two for business rules, one-caller abstractions are defects
- [ADR 0014][0014]: Working procedure: name the rule, stop and ask in unknown territory, report real gate output
- [ADR 0067][0067]: Forms: installed form library first, required client validation, server field errors mapped to fields

[0004]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0004-fail-then-pass.md
[0005]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0005-explicit-exceptions.md
[0013]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0013-dry-policy.md
[0014]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0014-working-procedure.md
[0067]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0067-forms.md
