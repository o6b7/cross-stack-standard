/**
 * Minimal reader for the step list of GitHub Actions workflows. It understands the block-style
 * YAML that workflows are written in (`jobs:` → job ids → `steps:` → `- key: value` items,
 * including `|`/`>` block scalars) and deliberately nothing more: flow-style collections
 * (`steps: [ … ]`), anchors and multi-document files are not supported. Node.js built-ins only.
 *
 * @module scripts/lib/gate-presence/workflow-steps
 */

import { stripHashComments } from "./files.mjs";

/**
 * @typedef {object} WorkflowStep
 * @property {string} job Job id.
 * @property {number} line 1-based line of the step's `-`.
 * @property {string | undefined} id
 * @property {string | undefined} name
 * @property {string | undefined} run
 * @property {string | undefined} uses
 */

const indentOf = (line) => line.length - line.trimStart().length;

/**
 * Decodes a plain, single-quoted or double-quoted YAML scalar.
 *
 * @param {string} raw
 * @returns {string}
 */
export function yamlScalar(raw) {
  const value = raw.trim();
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Lists every step of every job in a workflow file.
 *
 * @param {string} text Workflow YAML.
 * @returns {WorkflowStep[]}
 */
export function parseWorkflowSteps(text) {
  const lines = stripHashComments(text.replace(/\r\n?/g, "\n")).split("\n");
  const steps = [];
  const isBlank = (line) => line.trim() === "";
  const jobsLine = lines.findIndex((line) => /^jobs\s*:\s*$/.test(line));
  if (jobsLine === -1) return steps;

  let i = jobsLine + 1;
  let jobIndent = -1;
  let job = null;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const indent = indentOf(line);
    if (indent === 0) break;
    if (jobIndent === -1) jobIndent = indent;
    const jobMatch = indent === jobIndent ? /^\s*([A-Za-z0-9_-]+)\s*:\s*$/.exec(line) : null;
    if (jobMatch) {
      job = jobMatch[1];
      i += 1;
      continue;
    }
    const stepsMatch = job && indent > jobIndent ? /^\s*steps\s*:\s*$/.exec(line) : null;
    if (!stepsMatch) {
      i += 1;
      continue;
    }
    const stepsIndent = indent;
    i += 1;
    let itemIndent = -1;
    let current = null;
    let contentIndent = -1;
    while (i < lines.length) {
      const stepLine = lines[i];
      if (isBlank(stepLine)) {
        i += 1;
        continue;
      }
      const lineIndent = indentOf(stepLine);
      const dash = /^(\s*)-(\s+|$)(.*)$/.exec(stepLine);
      if (itemIndent === -1 && dash && lineIndent >= stepsIndent) itemIndent = lineIndent;
      if (lineIndent < itemIndent || (itemIndent === -1 && lineIndent <= stepsIndent)) break;
      if (dash && lineIndent === itemIndent) {
        current = {
          job,
          line: i + 1,
          id: undefined,
          name: undefined,
          run: undefined,
          uses: undefined,
        };
        steps.push(current);
        contentIndent = lineIndent + 1 + dash[2].length;
        i = readKey(lines, i, dash[3], contentIndent, current);
        continue;
      }
      if (current && lineIndent === contentIndent) {
        i = readKey(lines, i, stepLine.trim(), contentIndent, current);
        continue;
      }
      i += 1;
    }
  }
  return steps;
}

/**
 * Reads one `key: value` pair of a step (with block scalars) and returns the next line index.
 *
 * @param {string[]} lines
 * @param {number} index Line of the pair.
 * @param {string} text The pair's text without indentation.
 * @param {number} contentIndent Indentation of the step's keys.
 * @param {WorkflowStep} step Step being filled.
 * @returns {number}
 */
function readKey(lines, index, text, contentIndent, step) {
  const pair = /^([A-Za-z0-9_-]+)\s*:(?:\s+(.*))?$/.exec(text);
  let next = index + 1;
  if (!pair) return next;
  const [, key, rawValue = ""] = pair;
  let value;
  if (/^[|>][+-]?\d*$/.test(rawValue.trim())) {
    const body = [];
    while (
      next < lines.length &&
      (lines[next].trim() === "" || indentOf(lines[next]) > contentIndent)
    ) {
      body.push(lines[next].trim());
      next += 1;
    }
    value = body.join("\n").trim();
  } else {
    value = yamlScalar(rawValue);
  }
  if (["id", "name", "run", "uses"].includes(key)) step[key] = value;
  return next;
}
