import { test, expect, AUTH, watchForIssues } from './_helpers';

test.use({ storageState: AUTH('coach') });

/** Ahmed Kamal (demo.client05) has rich seeded workout/nutrition/cardio history. */
const CLIENT_NAME = 'Ahmed Kamal';

test.describe('Coach Client Activity view', () => {
  test('opens a client day-by-day activity view with real workout/nutrition/cardio/weight history', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/clients');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('coach-clients-search').fill(CLIENT_NAME);
    await page.waitForTimeout(400);

    // Desktop viewport renders a DataTable ("coach-desktop-clients", rows
    // data-testid="data-row") with an inline "Open" action instead of the
    // mobile/tablet card list ("coach-client-row"); handle both.
    const desktopRow = page.locator('[data-testid="coach-desktop-clients"] [data-testid="data-row"]').filter({ hasText: CLIENT_NAME });
    const mobileRow = page.getByTestId('coach-client-row').filter({ hasText: CLIENT_NAME });
    if (await desktopRow.count()) {
      await expect(desktopRow.first()).toBeVisible({ timeout: 10_000 });
      await desktopRow.first().getByRole('button', { name: 'Open' }).click();
    } else {
      await expect(mobileRow).toBeVisible({ timeout: 10_000 });
      await mobileRow.first().click();
    }
    await page.waitForLoadState('networkidle');

    await page.getByTestId('coach-view-activity').click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/\/coach\/client\/.+\/activity/);

    // Walk back up to 10 days looking for a day with logged data — demo history
    // was seeded over the past weeks, not necessarily on "today".
    let sawData = false;
    for (let i = 0; i < 10 && !sawData; i++) {
      const body = await page.locator('body').innerText();
      const hasWorkout = !body.includes('No workout logged this day');
      const hasNutrition = !body.includes('No meals logged this day');
      if (hasWorkout || hasNutrition) {
        sawData = true;
        break;
      }
      await page.getByLabel('Previous day').click();
      await page.waitForTimeout(500);
    }
    expect(sawData, 'expected at least one of the last 10 days to show logged workout/nutrition activity').toBe(true);

    // Body stats (steps/cardio minutes/water/weight) render regardless of the day.
    await expect(page.getByText('Activity & body')).toBeVisible();

    watch.report();
  });
});
