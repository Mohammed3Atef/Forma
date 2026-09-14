import { test, expect } from '@playwright/test';
import { CLIENT_AUTH, watchPage } from './helpers';

test.use({ storageState: CLIENT_AUTH });

test('log today\'s meals, water, and supplements through the real UI', async ({ page }) => {
  const { consoleErrors, failedRequests } = watchPage(page);

  await page.goto('/nutrition');

  const waitingForCoach = page.getByText(/waiting/i);
  if (await waitingForCoach.isVisible().catch(() => false)) {
    test.skip(true, 'Client has no assigned meal plan yet — cannot exercise the nutrition flow.');
  }

  // Water — add 500ml through the real +500 button.
  const waterBefore = await page.locator('text=/\\d+ \\/ \\d+ ml/').first().textContent();
  await page.getByRole('button', { name: '+500' }).click();
  await expect(page.locator('text=/\\d+ \\/ \\d+ ml/').first()).not.toHaveText(waterBefore ?? '');

  // Mark the first meal as eaten.
  const markEatenButtons = page.getByRole('button', { name: 'Mark eaten' });
  const mealCount = await markEatenButtons.count();
  if (mealCount > 0) {
    await markEatenButtons.first().click();
  }

  // Toggle the first supplement as taken, if any are assigned.
  const suppSection = page.locator('div.card', { has: page.getByText('Supplements', { exact: true }) });
  if (await suppSection.isVisible().catch(() => false)) {
    await suppSection.locator('button').first().click();
  }

  // Log a realistic custom food entry.
  await page.getByRole('button', { name: /add food/i }).first().click();
  await page.getByPlaceholder('Name').fill('Grilled chicken breast');
  await page.getByPlaceholder(/quantity/i).fill('200 g');
  const grid = page.locator('div.grid.grid-cols-3');
  await grid.locator('input').nth(0).fill('45'); // protein
  await grid.locator('input').nth(1).fill('0'); // carbs
  await grid.locator('input').nth(2).fill('6'); // fats
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText('Grilled chicken breast')).toBeVisible();

  if (consoleErrors.length) console.warn('[nutrition.spec] console errors:', consoleErrors);
  const bad = failedRequests.filter((r) => r.status >= 400);
  if (bad.length) console.warn('[nutrition.spec] failed requests:', bad);
});
