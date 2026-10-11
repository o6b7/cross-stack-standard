/**
 * Every command-line script runs when it is invoked through a symbolic link. A script that
 * compares `import.meta.url` with the path it was started from would silently skip `main()`
 * there and exit 0 (fail-open), for example `install-tool --verify` with a wrong checksum.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isEntryPoint } from "../../../scripts/lib/entry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPTS = fs
  .readdirSync(path.join(ROOT, "scripts"))
  .filter((name) => name.endsWith(".mjs"))
  .sort();

describe(
  "command-line scripts run through a symbolic link",
  { skip: process.platform === "win32" && "symbolic links need extra rights on Windows" },
  () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "entry-points-")));
    const link = path.join(dir, "repo-link");
    fs.symlinkSync(ROOT, link, "dir");
    process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));

    for (const name of SCRIPTS) {
      test(`${name} --help prints its usage`, () => {
        const result = spawnSync(process.execPath, [path.join(link, "scripts", name), "--help"], {
          encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Usage:/);
      });
      test(`${name} rejects an unknown option with exit 2`, () => {
        const result = spawnSync(
          process.execPath,
          [path.join(link, "scripts", name), "--no-such-option-at-all"],
          { encoding: "utf8" },
        );
        assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
      });
    }

    test("install-tool --verify fails a wrong checksum through the link", () => {
      const result = spawnSync(
        process.execPath,
        [
          path.join(link, "scripts", "install-tool.mjs"),
          "--verify",
          path.join(ROOT, "package.json"),
          "--sha256",
          "0".repeat(64),
        ],
        { encoding: "utf8" },
      );
      assert.notEqual(result.status, 0, "a mismatch must not exit 0");
    });
  },
);

describe("isEntryPoint", () => {
  test("compares real paths", () => {
    const self = fileURLToPath(import.meta.url);
    assert.equal(isEntryPoint(import.meta.url, self), true);
    assert.equal(isEntryPoint(import.meta.url, path.join(ROOT, "package.json")), false);
    assert.equal(isEntryPoint(import.meta.url, ""), false);
    assert.equal(isEntryPoint(pathToFileURL(path.join(ROOT, "missing.mjs")).href, self), false);
  });
});
