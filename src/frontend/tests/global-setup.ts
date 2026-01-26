/**
 * Playwright global setup - runs once before all workers.
 * Pre-fetches the actions list and caches it to disk so workers don't
 * each hit the 16MB API endpoint independently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getApiBaseUrl, joinUrl } from './test-helpers';

const CACHE_FILE = path.join(process.cwd(), 'test-results', 'actions-cache.json');

async function fetchActionsListWithRetry(retries = 10, delayMs = 5000): Promise<unknown[]> {
  const apiBaseUrl = getApiBaseUrl();
  const url = joinUrl(apiBaseUrl, '/actions/list');
  let lastErr: unknown;

  for (let i = 0; i < retries; i += 1) {
    try {
      console.log(`[global-setup] Fetching actions list (attempt ${i + 1}/${retries})...`);
      const resp = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      if (!Array.isArray(data)) {
        throw new Error('Response is not an array');
      }

      console.log(`[global-setup] Fetched ${data.length} actions`);
      return data;
    } catch (err) {
      lastErr = err;
      console.log(`[global-setup] Attempt ${i + 1} failed: ${err}. Retrying in ${delayMs}ms...`);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export default async function globalSetup() {
  console.log('[global-setup] Starting global setup...');

  // Ensure test-results directory exists
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const actions = await fetchActionsListWithRetry();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(actions));
    console.log(`[global-setup] Cached ${actions.length} actions to ${CACHE_FILE}`);
  } catch (err) {
    // Write empty array so tests can detect API failure
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ error: String(err) }));
    console.error(`[global-setup] Failed to fetch actions: ${err}`);
  }
}
