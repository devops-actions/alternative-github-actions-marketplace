import { test, expect } from '@playwright/test';

const getBaseUrl = () => process.env.FRONTEND_BASE_URL || 'http://localhost:4173';

const fetchFirstAction = async (baseUrl: string) => {
  const resp = await fetch(`${baseUrl}/api/actions/list`);
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
  const baseUrl = getBaseUrl();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.getByText('Alternative GitHub Actions Marketplace')).toBeVisible();
  await expect(page.locator('.action-card').first()).toBeVisible();
});

// Validate a detail page renders using the first action from the API.
test('detail page renders for first action', async ({ page }) => {
  const baseUrl = getBaseUrl();
  const firstAction = await fetchFirstAction(baseUrl);
  if (!firstAction) {
    test.skip(true, 'No actions available to test detail page');
  }

  const detailUrl = `${baseUrl}/action/${encodeURIComponent(firstAction!.owner)}/${encodeURIComponent(firstAction!.name)}`;
  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  await expect(page.getByText(firstAction!.owner)).toBeVisible();
  await expect(page.getByText(firstAction!.name)).toBeVisible();
});
