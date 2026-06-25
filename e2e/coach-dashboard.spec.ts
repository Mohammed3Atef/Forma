import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { horizontalOverflow } from './fixtures/audit';

/**
 * COACH PREMIUM DASHBOARD — the tabbed hub (Overview/Analytics/Clients/
 * Engagement/Content/Reports) renders across breakpoints, tabs switch via the
 * URL, the command palette opens (⌘K), and there is no horizontal overflow.
 */
test.describe('Coach premium dashboard', () => {
  test.beforeEach(async ({ login, page }) => {
    await login('coach');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/coach/dashboard');
    await expect(page.getByTestId(TID.coachDashboard)).toBeVisible({ timeout: 25_000 });
  });

  test('tabs render and switch; analytics shows revenue, engagement shows adherence', async ({ page }) => {
    for (const key of ['overview', 'analytics', 'clients', 'engagement', 'content', 'reports']) {
      await expect(page.getByTestId(TID.coachDashTab(key))).toBeVisible();
    }
    await page.getByTestId(TID.coachDashTab('analytics')).click();
    await expect(page).toHaveURL(/tab=analytics/);
    await expect(page.getByText(/revenue/i).first()).toBeVisible({ timeout: 20_000 });

    await page.getByTestId(TID.coachDashTab('engagement')).click();
    await expect(page).toHaveURL(/tab=engagement/);
    await expect(page.getByText(/adherence/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('command palette opens with ⌘/Ctrl+K and filters', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId(TID.commandInput)).toBeVisible();
    await page.getByTestId(TID.commandInput).fill('library');
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(TID.commandInput)).toBeHidden();
  });

  test('mobile overflow menu reaches all destinations + WhatsApp FAB', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/coach');
    await expect(page.getByTestId('whatsapp-fab')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('nav-menu-button').click();
    await expect(page.getByTestId('nav-menu')).toBeVisible();
    await expect(page.getByTestId('menu-coachDashboard')).toBeVisible();
    await expect(page.getByTestId('menu-coachPlan')).toBeVisible();
  });

  test('no horizontal overflow at mobile / tablet / desktop', async ({ page }) => {
    for (const size of [
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto('/coach/dashboard?tab=analytics');
      await expect(page.getByTestId(TID.coachDashboard)).toBeVisible({ timeout: 25_000 });
      await page.waitForTimeout(400);
      const overflow = await horizontalOverflow(page);
      expect.soft(overflow, `overflow ${overflow}px at ${size.width}`).toBeLessThanOrEqual(2);
    }
  });
});
