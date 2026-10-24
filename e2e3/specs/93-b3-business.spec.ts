import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page, type TestInfo } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';
import { cairoDay, cairoMonth } from './_dates';

/**
 * B3.8 — Coach Me / Business (blueprint §6.7, owner decisions D1–D8, Journey J): Business (this
 * month in Booked · Due · Lost per currency, renewals and lapsed clients with Renew on the row,
 * packages with Move up / down, row-level exports with a date range), Forma subscription (one status
 * card, one capacity count — the server's), Account & preferences (saved / failed per field, kept
 * input, Retry, named currencies, a time-zone picker), the Me hub, and the old URLs; EN / AR / AR-EG,
 * 360–1440, axe.
 *
 * A coach this spec creates (`e2e-biz-coach`) holds every fixture, so each figure is exact; the
 * fixtures are re-seeded before every test (a renewal or an account edit never leaks into the next)
 * and removed afterwards. Dates hang off this month's first / last day, so the figures don't depend
 * on the day the suite runs.
 */
const PFX = 'e2e-biz-';
const COACH = { id: `${PFX}coach`, label: 'bizCoach' };
const DAY = 86_400_000;
const HOUR = 3_600_000;
const C = {
  aya: { id: `${PFX}aya`, name: 'Aya Biz' }, // EGP 900, started this month, ends within 7 days → booked + due + renewal soon
  omar: { id: `${PFX}omar`, name: '=Omar Biz' }, // USD 50, started this month, ends in 20 days; a formula-looking name
  nour: { id: `${PFX}nour`, name: 'Nour Biz' }, // EGP 700, ran out this month → lost + lapsed
  zed: { id: `${PFX}zed`, name: 'Zed Biz' }, // disabled account, still an active relationship (a capacity slot on the server)
  gone: { id: `${PFX}gone`, name: 'Gone Biz' }, // released this month: booked with this coach, never due or listed
};
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });
// B3.9.0: "this month" is the CALENDAR month in the browser's zone (Africa/Cairo — `monthRange` in src/lib/coachBusiness.ts);
// the old `local()` / `monthOf()` used the Node process's zone. `seededAt` is the instant the current fixtures were written for.
let seededAt = 0;

async function insertFixtures(db: Db) {
  const now = Date.now();
  seededAt = now;
  const m = cairoMonth(now);
  const userDoc = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    _id: id, email: `${id}@e2e.test`, emailLower: `${id}@e2e.test`, displayName: name, displayNameLower: name.toLowerCase(), role: 'client', accountStatus: 'active',
    permissions: [], featureFlags: {}, assignedCoachId: COACH.id, phone: '+201240099100', passwordHash: 'not-a-login', createdBy: 'e2e-biz', createdAt: now - 90 * DAY, updatedAt: now, ...extra,
  });
  await insertMany('users', [
    { ...userDoc(COACH.id, 'Biz Coach'), role: 'coach', assignedCoachId: undefined, phone: '+201240099101', currency: 'EGP', timezone: 'Africa/Cairo' },
    userDoc(C.aya.id, C.aya.name),
    userDoc(C.omar.id, C.omar.name),
    userDoc(C.nour.id, C.nour.name),
    userDoc(C.zed.id, C.zed.name, { accountStatus: 'disabled' }),
    userDoc(C.gone.id, C.gone.name, { assignedCoachId: null }),
  ]);
  const pro = await db.findOne<Record<string, unknown>>('coachPlans', { _id: 'e2e-coach-pro' });
  await db.insertOne('coachPlans', { ...pro, _id: COACH.id, maxClients: 4, baseMaxClients: 4, addonClientCapacity: 0, manualCapacityAdjustment: 0, activeClientCount: 4, history: [] });
  const sub = (p: Record<string, unknown>) => ({ status: 'active', months: 1, frozenFrom: null, frozenUntil: null, updatedAt: now, ...p });
  const rel = (clientId: string, p: Record<string, unknown>) => ({ _id: `${COACH.id}__${clientId}`, coachId: COACH.id, clientId, status: 'active', createdBy: COACH.id, createdAt: now - 60 * DAY, updatedAt: now, ...p });
  await insertMany('coachClients', [
    rel(C.aya.id, { subscription: sub({ startAt: m.start + 2 * HOUR, endAt: now + Math.min(3 * DAY, Math.max(60_000, (m.end - now) / 2)), price: 900, currency: 'EGP', planName: 'Monthly' }) }),
    rel(C.omar.id, { subscription: sub({ startAt: m.start + 3 * HOUR, endAt: now + 20 * DAY, price: 50, currency: 'USD' }) }),
    rel(C.nour.id, { subscription: sub({ startAt: m.start - 30 * DAY, endAt: Math.max(m.start + 60_000, now - 2 * DAY), price: 700, currency: 'EGP' }) }),
    rel(C.zed.id, { subscription: sub({ startAt: m.start - 60 * DAY, endAt: now + 60 * DAY, price: 0, currency: 'EGP' }) }),
    rel(C.gone.id, { status: 'ended', endedAt: now - DAY, endReason: 'released', endedBy: COACH.id, subscription: sub({ startAt: m.start + 4 * HOUR, endAt: now + 5 * DAY, price: 999, currency: 'EGP' }) }),
  ]);
  const pkg = (id: string, name: string, order: number, p: Record<string, unknown> = {}) => ({ id: `${PFX}${id}`, coachId: COACH.id, name, unit: 'months', duration: 1, price: 900, order, createdAt: now - DAY, updatedAt: now - DAY, ...p });
  await insertMany('coachBillingPlans', [pkg('monthly', 'Monthly', 10), pkg('quarter', '3 Months', 20, { duration: 3, price: 2400 }), pkg('old', 'Old offer', 30, { archived: true })]);
  const snapshot = { tierKey: 'forma', label: { en: 'Forma', ar: 'فورما' }, priceMonthly: 499, currency: 'EGP', billingInterval: 'month', maxClients: 25, termDays: 30 };
  await insertMany('coachPlanRequests', [
    { _id: `${PFX}req-old`, coachId: COACH.id, type: 'renewal', requestKey: 'subscription', status: 'expired', requestedAt: now - 60 * DAY, confirmationDeadline: now - 59 * DAY, expiredAt: now - 59 * DAY, planSnapshot: snapshot },
    { _id: `${PFX}req-recent`, coachId: COACH.id, type: 'renewal', requestKey: 'subscription', status: 'rejected', requestedAt: now - 2 * DAY, confirmationDeadline: now - DAY, rejectedAt: now - 2 * DAY + HOUR, planSnapshot: snapshot },
  ]);
}
async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  await db.deleteMany('users', { _id: re });
  await db.deleteMany('coachClients', { coachId: COACH.id });
  await db.deleteMany('coachPlans', { _id: COACH.id });
  await db.deleteMany('coachBillingPlans', { coachId: COACH.id });
  await db.deleteMany('coachPlanRequests', { coachId: COACH.id });
  await db.deleteMany('notifications', { userId: re });
}

async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitForLocaleSaved(page, LOCALE_OF[label]); // B3.9.0: <html lang> + the stored settings, instead of a fixed 600 ms
}
async function openBusiness(page: Page, tab = '') {
  await page.goto(`/coach/business${tab ? `?tab=${tab}` : ''}`);
  await ready(page);
  await expect(page.getByTestId('coach-business')).toBeVisible();
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function axeScan(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
}
async function downloaded(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: d.suggestedFilename(), text: fs.readFileSync((await d.path())!, 'utf8') };
}
/** Screenshots for docs/product-audit/B3_VISUAL_QA.md (§B3.8), with each page's horizontal overflow and direction. */
function visualSink(testInfo: TestInfo) {
  const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b38-visual');
  fs.mkdirSync(outDir, { recursive: true });
  const captured: { file: string; overflow: number; dir: string }[] = [];
  return {
    async capture(page: Page, name: string) {
      await page.waitForTimeout(400);
      const file = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir }));
      captured.push({ file: path.basename(file), ...m });
    },
    async finish(label: string) {
      fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(captured, null, 2));
      await testInfo.attach(`${label}.json`, { body: JSON.stringify({ dir: outDir, captured }, null, 2), contentType: 'application/json' });
      expect(captured.filter((c) => c.overflow > 0), 'no horizontal overflow').toEqual([]);
      for (const c of captured) expect(c.dir, c.file).toBe(/-en(-|\.png$)/.test(c.file) ? 'ltr' : 'rtl');
    },
  };
}

test.describe('B3.8 Me / Business', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeEach(async ({ db }) => {
    await removeFixtures(db);
    await insertFixtures(db);
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('Journey J — this month and overall in truthful figures (booked ≠ collected), EGP only, every figure defined; current clients only (B3.8 completion)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    await openBusiness(page);
    await expect(page.getByTestId('biz-booked')).toContainText(/EGP\s1,899/); // Aya 900 + the released client's 999 (booked with this coach)
    await expect(page.getByTestId('biz-collected')).toContainText(/EGP\s0/); // nothing recorded — booked is not collected
    await expect(page.getByTestId('biz-due')).toContainText(/EGP\s900/); // Aya only — the released client's running term is not due
    await expect(page.getByTestId('biz-lost')).toContainText(/EGP\s700/); // Nour ran out this month
    // The USD test term is never added to EGP; the screen says it is left out.
    await expect(page.getByTestId('biz-coverage')).toContainText('1 older package in another currency is not counted');
    await expect(page.getByTestId('biz-definitions')).toContainText('It is not money received.');
    await expect(page.getByTestId('biz-definitions')).toContainText("Forma doesn't know your costs");
    await expect(page.getByTestId('coach-business')).not.toContainText(/retention|churn/i);
    // Booked vs collected: twelve months, keyboard-readable, with a table twin.
    await expect(page.getByTestId('biz-trend-month')).toHaveCount(12);
    await page.getByTestId('biz-trend-table-toggle').click();
    await expect(page.getByTestId('biz-trend-table').getByRole('row')).toHaveCount(13);
    // The renewal pipeline and current clients by package state (a disabled client still counts — it holds a slot).
    await expect(page.locator('[data-testid="biz-pipeline-row"][data-key="overdue"]')).toContainText('1 client');
    await expect(page.locator('[data-testid="biz-pipeline-row"][data-key="week"]')).toContainText('1 client');
    await expect(page.getByTestId('biz-count-active')).toContainText('2'); // Omar, Zed
    await expect(page.getByTestId('biz-count-expiring')).toContainText('1'); // Aya
    expect(await overflowOf(page)).toBe(0);
    await shot(page, testInfo, 'business-overview-1440');
    await page.getByTestId('biz-count-expired').click();
    await expect(page).toHaveURL(/\/coach\/clients\?state=expired$/);
    await ready(page);
    await expect(page.getByText(C.nour.name).first()).toBeVisible();
  });

  test('Renewals — named, Renew on the row saves through the client’s own term sheet; the old term goes to history (C9); a former client is never listed', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, phone);
    await openBusiness(page, 'renewals');
    const upcoming = page.getByTestId('biz-upcoming-list').getByTestId('biz-row');
    await expect(upcoming).toHaveCount(2);
    await expect(upcoming.nth(0)).toContainText(C.aya.name);
    await expect(upcoming.nth(1)).toContainText(C.omar.name);
    await expect(page.getByTestId('biz-lapsed-list').getByTestId('biz-row')).toContainText(C.nour.name);
    await expect(page.getByTestId('biz-renewals')).not.toContainText(C.gone.name);
    await shot(page, testInfo, 'renewals-390');
    const before = await db.findOne<{ subscription: { endAt: number } }>('coachClients', { _id: `${COACH.id}__${C.aya.id}` });
    await upcoming.nth(0).getByRole('button', { name: `Renew ${C.aya.name}'s package` }).click();
    // B3.8 (Fix C): a running package is renewed from the day after it ends — no start field.
    await expect(page.getByTestId('term-renew-start')).toBeVisible();
    await expect(page.getByTestId('term-start')).toHaveCount(0);
    await page.getByTestId('term-months').fill('3');
    await page.getByTestId('term-save').click();
    await expect(page.getByTestId('biz-upcoming-list').getByTestId('biz-row')).toHaveCount(1); // Aya is now covered for three more months
    const stored = await db.findOne<{ subscription: { startAt: number; startDate: string; days: number; price: number; termId: string }; subscriptionHistory?: { price: number; endAt: number; archivedBy?: string }[] }>('coachClients', { _id: `${COACH.id}__${C.aya.id}` });
    expect(stored!.subscription).toMatchObject({ days: 90, price: 900 });
    expect(stored!.subscription.startAt).toBeGreaterThanOrEqual(before!.subscription.endAt - 2 * 3_600_000); // no overlap, no gap
    expect(stored!.subscriptionHistory?.map((h) => [h.price, h.endAt, h.archivedBy])).toEqual([[900, before!.subscription.endAt, 'renew']]);
  });

  test('Packages — rows open their sheet (Delete inside); Move up / down instead of an order number; the pickers follow the order (D4 / TB-06)', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    await openBusiness(page, 'packages');
    const rows = page.getByTestId('coach-plan-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2).getByTestId('coach-plan-archived')).toBeVisible();
    await rows.nth(0).getByRole('button', { name: 'Move Monthly down' }).click();
    await expect(rows.nth(0)).toContainText('3 Months');
    const orders = async () => Object.fromEntries((await db.find<{ id: string; order: number }>('coachBillingPlans', { coachId: COACH.id })).map((p) => [p.id, p.order]));
    expect(await orders()).toEqual({ [`${PFX}quarter`]: 10, [`${PFX}monthly`]: 20, [`${PFX}old`]: 30 });
    // A new package — no order field; it lands after the last one.
    await page.getByTestId('coach-plan-add').click();
    await expect(page.getByTestId('coach-plan-form')).toBeVisible();
    await expect(page.getByTestId('coach-plan-order')).toHaveCount(0);
    await page.getByTestId('coach-plan-name').fill('Six weeks');
    await page.getByTestId('coach-plan-unit').selectOption('days');
    await page.getByTestId('coach-plan-duration').fill('42');
    await page.getByTestId('coach-plan-price').fill('1500');
    await page.getByTestId('coach-plan-save').click();
    await expect(rows).toHaveCount(4);
    expect((await db.findOne<{ order: number; price: number }>('coachBillingPlans', { coachId: COACH.id, name: 'Six weeks' }))).toMatchObject({ order: 40, price: 1500 });
    await shot(page, testInfo, 'packages-1440');
    // Delete, inside the sheet, confirmed.
    await rows.filter({ hasText: 'Six weeks' }).getByTestId('row-open').click();
    await page.getByTestId('coach-plan-delete').click();
    await page.getByTestId('confirm-accept').click();
    await expect(rows).toHaveCount(3);
    // The term sheet's package picker lists the active packages in the new order (archived ones never).
    await openBusiness(page, 'renewals');
    await page.getByTestId('biz-upcoming-list').getByTestId('biz-renew').first().click();
    await expect(page.getByTestId('term-plan').locator('option')).toHaveText(['Custom…', '3 Months · 3 months', 'Monthly · 1 month']);
  });

  test('Exports — real rows with a date range, formulas neutralised; a former client is named as such (D3)', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    // B3.9.0: the file is stamped with the Cairo day the Exports tab opened on (its own `now`), so the expected name
    // comes from instants taken around that, not from the Node process's local day.
    const opened = Date.now();
    await openBusiness(page, 'exports');
    await expect(page.getByTestId('biz-export-clients')).toHaveText('Export 4 clients');
    const clients = await downloaded(page, () => page.getByTestId('biz-export-clients').click());
    expect([...new Set([cairoDay(opened), cairoDay(Date.now())])].map((d) => `forma-clients-${d}.csv`)).toContain(clients.name); // one name unless Cairo midnight passed in between
    const lines = clients.text.replace('﻿', '').trim().split('\r\n');
    // B3.8 completion: a term's first and LAST covered day (the end is exclusive in storage).
    expect(lines[0]).toBe('Name,Email,Phone,Package status,Package,First day,Last day,Price,Currency,Client since,Last workout,Workouts (last 7 days),Assessment');
    expect(lines).toHaveLength(5);
    expect(lines.some((l) => l.startsWith(`'${C.omar.name},`))).toBe(true); // "=Omar Biz" can never run as a formula
    // Package terms that started this month: Aya, Omar and the released client (Nour and Zed started earlier).
    await page.getByTestId('biz-export-from').fill(cairoMonth(seededAt).first); // B3.9.0: the first day of the month the fixtures were written for
    await expect(page.getByTestId('biz-export-terms')).toHaveText('Export 3 terms');
    const terms = await downloaded(page, () => page.getByTestId('biz-export-terms').click());
    expect(terms.text).toContain(`Former client,${C.gone.id},Former client — left`);
    expect(terms.text).not.toContain(C.nour.name);
    // A range that ends before it starts is refused, with the reason.
    await page.getByTestId('biz-export-to').fill('2000-01-01');
    await expect(page.getByTestId('biz-export-terms')).toBeDisabled();
  });

  test('Capacity — one count everywhere, the server’s: Clients and Forma subscription agree; a disabled client counts (D5)', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    await page.goto('/coach/clients');
    await ready(page);
    await expect(page.getByTestId('coach-client-usage')).toContainText('4 / 4'); // the roster without the disabled client would say 3
    await expect(page.getByTestId('coach-client-limit')).toBeVisible();
    await page.goto('/coach/plan');
    await ready(page);
    await expect(page.getByTestId('plan-capacity-usage')).toContainText('4 / 4');
    await expect(page.getByRole('progressbar', { name: 'Clients used of your capacity' })).toHaveAttribute('aria-valuetext', '4 of 4 clients');
    await page.goto('/coach/settings');
    await ready(page);
    await expect(page.locator('main')).not.toContainText(/clients/i); // the account card with its own count is gone
  });

  test('Forma subscription — one status card; open and recent requests in view, older ones folded (CO-32 / RM-55)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, phone);
    await page.goto('/coach/plan');
    await ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Forma subscription');
    const card = page.getByTestId('plan-subscription-card');
    for (const id of ['plan-phase', 'plan-state', 'plan-ends', 'plan-price']) await expect(card.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('plan-requests').getByTestId('plan-request-row').first()).toContainText('Declined');
    const older = page.getByTestId('plan-requests-older');
    await expect(older).toContainText('1 older request');
    await expect(older.getByTestId('plan-request-row')).toBeHidden();
    await older.locator('summary').click();
    await expect(older.getByTestId('plan-request-row')).toContainText('Expired');
    expect(await overflowOf(page)).toBe(0);
    await shot(page, testInfo, 'forma-subscription-390');
  });

  test('Account & preferences — each field saves visibly; a failed save keeps the input and offers Retry; EGP and the device time zone, shown (D8, B3.8 completion)', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, phone);
    await page.goto('/coach/settings');
    await ready(page);
    await page.getByTestId('account-name').fill('Biz Coach Two');
    await page.getByTestId('account-name').blur();
    await expect(page.getByTestId('account-name-status')).toHaveText('Saved');
    await expect.poll(async () => (await db.findOne<{ displayName: string }>('users', { _id: COACH.id }))?.displayName).toBe('Biz Coach Two');
    // The save fails: the field says so, keeps what was typed, and Retry saves it.
    audit.allow5xx(/auth\.updateProfile/); // injected below on purpose
    await page.route(/\/api\/trpc\/[^?]*auth\.updateProfile/, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify([{ error: { message: 'e2e: forced', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } }]) }));
    await page.getByTestId('account-phone').fill('+201555000111');
    await page.getByTestId('account-phone').blur();
    await expect(page.getByTestId('account-phone-status')).toContainText("Couldn't save");
    await expect(page.getByTestId('account-phone')).toHaveValue('+201555000111');
    await shot(page, testInfo, 'account-save-failed-390');
    await page.unroute(/\/api\/trpc\/[^?]*auth\.updateProfile/);
    await page.getByTestId('account-phone-status-retry').click();
    await expect(page.getByTestId('account-phone-status')).toHaveText('Saved');
    await expect.poll(async () => (await db.findOne<{ phone: string }>('users', { _id: COACH.id }))?.phone).toBe('+201555000111');
    // B3.8 completion (owner decisions 8 + 9): no currency or time-zone picker — EGP and the device's zone, shown.
    await expect(page.getByTestId('account-currency')).toContainText('EGP — Egyptian Pound');
    await expect(page.getByTestId('account-currency').locator('select')).toHaveCount(0);
    await expect(page.getByTestId('account-timezone')).toContainText('Africa/Cairo'); // the e2e browser's zone
    await expect(page.getByTestId('account-timezone').locator('select')).toHaveCount(0);
    expect(await db.findOne('users', { _id: COACH.id })).toMatchObject({ currency: 'EGP', timezone: 'Africa/Cairo' }); // the stored fields are left as they were
    expect(await overflowOf(page)).toBe(0);
  });

  test('Routes — Revenue, Reports and Client Plans URLs land in Business; Me opens it; Back goes up to Me', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    for (const [from, to] of [['/coach/revenue', /\/coach\/business$/], ['/coach/reports', /\/coach\/business\?tab=exports$/], ['/coach/subscription-plans', /\/coach\/business\?tab=packages$/]] as const) {
      await page.goto(from);
      await ready(page);
      await expect(page, from).toHaveURL(to);
      await expect(page.getByTestId('rail-business')).toHaveAttribute('aria-current', 'page'); // B3.8: the sidebar names Business
    }
    await page.getByTestId('shell-back').click();
    await expect(page).toHaveURL(/\/coach\/me$/);
    await page.getByTestId('me-business').click();
    await expect(page).toHaveURL(/\/coach\/business$/);
    await page.goto('/coach/me');
    await page.getByTestId('me-packages').click();
    await expect(page).toHaveURL(/\/coach\/business\?tab=packages$/);
    await expect(page.getByTestId('coach-plan-row').first()).toBeVisible();
  });

  test('Arabic and Egyptian Arabic — right to left, translated, Latin digits, no overflow (390 + 1440)', async ({ as, audit }, testInfo) => {
    test.setTimeout(300_000); // four app contexts, two languages
    allowDevModuleStorm(audit);
    for (const [lang, title] of [['العربية', 'الأعمال'], ['مصري', 'الشغل']] as const) {
      for (const w of [390, 1440]) {
        const { context, page } = await as(COACH, w === 390 ? phone : sized(w));
        await setLanguage(page, lang);
        try {
          await openBusiness(page);
          await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
          await expect(page.getByTestId('biz-booked')).toContainText(/1.?899\s?ج\.م\./);
          await expect(page.getByTestId('biz-overview')).not.toContainText(/[٠-٩]/);
          expect(await overflowOf(page)).toBe(0);
          await openBusiness(page, 'renewals');
          expect(await overflowOf(page)).toBe(0);
          if (w === 390) await shot(page, testInfo, `renewals-390-${lang === 'مصري' ? 'ar-eg' : 'ar'}`);
        } finally {
          await setLanguage(page, 'English').catch(() => undefined);
          await context.close();
        }
      }
    }
  });

  for (const lang of ['en', 'ar'] as const) {
    test(`accessibility (${lang.toUpperCase()}) — Business tabs, a package sheet, Forma subscription, Account and Me: no axe violations at 390 / 1440`, async ({ as, audit }, testInfo) => {
      test.setTimeout(420_000); // two app contexts, eight screens each, axe on every one
      allowDevModuleStorm(audit);
      const found: Record<string, unknown[]> = {};
      for (const w of [390, 1440]) {
        const { context, page } = await as(COACH, w === 390 ? phone : sized(w));
        if (lang === 'ar') await setLanguage(page, 'العربية');
        try {
          for (const tab of ['', 'renewals', 'packages', 'exports']) {
            await openBusiness(page, tab);
            await page.waitForTimeout(300);
            found[`business-${tab || 'overview'}-${w}`] = await axeScan(page);
          }
          await openBusiness(page, 'packages');
          await page.getByTestId('coach-plan-row').first().getByTestId('row-open').click();
          await expect(page.getByTestId('coach-plan-form')).toBeVisible();
          found[`package-sheet-${w}`] = await axeScan(page);
          for (const [p, name] of [['/coach/plan', 'forma'], ['/coach/settings', 'account'], ['/coach/me', 'me']] as const) {
            await page.goto(p);
            await ready(page);
            await page.waitForTimeout(300);
            found[`${name}-${w}`] = await axeScan(page);
          }
        } finally {
          if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
          await context.close();
        }
      }
      await testInfo.attach(`axe-b38-${lang}.json`, { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
      expect(Object.fromEntries(Object.entries(found).filter(([, v]) => v.length > 0))).toEqual({});
    });
  }

  test('visual QA matrix: Business (four tabs), Forma subscription, Account and Me at 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR (+ Egyptian Arabic)', async ({ as, audit }, testInfo) => {
    test.setTimeout(900_000);
    allowDevModuleStorm(audit);
    const sink = visualSink(testInfo);
    const widths: [number, number][] = [[360, 780], [390, 844], [430, 932], [768, 1024], [1024, 800], [1440, 900]];
    for (const lang of ['en', 'ar', 'ar-eg'] as const) {
      for (const [w, h] of lang === 'ar-eg' ? widths.filter(([x]) => x === 390 || x === 1440) : widths) {
        const { context, page } = await as(COACH, w <= 430 ? { ...phone, viewport: { width: w, height: h } } : sized(w, h));
        if (lang !== 'en') await setLanguage(page, lang === 'ar' ? 'العربية' : 'مصري');
        try {
          for (const tab of ['overview', 'renewals', 'packages']) {
            await openBusiness(page, tab === 'overview' ? '' : tab);
            await sink.capture(page, `business-${tab}-${w}-${lang}`);
          }
          await page.goto('/coach/plan');
          await ready(page);
          await expect(page.getByTestId('plan-subscription-card')).toBeVisible();
          await sink.capture(page, `forma-${w}-${lang}`);
          await page.goto('/coach/settings');
          await ready(page);
          await sink.capture(page, `account-${w}-${lang}`);
          if (w === 390 || w === 1440) {
            await openBusiness(page, 'exports');
            await sink.capture(page, `business-exports-${w}-${lang}`);
            await page.goto('/coach/me');
            await ready(page);
            await sink.capture(page, `me-${w}-${lang}`);
          }
        } finally {
          if (lang !== 'en') await setLanguage(page, 'English').catch(() => undefined);
          await context.close();
        }
      }
    }
    await sink.finish('b38-business');
  });
});
