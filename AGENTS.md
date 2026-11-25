# Agent Instructions

These are the canonical repository-wide instructions. Keep this file current
when the architecture, data contracts, or validation commands change.

## Project and architecture

This repository publishes a low-cost Azure-hosted site for GitHub Actions
metadata. The main components are the React frontend, Azure Functions backend,
VS Code extension, and remote MCP server. Infrastructure is in `IAC/`.

Action records are stored in the `actions` Azure Table, partitioned by
normalized owner and keyed by normalized action name. `PayloadJson` stores
canonical JSON up to 32,768 UTF-16 code units. Larger payloads are stored
losslessly in the private `snapshots` Blob container as
`payloads/{PayloadHash}.json`; the table row contains `PayloadBlobName` and the
SHA-256 `PayloadHash`. Readers hydrate and verify the referenced blob. Do not
trim the append-only `immutableReleaseObservations` history or treat a missing
or invalid blob as a partial record.

The same private container holds separate precomputed feeds:

- `/actions/snapshot` (`actions-summary.json`, built by `SnapshotRefresh` and
  `SnapshotWarmup`) is the frontend overview/state projection. Its source of
  truth is `src/backend/lib/actionSummary.js`; add any field newly read by
  those pages to that projection. It deliberately contains no commit SHAs.
- `/actions/versions` (built by `VersionsWarmup`) serves latest version and
  known commit SHA data for offline clients. Keep its builder, blob, timer, and
  contract separate from the overview snapshot.

Do not point frontend list pages back to `/actions/list`, which returns full
records from a Table scan. Preserve the cached stats-row behavior and exclude
the `statsCache` partition from action counts.

Security posture and vulnerability details must remain server-side. Never
surface them in the public UI or in AI tool output. A commit SHA absent from
the dataset is `null` / unknown; never substitute a SHA from another version
or imply that an unknown SHA is known.

## Storage and client boundaries

HTTP upload clients send the complete action JSON to the API and do not need
to understand the blob overflow format. Direct Table clients must use a
package release that supports blob-backed payloads and have both Table access
and Blob access. Use `ActionRecord.fromStoredEntity(entity, storageOptions)` to
hydrate raw stored rows; synchronous `fromEntity` is only for inline rows.
Direct writers must use `prepareActionEntity` so the immutable blob is written
and verified before its Table reference is committed. Never delete blobs in a
request path or make the `snapshots` container public.

The Function App uses `ACTIONS_TABLE_URL` and `ACTIONS_BLOB_URL` with managed
identity in the deployed configuration. `assignTableDataContributor` and
`assignBlobDataContributor` default to `false`; when using managed identity,
ensure the identity has the required data roles (grant them manually if the
deployment identity cannot create role assignments). Connection-string
configuration is also supported. See `src/backend/README.md`,
`Decision Records/data-ingestion.md`, and `IAC/README.md` for details.

## Architecture and data-contract changes

Update the relevant decision records under `Decision Records/` when
architecture, data shape, hosting, or cost assumptions change. In particular,
preserve the distinction between the overview snapshot and versions feed, and
document changes to storage or public API contracts. Do not change
cross-repository contracts as part of repository-local work.

## Validation and task-to-command map

Use the component-specific checks below. These local checks are designed to
run without Azure credentials or production data; do not add live-service
access to validation. Run `npm ci` in a component only when its dependencies
are absent or its lockfile changed.

| Work area | Commands from the indicated directory |
| --- | --- |
| Backend API, storage, client, or data contract (`src/backend`) | `npm test`; `npm run lint` |
| Frontend (`src/frontend`) | `npm run build`; for browser E2E, `npm run test:e2e` with its local app/API prerequisites running |
| VS Code extension (`vscode-extension`) | `npm run check-types`; `npm run lint`; `npm test`; CI also bundles and packages with `node esbuild.mjs --production` and `npm run package` |
| MCP server (`src/mcp-server`) | `npm test`; `npm run lint`; CI also builds and starts the Docker image |

Azure Functions production runtime and the Node.js version used by CI and
deployment workflows are Node.js 22. Some package manifests declare a broader
minimum (`>=20`) for backend and MCP packages; that minimum is not the
production validation target. Use Node.js 22 for repository validation. Do not
change runtime configuration, package engine ranges, or dependencies solely
to make their declarations identical.

Backend tests live under `src/backend/tests`. The VS Code extension's
`src/data` and `src/tools/format.ts` modules must remain free of `vscode`
imports so they stay unit testable. For JavaScript, example-script, Bicep, and
frontend-service changes, follow the applicable focused instructions in
`.github/instructions/`.

The Function deploy workflow runs backend unit tests and deploys a zip. It
resolves the Function App within `${{ vars.AZURE_RESOURCE_GROUP }}`, so keep
that resource group unique. Workflows set Azure CLI automation-friendly
environment variables; mirror them locally when running Azure CLI operations.

## Repository conventions

- Keep changes surgical, default to ASCII, and add comments only to clarify
  non-obvious behavior.
- Keep CORS preflight and `Access-Control-Allow-*` behavior for browser-facing
  HTTP Functions; shared helpers are in `src/backend/lib/cors.js`.
- The stats cache row is in the `actions` table under its own `statsCache`
  partition. `ActionsUpsert` updates it and `StatsWarmup` recomputes it every
  eight hours as a safety net.
- Production may contain GitHub release/tag objects where the UI expects
  strings; normalize `releaseInfo` and `tagInfo` in
  `src/frontend/src/services/actionsService.ts`.
- Preserve `main.bicep`'s `assignTableDataContributor: false` default unless
  deployment role-assignment permissions are confirmed.
