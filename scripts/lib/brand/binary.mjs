/**
 * Printable-string extraction from binary files for the brand-leak guard.
 *
 * A binary file can carry text in its metadata: image text chunks and EXIF/XMP, PDF info
 * dictionaries, font name tables, archive member names and contents. This module finds such
 * text the way `strings(1)` does, extended to UTF-8, UTF-16LE/BE and a few compressed containers
 * (zlib streams in PDF and PNG, ZIP members, gzip, WOFF and WOFF2 fonts), all with Node built-ins.
 */
import {
  brotliDecompressSync,
  constants,
  gunzipSync,
  inflateRawSync,
  inflateSync,
} from "node:zlib";

/** Minimum run length, in characters, for an extracted string. */
export const MIN_STRING_LENGTH = 4;
/** Bytes inspected by isBinary (the same window as git's binary heuristic). */
export const SNIFF_BYTES = 8000;

const MAX_INFLATED_BYTES = 16 * 1024 * 1024;
const MAX_INFLATE_ATTEMPTS = 256;
const MAX_DEPTH = 2;

/**
 * Whether the bytes at `offset` spell `text` (one byte per character).
 * @param {Uint8Array} b
 * @param {number} offset
 * @param {string} text
 * @returns {boolean}
 */
function ascii(b, offset, text) {
  if (b.length < offset + text.length) return false;
  for (let k = 0; k < text.length; k += 1) if (b[offset + k] !== text.charCodeAt(k)) return false;
  return true;
}

/** File signatures that mark a buffer as binary even without a NUL byte. */
const BINARY_SIGNATURES = [
  "%PDF-",
  "\x89PNG",
  "PK\x03\x04",
  "\x1f\x8b",
  "wOFF",
  "wOF2",
  "\xff\xd8\xff",
  "GIF8",
  "OTTO",
  "\x00\x01\x00\x00",
];
/**
 * Whether bytes are valid UTF-8. When the window was cut from a longer buffer, a multi-byte
 * sequence split by the cut is accepted (streaming decode buffers it instead of failing).
 * @param {Uint8Array} bytes
 * @param {boolean} truncated
 * @returns {boolean}
 */
function isValidUtf8Window(bytes, truncated) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: truncated });
    return true;
  } catch {
    return false;
  }
}

/**
 * Treat a buffer as binary when its first 8000 bytes contain a NUL byte (git's heuristic), start
 * with a known binary signature (PDF, PNG, ZIP, gzip, WOFF, JPEG, GIF, OpenType/TrueType), or are
 * not valid UTF-8.
 * @param {Uint8Array} buffer
 * @returns {boolean}
 */
export function isBinary(buffer) {
  const window = buffer.subarray(0, Math.min(buffer.length, SNIFF_BYTES));
  if (window.includes(0)) return true;
  if (BINARY_SIGNATURES.some((signature) => ascii(buffer, 0, signature))) return true;
  return !isValidUtf8Window(window, buffer.length > window.length);
}

/**
 * @typedef {object} ExtractedString
 * @property {number} offset byte offset of the run in the file (for decompressed or decoded data:
 *   the offset of the container)
 * @property {string} text
 * @property {boolean} compressed whether the text came from decompressed or decoded data (a
 *   compressed stream, a PDF hex string)
 */

const decoder = new TextDecoder("utf-8");

/**
 * Length of a valid UTF-8 sequence starting at `i` that encodes a printable character (tab and
 * line breaks included, so a phrase wrapped inside metadata stays in one run), or 0.
 * @param {Uint8Array} b
 * @param {number} i
 * @returns {number}
 */
function utf8SequenceLength(b, i) {
  const c = b[i];
  if (c === 0x09 || c === 0x0a || c === 0x0d || (c >= 0x20 && c <= 0x7e)) return 1;
  const cont = (k) => i + k < b.length && (b[i + k] & 0xc0) === 0x80;
  if (c >= 0xc2 && c <= 0xdf && cont(1)) {
    const cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f);
    return cp >= 0xa0 ? 2 : 0; // skip C1 controls
  }
  if (c >= 0xe0 && c <= 0xef && cont(1) && cont(2)) {
    const cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
    if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) return 0;
    return 3;
  }
  if (c >= 0xf0 && c <= 0xf4 && cont(1) && cont(2) && cont(3)) {
    const cp =
      ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
    return cp >= 0x10000 && cp <= 0x10ffff ? 4 : 0;
  }
  return 0;
}

/**
 * Printable runs of UTF-8 text (ASCII included).
 * @param {Uint8Array} b
 * @returns {Array<{ offset: number, text: string }>}
 */
export function utf8Strings(b) {
  const out = [];
  let start = -1;
  let chars = 0;
  const flush = (end) => {
    if (start >= 0 && chars >= MIN_STRING_LENGTH) {
      out.push({ offset: start, text: decoder.decode(b.subarray(start, end)) });
    }
    start = -1;
    chars = 0;
  };
  let i = 0;
  while (i < b.length) {
    const n = utf8SequenceLength(b, i);
    if (n === 0) {
      flush(i);
      i += 1;
      continue;
    }
    if (start < 0) start = i;
    chars += 1;
    i += n;
  }
  flush(b.length);
  return out;
}

/**
 * Whether a UTF-16 code unit is kept in a UTF-16 run: printable ASCII, Latin-1 through Arabic
 * (U+00A0-U+06FF), general punctuation and format characters, Arabic presentation forms and
 * full-width ASCII. Other ranges are excluded so random bytes do not form long runs.
 * @param {number} u
 * @returns {boolean}
 */
function isUtf16Printable(u) {
  return (
    u === 0x09 ||
    u === 0x0a ||
    u === 0x0d ||
    (u >= 0x20 && u <= 0x7e) ||
    (u >= 0xa0 && u <= 0x6ff) ||
    (u >= 0x2000 && u <= 0x206f) ||
    (u >= 0xfb50 && u <= 0xfdff) ||
    (u >= 0xfe70 && u <= 0xfeff) ||
    (u >= 0xff01 && u <= 0xff5e)
  );
}

/**
 * Printable runs of UTF-16 text, both byte orders and both alignments.
 * @param {Uint8Array} b
 * @returns {Array<{ offset: number, text: string }>}
 */
export function utf16Strings(b) {
  const out = [];
  for (const littleEndian of [true, false]) {
    for (const align of [0, 1]) {
      let start = -1;
      let units = [];
      const flush = () => {
        if (units.length >= MIN_STRING_LENGTH) {
          let text = "";
          for (let k = 0; k < units.length; k += 1024) {
            text += String.fromCharCode(...units.slice(k, k + 1024));
          }
          out.push({ offset: start, text });
        }
        start = -1;
        units = [];
      };
      for (let i = align; i + 1 < b.length; i += 2) {
        const u = littleEndian ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1];
        if (isUtf16Printable(u)) {
          if (start < 0) start = i;
          units.push(u);
        } else {
          flush();
        }
      }
      flush();
    }
  }
  return out;
}

/**
 * Inflate zlib data with an output cap; on overflow, inflate a truncated prefix instead.
 * @param {(input: Uint8Array, options: object) => Buffer} inflate
 * @param {Uint8Array} input
 * @returns {Buffer | null}
 */
function safeInflate(inflate, input) {
  try {
    return inflate(input, { maxOutputLength: MAX_INFLATED_BYTES });
  } catch (error) {
    if (error.code !== "ERR_BUFFER_TOO_LARGE") return null;
  }
  try {
    return inflate(input.subarray(0, 256 * 1024), {
      maxOutputLength: MAX_INFLATED_BYTES,
      finishFlush: constants.Z_SYNC_FLUSH,
    });
  } catch {
    return null;
  }
}

/**
 * Offsets of zlib stream headers (CMF 0x78 with a valid FCHECK).
 * @param {Uint8Array} b
 * @param {number} [from]
 * @param {number} [to]
 * @returns {number[]}
 */
function zlibHeaders(b, from = 0, to = b.length) {
  const found = [];
  for (let i = from; i + 1 < to && found.length < MAX_INFLATE_ATTEMPTS; i += 1) {
    if (b[i] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b[i + 1])) found.push(i);
  }
  return found;
}

/**
 * PNG: inflate compressed text chunks (zTXt, and iTXt with the compression flag set).
 * @param {Uint8Array} b
 * @returns {Array<{ offset: number, data: Uint8Array }>}
 */
function pngPayloads(b) {
  const out = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const length = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const data = b.subarray(i + 8, Math.min(b.length, i + 8 + length));
    if (type === "zTXt" || type === "iTXt") {
      const nul = data.indexOf(0);
      if (nul >= 0) {
        let at = -1;
        if (type === "zTXt") at = nul + 2;
        else if (data[nul + 1] === 1) {
          // iTXt: keyword NUL flag method language NUL translated NUL text
          const langEnd = data.indexOf(0, nul + 3);
          const transEnd = langEnd >= 0 ? data.indexOf(0, langEnd + 1) : -1;
          if (transEnd >= 0) at = transEnd + 1;
        }
        const inflated = at >= 0 ? safeInflate(inflateSync, data.subarray(at)) : null;
        if (inflated) out.push({ offset: i, data: inflated });
      }
    }
    if (type === "IEND") break;
    i += 12 + length;
  }
  return out;
}

// A PDF hex string object: `<` hex digits and whitespace `>`, not a `<<` dictionary delimiter.
const PDF_HEX_STRING = /(?<!<)<([0-9A-Fa-f\s]{8,})>(?!>)/gu;
const MAX_PDF_HEX_STRINGS = 4096;

/**
 * Decode a PDF hex string body (whitespace ignored, an odd final digit padded with 0, as the PDF
 * specification says). A `FEFF` prefix marks UTF-16BE text; the bytes are returned as they are
 * and the UTF-16 extraction reads them.
 * @param {string} body
 * @returns {Buffer}
 */
export function decodePdfHexString(body) {
  let hex = body.replace(/\s+/gu, "");
  if (hex.length % 2 === 1) hex += "0";
  return Buffer.from(hex, "hex");
}

/**
 * PDF: inflate every stream body that starts with a zlib header, and decode hex string objects
 * (`/Author <FEFF…>` is how many writers store non-ASCII metadata).
 * @param {Uint8Array} b
 * @returns {Array<{ offset: number, data: Uint8Array }>}
 */
function pdfPayloads(b) {
  const out = [];
  const text = Buffer.from(b.buffer, b.byteOffset, b.length).toString("latin1");
  const marker = /stream\r?\n/gu;
  let match;
  while ((match = marker.exec(text)) && out.length < MAX_INFLATE_ATTEMPTS) {
    const start = match.index + match[0].length;
    if (b[start] !== 0x78) continue;
    const inflated = safeInflate(inflateSync, b.subarray(start));
    if (inflated) out.push({ offset: start, data: inflated });
  }
  let hexStrings = 0;
  for (const hex of text.matchAll(PDF_HEX_STRING)) {
    if (hexStrings >= MAX_PDF_HEX_STRINGS) break;
    hexStrings += 1;
    out.push({ offset: hex.index, data: decodePdfHexString(hex[1]) });
  }
  return out;
}

/**
 * ZIP (also docx/xlsx/jar/...): member names are plain text already; inflate deflated members.
 * @param {Uint8Array} b
 * @returns {Array<{ offset: number, data: Uint8Array }>}
 */
function zipPayloads(b) {
  const out = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i + 30 <= b.length && out.length < MAX_INFLATE_ATTEMPTS; i += 1) {
    if (view.getUint32(i, true) !== 0x04034b50) continue;
    const method = view.getUint16(i + 8, true);
    const size = view.getUint32(i + 18, true);
    const nameLength = view.getUint16(i + 26, true);
    const extraLength = view.getUint16(i + 28, true);
    const start = i + 30 + nameLength + extraLength;
    if (method !== 8 || start >= b.length) continue;
    const end = size > 0 ? Math.min(b.length, start + size) : b.length;
    const inflated = safeInflate(inflateRawSync, b.subarray(start, end));
    if (inflated) out.push({ offset: i, data: inflated });
  }
  return out;
}

/**
 * WOFF 1.0: tables are individually zlib-compressed.
 * @param {Uint8Array} b
 * @returns {Array<{ offset: number, data: Uint8Array }>}
 */
function woffPayloads(b) {
  const out = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 44) return out;
  const numTables = view.getUint16(12);
  for (let t = 0; t < numTables && 44 + (t + 1) * 20 <= b.length; t += 1) {
    const entry = 44 + t * 20;
    const offset = view.getUint32(entry + 4);
    const compLength = view.getUint32(entry + 8);
    const origLength = view.getUint32(entry + 12);
    if (compLength >= origLength || offset + compLength > b.length) continue;
    const inflated = safeInflate(inflateSync, b.subarray(offset, offset + compLength));
    if (inflated) out.push({ offset, data: inflated });
  }
  return out;
}

/**
 * WOFF 2.0: one Brotli stream after a variable-length table directory.
 * @param {Uint8Array} b
 * @returns {Array<{ offset: number, data: Uint8Array }>}
 */
function woff2Payloads(b) {
  if (b.length < 48) return [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const numTables = view.getUint16(12);
  const totalCompressedSize = view.getUint32(20);
  let i = 48;
  const readBase128 = () => {
    let value = 0;
    for (let k = 0; k < 5 && i < b.length; k += 1) {
      const byte = b[i];
      i += 1;
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    return value;
  };
  for (let t = 0; t < numTables && i < b.length; t += 1) {
    const flags = b[i];
    i += 1;
    if ((flags & 0x3f) === 0x3f) i += 4; // arbitrary tag
    readBase128(); // origLength
    const tag = flags & 0x3f;
    const transform = (flags >> 6) & 0x03;
    const transformed = tag === 10 || tag === 11 ? transform !== 3 : transform !== 0;
    if (transformed) readBase128(); // transformLength
  }
  if (i >= b.length) return [];
  try {
    const data = brotliDecompressSync(b.subarray(i, i + totalCompressedSize), {
      maxOutputLength: MAX_INFLATED_BYTES,
    });
    return [{ offset: i, data }];
  } catch {
    return [];
  }
}

/**
 * Decompressed or decoded payloads a binary may carry, recognised by signature.
 * @param {Uint8Array} b
 * @returns {Array<{ offset: number, data: Uint8Array }>}
 */
export function compressedPayloads(b) {
  if (ascii(b, 0, "\x89PNG\r\n\x1a\n")) return pngPayloads(b);
  if (ascii(b, 0, "%PDF")) return pdfPayloads(b);
  if (ascii(b, 0, "wOFF")) return woffPayloads(b);
  if (ascii(b, 0, "wOF2")) return woff2Payloads(b);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    try {
      return [{ offset: 0, data: gunzipSync(b, { maxOutputLength: MAX_INFLATED_BYTES }) }];
    } catch {
      return [];
    }
  }
  if (ascii(b, 0, "PK\x03\x04")) return zipPayloads(b);
  // A bare zlib stream (for example a raw deflated resource).
  if (b[0] === 0x78 && zlibHeaders(b, 0, 2).length === 1) {
    const inflated = safeInflate(inflateSync, b);
    return inflated ? [{ offset: 0, data: inflated }] : [];
  }
  return [];
}

/**
 * All printable strings of at least MIN_STRING_LENGTH characters in a binary buffer, including
 * strings inside recognised compressed containers.
 * @param {Uint8Array} buffer
 * @returns {ExtractedString[]}
 */
export function extractStrings(buffer) {
  const out = [];
  const visit = (b, depth, containerOffset) => {
    const compressed = depth > 0;
    for (const run of [...utf8Strings(b), ...utf16Strings(b)]) {
      out.push({ offset: compressed ? containerOffset : run.offset, text: run.text, compressed });
    }
    if (depth >= MAX_DEPTH) return;
    for (const payload of compressedPayloads(b)) {
      visit(payload.data, depth + 1, compressed ? containerOffset : payload.offset);
    }
  };
  visit(buffer, 0, 0);
  return out;
}
