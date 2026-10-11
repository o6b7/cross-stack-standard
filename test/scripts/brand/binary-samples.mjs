/**
 * Builders for small, synthetic binary files (PNG, PDF, ZIP, gzip, WOFF, WOFF2) that carry text
 * in their metadata or compressed payloads. Checksums are not computed: the extractor under test
 * does not verify them.
 */
import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from "node:zlib";

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};

/**
 * @param {string} type four-letter chunk type
 * @param {Buffer} data
 */
function pngChunk(type, data) {
  return Buffer.concat([u32(data.length), Buffer.from(type, "latin1"), data, u32(0)]);
}

/**
 * PNG with a tEXt chunk and/or a zTXt (compressed) chunk.
 * @param {{ text?: string, compressedText?: string }} parts
 */
export function png({ text, compressedText }) {
  const chunks = [pngChunk("IHDR", Buffer.alloc(13))];
  if (text !== undefined) {
    chunks.push(
      pngChunk(
        "tEXt",
        Buffer.concat([Buffer.from("Author\0", "latin1"), Buffer.from(text, "latin1")]),
      ),
    );
  }
  if (compressedText !== undefined) {
    chunks.push(
      pngChunk(
        "zTXt",
        Buffer.concat([
          Buffer.from("Comment\0\0", "latin1"),
          deflateSync(Buffer.from(compressedText, "utf8")),
        ]),
      ),
    );
  }
  chunks.push(pngChunk("IDAT", deflateSync(Buffer.alloc(64))));
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

/**
 * PDF with an optional UTF-16BE title and an optional FlateDecode content stream. No NUL byte is
 * added on purpose, so detection relies on the file signature.
 * @param {{ title?: string, streamText?: string }} parts
 */
export function pdf({ title, streamText }) {
  const pieces = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  if (title !== undefined) {
    const utf16be = Buffer.from(title, "utf16le").swap16();
    pieces.push(
      Buffer.from("1 0 obj\n<< /Title (", "latin1"),
      Buffer.from([0xfe, 0xff]),
      utf16be,
      Buffer.from(") >>\nendobj\n", "latin1"),
    );
  }
  if (streamText !== undefined) {
    const body = deflateSync(Buffer.from(`BT /F1 12 Tf (${streamText}) Tj ET`, "latin1"));
    pieces.push(
      Buffer.from(`2 0 obj\n<< /Filter /FlateDecode /Length ${body.length} >>\nstream\n`, "latin1"),
      body,
      Buffer.from("\nendstream\nendobj\n", "latin1"),
    );
  }
  pieces.push(Buffer.from("%%EOF\n", "latin1"));
  return Buffer.concat(pieces);
}

/**
 * ZIP archive with one deflated member.
 * @param {string} name member name
 * @param {string} content member content
 */
export function zip(name, content) {
  const data = deflateRawSync(Buffer.from(content, "utf8"));
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(Buffer.byteLength(content), 22);
  header.writeUInt16LE(Buffer.byteLength(name), 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, Buffer.from(name, "utf8"), data]);
}

/**
 * gzip-compressed text.
 * @param {string} content
 */
export function gzip(content) {
  return gzipSync(Buffer.from(content, "utf8"));
}

/**
 * Minimal WOFF 1.0 font whose single `name` table is zlib-compressed and holds UTF-16BE text.
 * @param {string} nameText
 */
export function woff(nameText) {
  const table = Buffer.from(nameText.repeat(8), "utf16le").swap16();
  const compressed = deflateSync(table);
  const header = Buffer.concat([
    Buffer.from("wOFF", "latin1"),
    u32(0x00010000),
    u32(44 + 20 + compressed.length),
    u16(1),
    u16(0),
    u32(12 + 16 + table.length),
    u16(1),
    u16(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
  ]);
  const entry = Buffer.concat([
    Buffer.from("name", "latin1"),
    u32(44 + 20),
    u32(compressed.length),
    u32(table.length),
    u32(0),
  ]);
  return Buffer.concat([header, entry, compressed]);
}

/**
 * Minimal WOFF 2.0 font: one known-tag `name` table in a Brotli stream.
 * @param {string} nameText
 */
export function woff2(nameText) {
  const table = Buffer.from(nameText, "utf16le").swap16();
  const compressed = brotliCompressSync(table);
  const header = Buffer.alloc(48);
  header.write("wOF2", 0, "latin1");
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt16BE(1, 12);
  header.writeUInt32BE(table.length + 12, 16);
  header.writeUInt32BE(compressed.length, 20);
  // flags: known tag index 5 ("name"), transform version 0 (none); origLength as UIntBase128
  const directory = Buffer.from([5, ...base128(table.length)]);
  const total = Buffer.concat([header, directory, compressed]);
  total.writeUInt32BE(total.length, 8);
  return total;
}

/**
 * @param {number} value
 * @returns {number[]}
 */
function base128(value) {
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}

/**
 * Deterministic pseudo-random bytes (xorshift32).
 * @param {number} length
 * @param {number} [seed]
 */
export function noise(length, seed = 0x9e3779b9) {
  const out = Buffer.alloc(length);
  let x = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}
