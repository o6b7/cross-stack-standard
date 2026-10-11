import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_STRING_LENGTH,
  compressedPayloads,
  decodePdfHexString,
  extractStrings,
  isBinary,
  utf16Strings,
  utf8Strings,
} from "../../../scripts/lib/brand/binary.mjs";
import { gzip, noise, pdf, png, woff, woff2, zip } from "./binary-samples.mjs";

const texts = (runs) => runs.map((run) => run.text);

describe("isBinary", () => {
  it("detects a NUL byte in the first 8000 bytes", () => {
    assert.equal(isBinary(Buffer.from("abc\0def")), true);
    assert.equal(isBinary(Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0])])), false);
  });
  it("detects known signatures without a NUL byte", () => {
    assert.equal(isBinary(pdf({ streamText: "x" })), true);
    assert.equal(isBinary(Buffer.from("GIF89a....")), true);
  });
  it("treats invalid UTF-8 as binary and valid UTF-8 (even truncated at the window) as text", () => {
    assert.equal(isBinary(Buffer.from([0x61, 0xff, 0x62])), true);
    assert.equal(isBinary(Buffer.from("plain text \u00E9\u0628", "utf8")), false);
    const cut = Buffer.concat([Buffer.alloc(7999, 0x61), Buffer.from("\u0628", "utf8")]);
    assert.equal(isBinary(cut), false, "a sequence split by the 8000-byte window is not an error");
    assert.equal(isBinary(cut.subarray(0, 8000)), true, "a sequence cut at the end of the data is");
  });
  it("treats an empty buffer as text", () => {
    assert.equal(isBinary(Buffer.alloc(0)), false);
  });
});

describe("utf8Strings", () => {
  it("extracts printable runs of at least four characters with their offsets", () => {
    const buffer = Buffer.concat([
      Buffer.from([0, 1]),
      Buffer.from("abc"),
      Buffer.from([0]),
      Buffer.from("hello \u0628\u062A"),
      Buffer.from([0xff]),
    ]);
    assert.equal(MIN_STRING_LENGTH, 4);
    assert.deepEqual(utf8Strings(buffer), [{ offset: 6, text: "hello \u0628\u062A" }]);
  });
});

describe("utf16Strings", () => {
  it("extracts little- and big-endian runs at either alignment", () => {
    const le = Buffer.concat([Buffer.from([1]), Buffer.from("name1", "utf16le")]);
    const be = Buffer.from("name2", "utf16le").swap16();
    assert.ok(texts(utf16Strings(le)).includes("name1"));
    assert.ok(texts(utf16Strings(be)).includes("name2"));
  });
  it("keeps Arabic UTF-16 text", () => {
    const le = Buffer.from("\u0628\u062A\u062B\u062C", "utf16le");
    assert.ok(texts(utf16Strings(le)).includes("\u0628\u062A\u062B\u062C"));
  });
});

describe("compressedPayloads", () => {
  const inflated = (buffer) =>
    compressedPayloads(buffer).map((p) => Buffer.from(p.data).toString("utf8"));

  it("inflates PNG zTXt chunks", () => {
    assert.deepEqual(inflated(png({ compressedText: "inside ztxt" })), ["inside ztxt"]);
  });
  it("inflates PDF FlateDecode streams", () => {
    assert.ok(inflated(pdf({ streamText: "inside stream" }))[0].includes("inside stream"));
  });
  it("inflates deflated ZIP members", () => {
    assert.deepEqual(inflated(zip("a.txt", "inside zip")), ["inside zip"]);
  });
  it("gunzips gzip data", () => {
    assert.deepEqual(inflated(gzip("inside gzip")), ["inside gzip"]);
  });
  it("inflates WOFF tables and decompresses the WOFF2 stream", () => {
    const woffText = compressedPayloads(woff("Font"))[0].data;
    assert.equal(Buffer.from(woffText).swap16().toString("utf16le"), "Font".repeat(8));
    const woff2Text = compressedPayloads(woff2("Font2"))[0].data;
    assert.equal(Buffer.from(woff2Text).swap16().toString("utf16le"), "Font2");
  });
  it("returns nothing for unrecognised data and survives corrupt streams", () => {
    assert.deepEqual(compressedPayloads(noise(4096)), []);
    const broken = pdf({ streamText: "x" });
    broken.fill(0x78, broken.indexOf("stream\n") + 7, broken.indexOf("stream\n") + 12);
    assert.doesNotThrow(() => compressedPayloads(broken));
  });
});

describe("extractStrings", () => {
  it("returns plain and decompressed strings, marking the decompressed ones", () => {
    const runs = extractStrings(png({ text: "visible author", compressedText: "hidden comment" }));
    const visible = runs.find((run) => run.text.includes("visible author"));
    const hidden = runs.find((run) => run.text.includes("hidden comment"));
    assert.equal(visible.compressed, false);
    assert.equal(hidden.compressed, true);
    assert.ok(hidden.offset > 8, "offset of the compressed chunk in the file");
  });
  it("finds UTF-16BE text in a PDF title", () => {
    const runs = texts(extractStrings(pdf({ title: "Title Text" })));
    assert.ok(runs.some((text) => text.includes("Title Text")));
  });
  it("decodes PDF hex strings, including FEFF-prefixed UTF-16BE metadata", () => {
    const utf16 = Buffer.concat([
      Buffer.from([0xfe, 0xff]),
      Buffer.from("Hex Author", "utf16le").swap16(),
    ]);
    const file = Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj\n<< /Author <", "latin1"),
      Buffer.from(
        utf16
          .toString("hex")
          .toUpperCase()
          .replace(/(.{8})/gu, "$1 "),
        "latin1",
      ),
      Buffer.from("> /Producer <48657820576F726B73> >>\nendobj\n%%EOF\n", "latin1"),
    ]);
    const runs = extractStrings(file);
    const author = runs.find((run) => run.text.includes("Hex Author"));
    assert.ok(author, "the UTF-16BE author is decoded");
    assert.equal(author.compressed, true);
    assert.ok(runs.some((run) => run.text.includes("Hex Works")));
  });
  it("decodes a hex string body like the PDF specification says", () => {
    assert.equal(decodePdfHexString("48 65\n6C6C 6F").toString("latin1"), "Hello");
    assert.equal(decodePdfHexString("414").toString("latin1"), "A@");
  });
  it("stays bounded on noise", () => {
    const runs = extractStrings(noise(64 * 1024));
    assert.ok(runs.every((run) => run.text.length < 200));
  });
});
