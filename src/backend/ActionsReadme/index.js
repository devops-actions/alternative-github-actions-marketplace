const { withCorsHeaders } = require('../lib/cors');

async function fetchReadmeFromGitHub(owner, name, version) {
  const ref = version || 'main';
  const url = `https://api.github.com/repos/${owner}/${name}/readme?ref=${ref}`;
  
  const headers = {
    'Accept': 'application/vnd.github.v3.html',
    'User-Agent': 'Alternative-GitHub-Actions-Marketplace'
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return await response.text();
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
    const readmeHtml = await fetchReadmeFromGitHub(owner, name, version);

    if (!readmeHtml) {
      context.res = {
        status: 404,
        headers: withCorsHeaders(req),
        body: { error: 'README not found.' }
      };
      return;
    }

    context.res = {
      status: 200,
      headers: withCorsHeaders(req, { 'Content-Type': 'text/html; charset=utf-8' }),
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
