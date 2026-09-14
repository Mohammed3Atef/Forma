import { test, expect } from '@playwright/test';
import { CLIENT_AUTH, watchPage, hasNoHorizontalOverflow } from './helpers';

test.use({ storageState: CLIENT_AUTH });

test.describe('Client Home', () => {
  test('loads dashboard content, coach info card, and weekly goal', async ({ page }) => {
    const { consoleErrors, failedRequests } = watchPage(page);

    await page.goto('/');
    await expect(page.getByTestId('client-home')).toBeVisible();
    await expect(page.getByTestId('app-shell')).toBeVisible();

    // Coach info card — regression check for the previously-fixed adminUsers.get
    // bug for plain client role. If this fails to render the coach's name, that
    // is a HIGH severity regression.
    const coachCard = page.getByTestId('coach-info-compact');
    await expect(coachCard, 'Coach info card should render for a client with an assigned coach (adminUsers.get regression check)').toBeVisible({ timeout: 15_000 });
    await expect(coachCard).toContainText(/.+/); // has some non-empty name/email text

    // Weekly goal card + stat tiles for "this week"
    await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();

    // Report anything unusual seen while loading Home.
    const unexpected404s = failedRequests.filter((r) => r.status >= 400);
    if (unexpected404s.length) {
      console.warn('[home.spec] failed network requests while loading Home:', unexpected404s);
    }
    if (consoleErrors.length) {
      console.warn('[home.spec] console errors while loading Home:', consoleErrors);
    }
  });

  test('responsive: no horizontal overflow at mobile (390px) and tablet (768px)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('client-home')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    expect(await hasNoHorizontalOverflow(page), 'Home should not overflow horizontally at 390px').toBe(true);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    expect(await hasNoHorizontalOverflow(page), 'Home should not overflow horizontally at 768px').toBe(true);
  });
});
