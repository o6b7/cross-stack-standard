/**
 * Tests for the kit's project tool, templates/shared/cross-stack/bin/cross-stack.mjs: the single
 * dependency-free file adopt copies to .cross-stack/bin/. Most tests run it as adopters do, from
 * a copy inside a scratch project.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  COMMANDS,
  compareVersions,
  main,
  parseJsonWithLines,
} from "../../../plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs";
import { BIN_TEMPLATE, VERSION, runNode, tempDir, write } from "./helpers.mjs";

const SCHEMA_URL = `https://raw.githubusercontent.com/o6b7/cross-stack-standard/v${VERSION}/plugins/cross-stack-standard/data/standard.schema.json`;

/**
 * Creates a scratch project with the tool at .cross-stack/bin/cross-stack.mjs and the given files.
 *
 * @returns {{ root: string, run: (...args: string[]) => ReturnType<typeof runNode> }}
 */
function project(t, files = {}) {
  const root = tempDir(t, "cross-stack-project-");
  const bin = path.join(root, ".cross-stack/bin/cross-stack.mjs");
  write(bin, fs.readFileSync(BIN_TEMPLATE));
  for (const [relative, content] of Object.entries(files))
    write(path.join(root, relative), content);
  // Run from an unrelated directory: the tool must find the project from its own location.
  const elsewhere = tempDir(t, "cross-stack-cwd-");
  return { root, run: (...args) => runNode(bin, args, { cwd: elsewhere }) };
}

const manifest = (extra = {}) => ({
  $schema: SCHEMA_URL,
  version: VERSION,
  tracks: ["laravel"],
  ...extra,
});

const allowlist = (rule, entries) => ({ rule, entries });
const entry = (extra = {}) => ({
  match: "src/legacy.ts",
  reason: "Pending rewrite.",
  expires: "2026-12-31",
  owner: "@o6b7",
  ...extra,
});

describe("the file", () => {
  const text = fs.readFileSync(BIN_TEMPLATE, "utf8");

  test("starts with the version header", () => {
    assert.equal(text.split("\n")[0], `// cross-stack-standard v${VERSION}`);
  });

  test("imports Node.js built-ins only", () => {
    const specifiers = [...text.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm)].map(
      (match) => match[1],
    );
    assert.ok(specifiers.length > 0);
    for (const specifier of specifiers) assert.match(specifier, /^node:/);
    assert.doesNotMatch(text, /\bimport\(|\brequire\(/, "no dynamic imports or require");
  });

  test("makes no network calls", () => {
    assert.doesNotMatch(text, /node:(?:http|https|net|dgram|tls|dns)\b|\bfetch\(/);
  });

  test("--version prints the kit version", (t) => {
    const { run } = project(t);
    assert.deepEqual(run("--version"), { status: 0, stdout: `${VERSION}\n`, stderr: "" });
  });
});

describe("project root", () => {
  test("is found from the tool's location", (t) => {
    const { run } = project(t, { ".cross-stack/standard.json": manifest() });
    const result = run("check-standard-config");
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  test("outside .cross-stack/bin/ the tool needs --root", (t) => {
    const result = runNode(BIN_TEMPLATE, ["check-standard-config"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /not inside <project>\/\.cross-stack\/bin\/; pass --root <dir>/);

    const { root } = project(t, { ".cross-stack/standard.json": manifest() });
    assert.equal(runNode(BIN_TEMPLATE, ["check-standard-config", "--root", root]).status, 0);
  });

  test("--root must be an existing directory", (t) => {
    const { root, run } = project(t);
    const missing = run("check-standard-config", "--root", path.join(root, "nope"));
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /does not exist/);
    const file = run(
      "check-allowlists",
      "--root",
      path.join(root, ".cross-stack/bin/cross-stack.mjs"),
    );
    assert.equal(file.status, 2);
    assert.match(file.stderr, /is not a directory/);
  });
});

describe("check-standard-config", () => {
  test("a valid manifest passes", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({
        tracks: ["laravel", "web"],
        profile: "next",
        tier: 2,
        modules: { "api-contract": true, "bff-auth": true, i18n: true },
        locales: ["en", "ar"],
        hooks: { stop: { budgetSeconds: 60 }, preToolUse: { protect: ["config/*.php"] } },
      }),
    });
    assert.deepEqual(run("check-standard-config"), {
      status: 0,
      stdout: "check-standard-config: .cross-stack/standard.json is valid\n",
      stderr: "",
    });
  });

  test("a missing manifest fails and says how to create it", (t) => {
    const { run } = project(t);
    const result = run("check-standard-config");
    assert.equal(result.status, 1);
    assert.equal(
      result.stdout,
      "check-standard-config .cross-stack/standard.json:1 manifest not found; run /cross-stack-standard:adopt to create it\n" +
        "check-standard-config: .cross-stack/standard.json is missing\n",
    );
  });

  test("invalid JSON fails at the line of the error", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json":
        '{\n  "version": "0.0.0",\n  "tracks": ["web"]\n  "tier": 1\n}\n',
    });
    const result = run("check-standard-config");
    assert.equal(result.status, 1);
    assert.match(
      result.stdout.split("\n")[0],
      /^check-standard-config \.cross-stack\/standard\.json:4 invalid JSON: Expected ',' or '}' after property value$/,
    );
  });

  test("a byte-order mark is accepted", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": `\uFEFF${JSON.stringify(manifest())}`,
    });
    assert.equal(run("check-standard-config").status, 0);
  });

  test("reports every problem with its line", (t) => {
    const text = [
      "{",
      `  "version": "${VERSION}",`,
      '  "tracks": ["mobile", "mobile"],',
      '  "profile": "next",',
      '  "tier": 3,',
      '  "modules": { "bff-auth": true, "i18n": { "enabled": "yes" }, "cms": true },',
      '  "locales": ["iw", "EN"],',
      '  "hooks": { "stop": { "command": "npm run x; rm -rf /" }, "preToolUse": { "protectCommands": ["(open"] } },',
      '  "tier": 2',
      "}",
      "",
    ].join("\n");
    const { run } = project(t, { ".cross-stack/standard.json": text });
    const result = run("check-standard-config");
    assert.equal(result.status, 1);
    const id = "check-standard-config .cross-stack/standard.json";
    assert.deepEqual(result.stdout.split("\n"), [
      `${id}:3 /tracks: must not repeat "mobile" (items 0 and 1)`,
      `${id}:3 /tracks: must include "web" ("profile" applies only when "tracks" includes "web".)`,
      `${id}:3 /tracks: must include "web" (The bff-auth module needs the web track with the next profile.)`,
      `${id}:6 /modules/i18n/enabled: must be a boolean`,
      `${id}:6 /modules: unknown property "cms"`,
      `${id}:7 /locales/1: "EN" is not valid: A BCP 47 language tag in canonical form, such as en, ar or zh-Hant-TW.`,
      `${id}:7 /locales/0: "iw" is not canonical; use "he"`,
      `${id}:8 /hooks/stop/command: "npm run x; rm -rf /" is not valid: The name of the composer and/or npm script the fast gate runs: a script name, not a shell command.`,
      `${id}:8 /hooks/preToolUse/protectCommands/0: is not a valid regular expression: Invalid regular expression: /(open/u: Unterminated group`,
      `${id}:9 /tier: duplicate key; JSON keeps only the last value`,
      "check-standard-config: 10 problems in .cross-stack/standard.json",
      "",
    ]);
  });

  test("$schema must be the URL of the recorded version", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({
        $schema: SCHEMA_URL.replace(`/v${VERSION}/`, "/v0.0.1-old/"),
      }),
    });
    const result = run("check-standard-config");
    assert.equal(result.status, 1);
    assert.match(
      result.stdout.split("\n")[0],
      new RegExp(`:2 /\\$schema: points at the v0\\.0\\.1-old schema but "version" is ${VERSION}$`),
    );
  });

  test("a manifest older than the tool passes; a newer one fails", (t) => {
    const older = project(t, {
      ".cross-stack/standard.json": manifest({ $schema: undefined, version: "0.0.0-fixture.1" }),
    });
    assert.equal(older.run("check-standard-config").status, 0);

    const newer = "99.0.0";
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({ $schema: undefined, version: newer }),
    });
    const result = run("check-standard-config");
    assert.equal(result.status, 1);
    assert.match(
      result.stdout.split("\n")[0],
      new RegExp(
        `:2 /version: the manifest records version ${newer}, newer than this tool \\(${VERSION}\\); run /cross-stack-standard:upgrade`,
      ),
    );
  });

  test("a field that fails the schema is not checked again", (t) => {
    const { run } = project(t, { ".cross-stack/standard.json": manifest({ version: "1.0" }) });
    const result = run("check-standard-config");
    assert.equal(result.status, 1);
    assert.equal(result.stdout.split("\n").filter((line) => line.includes("/version")).length, 1);
  });

  test("a directory where the manifest should be is reported", (t) => {
    const { root, run } = project(t);
    fs.mkdirSync(path.join(root, ".cross-stack/standard.json"));
    const result = run("check-standard-config");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /standard\.json:1 is a directory, not a file/);
  });

  test("--json prints a report", (t) => {
    const { run } = project(t, { ".cross-stack/standard.json": manifest({ tier: 5 }) });
    const result = run("check-standard-config", "--json");
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      tool: "cross-stack-standard",
      version: VERSION,
      check: "check-standard-config",
      ok: false,
      findings: [
        {
          id: "check-standard-config",
          path: ".cross-stack/standard.json",
          line: 7,
          message: "/tier: must be one of 1, 2",
        },
      ],
      summary: "check-standard-config: 1 problem in .cross-stack/standard.json",
    });
  });
});

describe("check-standard-config: every detected stack is covered", () => {
  const web = JSON.stringify({ dependencies: { next: "16.0.0", react: "19.0.0" } });
  const laravel = JSON.stringify({ require: { "laravel/framework": "^13.0" } });

  test("a manifest at a track root, or a directory named in trackRoots, is covered", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({
        tracks: ["laravel", "web"],
        trackRoots: { laravel: "api", web: ["./apps/web/", "."] },
      }),
      "package.json": web,
      "apps/web/package.json": web,
      "api/composer.json": laravel,
      // Dependency and dot directories are never searched.
      "node_modules/expo-thing/package.json": JSON.stringify({ dependencies: { expo: "1" } }),
    });
    assert.equal(run("check-standard-config").status, 0);
    assert.equal(run("check-standard-config", "schema").status, 0);
  });

  test("an undeclared track or an unnamed directory is a finding at its field", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({ tracks: ["web"], trackRoots: { web: "apps/web" } }),
      "apps/web/package.json": web,
      "packages/ui/package.json": JSON.stringify({ peerDependencies: { react: "19.0.0" } }),
      "api/composer.json": laravel,
    });
    const result = run("check-standard-config", "schema");
    assert.equal(result.status, 1);
    const id = "check-standard-config:schema .cross-stack/standard.json";
    assert.equal(
      result.stdout,
      `${id}:4 /tracks: api/composer.json is a laravel manifest, but "tracks" does not list "laravel"; add it and name the manifest's directory under trackRoots.laravel\n` +
        `${id}:8 /trackRoots/web: packages/ui/package.json is a web manifest, but trackRoots.web does not name its directory "packages/ui"; add it, so the web checks run there\n` +
        "check-standard-config:schema: 2 problems in .cross-stack/standard.json\n",
    );
  });

  test("a track without trackRoots uses the project root", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({ tracks: ["web"] }),
      "web/package.json": web,
    });
    const result = run("check-standard-config");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /trackRoots\.web does not name its directory "web"/);
  });

  test("the schema sub-check skips the value checks; the full check runs them", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({ hooks: { preToolUse: { protectCommands: ["("] } } }),
    });
    assert.equal(run("check-standard-config", "schema").status, 0);
    const full = run("check-standard-config");
    assert.equal(full.status, 1);
    assert.match(
      full.stdout,
      /^check-standard-config \.cross-stack\/standard\.json:\d+ \/hooks\/preToolUse\/protectCommands\/0: is not a valid regular expression/,
    );
  });

  test("a schema error is a finding of the schema sub-check", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({ tracks: [] }),
      "package.json": web,
    });
    const result = run("check-standard-config", "schema");
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /^check-standard-config:schema \.cross-stack\/standard\.json:\d+ \/tracks: /,
    );
    assert.doesNotMatch(
      result.stdout,
      /is a web manifest/,
      "a field that failed the schema is not checked again",
    );
  });
});

describe("check-allowlists", () => {
  const dir = ".cross-stack/allowlists";

  test("no allowlist directory is fine", (t) => {
    const { run } = project(t);
    assert.deepEqual(run("check-allowlists"), {
      status: 0,
      stdout: "check-allowlists: 0 files, 0 entries in .cross-stack/allowlists; all valid\n",
      stderr: "",
    });
  });

  test("valid files pass; other file types are ignored", (t) => {
    const { run } = project(t, {
      [`${dir}/PROC-014.json`]: allowlist("PROC-014", [entry(), entry({ match: "src/other.ts" })]),
      [`${dir}/SEC-001.json`]: allowlist("SEC-001", []),
      [`${dir}/README.md`]: "Allowlists live here.\n",
    });
    const result = run("check-allowlists", "--today", "2026-06-01");
    assert.equal(result.status, 0, result.stdout);
    assert.equal(
      result.stdout,
      "check-allowlists: 2 files, 2 entries in .cross-stack/allowlists; all valid\n",
    );
  });

  test("an entry is valid through its expiry date and fails the day after", (t) => {
    const { run } = project(t, {
      [`${dir}/PROC-014.json`]: allowlist("PROC-014", [entry({ expires: "2026-09-26" })]),
    });
    assert.equal(run("check-allowlists", "--today", "2026-09-26").status, 0);
    const result = run("check-allowlists", "--today", "2026-09-27");
    assert.equal(result.status, 1);
    assert.equal(
      result.stdout.split("\n")[0],
      `check-allowlists ${dir}/PROC-014.json:7 /entries/0/expires: entry for "src/legacy.ts" expired on 2026-09-26 (today is 2026-09-27); fix the code and remove the entry, or renew it with a current reason`,
    );
  });

  test("today defaults to the current UTC date", (t) => {
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const { run } = project(t, {
      [`${dir}/PROC-014.json`]: allowlist("PROC-014", [entry({ expires: "2000-01-01" })]),
      [`${dir}/SEC-001.json`]: allowlist("SEC-001", [entry({ expires: soon })]),
    });
    const result = run("check-allowlists", "--json");
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].path, `${dir}/PROC-014.json`);
    assert.equal(report.details.today, new Date().toISOString().slice(0, 10));
    assert.deepEqual(report.details, {
      directory: dir,
      files: 2,
      entries: 2,
      expired: 1,
      today: report.details.today,
      maxDays: 365,
    });
  });

  test("a far-future expiry date is a finding, within a configurable horizon", (t) => {
    const { run, root } = project(t, {
      [`${dir}/WEB-012.json`]: allowlist("WEB-012", [
        entry({ expires: "9999-12-31" }),
        entry({ match: "src/b.ts", expires: "2027-06-01" }),
        entry({ match: "src/c.ts", expires: "2027-06-02" }),
      ]),
    });
    const result = run("check-allowlists", "--today", "2026-06-01");
    assert.equal(result.status, 1);
    assert.deepEqual(
      result.stdout.split("\n").filter((line) => line.includes("/expires")),
      [
        `check-allowlists ${dir}/WEB-012.json:7 /entries/0/expires: "9999-12-31" is more than 365 days after today (2026-06-01); set a date no later than 2027-06-01 and renew the entry with a current reason when it comes`,
        `check-allowlists ${dir}/WEB-012.json:19 /entries/2/expires: "2027-06-02" is more than 365 days after today (2026-06-01); set a date no later than 2027-06-01 and renew the entry with a current reason when it comes`,
      ],
    );
    write(
      path.join(root, ".cross-stack", "standard.json"),
      manifest({ tracks: ["web"], allowlistMaxDays: 3650 }),
    );
    assert.equal(
      run("check-allowlists", "--today", "2026-06-01").stdout.includes("9999-12-31"),
      true,
    );
    write(
      path.join(root, dir, "WEB-012.json"),
      allowlist("WEB-012", [entry({ expires: "2035-01-01" })]),
    );
    assert.equal(run("check-allowlists", "--today", "2026-06-01").status, 0);
  });

  test("a symbolic link or an upper-case extension is a finding, not a skipped file", (t) => {
    const { run, root } = project(t, {
      "elsewhere/WEB-012.json": allowlist("WEB-012", [entry({ expires: "2020-01-01" })]),
      [`${dir}/SEC-002.JSON`]: allowlist("SEC-002", [entry({ expires: "2020-01-01" })]),
    });
    if (process.platform !== "win32") {
      fs.symlinkSync(
        path.join("..", "..", "elsewhere", "WEB-012.json"),
        path.join(root, dir, "WEB-012.json"),
      );
    }
    const result = run("check-allowlists", "--today", "2026-06-01");
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /SEC-002\.JSON:1 the file name must end in a lower-case \.json, not SEC-002\.JSON/,
    );
    if (process.platform !== "win32") {
      assert.match(
        result.stdout,
        /WEB-012\.json:1 WEB-012\.json is a symbolic link; an allowlist must be a regular file/,
      );
    }
  });

  test("reports schema problems, name mismatches, impossible dates and repeats with lines", (t) => {
    const text = [
      "{",
      '  "rule": "WEB-013",',
      '  "entries": [',
      '    { "match": "a.ts", "reason": " ", "expires": "2026-02-30", "owner": "@x" },',
      '    { "match": "a.ts", "reason": "ok", "expires": "2026-01-01", "owner": "@x" },',
      '    { "match": "b.ts", "reason": "ok", "expires": "2026-12-01", "owner": "@x", "ticket": 1 },',
      '    { "match": "c.ts", "expires": "2026-12-01", "owner": "" }',
      "  ]",
      "}",
      "",
    ].join("\n");
    const { run } = project(t, { [`${dir}/WEB-012.json`]: text });
    const result = run("check-allowlists", "--today", "2026-09-26");
    assert.equal(result.status, 1);
    const file = `check-allowlists ${dir}/WEB-012.json`;
    assert.deepEqual(result.stdout.split("\n"), [
      `${file}:2 /rule: is "WEB-013" but the file is named WEB-012.json`,
      `${file}:4 /entries/0/reason: must not be blank`,
      `${file}:4 /entries/0/expires: "2026-02-30" is not a calendar date`,
      `${file}:5 /entries/1/match: repeats the match of entry 0`,
      `${file}:5 /entries/1/expires: entry for "a.ts" expired on 2026-01-01 (today is 2026-09-26); fix the code and remove the entry, or renew it with a current reason`,
      `${file}:6 /entries/2: unknown property "ticket"`,
      `${file}:7 /entries/3: missing required property "reason"`,
      `${file}:7 /entries/3/owner: must not be blank`,
      `check-allowlists: 8 problems (1 file, 4 entries in ${dir})`,
      "",
    ]);
  });

  test("a file must be named after a rule ID", (t) => {
    const { run } = project(t, { [`${dir}/legacy-exceptions.json`]: allowlist("PROC-014", []) });
    const result = run("check-allowlists");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /legacy-exceptions\.json:1 the file name must be <RULE-ID>\.json/);
  });

  test("invalid JSON in one file does not hide the others", (t) => {
    const { run } = project(t, {
      [`${dir}/PROC-014.json`]: '{ "rule": "PROC-014", "entries": [ }',
      [`${dir}/SEC-001.json`]: allowlist("SEC-001", [entry({ expires: "2020-01-01" })]),
    });
    const result = run("check-allowlists", "--today", "2026-09-26");
    assert.equal(result.status, 1);
    const lines = result.stdout.trim().split("\n");
    assert.match(lines[0], /PROC-014\.json:1 invalid JSON: /);
    assert.match(
      lines[1],
      /SEC-001\.json:7 \/entries\/0\/expires: entry for "src\/legacy\.ts" expired on 2020-01-01/,
    );
  });

  test("allowlistsDir in the manifest moves the directory; an invalid value is ignored", (t) => {
    const { run } = project(t, {
      ".cross-stack/standard.json": manifest({ allowlistsDir: "quality/allowlists/" }),
      "quality/allowlists/PROC-014.json": allowlist("PROC-014", [entry({ expires: "2020-01-01" })]),
      [`${dir}/SEC-001.json`]: allowlist("SEC-001", [entry({ expires: "2020-01-01" })]),
    });
    const moved = run("check-allowlists", "--today", "2026-09-26");
    assert.equal(moved.status, 1);
    assert.match(moved.stdout, /^check-allowlists quality\/allowlists\/PROC-014\.json:7 /);
    assert.doesNotMatch(moved.stdout, /SEC-001/);

    const { run: runInvalid } = project(t, {
      ".cross-stack/standard.json": manifest({ allowlistsDir: "../outside" }),
      [`${dir}/SEC-001.json`]: allowlist("SEC-001", []),
    });
    assert.match(
      runInvalid("check-allowlists").stdout,
      /1 file, 0 entries in \.cross-stack\/allowlists/,
    );
  });

  test("--today must be a calendar date", (t) => {
    const { run } = project(t);
    for (const value of ["2026-13-01", "26-09-2026", "today"]) {
      const result = run("check-allowlists", "--today", value);
      assert.equal(result.status, 2, value);
      assert.match(result.stderr, /--today must be a date in the form YYYY-MM-DD/);
    }
  });
});

describe("list-checks", () => {
  test("prints one check per line, id first", (t) => {
    const { run } = project(t);
    const result = run("list-checks");
    assert.equal(result.status, 0);
    const ids = result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split(/\s+/)[0]);
    assert.deepEqual(ids, [
      "check-standard-config",
      "check-standard-config:schema",
      "check-allowlists",
    ]);
  });

  test("--json lists the same checks", (t) => {
    const { run } = project(t);
    const report = JSON.parse(run("list-checks", "--json").stdout);
    assert.equal(report.version, VERSION);
    assert.deepEqual(
      report.checks.map((check) => check.id),
      COMMANDS.filter((command) => command.kind === "check").map((command) => command.name),
    );
    assert.deepEqual(report.checks[0].subChecks, ["schema"]);
  });
});

describe("usage", () => {
  test("no command prints usage on stderr and exits 2", (t) => {
    const result = project(t).run();
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /^cross-stack-standard .*: project tool of the Cross-Stack Standard/,
    );
  });

  test("help forms exit 0", (t) => {
    const { run } = project(t);
    for (const args of [["--help"], ["-h"], ["help"]]) {
      const result = run(...args);
      assert.equal(result.status, 0, args.join(" "));
      assert.match(result.stdout, /^cross-stack-standard /);
      for (const command of COMMANDS) assert.match(result.stdout, new RegExp(`  ${command.name} `));
    }
    for (const args of [
      ["help", "check-allowlists"],
      ["check-allowlists", "--help"],
      ["check-allowlists", "-h"],
    ]) {
      const result = run(...args);
      assert.equal(result.status, 0, args.join(" "));
      assert.match(
        result.stdout,
        /^Usage: node \.cross-stack\/bin\/cross-stack\.mjs check-allowlists \[options\]/,
      );
      assert.match(result.stdout, /--today <date>/);
    }
  });

  test("usage errors exit 2 with a message on stderr", (t) => {
    const { run } = project(t);
    const cases = [
      [["nope"], /unknown command "nope"/],
      [["help", "nope"], /unknown command "nope"/],
      [["help", "a", "b"], /at most one command name/],
      [["check-allowlists", "--bogus"], /check-allowlists: Unknown option '--bogus'/],
      [["check-standard-config", "extra"], /check-standard-config: unknown sub-check "extra"/],
      [["check-standard-config", "schema", "x"], /at most one sub-check/],
      [["check-allowlists", "extra"], /check-allowlists: Unexpected argument 'extra'/],
      [
        ["check-standard-config", "--root"],
        /check-standard-config: Option '--root <value>' argument missing/,
      ],
    ];
    for (const [args, expected] of cases) {
      const result = run(...args);
      assert.equal(result.status, 2, args.join(" "));
      assert.equal(result.stdout, "", args.join(" "));
      assert.match(result.stderr, expected, args.join(" "));
    }
  });

  test("main reports through the given streams and returns the exit code", () => {
    let out = "";
    let err = "";
    const io = { stdout: (text) => (out += text), stderr: (text) => (err += text) };
    assert.equal(main(["list-checks"], io), 0);
    assert.match(out, /^check-standard-config /);
    assert.equal(main(["check-standard-config"], io), 2, "the template location needs --root");
    assert.match(err, /pass --root <dir>/);
  });
});

describe("parseJsonWithLines", () => {
  test("maps every JSON Pointer to its line", () => {
    const text =
      '{\n  "a": {\n    "b/c": [\n      1,\n      { "d~e": "x\\"}" }\n    ]\n  },\n  "f": null\n}';
    const parsed = parseJsonWithLines(text);
    assert.equal(parsed.ok, true);
    assert.deepEqual(Object.fromEntries(parsed.lines), {
      "": 1,
      "/a": 2,
      "/a/b~1c": 3,
      "/a/b~1c/0": 4,
      "/a/b~1c/1": 5,
      "/a/b~1c/1/d~0e": 5,
      "/f": 8,
    });
  });

  test("reports duplicate keys at the later occurrence, whose value JSON.parse keeps", () => {
    const text = '{\n  "a": { "x": 1 },\n  "b": 2,\n  "a": {\n    "y": 1\n  }\n}';
    const parsed = parseJsonWithLines(text);
    assert.deepEqual(parsed.duplicates, [{ pointer: "/a", line: 4 }]);
    assert.equal(parsed.lines.get("/a"), 4);
    assert.equal(parsed.lines.get("/a/y"), 5);
    assert.equal(parsed.lines.has("/a/x"), false);
  });

  test("gives the line of a syntax error", () => {
    assert.deepEqual(parseJsonWithLines('{\n  "a": 1,\n}'), {
      ok: false,
      line: 3,
      message: "invalid JSON: Expected double-quoted property name",
    });
    const empty = parseJsonWithLines("");
    assert.equal(empty.ok, false);
    assert.equal(empty.line, 1);
    assert.match(empty.message, /Unexpected end of JSON input/);
  });
});

describe("compareVersions", () => {
  test("orders versions by SemVer precedence", () => {
    const ordered = [
      "0.9.9",
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.0.1",
      "1.10.0",
      "2.0.0",
    ];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      assert.ok(
        compareVersions(ordered[i], ordered[i + 1]) < 0,
        `${ordered[i]} < ${ordered[i + 1]}`,
      );
      assert.ok(
        compareVersions(ordered[i + 1], ordered[i]) > 0,
        `${ordered[i + 1]} > ${ordered[i]}`,
      );
    }
    assert.equal(compareVersions("1.2.3+build.5", "1.2.3"), 0);
    assert.equal(compareVersions("1.2.3-rc.1", "1.2.3-rc.1"), 0);
  });
});
