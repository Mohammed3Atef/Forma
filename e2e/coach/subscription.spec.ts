import { test, expect, AUTH, watchForIssues } from './_helpers';

test.use({ storageState: AUTH('coach') });

test.describe('Coach My Plan / Subscription', () => {
  test('shows the pro tier/status/usage, then submit and cancel a plan-change request', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/plan');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('coach-plan')).toBeVisible();

    const text = await page.getByTestId('coach-plan').innerText();
    // coach@forma.test is provisioned on the "pro" tier per the demo setup.
    expect(text).toMatch(/pro/i);
    expect(text).toMatch(/\d+\s*\/\s*\d+/); // "used / max" clients usage

    // If a request is already pending from a previous run, cancel it first so
    // we can exercise the full submit -> cancel flow cleanly.
    if (await page.getByTestId('coach-plan-cancel').isVisible().catch(() => false)) {
      await page.getByTestId('coach-plan-cancel').click();
      await page.waitForLoadState('networkidle');
    }

    await page.getByTestId('coach-plan-request').click();
    await page.getByTestId('coach-plan-reason').fill('QA pass: testing more clients next quarter as the roster grows — requesting a capacity bump.');
    await page.getByTestId('coach-plan-request-submit').click();
    await page.waitForLoadState('networkidle');

    // A pending request card should now be visible with a Cancel action.
    await expect(page.getByTestId('coach-plan-request-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('coach-plan-request-card')).toContainText(/pending/i);

    // Cancel it — leaving no dangling pending request for the super-admin queue
    // (documented choice: this pass doesn't leave demo pending requests here).
    await page.getByTestId('coach-plan-cancel').click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('coach-plan-request-card')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('coach-plan-request')).toBeVisible();

    watch.report();
  });
});
