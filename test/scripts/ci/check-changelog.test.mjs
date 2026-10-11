import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EXEMPT_PREFIXES,
  evaluateChangelog,
  isExempt,
  main,
  newVersionSections,
  unreleasedEntries,
} from "../../../scripts/check-changelog.mjs";
import { capture, makeRepo } from "./helpers.mjs";

const BASE = `# Changelog

## [Unreleased]

### Added

- Existing entry.

## [1.0.0] - 2026-10-01

### Added

- First release.
`;

const withEntry = (entry, category = "### Fixed") =>
  BASE.replace("## [1.0.0]", `${category}\n\n- ${entry}\n\n## [1.0.0]`);

describe("isExempt", () => {
  test("exempts docs/ and test/ only", () => {
    assert.deepEqual(EXEMPT_PREFIXES, ["docs/", "test/"]);
    assert.equal(isExempt("docs/rules/WEB-001.md"), true);
    assert.equal(isExempt("test/scripts/x.test.mjs"), true);
    assert.equal(isExempt("scripts/x.mjs"), false);
    assert.equal(isExempt("README.md"), false);
    assert.equal(isExempt("plugins/cross-stack-standard/docs/x.md"), false);
  });
});

describe("unreleasedEntries", () => {
  test("lists items with their category and line", () => {
    const result = unreleasedEntries(withEntry("A fix."));
    assert.equal(result.found, true);
    assert.equal(result.line, 3);
    assert.deepEqual(
      result.entries.map((e) => [e.text, e.category, e.line]),
      [
        ["Existing entry.", "Added", 7],
        ["A fix.", "Fixed", 11],
      ],
    );
  });

  test("reports a missing section", () => {
    assert.equal(unreleasedEntries("# Changelog\n\n## [1.0.0] - 2026-10-01\n").found, false);
  });

  test("normalises whitespace inside an entry", () => {
    const text = "## [Unreleased]\n\n### Added\n\n*   Two   spaces\n";
    assert.equal(unreleasedEntries(text).entries[0].text, "Two spaces");
  });
});

describe("evaluateChangelog", () => {
  test("needs nothing when only docs/ and test/ change", () => {
    const result = evaluateChangelog({
      files: ["docs/a.md", "test/b.test.mjs"],
      baseText: BASE,
      headText: BASE,
    });
    assert.equal(result.needed, false);
    assert.deepEqual(result.findings, []);
  });

  test("fails a code change without a new entry", () => {
    const result = evaluateChangelog({
      files: ["scripts/a.mjs", "docs/a.md"],
      baseText: BASE,
      headText: BASE,
    });
    assert.equal(result.needed, true);
    assert.deepEqual(result.relevant, ["scripts/a.mjs"]);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, "CHANGELOG-NO-ENTRY");
    assert.equal(result.findings[0].line, 3);
    assert.match(
      result.findings[0].message,
      /1 changed file\(s\) outside docs\/ and test\/ \(scripts\/a\.mjs\)/,
    );
  });

  test("lists at most three changed files in the message", () => {
    const files = ["a.mjs", "b.mjs", "c.mjs", "d.mjs"];
    const [finding] = evaluateChangelog({ files, baseText: BASE, headText: BASE }).findings;
    assert.match(finding.message, /\(a\.mjs, b\.mjs, c\.mjs, …\)$/);
  });

  test("passes with a new categorised entry", () => {
    const result = evaluateChangelog({
      files: ["scripts/a.mjs"],
      baseText: BASE,
      headText: withEntry("A fix."),
    });
    assert.deepEqual(result.findings, []);
    assert.deepEqual(
      result.added.map((e) => e.text),
      ["A fix."],
    );
  });

  test("fails a new entry outside a Keep a Changelog category", () => {
    const head = BASE.replace(
      "### Added\n\n- Existing entry.",
      "- Loose entry.\n\n### Added\n\n- Existing entry.",
    );
    const result = evaluateChangelog({ files: ["scripts/a.mjs"], baseText: BASE, headText: head });
    assert.deepEqual(
      result.findings.map((f) => f.id),
      ["CHANGELOG-CATEGORY"],
    );
    const custom = evaluateChangelog({
      files: ["x.mjs"],
      baseText: BASE,
      headText: withEntry("Y.", "### Internal"),
    });
    assert.deepEqual(
      custom.findings.map((f) => f.id),
      ["CHANGELOG-CATEGORY"],
    );
  });

  test("an entry moved from a released section does not count twice", () => {
    const head = BASE.replace("- Existing entry.", "- Existing entry.\n- Existing entry.");
    const result = evaluateChangelog({ files: ["x.mjs"], baseText: BASE, headText: head });
    assert.equal(result.added.length, 1, "the duplicate is one new entry");
    const same = evaluateChangelog({ files: ["x.mjs"], baseText: head, headText: head });
    assert.equal(same.findings[0].id, "CHANGELOG-NO-ENTRY");
  });

  test("a changelog added in this change counts all its entries", () => {
    const result = evaluateChangelog({
      files: ["CHANGELOG.md", "x.mjs"],
      baseText: null,
      headText: BASE,
    });
    assert.deepEqual(result.findings, []);
  });

  test("fails when the changelog or its Unreleased section is missing", () => {
    const missing = evaluateChangelog({ files: ["x.mjs"], baseText: BASE, headText: null });
    assert.deepEqual(
      missing.findings.map((f) => f.id),
      ["CHANGELOG-MISSING"],
    );
    const noSection = evaluateChangelog({
      files: ["x.mjs"],
      baseText: BASE,
      headText: "# Changelog\n",
    });
    assert.deepEqual(
      noSection.findings.map((f) => f.id),
      ["CHANGELOG-NO-UNRELEASED"],
    );
  });
});

/** The changelog as release.md step 2 finalises it: an empty Unreleased and a dated section. */
const RELEASED = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-10-20

### Added

- Existing entry.

## [1.0.0] - 2026-10-01

### Added

- First release.
`;

describe("release, hotfix and back-merge pull requests", () => {
  const files = ["VERSION", "CHANGELOG.md", ".claude-plugin/marketplace.json"];
  test("a release pull request's new dated section counts as its entries", () => {
    const result = evaluateChangelog({
      files,
      baseText: BASE,
      headText: RELEASED,
      headVersion: "1.1.0",
      headRef: "release/v1.1.0",
    });
    assert.deepEqual(result.findings, []);
    assert.equal(result.kind, "release");
    assert.deepEqual(
      result.added.map((entry) => entry.text),
      ["Existing entry."],
    );
  });
  test("the new section must name VERSION and carry a date", () => {
    const mismatch = evaluateChangelog({
      files,
      baseText: BASE,
      headText: RELEASED,
      headVersion: "1.2.0",
    });
    assert.deepEqual(
      mismatch.findings.map((finding) => finding.id),
      ["CHANGELOG-VERSION"],
    );
    const undated = evaluateChangelog({
      files,
      baseText: BASE,
      headText: RELEASED.replace("## [1.1.0] - 2026-10-20", "## [1.1.0]"),
      headVersion: "1.1.0",
    });
    assert.deepEqual(
      undated.findings.map((finding) => finding.id),
      ["CHANGELOG-DATE"],
    );
  });
  test("a hotfix records its fix in the new version section", () => {
    const base = BASE.replace(
      "## [Unreleased]\n\n### Added\n\n- Existing entry.\n\n",
      "## [Unreleased]\n\n",
    );
    const head = base.replace(
      "## [1.0.0]",
      "## [1.0.1] - 2026-10-05\n\n### Fixed\n\n- The gate no longer crashes on empty files.\n\n## [1.0.0]",
    );
    const result = evaluateChangelog({
      files: ["scripts/tool.mjs", "VERSION", "CHANGELOG.md"],
      baseText: base,
      headText: head,
      headVersion: "1.0.1",
      headRef: "hotfix/empty-files",
    });
    assert.deepEqual(result.findings, []);
    assert.deepEqual(
      newVersionSections(base, head).map((section) => section.version),
      ["1.0.1"],
    );
  });
  test("a back-merge from main needs no entry", () => {
    const result = evaluateChangelog({
      files,
      baseText: withEntry("A newer dev entry."),
      headText: RELEASED,
      headRef: "main",
    });
    assert.equal(result.needed, false);
    assert.equal(result.kind, "back-merge");
    assert.deepEqual(result.findings, []);
  });
  test("a release branch without a new section still needs an entry", () => {
    const result = evaluateChangelog({
      files,
      baseText: BASE,
      headText: BASE,
      headVersion: "1.1.0",
      headRef: "release/v1.1.0",
    });
    assert.deepEqual(
      result.findings.map((finding) => finding.id),
      ["CHANGELOG-NO-ENTRY"],
    );
  });
});

describe("command line against a git repository", () => {
  function setup(t) {
    const repo = makeRepo(t);
    repo.write("CHANGELOG.md", BASE);
    repo.write("scripts/tool.mjs", "export {};\n");
    repo.write("docs/guide.md", "# Guide\n");
    const base = repo.commit("chore: base");
    repo.git("switch", "-q", "-c", "feat/x");
    return { ...repo, base };
  }
  const run = (repo, args) => {
    const stdout = capture();
    const stderr = capture();
    const code = main(["--root", repo.dir, ...args], { stdout, stderr });
    return { code, stdout: stdout.text, stderr: stderr.text };
  };

  test("fails a code change without an entry", (t) => {
    const repo = setup(t);
    repo.write("scripts/tool.mjs", "export const x = 1;\n");
    repo.commit("feat: change the tool");
    const result = run(repo, ["--base", repo.base]);
    assert.equal(result.code, 1);
    assert.match(
      result.stdout,
      /^CHANGELOG-NO-ENTRY CHANGELOG\.md:3 no new entry under "## \[Unreleased\]"/m,
    );
    assert.match(result.stdout, /changelog: 1 problem\(s\)/);
  });

  test("passes once an entry is added", (t) => {
    const repo = setup(t);
    repo.write("scripts/tool.mjs", "export const x = 1;\n");
    repo.write("CHANGELOG.md", withEntry("The tool exports x."));
    repo.commit("feat: change the tool");
    const result = run(repo, ["--base", repo.base, "--head", "HEAD"]);
    assert.equal(result.code, 0, result.stdout);
    assert.match(result.stdout, /changelog: 1 new Unreleased entry/);
  });

  test("needs no entry for docs-only changes", (t) => {
    const repo = setup(t);
    repo.write("docs/guide.md", "# Guide\n\nMore.\n");
    repo.write("test/extra.test.mjs", "export {};\n");
    repo.commit("docs: expand the guide");
    const result = run(repo, ["--base", repo.base]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /not needed/);
  });

  test("a file moved out of docs/ needs an entry", (t) => {
    const repo = setup(t);
    repo.git("mv", "docs/guide.md", "guide.md");
    repo.commit("docs: move the guide");
    assert.equal(run(repo, ["--base", repo.base]).code, 1);
  });

  test("compares against the merge base, not the base tip", (t) => {
    const repo = setup(t);
    repo.write("docs/guide.md", "# Guide\n\nBranch edit.\n");
    const head = repo.commit("docs: branch edit");
    repo.git("switch", "-q", "main");
    repo.write("scripts/tool.mjs", "export const onMain = true;\n");
    const mainTip = repo.commit("feat: change on main");
    const result = run(repo, ["--base", mainTip, "--head", head]);
    assert.equal(result.code, 0, "the base branch's own code change is not the pull request's");
  });

  test("passes the release pull request that release.md describes", (t) => {
    const repo = setup(t);
    repo.git("switch", "-q", "-c", "release/v1.1.0");
    repo.write("VERSION", "1.1.0\n");
    repo.write("scripts/tool.mjs", "export const version = '1.1.0';\n");
    repo.write("CHANGELOG.md", RELEASED);
    repo.commit("chore(release): v1.1.0");
    const result = run(repo, ["--base", repo.base, "--head-ref", "release/v1.1.0"]);
    assert.equal(result.code, 0, result.stdout);
    assert.match(result.stdout, /changelog: 1 new release entry/);
    const backMerge = run(repo, ["--base", repo.base, "--head-ref", "main"]);
    assert.equal(backMerge.code, 0);
    assert.match(backMerge.stdout, /not needed \(a back-merge from main\)/);
  });

  test("prints JSON with --json", (t) => {
    const repo = setup(t);
    repo.write("scripts/tool.mjs", "export const x = 2;\n");
    repo.commit("fix: tool");
    const result = run(repo, ["--base", repo.base, "--json"]);
    assert.equal(result.code, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.deepEqual(report.relevantFiles, ["scripts/tool.mjs"]);
    assert.equal(report.findings[0].id, "CHANGELOG-NO-ENTRY");
  });

  test("an unknown ref or a missing --base exits 2", (t) => {
    const repo = setup(t);
    const unknown = run(repo, ["--base", "does-not-exist"]);
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /unknown ref "does-not-exist"; fetch enough history/);
    assert.equal(run(repo, []).code, 2);
    assert.equal(run(repo, ["--bogus"]).code, 2);
  });

  test("--help exits 0", () => {
    const stdout = capture();
    assert.equal(main(["--help"], { stdout, stderr: capture() }), 0);
    assert.match(stdout.text, /Usage:/);
  });
});
