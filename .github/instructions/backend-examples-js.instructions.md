---
applyTo: "src/backend/examples/**/*.js"
---

# Backend example scripts (src/backend/examples/*.js)

These files are executed in CI as smoke tests and must remain runnable as plain Node.js scripts.

## Required checks before changing
- Run `node -c examples/list-actions.js` from `src/backend` (syntax-only validation).
- Run `npm test` from `src/backend` if you touched client behavior, API routes, or data contracts.

## CI behavior requirements
- These scripts MUST fail clearly when the smoke test fails:
  - Print GitHub Actions annotations using `::error::...` for failures.
  - Set a non-zero exit code (e.g., `process.exitCode = 1`).
- Avoid placeholder network calls in CI:
  - Do not attempt Table Storage direct mode unless `AZURE_TABLE_ENDPOINT` (and related settings) are provided.
  - If required env vars are missing, skip that section with a clear message.

## API URL conventions
- Treat `API_URL` as either:
  - a host (e.g., `https://func-xyz.azurewebsites.net`), or
  - a base including `/api` (e.g., `https://func-xyz.azurewebsites.net/api`).
- Normalize once and use consistently.

## Routing guardrails
- Prefer query-string filters over ambiguous path segments when routes might overlap.
  - Example: use `/api/actions/list?owner=actions` instead of `/api/actions/list/actions`.

## Style constraints
- Keep scripts CommonJS (`require`, `module.exports`).
- Keep output concise; no giant dumps in CI.
- ASCII-only edits.
