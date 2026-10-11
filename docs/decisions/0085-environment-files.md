---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Environment files: curated examples without secrets, every key documented

## Context and Problem Statement

Every app reads configuration from its environment. Two failures recur. A key the code reads is
documented nowhere, so a new developer or a new environment finds it missing at runtime. Or a real
value leaks: into an example file, into a Docker image layer, or into a client bundle.

Each stack adds its own twist. In Laravel, once configuration is cached the `.env` file is not
loaded and `env()` returns only system variables, so `env()` belongs in config files alone. The
stock config files read dozens of framework keys, and a documentation gate that scans them all
pushes teams to paste every key into the example, which buries the ones that matter. A common
defect is a scan that does not recurse into config subdirectories, or that decides "framework file"
by base name, so a project file named like a framework file is never checked. In JavaScript apps,
public-prefixed variables (`NEXT_PUBLIC_`, `EXPO_PUBLIC_`) are inlined into the client bundle in
plain text.

How does each app document its environment without leaking it?

## Decision Drivers

- Every key the code reads is documented where a new developer looks first.
- The example file stays short enough to read as an operations document.
- Secrets never enter the repository, a build artifact or a client bundle.

## Considered Options

- Curated example files, with scoped documentation checks and runtime secret injection
- An example file listing every key the application can read, framework keys included
- Documentation outside the repository (README or wiki), no example file
- A committed, encrypted environment file

## Decision Outcome

Chosen option: "Curated example files, with scoped documentation checks and runtime secret
injection", because it documents what the project owns, stays readable, and keeps every real value
outside version control.

- **Every app** (each track root) ships a curated `.env.example` with keys only: values are empty
  or obvious placeholders, grouped and commented. Real `.env` files stay untracked.
- **Laravel.** Every key that a project config file reads through `env()` appears in
  `.env.example`; a commented `# KEY=` line counts, so optional keys are documented without being
  set. Every file under `config/`, recursively, is classified in configuration as project or
  framework-known. Framework-known files are exempt, so stock keys do not swamp the curation, and
  an unclassified file fails the check, so a new config file must register itself. `env()` in
  application code (the `App` namespace) is banned by the Pest `laravel` preset
  ([0036](0036-pest-replaces-phpunit-runner.md)); code reads `config()` instead.
- **JavaScript apps** document every key of the typed env schema in the example file
  ([0069](0069-typed-env-module.md)). Public-prefixed variables never hold secrets.
- **Production secrets** are injected at runtime by the platform (a secret manager, the
  orchestrator or the deploy step). They are never committed and never baked into images or build
  artifacts. Builds need no secrets: the web production build and the mobile bundle export run
  without them, and quality jobs receive none ([0090](0090-ci-contract.md)).
- The secret scanner reads example files like any other file ([0084](0084-secret-scanning-and-dependency-audits.md)).

### Consequences

- Good, because a missing key fails a test when it is introduced, not a deploy.
- Good, because the example file lists what the project owns, not the framework's catalogue.
- Good, because a leaked repository or build artifact contains no production secret.
- Bad, because every new config file needs a classification entry.
- Bad, because a curated file needs editing discipline; the checks catch omissions, not stale
  comments.

### Confirmation

- An example-file check parses every env example file in the declared track roots and fails when a
  key matching the secret-name patterns has a value that is neither empty nor an allowed
  placeholder. The patterns include `*_KEY` names, because a common defect is a pattern list that
  misses keys such as a payment provider's `*_KEY`. GUARDED, because a secret under a name the
  patterns do not match passes.
- A Pest test scans `config/` recursively for literal `env()` and `Env::get()` keys, requires every
  file to be classified and every project key to be documented. GUARDED, because keys built at
  runtime are not seen.
- A Vitest check imports the typed env module and asserts that every schema key is documented
  ([0069](0069-typed-env-module.md)). FORCED.
- A workflow check fails when a quality job, its reusable workflow or the workflow-level `env`
  references the `secrets` context or passes `secrets: inherit`. GUARDED, because a step can still
  fetch a secret by other means.
- Runtime injection and the absence of baked-in secrets are Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Curated example files, with scoped documentation checks and runtime secret injection

- Good, because documentation is enforced where the project owns the keys.
- Bad, because it needs a classification list for config files.

### An example file listing every key the application can read, framework keys included

- Good, because nothing is ever missing.
- Bad, because framework keys drown the project's own and the file stops being read.

### Documentation outside the repository (README or wiki), no example file

- Good, because it can carry long explanations.
- Bad, because nothing checks it against the code, so it drifts.

### A committed, encrypted environment file

- Good, because Laravel supports it natively (`php artisan env:encrypt`), and the file travels with
  the code.
- Bad, because the decryption key must still be injected at runtime, the approach covers Laravel
  only, and every rotation is a commit.

## More Information

- Laravel configuration caching and `env()`:
  <https://laravel.com/docs/13.x/configuration#configuration-caching>; encrypted environment files:
  <https://laravel.com/docs/13.x/configuration#encrypting-environment-files>.
- Next.js environment variables: <https://nextjs.org/docs/app/guides/environment-variables>; Expo
  environment variables: <https://docs.expo.dev/guides/environment-variables/>.
- Pest architecture presets: <https://pestphp.com/docs/arch-testing>.
- Related: [0069](0069-typed-env-module.md), [0084](0084-secret-scanning-and-dependency-audits.md),
  [0090](0090-ci-contract.md).
- Governs: the env-example rules for every track, the Laravel config-key documentation rule, the
  no-secrets-in-quality-jobs rule and the review rule on runtime secret injection.
