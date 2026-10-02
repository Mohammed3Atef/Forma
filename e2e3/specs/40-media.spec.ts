import type { Page, TestInfo } from '@playwright/test';
import { test, expect, ready, shot, type Db, type E2EEnv } from '../fixtures';
import { fakeMp4, leaks, mediaCalls, png, putsSince, watch, type Watched } from './_d-helpers';

/**
 * Media uploads through the REAL UI, per category. For every successful
 * upload: stored URL under the CDN, exactly one stand-in PUT under the
 * expected owner folder, the file is served back and renders, and no browser
 * request carries a storage credential.
 */
const MB = 1024 * 1024;

async function expectClean(reqs: Watched[], testInfo: TestInfo) {
  const bad = leaks(reqs);
  await testInfo.attach('media-requests.json', { body: JSON.stringify({ media: mediaCalls(reqs), leaks: bad.map((r) => r.url) }, null, 2), contentType: 'application/json' });
  expect(bad, 'browser requests carrying a storage credential / hitting storage directly').toEqual([]);
}

async function imgLoads(page: Page, url: string) {
  return page.evaluate(
    (u) =>
      new Promise<number>((res) => {
        const i = new Image();
        i.onload = () => res(i.naturalWidth);
        i.onerror = () => res(0);
        i.src = u;
      }),
    url,
  );
}

async function onePut(db: Db, env: E2EEnv, before: number, prefix: RegExp) {
  await expect.poll(async () => (await putsSince(db, before)).length, { timeout: 20_000 }).toBeGreaterThan(0);
  await new Promise((r) => setTimeout(r, 500));
  const puts = await putsSince(db, before);
  expect(puts, JSON.stringify(puts)).toHaveLength(1);
  expect(puts[0].path).toMatch(prefix);
  return { put: puts[0], url: `${env.bunny.cdn}/${puts[0].path}` };
}

async function dialogText(page: Page) {
  const d = page.getByTestId('confirm-dialog');
  await expect(d).toBeVisible({ timeout: 15_000 });
  const text = await d.innerText();
  await page.getByTestId('confirm-accept').click();
  await expect(d).toBeHidden();
  return text;
}

for (const who of [
  { role: 'clientA' as const, path: '/settings', id: 'e2e-client-a' },
  { role: 'coachA' as const, path: '/coach/settings', id: 'e2e-coach-a' },
]) {
  test(`avatar (${who.role}): pick → crop → save → persists → remove → gone after reload`, async ({ as, db, env }, testInfo) => {
    const { page } = await as(who.role);
    const reqs = watch(page);
    await page.goto(who.path);
    await ready(page);
    const before = (await db.bunnyPuts()).length;
    await expect(page.getByTestId('avatar-upload')).toBeEnabled();
    await page.getByTestId('avatar-upload').locator('xpath=..').locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(600, 400) });
    await expect(page.getByTestId('avatar-cropper')).toBeVisible();
    await shot(page, testInfo, 'cropper');
    await page.getByTestId('avatar-crop-save').click();
    const { url, put } = await onePut(db, env, before, new RegExp(`^Forma/${who.id}/avatar/[A-Za-z0-9_-]+\\.webp$`));
    expect(put.contentType).toBe('image/webp');
    expect(put.bytes).toBeLessThanOrEqual(2 * MB);
    await expect.poll(async () => (await db.findOne<{ photoUrl?: string }>('users', { _id: who.id }))?.photoUrl).toBe(url);
    await page.reload();
    await ready(page);
    const img = page.getByTestId('avatar-upload').locator('img');
    await expect(img).toHaveAttribute('src', url);
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await shot(page, testInfo, 'avatar-saved');
    await page.getByTestId('avatar-remove').click();
    await expect.poll(async () => (await db.findOne<{ photoUrl?: string }>('users', { _id: who.id }))?.photoUrl ?? null).toBeNull();
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('avatar-remove')).toHaveCount(0);
    await expect(page.locator(`img[src="${url}"]`)).toHaveCount(0);
    await shot(page, testInfo, 'avatar-removed');
    await expectClean(reqs, testInfo);
  });
}

test('avatar: oversized (>2 MB) photo is downscaled on the device, never stored oversized', async ({ as, db }, testInfo) => {
  const { page } = await as('clientA');
  await page.goto('/settings');
  await ready(page);
  const big = png(1400, 1400, true);
  expect(big.length).toBeGreaterThan(2 * MB);
  const before = (await db.bunnyPuts()).length;
  await page.getByTestId('avatar-upload').locator('xpath=..').locator('input[type=file]').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big });
  await page.getByTestId('avatar-crop-save').click();
  await expect.poll(async () => (await putsSince(db, before)).length, { timeout: 20_000 }).toBe(1);
  const [put] = await putsSince(db, before);
  expect(put.bytes).toBeLessThanOrEqual(2 * MB);
  await expect(page.getByTestId('avatar-error')).toHaveCount(0);
  testInfo.annotations.push({ type: 'observation', description: `input ${big.length} B → stored ${put.bytes} B (${put.contentType}); no error shown (client-side downscale makes the 2 MB cap unreachable from the UI)` });
  await shot(page, testInfo, 'big-avatar');
  await page.getByTestId('avatar-remove').click();
  await expect.poll(async () => (await db.findOne<{ photoUrl?: string }>('users', { _id: 'e2e-client-a' }))?.photoUrl ?? null).toBeNull();
});

test('avatar: SVG file is never stored as SVG (rasterised or refused)', async ({ as, db }, testInfo) => {
  const { page } = await as('clientA');
  await page.goto('/settings');
  await ready(page);
  const before = (await db.bunnyPuts()).length;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="red"/><script>alert(1)</script></svg>';
  await page.getByTestId('avatar-upload').locator('xpath=..').locator('input[type=file]').setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  const cropper = page.getByTestId('avatar-cropper');
  await expect(cropper).toBeVisible();
  const save = page.getByTestId('avatar-crop-save');
  const enabled = await save.isEnabled({ timeout: 3000 }).catch(() => false);
  if (enabled) await save.click();
  await page.waitForTimeout(3000);
  const puts = await putsSince(db, before);
  testInfo.annotations.push({ type: 'observation', description: `svg avatar: saveEnabled=${enabled}, puts=${JSON.stringify(puts)}, error=${(await page.getByTestId('avatar-error').count()) ? await page.getByTestId('avatar-error').innerText() : ''}` });
  for (const p of puts) {
    expect(p.contentType).not.toMatch(/svg|html/);
    expect(p.path).not.toMatch(/\.svg$/);
  }
  await shot(page, testInfo, 'svg-avatar');
  if (await page.getByTestId('avatar-remove').isVisible().catch(() => false)) await page.getByTestId('avatar-remove').click();
  await expect.poll(async () => (await db.findOne<{ photoUrl?: string }>('users', { _id: 'e2e-client-a' }))?.photoUrl ?? null).toBeNull();
});

test('progress photo: gallery upload → stored under the client folder, served, synced to the server', async ({ as, db, env }, testInfo) => {
  test.setTimeout(240_000);
  const { page } = await as('clientA');
  const reqs = watch(page);
  await page.goto('/progress/photos');
  await ready(page);
  const before = (await db.bunnyPuts()).length;
  const t0 = Date.now();
  await page.locator('input[type=file][accept="image/*"]').first().setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: png(800, 1000) });
  const { url } = await onePut(db, env, before, /^Forma\/e2e-client-a\/[A-Za-z0-9_-]+\.webp$/);
  expect(await imgLoads(page, url)).toBeGreaterThan(0);
  await shot(page, testInfo, 'progress-photo-added');
  // The cdnUrl reaches the server only through the background sync (push) — record how long.
  await expect
    .poll(async () => (await db.find<{ data: { cdnUrl?: string } }>('syncRecords', { clientId: 'e2e-client-a', collection: 'progressPhotos' })).some((r) => r.data?.cdnUrl === url), { timeout: 180_000, intervals: [2000] })
    .toBe(true);
  testInfo.annotations.push({ type: 'timing', description: `progress photo cdnUrl visible server-side after ${Date.now() - t0} ms` });
  await expectClean(reqs, testInfo);
  await db.deleteMany('syncRecords', { clientId: 'e2e-client-a', collection: 'progressPhotos' });
});

test('assessment photo: edit submitted assessment → add front photo → saved on the profile', async ({ as, db, env }, testInfo) => {
  const { page } = await as('clientA');
  const reqs = watch(page);
  const prev = await db.findOne<{ assessment: Record<string, unknown> }>('clientProfiles', { _id: 'e2e-client-a' });
  // The seed's assessment is a stub ({basic:{fullName}}) which crashes the read-only view (see E-D finding);
  // give clientA a complete, wizard-shaped submitted assessment for this journey (restored after).
  await db.updateOne('clientProfiles', { _id: 'e2e-client-a' }, {
    $set: {
      assessment: {
        ...(prev?.assessment ?? {}),
        basic: { fullName: 'Client Aya', dateOfBirth: '1998-01-01', age: 28, gender: 'female', heightCm: 172, weightKg: 70 },
        goals: { primaryGoal: 'fat_loss', goalPriorities: [] },
        lifestyle: { occupation: 'desk', sleepHours: 8, activityLevel: 'moderate', trainingDaysPerWeek: 3 },
        training: { level: 'beginner', location: 'commercial_gym' },
        health: { injuries: [], noInjuries: true, hasMedicalConditions: false },
        nutrition: { likes: [], dislikes: [], allergies: [], mustHaveFoods: [], budget: 'medium', mealsPerDay: 3 },
        motivation: { biggestChallenge: 'consistency', commitmentLevel: 7 },
        progressPhotos: {},
        completionPercentage: 100,
        completed: true,
        completedAt: Date.now() - 9 * 86_400_000,
        updatedAt: Date.now() - 9 * 86_400_000,
      },
    },
  });
  try {
    await page.goto('/assessment');
    await ready(page);
    await page.getByTestId('assessment-edit').click();
    await expect(page.getByTestId('assessment-wizard')).toBeVisible();
    for (let i = 0; i < 7; i++) {
      await page.getByTestId('assessment-next').click();
      await page.waitForTimeout(150);
    }
    await shot(page, testInfo, 'photos-step');
    const before = (await db.bunnyPuts()).length;
    await page.getByTestId('assessment-wizard').locator('input[type=file]').first().setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: png(600, 800) });
    const { url } = await onePut(db, env, before, /^Forma\/e2e-client-a\/assessment\/[A-Za-z0-9_-]+\.webp$/);
    await expect(page.getByTestId('assessment-wizard').locator(`img[src="${url}"]`)).toBeVisible();
    expect(await page.getByTestId('assessment-wizard').locator(`img[src="${url}"]`).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await page.getByTestId('assessment-submit').click();
    // Edit-mode submit returns to the read-only view (no "done" screen for edits).
    await expect(page.getByTestId('assessment-wizard')).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => ((await db.findOne<{ assessment: { progressPhotos?: { front?: string } } }>('clientProfiles', { _id: 'e2e-client-a' }))?.assessment?.progressPhotos?.front)).toBe(url);
    await shot(page, testInfo, 'assessment-done');
    await expectClean(reqs, testInfo);
  } finally {
    if (prev) await db.updateOne('clientProfiles', { _id: 'e2e-client-a' }, { $set: { assessment: prev.assessment } });
  }
});

test('check-in photo: coach requests (UI) → client completes with a photo; bad type / too large show inline errors', async ({ as, db, env }, testInfo) => {
  test.setTimeout(120_000);
  await db.deleteMany('checkIns', { clientId: 'e2e-client-a' });
  try {
    const coach = await as('coachA');
    await coach.page.goto('/coach/client/e2e-client-a/checkins');
    await ready(coach.page);
    await coach.page.getByTestId('checkin-request').click();
    await expect.poll(() => db.count('checkIns', { clientId: 'e2e-client-a', status: 'requested' })).toBe(1);
    const ci = (await db.findOne<{ _id: string; weekStart: string }>('checkIns', { clientId: 'e2e-client-a' }))!;
    await shot(coach.page, testInfo, 'coach-requested');

    const { page } = await as('clientA');
    const reqs = watch(page);
    await page.goto('/');
    await ready(page);
    await page.getByTestId('home-checkin').click();
    await expect(page).toHaveURL(new RegExp(`/check-in/${ci.weekStart}`));
    for (let i = 0; i < 3; i++) await page.getByTestId('checkin-next').click();
    const before = (await db.bunnyPuts()).length;
    const picker = page.locator('.card', { has: page.locator('input[type=file]') }).first();
    // Wrong type: HTML disguised as a photo → inline error, no PUT.
    await picker.locator('input[type=file]').setInputFiles({ name: 'x.html', mimeType: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') });
    await expect(picker.locator('p.text-danger')).toHaveText('Unsupported file type. Use JPG, PNG, or WebP.');
    // Too large: a 6 MB JPEG the device can't re-encode → inline error, no PUT.
    await picker.locator('input[type=file]').setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(6 * MB, 7) });
    await expect(picker.locator('p.text-danger')).toHaveText('Image is too large (max 5 MB).');
    await expect(picker.getByRole('button', { name: 'Add photo' })).toBeEnabled(); // no stuck "Uploading…"
    expect(await putsSince(db, before)).toEqual([]);
    expect(mediaCalls(reqs).filter((p) => p.includes('/api/media/'))).toEqual([]); // both refused before any request
    await shot(page, testInfo, 'checkin-errors');

    await picker.locator('input[type=file]').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: png(600, 800) });
    const { url } = await onePut(db, env, before, new RegExp(`^Forma/e2e-client-a/checkin/${ci.weekStart}/[A-Za-z0-9_-]+\\.webp$`));
    await expect(picker.locator('p.text-danger')).toHaveCount(0);
    await expect(picker.locator(`img[src="${url}"]`)).toBeVisible();
    expect(await picker.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await page.getByTestId('checkin-submit').click();
    await expect.poll(async () => (await db.findOne<{ status: string; progressPhotos?: { front?: string } }>('checkIns', { _id: ci._id }))?.progressPhotos?.front).toBe(url);
    await shot(page, testInfo, 'checkin-submitted');
    await expectClean(reqs, testInfo);
  } finally {
    await db.deleteMany('checkIns', { clientId: 'e2e-client-a' });
  }
});

async function openNewExercise(page: Page) {
  await page.goto('/coach/library');
  await ready(page);
  await page.getByTestId('lib-new').click();
  await expect(page.getByTestId('exercise-form')).toBeVisible();
  await expect(page.getByTestId('ex-video-upload')).toBeVisible();
}

test('exercise video (≤4 MiB): single upload from the library form → saved on the exercise', async ({ as, db, env }, testInfo) => {
  const { page } = await as('coachA');
  const reqs = watch(page);
  await openNewExercise(page);
  const before = (await db.bunnyPuts()).length;
  const file = fakeMp4(1 * MB);
  await page.getByTestId('exercise-form').locator('input[type=file][accept="video/*"]').setInputFiles({ name: 'squat.mp4', mimeType: 'video/mp4', buffer: file });
  const { url, put } = await onePut(db, env, before, /^Forma\/e2e-coach-a\/exercises\/[A-Za-z0-9_-]+\.mp4$/);
  expect(put.bytes).toBe(file.length);
  await expect(page.getByTestId('ex-video')).toHaveValue(url);
  expect(mediaCalls(reqs)).toEqual(['/api/media/upload']);
  const served = await page.request.get(url);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toBe('video/mp4');
  await page.getByTestId('ex-name').fill('E2E Video Squat');
  await page.getByTestId('ex-save').click();
  await expect.poll(async () => (await db.findOne<{ videoUrl?: string }>('coachExercises', { coachId: 'e2e-coach-a', name: 'E2E Video Squat' }))?.videoUrl).toBe(url);
  await shot(page, testInfo, 'exercise-saved');
  await expectClean(reqs, testInfo);
  await db.deleteMany('coachExercises', { coachId: 'e2e-coach-a', name: 'E2E Video Squat' });
});

test('exercise video 9 MiB: CHUNKED init → 3× chunk → finalize; bytes intact; staging emptied; progress UI recorded', async ({ as, db, env }, testInfo) => {
  test.setTimeout(120_000);
  const { page } = await as('coachA');
  const reqs = watch(page);
  await openNewExercise(page);
  // Slow each chunk a little so the in-flight UI can be observed.
  await page.route('**/api/media/chunk*', async (r) => {
    await new Promise((res) => setTimeout(res, 700));
    await r.continue();
  });
  const before = (await db.bunnyPuts()).length;
  const file = fakeMp4(9 * MB);
  await page.getByTestId('exercise-form').locator('input[type=file][accept="video/*"]').setInputFiles({ name: 'long.mp4', mimeType: 'video/mp4', buffer: file });
  const btn = page.getByTestId('ex-video-upload');
  await expect(btn).toContainText('Uploading…');
  await page.waitForTimeout(900);
  const inflight = await page.getByTestId('exercise-form').innerText();
  const pctShown = /\d{1,3}\s*%/.test(inflight);
  const progressbar = await page.getByTestId('exercise-form').locator('[role=progressbar], progress').count();
  const abortControl = await page.getByTestId('exercise-form').getByRole('button', { name: /cancel|abort/i }).count();
  await shot(page, testInfo, 'chunked-inflight');
  const { url, put } = await onePut(db, env, before, /^Forma\/e2e-coach-a\/exercises\/[A-Za-z0-9_-]+\.mp4$/);
  expect(put.bytes).toBe(file.length);
  await expect(page.getByTestId('ex-video')).toHaveValue(url);
  expect(mediaCalls(reqs)).toEqual(['/api/media/init', '/api/media/chunk', '/api/media/chunk', '/api/media/chunk', '/api/media/finalize']);
  const served = await page.request.get(url);
  expect((await served.body()).length).toBe(file.length);
  expect(await db.count('mediaUploads', {})).toBe(0);
  expect(await db.count('mediaUploadChunks', {})).toBe(0);
  testInfo.annotations.push({ type: 'observation', description: `chunked upload UI: percentage shown=${pctShown}, progressbar elements=${progressbar}, cancel/abort control=${abortControl} (M-12)` });
  await testInfo.attach('chunked.json', { body: JSON.stringify({ calls: mediaCalls(reqs), size: file.length, put, pctShown, progressbar, abortControl, inflight }, null, 2), contentType: 'application/json' });
  await expectClean(reqs, testInfo);
});

test('exercise video: wrong type (.html) → friendly error, no PUT, button recovers', async ({ as, db }, testInfo) => {
  const { page } = await as('coachA');
  await openNewExercise(page);
  const before = (await db.bunnyPuts()).length;
  await page.getByTestId('exercise-form').locator('input[type=file][accept="video/*"]').setInputFiles({ name: 'evil.html', mimeType: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') });
  const text = await dialogText(page);
  expect(text).toContain('Unsupported file type');
  await expect(page.getByTestId('ex-video-upload')).toBeEnabled();
  await expect(page.getByTestId('ex-video-upload')).not.toContainText('Uploading');
  expect(await putsSince(db, before)).toEqual([]);
  await shot(page, testInfo, 'bad-type');
});

test('cancelling the file picker sends no request', async ({ as, db }, testInfo) => {
  const { page } = await as('coachA');
  const reqs = watch(page);
  await openNewExercise(page);
  const before = (await db.bunnyPuts()).length;
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('ex-video-upload').click();
  await (await chooser).setFiles([]);
  await page.waitForTimeout(1500);
  expect(mediaCalls(reqs)).toEqual([]);
  expect(await putsSince(db, before)).toEqual([]);
  await expect(page.getByTestId('ex-video-upload')).not.toContainText('Uploading');
  await shot(page, testInfo, 'picker-cancelled');
});

async function openClientThread(page: Page) {
  await page.goto('/messages');
  await ready(page);
  await expect(page.getByTestId('message-thread')).toBeVisible();
  await expect(page.getByTestId('message-attach')).toBeVisible();
}
const msgInput = (page: Page) => page.getByTestId('message-thread').locator('input[type=file]').first();

test('message attachment: client sends a photo → under the CLIENT thread folder, renders in the thread', async ({ as, db, env }, testInfo) => {
  const { page } = await as('clientA');
  const reqs = watch(page);
  await openClientThread(page);
  const before = (await db.bunnyPuts()).length;
  await msgInput(page).setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: png(500, 400) });
  await expect(page.getByTestId('composer-attachment-preview')).toBeVisible();
  await page.getByTestId('message-send').click();
  const { url } = await onePut(db, env, before, /^Forma\/e2e-client-a\/messages\/[A-Za-z0-9_-]+\.webp$/);
  const img = page.getByTestId('message-bubble').locator(`img[src="${url}"]`);
  await expect(img).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(async () => (await db.findOne<{ attachment?: { url: string } }>('messages', { clientId: 'e2e-client-a', 'attachment.url': url })) != null).toBe(true);
  // The coach sees the same image.
  const coach = await as('coachA');
  await coach.page.goto('/coach/messages/e2e-client-a');
  await ready(coach.page);
  await expect(coach.page.locator(`img[src="${url}"]`)).toBeVisible({ timeout: 15_000 });
  await shot(page, testInfo, 'client-thread');
  await shot(coach.page, testInfo, 'coach-thread');
  await expectClean(reqs, testInfo);
});

test('message attachment: SVG and >5 MB image → friendly error, no PUT', async ({ as, db }, testInfo) => {
  const { page } = await as('clientA');
  await openClientThread(page);
  const before = (await db.bunnyPuts()).length;
  const texts: string[] = [];
  for (const f of [
    { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') },
    { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(6 * MB, 7) },
  ]) {
    await msgInput(page).setInputFiles(f);
    await page.getByTestId('message-send').click();
    texts.push(await dialogText(page));
    await page.waitForTimeout(300);
    await shot(page, testInfo, `after-${f.name}`);
    if (await page.getByTestId('message-discard').first().isVisible().catch(() => false)) await page.getByTestId('message-discard').first().click();
    if (await page.getByTestId('composer-attachment-remove').isVisible().catch(() => false)) await page.getByTestId('composer-attachment-remove').click();
  }
  expect(texts[0]).toContain('Unsupported file type');
  expect(texts[1]).toContain('too large');
  expect(await putsSince(db, before)).toEqual([]);
  await expect(page.getByText(/Uploading…/)).toHaveCount(0);
});

test('message attachment: cancel mid-flight → no PUT, no message, draft restored, no stuck spinner', async ({ as, db }, testInfo) => {
  const { page } = await as('clientA');
  const reqs = watch(page);
  await openClientThread(page);
  let release: () => void = () => undefined;
  await page.route('**/api/media/upload*', async (r) => {
    await new Promise<void>((res) => {
      release = res;
      setTimeout(res, 8000);
    });
    await r.continue().catch(() => undefined);
  });
  const before = (await db.bunnyPuts()).length;
  const msgsBefore = await db.count('messages', { clientId: 'e2e-client-a' });
  await msgInput(page).setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: png(300, 300) });
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-bubble-pending')).toBeVisible();
  await shot(page, testInfo, 'pending');
  await page.getByTestId('message-cancel-upload').click();
  await expect(page.getByTestId('message-bubble-pending')).toHaveCount(0);
  await expect(page.getByTestId('composer-attachment-preview')).toBeVisible();
  release();
  await page.waitForTimeout(3000);
  expect(await putsSince(db, before)).toEqual([]);
  expect(await db.count('messages', { clientId: 'e2e-client-a' })).toBe(msgsBefore);
  await expect(page.getByText(/Uploading…|Sending…/)).toHaveCount(0);
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0); // a user cancel is not an error
  await shot(page, testInfo, 'cancelled');
  await page.unroute('**/api/media/upload*');
  expect(mediaCalls(reqs)).toEqual(['/api/media/upload']);
});

test('network failure on upload → error shown; retry after the network returns succeeds', async ({ as, db, env }, testInfo) => {
  const { page } = await as('clientA');
  await openClientThread(page);
  await page.route('**/api/media/upload*', (r) => r.abort());
  const before = (await db.bunnyPuts()).length;
  await msgInput(page).setInputFiles({ name: 'net.png', mimeType: 'image/png', buffer: png(320, 240) });
  await page.getByTestId('message-send').click();
  const text = await dialogText(page);
  expect(text).toContain('Upload failed. Please try again.');
  await expect(page.getByText("Couldn't send")).toBeVisible();
  await shot(page, testInfo, 'failed');
  expect(await putsSince(db, before)).toEqual([]);
  await page.unroute('**/api/media/upload*');
  await page.getByTestId('message-retry').first().click();
  const { url } = await onePut(db, env, before, /^Forma\/e2e-client-a\/messages\//);
  await expect(page.getByTestId('message-bubble').locator(`img[src="${url}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Couldn't send")).toHaveCount(0);
  await shot(page, testInfo, 'retried');
});
