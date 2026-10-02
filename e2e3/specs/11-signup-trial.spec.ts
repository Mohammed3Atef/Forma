import { test, expect, ready } from '../fixtures';
import { uiSignupCoach, uniq, snap, noHmr } from './_a-helpers';

/**
 * FLOW A — Landing (ONE Forma card) → Start Free Trial → coach signup →
 * active Forma Trial with the configured base capacity, no payment request.
 * Seeded config: 15-day Trial, Trial limit 2, base 25, 499 EGP / month.
 */
test('A: one Forma card → Start Free Trial → signup → Trial with configured capacity, no request', async ({ anon, db, env }, testInfo) => {
  const { context: c, page } = await anon(); await noHmr(c);
  await page.goto('/');
  await page.getByTestId('landing-pricing').scrollIntoViewIfNeeded();
  const cards = page.getByTestId('landing-pricing-card');
  await expect(cards).toHaveCount(1, { timeout: 20_000 });
  const card = cards.first();
  await expect(card.getByTestId('pricing-title')).toHaveText(/forma/i);
  await expect(card.getByTestId('pricing-trial')).toHaveText('15-day Free Trial');
  await expect(card.getByTestId('pricing-clients')).toHaveText('Up to 25 clients');
  await expect(card.getByTestId('pricing-price')).toContainText('499 EGP');
  await expect(card).toContainText('All features included');
  await expect(page.getByTestId('landing-pricing')).toContainText('One plan. Everything included.');
  await expect(page.getByTestId('landing-pricing')).toContainText('100% Coach-Led — No AI replacing you');
  // Capacity add-ons are internal — never on the public site.
  await expect(page.locator('body')).not.toContainText('+20 clients');
  await expect(page.getByText(/choose plan|change plan|upgrade/i)).toHaveCount(0);
  await card.scrollIntoViewIfNeeded();
  await snap(page, testInfo, 'landing-forma-card');
  const ctas = card.getByRole('link');
  await expect(ctas).toHaveCount(1);
  await expect(ctas.first()).toHaveText('Start Free Trial');
  await expect(ctas.first()).toHaveAttribute('href', '/login?signup=1');
  await ctas.first().click();
  await expect(page).toHaveURL(/\/login\?signup=1$/);

  const email = uniq('trial.coach');
  await uiSignupCoach(page, email, env.password);
  await expect(page).toHaveURL(/\/coach/, { timeout: 20_000 });
  await ready(page);

  const user = await db.findOne<{ _id: string; role: string; accountStatus: string }>('users', { emailLower: email });
  expect(user).toMatchObject({ role: 'coach', accountStatus: 'active' });
  const plan = await db.findOne<{ plan: string; status: string; maxClients: number; baseMaxClients: number; startedAt: number; endsAt: number }>('coachPlans', { _id: user!._id });
  expect(plan).toMatchObject({ plan: 'trial', status: 'active', maxClients: 2, baseMaxClients: 2 });
  expect(Math.round((plan!.endsAt - plan!.startedAt) / 86_400_000)).toBe(15);
  expect(await db.count('coachPlanRequests', { coachId: user!._id })).toBe(0);

  await page.goto('/coach/plan');
  const pp = page.getByTestId('coach-plan');
  await expect(pp).toBeVisible();
  await expect(pp.getByTestId('plan-phase')).toContainText('Forma Free Trial');
  await expect(pp.getByTestId('plan-state')).toContainText('Free Trial');
  await expect(pp.getByTestId('plan-capacity-usage')).toContainText('0 / 2');
  await expect(pp.getByTestId('plan-capacity-breakdown')).toContainText('Included in Forma');
  await expect(pp.getByTestId('plan-request-subscription')).toHaveText(/Subscribe to Forma/);
  // The seeded +20 package is offered to the coach (internal surface).
  await expect(pp.getByTestId('plan-offer')).toContainText('+20');
  await snap(page, testInfo, 'my-plan-trial', true);
});
