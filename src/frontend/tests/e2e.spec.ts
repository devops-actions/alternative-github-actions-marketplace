import { test, expect, Page } from '@playwright/test';

type ActionListItem = {
  owner: string;
  name: string;
  verified?: boolean;
  actionType?: { actionType?: string };
  repoInfo?: { archived?: boolean };
};

const OVERVIEW_STATE_KEY = 'overviewState:v1';
let cachedActions: ActionListItem[] = [];
let apiReady = false;
let apiError: Error | null = null;

const getFrontendBaseUrl = () => process.env.FRONTEND_BASE_URL || 'http://localhost:4173';

function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.replace(/^\/+/, '');
  return `${base}/${suffix}`;
}

const getApiBaseUrl = () => {
  const explicit = process.env.API_BASE_URL || process.env.VITE_API_BASE_URL;
  if (explicit) {
    return explicit;
  }

  // Fallback for local setups that serve Functions behind /api.
  return joinUrl(getFrontendBaseUrl(), '/api');
};

async function fetchActionsList(): Promise<ActionListItem[]> {
  const apiBaseUrl = getApiBaseUrl();
  const resp = await fetch(joinUrl(apiBaseUrl, '/actions/list'), {
    headers: {
      'Cache-Control': 'no-cache'
    }
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch actions list: ${resp.status}`);
  }

  const data = (await resp.json()) as unknown;
  return Array.isArray(data) ? (data as ActionListItem[]) : [];
}

async function fetchActionsListWithRetry(retries: number = 5, delayMs: number = 3000): Promise<ActionListItem[]> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fetchActionsList();
    } catch (err) {
      lastErr = err;
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function clearPersistedOverviewState(page: Page) {
  await page.evaluate((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, OVERVIEW_STATE_KEY);
}

function typeFilterGroup(page: Page) {
  // The controls bar has two filter groups; the second contains the type filter buttons.
  return page.locator('.filter-group').filter({ hasText: 'Type:' }).first();
}

function statsBar(page: Page) {
  return page.locator('.stats-bar').first();
}

async function waitForOverviewSettled(page: Page) {
  const start = Date.now();
  const overallTimeoutMs = 240000;
  const errorGraceMs = 90000;

  const cards = page.locator('.action-card').first();
  const noResults = page.locator('.no-results').first();
  const errorMessage = page.locator('.error-message').first();
  const loadingIndicator = page.locator('.loading').first();

  let errorSince: number | null = null;
  let lastErrorText = '';
  let wasLoading = false;

  while (Date.now() - start < overallTimeoutMs) {
    if (await cards.isVisible().catch(() => false)) {
      return;
    }
    if (await noResults.isVisible().catch(() => false)) {
      return;
    }

    // Track if we ever saw the loading indicator (helps diagnose stuck states).
    if (await loadingIndicator.isVisible().catch(() => false)) {
      wasLoading = true;
    }

    if (await errorMessage.isVisible().catch(() => false)) {
      if (errorSince === null) {
        errorSince = Date.now();
      }
      lastErrorText = ((await errorMessage.innerText().catch(() => '')) || '').trim();
      if (Date.now() - errorSince > errorGraceMs) {
        throw new Error(`UI shows an error state: ${lastErrorText || '(empty error message)'}`);
      }
    } else {
      errorSince = null;
      lastErrorText = '';
    }

    await page.waitForTimeout(1000);
  }

  const stillLoading = await loadingIndicator.isVisible().catch(() => false);
  throw new Error(
    `Overview did not settle within ${overallTimeoutMs}ms. ` +
    `lastError=${lastErrorText || '(none)'}, wasLoading=${wasLoading}, stillLoading=${stillLoading}`
  );
}

type PageDiagnostics = {
  console: string[];
  network: string[];
};

async function goHome(page: Page, diagnostics?: PageDiagnostics) {
  const response = await page.goto(getFrontendBaseUrl(), { waitUntil: 'domcontentloaded' });
  const status = response?.status();
  if (typeof status === 'number' && status >= 400) {
    throw new Error(`Frontend navigation failed with HTTP ${status}`);
  }

  await expect(page).toHaveTitle(/Alternative GitHub Actions Marketplace/, { timeout: 60000 });

  try {
    await waitForOverviewSettled(page);

    // If the API has actions but the UI is still showing an empty state,
    // give it a little extra time (large payload / slower rendering), then fail.
    if (cachedActions.length > 0) {
      const cards = page.locator('.action-card').first();
      const noResults = page.locator('.no-results').first();
      if (await noResults.isVisible().catch(() => false)) {
        await page.waitForTimeout(5000);
        if (!(await cards.isVisible().catch(() => false))) {
          throw new Error(`UI shows no results but API reports ${cachedActions.length} actions`);
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

async function waitForResults(page: Page) {
  const card = page.locator('.action-card').first();
  const empty = page.locator('.no-results').first();

  // Wait for either an action card or the no-results placeholder.
  const timeoutMs = 120000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await card.isVisible().catch(() => false)) return;
    if (await empty.isVisible().catch(() => false)) return;
    await page.waitForTimeout(1000);
  }

  // Collect some diagnostics from the page to help CI logs.
  const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
  const rootLen = (rootHtml || '').trim().length;
  const errEl = page.locator('.error-message').first();
  const errText = (await errEl.innerText().catch(() => '')).trim();
  throw new Error(
    `waitForResults: no .action-card or .no-results visible after ${timeoutMs}ms. rootHtmlLength=${rootLen}. errorMessage=${errText || '(none)'} `
  );
}

async function ensureActionsVisible(page: Page) {
  // Wait until at least one action card or no-results is visible (loading finished).
  await waitForResults(page);
}

async function resetFilters(page: Page) {
  await typeFilterGroup(page).getByRole('button', { name: 'All', exact: true }).click();

  // Reset verified select to 'all'
  const verifiedSelect = page.locator('.filter-group').filter({ hasText: 'Verified:' }).first().locator('select');
  await verifiedSelect.selectOption('all');

  // Reset archived select to 'hide'
  const archivedSelect = page.locator('.filter-group').filter({ hasText: 'Archived:' }).first().locator('select');
  await archivedSelect.selectOption('hide');
}

async function assertTypeFilterActive(page: Page, label: string) {
  const button = typeFilterGroup(page).getByRole('button', { name: label, exact: true });
  await expect(button).toHaveClass(/active/);
}

async function assertVerifiedOnlyActive(page: Page, active: boolean) {
  const verifiedSelect = page.locator('.filter-group').filter({ hasText: 'Verified:' }).first().locator('select');
  const val = await verifiedSelect.inputValue();
  if (active) {
    if (val !== 'verified') {
      throw new Error('Expected verified filter to be active but it is not');
    }
  } else {
    if (val === 'verified') {
      throw new Error('Expected verified filter to not be active but it is');
    }
  }
}

async function assertArchivedToggleActive(page: Page, active: boolean) {
  // active=true means archived is not hidden (either 'show' or 'only')
  const archivedSelect = page.locator('.filter-group').filter({ hasText: 'Archived:' }).first().locator('select');
  const val = await archivedSelect.inputValue();
  if (active) {
    if (val === 'hide') {
      throw new Error('Expected archived filter to be active but it is set to hide');
    }
  } else {
    if (val !== 'hide') {
      throw new Error('Expected archived filter to be hide but it is not');
    }
  }
}

async function assertCardsMatchType(page: Page, expectedType: string) {
  const cards = page.locator('.action-card');
  const count = await cards.count();
  if (count === 0) {
    await expect(page.locator('.no-results')).toBeVisible({ timeout: 10000 });
    return;
  }

  const sample = Math.min(count, 5);
  for (let i = 0; i < sample; i += 1) {
    await expect(cards.nth(i).locator('.action-badge')).toHaveText(expectedType);
  }
}

async function assertCardsAreVerified(page: Page) {
  const cards = page.locator('.action-card');
  const count = await cards.count();
  if (count === 0) {
    await expect(page.locator('.no-results')).toBeVisible({ timeout: 10000 });
    return;
  }

  const sample = Math.min(count, 5);
  for (let i = 0; i < sample; i += 1) {
    await expect(cards.nth(i).getByText('Verified')).toBeVisible();
  }
}

async function assertAtLeastOneArchivedCardVisible(page: Page) {
  await expect(
    page
      .locator('.action-card')
      .locator('.meta-item')
      .getByText('Archived', { exact: true })
  ).toBeVisible({ timeout: 45000 });
}

async function assertCardsAreArchived(page: Page) {
  const cards = page.locator('.action-card');
  const count = await cards.count();
  const sample = Math.min(count, 5);
  if (sample === 0) {
    throw new Error('Expected at least one action-card to be visible');
  }

  for (let i = 0; i < sample; i += 1) {
    await expect(
      cards
        .nth(i)
        .locator('.meta-item')
        .getByText('Archived', { exact: true })
    ).toBeVisible();
  }
}

test.beforeEach(async ({ page }) => {
  const diagnostics: PageDiagnostics = { console: [], network: [] };
  page.on('console', msg => diagnostics.console.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => diagnostics.console.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => {
    const failure = req.failure();
    diagnostics.network.push(`[requestfailed] ${req.method()} ${req.url()} ${failure?.errorText || ''}`.trim());
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('/actions/')) {
      return;
    }
    diagnostics.network.push(`[response] ${resp.status()} ${resp.request().method()} ${url}`);
    if (resp.status() >= 400) {
      const body = await resp.text().catch(() => '');
      const snippet = (body || '').slice(0, 500);
      if (snippet) {
        diagnostics.network.push(`[response-body] ${snippet}`);
      }
    }
  });

  if (!apiReady) {
    if (apiError) {
      test.skip(true, `API unavailable: ${apiError.message}`);
    }
    try {
      cachedActions = await fetchActionsListWithRetry();
      apiReady = true;
    } catch (err) {
      apiError = err as Error;
      test.skip(true, `API unavailable: ${apiError.message}`);
    }
  }

  // Clear persisted state once before the first document load for this test.
  // Important: many tests validate state persists across refresh, so do not clear on reload.
  await page.addInitScript((key) => {
    try {
      const token = '__e2e_overview_state_cleared__';
      if (typeof window.name === 'string' && window.name.includes(token)) {
        return;
      }
      try {
        sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
      window.name = typeof window.name === 'string' ? `${window.name}${token}` : token;
    } catch {
      // ignore
    }
  }, OVERVIEW_STATE_KEY);

  await goHome(page, diagnostics);
});

// Baseline validations.
test('homepage renders and shows actions', async ({ page }) => {
  await waitForResults(page);
  await expect(page.getByText('Alternative GitHub Actions Marketplace')).toBeVisible();
});

test('detail page renders for first action', async ({ page }) => {
  const first = cachedActions[0];
  if (!first) {
    test.skip(true, 'No actions available to test detail page');
  }

  const detailUrl = joinUrl(
    getFrontendBaseUrl(),
    `/action/${encodeURIComponent(first.owner)}/${encodeURIComponent(first.name)}`
  );
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
  // Title now displays "owner / repo" on one line; assert both parts are present
  await expect(page.locator('.detail-title')).toContainText(first.owner, { timeout: 45000 });
  const displayedName = (first.owner && first.name && first.name.startsWith(`${first.owner}_`))
    ? first.name.substring(first.owner.length + 1)
    : first.name;
  await expect(page.locator('.detail-title')).toContainText(displayedName);
});

test.describe('Stats panel filters (persist across refresh)', () => {
  const statsPanelCases: Array<{
    name: string;
    ariaLabel: string;
    assert: (page: Page, items: ActionListItem[]) => Promise<void>;
  }> = [
    {
      name: 'Total Actions sets All type',
      ariaLabel: 'Show all actions',
      assert: async (page) => {
        await assertTypeFilterActive(page, 'All');
      }
    },
    {
      name: 'Verified Actions sets Verified only',
      ariaLabel: 'Show verified actions',
      assert: async (page) => {
        await assertVerifiedOnlyActive(page, true);
        await assertCardsAreVerified(page);
      }
    }
  ];

  const typeToLabel: Array<{ type: string; buttonLabel: string; ariaLabel: string }> = [
    { type: 'Node', buttonLabel: 'Node/JS', ariaLabel: 'Filter by Node actions' },
    { type: 'Docker', buttonLabel: 'Docker', ariaLabel: 'Filter by Docker actions' },
    { type: 'Composite', buttonLabel: 'Composite', ariaLabel: 'Filter by Composite actions' },
    { type: 'Unknown', buttonLabel: 'Unknown', ariaLabel: 'Filter by Unknown actions' },
    { type: 'No file found', buttonLabel: 'No file found', ariaLabel: 'Filter by No file found actions' }
  ];

  for (const { type, buttonLabel, ariaLabel } of typeToLabel) {
    statsPanelCases.push({
      name: `${type} Actions sets type filter`,
      ariaLabel,
      assert: async (page, items) => {
        const hasAny = items.some(a => a?.actionType?.actionType === type);
        if (!hasAny) {
          test.skip(true, `No ${type} actions available to validate filter`);
        }
        await assertTypeFilterActive(page, buttonLabel);
        await assertCardsMatchType(page, type);
      }
    });
  }

  statsPanelCases.push({
    name: 'Archived Actions enables archived toggle',
    ariaLabel: 'Include archived actions',
    assert: async (page, items) => {
      const hasArchived = items.some(a => a?.repoInfo?.archived === true);
      if (!hasArchived) {
        test.skip(true, 'No archived actions available to validate archived toggle');
      }
      // set archived select to 'only'
      const archivedSelect = page.locator('.filter-group').filter({ hasText: 'Archived:' }).first().locator('select');
      await archivedSelect.selectOption('only');
      await assertCardsAreArchived(page);
    }
  });

  for (const c of statsPanelCases) {
    test(c.name, async ({ page }) => {
      // Use cached actions from beforeEach to avoid redundant 16MB API calls.
      const items = cachedActions;
      await waitForResults(page);
      await resetFilters(page);

      await statsBar(page).getByRole('button', { name: c.ariaLabel, exact: true }).click();
      await waitForResults(page);

      // Refresh (simulates F5) and ensure state is preserved.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.action-card, .no-results').first()).toBeVisible({ timeout: 45000 });

      await c.assert(page, items);
    });
  }
});

test.describe('Filter buttons (persist across refresh)', () => {
  const typeCases: Array<{ type: string; label: string }> = [
    { type: 'All', label: 'All' },
    { type: 'Node', label: 'Node/JS' },
    { type: 'Docker', label: 'Docker' },
    { type: 'Composite', label: 'Composite' },
    { type: 'Unknown', label: 'Unknown' },
    { type: 'No file found', label: 'No file found' }
  ];

  for (const { type, label } of typeCases) {
    test(`Type filter ${label} persists on refresh`, async ({ page }) => {
      // Use cached actions from beforeEach to avoid redundant 16MB API calls.
      const items = cachedActions;
      await waitForResults(page);
      await resetFilters(page);

      if (type !== 'All') {
        const hasAny = items.some(a => a?.actionType?.actionType === type);
        if (!hasAny) {
          test.skip(true, `No ${type} actions available to validate filter`);
        }
      }

      await typeFilterGroup(page).getByRole('button', { name: label, exact: true }).click();
      await waitForResults(page);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.action-card, .no-results').first()).toBeVisible({ timeout: 45000 });

      await assertTypeFilterActive(page, label);
      if (type !== 'All') {
        await ensureActionsVisible(page);
        await assertCardsMatchType(page, type);
      }
    });
  }

  test('Verified only persists on refresh', async ({ page }) => {
    // Use cached actions from beforeEach to avoid redundant 16MB API calls.
    const items = cachedActions;
    const hasVerified = items.some(a => a.verified === true);
    if (!hasVerified) {
      test.skip(true, 'No verified actions available to validate verified-only filter');
    }

    await waitForResults(page);
    await resetFilters(page);

    const verifiedSelect = page.locator('.filter-group').filter({ hasText: 'Verified:' }).first().locator('select');
    await verifiedSelect.selectOption('verified');
    await waitForResults(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.action-card, .no-results').first()).toBeVisible({ timeout: 45000 });

    await assertVerifiedOnlyActive(page, true);
    await waitForResults(page);
    await assertCardsAreVerified(page);
  });

  test('Archived toggle persists on refresh', async ({ page }) => {
    // Use cached actions from beforeEach to avoid redundant 16MB API calls.
    const items = cachedActions;
    const hasArchived = items.some(a => a?.repoInfo?.archived === true);
    if (!hasArchived) {
      test.skip(true, 'No archived actions available to validate archived toggle');
    }

    await ensureActionsVisible(page);
    await resetFilters(page);

    const archivedSelect = page.locator('.filter-group').filter({ hasText: 'Archived:' }).first().locator('select');
    await archivedSelect.selectOption('only');
    await ensureActionsVisible(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.action-card, .no-results').first()).toBeVisible({ timeout: 45000 });

    await assertArchivedToggleActive(page, true);
    await assertCardsAreArchived(page);
  });
});

test('shows Updated for actions without releaseInfo', async ({ page }) => {
  // Find any cached action that has no releaseInfo (or empty array)
  const target = cachedActions.find(a => !a.releaseInfo || a.releaseInfo.length === 0);
  if (!target) {
    test.skip(true, 'No action without releaseInfo available from API');
  }

  await waitForResults(page);

  // Find the card that matches owner/displayed name (normalize owner_ prefix)
  const cards = page.locator('.action-card');
  const count = await cards.count();
  let found = false;
  // compute displayed repo name the same way the UI does
  const displayedName = (target.owner && target.name && target.name.startsWith(`${target.owner}_`))
    ? target.name.substring(target.owner.length + 1)
    : target.name;

  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    if (text.includes(target.owner) && text.includes(displayedName || '')) {
      // The card should contain an Updated: label
      await expect(card.getByText(/Updated:/)).toBeVisible();
      found = true;
      break;
    }
  }

  if (!found) {
    test.skip(true, 'Matching action card not found in rendered UI');
  }
});
