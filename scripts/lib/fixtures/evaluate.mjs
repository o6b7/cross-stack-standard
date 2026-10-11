/**
 * Judge a gate run. Exit codes decide pass or fail; text is only searched for rule ids, and only
 * after path-like tokens are removed, so a file or directory name can never count as a printed
 * id. An expect.idPattern sees the output with its paths, but its match must name the gate id.
 *
 * - The clean run must exit 0 and print no rule id (and not match the fixture's idPattern): an
 *   advisory or warning finding is not "clean".
 * - The violation run must fail (with one of the host's failExitCodes when set), print the rule
 *   id (or match idPattern, whose match must name the gate id), print no other rule id unless the
 *   fixture lists it in `alsoFires`, and the id must be new: an id the clean run also printed
 *   (a banner, a passing test's title) proves nothing.
 * - With a JUnit report (test-runner hosts), the test named after the gate id must have run and
 *   passed in the clean run, and run and failed in the violation run.
 *
 * @module
 */
import { underscoreForm } from "./ids.mjs";

/**
 * @typedef {object} GateOutcome
 * @property {number | null} exitCode Exit code.
 * @property {string | null} signal Terminating signal.
 * @property {boolean} timedOut Whether the run timed out.
 * @property {string | null} error Infrastructure error (work directory, spawn), if any.
 * @property {string} output Sanitised combined output.
 * @property {number} timeoutMs Timeout that applied.
 * @property {string | null} [junit] JUnit XML the gate wrote, when the host declares one.
 */

function describeExit(outcome) {
  if (outcome.signal) return `was killed by ${outcome.signal}`;
  return `exited ${outcome.exitCode}`;
}

/**
 * Remove path-like tokens before searching output for ids: anything with a `/`; Windows paths
 * that start with a drive letter, a UNC prefix, `.\` or `..\`, or a sanitised marker
 * (`<workdir>\…`, `<tmp>\…`, `<root>\…`, `~\…`); and any token that contains one of `fileNames`
 * (fixture files and directories whose names contain a rule id, so a relative Windows path to
 * them is covered too). A backslash alone does not make a path: PHP class names such as
 * `P\Tests\Unit\ArchTest::__pest_evaluable_BE_012_x` carry test-runner ids.
 *
 * @param {string} text Sanitised output.
 * @param {string[]} [fileNames] Fixture file and directory names that contain a rule id.
 * @returns {string} Output with those tokens replaced by a space.
 */
export function stripPathTokens(text, fileNames = []) {
  let out = text
    .replace(/[^\s"'`()[\]{}<>]*\/[^\s"'`()[\]{}]*/gu, " ")
    .replace(
      /(?:^|(?<=[\s"'`(]))(?:[A-Za-z]:\\|\\\\|\.{1,2}\\|<(?:workdir|tmp|root)>\\|~\\)\S*/gu,
      " ",
    );
  for (const name of fileNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    out = out.replace(new RegExp(`\\S*${escaped}\\S*`, "gu"), " ");
  }
  return out;
}

/**
 * @typedef {object} JunitCase
 * @property {string} name Test case name.
 * @property {"passed" | "failed" | "skipped"} status
 */

/**
 * Parse the test cases of a JUnit XML report (the format Pest, PHPUnit, Vitest and Jest
 * reporters write): name and status of every `<testcase>`.
 *
 * @param {string} xml Report text.
 * @returns {JunitCase[]}
 */
export function parseJunitCases(xml) {
  const decode = (text) =>
    text
      .replace(/&lt;/gu, "<")
      .replace(/&gt;/gu, ">")
      .replace(/&quot;/gu, '"')
      .replace(/&apos;/gu, "'")
      .replace(/&amp;/gu, "&");
  const cases = [];
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/gu)) {
    const name = /\bname\s*=\s*"([^"]*)"/u.exec(match[1])?.[1];
    if (name === undefined) continue;
    const body = match[3] ?? "";
    const status = /<(?:failure|error)\b/u.test(body)
      ? "failed"
      : /<skipped\b/u.test(body)
        ? "skipped"
        : "passed";
    cases.push({ name: decode(name), status });
  }
  return cases;
}

/**
 * Status of the test named after the gate id in a JUnit report ("missing" when no test case's
 * name contains it).
 *
 * @param {string | null | undefined} xml Report text.
 * @param {string} gateId Test title from the registry.
 * @returns {"passed" | "failed" | "skipped" | "missing" | "no-report"}
 */
export function junitStatus(xml, gateId) {
  if (typeof xml !== "string") return "no-report";
  const found = parseJunitCases(xml).filter(
    (testCase) => testCase.name === gateId || testCase.name.endsWith(gateId),
  );
  if (found.length === 0) return "missing";
  if (found.some((testCase) => testCase.status === "failed")) return "failed";
  if (found.every((testCase) => testCase.status === "skipped")) return "skipped";
  return "passed";
}

/**
 * Judge a clean run.
 *
 * @param {GateOutcome} outcome Run outcome.
 * @param {object} [expectation] What the clean run must not show.
 * @param {(text: string) => string[]} [expectation.scan] Rule-id scanner.
 * @param {string | null} [expectation.idPattern] The violation fixture's id pattern.
 * @param {string | null} [expectation.junitTest] Test name that must pass (JUnit hosts).
 * @param {string[]} [expectation.fileNames] Fixture file names that contain a rule id.
 * @returns {{ ok: boolean, reasons: string[], printedIds: string[] }} Verdict, reasons for a
 *   failure, and the ids the clean run printed.
 */
export function evaluateClean(
  outcome,
  { scan, idPattern = null, junitTest = null, fileNames = [] } = {},
) {
  const reasons = [];
  const text = stripPathTokens(outcome.output ?? "", fileNames);
  const printedIds = scan ? scan(text) : [];
  if (outcome.error) reasons.push(`clean: ${outcome.error}`);
  else if (outcome.timedOut) reasons.push(`clean: timed out after ${outcome.timeoutMs} ms`);
  else {
    if (outcome.exitCode !== 0) {
      reasons.push(`clean: ${describeExit(outcome)}, expected 0 (the clean fixture must pass)`);
    }
    if (printedIds.length > 0) {
      reasons.push(
        `clean: printed ${printedIds.join(", ")}; a clean fixture must be fully clean ` +
          "(warnings and advisory findings included)",
      );
    }
    if (idPattern && new RegExp(idPattern, "m").test(outcome.output ?? "")) {
      reasons.push(
        `clean: output matches expect.idPattern /${idPattern}/, so the pattern cannot tell ` +
          "the violation apart",
      );
    }
    if (junitTest) {
      const status = junitStatus(outcome.junit, junitTest);
      if (status !== "passed") {
        reasons.push(`clean: the test "${junitTest}" ${junitReason(status)}, expected to pass`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons, printedIds };
}

function junitReason(status) {
  return {
    failed: "failed",
    skipped: "was skipped",
    missing: "is not in the JUnit report",
    "no-report": "has no JUnit report to prove it ran",
    passed: "passed",
  }[status];
}

/**
 * Judge a violation run.
 *
 * @param {GateOutcome} outcome Run outcome.
 * @param {object} expectation What the run must show.
 * @param {string} expectation.ruleId Rule id the gate must print.
 * @param {string} [expectation.gateId] The rule's gate id (an idPattern match must contain it).
 * @param {string | null} [expectation.discriminator] The gate's discriminator, when it has one.
 * @param {string[]} expectation.alsoFires Other ids the gate may print.
 * @param {string | null} expectation.idPattern Regular expression that replaces the id check.
 * @param {number[] | null} expectation.failExitCodes Exit codes that mean "violation found".
 * @param {(text: string) => string[]} expectation.scan Rule-id scanner.
 * @param {string[]} [expectation.cleanIds] Ids the clean run printed (differential check).
 * @param {string | null} [expectation.junitTest] Test name that must fail (JUnit hosts).
 * @param {string[]} [expectation.fileNames] Fixture file names that contain a rule id.
 * @returns {{ ok: boolean, reasons: string[], idPrinted: boolean, unexpectedIds: string[],
 *   alsoFired: string[] }} Verdict and details.
 */
export function evaluateViolation(
  outcome,
  {
    ruleId,
    gateId,
    discriminator = null,
    alsoFires,
    idPattern,
    failExitCodes,
    scan,
    cleanIds = [],
    junitTest = null,
    fileNames = [],
  },
) {
  const reasons = [];
  const text = stripPathTokens(outcome.output ?? "", fileNames);
  const printed = scan(text);
  let idPrinted;
  let patternProblem = null;
  if (idPattern) {
    // The pattern sees the output with paths (a finding line names its file); its match must
    // name the gate id, and the clean run must not match it (see evaluateClean).
    const match = new RegExp(idPattern, "m").exec(outcome.output ?? "");
    idPrinted = Boolean(match);
    if (match && gateId && !match[0].includes(gateId)) {
      idPrinted = false;
      patternProblem = `violation: the text matched by expect.idPattern does not name the gate id ${gateId}`;
    } else if (match && discriminator && !match[0].includes(discriminator)) {
      idPrinted = false;
      patternProblem = `violation: the text matched by expect.idPattern does not name the sub-check ${discriminator}`;
    }
  } else {
    idPrinted = printed.includes(ruleId) && !cleanIds.includes(ruleId);
  }
  const allowed = new Set([ruleId, ...alsoFires]);
  const unexpectedIds = printed.filter((id) => !allowed.has(id));
  const alsoFired = printed.filter((id) => id !== ruleId && alsoFires.includes(id));

  if (outcome.error) {
    reasons.push(`violation: ${outcome.error}`);
  } else if (outcome.timedOut) {
    reasons.push(`violation: timed out after ${outcome.timeoutMs} ms`);
  } else {
    if (outcome.exitCode === 0) {
      reasons.push(
        "violation: exited 0, expected a failure (the gate did not catch the violation)",
      );
    } else if (outcome.exitCode === null) {
      reasons.push(`violation: ${describeExit(outcome)} instead of failing with an exit code`);
    } else if (failExitCodes && !failExitCodes.includes(outcome.exitCode)) {
      reasons.push(
        `violation: exited ${outcome.exitCode}, expected ${failExitCodes.join(" or ")} ` +
          "(another exit code usually means the tool crashed)",
      );
    }
    if (patternProblem) {
      reasons.push(patternProblem);
    } else if (!idPrinted) {
      if (idPattern) {
        reasons.push(`violation: output does not match expect.idPattern /${idPattern}/`);
      } else if (printed.includes(ruleId) && cleanIds.includes(ruleId)) {
        reasons.push(
          `violation: ${ruleId} is printed by the clean run too, so printing it proves nothing`,
        );
      } else {
        reasons.push(`violation: output contains neither ${ruleId} nor ${underscoreForm(ruleId)}`);
      }
    }
    if (unexpectedIds.length > 0) {
      reasons.push(
        `violation: also printed ${unexpectedIds.join(", ")}; ` +
          "fix the fixture, or list the id in alsoFires if it is expected to fire",
      );
    }
    if (junitTest) {
      const status = junitStatus(outcome.junit, junitTest);
      if (status !== "failed") {
        reasons.push(`violation: the test "${junitTest}" ${junitReason(status)}, expected to fail`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons, idPrinted, unexpectedIds, alsoFired };
}
