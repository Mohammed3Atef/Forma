import type { Page } from '@playwright/test';
import { test, expect, ready } from '../fixtures';
import { uiSignupCoach, uniq, snap, runCron, noHmr } from './_a-helpers';

/**
 * Client-capacity add-ons (internal; Super Admin confirms payment).
 *  C  coach requests +20 → no change yet → Super Admin confirms → effective limit +20
 *  D  add-on expires → limit drops → existing clients stay → new invite blocked (over cap)
 *  E  Super Admin grants custom capacity directly (audited)
 *  F  package price edited while a request is awaiting → snapshot unchanged
 *  G  two concurrent client joins at the final slot → exactly one succeeds
 * Seeded package `e2e-pkg-20` (+20 clients, 199 EGP / month). Specs that touch
 * seeded coachPro restore it in `finally`.
 */

interface PlanDoc { maxClients: number; baseMaxClients?: number; addonClientCapacity?: number; activeClientCount?: number }
interface EntDoc { _id: string; status: string; endsAt: number | null; snapshot: { price: number; additionalClients: number }; source: string }

async function freshCoach(page: Page, password: string, prefix: string, db: import('../fixtures').Db) {
  const email = uniq(prefix);
  // This file signs up several coaches from one IP — reset the (isolated) run DB's signup rate-limit buckets.
  await db.deleteMany('rateLimits', {});
  await uiSignupCoach(page, email, password);
  await expect(page).toHaveURL(/\/coach/, { timeout: 20_000 });
  await ready(page);
  return { id: (await db.findOne<{ _id: string }>('users', { emailLower: email }))!._id, email };
}

async function requestPackage(page: Page) {
  await page.goto('/coach/plan');
  await ready(page);
  const offer = page.getByTestId('plan-offer').filter({ hasText: '+20' });
  await offer.getByTestId('plan-offer-request').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('199 EGP');
  await page.getByTestId('confirm-accept').click();
  await expect(offer).toContainText('Awaiting payment confirmation');
}

async function confirmInQueue(sp: Page, coachLabel: string) {
  await sp.goto('/admin/plans?tab=requests');
  await ready(sp);
  const row = sp.getByTestId('request-row').filter({ hasText: coachLabel });
  await expect(row).toBeVisible();
  await row.getByTestId('request-open').click();
  await sp.getByTestId('request-detail').getByTestId('request-confirm').click();
  await expect(sp.getByTestId('request-detail')).toHaveCount(0);
}

test('C: coach requests +20 → unchanged until confirmed → Super Admin confirms → 25 → 45', async ({ as, db, env }, testInfo) => {
  test.setTimeout(150_000);
  const coachId = env.accounts.coachPro.id;
  try {
    const { context: c, page } = await as('coachPro'); await noHmr(c);
    await requestPackage(page);
    await expect(page.getByTestId('plan-capacity-usage')).toContainText('0 / 25');
    expect((await db.findOne<PlanDoc>('coachPlans', { _id: coachId }))?.maxClients).toBe(25);
    await snap(page, testInfo, 'requested-awaiting', true);

    const { context: sc, page: sp } = await as('super'); await noHmr(sc);
    await confirmInQueue(sp, 'Coach Pro');
    expect(await db.findOne<PlanDoc>('coachPlans', { _id: coachId })).toMatchObject({ maxClients: 45, baseMaxClients: 25, addonClientCapacity: 20 });

    await page.bringToFront();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
    await expect(page.getByTestId('plan-capacity-usage')).toContainText('0 / 45', { timeout: 75_000 });
    await expect(page.getByTestId('plan-active-addon')).toContainText('+20 clients');
    await snap(page, testInfo, 'coach-45', true);
  } finally {
    await db.deleteMany('coachCapacityEntitlements', { coachId });
    await db.deleteMany('coachPlanRequests', { coachId });
    await db.updateOne('coachPlans', { _id: coachId }, { $set: { maxClients: 25, baseMaxClients: 25, addonClientCapacity: 0 } });
  }
});

test('D: add-on expires → limit drops → clients stay → over capacity → new invite blocked', async ({ anon, as, db, env }, testInfo) => {
  test.setTimeout(150_000);
  const { context: c, page } = await anon(); await noHmr(c);
  const { id: coachId, email } = await freshCoach(page, env.password, 'overcap.coach', db);
  // Super Admin grants the +20 package (2 → 22) from the coach detail page.
  const { context: sc, page: sp } = await as('super'); await noHmr(sc);
  await sp.goto(`/admin/coaches/${coachId}`);
  await ready(sp);
  await sp.getByTestId('coach-add-capacity').click();
  await expect(sp.getByTestId('add-capacity-package')).toBeVisible();
  await sp.getByTestId('add-capacity-save').click();
  await expect(sp.getByTestId('coach-capacity-usage')).toContainText('0 / 22');
  // Three real active relationships (setup through the DB — creating clients by UI would take minutes).
  const now = Date.now();
  for (let i = 0; i < 3; i += 1) {
    const cid = `e2e-overcap-${now}-${i}`;
    await db.insertOne('users', { _id: cid, email: `${cid}@e2e.test`, emailLower: `${cid}@e2e.test`, displayName: `Over ${i}`, displayNameLower: `over ${i}`, role: 'client', accountStatus: 'active', assignedCoachId: coachId, permissions: [], featureFlags: {}, createdBy: 'e2e', createdAt: now, updatedAt: now, passwordHash: 'x' });
    await db.insertOne('coachClients', { _id: `${coachId}__${cid}`, coachId, clientId: cid, status: 'active', createdBy: coachId, createdAt: now, updatedAt: now, subscription: { status: 'active', startAt: now, endAt: now + 30 * 86_400_000, months: 1, frozenFrom: null, frozenUntil: null, updatedAt: now } });
  }
  await db.updateOne('coachPlans', { _id: coachId }, { $set: { activeClientCount: 3 } });
  // Expire the add-on, run the daily cron.
  await db.updateMany('coachCapacityEntitlements', { coachId, status: 'active' }, { $set: { endsAt: Date.now() - 1000 } });
  expect((await runCron(env.baseURL, env.cronSecret)).status).toBe(200);
  expect(await db.findOne<PlanDoc>('coachPlans', { _id: coachId })).toMatchObject({ maxClients: 2, addonClientCapacity: 0, activeClientCount: 3 });
  expect(await db.count('coachClients', { coachId, status: 'active' })).toBe(3);
  expect(await db.count('coachCapacityEntitlements', { coachId, status: 'expired' })).toBe(1);

  await page.goto('/coach/plan');
  await ready(page);
  await expect(page.getByTestId('plan-capacity-usage')).toContainText('3 / 2');
  await expect(page.getByTestId('plan-over-capacity')).toHaveText('Over capacity by 1');
  await expect(page.getByTestId('coach-capacity-banner')).toContainText('over capacity by 1');
  await snap(page, testInfo, 'my-plan-over-capacity', true);

  await page.goto('/coach/clients');
  await ready(page);
  await expect(page.getByTestId('coach-client-limit')).toContainText('Over capacity by 1');
  await page.getByTestId('coach-add-client').click();
  await page.getByTestId('add-choose-create').click();
  const blocked = page.getByTestId('coach-invite-blocked');
  await expect(blocked).toBeVisible();
  await expect(blocked.getByTestId('coach-invite-blocked-cta')).toHaveText('Add client capacity');
  await expect(page.getByTestId('coach-invite-generate')).toHaveCount(0);
  await snap(page, testInfo, 'invite-blocked-over-cap');
  // Every existing client is still on the roster.
  await page.keyboard.press('Escape');
  for (let i = 0; i < 3; i += 1) await expect(page.getByText(`Over ${i}`).first()).toBeVisible();
});

test('E: Super Admin grants custom capacity directly → real entitlement + audit row', async ({ anon, as, db, env }, testInfo) => {
  const { context: c, page } = await anon(); await noHmr(c);
  const { id: coachId, email } = await freshCoach(page, env.password, 'custom.grant', db);
  const { context: sc, page: sp } = await as('super'); await noHmr(sc);
  await sp.goto(`/admin/coaches/${coachId}`);
  await ready(sp);
  await expect(sp.getByTestId('coach-capacity-usage')).toContainText('0 / 2');
  await sp.getByTestId('coach-add-capacity').click();
  await sp.getByTestId('add-capacity-custom').click();
  await sp.getByTestId('add-capacity-clients').fill('5');
  await sp.getByTestId('add-capacity-note').fill('Event partner — cash receipt #42');
  await snap(sp, testInfo, 'custom-grant-form');
  await sp.getByTestId('add-capacity-save').click();
  await expect(sp.getByTestId('coach-capacity-usage')).toContainText('0 / 7');
  await expect(sp.getByTestId('coach-entitlement')).toContainText('Custom client capacity · +5');
  const ent = await db.findOne<EntDoc>('coachCapacityEntitlements', { coachId });
  expect(ent).toMatchObject({ status: 'active', source: 'admin_custom' });
  const audit = await db.findOne<{ metadata: { before: number; after: number; note: string } }>('adminAuditLogs', { action: 'capacity.granted_custom', targetUserId: coachId });
  expect(audit?.metadata).toMatchObject({ before: 2, after: 7, note: 'Event partner — cash receipt #42' });
  await snap(sp, testInfo, 'custom-granted', true);

  // Remove it again through the UI — confirmation copy states the exact change and that clients stay.
  await sp.getByTestId('coach-entitlement-remove').click();
  await expect(sp.getByTestId('confirm-dialog')).toContainText('from 7 to 2. Existing clients will not be removed.');
  await sp.getByTestId('confirm-accept').click();
  await expect(sp.getByTestId('coach-capacity-usage')).toContainText('0 / 2');
  expect((await db.findOne<EntDoc>('coachCapacityEntitlements', { coachId }))?.status).toBe('cancelled');
});

test('F: package price edited while a request is awaiting → the request keeps its snapshot', async ({ anon, as, db, env }, testInfo) => {
  test.setTimeout(150_000);
  const { context: c, page } = await anon(); await noHmr(c);
  const { id: coachId, email } = await freshCoach(page, env.password, 'snapshot.coach', db);
  await requestPackage(page);
  const { context: sc, page: sp } = await as('super'); await noHmr(sc);
  try {
    await sp.goto('/admin/plans?tab=packages');
    await ready(sp);
    const card = sp.getByTestId('package-card').filter({ hasText: '+20 clients' });
    await card.getByTestId('package-edit').click();
    await sp.getByTestId('package-price').fill('249');
    await sp.getByTestId('package-save').click();
    await expect(sp.getByTestId('package-form')).toHaveCount(0);
    await expect(card).toContainText('249 EGP / month');
    await snap(sp, testInfo, 'package-repriced');

    await sp.goto('/admin/plans?tab=requests');
    await ready(sp);
    const row = sp.getByTestId('request-row').filter({ hasText: email });
    await expect(row.first()).toContainText('199 EGP / month');
    await row.first().getByTestId('request-open').click();
    await expect(sp.getByTestId('request-detail-amount')).toHaveText('199 EGP / month');
    await sp.getByTestId('request-detail').getByTestId('request-confirm').click();
    await expect(sp.getByTestId('request-detail')).toHaveCount(0);
    const ent = await db.findOne<EntDoc>('coachCapacityEntitlements', { coachId });
    expect(ent?.snapshot).toMatchObject({ price: 199, additionalClients: 20 });
    expect((await db.findOne<PlanDoc>('coachPlans', { _id: coachId }))?.maxClients).toBe(22);
  } finally {
    await db.updateOne('coachCapacityPackages', { _id: 'e2e-pkg-20' }, { $set: { price: 199 } });
  }
});

test('G: two concurrent invite claims for the final slot → exactly one succeeds', async ({ anon, db, env }, testInfo) => {
  const { context: c, page } = await anon(); await noHmr(c);
  const { id: coachId, email } = await freshCoach(page, env.password, 'lastslot.coach', db);
  // Trial limit 2: one slot used, one left.
  await db.updateOne('coachPlans', { _id: coachId }, { $set: { activeClientCount: 1 } });
  const codes = [`G${Date.now().toString(36).toUpperCase()}A`, `G${Date.now().toString(36).toUpperCase()}B`];
  for (const code of codes) await db.insertOne('signupInvites', { _id: code, coachId, status: 'pending', claimedByUid: null, createdAt: Date.now(), claimedAt: null, expiresAt: null, subStatus: 'trial' });
  const pages = await Promise.all(codes.map(async () => { const a = await anon(); await noHmr(a.context); return a.page; }));
  await Promise.all(pages.map(async (p, i) => {
    await p.goto(`/invite/${codes[i]}`);
    await expect(p.getByTestId('invite-form')).toBeVisible();
    await p.getByTestId('invite-email').fill(uniq(`slot${i}`));
    await p.getByTestId('invite-phone').fill(`+20155500011${i}`);
    await p.getByTestId('invite-password').fill('Invite-Pass-2026!');
    await p.getByTestId('invite-confirm').fill('Invite-Pass-2026!');
  }));
  await Promise.all(pages.map((p) => p.getByTestId('invite-submit').click()));
  const outcomes = await Promise.all(
    pages.map((p) =>
      Promise.race([
        p.getByTestId('assessment-wizard').waitFor({ timeout: 25_000 }).then(() => 'joined' as const),
        p.getByTestId('invite-error').waitFor({ timeout: 25_000 }).then(() => 'refused' as const),
      ]),
    ),
  );
  expect(outcomes.filter((o) => o === 'joined')).toHaveLength(1);
  expect(outcomes.filter((o) => o === 'refused')).toHaveLength(1);
  const loser = pages[outcomes.indexOf('refused')];
  await expect(loser.getByTestId('invite-error')).toContainText("can't take on new clients right now");
  await snap(loser, testInfo, 'loser-refused');
  expect((await db.findOne<PlanDoc>('coachPlans', { _id: coachId }))?.activeClientCount).toBe(2);
  expect(await db.count('coachClients', { coachId, status: 'active' })).toBe(1); // the seeded "used" slot was a counter only
  expect(await db.count('signupInvites', { coachId, status: 'pending' })).toBe(1); // loser's invite stays usable
});
