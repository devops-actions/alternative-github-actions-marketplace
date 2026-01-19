import { test, expect } from '@playwright/test';
import { waitForResults } from './e2e.spec';

const getFrontendBaseUrl = () => process.env.FRONTEND_BASE_URL || 'http://localhost:4173';

test('fuzzy search finds owner actions', async ({ page }) => {
  await page.goto(getFrontendBaseUrl(), { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Alternative GitHub Actions Marketplace/);

  // Wait until the overview has either action cards or the no-results placeholder.
  await waitForResults(page);

  // Type a fuzzy query into the search box
  const input = page.locator('.search-box input').first();
  await input.fill('owner actions');

  // Allow filter to apply and wait for results again
  await page.waitForTimeout(500);
  await waitForResults(page);

  // Expect at least one matching card to be visible
  const cards = page.locator('.action-card');
  if (!(await cards.first().isVisible().catch(() => false))) {
    const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
    throw new Error(`No action-card visible after search. rootHtmlLength=${(rootHtml||'').length}`);
  }

  // Optionally, ensure at least one card contains 'Owner' or 'actions' tokens
  const text = await cards.first().innerText();
  expect(/owner|actions/i.test(text)).toBeTruthy();
});
