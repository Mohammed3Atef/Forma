import { test, expect, ready } from '../fixtures';
import { uiSignupCoach, uniq, snap, noHmr } from './_a-helpers';

/**
 * Landing → live pricing → Start Trial → coach signup → Trial (no request).
 * Single-plan model: marketing has ONE CTA (Start Trial → /login?signup=1).
 */
test('landing pricing → Start Trial → signup → coach on active Trial, no plan request', async ({ anon, db, env }, testInfo) => {
  const { context: _c679, page } = await anon(); await noHmr(_c679);
  await page.goto('/');
  const pricing = page.getByTestId('landing-pricing');
  await pricing.scrollIntoViewIfNeeded();
  const card = page.getByTestId('landing-pricing-card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  // Live values from coachPlanTiers.public: Trial (15 days, 2 clients) + Pro (499 EGP, 25 clients).
  await expect(card).toContainText('499 EGP');
  await expect(card).toContainText('15');
  await expect(card).toContainText('2');
  await expect(card).toContainText('25');
  await card.scrollIntoViewIfNeeded();
  await snap(page, testInfo, 'landing-pricing');
  // Exactly one CTA in the pricing card.
  const ctas = card.getByRole('link');
  await expect(ctas).toHaveCount(1);
  await expect(ctas.first()).toHaveAttribute('href', '/login?signup=1');
  await ctas.first().click();
  await expect(page).toHaveURL(/\/login\?signup=1$/);
  await expect(page.getByTestId('signup-role-coach')).toBeVisible();
  await snap(page, testInfo, 'signup-form');

  const email = uniq('trial.coach');
  await uiSignupCoach(page, email, env.password);
  await expect(page).toHaveURL(/\/coach/, { timeout: 20_000 });
  await ready(page);
  await snap(page, testInfo, 'coach-app-after-signup');

  const user = await db.findOne<{ _id: string; role: string; accountStatus: string }>('users', { emailLower: email });
  expect(user?.role).toBe('coach');
  expect(user?.accountStatus).toBe('active');
  const coachId = user!._id;

  await page.goto('/coach/plan');
  const planPage = page.getByTestId('coach-plan');
  await expect(planPage).toBeVisible();
  await expect(planPage.getByText('Trial', { exact: true }).first()).toBeVisible();
  await expect(planPage).toContainText('0 / 2');
  // End date = signup + 15 days.
  const plan = await db.findOne<{ plan: string; status: string; maxClients: number; startedAt: number; endsAt: number }>('coachPlans', { _id: coachId });
  expect(plan).toMatchObject({ plan: 'trial', status: 'active', maxClients: 2 });
  expect(Math.round((plan!.endsAt - plan!.startedAt) / 86_400_000)).toBe(15);
  expect(Math.abs(plan!.startedAt - Date.now())).toBeLessThan(5 * 60_000);
  const ends = new Date(plan!.endsAt);
  const day = String(ends.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'Africa/Cairo' }));
  await expect(planPage).toContainText(day);
  // No request card, request button offered.
  await expect(planPage.getByTestId('coach-plan-request-card')).toHaveCount(0);
  await expect(planPage.getByTestId('coach-plan-request')).toBeVisible();
  expect(await db.count('coachPlanRequests', { coachId })).toBe(0);
  await snap(page, testInfo, 'my-plan-trial');
});
