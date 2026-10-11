/**
 * The kit tool's opt-out line matcher: the same tolerant forms as the hooks' guard, and linear
 * time on hostile input (a long run of spaces or tabs must not stall doctor).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  findOptOutLine,
  isOptOutLine,
} from "../../../plugins/cross-stack-standard/templates/shared/cross-stack/bin/cross-stack.mjs";

describe("kit tool: opt-out line", () => {
  test("accepts the tolerant forms", () => {
    for (const line of [
      "cross-stack-standard: declined",
      "  - `cross-stack-standard: declined`.",
      "> ## **Cross-Stack-Standard**: DECLINED",
      "1. cross-stack-standard : declined",
    ]) {
      assert.equal(isOptOutLine(line), true, line);
    }
  });

  test("rejects lines that hold anything else", () => {
    for (const line of [
      "cross-stack-standard: declined because of x",
      "we once had cross-stack-standard: declined",
      "cross-stack-standard: enabled",
    ]) {
      assert.equal(isOptOutLine(line), false, line);
    }
  });

  test("ignores fenced code blocks and reports the line number", () => {
    const text =
      "# T\n\n```\ncross-stack-standard: declined\n```\n\ncross-stack-standard: declined\n";
    assert.equal(findOptOutLine(text), 7);
  });

  test("runs in linear time on a 1 MiB line of tabs and spaces", () => {
    const hostile = `${" \t".repeat(512 * 1024)}cross-stack-standard x`;
    const text = `${hostile}\n${"  ".repeat(300)}cross-stack-standard:${" ".repeat(200)}nope\n`;
    const started = process.cpuUsage();
    assert.equal(findOptOutLine(text), 0);
    const cpu = process.cpuUsage(started);
    assert.ok((cpu.user + cpu.system) / 1000 < 500, "matcher used too much CPU");
  });
});
