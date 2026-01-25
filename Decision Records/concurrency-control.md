# Workflow Concurrency Control

## Problem
Multiple deployment workflows running concurrently can create duplicate Azure resources. When Bicep deployments execute simultaneously before resources are created and stabilized, the `uniqueString()` function can generate different suffixes for each deployment, resulting in multiple sets of resources (e.g., `func-lfpptur2r7j5o`, `func-wsg6po7n4p5dg`, `func-xwa5eprmmku5i`).

## Root Cause
- Four deployment workflows can interact with Azure resources:
  - `deploy-infra.yml` - Creates/updates infrastructure
  - `deploy-backend.yml` - Deploys backend and queries resources
  - `deploy-frontend.yml` - Deploys frontend and queries resources
  - `deploy-app.yml` - Deploys both frontend and backend

- Before the fix, only `deploy-infra.yml` had concurrency control, and it was workflow-specific
- Multiple workflows could run simultaneously when triggered by:
  - Manual workflow_dispatch events
  - Push events to different paths
  - Scheduled or automated triggers

## Solution
All deployment workflows now use a shared concurrency group:

```yaml
concurrency:
  group: azure-deployment-${{ vars.AZURE_RESOURCE_GROUP }}
  cancel-in-progress: false
```

### Key Features
1. **Shared Scope**: All workflows use the same concurrency group identifier (`azure-deployment-{RESOURCE_GROUP}`)
2. **Resource Group Scoping**: Different resource groups can deploy concurrently, but deployments to the same resource group are serialized
3. **Non-Cancelling**: `cancel-in-progress: false` ensures in-progress deployments complete rather than being cancelled when a new one is queued
4. **Queue Behavior**: New workflows wait for the current deployment to complete before starting

## Benefits
- **Prevents Duplicate Resources**: Only one deployment can modify a resource group at a time
- **Consistent State**: Ensures all workflows see the same set of resources
- **Safe Parallel Execution**: Different environments/resource groups can still deploy in parallel
- **Graceful Queuing**: Workflows wait rather than fail when another deployment is in progress

## Trade-offs
- **Serial Execution**: Deployments to the same resource group execute one at a time, potentially increasing total deployment time
- **Queue Delays**: If multiple workflows are triggered rapidly, later ones must wait for earlier ones to complete

## Testing
To verify the fix works:
1. Trigger multiple deployment workflows simultaneously (e.g., `deploy-infra.yml` and `deploy-app.yml`)
2. Observe that one runs immediately while others show "Waiting" status
3. Verify that only one set of resources exists after all workflows complete

## Related Files
- `.github/workflows/deploy-infra.yml`
- `.github/workflows/deploy-backend.yml`
- `.github/workflows/deploy-frontend.yml`
- `.github/workflows/deploy-app.yml`
