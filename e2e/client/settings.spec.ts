import { test, expect } from '@playwright/test';
import { CLIENT_AUTH, watchPage } from './helpers';

test.use({ storageState: CLIENT_AUTH });

test('Profile tab: change-password form renders', async ({ page }) => {
  const { consoleErrors, failedRequests } = watchPage(page);

  await page.goto('/settings');
  await expect(page.getByTestId('settings-tab-profile')).toBeVisible();

  // Change-password form renders (verify only — do not actually submit a change
  // to this shared QA account's login credentials).
  await page.getByTestId('change-password').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('sheet-close').click();

  if (consoleErrors.length) console.warn('[settings.spec] console errors:', consoleErrors);
  const bad = failedRequests.filter((r) => r.status >= 400);
  if (bad.length) console.warn('[settings.spec] failed requests:', bad);
});

test('Account tab: coach info and subscription link render', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('settings-tab-account').click();

  // Full "Your Coach" card — same regression surface as the compact Home card.
  await expect(page.getByTestId('coach-info')).toBeVisible({ timeout: 15_000 });

  // Subscription now has its own destination (matches the design's nav rail,
  // which lists it as a sibling of Settings rather than a section inside it).
  await page.getByTestId('settings-subscription-link').click();
  await expect(page).toHaveURL(/\/settings\/subscription/);
  const subSection = page.getByTestId('client-subscription');
  if (await subSection.isVisible().catch(() => false)) {
    await expect(page.getByTestId('client-sub-status')).toContainText(/active/i);
  } else {
    console.log('[settings.spec] no subscription section rendered — coach has not set a subscription term.');
  }
});

test('App settings: a safe preference change persists after reload', async ({ page }) => {
  await page.goto('/settings/app');
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();

  const weeklyGoalInput = page.locator('span:text("Weekly workout goal")').locator('..').locator('input');
  await expect(weeklyGoalInput).toBeVisible();
  const before = await weeklyGoalInput.inputValue();
  const next = before === '4' ? '5' : '4';
  await weeklyGoalInput.fill(next);
  await weeklyGoalInput.blur();
  await page.waitForTimeout(500); // debounced/optimistic save

  await page.reload();
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
  const weeklyGoalInputAfter = page.locator('span:text("Weekly workout goal")').locator('..').locator('input');
  await expect(weeklyGoalInputAfter).toHaveValue(next, { timeout: 10_000 });
});
