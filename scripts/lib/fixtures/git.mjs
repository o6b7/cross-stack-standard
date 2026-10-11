/**
 * Scratch git repositories for hosts with `"git": true`.
 *
 * Commits use a fixed identity and fixed dates, and git runs with the isolated configuration
 * from `buildBaseEnv` in process.mjs (no user or system config, no signing), so the history is
 * the same on every machine.
 *
 * @module
 */
import { runProcess, tailLines } from "./process.mjs";

/** Identity used for fixture commits. */
export const FIXTURE_IDENTITY = Object.freeze({
  name: "Fixture Harness",
  email: "fixtures@example.invalid",
});

/** Unix time of the initial commit (2026-01-01T00:00:00Z); later commits add a minute each. */
export const FIXTURE_EPOCH = 1767225600;

const GIT_TIMEOUT_MS = 60_000;
const SHA_RE = /^[0-9a-f]{40,64}$/m;

/** Error raised when a git step fails. */
export class GitStepError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "GitStepError";
  }
}

async function git(dir, args, env, signal) {
  const argv = ["git", "-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args];
  const result = await runProcess({ argv, cwd: dir, env, timeoutMs: GIT_TIMEOUT_MS, signal });
  if (result.exitCode !== 0) {
    const detail = result.error ?? tailLines(result.output, 10).join("\n");
    throw new GitStepError(`git ${args.join(" ")} failed (exit ${result.exitCode}): ${detail}`);
  }
  return result.output;
}

/**
 * A small wrapper that initialises a repository and records commits with increasing dates.
 */
export class ScratchRepo {
  /**
   * @param {string} dir Work directory.
   * @param {Record<string, string>} env Base environment (see `buildBaseEnv`).
   * @param {AbortSignal} [signal] Abort signal.
   */
  constructor(dir, env, signal) {
    this.dir = dir;
    this.env = env;
    this.signal = signal;
    this.commits = 0;
  }

  /**
   * Run `git init` with `main` as the initial branch.
   *
   * @returns {Promise<void>}
   */
  async init() {
    await git(this.dir, ["init", "--quiet", "--initial-branch=main"], this.env, this.signal);
  }

  /**
   * Stage everything and commit it (an empty commit is allowed).
   *
   * @param {string} message Commit message.
   * @returns {Promise<string>} The new commit SHA.
   */
  async commitAll(message) {
    const stamp = `${FIXTURE_EPOCH + this.commits * 60} +0000`;
    this.commits += 1;
    const env = {
      ...this.env,
      GIT_AUTHOR_NAME: FIXTURE_IDENTITY.name,
      GIT_AUTHOR_EMAIL: FIXTURE_IDENTITY.email,
      GIT_COMMITTER_NAME: FIXTURE_IDENTITY.name,
      GIT_COMMITTER_EMAIL: FIXTURE_IDENTITY.email,
      GIT_AUTHOR_DATE: stamp,
      GIT_COMMITTER_DATE: stamp,
    };
    await git(this.dir, ["add", "--all"], env, this.signal);
    await git(this.dir, ["commit", "--quiet", "--allow-empty", "-m", message], env, this.signal);
    const out = await git(this.dir, ["rev-parse", "HEAD"], env, this.signal);
    const sha = SHA_RE.exec(out)?.[0];
    if (!sha) throw new GitStepError(`git rev-parse HEAD printed no commit id: ${out.trim()}`);
    return sha;
  }
}
