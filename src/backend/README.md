# Actions Marketplace Client

Client library for uploading GitHub Actions metadata to the alternative marketplace API.

## Installation

```bash
npm install @devops-actions/actions-marketplace-client
```

## Usage

The client supports two modes of operation:

1. **Direct Azure Table Storage access** - Most efficient for bulk operations
2. **HTTP API** - Simpler setup, works through the public API

### HTTP API Mode (Recommended for Most Users)

This mode uploads actions through the public HTTP API endpoint.

```javascript
const { ActionsMarketplaceClient } = require('@devops-actions/actions-marketplace-client');

// Create client pointing to the API
const client = new ActionsMarketplaceClient({
  apiUrl: 'https://your-marketplace-api.azurewebsites.net'
});

// Upload a single action
const result = await client.upsertAction({
  owner: 'actions',
  name: 'checkout',
  description: 'Checkout code from a repository',
  version: 'v4.0.0',
  // ... additional metadata
});

console.log(result);
// { updated: true, created: true, owner: 'actions', name: 'checkout', lastSyncedUtc: '2026-01-03T...' }
```

### Direct Table Storage Mode

This mode requires Azure credentials and direct access to the storage account. It's more efficient for bulk operations but requires proper authentication setup.

```javascript
const { ActionsMarketplaceClient } = require('@devops-actions/actions-marketplace-client');
const { DefaultAzureCredential } = require('@azure/identity');

// Create client with direct table access
const client = new ActionsMarketplaceClient({
  tableEndpoint: 'https://youraccount.table.core.windows.net',
  tableName: 'actions',
  credential: new DefaultAzureCredential()
});

// Upload a single action
const result = await client.upsertAction({
  owner: 'actions',
  name: 'checkout',
  description: 'Checkout code from a repository',
  version: 'v4.0.0',
  // ... additional metadata
});
```

### Batch Operations

Upload multiple actions at once:

```javascript
const actions = [
  {
    owner: 'actions',
    name: 'checkout',
    description: 'Checkout code from a repository',
    version: 'v4.0.0'
  },
  {
    owner: 'actions',
    name: 'setup-node',
    description: 'Setup Node.js environment',
    version: 'v4.0.0'
  }
];

const results = await client.batchUpsertActions(actions);

results.forEach(result => {
  if (result.success) {
    console.log(`✓ ${result.action} - ${result.result.created ? 'created' : 'updated'}`);
  } else {
    console.error(`✗ ${result.action} - ${result.error}`);
  }
});
```

## Authentication Examples

### 1. Using Azure Managed Identity (Recommended for Azure environments)

When running on Azure (VMs, Functions, Container Apps, etc.), use Managed Identity:

```javascript
const { ActionsMarketplaceClient } = require('@devops-actions/actions-marketplace-client');
const { ManagedIdentityCredential } = require('@azure/identity');

const client = new ActionsMarketplaceClient({
  tableEndpoint: 'https://youraccount.table.core.windows.net',
  tableName: 'actions',
  credential: new ManagedIdentityCredential()
});
```

**Setup steps:**
1. Enable Managed Identity on your Azure resource
2. Grant the identity "Storage Table Data Contributor" role on the storage account
3. Deploy your code - authentication is automatic

### 2. Using Service Principal

For applications running outside Azure or requiring explicit credentials:

```javascript
const { ActionsMarketplaceClient } = require('@devops-actions/actions-marketplace-client');
const { ClientSecretCredential } = require('@azure/identity');

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID,
  process.env.AZURE_CLIENT_ID,
  process.env.AZURE_CLIENT_SECRET
);

const client = new ActionsMarketplaceClient({
  tableEndpoint: 'https://youraccount.table.core.windows.net',
  tableName: 'actions',
  credential
});
```

**Setup steps:**
1. Create an Azure AD App Registration
2. Create a client secret
3. Grant the app "Storage Table Data Contributor" role on the storage account
4. Set environment variables with tenant ID, client ID, and secret

### 3. Using Azure CLI Authentication (Development)

For local development using Azure CLI:

```javascript
const { ActionsMarketplaceClient } = require('@devops-actions/actions-marketplace-client');
const { AzureCliCredential } = require('@azure/identity');

const client = new ActionsMarketplaceClient({
  tableEndpoint: 'https://youraccount.table.core.windows.net',
  tableName: 'actions',
  credential: new AzureCliCredential()
});
```

**Setup steps:**
1. Install Azure CLI
2. Run `az login`
3. Run your application - it will use your Azure CLI credentials

### 4. Using DefaultAzureCredential (Recommended for flexibility)

`DefaultAzureCredential` automatically tries multiple authentication methods in order:

```javascript
const { ActionsMarketplaceClient } = require('@devops-actions/actions-marketplace-client');
const { DefaultAzureCredential } = require('@azure/identity');

const client = new ActionsMarketplaceClient({
  tableEndpoint: 'https://youraccount.table.core.windows.net',
  tableName: 'actions',
  credential: new DefaultAzureCredential()
});
```

It tries in order:
1. Environment variables (Service Principal)
2. Managed Identity
3. Azure CLI
4. Azure PowerShell
5. Interactive browser (development)

### 5. Using Connection String (Simple, but less secure)

For development or when other methods aren't feasible:

```javascript
const { ActionsMarketplaceClient } = require('@devops-actions/actions-marketplace-client');

const client = new ActionsMarketplaceClient({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  tableName: 'actions'
});
```

**Warning:** Connection strings contain full access credentials. Never commit them to source control.

### 6. GitHub Actions Workflow with OIDC (Recommended for CI/CD)

For GitHub Actions workflows, use OIDC authentication:

```yaml
name: Upload Action Metadata

on:
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: npm install @devops-actions/actions-marketplace-client
      
      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      
      - name: Upload action metadata
        run: node upload-script.js
        env:
          AZURE_TABLE_ENDPOINT: ${{ vars.AZURE_TABLE_ENDPOINT }}
          AZURE_TABLE_NAME: ${{ vars.AZURE_TABLE_NAME }}
```

**upload-script.js:**

```javascript
const { ActionsMarketplaceClient } = require('@devops-actions/actions-marketplace-client');
const { DefaultAzureCredential } = require('@azure/identity');

async function main() {
  const client = new ActionsMarketplaceClient({
    tableEndpoint: process.env.AZURE_TABLE_ENDPOINT,
    tableName: process.env.AZURE_TABLE_NAME,
    credential: new DefaultAzureCredential()
  });

  const result = await client.upsertAction({
    owner: 'my-org',
    name: 'my-action',
    description: 'My custom action',
    version: 'v1.0.0'
  });

  console.log('Upload result:', result);
}

main().catch(console.error);
```

**Setup steps:**
1. Configure OIDC federation in Azure AD for your GitHub repository
2. Grant the federated identity "Storage Table Data Contributor" role
3. Add secrets to GitHub (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID)

## Action Data Schema

The action metadata should include at minimum:

```javascript
{
  owner: 'string',        // Required: Action owner/organization
  name: 'string',         // Required: Action name
  description: 'string',  // Recommended: Action description
  version: 'string',      // Recommended: Current version
  // Additional metadata fields...
}
```

The library automatically:
- Normalizes and validates the data
- Generates a unique hash to detect changes
- Handles retries on conflicts
- Creates appropriate partition and row keys for Azure Table Storage

## API Reference

### `new ActionsMarketplaceClient(options)`

Creates a new client instance.

**Options for HTTP API mode:**
- `apiUrl` (string): The base URL of the marketplace API

**Options for Direct Table Storage mode:**
- `tableEndpoint` (string): Azure Table Storage endpoint URL
- `tableName` (string): Name of the table (default: 'actions')
- `credential` (TokenCredential): Azure credential for authentication
- `connectionString` (string): Alternative to endpoint + credential

### `client.upsertAction(actionData)`

Uploads or updates a single action.

**Parameters:**
- `actionData` (object): Action metadata with at minimum `owner` and `name` fields

**Returns:** Promise resolving to:
```javascript
{
  updated: boolean,    // Whether the record was updated
  created: boolean,    // Whether the record was newly created
  owner: string,       // Action owner
  name: string,        // Action name
  lastSyncedUtc: string // ISO timestamp of last sync
}
```

### `client.batchUpsertActions(actions)`

Uploads or updates multiple actions.

**Parameters:**
- `actions` (array): Array of action metadata objects

**Returns:** Promise resolving to array of results:
```javascript
[
  {
    success: true,
    action: 'owner/name',
    result: { updated: true, created: false, ... }
  },
  {
    success: false,
    action: 'owner/name',
    error: 'Error message'
  }
]
```

## Error Handling

The client throws errors for:
- Invalid action data (missing required fields)
- Network failures
- Authentication issues
- Storage access problems

Always wrap calls in try-catch:

```javascript
try {
  const result = await client.upsertAction(actionData);
  console.log('Success:', result);
} catch (error) {
  console.error('Failed to upload action:', error.message);
}
```

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

## License

CC0-1.0 (Public Domain)

## Contributing

Issues and pull requests welcome at https://github.com/devops-actions/alternative-github-actions-marketplace
