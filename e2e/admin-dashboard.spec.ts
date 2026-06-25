import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { horizontalOverflow } from './fixtures/audit';

/**
 * ADMIN CONTROL CENTER — the /admin tabbed hub. Super-admin sees Coaches /
 * Revenue / Subscriptions / System; the coaches table shows on desktop and
 * degrades to cards on mobile; no tiny layout, no horizontal overflow.
 */
test.describe('Admin control center', () => {
  test('super-admin hub: tabs render, coaches table desktop + cards mobile', async ({ login, page }) => {
    await login('super_admin');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/admin');
    await expect(page.getByTestId(TID.adminDashboard)).toBeVisible({ timeout: 25_000 });

    for (const key of ['overview', 'coaches', 'revenue', 'subscriptions', 'system']) {
      await expect(page.getByTestId(TID.adminTab(key))).toBeVisible();
    }

    // Coaches tab → desktop table.
    await page.getByTestId(TID.adminTab('coaches')).click();
    await expect(page.getByTestId('admin-coaches-table')).toBeVisible({ timeout: 20_000 });

    // Revenue + Subscriptions render.
    await page.getByTestId(TID.adminTab('revenue')).click();
    await expect(page.getByText(/revenue/i).first()).toBeVisible();
    await page.getByTestId(TID.adminTab('subscriptions')).click();
    await expect(page.getByText(/trial|active/i).first()).toBeVisible();

    // Mobile → coaches cards (no table).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin?tab=coaches');
    await expect(page.getByTestId('admin-coaches-cards')).toBeVisible({ timeout: 20_000 });
    const overflow = await horizontalOverflow(page);
    expect(overflow, `overflow ${overflow}px`).toBeLessThanOrEqual(2);
  });

  test('regular admin does not see super-admin tabs', async ({ login, page }) => {
    await login('admin');
    await page.goto('/admin');
    await expect(page.getByTestId(TID.adminDashboard)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId(TID.adminTab('overview'))).toBeVisible();
    await expect(page.getByTestId(TID.adminTab('coaches'))).toHaveCount(0);
    await expect(page.getByTestId(TID.adminTab('revenue'))).toHaveCount(0);
  });
});
