import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  NARRATIVE_RULES,
  lintText,
  maskLineMarkers,
  parseEscape,
} from "../../../scripts/check-narrative.mjs";
import { ROOT, commitAll, git, initRepo, runScript, tempDir, writeFiles } from "./helpers.mjs";

// The flagged notations are assembled at run time so this file passes the lint it tests.
const RESEARCH_KEY = ["cc", "M1"].join(":");
const RESEARCH_KEY_2 = ["wf", "R3"].join(":");
const DECISION = ["D10", "19"].join(".");
const LEGACY_ID = ["L", "SEC-016"].join(":");
const AUDIT_ID = ["B", "F3"].join("-");
const SESSION = ["Session", "B"].join(" ");
const MANDATE = ["owner", "mandate"].join(" ");
const REFERENCE_APP = ["the", "reference", "app"].join(" ");
const REFERENCE_IMPL = ["the", "reference", "implementation"].join(" ");
const ESCAPE = ["narrative", "ok:"].join("-");
const FKEY_SIX = ["F", "6"].join("");
const FKEY_SEVEN = ["F", "7"].join("");
const D = (major, minor) => [`D${major}`, minor].join(".");

const SCRIPT = "scripts/check-narrative.mjs";
const rules = (text) => lintText(text).map((finding) => finding.rule);
const errors = (text) =>
  lintText(text)
    .filter((finding) => finding.severity === "error")
    .map((finding) => finding.rule);
const severityOf = (rule) => NARRATIVE_RULES.find((r) => r.id === rule).severity;

describe("lintText: flagged notation", () => {
  const cases = [
    ["research-key", `see ${RESEARCH_KEY} for details`],
    ["research-key", `(${RESEARCH_KEY_2})`],
    ["decision-marker", `as decided in ${DECISION}`],
    ["decision-marker", `the cookie dies first (${D(2, 2)}).`],
    ["decision-marker", `server-driven per ${D(3, 12)}; build it`],
    ["decision-marker", `drifted (decision ${D(4, 23)}).`],
    ["decision-marker", `is forgotten \u2014 ${D(2, 5)})`],
    ["decision-marker", `the vocabulary is ${D(1, 2)}; the coverage`],
    ["legacy-rule-id", `was ${LEGACY_ID} before`],
    ["audit-marker", `fixes ${AUDIT_ID}`],
    ["audit-marker", `the audit ${FKEY_SIX} note`],
    ["audit-marker", `audit FAIL ${FKEY_SIX}/${FKEY_SEVEN} on the last run`],
    ["audit-marker", `FAIL ${FKEY_SEVEN} in the last run`],
    ["session-label", `agreed in ${SESSION}`],
    ["session-label", `${SESSION}/C notes`],
    ["mandate-narrative", `per the ${MANDATE}`],
    ["mandate-narrative", `the ${["Owner", "Mandate"].join("-")} says`],
    ["private-reference", `${REFERENCE_APP} paginates on the client`],
    ["private-reference", `${REFERENCE_IMPL}, which we copied`],
    ["private-reference", `${REFERENCE_IMPL}'s router`],
    ["private-reference", `${["the", "reference", "client"].join(" ")} does this`],
  ];
  for (const [rule, text] of cases) {
    it(`flags ${rule}: ${JSON.stringify(text.replace(/[A-Za-z]/gu, "x"))}`, () => {
      assert.deepEqual(rules(text), [rule]);
      assert.equal(lintText(text)[0].severity, severityOf(rule));
    });
  }
  it("flags each marker of a slash-separated citation", () => {
    assert.deepEqual(rules(`the forgotten check (${D(4, 5)}/${D(2, 9)})`), [
      "decision-marker",
      "decision-marker",
    ]);
  });
  it("treats internal notation as errors and generic narrative phrases as warnings", () => {
    const severity = Object.fromEntries(NARRATIVE_RULES.map((rule) => [rule.id, rule.severity]));
    assert.deepEqual(severity, {
      "research-key": "error",
      "decision-marker": "error",
      "legacy-rule-id": "error",
      "audit-marker": "error",
      "session-label": "warning",
      "mandate-narrative": "warning",
      "private-reference": "warning",
    });
  });
});

describe("lintText: ordinary technical English is never an error", () => {
  const sentences = [
    "## Session\n\nA session cookie is issued after login; the middleware reads it.",
    "Open Chrome DevTools (F12) and run a Lighthouse audit on the page.",
    "Our findings: the classifier reaches an F1 score of 0.91 on the held-out set.",
    "SonarQube reports php:S100 and js:S117 as naming findings.",
    "Store the key in the Laravel Session\nA common defect is keeping it in a cookie.",
    "| Driver | Session |\n| ------ | ------- |\n| file   | Session B-tree index |",
    "Press F5 to reload, then check the audit log.",
    "Use a D3.js chart; the D1.2 migration guide explains it. Cloudflare D1.1 release.",
    "Tailwind: sm:P1 or IPv6 addr fe:A1 or colour hex ab:CD12",
  ];
  for (const text of sentences) {
    it(`passes ${JSON.stringify(text.slice(0, 48))}`, () => {
      assert.deepEqual(lintText(text), []);
    });
  }
  it("only warns on generic uses of 'the reference' implementation or client", () => {
    for (const text of [
      `Ajv is ${REFERENCE_IMPL} used by the JSON Schema test suite.`,
      `${["The", "reference", "client"].join(" ")} in the OpenAPI Generator project handles it.`,
    ]) {
      assert.deepEqual(errors(text), []);
      assert.deepEqual(rules(text), ["private-reference"]);
    }
  });
});

describe("lintText: ordinary text passes", () => {
  const negatives = [
    "A reference implementation of RFC 9457 problem details.",
    `${REFERENCE_IMPL} of RFC 9457 is linked below.`,
    `${REFERENCE_IMPL}\n * of the spec is linked below.`,
    "Use H1 headings once; H22 is not a heading level.",
    "Upgrade to v1.2.3 or 1.2.3-rc.1 (semver).",
    "Charts use D3.js; the D3 scale is linear.",
    "Press F5 to reload; F6 moves focus.",
    "the session A token expires; Sessions API; a Session object",
    "Rules SEC-016 and WEB-018 apply; PHP 8.4 and ES2022.",
    "cc:m1 lowercase, C:\\Users\\me, sha256:ABC123, https://example.com:8080/x",
    "U+0627 is alef; the owner of the mandate file is CODEOWNERS.",
    "the reference manual, the reference docs, see reference app templates",
  ];
  for (const text of negatives) {
    it(`passes ${JSON.stringify(text.slice(0, 40))}`, () => {
      assert.deepEqual(lintText(text), []);
    });
  }
});

describe("lintText: positions, wrapping and escapes", () => {
  it("reports line and column", () => {
    assert.deepEqual(lintText(`first\n  second ${DECISION}`), [
      {
        line: 2,
        column: 10,
        rule: "decision-marker",
        severity: "error",
        message: NARRATIVE_RULES.find((r) => r.id === "decision-marker").message,
      },
    ]);
  });
  it("matches phrases wrapped across lines with comment markers", () => {
    const wrapped = [
      `/**\n * written by ${MANDATE.split(" ")[0]}\n * ${MANDATE.split(" ")[1]}\n */`,
      `// see ${REFERENCE_APP.split(" ").slice(0, 2).join(" ")}\n// app for details`,
      `# ${REFERENCE_IMPL.split(" ").slice(0, 2).join(" ")}\r\n# implementation`,
      `> audit\n> ${FKEY_SIX} note`,
    ];
    for (const text of wrapped) assert.equal(lintText(text).length, 1, JSON.stringify(text));
  });
  it("matches a session label on its own line only", () => {
    assert.deepEqual(rules(`> ${SESSION.split(" ")[0]}\n> ${SESSION.split(" ")[1]} agreed`), []);
    assert.deepEqual(rules(`> ${SESSION} agreed`), ["session-label"]);
  });
  it("masks leading markers without moving offsets", () => {
    const text = "  // a\n * b\n> > c\n<!-- d";
    const masked = maskLineMarkers(text);
    assert.equal(masked.length, text.length);
    assert.equal(masked, "     a\n   b\n    c\n     d");
  });
  it("suppresses a finding on a line with a reasoned escape", () => {
    assert.deepEqual(lintText(`${DECISION} // ${ESCAPE} quoting a published changelog`), []);
    assert.deepEqual(lintText(`<!-- ${ESCAPE} glossary entry --> ${MANDATE}`), []);
  });
  it("suppresses a wrapped finding when any of its lines carries the escape", () => {
    assert.deepEqual(
      lintText(`per ${MANDATE.split(" ")[0]}\n${MANDATE.split(" ")[1]} # ${ESCAPE} test data`),
      [],
    );
  });
  it("requires a reason and does not suppress without one", () => {
    const findings = rules(`${DECISION} ${ESCAPE}`);
    assert.deepEqual(findings.sort(), ["decision-marker", "escape-without-reason"]);
    assert.deepEqual(rules(`${DECISION} /* ${ESCAPE} */`).sort(), [
      "decision-marker",
      "escape-without-reason",
    ]);
  });
  it("parses escapes", () => {
    assert.equal(parseEscape("plain line"), null);
    assert.deepEqual(parseEscape(`x ${ESCAPE} because`), { valid: true, column: 3 });
    assert.deepEqual(parseEscape(`x ${ESCAPE} -->`), { valid: false, column: 3 });
  });
  it("uses the audit context only on the same line", () => {
    assert.deepEqual(rules("audit notes\nF6 moves focus"), []);
  });
});

describe("lintText: this repository's brand and narrative tooling passes its own lint", () => {
  const files = [
    ...[
      "check-narrative.mjs",
      "check-brand-leak.mjs",
      "check-pr.mjs",
      "build-denylist.mjs",
      "check-denylist-shrink.mjs",
    ].map((name) => join(ROOT, "scripts", name)),
    ...readdirSync(join(ROOT, "scripts", "lib", "brand")).map((name) =>
      join(ROOT, "scripts", "lib", "brand", name),
    ),
    ...readdirSync(join(ROOT, "test", "scripts", "brand"))
      .filter((name) => name.endsWith(".mjs"))
      .map((name) => join(ROOT, "test", "scripts", "brand", name)),
  ];
  for (const file of files) {
    it(file.slice(ROOT.length + 1).replaceAll("\\", "/"), () => {
      assert.deepEqual(lintText(readFileSync(file, "utf8")), []);
    });
  }
});

describe("check-narrative CLI", () => {
  /** @param {import("node:test").TestContext} t */
  function setup(t) {
    const root = tempDir(t);
    const run = (args, options = {}) =>
      runScript(SCRIPT, ["--root", root, ...args], { cwd: root, ...options });
    return { root, run };
  }
  const lines = (stdout) => stdout.split("\n").filter((line) => line.startsWith("NARRATIVE "));

  it("--tree walks text files, skips binaries and private directories, and reports locations", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, {
      "docs/a.md": `# Title\n\nDecided in ${DECISION}.\n`,
      "docs/b.md": "clean\n",
      "img.bin": Buffer.concat([Buffer.from([0]), Buffer.from(DECISION)]),
      "_work/notes.md": DECISION,
      "node_modules/x/y.md": DECISION,
    });
    const result = run(["--tree"]);
    assert.equal(result.status, 1);
    assert.deepEqual(lines(result.stdout), [
      `NARRATIVE docs/a.md:3 decision-marker (column 12): ${NARRATIVE_RULES[1].message}`,
    ]);
    assert.match(
      result.stdout,
      /check-narrative: 1 finding \[tree\] scanned 2 text files \(1 binary skipped\)/u,
    );
  });
  it("--tree passes a clean tree and --json reports structure", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, { "a.md": "A reference implementation of RFC 9457.\n" });
    assert.equal(run(["--tree"]).status, 0);
    writeFiles(root, { "b.md": `x ${LEGACY_ID}\n` });
    const report = JSON.parse(run(["--json"]).stdout);
    assert.equal(report.ok, false);
    assert.deepEqual(
      report.findings.map((f) => [f.path, f.line, f.rule]),
      [["b.md", 1, "legacy-rule-id"]],
    );
  });
  it("--paths lints the given files", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, { "a.md": LEGACY_ID, "b.md": "clean" });
    assert.equal(run(["--paths", "b.md"]).status, 0);
    assert.equal(run(["--paths", "a.md", "b.md"]).status, 1);
  });
  it("reports warnings without failing, unless --strict", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, { "a.md": `agreed in ${SESSION}\n` });
    const relaxed = run(["--paths", "a.md"]);
    assert.equal(relaxed.status, 0);
    assert.match(lines(relaxed.stdout)[0], /^NARRATIVE a\.md:1 warning: session-label/u);
    assert.match(relaxed.stdout, /check-narrative: 0 errors, 1 warning \[paths\]/u);
    const strict = run(["--paths", "a.md", "--strict"]);
    assert.equal(strict.status, 1);
    assert.match(strict.stdout, /1 warning \(strict\)/u);
    const report = JSON.parse(run(["--paths", "a.md", "--json"]).stdout);
    assert.equal(report.ok, true);
    assert.deepEqual([report.summary.errors, report.summary.warnings], [0, 1]);
  });
  it("--stdin lints standard input with a label", (t) => {
    const { run } = setup(t);
    assert.equal(run(["--stdin"], { input: "feat: add a gate\n" }).status, 0);
    const result = run(["--stdin", "--label", "pull request"], {
      input: `title\n\n${RESEARCH_KEY}\n`,
    });
    assert.equal(result.status, 1);
    assert.match(lines(result.stdout)[0], /^NARRATIVE pull request:3 research-key \(column 1\)/u);
  });
  it("--commit-msg lints comment lines too, but not the scissors section", (t) => {
    const { root, run } = setup(t);
    writeFiles(root, {
      "msg.txt": `feat: x\n\n# ------------------------ >8 ------------------------\n${DECISION}\n`,
      "bad.txt": `feat: x\n\n${AUDIT_ID}\n`,
      "hash.txt": `feat: x\n\n# ${DECISION} kept by git with -m\n`,
    });
    assert.equal(run(["--commit-msg", "msg.txt"]).status, 0);
    assert.equal(run(["--commit-msg", "bad.txt"]).status, 1);
    assert.equal(run(["--commit-msg", "hash.txt"]).status, 1);
    assert.equal(run(["--commit-msg", "missing.txt"]).status, 2);
  });
  it("--staged and --commits read from git", (t) => {
    const { root, run } = setup(t);
    initRepo(root);
    writeFiles(root, { "a.md": "clean" });
    const base = commitAll(root, "chore: init");
    writeFiles(root, { "a.md": `was ${LEGACY_ID}\n` });
    git(root, ["add", "a.md"]);
    const staged = run(["--staged"]);
    assert.equal(staged.status, 1);
    assert.match(lines(staged.stdout)[0], /^NARRATIVE a\.md:1 legacy-rule-id/u);
    commitAll(root, `docs: update\n\nFollows ${DECISION}.`);
    const commits = run(["--commits", `${base}..HEAD`]);
    assert.equal(commits.status, 1);
    assert.match(lines(commits.stdout)[0], /^NARRATIVE commit:[0-9a-f]{12}:3 decision-marker/u);
    assert.equal(run(["--commits", `${base}..${base}`]).status, 0);
  });
  it("rejects bad usage with exit 2 and prints help", (t) => {
    const { run } = setup(t);
    assert.equal(run(["--tree", "--stdin"]).status, 2);
    assert.equal(run(["--paths"]).status, 2);
    assert.equal(run(["--tree", "x"]).status, 2);
    assert.equal(run(["--nope"]).status, 2);
    const help = run(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: node scripts\/check-narrative\.mjs/u);
  });
});
