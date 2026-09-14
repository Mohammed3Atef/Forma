import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/** Standalone /admin/analytics route (role distribution + platform totals). */
test.describe('Admin: Analytics', () => {
  test.use({ storageState: AUTH('super') });

  test('loads platform stat tiles and role-distribution chart', async ({ page }) => {
    const issues = trackIssues(page, 'analytics');
    await page.goto('/admin/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-analytics')).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/NaN/);
    test.info().annotations.push({ type: 'note', description: `Analytics snapshot:\n${body.slice(0, 500)}` });

    reportIssues(issues, 'analytics');
  });
});
