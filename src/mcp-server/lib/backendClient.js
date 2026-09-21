'use strict';

const BACKEND_API_URL = (process.env.BACKEND_API_URL || '').replace(/\/+$/, '');

/**
 * Fetch action data from the backend API.
 * @param {string} owner - Action owner (lowercase)
 * @param {string} name - Action repo name (lowercase)
 * @returns {Promise<Object|null>} Action payload or null if not found
 */
async function fetchAction(owner, name) {
  const baseUrl = BACKEND_API_URL || 'http://localhost:7071/api';
  const url = `${baseUrl}/actions/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000)
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Backend API returned ${response.status} for ${owner}/${name}`);
  }

  return response.json();
}

/**
 * Fetch a list of actions (for cache pre-warming).
 * @param {Object} options
 * @param {number} options.limit - Max number of actions to fetch
 * @returns {Promise<Array>}
 */
async function fetchActionsList(options = {}) {
  const baseUrl = BACKEND_API_URL || 'http://localhost:7071/api';
  const limit = options.limit || 200;
  const url = `${baseUrl}/actions/list?limit=${limit}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Backend API returned ${response.status} for actions list`);
  }

  const body = await response.json();

  // The endpoint returns a plain array when unpaginated, or a paginated
  // `{ items, nextCursor }` envelope when `limit` is used (as it always is
  // here). Normalize to a plain array for callers.
  if (Array.isArray(body)) {
    return body;
  }

  if (body && Array.isArray(body.items)) {
    return body.items;
  }

  return body;
}

module.exports = { fetchAction, fetchActionsList };
