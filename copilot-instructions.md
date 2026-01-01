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
