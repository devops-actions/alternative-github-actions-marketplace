const { createTableClient } = require('./tableStorage');

const readmeTableName = process.env.README_TABLE_NAME || 'readmes';

function getReadmeTableClient(options = {}) {
  return createTableClient({
    ...options,
    tableName: readmeTableName
  });
}

/**
 * Creates a partition key for README storage
 * Uses the same normalization as action records
 */
function getReadmePartitionKey(owner, name) {
  return `${owner.toLowerCase()}-${name.toLowerCase()}`;
}

/**
 * Creates a row key for README storage based on version
 */
function getReadmeRowKey(version) {
  return (version || 'main').toLowerCase();
}

/**
 * Retrieves cached README from Table Storage
 * @param {string} owner - Repository owner
 * @param {string} name - Repository name
 * @param {string} version - Version/ref to fetch
 * @returns {Promise<Object|null>} Cached README object or null if not found
 */
async function getCachedReadme(owner, name, version, options = {}) {
  const client = options.tableClient || getReadmeTableClient();
  const partitionKey = getReadmePartitionKey(owner, name);
  const rowKey = getReadmeRowKey(version);

  try {
    const entity = await client.getEntity(partitionKey, rowKey);
    return {
      content: entity.Content,
      cachedAt: entity.CachedAt ? new Date(entity.CachedAt) : null,
      repoUpdatedAt: entity.RepoUpdatedAt ? new Date(entity.RepoUpdatedAt) : null
    };
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Stores README in Table Storage cache
 * @param {string} owner - Repository owner
 * @param {string} name - Repository name
 * @param {string} version - Version/ref
 * @param {string} content - README HTML content
 * @param {Date} repoUpdatedAt - When the repository was last updated
 */
async function cacheReadme(owner, name, version, content, repoUpdatedAt, options = {}) {
  const client = options.tableClient || getReadmeTableClient();
  const partitionKey = getReadmePartitionKey(owner, name);
  const rowKey = getReadmeRowKey(version);
  const now = new Date();

  const entity = {
    partitionKey,
    rowKey,
    Content: content,
    CachedAt: now.toISOString(),
    RepoUpdatedAt: repoUpdatedAt ? repoUpdatedAt.toISOString() : null,
    Owner: owner,
    Name: name,
    Version: version || 'main'
  };

  await client.upsertEntity(entity, 'Replace');
}

/**
 * Checks if cached README is still valid based on repository update time
 * @param {Object} cachedReadme - Cached README object
 * @param {Date} currentRepoUpdatedAt - Current repository updated_at timestamp
 * @returns {boolean} True if cache is still valid
 */
function isCacheValid(cachedReadme, currentRepoUpdatedAt) {
  if (!cachedReadme || !cachedReadme.content) {
    return false;
  }

  // If we don't have repo update times, cache for 1 hour
  if (!cachedReadme.repoUpdatedAt || !currentRepoUpdatedAt) {
    const cacheAge = Date.now() - (cachedReadme.cachedAt ? cachedReadme.cachedAt.getTime() : 0);
    return cacheAge < 60 * 60 * 1000; // 1 hour
  }

  // Cache is valid if repo hasn't been updated since we cached the README
  return cachedReadme.repoUpdatedAt >= currentRepoUpdatedAt;
}

module.exports = {
  getReadmeTableClient,
  getCachedReadme,
  cacheReadme,
  isCacheValid,
  getReadmePartitionKey,
  getReadmeRowKey
};
