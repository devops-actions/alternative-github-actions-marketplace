@description('Deployment environment label, used for naming (e.g., dev, prod).')
param environment string = 'dev'

@description('Primary Azure region for regional resources.')
param location string = 'westeurope'

@description('Region for Static Web App deployment. Must be a supported Static Web Apps region.')
param staticWebAppLocation string = 'West Europe'

@description('Table Storage table name for GitHub Actions metadata.')
param tableName string = 'actions'

var uniqueSuffix = uniqueString(resourceGroup().id, environment)
var storageAccountName = toLower('st${uniqueSuffix}')
var functionAppName = 'func-${uniqueSuffix}'
var staticWebAppName = 'swa-${uniqueSuffix}'
var hostingPlanName = 'plan-${uniqueSuffix}'
var insightsName = 'appi-${uniqueSuffix}'
var fileShareName = toLower('func${environment}')

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
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: concat('DefaultEndpointsProtocol=https;AccountName=', storageAccount.name, ';AccountKey=', storageAccount.listKeys().keys[0].value, ';EndpointSuffix=', az.environment().suffixes.storage)
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: concat('DefaultEndpointsProtocol=https;AccountName=', storageAccount.name, ';AccountKey=', storageAccount.listKeys().keys[0].value, ';EndpointSuffix=', az.environment().suffixes.storage)
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: fileShareName
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
          value: '~18'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
      ]
    }
  }
  identity: {
    type: 'SystemAssigned'
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
      appLocation: 'web'
      apiLocation: 'api'
      outputLocation: 'dist'
    }
  }
}

output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output functionAppDefaultHostname string = functionApp.properties.defaultHostName
output tableEndpoint string = storageAccount.properties.primaryEndpoints.table
output applicationInsightsConnection string = appInsights.properties.ConnectionString
