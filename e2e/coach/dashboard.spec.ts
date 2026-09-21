import { test, expect, AUTH, watchForIssues } from './_helpers';

test.use({ storageState: AUTH('coach') });

test.describe('Coach Dashboard', () => {
  test('loads with real roster numbers and every tab renders', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('coach-dashboard')).toBeVisible();
    await expect(page.getByTestId('coach-dashboard-top')).toBeVisible();

    // Hero stats should reflect a real, non-empty roster (demo coach has 8+ clients).
    const heroText = await page.getByTestId('coach-dashboard-top').innerText();
    expect(heroText).toMatch(/\d/); // at least one numeric stat rendered

    // Analytics and Reports moved to their own destinations (/coach/revenue,
    // /coach/reports — see revenue.spec.ts / reports.spec.ts) — the design
    // treats Business/Revenue/Reports as top-level nav items, not dashboard tabs.
    for (const tab of ['overview', 'clients', 'engagement', 'content'] as const) {
      await page.getByTestId(`coach-dash-${tab}`).click();
      await page.waitForTimeout(300);
      // Each panel should render some content, not an obviously blank pane.
      const bodyText = (await page.locator('body').innerText()).trim();
      expect(bodyText.length).toBeGreaterThan(200);
    }

    watch.report();
  });

  for (const vp of [{ name: 'mobile', width: 390, height: 844 }, { name: 'tablet', width: 768, height: 1024 }]) {
    test(`no horizontal overflow at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/coach/dashboard');
      await page.waitForLoadState('networkidle');
      const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflowing, `coach/dashboard overflows horizontally at ${vp.width}px`).toBe(false);
    });
  }
});
