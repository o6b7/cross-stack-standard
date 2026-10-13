import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import {
  ROOT,
  extractHeredoc,
  extractRunBlock,
  hasCommand,
  makeRepo,
  tempDir,
} from "./helpers.mjs";

const WORKFLOWS = ["ci.yml", "dev-watch.yml", "release.yml"];
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const workflow = (name) => read(`.github/workflows/${name}`);
const hasBash = hasCommand("bash");
const hasSh = hasCommand("sh", ["-c", "exit 0"]);

/** Every `run:` value (single line or block) with its starting line number. */
function runBlocks(yaml) {
  const lines = yaml.split("\n");
  const blocks = [];
  lines.forEach((line, index) => {
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(line);
    if (!match) return;
    const keyIndent = line.indexOf("run:");
    if (!/^[|>][-+]?\s*$/.test(match[2])) {
      blocks.push({ line: index + 1, text: match[2] });
      return;
    }
    const body = [];
    for (let j = index + 1; j < lines.length; j += 1) {
      const next = lines[j];
      if (next.trim() && next.length - next.trimStart().length <= keyIndent) break;
      body.push(next);
    }
    blocks.push({ line: index + 1, text: body.join("\n") });
  });
  return blocks;
}

/** Top-level job ids of a workflow. */
function jobIds(yaml) {
  const jobsAt = yaml.split("\n").indexOf("jobs:");
  return yaml
    .split("\n")
    .slice(jobsAt + 1)
    .map((line) => /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line))
    .filter(Boolean)
    .map((match) => match[1]);
}

/** Parse `key=value` lines written to $GITHUB_OUTPUT. */
function readOutputs(file) {
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

/** Run a bash snippet the way GitHub runs `shell: bash` steps. */
function runBash(script, { env = {}, cwd = ROOT, input } = {}) {
  return spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    input,
  });
}

describe("workflow hygiene", () => {
  const pins = read("docs/maintainers/verified-versions.md");

  for (const name of WORKFLOWS) {
    const yaml = workflow(name);

    test(`${name}: every action is pinned to a verified full commit SHA`, () => {
      const uses = [...yaml.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
      assert.ok(uses.length > 0);
      for (const [, ref, comment] of uses) {
        const match = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40})$/.exec(ref);
        assert.ok(match, `${ref} is pinned to a full SHA`);
        assert.match(comment, /^\s+# v?\d+\.\d+\.\d+$/, `${ref} carries a version comment`);
        const row = pins
          .split("\n")
          .find((line) => line.startsWith(`| ${match[1]} |`) && line.includes(match[2]));
        assert.ok(row, `${match[1]}@${match[2]} is listed under "GitHub Action pins"`);
        const version = comment.replace("#", "").trim();
        assert.ok(
          row.includes(`| ${version} |`),
          `${match[1]}: comment ${version} matches the pinned tag`,
        );
      }
    });

    test(`${name}: no expression is expanded inside a run block`, () => {
      for (const block of runBlocks(yaml)) {
        assert.ok(
          !block.text.includes("${{"),
          `line ${block.line}: pass values through env: instead`,
        );
      }
    });

    test(`${name}: the default token is read-only`, () => {
      assert.match(yaml, /^permissions:\n {2}contents: read\n\n/m);
    });

    test(`${name}: checkout never persists credentials`, () => {
      const lines = yaml.split("\n");
      lines.forEach((line, index) => {
        if (!/uses:\s*actions\/checkout@/.test(line)) return;
        const stepIndent = line.indexOf("uses:");
        const step = [];
        for (let j = index + 1; j < lines.length; j += 1) {
          const next = lines[j];
          if (next.trim() && next.length - next.trimStart().length < stepIndent) break;
          step.push(next);
        }
        assert.ok(
          step.some((l) => /persist-credentials:\s*false/.test(l)),
          `checkout at line ${index + 1}`,
        );
      });
    });

    test(`${name}: every job has a timeout`, () => {
      const jobs = jobIds(yaml);
      const timeouts = [...yaml.matchAll(/^ {4}timeout-minutes: \d+$/gm)];
      assert.equal(timeouts.length, jobs.length, `jobs: ${jobs.join(", ")}`);
    });
  }

  test("every script a workflow runs exists", async (t) => {
    const referenced = new Set();
    for (const name of WORKFLOWS) {
      for (const match of workflow(name).matchAll(/node (scripts\/[\w./-]+\.mjs)/g))
        referenced.add(match[1]);
    }
    assert.ok(referenced.size > 5);
    for (const script of [...referenced].sort()) {
      await t.test(script, () => {
        assert.ok(existsSync(path.join(ROOT, script)), `${script} does not exist`);
      });
    }
  });
});

describe("ci.yml", () => {
  const yaml = workflow("ci.yml");

  test("runs on pull requests (including edits) and pushes to dev and main, without path filters", () => {
    assert.match(
      yaml,
      /pull_request:\n(?:\s+#.*\n)*\s+types: \[opened, edited, synchronize, reopened\]\n\s+branches: \[dev, main\]/,
    );
    assert.match(yaml, /push:\n\s+branches: \[dev, main\]/);
    assert.doesNotMatch(yaml, /^\s+paths(-ignore)?:/m);
  });

  test("ci-ok needs every other job and always runs", () => {
    const jobs = jobIds(yaml);
    assert.ok(jobs.includes("ci-ok"));
    const needs = /ci-ok:[\s\S]*?needs: \[([^\]]+)\]/
      .exec(yaml)[1]
      .split(",")
      .map((s) => s.trim());
    assert.deepEqual([...needs].sort(), jobs.filter((j) => j !== "ci-ok").sort());
    assert.match(yaml, /ci-ok:\n\s+name: ci-ok\n\s+if: always\(\)/);
  });

  test("every conditional job is gated by a changes output that ci-ok knows", () => {
    const script = extractRunBlock(yaml, "Every needed job passed or was legitimately skipped");
    const gated = [
      ...yaml.matchAll(
        /^ {2}([\w-]+):\n(?:(?! {2}\S).*\n)*? {4}if: needs\.changes\.outputs\.(\w+) == 'true'/gm,
      ),
    ].map(([, job, output]) => [job, output]);
    assert.deepEqual(gated, [
      ["hooks-os", "hooks"],
      ["plugin-validate", "plugin"],
      ["fixtures", "fixtures"],
    ]);
    for (const [job, output] of gated) {
      assert.match(
        script,
        new RegExp(`verdict ${job} "\\$\\w+" "\\$${output.toUpperCase()}_AFFECTED"`),
        job,
      );
    }
  });

  test("the Claude Code CLI is the verified pin", () => {
    assert.match(yaml, /CLAUDE_CODE_VERSION: "2\.1\.296"/);
    assert.match(
      read("docs/maintainers/verified-versions.md"),
      /\| Claude Code CLI \| 2\.1\.296 on npm \(`@anthropic-ai\/claude-code`;/,
    );
  });

  test("never drops a push run: pushes get a concurrency group per commit", () => {
    assert.match(
      yaml,
      /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name == 'pull_request' && format\('pr-\{0\}', github\.event\.pull_request\.number\) \|\| github\.sha \}\}/,
    );
    assert.match(yaml, /--head-ref "\$HEAD_REF"/);
    assert.match(yaml, /HEAD_REF: \$\{\{ github\.head_ref \}\}/);
  });

  describe("ci-ok verdict", { skip: !hasBash && "bash is not available" }, () => {
    const script = extractRunBlock(yaml, "Every needed job passed or was legitimately skipped");
    const all = {
      CHANGES: "success",
      LINT: "success",
      TEST: "success",
      REGISTRY: "success",
      INTEGRITY: "success",
      HOOKS_OS: "success",
      PLUGIN_VALIDATE: "success",
      FIXTURES: "success",
      HOOKS_AFFECTED: "true",
      PLUGIN_AFFECTED: "true",
      FIXTURES_AFFECTED: "true",
    };
    const verdict = (overrides) => runBash(script, { env: { ...all, ...overrides } });

    test("passes when everything succeeded", () => {
      const result = verdict({});
      assert.equal(result.status, 0, result.stdout);
    });

    test("passes when an unaffected job was skipped", () => {
      const result = verdict({
        HOOKS_OS: "skipped",
        HOOKS_AFFECTED: "false",
        FIXTURES: "skipped",
        FIXTURES_AFFECTED: "false",
      });
      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, /hooks-os \(skipped: not affected/);
    });

    for (const [label, overrides] of [
      ["a failure", { TEST: "failure" }],
      ["a cancellation", { LINT: "cancelled" }],
      ["a skipped job that was affected", { PLUGIN_VALIDATE: "skipped" }],
      ["a skipped always-on job", { INTEGRITY: "skipped" }],
      [
        "a skip after the changes job failed",
        { CHANGES: "failure", FIXTURES: "skipped", FIXTURES_AFFECTED: "" },
      ],
    ]) {
      test(`fails on ${label}`, () => {
        const result = verdict(overrides);
        assert.equal(result.status, 1, result.stdout);
        assert.match(result.stdout, /::error title=ci-ok::/);
      });
    }
  });

  describe("changes classification", { skip: !hasBash && "bash is not available" }, () => {
    const script = extractRunBlock(yaml, "Classify changed paths");

    function classify(t, event, files) {
      const repo = makeRepo(t);
      repo.write("README.md", "base\n");
      repo.commit("chore: base");
      repo.git("switch", "-q", "-c", "feature");
      for (const file of files) repo.write(file, "change\n");
      repo.commit("feat: change");
      repo.git("switch", "-q", "main");
      repo.write("docs/other.md", "main moved on\n");
      repo.commit("docs: main moved on");
      repo.git("merge", "-q", "--no-ff", "-m", "Merge feature", "feature");
      const out = path.join(repo.dir, ".test-home", "output");
      writeFileSync(out, "");
      const result = runBash(script, {
        cwd: repo.dir,
        env: {
          ...repo.env,
          EVENT_NAME: event,
          GITHUB_OUTPUT: out,
          RUNNER_TEMP: path.join(repo.dir, ".test-home"),
        },
      });
      assert.equal(result.status, 0, result.stderr);
      return readOutputs(out);
    }

    test("a push runs everything", (t) => {
      assert.deepEqual(classify(t, "push", ["docs/a.md"]), {
        plugin: "true",
        hooks: "true",
        fixtures: "true",
      });
    });

    test("a docs-only pull request skips the heavy jobs (the base branch's own changes do not count)", (t) => {
      assert.deepEqual(classify(t, "pull_request", ["docs/a.md", "README.md"]), {
        plugin: "false",
        hooks: "false",
        fixtures: "false",
      });
    });

    test("hook changes select the hook, plugin and fixture jobs", (t) => {
      assert.deepEqual(
        classify(t, "pull_request", ["plugins/cross-stack-standard/hooks/hooks.json"]),
        {
          plugin: "true",
          hooks: "true",
          fixtures: "true",
        },
      );
    });

    test("protected-path data and line-ending rules select the hook jobs", (t) => {
      assert.equal(
        classify(t, "pull_request", [
          "schemas/protected-paths.json",
          "plugins/cross-stack-standard/data/protected-paths.json",
        ]).hooks,
        "true",
      );
      assert.equal(classify(t, "pull_request", [".gitattributes"]).hooks, "true");
    });

    test("registry changes select the fixtures only", (t) => {
      assert.deepEqual(classify(t, "pull_request", ["registry/rules.json"]), {
        plugin: "false",
        hooks: "false",
        fixtures: "true",
      });
    });

    test("workflow or dependency changes select everything", (t) => {
      assert.deepEqual(classify(t, "pull_request", [".github/workflows/ci.yml"]), {
        plugin: "true",
        hooks: "true",
        fixtures: "true",
      });
      assert.deepEqual(classify(t, "pull_request", ["package-lock.json"]), {
        plugin: "true",
        hooks: "true",
        fixtures: "true",
      });
    });
  });

  describe("commit range", { skip: !hasBash && "bash is not available" }, () => {
    const script = extractRunBlock(yaml, "Commit range");

    function range(t, event, pick, { refName = "", setup = () => {} } = {}) {
      const repo = makeRepo(t);
      repo.write("a.txt", "1\n");
      const first = repo.commit("chore: one");
      repo.write("a.txt", "2\n");
      const second = repo.commit("chore: two");
      repo.write("a.txt", "3\n");
      const third = repo.commit("chore: three");
      setup(repo, { first, second, third });
      const out = path.join(repo.dir, ".test-home", "output");
      writeFileSync(out, "");
      const result = runBash(script, {
        cwd: repo.dir,
        env: {
          ...repo.env,
          EVENT_NAME: event,
          BEFORE: pick({ first, second, third }),
          REF_NAME: refName,
          GITHUB_OUTPUT: out,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      return { outputs: readOutputs(out), first, second, third };
    }

    test("a push to dev covers every commit no release has yet, whatever before says", (t) => {
      const { outputs, first, third } = range(t, "push", (c) => c.second, {
        refName: "dev",
        setup: (repo, c) => repo.git("update-ref", "refs/remotes/origin/main", c.first),
      });
      assert.equal(outputs.range, `${first}..${third}`);
    });

    test("a push to main covers everything since the previous release tag", (t) => {
      const { outputs, first, third } = range(t, "push", (c) => c.second, {
        refName: "main",
        setup: (repo, c) => repo.git("tag", "-a", "v1.0.0", "-m", "v1.0.0", c.first),
      });
      assert.equal(outputs.range, `${first}..${third}`);
    });

    test("a push covers the commits after the previous tip", (t) => {
      const { outputs, first, third } = range(t, "push", (c) => c.first);
      assert.equal(outputs.range, `${first}..${third}`);
    });

    test("a new branch (all-zero before) covers the pushed tip only", (t) => {
      const { outputs, second, third } = range(t, "push", () => "0".repeat(40));
      assert.equal(outputs.range, `${second}..${third}`);
    });

    test("rewritten history (unknown before) covers the pushed tip only", (t) => {
      const { outputs, second, third } = range(t, "push", () => "1".repeat(40));
      assert.equal(outputs.range, `${second}..${third}`);
    });
  });

  describe("plugin load check", () => {
    const script = extractHeredoc(extractRunBlock(yaml, "Load-time errors"));
    const check = (t, list) => {
      const file = path.join(tempDir(t), "list.json");
      writeFileSync(file, JSON.stringify(list));
      return spawnSync(process.execPath, ["-", file], { input: script, encoding: "utf8" });
    };
    const ok = {
      id: "cross-stack-standard@inline",
      version: "0.0.0",
      scope: "session",
      enabled: true,
    };

    test("passes when the plugin loads cleanly", (t) => {
      const result = check(t, [ok]);
      assert.equal(result.status, 0, result.stdout);
    });

    test("fails on load errors, a disabled plugin or a missing plugin", (t) => {
      const withErrors = check(t, [{ ...ok, errors: ["Path not found: /x (output-styles)"] }]);
      assert.equal(withErrors.status, 1);
      assert.match(withErrors.stdout, /::error::cross-stack-standard@inline: Path not found/);
      assert.equal(check(t, [{ ...ok, enabled: false }]).status, 1);
      const missing = check(t, [{ ...ok, id: "other@inline" }]);
      assert.equal(missing.status, 1);
      assert.match(missing.stdout, /is not listed/);
    });
  });
});

describe("dev-watch.yml staleness scan", () => {
  const script = extractHeredoc(
    extractRunBlock(
      workflow("dev-watch.yml"),
      "Find rows verified more than the allowed number of days ago, or never",
    ),
  );
  const scan = (t, lines) => {
    const dir = tempDir(t);
    mkdirSync(path.join(dir, "docs", "maintainers"), { recursive: true });
    writeFileSync(path.join(dir, "docs", "maintainers", "verified-versions.md"), lines.join("\n"));
    mkdirSync(path.join(dir, "tmp", "staleness"), { recursive: true });
    const out = path.join(dir, "output");
    writeFileSync(out, "");
    const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
      cwd: dir,
      input: script,
      encoding: "utf8",
      env: {
        ...process.env,
        STALE_AFTER_DAYS: "90",
        RUNNER_TEMP: path.join(dir, "tmp"),
        GITHUB_OUTPUT: out,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return {
      outputs: readOutputs(out),
      report: readFileSync(path.join(dir, "tmp", "staleness", "staleness.md"), "utf8"),
    };
  };
  const old = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const fresh = new Date().toISOString().slice(0, 10);

  test("reports rows older than the limit, and rows without a date", (t) => {
    const { outputs, report } = scan(t, [
      "## Key pins at a glance",
      "",
      "| Area | Pin | Notes |",
      "| --- | --- | --- |",
      "| Summary row | 1.0 | repeats a dated row |",
      "",
      "## Tools",
      "",
      "| Tool / item | Verified value | Source | Verified on | Notes |",
      "| --- | --- | --- | --- | --- |",
      `| old tool | 1.0 \\| 2.0 | src | ${old} | x |`,
      `| fresh tool | 1.0 | src | ${fresh} | x |`,
      "| undated tool | 1.0 | src | — | x |",
      "",
      "### Not verified by any pass",
      "",
      "| Item | What is known | How to verify |",
      "| --- | --- | --- |",
      "| mystery flag | nothing | test it |",
      "",
    ]);
    assert.deepEqual(outputs, { stale: "true" });
    assert.match(report, new RegExp(`\\| old tool \\| Tools \\| ${old} \\| 1[12]\\d \\| 11 \\|`));
    assert.match(report, /\| undated tool \| Tools \| 13 \|/);
    assert.match(report, /\| mystery flag \| Tools \/ Not verified by any pass \| 19 \|/);
    assert.doesNotMatch(report, /fresh tool|Summary row|Tool \/ item|Item \| What/);
  });

  test("reports nothing when every row is dated and fresh", (t) => {
    const { outputs } = scan(t, [
      "## Tools",
      "",
      "| Tool | Verified on |",
      "| :--- | ---: |",
      `| fresh tool | ${fresh} |`,
      "",
    ]);
    assert.deepEqual(outputs, { stale: "false" });
  });

  test("the real file dates every row outside the summary and the unverified list", () => {
    const file = read("docs/maintainers/verified-versions.md").split("\n");
    const undated = [];
    let section = "";
    let subsection = "";
    const cells = (line) =>
      line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((c) => c.trim());
    const separator = (line) =>
      line.startsWith("|") && cells(line).every((c) => /^:?-{3,}:?$/.test(c));
    file.forEach((line, index) => {
      if (line.startsWith("## ")) [section, subsection] = [line.slice(3), ""];
      if (line.startsWith("### ")) subsection = line.slice(4);
      if (!line.startsWith("|") || separator(line) || separator(file[index + 1] ?? "")) return;
      if (section === "Key pins at a glance" || subsection === "Not verified by any pass") return;
      if (!cells(line).some((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))) undated.push(index + 1);
    });
    assert.deepEqual(undated, []);
  });
});

describe("release.yml", () => {
  const yaml = workflow("release.yml");

  test("runs on v* tags only, and only the publish job can write", () => {
    assert.match(yaml, /^on:\n {2}push:\n {4}tags: \["v\*"\]\n\n/m);
    const writes = [...yaml.matchAll(/^\s+contents: write$/gm)];
    assert.equal(writes.length, 1);
    assert.match(yaml, /publish:[\s\S]*permissions:\n\s+contents: write/);
    assert.match(yaml, /git merge-base --is-ancestor "\$commit" origin\/main/);
    assert.match(yaml, /gh release create "\$TAG" "\$\{flags\[@\]\}"/);
  });

  describe("tag format and VERSION", { skip: !hasBash && "bash is not available" }, () => {
    const script = extractRunBlock(yaml, "Tag format and VERSION");
    const check = (t, tag, version) => {
      const dir = tempDir(t);
      writeFileSync(path.join(dir, "VERSION"), `${version}\n`);
      const out = path.join(dir, "output");
      writeFileSync(out, "");
      const result = runBash(script, { cwd: dir, env: { TAG: tag, GITHUB_OUTPUT: out } });
      return { result, outputs: result.status === 0 ? readOutputs(out) : {} };
    };

    test("accepts a matching release or pre-release tag", (t) => {
      assert.deepEqual(check(t, "v1.2.3", "1.2.3").outputs, { prerelease: "false" });
      assert.deepEqual(check(t, "v1.0.0-rc.1", "1.0.0-rc.1").outputs, { prerelease: "true" });
    });

    test("rejects a malformed tag or a VERSION mismatch", (t) => {
      assert.equal(check(t, "v1.2", "1.2").result.status, 1);
      assert.equal(check(t, "cross-stack-standard--v1.2.3", "1.2.3").result.status, 1);
      const mismatch = check(t, "v1.2.4", "1.2.3").result;
      assert.equal(mismatch.status, 1);
      assert.match(mismatch.stdout, /VERSION says 1\.2\.3 but the tag is v1\.2\.4/);
    });
  });
});

describe("lefthook.yml", () => {
  const yaml = read("lefthook.yml");

  test("defines the three hooks with their checks", () => {
    assert.ok(yaml.length > 0);
    assert.match(yaml, /^pre-commit:\n/m);
    assert.match(yaml, /^commit-msg:\n/m);
    assert.match(yaml, /^pre-push:\n/m);
    assert.match(yaml, /check-brand-leak\.mjs --staged --skip-without-key/);
    assert.match(yaml, /check-narrative\.mjs --staged/);
    assert.match(yaml, /git --pre-commit --redact --staged/);
    assert.match(yaml, /prettier --check --ignore-unknown \{staged_files\}/);
    assert.match(yaml, /check-brand-leak\.mjs --commit-msg \{1\} --skip-without-key/);
    assert.match(yaml, /check-narrative\.mjs --commit-msg \{1\}/);
    assert.match(yaml, /commitlint --edit \{1\}/);
    assert.match(yaml, /use_stdin: true/);
    assert.match(yaml, /check-brand-leak\.mjs --pre-push --skip-without-key/);
  });

  test("prefers the pinned gitleaks and accepts one on PATH only at the pinned version", () => {
    const script = extractRunBlock(yaml, "gitleaks (staged changes)");
    assert.match(script, /tools\.gitleaks\.version/);
    assert.ok(script.indexOf(".cache/tools/gitleaks") < script.indexOf("command -v gitleaks"));
    assert.match(script, /if \[ "\$found" = "\$pin" \]/);
  });

  describe("pre-push guard", { skip: !hasSh && "sh is not available" }, () => {
    const script = extractRunBlock(yaml, "brand guard on pushed commits; refuse main and tags");
    // A stub brand guard in a scratch directory records what the hook passes it, so the test
    // is hermetic (no key, no git history needed).
    const push = (lines, env = {}, guardExit = 0) => {
      const dir = mkdtempSync(path.join(tmpdir(), "prepush-"));
      try {
        mkdirSync(path.join(dir, "scripts"));
        writeFileSync(
          path.join(dir, "scripts", "check-brand-leak.mjs"),
          [
            'import fs from "node:fs";',
            'fs.writeFileSync("guard-args.json", JSON.stringify({ args: process.argv.slice(2), stdin: fs.readFileSync(0, "utf8") }));',
            `process.exit(${guardExit});`,
            "",
          ].join("\n"),
        );
        const result = spawnSync("sh", ["-c", script], {
          cwd: dir,
          input: lines.map((l) => `${l}\n`).join(""),
          encoding: "utf8",
          env: { ...process.env, CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH: "", ...env },
        });
        const guard = JSON.parse(readFileSync(path.join(dir, "guard-args.json"), "utf8"));
        return { ...result, guard };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const sha = "a".repeat(40);
    const zero = "0".repeat(40);

    test("allows feature branches", () => {
      const result = push([`refs/heads/feat/x ${sha} refs/heads/feat/x ${zero}`]);
      assert.equal(result.status, 0, result.stderr);
    });

    test("refuses main, including deletes and HEAD:main", () => {
      const result = push([`refs/heads/feat/x ${sha} refs/heads/main ${zero}`]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /refusing to push to main/);
      assert.equal(push([`(delete) ${zero} refs/heads/main ${sha}`]).status, 1);
    });

    test("refuses any tag", () => {
      const result = push([
        `refs/heads/dev ${sha} refs/heads/dev ${sha}`,
        `refs/tags/v1.0.0 ${sha} refs/tags/v1.0.0 ${zero}`,
      ]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /refusing to push tag v1\.0\.0/);
      assert.equal(
        push([`refs/tags/x ${sha} refs/tags/cross-stack-standard--v1.0.0 ${zero}`]).status,
        1,
      );
    });

    test("allows main and tags only with the bootstrap override", () => {
      const lines = [
        `refs/heads/main ${sha} refs/heads/main ${zero}`,
        `refs/tags/v1.0.0 ${sha} refs/tags/v1.0.0 ${zero}`,
      ];
      assert.equal(push(lines, { CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH: "1" }).status, 0);
      assert.equal(push(lines, { CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH: "true" }).status, 1);
    });

    test("brand-scans every pushed ref, and a finding fails the push even with the override", () => {
      const lines = [`refs/heads/feat/x ${sha} refs/heads/feat/x ${zero}`];
      const clean = push(lines);
      assert.equal(clean.status, 0, clean.stderr);
      assert.deepEqual(clean.guard.args, ["--pre-push", "--skip-without-key"]);
      assert.equal(clean.guard.stdin, `${lines[0]}\n`);
      assert.equal(push(lines, {}, 1).status, 1);
      assert.equal(push(lines, { CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH: "1" }, 1).status, 1);
      assert.equal(push(lines, {}, 2).status, 1, "an unusable key fails the push");
    });
  });
});

describe("tool configuration", () => {
  test("commitlint uses Conventional Commits with a 100-character header", async () => {
    const { default: config } = await import("../../../commitlint.config.mjs");
    assert.deepEqual(config.extends, ["@commitlint/config-conventional"]);
    assert.deepEqual(config.rules["header-max-length"], [2, "always", 100]);
  });

  test("Prettier prints at 100 columns", () => {
    assert.deepEqual(JSON.parse(read(".prettierrc.json")), { printWidth: 100 });
  });

  test("CODEOWNERS has the catch-all owner", () => {
    assert.match(read(".github/CODEOWNERS"), /^\* @o6b7$/m);
  });
});
