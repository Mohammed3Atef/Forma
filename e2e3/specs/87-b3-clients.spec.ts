import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page, type Route } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany } from './_c-helpers';
import { confirmYes } from './_b-helpers';
import { procsOf } from './_d-helpers';

/**
 * B3.3 — the coach's Clients directory (blueprint §6.2, owner brief
 * 2026-10-17). Rules: docs/product-audit/B3_CLIENTS_DIRECTORY.md.
 *
 * Rosters: coachPro with no clients, coachB with its one seeded client, an
 * isolated mixed roster of 25 on coachPro (one client per package /
 * check-in / plan / activity state, plus a client taken over from another
 * coach whose old check-ins must not count), and 210 clients for the
 * many-clients layouts (backlog TB-07 / TB-08: 200+ rows). Everything
 * inserted here uses `e2e-dir-` ids and is removed in afterAll; the plan
 * capacity raised for 210 is put back.
 */
const COACH = 'e2e-coach-pro';
const PFX = 'e2e-dir-';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });

/** Day keys in the app's time zone (the browser runs in Africa/Cairo). */
const dayKey = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const plusDays = (k: string, n: number) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** The Saturday on or before the day — the app's Saturday → Friday training week. */
const weekStartOf = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return plusDays(k, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() - 6 + 7) % 7));
};

type CheckInFixture = 'mineSubmitted' | 'mineRequested' | 'mineOverdue' | 'mineReviewed' | 'otherCoach';
interface ClientFixture {
  id: string;
  name: string;
  /** null = no package at all. */
  sub?: Record<string, unknown> | null;
  /** Days ago of each finished workout. */
  workouts?: number[];
  plans?: { w: boolean; n: boolean };
  acct?: string;
  /** Days since this coach took the client on. */
  since?: number;
  checkIn?: CheckInFixture;
  unread?: string;
}

// ---- the mixed roster (25) ---------------------------------------------------------

const now0 = Date.now();
const term = (daysLeft: number, extra: Record<string, unknown> = {}) => ({ status: 'active', startAt: now0 - 10 * DAY, endAt: now0 + daysLeft * DAY - HOUR, ...extra });
const M = {
  review: { id: `${PFX}review`, name: 'Nadia Hassan', workouts: [0, 2, 4], checkIn: 'mineSubmitted' },
  awaiting: { id: `${PFX}awaiting`, name: 'Omar Fathy', workouts: [1, 3], checkIn: 'mineRequested' },
  overdue: { id: `${PFX}overdue`, name: 'Farah Adel', workouts: [2], checkIn: 'mineOverdue' },
  done: { id: `${PFX}done`, name: 'Tarek Samir', workouts: [0, 1, 2, 3, 5], checkIn: 'mineReviewed' },
  trial: { id: `${PFX}trial`, name: 'Rana Mostafa', workouts: [1], sub: term(12, { status: 'trial' }) },
  expiring: { id: `${PFX}expiring`, name: 'Laila Ibrahim', workouts: [0], sub: term(3) },
  paused: { id: `${PFX}paused`, name: 'Fady George', workouts: [9], sub: term(27, { status: 'frozen', frozenFrom: now0 - 2 * DAY, frozenUntil: now0 + 5 * DAY, freezeCredit: 7 * DAY }) },
  expired: { id: `${PFX}expired`, name: 'Hana Youssef', workouts: [6], sub: { status: 'active', startAt: now0 - 35 * DAY, endAt: now0 - 5 * DAY } },
  none: { id: `${PFX}none`, name: 'Youssef Adham', sub: null },
  pending: { id: `${PFX}pending`, name: 'Salma Reda', sub: { status: 'pending', startAt: now0 + 2 * DAY, endAt: now0 + 32 * DAY } },
  noPlan: { id: `${PFX}noplan`, name: 'Nour Ali', plans: { w: false, n: false } },
  noNutrition: { id: `${PFX}nonutrition`, name: 'Karim Wael', workouts: [1, 2], plans: { w: true, n: false } },
  // Taken over 3 days ago, mid-week: the previous coach's check-ins (last week's submitted, this week's requested) are not this coach's.
  handover: { id: `${PFX}handover`, name: 'Dina Sherif', workouts: [1], since: 3, checkIn: 'otherCoach' },
  suspended: { id: `${PFX}suspended`, name: 'Hany Lotfy', workouts: [2], acct: 'suspended' },
  message: { id: `${PFX}message`, name: 'Mona Khaled', workouts: [0], unread: 'Can we move Friday to Saturday?' },
  inactive: { id: `${PFX}inactive`, name: 'Ibrahim Saad', workouts: [10] },
  newbie: { id: `${PFX}newbie`, name: 'Qasim Nabil', since: 2 },
} satisfies Record<string, ClientFixture>;
const PLAIN: ClientFixture[] = [
  ['Ahmed Kamal', [0]],
  ['Mariam Saleh', [1, 4]],
  ['Mostafa Nabil', [2, 3, 6]],
  ['Yasmin Fouad', [3]],
  ['Sherif Hamdy', [5]],
  ['Aya Mahmoud', [0, 2]],
  ['Khaled Ramzy', [6]],
  ['Noha Samy', [1]],
].map(([name, workouts], i) => ({ id: `${PFX}plain${i + 1}`, name: name as string, workouts: workouts as number[] }));
const MIXED: ClientFixture[] = [...Object.values(M), ...PLAIN];
/** Who needs the coach (Today's queue): a check-in, a renewal, a lapse, no plan, a message, no workout in 10 days. */
const NEEDS = [M.review, M.expiring, M.expired, M.noPlan, M.message, M.inactive].map((c) => c.id);
/** Running package + active account + nothing asked this week by this coach. */
const ELIGIBLE = [M.trial, M.expiring, M.noPlan, M.noNutrition, M.handover, M.message, M.inactive, M.newbie, ...PLAIN].map((c) => c.id);
/** …of whom the server refuses Dina's week: her previous coach already holds it (CHECKIN_WEEK_TAKEN). */
const SENT = ELIGIBLE.filter((id) => id !== M.handover.id);
const INELIGIBLE = [M.paused, M.expired, M.none, M.pending, M.suspended].map((c) => c.id);

// ---- 210 clients ------------------------------------------------------------------

const FIRST = ['Adel', 'Basma', 'Dalia', 'Emad', 'Ghada', 'Hossam', 'Iman', 'Jana', 'Kamal', 'Lina', 'Maged', 'Nermeen', 'Omnia', 'Rami', 'Sahar'];
const LAST = ['Abdallah', 'Badawi', 'Darwish', 'Fahmy', 'Gaber', 'Hegazy', 'Ismail', 'Mansour', 'Naguib', 'Ragab', 'Saleh', 'Tawfik', 'Wahba', 'Zaki'];
const MANY: ClientFixture[] = Array.from({ length: FIRST.length * LAST.length }, (_, i) => ({
  id: `${PFX}many${String(i + 1).padStart(3, '0')}`,
  name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length)]}`,
  workouts: i % 3 === 0 ? [0] : i % 3 === 1 ? [2, 4] : [],
  since: i % 3 === 2 ? 3 : 20,
}));
const MANY_SORTED = MANY.map((c) => c.name).sort((a, b) => a.localeCompare(b));

async function insertRoster(clients: ClientFixture[]) {
  const now = Date.now();
  const today = dayKey(now);
  const w0 = weekStartOf(today);
  const users: object[] = [];
  const rels: object[] = [];
  const profiles: object[] = [];
  const workoutPlans: object[] = [];
  const nutritionPlans: object[] = [];
  const logs: object[] = [];
  const checkIns: object[] = [];
  const messages: object[] = [];
  for (const [i, c] of clients.entries()) {
    users.push({
      _id: c.id, email: `${c.id}@e2e.test`, emailLower: `${c.id}@e2e.test`, displayName: c.name, displayNameLower: c.name.toLowerCase(),
      role: 'client', accountStatus: c.acct ?? 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: `+2012200${String(i).padStart(5, '0')}`,
      passwordHash: 'not-a-login', createdBy: 'e2e-dir', createdAt: now - 40 * DAY, updatedAt: now,
    });
    const sub = c.sub === undefined ? term(20) : c.sub;
    rels.push({
      _id: `${COACH}__${c.id}`, coachId: COACH, clientId: c.id, status: 'active', createdBy: COACH, createdAt: now - (c.since ?? 20) * DAY, updatedAt: now,
      ...(sub ? { subscription: { months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now, ...sub } } : {}),
    });
    profiles.push({ _id: c.id, clientId: c.id, updatedAt: now, assessment: { status: 'reviewed', completed: true, submittedAt: now - 15 * DAY, reviewedAt: now - 14 * DAY, basic: { fullName: c.name } } });
    const plans = c.plans ?? { w: true, n: true };
    if (plans.w) workoutPlans.push({ _id: c.id, clientId: c.id, id: `wp-${c.id}`, name: 'Upper / lower', days: [{ id: 'd1', name: 'Upper', exerciseIds: [] }], exercises: {}, updatedAt: now - 15 * DAY });
    if (plans.n) nutritionPlans.push({ _id: c.id, clientId: c.id, name: 'Cut', targets: { calories: 2100 }, meals: [{ id: 'm1', name: { en: 'Breakfast', ar: 'فطار' }, items: [] }], updatedAt: now - 15 * DAY });
    for (const ago of c.workouts ?? []) {
      const date = dayKey(now - ago * DAY);
      logs.push({ _id: `${c.id}__workoutLogs__${date}`, clientId: c.id, collection: 'workoutLogs', recordId: date, data: { date, finished: true }, updatedAt: now, syncedAt: now, rev: 1 });
    }
    const base = { clientId: c.id, progressPhotos: {}, updatedAt: now };
    if (c.checkIn === 'mineSubmitted') checkIns.push({ ...base, _id: `${c.id}__${w0}`, coachId: COACH, weekStart: w0, weekEnd: plusDays(w0, 6), status: 'submitted', submittedAt: now - 5 * HOUR, currentWeight: 72.4, adherenceTraining: 85, notes: 'Felt strong on squats.', createdAt: now - DAY });
    if (c.checkIn === 'mineRequested') checkIns.push({ ...base, _id: `${c.id}__${w0}`, coachId: COACH, weekStart: w0, weekEnd: plusDays(w0, 6), status: 'requested', createdAt: now - DAY });
    if (c.checkIn === 'mineOverdue') checkIns.push({ ...base, _id: `${c.id}__${plusDays(w0, -7)}`, coachId: COACH, weekStart: plusDays(w0, -7), weekEnd: plusDays(w0, -1), status: 'requested', createdAt: now - 8 * DAY });
    if (c.checkIn === 'mineReviewed') checkIns.push({ ...base, _id: `${c.id}__${w0}`, coachId: COACH, weekStart: w0, weekEnd: plusDays(w0, 6), status: 'reviewed', submittedAt: now - 2 * DAY, reviewedAt: now - DAY, coachFeedback: 'Solid week.', createdAt: now - 3 * DAY });
    // The client's PREVIOUS coach: last week's submitted check-in and this week's request — never this coach's.
    if (c.checkIn === 'otherCoach') {
      checkIns.push({ ...base, _id: `${c.id}__${plusDays(w0, -7)}`, coachId: 'e2e-coach-b', weekStart: plusDays(w0, -7), weekEnd: plusDays(w0, -1), status: 'submitted', submittedAt: now - 6 * DAY, currentWeight: 61, notes: 'For my previous coach only', createdAt: now - 8 * DAY });
      checkIns.push({ ...base, _id: `${c.id}__${w0}`, coachId: 'e2e-coach-b', weekStart: w0, weekEnd: plusDays(w0, 6), status: 'requested', createdAt: now - 4 * DAY });
    }
    if (c.unread) messages.push({ _id: `${PFX}m-${c.id}`, clientId: c.id, coachId: COACH, fromUserId: c.id, fromRole: 'client', body: c.unread, seenAt: null, createdAt: now - 30 * 60_000, updatedAt: now });
  }
  for (const [col, docs] of [['users', users], ['coachClients', rels], ['clientProfiles', profiles], ['clientWorkoutPlans', workoutPlans], ['clientNutritionPlans', nutritionPlans], ['syncRecords', logs], ['checkIns', checkIns], ['messages', messages]] as const) {
    if (docs.length) await insertMany(col, docs as object[]);
  }
}

async function removeRoster(db: Db) {
  const re = { $regex: `^${PFX}` };
  await db.deleteMany('messages', { _id: re });
  for (const col of ['messages', 'coachClients', 'clientProfiles', 'syncRecords', 'checkIns', 'notifications', 'subscriptionRequests', 'transferRequests', 'planVersions', 'archivedClientData']) await db.deleteMany(col, { clientId: re });
  await db.deleteMany('clientWorkoutPlans', { _id: re });
  await db.deleteMany('clientNutritionPlans', { _id: re });
  await db.deleteMany('users', { _id: re });
}

// ---- page helpers -------------------------------------------------------------------

/** The language is a per-device setting: every new browser context switches its own. */
async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toMatch(label === 'English' ? /^en$/ : label === 'مصري' ? /^ar-eg$/ : /^ar$/);
  await page.waitForTimeout(600);
}

async function openClients(page: Page, qs = '') {
  await page.goto(`/coach/clients${qs}`);
  await ready(page);
  await expect(page.getByTestId('coach-clients')).toBeVisible();
}

const tableRows = (page: Page) => page.getByTestId('client-table-row');
const listRows = (page: Page) => page.getByTestId('coach-client-row');
const tableRow = (page: Page, id: string) => page.locator(`[data-testid="client-table-row"][data-client-id="${id}"]`);
const listRow = (page: Page, id: string) => page.locator(`[data-testid="coach-client-row"][data-client-id="${id}"]`);
const idsOf = async (page: Page, selector: string) => (await page.locator(selector).evaluateAll((els) => els.map((e) => e.getAttribute('data-client-id') ?? ''))).sort();
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * Fail only the named procedures inside tRPC's batched request — the other
 * answers in the same batch still arrive (a whole-batch 500 would fail
 * sources the test means to keep).
 */
async function failProcs(page: Page, procs: string[]) {
  const handler = async (route: Route) => {
    const names = procsOf(route.request().url());
    if (!names.some((p) => procs.includes(p))) return route.continue();
    const res = await route.fetch();
    const body = await res.json().catch(() => null);
    const answers = Array.isArray(body) ? body : names.map(() => body);
    const out = names.map((p, i) => (procs.includes(p) ? { error: { message: 'e2e: forced failure', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500, path: p } } } : answers[i]));
    await route.fulfill({ status: 207, contentType: 'application/json', body: JSON.stringify(out) });
  };
  await page.route(/\/api\/trpc\//, handler);
  return () => page.unroute(/\/api\/trpc\//, handler);
}

async function axeScan(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
}

/** Screenshots for docs/product-audit/B3_VISUAL_QA.md (§B3.3), with the page's horizontal overflow and direction. */
function visualSink(testInfo: import('@playwright/test').TestInfo) {
  const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b33-visual');
  fs.mkdirSync(outDir, { recursive: true });
  const captured: { file: string; overflow: number; dir: string }[] = [];
  return {
    captured,
    async capture(page: Page, name: string) {
      await page.waitForTimeout(400);
      const file = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir }));
      captured.push({ file: path.basename(file), ...m });
    },
    async finish(label: string) {
      const index = path.join(outDir, `${label}.json`);
      fs.writeFileSync(index, JSON.stringify(captured, null, 2));
      await testInfo.attach(`${label}.json`, { body: JSON.stringify({ dir: outDir, captured }, null, 2), contentType: 'application/json' });
      expect(captured.filter((c) => c.overflow > 0), 'no horizontal overflow').toEqual([]);
      for (const c of captured) expect(c.dir, c.file).toBe(/-en(-|\.png$)/.test(c.file) ? 'ltr' : 'rtl');
    },
  };
}

// ====================================================================================

test.describe('B3.3 Clients — no clients, one client, old URLs', () => {
  test('no clients: an invitation to add the first one — no search, filters or table', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const sink = visualSink(testInfo);
    for (const lang of ['en', 'ar'] as const) {
      for (const [w, h] of [[390, 844], [1440, 900]] as const) {
        const { page } = await as('coachPro', w === 390 ? phone : sized(w, h));
        if (lang === 'ar') await setLanguage(page, 'العربية');
        try {
          await openClients(page);
          await expect(page.getByTestId('clients-empty')).toBeVisible();
          await expect(page.getByTestId('coach-clients-search')).toHaveCount(0);
          await expect(page.getByTestId('clients-filters-button')).toHaveCount(0);
          await expect(page.getByTestId('coach-desktop-clients')).toHaveCount(0);
          await sink.capture(page, `empty-${w}-${lang}`);
          if (lang === 'en' && w === 390) {
            await page.getByTestId('clients-empty').getByRole('button', { name: 'Add client' }).click();
            await expect(page.getByTestId('add-client-chooser')).toBeVisible();
          }
        } finally {
          if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
        }
      }
    }
    await sink.finish('b33-empty');
  });

  test('one client: name and package, never contact details; search covers email and phone; the row opens the client', async ({ as, env, audit }) => {
    allowDevModuleStorm(audit);
    const bilal = env.accounts.clientB;
    const mobile = (await as('coachB', phone)).page;
    await openClients(mobile);
    await expect(listRows(mobile)).toHaveCount(1);
    const row = listRow(mobile, bilal.id);
    await expect(row).toContainText('Client Bilal');
    await expect(row.getByTestId('client-coaching-state')).toHaveText('Active');
    await expect(mobile.getByTestId('coach-clients')).not.toContainText(bilal.email);
    await expect(mobile.getByTestId('coach-clients')).not.toContainText('+201000000007');
    await row.click();
    await expect(mobile).toHaveURL(new RegExp(`/coach/client/${bilal.id}$`));

    const desk = (await as('coachB', sized(1440))).page;
    await openClients(desk);
    await expect(tableRows(desk)).toHaveCount(1);
    await expect(desk.getByTestId('coach-desktop-clients')).not.toContainText('@e2e.test');
    const search = desk.getByTestId('coach-clients-search');
    await search.fill('client.b@');
    await expect(tableRow(desk, bilal.id)).toBeVisible();
    await expect(desk).toHaveURL(/q=client\.b%40/);
    await search.fill('1000000007');
    await expect(tableRow(desk, bilal.id)).toBeVisible();
    await search.fill('nobody-by-this-name');
    await expect(desk.getByTestId('clients-no-match')).toBeVisible();
    await desk.getByTestId('clients-no-match').getByRole('button', { name: 'Clear filters' }).click();
    await expect(tableRows(desk)).toHaveCount(1);
    await expect(desk).toHaveURL(/\/coach\/clients$/);
  });

  test('old URLs still work: /coach/checkins → weekly check-ins, /coach/adherence → sorted by workouts', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachB', sized(1440));
    await page.goto('/coach/checkins');
    await expect(page).toHaveURL(/\/coach\/clients\?view=checkins$/);
    await ready(page);
    await expect(page.getByTestId('checkins-view')).toBeVisible();
    await expect(page.getByTestId('clients-view-checkins')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/coach/adherence');
    await expect(page).toHaveURL(/\/coach\/clients\?sort=workouts$/);
    await ready(page);
    await expect(page.locator('th', { has: page.getByTestId('clients-sort-workouts') })).toHaveAttribute('aria-sort', 'ascending');
  });

  test('O-4: closing Add client never revokes a link; the coach still can', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const started = Date.now();
    const { page } = await as('coachPro', sized(1440));
    try {
      await openClients(page);
      await page.getByTestId('coach-add-client').click();
      await page.getByTestId('add-choose-create').click();
      await expect(page.getByTestId('coach-invite-panel')).toBeVisible();
      await page.getByTestId('coach-invite-generate').click();
      const inviteRow = page.getByTestId('coach-invite-row').first();
      await expect(inviteRow).toBeVisible();
      const code = (await inviteRow.getAttribute('data-code'))!;
      // Close without copying or sharing — the old sheet silently revoked such links (CO-37).
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('coach-invite-panel')).toHaveCount(0);
      await page.waitForTimeout(800);
      expect(await db.findOne('signupInvites', { _id: code, status: 'pending' }), 'the link is still valid').toBeTruthy();
      await page.getByTestId('coach-add-client').click();
      await page.getByTestId('add-choose-create').click();
      const again = page.locator(`[data-testid="coach-invite-row"][data-code="${code}"]`);
      await expect(again).toBeVisible();
      await again.getByTestId('coach-invite-revoke').click();
      await expect(again).toHaveCount(0);
      expect(await db.findOne('signupInvites', { _id: code, status: 'revoked' })).toBeTruthy();
    } finally {
      await db.deleteMany('signupInvites', { coachId: COACH, createdAt: { $gte: started } });
    }
  });

  test('your transfer requests: status, Cancel while pending — the current coach is never named', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const now = Date.now();
    const ids = [`${COACH}__e2e-client-a`, `${COACH}__e2e-client-b`];
    await db.deleteMany('transferRequests', { _id: { $in: ids } });
    await db.insertOne('transferRequests', { _id: ids[0], clientId: 'e2e-client-a', fromCoachId: 'e2e-coach-a', toCoachId: COACH, mode: 'keep_plans', reason: 'Moving to my gym', status: 'pending', requestedAt: now - 2 * HOUR, updatedAt: now - 2 * HOUR });
    await db.insertOne('transferRequests', { _id: ids[1], clientId: 'e2e-client-b', fromCoachId: 'e2e-coach-b', toCoachId: COACH, mode: 'fresh', status: 'rejected', requestedAt: now - 3 * DAY, reviewedAt: now - DAY, updatedAt: now - DAY });
    try {
      const { page } = await as('coachPro', sized(1440));
      const listed = page.waitForResponse((r) => procsOf(r.url()).includes('transfers.list') && r.url().includes('outgoing'));
      await openClients(page);
      const body = await (await listed).text();
      expect(body, 'the payload never says who coaches the client now').not.toMatch(/e2e-coach-a|e2e-coach-b|fromCoachId/);
      const section = page.getByTestId('outgoing-transfers');
      await expect(section.getByTestId('outgoing-transfer-row')).toHaveCount(2);
      const pending = section.locator('[data-testid="outgoing-transfer-row"][data-client-id="e2e-client-a"]');
      await expect(pending).toContainText('Client Aya');
      await expect(pending.getByTestId('outgoing-transfer-status')).toHaveText('Waiting for their current coach');
      await expect(section.locator('[data-client-id="e2e-client-b"]').getByTestId('outgoing-transfer-status')).toHaveText('Declined');
      await expect(section).not.toContainText(/Coach Amira|Coach Basem|@e2e\.test/);
      await shot(page, testInfo, 'outgoing-transfers-1440');
      await pending.getByTestId('outgoing-transfer-cancel').click();
      await confirmYes(page);
      await expect(pending.getByTestId('outgoing-transfer-status')).toHaveText('Cancelled');
      await expect(pending.getByTestId('outgoing-transfer-cancel')).toHaveCount(0);
      expect(await db.findOne('transferRequests', { _id: ids[0], status: 'cancelled' })).toBeTruthy();
    } finally {
      await db.deleteMany('transferRequests', { _id: { $in: ids } });
    }
  });
});

test.describe('B3.3 Clients — a mixed roster of 25', () => {
  test.beforeAll(async ({ db }) => {
    await removeRoster(db); // a crashed earlier run must not leak into this one
    await insertRoster(MIXED);
  });
  test.afterAll(async ({ db }) => {
    await removeRoster(db);
  });

  test('every state comes from stored data: package, account, check-in, activity, plans', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openClients(page);
    await expect(tableRows(page)).toHaveCount(25);
    const pill = (id: string) => tableRow(page, id).getByTestId('client-coaching-state');
    await expect(pill(M.trial.id)).toHaveText('Trial');
    await expect(pill(M.expiring.id)).toHaveText('Ends in 3d');
    await expect(pill(M.paused.id)).toHaveText('Paused');
    await expect(pill(M.expired.id)).toHaveText('Expired');
    await expect(pill(M.none.id)).toHaveText('No package');
    await expect(pill(M.pending.id)).toHaveText('Pending');
    for (const c of [M.review, M.noPlan, M.handover, M.suspended, ...PLAIN]) await expect(pill(c.id), c.name).toHaveText('Active');
    // The account, not the package: never confusable with a paused package (owner, B3.3).
    await expect(tableRow(page, M.suspended.id).getByTestId('client-account-warning')).toHaveText('Account frozen');
    await expect(page.getByTestId('client-account-warning')).toHaveCount(1);

    // The row's next action is exactly Today's reason; clients with nothing to do show a dash.
    await expect(tableRow(page, M.review.id)).toContainText('Check-in for the week of');
    await expect(tableRow(page, M.expiring.id)).toContainText('Package ends in 3 days');
    await expect(tableRow(page, M.expired.id)).toContainText('Package ended 5 days ago');
    await expect(tableRow(page, M.noPlan.id)).toContainText('no training or nutrition plan yet');
    await expect(tableRow(page, M.message.id)).toContainText('Can we move Friday to Saturday?');
    await expect(tableRow(page, M.inactive.id)).toContainText('No workout in 10 days');
    // Taken over 3 days ago: the previous coach's submitted check-in is not this coach's to review.
    await expect(tableRow(page, M.handover.id)).not.toContainText(/check-in/i);
    // Taken on 2 days ago, nothing logged yet: "no workout logged yet" — not a false "inactive".
    // (The table's Last workout column uses the short forms — its header says "Last workout".)
    await expect(tableRow(page, M.newbie.id)).toContainText('None yet');
    await expect(tableRow(page, M.newbie.id)).not.toContainText('No workout in');
    await expect(tableRow(page, M.done.id)).toContainText('Today');
    await expect(tableRow(page, PLAIN[1].id)).toContainText('Yesterday');
    await expect(tableRow(page, PLAIN[4].id)).toContainText('5 days ago');

    await expect(page.getByTestId('clients-task-all')).toContainText('25');
    await expect(page.getByTestId('clients-task-needs')).toContainText(String(NEEDS.length));
    await expect(page.getByTestId('clients-task-checkin')).toContainText('1');
    await expect(page.getByTestId('clients-task-renewal')).toContainText('1');
    await expect(page.getByTestId('clients-task-lapsed')).toContainText('1');
    // 25 of 25: adding is blocked (B0 capacity), and says where to add capacity.
    await expect(page.getByTestId('coach-client-usage')).toContainText('25');
    await expect(page.getByTestId('coach-client-limit')).toBeVisible();
    // Privacy: no email or phone in the directory.
    await expect(page.getByTestId('coach-desktop-clients')).not.toContainText(/@e2e\.test|\+20122/);
    await shot(page, testInfo, 'clients-mixed-1440');
  });

  test('"Needs you" is exactly Today\'s queue — the same clients, for the same reasons', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/dashboard');
    await ready(page);
    await expect(page.getByTestId('today-summary')).toHaveText(`${NEEDS.length} things need you`);
    const today = [...new Set(await idsOf(page, '[data-testid="today-item"]'))].sort();
    expect(today).toEqual([...NEEDS].sort());
    await openClients(page, '?task=needs');
    await expect(tableRows(page)).toHaveCount(NEEDS.length);
    expect(await idsOf(page, '[data-testid="client-table-row"]')).toEqual(today);
    // Sorted by Today's priority: the check-in first.
    await expect(tableRows(page).first()).toHaveAttribute('data-client-id', M.review.id);
  });

  test('filters and sorting live in the URL — deep links, reload and Back keep the view', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openClients(page);
    await page.getByTestId('clients-filters-button').click();
    await page.getByTestId('filter-state-expiring').click();
    await page.getByTestId('filters-done').click();
    await expect(page).toHaveURL(/state=expiring/);
    await expect(tableRows(page)).toHaveCount(1);
    await expect(tableRow(page, M.expiring.id)).toBeVisible();
    await expect(page.getByTestId('clients-filters-button')).toContainText('Filter & sort · 1');
    await page.reload();
    await ready(page);
    await expect(tableRows(page)).toHaveCount(1);
    // Open the client, come Back: the filtered view is still there.
    await tableRow(page, M.expiring.id).getByTestId('client-open').click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${M.expiring.id}$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/coach\/clients\?state=expiring$/);
    await expect(tableRows(page)).toHaveCount(1);

    const deep: [string, string[]][] = [
      ['?state=paused', [M.paused.id]],
      ['?state=none', [M.none.id]],
      ['?state=pending', [M.pending.id]],
      ['?state=trial', [M.trial.id]],
      ['?checkin=review', [M.review.id]],
      ['?checkin=overdue', [M.overdue.id]],
      ['?checkin=awaiting', [M.awaiting.id]],
      ['?checkin=done', [M.done.id]],
      ['?plan=noWorkout', [M.noPlan.id]],
      ['?plan=noNutrition', [M.noPlan.id, M.noNutrition.id]],
      ['?task=renewal', [M.expiring.id]],
      ['?task=lapsed', [M.expired.id]],
      ['?q=nour&task=needs', [M.noPlan.id]],
      [`?q=${PFX}nonutrition`, [M.noNutrition.id]],
    ];
    for (const [qs, want] of deep) {
      await openClients(page, qs);
      await expect(tableRows(page), qs).toHaveCount(want.length);
      expect(await idsOf(page, '[data-testid="client-table-row"]'), qs).toEqual([...want].sort());
    }
    // A filter with no matches is said plainly, with a way out.
    await openClients(page, '?state=paused&checkin=review');
    await expect(page.getByTestId('clients-no-match')).toBeVisible();

    // Sorting from the column headers (aria-sort), toggling direction; unknowns never sort first.
    await openClients(page);
    const first = () => tableRows(page).first();
    await page.getByTestId('clients-sort-name').click();
    await expect(page).toHaveURL(/sort=name/);
    await expect(first()).toContainText('Ahmed Kamal');
    await expect(page.locator('th', { has: page.getByTestId('clients-sort-name') })).toHaveAttribute('aria-sort', 'ascending');
    await page.getByTestId('clients-sort-name').click();
    await expect(page).toHaveURL(/sort=name&dir=desc|dir=desc&sort=name/);
    await expect(first()).toContainText('Youssef Adham');
    await page.getByTestId('clients-sort-workouts').click();
    await expect(first()).toContainText(M.done.name); // five workouts this week
    await page.getByTestId('clients-sort-daysLeft').click();
    await expect(first()).toContainText(M.expiring.name);
    await expect(tableRows(page).last().getByTestId('client-coaching-state')).toHaveText(/Paused|Expired|No package|Pending/);
  });

  test('desktop: a dense table with no horizontal scroll at 1024 / 1280 / 1440, keyboard and row menu', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    for (const w of [1024, 1280, 1440]) {
      const { page } = await as('coachPro', sized(w, 900));
      await openClients(page);
      await expect(tableRows(page)).toHaveCount(25);
      expect(await overflowOf(page), `${w}px`).toBeLessThanOrEqual(0);
      const table = page.getByTestId('coach-desktop-clients');
      expect(await table.evaluate((t) => t.scrollWidth - t.clientWidth), `${w}px table`).toBeLessThanOrEqual(0);
      // Column priority instead of a scroll: Workouts (7d) folds under Last workout below 1280.
      await expect(page.getByTestId('clients-sort-workouts')).toBeVisible({ visible: w >= 1280 });
      if (w === 1440) {
        // (A client without unread messages — opening Mona's thread would mark it read for the tests after this one.)
        const ahmed = PLAIN[0].id;
        await tableRow(page, ahmed).getByTestId('client-open').focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new RegExp(`/coach/client/${ahmed}$`));
        await page.goBack();
        await tableRow(page, ahmed).getByTestId('client-row-menu').click();
        await page.getByRole('menuitem', { name: 'Message' }).click();
        await expect(page).toHaveURL(new RegExp(`/coach/messages/${ahmed}$`));
      }
    }
  });

  test('phone and tablet: the list shows 20, then Show more; a row opens the client', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    for (const ctx of [phone, sized(768, 1024)]) {
      const { page } = await as('coachPro', ctx);
      await openClients(page);
      await expect(listRows(page)).toHaveCount(20);
      await expect(page.getByTestId('clients-load-more')).toHaveText('Show more (5)');
      await page.getByTestId('clients-load-more').click();
      await expect(listRows(page)).toHaveCount(25);
      await expect(page.getByTestId('clients-load-more')).toHaveCount(0);
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
      await expect(page.getByTestId('coach-clients')).not.toContainText(/@e2e\.test|\+20122/);
      await listRow(page, M.inactive.id).click();
      await expect(page).toHaveURL(new RegExp(`/coach/client/${M.inactive.id}$`));
    }
  });

  test('a source that fails says so — never a false "inactive" or "no plan"; Retry recovers', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    const restore = await failProcs(page, ['coachClients.dashboardSummaries']);
    await openClients(page);
    await expect(tableRows(page)).toHaveCount(25);
    await expect(page.getByTestId('clients-partial')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('coach-desktop-clients')).not.toContainText(/No workout in|no training or nutrition plan|None yet/);
    await page.getByTestId('clients-filters-button').click();
    await expect(page.getByTestId('filter-plan-noWorkout')).toBeDisabled();
    await page.getByTestId('filters-done').click();
    await restore();
    await page.getByTestId('clients-partial').getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('clients-partial')).toHaveCount(0);
    await expect(tableRow(page, M.inactive.id)).toContainText('No workout in 10 days');
  });

  test('the roster failing is an error with Retry — never "no clients"', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    const restore = await failProcs(page, ['coachClients.listMyClientUsers']);
    await page.goto('/coach/clients');
    await expect(page.getByTestId('coach-clients-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('clients-empty')).toHaveCount(0);
    await restore();
    await page.getByTestId('coach-clients-error').getByRole('button', { name: 'Retry' }).click();
    await expect(tableRows(page)).toHaveCount(25);
  });

  test('offline: the last loaded list stays, marked offline; Add client waits for the network', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page, context } = await as('coachPro', phone);
    await openClients(page);
    await expect(listRows(page)).toHaveCount(20);
    await context.setOffline(true);
    try {
      await expect(page.getByTestId('clients-stale')).toContainText("You're offline");
      await expect(listRows(page)).toHaveCount(20);
      await expect(page.getByTestId('coach-add-client')).toBeDisabled();
      await expect(page.getByTestId('clients-empty')).toHaveCount(0);
      await shot(page, testInfo, 'clients-offline-390');
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByTestId('clients-stale')).toHaveCount(0);
  });

  test('Arabic: a right-to-left directory with translated states, chips and columns', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await setLanguage(page, 'العربية');
    try {
      await openClients(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.coachClients.title);
      await expect(tableRow(page, M.trial.id).getByTestId('client-coaching-state')).toHaveText(ar.coachClients.state.trial);
      await expect(tableRow(page, M.none.id).getByTestId('client-coaching-state')).toHaveText(ar.coachClients.state.none);
      await expect(tableRow(page, M.expiring.id).getByTestId('client-coaching-state')).toHaveText(ar.coachClients.endsIn_few.replace('{{count}}', '3')); // 3 is Arabic's "few" form
      await expect(page.getByTestId('clients-task-needs')).toContainText(ar.coachClients.task.needs);
      await expect(page.getByTestId('clients-sort-name')).toHaveText(ar.coachClients.col.client);
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
      // The table's first column sits on the right in RTL.
      const box = await page.getByTestId('clients-sort-name').boundingBox();
      const vw = page.viewportSize()!.width;
      expect(box!.x).toBeGreaterThan(vw / 2);
      await shot(page, testInfo, 'clients-ar-1440');
      await openClients(page, '?view=checkins');
      await expect(page.getByTestId('checkins-view')).toContainText(ar.coachClients.checkins.title);
    } finally {
      await setLanguage(page, 'English').catch(() => undefined);
    }
  });

  test('accessibility: list, filters, table and weekly check-ins have no axe violations (WCAG 2.1 A / AA, EN + AR)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const found: Record<string, Awaited<ReturnType<typeof axeScan>>> = {};
    for (const lang of ['en', 'ar'] as const) {
      const mobile = (await as('coachPro', phone)).page;
      if (lang === 'ar') await setLanguage(mobile, 'العربية');
      try {
        await openClients(mobile);
        found[`${lang}-390-list`] = await axeScan(mobile);
        await mobile.getByTestId('clients-filters-button').click();
        await expect(mobile.getByTestId('clients-filters')).toBeVisible();
        found[`${lang}-390-filters`] = await axeScan(mobile);
      } finally {
        if (lang === 'ar') await setLanguage(mobile, 'English').catch(() => undefined);
      }
      const desk = (await as('coachPro', sized(1440))).page;
      if (lang === 'ar') await setLanguage(desk, 'العربية');
      try {
        await openClients(desk);
        found[`${lang}-1440-table`] = await axeScan(desk);
        await openClients(desk, '?view=checkins');
        await expect(desk.getByTestId('checkins-view')).toBeVisible();
        found[`${lang}-1440-checkins`] = await axeScan(desk);
      } finally {
        if (lang === 'ar') await setLanguage(desk, 'English').catch(() => undefined);
      }
    }
    await testInfo.attach('axe-clients.json', { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
    expect(Object.entries(found).filter(([, v]) => v.length > 0)).toEqual([]);
  });

  test('visual QA matrix: 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR (+ Egyptian Arabic): list, filters, weekly check-ins', async ({ as, audit }, testInfo) => {
    test.setTimeout(900_000);
    allowDevModuleStorm(audit);
    const sink = visualSink(testInfo);
    const widths: [number, number][] = [[360, 780], [390, 844], [430, 932], [768, 1024], [1024, 800], [1440, 900]];
    for (const lang of ['en', 'ar', 'ar-eg'] as const) {
      for (const [w, h] of lang === 'ar-eg' ? widths.filter(([x]) => x === 390 || x === 1440) : widths) {
        const { page } = await as('coachPro', w === 390 ? phone : sized(w, h));
        if (lang !== 'en') await setLanguage(page, lang === 'ar' ? 'العربية' : 'مصري');
        try {
          await openClients(page);
          await sink.capture(page, `list-${w}-${lang}`);
          if (lang !== 'ar-eg' && (w === 390 || w === 1440)) {
            await openClients(page, '?view=checkins');
            await expect(page.getByTestId('checkins-view')).toBeVisible();
            await sink.capture(page, `checkins-${w}-${lang}`);
          }
          if (lang !== 'ar-eg' && w === 390) {
            await openClients(page);
            await page.getByTestId('clients-filters-button').click();
            await expect(page.getByTestId('clients-filters')).toBeVisible();
            await sink.capture(page, `filters-${w}-${lang}`);
          }
        } finally {
          if (lang !== 'en') await setLanguage(page, 'English').catch(() => undefined);
        }
      }
    }
    await sink.finish('b33-mixed');
  });

  test('weekly check-ins: this coach\'s groups; the bulk request reaches only eligible clients; review in order', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const w0 = weekStartOf(dayKey(Date.now()));
    const { page } = await as('coachPro', sized(1440));
    await openClients(page, '?view=checkins');
    const group = (g: string) => page.getByTestId(`checkins-group-${g}`).getByTestId('checkins-row');
    await expect(group('review')).toHaveCount(1);
    await expect(page.getByTestId('checkins-group-review').locator(`[data-client-id="${M.review.id}"]`)).toBeVisible();
    await expect(group('overdue')).toHaveCount(1);
    await expect(group('awaiting')).toHaveCount(1);
    await expect(group('done')).toHaveCount(1);
    await expect(group('notRequested')).toHaveCount(21);
    // The previous coach's submitted check-in: not to review — Dina simply hasn't been asked this week.
    await expect(page.getByTestId('checkins-group-notRequested').locator(`[data-client-id="${M.handover.id}"]`)).toBeVisible();
    await shot(page, testInfo, 'checkins-before-1440');

    const request = page.getByTestId('checkins-request-week');
    await expect(request).toContainText(`(${ELIGIBLE.length})`);
    await request.click();
    await expect(page.getByTestId('confirm-dialog')).toContainText(`${ELIGIBLE.length} clients`);
    await confirmYes(page);
    await expect(page.getByText(`Check-in requested from ${SENT.length} clients`)).toBeVisible();
    // Dina's week is held by her previous coach: said plainly, not counted as sent, not a "try again".
    const told = page.getByTestId('confirm-dialog');
    await expect(told).toContainText("1 client already has this week's check-in from their previous coach");
    await expect(told).not.toContainText("didn't go through");
    await told.getByTestId('confirm-accept').click();
    await expect.poll(() => db.count('checkIns', { clientId: { $in: SENT }, weekStart: w0, coachId: COACH, status: 'requested' })).toBe(SENT.length);
    expect(await db.findOne('checkIns', { _id: `${M.handover.id}__${w0}` }), "the previous coach's week is left as it was").toMatchObject({ coachId: 'e2e-coach-b', status: 'requested' });
    expect(await db.count('checkIns', { clientId: { $in: INELIGIBLE }, weekStart: w0 }), 'paused / expired / no package / pending / frozen account are never asked').toBe(0);
    await expect(group('awaiting')).toHaveCount(SENT.length + 1);
    await expect(group('notRequested')).toHaveCount(INELIGIBLE.length + 1);
    await expect(request).toContainText('(1)');

    await page.getByTestId('start-review-queue').click();
    const panel = page.getByTestId('review-queue-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('review-queue-progress')).toHaveText('1 of 1');
    await expect(panel).toContainText('Felt strong on squats.');
    await panel.getByTestId('review-feedback').fill('Great week — same plan, add one walk.');
    await panel.getByTestId('review-mark-next').click();
    await expect(panel).toHaveCount(0);
    expect(await db.findOne('checkIns', { _id: `${M.review.id}__${w0}`, status: 'reviewed', coachFeedback: 'Great week — same plan, add one walk.' })).toBeTruthy();
    await expect(page.getByTestId('checkins-group-review')).toHaveCount(0);
    await expect(group('done')).toHaveCount(2);
    await expect(page.getByTestId('start-review-queue')).toHaveCount(0);
  });
});

test.describe('B3.3 Clients — 210 clients', () => {
  let plan: Record<string, unknown> | null = null;
  test.beforeAll(async ({ db }) => {
    await removeRoster(db);
    plan = await db.findOne('coachPlans', { _id: COACH });
    await db.updateOne('coachPlans', { _id: COACH }, { $set: { maxClients: 250, baseMaxClients: 250 } });
    await insertRoster(MANY);
  });
  test.afterAll(async ({ db }) => {
    await removeRoster(db);
    if (plan) await db.updateOne('coachPlans', { _id: COACH }, { $set: { maxClients: plan.maxClients, baseMaxClients: plan.baseMaxClients } });
  });

  test('desktop: pages of 50; sorting spans every page; no horizontal scroll; payload stays small', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    const sizes: Record<string, number> = {};
    page.on('response', async (r) => {
      const procs = procsOf(r.url());
      if (procs.includes('coachClients.list') || procs.includes('coachClients.listMyClientUsers')) sizes[procs.join(',')] = (await r.body().catch(() => Buffer.alloc(0))).length;
    });
    const t0 = Date.now();
    await openClients(page);
    await expect(tableRows(page)).toHaveCount(50);
    const firstPaint = Date.now() - t0;
    const N = MANY.length;
    const pages = Math.ceil(N / 50);
    await expect(page.getByTestId('pagination-status')).toHaveText(`Page 1 / ${pages}`);
    await expect(page.getByTestId('coach-client-usage')).toContainText(String(N));
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    await page.getByTestId('clients-sort-name').click();
    await expect(tableRows(page).first()).toContainText(MANY_SORTED[0]);
    await page.getByTestId('pagination-next').click();
    await expect(page.getByTestId('pagination-status')).toHaveText(`Page 2 / ${pages}`);
    await expect(tableRows(page).first()).toContainText(MANY_SORTED[50]);
    for (let p = 3; p <= pages; p++) await page.getByTestId('pagination-next').click();
    await expect(page.getByTestId('pagination-status')).toHaveText(`Page ${pages} / ${pages}`);
    await expect(tableRows(page)).toHaveCount(N - (pages - 1) * 50);
    await expect(tableRows(page).last()).toContainText(MANY_SORTED[N - 1]);
    // A new sort or filter starts again at page 1.
    await page.getByTestId('clients-sort-name').click();
    await expect(page.getByTestId('pagination-status')).toHaveText(`Page 1 / ${pages}`);
    await expect(tableRows(page).first()).toContainText(MANY_SORTED[N - 1]);
    await shot(page, testInfo, `clients-${N}-1440`);
    await testInfo.attach(`clients-${N}-metrics.json`, { body: JSON.stringify({ clients: N, firstPaintMs: firstPaint, responseBytes: sizes }, null, 2), contentType: 'application/json' });
    // The first batched request carries the roster, relationships, summaries and check-ins together.
    const first = Object.entries(sizes).find(([k]) => k.split(',').includes('coachClients.listMyClientUsers'))?.[1];
    if (first != null) expect(first / N, 'bytes per client in the first data batch').toBeLessThan(1_500);
  });

  test('phone: Show more in steps of 20 up to the whole roster; search narrows all of it', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const sink = visualSink(testInfo);
    const { page } = await as('coachPro', phone);
    await openClients(page);
    await expect(listRows(page)).toHaveCount(20);
    await sink.capture(page, 'many-390-en');
    for (let shown = 20; shown < MANY.length; ) {
      await page.getByTestId('clients-load-more').click();
      shown = Math.min(shown + 20, MANY.length);
      await expect(listRows(page)).toHaveCount(shown);
    }
    await expect(page.getByTestId('clients-load-more')).toHaveCount(0);
    await page.getByTestId('coach-clients-search').fill(MANY[117].name);
    await expect(listRows(page)).toHaveCount(1);
    await expect(listRow(page, MANY[117].id)).toBeVisible();
    const desk = (await as('coachPro', sized(1440))).page;
    await openClients(desk);
    await sink.capture(desk, 'many-1440-en');
    await sink.finish('b33-many');
  });
});
