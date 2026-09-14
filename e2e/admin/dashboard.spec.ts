import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/**
 * /admin (the tabbed "control center"). Overview is available to any admin;
 * Growth/Usage/Coaches/Revenue/Subscriptions are super_admin-only tabs; System
 * (feature flags + audit) is gated by flags.manage/audit.read, which the
 * `admin` role also holds — so admin sees Overview + System only.
 */
test.describe('Super admin: dashboard control center', () => {
  test.use({ storageState: AUTH('super') });

  test('overview tab loads with real KPIs', async ({ page }) => {
    const issues = trackIssues(page, 'dashboard-overview');
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-dashboard')).toBeVisible();
    await expect(page.getByTestId('admin-overview')).toBeVisible();

    // All 7 tabs should be present for super_admin.
    for (const key of ['overview', 'growth', 'usage', 'coaches', 'revenue', 'subscriptions', 'system']) {
      await expect(page.getByTestId(`admin-tab-${key}`)).toBeVisible();
    }
    await expect(page.getByTestId('admin-tab-overview')).toHaveAttribute('aria-selected', 'true');

    const text = await page.getByTestId('admin-overview').innerText();
    expect(text.length).toBeGreaterThan(20);
    test.info().annotations.push({ type: 'note', description: `Overview KPI snapshot:\n${text.slice(0, 600)}` });

    reportIssues(issues, 'dashboard-overview');
  });

  test('growth / usage / coaches / revenue / subscriptions / system tabs each render content', async ({ page }) => {
    const issues = trackIssues(page, 'dashboard-tabs');
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    for (const key of ['growth', 'usage', 'coaches', 'revenue', 'subscriptions', 'system']) {
      await page.getByTestId(`admin-tab-${key}`).click();
      await expect(page.getByTestId(`admin-tab-${key}`)).toHaveAttribute('aria-selected', 'true');
      await page.waitForLoadState('networkidle');
      // These panels have no shared content testid, so assert the tab actually
      // swapped in real content (not stuck on a loading/empty shell).
      const bodyText = await page.locator('main, body').first().innerText();
      expect(bodyText.length).toBeGreaterThan(50);
      test.info().annotations.push({ type: 'note', description: `[${key}] tab rendered ${bodyText.length} chars` });
    }

    // Deep-link via ?tab= should also work (Tabs is URL-synced).
    await page.goto('/admin?tab=revenue');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-tab-revenue')).toHaveAttribute('aria-selected', 'true');

    reportIssues(issues, 'dashboard-tabs');
  });
});

test.describe('Plain admin: dashboard tab visibility boundary', () => {
  test.use({ storageState: AUTH('admin') });

  test('only sees Overview + System tabs (SaaS tabs are super_admin-only)', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-dashboard')).toBeVisible();
    await expect(page.getByTestId('admin-tab-overview')).toBeVisible();
    await expect(page.getByTestId('admin-tab-system')).toBeVisible();

    for (const key of ['growth', 'usage', 'coaches', 'revenue', 'subscriptions']) {
      await expect(page.getByTestId(`admin-tab-${key}`)).toHaveCount(0);
    }
  });
});
