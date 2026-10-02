import { test, expect, ready, shot } from '../fixtures';
import type { Page } from '@playwright/test';
import {
  CLIENT_A,
  makePng,
  pollDb,
  insertMany,
  seedMessage,
  allowDevModuleStorm,
  FAKE_MP4,
  FAKE_MP3,
  FAKE_PDF,
} from './_c-helpers';

/**
 * Messenger, desktop (1440): client (`/messages`) and coach
 * (`/coach/messages/<clientId>`) in TWO contexts. The thread polls every 5 s
 * (incremental by createdAt) with a full refresh every 4th tick, so remote
 * edits/deletes/reactions/seen receipts can take up to ~20 s to arrive.
 */

type Msg = { _id: string; body: string; fromRole: string; createdAt: number; updatedAt: number; deletedAt?: number; editedAt?: number; seenAt?: number | null; reactions?: Record<string, string>; attachment?: { url: string; kind: string; name?: string; mimeType?: string } };

const THREAD_SYNC = 30_000; // ≥ one full-refresh cycle (4 × 5 s) + slack

const bubbles = (page: Page) => page.getByTestId('message-bubble');
const bubble = (page: Page, text: string) => bubbles(page).filter({ hasText: text });
const scroller = (page: Page) => page.getByTestId('message-thread').locator('> div').first();

async function openThreads(as: (r: 'clientA' | 'coachA', o?: object) => Promise<{ page: Page }>, clientOpts?: object) {
  const client = (await as('clientA', clientOpts)).page;
  const coach = (await as('coachA')).page;
  await client.goto('/messages');
  await coach.goto(`/coach/messages/${CLIENT_A}`);
  await ready(client);
  await ready(coach);
  await expect(client.getByTestId('message-input')).toBeVisible();
  await expect(coach.getByTestId('message-input')).toBeVisible();
  return { client, coach };
}

async function send(page: Page, text: string) {
  await page.getByTestId('message-input').fill(text);
  await page.getByTestId('message-send').click();
  await expect(bubble(page, text)).toBeVisible();
}

const cdnRe = (cdn: string) => new RegExp(`^${cdn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`);

test.describe('messenger (desktop, two contexts)', () => {
  test.beforeEach(async ({ db, audit }) => {
    allowDevModuleStorm(audit);
    await db.deleteMany('messages', { clientId: CLIENT_A });
  });
  test.afterAll(async () => {
    // Leave clientA's thread empty for whatever runs next.
    const stub = `http://127.0.0.1:${process.env.E2E_STUB_PORT ?? '5299'}`;
    await fetch(`${stub}/__e2e/db`, { method: 'POST', body: JSON.stringify({ op: 'deleteMany', collection: 'messages', filter: { clientId: CLIENT_A } }) });
  });

  test('text both ways arrives in the other context without reload', async ({ as, db }, testInfo) => {
    test.setTimeout(120_000);
    const { client, coach } = await openThreads(as);
    await send(client, 'C hello coach from client');
    await expect(bubble(coach, 'C hello coach from client')).toBeVisible({ timeout: 15_000 });
    await send(coach, 'C hi client, coach here');
    await expect(bubble(client, 'C hi client, coach here')).toBeVisible({ timeout: 15_000 });
    // Enter sends on a fine-pointer device.
    await client.getByTestId('message-input').fill('C sent with Enter');
    await client.getByTestId('message-input').press('Enter');
    await expect(bubble(coach, 'C sent with Enter')).toBeVisible({ timeout: 15_000 });
    await shot(client, testInfo, '01-client-thread');
    await shot(coach, testInfo, '02-coach-thread');
    const rows = await db.find<Msg>('messages', { clientId: CLIENT_A }, { sort: { createdAt: 1 } });
    expect(rows.map((r) => [r.fromRole, r.body])).toEqual([
      ['client', 'C hello coach from client'],
      ['coach', 'C hi client, coach here'],
      ['client', 'C sent with Enter'],
    ]);
  });

  test('attachments: image, video, audio, PDF render and point at the stub CDN', async ({ as, db, env }, testInfo) => {
    test.setTimeout(180_000);
    const { client, coach } = await openThreads(as);
    const input = client.getByTestId('message-thread').locator('input[type=file]');
    const png = await makePng(client, '#22aa66', 120);
    const files = [
      { name: 'c-photo.png', mimeType: 'image/png', buffer: png, kind: 'image', sel: 'img' },
      { name: 'c-clip.mp4', mimeType: 'video/mp4', buffer: FAKE_MP4, kind: 'video', sel: 'video' },
      { name: 'c-note.mp3', mimeType: 'audio/mpeg', buffer: FAKE_MP3, kind: 'audio', sel: 'audio' },
      { name: 'c-plan.pdf', mimeType: 'application/pdf', buffer: FAKE_PDF, kind: 'file', sel: 'a' },
    ] as const;
    // Real users pick through the native picker, which honours `accept` —
    // record whether each type is even offered there.
    const accept = (await input.getAttribute('accept')) ?? '';
    testInfo.annotations.push({ type: 'attach-accept', description: accept });
    for (const f of files) {
      await input.setInputFiles({ name: f.name, mimeType: f.mimeType, buffer: f.buffer });
      await expect(client.getByTestId('composer-attachment-preview')).toBeVisible();
      await client.getByTestId('message-send').click();
      await expect(client.getByTestId('composer-attachment-preview')).toHaveCount(0);
      await expect(client.getByTestId('message-bubble-pending')).toHaveCount(0, { timeout: 30_000 });
    }
    const rows = await pollDb(() => db.find<Msg>('messages', { clientId: CLIENT_A }, { sort: { createdAt: 1 } }), (r) => r.length >= 4);
    expect(rows).toHaveLength(4);
    for (const [i, f] of files.entries()) {
      expect(rows[i].attachment?.kind, f.name).toBe(f.kind);
      expect(rows[i].attachment?.url, f.name).toMatch(cdnRe(env.bunny.cdn));
      expect(rows[i].body).toBe('');
    }
    const puts = await db.bunnyPuts();
    expect(puts.length).toBeGreaterThanOrEqual(4);
    for (const page of [client, coach]) {
      for (const [i, f] of files.entries()) {
        const el = page.getByTestId('message-thread').locator(`${f.sel}[${f.sel === 'a' ? 'href' : 'src'}="${rows[i].attachment!.url}"]`);
        await expect(el, `${f.name} rendered for ${page === client ? 'client' : 'coach'}`).toHaveCount(1, { timeout: THREAD_SYNC });
      }
    }
    // The image really loads from the stub CDN.
    const img = coach.getByTestId('message-thread').locator(`img[src="${rows[0].attachment!.url}"]`);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await expect(coach.getByTestId('message-thread').getByText('c-plan.pdf')).toBeVisible();
    await shot(client, testInfo, '01-client-attachments', true);
    await shot(coach, testInfo, '02-coach-attachments', true);
  });

  test('attachment + caption → exactly TWO new message rows', async ({ as, db }, testInfo) => {
    test.setTimeout(120_000);
    const { client, coach } = await openThreads(as);
    const before = await db.count('messages', { clientId: CLIENT_A });
    await client.getByTestId('message-thread').locator('input[type=file]').setInputFiles({ name: 'c-cap.png', mimeType: 'image/png', buffer: await makePng(client, '#aa2266') });
    await expect(client.getByTestId('message-input')).toHaveAttribute('placeholder', /caption/i);
    await client.getByTestId('message-input').fill('C caption text');
    await client.getByTestId('message-send').click();
    await expect(bubble(client, 'C caption text')).toBeVisible({ timeout: 30_000 });
    const rows = await pollDb(() => db.find<Msg>('messages', { clientId: CLIENT_A }, { sort: { createdAt: 1 } }), (r) => r.length >= before + 2);
    expect(rows.length - before).toBe(2);
    expect(rows[0].attachment?.kind).toBe('image');
    expect(rows[0].body).toBe('');
    expect(rows[1].attachment).toBeUndefined();
    expect(rows[1].body).toBe('C caption text');
    expect(rows[1].createdAt).toBeGreaterThan(rows[0].createdAt);
    await expect(bubble(coach, 'C caption text')).toBeVisible({ timeout: 15_000 });
    await shot(coach, testInfo, '01-coach-sees-two');
  });

  test('edit within 2 min (⋮ → Edit) and delete → tombstone on both sides', async ({ as, db }, testInfo) => {
    test.setTimeout(150_000);
    const { client, coach } = await openThreads(as);
    await send(client, 'C original text');
    await expect(bubble(coach, 'C original text')).toBeVisible({ timeout: 15_000 });
    await bubble(client, 'C original text').getByTestId('message-actions-trigger').click();
    const menu = client.getByTestId('desktop-message-menu');
    await expect(menu).toBeVisible();
    await menu.getByTestId('action-edit').click();
    const editBox = client.getByTestId('message-thread').locator('textarea').first();
    await expect(editBox).toHaveValue('C original text');
    await editBox.fill('C edited text');
    await client.getByRole('button', { name: 'Save' }).click();
    await expect(bubble(client, 'C edited text')).toContainText('Edited');
    await expect(bubble(coach, 'C edited text')).toContainText('Edited', { timeout: THREAD_SYNC });
    await shot(coach, testInfo, '01-coach-sees-edit');
    const edited = await db.findOne<Msg>('messages', { clientId: CLIENT_A, body: 'C edited text' });
    expect(edited?.editedAt).toBeGreaterThan(0);

    await bubble(client, 'C edited text').getByTestId('message-actions-trigger').click();
    await client.getByTestId('desktop-message-menu').getByTestId('action-delete').click();
    await client.getByTestId('confirm-accept').click();
    await expect(client.getByTestId('message-bubble-deleted')).toHaveText('Message deleted');
    await expect(bubble(client, 'C edited text')).toHaveCount(0);
    await expect(coach.getByTestId('message-bubble-deleted')).toHaveText('Message deleted', { timeout: THREAD_SYNC });
    await expect(bubble(coach, 'C edited text')).toHaveCount(0);
    await shot(client, testInfo, '02-client-tombstone');
    await shot(coach, testInfo, '03-coach-tombstone');
    const del = await db.findOne<Msg>('messages', { _id: edited!._id });
    expect(del?.deletedAt).toBeGreaterThan(0);
    // The coach (not the sender) is never offered Edit/Delete on the client's message.
    await send(client, 'C not yours to edit');
    await expect(bubble(coach, 'C not yours to edit')).toBeVisible({ timeout: 15_000 });
    await bubble(coach, 'C not yours to edit').getByTestId('message-actions-trigger').click();
    await expect(coach.getByTestId('desktop-message-menu')).toBeVisible();
    await expect(coach.getByTestId('action-edit')).toHaveCount(0);
    await expect(coach.getByTestId('action-delete')).toHaveCount(0);
  });

  test('after the 2-min window: server rejects with a friendly message, then Edit/Delete disappear', async ({ as, db }, testInfo) => {
    test.setTimeout(240_000);
    const { client } = await openThreads(as);
    await send(client, 'C will be too old');
    const row = await pollDb(() => db.findOne<Msg>('messages', { clientId: CLIENT_A, body: 'C will be too old' }), (r) => !!r);
    const old = row!.createdAt - 3 * 60_000;
    await db.updateOne('messages', { _id: row!._id }, { $set: { createdAt: old } });
    // The local copy still carries the fresh createdAt → UI offers Edit; the server is the real guard.
    await bubble(client, 'C will be too old').getByTestId('message-actions-trigger').click();
    await client.getByTestId('desktop-message-menu').getByTestId('action-edit').click();
    await client.getByTestId('message-thread').locator('textarea').first().fill('C sneaky late edit');
    await client.getByRole('button', { name: 'Save' }).click();
    const dlg = client.getByTestId('confirm-dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText("Couldn't edit message");
    await shot(client, testInfo, '01-late-edit-rejected');
    await client.getByTestId('confirm-accept').click();
    expect((await db.findOne<Msg>('messages', { _id: row!._id }))?.body).toBe('C will be too old');
    // After a full refresh carries the real createdAt, the menu no longer offers Edit/Delete.
    await client.getByRole('button', { name: 'Cancel' }).click().catch(() => undefined);
    await expect
      .poll(
        async () => {
          await bubble(client, 'C will be too old').getByTestId('message-actions-trigger').click();
          const n = await client.getByTestId('desktop-message-menu').getByTestId('action-edit').count();
          await client.keyboard.press('Escape');
          return n;
        },
        { timeout: THREAD_SYNC, intervals: [2_000] },
      )
      .toBe(0);
    await bubble(client, 'C will be too old').getByTestId('message-actions-trigger').click();
    await expect(client.getByTestId('action-delete')).toHaveCount(0);
    await expect(client.getByTestId('reaction-picker')).toBeVisible();
    await shot(client, testInfo, '02-menu-without-edit-delete');
  });

  test('reactions stick (no flicker across poll ticks) and reach the other side', async ({ as, db }, testInfo) => {
    test.setTimeout(120_000);
    const { client, coach } = await openThreads(as);
    await send(coach, 'C react to me');
    await expect(bubble(client, 'C react to me')).toBeVisible({ timeout: 15_000 });
    await bubble(client, 'C react to me').getByTestId('message-actions-trigger').click();
    await client.getByTestId('desktop-message-menu').getByTestId('reaction-pick').filter({ hasText: '👍' }).click();
    const chip = bubble(client, 'C react to me').getByTestId('reaction-chip');
    await expect(chip).toContainText('👍');
    // Sample for > 2 poll ticks (and one full refresh at most 20 s away): the chip must never vanish.
    const missing: number[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 22_000) {
      if ((await chip.count()) === 0) missing.push(Date.now() - t0);
      await client.waitForTimeout(250);
    }
    expect(missing, 'ms offsets where the reaction chip had disappeared').toEqual([]);
    const rec = await db.findOne<Msg>('messages', { clientId: CLIENT_A, body: 'C react to me' });
    expect(rec?.reactions).toEqual({ [CLIENT_A]: '👍' });
    await expect(bubble(coach, 'C react to me').getByTestId('reaction-chip')).toContainText('👍', { timeout: THREAD_SYNC });
    await shot(client, testInfo, '01-client-reaction');
    await shot(coach, testInfo, '02-coach-sees-reaction');
  });

  test('"Seen" appears for the sender after the other side opens the thread', async ({ as, db }, testInfo) => {
    test.setTimeout(120_000);
    const client = (await as('clientA')).page;
    await client.goto('/messages');
    await ready(client);
    await send(client, 'C please read me');
    await expect(bubble(client, 'C please read me')).toContainText('Sent');
    await client.waitForTimeout(6_000);
    await expect(bubble(client, 'C please read me')).not.toContainText('Seen');
    expect((await db.findOne<Msg>('messages', { clientId: CLIENT_A, body: 'C please read me' }))?.seenAt ?? null).toBeNull();
    const coach = (await as('coachA')).page;
    await coach.goto(`/coach/messages/${CLIENT_A}`);
    await ready(coach);
    await expect(bubble(coach, 'C please read me')).toBeVisible();
    await pollDb(() => db.findOne<Msg>('messages', { clientId: CLIENT_A, body: 'C please read me' }), (r) => !!r?.seenAt);
    await expect(bubble(client, 'C please read me')).toContainText('Seen', { timeout: THREAD_SYNC });
    await shot(client, testInfo, '01-seen');
  });

  test('load older: 260 messages → older page appears ABOVE, anchor kept, survives poll ticks; scrolled-up view does not jump', async ({ as, db }, testInfo) => {
    test.setTimeout(180_000);
    const now = Date.now();
    const docs = Array.from({ length: 260 }, (_, i) => seedMessage(i + 1, now - (261 - (i + 1)) * 30_000));
    await insertMany('messages', docs);
    expect(await db.count('messages', { clientId: CLIENT_A })).toBe(260);
    const { client, coach } = await openThreads(as);
    await expect(bubble(client, 'seed-260')).toBeVisible();
    // Live window = newest 200 → seed-061..seed-260.
    await expect(bubble(client, 'seed-061')).toHaveCount(1);
    await expect(bubble(client, 'seed-060')).toHaveCount(0);
    const sc = scroller(client);
    await sc.evaluate((el) => (el.scrollTop = 0));
    await expect(client.getByTestId('load-older')).toBeVisible();
    await shot(client, testInfo, '01-top-before-load-older');
    const anchor = bubble(client, 'seed-061');
    const anchorTopBefore = (await anchor.boundingBox())!.y;
    await client.getByTestId('load-older').click();
    await expect(bubble(client, 'seed-001')).toHaveCount(1);
    await expect(bubble(client, 'seed-060')).toHaveCount(1);
    // Older messages are ABOVE the previous top message in DOM order…
    const order = await bubbles(client).allTextContents();
    const idx = (s: string) => order.findIndex((t) => t.includes(s));
    expect(idx('seed-001')).toBeLessThan(idx('seed-060'));
    expect(idx('seed-060')).toBeLessThan(idx('seed-061'));
    // …and the scroll anchor is preserved: seed-061 is still in view, near where it was.
    await client.waitForTimeout(300);
    const box = await anchor.boundingBox();
    const scBox = (await sc.boundingBox())!;
    expect(box, 'anchor still rendered').not.toBeNull();
    expect(box!.y, 'anchor stays inside the scroller viewport').toBeGreaterThanOrEqual(scBox.y - 5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(scBox.y + scBox.height + 5);
    expect(Math.abs(box!.y - anchorTopBefore), 'anchor did not jump').toBeLessThan(120);
    await shot(client, testInfo, '02-after-load-older');
    // Older page survives ≥2 poll ticks (incl. a full refresh of the live window).
    await client.waitForTimeout(12_000);
    await expect(bubble(client, 'seed-001')).toHaveCount(1);
    await expect(bubble(client, 'seed-030')).toHaveCount(1);
    await client.waitForTimeout(10_000);
    await expect(bubble(client, 'seed-001')).toHaveCount(1);

    // Scrolled up + the other side sends → no jump to bottom, and the indicator shows.
    await sc.evaluate((el) => (el.scrollTop = 200));
    await client.waitForTimeout(400);
    const topBefore = await sc.evaluate((el) => el.scrollTop);
    await send(coach, 'C new while you read old');
    await expect(client.getByTestId('jump-to-latest')).toBeVisible({ timeout: 15_000 });
    const st = await sc.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
    expect(Math.abs(st.top - topBefore), 'view stayed where the reader was').toBeLessThan(50);
    expect(st.max - st.top).toBeGreaterThan(1000);
    await shot(client, testInfo, '03-new-indicator-no-jump');
    await client.getByTestId('jump-to-latest').click();
    await expect(bubble(client, 'C new while you read old')).toBeInViewport();
  });

  test('desktop ⋮ menu: inside the viewport near the right/bottom edge; closes on outside click and Escape', async ({ as }, testInfo) => {
    test.setTimeout(120_000);
    // A full thread so the newest bubble sits at the bottom; the coach's
    // wide desktop layout puts its own bubbles against the right edge.
    const now = Date.now();
    await insertMany('messages', Array.from({ length: 30 }, (_, i) => seedMessage(i + 1, now - (31 - i) * 60_000)));
    const { client, coach } = await openThreads(as);
    for (const [page, text] of [[coach, 'C coach bottom-right'], [client, 'C client bottom-right']] as const) {
      await send(page, text);
      const b = bubble(page, text);
      await expect(b).toBeInViewport();
      await b.getByTestId('message-actions-trigger').click();
      const menu = page.getByTestId('desktop-message-menu');
      await expect(menu).toBeVisible();
      await expect(menu).toHaveCSS('visibility', 'visible');
      const vp = page.viewportSize()!;
      const mb = (await menu.boundingBox())!;
      // The menu anchors to the bubble itself (the ⋮ trigger's parent), not the full-width row.
      const bb = (await b.getByTestId('message-actions-trigger').locator('..').boundingBox())!;
      testInfo.annotations.push({ type: `menu-${page === coach ? 'coach' : 'client'}`, description: JSON.stringify({ menu: mb, bubble: bb, vp }) });
      expect(mb.x).toBeGreaterThanOrEqual(0);
      expect(mb.y).toBeGreaterThanOrEqual(0);
      expect(mb.x + mb.width).toBeLessThanOrEqual(vp.width);
      expect(mb.y + mb.height).toBeLessThanOrEqual(vp.height);
      // Bubble is at the bottom → the menu flips ABOVE it, right-aligned to it.
      expect(mb.y + mb.height).toBeLessThanOrEqual(bb.y + 1);
      expect(Math.abs(mb.x + mb.width - (bb.x + bb.width))).toBeLessThan(40);
      await shot(page, testInfo, `01-menu-open-${page === coach ? 'coach' : 'client'}`);
      await page.mouse.click(Math.max(5, mb.x - 100), Math.max(5, mb.y - 40));
      await expect(menu).toHaveCount(0);
      await b.getByTestId('message-actions-trigger').click();
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    }
  });

  test('voice: record → stop → review → remove; record → cancel → no draft; record → send → audio message', async ({ as, db, env }, testInfo) => {
    test.setTimeout(150_000);
    const client = (await as('clientA', { permissions: ['microphone'] })).page;
    await client.goto('/messages');
    await ready(client);
    const startRec = async () => {
      await client.getByTestId('voice-record').click();
      // One-time explanation before the OS prompt.
      const prime = client.getByTestId('confirm-dialog');
      if (await prime.isVisible().catch(() => false)) await client.getByTestId('confirm-accept').click();
      await expect(client.getByTestId('voice-recording')).toBeVisible();
    };
    await startRec();
    await client.waitForTimeout(1_500);
    await shot(client, testInfo, '01-recording');
    await client.getByTestId('voice-stop').click();
    const preview = client.getByTestId('composer-attachment-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('audio')).toHaveCount(1);
    await shot(client, testInfo, '02-review-draft');
    await client.getByTestId('composer-attachment-remove').click();
    await expect(preview).toHaveCount(0);

    await startRec();
    await client.waitForTimeout(1_000);
    await client.getByTestId('voice-cancel').click();
    await expect(client.getByTestId('voice-recording')).toHaveCount(0);
    await client.waitForTimeout(800); // MediaRecorder.onstop fires async — must not resurrect a draft
    await expect(preview).toHaveCount(0);
    await expect(client.getByTestId('message-send')).toBeDisabled();

    await startRec();
    await client.waitForTimeout(1_500);
    await client.getByTestId('voice-stop').click();
    await expect(preview).toBeVisible();
    await client.getByTestId('message-send').click();
    await expect(client.getByTestId('message-bubble-pending')).toHaveCount(0, { timeout: 30_000 });
    const rec = await pollDb(() => db.findOne<Msg>('messages', { clientId: CLIENT_A, 'attachment.kind': 'audio' }), (r) => !!r);
    expect(rec?.attachment?.url).toMatch(cdnRe(env.bunny.cdn));
    expect(rec?.attachment?.mimeType ?? '').toMatch(/^audio\//);
    await expect(client.getByTestId('message-thread').locator(`audio[src="${rec!.attachment!.url}"]`)).toHaveCount(1, { timeout: 15_000 });
    expect(await db.count('messages', { clientId: CLIENT_A })).toBe(1);
    await shot(client, testInfo, '03-voice-sent');
  });

  test('voice: microphone permission denied → meaningful error (not "unsupported")', async ({ as }, testInfo) => {
    test.setTimeout(90_000);
    const passPrime = async (page: Page) => {
      // One-time explanation dialog ("Continue") before the browser prompt.
      const prime = page.getByTestId('confirm-dialog').filter({ hasText: 'Continue' });
      if (await prime.isVisible({ timeout: 3_000 }).catch(() => false)) await prime.getByTestId('confirm-accept').click();
    };

    // (a) A REAL context without the microphone permission. The harness launches
    // Chromium with --use-fake-ui-for-media-stream, which auto-accepts the
    // prompt — so this can only be observed, not asserted (reported BLOCKED).
    {
      const { context, page } = await as('clientA');
      await context.clearPermissions();
      await page.goto('/messages');
      await ready(page);
      await page.getByTestId('voice-record').click();
      await passPrime(page);
      const outcome = await Promise.race([
        page.getByText('Microphone unavailable', { exact: false }).waitFor({ timeout: 8_000 }).then(() => 'error-dialog'),
        page.getByTestId('voice-recording').waitFor({ timeout: 8_000 }).then(() => 'recording-started'),
      ]).catch(() => 'nothing');
      testInfo.annotations.push({ type: 'real-denial-outcome', description: `${outcome} (fake-ui flag auto-grants → real denial not reachable in this harness)` });
      await shot(page, testInfo, '01-real-context-no-permission');
      if (outcome === 'recording-started') await page.getByTestId('voice-cancel').click();
    }

    // (b) The browser's denial, emulated exactly as Chromium/WebKit report it:
    // getUserMedia rejects with a NotAllowedError DOMException.
    const { context, page } = await as('clientA');
    await context.addInitScript(() => {
      const md = navigator.mediaDevices;
      if (md) md.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await page.goto('/messages');
    await ready(page);
    await page.getByTestId('voice-record').click();
    await passPrime(page);
    const dlg = page.getByTestId('confirm-dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('Microphone unavailable. Check your browser permissions and try again.');
    await expect(dlg).not.toContainText("aren't supported");
    await expect(page.getByTestId('voice-recording')).toHaveCount(0);
    await shot(page, testInfo, '02-denied-error');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('composer-attachment-preview')).toHaveCount(0);
  });
});
