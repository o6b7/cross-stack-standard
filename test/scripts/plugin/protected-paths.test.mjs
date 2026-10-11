/**
 * Tests for schemas/protected-paths.json, the built-in list the PreToolUse hook asks about: its
 * shape, which files its globs cover (with the glob dialect the file documents) and which shell
 * commands its patterns catch or leave alone.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";

import { validateProtectedPaths } from "../../../scripts/build-plugin-data.mjs";
import { REPO_ROOT, readJson } from "./helpers.mjs";

const data = readJson(path.join(REPO_ROOT, "schemas/protected-paths.json"));

/**
 * The documented glob dialect: `**` matches zero or more directories, `*` stays inside one
 * segment, `?` matches one character, `{a,b}` matches either alternative. Case-sensitive.
 */
function globToRegExp(glob) {
  const escape = (text) => text.replace(/[.+^$()|[\]\\]/g, "\\$&");
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (c === "*") {
      source += "[^/]*";
    } else if (c === "?") {
      source += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      source += `(?:${glob
        .slice(i + 1, end)
        .split(",")
        .map(escape)
        .join("|")})`;
      i = end;
    } else {
      source += escape(c);
    }
  }
  return new RegExp(`^${source}$`);
}

const pathRules = data.paths.map((rule) => ({ ...rule, patterns: rule.globs.map(globToRegExp) }));

/** Ids of the path rules that protect a project-relative file. */
function protectingRules(file) {
  return pathRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(file)))
    .map((rule) => rule.id);
}

/** Ids of the command patterns that match a shell command. */
function matchingCommands(command) {
  return data.commands
    .filter((rule) => new RegExp(rule.pattern, `${rule.flags ?? ""}u`).test(command))
    .map((rule) => rule.id);
}

function isAllowed(command) {
  return data.allowCommands.some((rule) =>
    new RegExp(rule.pattern, `${rule.flags ?? ""}u`).test(command),
  );
}

describe("protected-paths.json shape", () => {
  test("passes the build's structural validation", () => {
    const text = JSON.stringify(data);
    assert.deepEqual(validateProtectedPaths({ value: data, lines: new Map([["", 1]]), text }), []);
  });

  test("the validation reports bad entries", () => {
    const broken = {
      paths: [
        { id: "a", description: "x", globs: ["/abs"] },
        { id: "a", description: "", globs: [] },
      ],
      commands: [{ id: "Bad Id", description: "x", pattern: "(" }],
      contentRules: [{ id: "c", description: "x", globs: ["CLAUDE.md"] }],
    };
    const messages = validateProtectedPaths({ value: broken, lines: new Map() }).map(
      (problem) => problem.message,
    );
    assert.deepEqual(messages, [
      '"/abs" is not a project-relative glob',
      'repeats the id "a"',
      "needs a description",
      "needs a non-empty globs list",
      'needs a regular expression in "addedPattern"',
      "needs a kebab-case id",
      "invalid regular expression: Invalid regular expression: /(/u: Unterminated group",
    ]);
  });

  test("every JSON Pointer entry targets JSON files", () => {
    for (const rule of data.paths.filter((entry) => entry.jsonPointers)) {
      for (const glob of rule.globs) assert.match(glob, /\.json$/, rule.id);
    }
  });
});

describe("protected files", () => {
  const PROTECTED = {
    ".cross-stack/standard.json": "cross-stack-config",
    ".cross-stack/allowlists/PROC-014.json": "cross-stack-config",
    ".cross-stack/bin/cross-stack.mjs": "cross-stack-config",
    "phpstan.neon": "phpstan-config",
    "api/phpstan.neon.dist": "phpstan-config",
    "phpstan-baseline.neon": "phpstan-config",
    "eslint.config.mjs": "eslint-config",
    "apps/web/eslint.config.ts": "eslint-config",
    "eslint-suppressions.json": "eslint-suppressions",
    ".dependency-cruiser.cjs": "dependency-cruiser-config",
    ".dependency-cruiser-known-violations.json": "dependency-cruiser-config",
    ".prettierrc.json": "prettier-config",
    "prettier.config.mjs": "prettier-config",
    ".prettierignore": "prettier-config",
    "pint.json": "pint-config",
    ".jscpd.json": "jscpd-config",
    "knip.config.ts": "knip-config",
    "tests/Unit/ArchTest.php": "architecture-tests",
    "backend/tests/Arch/ControllersTest.php": "architecture-tests",
    "src/features/layers.arch.test.ts": "architecture-tests",
    "phpunit.xml": "test-runner-config",
    "phpunit.xml.dist": "test-runner-config",
    "vitest.config.mts": "test-runner-config",
    "jest.config.js": "test-runner-config",
    "package.json": "package-scripts",
    "apps/mobile/package.json": "package-scripts",
    "composer.json": "composer-scripts",
    ".github/workflows/ci.yml": "ci-workflows",
    ".github/workflows/nested/reusable.yml": "ci-workflows",
    ".github/CODEOWNERS": "codeowners",
    "lefthook.yml": "lefthook-config",
    ".lefthook.yaml": "lefthook-config",
    "lefthook-local.yml": "lefthook-config",
    ".config/lefthook.toml": "lefthook-config",
    "commitlint.config.mjs": "commitlint-config",
    ".commitlintrc.json": "commitlint-config",
    "renovate.json": "dependency-update-config",
    ".github/dependabot.yml": "dependency-update-config",
    ".gitleaks.toml": "gitleaks-config",
    ".gitleaksignore": "gitleaks-config",
    ".claude/settings.json": "claude-settings",
  };

  for (const [file, id] of Object.entries(PROTECTED)) {
    test(`${file} is protected by ${id}`, () => {
      assert.deepEqual(protectingRules(file), [id]);
    });
  }

  const UNPROTECTED = [
    "src/app/page.tsx",
    "app/Http/Controllers/UserController.php",
    "README.md",
    "CLAUDE.md",
    ".claude/settings.local.json",
    "tests/Feature/UserTest.php",
    "src/lib/eslint.config.helpers.ts",
    "docs/phpstan.md",
  ];
  for (const file of UNPROTECTED) {
    test(`${file} is not protected`, () => {
      assert.deepEqual(protectingRules(file), []);
    });
  }

  test("the opt-out line is a content rule on CLAUDE files", () => {
    const [rule] = data.contentRules;
    assert.equal(rule.id, "opt-out-line");
    const pattern = new RegExp(rule.addedPattern, `${rule.flags ?? ""}u`);
    for (const line of ["cross-stack-standard: declined", "Cross-Stack-Standard :  DECLINED"]) {
      assert.match(line, pattern);
    }
    assert.doesNotMatch("cross-stack-standard: adopted", pattern);
    const globs = rule.globs.map(globToRegExp);
    for (const file of [
      "CLAUDE.md",
      ".claude/CLAUDE.md",
      "apps/web/CLAUDE.md",
      "CLAUDE.local.md",
    ]) {
      assert.ok(
        globs.some((glob) => glob.test(file)),
        file,
      );
    }
  });
});

describe("shell commands", () => {
  const CAUGHT = [
    ["git commit --no-verify -m 'wip'", "git-no-verify"],
    ["git push --no-verify", "git-no-verify"],
    ["git commit -nm 'wip'", "git-commit-short-n"],
    ["git -C api commit -a -n", "git-commit-short-n"],
    ["LEFTHOOK=0 git commit -m x", "lefthook-disabled"],
    ["LEFTHOOK=false git push", "lefthook-disabled"],
    ['$env:LEFTHOOK = "0"; git commit -m x', "lefthook-disabled"],
    ["LEFTHOOK_EXCLUDE=lint git commit -m x", "lefthook-environment"],
    ["git config core.hooksPath /dev/null", "git-hooks-path"],
    ["git -c core.hookspath=/tmp commit -m x", "git-hooks-path"],
    ["echo 'const key = x; // #gitleaks:allow' >> src/a.ts", "gitleaks-inline-allow"],
    ["GITLEAKS_CONFIG=/tmp/loose.toml gitleaks git", "gitleaks-config-environment"],
    ["vendor/bin/pest --do-not-fail-on-incomplete", "test-do-not-fail-on"],
    ["composer update --no-blocking", "composer-no-blocking"],
    ["COMPOSER_NO_SECURITY_BLOCKING=1 composer require a/b", "composer-no-blocking"],
    ["composer install --no-audit", "composer-no-audit"],
    ["COMPOSER_NO_AUDIT=1 composer install", "composer-no-audit"],
    ["npm audit --audit-level=none", "npm-audit-level-none"],
    ["pnpm audit --audit-level none", "npm-audit-level-none"],
    ["vendor/bin/phpstan analyse --generate-baseline", "baseline-regenerate"],
    ["vendor/bin/phpstan analyse -b", "baseline-regenerate"],
    ["npx eslint . --suppress-all", "baseline-regenerate"],
    ["npx eslint . --suppress-rule no-console", "baseline-regenerate"],
    ["npx jscpd src --update-baseline", "baseline-regenerate"],
    [
      "npx depcruise src -T baseline > .dependency-cruiser-known-violations.json",
      "baseline-regenerate",
    ],
    ["rm phpstan-baseline.neon", "baseline-delete"],
    ["git rm eslint-suppressions.json", "baseline-delete"],
    ["Remove-Item .dependency-cruiser-known-violations.json", "baseline-delete"],
    ['echo "cross-stack-standard: declined" >> CLAUDE.md', "opt-out-line-shell"],
    ["printf 'cross-stack-standard: declined\\n' | tee -a .claude/CLAUDE.md", "opt-out-line-shell"],
    ['Add-Content CLAUDE.md "cross-stack-standard: declined"', "opt-out-line-shell"],
    ["sed -i '' 's/level: 8/level: 5/' phpstan.neon", "write-to-protected-path"],
    ["perl -pi -e 's/8/5/' phpstan.neon", "write-to-protected-path"],
    ["echo '{}' > .cross-stack/standard.json", "write-to-protected-path"],
    ["cp /tmp/loose.neon phpstan.neon", "write-to-protected-path"],
    ["Set-Content -Path pint.json -Value '{}'", "write-to-protected-path"],
  ];
  for (const [command, id] of CAUGHT) {
    test(`catches ${command}`, () => {
      assert.ok(
        matchingCommands(command).includes(id),
        `${id} not in ${matchingCommands(command)}`,
      );
    });
  }

  const IGNORED = [
    "git commit -m 'Add login form'",
    "git commit --amend --no-edit",
    "git push origin feature",
    "COMPOSER_NO_INTERACTION=1 composer install",
    "npm audit --audit-level=high",
    "vendor/bin/phpstan analyse",
    "vendor/bin/phpstan analyse -c phpstan.neon 2>&1",
    "npx eslint src --max-warnings=0",
    "rm -rf node_modules",
    'grep -n "cross-stack-standard: declined" CLAUDE.md',
    "npm test",
    "lefthook run pre-commit",
  ];
  for (const command of IGNORED) {
    test(`leaves ${command} alone`, () => {
      assert.deepEqual(matchingCommands(command), []);
    });
  }

  test("the sanctioned baseline scripts are exempt, as whole commands only", () => {
    for (const command of [
      "npm run phpstan:baseline:update",
      "composer phpstan:baseline:update",
      "composer run-script eslint:baseline:update",
      "pnpm depcruise:baseline:update",
    ]) {
      assert.ok(isAllowed(command), command);
    }
    for (const command of [
      "npm run phpstan:baseline:update && rm phpstan-baseline.neon",
      "npm run lint",
      "npx phpstan:baseline:update",
    ]) {
      assert.ok(!isAllowed(command), command);
    }
  });
});
