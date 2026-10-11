/**
 * Gate presence for `ci` gates: a shipped workflow has a step whose `id` or `name` equals the
 * gate id (inside the job named by the discriminator, when given), and the step runs a local
 * command (`run:`) that a developer can repeat, rather than only an opaque action (`uses:`).
 *
 * @module scripts/lib/gate-presence/ci
 */

import path from "node:path";
import { listFiles, readText } from "./files.mjs";
import { parseWorkflowSteps } from "./workflow-steps.mjs";

/**
 * Checks a `ci` gate.
 *
 * @param {{ id: string, discriminator?: string }} gate
 * @param {object} _rule
 * @param {{ root: string, locations: import("./locations.mjs").Locations }} ctx
 * @returns {{ present: boolean, evidence: string }}
 */
export function checkCiGate(gate, _rule, ctx) {
  const workflows = listFiles(ctx.root, ctx.locations.ci.workflows);
  let actionOnly = null;
  for (const rel of workflows) {
    const text = readText(path.join(ctx.root, ...rel.split("/")));
    if (text === null) continue;
    for (const step of parseWorkflowSteps(text)) {
      if (step.id !== gate.id && step.name !== gate.id) continue;
      if (gate.discriminator !== undefined && step.job !== gate.discriminator) continue;
      const where = `${rel}:${step.line} (job ${step.job})`;
      if (step.run) {
        const command = step.run.split("\n")[0];
        return { present: true, evidence: `step "${gate.id}" at ${where} runs \`${command}\`` };
      }
      actionOnly ??= where;
    }
  }
  if (actionOnly) {
    return {
      present: false,
      evidence: `step "${gate.id}" at ${actionOnly} has no local command (run:)`,
    };
  }
  const job = gate.discriminator === undefined ? "" : ` in job ${gate.discriminator}`;
  const searched = workflows.length ? workflows.join(", ") : ctx.locations.ci.workflows.join(", ");
  return { present: false, evidence: `no workflow step "${gate.id}"${job} in ${searched}` };
}
