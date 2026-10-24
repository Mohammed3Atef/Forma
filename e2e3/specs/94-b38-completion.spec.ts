import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';
import { addDays, cairoDay, cairoMidnight } from './_dates';
import { confirmYes } from './_b-helpers';
import { bearerOf, overflow } from './_d-helpers';

/**
 * B3.8 completion (owner decisions 1–9, 2026-10-21), end to end in the browser:
 *  - manual payments (Cash / Mobile Wallet / InstaPay): record, what is left, reverse — nothing deleted;
 *  - Fix C: editing a package changes the same package once; Renew books the NEXT one, from the day
 *    after the running one ends; 30-day months on calendar days;
 *  - P2: an expired Forma coach is read-only in the app AND on the server (a direct API write is
 *    refused; the message is not stored);
 *  - EGP only (a USD write is refused); the device time zone (no picker);
 *  - the grouped desktop sidebar (EN / AR); page widths at 1280 / 1440 / 1728 / 1920.
 *
 * Its own coach (`e2e-b38c-coach`) holds every fixture; re-seeded before every test, removed after.
 */
const PFX = 'e2e-b38c-';
const COACH = { id: `${PFX}coach`, label: 'b38cCoach' };
const X = { id: `${PFX}xena`, name: 'Xena Pay' };
const TERM = `${PFX}term-1`;
const DAY = 86_400_000;
const sized = (width: number, height = 900) => ({ viewport: { width, height } });
// B3.9.0: `cairoDay` / `addDays` / `cairoMidnight` come from the shared `_dates.ts` (the local copy fell back to 03:00
// on a day that starts inside Egypt's spring-forward gap, where the app's day starts at 01:00).

async function insertFixtures(db: Db) {
  const now = Date.now();
  const user = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    _id: id, email: `${id}@e2e.test`, emailLower: `${id}@e2e.test`, displayName: name, displayNameLower: name.toLowerCase(), role: 'client', accountStatus: 'active',
    permissions: [], featureFlags: {}, assignedCoachId: COACH.id, phone: '+201240099200', passwordHash: 'not-a-login', createdBy: 'e2e-b38c', createdAt: now - 90 * DAY, updatedAt: now, ...extra,
  });
  await insertMany('users', [{ ...user(COACH.id, 'Pay Coach'), role: 'coach', assignedCoachId: undefined, phone: '+201240099201', currency: 'EGP', timezone: 'Africa/Cairo' }, user(X.id, X.name)]);
  const pro = await db.findOne<Record<string, unknown>>('coachPlans', { _id: 'e2e-coach-pro' });
  await db.insertOne('coachPlans', { ...pro, _id: COACH.id, maxClients: 10, baseMaxClients: 10, addonClientCapacity: 0, manualCapacityAdjustment: 0, activeClientCount: 1, endsAt: now + 30 * DAY, history: [] });
  const start = addDays(cairoDay(now), -5);
  const end = addDays(start, 30);
  await insertMany('coachClients', [
    {
      _id: `${COACH.id}__${X.id}`, coachId: COACH.id, clientId: X.id, status: 'active', createdBy: COACH.id, createdAt: now - 30 * DAY, updatedAt: now,
      subscription: { status: 'active', startDate: start, endDate: end, days: 30, months: 1, zone: 'Africa/Cairo', startAt: cairoMidnight(start), endAt: cairoMidnight(end), price: 1000, currency: 'EGP', planName: 'Monthly', termId: TERM, frozenFrom: null, frozenUntil: null, updatedAt: now - DAY },
    },
  ]);
  return { start, end };
}
async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  await db.deleteMany('users', { _id: re });
  await db.deleteMany('coachClients', { coachId: COACH.id });
  await db.deleteMany('coachPlans', { _id: COACH.id });
  await db.deleteMany('clientPayments', { coachId: COACH.id });
  await db.deleteMany('messages', { clientId: X.id });
}
const rel = (db: Db) => db.findOne<{ subscription: Record<string, unknown>; subscriptionHistory?: Record<string, unknown>[]; subscriptionEvents?: { op: string }[] }>('coachClients', { _id: `${COACH.id}__${X.id}` });
async function apiCall(page: Page, bearer: string, path: string, input: unknown) {
  return page.evaluate(
    async ({ path, input, bearer }) => {
      const r = await fetch(`/api/trpc/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: bearer }, body: JSON.stringify(input) });
      const body = await r.json().catch(() => null);
      return { status: r.status, reason: body?.error?.data?.reason ?? null };
    },
    { path, input, bearer },
  );
}
async function axeScan(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
}
async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitForLocaleSaved(page, LOCALE_OF[label]); // B3.9.0: the profile save lands before we navigate away (was a fixed 600 ms)
}

test.describe('B3.8 completion', () => {
  let dates: { start: string; end: string };
  test.beforeEach(async ({ db }) => {
    await removeFixtures(db);
    dates = await insertFixtures(db);
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('Payments — record an InstaPay payment, see what is left, reverse it with a reason; nothing is deleted; Business counts only live payments', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    await page.goto(`/coach/client/${X.id}/subscription`);
    await ready(page);
    await expect(page.getByTestId('pay-outstanding')).toContainText(/EGP\s1,000/);
    await expect(page.getByTestId('client-payments')).toContainText('Forma does not see or verify payments');
    await page.getByTestId('pay-record').click();
    await expect(page.getByTestId('pay-amount')).toHaveValue('1000');
    await page.getByTestId('pay-amount').fill('400');
    await page.getByTestId('pay-method').getByText('InstaPay', { exact: true }).click(); // the visible choice, as a person taps it
    await expect(page.getByTestId('pay-method-instapay')).toBeChecked();
    await page.getByTestId('pay-reference').fill('IP-778899');
    await shot(page, testInfo, 'payment-sheet-1440');
    await page.getByTestId('pay-save').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText(/EGP\s400 paid by InstaPay/);
    await confirmYes(page);
    await expect(page.getByTestId('pay-outstanding')).toContainText(/EGP\s600/);
    const recorded = await db.find<{ amountMinor: number; method: string; termId: string; kind: string }>('clientPayments', { coachId: COACH.id });
    expect(recorded).toEqual([expect.objectContaining({ kind: 'payment', amountMinor: 40_000, method: 'instapay', termId: TERM })]);

    await page.getByTestId('pay-actions').first().click();
    await page.getByTestId('pay-reverse').click();
    await page.getByTestId('pay-reverse-reason').fill('Recorded for the wrong client');
    await page.getByTestId('pay-reverse-save').click();
    await confirmYes(page);
    await expect(page.getByTestId('pay-reversed')).toBeVisible();
    await expect(page.getByTestId('pay-outstanding')).toContainText(/EGP\s1,000/);
    const all = await db.find<{ kind: string; reversedById?: string; reversesId?: string; reason?: string }>('clientPayments', { coachId: COACH.id });
    expect(all).toHaveLength(2); // the payment stays, voided; the reversal points at it
    expect(all.find((p) => p.kind === 'payment')!.reversedById).toBeTruthy();
    expect(all.find((p) => p.kind === 'reversal')).toMatchObject({ reason: 'Recorded for the wrong client' });
    await shot(page, testInfo, 'payment-reversed-1440');

    await page.goto('/coach/business');
    await ready(page);
    await expect(page.getByTestId('biz-collected')).toContainText(/EGP\s0/);
    await expect(page.getByTestId('biz-reversed')).toContainText('1 payment');
    await expect(page.getByTestId('biz-outstanding')).toContainText(/EGP\s1,000/);
    expect((await overflow(page)).ok).toBe(true);
  });

  test('Fix C — editing the package changes the SAME package once; Renew books the next one from the day after the running one ends', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    await page.goto(`/coach/client/${X.id}/subscription`);
    await ready(page);
    await expect(page.getByTestId('sub-last-day')).toContainText(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${addDays(dates.end, -1)}T12:00:00Z`)));
    // Edit — a correction: same term id, nothing archived, the event says why.
    await page.getByTestId('sub-more').click();
    await page.getByTestId('sub-edit-term').click();
    await expect(page.getByTestId('term-save')).toBeDisabled(); // nothing changed yet
    await page.getByTestId('term-price').fill('1100');
    await page.getByTestId('term-save').click();
    await expect.poll(async () => (await rel(db))?.subscription.price).toBe(1100);
    let r = await rel(db);
    expect(r!.subscription.termId).toBe(TERM);
    expect(r!.subscriptionHistory ?? []).toHaveLength(0);
    expect(r!.subscriptionEvents?.at(-1)).toMatchObject({ op: 'correct', reason: 'correction' });
    // Renew — the next package, starting the day after this one's last day.
    await page.getByTestId('sub-set-term').click();
    await expect(page.getByTestId('term-renew-start')).toBeVisible();
    await expect(page.getByTestId('term-end-preview')).toContainText('30 days');
    await shot(page, testInfo, 'renew-sheet-1440');
    await page.getByTestId('term-save').click();
    await expect.poll(async () => ((await rel(db))?.subscriptionHistory ?? []).length).toBe(1);
    r = await rel(db);
    expect(r!.subscription).toMatchObject({ startDate: dates.end, endDate: addDays(dates.end, 30), days: 30, price: 1100 });
    expect(r!.subscription.termId).not.toBe(TERM);
    expect(r!.subscriptionHistory![0]).toMatchObject({ termId: TERM, archivedBy: 'renew', endDate: dates.end });
  });

  test('P2 — an expired Forma coach reads everything but writes nothing: the app says so, and the server refuses a direct write', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    await page.goto('/coach/dashboard');
    await ready(page);
    const bearer = await bearerOf(page, () => page.reload());
    await db.updateOne('coachPlans', { _id: COACH.id }, { $set: { endsAt: Date.now() - 60_000 } });

    // The server: a direct send is refused — and NOT stored; a payment and a term change too.
    const send = await apiCall(page, bearer, 'messages.send', { clientId: X.id, text: 'after the lapse', clientMsgId: `${PFX}cm-1`, coachId: COACH.id });
    expect(send).toEqual({ status: 412, reason: 'SUBSCRIPTION_EXPIRED' });
    expect(await db.count('messages', { clientId: X.id, body: 'after the lapse' })).toBe(0);
    expect(await apiCall(page, bearer, 'clientPayments.record', { clientId: X.id, termId: TERM, amountMinor: 100, method: 'cash', paidAt: Date.now(), requestId: `${PFX}req-1` })).toEqual({ status: 412, reason: 'SUBSCRIPTION_EXPIRED' });
    expect(await apiCall(page, bearer, 'coachClients.updateSubscription', { id: `${COACH.id}__${X.id}`, sub: { op: 'renew', months: 1 } })).toEqual({ status: 412, reason: 'SUBSCRIPTION_EXPIRED' });

    // The app: the thread is read-only, the package and payment actions are off, and ⌘K offers no "create".
    await page.goto(`/coach/messages/${X.id}`);
    await ready(page);
    await expect(page.getByTestId('message-readonly')).toBeVisible();
    await expect(page.getByTestId('message-composer')).toHaveCount(0);
    await expect(page.getByTestId('plan-read-only')).toContainText("read-only mode");
    await shot(page, testInfo, 'p2-thread-read-only-1440');
    await page.goto(`/coach/client/${X.id}/subscription`);
    await ready(page);
    await expect(page.getByTestId('sub-set-term')).toBeDisabled();
    await expect(page.getByTestId('pay-record')).toBeDisabled();
    await expect(page.getByTestId('sub-set-term')).toHaveAttribute('title', /read-only mode/);
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-input')).toBeFocused();
    await expect(page.getByRole('option', { name: 'Add client' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Forma subscription' })).toHaveCount(1);
    await page.keyboard.press('Escape');
    // Renewing Forma stays possible: the subscription page opens and offers the request.
    await page.getByTestId('rail-forma').click();
    await expect(page).toHaveURL(/\/coach\/plan$/);
  });

  test('EGP only and the device time zone — a USD write is refused (never relabelled); the term sheet prices in EGP', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as(COACH, sized(1440));
    await page.goto(`/coach/client/${X.id}/subscription`);
    await ready(page);
    const bearer = await bearerOf(page, () => page.reload());
    expect(await apiCall(page, bearer, 'coachClients.updateSubscription', { id: `${COACH.id}__${X.id}`, sub: { op: 'correct', price: 50, currency: 'USD' } })).toEqual({ status: 400, reason: 'UNSUPPORTED_CURRENCY' });
    expect((await rel(db))!.subscription).toMatchObject({ price: 1000, currency: 'EGP' });
    await page.getByTestId('sub-more').click();
    await page.getByTestId('sub-edit-term').click();
    await expect(page.locator('label[for="term-price"]')).toHaveText('Price (EGP)');
    await expect(page.getByTestId('term-sheet-correct').locator('select[data-testid*="currency"], input[data-testid*="currency"]')).toHaveCount(0);
  });

  test('Sidebar — four groups; Library and Business list their own pages while open; one current page; right-hand in Arabic; an icon rail on tablets', async ({ as, audit }, testInfo) => {
    test.setTimeout(240_000);
    allowDevModuleStorm(audit);
    const { context, page } = await as(COACH, sized(1440));
    try {
      await page.goto('/coach/library?tab=exercises');
      await ready(page);
      for (const g of ['workspace', 'content', 'business', 'account']) await expect(page.getByTestId(`rail-group-${g}`)).toBeVisible();
      await expect(page.getByTestId('rail-library')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('rail-sub-library-exercises')).toHaveAttribute('aria-current', 'true');
      await expect(page.getByTestId('rail-business-pages')).toHaveCount(0);
      await page.getByTestId('rail-sub-library-groups').click();
      await expect(page).toHaveURL(/\/coach\/library\?tab=foods&view=groups$/);
      await page.getByTestId('rail-business').click();
      await expect(page.getByTestId('rail-sub-business-overview')).toHaveAttribute('aria-current', 'true');
      await page.getByTestId('rail-sub-business-exports').click();
      await expect(page).toHaveURL(/\/coach\/business\?tab=exports$/);
      await expect(page.getByTestId('biz-tab-exports')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[aria-current="page"]:visible')).toHaveCount(1); // the phone avatar (display: none here) is not counted
      await shot(page, testInfo, 'sidebar-business-1440-en');
      await setLanguage(page, 'العربية');
      await page.goto('/coach/business?tab=renewals');
      await ready(page);
      const box = (await page.getByTestId('coach-rail').boundingBox())!;
      expect(Math.round(box.x + box.width)).toBe(1440); // the rail sits on the right in Arabic
      await expect(page.getByTestId('rail-group-business')).toContainText('الأعمال');
      await expect(page.getByTestId('rail-sub-business-renewals')).toHaveAttribute('aria-current', 'true');
      await shot(page, testInfo, 'sidebar-business-1440-ar');
      expect((await overflow(page)).ok).toBe(true);
    } finally {
      await setLanguage(page, 'English').catch(() => undefined);
      await context.close();
    }
    const tablet = (await as(COACH, sized(900, 1000))).page;
    await tablet.goto('/coach/library?tab=foods');
    await ready(tablet);
    expect(Math.round((await tablet.getByTestId('coach-rail').boundingBox())!.width)).toBe(72);
    await expect(tablet.getByTestId('rail-library-pages')).toBeHidden();
    for (const key of ['today', 'clients', 'messages', 'library', 'business', 'forma', 'account']) await expect(tablet.getByTestId(`rail-${key}`)).toHaveAttribute('aria-label', /.+/);
  });

  test('Desktop widths at 1280 / 1440 / 1728 / 1920 — wide pages use the column, forms keep a reading width, nothing overflows, the header lines up', async ({ as, audit }, testInfo) => {
    test.setTimeout(300_000);
    allowDevModuleStorm(audit);
    const results: Record<string, unknown> = {};
    for (const w of [1280, 1440, 1728, 1920]) {
      const { context, page } = await as(COACH, sized(w));
      try {
        const rail = w >= 1024 ? 240 : 72;
        const column = Math.min(w - rail, 1536) - 64; // the shell's column: ≤ 1536 px wide, 32 px gutters
        for (const [path, testId, kind] of [
          ['/coach/clients', 'coach-clients', 'wide'],
          ['/coach/library', 'coach-library', 'wide'],
          ['/coach/business', 'coach-business', 'wide'],
          ['/coach/settings', 'role-account', 'reading'],
        ] as const) {
          await page.goto(path);
          await ready(page);
          const el = page.getByTestId(testId);
          await expect(el).toBeVisible();
          const width = Math.round((await el.boundingBox())!.width);
          results[`${path}@${w}`] = width;
          if (kind === 'wide') expect(width, `${path} @ ${w}`).toBeGreaterThanOrEqual(column - 20);
          else expect(width, `${path} @ ${w}`).toBeLessThanOrEqual(768);
          const o = await overflow(page);
          expect(o.ok, `${path} @ ${w}: ${o.culprit}`).toBe(true);
        }
        // The header's search ends where the content column ends.
        await page.goto('/coach/clients');
        await ready(page);
        const search = (await page.getByTestId('global-search').boundingBox())!;
        const content = (await page.getByTestId('coach-clients').boundingBox())!;
        results[`header@${w}`] = Math.round(search.x + search.width - (content.x + content.width));
        expect(Math.abs(search.x + search.width - (content.x + content.width)), `header @ ${w}`).toBeLessThanOrEqual(24);
        if (w === 1920) await shot(page, testInfo, 'clients-1920');
        if (w === 1728) {
          await page.goto('/coach/business');
          await ready(page);
          await shot(page, testInfo, 'business-1728');
        }
      } finally {
        await context.close();
      }
    }
    await testInfo.attach('widths.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  });

  for (const lang of ['en', 'ar'] as const) {
    test(`accessibility (${lang.toUpperCase()}) — payments card and sheet, the analytics overview, the grouped sidebar: no axe violations at 390 / 1440`, async ({ as, audit }, testInfo) => {
      test.setTimeout(300_000);
      allowDevModuleStorm(audit);
      const found: Record<string, unknown[]> = {};
      for (const w of [390, 1440]) {
        const { context, page } = await as(COACH, sized(w, w === 390 ? 844 : 900));
        if (lang === 'ar') await setLanguage(page, 'العربية');
        try {
          await page.goto(`/coach/client/${X.id}/subscription`);
          await ready(page);
          await page.waitForTimeout(300);
          found[`payments-${w}`] = await axeScan(page);
          await page.getByTestId('pay-record').click();
          await expect(page.getByTestId('pay-form')).toBeVisible();
          found[`payment-sheet-${w}`] = await axeScan(page);
          await page.keyboard.press('Escape');
          await page.goto('/coach/business');
          await ready(page);
          await page.waitForTimeout(300);
          found[`overview-${w}`] = await axeScan(page);
          await page.getByTestId('biz-trend-table-toggle').click();
          found[`overview-table-${w}`] = await axeScan(page);
        } finally {
          if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
          await context.close();
        }
      }
      await testInfo.attach(`axe-b38c-${lang}.json`, { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
      expect(Object.fromEntries(Object.entries(found).filter(([, v]) => v.length > 0))).toEqual({});
    });
  }
});

