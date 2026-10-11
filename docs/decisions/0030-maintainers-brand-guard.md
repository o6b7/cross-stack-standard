---
status: accepted
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Maintainers: keyed-HMAC brand guard on every publishing channel

## Context and Problem Statement

This repository must never publish certain private names, such as names of organizations,
internal projects and domains that are not part of the Standard. A leak is hard to undo: git
history, pull request titles, issue text and forks keep the text after a file is fixed. The guard
that detects these names is itself public, so it cannot hold them in plain text. A plain hash is
not enough either: a short name has few candidates (a name of n lowercase letters has only
26<sup>n</sup>), so short names can be recovered from an unkeyed SHA-256 digest offline in seconds
to minutes.

This is a repository-maintenance control, not a rule of the Standard: it has no registry entry and
nothing of it ships to adopters.

How does the repository detect these names on every channel it publishes through, without
revealing them?

## Decision Drivers

- The committed guard data must reveal nothing about the names.
- Scanning every token of every file must stay fast enough for a pre-commit hook.
- Every publishing channel is covered: files, file names, binaries, commit messages, commit and tag
  identities, pull request text, branch names, release notes and text posted with `gh`.
- Obfuscated forms (case, separators, glued words, look-alike and invisible characters, markup,
  line wraps) are caught, and the forms that are not are listed as documented limits.
- The list can grow but not silently shrink.

## Considered Options

- Plain SHA-256 digests of the names, committed
- A slow, memory-hard hash of the names, committed
- HMAC-SHA-256 digests under a secret key, committed
- The plain list stored only as a CI secret, nothing committed

## Decision Outcome

Chosen option: "HMAC-SHA-256 digests under a secret key, committed", because without the key the
digests reveal nothing, while each lookup stays a fast hash.

- **Key and data.** A 256-bit key lives as a GitHub Actions secret and, once per clone, in the
  maintainer's `.git/cross-stack-standard/brand.key` (or an environment variable).
  `scripts/brand-denylist.json` holds only digests, built from a plaintext list kept outside the
  repository. The file hides the shape of the list too: the window lengths are a fixed range, every
  digest set is padded with keyed decoys to a multiple of 16, and phrase heads and token prefixes
  carry a domain label, so no digest reveals a length, a count or shared structure. Findings name a
  location and a kind, never the matched text.
- **Tokenizer.** Unicode NFKC; invisible characters removed (format characters, default-ignorable
  code points such as the Hangul fillers and variation selectors, and control characters);
  diacritics, elongation marks and script-specific letter variants folded for every script the
  tokenizer supports; look-alike characters (including small capitals and enclosed letters)
  mapped to confusable skeletons. Tokens split at non-alphanumerics and at camelCase, snake_case,
  kebab-case, dot, `@`, `/` and letter-digit boundaries. A substring pass catches names glued to
  other words; letter-spaced words are joined; phrases are matched as n-grams over the whole file's
  token stream, so a line wrap or comment marker cannot split them; escapes, inline markup,
  hyphenated line breaks and base64 `data:` URIs are also scanned in decoded form.
- **Documented limits.** Reversed text, digit-for-letter and multi-character substitutions,
  base64 outside a `data:` URI, and a word split by a visible gap character are not normalised.
- **Channels.** Before publication: the staged tree, file names, printable strings in binary files
  and the identity of the next commit (pre-commit), the commit message with its comment lines
  (commit-msg), and every commit a push would publish, with its message, author and committer,
  added paths and every file version (pre-push). In CI: the changed files, every commit message,
  identity and file version in the range, and the pull request title, body and branch name. The
  workflow reads those through `env:`, never through `${{ }}` inside `run:`, which GitHub
  recommends against script injection. After merge: every new commit on `dev` and `main`, including
  the ones GitHub writes for squash and merge commits. At release: the full history, with ref
  names, tag messages and taggers. Everything published through `gh` is piped through
  `check-brand-leak.mjs --stdin` first.
- **Fork pull requests.** GitHub does not pass secrets to workflows triggered from forks, so the
  maintainer runs `scripts/check-pr.mjs` locally before merging (it reports every changed binary
  file, which a diff cannot show, as unchecked), and the push to `dev` scans again.
- **No shrinking.** CI fails when the bucketed entry count drops below the base branch's, when the
  algorithm or file format changes, or, with the same key, when any base digest or window length
  disappears. Decoys are append-only, so a growing list never loses a digest.
- **Narrative lint.** A separate plain-text lint (`check-narrative.mjs`) fails on internal
  tracking notation, such as working-note identifiers, in public text, and warns on generic
  narrative phrases that are also ordinary English; ordinary technical English passes.

### Consequences

- Good, because the committed file can be read by anyone without revealing a name.
- Good, because obfuscated and split forms are caught on every channel before they are published,
  with the remaining limits written down.
- Bad, because the guard cannot run without the key: fork pull requests are checked by the
  maintainer and after merge, not by CI before merge.
- Bad, because rotating the key means rebuilding the digest file from the private list.

### Confirmation

The CI integrity job runs the guard over the tree, the pull request range and the pull request
text, and fails when the key is missing on a same-repository run. `check-denylist-shrink.mjs` and
`check-narrative.mjs` run in the same job, lefthook runs the guard before each commit, on each
commit message and before each push, and `release.yml` repeats a full-history scan. A self-test uses a synthetic token
with a test-only denylist, so the guard is proven to fail without committing a real name.

## Pros and Cons of the Options

### Plain SHA-256 digests of the names, committed

- Good, because anyone can run the guard, including on fork pull requests.
- Bad, because the digests of short names can be brute-forced offline in seconds.

### A slow, memory-hard hash of the names, committed

- Good, because brute force becomes expensive.
- Bad, because every token of every file needs a lookup, so a hash tuned to be slow makes scans
  impractically slow, and a fast prefilter gives an attacker the same shortcut.

### HMAC-SHA-256 digests under a secret key, committed

- Good, because the digests are useless without the key and each lookup stays fast.
- Bad, because contributors without the key cannot run the guard.

### The plain list stored only as a CI secret, nothing committed

- Good, because nothing is committed at all.
- Bad, because the list can change silently, with no reviewable count, and local hooks still need a
  private copy.

## More Information

- HMAC: <https://www.rfc-editor.org/rfc/rfc2104>; Unicode normalization (UAX #15):
  <https://www.unicode.org/reports/tr15/>; confusable detection (UTS #39):
  <https://www.unicode.org/reports/tr39/>.
- Secrets and forks:
  <https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets>;
  script injection and intermediate environment variables:
  <https://docs.github.com/en/actions/reference/security/secure-use>.
- Related: [0025](0025-release-tooling.md), [0027](0027-branching-model.md),
  [0031](0031-maintainers-repository-ci.md).
- Governs: this repository's publishing checks; no registry rule and nothing shipped to adopters.
