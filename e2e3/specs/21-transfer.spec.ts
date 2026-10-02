import { test, expect, shot } from '../fixtures';
import type { Db, E2EEnv } from '../fixtures';
import type { Page } from '@playwright/test';
import { appReady, confirmYes, expectToast, uniq } from './_b-helpers';

/**
 * Client transfer between coaches: coachB requests clientA (owned by coachA)
 * from Add Existing → coachA approves from the Clients screen. Plus the
 * failure path (destination at its client cap) and a final seed restore.
 */

test.setTimeout(120_000);

const A = 'e2e-coach-a';
const B = 'e2e-coach-b';
const CA = 'e2e-client-a';
const SEED_REL = `${A}__${CA}`;

interface Rel { _id: string; coachId: string; status: string; endReason?: string }
interface Req { _id: string; status: string; reason: string; toCoachId: string; fromCoachId: string }

/** Put clientA back exactly as seeded: active with coachA, counters 1/1, no requests. */
async function restoreClientA(db: Db) {
  await db.deleteMany('coachClients', { clientId: CA, _id: { $ne: SEED_REL } });
  await db.updateOne('coachClients', { _id: SEED_REL }, { $set: { status: 'active', coachId: A, updatedAt: Date.now() }, $unset: { endedAt: '', endedBy: '', endReason: '', mode: '' } });
  await db.updateOne('users', { _id: CA }, { $set: { assignedCoachId: A } });
  await db.updateOne('coachPlans', { _id: A }, { $set: { activeClientCount: 1 } });
  await db.updateOne('coachPlans', { _id: B }, { $set: { activeClientCount: 1 } });
  await db.deleteMany('transferRequests', { clientId: CA });
}

/** coachB: Add Existing → search clientA → owned-by-other panel → request transfer. */
async function requestTransfer(page: Page, env: E2EEnv, reason: string, testInfo: Parameters<typeof shot>[1], prefix: string) {
  await page.goto('/coach/clients');
  await appReady(page, 'coach-add-client');
  await page.getByTestId('coach-add-client').click();
  await page.getByTestId('add-choose-existing').click();
  await page.getByTestId('existing-search').fill(env.accounts.clientA.email);
  await page.getByTestId('existing-search-btn').click();
  await expect(page.getByTestId('existing-detail')).toBeVisible({ timeout: 20_000 });
  const panel = page.getByTestId('existing-transfer-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Currently coached by Coach Amira');
  await expect(page.getByTestId('existing-assign-panel')).toHaveCount(0);
  await expect(page.getByTestId('existing-assign')).toHaveCount(0);
  await expect(page.getByTestId('existing-request-transfer')).toBeDisabled(); // reason required
  await page.getByTestId('existing-transfer-reason').fill(reason);
  await shot(page, testInfo, `${prefix}-coachB-owned-by-other`);
  await page.getByTestId('existing-request-transfer').click();
  await expectToast(page, 'Transfer requested');
  await expect(page.getByTestId('existing-transfer-cancel')).toBeVisible();
  await shot(page, testInfo, `${prefix}-coachB-requested`);
}

/** coachA: Clients → incoming request → Approve & release → confirm. */
async function approveIncoming(page: Page, reason: string) {
  await page.goto('/coach/clients');
  await appReady(page, 'coach-add-client');
  const row = page.getByTestId('incoming-transfer-row').filter({ hasText: 'Client Aya' });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText('Coach Basem wants to coach this client');
  await expect(row).toContainText(reason);
  await row.getByTestId('incoming-transfer-approve').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Client Aya');
  await confirmYes(page);
}

test('transfer: coachB requests clientA → coachA approves → client moves', async ({ as, db, env }, testInfo) => {
  await restoreClientA(db);
  const reason = uniq('Client asked to train with me');

  const { page: b } = await as('coachB');
  await requestTransfer(b, env, reason, testInfo, '01');
  const req = await db.findOne<Req>('transferRequests', { clientId: CA, toCoachId: B });
  expect(req?.status).toBe('pending');
  expect(req?.fromCoachId).toBe(A);
  expect(req?.reason).toBe(reason);

  const { page: a } = await as('coachA');
  await approveIncoming(a, reason);
  await shot(a, testInfo, '03-coachA-after-approve');
  // Success: toast, NO error dialog, clientA gone from coachA's roster without reload.
  await expectToast(a, 'Approved — the client is now released.');
  await expect(a.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(a.getByTestId('incoming-transfer-row')).toHaveCount(0);
  await expect(a.getByTestId('coach-desktop-clients').getByText(env.accounts.clientA.email)).toHaveCount(0);
  await expect(a.getByTestId('coach-client-usage')).toContainText('0 / 2 clients used');
  await shot(a, testInfo, '04-coachA-roster');

  // coachB sees clientA (fresh navigation to the roster).
  await b.goto('/coach/clients');
  await appReady(b, 'coach-desktop-clients');
  await expect(b.getByTestId('coach-desktop-clients').getByText(env.accounts.clientA.email)).toBeVisible({ timeout: 20_000 });
  await expect(b.getByTestId('coach-client-usage')).toContainText('2 / 2 clients used');
  await shot(b, testInfo, '05-coachB-roster');

  // DB: exactly one active relationship (coachB), old one ended/transferred.
  const active = await db.find<Rel>('coachClients', { clientId: CA, status: 'active' });
  expect(active.map((r) => r.coachId)).toEqual([B]);
  const old = await db.findOne<Rel>('coachClients', { _id: SEED_REL });
  expect(old?.status).toBe('ended');
  expect(old?.endReason).toBe('transferred');
  expect((await db.findOne<{ assignedCoachId?: string }>('users', { _id: CA }))?.assignedCoachId).toBe(B);
  expect((await db.findOne<{ activeClientCount: number }>('coachPlans', { _id: A }))?.activeClientCount).toBe(0);
  expect((await db.findOne<{ activeClientCount: number }>('coachPlans', { _id: B }))?.activeClientCount).toBe(2);
  expect((await db.findOne<Req>('transferRequests', { _id: req!._id }))?.status).toBe('accepted');
});

test('transfer failure: destination at cap → error shown, nothing moves, request back to pending', async ({ as, db, env }, testInfo) => {
  await restoreClientA(db);
  const reason = uniq('Second attempt');
  const { page: b } = await as('coachB');
  await requestTransfer(b, env, reason, testInfo, '01');
  const req = await db.findOne<Req>('transferRequests', { clientId: CA, toCoachId: B, status: 'pending' });
  expect(req).toBeTruthy();

  // Destination (coachB, cap 2) becomes full after the request was made.
  await db.updateOne('coachPlans', { _id: B }, { $set: { activeClientCount: 2 } });

  const { page: a } = await as('coachA');
  await approveIncoming(a, reason);
  // Error is surfaced (alert dialog), no success toast.
  const alert = a.getByTestId('confirm-dialog');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/Destination coach/i);
  await shot(a, testInfo, '02-coachA-error');
  await expect(a.getByTestId('toast').filter({ hasText: 'Approved' })).toHaveCount(0);
  await alert.getByTestId('confirm-accept').click();
  // Request still offered (pending), client still on coachA's roster.
  await expect(a.getByTestId('incoming-transfer-row').filter({ hasText: 'Client Aya' })).toBeVisible();
  await expect(a.getByTestId('coach-desktop-clients').getByText(env.accounts.clientA.email)).toBeVisible();
  await shot(a, testInfo, '03-coachA-unchanged');

  const active = await db.find<Rel>('coachClients', { clientId: CA, status: 'active' });
  expect(active.map((r) => r._id)).toEqual([SEED_REL]);
  expect((await db.findOne<{ assignedCoachId?: string }>('users', { _id: CA }))?.assignedCoachId).toBe(A);
  expect((await db.findOne<{ activeClientCount: number }>('coachPlans', { _id: A }))?.activeClientCount).toBe(1);
  expect((await db.findOne<{ activeClientCount: number }>('coachPlans', { _id: B }))?.activeClientCount).toBe(2);
  expect((await db.findOne<Req>('transferRequests', { _id: req!._id }))?.status).toBe('pending');
});

test('restore seed state (clientA with coachA)', async ({ db }) => {
  await restoreClientA(db);
  expect(await db.count('coachClients', { clientId: CA, status: 'active', coachId: A })).toBe(1);
  expect(await db.count('coachClients', { clientId: CA })).toBe(1);
});
