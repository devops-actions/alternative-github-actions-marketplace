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
- CI includes `deploy-functions.yml` which runs backend tests and zip deploys the function app on backend changes. Keep it green before merging.
- Function deploy workflow discovers the app name via `az functionapp list` scoped to `${{ vars.AZURE_RESOURCE_GROUP }}`; keep the target RG unique to avoid ambiguous matches.
- `main.bicep` exposes `assignTableDataContributor`; leave it `false` unless the deployment identity can create role assignments, otherwise grant Storage Table Data Contributor manually post-deploy.
- Azure Functions runtime targets Node.js 22; develop and test with Node 22+ to stay aligned with production.
- Workflows set Azure CLI automation-friendly env vars (only show errors, disable telemetry/dynamic install); mirror them locally to match CI behavior. See the docs here: https://jessehouwing.net/recommendations-for-using-azure-cli-in-your-workflow/
