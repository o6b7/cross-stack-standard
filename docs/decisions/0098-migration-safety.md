---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Migration safety: expand and contract; destructive operations allowlisted

## Context and Problem Statement

A migration runs against a database that the previous release's code is still using. During a
rolling deploy, old instances keep serving requests, and jobs queued by the old code keep running;
if the new release is rolled back, the application goes back but a dropped column's data does not.
Dropping a column in the same release that stops reading it breaks the old instances for the
length of the deploy. Renaming breaks old and new code alike until every instance runs the new
release.

A common defect is a pull request that renames a column and updates every reference in the same
change. Its tests pass, because tests run one version of the code against one schema, and the
failure appears only in production, during the deploy window.

How are destructive schema changes made safe, and how is that checked?

## Decision Drivers

- Every deploy stays compatible with the previous release's code.
- Destructive operations are deliberate, visible and reviewed ([0005](0005-explicit-exceptions.md)).
- Migrations already in history are never flagged again.
- The check runs in CI, offline.

## Considered Options

- Expand and contract, with a gate on new migrations and dated allowlist entries
- Review only
- A ban on destructive operations

## Decision Outcome

Chosen option: "Expand and contract, with a gate on new migrations and dated allowlist entries",
because it keeps destructive changes possible while making each one a planned, two-release step.

- **Expand and contract.** The first release adds the new shape (a new column or table), backfills
  it, and writes both shapes while reading the new one. A later release, deployed only once no
  running code reads the old shape, removes it.
- **Destructive operations.** Dropping or renaming a column or table (`dropColumn`,
  `renameColumn`, `Schema::drop`, `Schema::dropIfExists`, `Schema::rename`), column changes through
  `->change()`, and raw DDL through `DB::statement()` each need a dated allowlist entry. Its reason
  names the expand release that is already deployed.
- **The gate.** A script reads the PHP tokens of the migrations added in the change, compared with
  the base branch, under `database/migrations`. It fails on a destructive call without a matching
  entry, and flags raw statements containing `DROP`, `RENAME` or `ALTER … DROP`.
- **Tenancy.** With the tenancy module on, tenant columns are also checked against the migrated
  schema ([0057](0057-tenancy-module.md)); a destructive change to them passes both gates.
- **Scope.** A post-1.0 candidate: implemented if time permits before 1.0, otherwise tracked on
  the roadmap.

### Consequences

- Good, because a breaking schema change becomes an explicit, reviewed plan instead of an accident
  found during a deploy.
- Good, because existing migrations never fail the gate.
- Bad, because a rename takes two releases and a period of dual writes.
- Bad, because the gate cannot confirm that the expand release really shipped; the entry's reason
  is trusted and reviewed.
- Bad, because raw SQL detection is a heuristic.

### Confirmation

If implemented: a diff-based script gate with a base and a head fixture: a new migration calling
`dropColumn` without an entry must fail, and the same migration with a dated entry must pass
([0004](0004-fail-then-pass.md)). It is GUARDED; evasions are DDL assembled at runtime, schema
changes made outside migrations (console commands or manual SQL), and destructive calls hidden
behind helper methods. Until then this record is a proposal.

## Pros and Cons of the Options

### Expand and contract, with a gate on new migrations and dated allowlist entries

- Good, because every destructive change is visible and planned.
- Bad, because it slows renames and needs allowlist upkeep.

### Review only

- Good, because it adds no tooling.
- Bad, because a rename looks correct in a diff; the failure is in the deploy order, which review
  does not see.

### A ban on destructive operations

- Good, because the gate is simple.
- Bad, because schemas could never shed old columns, and teams would move the change outside
  migrations.

## More Information

- Laravel migrations (renaming, dropping and modifying columns, `Schema::rename`):
  <https://laravel.com/docs/13.x/migrations>.
- Related: [0005](0005-explicit-exceptions.md), [0057](0057-tenancy-module.md),
  [0097](0097-translatable-content-storage.md).
- Governs: the Laravel migration-safety rule.
