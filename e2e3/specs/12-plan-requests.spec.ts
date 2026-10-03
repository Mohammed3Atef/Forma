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

test('B4: early renewal confirmed → term appended after the current end; same date on My Plan + Admin; audit/history show old → new', async ({ as, db, env }, testInfo) => {
  test.setTimeout(150_000);
  const coachId = env.accounts.coachPro.id;
  const before = (await db.findOne<PlanDoc & { history?: unknown[] }>('coachPlans', { _id: coachId }))!;
  expect(before.endsAt).toBeGreaterThan(Date.now() + 5 * 86_400_000); // seeded: ends in ~20 days
  const newEnd = before.endsAt + 30 * 86_400_000;
  try {
    const { context: c, page } = await as('coachPro'); await noHmr(c);
    await page.goto('/coach/plan');
    await ready(page);
    // Formatting is done in the page (its locale + timezone) so the assertions match exactly.
    const fmt = (t: number) => page.evaluate((x) => new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), t);
    const oldLabel = await fmt(before.endsAt);
    const newLabel = await fmt(newEnd);
    await expect(page.getByTestId('plan-ends')).toContainText(oldLabel);
    await page.getByTestId('plan-request-subscription').click();
    const dlg = page.getByTestId('confirm-dialog');
    await expect(dlg).toContainText(`ends ${oldLabel}`);
    await expect(dlg).toContainText(`through ${newLabel}`);
    await expect(dlg).not.toContainText(/starting now|starts today/i);
    await snap(page, testInfo, 'coach-renewal-dialog');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('plan-renewal-preview')).toContainText(newLabel);
    await expect(page.getByTestId('plan-state')).toContainText('Active'); // access unchanged while awaiting
    await expect(page.getByTestId('plan-ends')).toContainText(oldLabel);

    const { context: sc, page: sp } = await as('super'); await noHmr(sc);
    await sp.goto('/admin/plans?tab=requests');
    await ready(sp);
    const row = sp.getByTestId('request-row').filter({ hasText: 'Coach Pro' });
    await row.getByTestId('request-open').click();
    await expect(sp.getByTestId('request-detail-term')).toContainText(`extended through ${newLabel}`);
    await snap(sp, testInfo, 'admin-renewal-detail');
    const confirmedAt = Date.now();
    await sp.getByTestId('request-detail').getByTestId('request-confirm').click();
    await expect(sp.getByTestId('request-detail')).toHaveCount(0);

    const after = (await db.findOne<PlanDoc & { subscription?: { termStartsAt?: number } }>('coachPlans', { _id: coachId }))!;
    expect(after).toMatchObject({ status: 'active', startedAt: before.startedAt, endsAt: newEnd });
    expect(after.subscription?.termStartsAt).toBe(before.endsAt);
    const audit = await db.findOne<{ metadata: Record<string, unknown> }>('adminAuditLogs', { action: 'subscription.renewed', targetUserId: coachId });
    expect(audit?.metadata).toMatchObject({ previousEndsAt: before.endsAt, termStartsAt: before.endsAt, newEndsAt: newEnd, extended: true });
    expect(Math.abs((audit!.metadata.confirmedAt as number) - confirmedAt)).toBeLessThan(15_000);

    // Admin Coach Detail shows the same extended date + the history entry old → new.
    await sp.goto(`/admin/coaches/${coachId}`);
    await ready(sp);
    const adminLabel = await sp.evaluate((x) => new Date(x).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), newEnd);
    await expect(sp.getByTestId('coach-subscription')).toContainText(adminLabel);
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    await expect(sp.getByText(`${iso(before.endsAt)} → ${iso(newEnd)}`)).toBeVisible();
    await snap(sp, testInfo, 'admin-coach-extended', true);

    // Coach My Plan shows the extended date without losing access.
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('plan-ends')).toContainText(newLabel);
    await expect(page.getByTestId('plan-state')).toContainText('Active');
    await snap(page, testInfo, 'coach-extended', true);
  } finally {
    await db.deleteMany('coachPlanRequests', { coachId });
    await db.updateOne('coachPlans', { _id: coachId }, { $set: { endsAt: before.endsAt, startedAt: before.startedAt, history: before.history ?? [] } });
  }
});
