/**
 * Keyed denylist for the brand-leak guard: key handling, building the committed digest file from
 * a private plaintext list, and loading/validating that file.
 *
 * Every digest is HMAC-SHA-256(key, UTF-8 of a normalised token or n-gram) in lowercase hex. The
 * committed file is designed to reveal nothing about the entries without the key:
 *
 * - the window lengths used for glued-substring matching are a fixed contiguous range, not the
 *   real token lengths;
 * - every digest set is padded with keyed decoys to a multiple of BUCKET_SIZE, so set sizes (and
 *   `count`) show only a bucket, not the number of entries;
 * - phrase heads and token prefixes are digested with a domain label, so a head digest never
 *   equals a token digest and shared structure between entries is not visible.
 *
 * Decoys are append-only: a rebuild with the same key keeps every earlier decoy, so the
 * denylist-shrink check (every base digest must still be present) keeps working when entries
 * are added. The key lives in the maintainer's environment, a per-clone key file under the git
 * directory, or CI secrets, never in the repository.
 */
import { createHash, createHmac, createSecretKey } from "node:crypto";
import { readFileSync } from "node:fs";

import { TOKENIZER_VERSION, codePointLength, tokenize } from "./tokenize.mjs";

/** Environment variable that holds the HMAC key. */
export const KEY_ENV = "CROSS_STACK_STANDARD_BRAND_KEY";
/** Environment variable that names a file holding the HMAC key. */
export const KEY_FILE_ENV = "CROSS_STACK_STANDARD_BRAND_KEY_FILE";
/** Per-clone key file, relative to the git common directory (never tracked). */
export const CLONE_KEY_PATH = "cross-stack-standard/brand.key";
/** Algorithm label written into the denylist file. */
export const ALGORITHM = "hmac-sha256";
/** Version of the denylist file layout. */
export const DENYLIST_FORMAT = 2;
/** Minimum key length in characters (a 256-bit key is 64 hex characters). */
export const MIN_KEY_LENGTH = 32;
/** Longest supported phrase, in tokens. */
export const MAX_NGRAM = 3;
/**
 * A phrase's space-less form ("wordword") is also matched as a glued token when it is at least
 * this many code points long; shorter joined forms would hit ordinary compounds.
 */
export const MIN_JOINED_LENGTH = 8;
/** Shortest single-token entry, in code points (the prefix pre-check needs this many). */
export const MIN_TOKEN_LENGTH = 3;
/** Code points digested (with a domain label) as the glued-match pre-check. */
export const PREFIX_LENGTH = 3;
/**
 * Window lengths always published, whatever the real token lengths are. A real length outside
 * the range extends it (the range stays contiguous).
 */
export const WINDOW_RANGE = Object.freeze({ min: 4, max: 24 });
/** Every digest set (and `count`) is padded to a multiple of this size. */
export const BUCKET_SIZE = 16;
/** Domain labels that keep head, prefix and decoy digests apart from token digests. */
export const DOMAINS = Object.freeze({
  head: "\u0000head\u0000",
  prefix: "\u0000prefix\u0000",
  decoy: "\u0000decoy\u0000",
});
/** Names of the padded digest sets (also used in decoy labels). */
export const DIGEST_SETS = Object.freeze([
  "tokens.digests",
  "tokens.prefixes",
  "ngrams.heads",
  "ngrams.2",
  "ngrams.3",
]);

/** Error raised for a missing, short, unreadable or mismatched key (CLI exit code 2). */
export class BrandKeyError extends Error {
  /**
   * @param {string} message
   * @param {{ missing?: boolean }} [options] `missing` is true only when no key source exists
   *   at all (the one case `--skip-without-key` may skip)
   */
  constructor(message, { missing = false } = {}) {
    super(message);
    this.name = "BrandKeyError";
    this.missing = missing;
  }
}

/** Error raised for an unreadable or malformed denylist or plaintext list (CLI exit code 2). */
export class DenylistError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "DenylistError";
  }
}

/**
 * Identify a key without revealing it: the first 8 hex characters of SHA-256 of the key string.
 * @param {string} key
 * @returns {string}
 */
export function computeKeyId(key) {
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 8);
}

/**
 * @typedef {object} BrandKey
 * @property {string} secret trimmed key string (used as UTF-8 bytes)
 * @property {string} keyId
 * @property {"file" | "env" | "env-file" | "clone"} source
 */

/**
 * @param {string} file
 * @param {string} what description for messages
 * @param {{ optional?: boolean }} [options] optional: a missing file returns null
 * @returns {string | null}
 */
function readKeyFile(file, what, { optional = false } = {}) {
  try {
    return readFileSync(file, "utf8").trim();
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw new BrandKeyError(`cannot read ${what} (${error.code ?? error.message})`);
  }
}

/**
 * @param {BrandKey["source"]} source
 * @returns {string}
 */
function describeSource(source) {
  return {
    file: "--key-file",
    env: KEY_ENV,
    "env-file": KEY_FILE_ENV,
    clone: `.git/${CLONE_KEY_PATH}`,
  }[source];
}

/**
 * Load the HMAC key. Sources, in order: `keyFile` (--key-file), the KEY_ENV variable, the file
 * named by KEY_FILE_ENV, and the per-clone key file (`cloneKeyFile`, normally
 * `<git common dir>/cross-stack-standard/brand.key`).
 *
 * Only "no source at all" is a missing key (`error.missing === true`). A source that exists but
 * cannot be read, or holds a key that is empty or too short, is an error even for callers that
 * may skip without a key: a broken maintainer setup must not look like a contributor without one.
 *
 * @param {{ keyFile?: string, env?: NodeJS.ProcessEnv, cloneKeyFile?: string | null }} [options]
 * @returns {BrandKey}
 * @throws {BrandKeyError}
 */
export function loadKey({ keyFile, env = process.env, cloneKeyFile = null } = {}) {
  let secret = null;
  /** @type {BrandKey["source"]} */
  let source = "file";
  if (keyFile) {
    secret = readKeyFile(keyFile, "the key file");
  } else if ((env[KEY_ENV] ?? "").trim()) {
    secret = env[KEY_ENV].trim();
    source = "env";
  } else if ((env[KEY_FILE_ENV] ?? "").trim()) {
    secret = readKeyFile(env[KEY_FILE_ENV].trim(), `the key file named by ${KEY_FILE_ENV}`);
    source = "env-file";
  } else if (cloneKeyFile) {
    secret = readKeyFile(cloneKeyFile, `the clone's key file (.git/${CLONE_KEY_PATH})`, {
      optional: true,
    });
    source = "clone";
  }
  if (secret === null) {
    throw new BrandKeyError(
      `no brand key: set ${KEY_ENV} or ${KEY_FILE_ENV}, pass --key-file <file>, or install ` +
        `the key once per clone as .git/${CLONE_KEY_PATH} (see CONTRIBUTING.md). The key is a ` +
        "maintainer and CI secret; pull requests from forks are checked by a maintainer with " +
        "scripts/check-pr.mjs.",
      { missing: true },
    );
  }
  if (!secret) throw new BrandKeyError(`the brand key from ${describeSource(source)} is empty`);
  if (secret.length < MIN_KEY_LENGTH) {
    throw new BrandKeyError(
      `the brand key from ${describeSource(source)} is too short (${secret.length} characters, ` +
        `minimum ${MIN_KEY_LENGTH})`,
    );
  }
  return { secret, keyId: computeKeyId(secret), source };
}

/**
 * Create a memoised digest function for one key.
 * @param {string} secret
 * @returns {(value: string) => string} lowercase hex HMAC-SHA-256
 */
export function createDigester(secret) {
  const key = createSecretKey(Buffer.from(secret, "utf8"));
  const cache = new Map();
  return (value) => {
    let digest = cache.get(value);
    if (digest === undefined) {
      digest = createHmac("sha256", key).update(value, "utf8").digest("hex");
      cache.set(value, digest);
    }
    return digest;
  };
}

/**
 * The prefix a glued-match pre-check digests for a token: its first PREFIX_LENGTH code points.
 * @param {string} token
 * @returns {string}
 */
export function tokenPrefix(token) {
  return Array.from(token).slice(0, PREFIX_LENGTH).join("");
}

/**
 * @typedef {object} PlaintextEntry
 * @property {number} line 1-based line in the plaintext file
 * @property {string[]} tokens normalised tokens (1 = single token, 2-3 = phrase)
 */

/**
 * Parse the private plaintext list: one entry per line, `#` starts a comment line, blank lines are
 * ignored, an entry with several tokens (spaces, hyphens, camelCase) is a phrase. Error messages
 * name line numbers only, never the entry.
 * @param {string} text
 * @returns {PlaintextEntry[]} unique entries in file order
 * @throws {DenylistError}
 */
export function parsePlaintext(text) {
  const entries = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith("#")) continue;
    const tokens = tokenize(raw);
    if (tokens.length === 0) {
      throw new DenylistError(`line ${index + 1}: entry has no letters or digits`);
    }
    if (tokens.length > MAX_NGRAM) {
      throw new DenylistError(
        `line ${index + 1}: entry has ${tokens.length} tokens (maximum ${MAX_NGRAM})`,
      );
    }
    if (tokens.length === 1 && codePointLength(tokens[0]) < MIN_TOKEN_LENGTH) {
      throw new DenylistError(
        `line ${index + 1}: a single-token entry needs at least ${MIN_TOKEN_LENGTH} letters or digits`,
      );
    }
    const key = tokens.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ line: index + 1, tokens });
  }
  return entries;
}

/**
 * @typedef {object} Denylist
 * @property {string} [$comment]
 * @property {number} format
 * @property {string} algorithm
 * @property {number} tokenizer
 * @property {string} keyId
 * @property {number} bucket padding bucket size
 * @property {number} count entry count rounded up to the bucket (single tokens + phrases)
 * @property {{ lengths: number[], prefixLength: number, prefixes: string[], digests: string[] }} tokens
 *   single-token digests (plus the joined form of long phrases), the window lengths of the
 *   glued-substring pass and the domain-labelled digests of every token's first code points
 * @property {{ heads: string[], "2": string[], "3": string[] }} ngrams phrase digests (tokens
 *   joined by one space) and the domain-labelled digests of their first tokens (a pre-check)
 */

/**
 * Round a size up to a multiple of the bucket (at least one bucket).
 * @param {number} n
 * @returns {number}
 */
export function bucketed(n) {
  return Math.max(BUCKET_SIZE, Math.ceil(n / BUCKET_SIZE) * BUCKET_SIZE);
}

/**
 * Digest of decoy number `index` of a digest set.
 * @param {(value: string) => string} digest
 * @param {string} set one of DIGEST_SETS
 * @param {number} index
 * @returns {string}
 */
export function decoyDigest(digest, set, index) {
  return digest(`${DOMAINS.decoy}${set}\u0000${index}`);
}

/**
 * Number of leading decoys (0, 1, 2 …) of a set that are present in an earlier digest list.
 * @param {(value: string) => string} digest
 * @param {string} set
 * @param {unknown} previous
 * @returns {number}
 */
function previousDecoyCount(digest, set, previous) {
  if (!Array.isArray(previous)) return 0;
  const present = new Set(previous);
  let count = 0;
  while (count < present.size && present.has(decoyDigest(digest, set, count))) count += 1;
  return count;
}

/**
 * Pad a set of real digests with decoys: keep every decoy the previous build had, then add
 * decoys until the size is a multiple of BUCKET_SIZE (at least one bucket).
 * @param {Set<string>} real
 * @param {(value: string) => string} digest
 * @param {string} set
 * @param {unknown} previous the same set in the previous file (same key only)
 * @returns {string[]} sorted digests
 */
function padSet(real, digest, set, previous) {
  const out = new Set(real);
  let index = 0;
  const keep = previousDecoyCount(digest, set, previous);
  for (; index < keep; index += 1) out.add(decoyDigest(digest, set, index));
  while (out.size < BUCKET_SIZE || out.size % BUCKET_SIZE !== 0) {
    out.add(decoyDigest(digest, set, index));
    index += 1;
  }
  return [...out].sort();
}

/**
 * Build the denylist object from parsed entries.
 * @param {PlaintextEntry[]} entries
 * @param {BrandKey} key
 * @param {{ previous?: unknown }} [options] the previous committed file (parsed JSON); when it was
 *   built with the same key and format, its decoys are kept, so no earlier digest disappears
 * @returns {Denylist}
 */
export function buildDenylist(entries, key, { previous } = {}) {
  const digest = createDigester(key.secret);
  const tokens = new Set();
  const prefixes = new Set();
  const heads = new Set();
  const grams = { 2: new Set(), 3: new Set() };
  let minLength = WINDOW_RANGE.min;
  let maxLength = WINDOW_RANGE.max;
  const addToken = (token) => {
    tokens.add(digest(token));
    prefixes.add(digest(`${DOMAINS.prefix}${tokenPrefix(token)}`));
    const length = codePointLength(token);
    minLength = Math.min(minLength, length);
    maxLength = Math.max(maxLength, length);
  };
  for (const entry of entries) {
    if (entry.tokens.length === 1) {
      addToken(entry.tokens[0]);
      continue;
    }
    grams[entry.tokens.length].add(digest(entry.tokens.join(" ")));
    heads.add(digest(`${DOMAINS.head}${entry.tokens[0]}`));
    const joined = entry.tokens.join("");
    if (codePointLength(joined) >= MIN_JOINED_LENGTH) addToken(joined);
  }
  const old = /** @type {any} */ (previous);
  const prev =
    old && typeof old === "object" && old.keyId === key.keyId && old.format === DENYLIST_FORMAT
      ? old
      : null;
  const lengths = [];
  for (let length = minLength; length <= maxLength; length += 1) lengths.push(length);
  return {
    $comment:
      "Generated by scripts/build-denylist.mjs. Keyed HMAC digests padded with keyed decoys; " +
      "do not edit by hand.",
    format: DENYLIST_FORMAT,
    algorithm: ALGORITHM,
    tokenizer: TOKENIZER_VERSION,
    keyId: key.keyId,
    bucket: BUCKET_SIZE,
    count: bucketed(entries.length),
    tokens: {
      lengths,
      prefixLength: PREFIX_LENGTH,
      prefixes: padSet(prefixes, digest, "tokens.prefixes", prev?.tokens?.prefixes),
      digests: padSet(tokens, digest, "tokens.digests", prev?.tokens?.digests),
    },
    ngrams: {
      heads: padSet(heads, digest, "ngrams.heads", prev?.ngrams?.heads),
      2: padSet(grams[2], digest, "ngrams.2", prev?.ngrams?.["2"]),
      3: padSet(grams[3], digest, "ngrams.3", prev?.ngrams?.["3"]),
    },
  };
}

const HEX_DIGEST = /^[0-9a-f]{64}$/u;

/**
 * Validate a parsed denylist object.
 * @param {unknown} value
 * @returns {Denylist}
 * @throws {DenylistError}
 */
export function validateDenylist(value) {
  const fail = (why) => {
    throw new DenylistError(`invalid denylist: ${why}`);
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("not a JSON object");
  const list = /** @type {Record<string, any>} */ (value);
  if (list.format !== DENYLIST_FORMAT) {
    fail(
      `unsupported format ${JSON.stringify(list.format)} (this checkout reads format ` +
        `${DENYLIST_FORMAT}); rebuild it with scripts/build-denylist.mjs`,
    );
  }
  if (list.algorithm !== ALGORITHM) fail(`unsupported algorithm ${JSON.stringify(list.algorithm)}`);
  if (list.tokenizer !== TOKENIZER_VERSION) {
    fail(
      `built with tokenizer ${JSON.stringify(list.tokenizer)}, this checkout uses ` +
        `${TOKENIZER_VERSION}; rebuild it with scripts/build-denylist.mjs`,
    );
  }
  if (typeof list.keyId !== "string" || !/^[0-9a-f]{8}$/u.test(list.keyId)) fail("bad keyId");
  if (!Number.isInteger(list.count) || list.count < 0) fail("bad count");
  if (list.bucket !== undefined && (!Number.isInteger(list.bucket) || list.bucket < 1)) {
    fail("bad bucket");
  }
  const digests = (array, name) => {
    if (!Array.isArray(array) || !array.every((d) => typeof d === "string" && HEX_DIGEST.test(d))) {
      fail(`${name} must be an array of 64-character hex digests`);
    }
    return array;
  };
  if (!list.tokens || typeof list.tokens !== "object") fail("missing tokens");
  if (!list.ngrams || typeof list.ngrams !== "object") fail("missing ngrams");
  digests(list.tokens.digests, "tokens.digests");
  digests(list.tokens.prefixes, "tokens.prefixes");
  const lengths = list.tokens.lengths;
  if (!Array.isArray(lengths) || !lengths.every((n) => Number.isInteger(n) && n > 0)) {
    fail("tokens.lengths must be an array of positive integers");
  }
  if (list.tokens.prefixLength !== PREFIX_LENGTH) {
    fail(`tokens.prefixLength must be ${PREFIX_LENGTH}`);
  }
  if (list.tokens.digests.length > 0) {
    // The glued-substring pass tries only these lengths and prefixes; an empty or narrowed list
    // would silently turn it off.
    if (list.tokens.prefixes.length === 0) {
      fail("tokens.prefixes is empty but tokens.digests is not");
    }
    const have = new Set(lengths);
    for (let length = WINDOW_RANGE.min; length <= WINDOW_RANGE.max; length += 1) {
      if (!have.has(length)) {
        fail(`tokens.lengths must include every length ${WINDOW_RANGE.min}-${WINDOW_RANGE.max}`);
      }
    }
  }
  digests(list.ngrams.heads, "ngrams.heads");
  digests(list.ngrams["2"], "ngrams.2");
  digests(list.ngrams["3"], "ngrams.3");
  return /** @type {Denylist} */ (list);
}

/**
 * Parse denylist JSON text. Error messages give a position at most and never quote the text
 * (a plaintext list passed by mistake must not reach the terminal).
 * @param {string} text
 * @param {string} [what] description for messages
 * @returns {unknown}
 * @throws {DenylistError}
 */
export function parseDenylistJson(text, what = "the denylist") {
  const first = /\S/u.exec(text);
  if (first && first[0] !== "{") {
    throw new DenylistError(
      `${what} is not a digest file (it does not start with "{"); pass the generated ` +
        "scripts/brand-denylist.json, never the plaintext list",
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const at = /position (\d+)/u.exec(String(error?.message));
    if (!at) throw new DenylistError(`${what} is not valid JSON`);
    const offset = Number(at[1]);
    const before = text.slice(0, offset);
    const line = before.split("\n").length;
    const column = offset - before.lastIndexOf("\n");
    throw new DenylistError(`${what} is not valid JSON (line ${line}, column ${column})`);
  }
}

/**
 * Read and validate a denylist file.
 * @param {string} file
 * @returns {Denylist}
 * @throws {DenylistError}
 */
export function readDenylist(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new DenylistError(`cannot read the denylist (${error.code ?? error.message})`);
  }
  return validateDenylist(parseDenylistJson(text));
}

/**
 * Throw unless the key is the one the denylist was built with.
 * @param {Denylist} denylist
 * @param {BrandKey} key
 * @throws {BrandKeyError}
 */
export function assertKeyMatches(denylist, key) {
  if (denylist.keyId !== key.keyId) {
    throw new BrandKeyError(
      `the brand key (keyId ${key.keyId}) does not match the denylist (keyId ${denylist.keyId}); ` +
        "use the key the denylist was built with, or rebuild it with scripts/build-denylist.mjs",
    );
  }
}

/**
 * Serialise JSON the way Prettier (printWidth 100) prints it: objects expanded, arrays on one
 * line when the line fits, otherwise one element per line.
 * @param {unknown} value
 * @param {number} [printWidth]
 * @returns {string} text with a trailing newline
 */
export function formatJson(value, printWidth = 100) {
  const render = (node, indent, prefix, suffix) => {
    const pad = "  ".repeat(indent);
    if (Array.isArray(node)) {
      if (node.length === 0) return `${pad}${prefix}[]${suffix}`;
      const flat = `${pad}${prefix}[${node.map((item) => JSON.stringify(item)).join(", ")}]${suffix}`;
      if (!node.some((item) => item && typeof item === "object") && flat.length <= printWidth) {
        return flat;
      }
      const items = node.map((item, i) =>
        render(item, indent + 1, "", i < node.length - 1 ? "," : ""),
      );
      return [`${pad}${prefix}[`, ...items, `${pad}]${suffix}`].join("\n");
    }
    if (node && typeof node === "object") {
      const keys = Object.keys(node);
      if (keys.length === 0) return `${pad}${prefix}{}${suffix}`;
      const items = keys.map((key, i) =>
        render(node[key], indent + 1, `${JSON.stringify(key)}: `, i < keys.length - 1 ? "," : ""),
      );
      return [`${pad}${prefix}{`, ...items, `${pad}}${suffix}`].join("\n");
    }
    return `${pad}${prefix}${JSON.stringify(node)}${suffix}`;
  };
  return `${render(value, 0, "", "")}\n`;
}
