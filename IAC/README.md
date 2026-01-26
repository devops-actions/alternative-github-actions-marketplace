# Infrastructure as Code (IAC)

This directory contains Bicep templates for deploying the Alternative GitHub Actions Marketplace infrastructure to Azure.

## Resources Deployed

The `main.bicep` template deploys:

- **Azure Static Web Apps** (Free tier) - Hosts the React frontend
- **Azure Functions** (Consumption plan) - Hosts the backend API
- **Azure Storage Account** - Stores action metadata in Table Storage
- **Application Insights** - Telemetry and monitoring
- **App Service Plan** (Consumption) - For Azure Functions

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `environment` | Deployment environment label (e.g., dev, prod) | `'dev'` | No |
| `location` | Primary Azure region for regional resources | `'westeurope'` | No |
| `staticWebAppLocation` | Region for Static Web App deployment | `'West Europe'` | No |
| `tableName` | Table Storage table name for GitHub Actions metadata | `'actions'` | No |
| `assignTableDataContributor` | Assign Storage Table Data Contributor role to function app | `false` | No |
| `functionAllowedIpCidrs` | IP CIDRs allowed to reach the Function App | `[]` | No |
| `functionDebugAllowedIpCidrs` | Additional IP CIDRs for debugging/validation | `[]` | No |
| `staticWebAppHostname` | Static Web App hostname for CORS configuration | `''` | No |
| `functionCorsAllowedOrigins` | CORS allowed origins for the Function App | `['https://portal.azure.com']` | No |
| `plausibleTrackingDomain` | Custom domain for Plausible Analytics tracking | `''` | No |

## Custom Domain Configuration

The template supports configuring a custom domain on the Static Web App for Plausible Analytics tracking.

### Setup

1. **Set repository variable**: Configure `PLAUSIBLE_TRACKING_DOMAIN` with your custom domain:
   ```
   PLAUSIBLE_TRACKING_DOMAIN=marketplace.example.com
   ```

2. **Deploy infrastructure**: The `deploy-infra.yml` workflow passes this to Bicep:
   ```yaml
   parameters: |
     plausibleTrackingDomain=${{ vars.PLAUSIBLE_TRACKING_DOMAIN }}
   ```

3. **Bicep deployment**: Creates a `Microsoft.Web/staticSites/customDomains` resource:
   - Conditional deployment (only if domain is provided)
   - Uses CNAME delegation validation method
   - Depends on the Static Web App resource

4. **Configure DNS**: Create a CNAME record in your DNS provider:
   - **Name**: Your custom domain (e.g., `marketplace.example.com`)
   - **Value**: Static Web App default hostname (e.g., `swa-xyz123.azurestaticapps.net`)
   - **TTL**: 3600 (or your preferred value)

5. **Wait for validation**: Azure validates domain ownership via the CNAME record (usually takes a few minutes)

### How It Works

The custom domain resource in Bicep:

```bicep
resource staticWebAppCustomDomain 'Microsoft.Web/staticSites/customDomains@2022-09-01' = if (!empty(plausibleTrackingDomain)) {
  name: '${staticWebApp.name}/${plausibleTrackingDomain}'
  properties: {
    validationMethod: 'cname-delegation'
  }
}
```

- **Conditional deployment**: `if (!empty(plausibleTrackingDomain))` ensures the resource is only created when a domain is provided
- **Naming**: Uses parent/child resource syntax: `{staticWebAppName}/{domainName}`
- **Validation**: `cname-delegation` requires a CNAME record pointing to the Static Web App

### DNS Example

If your Static Web App hostname is `swa-abc123xyz.azurestaticapps.net` and you want to use `marketplace.example.com`:

```
marketplace.example.com.  CNAME  swa-abc123xyz.azurestaticapps.net.
```

## Deployment

Deploy using the GitHub Actions workflow:

```bash
gh workflow run deploy-infra.yml
```

Or manually with Azure CLI:

```bash
az deployment group create \
  --resource-group <your-resource-group> \
  --template-file IAC/main.bicep \
  --parameters \
    environment=prod \
    location=westeurope \
    plausibleTrackingDomain=marketplace.example.com
```

## Outputs

| Output | Description |
|--------|-------------|
| `staticWebAppDefaultHostname` | Default hostname of the Static Web App |
| `functionAppDefaultHostname` | Default hostname of the Function App |
| `functionAppName` | Name of the Function App |
| `tableEndpoint` | Table Storage endpoint URL |
| `applicationInsightsConnection` | Application Insights connection string |
| `plausibleTrackingDomain` | The configured Plausible tracking domain |
