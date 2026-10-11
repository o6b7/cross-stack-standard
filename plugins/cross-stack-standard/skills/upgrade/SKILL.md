---
name: upgrade
description: "Moves an adopted project to the Cross-Stack Standard version of the installed plugin: compares the manifest's version with the plugin's, replaces kit files the project never edited, shows a diff for each edited file so the user decides, re-merges the managed CLAUDE.md block and the team settings without weakening them, validates allowlists without changing them, updates the manifest version last and drafts the pull request. Run it as /cross-stack-standard:upgrade (the built-in /upgrade is a different command)."
disable-model-invocation: true
---

# Upgrade the project's Cross-Stack Standard files

The user asked to bring the project's kit files up to the version of the installed plugin. The
plugin itself updates separately (through `/plugin` or `claude plugin update`); this skill changes
only files in the repository, on a branch, for review. `${CLAUDE_PLUGIN_ROOT}` below is the
installed plugin. The decision behind this flow is ADR 0023 (adopter manifest, adopt and upgrade).

## Ground rules

- **The user decides every edited file.** Replace a file only when its hash proves the project
  never edited it; otherwise show the diff and ask.
- **Never lower a level or threshold, never weaken a gate** (PROC-012). When a new template is
  looser than the project's current setting, keep the stricter one.
- **Allowlists are read-only.** Validate `.cross-stack/allowlists/` with the project tool; never
  add, renew, remove or edit an entry, and never regenerate a baseline.
- **Branch first, commit only on request.** Never commit, push or open a pull request without the
  user's explicit yes.
- **Only what this plugin version ships.** Take templates from `${CLAUDE_PLUGIN_ROOT}/templates/`
  as they are; never write kit content from memory. Do not install packages.
- **The manifest's `version` changes last**, so an interrupted upgrade stays visible.
- **Real output only.** Paste the real output of every check you run (PROC-021).

## Step 1: Compare the versions

1. The plugin's version is `version` in `${CLAUDE_PLUGIN_ROOT}/data/version.json`.
2. The project's version is `version` in `.cross-stack/standard.json`. Without a manifest the
   project was never adopted: suggest `/cross-stack-standard:adopt` and stop.
3. Compare them as SemVer:
   - **Equal:** there is nothing to upgrade. Offer the integrity pass of Step 3 on its own, which
     lists the kit files the project has edited, and stop there if the user declines.
   - **The manifest is newer:** the plugin is behind the project. Tell the user to update it and
     stop:

     ```sh
     claude plugin marketplace update cross-stack-standard
     claude plugin update cross-stack-standard@cross-stack-standard --scope project
     ```

     (`--scope` is the scope the plugin was installed with.) A team that pins the marketplace
     moves the `ref` in `.claude/settings.json` instead. Then `/reload-plugins`.

   - **The plugin is newer:** continue.

4. Give the user the release notes for the new version,
   `https://github.com/o6b7/cross-stack-standard/blob/v<new-version>/CHANGELOG.md`: every section
   after the project's version applies. Before 1.0.0 a minor release can promote rules from REVIEW
   to a failing gate. Do not fetch the page unless the user asks.

## Step 2: Prepare

1. `git status --porcelain` must be empty. If it is not, ask the user to commit or stash their work
   first; do not stash it yourself.
2. Propose the branch `chore/cross-stack-standard-v<new-version>` and create it only after a yes:

   ```sh
   git switch -c chore/cross-stack-standard-v<new-version>
   ```

3. Validate the current allowlists and manifest, and keep the output for the pull request:

   ```sh
   node .cross-stack/bin/cross-stack.mjs check-allowlists
   node .cross-stack/bin/cross-stack.mjs check-standard-config
   ```

## Step 3: Build the change set

**Hashes.** The adopted version's hashes are in
`${CLAUDE_PLUGIN_ROOT}/data/template-hashes/<project-version>.json`, the new version's in
`${CLAUDE_PLUGIN_ROOT}/data/template-hashes/<plugin-version>.json`. Keys are paths under
`templates/`. If the adopted version's file is missing (for example a pre-release that was never
published), treat every kit file as edited and say so.

**Where each template lands:**

| Template (under `templates/`)                      | Project location                 | How                             |
| -------------------------------------------------- | -------------------------------- | ------------------------------- |
| `shared/cross-stack/<path>`                        | `.cross-stack/<path>`            | copied                          |
| `claude/rules/<track>.md`                          | `.claude/rules/<track>.md`       | copied, for each declared track |
| `claude/claude-md-block.md`                        | the managed block in `CLAUDE.md` | the region between the markers  |
| `claude/settings.team.json`                        | `.claude/settings.json`          | merged, never replaced          |
| `claude/README.md`, `claude/standard.example.json` | nothing                          | reference only, never copied    |

A template directory this table does not cover describes its own destinations in its
`README.md`. If it does not, list those templates as not applied and ask; never guess a location.

**Hash the project's copies** the way the build does (text with LF line endings):

```sh
node -e 'const fs=require("fs"),c=require("crypto");for(const f of process.argv.slice(1)){let b=fs.readFileSync(f);if(!b.subarray(0,8000).includes(0)&&b.includes(13))b=Buffer.from(b.toString("utf8").replaceAll("\r\n","\n"));console.log(c.createHash("sha256").update(b).digest("hex")+"  "+f)}' .cross-stack/bin/cross-stack.mjs .claude/rules/*.md
```

For the managed block, hash its lines from the begin marker through the end marker followed by one
newline:

```sh
node -e 'const fs=require("fs"),c=require("crypto");const l=fs.readFileSync(process.argv[1],"utf8").replaceAll("\r\n","\n").split("\n");const b=l.findIndex(x=>x.trim()==="<!-- cross-stack-standard:begin -->"),e=l.findIndex(x=>x.trim()==="<!-- cross-stack-standard:end -->");console.log(c.createHash("sha256").update(l.slice(b,e+1).join("\n")+"\n").digest("hex"))' CLAUDE.md
```

**Classify each copied file and the block:**

| Project copy                                       | Action                                                     |
| -------------------------------------------------- | ---------------------------------------------------------- |
| equals the adopted version's hash                  | untouched: replace it with the new template, byte for byte |
| equals the new version's hash                      | already current: nothing to do                             |
| differs from both                                  | edited: show the diff and let the user decide (below)      |
| missing, template applies to the project           | new in this version, or deleted locally: ask, then copy    |
| template gone from the new version, copy untouched | propose deleting it                                        |
| template gone from the new version, copy edited    | ask                                                        |

For an edited file, show `git diff --no-index -- <project-file> <new-template>` and offer: take the
new template, keep the project's file, or a merge you propose. A rule file whose `paths:` globs
were prefixed for a track in a subdirectory is a known local edit: propose the new template with
the same prefix applied. For the block, replace only the region between the markers; content
outside them is never touched.

**Merged files** are never replaced. Add the entries of `claude/settings.team.json` that the project's file lacks, with the
same care as adopt: a `deny` entry stays `deny`, nothing is removed, no `allow` entry is added, a
plugin set to `false` stays `false` unless the user says otherwise.

Present the whole change set (replace, add, keep, remove, merge, and the files waiting for a
decision) and apply it only after the user agrees. Copy files with the shell (`cp`,
`Copy-Item`), not by rewriting them, so their hashes match.

## Step 4: Update the manifest, last

1. With the new project tool in place, run `check-standard-config` again (the command from
   Step 2). An older `version` is accepted; fix any other finding, keeping the project's values.
2. Set `version` to the plugin's version and `$schema` to `schemas.standard` from
   `${CLAUDE_PLUGIN_ROOT}/data/version.json`. Change no other key unless the release notes require
   it and the user agrees.
3. Run `check-standard-config` again: it confirms that `$schema` names the same version.

## Step 5: Verify

Run and paste the real output:

```sh
node .cross-stack/bin/cross-stack.mjs check-standard-config
node .cross-stack/bin/cross-stack.mjs check-allowlists
node .cross-stack/bin/cross-stack.mjs doctor
```

Then run each track's `check` script where it exists (`composer run-script check`,
`npm run check`). A rule that the new version promoted can fail code that passed before: fix the
code, or add a dated allowlist entry only if the user asks for one. Never weaken a gate to get
green.

List the rules that `${CLAUDE_PLUGIN_ROOT}/data/rules.json` now labels FORCED or GUARDED: those are
the ones whose gates can fail the build. In 0.1.0 there are none; every rule is REVIEW guidance with
a planned gate.

## Step 6: Propose the pull request

Draft, and show the user:

- **Title:** `chore: upgrade the Cross-Stack Standard to v<new-version>`
- **Body:** the old and new versions; the release-notes link; a table of every file with its action
  (replaced, added, kept as edited, merged, removed) and the user's decision for each edited file;
  the gated rules from Step 5; the real output of the checks; and, if the team pins the plugin, a
  reminder to move the `ref` in `.claude/settings.json` in the same pull request.

Commit, push or open the pull request only when the user asks.
