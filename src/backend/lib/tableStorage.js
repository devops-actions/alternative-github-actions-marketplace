const { TableClient } = require('@azure/data-tables');
const { DefaultAzureCredential } = require('@azure/identity');

const defaultTableName = process.env.ACTIONS_TABLE_NAME || 'actions';
const storageConnection = process.env.ACTIONS_TABLE_CONNECTION || process.env.AzureWebJobsStorage;
const tableEndpoint = process.env.ACTIONS_TABLE_URL || process.env.ACTIONS_TABLE_ENDPOINT;

function createTableClient(options = {}) {
  const tableName = options.tableName || defaultTableName;
  const connectionString = Object.prototype.hasOwnProperty.call(options, 'connectionString')
    ? options.connectionString
    : storageConnection;
  const endpoint = Object.prototype.hasOwnProperty.call(options, 'tableEndpoint')
    ? options.tableEndpoint
    : tableEndpoint;

  if (connectionString) {
    return TableClient.fromConnectionString(connectionString, tableName);
  }

  if (!endpoint) {
    throw new Error('Missing table endpoint. Configure ACTIONS_TABLE_URL or provide a connection string.');
  }

  const credential = options.credential || new DefaultAzureCredential();
  return new TableClient(endpoint, tableName, credential);
}

let cachedClient;

function getTableClient() {
  if (!cachedClient) {
    cachedClient = createTableClient();
  }
  return cachedClient;
}

function setTableClient(tableClient) {
  cachedClient = tableClient;
}

async function getActionEntity(partitionKey, rowKey, options = {}) {
  const client = options.tableClient || getTableClient();

  try {
    return await client.getEntity(partitionKey, rowKey);
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

module.exports = {
  createTableClient,
  getTableClient,
  setTableClient,
  getActionEntity
};
