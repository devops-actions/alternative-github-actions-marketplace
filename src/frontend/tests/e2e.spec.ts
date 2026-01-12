import { test, expect, Page } from '@playwright/test';

type ActionListItem = {
  owner: string;
  name: string;
  verified?: boolean;
  actionType?: { actionType?: string };
  repoInfo?: { archived?: boolean };
};

const OVERVIEW_STATE_KEY = 'overviewState:v1';

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

async function clearPersistedOverviewState(page: Page) {
  await page.evaluate((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, OVERVIEW_STATE_KEY);
}

async function waitForOverviewSettled(page: Page) {
  // The app can be in one of these end states after loadData completes.
  const terminalState = page.locator('.action-card, .no-results, .error-message').first();
  await expect(terminalState).toBeVisible({ timeout: 120000 });

  const errorMessage = page.locator('.error-message');
  if (await errorMessage.isVisible()) {
    const text = (await errorMessage.innerText()).trim();
    throw new Error(`UI shows an error state: ${text || '(empty error message)'}`);
  }
}

async function goHome(page: Page) {
  await page.goto(getFrontendBaseUrl(), { waitUntil: 'domcontentloaded' });
  await waitForOverviewSettled(page);
}

async function ensureActionsVisible(page: Page) {
  await expect(page.locator('.action-card').first()).toBeVisible({ timeout: 120000 });
}

async function resetFilters(page: Page) {
  await page.getByRole('button', { name: 'All' }).click();

  const verifiedOnly = page.getByRole('button', { name: 'Verified only' });
  if (await verifiedOnly.getAttribute('class')?.then(c => Boolean(c && c.includes('active')))) {
    await verifiedOnly.click();
  }

  const archived = page.getByRole('button', { name: 'Archived' });
  if (await archived.getAttribute('class')?.then(c => Boolean(c && c.includes('active')))) {
    await archived.click();
  }
}

async function assertTypeFilterActive(page: Page, label: string) {
  const button = page.getByRole('button', { name: label });
  await expect(button).toHaveClass(/active/);
}

async function assertVerifiedOnlyActive(page: Page, active: boolean) {
  const button = page.getByRole('button', { name: 'Verified only' });
  if (active) {
    await expect(button).toHaveClass(/active/);
  } else {
    await expect(button).not.toHaveClass(/active/);
  }
}

async function assertArchivedToggleActive(page: Page, active: boolean) {
  const button = page.getByRole('button', { name: 'Archived' });
  if (active) {
    await expect(button).toHaveClass(/active/);
  } else {
    await expect(button).not.toHaveClass(/active/);
  }
}

async function assertCardsMatchType(page: Page, expectedType: string) {
  const cards = page.locator('.action-card');
  const count = await cards.count();
  const sample = Math.min(count, 5);

  for (let i = 0; i < sample; i += 1) {
    await expect(cards.nth(i).locator('.action-badge')).toHaveText(expectedType);
  }
}

async function assertCardsAreVerified(page: Page) {
  const cards = page.locator('.action-card');
  const count = await cards.count();
  const sample = Math.min(count, 5);

  for (let i = 0; i < sample; i += 1) {
    await expect(cards.nth(i).getByText('Verified')).toBeVisible();
  }
}

async function assertAtLeastOneArchivedCardVisible(page: Page) {
  await expect(page.locator('.action-card').getByText('Archived')).toBeVisible({ timeout: 45000 });
}

async function assertCardsAreArchived(page: Page) {
  const cards = page.locator('.action-card');
  const count = await cards.count();
  const sample = Math.min(count, 5);
  if (sample === 0) {
    throw new Error('Expected at least one action-card to be visible');
  }

  for (let i = 0; i < sample; i += 1) {
    await expect(cards.nth(i).getByText('Archived')).toBeVisible();
  }
}

test.beforeEach(async ({ page }) => {
  // Clear persisted state before the app bootstraps, so every test starts clean.
  await page.addInitScript((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, OVERVIEW_STATE_KEY);

  await goHome(page);
});

// Baseline validations.
test('homepage renders and shows actions', async ({ page }) => {
  await ensureActionsVisible(page);
  await expect(page.getByText('Alternative GitHub Actions Marketplace')).toBeVisible();
});

test('detail page renders for first action', async ({ page }) => {
  const items = await fetchActionsList();
  const first = items[0];
  if (!first) {
    test.skip(true, 'No actions available to test detail page');
  }

  const detailUrl = joinUrl(
    getFrontendBaseUrl(),
    `/action/${encodeURIComponent(first.owner)}/${encodeURIComponent(first.name)}`
  );
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(first.owner)).toBeVisible({ timeout: 45000 });
  await expect(page.getByText(first.name)).toBeVisible();
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
      await assertArchivedToggleActive(page, true);
      await assertCardsAreArchived(page);
    }
  });

  for (const c of statsPanelCases) {
    test(c.name, async ({ page }) => {
      const items = await fetchActionsList();
      await ensureActionsVisible(page);
      await resetFilters(page);

      await page.getByRole('button', { name: c.ariaLabel }).click();
      await ensureActionsVisible(page);

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
      const items = await fetchActionsList();
      await ensureActionsVisible(page);
      await resetFilters(page);

      if (type !== 'All') {
        const hasAny = items.some(a => a?.actionType?.actionType === type);
        if (!hasAny) {
          test.skip(true, `No ${type} actions available to validate filter`);
        }
      }

      await page.getByRole('button', { name: label }).click();
      await ensureActionsVisible(page);

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
    const items = await fetchActionsList();
    const hasVerified = items.some(a => a.verified === true);
    if (!hasVerified) {
      test.skip(true, 'No verified actions available to validate verified-only filter');
    }

    await ensureActionsVisible(page);
    await resetFilters(page);

    await page.getByRole('button', { name: 'Verified only' }).click();
    await ensureActionsVisible(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.action-card, .no-results').first()).toBeVisible({ timeout: 45000 });

    await assertVerifiedOnlyActive(page, true);
    await ensureActionsVisible(page);
    await assertCardsAreVerified(page);
  });

  test('Archived toggle persists on refresh', async ({ page }) => {
    const items = await fetchActionsList();
    const hasArchived = items.some(a => a?.repoInfo?.archived === true);
    if (!hasArchived) {
      test.skip(true, 'No archived actions available to validate archived toggle');
    }

    await ensureActionsVisible(page);
    await resetFilters(page);

    await page.getByRole('button', { name: 'Archived' }).click();
    await ensureActionsVisible(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.action-card, .no-results').first()).toBeVisible({ timeout: 45000 });

    await assertArchivedToggleActive(page, true);
    await assertCardsAreArchived(page);
  });
});
