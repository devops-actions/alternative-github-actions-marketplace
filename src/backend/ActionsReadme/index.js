const { withCorsHeaders } = require('../lib/cors');
const { getGitHubAuthHeaders } = require('../lib/githubAuth');
const { getCachedReadme, cacheReadme, isCacheValid } = require('../lib/readmeCache');
const { getActionEntity } = require('../lib/tableStorage');
const { ActionRecord } = require('../lib/actionRecord');

async function fetchReadmeFromGitHub(owner, name, version) {
  const ref = version || 'main';
  const url = `https://api.github.com/repos/${owner}/${name}/readme?ref=${ref}`;
  
  const headers = await getGitHubAuthHeaders();

  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function getRepoUpdatedAt(owner, name) {
  const partitionKey = ActionRecord.normalizeKey(owner);
  const rowKey = ActionRecord.normalizeKey(name);
  
  try {
    const entity = await getActionEntity(partitionKey, rowKey);
    if (!entity) {
      return null;
    }

    const record = ActionRecord.fromEntity(entity);
    const payload = JSON.parse(record.canonicalJson);
    
    if (payload.repoInfo && payload.repoInfo.updated_at) {
      return new Date(payload.repoInfo.updated_at);
    }
  } catch (error) {
    // If we can't get the action data, just proceed without caching
    return null;
  }
  
  return null;
}

module.exports = async function actionsReadme(context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: withCorsHeaders(req, { 'Allow': 'GET,OPTIONS' })
    };
    return;
  }

  if (req.method !== 'GET') {
    context.res = {
      status: 405,
      headers: withCorsHeaders(req, { 'Allow': 'GET,OPTIONS' }),
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  const owner = context.bindingData && context.bindingData.owner;
  const name = context.bindingData && context.bindingData.name;
  const version = req.query && req.query.version;

  if (!owner || !name) {
    context.res = {
      status: 400,
      headers: withCorsHeaders(req),
      body: { error: 'Owner and name route parameters are required.' }
    };
    return;
  }

  try {
    // Get repository update timestamp
    const repoUpdatedAt = await getRepoUpdatedAt(owner, name);
    
    // Try to get cached README
    const cachedReadme = await getCachedReadme(owner, name, version);
    
    // Check if cache is still valid
    if (cachedReadme && isCacheValid(cachedReadme, repoUpdatedAt)) {
      context.log.info(`Serving cached README for ${owner}/${name}@${version || 'main'}`);
      context.res = {
        status: 200,
        headers: withCorsHeaders(req, { 
          'Content-Type': 'text/html; charset=utf-8',
          'X-Cache': 'HIT'
        }),
        body: cachedReadme.content
      };
      return;
    }

    // Fetch fresh README from GitHub
    context.log.info(`Fetching README from GitHub for ${owner}/${name}@${version || 'main'}`);
    const readmeHtml = await fetchReadmeFromGitHub(owner, name, version);

    if (!readmeHtml) {
      context.res = {
        status: 404,
        headers: withCorsHeaders(req),
        body: { error: 'README not found.' }
      };
      return;
    }

    // Cache the README for future requests
    try {
      await cacheReadme(owner, name, version, readmeHtml, repoUpdatedAt);
      context.log.info(`Cached README for ${owner}/${name}@${version || 'main'}`);
    } catch (cacheError) {
      // Log but don't fail if caching fails
      context.log.warn(`Failed to cache README: ${cacheError.message}`);
    }

    context.res = {
      status: 200,
      headers: withCorsHeaders(req, { 
        'Content-Type': 'text/html; charset=utf-8',
        'X-Cache': 'MISS'
      }),
      body: readmeHtml
    };
  } catch (error) {
    context.log.error('Failed to fetch README: %s', error.message);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to fetch README.' }
    };
  }
};
