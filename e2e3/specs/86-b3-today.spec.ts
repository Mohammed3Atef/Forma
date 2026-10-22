import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';
import { confirmYes } from './_b-helpers';
import { procsOf } from './_d-helpers';
import { addDays, anchorAt, dayRolled, type DayAnchor } from './_dates';

/**
 * B3.2 — Coach Today (blueprint §6.1, owner brief 2026-10-17). A queue, not a
 * report: every row is grounded in stored data, opens its exact place, and
 * the screen never says "all caught up" over a failure, offline, or stale
 * data. Rules: docs/product-audit/B3_TODAY_QUEUE.md.
 *
 * Fixtures: an isolated roster for coachPro (no seeded clients, capacity 25)
 * with one client per queue kind, six unread conversations (section cap),
 * and records that must NOT show — another coach's check-in on a
 * transferred client, another coach's unread conversation, a frozen client.
 * Everything inserted here is removed in afterAll (`e2e-today-` ids).
 */
const COACH = 'e2e-coach-pro';
const PFX = 'e2e-today-';
const DAY = 86_400_000;
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });

const C = {
  checkin: { id: `${PFX}checkin`, name: 'Nadia Hassan' },
  assess: { id: `${PFX}assess`, name: 'Omar Fathy' },
  freeze: { id: `${PFX}freeze`, name: 'Farah Adel' },
  transfer: { id: `${PFX}transfer`, name: 'Tarek Samir' },
  renew: { id: `${PFX}renew`, name: 'Rana Mostafa' },
  lapsed: { id: `${PFX}lapsed`, name: 'Laila Ibrahim' },
  noPlan: { id: `${PFX}noplan`, name: 'Nour Ali' },
  inactive: { id: `${PFX}inactive`, name: 'Ibrahim Saad' },
  quiet: { id: `${PFX}quiet`, name: 'Qasim Nabil' },
  handover: { id: `${PFX}handover`, name: 'Hana Youssef' },
  frozen: { id: `${PFX}frozen`, name: 'Fady George' },
};
const MSG = ['Mona Khaled', 'Youssef Adham', 'Salma Reda', 'Karim Wael', 'Dina Sherif', 'Hany Lotfy'].map((name, i) => ({ id: `${PFX}msg${i + 1}`, name }));
const ALL = [...Object.values(C), ...MSG];
const EXPECTED = { checkin: 1, assessment: 1, freeze: 1, transfer: 1, message: 6, renewal: 1, lapsed: 1, noPlan: 1, inactive: 1 };
const TOTAL = Object.values(EXPECTED).reduce((a, b) => a + b, 0);

/**
 * B3.9.0: calendar days are Cairo days stepped on the key (the old `local()` used the Node process's zone
 * and `now - n × 24 h`, which a DST change or a non-Cairo machine puts on the wrong day). Returns the
 * anchor the fixture was written for.
 */
async function insertBusyCoach(db: Db): Promise<DayAnchor> {
  const anchor = anchorAt();
  const { now, today } = anchor;
  for (const [i, c] of ALL.entries()) {
    await db.insertOne('users', {
      _id: c.id, email: `${c.id}@e2e.test`, emailLower: `${c.id}@e2e.test`, displayName: c.name, displayNameLower: c.name.toLowerCase(),
      role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: `+2011100${String(i).padStart(5, '0')}`,
      passwordHash: 'not-a-login', createdBy: 'e2e-today', createdAt: now - 40 * DAY, updatedAt: now,
    });
    const sub =
      // B3.9.0: Today counts "ends in N days" as elapsed time (ceil of ms ÷ 24 h): now + 3 days − 1 h reads exactly 3 for the
      // next 23 hours (it used to be + 1 h, which reads 4 for the first hour and needed a 3-or-4 assertion).
      c === C.renew ? { status: 'active', startAt: now - 27 * DAY, endAt: now + 3 * DAY - 3600_000 }
      : c === C.lapsed ? { status: 'active', startAt: now - 35 * DAY, endAt: now - 5 * DAY }
      : c === C.quiet ? { status: 'active', startAt: now - 15 * DAY, endAt: now + 15 * DAY }
      : c === C.frozen ? { status: 'frozen', startAt: now - 10 * DAY, endAt: now + 27 * DAY, frozenFrom: now - 2 * DAY, frozenUntil: now + 5 * DAY, freezeCredit: 7 * DAY }
      : { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY };
    await db.insertOne('coachClients', {
      _id: `${COACH}__${c.id}`, coachId: COACH, clientId: c.id, status: 'active', createdBy: COACH, createdAt: now - 20 * DAY, updatedAt: now,
      subscription: { months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now, ...sub },
    });
    await db.insertOne('clientProfiles', {
      _id: c.id, clientId: c.id, updatedAt: now,
      assessment: { status: c === C.assess ? 'submitted' : 'reviewed', completed: true, submittedAt: now - 3 * DAY, reviewedAt: c === C.assess ? undefined : now - 2 * DAY, basic: { fullName: c.name } },
    });
    if (c !== C.noPlan) {
      await db.insertOne('clientWorkoutPlans', { _id: c.id, clientId: c.id, id: `wp-${c.id}`, name: 'Upper / lower', days: [{ id: 'd1', name: 'Upper', exerciseIds: [] }], exercises: {}, updatedAt: now - 15 * DAY });
    }
    if (c !== C.noPlan && c !== C.frozen) {
      const date = c === C.inactive ? addDays(today, -10) : today;
      await db.insertOne('syncRecords', { _id: `${c.id}__workoutLogs__${date}`, clientId: c.id, collection: 'workoutLogs', recordId: date, data: { date, finished: true }, updatedAt: now, syncedAt: now, rev: 1 });
    }
  }
  // Check-ins: Nadia's (requested by this coach) waits; Hana's was submitted to her previous coach.
  const week = (offset: number) => addDays(today, -offset);
  await db.insertOne('checkIns', {
    _id: `${C.checkin.id}__${week(8)}`, clientId: C.checkin.id, coachId: COACH, weekStart: week(8), weekEnd: week(2), status: 'reviewed', submittedAt: now - 8 * DAY, reviewedAt: now - 7 * DAY,
    currentWeight: 73.1, adherenceTraining: 70, adherenceNutrition: 65, hungerLevel: 5, energyLevel: 6, sleepQuality: 6, progressPhotos: {}, coachFeedback: 'Good start.', createdAt: now - 9 * DAY, updatedAt: now - 7 * DAY,
  });
  await db.insertOne('checkIns', {
    _id: `${C.checkin.id}__${week(1)}`, clientId: C.checkin.id, coachId: COACH, weekStart: week(1), weekEnd: addDays(today, 5), status: 'submitted', submittedAt: now - 5 * 3600_000,
    currentWeight: 72.4, adherenceTraining: 85, adherenceNutrition: 75, hungerLevel: 4, energyLevel: 7, sleepQuality: 7, notes: 'Felt strong on squats, knee is fine now.', progressPhotos: {}, createdAt: now - DAY, updatedAt: now - 5 * 3600_000,
  });
  await db.insertOne('checkIns', {
    _id: `${C.handover.id}__${week(1)}`, clientId: C.handover.id, coachId: 'e2e-coach-b', weekStart: week(1), weekEnd: addDays(today, 5), status: 'submitted', submittedAt: now - 2 * DAY,
    currentWeight: 61, progressPhotos: {}, createdAt: now - 3 * DAY, updatedAt: now - 2 * DAY,
  });
  // Freeze request (the only batched source is the coach's unresolved task).
  await db.insertOne('subscriptionRequests', { _id: C.freeze.id, clientId: C.freeze.id, from: now + DAY, until: now + 8 * DAY, reason: 'Travelling for work — back on the 30th', status: 'pending', requestedAt: now - 2 * 3600_000, updatedAt: now - 2 * 3600_000 });
  await db.insertOne('notifications', {
    _id: `${PFX}n-freeze`, clientId: C.freeze.id, forRole: 'coach', type: 'freeze_requested', body: 'Travelling for work — back on the 30th', coachId: COACH,
    route: `/coach/client/${C.freeze.id}/subscription`, createdAt: now - 2 * 3600_000, createdBy: C.freeze.id, updatedAt: now - 2 * 3600_000, seenAt: null,
  });
  // Another coach asks to take over Tarek.
  await db.insertOne('transferRequests', { _id: `e2e-coach-b__${C.transfer.id}`, clientId: C.transfer.id, fromCoachId: COACH, toCoachId: 'e2e-coach-b', mode: 'keep_plans', reason: 'Moving to my gym in Alexandria', status: 'pending', requestedAt: now - 3 * 3600_000, updatedAt: now - 3 * 3600_000 });
  // Six unread conversations (Mona has two unread).
  const lines = ['Can we move Friday to Saturday?', 'Sent my meal photos', 'Is it okay to swap rice for potatoes?', 'Back pain after deadlifts', 'Done with week 3!', 'What time is our call?'];
  for (const [i, c] of MSG.entries()) {
    const n = i === 0 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      await db.insertOne('messages', { _id: `${PFX}m-${i}-${k}`, clientId: c.id, coachId: COACH, fromUserId: c.id, fromRole: 'client', body: k === n - 1 ? lines[i] : 'Hi coach', seenAt: null, createdAt: now - (i * 10 + (n - k)) * 60_000, updatedAt: now });
    }
  }
  // Another coach's unread conversation — never on coachPro's Today.
  await db.insertOne('messages', { _id: `${PFX}m-bilal`, clientId: 'e2e-client-b', coachId: 'e2e-coach-b', fromUserId: 'e2e-client-b', fromRole: 'client', body: 'Coach B only', seenAt: null, createdAt: now - 60_000, updatedAt: now });
  return anchor;
}

async function removeBusyCoach(db: Db) {
  const re = { $regex: `^${PFX}` };
  await db.deleteMany('messages', { _id: re });
  for (const col of ['messages', 'coachClients', 'clientProfiles', 'syncRecords', 'checkIns', 'notifications', 'subscriptionRequests', 'transferRequests', 'planVersions', 'archivedClientData']) await db.deleteMany(col, { clientId: re });
  await db.deleteMany('clientWorkoutPlans', { _id: re });
  await db.deleteMany('clientNutritionPlans', { _id: re });
  await db.deleteMany('users', { _id: re });
}

/** The language is a per-device setting: every new browser context switches its own. */
async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitForLocaleSaved(page, LOCALE_OF[label]); // B3.9.0: <html lang> + the stored settings, instead of a fixed 600 ms
}

async function openToday(page: Page) {
  await page.goto('/coach/dashboard');
  await ready(page);
  await expect(page.getByTestId('coach-today')).toBeVisible();
}

const rows = (page: Page, kind?: string) => page.locator(kind ? `[data-testid="today-item"][data-kind="${kind}"]` : '[data-testid="today-item"]');

test.describe('B3.2 Today — new coach, redirects, bell, notices', () => {
  test('a coach with no clients: a welcome with Add client — not a queue, not "all caught up"', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    await openToday(page);
    await expect(page.getByTestId('today-new-coach')).toBeVisible();
    await expect(page.getByTestId('today-all-clear')).toHaveCount(0);
    await shot(page, testInfo, 'today-new-coach-390');
    await page.getByTestId('today-add-client').click();
    // Clients consumes `?new=1`: it opens the add sheet (invite or existing client) and clears the param.
    await expect(page).toHaveURL(/\/coach\/clients$/);
    await expect(page.getByTestId('add-client-chooser')).toBeVisible();
  });

  test('the bell is gone; /coach/notifications and /coach/assessments land on Today', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachA', sized(1440));
    for (const p of ['/coach/dashboard', '/coach/clients', '/coach/messages/e2e-client-a']) {
      await page.goto(p);
      await ready(page);
      await expect(page.getByTestId('notifications-bell'), p).toHaveCount(0);
    }
    await page.goto('/coach/notifications');
    await expect(page).toHaveURL(/\/coach\/dashboard$/);
    await page.goto('/coach/assessments');
    await expect(page).toHaveURL(/\/coach\/dashboard\?focus=assessments$/);
    await ready(page);
    // Client Aya's seeded assessment is "submitted": the focused queue shows exactly that.
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page, 'assessment')).toContainText('Client Aya');
    await page.getByTestId('today-chip-all').click();
    await expect(page).toHaveURL(/\/coach\/dashboard$/);
  });

  test('O-6: a paid term ending soon is a notice on Today only; app-wide banners stay for blocking states', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const plan = await db.findOne('coachPlans', { _id: COACH });
    // B3.9.0 (verified, unchanged): the banner's count is elapsed time — ceil((endsAt − now) ÷ 24 h), `trialDaysLeft` — so
    // now + 3 × 24 h reads 3 for a whole day after this line, whatever the Cairo time of day or a DST change.
    await db.updateOne('coachPlans', { _id: COACH }, { $set: { endsAt: Date.now() + 3 * DAY } });
    try {
      const { page } = await as('coachPro', sized(1440));
      await openToday(page);
      await expect(page.getByTestId('coach-plan-banner')).toContainText(/ends in 3 day/);
      await page.goto('/coach/clients');
      await ready(page);
      await expect(page.getByTestId('coach-plan-banner')).toHaveCount(0);
    } finally {
      await db.updateOne('coachPlans', { _id: COACH }, { $set: { endsAt: (plan as { endsAt: number }).endsAt } });
    }
  });
});

test.describe('NT-10 — announcement dismissals (coach Today and client home)', () => {
  const ID = `${PFX}announcement`;
  // The account's language may be English or Arabic when this runs (another spec may have left it): match every locale's label.
  const DISMISS = new RegExp(`^(${['en', 'ar', 'ar-eg'].map((l) => JSON.parse(fs.readFileSync(`src/i18n/${l}.json`, 'utf8')).common.dismiss).join('|')})$`);
  const base = { _id: ID, body: 'Try the new weekly check-in templates in Library.', placement: 'all', roles: [], segment: 'all', active: true, createdBy: 'e2e-super' };
  test.afterEach(async ({ db }) => {
    await db.deleteMany('banners', { _id: ID });
  });

  for (const who of [
    { role: 'coachA' as const, home: '/coach/dashboard' },
    { role: 'clientA' as const, home: '/' },
  ]) {
    test(`${who.role}: a dismissed announcement stays dismissed on the next launch; an edited one shows again`, async ({ as, db, audit }) => {
      allowDevModuleStorm(audit);
      const now = Date.now();
      await db.insertOne('banners', { ...base, title: 'New: check-in templates', style: 'info', createdAt: now, updatedAt: now });
      const { context, page } = await as(who.role, phone);
      await page.goto(who.home);
      await ready(page);
      const banner = page.getByTestId('app-banner');
      await expect(banner).toContainText('New: check-in templates');
      await banner.getByRole('button', { name: DISMISS }).click();
      await expect(banner).toHaveCount(0);

      // A new launch: a fresh tab is a fresh session (the old sessionStorage dismissal did not survive this).
      const next = await context.newPage();
      await next.goto(who.home);
      await ready(next);
      await next.waitForTimeout(1500);
      await expect(next.getByTestId('app-banner')).toHaveCount(0);

      // The admin edits what it says → a new version → it shows again.
      await db.updateOne('banners', { _id: ID }, { $set: { title: 'Updated: check-in templates', updatedAt: Date.now() } });
      const third = await context.newPage();
      await third.goto(who.home);
      await ready(third);
      await expect(third.getByTestId('app-banner')).toContainText('Updated: check-in templates');
    });
  }

  test('a warning announcement is never permanently dismissible — it returns on the next launch', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const now = Date.now();
    await db.insertOne('banners', { ...base, title: 'Scheduled maintenance tonight', style: 'warning', createdAt: now, updatedAt: now });
    const { context, page } = await as('coachA', phone);
    await page.goto('/coach/dashboard');
    await ready(page);
    await page.getByTestId('app-banner').getByRole('button', { name: DISMISS }).click();
    await expect(page.getByTestId('app-banner')).toHaveCount(0);
    const next = await context.newPage();
    await next.goto('/coach/dashboard');
    await ready(next);
    await expect(next.getByTestId('app-banner')).toContainText('Scheduled maintenance tonight');
  });
});

test.describe('B3.2 Today — a busy coach', () => {
  let anchor: DayAnchor | null = null;
  test.beforeAll(async ({ db }) => {
    await removeBusyCoach(db); // a crashed earlier run must not leak into this one
    anchor = await insertBusyCoach(db);
  });
  // B3.9.0: the queue is day-relative (workouts "today" / 10 days ago). If the run crossed Cairo midnight since the
  // fixture was written, write it again for the new day — the fixture and the app must agree on "today".
  test.beforeEach(async ({ db }) => {
    if (!dayRolled(anchor)) return;
    await removeBusyCoach(db);
    anchor = await insertBusyCoach(db);
  });
  test.afterAll(async ({ db }) => {
    await removeBusyCoach(db);
  });

  test('every kind once, with its evidence; other coaches\' data never appears', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openToday(page);
    await expect(page.getByTestId('today-summary')).toHaveText(`${TOTAL} things need you`);
    for (const [kind, n] of Object.entries(EXPECTED)) await expect(rows(page, kind), kind).toHaveCount(Math.min(n, 5));
    await expect(page.getByTestId('today-more-messages')).toHaveText('Show 1 more');
    await page.getByTestId('today-more-messages').click();
    await expect(rows(page, 'message')).toHaveCount(6);

    await expect(rows(page, 'checkin')).toContainText(C.checkin.name);
    await expect(rows(page, 'freeze')).toContainText('Travelling for work — back on the 30th');
    await expect(rows(page, 'transfer')).toContainText('Moving to my gym in Alexandria');
    await expect(rows(page, 'message').filter({ hasText: MSG[0].name })).toContainText('2 unread messages');
    await expect(rows(page, 'renewal')).toContainText('Package ends in 3 days'); // B3.9.0: exact (the fixture now ends 3 days − 1 h ahead)
    await expect(rows(page, 'lapsed')).toContainText('Package ended 5 days ago');
    await expect(rows(page, 'noPlan')).toContainText(C.noPlan.name);
    await expect(rows(page, 'inactive')).toContainText(/No workout in 10 days/);
    // Never: another coach's check-in, another coach's thread, another coach's client, the frozen client.
    for (const absent of [C.handover.name, 'Client Bilal', 'Client Aya', C.frozen.name]) await expect(rows(page).filter({ hasText: absent }), absent).toHaveCount(0);
    // Coming up: Qasim's package ends in ~15 days — informational, not counted.
    await expect(page.getByTestId('today-coming-up')).toContainText(C.quiet.name);
    await expect(page.getByTestId('today-all-clear')).toHaveCount(0);
    await shot(page, testInfo, 'today-busy-1440');
  });

  test('accessibility: the busy queue, the review sheet and the desktop panel have no axe violations (WCAG 2.1 A / AA, EN + AR)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const found: Record<string, { id: string; impact: string | null | undefined; nodes: number; sample: string[] }[]> = {};
    const axe = async (page: Page, name: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      found[name] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) }));
    };
    for (const lang of ['en', 'ar'] as const) {
      const mobile = (await as('coachPro', phone)).page;
      if (lang === 'ar') await setLanguage(mobile, 'العربية');
      try {
        await openToday(mobile);
        await axe(mobile, `${lang}-390-queue`);
        await rows(mobile, 'checkin').click();
        await expect(mobile.getByTestId('checkin-review')).toBeVisible();
        await axe(mobile, `${lang}-390-review-sheet`);
      } finally {
        if (lang === 'ar') await setLanguage(mobile, 'English').catch(() => undefined);
      }
      const desk = (await as('coachPro', sized(1440))).page;
      if (lang === 'ar') await setLanguage(desk, 'العربية');
      try {
        await openToday(desk);
        await axe(desk, `${lang}-1440-panel`);
      } finally {
        if (lang === 'ar') await setLanguage(desk, 'English').catch(() => undefined);
      }
    }
    await testInfo.attach('axe-today.json', { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
    expect(Object.entries(found).filter(([, v]) => v.length > 0)).toEqual([]);
  });

  test('phone: every row opens its exact place', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    const cases: [string, RegExp][] = [
      ['assessment', new RegExp(`/coach/client/${C.assess.id}/assessment$`)],
      ['freeze', new RegExp(`/coach/client/${C.freeze.id}/subscription$`)],
      ['message', new RegExp(`/coach/messages/${MSG[0].id}$`)],
      ['renewal', new RegExp(`/coach/client/${C.renew.id}/subscription$`)],
      ['lapsed', new RegExp(`/coach/client/${C.lapsed.id}/subscription$`)],
      ['noPlan', new RegExp(`/coach/client/${C.noPlan.id}/workout$`)],
      ['inactive', new RegExp(`/coach/messages/${C.inactive.id}$`)],
    ];
    for (const [kind, url] of cases) {
      await openToday(page);
      await rows(page, kind).first().click();
      await expect(page, kind).toHaveURL(url);
    }
  });

  test('B32-P1: a pending freeze request survives 60 newer notifications and leaves Today only when decided', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const now = Date.now();
    // Sixty newer notifications for this coach: the old feed-based source (newest 50) would have lost the request.
    for (let i = 0; i < 60; i++) {
      await db.insertOne('notifications', { _id: `${PFX}n-flood-${i}`, clientId: MSG[0].id, forRole: 'coach', type: 'message_received', body: 'flood', coachId: COACH, createdAt: now + i, createdBy: MSG[0].id, updatedAt: now + i, seenAt: null });
    }
    try {
      const { page } = await as('coachPro', sized(1440));
      await openToday(page);
      const row = rows(page, 'freeze');
      await expect(row).toContainText(C.freeze.name);
      await expect(row).toContainText(/Asked to freeze .+ – .+: .+Travelling for work/); // the dates the client asked for
      await row.click();
      await page.getByTestId('today-panel').getByTestId('today-detail-primary').click();
      await expect(page).toHaveURL(new RegExp(`/coach/client/${C.freeze.id}/subscription$`));
      await page.getByTestId('freeze-reject').click();
      await expect(page.getByTestId('freeze-request')).toHaveCount(0);
      expect(await db.findOne('subscriptionRequests', { _id: C.freeze.id, status: 'rejected' })).toBeTruthy();
      await page.getByTestId('rail-today').click();
      await expect(page).toHaveURL(/\/coach\/dashboard$/);
      await expect(page.getByTestId('coach-today')).toBeVisible();
      await expect(rows(page, 'freeze')).toHaveCount(0);
    } finally {
      await db.deleteMany('notifications', { _id: { $regex: `^${PFX}n-flood-` } });
    }
  });

  test('phone: a check-in is reviewed in place — the row resolves and the client gets the feedback', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    await openToday(page);
    await rows(page, 'checkin').click();
    const review = page.getByTestId('checkin-review');
    await expect(review).toBeVisible();
    await expect(review).toContainText('Felt strong on squats');
    await expect(page.getByTestId('checkin-comparison')).toContainText('73.1');
    await shot(page, testInfo, 'today-review-sheet-390');
    await page.getByTestId('review-feedback').fill('Great week — keep the deficit and add one walk.');
    await page.getByTestId('review-mark-next').click();
    await expect(rows(page, 'checkin')).toHaveCount(0);
    const doc = await db.findOne('checkIns', { clientId: C.checkin.id, status: 'reviewed', coachFeedback: 'Great week — keep the deficit and add one walk.' });
    expect(doc, 'the check-in is reviewed with the feedback').toBeTruthy();
  });

  test('desktop: the panel follows the selection (J / K) and a transfer is decided in place', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openToday(page);
    const panel = page.getByTestId('today-panel');
    const first = await rows(page).first().getAttribute('data-kind');
    await expect(panel.getByTestId('today-detail')).toHaveAttribute('data-kind', first!);
    // Nothing focused, so J / K drive the queue (B3.8: the sidebar now fills the left edge — no click there).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('j');
    // B3.9.0 (reviewed, kept): positional on purpose — J moves the selection to the NEXT row, whatever kind it is.
    const second = await rows(page).nth(1).getAttribute('data-kind');
    await expect(panel.getByTestId('today-detail')).toHaveAttribute('data-kind', second!);
    await rows(page, 'transfer').click();
    await expect(panel.getByTestId('incoming-transfer-row')).toContainText(C.transfer.name);
    await shot(page, testInfo, 'today-panel-transfer-1440');
    await panel.getByTestId('incoming-transfer-reject').click();
    await confirmYes(page);
    await expect(rows(page, 'transfer')).toHaveCount(0);
    expect(await db.findOne('transferRequests', { clientId: C.transfer.id, status: 'rejected' })).toBeTruthy();
    await expect(page).toHaveURL(/\/coach\/dashboard$/); // deciding never navigates away
  });

  test('freshness: a new message appears on Refresh, without reloading the page', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openToday(page);
    await expect(rows(page, 'message').filter({ hasText: C.quiet.name })).toHaveCount(0);
    await page.getByTestId('today-more-messages').click();
    const now = Date.now();
    await db.insertOne('messages', { _id: `${PFX}m-fresh`, clientId: C.quiet.id, coachId: COACH, fromUserId: C.quiet.id, fromRole: 'client', body: 'New PR on bench!', seenAt: null, createdAt: now, updatedAt: now });
    try {
      await page.getByTestId('today-refresh').click();
      await expect(rows(page, 'message').filter({ hasText: C.quiet.name })).toContainText('New PR on bench!');
      await expect(page.getByTestId('today-updated')).toBeVisible();
    } finally {
      await db.deleteMany('messages', { _id: `${PFX}m-fresh` }); // later tests count six conversations
    }
  });

  test('a failing backend is an error with Retry — never "all caught up" — and Retry recovers', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    audit.allow5xx(/coachClients\.dashboardSummaries|checkIns\.listForCoachClients/);
    const { page } = await as('coachPro', sized(1440));
    const failing = ['coachClients.dashboardSummaries', 'checkIns.listForCoachClients'];
    const handler = async (route: import('@playwright/test').Route) => {
      if (procsOf(route.request().url()).some((p) => failing.includes(p))) await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      else await route.continue();
    };
    await page.route(/\/api\/trpc\//, handler);
    await page.goto('/coach/dashboard');
    await ready(page).catch(() => undefined);
    const alert = page.locator('main [role="alert"]').filter({ has: page.getByRole('button', { name: 'Retry' }) });
    await expect(alert.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('today-all-clear')).toHaveCount(0);
    await shot(page, testInfo, 'today-failing-1440');
    await page.unroute(/\/api\/trpc\//, handler);
    await alert.first().getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('today-summary')).toContainText('things need you');
    await expect(page.getByTestId('today-kind-error')).toHaveCount(0);
  });

  test('offline: the cached queue says so and when — never "all caught up"', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page, context } = await as('coachPro', phone);
    await openToday(page);
    await context.setOffline(true);
    try {
      await expect(page.getByTestId('today-stale')).toContainText("You're offline");
      await expect(rows(page).first()).toBeVisible();
      await expect(page.getByTestId('today-all-clear')).toHaveCount(0);
      await shot(page, testInfo, 'today-offline-390');
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByTestId('today-stale')).toHaveCount(0);
  });

  test('Arabic: right-to-left queue with translated reasons, actions and chips', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await setLanguage(page, 'العربية');
    try {
      await openToday(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.coachNav.today);
      // (The check-in was reviewed by an earlier test — the message rows are still waiting.)
      await expect(rows(page, 'message').first().getByTestId('today-item-action')).toHaveText(ar.coachToday.action.message);
      await expect(rows(page, 'renewal')).toContainText(ar.coachToday.reason.renewal_few.split('{{count}}')[0].trim());
      // Six is Arabic's "few" plural form (3–10).
      await expect(page.getByTestId('today-chip-message')).toHaveText(ar.coachToday.kinds.message_few.replace('{{count}}', '6'));
      await shot(page, testInfo, 'today-ar-1440');
    } finally {
      await setLanguage(page, 'English').catch(() => undefined);
    }
  });

  test('visual QA matrix: 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR (+ Egyptian Arabic), busy and all-clear', async ({ as, db, audit }, testInfo) => {
    test.setTimeout(900_000);
    allowDevModuleStorm(audit);
    const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b32-visual');
    fs.mkdirSync(outDir, { recursive: true });
    const widths: [number, number][] = [[360, 780], [390, 844], [430, 932], [768, 1024], [1024, 800], [1440, 900]];
    const captured: { file: string; overflow: number; dir: string }[] = [];
    const capture = async (page: Page, name: string) => {
      const file = path.join(outDir, `${name}.png`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: file, fullPage: true });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir }));
      captured.push({ file: path.basename(file), ...m });
    };
    const run = async (state: string, langs: ('en' | 'ar' | 'ar-eg')[], ws: [number, number][]) => {
      for (const lang of langs) {
        for (const [w, h] of ws) {
          const { context, page } = await as('coachPro', w === 390 ? phone : sized(w, h));
          if (lang !== 'en') await setLanguage(page, lang === 'ar' ? 'العربية' : 'مصري');
          try {
            await openToday(page);
            await capture(page, `${state}-${w}-${lang}`);
          } finally {
            if (lang !== 'en') await setLanguage(page, 'English').catch(() => undefined);
            // B3.8 completion: close each window when done — the matrix used to keep a dozen live coach apps open at once.
            await context.close();
          }
        }
      }
    };
    await run('busy', ['en', 'ar'], widths);
    await run('busy', ['ar-eg'], [[390, 844], [1440, 900]]);
    // All clear: only the quiet client (a package ending in ~15 days → "Coming up") stays on the roster.
    const keep = new Set([C.quiet.id]);
    for (const c of ALL) if (!keep.has(c.id)) await db.updateOne('coachClients', { _id: `${COACH}__${c.id}` }, { $set: { status: 'ended', endedAt: Date.now(), endReason: 'released' } });
    await db.deleteMany('transferRequests', { clientId: { $regex: `^${PFX}` } });
    await db.updateOne('notifications', { _id: `${PFX}n-freeze` }, { $set: { resolvedAt: Date.now() } });
    await db.deleteMany('messages', { _id: `${PFX}m-fresh` });
    await run('clear', ['en', 'ar'], [[390, 844], [1440, 900]]);

    fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(captured, null, 2));
    await testInfo.attach('b32-visual.json', { body: JSON.stringify({ dir: outDir, captured }, null, 2), contentType: 'application/json' });
    expect(captured.filter((c) => c.overflow > 0), 'no horizontal overflow').toEqual([]);
    for (const c of captured) expect(c.dir, c.file).toBe(c.file.endsWith('-en.png') ? 'ltr' : 'rtl');
  });
});
