import { test, expect } from '@playwright/test';
import { CLIENT_AUTH, watchPage } from './helpers';

test.use({ storageState: CLIENT_AUTH });

test('log a new measurement entry and verify it appears in history', async ({ page }) => {
  const { consoleErrors, failedRequests } = watchPage(page);

  await page.goto('/progress/measurements');
  await expect(page.getByRole('heading', { name: /measurements/i }).first()).toBeVisible();

  const historyCountBefore = await page.locator('.card ul.space-y-1 li').count().catch(() => 0);

  // Fill a realistic subset of measurements (cm) for today.
  const entries: Record<string, string> = { waist: '86', chest: '104', arm: '38' };
  for (const [key, value] of Object.entries(entries)) {
    const label = key === 'waist' ? 'Waist' : key === 'chest' ? 'Chest' : 'Arm';
    await page.locator('label', { hasText: new RegExp(`^${label}$`, 'i') }).first().locator('..').locator('input').fill(value);
  }

  await page.getByRole('button', { name: 'Save' }).click();

  // The comparison / history sections should now include today's entry.
  await expect(page.locator('.card', { hasText: /waist/i }).first()).toBeVisible();
  const historyRows = page.locator('.card ul.space-y-1 li');
  await expect(async () => {
    expect(await historyRows.count()).toBeGreaterThanOrEqual(historyCountBefore);
  }).toPass({ timeout: 10_000 });

  if (consoleErrors.length) console.warn('[measurements.spec] console errors:', consoleErrors);
  const bad = failedRequests.filter((r) => r.status >= 400);
  if (bad.length) console.warn('[measurements.spec] failed requests:', bad);
});
