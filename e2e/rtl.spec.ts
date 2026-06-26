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

/**
 * Coach portal under RTL on desktop: the centred dialog must lay out correctly
 * with a SINGLE, direction-aware back chevron and no horizontal overflow.
 */
test.describe('Arabic / RTL — Coach desktop overlays', () => {
  test('desktop RTL: open dialog has one flipped back control and no overflow', async ({ page, login }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login('coach');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));

    await page.goto('/coach/clients');
    await page.getByTestId(TID.coachClients).waitFor({ timeout: 25_000 });

    // Add Client → "Add Existing" surfaces the single header back control.
    await page.getByTestId(TID.coachAddClient).click();
    await expect(page.getByTestId(TID.addClientChooser)).toBeVisible();
    await page.getByTestId(TID.addChooseExisting).click();
    await expect(page.getByTestId(TID.addExistingPanel)).toBeVisible();

    const back = page.getByTestId(TID.sheetPanel).locator('[aria-label="back"]');
    await expect(back, 'exactly one back control in RTL').toHaveCount(1);
    await expect(page.getByTestId(TID.sheetClose), 'exactly one close control in RTL').toHaveCount(1);

    const overflow = await horizontalOverflow(page);
    expect(overflow, `RTL desktop overflow ${overflow}px`).toBeLessThanOrEqual(2);

    await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
  });
});
