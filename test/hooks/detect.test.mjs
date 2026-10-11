/**
 * The fallback track detection's bounds (lib/detect.mjs): a large flat directory is cut short on
 * its own and the walk goes on, the time cap holds inside one huge directory, and the walk meets
 * its time target on a medium-sized tree without relying on its own time cap to stop.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, test } from "node:test";

import { importPlugin, makeProject } from "./helpers/project.mjs";

const { DETECT_LIMITS, detectTracks } = await importPlugin("scripts/lib/detect.mjs");

const LARAVEL = { require: { "laravel/framework": "^13.0" } };
const NEXT = { dependencies: { next: "16.3.6", react: "19.2.0" } };

/** Writes `count` empty files named `<prefix><n><suffix>` into `dir` (fast: no JSON, no mkdir). */
function fill(dir, count, prefix = "f", suffix = ".svg") {
  fs.mkdirSync(dir, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    fs.writeFileSync(path.join(dir, `${prefix}${index}${suffix}`), "");
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe("a large flat directory", () => {
  test("does not end the walk: the track next to it, one level deeper, is found", (t) => {
    const project = makeProject(t, { "composer.json": LARAVEL, "apps/web/package.json": NEXT });
    // More entries than the old global cap of 20,000, in one shallow directory.
    fill(project.path("assets"), 25_000);
    // The time cap is lifted so that only the entry caps are under test.
    const detection = detectTracks(project.root, { timeMs: Number.POSITIVE_INFINITY });
    t.diagnostic(
      `flat directory: ${detection.durationMs} ms, ${detection.entries} entries, ` +
        `${detection.cappedDirs} directory cut short`,
    );
    assert.deepEqual(detection.tracks, ["laravel", "web"]);
    assert.deepEqual(detection.sources.web, ["apps/web/package.json"]);
    assert.equal(detection.truncated, null);
    assert.equal(detection.cappedDirs, 1);
    assert.ok(
      detection.entries < 25_000 && detection.entries <= DETECT_LIMITS.maxEntriesPerDir + 10,
      `${detection.entries} entries examined`,
    );
  });

  test("the per-directory cap cuts only that directory", (t) => {
    const project = makeProject(t, { "b/c/package.json": NEXT, "a/composer.json": LARAVEL });
    fill(project.path("flat"), 60, "x", ".txt");
    const detection = detectTracks(project.root, { maxEntriesPerDir: 10 });
    assert.deepEqual(detection.tracks, ["laravel", "web"]);
    assert.equal(detection.cappedDirs, 1);
    assert.equal(detection.truncated, null);
  });

  test("the time cap also holds inside one huge directory", (t) => {
    const project = makeProject(t);
    fill(project.root, 3_000);
    // Each look at the clock advances it by 20 ms: the walk must look inside the directory.
    let clock = 0;
    const detection = detectTracks(
      project.root,
      { timeMs: 50, maxEntriesPerDir: 100_000 },
      () => (clock += 20),
    );
    assert.equal(detection.truncated, "time");
    assert.ok(detection.entries < 3_000, `${detection.entries} entries examined`);
  });
});

describe("walk order", () => {
  test("sources are reported breadth-first in sorted order on every file system", (t) => {
    const files = { "package.json": NEXT };
    for (const name of ["b", "a", "c", "a/z", "a/y"]) files[`${name}/package.json`] = NEXT;
    const project = makeProject(t, files);
    assert.deepEqual(detectTracks(project.root).sources.web, [
      "package.json",
      "a/package.json",
      "b/package.json",
      "c/package.json",
      "a/y/package.json",
      "a/z/package.json",
    ]);
  });
});

describe("time target", () => {
  test("the walk's own time cap is below the 200 ms SessionStart target", () => {
    assert.ok(DETECT_LIMITS.timeMs <= 150, `timeMs is ${DETECT_LIMITS.timeMs}`);
  });

  /**
   * The bound for the median of five walks of the medium tree below, with the time cap lifted so
   * that it cannot hide a slow walk. The target is under 200 ms on a developer machine. CI
   * runners (`CI` set) get a separate bound, derived from measurement: on an 8-core macOS
   * machine with Node.js 22 the median was 5–18 ms with the machine idle and at most 48 ms with
   * 16 busy processes competing for the cores. Windows directory reads (NTFS, with on-access
   * scanning) are several times slower than that, so 600 ms, more than ten times the loaded
   * local figure, keeps shared and Windows runners green while a real regression (a walk that
   * stops pruning node_modules, or reads file contents it does not need) still fails. The
   * diagnostic line prints the measured median on every run, so the bound can be re-tuned from
   * CI logs.
   */
  const MEDIAN_BOUND_MS = process.env.CI ? 600 : 200;

  test(`detection in a medium-sized tree: median of 5 under ${MEDIAN_BOUND_MS} ms, no cap reached`, (t) => {
    const files = { "api/composer.json": LARAVEL, "web/package.json": NEXT };
    for (let dir = 0; dir < 60; dir += 1) {
      for (let file = 0; file < 40; file += 1) {
        files[`web/src/feature-${dir}/part/file-${file}.ts`] = "export {};\n";
      }
    }
    const project = makeProject(t, files);
    for (let pkg = 0; pkg < 300; pkg += 1) fill(project.path(`node_modules/pkg-${pkg}`), 10);

    const unbounded = { timeMs: Number.POSITIVE_INFINITY };
    detectTracks(project.root, unbounded);
    const runs = [1, 2, 3, 4, 5].map(() => detectTracks(project.root, unbounded));
    const middle = median(runs.map((run) => run.durationMs));
    t.diagnostic(
      `detection: median of 5 = ${middle} ms over ${runs[0].entries} entries ` +
        `(${process.env.CI ? "CI" : "local"} bound ${MEDIAN_BOUND_MS} ms)`,
    );
    assert.deepEqual(runs[0].tracks, ["laravel", "web"]);
    // node_modules is never entered, and the four levels below the root are all read.
    assert.equal(runs[0].dirs, 124);
    assert.equal(runs[0].entries, 2_526);
    assert.ok(middle < MEDIAN_BOUND_MS, `median detection time ${middle} ms`);

    // The other default caps are not reached on this tree (the time cap is lifted, as above, so
    // that a busy machine cannot make this check flaky; the median above covers time).
    const bounded = detectTracks(project.root, unbounded);
    assert.equal(bounded.truncated, null);
    assert.equal(bounded.cappedDirs, 0);
  });
});
