#!/usr/bin/env node
// Fixture stub standing in for ESLint (`eslint [options] <file>`), trimmed from the hook tests'
// stub. It prints a report in ESLint's JSON format and exits like ESLint: 0 clean, 1 errors.
// A line containing `lint-error <rule> <message>` is an error on that line.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const file = process.argv.at(-1);
const source = fs.readFileSync(file, "utf8");
const messages = [];
source.split("\n").forEach((text, index) => {
  const match = /lint-error (\S+) (.+)$/.exec(text);
  if (match) {
    messages.push({
      ruleId: match[1],
      severity: 2,
      message: match[2].trim(),
      line: index + 1,
      column: match.index + 1,
      nodeType: "Identifier",
    });
  }
});
const report = [
  {
    filePath: path.resolve(file),
    messages,
    suppressedMessages: [],
    errorCount: messages.length,
    fatalErrorCount: 0,
    warningCount: 0,
    fixableErrorCount: 0,
    fixableWarningCount: 0,
    usedDeprecatedRules: [],
  },
];
process.stdout.write(`${JSON.stringify(report)}\n`);
process.exitCode = messages.length > 0 ? 1 : 0;
