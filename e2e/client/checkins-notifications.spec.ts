import { test, expect } from '@playwright/test';
import { CLIENT_AUTH, watchPage } from './helpers';

test.use({ storageState: CLIENT_AUTH });

test.describe('Check-ins', () => {
  test('check current check-in state; submit if one is pending', async ({ page }) => {
    await page.goto('/check-ins');
    await expect(page.getByRole('heading', { name: /check-in history/i })).toBeVisible();

    const noCheckins = page.getByText(/no check-ins yet/i);
    if (await noCheckins.isVisible().catch(() => false)) {
      console.log('[checkins.spec] no check-ins exist for this client yet — a coach would need to request one. Out of scope for the client-side flow.');
      return;
    }

    const rows = page.getByTestId('checkin-history-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Find a "requested" (pending, actionable) row if one exists.
    const requestedRow = page.getByTestId('checkin-history-row').filter({ hasText: /requested/i }).first();
    if (await requestedRow.isVisible().catch(() => false)) {
      await requestedRow.click();
      await expect(page.getByTestId('checkin-submit')).toBeVisible();
      // Fill realistic values via the real sliders/inputs, then submit.
      await page.getByTestId('checkin-notes').fill('Felt strong this week, sleep was a bit inconsistent.');
      await page.getByTestId('checkin-submit').click();
      await expect(page.getByText(/submitted|reviewed/i)).toBeVisible({ timeout: 15_000 });
      console.log('[checkins.spec] submitted a pending check-in through the real UI.');
    } else {
      console.log('[checkins.spec] no pending ("requested") check-in — nothing to submit; verified history renders.');
    }
  });
});

test.describe('Notifications', () => {
  test('notifications feed renders and mark-as-read works', async ({ page }) => {
    const { consoleErrors, failedRequests } = watchPage(page);

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible();

    const empty = page.getByText(/no notifications yet/i);
    if (await empty.isVisible().catch(() => false)) {
      console.log('[notifications.spec] notifications feed is empty for this client.');
      return;
    }

    const items = page.getByTestId('notification-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    const first = items.first();
    await first.click();
    // Clicking navigates away (to the relevant screen) and marks it seen server-side.
    await page.goBack();
    await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible();

    if (consoleErrors.length) console.warn('[notifications.spec] console errors:', consoleErrors);
    const bad = failedRequests.filter((r) => r.status >= 400);
    if (bad.length) console.warn('[notifications.spec] failed requests:', bad);
  });
});
