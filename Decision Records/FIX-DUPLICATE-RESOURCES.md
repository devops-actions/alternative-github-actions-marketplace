# Fix for Concurrent Deployment Duplicate Resources

## Summary
This fix prevents the creation of duplicate Azure resources when multiple GitHub Actions workflows run concurrently.

## Problem Description
Multiple sets of Azure resources were being created (3 copies in the reported case):
- Application Insights instances: `appi-lfpptur2r7j5o`, `appi-wsg6po7n4p5dg`, `appi-xwa5eprmmku5i`
- Function Apps: `func-lfpptur2r7j5o`, `func-wsg6po7n4p5dg`, `func-xwa5eprmmku5i`
- Storage Accounts: `stlfpptur2r7j5o`, `stwsg6po7n4p5dg`, `stxwa5eprmmku5i`
- Static Web Apps: `swa-lfpptur2r7j5o`, `swa-wsg6po7n4p5dg`, `swa-xwa5eprmmku5i`
- App Service Plans: `plan-lfpptur2r7j5o`, `plan-wsg6po7n4p5dg`, `plan-xwa5eprmmku5i`

## Root Cause
1. Multiple deployment workflows (`deploy-infra.yml`, `deploy-backend.yml`, `deploy-frontend.yml`, `deploy-app.yml`) could run simultaneously
2. The Bicep template uses `uniqueString(resourceGroup().id, environment)` to generate resource names
3. When multiple deployments run concurrently before resources are created, they generate different unique strings due to Azure Resource Manager's internal state differences
4. Each concurrent deployment creates its own complete set of resources

## Solution
Added a shared workflow concurrency control mechanism:

```yaml
concurrency:
  group: azure-deployment-${{ vars.AZURE_RESOURCE_GROUP }}
  cancel-in-progress: false
```

This configuration:
- Ensures only **one** deployment workflow runs at a time per resource group
- Queues subsequent workflows instead of running them concurrently
- Allows deployments to complete gracefully (`cancel-in-progress: false`)
- Still permits parallel deployments to different resource groups

## Changes Made
Modified 4 workflow files:
1. `.github/workflows/deploy-infra.yml` - Updated concurrency group name for consistency
2. `.github/workflows/deploy-backend.yml` - Added concurrency control
3. `.github/workflows/deploy-frontend.yml` - Added concurrency control
4. `.github/workflows/deploy-app.yml` - Added concurrency control

## Verification Steps

### 1. Clean Up Duplicate Resources (if needed)
Before testing, you may want to clean up existing duplicate resources:

```bash
# List all resources in the resource group
az resource list --resource-group <your-resource-group> --output table

# Identify and delete duplicate resources (keep only one set)
# For example, to delete a duplicate function app:
az functionapp delete --name func-lfpptur2r7j5o --resource-group <your-resource-group>

# Or delete and recreate the entire resource group:
az group delete --name <your-resource-group> --yes
az group create --name <your-resource-group> --location westeurope
```

### 2. Test Concurrency Control
Trigger multiple workflows simultaneously:

```bash
# Using GitHub CLI
gh workflow run deploy-infra.yml
gh workflow run deploy-app.yml
gh workflow run deploy-backend.yml

# Or manually through GitHub UI:
# Actions → Select workflow → Run workflow (click multiple times rapidly)
```

Expected behavior:
1. First workflow starts immediately
2. Second and third workflows show "Queued" or "Waiting" status
3. Workflows execute one at a time
4. Only one set of resources is created

### 3. Monitor Workflow Execution
Check the workflow status:

```bash
# List recent workflow runs
gh run list --workflow=deploy-infra.yml --limit 5
gh run list --workflow=deploy-app.yml --limit 5

# Watch a specific run
gh run watch <run-id>
```

In the GitHub UI (Actions tab):
- You should see workflows with "Waiting" badge
- Hover over to see "Waiting for a concurrent deployment to finish"

### 4. Verify Resource Count
After all workflows complete, verify only one set of resources exists:

```bash
# Count Function Apps (should be 1)
az functionapp list --resource-group <your-resource-group> --query "length([?contains(kind, 'functionapp')])"

# Count Static Web Apps (should be 1)
az staticwebapp list --resource-group <your-resource-group> --query "length([*])"

# Count Application Insights (should be 1)
az resource list --resource-group <your-resource-group> --resource-type "microsoft.insights/components" --query "length([*])"

# Count Storage Accounts (should be 1)
az storage account list --resource-group <your-resource-group> --query "length([*])"
```

## Benefits
✅ Prevents duplicate resource creation  
✅ Reduces Azure costs (no unnecessary duplicate resources)  
✅ Ensures consistent resource naming  
✅ Maintains deployment reliability  
✅ Still allows parallel deployments to different environments  

## Trade-offs
⏱️ Deployments to the same resource group execute serially (may increase total time)  
⏳ Workflows may wait in queue if triggered rapidly  

## References
- [GitHub Actions: Using concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency)
- Decision Record: `Decision Records/concurrency-control.md`
- Modified workflows: `deploy-infra.yml`, `deploy-backend.yml`, `deploy-frontend.yml`, `deploy-app.yml`
