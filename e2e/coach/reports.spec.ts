import { test, expect, AUTH, watchForIssues } from './_helpers';

test.use({ storageState: AUTH('coach') });

test.describe('Coach Reports', () => {
  test('shows adherence/activity KPIs and a client ranking for the real roster', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/reports');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('coach-reports')).toBeVisible();

    const text = await page.getByTestId('coach-reports').innerText();
    expect(text).toMatch(/%/); // adherence percentage KPI
    expect(text.length).toBeGreaterThan(100);

    // Clicking a client row should navigate to their client detail page.
    const reportsScope = page.getByTestId('coach-reports');
    const desktopRow = reportsScope.locator('table tbody tr').first();
    if (await desktopRow.count()) {
      await desktopRow.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toMatch(/\/coach\/client\//);
    } else {
      test.info().annotations.push({ type: 'note', description: 'Desktop ranking table not visible at this viewport — skipped row-click navigation check.' });
    }

    watch.report();
  });
});
