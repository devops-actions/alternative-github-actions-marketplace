import { test, expect } from '@playwright/test';
import { waitForResults, getFrontendBaseUrl } from './test-helpers';

function pickSearchToken(value: string): string {
  const cleaned = (value || '').trim();
  if (!cleaned) return 'git';

  const tokens = cleaned
    .split(/[^a-z0-9]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 3);

  if (tokens.length === 0) {
    return cleaned.slice(0, 3);
  }

  // Prefer a longer token to reduce accidental mismatches.
  tokens.sort((a, b) => b.length - a.length);
  return tokens[0];
}

test('fuzzy search finds owner actions', async ({ page }) => {
  await page.goto(getFrontendBaseUrl(), { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Alternative GitHub Actions Marketplace/);

  // Wait until the overview has either action cards or the no-results placeholder.
  await waitForResults(page);

  const firstCard = page.locator('.action-card').first();
  const ownerText = (await firstCard.locator('.action-owner').innerText().catch(() => '')).trim();
  const nameText = (await firstCard.locator('.action-name').innerText().catch(() => '')).trim();
  const ownerToken = pickSearchToken(ownerText);
  const nameToken = pickSearchToken(nameText);
  // Use only the owner token for maximum reliability: it guarantees at least one match
  // (the first card itself) even if repo-name normalization differs.
  const query = (ownerToken || nameToken).trim();

  // Type a fuzzy query into the search box
  const input = page.locator('.search-box input').first();
  await input.fill(query);

  // Allow filter to apply and wait for results again
  await page.waitForTimeout(500);
  await waitForResults(page);

  // Expect at least one matching card to be visible
  const cards = page.locator('.action-card');
  if (!(await cards.first().isVisible().catch(() => false))) {
    const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
    throw new Error(`No action-card visible after search. rootHtmlLength=${(rootHtml||'').length}`);
  }

  // Ensure the first visible card still contains the owner token.
  const firstVisibleText = ((await cards.first().innerText().catch(() => '')) || '').toLowerCase();
  expect(firstVisibleText.includes(ownerToken.toLowerCase())).toBeTruthy();
});
