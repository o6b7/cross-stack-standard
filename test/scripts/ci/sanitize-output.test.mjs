import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { main, sanitizeForPublishing } from "../../../scripts/sanitize-output.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(ROOT, "scripts", "sanitize-output.mjs");

describe("sanitizeForPublishing", () => {
  const options = {
    root: "/home/dev/work/cross-stack-standard",
    home: "/home/dev",
    tmp: "/tmp/runner-x",
    env: { RUNNER_TEMP: "/home/runner/work/_temp" },
  };
  it("replaces the root, temporary directories and home, longest first", () => {
    const text = [
      "/home/dev/work/cross-stack-standard/scripts/x.mjs:3 finding",
      "wrote /tmp/runner-x/csf-abc/report.json",
      "cache in /home/dev/.npm/_cacache",
      "report /home/runner/work/_temp/fixture-report.json",
      "scratch /private/tmp/claude-501/session/scratchpad/out.txt",
      "macOS /var/folders/ab/cdef123/T/node-compile-cache",
    ].join("\n");
    assert.equal(
      sanitizeForPublishing(text, options),
      [
        "<root>/scripts/x.mjs:3 finding",
        "wrote <tmp>/csf-abc/report.json",
        "cache in ~/.npm/_cacache",
        "report <tmp>/fixture-report.json",
        "scratch <tmp>/claude-501/session/scratchpad/out.txt",
        "macOS <tmp>/node-compile-cache",
      ].join("\n"),
    );
  });
  it("strips terminal escape sequences and leaves other text alone", () => {
    assert.equal(sanitizeForPublishing("\u001b[32mok\u001b[0m 3 tests", options), "ok 3 tests");
    assert.equal(sanitizeForPublishing("relative/path.md:1", options), "relative/path.md:1");
  });
});

describe("sanitize-output CLI", () => {
  it("reads standard input and writes the sanitised text", () => {
    const home = realpathSync(tmpdir());
    const result = spawnSync(process.execPath, [SCRIPT, "--root", "/repo/root"], {
      input: `/repo/root/a.md and ${join(home, "x")}\n`,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "<root>/a.md and <tmp>/x\n");
  });
  it("reads files, prints help and rejects bad input with exit 2", (t) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "sanitize-")));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, "out.txt"), `${ROOT}/README.md\n`);
    const out = [];
    const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => out.push(s) } };
    assert.equal(main([join(dir, "out.txt")], io), 0);
    assert.equal(out.join(""), "<root>/README.md\n");
    assert.equal(main(["--help"], io), 0);
    assert.equal(main(["--bogus"], io), 2);
    assert.equal(main([join(dir, "missing.txt")], io), 2);
  });
});
