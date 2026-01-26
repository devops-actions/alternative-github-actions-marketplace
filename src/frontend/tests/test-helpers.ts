import { Page, expect } from '@playwright/test';

export type PageDiagnostics = {
  console: string[];
  network: string[];
};

export const getFrontendBaseUrl = () => process.env.FRONTEND_BASE_URL || 'http://localhost:4173';

export function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.replace(/^\/+/, '');
  return `${base}/${suffix}`;
}

export const getApiBaseUrl = () => {
  const explicit = process.env.API_BASE_URL || process.env.VITE_API_BASE_URL;
  if (explicit) {
    return explicit;
  }
  return joinUrl(getFrontendBaseUrl(), '/api');
};

export async function waitForResults(page: Page) {
  const card = page.locator('.action-card').first();
  const empty = page.locator('.no-results').first();

  // Wait for either an action card or the no-results placeholder.
  const timeoutMs = 60000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await card.isVisible().catch(() => false)) return;
    if (await empty.isVisible().catch(() => false)) return;
    await page.waitForTimeout(500);
  }

  // Collect some diagnostics from the page to help CI logs.
  const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
  const rootLen = (rootHtml || '').trim().length;
  const errEl = page.locator('.error-message').first();
  const errText = (await errEl.innerText().catch(() => '')).trim();

  // Try to perform quick API diagnostics from within browser context.
  let apiDiag = '';
  try {
    const apiBase = getApiBaseUrl();
    const diag = await page.evaluate(async (base) => {
      async function wrap(path) {
        try {
          const resp = await fetch(base + path, { cache: 'no-store' });
          const text = await resp.text().catch(() => '');
          return { status: resp.status, body: text.slice(0, 1000) };
        } catch (err) {
          return { error: String(err) };
        }
      }
      const list = await wrap('/actions/list');
      const stats = await wrap('/actions/stats');
      return { list, stats };
    }, apiBase);

    const listPart = diag?.list ? (`list=${diag.list.status||diag.list.error}`) : 'list=err';
    const statsPart = diag?.stats ? (`stats=${diag.stats.status||diag.stats.error}`) : 'stats=err';
    apiDiag = `${listPart}, ${statsPart}`;
  } catch (e) {
    apiDiag = `apiDiagError=${String(e)}`;
  }

  throw new Error(
    `waitForResults: no .action-card or .no-results visible after ${timeoutMs}ms. rootHtmlLength=${rootLen}. errorMessage=${errText || '(none)'}; ${apiDiag}`
  );
}

export async function goHome(page: Page, diagnostics?: PageDiagnostics) {
  const response = await page.goto(getFrontendBaseUrl(), { waitUntil: 'domcontentloaded' });
  const status = response?.status();
  if (typeof status === 'number' && status >= 400) {
    throw new Error(`Frontend navigation failed with HTTP ${status}`);
  }

  await expect(page).toHaveTitle(/Alternative GitHub Actions Marketplace/, { timeout: 60000 });

  try {
    await waitForResults(page);

    // If the API has actions but the UI is still showing an empty state,
    // give it a little extra time (large payload / slower rendering), then fail.
    // Try to access cached actions via the window (best-effort) - skip if unavailable.
    const cachedActionsCount = await page.evaluate(() => {
      try {
        // actionsService isn't exported; this is a best-effort probe for client-side cache
        // Fall back to reading window.__actions if tests set it - otherwise return -1
        // (caller can rely on server-side cachedActions in tests).
        // eslint-disable-next-line no-undef
        return (window as any).__e2e_cachedActions?.length ?? -1;
      } catch {
        return -1;
      }
    }).catch(() => -1);

    if (cachedActionsCount > 0) {
      const cards = page.locator('.action-card').first();
      const noResults = page.locator('.no-results').first();
      if (await noResults.isVisible().catch(() => false)) {
        await page.waitForTimeout(5000);
        if (!(await cards.isVisible().catch(() => false))) {
          throw new Error(`UI shows no results but API reports ${cachedActionsCount} actions`);
        }
      }
    }
  } catch (err) {
    const url = page.url();
    const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
    const rootLen = (rootHtml || '').trim().length;

    const consoleTail = diagnostics?.console?.slice(-30).join('\n') || '(none)';
    const networkTail = diagnostics?.network?.slice(-30).join('\n') || '(none)';
    throw new Error(
      `Overview did not render. url=${url}, httpStatus=${String(status)}, rootHtmlLength=${rootLen}. ${String(err)}\n\n` +
      `--- Browser console (tail) ---\n${consoleTail}\n\n` +
      `--- Network (tail) ---\n${networkTail}`
    );
  }
}
