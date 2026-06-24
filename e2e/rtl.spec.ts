import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { horizontalOverflow } from './fixtures/audit';

/**
 * ARABIC / RTL — switching to Arabic must flip the document direction to rtl,
 * keep navigation working, render the major pages, and not introduce horizontal
 * scroll on a mobile viewport. Then switching back restores ltr.
 */

test.describe('Arabic / RTL', () => {
  test.beforeEach(async ({ login, page }) => {
    await login('client');
    await page.getByTestId(TID.navItem('settings')).waitFor({ timeout: 25_000 });
  });

  test('switch to Arabic → dir=rtl, nav works, no layout break; switch back → ltr', async ({ page }) => {
    // The language toggle lives on the app-settings page (/settings/app), not the
    // lean profile page (/settings).
    await page.goto('/settings/app');
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Navigation still works and major pages render without horizontal scroll.
    // (Cardio now lives in the nav menu, not the bottom bar — covered elsewhere.)
    for (const key of ['home', 'nutrition', 'workout', 'progress'] as const) {
      await page.getByTestId(TID.navItem(key)).click();
      await page.waitForTimeout(400);
      await expect(page.locator('body')).toContainText(/\S/);
      const overflow = await horizontalOverflow(page);
      expect.soft(overflow, `horizontal overflow ${overflow}px in RTL on ${key}`).toBeLessThanOrEqual(2);
      // Direction stays rtl across navigation.
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    }

    // Switch back to English (toggle lives on /settings/app).
    await page.goto('/settings/app');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
