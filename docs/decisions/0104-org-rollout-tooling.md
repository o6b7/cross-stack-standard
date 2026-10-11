---
status: proposed
date: 2026-09-25
decision-makers: Qusai Abdullah
---

# Organization rollout tooling: rulesets as code and an adoption dashboard

## Context and Problem Statement

Gates protect a project only if merges must pass them. The Standard's reusable CI workflow
([0090](0090-ci-contract.md)) reports a check, but whether that check is required, and whether
force pushes to the default branch are blocked, is a repository setting outside the kit. Across an
organization with many repositories, settings drift: a common defect is a repository where the
quality check runs but is not required, so a red build can still be merged. Rulesets are available
for public repositories on GitHub Free, and for public and private repositories on GitHub Pro,
Team and Enterprise Cloud; the Terraform provider `integrations/github` (v6.13.0) manages them as
`github_repository_ruleset` resources.

An organization rolling out the Standard also needs to see where it stands: which repositories
have adopted it, at which version ([0023](0023-adopter-manifest-and-upgrade.md)), whether their CI
is green, and whether their baselines and allowlists ([0005](0005-explicit-exceptions.md)) are
shrinking.

What does the Standard provide for protecting branches and tracking adoption across an
organization, without adding network access to the installed plugin?

## Decision Drivers

- Branch protection is declared in reviewable code, not clicked per repository.
- The kit never changes an organization's settings on its own; it documents, the organization
  applies.
- Adoption status is read from files the Standard already defines, not from a new service.
- The installed plugin stays offline ([0016](0016-self-contained-plugin-runtime.md),
  [0019](0019-hook-runtime-contract.md)).

## Considered Options

- A documented Terraform ruleset example, plus a read-only `org-scan.mjs` over the GitHub API
- A kit command that creates rulesets through the GitHub API
- The repository-settings app (`settings.yml`)
- A hosted adoption dashboard

## Decision Outcome

Chosen option: "A documented Terraform ruleset example, plus a read-only `org-scan.mjs` over the
GitHub API", because both reuse tools organizations already govern (Terraform plans and their own
`gh` login), and neither writes anything the organization did not apply itself.

- **Rulesets as code.** The docs ship a `github_repository_ruleset` example for the default
  branch that mirrors the protections this repository applies to its own branches
  ([0027](0027-branching-model.md)): a pull request is required, the reusable workflow's check is
  a required status check, and force pushes (`non_fast_forward`) and deletion are blocked. The
  example shows the admin bypass as a `RepositoryRole` actor and the import command for an
  existing ruleset. The same rules are given as a REST payload for `gh api` for organizations
  without Terraform.
- **Adoption dashboard.** `scripts/org-scan.mjs` lists an organization's repositories with
  `gh api --paginate`, reads `.cross-stack/standard.json` from each default branch, the conclusion
  of the latest CI run on it, and the sizes of the baseline and allowlist files, and prints a
  table (or `--json`): adopted or not, Standard version against the latest release, tracks and
  modules, CI status, baseline sizes and expired allowlist entries.
- **Read-only, own credentials.** The script calls only the GitHub REST API, through the user's
  authenticated `gh`, and passes `--method GET` on every call, because `gh api` switches to POST as
  soon as a parameter is added. It stores nothing and sends nothing elsewhere. It runs from a
  checkout of this repository and is not part of the installed plugin.

### Consequences

- Good, because protections are reviewed in Terraform plans and applied by the organization.
- Good, because adoption progress is visible without a service, an account or a new token.
- Good, because the plugin's offline contract is unchanged.
- Bad, because organizations without Terraform copy the REST payload by hand.
- Bad, because a large organization takes several API calls per repository and can reach the
  GitHub API rate limit; the script reports the limit instead of retrying silently.
- Bad, because the dashboard reports what each default branch's manifest and CI declare, not
  what the code does; the gates remain the source of truth.

### Confirmation

- `org-scan.mjs` has offline unit tests with recorded API responses, including one that asserts
  every `gh` invocation carries `--method GET`, so a change that adds a write call fails the tests.
- The Terraform example and the REST payload are checked in Review against the provider and REST
  documentation recorded in verified-versions; the payload has the same shape as the rulesets this
  repository applies to its own branches.
- Whether an organization applies the ruleset is its own decision; the adopter branch-protection
  rule stays REVIEW, and the dashboard makes it visible.

## Pros and Cons of the Options

### A documented Terraform ruleset example, plus a read-only `org-scan.mjs` over the GitHub API

- Good, because both fit existing organization workflows and change nothing by themselves.
- Bad, because applying protection remains a manual step per organization.

### A kit command that creates rulesets through the GitHub API

- Good, because protection is one command away.
- Bad, because it needs an admin-scoped token and writes settings from a developer tool.

### The repository-settings app (`settings.yml`)

- Good, because settings live in each repository's `settings.yml`.
- Bad, because its rulesets plugin is documented as still under development, and it runs as an
  installed GitHub App that needs permission to change repository settings.

### A hosted adoption dashboard

- Good, because status is always current.
- Bad, because it adds a service, an account and a place where repository data is stored.

## More Information

- Terraform `github_repository_ruleset`:
  <https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_ruleset>.
- Rulesets: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets>;
  REST API: <https://docs.github.com/rest/repos/rules#create-a-repository-ruleset>;
  `gh api`: <https://cli.github.com/manual/gh_api>.
- repository-settings app: <https://github.com/repository-settings/app>.
- Payload shapes, plan availability and the admin role ID:
  [verified-versions.md](../maintainers/verified-versions.md).
- Related: [0023](0023-adopter-manifest-and-upgrade.md), [0027](0027-branching-model.md),
  [0090](0090-ci-contract.md), [0005](0005-explicit-exceptions.md).
- Governs: the organization rollout tooling (the ruleset example that applies the adopter
  branch-protection rule, which [0090](0090-ci-contract.md) governs, and the adoption dashboard).
- Becomes accepted when the example and the script ship with their tests; until then it is on the
  roadmap.
