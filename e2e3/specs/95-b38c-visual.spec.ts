import fs from 'node:fs';
import path from 'node:path';
import { type Page } from '@playwright/test';
import { test, expect, ready, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';
import { addDays, cairoDay, cairoMidnight as midnight } from './_dates';

/**
 * B3.8 completion — the visual QA matrix (B3_VISUAL_QA.md §B3.8 completion): Business Overview
 * (analytics), the client's package + payments screen, the grouped sidebar and the read-only (P2)
 * thread, at 390 / 768 / 1024 / 1280 / 1440 / 1728 / 1920 × EN / AR (+ Egyptian Arabic at 390 / 1440).
 * Writes full-page shots and `b38c-visual.json` (overflow, dir) to `e2e-out/<run>/b38c-visual/`, and
 * fails on any horizontal overflow or a wrong direction.
 */
const PFX = 'e2e-b38v-';
const COACH = { id: `${PFX}coach`, label: 'b38vCoach' };
const DAY = 86_400_000;
const sized = (width: number, height = 900) => ({ viewport: { width, height } });
// B3.9.0: `cairoDay` / `addDays` / `midnight` come from the shared `_dates.ts` (the local copy fell back to 03:00 on a
// day that starts inside Egypt's spring-forward gap, where the app's day starts at 01:00).

async function seed(db: Db) {
  const now = Date.now();
  const re = { $regex: `^${PFX}` };
  await db.deleteMany('users', { _id: re });
  await db.deleteMany('coachClients', { coachId: COACH.id });
  await db.deleteMany('coachPlans', { _id: COACH.id });
  await db.deleteMany('clientPayments', { coachId: COACH.id });
  const user = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    _id: id, email: `${id}@e2e.test`, emailLower: `${id}@e2e.test`, displayName: name, displayNameLower: name.toLowerCase(), role: 'client', accountStatus: 'active',
    permissions: [], featureFlags: {}, assignedCoachId: COACH.id, phone: '+201240099300', passwordHash: 'not-a-login', createdBy: 'e2e-b38v', createdAt: now - 200 * DAY, updatedAt: now, ...extra,
  });
  const clients = [['salma', 'Salma Farouk', 'Monthly', 1000, -10], ['karim', 'Karim Adel', 'Quarterly', 2700, -40], ['mona', 'Mona Samir', 'Monthly', 1000, -27], ['yousef', 'Yousef Nabil', undefined, 800, -33]] as const;
  await insertMany('users', [{ ...user(COACH.id, 'Visual Coach'), role: 'coach', assignedCoachId: undefined, phone: '+201240099301' }, ...clients.map(([id, name]) => user(`${PFX}${id}`, name))]);
  const pro = await db.findOne<Record<string, unknown>>('coachPlans', { _id: 'e2e-coach-pro' });
  await db.insertOne('coachPlans', { ...pro, _id: COACH.id, maxClients: 10, baseMaxClients: 10, addonClientCapacity: 0, manualCapacityAdjustment: 0, activeClientCount: clients.length, endsAt: now + 30 * DAY, history: [] });
  const today = cairoDay(now);
  await insertMany('coachClients', clients.map(([id, , plan, price, startOff]) => {
    const months = plan === 'Quarterly' ? 3 : 1;
    const start = addDays(today, startOff);
    const end = addDays(start, 30 * months);
    // a renewed earlier term for history and the trend
    const prevStart = addDays(start, -30 * months);
    return {
      _id: `${COACH.id}__${PFX}${id}`, coachId: COACH.id, clientId: `${PFX}${id}`, status: 'active', createdBy: COACH.id, createdAt: now - 150 * DAY, updatedAt: now,
      subscription: { status: 'active', startDate: start, endDate: end, days: 30 * months, months, zone: 'Africa/Cairo', startAt: midnight(start), endAt: midnight(end), price, currency: 'EGP', ...(plan ? { planName: plan } : {}), termId: `${PFX}t-${id}`, frozenFrom: null, frozenUntil: null, updatedAt: now - DAY },
      subscriptionHistory: [{ startDate: prevStart, endDate: start, days: 30 * months, months, zone: 'Africa/Cairo', startAt: midnight(prevStart), endAt: midnight(start), price, currency: 'EGP', ...(plan ? { planName: plan } : {}), termId: `${PFX}p-${id}`, status: 'ended', endedAt: now - 20 * DAY, archivedBy: 'renew' }],
    };
  }));
  const pay = (id: string, client: string, term: string, minor: number, method: string, daysAgo: number, extra: Record<string, unknown> = {}) => ({
    _id: `${PFX}${id}`, kind: 'payment', coachId: COACH.id, clientId: `${PFX}${client}`, relationshipId: `${COACH.id}__${PFX}${client}`, termId: `${PFX}${term}`, amountMinor: minor, currency: 'EGP', method, paidAt: now - daysAgo * DAY, requestId: `${PFX}r-${id}`, createdBy: COACH.id, createdByRole: 'coach', createdAt: now - daysAgo * DAY, ...extra,
  });
  await insertMany('clientPayments', [
    pay('1', 'salma', 'p-salma', 100_000, 'cash', 38),
    pay('2', 'salma', 't-salma', 60_000, 'instapay', 9, { reference: 'IP-20391' }),
    pay('3', 'karim', 'p-karim', 270_000, 'mobile_wallet', 70),
    pay('4', 'karim', 't-karim', 150_000, 'instapay', 39),
    pay('5', 'mona', 't-mona', 50_000, 'cash', 26, { reversedById: `${PFX}6` }),
    { ...pay('6', 'mona', 't-mona', 50_000, 'cash', 25), kind: 'reversal', reversesId: `${PFX}5`, reason: 'Entered twice' },
    pay('7', 'mona', 't-mona', 100_000, 'cash', 25),
    // B3.8 final review: a payment recorded without a package (in Collected, taken off no balance — both screens say so).
    { ...pay('8', 'salma', 't-salma', 25_000, 'cash', 3), termId: null },
  ]);
}

async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitForLocaleSaved(page, LOCALE_OF[label]); // B3.9.0: <html lang> + the stored settings, instead of a fixed 600 ms
}

test('visual QA matrix — Business overview, package + payments, sidebar and read-only thread at 390–1920 × EN / AR (+ Egyptian Arabic)', async ({ as, db, audit }, testInfo) => {
  test.setTimeout(1_200_000);
  allowDevModuleStorm(audit);
  await seed(db);
  const dir = path.join(path.dirname(testInfo.outputDir), '..', 'b38c-visual');
  fs.mkdirSync(dir, { recursive: true });
  const results: Record<string, unknown> = {};
  const capture = async (page: Page, name: string) => {
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir || 'ltr' }));
    results[name] = info;
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
    return info;
  };
  try {
    for (const [lang, label, widths] of [['en', 'English', [390, 768, 1024, 1280, 1440, 1728, 1920]], ['ar', 'العربية', [390, 768, 1024, 1440, 1920]], ['ar-eg', 'مصري', [390, 1440]]] as const) {
      for (const w of widths) {
        const { context, page } = await as(COACH, sized(w, w <= 430 ? 844 : 900));
        try {
          if (lang !== 'en') await setLanguage(page, label as 'العربية' | 'مصري');
          await page.goto('/coach/business');
          await ready(page);
          await expect(page.getByTestId('biz-trend')).toBeVisible();
          await expect(page.getByTestId('biz-unlinked')).toBeVisible();
          const o = await capture(page, `business-overview-${w}-${lang}`);
          expect(o.overflow, `overview ${w} ${lang}`).toBeLessThanOrEqual(0);
          expect(o.dir).toBe(lang === 'en' ? 'ltr' : 'rtl');
          await page.goto(`/coach/client/${PFX}salma/subscription`);
          await ready(page);
          await expect(page.getByTestId('client-payments')).toBeVisible();
          await expect(page.getByTestId('pay-unlinked')).toBeVisible();
          const s = await capture(page, `package-payments-${w}-${lang}`);
          expect(s.overflow, `package ${w} ${lang}`).toBeLessThanOrEqual(0);
          if (w === 390 || w === 1440) {
            await page.getByTestId('pay-record').click();
            await expect(page.getByTestId('pay-form')).toBeVisible();
            await capture(page, `payment-sheet-${w}-${lang}`);
            await page.keyboard.press('Escape');
          }
          if (w >= 1024) {
            await page.goto('/coach/library?tab=foods&view=groups');
            await ready(page);
            await capture(page, `sidebar-library-${w}-${lang}`);
          }
        } finally {
          if (lang !== 'en') await setLanguage(page, 'English').catch(() => undefined);
          await context.close();
        }
      }
    }
    // The read-only thread (P2) — restored afterwards.
    await db.updateOne('coachPlans', { _id: COACH.id }, { $set: { endsAt: Date.now() - 60_000 } });
    for (const w of [390, 1440]) {
      const { context, page } = await as(COACH, sized(w, w <= 430 ? 844 : 900));
      try {
        await page.goto(`/coach/messages/${PFX}salma`);
        await ready(page);
        await expect(page.getByTestId('message-readonly')).toBeVisible();
        await capture(page, `p2-thread-${w}-en`);
        await page.goto(`/coach/client/${PFX}salma/subscription`);
        await ready(page);
        await capture(page, `p2-package-${w}-en`);
      } finally {
        await context.close();
      }
    }
  } finally {
    fs.writeFileSync(path.join(dir, 'b38c-visual.json'), JSON.stringify(results, null, 2));
    await db.deleteMany('users', { _id: { $regex: `^${PFX}` } });
    await db.deleteMany('coachClients', { coachId: COACH.id });
    await db.deleteMany('coachPlans', { _id: COACH.id });
    await db.deleteMany('clientPayments', { coachId: COACH.id });
  }
});
