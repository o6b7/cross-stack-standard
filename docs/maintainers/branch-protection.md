# Branch protection and repository settings

The repository is protected with three rulesets (`main`, `dev`, tags), a handful of repository
settings and one Actions secret. This page holds the exact payloads, the commands that apply
them, and the manual steps to use when the API refuses (for example on a plan that does not offer
rulesets for private repositories).

Rulesets are available on public repositories with GitHub Free, and on private repositories with
GitHub Pro, Team or Enterprise Cloud. Creating or editing them needs admin access.

## Design

| Decision                                                                          | Why                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The only required status check is `ci-ok`                                         | `ci.yml` aggregates every job into `ci-ok`, which passes only when each job succeeded or was skipped as unaffected. One stable name survives job renames and matrix changes.                                                         |
| `required_approving_review_count: 0`                                              | The project has one maintainer, and GitHub never lets authors approve their own pull requests; a required review would block every merge. Raise it when a second maintainer joins.                                                   |
| Bypass: repository admins (`RepositoryRole` 5) in `pull_request` mode on branches | An admin can merge a pull request whose checks cannot pass (for example a broken upstream) but still cannot push to `main` or `dev` directly. `pull_request` mode applies to branch rulesets only, so the tag ruleset uses `always`. |
| `dev`: squash **and** merge commits                                               | Work branches are squashed; the `main` → `dev` back-merge after a release needs a merge commit to keep ancestry.                                                                                                                     |
| `main`: merge commits only                                                        | Release and hotfix pull requests keep their history, so `main` and `dev` stay related.                                                                                                                                               |
| Tags: creation, update and deletion restricted                                    | Covers `vX.Y.Z` and any other tag name. Tags are created only as part of an approved release, and `#vX.Y.Z` pins never move.                                                                                                         |
| Strict status checks on `main` only                                               | A release pull request is always up to date with `main`; requiring it on `dev` would force an update of every feature branch after each merge.                                                                                       |

## Rulesets

Save each payload to a file and create it with `gh api` (the `--input` flag makes the request a
POST):

```sh
gh api repos/o6b7/cross-stack-standard/rulesets --input ruleset-main.json
gh api repos/o6b7/cross-stack-standard/rulesets --input ruleset-dev.json
gh api repos/o6b7/cross-stack-standard/rulesets --input ruleset-tags.json
```

Read them back and check every field:

```sh
gh api repos/o6b7/cross-stack-standard/rulesets
gh api repos/o6b7/cross-stack-standard/rulesets/<id>
```

To change one later, send the full payload with `gh api -X PUT repos/o6b7/cross-stack-standard/rulesets/<id> --input <file>`.

### main (`ruleset-main.json`)

```json
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/main"], "exclude": [] }
  },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [{ "context": "ci-ok" }]
      }
    }
  ]
}
```

### dev (`ruleset-dev.json`)

```json
{
  "name": "dev",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/dev"], "exclude": [] }
  },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash", "merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "ci-ok" }]
      }
    }
  ]
}
```

### Tags (`ruleset-tags.json`)

```json
{
  "name": "tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/tags/*", "refs/tags/**/*"], "exclude": [] }
  },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "rules": [{ "type": "creation" }, { "type": "update" }, { "type": "deletion" }]
}
```

Leave `integration_id` out of the required check: the check is matched by its name (`ci-ok`, the
job name in `ci.yml`).

## Repository settings

```sh
gh repo edit o6b7/cross-stack-standard \
  --default-branch main \
  --enable-squash-merge \
  --enable-merge-commit \
  --enable-rebase-merge=false \
  --delete-branch-on-merge \
  --squash-merge-commit-message pr-title-commits
```

`pr-title-commits` makes a squash commit's header the pull request title (checked by commitlint in
CI) and its body the branch's commit messages (checked by the brand guard and the narrative lint).

Actions settings, read back with a `GET` on the same paths:

```sh
# Read-only GITHUB_TOKEN by default; Actions may not approve pull requests.
gh api -X PUT repos/o6b7/cross-stack-standard/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

# Every action must be pinned to a full commit SHA.
gh api -X PUT repos/o6b7/cross-stack-standard/actions/permissions \
  -F enabled=true -F sha_pinning_required=true
```

## Secret for the brand guard

The brand guard compares keyed digests, so CI needs the maintainer's key as a repository secret
named `CROSS_STACK_STANDARD_BRAND_KEY`. Without it, the `integrity` job fails on pushes and on pull
requests from branches of this repository; pull requests from forks and bots, which never receive
secrets, skip the guard with a notice and are scanned after merge by the push to `dev` (maintainers
run `node scripts/check-pr.mjs <number>` before merging them).

Set it without echoing the key (gh reads the value from standard input):

```sh
gh secret set CROSS_STACK_STANDARD_BRAND_KEY --repo o6b7/cross-stack-standard < <path-to-key-file>
```

or in the web UI: **Settings → Secrets and variables → Actions → New repository secret**.

## The same key in every maintainer clone

A pushed branch is public before CI runs, so the local Git hooks are the only check that runs
before publication. Each maintainer clone needs the key once, in a file under the clone's `.git/`
directory, which Git never tracks:

```sh
mkdir -p "$(git rev-parse --git-common-dir)/cross-stack-standard"
install -m 600 <path-to-key-file> "$(git rev-parse --git-common-dir)/cross-stack-standard/brand.key"
node scripts/check-brand-leak.mjs --tree   # prints "(key <id>)" and the finding count
```

The hooks and scripts look for the key in this order: `--key-file`, the
`CROSS_STACK_STANDARD_BRAND_KEY` variable, the file named by `CROSS_STACK_STANDARD_BRAND_KEY_FILE`,
then `.git/cross-stack-standard/brand.key` (shared by every worktree of the clone). With no key at
all, the hooks print a notice and pass (a contributor without the key); a key that is present but
unreadable or too short fails the hook instead of skipping it. The pre-push hook scans every commit
a push would publish: messages, author and committer identities, added paths and every file
version, including content that a later commit removed.

## Manual steps when the API refuses

If `gh api …/rulesets` returns 403 or 404 (plan or permission limits), create the same rulesets in
the web UI: **Settings → Rules → Rulesets**.

**main** — **New ruleset → New branch ruleset**

1. Name `main`, enforcement **Active**.
2. **Bypass list → Add bypass → Repository admin**, then set it to **For pull requests only**.
3. **Target branches → Add target → Include by pattern** `main`.
4. Enable **Restrict deletions** and **Block force pushes**.
5. Enable **Require a pull request before merging**: required approvals **0**, and under
   **Allowed merge methods** keep only **Merge**.
6. Enable **Require status checks to pass**, tick **Require branches to be up to date before
   merging**, and add the check **ci-ok** (it appears after one CI run).
7. **Create**.

**dev** — the same as `main`, with these differences: target pattern `dev`; allowed merge methods
**Squash** and **Merge**; leave **Require branches to be up to date before merging** unticked.

**tags** — **New ruleset → New tag ruleset**

1. Name `tags`, enforcement **Active**.
2. **Bypass list → Add bypass → Repository admin** (always).
3. **Target tags → Add target → Include all tags**.
4. Enable **Restrict creations**, **Restrict updates** and **Restrict deletions**.
5. **Create**.

**Merge settings** — **Settings → General → Pull Requests**: allow merge commits, allow squash
merging with the default commit message **Pull request title and commit details**, disallow rebase
merging, and tick **Automatically delete head branches**.

**Actions** — **Settings → Actions → General**: under **Workflow permissions**, choose **Read
repository contents and packages permissions** and untick **Allow GitHub Actions to create and
approve pull requests**; tick **Require actions to be pinned to a full-length commit SHA**.

After any manual change, read the rulesets back with `gh api repos/o6b7/cross-stack-standard/rulesets`
and compare them with the payloads above.
