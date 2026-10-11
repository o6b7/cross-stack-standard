/**
 * ESLint flat config for this repository's own JavaScript: repo tooling (scripts/), the plugin's
 * runtime code (plugins/), the gate packages' sources (packages/) and the tests (test/).
 *
 * The gate packages ship their own configs for adopters; this file only lints the repository.
 */
import js from "@eslint/js";
import globals from "globals";

const BUILTINS_ONLY =
  "Use Node.js built-ins (node:*) or a relative import: repo tooling and the plugin have no runtime dependencies.";

const NO_SHELL =
  "Do not start child processes through a shell (quoting breaks on Windows and it opens an injection path): pass the program and an argument array to spawn, spawnSync, execFile or execFileSync.";

/** `exec` and `execSync` always run a shell. */
const NO_SHELL_IMPORTS = ["node:child_process", "child_process"].map((name) => ({
  name,
  importNames: ["exec", "execSync"],
  message: NO_SHELL,
}));

/**
 * Restrict imports to `node:` built-ins, relative paths and any extra allowed packages, and ban
 * the child-process functions that always use a shell.
 */
function builtinsOnly(allowed = []) {
  const extra = allowed
    .map((name) => `|${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`)
    .join("");
  return [
    "error",
    {
      paths: NO_SHELL_IMPORTS,
      patterns: [{ regex: `^(?!node:|\\.{1,2}/${extra})`, message: BUILTINS_ONLY }],
    },
  ];
}

export default [
  {
    ignores: [
      "**/node_modules/",
      "**/vendor/",
      "_input/",
      "_work/",
      // A separate local application with its own lint workflow; it is not part of this repo.
      "web/",
      ".cache/",
      "coverage/",
      // Generated files; their generators are linted instead.
      "docs/rules/",
      "plugins/cross-stack-standard/data/",
      // Fixture and harness inputs contain deliberate violations or third-party app code.
      "test/harness/",
      "test/**/fixtures/",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      // `x == null` stays allowed: it is the idiomatic null-or-undefined check.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-var": "error",
      "prefer-const": "error",
      "object-shorthand": ["error", "always"],
      "no-throw-literal": "error",
      // Any `shell` option other than a literal false: true, a shell name, a condition such as
      // `process.platform === "win32"`, a variable, or the shorthand `{ shell }`.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='shell']:not([value.type='Literal'][value.value=false])",
          message: NO_SHELL,
        },
        {
          selector: "Property[key.value='shell']:not([value.type='Literal'][value.value=false])",
          message: NO_SHELL,
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^exec(?:Sync)?$/][callee.object.type='CallExpression'][callee.object.callee.name='require'][callee.object.arguments.0.value=/^(?:node:)?child_process$/]",
          message: NO_SHELL,
        },
      ],
      "no-restricted-imports": ["error", { paths: NO_SHELL_IMPORTS }],
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    // Repo-only validators may use ajv (a root devDependency) and must say so in a header comment.
    files: ["scripts/**/*.{js,mjs,cjs}"],
    rules: { "no-restricted-imports": builtinsOnly(["ajv"]) },
  },
  {
    files: ["plugins/**/*.{js,mjs,cjs}"],
    rules: { "no-restricted-imports": builtinsOnly() },
  },
  {
    // Adopter config templates import the adopter's own dev dependencies once copied.
    files: ["plugins/*/templates/**/*.{js,mjs,cjs}"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // The kit runtime copied into adopter projects stays dependency-free.
    files: ["plugins/*/templates/shared/cross-stack/**/*.{js,mjs,cjs}"],
    rules: { "no-restricted-imports": builtinsOnly() },
  },
];
