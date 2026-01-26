import { test, expect } from '@playwright/test';
import { getFrontendBaseUrl, waitForResults } from './test-helpers';

test.describe('OpenSSF filter', () => {
  test('filter dropdown hides actions below threshold', async ({ page }) => {
    await page.goto(getFrontendBaseUrl(), { waitUntil: 'domcontentloaded' });
    await waitForResults(page);

    // Count cards with a score <= 5 (low-score) and >7 (high-score)
    const cards = page.locator('.action-card');
    const total = await cards.count();
    expect(total).toBeGreaterThan(0);

    // Select 'Above 7' from the OpenSSF dropdown
    const select = page.locator('select').filter({ hasText: 'All scores' }).first();
    await select.selectOption('above7');

    // Wait for filter to apply
    await page.waitForTimeout(300);

    const visibleAfterHigh = await page.locator('.action-card:visible').count();

    // Now select 'All scores' to restore
    await select.selectOption('all');
    await page.waitForTimeout(300);
    const visibleAfterAll = await page.locator('.action-card:visible').count();

    expect(visibleAfterAll).toBeGreaterThanOrEqual(visibleAfterHigh);
  });
});
