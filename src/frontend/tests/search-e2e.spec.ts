import { test, expect } from '@playwright/test';

const getFrontendBaseUrl = () => process.env.FRONTEND_BASE_URL || 'http://localhost:4173';

test('fuzzy search finds owner actions', async ({ page }) => {
  await page.goto(getFrontendBaseUrl(), { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Alternative GitHub Actions Marketplace/);

  // Wait for cards to render
  await page.waitForSelector('.action-card', { timeout: 60000 });

  // Type a fuzzy query into the search box
  const input = page.locator('.search-box input').first();
  await input.fill('owner actions');

  // Allow filter to apply
  await page.waitForTimeout(500);

  // Expect at least one matching card to be visible
  const cards = page.locator('.action-card');
  await expect(cards.first()).toBeVisible();

  // Optionally, ensure at least one card contains 'Owner' or 'actions' tokens
  const text = await cards.first().innerText();
  expect(/owner|actions/i.test(text)).toBeTruthy();
});
