import { test, expect, shot } from '../fixtures';
import type { Db } from '../fixtures';
import { appReady, confirmYes, expectToast, fullAssessment, refocus, uniq } from './_b-helpers';

test.setTimeout(120_000);

/**
 * Coach core journeys on `coachPro` (Pro, cap 25 — caps never interfere):
 * invite → anonymous claim → roster refresh without reload; Add Existing
 * (clientFree); full client workspace (workout / nutrition / cardio / notes /
 * check-in / subscription / history); release.
 *
 * Restores seed state in afterAll: clientFree is unassigned again and
 * coachPro's counter reset, so later specs see the seed.
 */

const PRO = 'e2e-coach-pro';
const FREE = 'e2e-client-free';
const INVITED_NAME = 'Invited Ivy';
// Module state is lost when Playwright restarts the worker after a failure,
// so cross-test data is re-derived from the DB instead.
async function invited(db: Db) {
  return db.findOne<{ _id: string; email: string }>('users', { displayName: INVITED_NAME, role: 'client' });
}

test.beforeAll(async ({ db }) => {
  // Setup (see fullAssessment): give clientFree a complete assessment so the
  // plan editors can render. E-B-1 covers the seed-shape crash itself.
  await db.updateOne('clientProfiles', { _id: FREE }, { $set: { assessment: fullAssessment('Client Free') } });
});

test('E-B-1 probe: plan editor renders for a client with a legacy (partial) assessment', async ({ as }, testInfo) => {
  // clientB keeps the seed's minimal legacy-shaped assessment (`basic` only).
  const { page } = await as('coachB');
  await page.goto('/coach/client/e2e-client-b/workout');
  await appReady(page);
  await expect(page.getByTestId('builder-plan')).toBeVisible({ timeout: 20_000 }).finally(() => shot(page, testInfo, '01-workout-editor-legacy-assessment'));
});

test('invite → anonymous claim → coach roster updates without reload', async ({ as, anon, db }, testInfo) => {
  test.setTimeout(150_000);
  const { page } = await as('coachPro');
  await page.goto('/coach/dashboard');
  await appReady(page, 'coach-sidebar');
  await shot(page, testInfo, '01-dashboard');

  await page.getByTestId('sidebar-coachClients').click();
  await expect(page).toHaveURL(/\/coach\/clients$/);
  await expect(page.getByTestId('coach-clients')).toBeVisible();

  const email = `${uniq('invited')}@e2e.test`.toLowerCase();
  await page.getByTestId('coach-add-client').click();
  await page.getByTestId('add-choose-create').click();
  await page.getByTestId('coach-invite-name').fill(INVITED_NAME);
  await page.getByTestId('coach-invite-email').fill(email);
  await page.getByTestId('coach-invite-generate').click();
  const row = page.getByTestId('coach-invite-row').first();
  await expect(row).toBeVisible();
  const code = await row.getAttribute('data-code');
  expect(code).toBeTruthy();
  await shot(page, testInfo, '02-invite-generated');

  const inv = await db.findOne<{ _id: string; coachId: string; email?: string; status: string }>('signupInvites', { _id: code! });
  expect(inv?.coachId).toBe(PRO);
  expect(inv?.email).toBe(email);
  expect(inv?.status).toBe('pending');

  // Anonymous visitor claims the link.
  const { page: anonPage } = await anon();
  await anonPage.goto(`/invite/${code}`);
  await expect(anonPage.getByTestId('invite-form')).toBeVisible();
  await expect(anonPage.getByTestId('invite-coach-name')).toContainText('Coach Pro');
  await expect(anonPage.getByTestId('invite-email')).toHaveValue(email);
  await anonPage.getByTestId('invite-phone').fill('+201555000111');
  await anonPage.getByTestId('invite-password').fill('Invite-Pass-2026!');
  await anonPage.getByTestId('invite-confirm').fill('Invite-Pass-2026!');
  await shot(anonPage, testInfo, '03-claim-form');
  await anonPage.getByTestId('invite-submit').click();
  // Lands in the client app (new client → mandatory assessment wizard).
  await expect(anonPage.getByTestId('assessment-wizard')).toBeVisible({ timeout: 20_000 });
  await expect(anonPage).not.toHaveURL(/\/invite\//);
  await shot(anonPage, testInfo, '04-client-landed');

  const newUser = await db.findOne<{ _id: string; assignedCoachId?: string; role: string }>('users', { email });
  expect(newUser?.role).toBe('client');
  expect(newUser?.assignedCoachId).toBe(PRO);
  expect((await db.findOne<{ status: string }>('signupInvites', { _id: code! }))?.status).toBe('claimed');
  expect(await db.count('coachClients', { coachId: PRO, clientId: newUser!._id, status: 'active' })).toBe(1);

  // Coach context: close the sheet and return to the tab — no reload.
  await page.keyboard.press('Escape');
  const t0 = Date.now();
  const table = page.getByTestId('coach-desktop-clients');
  // (a) Window focus only (side-by-side windows, the case queryClient.ts says
  //     is covered). Recorded: React Query v5 listens for visibilitychange only.
  await page.waitForTimeout(61_000); // let the 60 s staleTime lapse so a focus refetch is allowed
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const seenOnWindowFocus = await table.getByText(email).waitFor({ timeout: 4_000 }).then(() => true).catch(() => false);
  testInfo.annotations.push({ type: 'window-focus-refetch', description: String(seenOnWindowFocus) });
  // (b) Tab becomes visible again (real tab switch → bubbling visibilitychange).
  let seenAfterMs = -1;
  await expect(async () => {
    await refocus(page);
    await expect(table.getByText(email)).toBeVisible({ timeout: 2_000 });
    seenAfterMs = Date.now() - t0;
  }).toPass({ timeout: 15_000, intervals: [1_000, 2_000] });
  testInfo.annotations.push({ type: 'roster-refresh-ms', description: String(seenAfterMs) });
  await shot(page, testInfo, '05-coach-roster-has-invited');
  await expect(page.getByTestId('coach-client-usage')).toContainText('1 / 25 clients used');
});

test('Add Existing: search clientFree by email → Assign to me', async ({ as, db, env }, testInfo) => {
  const { page } = await as('coachPro');
  await page.goto('/coach/clients');
  await appReady(page, 'coach-add-client');
  await page.getByTestId('coach-add-client').click();
  await page.getByTestId('add-choose-existing').click();
  await page.getByTestId('existing-search').fill(env.accounts.clientFree.email);
  await page.getByTestId('existing-search-btn').click();
  const detail = page.getByTestId('existing-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Client Free');
  await expect(page.getByTestId('existing-assign-panel')).toBeVisible();
  await expect(page.getByTestId('existing-transfer-panel')).toHaveCount(0);
  // Subscription: custom 1 month at 900.
  const sub = page.getByTestId('existing-assign-sub');
  await expect(sub).toHaveValue('custom');
  await page.getByTestId('plan-custom').locator('input').nth(1).fill('900');
  await shot(page, testInfo, '01-existing-detail');
  await page.getByTestId('existing-assign').click();
  await expectToast(page, 'Add client');
  await expect(page.getByTestId('coach-desktop-clients').getByText(env.accounts.clientFree.email)).toBeVisible();
  await shot(page, testInfo, '02-roster-has-free');

  const u = await db.findOne<{ assignedCoachId?: string }>('users', { _id: FREE });
  expect(u?.assignedCoachId).toBe(PRO);
  const rels = await db.find<{ status: string; subscription?: { status: string; price?: number; months?: number } }>('coachClients', { coachId: PRO, clientId: FREE, status: 'active' });
  expect(rels).toHaveLength(1);
  expect(rels[0].subscription?.status).toBe('active');
  expect(rels[0].subscription?.price).toBe(900);
  const activeCount = await db.count('coachClients', { coachId: PRO, status: 'active' });
  expect(activeCount).toBe(2);
  expect((await db.findOne<{ activeClientCount: number }>('coachPlans', { _id: PRO }))?.activeClientCount).toBe(activeCount);
  await expect(page.getByTestId('coach-client-usage')).toContainText('2 / 25 clients used');
});

test('workspace: workout plan built in PlanBuilder saves and survives reload', async ({ as, db }, testInfo) => {
  const { page } = await as('coachPro');
  await page.goto(`/coach/client/${FREE}/workout`);
  await appReady(page, 'coach-workout-editor');
  await expect(page.getByTestId('builder-plan')).toBeVisible();
  const planName = uniq('Plan');
  await page.getByTestId('workout-plan-name').fill(planName);
  await page.getByTestId('builder-add-day').click();
  await page.getByTestId('day-title').fill('Push Day');
  await page.getByTestId('builder-add-section').click();
  await page.getByTestId('section-title').fill('Main');
  await page.getByTestId('builder-add-exercise').click();
  await page.getByTestId('picker-quick-create').click();
  await page.getByTestId('ex-name').fill('E2E Bench Press');
  await page.getByTestId('ex-working-sets').fill('4');
  await page.getByTestId('ex-reps').fill('6-8');
  await page.getByTestId('ex-save').click();
  await expect(page.getByTestId('builder-section')).toContainText('E2E Bench Press');
  // Picker's doc comment says quick-create "adds+closes immediately"; record what happens (E-B-3).
  const pickerStillOpen = await page.getByTestId('exercise-picker').isVisible();
  testInfo.annotations.push({ type: 'quick-create-picker-still-open', description: String(pickerStillOpen) });
  if (pickerStillOpen) {
    await shot(page, testInfo, '00-picker-still-open-after-quick-create');
    await page.getByTestId('sheet-close').last().click();
    await expect(page.getByTestId('exercise-picker')).toHaveCount(0);
  }
  await expect(page.getByTestId('builder-section')).toContainText('4 × 6-8');
  await expect(page.getByTestId('workout-unsaved')).toBeVisible();
  await shot(page, testInfo, '01-workout-built');
  await page.getByTestId('workout-save').click();
  await expect(page.getByTestId('workout-saved')).toBeVisible();

  const doc = await db.findOne<{ name: string; days: { title: string; exerciseIds: string[] }[]; exercises: Record<string, { name: string; workingSets: number; repRange: string }> }>('clientWorkoutPlans', { _id: FREE });
  expect(doc?.name).toBe(planName);
  expect(doc?.days.map((d) => d.title)).toEqual(['Push Day']);
  const exs = Object.values(doc?.exercises ?? {});
  expect(exs.map((e) => [e.name, e.workingSets, e.repRange])).toEqual([['E2E Bench Press', 4, '6-8']]);

  await page.reload();
  await appReady(page, 'builder-plan');
  await expect(page.getByTestId('workout-plan-name')).toHaveValue(planName);
  await expect(page.getByTestId('builder-day-card')).toHaveCount(1);
  await expect(page.getByTestId('builder-day-card')).toContainText('Push Day');
  await expect(page.getByTestId('builder-day-card')).toContainText('1 exercise');
  await expect(page.getByTestId('workout-unsaved')).toHaveCount(0);
  await shot(page, testInfo, '02-workout-after-reload');
});

test('workspace: nutrition plan saves and survives reload', async ({ as, db }, testInfo) => {
  const { page } = await as('coachPro');
  await page.goto(`/coach/client/${FREE}/nutrition`);
  await appReady(page, 'coach-nutrition-editor');
  await expect(page.getByTestId('coach-nutrition-editor')).toBeVisible();
  const name = uniq('Meals');
  await page.getByTestId('nutrition-plan-name').fill(name);
  await page.getByTestId('nutrition-target-calories').fill('2100');
  await page.getByTestId('nutrition-add-meal').click();
  await page.getByTestId('nutrition-add-food').click();
  await page.getByTestId('food-name').fill('E2E Oats');
  await page.getByTestId('food-quantity').fill('80 g');
  await page.getByTestId('food-calories').fill('300');
  await page.getByTestId('food-protein').fill('10');
  await page.getByTestId('food-save').click();
  await expect(page.getByText('E2E Oats').first()).toBeVisible();
  await shot(page, testInfo, '01-nutrition-built');
  await page.getByTestId('nutrition-save').click();
  await expect(page.getByTestId('nutrition-saved')).toBeVisible();
  const doc = await db.findOne<{ name: string; targets: { calories: number }; meals: { items: { name: { en: string } }[] }[] }>('clientNutritionPlans', { _id: FREE });
  expect(doc?.name).toBe(name);
  expect(doc?.targets?.calories).toBe(2100);
  expect(doc?.meals.flatMap((m) => m.items.map((i) => i.name.en))).toContain('E2E Oats');

  await page.reload();
  await appReady(page, 'nutrition-plan-name');
  await expect(page.getByTestId('nutrition-plan-name')).toHaveValue(name);
  await expect(page.getByTestId('nutrition-target-calories')).toHaveValue('2100');
  await expect(page.getByText('E2E Oats').first()).toBeVisible();
  await expect(page.getByTestId('nutrition-unsaved')).toHaveCount(0);
  await shot(page, testInfo, '02-nutrition-after-reload');
});

test('workspace: cardio plan saves and survives reload', async ({ as, db }, testInfo) => {
  const { page } = await as('coachPro');
  await page.goto(`/coach/client/${FREE}/cardio`);
  await appReady(page, 'coach-cardio-editor');
  await expect(page.getByTestId('coach-cardio-editor')).toBeVisible();
  const name = uniq('Cardio');
  await page.getByTestId('cardio-plan-name').fill(name);
  await page.getByTestId('cardio-add-session').first().click();
  await page.getByTestId('cardio-type-options').locator('button').first().click();
  await page.getByTestId('sess-duration').fill('35');
  await page.getByTestId('sess-frequency').fill('3x/week');
  await page.getByTestId('sess-save').click();
  await expect(page.getByText('3x/week').first()).toBeVisible();
  await page.getByTestId('cardio-save').click();
  await expect(page.getByTestId('cardio-saved')).toBeVisible();
  await shot(page, testInfo, '01-cardio-saved');
  const doc = await db.findOne<{ name: string; sessions: { durationMin: number; frequency: string }[] }>('clientCardioPlans', { _id: FREE });
  expect(doc?.name).toBe(name);
  expect(doc?.sessions.map((s) => [s.durationMin, s.frequency])).toEqual([[35, '3x/week']]);

  await page.reload();
  await appReady(page, 'cardio-plan-name');
  await expect(page.getByTestId('cardio-plan-name')).toHaveValue(name);
  await expect(page.getByText('3x/week').first()).toBeVisible();
  await expect(page.getByTestId('cardio-unsaved')).toHaveCount(0);
  await shot(page, testInfo, '02-cardio-after-reload');
});

test('workspace: note added is visible after reload', async ({ as, db }, testInfo) => {
  const { page } = await as('coachPro');
  await page.goto(`/coach/client/${FREE}/notes`);
  await appReady(page);
  const body = uniq('Note: watch left knee');
  await page.getByRole('button', { name: 'Add note' }).first().click();
  const sheet = page.getByTestId('sheet');
  await sheet.getByPlaceholder('Write a note for this client…').fill(body);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Saved');
  await expect(page.getByText(body)).toBeVisible();
  await page.reload();
  await appReady(page);
  await expect(page.getByText(body)).toBeVisible();
  await shot(page, testInfo, '01-note-after-reload');
  expect(await db.count('coachNotes', { body })).toBe(1);
});

test('workspace: request a check-in → client sees it', async ({ as, db }, testInfo) => {
  const { page } = await as('coachPro');
  await page.goto(`/coach/client/${FREE}/checkins`);
  await appReady(page, 'checkin-request');
  const btn = page.getByTestId('checkin-request');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expectToast(page, 'Request Weekly Check-In');
  await expect(btn).toBeDisabled();
  await expect(page.getByTestId('checkin-row')).toHaveCount(1);
  await shot(page, testInfo, '01-coach-requested');
  expect(await db.count('checkIns', { clientId: FREE, status: 'requested' })).toBe(1);

  const { page: client } = await as('clientFree');
  await client.goto('/');
  await appReady(client, 'home-checkin');
  await shot(client, testInfo, '02-client-sees-checkin');
});

test('workspace: subscription extend / freeze / unfreeze update without reload', async ({ as, db }, testInfo) => {
  const { page } = await as('coachPro');
  await page.goto(`/coach/client/${FREE}/subscription`);
  await appReady(page, 'sub-status');
  const status = page.getByTestId('sub-status');
  await expect(status).toHaveText('Active');
  const relBefore = await db.findOne<{ subscription: { endAt: number } }>('coachClients', { coachId: PRO, clientId: FREE, status: 'active' });
  const renews = page.getByTestId('coach-subscription').locator('p.font-mono.font-medium').first();
  const renewBefore = await renews.textContent();

  // Extend 30 days — confirm dialog.
  await page.getByTestId('sub-extend').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('30');
  await confirmYes(page);
  await expectToast(page, 'Extend');
  await expect(renews).not.toHaveText(renewBefore ?? '');
  const relExt = await db.findOne<{ subscription: { endAt: number } }>('coachClients', { coachId: PRO, clientId: FREE, status: 'active' });
  expect(relExt!.subscription.endAt - relBefore!.subscription.endAt).toBe(30 * 86_400_000);
  await shot(page, testInfo, '01-extended');

  // Freeze from today until +7 days.
  await page.getByTestId('sub-freeze').click();
  const until = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.getByTestId('freeze-until').fill(until);
  await page.getByTestId('freeze-save').click();
  await expectToast(page, 'Freeze');
  await expect(status).toHaveText('Frozen');
  await expect(page.getByTestId('sub-unfreeze')).toBeVisible();
  await shot(page, testInfo, '02-frozen');
  expect((await db.findOne<{ subscription: { status: string } }>('coachClients', { coachId: PRO, clientId: FREE, status: 'active' }))?.subscription.status).toBe('frozen');

  // Unfreeze — confirm dialog.
  await page.getByTestId('sub-unfreeze').click();
  await confirmYes(page);
  await expect(status).toHaveText('Active');
  await expect(page.getByTestId('sub-freeze')).toBeVisible();
  await shot(page, testInfo, '03-unfrozen');
  expect((await db.findOne<{ subscription: { status: string } }>('coachClients', { coachId: PRO, clientId: FREE, status: 'active' }))?.subscription.status).toBe('active');
});

test('workspace: history tab renders the coaching timeline', async ({ as }, testInfo) => {
  const { page } = await as('coachPro');
  await page.goto(`/coach/client/${FREE}/history`);
  await appReady(page);
  await expect(page.getByText('Coaching history')).toBeVisible();
  await expect(page.getByText('Coach Pro').first()).toBeVisible();
  await shot(page, testInfo, '01-history');
});

test('release the invited client → roster drops it, counter decremented', async ({ as, db }, testInfo) => {
  const inv = await invited(db);
  test.skip(!inv, 'depends on the invite journey');
  const state = { invitedId: inv!._id, invitedEmail: inv!.email };
  const { page } = await as('coachPro');
  await page.goto(`/coach/client/${state.invitedId}`);
  await appReady(page, 'coach-manage');
  await page.getByTestId('coach-manage').click();
  await page.getByTestId('coach-release-client').click();
  await expect(page.getByText('Release this client?')).toBeVisible();
  await shot(page, testInfo, '01-release-confirm');
  await page.getByTestId('release-confirm').click();
  await expect(page).toHaveURL(/\/coach(\/dashboard)?$/);
  await page.getByTestId('sidebar-coachClients').click();
  await expect(page.getByTestId('coach-desktop-clients').getByText(state.invitedEmail!)).toHaveCount(0);
  await expect(page.getByTestId('coach-desktop-clients').getByText('client.free@e2e.test')).toBeVisible();
  await expect(page.getByTestId('coach-client-usage')).toContainText('1 / 25 clients used');
  await shot(page, testInfo, '02-roster-after-release');

  expect(await db.count('coachClients', { coachId: PRO, clientId: state.invitedId, status: 'active' })).toBe(0);
  const ended = await db.findOne<{ endReason: string }>('coachClients', { coachId: PRO, clientId: state.invitedId, status: 'ended' });
  expect(ended?.endReason).toBe('released');
  expect((await db.findOne<{ assignedCoachId?: string | null }>('users', { _id: state.invitedId }))?.assignedCoachId ?? null).toBeNull();
  expect((await db.findOne<{ activeClientCount: number }>('coachPlans', { _id: PRO }))?.activeClientCount).toBe(1);
});

test('restore seed state (clientFree unassigned, coachPro empty)', async ({ db }) => {
  // A test, not afterAll: Playwright runs afterAll on every worker restart
  // (after any failure), which would tear down state mid-file.
  const inv = await invited(db);
  await db.updateMany('coachClients', { coachId: PRO, status: 'active' }, { $set: { status: 'ended', endReason: 'released', endedAt: Date.now() } });
  await db.updateOne('users', { _id: FREE }, { $unset: { assignedCoachId: '' } });
  if (inv) await db.updateOne('users', { _id: inv._id }, { $unset: { assignedCoachId: '' } });
  await db.updateOne('coachPlans', { _id: PRO }, { $set: { activeClientCount: 0 } });
  expect(await db.count('coachClients', { coachId: PRO, status: 'active' })).toBe(0);
});
