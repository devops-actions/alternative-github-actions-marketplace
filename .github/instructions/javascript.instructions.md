---
applyTo: "**/*.js"
---

# JavaScript (repo-wide) instructions

Applies to JavaScript changes in this repository unless a more specific instructions file overrides it.

## Baseline quality bar
- Prefer small, targeted changes; avoid unrelated refactors.
- Keep edits ASCII-only.
- Ensure code is compatible with Node.js 22 (the production/runtime target).

## Before you finish a change
- If you changed any backend logic under `src/backend`:
  - Run `npm test` from `src/backend`.
- If you changed scripts that run in CI (workflows, examples, scripts):
  - Add a fast syntax check where appropriate (e.g., `node -c <file>`).

## CI and workflows
- If a script is invoked from `.github/workflows/*.yml`, treat it as an interface:
  - Keep exported functions stable (or update the workflow in the same PR).
  - Errors should be visible in Actions logs (`::error::...`) and should cause a failing exit code when appropriate.

## HTTP/API changes
- When changing routes, update all of:
  - the Function route (`function.json`),
  - any callers (frontend services, backend client, examples), and
  - unit tests.
- Avoid ambiguous route patterns that can collide (prefer query params for optional filters).

## Security and operational guardrails
- Do not log secrets (function keys, connection strings).
- Keep error messages informative but not overly verbose.
