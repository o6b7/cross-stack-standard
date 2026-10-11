---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# File uploads: declared upload requests, validated types, ownership-based access, ids instead of URLs

## Context and Problem Statement

An upload is untrusted input with extra ways to go wrong. The content can execute when it is
served back (HTML, SVG with script, XML). The client chooses the file name, the extension and, with
polymorphic attachments, the parent record's type. Stored URLs expire or bypass authorization. And
on the client, a hand-set multipart header breaks the request.

Laravel's documentation spells out the details. `mimes:` checks the type derived from the content
and does not check that it agrees with the extension the user gave the file; `extensions:` checks
that extension and should never be used alone. The `image` rule rejects SVG by default because of
the cross-site scripting risk. `store()` and `Storage::putFile()` generate a name and take its
extension from the detected MIME type. MDN warns that setting `Content-Type` by hand on a
`FormData` request stops the browser from adding the multipart boundary.

How do the backend and the clients accept, store and serve files?

## Decision Drivers

- Untrusted input is hardened at the boundary (a Tier-1 invariant,
  [0008](0008-tiers-and-invariants.md)).
- What is stored matches what validation accepted.
- Access to a file follows access to what it belongs to.
- Records stay valid when storage, domains or signing keys change.

## Considered Options

- Declared upload requests with layered validation, controlled naming and resolved-at-read access
- Validation by extension or by detected type alone
- Direct uploads from the client to object storage through pre-signed URLs

## Decision Outcome

Chosen option: "Declared upload requests with layered validation, controlled naming and
resolved-at-read access", because each layer closes one of the failure modes above with a
framework feature that already exists.

On the backend:

- **Declared requests.** File rules appear only in the project's declared upload FormRequests
  ([0044](0044-form-request-validation.md)), listed by name in configuration.
- **Validation.** Every file rule carries a size cap (`max:`), an allowlist of content-derived types
  (`mimes:` or `File::types()`) and an allowlist of extensions (`extensions:`). Script-bearing
  formats are excluded: no SVG (and no `image:allow_svg`), HTML or XML.
- **Naming.** Files are stored with `storeAs()` under a generated name and the validated extension,
  never with `store()`, `storePublicly()` or `Storage::putFile()`, whose extension comes from the
  detected type. The stored extension is therefore always one the allowlist accepted.
- **Parents.** The morph map is enforced (`Relation::enforceMorphMap()` in a provider), and upload
  requests validate the parent-type field against an explicit list, so a client cannot attach a
  file to an arbitrary model class.
- **Access.** Upload, download and delete are authorized by ownership of the file or its parent
  record ([0043](0043-single-authorization-site.md)), never by authentication alone; with the
  tenancy module, attachments are tenant-scoped ([0057](0057-tenancy-module.md)).
- **References.** Records persist attachment ids, never URLs. Responses resolve a URL at read time;
  private files are served through short-lived signed URLs (`Storage::temporaryUrl()`) or an
  authorized download route.
- With the bff-auth module, the BFF rejects bodies above the same upload limit with 413 before
  buffering them ([0073](0073-bff-auth-module.md)).

On the clients:

- Multipart requests go through the shared HTTP client, which sets the content type and boundary;
  code never sets a multipart `Content-Type` by hand.
- Previews are optimistic, rendered from the local file, and forms and mutations persist only the
  attachment id the API returns.

### Consequences

- Good, because a file that could run as script is refused before it is stored.
- Good, because a stored name never carries an extension the allowlist did not accept.
- Good, because file access follows record access, and stored references survive storage moves.
- Bad, because every upload endpoint needs its own request class and allowlists.
- Bad, because signed URLs expire, so clients must re-read a record rather than cache its URLs.

### Confirmation

- Reflection over FormRequest `rules()` asserts that only the declared upload requests contain file
  rules, and that each file rule has a size cap, both allowlists and no script-bearing format.
  GUARDED, because rules built at runtime or wrapped in custom rule objects are not read.
- A test asserts that the morph map is required and that upload requests constrain the parent type
  with an `In` rule. FORCED.
- A PHPStan rule disallows `store()`, `storePublicly()` and `Storage::putFile()` on uploads.
  GUARDED, because other storage writes with a computed name are not covered.
- On mobile, a lint selector fails an object property keyed `Content-Type` whose literal value
  starts with `multipart/`. GUARDED, because a computed header value evades it; on the web this is
  Review.
- Ownership authorization, id-only persistence, read-time URLs and optimistic previews are Review.

Rules enter the registry as REVIEW and take these labels when the gate passes its clean and
violation fixtures ([0004](0004-fail-then-pass.md)).

## Pros and Cons of the Options

### Declared upload requests with layered validation, controlled naming and resolved-at-read access

- Good, because each layer uses a documented framework feature and is checkable.
- Bad, because it is more ceremony than a one-line `store()`.

### Validation by extension or by detected type alone

- Good, because it is one rule.
- Bad, because each check alone is documented as insufficient: the extension is client-chosen, and
  the detected type says nothing about the name the file is served under.

### Direct uploads from the client to object storage through pre-signed URLs

- Good, because large files bypass the application servers.
- Bad, because the application validates nothing until after the upload, so it needs a separate
  post-upload check; a project that needs it records that design in its own ADR.

## More Information

- Laravel file validation: <https://laravel.com/docs/13.x/validation#validating-files>; the
  `extensions` and `mimes` rules: <https://laravel.com/docs/13.x/validation#rule-extensions>,
  <https://laravel.com/docs/13.x/validation#rule-mimes>.
- Laravel file storage and `storeAs()`: <https://laravel.com/docs/13.x/filesystem#file-uploads>;
  temporary URLs: <https://laravel.com/docs/13.x/filesystem#temporary-urls>; custom polymorphic
  types: <https://laravel.com/docs/13.x/eloquent-relationships#custom-polymorphic-types>.
- OWASP File Upload Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html>.
- Using `FormData` objects:
  <https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects>.
- Related: [0043](0043-single-authorization-site.md), [0044](0044-form-request-validation.md),
  [0073](0073-bff-auth-module.md).
- Governs: the upload request, file validation, storage naming, morph map and file access rules,
  and the client multipart rules.
