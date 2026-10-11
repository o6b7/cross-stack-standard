#!/usr/bin/env node
/**
 * install-tool.mjs — install a pinned, checksum-verified binary (actionlint, gitleaks, shellcheck,
 * lychee) from the table in `scripts/lib/tools.json`.
 *
 * Network: downloading the release assets listed in `scripts/lib/tools.json` is this script's
 * documented purpose; it fetches nothing else. A downloaded archive is never extracted or run
 * before its SHA-256 matches the pinned value.
 *
 * Usage:
 *   node scripts/install-tool.mjs <tool...> [--dest <dir>] [--github-path] [--force] [--json]
 *   node scripts/install-tool.mjs --list [--json]
 *   node scripts/install-tool.mjs --verify <file> --sha256 <hex>
 *
 * Exit codes: 0 installed or already present, 1 checksum mismatch, 2 usage, network or internal error.
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isEntryPoint } from "./lib/entry.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const TABLE_RELATIVE = "scripts/lib/tools.json";
const STAMP_DIR = ".install-tool";
const SHA256_RE = /^[0-9a-f]{64}$/;
const TARGET_RE = /^(linux|darwin|win32)-(x64|arm64)$/;
const ARCHIVE_KINDS = new Set(["tar.gz", "zip"]);
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

const USAGE = `Usage:
  node scripts/install-tool.mjs <tool...> [options]
  node scripts/install-tool.mjs --list [--json]
  node scripts/install-tool.mjs --verify <file> --sha256 <hex>

Downloads a pinned release asset from ${TABLE_RELATIVE}, verifies its SHA-256 and installs the
binary into --dest.

Options:
  --dest <dir>       Install directory (default: <root>/.cache/tools, gitignored)
  --platform <name>  Target platform: linux, darwin or win32 (default: this machine)
  --arch <name>      Target architecture: x64 or arm64 (default: this machine)
  --github-path      Append the install directory to $GITHUB_PATH (GitHub Actions)
  --force            Reinstall even when the pinned version is already present
  --skip-exec        Do not run the installed binary to confirm its version
  --list             List the pinned tools and the targets they support
  --verify <file>    Only verify <file> against --sha256 (no network)
  --sha256 <hex>     Expected SHA-256 for --verify
  --table <file>     Tool table (default: ${TABLE_RELATIVE})
  --root <dir>       Repository root (default: resolved from this script)
  --json             Print a machine-readable report
  --help             Show this help

Exit codes: 0 success, 1 checksum mismatch, 2 usage, network or internal error.`;

/** Raised for bad command-line input; maps to exit code 2. */
export class UsageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

/** Raised when a file's SHA-256 differs from the pinned value; maps to exit code 1. */
export class ChecksumMismatchError extends Error {
  /**
   * @param {string} file File that was hashed.
   * @param {string} expected Pinned SHA-256.
   * @param {string} actual Computed SHA-256.
   */
  constructor(file, expected, actual) {
    super(`SHA-256 mismatch for ${path.basename(file)}: expected ${expected}, got ${actual}`);
    this.name = "ChecksumMismatchError";
    this.code = "ECHECKSUM";
    this.file = file;
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * @typedef {object} ToolAsset
 * @property {string} url HTTPS download URL of the release asset.
 * @property {string} sha256 Lowercase hex SHA-256 of the asset.
 * @property {"tar.gz"|"zip"} archive Archive format.
 * @property {string} path Relative path of the binary inside the archive.
 */

/**
 * @typedef {object} ToolEntry
 * @property {string} version Pinned version (no leading "v").
 * @property {string} homepage Project URL.
 * @property {string[]} versionArgs Arguments that make the binary print its version.
 * @property {Record<string, ToolAsset>} assets Assets keyed by `<platform>-<arch>`.
 */

/**
 * @typedef {object} ToolTable
 * @property {Record<string, ToolEntry>} tools
 */

/**
 * Validate a parsed tool table and return every problem found (an empty array means valid).
 *
 * @param {unknown} table Parsed JSON.
 * @returns {string[]} Human-readable problems.
 */
export function validateToolTable(table) {
  const problems = [];
  if (!table || typeof table !== "object" || !table.tools || typeof table.tools !== "object") {
    return ['the table must be an object with a "tools" object'];
  }
  for (const [name, entry] of Object.entries(table.tools)) {
    const where = `tools.${name}`;
    if (!/^[a-z][a-z0-9-]*$/.test(name)) problems.push(`${where}: invalid tool name`);
    if (!entry || typeof entry !== "object") {
      problems.push(`${where}: must be an object`);
      continue;
    }
    if (typeof entry.version !== "string" || !/^\d+\.\d+\.\d+$/.test(entry.version)) {
      problems.push(`${where}.version: must be an exact X.Y.Z version`);
    }
    if (
      !Array.isArray(entry.versionArgs) ||
      !entry.versionArgs.every((a) => typeof a === "string")
    ) {
      problems.push(`${where}.versionArgs: must be an array of strings`);
    }
    if (!entry.assets || typeof entry.assets !== "object" || !Object.keys(entry.assets).length) {
      problems.push(`${where}.assets: must list at least one target`);
      continue;
    }
    for (const [target, asset] of Object.entries(entry.assets)) {
      const at = `${where}.assets.${target}`;
      if (!TARGET_RE.test(target)) {
        problems.push(`${at}: target must be <linux|darwin|win32>-<x64|arm64>`);
      }
      if (!asset || typeof asset !== "object") {
        problems.push(`${at}: must be an object`);
        continue;
      }
      let url;
      try {
        url = new URL(asset.url);
      } catch {
        problems.push(`${at}.url: not a valid URL`);
      }
      if (url && (url.protocol !== "https:" || url.hostname !== "github.com")) {
        problems.push(`${at}.url: must be an https://github.com release URL`);
      }
      if (url && !url.pathname.includes("/releases/download/")) {
        problems.push(`${at}.url: must point at a release asset (/releases/download/)`);
      }
      if (url && typeof entry.version === "string" && !url.pathname.includes(entry.version)) {
        problems.push(`${at}.url: does not contain the pinned version ${entry.version}`);
      }
      if (typeof asset.sha256 !== "string" || !SHA256_RE.test(asset.sha256)) {
        problems.push(`${at}.sha256: must be 64 lowercase hex characters`);
      }
      if (!ARCHIVE_KINDS.has(asset.archive)) {
        problems.push(`${at}.archive: must be one of ${[...ARCHIVE_KINDS].join(", ")}`);
      }
      if (url && ARCHIVE_KINDS.has(asset.archive) && !url.pathname.endsWith(`.${asset.archive}`)) {
        problems.push(`${at}.archive: does not match the URL's file extension`);
      }
      if (
        typeof asset.path !== "string" ||
        !asset.path ||
        path.posix.isAbsolute(asset.path) ||
        asset.path.includes("\\") ||
        asset.path.split("/").includes("..")
      ) {
        problems.push(`${at}.path: must be a relative POSIX path inside the archive`);
      } else if (target.startsWith("win32-") !== asset.path.endsWith(".exe")) {
        problems.push(`${at}.path: Windows binaries end in .exe and others do not`);
      }
    }
  }
  return problems;
}

/**
 * Read and validate a tool table from disk.
 *
 * @param {string} file Path to tools.json.
 * @returns {ToolTable}
 */
export function loadToolTable(file) {
  let table;
  try {
    table = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`cannot read tool table ${file}: ${error.message}`);
  }
  const problems = validateToolTable(table);
  if (problems.length) {
    throw new Error(`invalid tool table ${file}:\n  ${problems.join("\n  ")}`);
  }
  return table;
}

/**
 * Target key (`<platform>-<arch>`) for a platform/arch pair, defaulting to this machine.
 *
 * @param {string} [platform]
 * @param {string} [arch]
 * @returns {string}
 */
export function hostTarget(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

/**
 * Look up the pinned asset for a tool and target.
 *
 * @param {ToolTable} table Validated table.
 * @param {string} tool Tool name.
 * @param {string} target `<platform>-<arch>`.
 * @returns {ToolAsset & {tool: string, version: string, target: string, fileName: string, binName: string, versionArgs: string[]}}
 */
export function resolveAsset(table, tool, target) {
  const entry = table.tools[tool];
  if (!entry) {
    throw new UsageError(
      `unknown tool "${tool}" (pinned: ${Object.keys(table.tools).sort().join(", ")})`,
    );
  }
  const asset = entry.assets[target];
  if (!asset) {
    throw new UsageError(
      `${tool} ${entry.version} has no pinned asset for ${target} (pinned: ${Object.keys(entry.assets).sort().join(", ")})`,
    );
  }
  return {
    ...asset,
    tool,
    version: entry.version,
    target,
    versionArgs: entry.versionArgs,
    fileName: decodeURIComponent(new URL(asset.url).pathname.split("/").pop()),
    binName: path.posix.basename(asset.path),
  };
}

/**
 * Compute the SHA-256 of a file.
 *
 * @param {string} file
 * @returns {Promise<string>} Lowercase hex digest.
 */
export async function sha256File(file) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/**
 * Verify a file against a pinned SHA-256.
 *
 * @param {string} file File to hash.
 * @param {string} expected Expected lowercase hex digest.
 * @returns {Promise<string>} The computed digest (equal to `expected`).
 * @throws {ChecksumMismatchError} When the digests differ.
 */
export async function verifyChecksum(file, expected) {
  const want = String(expected).trim().toLowerCase();
  if (!SHA256_RE.test(want)) throw new UsageError(`not a SHA-256 hex digest: "${expected}"`);
  const actual = await sha256File(file);
  if (actual !== want) throw new ChecksumMismatchError(file, want, actual);
  return actual;
}

/**
 * Download a URL to a file, following redirects, with a timeout and bounded retries.
 * Client errors (4xx) are not retried.
 *
 * @param {string} url HTTPS URL.
 * @param {string} dest Destination file (overwritten).
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number, retries?: number, retryDelayMs?: number, log?: (msg: string) => void}} [options]
 *   `retryDelayMs` is the wait before the second attempt; it grows linearly per attempt.
 * @returns {Promise<void>}
 */
export async function downloadFile(url, dest, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    log = () => {},
  } = options;
  if (new URL(url).protocol !== "https:") throw new Error(`refusing a non-HTTPS download: ${url}`);
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const error = new Error(`download failed: HTTP ${response.status} for ${url}`);
        error.retryable = response.status >= 500 || response.status === 429;
        throw error;
      }
      if (!response.body) throw new Error(`download failed: empty body for ${url}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
      return;
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === retries) break;
      log(`download attempt ${attempt} failed (${error.message}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
  throw lastError;
}

/**
 * Extract an archive with the system `tar` (bsdtar on macOS and Windows reads zip files too).
 * Arguments are passed without a shell.
 *
 * @param {string} archive Archive file.
 * @param {"tar.gz"|"zip"} kind Archive format.
 * @param {string} outDir Existing, empty directory.
 * @param {{tarCommand?: string}} [options]
 */
export function extractArchive(archive, kind, outDir, options = {}) {
  const tar = options.tarCommand ?? "tar";
  const args = kind === "tar.gz" ? ["-xzf", archive, "-C", outDir] : ["-xf", archive, "-C", outDir];
  const result = spawnSync(tar, args, { encoding: "utf8" });
  if (result.error) throw new Error(`cannot run ${tar}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${tar} failed to extract ${path.basename(archive)}: ${result.stderr.trim()}`);
  }
}

/**
 * Find a file by base name anywhere under a directory (used when an archive layout changed).
 *
 * @param {string} dir
 * @param {string} name
 * @returns {string[]} Absolute paths.
 */
function findByName(dir, name) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findByName(full, name));
    else if (entry.name === name) found.push(full);
  }
  return found;
}

/**
 * Download, verify and install one pinned tool.
 *
 * @param {object} options
 * @param {ToolTable} options.table Validated table.
 * @param {string} options.tool Tool name.
 * @param {string} options.dest Install directory.
 * @param {string} [options.target] `<platform>-<arch>` (default: this machine).
 * @param {boolean} [options.force] Reinstall even when present.
 * @param {boolean} [options.skipExec] Do not run the binary to confirm its version.
 * @param {typeof fetch} [options.fetchImpl] Injected fetch (tests).
 * @param {string} [options.tarCommand] Injected tar command (tests).
 * @param {(msg: string) => void} [options.log] Progress logger (stderr by default).
 * @returns {Promise<{tool: string, version: string, target: string, bin: string, sha256: string, skipped: boolean}>}
 */
export async function installTool(options) {
  const { table, tool, dest, force = false, skipExec = false, fetchImpl, tarCommand } = options;
  const log = options.log ?? ((msg) => process.stderr.write(`${msg}\n`));
  const target = options.target ?? hostTarget();
  const asset = resolveAsset(table, tool, target);
  const binPath = path.join(dest, asset.binName);
  const stampPath = path.join(dest, STAMP_DIR, `${tool}.json`);

  if (!force && existsSync(binPath) && existsSync(stampPath)) {
    try {
      const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
      if (
        stamp.version === asset.version &&
        stamp.sha256 === asset.sha256 &&
        stamp.target === target &&
        stamp.binSha256 === (await sha256File(binPath))
      ) {
        return {
          tool,
          version: asset.version,
          target,
          bin: binPath,
          sha256: asset.sha256,
          skipped: true,
        };
      }
    } catch {
      // A corrupt or partial stamp means reinstall.
    }
  }

  const work = mkdtempSync(path.join(os.tmpdir(), `install-tool-${tool}-`));
  try {
    const archive = path.join(work, asset.fileName);
    log(`downloading ${tool} ${asset.version} (${target}) from ${asset.url}`);
    await downloadFile(asset.url, archive, { fetchImpl, log });
    await verifyChecksum(archive, asset.sha256);

    const extracted = path.join(work, "x");
    mkdirSync(extracted);
    extractArchive(archive, asset.archive, extracted, { tarCommand });
    let source = path.join(extracted, ...asset.path.split("/"));
    if (!existsSync(source)) {
      const matches = findByName(extracted, asset.binName);
      if (matches.length !== 1) {
        throw new Error(
          `${asset.fileName} does not contain ${asset.path} (found ${matches.length} files named ${asset.binName})`,
        );
      }
      log(
        `note: ${asset.path} moved inside ${asset.fileName}; using ${path.relative(extracted, matches[0]).split(path.sep).join("/")}`,
      );
      source = matches[0];
    }
    if (!statSync(source).isFile())
      throw new Error(`${asset.path} in ${asset.fileName} is not a file`);

    mkdirSync(path.join(dest, STAMP_DIR), { recursive: true });
    copyFileSync(source, binPath);
    chmodSync(binPath, 0o755);

    if (!skipExec && target === hostTarget()) {
      const run = spawnSync(binPath, asset.versionArgs, { encoding: "utf8", timeout: 30_000 });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      if (run.error || !output.includes(asset.version)) {
        rmSync(binPath, { force: true });
        throw new Error(
          `${tool} did not report version ${asset.version} (${run.error ? run.error.message : output.trim().slice(0, 200)})`,
        );
      }
    }

    const binSha256 = await sha256File(binPath);
    writeFileSync(
      stampPath,
      `${JSON.stringify({ tool, version: asset.version, target, sha256: asset.sha256, binSha256 }, null, 2)}\n`,
    );
    return {
      tool,
      version: asset.version,
      target,
      bin: binPath,
      sha256: asset.sha256,
      skipped: false,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Display a path relative to the root with `/` separators, or absolute when outside the root.
 *
 * @param {string} root
 * @param {string} file
 * @returns {string}
 */
function displayPath(root, file) {
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return file.split(path.sep).join("/");
  return rel.split(path.sep).join("/");
}

/**
 * Command-line entry point.
 *
 * @param {string[]} argv Arguments after the script path.
 * @param {{fetchImpl?: typeof fetch, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, env?: NodeJS.ProcessEnv}} [io]
 * @returns {Promise<number>} Exit code.
 */
export async function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const print = (line) => stdout.write(`${line}\n`);
  const warn = (line) => stderr.write(`${line}\n`);
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        dest: { type: "string" },
        platform: { type: "string" },
        arch: { type: "string" },
        "github-path": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        "skip-exec": { type: "boolean", default: false },
        list: { type: "boolean", default: false },
        verify: { type: "string" },
        sha256: { type: "string" },
        table: { type: "string" },
        root: { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    warn(`install-tool: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    print(USAGE);
    return 0;
  }

  const root = path.resolve(values.root ?? DEFAULT_ROOT);
  const report = { ok: true, tools: [], errors: [] };
  try {
    if (values.verify !== undefined) {
      if (!values.sha256) throw new UsageError("--verify needs --sha256 <hex>");
      const file = path.resolve(values.verify);
      try {
        await verifyChecksum(file, values.sha256);
        if (values.json) print(JSON.stringify({ ok: true, file: displayPath(root, file) }));
        else print(`ok ${displayPath(root, file)} matches the expected SHA-256`);
        return 0;
      } catch (error) {
        if (!(error instanceof ChecksumMismatchError)) throw error;
        if (values.json) {
          print(
            JSON.stringify({
              ok: false,
              file: displayPath(root, file),
              expected: error.expected,
              actual: error.actual,
            }),
          );
        } else {
          print(
            `CHECKSUM ${displayPath(root, file)} expected ${error.expected}, got ${error.actual}`,
          );
          print("1 checksum mismatch");
        }
        return 1;
      }
    }

    const table = loadToolTable(path.resolve(root, values.table ?? TABLE_RELATIVE));
    if (values.list) {
      const rows = Object.entries(table.tools).map(([tool, entry]) => ({
        tool,
        version: entry.version,
        targets: Object.keys(entry.assets).sort(),
      }));
      if (values.json) print(JSON.stringify({ ok: true, tools: rows }, null, 2));
      else for (const row of rows) print(`${row.tool} ${row.version} ${row.targets.join(" ")}`);
      return 0;
    }

    if (!positionals.length) throw new UsageError("name at least one tool (or use --list)");
    if (values.platform && !["linux", "darwin", "win32"].includes(values.platform)) {
      throw new UsageError(`--platform must be linux, darwin or win32 (got "${values.platform}")`);
    }
    if (values.arch && !["x64", "arm64"].includes(values.arch)) {
      throw new UsageError(`--arch must be x64 or arm64 (got "${values.arch}")`);
    }
    const target = hostTarget(values.platform ?? process.platform, values.arch ?? process.arch);
    const dest = path.resolve(values.dest ?? path.join(root, ".cache", "tools"));
    for (const tool of positionals) resolveAsset(table, tool, target);

    for (const tool of positionals) {
      const result = await installTool({
        table,
        tool,
        dest,
        target,
        force: values.force,
        skipExec: values["skip-exec"],
        fetchImpl: io.fetchImpl,
        log: warn,
      });
      report.tools.push({ ...result, bin: displayPath(root, result.bin) });
      if (!values.json) {
        print(
          `${result.skipped ? "present" : "installed"} ${tool} ${result.version} (${result.target}) ${displayPath(root, result.bin)}`,
        );
      }
    }
    if (values["github-path"]) {
      if (env.GITHUB_PATH) appendFileSync(env.GITHUB_PATH, `${dest}${os.EOL}`);
      else warn("install-tool: --github-path given but GITHUB_PATH is not set; PATH unchanged");
    }
    if (values.json) print(JSON.stringify(report, null, 2));
    else {
      const installed = report.tools.filter((t) => !t.skipped).length;
      print(
        `${installed} installed, ${report.tools.length - installed} already present in ${displayPath(root, dest)}`,
      );
    }
    return 0;
  } catch (error) {
    const checksum = error instanceof ChecksumMismatchError;
    if (values.json) {
      print(
        JSON.stringify(
          {
            ...report,
            ok: false,
            errors: [{ code: error.code ?? error.name, message: error.message }],
          },
          null,
          2,
        ),
      );
    } else if (checksum) {
      print(`CHECKSUM ${error.file ? path.basename(error.file) : "-"} ${error.message}`);
      print("1 checksum mismatch; nothing was installed from that archive");
    } else {
      warn(`install-tool: ${error.message}`);
      if (error instanceof UsageError) warn(`Run with --help for usage.`);
    }
    return checksum ? 1 : 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
