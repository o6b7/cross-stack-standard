---
name: audit
description: "Read-only audit of the current project against the Cross-Stack Standard: finds the rules that apply to the project's tracks, profile, tier and modules, reports each by rule ID with its enforcement level and status (the gate's result where a gate exists, otherwise a review checklist item with the evidence found in the code), grouped by Tier-1 invariant and by track. Never modifies files. Run it as /cross-stack-standard:audit, optionally with a scope such as a track, a module or a rule-ID prefix."
argument-hint: "[track | module | rule-ID prefix]"
disable-model-invocation: true
---

# Audit the project against the Cross-Stack Standard

The user asked for a report on how the project stands against the Standard's rules. This is a
read-only task. `${CLAUDE_PLUGIN_ROOT}` below is the installed plugin.

## Ground rules

- **Change nothing.** Do not edit, create or delete files, and do not run anything that writes to
  the project: no formatter or `--fix` run, no dependency install, no baseline update, no git
  command that changes state. Print the report in the conversation; do not save it to disk.
- **Evidence or nothing.** Every status cites where it comes from: a command's real output, or a
  `path:line` in the code. When you cannot tell, the status is "not assessed", with the reason.
- **Honest labels.** A rule counts as gate-enforced only when `${CLAUDE_PLUGIN_ROOT}/data/rules.json`
  labels it FORCED or GUARDED. A REVIEW rule that the code follows is "followed", never "passed".
  In 0.1.0 every rule is REVIEW: guidance with a planned gate.
- **Cite IDs, not paraphrases.** Use the rule ID and its registry title.

## Step 1: Establish the scope

1. Read `.cross-stack/standard.json` for tracks, profile (default `next`), tier and modules. If
   there is no manifest, run
   `node "${CLAUDE_PLUGIN_ROOT}/templates/shared/cross-stack/bin/cross-stack.mjs" detect --root .`,
   tell the user the audit is provisional until the project is adopted, and ask for the tier.
   Module rules are not assessed without a manifest.
2. If the tier is not declared, ask. Without an answer, audit Tier 1 and say so.
3. List the rules that apply. A rule applies when its `track` is one of the project's tracks, or
   `client` with a web or mobile track, or `shared`; its `tier` is at most the project's tier; its
   `module` is null or enabled (`true`, or an object whose `enabled` is not `false`); and its
   `profiles` is null or includes the project's web profile. A rule with `defaultEnabled: false`
   is off (the 0.1.0 manifest has no per-rule switch yet); list those separately as not assessed.

   ```sh
   node -e '
   const fs = require("fs");
   let m = {};
   try { m = JSON.parse(fs.readFileSync(".cross-stack/standard.json", "utf8")); } catch {}
   const { rules } = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
   const tracks = new Set(process.argv[2] ? process.argv[2].split(",") : m.tracks || []);
   const tier = Number(process.argv[3] || m.tier || 1);
   const profile = m.profile || "next";
   const on = (n) => { const v = (m.modules || {})[n]; return v === true || (v !== null && typeof v === "object" && v.enabled !== false); };
   const scope = (t) => t === "shared" || tracks.has(t) || (t === "client" && (tracks.has("web") || tracks.has("mobile")));
   const applies = rules.filter((r) => scope(r.track) && r.tier <= tier && (r.module === null || on(r.module)) && (!r.profiles || r.profiles.includes(profile)));
   for (const r of applies.filter((r) => r.defaultEnabled !== false)) {
     const gate = r.gate ? (r.enforcement === "REVIEW" ? "planned " : "") + r.gate.kind + ":" + r.gate.id : "-";
     console.log([r.id, r.track, "tier " + r.tier, r.module || "-", r.enforcement, gate, r.title].join("\t"));
   }
   const off = applies.filter((r) => r.defaultEnabled === false).map((r) => r.id);
   console.error(applies.length - off.length + " rules apply; off by default: " + (off.join(", ") || "none"));
   ' "${CLAUDE_PLUGIN_ROOT}/data/rules.json"
   ```

   Without a manifest, pass the tracks and the tier after the data file, for example
   `... "${CLAUDE_PLUGIN_ROOT}/data/rules.json" laravel,web 1`.

4. Narrow the list to the scope the user gave with the command (a track, a module, or a rule-ID
   prefix such as `SEC-`). When more than about 60 rules remain, ask whether to audit all of them
   or a narrower scope such as Tier 1 only.

## Step 2: Collect the project-level evidence

These read the project and change nothing. Run them and keep the real output:

```sh
node .cross-stack/bin/cross-stack.mjs check-standard-config
node .cross-stack/bin/cross-stack.mjs check-allowlists
node .cross-stack/bin/cross-stack.mjs doctor
```

Use the plugin's copy with `--root .` when the project has no `.cross-stack/bin/`. The results are
evidence for PROC-001 (manifest), PROC-014 (allowlists), PROC-029 (managed block size), PROC-004
(plugin enabled in the committed settings) and CI-015 (pre-commit hooks). They are evidence, not
gate results, while those rules are REVIEW.

## Step 3: Assess each rule

- **FORCED or GUARDED:** report the gate's result. Run it only through what the project already
  has: the project tool for `script` gates, or the project's own lint, analysis and test commands
  in check mode for the other kinds. Ask before running a full test suite, since it can be slow and
  writes caches. If the gate is not installed in the project, the status is "gate missing".
- **REVIEW:** treat the rule as a checklist item. Search the code for the pattern the title
  describes (Grep, Glob, reading the files that matter), and record "followed" with a
  representative `path:line`, "violated" with every `path:line` found (up to about five, then a
  count), or "not assessed" with the reason (for example, it needs a running app, a CI run or a
  decision only the team can confirm). The core skill's references under
  `${CLAUDE_PLUGIN_ROOT}/skills/cross-stack-standard/references/` explain each track's rules.

## Step 4: Write the report

Print it in this shape:

```markdown
# Cross-Stack Standard audit

Scope: <tracks>, profile <profile>, Tier <n>, modules <list>; manifest version <v>, plugin <v>.
Rules: <n> apply (<x> FORCED, <y> GUARDED, <z> REVIEW); <k> off by default, not assessed.
Summary: <a> gates passed, <b> gates failed, <c> followed, <d> violated, <e> not assessed.

## Tier-1 invariants

| Invariant | Rules | Status |
| --------- | ----- | ------ |

## Laravel

| Rule | Level | Status | Evidence |
| ---- | ----- | ------ | -------- |
```

- **Tier-1 invariants:** the ten invariants and the rule IDs listed for each in
  `${CLAUDE_PLUGIN_ROOT}/templates/claude/claude-md-block.md`, with the worst status among those
  rules. If the rule data carries an `invariant` number, group every Tier-1 rule by it.
- **Then one section per scope** in this order: Laravel, Web, Client (web and mobile), Mobile,
  Shared, and within each, module rules under a sub-heading per module.
- **Level** is the registry label; write "REVIEW (gate planned)" for REVIEW rules.
- **End with** the violations worth fixing first (security and Tier-1 before the rest), each with
  its rule ID and location, and the rules that could not be assessed.

Offer next steps without taking them: fixing a violation is a separate task that follows the
`cross-stack-standard` skill; `/cross-stack-standard:adopt` sets up a project that has no
manifest.
