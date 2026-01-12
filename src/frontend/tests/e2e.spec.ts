import { test, expect } from '@playwright/test';

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

const fetchFirstAction = async () => {
  const apiBaseUrl = getApiBaseUrl();
  const resp = await fetch(joinUrl(apiBaseUrl, '/actions/list'));
  if (!resp.ok) {
    throw new Error(`Failed to fetch actions list: ${resp.status}`);
  }
  const data = (await resp.json()) as Array<{ owner: string; name: string }>;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  return data[0];
};

// Validate the homepage renders and shows at least one action card.
test('homepage renders and shows actions', async ({ page }) => {
  const baseUrl = getFrontendBaseUrl();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  // Cold starts or data fetches can keep the page in the loading state briefly.
  await expect(page.locator('.action-card').first()).toBeVisible({ timeout: 45000 });
  await expect(page.getByText('Alternative GitHub Actions Marketplace')).toBeVisible();
});

// Validate a detail page renders using the first action from the API.
test('detail page renders for first action', async ({ page }) => {
  const baseUrl = getFrontendBaseUrl();
  const firstAction = await fetchFirstAction();
  if (!firstAction) {
    test.skip(true, 'No actions available to test detail page');
  }

  const detailUrl = `${baseUrl}/action/${encodeURIComponent(firstAction!.owner)}/${encodeURIComponent(firstAction!.name)}`;
  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  await expect(page.getByText(firstAction!.owner)).toBeVisible();
  await expect(page.getByText(firstAction!.name)).toBeVisible();
});
