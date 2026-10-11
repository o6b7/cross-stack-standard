/**
 * Tests for the `detect` command of the kit's project tool
 * (templates/shared/cross-stack/bin/cross-stack.mjs): the bounded walk that reports every track
 * found in a project's composer.json and package.json files, with the same heuristics as the
 * plugin's SessionStart detector.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  DETECT_LIMITS,
  DETECT_PRUNED_DIRS,
  TRACKS,
  detectReport,
  detectTracks,
  trackFromComposerJson,
  trackFromPackageJson,
} from "../../../plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs";
import { BIN_TEMPLATE, VERSION, runNode, tempDir, write } from "./helpers.mjs";

const SCHEMA_URL = `https://raw.githubusercontent.com/o6b7/cross-stack-standard/v${VERSION}/plugins/cross-stack-standard/data/standard.schema.json`;

const laravelComposer = (block = "require") => ({
  name: "example/api",
  [block]: { php: "^8.3", "laravel/framework": "^13.0" },
});
const nextPackage = () => ({ name: "web", dependencies: { next: "16.3.6", react: "19.2.8" } });
const vitePackage = () => ({ name: "spa", dependencies: { react: "19.3.0" } });
const expoPackage = () => ({
  name: "app",
  dependencies: { expo: "~57.0.25", react: "19.2.3", "react-native": "0.86.3" },
});

/** Creates a scratch project from a map of relative paths to contents. */
function project(t, files = {}) {
  const root = tempDir(t, "cross-stack-detect-");
  for (const [relative, content] of Object.entries(files))
    write(path.join(root, relative), content);
  return root;
}

describe("trackFromPackageJson", () => {
  test("Expo and React Native are mobile, never also web", () => {
    assert.equal(trackFromPackageJson(expoPackage()), "mobile");
    assert.equal(
      trackFromPackageJson({ devDependencies: { "expo-router": "1.0.0", react: "19" } }),
      "mobile",
    );
    assert.equal(
      trackFromPackageJson({ peerDependencies: { "react-native": "0.86.3" } }),
      "mobile",
    );
  });

  test("next or react in any dependency block is web", () => {
    assert.equal(trackFromPackageJson(nextPackage()), "web");
    assert.equal(trackFromPackageJson({ devDependencies: { react: "19" } }), "web");
    assert.equal(trackFromPackageJson({ optionalDependencies: { next: "16" } }), "web");
  });

  test("anything else is no track", () => {
    for (const value of [null, [], "react", {}, { dependencies: { vue: "3" } }, { next: "16" }]) {
      assert.equal(trackFromPackageJson(value), null, JSON.stringify(value));
    }
    assert.equal(trackFromPackageJson({ dependencies: ["react"] }), null);
  });
});

describe("trackFromComposerJson", () => {
  test("laravel/framework in require or require-dev is laravel", () => {
    assert.equal(trackFromComposerJson(laravelComposer()), "laravel");
    assert.equal(trackFromComposerJson(laravelComposer("require-dev")), "laravel");
  });

  test("anything else is no track", () => {
    for (const value of [
      null,
      [],
      {},
      { require: { "laravel/lumen-framework": "^11" } },
      { suggest: { "laravel/framework": "^13" } },
    ]) {
      assert.equal(trackFromComposerJson(value), null, JSON.stringify(value));
    }
  });
});

describe("detectTracks", () => {
  test("reports every track of a monorepo, in schema order", (t) => {
    const root = project(t, {
      "mobile/package.json": expoPackage(),
      "web/package.json": nextPackage(),
      "api/composer.json": laravelComposer(),
      "package.json": { name: "tooling", devDependencies: { lefthook: "2.1.14" } },
    });
    const detection = detectTracks(root);
    assert.deepEqual(detection.tracks, ["laravel", "web", "mobile"]);
    assert.deepEqual(detection.sources, {
      laravel: ["api/composer.json"],
      web: ["web/package.json"],
      mobile: ["mobile/package.json"],
    });
    assert.equal(detection.webProfile, "next");
    assert.equal(detection.truncated, null);
  });

  test("lists every manifest of a track, in walk order", (t) => {
    const root = project(t, {
      "package.json": nextPackage(),
      "apps/admin/package.json": nextPackage(),
      "apps/site/package.json": vitePackage(),
    });
    assert.deepEqual(detectTracks(root).sources.web, [
      "package.json",
      "apps/admin/package.json",
      "apps/site/package.json",
    ]);
  });

  test("a web track without Next.js has the react-spa profile; no web track has none", (t) => {
    assert.equal(
      detectTracks(project(t, { "package.json": vitePackage() })).webProfile,
      "react-spa",
    );
    const mobileOnly = detectTracks(project(t, { "package.json": expoPackage() }));
    assert.deepEqual(mobileOnly.tracks, ["mobile"]);
    assert.equal(mobileOnly.webProfile, null);
  });

  test("an empty project has no tracks", (t) => {
    const detection = detectTracks(project(t));
    assert.deepEqual(detection.tracks, []);
    assert.deepEqual(detection.sources, { laravel: [], web: [], mobile: [] });
  });

  test("skips pruned directories and directories whose name starts with a dot", (t) => {
    const files = {};
    for (const name of DETECT_PRUNED_DIRS) files[`${name}/pkg/package.json`] = nextPackage();
    files[".cross-stack/vendor/eslint-config/package.json"] = nextPackage();
    files[".hidden/composer.json"] = laravelComposer();
    const detection = detectTracks(project(t, files));
    assert.deepEqual(detection.tracks, []);
  });

  test(`goes at most ${DETECT_LIMITS.maxDepth} directory levels deep`, (t) => {
    const deepest = ["a", "b", "c", "d"].join("/");
    const root = project(t, {
      [`${deepest}/package.json`]: nextPackage(),
      [`${deepest}/e/composer.json`]: laravelComposer(),
    });
    const detection = detectTracks(root);
    assert.deepEqual(detection.tracks, ["web"]);
    assert.deepEqual(detection.sources.web, [`${deepest}/package.json`]);
  });

  test("ignores unparseable and oversized manifests", (t) => {
    const root = project(t, {
      "broken/package.json": "{ not json",
      "big/composer.json": laravelComposer(),
    });
    const detection = detectTracks(root, { maxManifestBytes: 20 });
    assert.deepEqual(detection.tracks, []);
    assert.deepEqual(detectTracks(root).tracks, ["laravel"]);
  });

  test("does not follow symbolic links", { skip: process.platform === "win32" }, (t) => {
    const outside = project(t, { "web/package.json": nextPackage() });
    const root = project(t);
    fs.symlinkSync(path.join(outside, "web"), path.join(root, "linked"));
    fs.symlinkSync(path.join(outside, "web", "package.json"), path.join(root, "package.json"));
    assert.deepEqual(detectTracks(root).tracks, []);
  });

  test("stops at the directory, entry and time caps and says why", (t) => {
    const root = project(t, {
      "a/package.json": nextPackage(),
      "b/composer.json": laravelComposer(),
    });
    assert.equal(detectTracks(root, { maxDirs: 1 }).truncated, "dirs");
    assert.equal(detectTracks(root, { maxEntries: 1 }).truncated, "entries");
    let clock = 0;
    const slow = detectTracks(root, { timeMs: 5 }, () => {
      clock += 10;
      return clock;
    });
    assert.equal(slow.truncated, "time");
    assert.deepEqual(slow.tracks, []);
  });

  test("the root may itself be the only manifest directory", (t) => {
    const root = project(t, { "composer.json": laravelComposer("require-dev") });
    assert.deepEqual(detectTracks(root).sources.laravel, ["composer.json"]);
  });
});

describe("detectReport", () => {
  test("adds the tracks the manifest declares, or null", (t) => {
    const root = project(t, {
      "package.json": nextPackage(),
      ".cross-stack/standard.json": {
        $schema: SCHEMA_URL,
        version: VERSION,
        tracks: ["web", "laravel", "unknown"],
      },
    });
    const report = detectReport({ root });
    assert.equal(report.command, "detect");
    assert.equal(report.version, VERSION);
    assert.deepEqual(report.tracks, ["web"]);
    assert.deepEqual(report.manifest, {
      path: ".cross-stack/standard.json",
      tracks: ["laravel", "web"],
    });

    write(path.join(root, ".cross-stack/standard.json"), "{ broken");
    assert.equal(detectReport({ root }).manifest.tracks, null);
    fs.rmSync(path.join(root, ".cross-stack"), { recursive: true });
    assert.equal(detectReport({ root }).manifest.tracks, null);
  });

  test("uses the schema's track order", () => {
    assert.deepEqual(TRACKS, ["laravel", "web", "mobile"]);
  });
});

describe("the detect command", () => {
  /** A project with the tool at .cross-stack/bin/, run from an unrelated directory. */
  function installed(t, files) {
    const root = project(t, files);
    const bin = path.join(root, ".cross-stack/bin/cross-stack.mjs");
    write(bin, fs.readFileSync(BIN_TEMPLATE));
    const elsewhere = tempDir(t, "cross-stack-cwd-");
    return { root, run: (...args) => runNode(bin, args, { cwd: elsewhere }) };
  }

  test("prints the report as JSON and exits 0", (t) => {
    const { run } = installed(t, {
      "api/composer.json": laravelComposer(),
      "web/package.json": nextPackage(),
    });
    const result = run("detect");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.tracks, ["laravel", "web"]);
    assert.equal(report.tool, "cross-stack-standard");
    assert.equal(report.webProfile, "next");
    assert.deepEqual(report.manifest.tracks, null);
  });

  test("exits 0 with no tracks in an empty project", (t) => {
    const result = installed(t).run("detect");
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout).tracks, []);
  });

  test("outside a project it needs --root", (t) => {
    const root = project(t, { "package.json": expoPackage() });
    const bare = runNode(BIN_TEMPLATE, ["detect"]);
    assert.equal(bare.status, 2);
    assert.match(bare.stderr, /pass --root <dir>/);
    const result = runNode(BIN_TEMPLATE, ["detect", "--root", root]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).tracks, ["mobile"]);
  });

  test("usage errors exit 2", (t) => {
    const { run } = installed(t);
    for (const [args, expected] of [
      [["detect", "extra"], /detect: Unexpected argument 'extra'/],
      [["detect", "--bogus"], /detect: Unknown option '--bogus'/],
    ]) {
      const result = run(...args);
      assert.equal(result.status, 2, args.join(" "));
      assert.equal(result.stdout, "");
      assert.match(result.stderr, expected);
    }
  });

  test("is not a check, so list-checks does not list it", (t) => {
    const ids = installed(t)
      .run("list-checks")
      .stdout.trim()
      .split("\n")
      .map((line) => line.split(/\s+/)[0]);
    assert.ok(!ids.includes("detect"));
    assert.ok(!ids.includes("doctor"));
  });
});

describe("kit tool detectTracks: per-directory cap", () => {
  test("a huge flat directory does not stop the walk before a nested track", async () => {
    const { detectTracks } =
      await import("../../../plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs");
    const fsMod = await import("node:fs");
    const osMod = await import("node:os");
    const pathMod = await import("node:path");
    const root = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "kit-detect-"));
    try {
      const flat = pathMod.join(root, "assets");
      fsMod.mkdirSync(flat);
      for (let i = 0; i < 25_000; i += 1) fsMod.writeFileSync(pathMod.join(flat, `f${i}.txt`), "");
      fsMod.mkdirSync(pathMod.join(root, "zz", "web"), { recursive: true });
      fsMod.writeFileSync(
        pathMod.join(root, "zz", "web", "package.json"),
        JSON.stringify({ dependencies: { next: "16.3.6", react: "19.2.8" } }),
      );
      const result = detectTracks(root, { maxEntries: 20_000, timeMs: 30_000 });
      assert.deepEqual(result.tracks, ["web"]);
    } finally {
      fsMod.rmSync(root, { recursive: true, force: true });
    }
  });
});
