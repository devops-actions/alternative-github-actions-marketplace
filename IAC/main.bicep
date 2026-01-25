@description('Deployment environment label, used for naming (e.g., dev, prod).')
param environment string = 'dev'

@description('Primary Azure region for regional resources.')
param location string = 'westeurope'

@description('Region for Static Web App deployment. Must be a supported Static Web Apps region.')
param staticWebAppLocation string = 'West Europe'

@description('Table Storage table name for GitHub Actions metadata.')
param tableName string = 'actions'

@description('Assign Storage Table Data Contributor role to the function app managed identity. Requires role assignment permissions on the storage account scope.')
param assignTableDataContributor bool = false

@description('IP CIDRs allowed to reach the Function App (e.g., Static Web Apps outbound IPs). Leave empty to allow all.')
param functionAllowedIpCidrs array = []

@description('Additional IP CIDRs allowed to reach the Function App for debugging/validation (e.g., your public IP as /32). Leave empty to disable.')
param functionDebugAllowedIpCidrs array = []

@description('Static Web App hostname to allow CORS from. If provided, will be added to CORS allowed origins.')
param staticWebAppHostname string = ''

@description('CORS allowed origins for the Function App. Include https://portal.azure.com to enable Azure Portal Test/Run. The Static Web App origin is automatically added if staticWebAppHostname is provided.')
param functionCorsAllowedOrigins array = [
  'https://portal.azure.com'
]

var uniqueSuffix = uniqueString(resourceGroup().id, environment)
var storageAccountName = toLower('st${uniqueSuffix}')
var functionAppName = 'func-${uniqueSuffix}'
var staticWebAppName = 'swa-${uniqueSuffix}'
var hostingPlanName = 'plan-${uniqueSuffix}'
var insightsName = 'appi-${uniqueSuffix}'
var fileShareName = toLower('func${uniqueSuffix}')

var functionDebugIpSecurityRestrictions = [for (cidr, i) in functionDebugAllowedIpCidrs: {
  name: 'AllowDebug${i}'
  ipAddress: cidr
  action: 'Allow'
  priority: 90 + i
  description: 'Temporary debug access (e.g., Azure Portal Test/Run)'
}]

var functionSwaIpSecurityRestrictions = [for (cidr, i) in functionAllowedIpCidrs: {
  name: 'AllowSWA${i}'
  ipAddress: cidr
  action: 'Allow'
  priority: 100 + i
  description: 'Static Web Apps outbound IP'
}]

var functionIpSecurityRestrictions = concat(functionDebugIpSecurityRestrictions, functionSwaIpSecurityRestrictions)

// Build complete CORS origins list, adding Static Web App if provided
// Include both with and without trailing slash to handle browser Origin header variations
var completeCorsOrigins = !empty(staticWebAppHostname) 
  ? union(functionCorsAllowedOrigins, ['https://${staticWebAppHostname}', 'https://${staticWebAppHostname}/'])
  : functionCorsAllowedOrigins

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource table 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  name: '${storageAccount.name}/default/${tableName}'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  name: '${storageAccount.name}/default/${fileShareName}'
  properties: {
    shareQuota: 1
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: insightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    IngestionMode: 'ApplicationInsights'
  }
}

resource hostingPlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: hostingPlanName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: false
  }
}

resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  properties: {
    httpsOnly: true
    serverFarmId: hostingPlan.id
    siteConfig: {
      nodeVersion: '~22'
      cors: {
        allowedOrigins: completeCorsOrigins
        supportCredentials: false
      }
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${az.environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${az.environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: split(fileShare.name, '/')[2]
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ACTIONS_TABLE_NAME'
          value: tableName
        }
        {
          name: 'ACTIONS_TABLE_URL'
          value: 'https://${storageAccount.name}.table.${az.environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
      ]
      ipSecurityRestrictions: functionIpSecurityRestrictions
      ipSecurityRestrictionsDefaultAction: (length(functionAllowedIpCidrs) > 0 || length(functionDebugAllowedIpCidrs) > 0) ? 'Deny' : 'Allow'
      scmIpSecurityRestrictionsUseMain: false
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

resource tableDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignTableDataContributor) {
  name: guid(storageAccount.id, 'StorageTableDataContributor', functionApp.id)
  scope: storageAccount
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b8fa-4a7e-88f8-87b6abefc6c0')
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: staticWebAppName
  location: staticWebAppLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    buildProperties: {
      appLocation: 'src/frontend'
      outputLocation: 'dist'
    }
  }
}

output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output functionAppDefaultHostname string = functionApp.properties.defaultHostName
output functionAppName string = functionApp.name
output tableEndpoint string = storageAccount.properties.primaryEndpoints.table
output applicationInsightsConnection string = appInsights.properties.ConnectionString
