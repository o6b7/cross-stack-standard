import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";

import {
  ChecksumMismatchError,
  UsageError,
  downloadFile,
  hostTarget,
  installTool,
  loadToolTable,
  main,
  resolveAsset,
  sha256File,
  validateToolTable,
  verifyChecksum,
} from "../../../scripts/install-tool.mjs";
import { ROOT, capture, hasCommand, tempDir } from "./helpers.mjs";

const TABLE_FILE = path.join(ROOT, "scripts", "lib", "tools.json");
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** A fetch stand-in that serves fixed responses and counts calls. */
function fakeFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, calls.length);
  };
  return { fetchImpl, calls };
}

/** A minimal valid table for one tool on the given target. */
function tableFor(target, asset) {
  return {
    tools: {
      "fake-tool": {
        version: "1.2.3",
        homepage: "https://github.com/example/fake-tool",
        versionArgs: ["--version"],
        assets: { [target]: asset },
      },
    },
  };
}

/** Build a tar.gz holding `layout` (relative path → content) with the system tar. */
function makeTarGz(dir, layout) {
  const src = path.join(dir, "src");
  for (const [file, content] of Object.entries(layout)) {
    const full = path.join(src, ...file.split("/"));
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, { mode: 0o755 });
  }
  const archive = path.join(dir, "fake-tool_1.2.3.tar.gz");
  const top = [...new Set(Object.keys(layout).map((f) => f.split("/")[0]))];
  const result = spawnSync("tar", ["-czf", archive, "-C", src, ...top], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(archive);
}

const hasTar = hasCommand("tar", ["--version"]);
const FAKE_BIN = "#!/bin/sh\necho 'fake-tool version 1.2.3'\n";
const FAKE_URL =
  "https://github.com/example/fake-tool/releases/download/v1.2.3/fake-tool_1.2.3.tar.gz";

describe("the committed tool table", () => {
  test("is valid", () => {
    const table = JSON.parse(readFileSync(TABLE_FILE, "utf8"));
    assert.deepEqual(validateToolTable(table), []);
    assert.doesNotThrow(() => loadToolTable(TABLE_FILE));
  });

  test("pins every tool CI installs, for the Linux runner", () => {
    const { tools } = loadToolTable(TABLE_FILE);
    for (const tool of ["actionlint", "gitleaks", "shellcheck", "lychee"]) {
      assert.ok(tools[tool], `${tool} is pinned`);
      assert.ok(tools[tool].assets["linux-x64"], `${tool} has a linux-x64 asset`);
    }
  });

  test("records every checksum in verified-versions.md", () => {
    const doc = readFileSync(
      path.join(ROOT, "docs", "maintainers", "verified-versions.md"),
      "utf8",
    );
    const { tools } = loadToolTable(TABLE_FILE);
    for (const [tool, entry] of Object.entries(tools)) {
      for (const [target, asset] of Object.entries(entry.assets)) {
        assert.ok(
          doc.includes(asset.sha256),
          `${tool} ${target}: sha256 ${asset.sha256} is missing from verified-versions.md`,
        );
      }
    }
  });
});

describe("validateToolTable", () => {
  const good = {
    url: FAKE_URL,
    sha256: ABC_SHA256,
    archive: "tar.gz",
    path: "fake-tool",
  };

  test("accepts a well-formed entry", () => {
    assert.deepEqual(validateToolTable(tableFor("linux-x64", good)), []);
  });

  test("rejects a table without tools", () => {
    assert.equal(validateToolTable(null).length, 1);
    assert.equal(validateToolTable({}).length, 1);
  });

  const cases = [
    ["plain HTTP", { url: FAKE_URL.replace("https:", "http:") }, /https:\/\/github\.com/],
    ["another host", { url: FAKE_URL.replace("github.com", "example.com") }, /github\.com/],
    [
      "not a release asset",
      { url: "https://github.com/example/fake-tool/archive/v1.2.3.tar.gz" },
      /releases\/download/,
    ],
    ["a URL without the version", { url: FAKE_URL.replaceAll("1.2.3", "9.9.9") }, /pinned version/],
    ["a short checksum", { sha256: "abc" }, /64 lowercase hex/],
    ["an uppercase checksum", { sha256: ABC_SHA256.toUpperCase() }, /64 lowercase hex/],
    ["an unknown archive kind", { archive: "tar.xz" }, /archive: must be one of/],
    ["an archive kind that differs from the URL", { archive: "zip" }, /does not match the URL/],
    ["a path that escapes the archive", { path: "../fake-tool" }, /relative POSIX path/],
    ["an absolute path", { path: "/usr/bin/fake-tool" }, /relative POSIX path/],
    ["a backslash path", { path: "dir\\fake-tool" }, /relative POSIX path/],
  ];
  for (const [label, override, pattern] of cases) {
    test(`rejects ${label}`, () => {
      const problems = validateToolTable(tableFor("linux-x64", { ...good, ...override }));
      assert.ok(
        problems.some((p) => pattern.test(p)),
        `expected ${pattern} in ${JSON.stringify(problems)}`,
      );
    });
  }

  test("rejects an unknown target and a Windows binary without .exe", () => {
    assert.ok(validateToolTable(tableFor("sunos-x64", good)).some((p) => /target must be/.test(p)));
    const windows = { ...good, url: FAKE_URL.replace(".tar.gz", ".zip"), archive: "zip" };
    assert.ok(validateToolTable(tableFor("win32-x64", windows)).some((p) => /\.exe/.test(p)));
  });

  test("rejects a non-exact version and bad versionArgs", () => {
    const table = tableFor("linux-x64", good);
    table.tools["fake-tool"].version = "^1.2.3";
    table.tools["fake-tool"].versionArgs = "--version";
    const problems = validateToolTable(table);
    assert.ok(problems.some((p) => /exact X\.Y\.Z/.test(p)));
    assert.ok(problems.some((p) => /versionArgs/.test(p)));
  });

  test("loadToolTable reports every problem of an invalid file", (t) => {
    const dir = tempDir(t);
    const file = path.join(dir, "tools.json");
    writeFileSync(
      file,
      JSON.stringify(tableFor("linux-x64", { ...good, sha256: "x", path: "../x" })),
    );
    assert.throws(() => loadToolTable(file), /sha256[\s\S]*path/);
    writeFileSync(file, "{ not json");
    assert.throws(() => loadToolTable(file), /cannot read tool table/);
  });
});

describe("resolveAsset and hostTarget", () => {
  const table = tableFor("linux-x64", {
    url: FAKE_URL,
    sha256: ABC_SHA256,
    archive: "tar.gz",
    path: "dist/fake-tool",
  });

  test("maps platform and architecture to a target key", () => {
    assert.equal(hostTarget("linux", "x64"), "linux-x64");
    assert.equal(hostTarget("win32", "arm64"), "win32-arm64");
    assert.equal(hostTarget(), `${process.platform}-${process.arch}`);
  });

  test("returns the asset with its file and binary names", () => {
    const asset = resolveAsset(table, "fake-tool", "linux-x64");
    assert.equal(asset.version, "1.2.3");
    assert.equal(asset.fileName, "fake-tool_1.2.3.tar.gz");
    assert.equal(asset.binName, "fake-tool");
    assert.deepEqual(asset.versionArgs, ["--version"]);
  });

  test("refuses an unknown tool or an unpinned target", () => {
    assert.throws(
      () => resolveAsset(table, "nope", "linux-x64"),
      (error) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /unknown tool "nope" \(pinned: fake-tool\)/);
        return true;
      },
    );
    assert.throws(
      () => resolveAsset(table, "fake-tool", "darwin-arm64"),
      /no pinned asset for darwin-arm64 \(pinned: linux-x64\)/,
    );
  });
});

describe("checksum verification", () => {
  test("sha256File hashes a file", async (t) => {
    const file = path.join(tempDir(t), "abc.txt");
    writeFileSync(file, "abc");
    assert.equal(await sha256File(file), ABC_SHA256);
  });

  test("verifyChecksum accepts a match, in any case", async (t) => {
    const file = path.join(tempDir(t), "abc.txt");
    writeFileSync(file, "abc");
    assert.equal(await verifyChecksum(file, ABC_SHA256), ABC_SHA256);
    assert.equal(await verifyChecksum(file, ` ${ABC_SHA256.toUpperCase()}\n`), ABC_SHA256);
  });

  test("verifyChecksum fails on a mismatch", async (t) => {
    const file = path.join(tempDir(t), "tampered.tar.gz");
    writeFileSync(file, "abd");
    await assert.rejects(verifyChecksum(file, ABC_SHA256), (error) => {
      assert.ok(error instanceof ChecksumMismatchError);
      assert.equal(error.code, "ECHECKSUM");
      assert.equal(error.expected, ABC_SHA256);
      assert.equal(error.actual, sha256("abd"));
      assert.match(error.message, /SHA-256 mismatch for tampered\.tar\.gz/);
      return true;
    });
  });

  test("verifyChecksum refuses a malformed expected digest", async (t) => {
    const file = path.join(tempDir(t), "abc.txt");
    writeFileSync(file, "abc");
    await assert.rejects(verifyChecksum(file, "not-a-digest"), UsageError);
  });
});

describe("downloadFile", () => {
  test("writes the response body", async (t) => {
    const dest = path.join(tempDir(t), "out.bin");
    const { fetchImpl, calls } = fakeFetch(() => new Response("payload"));
    await downloadFile("https://github.com/x/y/releases/download/v1/y.tar.gz", dest, { fetchImpl });
    assert.equal(readFileSync(dest, "utf8"), "payload");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, "follow");
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });

  test("does not retry a client error", async (t) => {
    const dest = path.join(tempDir(t), "out.bin");
    const { fetchImpl, calls } = fakeFetch(() => new Response("nope", { status: 404 }));
    await assert.rejects(
      downloadFile("https://github.com/x/y/releases/download/v1/y.tar.gz", dest, {
        fetchImpl,
        retryDelayMs: 0,
      }),
      /HTTP 404/,
    );
    assert.equal(calls.length, 1);
  });

  test("retries server errors and network failures, then succeeds", async (t) => {
    const dest = path.join(tempDir(t), "out.bin");
    const logs = [];
    const { fetchImpl, calls } = fakeFetch((_url, attempt) => {
      if (attempt === 1) throw new TypeError("fetch failed");
      if (attempt === 2) return new Response("busy", { status: 503 });
      return new Response("ok");
    });
    await downloadFile("https://github.com/x/y/releases/download/v1/y.tar.gz", dest, {
      fetchImpl,
      retries: 3,
      retryDelayMs: 0,
      log: (message) => logs.push(message),
    });
    assert.equal(calls.length, 3);
    assert.equal(readFileSync(dest, "utf8"), "ok");
    assert.equal(logs.length, 2);
  });

  test("gives up after the last retry", async (t) => {
    const dest = path.join(tempDir(t), "out.bin");
    const { fetchImpl, calls } = fakeFetch(() => new Response("busy", { status: 502 }));
    await assert.rejects(
      downloadFile("https://github.com/x/y/releases/download/v1/y.tar.gz", dest, {
        fetchImpl,
        retries: 2,
        retryDelayMs: 0,
      }),
      /HTTP 502/,
    );
    assert.equal(calls.length, 2);
  });

  test("refuses a non-HTTPS URL without fetching", async (t) => {
    const { fetchImpl, calls } = fakeFetch(() => new Response("x"));
    await assert.rejects(
      downloadFile("http://github.com/x", path.join(tempDir(t), "out"), { fetchImpl }),
      /non-HTTPS/,
    );
    assert.equal(calls.length, 0);
  });
});

describe("installTool", { skip: !hasTar && "the system tar is not available" }, () => {
  const target = hostTarget();
  const canExec = process.platform !== "win32";

  function setup(
    t,
    layout = { "fake-tool-1.2.3/fake-tool": FAKE_BIN },
    binPath = "fake-tool-1.2.3/fake-tool",
  ) {
    const dir = tempDir(t);
    const archive = makeTarGz(dir, layout);
    const table = tableFor(target, {
      url: FAKE_URL,
      sha256: sha256(archive),
      archive: "tar.gz",
      path: binPath,
    });
    const served = fakeFetch(() => new Response(archive));
    return { dir, archive, table, served, dest: path.join(dir, "bin") };
  }

  test("downloads, verifies, extracts and installs the binary", async (t) => {
    const { table, served, dest } = setup(t);
    const result = await installTool({
      table,
      tool: "fake-tool",
      dest,
      fetchImpl: served.fetchImpl,
      skipExec: !canExec,
      log: () => {},
    });
    assert.equal(result.skipped, false);
    assert.equal(result.version, "1.2.3");
    assert.equal(result.bin, path.join(dest, "fake-tool"));
    assert.equal(readFileSync(result.bin, "utf8"), FAKE_BIN);
    assert.equal(served.calls.length, 1);
    const stamp = JSON.parse(
      readFileSync(path.join(dest, ".install-tool", "fake-tool.json"), "utf8"),
    );
    assert.equal(stamp.version, "1.2.3");
    assert.equal(stamp.binSha256, sha256(FAKE_BIN));
  });

  test("skips the download when the pinned version is already installed", async (t) => {
    const { table, served, dest } = setup(t);
    const options = {
      table,
      tool: "fake-tool",
      dest,
      fetchImpl: served.fetchImpl,
      skipExec: !canExec,
      log: () => {},
    };
    await installTool(options);
    const again = await installTool(options);
    assert.equal(again.skipped, true);
    assert.equal(served.calls.length, 1);
    const forced = await installTool({ ...options, force: true });
    assert.equal(forced.skipped, false);
    assert.equal(served.calls.length, 2);
  });

  test("reinstalls when the installed binary was modified", async (t) => {
    const { table, served, dest } = setup(t);
    const options = {
      table,
      tool: "fake-tool",
      dest,
      fetchImpl: served.fetchImpl,
      skipExec: !canExec,
      log: () => {},
    };
    const first = await installTool(options);
    writeFileSync(first.bin, "#!/bin/sh\necho tampered\n");
    const second = await installTool(options);
    assert.equal(second.skipped, false);
    assert.equal(readFileSync(second.bin, "utf8"), FAKE_BIN);
  });

  test("installs nothing when the checksum does not match", async (t) => {
    const { table, served, dest } = setup(t);
    table.tools["fake-tool"].assets[target].sha256 = ABC_SHA256;
    await assert.rejects(
      installTool({ table, tool: "fake-tool", dest, fetchImpl: served.fetchImpl, log: () => {} }),
      ChecksumMismatchError,
    );
    assert.equal(existsSync(path.join(dest, "fake-tool")), false);
  });

  test("finds the binary by name when the archive layout moved", async (t) => {
    const { table, served, dest } = setup(
      t,
      { "other-dir/fake-tool": FAKE_BIN },
      "fake-tool-1.2.3/fake-tool",
    );
    const logs = [];
    const result = await installTool({
      table,
      tool: "fake-tool",
      dest,
      fetchImpl: served.fetchImpl,
      skipExec: !canExec,
      log: (m) => logs.push(m),
    });
    assert.equal(readFileSync(result.bin, "utf8"), FAKE_BIN);
    assert.ok(logs.some((m) => /moved inside/.test(m)));
  });

  test("fails when the archive does not contain the binary", async (t) => {
    const { table, served, dest } = setup(t, { "docs/README.md": "no binary here" }, "fake-tool");
    await assert.rejects(
      installTool({ table, tool: "fake-tool", dest, fetchImpl: served.fetchImpl, log: () => {} }),
      /does not contain fake-tool/,
    );
  });

  test(
    "rejects a binary that does not report the pinned version",
    { skip: !canExec && "binaries are not executed on Windows here" },
    async (t) => {
      const { table, served, dest } = setup(t, {
        "fake-tool-1.2.3/fake-tool": "#!/bin/sh\necho 'fake-tool 9.9.9'\n",
      });
      await assert.rejects(
        installTool({ table, tool: "fake-tool", dest, fetchImpl: served.fetchImpl, log: () => {} }),
        /did not report version 1\.2\.3/,
      );
      assert.equal(existsSync(path.join(dest, "fake-tool")), false);
    },
  );
});

describe("command line", () => {
  test("--help prints usage", async () => {
    const stdout = capture();
    assert.equal(await main(["--help"], { stdout }), 0);
    assert.match(stdout.text, /Usage:/);
  });

  test("--list shows every pinned tool and target", async () => {
    const stdout = capture();
    assert.equal(await main(["--list"], { stdout }), 0);
    for (const tool of ["actionlint", "gitleaks", "shellcheck", "lychee"]) {
      assert.match(stdout.text, new RegExp(`^${tool} \\d+\\.\\d+\\.\\d+ .*linux-x64`, "m"));
    }
    const json = capture();
    assert.equal(await main(["--list", "--json"], { stdout: json }), 0);
    assert.equal(JSON.parse(json.text).tools.length, 4);
  });

  test("--verify passes on a match and fails with exit 1 on a mismatch", async (t) => {
    const file = path.join(tempDir(t), "asset.tar.gz");
    writeFileSync(file, "abc");
    const ok = capture();
    assert.equal(await main(["--verify", file, "--sha256", ABC_SHA256], { stdout: ok }), 0);
    assert.match(ok.text, /^ok .*asset\.tar\.gz matches/m);

    const bad = capture();
    assert.equal(await main(["--verify", file, "--sha256", sha256("other")], { stdout: bad }), 1);
    assert.match(bad.text, /^CHECKSUM .*asset\.tar\.gz expected [0-9a-f]{64}, got [0-9a-f]{64}$/m);

    const json = capture();
    assert.equal(
      await main(["--verify", file, "--sha256", sha256("other"), "--json"], { stdout: json }),
      1,
    );
    assert.equal(JSON.parse(json.text).actual, ABC_SHA256);
  });

  test("usage errors exit 2", async () => {
    const stderr = capture();
    const stdout = capture();
    assert.equal(await main([], { stdout, stderr }), 2);
    assert.match(stderr.text, /name at least one tool/);
    assert.equal(await main(["--verify", "x"], { stdout, stderr }), 2);
    assert.equal(await main(["--bogus"], { stdout, stderr }), 2);
    assert.equal(await main(["not-a-tool"], { stdout, stderr }), 2);
    assert.equal(await main(["actionlint", "--platform", "sunos"], { stdout, stderr }), 2);
    assert.equal(await main(["actionlint", "--arch", "ia32"], { stdout, stderr }), 2);
    assert.match(stderr.text, /--arch must be x64 or arm64/);
  });

  test(
    "installs through the CLI with --table, --dest and --github-path",
    { skip: !hasTar && "no system tar" },
    async (t) => {
      const dir = tempDir(t);
      const archive = makeTarGz(dir, { "fake-tool-1.2.3/fake-tool": FAKE_BIN });
      const target = hostTarget();
      const tableFile = path.join(dir, "tools.json");
      writeFileSync(
        tableFile,
        JSON.stringify(
          tableFor(target, {
            url: FAKE_URL,
            sha256: sha256(archive),
            archive: "tar.gz",
            path: `fake-tool-1.2.3/fake-tool${target.startsWith("win32-") ? ".exe" : ""}`,
          }),
        ),
      );
      if (target.startsWith("win32-")) return; // the fake binary is a shell script
      const githubPath = path.join(dir, "github-path.txt");
      writeFileSync(githubPath, "");
      const { fetchImpl } = fakeFetch(() => new Response(archive));
      const stdout = capture();
      const stderr = capture();
      const dest = path.join(dir, "tools");
      const code = await main(
        ["fake-tool", "--table", tableFile, "--root", dir, "--dest", dest, "--github-path"],
        {
          stdout,
          stderr,
          fetchImpl,
          env: { GITHUB_PATH: githubPath },
        },
      );
      assert.equal(code, 0, stderr.text);
      assert.match(stdout.text, /^installed fake-tool 1\.2\.3 \(.+\) tools\/fake-tool$/m);
      assert.match(stdout.text, /1 installed, 0 already present in tools$/m);
      assert.equal(readFileSync(githubPath, "utf8").trim(), dest);

      const again = capture();
      assert.equal(
        await main(["fake-tool", "--table", tableFile, "--root", dir, "--dest", dest, "--json"], {
          stdout: again,
          stderr,
          fetchImpl,
        }),
        0,
      );
      const report = JSON.parse(again.text);
      assert.equal(report.ok, true);
      assert.equal(report.tools[0].skipped, true);
    },
  );

  test(
    "a checksum mismatch through the CLI exits 1",
    { skip: !hasTar && "no system tar" },
    async (t) => {
      const dir = tempDir(t);
      const archive = makeTarGz(dir, { "fake-tool-1.2.3/fake-tool": FAKE_BIN });
      const tableFile = path.join(dir, "tools.json");
      writeFileSync(
        tableFile,
        JSON.stringify(
          tableFor(hostTarget(), {
            url: FAKE_URL,
            sha256: ABC_SHA256,
            archive: "tar.gz",
            path: "fake-tool-1.2.3/fake-tool",
          }),
        ),
      );
      const { fetchImpl } = fakeFetch(() => new Response(archive));
      const stdout = capture();
      const code = await main(
        ["fake-tool", "--table", tableFile, "--root", dir, "--dest", path.join(dir, "tools")],
        {
          stdout,
          stderr: capture(),
          fetchImpl,
        },
      );
      assert.equal(code, 1);
      assert.match(stdout.text, /^CHECKSUM fake-tool_1\.2\.3\.tar\.gz SHA-256 mismatch/m);
      assert.equal(existsSync(path.join(dir, "tools", "fake-tool")), false);
    },
  );
});
