---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Translatable content storage: per-locale columns or JSON translations, never mixed in one model

## Context and Problem Statement

User-entered content in more than one language, such as a product name in English and Arabic, is
data. It is not a UI label: labels come from message files
([0078](0078-labels-and-multilingual-content.md)). Laravel projects store such content in one of
two ways:

- **Per-locale columns** (`name_en`, `name_ar`). Each language gets its own column type,
  collation, index, uniqueness and `NOT NULL` constraint. Adding a locale is a migration on every
  translated table.
- **JSON translations**, one JSON column per attribute holding every locale, as
  spatie/laravel-translatable does (no extra table; its query scopes include `whereLocale`,
  `whereLocales` and `whereJsonContainsLocale`). Adding a locale needs no migration,
  but required locales, per-locale collation and indexing move into validation, generated columns
  or expression indexes.

A common defect is a model that mixes both, with some attributes in columns and others in JSON, so
every read has to know which pattern applies and fallbacks such as `name || name_ar` spread
through the clients.

How is translatable content stored, and how does a team choose between the two patterns?

## Decision Drivers

- Search and sorting respect the locale's collation where they matter.
- Required translations can be enforced.
- Adding a locale costs what it should, no more.
- Clients read multilingual content one way, whatever the storage
  ([0078](0078-labels-and-multilingual-content.md)).
- An installed translation package wins ([0006](0006-stack-first.md)).

## Considered Options

- A declared strategy per model, chosen by stated criteria, never mixed within a model
- Per-locale columns everywhere
- JSON translations everywhere

## Decision Outcome

Chosen option: "A declared strategy per model, chosen by stated criteria, never mixed within a
model", because each pattern is right for a different kind of content, and the defect comes from
mixing them, not from either one.

- **Per-locale columns** (`<attribute>_<locale>` for each configured locale,
  [0077](0077-i18n-module.md)) when search, sorting by a locale collation, uniqueness or a
  database-level required constraint matter, and the locale set is small and fixed.
- **JSON translations** through spatie/laravel-translatable (6.14.1 supports Laravel 11 to 13), or
  the translation package the project already uses, when content spans many locales or the set
  changes. Required locales are validated in the FormRequest
  ([0044](0044-form-request-validation.md)).
- **Never mixed.** A model declares one strategy for all of its translatable attributes.
- **One read path.** API Resources expose the content in the one shape the localized-field helper
  reads, whichever storage the model uses ([0045](0045-resources-only-serialization.md),
  [0078](0078-labels-and-multilingual-content.md)).
- **Adding a locale** to column-based models is a schema change and follows the migration-safety
  process ([0098](0098-migration-safety.md)).
- **Scope.** A post-1.0 candidate: implemented if time permits before 1.0, otherwise tracked on
  the roadmap.

### Consequences

- Good, because each model's storage matches its query and constraint needs.
- Good, because clients never branch on storage.
- Bad, because a team must decide per model, and changing strategy later is a data migration.
- Bad, because JSON storage moves some integrity rules from the database into the application.

### Confirmation

Review. A later gate could read the migrated schema, as the tenancy gate does
([0057](0057-tenancy-module.md)), and fail when a model that uses the JSON-translations trait also
has `*_<locale>` columns. It would enter the registry as REVIEW and move up only with clean and
violation fixtures ([0004](0004-fail-then-pass.md)). Until then this record is a proposal.

## Pros and Cons of the Options

### A declared strategy per model, chosen by stated criteria, never mixed within a model

- Good, because it uses each pattern where it is strongest.
- Bad, because the choice needs judgement and is checked in review.

### Per-locale columns everywhere

- Good, because the database enforces every constraint per language.
- Bad, because many locales mean many columns and a migration for every new locale.

### JSON translations everywhere

- Good, because adding a locale is configuration only.
- Bad, because locale-aware sorting, uniqueness and required translations need extra work.

## More Information

- spatie/laravel-translatable: <https://github.com/spatie/laravel-translatable> (version recorded
  in [verified-versions.md](../maintainers/verified-versions.md)).
- Laravel column modifiers, including `collation`:
  <https://laravel.com/docs/13.x/migrations#column-modifiers>.
- Related: [0006](0006-stack-first.md), [0045](0045-resources-only-serialization.md),
  [0077](0077-i18n-module.md), [0078](0078-labels-and-multilingual-content.md),
  [0098](0098-migration-safety.md).
- Governs: the i18n storage rule for user-entered multilingual content on the laravel track.
