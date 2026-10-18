import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany } from './_c-helpers';
import { confirmYes } from './_b-helpers';

/**
 * B3.4 — the coach's client workspace (blueprint §6.3, owner decisions 2026-10-18): one header,
 * Summary · Plan · Progress · Profile; a previous coach's check-ins never reach the new coach;
 * the incoming coach requests the hand-over week as a record of their own; release with its
 * consequences; old URLs keep working. Rules: docs/product-audit/B3_IMPLEMENTATION_LOG.md §B3.4.
 *
 * Fixtures on coachPro (`e2e-ws-` ids, removed in afterAll): an active client with a full week
 * of data, trial / paused / expired / frozen-account / incomplete-assessment clients, a client
 * transferred from coachB mid-week (coachB's check-ins must stay coachB's), and one to release.
 */
const COACH = 'e2e-coach-pro';
const OTHER = 'e2e-coach-b';
const PFX = 'e2e-ws-';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });

const dayKey = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const plusDays = (k: string, n: number) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekStartOf = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return plusDays(k, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() - 6 + 7) % 7));
};

const C = {
  active: { id: `${PFX}active`, name: 'Nadia Hassan' },
  trial: { id: `${PFX}trial`, name: 'Rana Mostafa' },
  paused: { id: `${PFX}paused`, name: 'Fady George' },
  expired: { id: `${PFX}expired`, name: 'Laila Ibrahim' },
  frozen: { id: `${PFX}frozen`, name: 'Hany Lotfy' },
  incomplete: { id: `${PFX}incomplete`, name: 'Omar Fathy' },
  moved: { id: `${PFX}moved`, name: 'Hana Youssef' },
  release: { id: `${PFX}release`, name: 'Rami Saleh' },
};
/** Active client's finished workouts (days ago) and plan day trained. */
const WORKOUTS: [number, string][] = [[0, 'a'], [1, 'b'], [3, 'c'], [5, 'a'], [9, 'b'], [15, 'c'], [20, 'a'], [27, 'b'], [40, 'c']];
const WEIGHTS: [number, number][] = [[25, 84.0], [10, 83.2], [1, 82.6]];

async function insertWorkspace() {
  const now = Date.now();
  const today = dayKey(now);
  const w0 = weekStartOf(today);
  const users: object[] = [];
  const rels: object[] = [];
  const profiles: object[] = [];
  for (const [i, c] of Object.values(C).entries()) {
    users.push({
      _id: c.id, email: `${c.id}@e2e.test`, emailLower: `${c.id}@e2e.test`, displayName: c.name, displayNameLower: c.name.toLowerCase(), role: 'client',
      accountStatus: c === C.frozen ? 'suspended' : 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: `+2012300${String(i).padStart(5, '0')}`,
      passwordHash: 'not-a-login', createdBy: 'e2e-ws', createdAt: now - 60 * DAY, updatedAt: now,
    });
    const sub =
      c === C.trial ? { status: 'trial', startAt: now - 2 * DAY, endAt: now + 12 * DAY - HOUR }
      : c === C.paused ? { status: 'frozen', startAt: now - 10 * DAY, endAt: now + 27 * DAY, frozenFrom: now - 2 * DAY, frozenUntil: now + 5 * DAY, freezeCredit: 7 * DAY }
      : c === C.expired ? { status: 'active', startAt: now - 35 * DAY, endAt: now - 5 * DAY }
      : { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY - HOUR };
    rels.push({
      _id: `${COACH}__${c.id}`, coachId: COACH, clientId: c.id, status: 'active', createdBy: COACH, createdAt: now - (c === C.moved ? 3 : 30) * DAY, updatedAt: now,
      subscription: { months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now, ...sub },
    });
    profiles.push({
      _id: c.id, clientId: c.id, updatedAt: now,
      assessment: c === C.incomplete ? { status: 'in_progress', completed: false, basic: { fullName: c.name } } : { status: 'reviewed', completed: true, submittedAt: now - 25 * DAY, reviewedAt: now - 24 * DAY, basic: { fullName: c.name } },
    });
  }
  // The transferred client's earlier relationship with coachB (timeline facts only for coachPro).
  rels.push({ _id: `${OTHER}__${C.moved.id}`, coachId: OTHER, clientId: C.moved.id, status: 'ended', endReason: 'transferred', mode: 'keep_plans', createdBy: OTHER, createdAt: now - 40 * DAY, endedAt: now - 3 * DAY, updatedAt: now - 3 * DAY, subscription: { status: 'active', startAt: now - 40 * DAY, endAt: now + 10 * DAY, price: 1234, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } });
  await insertMany('users', users);
  await insertMany('coachClients', rels);
  await insertMany('clientProfiles', profiles);

  const a = C.active.id;
  await insertMany('clientWorkoutPlans', [{ _id: a, clientId: a, id: `wp-${a}`, name: 'Upper / lower / full', days: [{ id: 'a', dayIndex: 0, title: 'Upper', focus: '', exerciseIds: [], sections: [] }, { id: 'b', dayIndex: 1, title: 'Lower', focus: '', exerciseIds: [], sections: [] }, { id: 'c', dayIndex: 2, title: 'Full body', focus: '', exerciseIds: [], sections: [] }], exercises: {}, updatedAt: now - 6 * DAY }]);
  await insertMany('clientNutritionPlans', [{ _id: a, clientId: a, id: `np-${a}`, name: 'Cut', targets: { calories: 2100, protein: 160, carbs: 200, fats: 70 }, meals: [{ id: 'm1', name: { en: 'Breakfast' }, items: [] }, { id: 'm2', name: { en: 'Lunch' }, items: [] }, { id: 'm3', name: { en: 'Dinner' }, items: [] }], supplements: [], waterTargetMl: 3000, beverageNotes: [], generalNotes: [], updatedAt: now - 6 * DAY }]);
  const logs: object[] = WORKOUTS.map(([ago, dayId]) => {
    const date = dayKey(now - ago * DAY);
    return { _id: `${a}__workoutLogs__${date}`, clientId: a, collection: 'workoutLogs', recordId: date, data: { id: date, date, dayId, startedAt: now - ago * DAY, endedAt: now - ago * DAY + HOUR, durationSec: 3600, exercises: [], finished: true }, updatedAt: now, syncedAt: now, rev: 1 };
  });
  for (const [ago, kg] of WEIGHTS) {
    const date = dayKey(now - ago * DAY);
    logs.push({ _id: `${a}__weightLogs__${date}`, clientId: a, collection: 'weightLogs', recordId: date, data: { id: date, date, weightKg: kg }, updatedAt: now, syncedAt: now, rev: 1 });
  }
  logs.push({ _id: `${a}__nutritionLogs__${today}`, clientId: a, collection: 'nutritionLogs', recordId: today, data: { id: today, date: today, mealsEaten: { m1: true, m2: true }, supplementsTaken: {}, customFoods: [], itemOverrides: {} }, updatedAt: now, syncedAt: now, rev: 1 });
  logs.push({ _id: `${a}__cardioLogs__c1`, clientId: a, collection: 'cardioLogs', recordId: 'c1', data: { id: 'c1', date: today, type: 'walk', durationSec: 1800, distanceKm: null, caloriesBurned: null, steps: null }, updatedAt: now, syncedAt: now, rev: 1 });
  await insertMany('syncRecords', logs);

  await insertMany('checkIns', [
    // This coach's: last week reviewed, this week submitted → reviewed in place from Summary.
    { _id: `${a}__${plusDays(w0, -7)}`, clientId: a, coachId: COACH, weekStart: plusDays(w0, -7), weekEnd: plusDays(w0, -1), status: 'reviewed', submittedAt: now - 8 * DAY, reviewedAt: now - 7 * DAY, currentWeight: 83.4, coachFeedback: 'Good start.', progressPhotos: {}, createdAt: now - 9 * DAY, updatedAt: now - 7 * DAY },
    { _id: `${a}__${w0}`, clientId: a, coachId: COACH, weekStart: w0, weekEnd: plusDays(w0, 6), status: 'submitted', submittedAt: now - 3 * HOUR, currentWeight: 82.6, notes: 'Knees feel great this week.', progressPhotos: {}, createdAt: now - DAY, updatedAt: now - 3 * HOUR },
    // The transferred client: coachB's records — never coachPro's to see or touch.
    { _id: `${C.moved.id}__${plusDays(w0, -7)}`, clientId: C.moved.id, coachId: OTHER, weekStart: plusDays(w0, -7), weekEnd: plusDays(w0, -1), status: 'submitted', submittedAt: now - 6 * DAY, currentWeight: 61, notes: 'For coach B only', progressPhotos: {}, createdAt: now - 8 * DAY, updatedAt: now - 6 * DAY },
    { _id: `${C.moved.id}__${w0}`, clientId: C.moved.id, coachId: OTHER, weekStart: w0, weekEnd: plusDays(w0, 6), status: 'requested', progressPhotos: {}, createdAt: now - 4 * DAY, updatedAt: now - 4 * DAY },
  ]);
  await insertMany('coachNotes', [
    { _id: `${PFX}note-1`, clientId: a, authorId: COACH, authorRole: 'coach', body: 'Keep the deficit; add one walk.', kind: 'note', visibility: 'private', createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY },
    { _id: `${PFX}note-b`, clientId: C.moved.id, authorId: OTHER, authorRole: 'coach', body: 'Coach B private note', kind: 'note', visibility: 'private', createdAt: now - 10 * DAY, updatedAt: now - 10 * DAY },
  ]);
}

async function removeWorkspace(db: Db) {
  const re = { $regex: `^${PFX}` };
  for (const col of ['messages', 'coachClients', 'clientProfiles', 'syncRecords', 'checkIns', 'notifications', 'subscriptionRequests', 'transferRequests', 'planVersions', 'archivedClientData', 'coachNotes']) await db.deleteMany(col, { clientId: re });
  for (const col of ['clientWorkoutPlans', 'clientNutritionPlans', 'clientCardioPlans', 'users']) await db.deleteMany(col, { _id: re });
}

async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toMatch(label === 'English' ? /^en$/ : label === 'مصري' ? /^ar-eg$/ : /^ar$/);
  await page.waitForTimeout(600);
}
async function openWs(page: Page, id: string, rest = '') {
  await page.goto(`/coach/client/${id}${rest}`);
  await ready(page);
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe('B3.4 workspace', () => {
  test.beforeAll(async ({ db }) => {
    await removeWorkspace(db);
    await insertWorkspace();
  });
  test.afterAll(async ({ db }) => {
    await removeWorkspace(db);
  });

  test('a client who is not on this coach\'s roster gets a clear state — never a page of failed reads', async ({ as, audit, env }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openWs(page, env.accounts.clientA.id);
    await expect(page.getByTestId('workspace-not-on-roster')).toBeVisible();
    await page.getByTestId('workspace-not-on-roster').getByRole('button').click();
    await expect(page).toHaveURL(/\/coach\/clients$/);
  });

  test('Summary: what needs the coach (reviewed in place), the week against the plan, body, plan, check-ins, latest note — every number from the logs', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const now = Date.now();
    const today = dayKey(now);
    const w0 = weekStartOf(today);
    const done = new Set(WORKOUTS.filter(([ago]) => dayKey(now - ago * DAY) >= w0).map(([, d]) => d)).size;
    const last7 = WORKOUTS.filter(([ago]) => ago < 7).length;
    const last28 = WORKOUTS.filter(([ago]) => ago < 28).length;

    const { page } = await as('coachPro', sized(1440));
    await openWs(page, C.active.id);
    await expect(page.getByTestId('workspace-client-name')).toHaveText(C.active.name);
    await expect(page.getByTestId('workspace-package')).toHaveText('Active');
    await expect(page.getByTestId('workspace-tab-summary')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('summary-this-week')).toHaveText(`${done} of 3`);
    await expect(page.getByTestId('summary-last7')).toHaveText(String(last7));
    await expect(page.getByTestId('summary-last28')).toHaveText(String(last28));
    await expect(page.getByTestId('summary-weight')).toContainText('82.6');
    await expect(page.getByTestId('summary-weight-change')).toContainText(/-1\.4\u2069? kg since/); // the signed number is bidi-isolated
    await expect(page.getByTestId('summary-plan')).toContainText('Upper / lower / full · 3 days');
    await expect(page.getByTestId('summary-plan')).toContainText('2,100 kcal · 3 meals');
    await expect(page.getByTestId('summary-plan')).toContainText('No cardio');
    await expect(page.getByTestId('summary-note')).toContainText('Keep the deficit; add one walk.');
    await shot(page, testInfo, 'summary-1440');

    // The check-in waiting for this coach is reviewed in place.
    const item = page.locator('[data-testid="summary-item"][data-kind="checkin"]');
    await expect(item).toBeVisible();
    await item.click();
    await expect(page.getByTestId('checkin-review')).toContainText('Knees feel great this week.');
    await page.getByTestId('review-feedback').fill('Lovely week — keep going.');
    await page.getByTestId('review-mark-next').click();
    await expect(page.locator('[data-testid="summary-item"][data-kind="checkin"]')).toHaveCount(0);
    expect(await db.findOne('checkIns', { _id: `${C.active.id}__${w0}`, status: 'reviewed', coachFeedback: 'Lovely week — keep going.' })).toBeTruthy();
    await expect(page.getByTestId('summary-checkin-state')).toHaveText('Done this week');
  });

  test('sections replace history: Back returns to where the client was opened from; cold deep links go up one level; old URLs redirect', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/clients');
    await ready(page);
    await page.locator(`[data-testid="client-table-row"][data-client-id="${C.active.id}"]`).getByTestId('client-open').click();
    for (const s of ['plan', 'progress', 'profile'] as const) {
      await page.getByTestId(`workspace-tab-${s}`).click();
      await expect(page).toHaveURL(new RegExp(`/coach/client/${C.active.id}/${s}$`));
      await expect(page.getByTestId(`workspace-tab-${s}`)).toHaveAttribute('aria-current', 'page');
    }
    await page.getByTestId('workspace-back').click();
    await expect(page).toHaveURL(/\/coach\/clients$/);

    const cold: [string, RegExp][] = [
      ['/plan', new RegExp(`/coach/client/${C.active.id}$`)],
      ['/assessment', new RegExp(`/coach/client/${C.active.id}/profile$`)],
      ['/checkins', new RegExp(`/coach/client/${C.active.id}/progress$`)],
    ];
    for (const [rest, up] of cold) {
      const fresh = (await as('coachPro', sized(1440))).page;
      await openWs(fresh, C.active.id, rest);
      await fresh.getByTestId('workspace-back').click();
      await expect(fresh, rest).toHaveURL(up);
    }
    const redirects: [string, RegExp][] = [
      ['/view', /\/progress\?view=day$/],
      ['/view/measurements', /\/progress\?view=body$/],
      ['/view/photos', /\/progress\?view=photos$/],
      ['/view/progress', /\/progress\?view=body$/],
    ];
    for (const [rest, to] of redirects) {
      await openWs(page, C.active.id, rest);
      await expect(page, rest).toHaveURL(to);
      await expect(page.getByTestId('workspace-tab-progress')).toHaveAttribute('aria-current', 'page');
    }
    // A stored notification link: …/checkins opens Progress › Check-ins.
    await openWs(page, C.active.id, '/checkins');
    await expect(page.getByTestId('progress-view-checkins')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('coach-checkins')).toBeVisible();
  });

  test('Plan: one card per plan; Edit opens the editor as a full-screen task (one Back) that returns to Plan', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    await openWs(page, C.active.id, '/plan');
    await expect(page.getByTestId('plan-card-workout')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('plan-card-nutrition')).toContainText('2,100 kcal');
    await expect(page.getByTestId('plan-card-cardio')).toHaveAttribute('data-state', 'empty');
    await expect(page.getByTestId('plan-build-cardio')).toBeVisible();
    await shot(page, testInfo, 'plan-390');
    await page.getByTestId('plan-edit-workout').click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.active.id}/workout$`));
    await expect(page.getByTestId('coach-workspace')).toHaveCount(0);
    await expect(page.getByTestId('coach-workout-editor')).toBeVisible();
    await page.getByTestId('coach-workout-editor').getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.active.id}/plan$`));
  });

  test('Progress: a week of real days (tap a day for its log), body with weight and measurements, and only this coach\'s check-ins', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const now = Date.now();
    const today = dayKey(now);
    const { page } = await as('coachPro', sized(1440));
    await openWs(page, C.active.id, '/progress');
    await expect(page.getByTestId('progress-week-label')).toHaveText('This week');
    const todayRow = page.locator(`[data-testid="progress-day"][data-date="${today}"]`);
    await expect(todayRow).toContainText('Upper');
    await expect(todayRow).toContainText('Meals 2/3');
    await expect(todayRow).toContainText('Cardio 30 min');
    await shot(page, testInfo, 'progress-week-1440');
    await todayRow.click();
    await expect(page).toHaveURL(new RegExp(`view=day&date=${today}`));
    await expect(page.getByTestId('workspace-progress')).toHaveAttribute('data-view', 'day');
    await page.getByTestId('progress-back-week').click();
    await page.getByTestId('progress-week-prev').click();
    await expect(page.getByTestId('progress-week-label')).toContainText('Week of');
    await page.getByTestId('progress-view-body').click();
    await expect(page.getByTestId('workspace-progress')).toContainText('82.6');
    await page.getByTestId('progress-view-checkins').click();
    await expect(page.getByTestId('checkin-row')).toHaveCount(2);
  });

  test('a client transferred mid-week: none of the previous coach\'s check-ins or notes; the new coach requests the same week as their own record', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const w0 = weekStartOf(dayKey(Date.now()));
    const before = await db.findOne('checkIns', { _id: `${C.moved.id}__${w0}` });
    const { page } = await as('coachPro', sized(1440));
    const payloads: string[] = [];
    page.on('response', async (r) => {
      if (r.url().includes('/api/trpc/') && /checkIns|coachNotes/.test(r.url())) payloads.push(await r.text().catch(() => ''));
    });
    await openWs(page, C.moved.id, '/progress?view=checkins');
    await expect(page.getByTestId('coach-checkins')).toBeVisible();
    await expect(page.getByTestId('checkin-row')).toHaveCount(0);
    await openWs(page, C.moved.id);
    await expect(page.getByTestId('summary-checkin-state')).toHaveText('Not requested this week');
    await expect(page.getByTestId('summary-note')).not.toContainText('Coach B');
    await page.getByTestId('summary-request-checkin').click();
    await expect(page.getByText('Check-in requested')).toBeVisible();
    await expect.poll(() => db.count('checkIns', { _id: `${C.moved.id}__${w0}__${COACH}`, coachId: COACH, status: 'requested' })).toBe(1);
    expect(await db.findOne('checkIns', { _id: `${C.moved.id}__${w0}` }), 'coach B\'s record is untouched').toEqual(before);
    await expect(page.getByTestId('summary-checkin-state')).toHaveText('Awaiting client');
    expect(payloads.join('\n'), 'no previous-coach content in any response').not.toMatch(/For coach B only|Coach B private note/);
    // Profile › Coaching history names the earlier coaching as facts only.
    await openWs(page, C.moved.id, '/history');
    await expect(page.getByTestId('timeline-previous')).toHaveCount(1);
    await expect(page.getByTestId('coach-timeline')).not.toContainText('1234');
    await shot(page, testInfo, 'moved-history-1440');
  });

  test('the transferred client: the previous coach\'s request left open reads as closed, its answers kept and shown, never sent (EN / AR, axe)', async ({ browser, env, db }, testInfo) => {
    const w0 = weekStartOf(dayKey(Date.now()));
    const before = await db.findOne('checkIns', { _id: `${C.moved.id}__${w0}` });
    const stub = new URL(env.bunny.cdn).origin;
    const found: Record<string, string[]> = {};
    for (const lang of ['en', 'ar'] as const) {
      // A client app needs the client's own profile (else it opens first-run setup); its locale picks the language.
      const now = Date.now();
      await db.updateOne('clientProfiles', { _id: C.moved.id }, { $set: { profile: { id: C.moved.id, name: C.moved.name, age: 30, weightKg: 61, heightCm: 165, goal: 'fat_loss', activityLevel: 'moderate', locale: lang, createdAt: now, updatedAt: now } } });
      const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: env.baseURL, ...phone });
      try {
        const { raw } = (await fetch(`${stub}/__e2e/session`, { method: 'POST', body: JSON.stringify({ userId: C.moved.id }) }).then((r) => r.json())) as { raw: string };
        await ctx.addCookies([{ name: 'forma_rt', value: raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
        await ctx.addInitScript(([uid, week, l]) => {
          localStorage.setItem('forma.locale', l);
          localStorage.setItem(`forma.checkinDraft.v1.${uid}.${week}`, JSON.stringify({ form: { notes: 'Written for coach B' }, step: 3 }));
        }, [C.moved.id, w0, lang] as const);
        const page = await ctx.newPage();
        // The old notification link of coach B's request.
        await page.goto(`/check-in/${w0}`);
        await expect(page.getByTestId('checkin-closed')).toBeVisible();
        await expect(page.getByTestId('checkin-flow')).toHaveCount(0);
        await expect(page.getByTestId('checkin-closed')).toContainText(lang === 'ar' ? ar.trust.checkin.closedTitle : 'This check-in has closed');
        await expect(page.getByTestId('checkin-closed')).toContainText('Written for coach B');
        await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe(lang === 'ar' ? 'rtl' : 'ltr');
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        found[lang] = r.violations.map((v) => `${v.id} × ${v.nodes.length}`);
        await shot(page, testInfo, `client-closed-checkin-${lang}-390`);
        await page.getByTestId('checkin-closed-history').click();
        await expect(page).toHaveURL(/\/check-ins$/);
      } finally {
        await ctx.close();
        await db.updateOne('clientProfiles', { _id: C.moved.id }, { $unset: { profile: '' } });
      }
    }
    expect(found).toEqual({ en: [], ar: [] });
    expect(await db.findOne('checkIns', { _id: `${C.moved.id}__${w0}` }), 'coach B\'s record is untouched').toEqual(before);
  });

  test('every package and account state reads clearly in the header and Profile', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    const cases: [typeof C.active, string, string | null][] = [
      [C.trial, 'Trial', null],
      [C.paused, 'Paused', null],
      [C.expired, 'Expired', null],
      [C.frozen, 'Active', 'Account frozen'],
    ];
    for (const [c, pkg, acct] of cases) {
      await openWs(page, c.id);
      await expect(page.getByTestId('workspace-package'), c.name).toHaveText(pkg);
      if (acct) await expect(page.getByTestId('workspace-account')).toHaveText(acct);
      else await expect(page.getByTestId('workspace-account')).toHaveCount(0);
    }
    await openWs(page, C.incomplete.id, '/profile');
    await expect(page.getByTestId('profile-assessment')).toContainText('In progress');
    await expect(page.getByTestId('profile-contact')).toContainText('+2012300');
    await page.getByTestId('profile-subscription').click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.incomplete.id}/subscription$`));
    await expect(page.getByTestId('workspace-tab-profile')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('profile-back').click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.incomplete.id}/profile$`));
  });

  test('package actions: one primary, Freeze beside it, the rest in "More package actions" — terminal ones apart and confirmed', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    await openWs(page, C.active.id, '/subscription');
    await expect(page.getByTestId('sub-set-term')).toBeVisible();
    await expect(page.getByTestId('sub-freeze')).toBeVisible();
    for (const hidden of ['sub-set-price', 'sub-extend', 'sub-end', 'sub-cancel']) await expect(page.getByTestId(hidden)).toHaveCount(0);
    await page.getByTestId('sub-more').click();
    for (const item of ['sub-set-price', 'sub-extend', 'sub-end', 'sub-cancel']) await expect(page.getByTestId(item)).toBeVisible();
    await expect(page.getByTestId('sub-cancel')).toHaveText(/Cancel package/);
    await shot(page, testInfo, 'package-actions-390');
    await page.getByTestId('sub-end').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText('End package now');
    await page.getByTestId('confirm-cancel').click();
  });

  test('the switcher marks only clients Today has work for, says why, and keeps the section', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openWs(page, C.expired.id, '/progress?view=body');
    await page.getByTestId('workspace-switch-trigger').click();
    const row = (id: string) => page.locator(`[data-testid="switcher-client-row"][data-client-id="${id}"]`);
    await expect(row(C.paused.id).getByTestId('switcher-needs')).toHaveCount(0); // paused: nothing to do, no flag
    await expect(row(C.incomplete.id).getByTestId('switcher-needs')).toHaveCount(0);
    await expect(row(C.expired.id)).toBeDisabled(); // current
    await row(C.trial.id).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.trial.id}/progress\\?view=body$`));
    await expect(page.getByTestId('workspace-client-name')).toHaveText(C.trial.name);
  });

  test('release: from More, destructive and confirmed with its consequences; lands on Clients and never Back onto the dead workspace', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/clients');
    await ready(page);
    await page.locator(`[data-testid="client-table-row"][data-client-id="${C.release.id}"]`).getByTestId('client-open').click();
    await page.getByTestId('workspace-more').click();
    await page.getByTestId('workspace-release').click();
    const dlg = page.getByTestId('confirm-dialog');
    await expect(dlg).toContainText(`Release ${C.release.name}?`);
    await expect(dlg).toContainText('history and progress stay safe');
    await confirmYes(page);
    await expect(page).toHaveURL(/\/coach\/clients$/);
    await expect.poll(async () => (await db.findOne<{ status: string }>('coachClients', { _id: `${COACH}__${C.release.id}` }))?.status).toBe('ended');
    await page.goBack();
    await expect(page).not.toHaveURL(new RegExp(`/coach/client/${C.release.id}`));
  });

  test('Arabic: right-to-left header, sections and Summary', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await setLanguage(page, 'العربية');
    try {
      await openWs(page, C.active.id);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByTestId('workspace-tab-progress')).toHaveText(ar.workspace.section.progress);
      await expect(page.getByTestId('workspace-package')).toHaveText(ar.coachClients.state.active);
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
      const back = await page.getByTestId('workspace-back').boundingBox();
      expect(back!.x).toBeGreaterThan(page.viewportSize()!.width / 2); // Back sits on the right in RTL
      await shot(page, testInfo, 'summary-ar-1440');
    } finally {
      await setLanguage(page, 'English').catch(() => undefined);
    }
  });

  test('accessibility: Summary, Plan, Progress, Profile and package actions — no axe violations (WCAG 2.1 A / AA, EN + AR)', async ({ as, audit }, testInfo) => {
    test.setTimeout(300_000);
    allowDevModuleStorm(audit);
    const found: Record<string, { id: string; nodes: number; sample: string[] }[]> = {};
    const scan = async (page: Page, name: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      found[name] = r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
    };
    for (const lang of ['en', 'ar'] as const) {
      for (const ctx of [phone, sized(1440)] as const) {
        const { page } = await as('coachPro', ctx);
        const w = ctx === phone ? 390 : 1440;
        if (lang === 'ar') await setLanguage(page, 'العربية');
        try {
          for (const rest of ['', '/plan', '/progress', '/profile', '/subscription']) {
            await openWs(page, C.active.id, rest);
            await page.waitForTimeout(400);
            await scan(page, `${lang}-${w}${rest || '/summary'}`);
          }
        } finally {
          if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
        }
      }
    }
    await testInfo.attach('axe-workspace.json', { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
    expect(Object.entries(found).filter(([, v]) => v.length > 0)).toEqual([]);
  });

  test('visual QA matrix: the four sections at 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR (+ Egyptian Arabic)', async ({ as, audit }, testInfo) => {
    test.setTimeout(900_000);
    allowDevModuleStorm(audit);
    const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b34-visual');
    fs.mkdirSync(outDir, { recursive: true });
    const captured: { file: string; overflow: number; dir: string }[] = [];
    const capture = async (page: Page, name: string) => {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir }));
      captured.push({ file: `${name}.png`, ...m });
    };
    const plan: { lang: 'en' | 'ar' | 'ar-eg'; w: number; h: number; sections: string[] }[] = [];
    for (const lang of ['en', 'ar'] as const) {
      for (const [w, h] of [[390, 844], [1440, 900]] as const) plan.push({ lang, w, h, sections: ['', '/plan', '/progress', '/profile'] });
      for (const [w, h] of [[360, 780], [430, 932], [768, 1024], [1024, 800]] as const) plan.push({ lang, w, h, sections: ['', '/progress'] });
    }
    for (const [w, h] of [[390, 844], [1440, 900]] as const) plan.push({ lang: 'ar-eg', w, h, sections: [''] });
    for (const p of plan) {
      const { page } = await as('coachPro', p.w === 390 ? phone : sized(p.w, p.h));
      if (p.lang !== 'en') await setLanguage(page, p.lang === 'ar' ? 'العربية' : 'مصري');
      try {
        for (const rest of p.sections) {
          await openWs(page, C.active.id, rest);
          await capture(page, `${(rest || '/summary').slice(1)}-${p.w}-${p.lang}`);
        }
      } finally {
        if (p.lang !== 'en') await setLanguage(page, 'English').catch(() => undefined);
      }
    }
    fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(captured, null, 2));
    await testInfo.attach('b34-visual.json', { body: JSON.stringify({ dir: outDir, captured }, null, 2), contentType: 'application/json' });
    expect(captured.filter((c) => c.overflow > 0), 'no horizontal overflow').toEqual([]);
    for (const c of captured) expect(c.dir, c.file).toBe(c.file.endsWith('-en.png') ? 'ltr' : 'rtl');
  });
});
