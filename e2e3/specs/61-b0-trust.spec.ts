import { devices, type BrowserContext, type Page } from '@playwright/test';
import { test, expect, ready, shot } from '../fixtures';

/**
 * B0 — Safety, Trust & Cleanup browser verification (isolated stack only).
 * Client journeys run at 390 px (one check-in variant at 430 and one in Arabic/RTL);
 * coach journeys at the desktop project width. Every journey restores the
 * seeded data it changes.
 */
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const CLIENT_A = 'e2e-client-a';
const COACH_A = 'e2e-coach-a';
const mobile = (width = 390, height = 844) => ({ ...devices['Pixel 7'], viewport: { width, height } });
const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
const TODAY = cairo(new Date());
const YESTERDAY = cairo(new Date(Date.now() - 86_400_000));

const exercise = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  targetMuscle: 'chest',
  warmupSets: '0',
  warmupSetCount: 0,
  workingSets: 2,
  repRange: '8-12',
  rir: '',
  tempo: '-',
  restSec: 60,
  videoId: null,
  notes: { en: '', ar: '' },
  ...extra,
});

async function seedPlan(db: import('../fixtures').Db) {
  await db.deleteMany('clientWorkoutPlans', { _id: CLIENT_A });
  await db.insertOne('clientWorkoutPlans', {
    _id: CLIENT_A,
    clientId: CLIENT_A,
    id: 'b0-plan',
    name: 'B0 plan',
    days: [{ id: 'b0-d1', title: 'Push', focus: 'Push', exerciseIds: ['b0-bench', 'b0-fly', 'b0-curl'] }],
    exercises: {
      'b0-bench': exercise('b0-bench', 'Bench press', { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      'b0-fly': exercise('b0-fly', 'Cable fly', { videoUrl: 'https://drive.google.com/file/d/abc/view' }),
      'b0-curl': exercise('b0-curl', 'Curl'),
    },
    updatedAt: Date.now(),
  });
  // Last session's numbers for the bench (what the empty row shows as placeholders).
  await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs' });
  const set = (i: number, w: number, r: number) => ({ setIndex: i, type: 'working', targetReps: '8-12', actualReps: r, weightKg: w, rpe: null, done: true });
  await db.insertOne('syncRecords', {
    _id: `${CLIENT_A}__workoutLogs__${YESTERDAY}`,
    clientId: CLIENT_A,
    collection: 'workoutLogs',
    recordId: YESTERDAY,
    data: { id: YESTERDAY, date: YESTERDAY, dayId: 'b0-d1', startedAt: Date.now() - 90_000_000, endedAt: Date.now() - 86_000_000, durationSec: 3600, finished: true, updatedAt: Date.now() - 86_000_000, exercises: [{ exerciseId: 'b0-bench', done: true, sets: [set(0, 52.5, 10), set(1, 50, 9)] }] },
    updatedAt: Date.now() - 86_000_000,
    syncedAt: Date.now(),
    rev: 1,
  });
}

async function flip(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
    Object.defineProperty(document, 'hidden', { value: s === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** True when the element's centre is actually hit-testable (not under the nav / another layer). */
async function reachable(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { ok: (t === el || el.contains(t)) && r.bottom <= window.innerHeight + 0.5, bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
}

test.afterAll(async ({ db }) => {
  await db.deleteMany('clientWorkoutPlans', { _id: CLIENT_A });
  await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs' });
  await db.deleteMany('notifications', { clientId: CLIENT_A, createdBy: 'b0-spec' });
  await db.deleteMany('checkIns', { _id: { $regex: `^${CLIENT_A}__2031-` } });
  await db.deleteMany('coachNotes', { clientId: CLIENT_A, body: { $regex: '^B0 ' } });
});

test('client 390: online launch, then offline + background → foreground keeps the session and the data', async ({ as }, testInfo) => {
  const { context, page } = await as('clientA', mobile());
  await page.goto('/');
  await ready(page);
  await expect(page.getByTestId('client-home')).toBeVisible({ timeout: 30_000 });
  await shot(page, testInfo, '01-online-launch');
  await context.setOffline(true);
  await flip(page, 'hidden');
  await page.waitForTimeout(500);
  await flip(page, 'visible');
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('client-home')).toBeVisible();
  await expect(page.getByTestId('login-email')).toHaveCount(0);
  await shot(page, testInfo, '02-offline-foreground-still-signed-in');
  await context.setOffline(false);
  await flip(page, 'hidden');
  await flip(page, 'visible');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('client-home')).toBeVisible();
});

test('client 390: ✓ commits the shown values; an empty row with nothing to log is refused; video only where it can play', async ({ as, db }, testInfo) => {
  await seedPlan(db);
  const { page } = await as('clientA', mobile());
  await page.goto('/workout');
  await ready(page);
  // Let the first sync pull last session's log.
  await expect.poll(async () => (await page.getByText(/52\.5/).count()) > 0, { timeout: 30_000 }).toBe(true).catch(() => undefined);
  const start = page.getByRole('button', { name: /start this workout/i });
  if (!(await start.isVisible().catch(() => false))) await page.getByRole('button', { name: /push/i }).first().click();
  await start.click();
  await expect(page).toHaveURL(/\/workout\/session/);
  // Bench: has a YouTube link → button; tick the empty row → last session's 52.5 × 10 is committed.
  await expect(page.getByTestId('exercise-video-button')).toBeVisible();
  await page.getByTestId('set-done-0').first().click();
  await expect(page.getByLabel(/weight/i).first()).toHaveValue('52.5');
  await expect(page.getByTestId('set-reps-0').first()).toHaveValue('10');
  await shot(page, testInfo, '03-set-committed-from-previous');
  // The YouTube video plays in the in-app player (privacy-enhanced embed).
  await page.getByTestId('exercise-video-button').click();
  await expect(page.getByTestId('video-youtube')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  await page.getByTestId('video-popup-close').click();
  // Cable fly: a Drive link can't play → no video button.
  await page.getByRole('button', { name: /next/i }).first().click();
  await expect(page.getByText('Cable fly').first()).toBeVisible();
  await expect(page.getByTestId('exercise-video-button')).toHaveCount(0);
  // Curl: no history, range target, no video → ✓ on the empty row is refused with a hint.
  await page.getByRole('button', { name: /next/i }).first().click();
  await expect(page.getByText('Curl').first()).toBeVisible();
  await expect(page.getByTestId('exercise-video-button')).toHaveCount(0);
  await page.getByTestId('set-done-0').first().click();
  await expect(page.getByTestId('set-needs-reps')).toBeVisible();
  await shot(page, testInfo, '04-empty-set-refused');
});

test('client 390: a dated coach-note notification on cold open — no toast replay, the day stays today until tapped', async ({ as, db }, testInfo) => {
  await db.insertOne('notifications', {
    _id: `b0-note-${Date.now()}`,
    clientId: CLIENT_A,
    forRole: 'client',
    type: 'coach_note',
    body: 'B0 check this meal',
    noteVisibility: 'client',
    screen: 'nutrition',
    date: '2026-09-25',
    entityType: 'meal',
    entityId: 'm1',
    seenAt: null,
    createdAt: Date.now() - 60_000,
    createdBy: 'b0-spec',
    updatedAt: Date.now() - 60_000,
  });
  const { page } = await as('clientA', mobile());
  await page.goto('/');
  await ready(page);
  await page.waitForTimeout(3000); // a poll cycle
  await expect(page.getByTestId('toast')).toHaveCount(0); // backlog never toasts
  await page.goto('/nutrition');
  await ready(page);
  // B2: scoped to the Nutrition day switcher (the nav also says "Today", so an unscoped match proved nothing).
  await expect(page.getByTestId('day-switcher-label')).toHaveText(/^today$/i); // the note did NOT move the day
  await shot(page, testInfo, '05-cold-open-day-unchanged');
  // Reload (relaunch): still no replay.
  await page.reload();
  await ready(page);
  await page.waitForTimeout(2000);
  await expect(page.getByTestId('toast')).toHaveCount(0);
  // Tapping the notification is what opens that day.
  await page.goto('/notifications');
  await ready(page);
  await page.getByTestId('notification-item').filter({ hasText: 'B0 check this meal' }).first().click();
  await expect(page).toHaveURL(/\/nutrition/);
  await expect(page.getByTestId('day-switcher-label')).toContainText('25');
  await shot(page, testInfo, '06-tap-opens-the-day');
});

for (const v of [
  { name: '390', opts: mobile(390, 844), ar: false, week: '2031-01-06' },
  { name: '430', opts: mobile(430, 932), ar: false, week: '2031-01-13' },
  { name: '390-ar', opts: mobile(390, 844), ar: true, week: '2031-01-20' },
] as const) {
  test(`client ${v.name}: check-in is a full-screen task — CTA always reachable, answers resume, one submit`, async ({ as, db }, testInfo) => {
    await db.deleteMany('checkIns', { _id: `${CLIENT_A}__${v.week}` });
    await db.insertOne('checkIns', { _id: `${CLIENT_A}__${v.week}`, clientId: CLIENT_A, coachId: COACH_A, weekStart: v.week, weekEnd: v.week, status: 'requested', progressPhotos: {}, createdAt: Date.now(), updatedAt: Date.now() });
    // The ACCOUNT's language applies once signed in (the device language only covers the
    // login screen / a brand-new account), so Arabic is set on the account itself — and restored.
    const setLocale = async (locale: 'en' | 'ar') => {
      for (const name of ['settings', 'profile']) {
        await db.updateOne('syncSingletons', { _id: `${CLIENT_A}__${name}` }, { $set: { 'data.locale': locale, 'data.updatedAt': Date.now(), updatedAt: Date.now() } });
      }
    };
    if (v.ar) await setLocale('ar');
    try {
      const { context, page } = await as('clientA', v.opts);
      if (v.ar) await context.addInitScript(() => localStorage.setItem('forma.locale', 'ar'));
      await page.goto(`/check-in/${v.week}`);
      await ready(page);
      await expect(page.getByTestId('checkin-flow')).toBeVisible({ timeout: 30_000 });
      if (v.ar) await expect.poll(() => page.evaluate(() => document.documentElement.dir), { timeout: 20_000 }).toBe('rtl');
      const r1 = await reachable(page, 'checkin-next');
      expect(r1.ok, `Continue not reachable (bottom ${r1.bottom} / ${r1.vh})`).toBe(true);
      await shot(page, testInfo, `07-checkin-step1-${v.name}`);
      await page.getByTestId('checkin-next').click();
      await page.getByTestId('checkin-next').click();
      await page.getByTestId('checkin-next').click();
      await page.getByTestId('checkin-notes').fill('B0 knee felt better');
      // Reload mid-flow: same step, same answer.
      await page.reload();
      await ready(page);
      await expect(page.getByTestId('checkin-notes')).toHaveValue('B0 knee felt better', { timeout: 20_000 });
      const r2 = await reachable(page, 'checkin-submit');
      expect(r2.ok).toBe(true);
      // Double tap → one submission.
      await page.getByTestId('checkin-submit').dblclick();
      await expect.poll(async () => (await db.findOne<{ status: string }>('checkIns', { _id: `${CLIENT_A}__${v.week}` }))?.status, { timeout: 20_000 }).toBe('submitted');
      await expect(page.getByTestId('checkin-flow')).toHaveCount(0, { timeout: 20_000 });
      await shot(page, testInfo, `08-checkin-submitted-${v.name}`);
    } finally {
      if (v.ar) await setLocale('en');
    }
  });
}

test('client 390: Settings has no "Reset all data" / "Clear this day"', async ({ as }) => {
  const { page } = await as('clientA', mobile());
  await page.goto('/settings?tab=account');
  await ready(page);
  await expect(page.getByText(/reset all data/i)).toHaveCount(0);
  await expect(page.getByText(/clear this day/i)).toHaveCount(0);
});

test('client 390: Arabic-Indic digits are accepted in measurements', async ({ as }, testInfo) => {
  const { page } = await as('clientA', mobile());
  await page.goto('/progress/measurements');
  await ready(page);
  const first = page.locator('input[inputmode="decimal"]').first();
  await first.fill('٩٥٫٥');
  await page.getByRole('button', { name: /^save$/i }).first().click();
  await expect(page.getByTestId('toast').filter({ hasText: /saved/i })).toBeVisible({ timeout: 10_000 });
  await expect(first).toHaveValue('95.5');
  await shot(page, testInfo, '09-arabic-digits-saved');
});

test('coach: a failed plan load is an error with Retry — never an editable empty plan', async ({ as, db, audit }, testInfo) => {
  audit.allow5xx(/workoutPlan\.get/); // injected below on purpose
  await seedPlan(db);
  const { page } = await as('coachA');
  await page.route('**/api/trpc/**', async (route) => {
    if (route.request().url().includes('workoutPlan.get')) return route.fulfill({ status: 500, body: '{"error":"injected"}' });
    return route.continue();
  });
  await page.goto(`/coach/client/${CLIENT_A}/workout`);
  await expect(page.getByTestId('plan-editor-error')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('workout-save')).toHaveCount(0);
  await expect(page.getByText(/injected/)).toHaveCount(0);
  await shot(page, testInfo, '10-coach-plan-load-error');
  await page.unroute('**/api/trpc/**');
  await page.getByTestId('plan-editor-retry').click();
  await expect(page.getByTestId('workout-plan-name')).toHaveValue('B0 plan', { timeout: 30_000 });
  expect((await db.findOne<{ name: string }>('clientWorkoutPlans', { _id: CLIENT_A }))?.name).toBe('B0 plan'); // nothing overwritten
});

test('coach → client: a private note never reaches the client; a shared one does', async ({ as }, testInfo) => {
  const coach = await as('coachA');
  await coach.page.goto(`/coach/client/${CLIENT_A}/notes`);
  await expect(coach.page.getByTestId('coach-notes-add')).toBeVisible({ timeout: 30_000 });
  await coach.page.getByTestId('coach-notes-add').click();
  await expect(coach.page.getByTestId('note-visibility-toggle')).not.toBeChecked();
  await coach.page.getByTestId('coach-note-body').fill('B0 private: possible knee injury');
  await coach.page.getByTestId('coach-note-save').click();
  await expect(coach.page.getByTestId('note-visibility-badge').first()).toHaveAttribute('data-visibility', 'private', { timeout: 15_000 });
  await coach.page.getByTestId('coach-notes-add').click();
  await coach.page.getByTestId('note-visibility-toggle').check();
  await coach.page.getByTestId('coach-note-body').fill('B0 shared: great week');
  await coach.page.getByTestId('coach-note-save').click();
  await expect(coach.page.getByText('B0 shared: great week')).toBeVisible({ timeout: 15_000 });
  await shot(coach.page, testInfo, '11-coach-notes-badges');

  const client = await as('clientA', mobile());
  await client.page.goto('/coach-notes');
  await ready(client.page);
  await expect(client.page.getByText('B0 shared: great week')).toBeVisible({ timeout: 20_000 });
  await expect(client.page.getByText(/possible knee injury/)).toHaveCount(0);
  await client.page.goto('/notifications');
  await ready(client.page);
  await expect(client.page.getByText(/possible knee injury/)).toHaveCount(0);
  await shot(client.page, testInfo, '12-client-sees-only-shared');
});

test('coach: Add Existing can only find a client by exact email/phone and shows no contact data', async ({ as, env }, testInfo) => {
  const { page } = await as('coachB');
  await page.goto('/coach/clients');
  await expect(page.getByTestId('coach-add-client').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('coach-add-client').first().click();
  await page.getByTestId('add-choose-existing').click();
  await page.getByTestId('existing-search').fill('c');
  await page.getByTestId('existing-search-btn').click();
  await expect(page.getByTestId('existing-no-account')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /search again/i }).click();
  await page.getByTestId('existing-search').fill(env.accounts.clientA.email.toUpperCase());
  await page.getByTestId('existing-search-btn').click();
  const detail = page.getByTestId('existing-detail');
  await expect(detail).toBeVisible({ timeout: 15_000 });
  await expect(detail).toContainText('Client Aya');
  await expect(detail).not.toContainText('Coach Amira');
  await expect(detail).not.toContainText('+20100000000');
  await shot(page, testInfo, '13-add-existing-minimal');
});

test('coach: renewal is prefilled with the current price and archives the previous term; the list shows coaching state', async ({ as, db }, testInfo) => {
  const relId = `${COACH_A}__${CLIENT_A}`;
  const before = await db.findOne<{ subscription: Record<string, unknown>; subscriptionHistory?: unknown[] }>('coachClients', { _id: relId });
  try {
    const { page } = await as('coachA');
    await page.goto(`/coach/client/${CLIENT_A}/subscription`);
    await expect(page.getByTestId('sub-set-term')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('sub-set-term').click();
    await expect(page.getByTestId('term-price')).toHaveValue(String(before?.subscription.price ?? '800'));
    await expect(page.getByTestId('term-end-preview')).toBeVisible();
    await shot(page, testInfo, '14-renewal-prefilled');
    await page.getByTestId('term-save').click();
    await expect.poll(async () => ((await db.findOne<{ subscriptionHistory?: { price?: number }[] }>('coachClients', { _id: relId }))?.subscriptionHistory ?? []).length, { timeout: 20_000 }).toBe((before?.subscriptionHistory?.length ?? 0) + 1);
    const after = await db.findOne<{ subscriptionHistory: { price?: number }[] }>('coachClients', { _id: relId });
    expect(after?.subscriptionHistory.at(-1)?.price).toBe(before?.subscription.price);

    await page.goto('/coach/clients');
    await expect(page.getByTestId('client-coaching-state').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('client-coaching-state').first()).toHaveText(/active|trial|paused|expir|no plan|pending/i);
    await shot(page, testInfo, '15-client-list-coaching-state');
  } finally {
    if (before) await db.updateOne('coachClients', { _id: relId }, { $set: { subscription: before.subscription, subscriptionHistory: before.subscriptionHistory ?? [] } });
  }
});

test('coach session makes no client sync calls (client runtime is client-only)', async ({ as }) => {
  const { page } = await as('coachA');
  const syncCalls: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/trpc\/[^?]*sync\./.test(r.url())) syncCalls.push(r.url());
  });
  await page.goto('/coach/clients');
  await expect(page.getByTestId('coach-add-client').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  expect(syncCalls).toEqual([]);
});

// Keep the type import used.
export type _Ctx = BrowserContext;
