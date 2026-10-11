/**
 * Gate-presence adapters (scripts/lib/gate-presence/): each kind is proven present on a minimal
 * temporary layout that follows the default locations (the plugin, the kit templates and the
 * gate packages vendored into them), and absent for each way it can be missing, including a gate
 * that exists only in the repository's own packages/ sources or fixture hosts, which never ship.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  DEFAULT_LOCATIONS,
  checkGatePresence,
  createPresenceContext,
  resolveLocations,
} from "../../../scripts/lib/gate-presence/index.mjs";
import { matcherCovers } from "../../../scripts/lib/gate-presence/hook.mjs";
import { parseCheckList } from "../../../scripts/lib/gate-presence/script.mjs";
import {
  parsePhpunitTestsuites,
  titleNamesRule,
} from "../../../scripts/lib/gate-presence/pest.mjs";
import {
  findRuleClassesWithIdentifier,
  neonRegistrationLine,
} from "../../../scripts/lib/gate-presence/phpstan.mjs";
import {
  findEnabledRule,
  findRuleSettings,
  packageEntryPoints,
} from "../../../scripts/lib/gate-presence/eslint.mjs";
import { expandLocations, tracksFor } from "../../../scripts/lib/gate-presence/locations.mjs";
import {
  chainFileCommands,
  commandRunsCheck,
  reachableScriptCommands,
} from "../../../scripts/lib/gate-presence/script.mjs";
import { findDepcruiseRuleName } from "../../../scripts/lib/gate-presence/depcruise.mjs";
import {
  readJestTestMatch,
  readVitestInclude,
} from "../../../scripts/lib/gate-presence/test-runner.mjs";
import { makeRepo } from "./helpers.mjs";

const PLUGIN = "plugins/cross-stack-standard";
const TEMPLATES = `${PLUGIN}/templates`;
const BIN = `${TEMPLATES}/shared/cross-stack/bin/cross-stack.mjs`;
const TRACK_OF = { BE: "laravel", WEB: "web", MOB: "mobile" };

/** @type {import("./helpers.mjs").TempRepo} */
let repo;

beforeEach(() => {
  repo = makeRepo({ schema: false });
});

afterEach(() => {
  repo.cleanup();
});

/**
 * Checks one gate against the temporary repository. The rule's track follows its ID prefix
 * (BE laravel, WEB web, MOB mobile, anything else shared).
 *
 * @param {object} gate
 * @param {string} [ruleId]
 * @param {object} [locations]
 * @param {object} [rule] extra rule fields (for example `enforcement`)
 * @returns {{ present: boolean, evidence: string }}
 */
function check(gate, ruleId = "PROC-101", locations = undefined, rule = {}) {
  const track = TRACK_OF[ruleId.split("-")[0]] ?? "shared";
  return checkGatePresence(
    { id: ruleId, track, gate, ...rule },
    createPresenceContext({ root: repo.root, locations }),
  );
}

/**
 * A Node script that prints `lines` when called with `trigger` and fails otherwise.
 *
 * @param {string} trigger
 * @param {string[]} lines
 * @returns {string}
 */
function listingScript(trigger, lines) {
  return [
    `if (process.argv[2] === ${JSON.stringify(trigger)}) {`,
    `  process.stdout.write(${JSON.stringify(`${lines.join("\n")}\n`)});`,
    "} else {",
    '  process.stderr.write("unknown command\\n");',
    "  process.exitCode = 2;",
    "}",
  ].join("\n");
}

describe("checkGatePresence", () => {
  it("reports a missing gate, an unknown kind and a failing adapter as absent", () => {
    assert.deepEqual(check(null), { present: false, evidence: "the rule names no gate" });
    assert.deepEqual(check({ kind: "sonar", id: "x" }), {
      present: false,
      evidence: 'unknown gate kind "sonar"',
    });
    const broken = check({ kind: "ci", id: "x" }, "PROC-101", { ci: { workflows: null } });
    assert.equal(broken.present, false);
    assert.match(broken.evidence, /^ci adapter failed: /);
  });

  it("merges location overrides one level deep", () => {
    const merged = resolveLocations({ eslint: { configs: ["x.js"] } });
    assert.deepEqual(merged.eslint.configs, ["x.js"]);
    assert.equal(merged.eslint.pluginPrefix, DEFAULT_LOCATIONS.eslint.pluginPrefix);
    assert.deepEqual(merged.ci, DEFAULT_LOCATIONS.ci);
  });

  it("never searches the fixture hosts or the unvendored packages/ sources", () => {
    const text = JSON.stringify(DEFAULT_LOCATIONS);
    assert.equal(text.includes("test/harness"), false);
    assert.equal(/"packages\//.test(text), false);
  });

  it("expands {track} for the rule's tracks, and for every track for a shared rule", () => {
    assert.deepEqual(tracksFor({ track: "web" }), ["web"]);
    assert.deepEqual(tracksFor({ track: "shared" }), ["shared", "laravel", "web", "mobile"]);
    const web = expandLocations(DEFAULT_LOCATIONS, ["web"]);
    assert.deepEqual(web.eslint.configs, [`${TEMPLATES}/web/**/eslint.config.{js,mjs,cjs}`]);
    assert.deepEqual(web.pest.projects, [{ root: `${TEMPLATES}/web`, testDirs: ["tests"] }]);
    assert.deepEqual(web.vitest.projects[0].extraFiles, [
      `${TEMPLATES}/web/vendor/*/src/**/*.{js,mjs,ts}`,
    ]);
    assert.equal(expandLocations(DEFAULT_LOCATIONS, ["laravel", "web"]).script.chains.length, 6);
  });
});

describe("hook gates", () => {
  const hooksJson = (hooks) => repo.write(`${PLUGIN}/hooks/hooks.json`, { hooks });
  const execHook = (event) => ({
    type: "command",
    command: "node",
    args: ["${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs", event],
  });

  it("is present when hooks.json routes the event through a covering matcher to the entry script", () => {
    repo.write(`${PLUGIN}/scripts/hook.mjs`, "");
    hooksJson({
      PreToolUse: [
        { matcher: "Bash|PowerShell", hooks: [execHook("PreToolUse")] },
        { matcher: "Edit|Write|NotebookEdit", hooks: [execHook("PreToolUse")] },
      ],
      Stop: [
        {
          hooks: [
            { type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs" Stop' },
          ],
        },
      ],
    });
    const edit = check({ kind: "hook", id: "PreToolUse", discriminator: "Edit" });
    assert.equal(edit.present, true, edit.evidence);
    assert.match(
      edit.evidence,
      /routes PreToolUse \(matcher Edit\|Write\|NotebookEdit\) to plugins\/cross-stack-standard\/scripts\/hook\.mjs/,
    );
    assert.equal(check({ kind: "hook", id: "PreToolUse", discriminator: "Bash" }).present, true);
    assert.equal(check({ kind: "hook", id: "Stop" }).present, true);
  });

  it("is absent without hooks.json, with invalid JSON or without the event", () => {
    assert.match(check({ kind: "hook", id: "Stop" }).evidence, /hooks\.json not found/);
    repo.write(`${PLUGIN}/hooks/hooks.json`, "{ nope");
    assert.match(check({ kind: "hook", id: "Stop" }).evidence, /is not valid JSON/);
    hooksJson({});
    assert.match(check({ kind: "hook", id: "Stop" }).evidence, /has no Stop hooks/);
  });

  it("is absent when no matcher covers the tool", () => {
    repo.write(`${PLUGIN}/scripts/hook.mjs`, "");
    hooksJson({ PreToolUse: [{ matcher: "Bash", hooks: [execHook("PreToolUse")] }] });
    const result = check({ kind: "hook", id: "PreToolUse", discriminator: "Edit" });
    assert.equal(result.present, false);
    assert.match(result.evidence, /no PreToolUse matcher covering Edit/);
  });

  it("is absent when the event bypasses the entry script or the entry script is missing", () => {
    hooksJson({
      Stop: [
        {
          hooks: [
            { type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/other.mjs"] },
          ],
        },
      ],
    });
    assert.match(
      check({ kind: "hook", id: "Stop" }).evidence,
      /routes no Stop hook to plugins\/cross-stack-standard\/scripts\/hook\.mjs/,
    );
    hooksJson({ Stop: [{ hooks: [execHook("Stop")] }] });
    assert.match(
      check({ kind: "hook", id: "Stop" }).evidence,
      /scripts\/hook\.mjs, which does not exist/,
    );
  });

  it("follows the documented matcher semantics", () => {
    assert.equal(matcherCovers(undefined, "Edit"), true);
    assert.equal(matcherCovers("", "Edit"), true);
    assert.equal(matcherCovers("*", "Edit"), true);
    assert.equal(matcherCovers("Edit|Write", "Write"), true);
    assert.equal(matcherCovers("Edit, Write", "Write"), true);
    assert.equal(matcherCovers("Edit", "NotebookEdit"), false);
    assert.equal(matcherCovers("Notebook.*", "NotebookEdit"), true);
    assert.equal(matcherCovers("Edit$", "NotebookEdit"), true);
    assert.equal(matcherCovers("^Edit$", "NotebookEdit"), false);
    assert.equal(matcherCovers("(", "Edit"), false);
    assert.equal(matcherCovers(42, "Edit"), false);
  });
});

describe("script gates", () => {
  const chain = (track, scripts) => repo.write(`${TEMPLATES}/${track}/package.json`, { scripts });
  const kit = (command) => `node .cross-stack/bin/cross-stack.mjs ${command}`;

  it("is present when the shared tool lists the check and every track chain runs it", () => {
    repo.write(
      BIN,
      listingScript("list-checks", [
        "check-standard-config  Validate the manifest.",
        "check-allowlists       Validate allowlists.",
      ]),
    );
    chain("web", { check: "npm run lint && npm run kit", kit: kit("check-allowlists") });
    const result = check({ kind: "script", id: "check-allowlists" });
    assert.equal(result.present, true, result.evidence);
    assert.equal(
      result.evidence,
      `${BIN} list-checks lists check-allowlists; run by the check chain in ${TEMPLATES}/web`,
    );
  });

  it("is absent when the check is listed but no shipped chain runs it", () => {
    repo.write(BIN, listingScript("list-checks", ["check-foo"]));
    const none = check({ kind: "script", id: "check-foo" });
    assert.equal(none.present, false);
    assert.match(none.evidence, /lists check-foo, but no shipped check chain exists to run it/);
    chain("web", { check: kit("check-foo") });
    chain("laravel", { check: "php artisan test" });
    const partial = check({ kind: "script", id: "check-foo" });
    assert.equal(
      partial.present,
      false,
      "a shared rule must run in every track that ships a chain",
    );
    assert.match(
      partial.evidence,
      /the check chain in plugins\/cross-stack-standard\/templates\/laravel does not run it/,
    );
    repo.write(`${TEMPLATES}/laravel/composer.json`, {
      scripts: { check: ["@lint", "@kit"], lint: "pint --test", kit: `@php ${kit("check-foo")}` },
    });
    assert.equal(check({ kind: "script", id: "check-foo" }).present, true);
  });

  it("matches a discriminator as <id>:<sub-check>", () => {
    repo.write(
      BIN,
      listingScript("list-checks", [
        "# checks",
        "check-standard-config:tier-triggers  Tier triggers.",
      ]),
    );
    chain("web", { "check:fast": kit("check-standard-config tier-triggers") });
    assert.equal(
      check({ kind: "script", id: "check-standard-config", discriminator: "tier-triggers" })
        .present,
      true,
    );
    const missing = check({ kind: "script", id: "check-standard-config", discriminator: "schema" });
    assert.equal(missing.present, false);
    assert.match(missing.evidence, /list-checks does not list check-standard-config:schema/);
  });

  it("is present for a standalone script that answers --list-checks and a chain runs", () => {
    repo.write(
      `${PLUGIN}/scripts/check-sample.mjs`,
      listingScript("--list-checks", ["check-sample"]),
    );
    repo.write(
      `${TEMPLATES}/web/lefthook.yml`,
      "pre-commit:\n  jobs:\n    - name: sample\n      run: node .cross-stack/bin/check-sample.mjs\n",
    );
    const result = check({ kind: "script", id: "check-sample" });
    assert.equal(result.present, true, result.evidence);
    assert.match(result.evidence, /check-sample\.mjs --list-checks lists check-sample/);
  });

  it("is absent without a script, or when the listing fails", () => {
    assert.match(
      check({ kind: "script", id: "check-sample" }).evidence,
      /^no script file for check-sample \(looked for /,
    );
    repo.write(`${PLUGIN}/scripts/check-sample.mjs`, "process.exitCode = 3;");
    assert.match(
      check({ kind: "script", id: "check-sample" }).evidence,
      /--list-checks exited with 3/,
    );
  });

  it("parses listings and chains", () => {
    assert.deepEqual(parseCheckList("# header\n\ncheck-a  Summary text\r\n  check-b:x\n"), [
      "check-a",
      "check-b:x",
    ]);
    assert.deepEqual(
      reachableScriptCommands(
        { check: "npm run a && node --run b", a: "x", b: "npm run-script c", c: "y", other: "z" },
        "npm",
      ),
      ["npm run a && node --run b", "x", "npm run-script c", "y"],
    );
    assert.deepEqual(
      reachableScriptCommands({ check: ["@php artisan x", "@k"], k: "k1" }, "composer"),
      ["@php artisan x", "@k", "k1"],
    );
    assert.equal(chainFileCommands("x/package.json", "{").length, 0);
    const gate = { id: "check-allowlists" };
    const bins = ["cross-stack.mjs", "{id}.mjs"];
    assert.equal(commandRunsCheck(kit("check-allowlists --root ."), bins, gate), true);
    assert.equal(commandRunsCheck(kit("check-allowlists-v2"), bins, gate), false);
    assert.equal(commandRunsCheck("echo cross-stack.mjs check-allowlists-ish", bins, gate), false);
    assert.equal(commandRunsCheck("node bin/check-allowlists.mjs", bins, gate), true);
  });
});

describe("pest gates", () => {
  const LARAVEL = `${TEMPLATES}/laravel`;

  it("is present for a test named with the rule ID in the kit template's tests", () => {
    repo.write(
      `${LARAVEL}/tests/Unit/ArchTest.php`,
      "<?php\n\narch('BE-001 strict types')->expect('App')->toUseStrictTypes();\n",
    );
    const result = check({ kind: "pest", id: "BE-001 strict types" }, "BE-001");
    assert.equal(result.present, true, result.evidence);
    assert.equal(
      result.evidence,
      `arch("BE-001 strict types") at ${LARAVEL}/tests/Unit/ArchTest.php:3 (test directory ${LARAVEL}/tests)`,
    );
  });

  it("accepts the underscore form of the rule ID", () => {
    repo.write(
      `${LARAVEL}/tests/Feature/RouteTest.php`,
      "<?php\nit('BE_015 serves routes under the version prefix', fn () => true);\n",
    );
    assert.equal(
      check({ kind: "pest", id: "BE_015 serves routes under the version prefix" }, "BE-015")
        .present,
      true,
    );
  });

  it("never counts a test that only the fixture host has", () => {
    repo.write(
      "test/harness/laravel/tests/Arch/StrictTest.php",
      "<?php\ntest('BE-001 strict types everywhere', fn () => true);\n",
    );
    const result = check({ kind: "pest", id: "BE-001 strict types everywhere" }, "BE-001");
    assert.equal(result.present, false);
    assert.match(result.evidence, /does not exist|no Pest test/);
  });

  it("is absent when the description does not name the rule", () => {
    const result = check({ kind: "pest", id: "strict types" }, "BE-001");
    assert.equal(result.present, false);
    assert.match(result.evidence, /must contain the rule ID BE-001/);
  });

  it("is absent with the wrong suffix, when skipped, in a skipped describe or marked skipped", () => {
    const gate = { kind: "pest", id: "BE-001 strict types" };
    repo.write(`${LARAVEL}/tests/Unit/Arch.php`, "<?php\narch('BE-001 strict types');\n");
    assert.match(check(gate, "BE-001").evidence, /^no Pest test "BE-001 strict types"/);
    repo.write(
      `${LARAVEL}/tests/Unit/ArchTest.php`,
      "<?php\narch('BE-001 strict types')->skip();\n",
    );
    assert.match(check(gate, "BE-001").evidence, /ArchTest\.php:2 is skipped or a todo/);
    repo.write(
      `${LARAVEL}/tests/Unit/ArchTest.php`,
      "<?php\ndescribe('arch', function () {\n  arch('BE-001 strict types');\n})->skip();\n",
    );
    assert.equal(check(gate, "BE-001").present, false);
    repo.write(
      `${LARAVEL}/tests/Unit/ArchTest.php`,
      "<?php\ntest('BE-001 strict types', function () {\n  $this->markTestSkipped('later');\n});\n",
    );
    assert.equal(check(gate, "BE-001").present, false);
  });

  it("reads the testsuites of a phpunit.xml project", () => {
    const locations = { pest: { projects: [{ root: "custom/laravel" }] } };
    const gate = { kind: "pest", id: "BE-001 strict types" };
    assert.match(check(gate, "BE-001", locations).evidence, /custom\/laravel does not exist/);
    repo.write(
      "custom/laravel/phpunit.xml",
      `<?xml version="1.0"?>\n<phpunit>\n  <testsuites>\n    <!-- <testsuite name="Old"><directory>old</directory></testsuite> -->\n    <testsuite name="Unit">\n      <directory>tests/Unit</directory>\n    </testsuite>\n  </testsuites>\n</phpunit>\n`,
    );
    repo.write("custom/laravel/tests/Other/ArchTest.php", "<?php\narch('BE-001 strict types');\n");
    assert.match(check(gate, "BE-001", locations).evidence, /^no Pest test/);
    repo.write("custom/laravel/tests/Unit/ArchTest.php", "<?php\narch('BE-001 strict types');\n");
    assert.match(
      check(gate, "BE-001", locations).evidence,
      /\(testsuite Unit of custom\/laravel\/phpunit\.xml\)$/,
    );
  });

  it("parses PHPUnit testsuites and rule names", () => {
    const suites = parsePhpunitTestsuites(
      '<testsuites><testsuite name="Unit"><directory suffix=".php">tests/Unit</directory><file>tests/Extra.php</file></testsuite><testsuite name="Feature"><directory>./tests/Feature/</directory></testsuite></testsuites>',
    );
    assert.deepEqual(suites, [
      {
        name: "Unit",
        directories: [{ path: "tests/Unit", suffix: ".php" }],
        files: ["tests/Extra.php"],
      },
      {
        name: "Feature",
        directories: [{ path: "./tests/Feature/", suffix: "Test.php" }],
        files: [],
      },
    ]);
    assert.equal(titleNamesRule("BE-012 hermetic env", "BE-012"), true);
    assert.equal(titleNamesRule("it keeps BE_012", "BE-012"), true);
    assert.equal(titleNamesRule("BE-0123 other", "BE-012"), false);
    assert.equal(titleNamesRule("XBE-012", "BE-012"), false);
  });
});

describe("phpstan gates", () => {
  const VENDORED = `${TEMPLATES}/laravel/vendor/laravel`;
  const ruleClass = (body, base = VENDORED) =>
    repo.write(
      `${base}/src/Rules/NoInlineValidationRule.php`,
      `<?php\n\ndeclare(strict_types=1);\n\nnamespace CrossStack\\Laravel\\Rules;\n\nuse PHPStan\\Rules\\Rule;\n\nfinal class NoInlineValidationRule implements Rule\n{\n${body}\n}\n`,
    );
  const gate = { kind: "phpstan", id: "crossStack.inlineValidation" };

  it("is present when a vendored rule class uses the identifier and a shipped neon registers it", () => {
    ruleClass(
      "    public function processNode(): array\n    {\n        return [RuleErrorBuilder::message('x')->identifier('crossStack.inlineValidation')->build()];\n    }",
    );
    repo.write(
      `${VENDORED}/extension.neon`,
      "# Rules\nrules:\n    - CrossStack\\Laravel\\Rules\\NoInlineValidationRule\n",
    );
    const result = check(gate, "BE-001");
    assert.equal(result.present, true, result.evidence);
    assert.equal(
      result.evidence,
      `identifier crossStack.inlineValidation in CrossStack\\Laravel\\Rules\\NoInlineValidationRule (${VENDORED}/src/Rules/NoInlineValidationRule.php:13), registered in ${VENDORED}/extension.neon:3`,
    );
  });

  it("accepts a service registration with a leading backslash in the template's neon", () => {
    ruleClass("    private const ID = 'crossStack.inlineValidation';");
    repo.write(
      `${TEMPLATES}/laravel/phpstan.neon.dist`,
      "services:\n    -\n        class: \\CrossStack\\Laravel\\Rules\\NoInlineValidationRule\n        tags: [phpstan.rules.rule]\n",
    );
    assert.equal(check(gate, "BE-001").present, true);
  });

  it("never counts a rule class that only the unvendored packages/ source has", () => {
    ruleClass("    private const ID = 'crossStack.inlineValidation';", "packages/laravel");
    repo.write(
      "packages/laravel/extension.neon",
      "rules:\n    - CrossStack\\Laravel\\Rules\\NoInlineValidationRule\n",
    );
    assert.match(check(gate, "BE-001").evidence, /^no PHPStan rule class uses the identifier/);
  });

  it("is absent without the identifier, outside a Rule class, or unregistered", () => {
    assert.match(
      check(gate, "BE-001").evidence,
      /^no PHPStan rule class uses the identifier crossStack\.inlineValidation/,
    );
    ruleClass("    // ->identifier('crossStack.inlineValidation')");
    assert.match(check(gate, "BE-001").evidence, /^no PHPStan rule class/);
    repo.write(
      `${VENDORED}/src/Support/Helper.php`,
      "<?php\nnamespace X;\nclass Helper { const ID = 'crossStack.inlineValidation'; }\n",
    );
    assert.match(check(gate, "BE-001").evidence, /^no PHPStan rule class/);
    ruleClass("    private const ID = 'crossStack.inlineValidation';");
    repo.write(
      `${VENDORED}/extension.neon`,
      "rules:\n    # - CrossStack\\Laravel\\Rules\\NoInlineValidationRule\n",
    );
    assert.match(
      check(gate, "BE-001").evidence,
      /uses crossStack\.inlineValidation but no shipped NEON file registers it/,
    );
  });

  it("finds rule classes and registrations", () => {
    const source =
      "<?php\nnamespace A\\B;\nclass One implements \\PHPStan\\Rules\\Rule { const X = 'id.one'; }\nclass Two { const X = 'id.one'; }\n";
    assert.deepEqual(findRuleClassesWithIdentifier(source, "id.one"), [
      { fqcn: "A\\B\\One", line: 3 },
    ]);
    assert.equal(neonRegistrationLine("rules:\n\n  - 'A\\B\\One'\n", "A\\B\\One"), 3);
    assert.equal(neonRegistrationLine("rules:\n  - A\\B\\OneMore\n", "A\\B\\One"), 0);
  });
});

describe("eslint gates", () => {
  const PKG = `${TEMPLATES}/web/vendor/eslint-config`;
  const vendored = (files) => {
    repo.write(`${PKG}/package.json`, {
      name: "@cross-stack-standard/eslint-config",
      exports: { ".": "./index.js" },
    });
    for (const [rel, text] of Object.entries(files)) repo.write(`${PKG}/${rel}`, text);
  };
  const ruleModule = () =>
    repo.write(
      `${PKG}/src/rules/no-client-pagination.js`,
      "export default { meta: {}, create() { return {}; } };\n",
    );

  it("is present for a cross-stack rule with a vendored module and an enabling entry-point config", () => {
    ruleModule();
    vendored({
      "index.js": 'import web from "./configs/web.js";\nexport default [...web];\n',
      "configs/web.js":
        'export default [{\n  rules: {\n    "cross-stack/no-client-pagination": "error",\n  },\n}];\n',
    });
    const result = check({ kind: "eslint", id: "cross-stack/no-client-pagination" }, "WEB-001");
    assert.equal(result.present, true, result.evidence);
    assert.equal(
      result.evidence,
      `rule module ${PKG}/src/rules/no-client-pagination.js; enabled (error) at ${PKG}/configs/web.js:3; static inspection`,
    );
  });

  it("never counts an unvendored package or a file the entry point does not load", () => {
    repo.write("packages/eslint-config/src/rules/no-client-pagination.js", "export default {};\n");
    repo.write(
      "packages/eslint-config/index.js",
      'export default [{ rules: { "cross-stack/no-client-pagination": "error" } }];\n',
    );
    assert.match(
      check({ kind: "eslint", id: "cross-stack/no-client-pagination" }, "WEB-002").evidence,
      /^no rule module for cross-stack\/no-client-pagination/,
    );
    ruleModule();
    vendored({
      "index.js": "export default [];\n",
      "scratch-notes.mjs":
        'export default [{ rules: { "cross-stack/no-client-pagination": "error" } }];\n',
    });
    const result = check({ kind: "eslint", id: "cross-stack/no-client-pagination" }, "WEB-002");
    assert.equal(result.present, false);
    assert.match(
      result.evidence,
      /no shipped config enables cross-stack\/no-client-pagination explicitly/,
    );
  });

  it("is absent for a cross-stack rule without a module", () => {
    vendored({
      "index.js": 'export default [{ rules: { "cross-stack/no-client-pagination": "error" } }];\n',
    });
    assert.match(
      check({ kind: "eslint", id: "cross-stack/no-client-pagination" }, "WEB-001").evidence,
      /^no rule module for cross-stack\/no-client-pagination/,
    );
  });

  it("checks core rules against the installed ESLint", () => {
    vendored({
      "index.js": "export default [{ rules: { 'no-console': ['warn', { allow: [] }] } }];\n",
    });
    assert.match(
      check({ kind: "eslint", id: "no-console" }, "WEB-001").evidence,
      /ESLint is not installed \(run npm ci\)/,
    );
    repo.write("node_modules/eslint/lib/rules/no-console.js", "");
    const result = check({ kind: "eslint", id: "no-console" }, "WEB-001");
    assert.equal(result.present, true, result.evidence);
    assert.match(
      result.evidence,
      /^core rule \(node_modules\/eslint\/lib\/rules\/no-console\.js\); enabled \(warn\)/,
    );
    assert.match(
      check({ kind: "eslint", id: "no-such-rule" }, "WEB-001").evidence,
      /no-such-rule is not an ESLint core rule/,
    );
  });

  it("requires error for a FORCED or GUARDED rule", () => {
    repo.write("node_modules/eslint/lib/rules/no-console.js", "");
    vendored({ "index.js": "export default [{ rules: { 'no-console': 'warn' } }];\n" });
    const warned = check({ kind: "eslint", id: "no-console" }, "WEB-001", undefined, {
      enforcement: "FORCED",
    });
    assert.equal(warned.present, false);
    assert.match(warned.evidence, /only a warning at .*index\.js:1; a FORCED rule needs "error"/);
  });

  it("accepts third-party plugin rules that a template config enables", () => {
    repo.write(
      `${TEMPLATES}/web/eslint.config.mjs`,
      'export default [{ rules: { "@eslint-community/eslint-comments/require-description": 2 } }];\n',
    );
    const result = check(
      { kind: "eslint", id: "@eslint-community/eslint-comments/require-description" },
      "WEB-001",
    );
    assert.equal(result.present, true, result.evidence);
    assert.match(
      result.evidence,
      /plugin rule of @eslint-community\/eslint-comments \(definition not verified statically\); enabled \(error\)/,
    );
  });

  it("is absent when the last setting is off, when a template turns it off, or only in a comment or test", () => {
    repo.write("node_modules/eslint/lib/rules/no-console.js", "");
    vendored({
      "index.js":
        'export default [\n  { rules: { "no-console": "error" } },\n  { rules: { "no-console": "off" } },\n];\n// "no-console": "error"\n',
      "test/config.test.js": 'const rules = { "no-console": "error" };\n',
    });
    assert.match(
      check({ kind: "eslint", id: "no-console" }, "WEB-001").evidence,
      /no shipped config enables no-console explicitly/,
    );
    vendored({ "index.js": 'export default [{ rules: { "no-console": "error" } }];\n' });
    repo.write(
      `${TEMPLATES}/web/eslint.config.mjs`,
      'export default [{ rules: { "no-console": 0 } }];\n',
    );
    assert.match(
      check({ kind: "eslint", id: "no-console" }, "WEB-001").evidence,
      /no-console is turned off in plugins\/cross-stack-standard\/templates\/web\/eslint\.config\.mjs:1/,
    );
  });

  it("requires the discriminator inside the enabling rule's options", () => {
    repo.write("node_modules/eslint/lib/rules/no-restricted-syntax.js", "");
    vendored({
      "index.js":
        'const note = "JSXAttribute[name.name=\'dangerouslySetInnerHTML\'] was removed";\nexport default [{ rules: { "no-restricted-syntax": ["error", { selector: "TSEnumDeclaration", message: "No enums" }] } }];\n',
    });
    assert.equal(
      check(
        { kind: "eslint", id: "no-restricted-syntax", discriminator: "TSEnumDeclaration" },
        "WEB-001",
      ).present,
      true,
    );
    const elsewhere = check(
      {
        kind: "eslint",
        id: "no-restricted-syntax",
        discriminator: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
      },
      "WEB-001",
    );
    assert.equal(elsewhere.present, false, "a mention outside the rule's options does not count");
    assert.match(elsewhere.evidence, /is not in that rule's options/);
  });

  it("finds settings, entry points and the effective setting", () => {
    assert.deepEqual(findEnabledRule("{ 'a/b': ['error'] }", "a/b"), {
      line: 1,
      severity: "error",
    });
    assert.deepEqual(findEnabledRule('{\n "a": 1 }', "a"), { line: 2, severity: "warn" });
    assert.equal(findEnabledRule('{ "a": 0, "ab": "error" }', "a"), null);
    assert.equal(findEnabledRule('{ "a": 12 }', "a"), null);
    assert.equal(findEnabledRule('[{ "a": "error" }, { "a": "off" }]', "a"), null);
    assert.deepEqual(
      findRuleSettings('[{ "a": ["warn", { x: 1 }] }, { "a": "error" }]', "a").map(
        (s) => s.severity,
      ),
      ["warn", "error"],
    );
    assert.deepEqual(
      packageEntryPoints({
        exports: { ".": { import: "./a.js", require: "./b.cjs" }, "./x": "./x.js" },
      }),
      ["a.js", "b.cjs", "x.js"],
    );
    assert.deepEqual(packageEntryPoints({ main: "./lib/main.js" }), ["lib/main.js"]);
    assert.deepEqual(packageEntryPoints({}), ["index.js"]);
  });
});

describe("depcruise gates", () => {
  const PKG = `${TEMPLATES}/web/vendor/dependency-cruiser-config`;

  it("is present when a vendored entry point or a template config declares the rule name", () => {
    repo.write(`${PKG}/package.json`, { name: "x", main: "index.cjs" });
    repo.write(
      `${PKG}/index.cjs`,
      "module.exports = {\n  forbidden: [\n    {\n      name: 'no-circular',\n      severity: 'error',\n    },\n  ],\n};\n",
    );
    const result = check({ kind: "depcruise", id: "no-circular" }, "WEB-001");
    assert.equal(result.present, true, result.evidence);
    assert.equal(result.evidence, `rule "no-circular" at ${PKG}/index.cjs:4; static inspection`);
    repo.write(
      `${TEMPLATES}/mobile/.dependency-cruiser.json`,
      '{ "forbidden": [ { "name": "mobile-api-layer" } ] }\n',
    );
    assert.equal(check({ kind: "depcruise", id: "mobile-api-layer" }, "MOB-001").present, true);
  });

  it("is absent when the name is missing, only in a comment, or only in packages/", () => {
    assert.match(
      check({ kind: "depcruise", id: "no-circular" }, "WEB-001").evidence,
      /^no dependency-cruiser rule named "no-circular"/,
    );
    repo.write(
      "packages/dependency-cruiser-config/index.cjs",
      "module.exports = { forbidden: [ { name: 'no-circular' } ] };\n",
    );
    assert.equal(check({ kind: "depcruise", id: "no-circular" }, "WEB-001").present, false);
    repo.write(`${PKG}/package.json`, { name: "x", main: "index.cjs" });
    repo.write(
      `${PKG}/index.cjs`,
      "module.exports = { forbidden: [ /* { name: 'no-circular' } */ { name: 'no-circular-deps' } ] };\n",
    );
    assert.equal(check({ kind: "depcruise", id: "no-circular" }, "WEB-001").present, false);
  });

  it("reads names in JavaScript and JSON", () => {
    assert.equal(findDepcruiseRuleName('{\n"name": "x"}', "x"), 2);
    assert.equal(findDepcruiseRuleName("{ comment: 'name: \"x\"' }", "x"), 0);
  });
});

describe("vitest gates", () => {
  const WEB = `${TEMPLATES}/web`;
  const gate = { kind: "vitest", id: "architecture: names under src are kebab-case" };

  it("is present in a template file the project's include matches", () => {
    repo.write(
      `${WEB}/vitest.config.ts`,
      'export default defineConfig({\n  test: {\n    coverage: { include: ["lib/**"] },\n    include: ["src/**/*.test.ts"],\n  },\n});\n',
    );
    repo.write(`${WEB}/src/arch.test.ts`, `it("${gate.id}", () => {});\n`);
    const result = check(gate, "WEB-001");
    assert.equal(result.present, true, result.evidence);
    assert.equal(
      result.evidence,
      `it("${gate.id}") at ${WEB}/src/arch.test.ts:1 (${WEB}/vitest.config.ts)`,
    );
  });

  it("uses Vitest's default include without a config", () => {
    repo.write(`${WEB}/tests/arch.spec.mjs`, `test("${gate.id}", () => {});\n`);
    assert.match(check(gate, "WEB-001").evidence, /\(Vitest default include\)$/);
  });

  it("finds titles in a vendored factory package's sources, not in the fixture host", () => {
    repo.write("test/harness/web/src/arch.test.ts", `it("${gate.id}", () => {});\n`);
    assert.equal(check(gate, "WEB-001").present, false);
    repo.write(
      `${WEB}/vendor/vitest-arch/src/suite.js`,
      `export function define() { it("${gate.id}", () => {}); }\n`,
    );
    assert.match(
      check(gate, "WEB-001").evidence,
      /vendor\/vitest-arch\/src\/suite\.js:1 \(runs through plugins\/cross-stack-standard\/templates\/web\)/,
    );
  });

  it("is absent outside the include, when skipped (also in a skipped describe), or with a different title", () => {
    repo.write(
      `${WEB}/vitest.config.mts`,
      'export default { test: { include: ["src/**/*.test.ts"] } };\n',
    );
    repo.write(`${WEB}/tests/arch.test.ts`, `it("${gate.id}", () => {});\n`);
    repo.write(
      `${WEB}/src/other.test.ts`,
      'it("architecture: names under src are kebab case", () => {});\n',
    );
    assert.match(check(gate, "WEB-001").evidence, /^no vitest test titled/);
    repo.write(`${WEB}/src/arch.test.ts`, `it.skip("${gate.id}", () => {});\n`);
    assert.match(
      check(gate, "WEB-001").evidence,
      /arch\.test\.ts:1 is skipped, a todo or conditional/,
    );
    repo.write(
      `${WEB}/src/arch.test.ts`,
      `describe.skip("arch", () => {\n  it("${gate.id}", () => {});\n});\n`,
    );
    assert.match(
      check(gate, "WEB-001").evidence,
      /arch\.test\.ts:2 is skipped, a todo or conditional/,
    );
  });

  it("reads test.include but not coverage.include", () => {
    assert.deepEqual(
      readVitestInclude(
        "defineConfig({ test: { coverage: { include: ['a/**'] }, include: ['b/**', \"c/**\"] } })",
      ),
      ["b/**", "c/**"],
    );
    assert.equal(
      readVitestInclude("defineConfig({ test: { coverage: { include: ['a/**'] } } })"),
      null,
    );
    assert.equal(readVitestInclude("defineConfig({ plugins: [] })"), null);
  });
});

describe("jest gates", () => {
  const MOBILE = `${TEMPLATES}/mobile`;
  const gate = { kind: "jest", id: "maps each configured status to an error kind" };

  it("is present with Jest's default testMatch in the mobile template", () => {
    repo.write(`${MOBILE}/src/lib/__tests__/errors.ts`, `it("${gate.id}", () => {});\n`);
    assert.equal(check(gate, "MOB-001").present, true);
  });

  it("never counts a test that only the fixture host has", () => {
    repo.write("test/harness/mobile/src/lib/__tests__/errors.ts", `it("${gate.id}", () => {});\n`);
    assert.equal(check(gate, "MOB-001").present, false);
  });

  it("honours testMatch from jest.config and package.json", () => {
    repo.write(
      `${MOBILE}/jest.config.js`,
      "module.exports = { preset: 'jest-expo', testMatch: ['<rootDir>/checks/**/*.check.ts'] };\n",
    );
    repo.write(`${MOBILE}/src/errors.test.ts`, `it("${gate.id}", () => {});\n`);
    assert.equal(check(gate, "MOB-001").present, false);
    repo.write(`${MOBILE}/checks/errors.check.ts`, `test("${gate.id}", () => {});\n`);
    assert.match(
      check(gate, "MOB-001").evidence,
      /checks\/errors\.check\.ts:1 \(plugins\/cross-stack-standard\/templates\/mobile\/jest\.config\.js\)/,
    );
  });

  it("reads testMatch from package.json", () => {
    repo.write(`${MOBILE}/package.json`, { jest: { testMatch: ["**/*.jest.ts"] } });
    repo.write(`${MOBILE}/src/errors.jest.ts`, `it("${gate.id}", () => {});\n`);
    assert.match(
      check(gate, "MOB-001").evidence,
      /\(plugins\/cross-stack-standard\/templates\/mobile\/package\.json\)$/,
    );
  });

  it("is absent without a matching test", () => {
    assert.match(check(gate, "MOB-001").evidence, /^no jest test titled/);
    assert.deepEqual(readJestTestMatch('{ "testMatch": ["a/**"] }'), ["a/**"]);
    assert.equal(readJestTestMatch("module.exports = {}"), null);
  });
});

describe("ci gates", () => {
  const workflow = [
    "name: web quality",
    "on:",
    "  workflow_call:",
    "jobs:",
    "  quality:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - id: contract-drift",
    "        run: npm run contract:check",
    "      - name: secret-scan",
    "        uses: example/secret-scan-action@0000000000000000000000000000000000000000",
    "  commits:",
    "    steps:",
    "      - name: commitlint",
    "        run: npx commitlint --from ${{ inputs.base }}",
  ].join("\n");

  it("is present for a step with a local command, by id or name", () => {
    repo.write(`${PLUGIN}/templates/ci/web-quality.yml`, workflow);
    const byId = check({ kind: "ci", id: "contract-drift" });
    assert.equal(byId.present, true, byId.evidence);
    assert.equal(
      byId.evidence,
      'step "contract-drift" at plugins/cross-stack-standard/templates/ci/web-quality.yml:8 (job quality) runs `npm run contract:check`',
    );
    assert.equal(check({ kind: "ci", id: "commitlint", discriminator: "commits" }).present, true);
  });

  it("is absent for an action-only step, the wrong job or a missing step", () => {
    repo.write(`${PLUGIN}/templates/ci/web-quality.yml`, workflow);
    assert.match(
      check({ kind: "ci", id: "secret-scan" }).evidence,
      /web-quality\.yml:10 \(job quality\) has no local command/,
    );
    assert.match(
      check({ kind: "ci", id: "commitlint", discriminator: "quality" }).evidence,
      /^no workflow step "commitlint" in job quality/,
    );
    assert.match(
      check({ kind: "ci", id: "absent" }).evidence,
      /^no workflow step "absent" in plugins\/cross-stack-standard\/templates\/ci\/web-quality\.yml$/,
    );
  });
});

describe("client and shared rules", () => {
  const eslintConfig = (track, rules) =>
    repo.write(
      `${TEMPLATES}/${track}/eslint.config.mjs`,
      `export default [{ rules: ${JSON.stringify(rules)} }];\n`,
    );
  const clientRule = (gate, id = "WEB-021") =>
    checkGatePresence({ id, track: "client", gate }, createPresenceContext({ root: repo.root }));

  it("expands {track} to web and mobile only, script candidates included", () => {
    assert.deepEqual(tracksFor({ track: "client" }), ["web", "mobile"]);
    const client = expandLocations(DEFAULT_LOCATIONS, tracksFor({ track: "client" }));
    assert.deepEqual(client.script.chains, [
      `${TEMPLATES}/web/package.json`,
      `${TEMPLATES}/mobile/package.json`,
      `${TEMPLATES}/web/composer.json`,
      `${TEMPLATES}/mobile/composer.json`,
      `${TEMPLATES}/web/lefthook.yml`,
      `${TEMPLATES}/mobile/lefthook.yml`,
    ]);
    assert.deepEqual(
      client.script.candidates.map((candidate) => candidate.file),
      [
        BIN,
        `${PLUGIN}/scripts/{id}.mjs`,
        `${TEMPLATES}/web/vendor/{id}/bin/{id}.mjs`,
        `${TEMPLATES}/mobile/vendor/{id}/bin/{id}.mjs`,
      ],
    );
  });

  it("requires every track that ships an ESLint config to enable a client rule", () => {
    repo.write("node_modules/eslint/lib/rules/max-lines.js", "");
    const gate = { kind: "eslint", id: "max-lines" };
    eslintConfig("web", { "max-lines": "error" });
    const webOnly = clientRule(gate);
    assert.equal(webOnly.present, true, "a track that ships no ESLint config is skipped");
    assert.match(webOnly.evidence, /^web: core rule/);
    eslintConfig("mobile", { "no-console": "error" });
    const missing = clientRule(gate);
    assert.equal(missing.present, false, "the web config alone does not prove a client rule");
    assert.match(missing.evidence, /^mobile: core rule .*no shipped config enables max-lines/);
    eslintConfig("mobile", { "max-lines": ["error", { max: 250 }] });
    const both = clientRule(gate);
    assert.equal(both.present, true, both.evidence);
    assert.match(both.evidence, /^web: .*; mobile: /);
  });

  it("is absent when no track of a client rule ships an ESLint config", () => {
    repo.write("node_modules/eslint/lib/rules/max-lines.js", "");
    assert.deepEqual(clientRule({ kind: "eslint", id: "max-lines" }), {
      present: false,
      evidence: "no eslint configuration ships for any track of the client rule (web, mobile)",
    });
  });

  it("requires every track that ships a dependency-cruiser config to declare the rule", () => {
    const gate = { kind: "depcruise", id: "no-circular" };
    repo.write(
      `${TEMPLATES}/web/.dependency-cruiser.json`,
      '{ "forbidden": [ { "name": "no-circular" } ] }\n',
    );
    repo.write(
      `${TEMPLATES}/mobile/.dependency-cruiser.json`,
      '{ "forbidden": [ { "name": "mobile-api-layer" } ] }\n',
    );
    const missing = clientRule(gate, "WEB-007");
    assert.equal(missing.present, false);
    assert.match(missing.evidence, /^mobile: no dependency-cruiser rule named "no-circular"/);
    repo.write(
      `${TEMPLATES}/mobile/.dependency-cruiser.json`,
      '{ "forbidden": [ { "name": "no-circular" } ] }\n',
    );
    assert.equal(clientRule(gate, "WEB-007").present, true);
  });

  it("finds a vendored package's own command and needs both client chains, never the Laravel one", () => {
    repo.write(
      `${TEMPLATES}/web/vendor/i18n-parity/bin/i18n-parity.mjs`,
      listingScript("--list-checks", ["i18n-parity:keys  Key parity."]),
    );
    const parity = "node .cross-stack/vendor/i18n-parity/bin/i18n-parity.mjs keys";
    repo.write(`${TEMPLATES}/web/package.json`, { scripts: { check: parity } });
    repo.write(`${TEMPLATES}/mobile/package.json`, { scripts: { check: "eslint ." } });
    repo.write(`${TEMPLATES}/laravel/composer.json`, { scripts: { check: ["@php artisan test"] } });
    const gate = { kind: "script", id: "i18n-parity", discriminator: "keys" };
    const missing = clientRule(gate, "I18N-033");
    assert.equal(missing.present, false);
    assert.match(
      missing.evidence,
      /i18n-parity\.mjs --list-checks lists i18n-parity:keys, but the check chain in plugins\/cross-stack-standard\/templates\/mobile does not run it$/,
    );
    repo.write(`${TEMPLATES}/mobile/package.json`, { scripts: { check: parity } });
    const present = clientRule(gate, "I18N-033");
    assert.equal(present.present, true, present.evidence);
    assert.match(present.evidence, /run by the check chain in .*\/mobile, .*\/web$/);
  });
});
