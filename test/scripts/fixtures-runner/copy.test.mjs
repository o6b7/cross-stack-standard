/**
 * Unit tests of scripts/lib/fixtures/copy.mjs: hard-link copies, detach, excludes, symlinks,
 * overlay safety and the copy fallback across devices.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  compileExcludes,
  copyFileFresh,
  copyPath,
  copyTree,
  newCopyStats,
} from "../../../scripts/lib/fixtures/copy.mjs";
import { tempDir } from "./helpers.mjs";

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function makeHost(t) {
  const dir = tempDir(t);
  const src = path.join(dir, "host");
  write(path.join(src, "package.json"), "{}\n");
  write(path.join(src, "node_modules", "a", "index.js"), "a\n");
  write(path.join(src, "node_modules", "a", "lib", "deep.js"), "deep\n");
  write(path.join(src, "node_modules", ".cache", "state.json"), "{}\n");
  write(path.join(src, "vendor", "composer", "autoload_real.php"), "<?php\n");
  write(path.join(src, "vendor", "pkg", "src", "A.php"), "<?php\n");
  write(path.join(src, "debug.log"), "log\n");
  write(path.join(src, "nested", "trace.log"), "log\n");
  return { dir, src, dest: path.join(dir, "work") };
}

const ino = (file) => fs.statSync(file).ino;

describe("copyTree", () => {
  test("hard-links listed directories and copies everything else", (t) => {
    const { src, dest } = makeHost(t);
    const stats = copyTree(src, dest, { hardlink: ["node_modules", "vendor"] });
    assert.deepEqual(stats, { linked: 5, copied: 3, symlinks: 0, fallback: null });
    assert.equal(
      ino(path.join(dest, "node_modules", "a", "lib", "deep.js")),
      ino(path.join(src, "node_modules", "a", "lib", "deep.js")),
    );
    assert.notEqual(ino(path.join(dest, "package.json")), ino(path.join(src, "package.json")));
    assert.ok(fs.statSync(path.join(src, "vendor", "pkg", "src", "A.php")).nlink >= 2);
  });

  test("detach copies paths inside a hard-linked directory", (t) => {
    const { src, dest } = makeHost(t);
    const stats = copyTree(src, dest, { hardlink: ["vendor"], detach: ["vendor/composer"] });
    assert.notEqual(
      ino(path.join(dest, "vendor", "composer", "autoload_real.php")),
      ino(path.join(src, "vendor", "composer", "autoload_real.php")),
    );
    assert.equal(
      ino(path.join(dest, "vendor", "pkg", "src", "A.php")),
      ino(path.join(src, "vendor", "pkg", "src", "A.php")),
    );
    assert.equal(stats.linked, 1);
  });

  test("excludes match names at any depth, or full paths; skip removes exact paths", (t) => {
    const { src, dest } = makeHost(t);
    copyTree(src, dest, { exclude: ["*.log", "node_modules/.cache"], skip: new Set(["vendor"]) });
    assert.ok(!fs.existsSync(path.join(dest, "debug.log")));
    assert.ok(!fs.existsSync(path.join(dest, "nested", "trace.log")));
    assert.ok(fs.existsSync(path.join(dest, "nested")));
    assert.ok(!fs.existsSync(path.join(dest, "node_modules", ".cache")));
    assert.ok(fs.existsSync(path.join(dest, "node_modules", "a", "index.js")));
    assert.ok(!fs.existsSync(path.join(dest, "vendor")));
  });

  test("compileExcludes semantics", () => {
    const match = compileExcludes(["*.log", "a/b.txt", "cache-*"]);
    assert.equal(match("x/y/z.log", "z.log"), true);
    assert.equal(match("a/b.txt", "b.txt"), true);
    assert.equal(match("c/a/b.txt", "b.txt"), false);
    assert.equal(match("cache-1", "cache-1"), true);
    assert.equal(match("logs", "logs"), false);
  });

  test("a missing hard-link source is a clear error", (t) => {
    const { src, dest } = makeHost(t);
    assert.throws(
      () => copyTree(src, dest, { hardlink: ["bower_components"] }),
      /hard-link source "bower_components" is missing .*install the host's dependencies/,
    );
  });

  test("writing over a hard-linked file never changes the host", (t) => {
    const { src, dest } = makeHost(t);
    copyTree(src, dest, { hardlink: ["node_modules"] });
    const overlay = path.join(path.dirname(dest), "overlay");
    write(path.join(overlay, "node_modules", "a", "index.js"), "changed\n");
    copyTree(overlay, dest);
    assert.equal(
      fs.readFileSync(path.join(dest, "node_modules", "a", "index.js"), "utf8"),
      "changed\n",
    );
    assert.equal(fs.readFileSync(path.join(src, "node_modules", "a", "index.js"), "utf8"), "a\n");
    copyFileFresh(
      path.join(src, "package.json"),
      path.join(dest, "node_modules", "a", "lib", "deep.js"),
    );
    assert.equal(
      fs.readFileSync(path.join(src, "node_modules", "a", "lib", "deep.js"), "utf8"),
      "deep\n",
    );
  });

  test("a file replaces a directory and a directory replaces a file", (t) => {
    const dir = tempDir(t);
    write(path.join(dir, "dest", "x", "inner.txt"), "dir\n");
    write(path.join(dir, "dest", "y"), "file\n");
    write(path.join(dir, "src", "x"), "file now\n");
    write(path.join(dir, "src", "y", "inner.txt"), "dir now\n");
    copyTree(path.join(dir, "src"), path.join(dir, "dest"));
    assert.equal(fs.readFileSync(path.join(dir, "dest", "x"), "utf8"), "file now\n");
    assert.equal(fs.readFileSync(path.join(dir, "dest", "y", "inner.txt"), "utf8"), "dir now\n");
  });

  test(
    "symbolic links are recreated, not followed",
    { skip: process.platform === "win32" },
    (t) => {
      const { src, dest } = makeHost(t);
      fs.mkdirSync(path.join(src, "node_modules", ".bin"));
      fs.symlinkSync("../a/index.js", path.join(src, "node_modules", ".bin", "a"));
      const stats = copyTree(src, dest, { hardlink: ["node_modules"] });
      assert.equal(stats.symlinks, 1);
      const link = path.join(dest, "node_modules", ".bin", "a");
      assert.equal(fs.readlinkSync(link), "../a/index.js");
      assert.equal(fs.readFileSync(link, "utf8"), "a\n");
    },
  );

  test("falls back to copies when linking crosses devices (EXDEV)", (t) => {
    const { src, dest } = makeHost(t);
    let calls = 0;
    const link = () => {
      calls += 1;
      throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" });
    };
    const stats = copyTree(src, dest, { hardlink: ["node_modules", "vendor"], link });
    assert.equal(calls, 1, "linking is not retried after EXDEV");
    assert.deepEqual(stats, { linked: 0, copied: 8, symlinks: 0, fallback: "EXDEV" });
    assert.notEqual(
      ino(path.join(dest, "node_modules", "a", "index.js")),
      ino(path.join(src, "node_modules", "a", "index.js")),
    );
    assert.equal(
      fs.readFileSync(path.join(dest, "vendor", "pkg", "src", "A.php"), "utf8"),
      "<?php\n",
    );
  });

  test("EMLINK falls back for one file and keeps linking the rest", (t) => {
    const { src, dest } = makeHost(t);
    let calls = 0;
    const link = (from, to) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("too many links"), { code: "EMLINK" });
      fs.linkSync(from, to);
    };
    const stats = copyTree(src, dest, { hardlink: ["node_modules"], link });
    assert.equal(stats.fallback, "EMLINK");
    assert.equal(stats.linked, 2);
    assert.equal(stats.copied, 6);
  });

  test("other link errors are not swallowed", (t) => {
    const { src, dest } = makeHost(t);
    const link = () => {
      throw Object.assign(new Error("no space"), { code: "ENOSPC" });
    };
    assert.throws(() => copyTree(src, dest, { hardlink: ["node_modules"], link }), /no space/);
  });

  test("a real cross-device copy falls back to copies", (t) => {
    const candidates = ["/dev/shm", "/run/user"].filter((dir) => {
      try {
        fs.accessSync(dir, fs.constants.W_OK);
        return fs.statSync(dir).dev !== fs.statSync(os.tmpdir()).dev;
      } catch {
        return false;
      }
    });
    if (candidates.length === 0) {
      t.skip("no writable directory on another device");
      return;
    }
    const { src } = makeHost(t);
    const other = fs.mkdtempSync(path.join(candidates[0], "csf-xdev-"));
    t.after(() => fs.rmSync(other, { recursive: true, force: true }));
    const stats = copyTree(src, path.join(other, "work"), { hardlink: ["node_modules"] });
    assert.equal(stats.fallback, "EXDEV");
    assert.equal(stats.linked, 0);
    assert.equal(
      fs.readFileSync(path.join(other, "work", "node_modules", "a", "index.js"), "utf8"),
      "a\n",
    );
  });
});

describe("copyPath", () => {
  test("copies a file or a directory to a new name", (t) => {
    const { src, dir } = makeHost(t);
    const stats = newCopyStats();
    copyPath(path.join(src, "package.json"), path.join(dir, "out", "renamed.json"), stats);
    copyPath(path.join(src, "vendor"), path.join(dir, "out", "vendor-copy"), stats);
    assert.equal(fs.readFileSync(path.join(dir, "out", "renamed.json"), "utf8"), "{}\n");
    assert.ok(fs.existsSync(path.join(dir, "out", "vendor-copy", "pkg", "src", "A.php")));
    assert.equal(stats.copied, 3);
  });
});
