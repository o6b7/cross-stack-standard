---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Model conventions: a complete mass-assignment posture, casts() and race-safe generated codes

## Context and Problem Statement

Eloquent protects against mass assignment only when each model declares what may be filled, with
`$fillable` or `$guarded` (on Laravel 13 also the `Fillable`, `Guarded` and `Unguarded` class
attributes). Long fillable lists drift from the migrations. Guarding only the primary key is
shorter, but on its own it lets request input set every other column, including server-owned ones
such as the owner, the creator, a status or the tenant: the mass-assignment vulnerability the
framework documentation warns about.

Three smaller conventions also vary between projects: where casts are declared, how list
visibility relates to policies, and how human-readable codes (`ORD-000123`) are generated. A common
defect is a code generator that reads `max()` and adds one; two concurrent requests read the same
maximum, and one of them fails or both get the same code.

Which mass-assignment postures are allowed, and which model conventions are fixed?

## Considered Options

- Explicit fillable lists, or guarding only the key as part of a complete protection package
- Explicit fillable lists only
- Guarding only the key, with no further protection
- Unguarded models with hand-built input arrays

## Decision Outcome

Chosen option: "Explicit fillable lists, or guarding only the key as part of a complete protection
package", because both are safe when complete, and the package is what makes the shorter posture
safe.

- **Mass assignment.** A model either lists its fillable attributes, or guards only its key
  (`$guarded = ['id']` or `#[Guarded(['id'])]`) together with the whole package:
  1. server-owned fields are stripped from input at the HTTP boundary by middleware on the API
     group;
  2. a creating hook stamps server-owned fields from the authenticated context;
  3. writes use validated input only (`validated()` or `safe()`,
     [0044](0044-form-request-validation.md));
  4. with the tenancy module, the creating hook refuses an explicit tenant id that differs from a
     non-platform user's own ([0057](0057-tenancy-module.md)).

  Unguarded models are not a posture.

- **Casts** are declared in the `casts()` method, the form the framework documents, never in a
  `$casts` property. Status-like columns cast to enums ([0046](0046-enums-on-the-wire.md)).
- **Relation lists** that controllers eager-load for a Resource are class constants on the model,
  defined once, so the loaded set and the serialized set change together.
- **Visibility.** A list-visibility query scope mirrors the policy's view rule; the scope and the
  policy method carry comments pointing at each other ([0043](0043-single-authorization-site.md)).
- **Generated codes** come from a database sequence or identity, or from an insert that retries on
  a unique-constraint violation (Laravel raises `UniqueConstraintViolationException`) with a
  bounded number of attempts. Either way the column has a unique index. Read-then-increment
  (`max() + 1`) is banned.
- **With the tenancy module**, business `tenant_id` columns are `NOT NULL` with a
  restrict-on-delete foreign key; deleting a tenant is an explicit offboarding step
  ([0057](0057-tenancy-module.md)).

### Consequences

- Good, because the short posture is safe only when all of its parts are present, and a gate checks
  that they are.
- Good, because one casts form and one visibility pattern make models predictable to read.
- Good, because generated codes stay unique under concurrent writes.
- Bad, because the guarded-key package is more infrastructure than a fillable list; small projects
  can stay on fillable lists.
- Bad, because scope-to-policy mirroring relies on review; a scope and a policy can still diverge.

### Confirmation

- With the tenancy module, a test asserts that when the base model guards only its key, the
  stripping middleware is in the resolved API middleware group, the creating hook is registered and
  the raw-input rule is enabled: GUARDED. Without the tenancy module, completeness of the package
  is Review.
- A type-aware custom PHPStan rule fails raw request accessors (`all()`, `input()`, `only()`,
  `except()`, magic properties) in controller write actions
  ([0037](0037-phpstan-rules-and-reflection-tests.md)): GUARDED.
- A reflection test fails any model that declares its own `$casts` property: FORCED.
- The tenancy module's schema tests check `NOT NULL` and restrict-on-delete on tenant columns
  ([0057](0057-tenancy-module.md)).
- Race-safe code generation, relation-list constants and scope-to-policy mirroring are Review.

## Pros and Cons of the Options

### Explicit fillable lists, or guarding only the key as part of a complete protection package

- Good, because each posture is complete on its own terms.
- Bad, because there are two postures to explain instead of one.

### Explicit fillable lists only

- Good, because it is the framework default and easy to check.
- Bad, because long lists drift from the schema and are edited on every column change.

### Guarding only the key, with no further protection

- Good, because it is the shortest declaration.
- Bad, because any column, including server-owned ones, becomes writable from request input.

### Unguarded models with hand-built input arrays

- Good, because it removes the declaration entirely.
- Bad, because every write path must build its arrays by hand, and one careless `create($input)`
  exposes the whole table.

## More Information

- Mass assignment and its attributes: <https://laravel.com/docs/13.x/eloquent#mass-assignment>.
- Attribute casting with `casts()`: <https://laravel.com/docs/13.x/eloquent-mutators#attribute-casting>.
- Foreign key actions: <https://laravel.com/docs/13.x/migrations#foreign-key-constraints>.
- `Illuminate\Database\UniqueConstraintViolationException` in the framework source:
  <https://github.com/laravel/framework/blob/v13.33.0/src/Illuminate/Database/UniqueConstraintViolationException.php>.
- Related: [0043](0043-single-authorization-site.md), [0044](0044-form-request-validation.md),
  [0057](0057-tenancy-module.md).
- Governs: the Laravel model rules (mass-assignment posture, casts, relation lists, visibility
  scopes, generated codes) and the security rules on validated-only writes.
