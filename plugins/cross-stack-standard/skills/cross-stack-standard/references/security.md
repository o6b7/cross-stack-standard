# Security

The security model across all tracks: server authority, credentials per platform, input hardening,
secrets and the supply chain, file uploads, logging and browser tooling. Track-specific security
rules are listed with titles in their track reference; this file lists the cross-track and shared
rules with titles and indexes the rest by ID. Rules marked Tier 1 apply to every project with the
rule's track; the others apply once the project declares Tier 2.

## The model by invariant

- **Server authority** (invariant 2, [ADR 0012][0012], [ADR 0043][0043]): the backend authorizes
  every action at one site; clients only hide or disable UI; the Next.js server re-verifies the
  session. Rules: SEC-003, SEC-004, SEC-005, SEC-034, SEC-058, PROC-010.
- **Credentials** (invariant 3, [ADR 0083][0083]): httpOnly cookies on the web, the OS secure store
  on mobile, finite and revocable tokens on the API. Rules: SEC-010, SEC-011, SEC-036, SEC-038,
  SEC-046, SEC-049, SEC-050, SEC-052, SEC-053.
- **Input at the boundary** (invariant 4): validated input only, safe methods, rate limits, no raw
  HTML sinks, same-origin mutations, no internals in errors. Rules: SEC-001, SEC-002, SEC-006,
  SEC-012, SEC-013, SEC-014, SEC-035, SEC-047, SEC-067, SEC-068.
- **Secrets and supply chain** (invariant 6, [ADR 0084][0084], [ADR 0085][0085], [ADR 0032][0032]):
  no committed secrets, runtime injection, pinned tools, audits, the Next.js floor. Rules: SEC-045,
  SEC-061, SEC-062, SEC-063, SEC-064, SEC-065, CI-008.

Where each track's security rules are listed:

- Laravel, in [laravel.md](laravel.md): SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006,
  SEC-007, SEC-008, SEC-009, SEC-010, SEC-011, SEC-012, SEC-013, SEC-014, SEC-022, SEC-023, SEC-024,
  SEC-025, SEC-027, SEC-029, SEC-030, SEC-071.
- Web, in [web.md](web.md): SEC-031, SEC-033, SEC-034, SEC-045, SEC-046, SEC-047, SEC-058, SEC-072.
- Mobile, in [mobile.md](mobile.md): SEC-049, SEC-050, SEC-051, SEC-052, SEC-053, SEC-054, SEC-055,
  SEC-056, SEC-057.
- The cookie BFF, in [bff-auth.md](bff-auth.md): SEC-032, SEC-035, SEC-036, SEC-037, SEC-038,
  SEC-039, SEC-040, SEC-041, SEC-042, SEC-043, SEC-044, SEC-059, SEC-067, SEC-068, SEC-070.
- Tenant isolation, in [tenancy.md](tenancy.md): SEC-015, SEC-016, SEC-017, SEC-018, SEC-019,
  SEC-020, SEC-021, SEC-069.
- Browser tooling, in [companions.md](companions.md): SEC-048, SEC-073, SEC-074.

## Rules

### Secrets and the supply chain

- **SEC-061** Inject production secrets at runtime from the platform, never commit or bake them in _(Tier 1)_
- **SEC-062** Give quality jobs no secrets, so no build or test step can need a runtime secret _(Tier 1)_
- **SEC-063** Commit no secret: run a pinned secret scanner over every commit range in CI _(Tier 1)_
- **SEC-064** Keep env example files to keys and placeholders, never secret values _(Tier 1)_
- **SEC-065** Pin third-party tooling: actions to full commit SHAs, MCP servers and CLI tools to exact versions _(Tier 1)_
- **CI-008** Audit production dependencies for known vulnerabilities in every quality job _(Tier 1)_
- **CI-018** Delay dependency releases, group framework updates without automerge and hold risky majors
- **SEC-057** Gitignore platform service-credential files and commit only placeholder examples
- **SEC-045** Resolve Next.js at or above the Standard's security floor _(Tier 1; next profile)_

### Server authority

- **PROC-010** Keep business rules on the backend, and name and test the source of any deliberate client mirror _(Tier 1)_
- **SEC-058** Use client permission checks only to hide or disable UI, and authorize every action on the server _(Tier 1)_

### Files

- **SEC-026** Store attachment ids, never URLs, and serve private files through short-lived signed URLs
- **BE-083** Route all file uploads through the declared upload requests _(off by default)_
- **SEC-022** Give every upload rule a size cap and type and extension allowlists without script formats
- **SEC-023** Enforce the morph map so polymorphic parent types come from an explicit allowlist _(off by default)_
- **SEC-024** Authorize file access by ownership of the file or its parent record, never by login alone
- **SEC-025** Store uploads under the validated extension, never a name derived from the sniffed type
- **MOB-028** Let the HTTP client set the multipart content type and boundary; never set them by hand

### Output and logging

- **SEC-047** Write no raw HTML sinks such as `dangerouslySetInnerHTML`, `innerHTML` or `document.write` _(Tier 1)_
- **SEC-012** Expose no exception message, class or trace in error responses when debug is off _(Tier 1)_
- **BE-090** Log with a constant message and pass variable data in the context array
- **BE-091** Log ids and stable codes, never models, tenant rows or per-locale column dumps
- **SEC-027** Redact credentials and personal data in every log channel
- **WEB-040** Log only through the logger module; no direct console calls

### Observability module (planned after 1.0)

- **BE-092** Propagate one request id: adopt or generate it, bind it to the log context and echo it on responses _(off by default)_
- **BE-093** Report errors to the error tracker only from the central exception funnel _(off by default)_
- **SEC-028** Keep the error tracker from sending personal data by default _(off by default)_
- **SEC-066** Import the error-tracking SDK only in the logger module _(off by default)_
- **WEB-041** Mint a request id when absent and forward it on every upstream call _(off by default)_

## Sanctioned patterns

**Credentials per platform** ([ADR 0083][0083]). Web: credentials only in httpOnly cookies set by
the server (by the BFF with `bff-auth`), never in script-readable storage, JavaScript state or a
URL; browser storage only through one storage module with typed, non-credential keys, cleared at
session end; `sessionStorage` never. Mobile: `expo-secure-store` behind one credential wrapper;
unencrypted key-value stores only in `storage/`. API: a token login route returns the token at a
documented path, logout revokes the current token, and tokens expire within a configured bound.

**Secrets** ([ADR 0084][0084], [ADR 0085][0085]). Each app ships a curated `.env.example` with keys
and placeholders only; real `.env` files stay untracked. Production secrets are injected at runtime
by the platform, never committed or baked into images or bundles; quality jobs receive no secrets,
and the web build and mobile export need none. Scan staged files before each commit and every
commit range in CI with a pinned, checksum-verified gitleaks binary (the kit's templates for this
are planned). Never bypass push protection; fix the content.

**Supply chain** ([ADR 0032][0032], [ADR 0071][0071], [ADR 0095][0095]). Actions are pinned to full
commit SHAs with a version comment; MCP servers and CLI tools to exact versions; nothing is fetched
at a moving ref. Every quality job audits production dependencies
(`composer audit --locked --no-dev`, `npm audit --omit=dev --audit-level=high`, or the lockfile's
own tool); a finding that cannot be fixed yet is a dated exception, never a lowered threshold. The
Next.js security floor is a separate gate because audit databases miss some advisories. Dependency
updates are delayed after release, framework updates are grouped without automerge, and risky
majors are held (CI-018); the adopter Renovate template that encodes this is planned.

**Raw HTML** ([ADR 0086][0086]). No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`,
`insertAdjacentHTML` or `document.write`. User rich text needs a project ADR naming the sanitizer
(an installed one first) and one wrapper component, the only place the ban is lifted. On mobile, a
WebView given an HTML string follows the same ADR requirement.

**Uploads** ([ADR 0087][0087]). File rules only in declared upload FormRequests, each with a size
cap and type and extension allowlists, never SVG, HTML or XML; `storeAs()` under a generated name
and the validated extension; the morph map enforced; access by ownership of the file or its parent,
never by login alone; records store attachment ids and responses resolve short-lived signed URLs;
clients let the HTTP client set the multipart boundary.

**Logging** ([ADR 0088][0088]). Constant messages; ids and stable codes in the context, never
models, tenant rows or per-locale dumps; a redaction processor on every channel for authorization,
token, password, cookie and personal-data keys; JavaScript logs only through the logger module.

**Observability** ([ADR 0099][0099]). A proposed module planned for 1.1.0: its rules are off by
default. Do not wire an error tracker as if the module existed; treat it as a new dependency under
stack-first.

## Status

In 0.1.0 the rules in this file are REVIEW guidance: apply them, and do not describe them as
enforced by a gate. The pinned-scanner CI step, the audit and pin checks, the storage boundaries and
the sink lint rules arrive in later 0.x releases. `enforcement` in
`${CLAUDE_PLUGIN_ROOT}/data/rules.json` is authoritative for each ID.

## Decision records

- [ADR 0012][0012]: The backend is authoritative; clients mirror the contract and defer business rules
- [ADR 0032][0032]: Supply-chain pinning: nothing fetched at a moving ref
- [ADR 0043][0043]: Authorization: a single site and a single policy ability for each endpoint
- [ADR 0071][0071]: Next.js security floor in one data file, gate-enforced
- [ADR 0083][0083]: Credential and client storage per platform
- [ADR 0084][0084]: Secret scanning and dependency audits in pre-commit and CI
- [ADR 0085][0085]: Environment files: curated examples without secrets, every key documented
- [ADR 0086][0086]: No raw HTML sinks; a sanitizer path only by ADR
- [ADR 0087][0087]: File uploads: declared upload requests, validated types, ownership-based access, ids instead of URLs
- [ADR 0088][0088]: Structured and redacted logging
- [ADR 0095][0095]: Adopter dependency updates: a Renovate template, with Dependabot documented
- [ADR 0099][0099]: Observability module: error tracking across stacks with request ids and personal-data scrubbing

[0012]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0012-backend-authority.md
[0032]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0032-supply-chain-pinning.md
[0043]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0043-single-authorization-site.md
[0071]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0071-nextjs-security-floor.md
[0083]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0083-credential-and-client-storage.md
[0084]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0084-secret-scanning-and-dependency-audits.md
[0085]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0085-environment-files.md
[0086]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0086-no-raw-html-sinks.md
[0087]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0087-file-uploads.md
[0088]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0088-structured-redacted-logging.md
[0095]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0095-adopter-dependency-updates.md
[0099]: https://github.com/o6b7/cross-stack-standard/blob/main/docs/decisions/0099-observability-module.md
