import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  CATEGORIES,
  ChangelogError,
  extractReleaseNotes,
  hasContent,
  main,
  normaliseVersion,
  parseChangelog,
} from "../../../scripts/release-notes.mjs";
import { ROOT, capture, tempDir } from "./helpers.mjs";

const CHANGELOG = `# Changelog

Intro text with a [link][kac].

## [Unreleased]

### Added

- Something new.

## [1.1.0] - 2026-10-20

### Added

- A new opt-in module ([#12]).

### Fixed

- A false positive in WEB-012.

\`\`\`md
## [9.9.9] - 2099-01-01
\`\`\`

## [1.0.0] - 2026-10-01

### Added

- First release.

## [0.9.0]

### Changed

- Undated section.

## [0.8.0] - 2026-01-01

### Added

## [v0.7.0-rc.1] - 2025-12-01

- Release candidate.

[kac]: https://keepachangelog.com/en/1.1.0/
[#12]: https://github.com/o6b7/cross-stack-standard/pull/12
[Unreleased]: https://github.com/o6b7/cross-stack-standard/compare/v1.1.0...dev
[1.1.0]: https://github.com/o6b7/cross-stack-standard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/o6b7/cross-stack-standard/releases/tag/v1.0.0
`;

describe("parseChangelog", () => {
  const { sections, links } = parseChangelog(CHANGELOG);

  test("finds every section, ignoring headings in code fences", () => {
    assert.deepEqual(
      sections.map((s) => [s.title, s.version, s.date, s.unreleased]),
      [
        ["Unreleased", null, null, true],
        ["1.1.0", "1.1.0", "2026-10-20", false],
        ["1.0.0", "1.0.0", "2026-10-01", false],
        ["0.9.0", "0.9.0", null, false],
        ["0.8.0", "0.8.0", "2026-01-01", false],
        ["v0.7.0-rc.1", "0.7.0-rc.1", "2025-12-01", false],
      ],
    );
  });

  test("records heading lines", () => {
    assert.equal(sections[0].line, 5);
    assert.equal(CHANGELOG.split("\n")[sections[1].line - 1], "## [1.1.0] - 2026-10-20");
  });

  test("collects link definitions and keeps them out of the last section", () => {
    assert.equal(
      links.get("1.1.0"),
      "https://github.com/o6b7/cross-stack-standard/compare/v1.0.0...v1.1.0",
    );
    assert.equal(links.get("#12"), "https://github.com/o6b7/cross-stack-standard/pull/12");
    assert.equal(
      links.get("unreleased"),
      "https://github.com/o6b7/cross-stack-standard/compare/v1.1.0...dev",
    );
    assert.ok(!sections.at(-1).lines.some((line) => line.startsWith("[")));
  });

  test("handles Windows line endings", () => {
    const parsed = parseChangelog(CHANGELOG.replace(/\n/g, "\r\n"));
    assert.equal(parsed.sections.length, 6);
    assert.equal(parsed.sections[1].date, "2026-10-20");
  });

  test("hasContent ignores blank lines and headings", () => {
    assert.equal(hasContent(["", "### Added", "  "]), false);
    assert.equal(hasContent(["### Added", "- x"]), true);
  });
});

describe("extractReleaseNotes", () => {
  test("returns the section body with referenced links and the compare link", () => {
    const result = extractReleaseNotes(CHANGELOG, "1.1.0");
    assert.equal(result.date, "2026-10-20");
    assert.equal(
      result.compareUrl,
      "https://github.com/o6b7/cross-stack-standard/compare/v1.0.0...v1.1.0",
    );
    assert.ok(result.notes.startsWith("### Added\n\n- A new opt-in module ([#12]).\n"));
    assert.match(
      result.notes,
      /\n\[#12\]: https:\/\/github\.com\/o6b7\/cross-stack-standard\/pull\/12\n/,
    );
    assert.ok(!result.notes.includes("[kac]:"), "unreferenced links are not carried over");
    assert.ok(!result.notes.includes("## [1.1.0]"), "the heading is not part of the notes");
    assert.ok(result.notes.includes("## [9.9.9] - 2099-01-01"), "fenced content is kept");
    assert.ok(
      result.notes.endsWith(
        "**Full changelog:** https://github.com/o6b7/cross-stack-standard/compare/v1.0.0...v1.1.0\n",
      ),
    );
  });

  test("supports a v-prefixed heading and a pre-release version", () => {
    const result = extractReleaseNotes(CHANGELOG, "0.7.0-rc.1");
    assert.equal(result.notes, "- Release candidate.\n");
    assert.equal(result.compareUrl, null);
  });

  test("fails for a missing, undated or empty section", () => {
    const expectCode = (version, code, line) =>
      assert.throws(
        () => extractReleaseNotes(CHANGELOG, version),
        (error) => {
          assert.ok(error instanceof ChangelogError);
          assert.equal(error.code, code);
          if (line) assert.equal(error.line, line);
          return true;
        },
      );
    expectCode("2.0.0", "CHANGELOG-NO-SECTION");
    expectCode("0.9.0", "CHANGELOG-NO-DATE");
    expectCode("0.8.0", "CHANGELOG-EMPTY");
  });

  test("the missing-section message lists released versions", () => {
    assert.throws(
      () => extractReleaseNotes(CHANGELOG, "2.0.0"),
      /released versions: 1\.1\.0, 1\.0\.0, 0\.9\.0, 0\.8\.0, 0\.7\.0-rc\.1/,
    );
  });
});

describe("normaliseVersion", () => {
  test("accepts tags, refs and bare versions", () => {
    assert.equal(normaliseVersion("v1.2.3"), "1.2.3");
    assert.equal(normaliseVersion("refs/tags/v1.2.3"), "1.2.3");
    assert.equal(normaliseVersion("1.2.3-rc.1"), "1.2.3-rc.1");
  });

  test("rejects anything else", () => {
    for (const value of ["1.2", "v01.2.3", "latest", "cross-stack-standard--v1.2.3", ""]) {
      assert.throws(() => normaliseVersion(value), TypeError, value);
    }
  });
});

describe("command line", () => {
  function withChangelog(t) {
    const dir = tempDir(t);
    writeFileSync(path.join(dir, "CHANGELOG.md"), CHANGELOG);
    return dir;
  }

  test("prints the notes for --tag", (t) => {
    const dir = withChangelog(t);
    const stdout = capture();
    assert.equal(main(["--tag", "v1.0.0", "--root", dir], { stdout, stderr: capture() }), 0);
    assert.equal(
      stdout.text,
      "### Added\n\n- First release.\n\n**Full changelog:** https://github.com/o6b7/cross-stack-standard/releases/tag/v1.0.0\n",
    );
  });

  test("writes the notes with --out", (t) => {
    const dir = withChangelog(t);
    const out = path.join(dir, "notes.md");
    const stdout = capture();
    assert.equal(
      main(["--version", "1.1.0", "--root", dir, "--out", out], { stdout, stderr: capture() }),
      0,
    );
    assert.match(stdout.text, /release notes for 1\.1\.0 \(2026-10-20\) written to/);
    assert.ok(readFileSync(out, "utf8").startsWith("### Added"));
  });

  test("prints JSON with --json", (t) => {
    const dir = withChangelog(t);
    const stdout = capture();
    assert.equal(
      main(["--tag", "refs/tags/v1.1.0", "--root", dir, "--json"], { stdout, stderr: capture() }),
      0,
    );
    const report = JSON.parse(stdout.text);
    assert.equal(report.ok, true);
    assert.equal(report.version, "1.1.0");
    assert.equal(report.date, "2026-10-20");
  });

  test("a missing section exits 1 with a finding line", (t) => {
    const dir = withChangelog(t);
    const stderr = capture();
    assert.equal(main(["--tag", "v0.9.0", "--root", dir], { stdout: capture(), stderr }), 1);
    assert.match(
      stderr.text,
      /^CHANGELOG-NO-DATE CHANGELOG\.md:\d+ section 0\.9\.0 has no release date/m,
    );
    const json = capture();
    assert.equal(
      main(["--tag", "v2.0.0", "--root", dir, "--json"], { stdout: json, stderr: capture() }),
      1,
    );
    assert.equal(JSON.parse(json.text).findings[0].id, "CHANGELOG-NO-SECTION");
  });

  test("usage errors exit 2", (t) => {
    const dir = withChangelog(t);
    const io = { stdout: capture(), stderr: capture() };
    assert.equal(main([], io), 2);
    assert.equal(main(["--tag", "v1.0.0", "--version", "1.0.0"], io), 2);
    assert.equal(main(["--tag", "release-1", "--root", dir], io), 2);
    assert.equal(main(["--tag", "v1.0.0", "--root", path.join(dir, "missing")], io), 2);
    assert.equal(main(["--nope"], io), 2);
    assert.match(io.stderr.text, /cannot read CHANGELOG\.md/);
  });

  test("--help exits 0", () => {
    const stdout = capture();
    assert.equal(main(["--help"], { stdout, stderr: capture() }), 0);
    assert.match(stdout.text, /Usage:/);
  });
});

describe("the repository changelog", () => {
  test("has an Unreleased section whose entries use Keep a Changelog categories", () => {
    const text = readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
    const { sections } = parseChangelog(text);
    const unreleased = sections.find((s) => s.unreleased);
    assert.ok(unreleased, "## [Unreleased] exists");
    assert.equal(sections[0], unreleased, "Unreleased is the first section");
    const categories = unreleased.lines
      .filter((l) => l.startsWith("### "))
      .map((l) => l.slice(4).trim());
    assert.ok(categories.length > 0);
    for (const category of categories) assert.ok(CATEGORIES.includes(category), category);
    for (const section of sections.filter((s) => !s.unreleased)) {
      assert.ok(section.version && section.date, `released section ${section.title} is dated`);
    }
  });
});
