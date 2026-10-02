import type { Page } from '@playwright/test';
import { test, expect, ready } from '../fixtures';
import { uiSignupCoach, uniq, snap, runCron, noHmr } from './_a-helpers';

/**
 * Forma subscription requests (no gateway; Super Admin confirms payment).
 *  B   Trial expires → cron raises a subscription request (account NOT pended)
 *      → Super Admin confirms in Payment Requests → Forma active from confirmation.
 *  B2  Active paid coach requests a renewal → Super Admin declines → nothing changes.
 *  B3  Awaiting request past its deadline → cron expires it; plan untouched.
 */

interface ReqDoc { _id: string; coachId: string; type: string; status: string; requestKey?: string; requestedAt: number; confirmationDeadline: number; confirmedAt?: number; planSnapshot?: { priceMonthly: number; maxClients: number; termDays: number } }
interface PlanDoc { plan: string; status: string; maxClients: number; baseMaxClients?: number; startedAt: number; endsAt: number; subscription?: { priceMonthly: number } }

async function signupCoach(page: Page, password: string, prefix: string) {
  const email = uniq(prefix);
  await uiSignupCoach(page, email, password);
  await expect(page).toHaveURL(/\/coach/, { timeout: 20_000 });
  await ready(page);
  return email;
}

test('B: Trial expires → account still usable → request raised → Super Admin confirms → Forma active', async ({ anon, as, db, env }, testInfo) => {
  test.setTimeout(150_000);
  const { context: c, page } = await anon(); await noHmr(c);
  const email = await signupCoach(page, env.password, 'expired.coach');
  const coachId = (await db.findOne<{ _id: string }>('users', { emailLower: email }))!._id;
  await db.updateOne('coachPlans', { _id: coachId }, { $set: { endsAt: Date.now() - 60_000 } });
  const cron = await runCron(env.baseURL, env.cronSecret);
  expect(cron.status).toBe(200);
  expect((await db.findOne<{ accountStatus: string }>('users', { _id: coachId }))?.accountStatus).toBe('active');
  const reqs = await db.find<ReqDoc>('coachPlanRequests', { coachId });
  expect(reqs).toHaveLength(1);
  expect(reqs[0]).toMatchObject({ type: 'trial_expired', status: 'awaiting', requestKey: 'subscription' });
  expect(reqs[0].planSnapshot).toMatchObject({ priceMonthly: 499, maxClients: 25, termDays: 30 });

  // Coach can still sign in and use My Plan; the ended Trial is explained, adding clients is blocked.
  await page.goto('/coach/plan');
  await ready(page);
  const pp = page.getByTestId('coach-plan');
  await expect(pp.getByTestId('plan-state')).toContainText('Ended');
  await expect(pp.getByTestId('plan-subscription-card')).toContainText('Your Free Trial has ended');
  await expect(pp.getByTestId('plan-subscription-pending')).toBeVisible();
  await expect(pp.getByTestId('plan-request-row').first()).toContainText('Forma subscription (Trial ended)');
  await expect(page.getByTestId('coach-plan-banner')).toContainText('Free Trial has ended');
  await snap(page, testInfo, 'coach-trial-ended', true);

  const { context: sc, page: sp } = await as('super'); await noHmr(sc);
  await sp.goto('/admin/plans?tab=requests');
  await ready(sp);
  const row = sp.getByTestId('request-row').filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row).toContainText('499 EGP / month');
  await snap(sp, testInfo, 'super-payment-requests');
  await row.getByTestId('request-open').click();
  const detail = sp.getByTestId('request-detail');
  await expect(detail).toContainText('up to 25 clients');
  await detail.getByTestId('request-confirm').click();
  await expect(sp.getByTestId('request-detail')).toHaveCount(0);
  const confirmedAt = Date.now();

  const r = await db.findOne<ReqDoc>('coachPlanRequests', { _id: reqs[0]._id });
  expect(r?.status).toBe('confirmed');
  const plan = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
  expect(plan).toMatchObject({ plan: 'forma', status: 'active', maxClients: 25, baseMaxClients: 25 });
  expect(plan!.subscription?.priceMonthly).toBe(499);
  expect(Math.abs(plan!.startedAt - confirmedAt)).toBeLessThan(15_000);
  expect(plan!.endsAt - plan!.startedAt).toBe(30 * 86_400_000);
  expect(await db.count('adminAuditLogs', { action: 'subscription.confirmed', targetUserId: coachId })).toBe(1);

  // Coach sees it without a manual reload (60 s poll / focus refetch).
  await page.bringToFront();
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); });
  await expect(pp.getByTestId('plan-phase')).toContainText('Forma Subscription', { timeout: 75_000 });
  await expect(pp.getByTestId('plan-capacity-usage')).toContainText('0 / 25');
  await expect(pp.getByTestId('plan-state')).toContainText('Active');
  await snap(page, testInfo, 'coach-now-subscribed', true);
});

test('B2: paid coach requests renewal → Super Admin declines → subscription untouched', async ({ as, db, env }, testInfo) => {
  const coachId = env.accounts.coachPro.id;
  const before = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
  try {
    const { context: c, page } = await as('coachPro'); await noHmr(c);
    await page.goto('/coach/plan');
    await ready(page);
    await page.getByTestId('plan-request-subscription').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText('499 EGP');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('plan-subscription-pending')).toBeVisible();
    const r = (await db.find<ReqDoc>('coachPlanRequests', { coachId, status: 'awaiting' }))[0];
    expect(r.type).toBe('renewal');
    expect(await db.findOne<PlanDoc>('coachPlans', { _id: coachId })).toMatchObject({ plan: before!.plan, maxClients: before!.maxClients, endsAt: before!.endsAt });
    await snap(page, testInfo, 'renewal-awaiting');

    const { context: sc, page: sp } = await as('super'); await noHmr(sc);
    await sp.goto(`/admin/coaches/${coachId}`);
    await ready(sp);
    const open = sp.getByTestId('coach-open-request');
    await expect(open).toContainText('Forma renewal');
    await open.getByTestId('coach-request-reject').click();
    await sp.getByTestId('confirm-accept').click();
    await expect(sp.getByTestId('coach-open-request')).toHaveCount(0);
    expect((await db.findOne<ReqDoc>('coachPlanRequests', { _id: r._id }))?.status).toBe('rejected');
    const after = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
    expect(after).toMatchObject({ plan: before!.plan, status: before!.status, maxClients: before!.maxClients, startedAt: before!.startedAt, endsAt: before!.endsAt });
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('plan-request-row').first()).toContainText('Declined');
    await snap(page, testInfo, 'coach-sees-declined');
  } finally {
    await db.deleteMany('coachPlanRequests', { coachId });
  }
});

test('B3: awaiting request past its deadline → cron expires it; Trial untouched; coach may request again', async ({ anon, env, db }, testInfo) => {
  const { context: c, page } = await anon(); await noHmr(c);
  const email = await signupCoach(page, env.password, 'stale.req');
  const coachId = (await db.findOne<{ _id: string }>('users', { emailLower: email }))!._id;
  const before = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
  await page.goto('/coach/plan');
  await ready(page);
  await page.getByTestId('plan-request-subscription').click();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('plan-subscription-pending')).toBeVisible();
  const r = (await db.find<ReqDoc>('coachPlanRequests', { coachId }))[0];
  expect(r.confirmationDeadline - r.requestedAt).toBe(24 * 3600_000);
  await page.goto('about:blank');
  await db.updateOne('coachPlanRequests', { _id: r._id }, { $set: { confirmationDeadline: Date.now() - 1000 } });
  expect((await runCron(env.baseURL, env.cronSecret)).status).toBe(200);
  expect((await db.findOne<ReqDoc>('coachPlanRequests', { _id: r._id }))?.status).toBe('expired');
  expect(await db.findOne<PlanDoc>('coachPlans', { _id: coachId })).toMatchObject({ plan: 'trial', status: 'active', maxClients: before!.maxClients, endsAt: before!.endsAt });
  await page.goto('/coach/plan');
  await ready(page);
  await expect(page.getByTestId('plan-request-row').first()).toContainText('Expired');
  await expect(page.getByTestId('plan-request-subscription')).toBeVisible();
  await snap(page, testInfo, 'expired-request');
});
