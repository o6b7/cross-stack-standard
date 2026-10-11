/**
 * The committed `.claude/settings.json` denies Claude Code sessions in this repository the usual
 * forms of the release hard stops: pushing `main`, force pushes, pushing tags, creating GitHub
 * Releases, publishing packages and setting the pre-push bootstrap override. Remote branch
 * deletion and pull-request merges always ask.
 *
 * The matcher below follows the documented Bash rule semantics (code.claude.com/docs/en/permissions):
 * `*` matches any text including spaces; a trailing ` *` that is the rule's only wildcard also
 * matches the bare command; `:*` at the end equals ` *`; compound commands are split on shell
 * separators and a deny or ask rule applies when any part matches; deny and ask rules match past
 * a leading environment assignment. Like the real rules, it matches command text, so it cannot
 * see `sh -c '…'` or a quoted subcommand (documented limits, listed in release.md).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SETTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8"));

/**
 * @param {string} rule `Bash(<pattern>)`
 * @returns {(command: string) => boolean}
 */
function compile(rule) {
  const match = /^Bash\((.+)\)$/su.exec(rule);
  assert.ok(match, `${rule} is not a Bash(<pattern>) rule`);
  let pattern = match[1];
  if (pattern.endsWith(":*")) pattern = `${pattern.slice(0, -2)} *`;
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, "\\$&"))
    .join(".*");
  const full = new RegExp(`^${source}$`, "su");
  const wildcards = pattern.split("*").length - 1;
  const bare = wildcards === 1 && pattern.endsWith(" *") ? pattern.slice(0, -2) : null;
  return (command) => full.test(command) || command === bare;
}

/**
 * Subcommands of a compound command, each with and without leading `NAME=value` assignments.
 *
 * @param {string} command
 * @returns {string[]}
 */
function forms(command) {
  const out = [];
  for (const part of command.split(/&&|\|\||\|&|[;|&\n]/u)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    out.push(trimmed);
    const stripped = trimmed.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/u, "");
    if (stripped !== trimmed) out.push(stripped);
  }
  return out;
}

function matches(list, command) {
  const rules = list.map((rule) => ({ rule, test: compile(rule) }));
  return rules.filter(({ test }) => forms(command).some((form) => test(form))).map((r) => r.rule);
}

const deny = SETTINGS.permissions.deny;
const ask = SETTINGS.permissions.ask;

describe(".claude/settings.json", () => {
  test("holds only permission rules, each a well-formed Bash rule, without duplicates", () => {
    assert.deepEqual(Object.keys(SETTINGS), ["permissions"]);
    assert.deepEqual(Object.keys(SETTINGS.permissions).sort(), ["ask", "deny"]);
    for (const rule of [...deny, ...ask]) {
      compile(rule);
      // A pattern that ends in `:*` is the legacy form of a trailing ` *`, not a literal colon
      // followed by a wildcard, so `git push * :*` would match every push. Anywhere else,
      // Claude Code rejects `:*` and skips the whole rule, which this matcher cannot see.
      assert.ok(!rule.endsWith(":*)"), `${rule}: a trailing ':*' is read as ' *'`);
      assert.ok(!rule.includes(":*"), `${rule}: Claude Code skips a rule with a mid-pattern ':*'`);
    }
    assert.equal(new Set(deny).size, deny.length, "duplicate deny rule");
    assert.equal(new Set(ask).size, ask.length, "duplicate ask rule");
  });

  test("every `git push` rule has a twin for options before the subcommand (-C, -c)", () => {
    for (const rule of [...deny, ...ask].filter((r) => r.startsWith("Bash(git push "))) {
      const twin = rule.replace("Bash(git push ", "Bash(git * push ");
      assert.ok(deny.includes(twin) || ask.includes(twin), `${rule} has no ${twin}`);
    }
  });

  const denied = [
    "git push origin main",
    "git push -u origin main",
    "git push origin main --force-with-lease",
    "git push origin HEAD:main",
    "git push origin release/1.2:main",
    "git push origin HEAD:refs/heads/main",
    'git -C "$REPO_DIR" push origin main',
    "git -c push.default=current push origin main",
    "git push --force origin feat/x",
    "git push -f origin feat/x",
    "git push origin +feat/x",
    "git push --all origin",
    "git push --mirror origin",
    "git push --tags",
    "git push origin --tags",
    "git push --follow-tags origin feat/x",
    "git push origin tag v1.2.3",
    "git push origin v1.2.3",
    "git push origin refs/tags/v1.2.3",
    'git -C "$REPO_DIR" push origin refs/tags/vX.Y.Z',
    "git status && git push origin main",
    "gh release create v1.2.3 --notes x",
    "gh release upload v1.2.3 a.zip",
    "gh release edit v1.2.3 --draft=false",
    "gh release delete v1.2.3",
    "gh repo edit owner/repo --visibility public",
    "claude plugin tag",
    "claude plugin tag plugins/cross-stack-standard",
    "npm publish",
    "npm publish --access public",
    "npm --workspace packages/x publish",
    "pnpm publish",
    "yarn npm publish",
    "bun publish",
    "CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH=1 git push origin refs/tags/v1.0.0",
    "export CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH=1",
    "env CROSS_STACK_STANDARD_ALLOW_MAIN_PUSH=1 git push",
  ];
  for (const command of denied) {
    test(`denies: ${command}`, () => {
      assert.ok(matches(deny, command).length > 0, "no deny rule matches");
    });
  }

  const asked = [
    "git push origin --delete feat/x",
    "git push origin -d feat/x",
    "git push origin :feat/x",
    "gh pr merge 12 --merge",
  ];
  for (const command of asked) {
    test(`asks: ${command}`, () => {
      assert.deepEqual(matches(deny, command), []);
      assert.ok(matches(ask, command).length > 0, "no ask rule matches");
    });
  }

  const free = [
    "git push -u origin feat/maintenance-window",
    "git push origin fix/domain-check",
    "git push --verbose origin docs/readme",
    "git push origin feat/x",
    "git fetch origin main",
    "git log --oneline main",
    "git tag -l",
    "gh release view v1.2.3",
    "gh release list",
    "gh pr create --base dev --head feat/x",
    "npm run lint",
    "npm pack --dry-run",
    "claude plugin validate . --strict",
  ];
  for (const command of free) {
    test(`leaves alone: ${command}`, () => {
      assert.deepEqual(matches(deny, command), []);
      assert.deepEqual(matches(ask, command), []);
    });
  }

  test("the matcher follows the documented examples", () => {
    const m = (rule, command) => compile(rule)(command);
    assert.equal(m("Bash(ls *)", "ls"), true);
    assert.equal(m("Bash(ls *)", "lsof"), false);
    assert.equal(m("Bash(ls*)", "lsof"), true);
    assert.equal(m("Bash(ls:*)", "ls -la"), true);
    assert.equal(m("Bash(git * main)", "git push origin main"), true);
    assert.equal(m("Bash(git log * main)", "git log main"), false);
    assert.equal(m("Bash(* --help *)", "npm --help"), false);
    assert.equal(m("Bash(* --help *)", "npm --help x"), true);
  });
});
