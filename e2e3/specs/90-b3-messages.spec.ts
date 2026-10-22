import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Browser, type Page, type TestInfo } from '@playwright/test';
import { test, expect, ready, shot, type Db, type E2EEnv } from '../fixtures';
import { allowDevModuleStorm, insertMany, makePng, pollDb, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';
import { confirmYes } from './_b-helpers';

/**
 * B3.6 — the coach's Messages (blueprint §6.5, owner brief 2026-10-19): inbox
 * (newest first, honest previews and unread, search, All · Unread, 30+
 * conversations), the selection in the URL with a split view ≥ 768 and a
 * full-screen thread on phones, per-conversation drafts, offline queue and an
 * idempotent retry, the unread divider and read-on-view, Arabic and mixed
 * text, attachments and voice notes (an unplayable file / a failing provider
 * is never shown as fine), a transfer with a message queued before it (refused,
 * never redirected), ended relationships, notification deep links, the
 * keyboard, broadcast, axe and the visual matrix.
 *
 * Fixtures on coachPro (`e2e-msg-` ids, removed in afterAll). The engine is
 * unchanged (C11) — specs 31 / 32 / 33 / 40 / 60 keep covering it.
 */
const COACH = 'e2e-coach-pro';
const OTHER_COACH = 'e2e-coach-b';
const PFX = 'e2e-msg-';
const DAY = 86_400_000;
const MIN = 60_000;
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });

const C = {
  amira: { id: `${PFX}amira`, name: 'Amira Saleh' },
  bassem: { id: `${PFX}bassem`, name: 'Bassem Fouad' },
  carla: { id: `${PFX}carla`, name: 'Carla Mansour' },
  dina: { id: `${PFX}dina`, name: 'Dina Farag' },
  sara: { id: `${PFX}sara`, name: 'سارة محمود' },
  omar: { id: `${PFX}omar`, name: 'Omar Zaki' },
  long: { id: `${PFX}long`, name: 'Youssef Kamal' },
  live: { id: `${PFX}live`, name: 'Laila Hassan' },
  hany: { id: `${PFX}hany`, name: 'Hany Adel' },
  gone: { id: `${PFX}gone`, name: 'Nour Samir' },
};
const FILLERS = Array.from({ length: 24 }, (_, i) => ({ id: `${PFX}f${String(i).padStart(2, '0')}`, name: `Filler ${String(i).padStart(2, '0')}` }));
const ACTIVE = [...Object.values(C).filter((c) => c.id !== C.gone.id), ...FILLERS];

let T = 0; // fixture "now"
const msg = (id: string, clientId: string, body: string, from: 'client' | 'coach', at: number, extra: Record<string, unknown> = {}) => ({
  _id: `${PFX}m-${id}`,
  clientId,
  coachId: COACH,
  fromUserId: from === 'client' ? clientId : COACH,
  fromRole: from,
  body,
  seenAt: extra.unread ? null : at + 1000,
  createdAt: at,
  updatedAt: at,
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'unread')),
});

async function insertFixtures(env: E2EEnv) {
  T = Date.now();
  const cdn = env.bunny.cdn;
  const all = [...Object.values(C), ...FILLERS];
  await insertMany('users', all.map((c, i) => ({
    _id: c.id, email: `${c.id}@e2e.test`, emailLower: `${c.id}@e2e.test`, displayName: c.name, displayNameLower: c.name.toLowerCase(), role: 'client',
    accountStatus: c.id === C.hany.id ? 'suspended' : 'active', permissions: [], featureFlags: {}, assignedCoachId: c.id === C.gone.id ? undefined : COACH,
    phone: `+2012500${String(i).padStart(5, '0')}`, passwordHash: 'not-a-login', createdBy: 'e2e-msg', createdAt: T - 90 * DAY, updatedAt: T,
  })));
  await insertMany('coachClients', all.map((c) => ({
    _id: `${COACH}__${c.id}`, coachId: COACH, clientId: c.id, status: c.id === C.gone.id ? 'ended' : 'active', ...(c.id === C.gone.id ? { endedAt: T - DAY, endReason: 'released' } : {}),
    createdBy: COACH, createdAt: T - 60 * DAY, updatedAt: T,
    subscription: { status: 'active', startAt: T - 10 * DAY, endAt: T + 20 * DAY, months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: T },
  })));
  await insertMany('clientProfiles', all.map((c) => ({ _id: c.id, clientId: c.id, updatedAt: T, assessment: { status: 'reviewed', completed: true, submittedAt: T - 50 * DAY, basic: { fullName: c.name } } })));
  const ms = [
    msg('a1', C.amira.id, 'Morning! Plan looks great', 'coach', T - 60 * MIN),
    msg('a2', C.amira.id, 'Is it ok to train fasted?', 'client', T - 3 * MIN, { unread: true }),
    msg('a3', C.amira.id, 'And can I swap the rowing?', 'client', T - 2 * MIN, { unread: true }),
    msg('b1', C.bassem.id, 'Done with week 2', 'client', T - 20 * MIN),
    msg('b2', C.bassem.id, 'See you Monday', 'coach', T - 10 * MIN),
    msg('c1', C.carla.id, 'Quick question', 'client', T - 70 * MIN),
    msg('c2', C.carla.id, '', 'coach', T - 60 * MIN, { deletedAt: T - 59 * MIN }),
    msg('d1', C.dina.id, '', 'client', T - DAY - 30 * MIN, { unread: true, attachment: { url: `${cdn}/Forma/${C.dina.id}/messages/meal.png`, kind: 'image', name: 'meal.png', mimeType: 'image/png' } }),
    msg('s1', C.sara.id, 'تمام coach، هعمل 3 sets النهارده 💪', 'client', T - 2 * DAY),
    msg('o1', C.omar.id, '', 'client', T - 3 * DAY, { attachment: { url: `${cdn}/Forma/${C.omar.id}/messages/voice.webm`, kind: 'audio', name: 'voice.webm', mimeType: 'audio/webm' } }),
    msg('h1', C.hany.id, 'Paused my account for a trip', 'client', T - 4 * DAY),
    msg('g1', C.gone.id, 'Thanks for everything', 'client', T - 5 * DAY),
    msg('l1', C.live.id, 'Welcome Laila!', 'coach', T - 6 * DAY),
    ...FILLERS.map((f, i) => msg(`f${i}`, f.id, `Old note ${i}`, i % 2 ? 'coach' : 'client', T - (8 + i) * DAY)),
    // A long conversation: 35 read, then 25 unread from the client.
    ...Array.from({ length: 60 }, (_, i) => msg(`y${String(i).padStart(2, '0')}`, C.long.id, `Long thread line ${String(i).padStart(2, '0')}`, i < 35 && i % 2 ? 'coach' : 'client', T - 7 * DAY + i * 10 * MIN, { unread: i >= 35 })),
  ];
  await insertMany('messages', ms);
}

async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  for (const col of ['coachClients', 'clientProfiles', 'messages', 'notifications', 'checkIns', 'syncRecords']) await db.deleteMany(col, { clientId: re });
  await db.deleteMany('coachClients', { _id: { $regex: `__${PFX}` } });
  await db.deleteMany('users', { _id: re });
}

async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitForLocaleSaved(page, LOCALE_OF[label]); // B3.9.0: <html lang> + the stored settings, instead of a fixed 600 ms
}

/** A browser context signed in as one of this spec's own clients (the client app needs their profile). */
async function asClient(browser: Browser, env: E2EEnv, testInfo: TestInfo, clientId: string, name: string, db: Db) {
  const now = Date.now();
  await db.updateOne('clientProfiles', { _id: clientId }, { $set: { profile: { id: clientId, name, age: 29, weightKg: 62, heightCm: 166, goal: 'fat_loss', activityLevel: 'moderate', locale: 'en', createdAt: now, updatedAt: now } } });
  const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: env.baseURL, ...sized(1280) });
  const stub = new URL(env.bunny.cdn).origin;
  const { raw } = (await fetch(`${stub}/__e2e/session`, { method: 'POST', body: JSON.stringify({ userId: clientId }) }).then((r) => r.json())) as { raw: string };
  await ctx.addCookies([{ name: 'forma_rt', value: raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
  await ctx.addInitScript(() => localStorage.setItem('forma.locale', 'en'));
  return ctx;
}

/** The long conversation's last 25 back to unread (earlier tests read it). */
const markLongUnread = (db: Db) => db.updateMany('messages', { clientId: C.long.id, fromRole: 'client', createdAt: { $gte: T - 7 * DAY + 35 * 10 * MIN } }, { $set: { seenAt: null } });
const rows = (page: Page) => page.getByTestId('thread-row');
const rowOf = (page: Page, id: string) => page.locator(`[data-testid="thread-row"][data-client-id="${id}"]`);
const bubble = (page: Page, text: string) => page.getByTestId('message-bubble').filter({ hasText: text });
const scroller = (page: Page) => page.getByTestId('message-thread').locator('> div').first();
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const historyLength = (page: Page) => page.evaluate(() => window.history.length);

async function openInbox(page: Page) {
  await page.goto('/coach/messages');
  await ready(page);
  await expect(rowOf(page, C.amira.id)).toBeVisible({ timeout: 20_000 });
  await expect(rowOf(page, C.amira.id).getByTestId('thread-preview')).not.toHaveText('', { timeout: 20_000 });
}

test.describe('B3.6 coach Messages', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeAll(async ({ db, env }) => {
    await removeFixtures(db);
    await insertFixtures(env);
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('inbox: newest first, honest previews ("You:", deleted, media), unread counts, search, Unread keeps the open conversation, 30+ rows', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openInbox(page);
    const ids = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-client-id')));
    expect(ids.length).toBeGreaterThanOrEqual(ACTIVE.length);
    expect(ids).not.toContain(C.gone.id); // an ended relationship is not a conversation
    // Newest first, by the real last-message time.
    expect(ids.indexOf(C.amira.id)).toBeLessThan(ids.indexOf(C.bassem.id));
    expect(ids.indexOf(C.bassem.id)).toBeLessThan(ids.indexOf(C.carla.id));
    expect(ids.indexOf(C.carla.id)).toBeLessThan(ids.indexOf(C.dina.id));
    expect(ids.indexOf(C.dina.id)).toBeLessThan(ids.indexOf(C.sara.id));
    expect(ids.indexOf(FILLERS[0].id)).toBeLessThan(ids.indexOf(FILLERS[23].id));
    const preview = (id: string) => rowOf(page, id).getByTestId('thread-preview');
    await expect(preview(C.amira.id)).toHaveText('And can I swap the rowing?');
    await expect(preview(C.bassem.id)).toHaveText('You: See you Monday');
    await expect(preview(C.carla.id)).toHaveText('You: Message deleted');
    await expect(preview(C.dina.id)).toHaveText('📷 Photo');
    await expect(preview(C.omar.id)).toHaveText('🎙️ Voice message');
    await expect(rowOf(page, C.amira.id).getByTestId('thread-unread-badge')).toHaveText(/^2\s*2 unread messages$/);
    await expect(rowOf(page, C.bassem.id).getByTestId('thread-unread-badge')).toHaveCount(0);
    await expect(page.getByTestId('inbox-unread-line')).toHaveText('3 unread conversations'); // amira, dina, long
    await shot(page, testInfo, '01-inbox-1440');

    // Search by name and by email.
    await page.getByTestId('inbox-search').fill('bass');
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('inbox-search').fill(`${PFX}f07@`);
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('inbox-search').fill('nobody at all');
    await expect(page.getByTestId('inbox-no-results')).toBeVisible();
    await page.getByTestId('inbox-no-results').getByRole('button').click();
    await expect(rows(page)).toHaveCount(ids.length);

    // Unread: only conversations with unread messages… and the open one never disappears (MS-09).
    await page.getByTestId('inbox-filter-unread').click();
    await expect(page.getByTestId('inbox-filter-unread')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(3);
    await rowOf(page, C.amira.id).click();
    await expect(page).toHaveURL(new RegExp(`/coach/messages/${C.amira.id}$`));
    await expect(bubble(page, 'And can I swap the rowing?')).toBeVisible();
    // Read now: the badge goes at once (not on the next 20 s tick) and the row stays while it is open.
    await expect(rowOf(page, C.amira.id).getByTestId('thread-unread-badge')).toHaveCount(0, { timeout: 8_000 });
    await page.waitForTimeout(21_000); // one full summary tick
    await expect(rowOf(page, C.amira.id)).toBeVisible();
    await expect(page.getByTestId('thread-recipient')).toHaveText(C.amira.name);
    await expect(rows(page)).toHaveCount(3); // amira (open, now read) + dina + long
    await shot(page, testInfo, '02-unread-filter-open-conversation');

    // The inbox list scrolls inside its pane with 30+ conversations; the page itself does not.
    await page.getByTestId('inbox-filter-all').click();
    const list = page.getByTestId('inbox-pane').locator('.overflow-y-auto');
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await rowOf(page, FILLERS[23].id).scrollIntoViewIfNeeded();
    await expect(rowOf(page, FILLERS[23].id)).toBeInViewport();
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(2);
  });

  test('split view (1440 + 768): the selection is the URL — switching replaces history, reload and deep links keep it', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    for (const w of [1440, 768]) {
      const { page } = await as('coachPro', sized(w, w === 768 ? 1024 : 900));
      await openInbox(page);
      await expect(page.getByTestId('thread-empty')).toBeVisible();
      await rowOf(page, C.bassem.id).click();
      await expect(page).toHaveURL(new RegExp(`/coach/messages/${C.bassem.id}$`));
      const h = await historyLength(page);
      await rowOf(page, C.sara.id).click();
      await expect(page).toHaveURL(new RegExp(`/coach/messages/${C.sara.id}$`));
      await rowOf(page, C.omar.id).click();
      await expect(page).toHaveURL(new RegExp(`/coach/messages/${C.omar.id}$`));
      expect(await historyLength(page), 'switching conversations is not a history trail').toBe(h);
      await expect(rowOf(page, C.omar.id)).toHaveAttribute('aria-current', 'true');
      await expect(rowOf(page, C.sara.id)).not.toHaveAttribute('aria-current', 'true');
      await expect(page.getByTestId('thread-recipient')).toHaveText(C.omar.name);
      await expect(page.getByTestId('thread-context')).toContainText(/Active|Ends in/);
      await page.reload();
      await ready(page);
      await expect(page.getByTestId('thread-recipient')).toHaveText(C.omar.name, { timeout: 20_000 });
      await expect(rowOf(page, C.omar.id)).toHaveAttribute('aria-current', 'true');
      // No tab bar and no Back at this width; the composer is inside the conversation pane.
      await expect(page.getByTestId('thread-back')).toHaveCount(0);
      const send = await page.getByTestId('message-send').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { ok: hit === el || el.contains(hit), bottom: r.bottom, vh: window.innerHeight };
      });
      expect(send.ok).toBe(true);
      expect(send.bottom).toBeLessThanOrEqual(send.vh);
      await shot(page, testInfo, `03-split-${w}`);
    }
    // A deep link (e.g. from a notification) opens the same split with that conversation selected.
    const { page } = await as('coachPro', sized(1024, 768));
    await page.goto(`/coach/messages/${C.dina.id}`);
    await ready(page);
    await expect(page.getByTestId('coach-desktop-messages')).toBeVisible();
    await expect(page.getByTestId('thread-recipient')).toHaveText(C.dina.name, { timeout: 20_000 });
    await expect(rowOf(page, C.dina.id)).toHaveAttribute('aria-current', 'true');
  });

  test('phone (390): inbox → full-screen conversation (no tab bar, recipient named) → Back → inbox, search kept; deep link → Back → inbox', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    await openInbox(page);
    await page.getByTestId('inbox-search').fill('Bassem');
    await rowOf(page, C.bassem.id).click();
    await expect(page).toHaveURL(new RegExp(`/coach/messages/${C.bassem.id}$`));
    const layer = page.getByTestId('coach-thread');
    await expect(layer).toHaveAttribute('role', 'dialog');
    await expect(page.getByTestId('thread-recipient')).toHaveText(C.bassem.name);
    await expect(bubble(page, 'See you Monday')).toBeVisible();
    const geo = await page.evaluate(() => {
      const layerEl = document.querySelector('[data-testid="coach-thread"]')!.getBoundingClientRect();
      const send = document.querySelector('[data-testid="message-send"]')!.getBoundingClientRect();
      const hit = document.elementFromPoint(send.x + send.width / 2, send.y + send.height / 2);
      const bottomHit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 4);
      return {
        top: layerEl.top,
        bottom: layerEl.bottom,
        vh: window.innerHeight,
        sendHit: (hit as HTMLElement | null)?.closest('[data-testid]')?.getAttribute('data-testid'),
        bottomInTabBar: !!bottomHit?.closest('nav'),
      };
    });
    expect(geo.top).toBe(0);
    expect(geo.bottom).toBe(geo.vh);
    expect(geo.sendHit).toBe('message-send');
    expect(geo.bottomInTabBar, 'the tab bar is not on top of the conversation').toBe(false);
    await shot(page, testInfo, '04-phone-thread');
    await page.getByTestId('thread-back').click();
    await expect(page).toHaveURL(/\/coach\/messages$/);
    await expect(page.getByTestId('inbox-search')).toHaveValue('Bassem');
    await expect(rows(page)).toHaveCount(1);

    // Deep link, fresh context: Back goes to the inbox (the semantic parent).
    const { page: fresh } = await as('coachPro', phone);
    await fresh.goto(`/coach/messages/${C.sara.id}`);
    await ready(fresh);
    await expect(fresh.getByTestId('thread-recipient')).toHaveText(C.sara.name, { timeout: 20_000 });
    await fresh.getByTestId('thread-back').click();
    await expect(fresh).toHaveURL(/\/coach\/messages$/);
    await expect(rowOf(fresh, C.sara.id)).toBeVisible();
  });

  test('NAV-K07: thread ↔ client never ping-pongs — Open client returns to the workspace it came from, Message returns to the thread', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/client/${C.bassem.id}`);
    await ready(page);
    await expect(page.getByTestId('coach-client-detail')).toBeVisible({ timeout: 20_000 });
    const h0 = await historyLength(page);
    await page.getByTestId('workspace-message').click();
    await expect(page).toHaveURL(new RegExp(`/coach/messages/${C.bassem.id}$`));
    await page.getByTestId('thread-open-client').click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.bassem.id}$`));
    await page.getByTestId('workspace-message').click();
    await expect(page).toHaveURL(new RegExp(`/coach/messages/${C.bassem.id}$`));
    await page.getByTestId('thread-open-client').click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.bassem.id}$`));
    expect(await historyLength(page), 'at most one thread entry on top of the workspace').toBeLessThanOrEqual(h0 + 1);
  });

  test('drafts: kept per conversation across switching and reload, never shown in another client, cleared by Send', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/messages/${C.bassem.id}`);
    await ready(page);
    const input = page.getByTestId('message-input');
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill('Half an answer for Bassem — check the knee first');
    await page.waitForTimeout(400);
    await rowOf(page, C.sara.id).click();
    await expect(page.getByTestId('thread-recipient')).toHaveText(C.sara.name);
    await expect(input).toHaveValue(''); // never misrouted into another client's composer
    await input.fill('رد لسارة');
    await page.waitForTimeout(400);
    await rowOf(page, C.bassem.id).click();
    await expect(input).toHaveValue('Half an answer for Bassem — check the knee first');
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('message-input')).toHaveValue('Half an answer for Bassem — check the knee first', { timeout: 20_000 });
    await rowOf(page, C.sara.id).click();
    await expect(page.getByTestId('message-input')).toHaveValue('رد لسارة');
    await shot(page, testInfo, '05-draft-restored');
    // Send clears it for good.
    await page.getByTestId('message-input').fill('Sara: draft sent');
    await page.getByTestId('message-send').click();
    await expect(bubble(page, 'Sara: draft sent')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('message-input')).toHaveValue('', { timeout: 20_000 });
    // Keys are per account + client (`messageDraft:<coach>:<client>`): another account on this device never reads them (unit-tested).
  });

  test('offline: a message sent offline waits, then is delivered exactly once; a send whose answer was lost retries without a duplicate', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    audit.allow5xx(/messages\.send/);
    const { page, context } = await as('coachPro', sized(1440));
    await page.goto(`/coach/messages/${C.bassem.id}`);
    await ready(page);
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 20_000 });
    await context.setOffline(true);
    await expect(page.getByTestId('composer-offline')).toBeVisible();
    await page.getByTestId('message-input').fill('Sent while offline at the gym');
    await page.getByTestId('message-send').click();
    const pending = page.getByTestId('message-bubble-pending').filter({ hasText: 'Sent while offline at the gym' });
    await expect(pending).toHaveAttribute('data-outbox-status', /waiting_for_network|failed_retryable/, { timeout: 15_000 });
    await expect(pending).toContainText(/Waiting for a connection|trying again/);
    await expect(page.getByTestId('message-input')).toHaveValue('');
    await shot(page, testInfo, '06-offline-waiting');
    expect(await db.count('messages', { clientId: C.bassem.id, body: 'Sent while offline at the gym' })).toBe(0);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(bubble(page, 'Sent while offline at the gym')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('composer-offline')).toHaveCount(0);
    await expect(pending).toHaveCount(0);
    expect(await db.count('messages', { clientId: C.bassem.id, body: 'Sent while offline at the gym' })).toBe(1);

    // The server stores the message but the answer is lost (a 500 on the way back): Retry reuses the same id.
    let lost = 0;
    await page.route('**/api/trpc/**messages.send**', async (route) => {
      if (lost === 0) {
        lost += 1;
        await route.fetch(); // the server DID insert it
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify([{ error: { message: 'lost', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } }]) });
      }
      return route.continue();
    });
    await page.getByTestId('message-input').fill('Answer lost on the way back');
    await page.getByTestId('message-send').click();
    const retrying = page.getByTestId('message-bubble-pending').filter({ hasText: 'Answer lost on the way back' });
    await expect(retrying).toHaveAttribute('data-outbox-status', 'failed_retryable', { timeout: 15_000 });
    await retrying.getByTestId('message-retry').click();
    await expect(bubble(page, 'Answer lost on the way back')).toHaveCount(1, { timeout: 30_000 });
    await expect(retrying).toHaveCount(0);
    await page.waitForTimeout(6_000); // a poll tick
    await expect(bubble(page, 'Answer lost on the way back')).toHaveCount(1);
    expect(await db.count('messages', { clientId: C.bassem.id, body: 'Answer lost on the way back' })).toBe(1);
    await page.unroute('**/api/trpc/**messages.send**');
  });

  test('unread: opens at the divider, read only once the newest is on screen; a new message while reading older shows the pill without a jump', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    await markLongUnread(db);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/messages/${C.long.id}`);
    await ready(page);
    const divider = page.getByTestId('unread-divider');
    await expect(divider).toHaveText('25 new messages', { timeout: 20_000 });
    await expect(divider).toBeInViewport();
    await expect(bubble(page, 'Long thread line 35')).toBeInViewport();
    await expect(bubble(page, 'Long thread line 59')).not.toBeInViewport();
    await shot(page, testInfo, '07-unread-divider');
    await page.waitForTimeout(7_000); // > one thread poll: still unread on the server
    expect(await db.count('messages', { clientId: C.long.id, fromRole: 'client', seenAt: null })).toBe(25);
    await expect(rowOf(page, C.long.id).getByTestId('thread-unread-badge')).toBeVisible();
    // Reading down to the newest marks the conversation read.
    await scroller(page).evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await pollDb(() => db.count('messages', { clientId: C.long.id, fromRole: 'client', seenAt: null }), (n) => n === 0);
    await expect(rowOf(page, C.long.id).getByTestId('thread-unread-badge')).toHaveCount(0, { timeout: 8_000 });
    await expect(divider).toBeVisible(); // stays put for this visit

    // Reading older messages when a new one arrives: no jump, a pill instead.
    await scroller(page).evaluate((el) => (el.scrollTop = 200));
    await page.waitForTimeout(400);
    const before = await scroller(page).evaluate((el) => el.scrollTop);
    const at = Date.now();
    await db.insertOne('messages', msg('ynew', C.long.id, 'New while you read old ones', 'client', at, { unread: true }));
    await expect(page.getByTestId('jump-to-latest')).toHaveText(/1 new message/, { timeout: 15_000 });
    expect(Math.abs((await scroller(page).evaluate((el) => el.scrollTop)) - before)).toBeLessThan(50);
    await page.getByTestId('jump-to-latest').click();
    await expect(bubble(page, 'New while you read old ones')).toBeInViewport();
  });

  test('Arabic: right-to-left inbox and conversation; mixed Arabic / English text keeps its own direction; no overflow (390 + 1440)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    for (const ctx of [phone, sized(1440)]) {
      const { page } = await as('coachPro', ctx);
      const w = ctx === phone ? 390 : 1440;
      await setLanguage(page, 'العربية');
      try {
        await page.goto(w === 390 ? '/coach/messages' : `/coach/messages/${C.sara.id}`);
        await ready(page);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(rowOf(page, C.carla.id).getByTestId('thread-preview')).toHaveText(`${ar.messages.youPrefix} ${ar.messages.deletedTombstone}`, { timeout: 20_000 });
        await expect(rowOf(page, C.dina.id).getByTestId('thread-preview')).toHaveText(ar.messages.photoMsg);
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
        await shot(page, testInfo, `08-ar-inbox-${w}`);
        if (w === 390) await rowOf(page, C.sara.id).click();
        await expect(page.getByTestId('thread-recipient')).toHaveText(C.sara.name);
        await expect(bubble(page, 'هعمل 3 sets')).toBeVisible();
        await page.getByTestId('message-input').fill('ممتاز! keep the rest at 90s');
        await expect(page.getByTestId('message-input')).toHaveAttribute('aria-label', ar.messages.composerLabel);
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
        await shot(page, testInfo, `09-ar-thread-${w}`);
        await page.getByTestId('message-input').fill('');
      } finally {
        await setLanguage(page, 'English').catch(() => undefined);
      }
    }
  });

  test('attachments: an image from the CDN, a voice note that cannot play here says so; a failing upload provider is never shown as sent', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    audit.allow5xx(/\/api\/media/);
    const { page } = await as('coachPro', sized(1440));
    page.on('dialog', (d) => void d.accept());
    await page.goto(`/coach/messages/${C.dina.id}`);
    await ready(page);
    await expect(page.getByTestId('message-thread').locator('img[src$="meal.png"]')).toHaveCount(1, { timeout: 20_000 });
    await rowOf(page, C.omar.id).click();
    const voice = page.getByTestId('message-thread').locator('[data-testid="voice-note"], [data-testid="voice-note-unplayable"]');
    await expect(voice).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId('message-thread').locator('audio[src$="voice.webm"]')).toHaveCount(1);
    // The stub file is not real audio: the player says it can't play it instead of sitting there dead.
    await expect(page.getByTestId('voice-note-unplayable')).toBeVisible({ timeout: 15_000 });
    await shot(page, testInfo, '10-voice-note');

    // Upload provider failing (Bunny 401 → 502 `failed`): the message stays pending/retrying, nothing reaches the thread.
    const attach = page.getByTestId('message-attach');
    if ((await attach.count()) === 0) test.info().annotations.push({ type: 'uploads', description: 'uploads not configured on this stack — attach hidden (honest)' });
    else {
      await page.route('**/api/media/**', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'failed' }) }));
      const png = await makePng(page, '#3366aa', 64);
      await page.getByTestId('message-thread').locator('input[type=file]').setInputFiles({ name: 'form-check.png', mimeType: 'image/png', buffer: png });
      await page.getByTestId('message-send').click();
      // Told at once, truthfully: the upload failed and the message is kept for a retry (never "sent").
      await expect(page.getByTestId('confirm-dialog')).toContainText('Upload failed', { timeout: 20_000 });
      await expect(page.getByTestId('confirm-dialog')).toContainText('kept on this device');
      await page.getByTestId('confirm-accept').click();
      const pending = page.getByTestId('message-bubble-pending');
      await expect(pending).toHaveCount(1, { timeout: 15_000 });
      await expect(pending).toHaveAttribute('data-outbox-status', /failed_retryable|sending|waiting_for_network/);
      await expect(pending).not.toContainText(/Sent|Seen/);
      await shot(page, testInfo, '11-upload-provider-failing');
      expect(await db.count('messages', { clientId: C.omar.id, 'attachment.name': 'form-check.png' })).toBe(0);
      // Provider back: the queued attachment is delivered once.
      await page.unroute('**/api/media/**');
      await pending.getByTestId('message-retry').click();
      await pollDb(() => db.count('messages', { clientId: C.omar.id, 'attachment.name': 'form-check.png' }), (n) => n === 1, 40_000);
      await expect(pending).toHaveCount(0, { timeout: 20_000 });
    }
  });

  test('transfer with a message queued before it: refused, never redirected to the new coach; the conversation closes; the new coach sees nothing', async ({ as, db, env, browser, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page, context } = await as('coachPro', sized(1440));
    try {
      await page.goto(`/coach/messages/${C.live.id}`);
      await ready(page);
      await expect(bubble(page, 'Welcome Laila!')).toBeVisible({ timeout: 20_000 });
      await context.setOffline(true);
      await page.getByTestId('message-input').fill('Queued before the transfer');
      await page.getByTestId('message-send').click();
      await expect(page.getByTestId('message-bubble-pending')).toHaveAttribute('data-outbox-status', /waiting_for_network|failed_retryable/, { timeout: 15_000 });
      // The admin moves Laila to another coach meanwhile.
      const now = Date.now();
      await db.updateOne('coachClients', { _id: `${COACH}__${C.live.id}` }, { $set: { status: 'ended', endedAt: now, endReason: 'transferred', mode: 'keep_plans', updatedAt: now } });
      await db.insertOne('coachClients', { _id: `${OTHER_COACH}__${C.live.id}`, coachId: OTHER_COACH, clientId: C.live.id, status: 'active', createdBy: 'e2e-admin', createdAt: now, updatedAt: now });
      await db.updateOne('users', { _id: C.live.id }, { $set: { assignedCoachId: OTHER_COACH } });
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));

      await expect(page.getByTestId('thread-access-ended')).toBeVisible({ timeout: 30_000 });
      await expect(bubble(page, 'Welcome Laila!')).toHaveCount(0); // nothing of the conversation stays on screen
      await expect(page.getByTestId('message-input')).toHaveCount(0);
      const refused = page.getByTestId('message-bubble-pending').filter({ hasText: 'Queued before the transfer' });
      await expect(refused).toContainText('Not sent — this client is no longer assigned to you.', { timeout: 30_000 });
      await expect(refused.getByTestId('message-retry')).toHaveCount(0); // can never succeed: Delete only
      await expect(page.getByTestId('thread-recipient')).toHaveText(C.live.name); // still says whom it was
      await shot(page, testInfo, '12-transfer-refused');
      expect(await db.count('messages', { clientId: C.live.id, body: 'Queued before the transfer' })).toBe(0);
      // The inbox drops her.
      await expect(rowOf(page, C.live.id)).toHaveCount(0, { timeout: 20_000 });

      // The new coach: an empty conversation — no earlier coach's messages, no queued one.
      const { page: b } = await as('coachB', sized(1440));
      await b.goto(`/coach/messages/${C.live.id}`);
      await ready(b);
      await expect(b.getByTestId('message-input')).toBeVisible({ timeout: 20_000 });
      await b.waitForTimeout(1_500);
      await expect(b.getByTestId('message-bubble')).toHaveCount(0);
      await expect(b.getByText('Welcome Laila!')).toHaveCount(0);

      // The client keeps the earlier conversation apart, read-only, without the refused message.
      const ctx = await asClient(browser, env, testInfo, C.live.id, C.live.name, db);
      try {
        const cp = await ctx.newPage();
        await cp.goto('/messages');
        await ready(cp);
        await expect(cp.getByTestId('message-history-toggle')).toBeVisible({ timeout: 20_000 });
        await expect(cp.getByText('Queued before the transfer')).toHaveCount(0);
      } finally {
        await ctx.close();
      }
    } finally {
      const now = Date.now();
      await db.deleteMany('coachClients', { _id: `${OTHER_COACH}__${C.live.id}` });
      await db.updateOne('coachClients', { _id: `${COACH}__${C.live.id}` }, { $set: { status: 'active', updatedAt: now }, $unset: { endedAt: '', endReason: '', mode: '' } });
      await db.updateOne('users', { _id: C.live.id }, { $set: { assignedCoachId: COACH } });
    }
  });

  test('not assigned / ended: a deep link to a released client shows nothing of the conversation; a suspended client is labelled', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    for (const ctx of [phone, sized(1440)]) {
      const { page } = await as('coachPro', ctx);
      await page.goto(`/coach/messages/${C.gone.id}`);
      await ready(page);
      // Either the roster already says so, or the server refused the thread first — the same honest state.
      await expect(page.locator('[data-testid="thread-not-assigned"], [data-testid="thread-access-ended"]')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('thread-header')).toContainText('No longer assigned to you');
      await expect(page.getByText('Thanks for everything')).toHaveCount(0);
      await expect(page.getByTestId('message-input')).toHaveCount(0);
      await expect(page.getByTestId('thread-more')).toHaveCount(0);
      await shot(page, testInfo, `13-not-assigned-${ctx === phone ? 390 : 1440}`);
    }
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/messages/${C.hany.id}`);
    await ready(page);
    await expect(page.getByTestId('thread-context').getByTestId('client-account-warning')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('message-input')).toBeVisible(); // the coach may still write (the client reads when back)
  });

  test('notification deep link: a new-message toast opens that conversation; the open conversation is never toasted', async ({ as, db, env, browser, audit }, testInfo) => {
    test.setTimeout(240_000);
    allowDevModuleStorm(audit);
    const ctx = await asClient(browser, env, testInfo, C.live.id, C.live.name, db);
    try {
      const client = await ctx.newPage();
      await client.goto('/messages');
      await ready(client);
      await expect(client.getByTestId('message-input')).toBeVisible({ timeout: 20_000 });

      const { page } = await as('coachPro', phone);
      await page.goto('/coach/dashboard');
      await ready(page);
      await page.waitForTimeout(2_000); // the toast baseline: only messages from now on
      await client.getByTestId('message-input').fill('Toast me please');
      await client.getByTestId('message-send').click();
      const toast = page.getByTestId('toast').filter({ hasText: 'Toast me please' });
      await expect(toast).toBeVisible({ timeout: 40_000 });
      await toast.click();
      await expect(page).toHaveURL(new RegExp(`/coach/messages/${C.live.id}$`));
      await expect(page.getByTestId('coach-thread')).toBeVisible();
      await expect(bubble(page, 'Toast me please')).toBeVisible({ timeout: 15_000 });
      await shot(page, testInfo, '14-toast-opened-thread');

      // Desktop split with that conversation open: its new messages arrive in the thread, not as a toast.
      const { page: desk } = await as('coachPro', sized(1440));
      await desk.goto(`/coach/messages/${C.live.id}`);
      await ready(desk);
      await expect(bubble(desk, 'Toast me please')).toBeVisible({ timeout: 20_000 });
      await desk.waitForTimeout(2_000);
      await client.getByTestId('message-input').fill('No toast for the open one');
      await client.getByTestId('message-send').click();
      await expect(bubble(desk, 'No toast for the open one')).toBeVisible({ timeout: 15_000 });
      await desk.waitForTimeout(28_000); // one notification poll
      await expect(desk.getByTestId('toast').filter({ hasText: 'No toast for the open one' })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('Seen is the client’s read receipt: Sent while unread (also after the coach reloads), Seen only once the client opens the conversation', async ({ as, db, env, browser, audit }, testInfo) => {
    test.setTimeout(180_000);
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/messages/${C.live.id}`);
    await ready(page);
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 20_000 });
    const text = `Receipt check ${Date.now().toString(36)}`;
    await page.getByTestId('message-input').fill(text);
    await page.getByTestId('message-send').click();
    const mine = bubble(page, text);
    await expect(mine).toContainText('Sent', { timeout: 15_000 });
    await expect(mine).not.toContainText('Seen');
    // The coach reading (and re-opening) their own conversation records nothing.
    await page.reload();
    await ready(page);
    await expect(bubble(page, text)).toContainText('Sent', { timeout: 20_000 });
    await page.waitForTimeout(21_000); // a full refresh of the window (receipts arrive on it)
    await expect(bubble(page, text)).not.toContainText('Seen');
    expect((await db.findOne<{ seenAt?: number | null }>('messages', { clientId: C.live.id, body: text }))?.seenAt ?? null).toBeNull();
    // The client opens the conversation: the server records the receipt, and only then the coach sees Seen.
    const ctx = await asClient(browser, env, testInfo, C.live.id, C.live.name, db);
    try {
      const client = await ctx.newPage();
      await client.goto('/messages');
      await ready(client);
      await expect(client.getByText(text)).toBeVisible({ timeout: 20_000 });
      await pollDb(() => db.findOne<{ seenAt?: number | null }>('messages', { clientId: C.live.id, body: text }), (m) => !!m?.seenAt);
      await expect(bubble(page, text)).toContainText('Seen', { timeout: 30_000 });
      await shot(page, testInfo, '18-seen-after-client-read');
    } finally {
      await ctx.close();
    }
  });

  test('keyboard (390): with the on-screen keyboard open the composer sits right above it, never under the tab bar', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', { ...phone, hasTouch: true });
    await page.goto(`/coach/messages/${C.bassem.id}`);
    await ready(page);
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('message-input').tap();
    // Emulate a 320 px keyboard through the Visual Viewport API (what Android Chrome / iOS Safari report).
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      const h = window.innerHeight - 320;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
      Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 0 });
      vv.dispatchEvent(new Event('resize'));
    });
    await expect(page.getByTestId('coach-thread')).toHaveAttribute('data-keyboard', 'true');
    const geo = await page.evaluate(() => {
      const send = document.querySelector('[data-testid="message-send"]')!.getBoundingClientRect();
      const composer = document.querySelector('[data-testid="message-composer"]')!;
      return { sendBottom: send.bottom, limit: window.innerHeight - 320, pad: getComputedStyle(composer).paddingBottom };
    });
    expect(geo.sendBottom).toBeLessThanOrEqual(geo.limit);
    expect(geo.sendBottom).toBeGreaterThan(geo.limit - 80); // right above it, not floating mid-screen
    expect(geo.pad).toBe('8px'); // no home-indicator padding stacked on top of the keyboard
    await shot(page, testInfo, '15-keyboard-emulated');
    await page.getByTestId('message-input').fill('Typed above the keyboard');
    await page.getByTestId('message-send').tap();
    await expect(bubble(page, 'Typed above the keyboard')).toBeVisible({ timeout: 15_000 });
  });

  test('broadcast: the audience is explicit (never the inbox filter), preview, per-recipient result, Retry failed sends only to the failed — never twice', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openInbox(page);
    await page.getByTestId('inbox-filter-unread').click();
    await page.getByTestId('messages-more').click();
    await page.getByTestId('broadcast-open').click();
    await expect(page.getByTestId('broadcast-audience-all')).toContainText(`All clients (${ACTIVE.length})`); // not the 1–3 unread rows
    await page.getByTestId('broadcast-audience-chosen').click();
    const pick = (name: string) => page.getByTestId('broadcast-recipients').locator('label').filter({ hasText: name }).getByTestId('broadcast-recipient');
    for (const f of FILLERS.slice(0, 3)) await pick(f.name).check();
    await expect(page.getByTestId('broadcast-chosen-count')).toHaveText('3 selected');
    await page.getByTestId('broadcast-category-reminder').click();
    await page.getByTestId('broadcast-body').fill('Gym closed Friday — rest day for everyone');
    await expect(page.getByTestId('broadcast-preview')).toContainText('Reminder');
    await expect(page.getByTestId('broadcast-send')).toHaveText('Send to 3 clients');
    await shot(page, testInfo, '16-broadcast-compose');
    // One of them is released while the coach composes.
    await db.updateOne('coachClients', { _id: `${COACH}__${FILLERS[1].id}` }, { $set: { status: 'ended', endedAt: Date.now(), endReason: 'released' } });
    try {
      await page.getByTestId('broadcast-send').click();
      await confirmYes(page);
      await expect(page.getByTestId('broadcast-summary')).toHaveText('Sent to 2 of 3 clients', { timeout: 20_000 });
      await expect(page.getByTestId('broadcast-failed-list')).toContainText(FILLERS[1].name);
      await expect(page.getByTestId('broadcast-failed-list')).toContainText('Not sent — no longer your client'); // a refusal: it was not stored
      await expect(page.getByTestId('broadcast-not-sent')).toHaveText('1 not sent');
      await expect(page.getByTestId('broadcast-unconfirmed')).toHaveCount(0);
      await shot(page, testInfo, '17-broadcast-partial');
      await db.updateOne('coachClients', { _id: `${COACH}__${FILLERS[1].id}` }, { $set: { status: 'active' }, $unset: { endedAt: '', endReason: '' } });
      await page.getByTestId('broadcast-retry').click();
      await expect(page.getByTestId('broadcast-summary')).toHaveText('Sent to 3 of 3 clients', { timeout: 20_000 });
      for (const f of FILLERS.slice(0, 3)) {
        const copies = await db.find<{ category?: string; clientMsgId?: string }>('messages', { clientId: f.id, body: 'Gym closed Friday — rest day for everyone' });
        expect(copies, f.name).toHaveLength(1);
        expect(copies[0].category).toBe('reminder');
        expect(copies[0].clientMsgId).toMatch(/^bc_/);
      }
      expect(await db.count('messages', { clientId: FILLERS[3].id, body: 'Gym closed Friday — rest day for everyone' })).toBe(0);
      await page.getByTestId('broadcast-done').click();
      await expect(page.getByTestId('broadcast-result')).toHaveCount(0);

      // The answers are lost after the server stored the copies: "not confirmed" (never "sent", never "not sent"),
      // and Retry stores nothing new — exactly one copy each.
      audit.allow5xx(/messages\.send/);
      let lose = true;
      await page.route('**/api/trpc/**messages.send**', async (route) => {
        if (!lose) return route.continue();
        await route.fetch(); // the server DID store them
        return route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' });
      });
      const LOST = 'Lost-answer check — pool open at 7';
      await page.getByTestId('messages-more').click();
      await page.getByTestId('broadcast-open').click();
      await page.getByTestId('broadcast-audience-chosen').click();
      for (const f of FILLERS.slice(4, 6)) await pick(f.name).check();
      await page.getByTestId('broadcast-body').fill(LOST);
      await page.getByTestId('broadcast-send').click();
      await confirmYes(page);
      await expect(page.getByTestId('broadcast-summary')).toHaveText('Sent to 0 of 2 clients', { timeout: 40_000 });
      await expect(page.getByTestId('broadcast-unconfirmed')).toHaveText('2 not confirmed — may have arrived');
      await expect(page.getByTestId('broadcast-not-sent')).toHaveCount(0);
      for (const f of FILLERS.slice(4, 6)) expect(await db.count('messages', { clientId: f.id, body: LOST }), f.name).toBe(1);
      await shot(page, testInfo, '19-broadcast-unconfirmed');
      lose = false;
      await page.getByTestId('broadcast-retry').click();
      await expect(page.getByTestId('broadcast-summary')).toHaveText('Sent to 2 of 2 clients', { timeout: 20_000 });
      for (const f of FILLERS.slice(4, 6)) expect(await db.count('messages', { clientId: f.id, body: LOST }), f.name).toBe(1);
      await page.unroute('**/api/trpc/**messages.send**');
      await page.getByTestId('broadcast-done').click();
    } finally {
      await db.updateOne('coachClients', { _id: `${COACH}__${FILLERS[1].id}` }, { $set: { status: 'active' }, $unset: { endedAt: '', endReason: '' } });
    }
  });

  test('accessibility: inbox, conversation and broadcast — no axe violations (WCAG 2.1 A / AA, EN + AR, 390 + 1440)', async ({ as, db, audit }, testInfo) => {
    test.setTimeout(300_000);
    allowDevModuleStorm(audit);
    const found: Record<string, string[]> = {};
    const scan = async (page: Page, name: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      found[name] = r.violations.map((v) => `${v.id} × ${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
    };
    for (const lang of ['en', 'ar'] as const) {
      for (const ctx of [phone, sized(1440)] as const) {
        const { page } = await as('coachPro', ctx);
        const w = ctx === phone ? 390 : 1440;
        if (lang === 'ar') await setLanguage(page, 'العربية');
        try {
          await markLongUnread(db);
          await openInbox(page);
          await scan(page, `${lang}-${w}-inbox`);
          await rowOf(page, C.long.id).click();
          await expect(page.getByTestId('unread-divider')).toBeVisible({ timeout: 20_000 });
          await scan(page, `${lang}-${w}-thread`);
          await page.goto('/coach/messages');
          await ready(page);
          await page.getByTestId('messages-more').click();
          await page.getByTestId('broadcast-open').click();
          await page.getByTestId('broadcast-audience-chosen').click();
          await scan(page, `${lang}-${w}-broadcast`);
        } finally {
          if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
          await page.context().close();
        }
      }
    }
    await testInfo.attach('axe-messages.json', { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
    expect(Object.entries(found).filter(([, v]) => v.length > 0)).toEqual([]);
  });

  test('visual QA matrix: inbox + conversation at 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR (+ Egyptian Arabic)', async ({ as, db, audit }, testInfo) => {
    test.setTimeout(900_000);
    allowDevModuleStorm(audit);
    const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b36-visual');
    fs.mkdirSync(outDir, { recursive: true });
    const shots: { name: string; overflow: number; dir: string }[] = [];
    const plan: { w: number; lang: 'en' | 'ar' | 'ar-eg' }[] = [];
    for (const w of [360, 390, 430, 768, 1024, 1440]) for (const lang of ['en', 'ar'] as const) plan.push({ w, lang });
    for (const w of [390, 1440]) plan.push({ w, lang: 'ar-eg' });
    const record = async (page: Page, name: string) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `${name}.png`) });
      shots.push({ name, overflow: await overflowOf(page), dir: await page.evaluate(() => document.documentElement.dir) });
    };
    for (const p of plan) {
      const { page } = await as('coachPro', p.w <= 430 ? { ...devices['Pixel 7'], viewport: { width: p.w, height: 844 } } : sized(p.w, p.w === 768 ? 1024 : p.w === 1024 ? 768 : 900));
      if (p.lang !== 'en') await setLanguage(page, p.lang === 'ar' ? 'العربية' : 'مصري');
      try {
        await openInbox(page);
        await record(page, `inbox-${p.w}-${p.lang}`);
        await rowOf(page, C.amira.id).click();
        await expect(page.getByTestId('thread-recipient')).toBeVisible({ timeout: 20_000 });
        await record(page, `thread-${p.w}-${p.lang}`);
        if (p.w === 390 || p.w === 1440) {
          await markLongUnread(db);
          await page.goto(`/coach/messages/${C.long.id}`);
          await ready(page);
          await expect(page.getByTestId('unread-divider')).toBeVisible({ timeout: 20_000 });
          await record(page, `thread-unread-${p.w}-${p.lang}`);
        }
      } finally {
        if (p.lang !== 'en') await setLanguage(page, 'English').catch(() => undefined);
        await page.context().close(); // one live app at a time (each one polls)
      }
    }
    fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(shots, null, 2));
    expect(shots.filter((s) => s.overflow > 0)).toEqual([]);
    expect(shots.filter((s) => s.dir !== (s.name.endsWith('-en') ? 'ltr' : 'rtl'))).toEqual([]);
  });
});
