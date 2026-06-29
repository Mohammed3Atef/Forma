import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';

/**
 * COACH-DEFINED SUBSCRIPTION PLANS — a coach creates a reusable plan, sees it in
 * the per-client term picker, and can delete it. Self-contained: creates its own
 * client + plan, then cleans the plan up.
 */
let client: NewClient;

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    client = await createClientViaApi(coach, { email: uniqueEmail('qa-plans'), password: 'Plans123456!', displayName: `QA Plans ${Date.now()}` });
  } finally {
    await coach.close();
  }
});

test('coach creates a plan, it appears in the term picker, then deletes it', async ({ page, login }) => {
  await login('coach');
  const planName = `QA Plan ${Date.now()}`;

  // Create a plan (2 months).
  await page.goto('/coach/subscription-plans');
  await expect(page.getByTestId('coach-subscription-plans')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('coach-plan-add').click();
  await page.getByTestId('coach-plan-name').fill(planName);
  await page.getByTestId('coach-plan-duration').fill('2');
  await page.getByTestId('coach-plan-save').click();
  const row = page.getByTestId('coach-plan-row').filter({ hasText: planName });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // It shows up in the per-client term picker, and a term can still be set.
  await page.goto(`/coach/client/${client.uid}`);
  await expect(page.getByTestId(TID.coachSubscription)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId(TID.subSetTerm).click();
  await expect(page.getByTestId('term-plan')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('term-plan').locator('option', { hasText: planName })).toHaveCount(1);
  await page.getByTestId(TID.termStart).fill(new Date().toISOString().slice(0, 10));
  await page.getByTestId(TID.termMonths).fill('2');
  await page.getByTestId(TID.termSave).click();
  await expect(page.getByTestId(TID.subStatus)).toHaveText(/active/i, { timeout: 10_000 });

  // Clean up — delete the plan.
  await page.goto('/coach/subscription-plans');
  await row.getByTestId('coach-plan-delete').click();
  await page.getByTestId('confirm-accept').click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });
});
