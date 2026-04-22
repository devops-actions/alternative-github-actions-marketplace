Staged deployment workflow

This document explains the demo staged deployment workflow added at .github/workflows/staged-deploy.yml.

Overview

- The workflow builds the project on pushes to main, tags, and on pull requests (build-only for PRs).
- On a push to main (or matching tags) and when Azure credentials are available, it will:
  1. Deploy to a staging environment/slot
  2. Run smoke tests against staging
  3. Pause for manual approval before promoting the same build to production

Safety and secrets

- The workflow is safe for forks and pull requests: if AZURE_CREDENTIALS (or other Azure secrets) are missing the deploy jobs are skipped and the workflow exits successfully.
- To enable full staging and production deploys, configure the following secrets in your repository or organization:
  - AZURE_CREDENTIALS (optional envelope used by some flows)
  - AZURE_CLIENT_ID
  - AZURE_TENANT_ID
  - AZURE_SUBSCRIPTION_ID
  - AZURE_STATIC_WEB_APPS_API_TOKEN (if using Static Web Apps deploy action)

Configuring environment protections

- The production promotion job uses the `environment: production` job setting. To require manual approval before promoting, configure the `production` environment in your repo settings and add required reviewers or protection rules.
- Optionally create a `staging` environment for visibility; the workflow demonstrates the staging step but does not require environment protection for staging by default.

How to use

1. Push a change to main or create a tagged release; the workflow will attempt to deploy to staging if Azure secrets are configured.
2. After smoke tests pass, the workflow will pause awaiting approval on the `production` environment. Approve in the repo UI to continue and deploy to production.

Notes

- The workflow is a demonstration and uses the same deploy actions/patterns present elsewhere in the repo. Adjust `app_name`, slot names and tokens to match your Azure resources.
- If your repo uses a different deployment mechanism (slots, staging APIs), modify the deploy steps accordingly.
