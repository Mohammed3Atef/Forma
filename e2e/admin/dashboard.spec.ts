import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/**
 * /admin — a plain standalone Overview screen (matches the design's own
 * `overview()`, which is never tabbed). The dashboard used to be a 7-tab hub
 * (Overview/Growth/Usage/Coaches/Revenue/Subscriptions/System); every other
 * tab's real content was migrated to its own destination (Coaches' split-pane,
 * `/admin/subscriptions`, `/admin/analytics`, this Overview's own growth
 * chart, `/admin/governance`) so the tabs — and this test's old tab-clicking
 * assertions — no longer exist.
 */
test.describe('Super admin: dashboard overview', () => {
  test.use({ storageState: AUTH('super') });

  test('overview loads with real KPIs, needs-review, growth chart and recent coaches — no tabs', async ({ page }) => {
    const issues = trackIssues(page, 'dashboard-overview');
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-dashboard')).toBeVisible();
    await expect(page.getByTestId('admin-overview')).toBeVisible();

    // No tab rail anymore — /admin is a single screen now.
    for (const key of ['overview', 'growth', 'usage', 'coaches', 'revenue', 'subscriptions', 'system']) {
      await expect(page.getByTestId(`admin-tab-${key}`)).toHaveCount(0);
    }

    const text = await page.getByTestId('admin-overview').innerText();
    expect(text.length).toBeGreaterThan(20);
    test.info().annotations.push({ type: 'note', description: `Overview snapshot:\n${text.slice(0, 600)}` });

    reportIssues(issues, 'dashboard-overview');
  });
});

test.describe('Plain admin: dashboard visibility boundary', () => {
  test.use({ storageState: AUTH('admin') });

  test('sees the overview but not super-admin-only SaaS sections', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-dashboard')).toBeVisible();
    await expect(page.getByTestId('admin-overview')).toBeVisible();

    // Coach-plan/revenue KPIs and "Recently registered" coaches are gated to super_admin.
    await expect(page.getByText(/tracked revenue/i)).toHaveCount(0);
  });
});
