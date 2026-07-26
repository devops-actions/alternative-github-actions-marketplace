# Copilot Instructions

## Project Context
- Goal: Publish a low-cost Azure-hosted site exposing metadata gathered from the GitHub Actions Marketplace.
- Data Shape: Single flat table (~30k records, ~26 MB) with API-side filtering and cached aggregates.
- Initial Stack Hypothesis: Azure Static Web Apps (Free tier) + Azure Functions (HTTP API) + Azure Table Storage.

## Documentation Map
- Decision records live under the `/Decision Records` folder:
  - `requirements.md`: Current data, usage expectations, hosting constraints.
  - `stack-evaluation.md`: Proof-of-concept plan for Static Web Apps + Functions + Table Storage.
  - `cost-comparison.md`: Upgrade path costs (Azure AI Search, SQL, Cosmos, Container Apps).

## Collaboration Notes
- Default to ASCII when editing files; keep comments concise and only when necessary for clarity.
- Update the decision records first when architecture or cost assumptions change before implementing code.
- Backend tests live under `/src/backend/tests`; run `npm test` from `/src/backend` whenever touching backend logic or data contracts.
- The VS Code extension lives in `/vscode-extension`; run `npm run check-types`, `npm run lint`, and `npm test` from there when touching it. Its `src/data` and `src/tools/format.ts` modules must stay free of `vscode` imports so they remain unit testable.
- CI includes `deploy-functions.yml` which runs backend tests and zip deploys the function app on backend changes. Keep it green before merging.
- Function deploy workflow discovers the app name via `az functionapp list` scoped to `${{ vars.AZURE_RESOURCE_GROUP }}`; keep the target RG unique to avoid ambiguous matches.
- `main.bicep` exposes `assignTableDataContributor`; leave it `false` unless the deployment identity can create role assignments, otherwise grant Storage Table Data Contributor manually post-deploy.
- Azure Functions runtime targets Node.js 22; develop and test with Node 22+ to stay aligned with production.
- Workflows set Azure CLI automation-friendly env vars (only show errors, disable telemetry/dynamic install); mirror them locally to match CI behavior. See the docs here: https://jessehouwing.net/recommendations-for-using-azure-cli-in-your-workflow/
- `/actions/stats` (used by the About page) is backed by a cache row in Table Storage (`lib/statsCache.js`) rather than scanning the full table on every request. `ActionsUpsert` patches it incrementally, and the `StatsWarmup` timer function (`src/backend/StatsWarmup`) recomputes it every 8 hours as a safety net so the cache never needs to be rebuilt inside a user request. Stats can lag reality by up to ~24h.
- The stats cache row lives in the `actions` table under its own `statsCache` partition. Anything that scans the table for action counts must skip that partition (see `lib/computeStats.js`), or totals come out one too high.
- `/actions/snapshot` is what the overview and State of Actions pages load. It serves a single pre-built blob (`snapshots/actions-summary.json`) containing only the fields those pages read — see `lib/actionSummary.js`, which is the source of truth for the projection. **When a list page starts reading a new field, add it there**, otherwise it is `undefined` in the snapshot.
  - Built by `SnapshotRefresh` (function-key `POST /actions/snapshot/refresh`), which the `api-upsert.yml` pipeline in `actions-marketplace-checks` calls after every upload run, plus the `SnapshotWarmup` timer every 6 hours as a backstop.
  - Returns 503 when no snapshot exists yet rather than falling back to a live scan; the frontend then falls back to `/actions/list` on its own.
- `/actions/list` still returns full payloads via a full table scan (~50s, ~56 MB over ~35k actions). It is kept for the upload pipeline's reconciliation, which compares fields the UI never shows. Do not point the frontend back at it.

## SWA + Functions integration notes
- Browser calls from Static Web Apps require CORS + preflight: all HTTP Functions should respond to `OPTIONS` and include `Access-Control-Allow-*` headers.
  - Shared implementation lives in `/src/backend/lib/cors.js`.
  - CORS is configured at two levels:
    1. **Azure Function App CORS** (recommended): `main.bicep` automatically adds the Static Web App origin to the Function App's CORS configuration during deployment.
    2. **Application-level CORS** (optional fallback): Functions can optionally restrict origins via `CORS_ALLOWED_ORIGINS` env var (comma-separated). If unset, CORS defaults to `*`.
- Production data can contain GitHub release/tag objects (e.g., `{ tag_name, target_commitish }`) where the UI expects strings.
  - Frontend normalizes `releaseInfo` / `tagInfo` to `string[]` in `/src/frontend/src/services/actionsService.ts`.
