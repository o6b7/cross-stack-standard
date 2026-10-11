# Working on the Cross-Stack Standard repository

cross-stack-standard: declined

The line above opts this repository out of the Standard's own hooks. The plugin would otherwise
detect the fixture apps under `test/` and treat this repository as an adopter.

## What this repository is

The source of the `cross-stack-standard` Claude Code plugin, its marketplace, the kit templates,
the gate packages, the rule registry and their tests. See `README.md` for the product view and
`CONTRIBUTING.md` for the contribution flow.

## Ground rules

- `registry/rules.json` is the single source of truth for every rule. Docs under `docs/rules/`
  and the plugin's `data/` directory are generated; never edit them by hand.
- Honesty labels: a rule is `FORCED` or `GUARDED` only when its gate exists and its violation
  fixture fails. New rules enter as `REVIEW` with a `targetEnforcement` and are promoted in the
  PR that ships the gate and both fixtures.
- Scripts and hooks under `scripts/` and `plugins/cross-stack-standard/` use Node.js built-ins
  only (no runtime dependencies) and make no network calls.
- Never weaken a gate to get a green build. Fix the code, or add a dated allowlist entry with a
  reason.
- `VERSION` is the only place the version is edited; run `node scripts/stamp-version.mjs`.

## Develop and test

```sh
npm ci                                   # repo tooling (Node >= 22.13)
npm test                                 # node:test suites under test/
npm run lint && npm run format:check     # repo lint
node scripts/check-registry.mjs          # registry integrity
node scripts/run-fixtures.mjs            # fail-then-pass fixture matrix
claude --plugin-dir ./plugins/cross-stack-standard   # load the plugin locally
```

Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`,
`ci:`, `build:`). Branch from `dev`; open pull requests against `dev`.
