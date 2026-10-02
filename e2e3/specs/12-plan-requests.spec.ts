import type { Page } from '@playwright/test';
import { test, expect, ready } from '../fixtures';
import { uiSignupCoach, uniq, snap, runCron, noHmr } from './_a-helpers';

/**
 * Coach plan-request lifecycle (single plan model: Trial → Pro).
 *
 * Adaptation of spec §7 "Choose Paid Plan from marketing": the marketing page
 * has ONE CTA (Start Trial); `?plan=` is intentionally dead. The paid path is
 * signup → Trial → request Pro from My Plan → super admin confirms.
 */

interface ReqDoc {
  _id: string; coachId: string; type: string; status: string; requestedAt: number; confirmationDeadline: number; confirmedAt?: number;
  planSnapshot: { tierKey: string; priceMonthly: number; maxClients: number; currency: string; termDays: number };
}
interface PlanDoc { plan: string; status: string; maxClients: number; startedAt: number; endsAt: number }

const metric = (page: Page, label: string) =>
  page.getByTestId('coach-plan').locator('.card').filter({ has: page.getByText(label, { exact: true }) }).first();

async function requestPro(page: Page, reason = 'Need more clients') {
  await page.goto('/coach/plan');
  await expect(page.getByTestId('coach-plan')).toBeVisible();
  await page.getByTestId('coach-plan-request').click();
  await page.getByRole('button', { name: /^Pro · 25$/ }).click();
  await page.getByTestId('coach-plan-reason').fill(reason);
  await page.getByTestId('coach-plan-request-submit').click();
  await expect(page.getByTestId('coach-plan-request-card')).toBeVisible();
}

async function signupCoach(page: Page, password: string, prefix: string) {
  const email = uniq(prefix);
  await uiSignupCoach(page, email, password);
  await expect(page).toHaveURL(/\/coach/, { timeout: 20_000 });
  await ready(page);
  return email;
}

test.describe.serial('trial coach → Pro request → super confirms', () => {
  let coachId = '';
  let coachPage: Page;

  test('(a) trial coach requests Pro: current plan stays Trial, Requested card shows Pro 499/25 awaiting', async ({ browser, env, db, audit }, testInfo) => {
    // Context kept open across (a)→(b), so it is created from `browser` (fixture contexts close per test).
    const ctx = await noHmr(await browser.newContext({ ...testInfo.project.use, baseURL: env.baseURL }));
    coachPage = await ctx.newPage();
    coachPage.on('response', (r) => { if (r.status() >= 500) audit.events.push({ kind: 'http', who: 'coach-(a)', status: r.status(), url: r.url(), text: r.request().method() }); });
    const email = await signupCoach(coachPage, env.password, 'req.coach');
    coachId = (await db.findOne<{ _id: string }>('users', { emailLower: email }))!._id;

    await requestPro(coachPage);
    const card = coachPage.getByTestId('coach-plan-request-card');
    await expect(card).toContainText('Request pending review');
    await expect(card).toContainText('Pro');
    await expect(card).toContainText('25');
    await expect(card).toContainText(/Awaiting payment confirmation · 2[34]h left/);
    // (price shown on this card is asserted separately in "(a2)" so a failure there doesn't skip (b))
    // Current plan untouched.
    await expect(metric(coachPage, 'Plan')).toContainText('Trial');
    await expect(metric(coachPage, 'Clients used')).toContainText('0 / 2');
    await snap(coachPage, testInfo, 'requested-pro-awaiting');

    const reqs = await db.find<ReqDoc>('coachPlanRequests', { coachId });
    expect(reqs).toHaveLength(1);
    const r = reqs[0];
    expect(r.status).toBe('awaiting');
    expect(r.type).toBe('trial_upgrade');
    expect(r.planSnapshot).toMatchObject({ tierKey: 'pro', priceMonthly: 499, maxClients: 25 });
    expect(r.confirmationDeadline - r.requestedAt).toBe(24 * 3600_000);
    const plan = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
    expect(plan).toMatchObject({ plan: 'trial', status: 'active', maxClients: 2 });
  });

  test('(b) super confirms → coach My Plan becomes Pro / 25 without manual reload', async ({ as, db }, testInfo) => {
    test.setTimeout(180_000);
    expect(coachId, 'needs (a)').not.toBe('');
    const { context: _c7176, page: sp } = await as('super'); await noHmr(_c7176);
    await sp.goto(`/admin/coaches/${coachId}`);
    await ready(sp);
    const card = sp.getByTestId('coach-plan-request-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Pro');
    await expect(card).toContainText('25');
    await expect(card).toContainText('499 EGP');
    await snap(sp, testInfo, 'super-sees-request');
    await sp.getByTestId('coach-plan-approve').click();
    await expect(sp.getByTestId('confirm-dialog')).toContainText('Pro');
    await sp.getByTestId('confirm-accept').click();
    const confirmClickAt = Date.now();
    await expect(card).toHaveCount(0);
    await snap(sp, testInfo, 'super-after-confirm');

    const r = (await db.find<ReqDoc>('coachPlanRequests', { coachId }))[0];
    expect(r.status).toBe('confirmed');
    const plan = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
    expect(plan).toMatchObject({ plan: 'pro', status: 'active', maxClients: 25 });
    expect(Math.abs(plan!.startedAt - r.confirmedAt!)).toBeLessThan(1000);
    expect(Math.abs(plan!.startedAt - confirmClickAt)).toBeLessThan(15_000);
    expect(plan!.endsAt - plan!.startedAt).toBe(30 * 86_400_000);

    // Coach tab: no reload. Bring to front + fire focus/visibility (React Query focus refetch), then wait for the 60 s poll.
    await coachPage.bringToFront();
    await coachPage.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); });
    const t0 = Date.now();
    await expect(metric(coachPage, 'Plan')).toContainText('Pro', { timeout: 75_000 });
    await expect(metric(coachPage, 'Clients used')).toContainText('0 / 25', { timeout: 10_000 });
    const seconds = Math.round((Date.now() - t0) / 1000);
    await testInfo.attach('coach-ui-update-latency.txt', { body: `My Plan showed Pro ${seconds}s after confirm (no reload)`, contentType: 'text/plain' });
    expect(seconds, 'coach sees Pro within 70 s').toBeLessThanOrEqual(70);
    await expect(coachPage.getByTestId('coach-plan-request-card')).toHaveCount(0);
    await snap(coachPage, testInfo, 'coach-now-pro');
    await coachPage.context().close();
  });
});

test('(a2) coach Requested Plan card shows the snapshot price (499 EGP)', async ({ as, db, env }, testInfo) => {
  const coachId = env.accounts.coachB.id;
  try {
    const { context: _c8963, page } = await as('coachB'); await noHmr(_c8963);
    await requestPro(page);
    const card = page.getByTestId('coach-plan-request-card');
    await snap(page, testInfo, 'requested-card');
    await expect(card, 'Requested Plan card shows the price the coach will be asked to pay').toContainText('499');
  } finally {
    await db.deleteMany('coachPlanRequests', { coachId }); // restore seeded coachB (plan itself never changes on submit)
  }
});

test('(c) awaiting request past its deadline → cron expires it; Trial and account unchanged', async ({ anon, env, db }, testInfo) => {
  const { context: _c679, page } = await anon(); await noHmr(_c679);
  const email = await signupCoach(page, env.password, 'expire.coach');
  const coachId = (await db.findOne<{ _id: string }>('users', { emailLower: email }))!._id;
  const before = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
  await requestPro(page);
  await snap(page, testInfo, 'requested');
  const r = (await db.find<ReqDoc>('coachPlanRequests', { coachId }))[0];
  await page.goto('about:blank'); // no UI reads → only the cron can expire it
  await db.updateOne('coachPlanRequests', { _id: r._id }, { $set: { confirmationDeadline: Date.now() - 1000 } });
  const cron = await runCron(env.baseURL, env.cronSecret);
  await testInfo.attach('cron-response.txt', { body: `${cron.status}\n${cron.body}`, contentType: 'text/plain' });
  expect(cron.status).toBe(200);
  const after = await db.findOne<ReqDoc & { expiredAt?: number }>('coachPlanRequests', { _id: r._id });
  expect(after?.status).toBe('expired');
  const plan = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
  expect(plan).toMatchObject({ plan: 'trial', status: 'active', maxClients: 2, startedAt: before!.startedAt, endsAt: before!.endsAt });
  const user = await db.findOne<{ accountStatus: string }>('users', { _id: coachId });
  expect(user?.accountStatus).toBe('active');

  await page.goto('/coach/plan');
  await ready(page);
  const pp = page.getByTestId('coach-plan');
  await expect(pp).toContainText('Your last plan request expired without a response — you can request again.');
  await expect(pp.getByTestId('coach-plan-request-card')).toHaveCount(0);
  await expect(pp.getByTestId('coach-plan-request')).toBeVisible();
  await expect(metric(page, 'Plan')).toContainText('Trial');
  await expect(page.getByText(/client limit/i)).toHaveCount(0);
  await snap(page, testInfo, 'expired-request-copy');
});

test('(d) Pro coach re-requests Pro → renewal; plan stays Pro active; super rejects → plan untouched', async ({ as, db, env }, testInfo) => {
  const coachId = env.accounts.coachPro.id;
  const before = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
  try {
    const { context: _c8476, page } = await as('coachPro'); await noHmr(_c8476);
    await requestPro(page, 'Renewing for next month');
    const r = (await db.find<ReqDoc>('coachPlanRequests', { coachId, status: 'awaiting' }))[0];
    expect(r.type).toBe('renewal');
    expect(r.planSnapshot).toMatchObject({ tierKey: 'pro', priceMonthly: 499, maxClients: 25 });
    await expect(metric(page, 'Plan')).toContainText('Pro');
    await expect(metric(page, 'Status')).toContainText('Active');
    await expect(metric(page, 'Clients used')).toContainText('0 / 25');
    expect(await db.findOne<PlanDoc>('coachPlans', { _id: coachId })).toMatchObject({ plan: 'pro', status: 'active', maxClients: 25 });
    await snap(page, testInfo, 'renewal-awaiting');

    const { context: _c7176, page: sp } = await as('super'); await noHmr(_c7176);
    await sp.goto(`/admin/coaches/${coachId}`);
    await ready(sp);
    await expect(sp.getByTestId('coach-plan-request-card')).toBeVisible();
    await sp.getByTestId('coach-plan-reject').click();
    const dlg = sp.getByTestId('confirm-dialog');
    await expect(dlg).toBeVisible();
    await snap(sp, testInfo, 'reject-confirm-dialog');
    await sp.getByTestId('confirm-accept').click();
    await expect(sp.getByTestId('coach-plan-request-card')).toHaveCount(0);

    expect((await db.findOne<ReqDoc>('coachPlanRequests', { _id: r._id }))?.status).toBe('rejected');
    const after = await db.findOne<PlanDoc>('coachPlans', { _id: coachId });
    expect(after).toMatchObject({ plan: before!.plan, status: before!.status, maxClients: before!.maxClients, startedAt: before!.startedAt, endsAt: before!.endsAt });

    await page.reload();
    await ready(page);
    await expect(page.getByTestId('coach-plan')).toContainText('Declined');
    await expect(metric(page, 'Plan')).toContainText('Pro');
    await snap(page, testInfo, 'coach-sees-declined');
  } finally {
    // Restore seeded state for coachPro (no request rows; plan as seeded).
    await db.deleteMany('coachPlanRequests', { coachId });
    if (before) await db.updateOne('coachPlans', { _id: coachId }, { $set: { plan: before.plan, status: before.status, maxClients: before.maxClients, startedAt: before.startedAt, endsAt: before.endsAt } });
  }
});

test('(e) tier price edited while a request is pending → marketing shows 599, request keeps 499 snapshot, confirm applies snapshot', async ({ anon, as, db, env }, testInfo) => {
  test.setTimeout(120_000);
  const { context: _c679, page } = await anon(); await noHmr(_c679);
  const email = await signupCoach(page, env.password, 'stale.coach');
  const coachId = (await db.findOne<{ _id: string }>('users', { emailLower: email }))!._id;
  await requestPro(page);
  const { context: _c7176, page: sp } = await as('super'); await noHmr(_c7176);
  try {
    await sp.goto('/admin/plans');
    await ready(sp);
    const row = sp.locator('[data-testid="plan-row"][data-key="pro"]');
    await row.getByTestId('plan-edit').click();
    await sp.getByTestId('plan-price').fill('599');
    await snap(sp, testInfo, 'edit-price-599');
    await sp.getByTestId('plan-save').click();
    await expect(sp.getByTestId('plan-form')).toHaveCount(0);
    await expect(row).toContainText('599');
    expect((await db.findOne<{ priceMonthly: number }>('coachPlanTiers', { _id: 'pro' }))?.priceMonthly).toBe(599);

    const { context: _c3933, page: mp } = await anon(); await noHmr(_c3933);
    await mp.goto('/');
    const mcard = mp.getByTestId('landing-pricing-card');
    await mcard.scrollIntoViewIfNeeded();
    await expect(mcard).toContainText('599 EGP', { timeout: 20_000 });
    await snap(mp, testInfo, 'marketing-599');

    await sp.goto(`/admin/coaches/${coachId}`);
    await ready(sp);
    const card = sp.getByTestId('coach-plan-request-card');
    await expect(card).toContainText('499 EGP');
    await expect(card).toContainText('Tier configuration has changed since this request was made');
    await snap(sp, testInfo, 'stale-snapshot-note');
    await sp.getByTestId('coach-plan-approve').click();
    await sp.getByTestId('confirm-accept').click();
    await expect(card).toHaveCount(0);
    const r = (await db.find<ReqDoc>('coachPlanRequests', { coachId }))[0];
    expect(r.status).toBe('confirmed');
    expect(r.planSnapshot).toMatchObject({ priceMonthly: 499, maxClients: 25 });
    expect(await db.findOne<PlanDoc>('coachPlans', { _id: coachId })).toMatchObject({ plan: 'pro', status: 'active', maxClients: 25 });
  } finally {
    // Restore the tier price through the UI; fall back to the DB if the UI path failed.
    try {
      await sp.goto('/admin/plans');
      await ready(sp);
      await sp.locator('[data-testid="plan-row"][data-key="pro"]').getByTestId('plan-edit').click();
      await sp.getByTestId('plan-price').fill('499');
      await sp.getByTestId('plan-save').click();
      await expect(sp.getByTestId('plan-form')).toHaveCount(0);
    } catch { /* fall through */ }
    if ((await db.findOne<{ priceMonthly: number }>('coachPlanTiers', { _id: 'pro' }))?.priceMonthly !== 499) {
      await db.updateOne('coachPlanTiers', { _id: 'pro' }, { $set: { priceMonthly: 499 } });
    }
    expect((await db.findOne<{ priceMonthly: number }>('coachPlanTiers', { _id: 'pro' }))?.priceMonthly).toBe(499);
  }
});
