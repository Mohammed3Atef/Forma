import type { Page, TestInfo } from '@playwright/test';
import { test, expect, ready, shot } from '../fixtures';
import { blur, completeAssessment, refocus } from './_d-helpers';

/**
 * Cross-context freshness: one user changes something, the OTHER user's
 * already-open tab is refocused (hidden → visible + window focus, no reload)
 * and must show it. Time-to-fresh is measured from the refocus; we keep
 * polling up to 75 s so the report has the real number even when the
 * on-focus path fails (the 60 s pollers would eventually catch up).
 */
const FRESH_BUDGET_MS = 10_000;

async function timeToVisible(page: Page, testInfo: TestInfo, label: string, probe: () => Promise<boolean>) {
  let navigations = 0;
  const onNav = (f: import('@playwright/test').Frame) => {
    if (f === page.mainFrame()) navigations++;
  };
  page.on('framenavigated', onNav);
  await blur(page);
  await page.waitForTimeout(300);
  const t0 = Date.now();
  await refocus(page);
  let ms = -1;
  while (Date.now() - t0 < 75_000) {
    if (await probe().catch(() => false)) {
      ms = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(250);
  }
  page.off('framenavigated', onNav);
  testInfo.annotations.push({ type: 'time-to-fresh', description: `${label}: ${ms < 0 ? 'NOT fresh within 75 s' : `${ms} ms`} after refocus (page navigations during wait: ${navigations})` });
  await testInfo.attach(`${label}.json`, { body: JSON.stringify({ ms, navigations }, null, 2), contentType: 'application/json' });
  return { ms, navigations };
}

test("coach edits the client's workout plan → client tab shows it on refocus (no reload)", async ({ as, db }, testInfo) => {
  test.setTimeout(150_000);
  // Coach workout editor reads the client's assessment; the seed stub crashes it (E-D finding) — use a complete one here.
  const prevProfile = await db.findOne<{ assessment: Record<string, unknown> }>('clientProfiles', { _id: 'e2e-client-a' });
  await db.updateOne('clientProfiles', { _id: 'e2e-client-a' }, { $set: { assessment: completeAssessment(prevProfile?.assessment, 'Client Aya') } });
  await db.deleteMany('clientWorkoutPlans', { _id: 'e2e-client-a' });
  await db.insertOne('clientWorkoutPlans', {
    _id: 'e2e-client-a',
    clientId: 'e2e-client-a',
    id: 'plan-e2e-d-fresh',
    name: 'E2E Fresh Plan',
    days: [{ id: 'd1', dayIndex: 0, title: 'Push Day', focus: 'Chest', exerciseIds: ['ex1'], sections: [{ id: 's1', title: 'Main', kind: 'main', exerciseIds: ['ex1'] }] }],
    exercises: { ex1: { id: 'ex1', name: 'Bench Press', targetMuscle: 'Chest', warmupSets: '1', warmupSetCount: 1, workingSets: 3, repRange: '8-10', restSec: 90, notes: { en: '', ar: '' }, videoUrl: null } },
    updatedAt: Date.now(),
  });
  try {
    const client = await as('clientA');
    await client.page.goto('/workout');
    await ready(client.page);
    await expect(client.page.getByRole('heading', { name: 'Push Day' })).toBeVisible({ timeout: 15_000 });
    await shot(client.page, testInfo, 'client-before');

    const coach = await as('coachA');
    await coach.page.goto('/coach/client/e2e-client-a/workout');
    await ready(coach.page);
    await coach.page.getByTestId('builder-day-card').first().click();
    await coach.page.getByTestId('day-title').fill('Pull Day E2E');
    await coach.page.getByTestId('workout-save').click();
    await expect.poll(async () => (await db.findOne<{ days: { title: string }[] }>('clientWorkoutPlans', { _id: 'e2e-client-a' }))?.days?.[0]?.title).toBe('Pull Day E2E');
    await shot(coach.page, testInfo, 'coach-saved');

    const r = await timeToVisible(client.page, testInfo, 'workout-plan', () => client.page.getByRole('heading', { name: 'Pull Day E2E' }).isVisible());
    await shot(client.page, testInfo, 'client-after');
    expect(r.navigations, 'refresh must not be a page reload').toBe(0);
    expect(r.ms, 'fresh on refocus').toBeGreaterThanOrEqual(0);
    expect(r.ms).toBeLessThan(FRESH_BUDGET_MS);
  } finally {
    await db.deleteMany('clientWorkoutPlans', { _id: 'e2e-client-a' });
    if (prevProfile) await db.updateOne('clientProfiles', { _id: 'e2e-client-a' }, { $set: { assessment: prevProfile.assessment } });
  }
});

test('admin suspends a coach → coach tab lands on the suspended screen on next focus', async ({ as, db }, testInfo) => {
  test.setTimeout(150_000);
  const coachId = 'e2e-coach-pro';
  try {
    const coach = await as('coachPro');
    await coach.page.goto('/coach/dashboard');
    await ready(coach.page);

    const admin = await as('super');
    await admin.page.goto(`/admin/coaches/${coachId}`);
    await ready(admin.page);
    await admin.page.getByTestId('coach-suspend').click();
    await admin.page.getByTestId('confirm-accept').click();
    await expect.poll(async () => (await db.findOne<{ accountStatus: string }>('users', { _id: coachId }))?.accountStatus).toBe('suspended');
    await expect(admin.page.getByTestId('coach-reactivate')).toBeVisible();
    await shot(admin.page, testInfo, 'admin-suspended');

    // 1) window focus ALONE (e.g. clicking back into an already-visible window).
    await coach.page.bringToFront();
    await coach.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await coach.page.waitForTimeout(5000);
    const onFocusOnly = await coach.page.getByTestId('account-suspended').isVisible();
    testInfo.annotations.push({ type: 'observation', description: `suspended screen after window focus only (5 s): ${onFocusOnly}` });
    // Meanwhile, does the still-open coach app keep working against the API?
    const stillWorks = await coach.page.evaluate(async () => (await fetch('/api/trpc/coachClients.listMyClientUsers')).status);
    testInfo.annotations.push({ type: 'observation', description: `unauthenticated probe status (sanity): ${stillWorks}` });

    // 2) a real hidden → visible tab switch.
    const r = await timeToVisible(coach.page, testInfo, 'suspension', () => coach.page.getByTestId('account-suspended').isVisible());
    await shot(coach.page, testInfo, 'coach-after');
    expect(r.ms, 'suspended screen on refocus').toBeGreaterThanOrEqual(0);
    expect(r.ms).toBeLessThan(FRESH_BUDGET_MS);
  } finally {
    await db.updateOne('users', { _id: coachId }, { $set: { accountStatus: 'active' } });
    await db.updateOne('coachPlans', { _id: coachId }, { $set: { status: 'active' } });
  }
});

test('coach requests a check-in → client home shows it on refocus', async ({ as, db }, testInfo) => {
  test.setTimeout(150_000);
  await db.deleteMany('checkIns', { clientId: 'e2e-client-a' });
  try {
    const client = await as('clientA');
    await client.page.goto('/');
    await ready(client.page);
    await expect(client.page.getByTestId('client-home')).toBeVisible();
    await expect(client.page.getByTestId('home-checkin')).toHaveCount(0);

    const coach = await as('coachA');
    await coach.page.goto('/coach/client/e2e-client-a/checkins');
    await ready(coach.page);
    await coach.page.getByTestId('checkin-request').click();
    await expect.poll(() => db.count('checkIns', { clientId: 'e2e-client-a', status: 'requested' })).toBe(1);
    await shot(coach.page, testInfo, 'coach-requested');

    const r = await timeToVisible(client.page, testInfo, 'checkin', () => client.page.getByTestId('home-checkin').isVisible());
    await shot(client.page, testInfo, 'client-after');
    expect(r.navigations).toBe(0);
    expect(r.ms, 'check-in card on refocus').toBeGreaterThanOrEqual(0);
    expect(r.ms).toBeLessThan(FRESH_BUDGET_MS);
  } finally {
    await db.deleteMany('checkIns', { clientId: 'e2e-client-a' });
    await db.deleteMany('notifications', { userId: 'e2e-client-a', type: 'checkin_requested' });
  }
});
