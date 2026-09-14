import { test, expect } from '@playwright/test';
import { CLIENT_AUTH, watchPage } from './helpers';

test.use({ storageState: CLIENT_AUTH });

test('log a real cardio session today through the manual log UI', async ({ page }) => {
  const { consoleErrors, failedRequests } = watchPage(page);

  await page.goto('/cardio');
  await expect(page.getByRole('button', { name: /log activity/i })).toBeVisible();

  const historyBefore = await page.locator('ul > li.card').count();

  await page.getByRole('button', { name: /log activity/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Pick "Running" and fill realistic numbers, scoped to the sheet so we don't
  // collide with the live-timer type chips underneath.
  await dialog.getByRole('button', { name: 'Running', exact: true }).click();
  await dialog.locator('label:text("Steps")').locator('..').locator('input').fill('6200');
  await dialog.locator('label:text("Duration (min)")').locator('..').locator('input').fill('32');
  await dialog.locator('label:text("Distance (km)")').locator('..').locator('input').fill('5.1');
  await dialog.locator('label:text("Calories")').locator('..').locator('input').fill('310');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('ul > li.card')).toHaveCount(historyBefore + 1, { timeout: 10_000 });
  await expect(page.getByText('Running').first()).toBeVisible();

  if (consoleErrors.length) console.warn('[cardio.spec] console errors:', consoleErrors);
  const bad = failedRequests.filter((r) => r.status >= 400);
  if (bad.length) console.warn('[cardio.spec] failed requests:', bad);
});
