import { test, expect, ready, shot } from '../fixtures';
import type { Page } from '@playwright/test';
import { CLIENT_A, seedWorkoutPlan, seedNutritionPlan, pollDb, todayKey, makePng, bodyText, allowDevModuleStorm, type SyncRec } from './_c-helpers';

/**
 * Phase-3 client journeys (clientA). Local-first data → every persistence
 * check reloads the page, and the server copy (`syncRecords`) is asserted
 * directly and/or via a FRESH context that has no IndexedDB of its own.
 */

type SetLog = { setIndex: number; type: string; weightKg: number | null; actualReps: number | null; done: boolean };
type WorkoutLog = { id: string; dayId: string; startedAt: number | null; finished: boolean; exercises: { exerciseId: string; sets: SetLog[] }[] };

const setRows = (page: Page) => page.locator('section.card li').filter({ has: page.getByRole('button', { name: 'Done' }) });

test.describe('client journeys', () => {
  test.afterAll(async () => {
    // Plans are only ever created by this spec — leave the seeded account as we found it.
  });

  test('workout: plan → session → log sets → rest timer → video → reload resumes → finish → history', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(180_000);
    await seedWorkoutPlan(db, { withVideoUrl: true });
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs' });
    const day = todayKey();

    const { page, context } = await as('clientA');
    // Keep the coach-assigned YouTube demo offline: a tiny stand-in document.
    await context.route(/youtube(-nocookie)?\.com|ytimg|googlevideo/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>video stub</body></html>' }));
    await page.goto('/workout');
    await ready(page);
    await expect(page.getByRole('heading', { name: 'C Push Day' })).toBeVisible();
    await shot(page, testInfo, '01-routines');

    await page.getByRole('button', { name: 'Start this workout' }).first().click();
    await expect(page).toHaveURL(/\/workout\/session$/);
    await expect(page.getByText('Exercise 1 of 2')).toBeVisible();
    await expect(page.getByText('C Bench Press').first()).toBeVisible();
    // Begin the timer (first real "record" action).
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    // 2 working sets, warmupSetCount 0 → exactly 2 rows.
    const rows = setRows(page);
    await expect(rows).toHaveCount(2);
    await rows.nth(0).getByLabel('Weight').fill('60');
    await rows.nth(0).getByLabel('reps').fill('10');
    await rows.nth(1).getByLabel('Weight').fill('62.5');
    await rows.nth(1).getByLabel('reps').fill('8');
    await rows.nth(0).getByRole('button', { name: 'Done' }).click();
    // Rest timer appears after completing a set.
    const rest = page.getByRole('button', { name: /Rest|Pause/ }).filter({ hasText: /Rest/ });
    await expect(rest).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    await expect(page.getByText('1/4 sets')).toBeVisible();
    await shot(page, testInfo, '02-set-done-rest-timer');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);

    // Video button on an exercise WITHOUT any video: must not crash; record what it does.
    await page.getByRole('button', { name: 'Watch video' }).click();
    await page.waitForTimeout(600);
    const noVideoPopup = await page.getByTestId('video-popup').count();
    const noVideoSheet = await page.getByTestId('sheet').count();
    testInfo.annotations.push({ type: 'video-no-url', description: `popup=${noVideoPopup} sheet=${noVideoSheet} (0/0 = silent no-op)` });
    await shot(page, testInfo, '03-video-no-url');

    // Next → exercise 2 (has a coach videoUrl) → popup opens and closes.
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Exercise 2 of 2')).toBeVisible();
    await expect(page.getByText('C Cable Fly').first()).toBeVisible();
    await page.getByRole('button', { name: 'Watch video' }).click();
    await expect(page.getByTestId('video-popup')).toBeVisible();
    await shot(page, testInfo, '04-video-popup');
    await page.getByTestId('video-popup-close').click();
    await expect(page.getByTestId('video-popup')).toHaveCount(0);
    await setRows(page).nth(0).getByLabel('Weight').fill('15');
    await setRows(page).nth(0).getByLabel('reps').fill('12');
    await setRows(page).nth(0).getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    // Previous → back to exercise 1 with its values intact.
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByText('Exercise 1 of 2')).toBeVisible();
    await expect(setRows(page).nth(1).getByLabel('Weight')).toHaveValue('62.5');

    // RELOAD mid-session → resumes with every logged value.
    await page.waitForTimeout(800); // > the 300 ms debounced IndexedDB write
    await page.reload();
    await ready(page);
    await expect(page.getByText(/Exercise \d of 2/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(page.getByText('2/4 sets')).toBeVisible();
    await expect(setRows(page).nth(0).getByLabel('Weight')).toHaveValue('60');
    await expect(setRows(page).nth(0).getByLabel('reps')).toHaveValue('10');
    await expect(setRows(page).nth(1).getByLabel('Weight')).toHaveValue('62.5');
    await shot(page, testInfo, '05-resumed-after-reload');

    // The reload's boot sync pushed the STARTED session to the server.
    const mid = await pollDb(
      () => db.findOne<SyncRec<WorkoutLog>>('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs', recordId: day }),
      (r) => !!r && r.data.exercises?.[0]?.sets?.[1]?.weightKg === 62.5,
    );
    expect(mid?.data.startedAt, 'server copy is a started session').toBeTruthy();
    expect(mid?.data.finished).toBe(false);

    // Finish → save → summary → done.
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#finish-duration').fill('42');
    await page.getByRole('button', { name: 'Save workout' }).click();
    await expect(page.getByText('Workout complete')).toBeVisible();
    await expect(page.getByText('42:00')).toBeVisible();
    await shot(page, testInfo, '06-summary');
    expect(await bodyText(page)).not.toMatch(/NaN|undefined/);

    // History shows it (after a reload, so it is the persisted log).
    await page.goto('/history');
    await ready(page);
    await expect(page.getByRole('heading', { name: /^1 workout/ })).toBeVisible();
    await expect(page.getByText('C Push Day')).toBeVisible();
    await shot(page, testInfo, '07-history');

    // Server copy is the finished session with the logged sets.
    await page.reload();
    await ready(page);
    const fin = await pollDb(
      () => db.findOne<SyncRec<WorkoutLog & { durationSec: number }>>('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs', recordId: day }),
      (r) => !!r && r.data.finished === true,
    );
    expect(fin?.data.finished).toBe(true);
    expect(fin?.data.durationSec).toBe(42 * 60);
    expect(fin?.data.exercises[0].sets.map((s) => [s.weightKg, s.actualReps, s.done])).toEqual([
      [60, 10, true],
      [62.5, 8, false],
    ]);

    // Fresh context (no IndexedDB) sees the workout in history → it came from the server.
    const fresh = await as('clientA');
    await fresh.page.goto('/history');
    await ready(fresh.page);
    await expect(fresh.page.getByText('C Push Day')).toBeVisible({ timeout: 20_000 });
    await shot(fresh.page, testInfo, '08-history-fresh-context');
  });

  test('nutrition: mark meal eaten + food search (chicken, 100 g → 150 g ×1.5) → save → reload → persists', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(180_000);
    await seedNutritionPlan(db);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs' });
    const day = todayKey();
    const { page } = await as('clientA');
    await page.goto('/nutrition');
    await ready(page);
    const meal = page.locator('section.card').filter({ hasText: 'C Breakfast' });
    await expect(meal).toBeVisible();
    await meal.getByRole('button', { name: 'Mark eaten' }).click();
    await expect(meal).toHaveClass(/border-success/);

    await meal.getByRole('button', { name: '+ Add food' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const search = sheet.getByLabel('Search a food database…');
    await search.fill('chicken');
    // Debounced (400 ms) → loading → results (real public wger API, read-only).
    await expect(sheet.getByText('Working…')).toBeVisible();
    const results = sheet.getByTestId('food-search-result');
    await expect(results.first()).toBeVisible({ timeout: 20_000 });
    await shot(page, testInfo, '01-food-search-results');
    const firstName = (await results.first().locator('span.font-medium').textContent())!.trim();
    await results.first().click();
    const preview = sheet.getByTestId('food-search-preview');
    await expect(preview).toBeVisible();
    await expect(sheet.getByTestId('food-search-grams')).toHaveValue('100');
    const parse = async () => {
      const txt = (await preview.locator('p[dir=ltr]').textContent()) ?? '';
      const m = txt.match(/(-?[\d.]+) kcal · P(-?[\d.]+) C(-?[\d.]+) F(-?[\d.]+)/);
      expect(m, `preview macros "${txt}"`).not.toBeNull();
      return { txt, kcal: Number(m![1]), p: Number(m![2]), c: Number(m![3]), f: Number(m![4]) };
    };
    const at100 = await parse();
    await sheet.getByTestId('food-search-grams').fill('150');
    await expect(preview.locator('p[dir=ltr]')).not.toHaveText(at100.txt);
    const at150 = await parse();
    const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
    expect(close(at150.p, at100.p * 1.5, 0.11), `protein ${at100.p}→${at150.p}`).toBe(true);
    expect(close(at150.c, at100.c * 1.5, 0.11), `carbs ${at100.c}→${at150.c}`).toBe(true);
    expect(close(at150.f, at100.f * 1.5, 0.11), `fats ${at100.f}→${at150.f}`).toBe(true);
    expect(close(at150.kcal, at100.kcal * 1.5, 1)).toBe(true);
    expect(await bodyText(page)).not.toMatch(/NaN/);
    await shot(page, testInfo, '02-preview-150g');
    await sheet.getByTestId('food-search-use').click();
    await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue(firstName);
    await expect(sheet.getByLabel('Quantity')).toHaveValue('150 g');
    await expect(sheet.getByLabel('Protein')).toHaveValue(String(at150.p));
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(meal.getByText(`+ ${firstName}`)).toBeVisible();
    expect(await bodyText(page)).not.toMatch(/NaN/);
    await shot(page, testInfo, '03-added');

    await page.waitForTimeout(600);
    await page.reload();
    await ready(page);
    await expect(meal.getByText(`+ ${firstName}`)).toBeVisible();
    await expect(meal).toHaveClass(/border-success/);
    expect(await bodyText(page)).not.toMatch(/NaN/);
    await shot(page, testInfo, '04-after-reload');

    type NLog = { mealsEaten: Record<string, boolean>; extraItems: Record<string, { name: { en: string }; quantity: string; protein: number }[]> };
    const rec = await pollDb(
      () => db.findOne<SyncRec<NLog>>('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs', recordId: day }),
      (r) => !!r && (r.data.extraItems?.['c-meal-1']?.length ?? 0) > 0,
    );
    expect(rec?.data.mealsEaten['c-meal-1']).toBe(true);
    expect(rec?.data.extraItems['c-meal-1'][0]).toMatchObject({ quantity: '150 g', protein: at150.p, name: { en: firstName } });

    // Fresh context → the server copy renders.
    const fresh = await as('clientA');
    await fresh.page.goto('/nutrition');
    await ready(fresh.page);
    await expect(fresh.page.getByText(`+ ${firstName}`)).toBeVisible({ timeout: 20_000 });
  });

  test('nutrition: food search failure → error state, manual entry still saves', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    await seedNutritionPlan(db);
    const { page } = await as('clientA');
    await page.route(/\/api\/trpc\/[^?]*foodSearch\.search/, (r) => r.abort());
    await page.goto('/nutrition');
    await ready(page);
    await page.getByRole('button', { name: 'Add food' }).last().click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Search a food database…').fill('chicken');
    await expect(sheet.getByText('Search failed — try again or enter it manually')).toBeVisible({ timeout: 15_000 });
    await shot(page, testInfo, '01-search-error');
    await sheet.getByLabel('Name', { exact: true }).fill('C Manual Rice');
    await sheet.getByLabel('Quantity').fill('200 g');
    await sheet.getByLabel('Protein').fill('5');
    await sheet.getByLabel('Carbs').fill('56');
    await sheet.getByLabel('Fats').fill('1');
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    // 5*4 + 56*4 + 1*9 = 253 kcal
    await expect(page.getByText('C Manual Rice')).toBeVisible();
    await expect(page.getByText(/200 g · 253 kcal · P5 C56 F1/)).toBeVisible();
    await page.waitForTimeout(600);
    await page.reload();
    await ready(page);
    await expect(page.getByText('C Manual Rice')).toBeVisible();
    await shot(page, testInfo, '02-manual-persisted');
  });

  test('cardio: manual entry → reload → persists (and server copy)', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'cardioLogs' });
    const { page } = await as('clientA');
    await page.goto('/cardio');
    await ready(page);
    await page.getByRole('button', { name: 'Log activity' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Running' }).click();
    await sheet.locator('input[placeholder="10000"]').fill('4321');
    await sheet.locator('input[placeholder="40"]').fill('25');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toHaveCount(0);
    const row = page.locator('li.card').filter({ hasText: 'Running' });
    await expect(row).toContainText('25min');
    await expect(row).toContainText('4,321');
    await shot(page, testInfo, '01-cardio-logged');
    await page.waitForTimeout(600);
    await page.reload();
    await ready(page);
    await expect(page.locator('li.card').filter({ hasText: 'Running' })).toContainText('25min');
    const rec = await pollDb(
      () => db.findOne<SyncRec<{ type: string; durationSec: number; steps: number }>>('syncRecords', { clientId: CLIENT_A, collection: 'cardioLogs' }),
      (r) => !!r,
    );
    expect(rec?.data).toMatchObject({ type: 'running', durationSec: 1500, steps: 4321 });
    await shot(page, testInfo, '02-cardio-after-reload');
  });

  test('check-in: coach requests → client completes 4-step wizard → submitted → coach sees it', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(180_000);
    await db.deleteMany('checkIns', { clientId: CLIENT_A });
    const coach = await as('coachA');
    await coach.page.goto(`/coach/client/${CLIENT_A}/checkins`);
    await ready(coach.page);
    await coach.page.getByTestId('checkin-request').click();
    await expect(coach.page.getByTestId('checkin-request')).toHaveText(/Already requested this week/);
    await expect(coach.page.getByTestId('checkin-row')).toContainText('Requested');
    await shot(coach.page, testInfo, '01-coach-requested');
    const req = await db.findOne<{ _id: string; status: string; weekStart: string }>('checkIns', { clientId: CLIENT_A });
    expect(req?.status).toBe('requested');

    const { page } = await as('clientA');
    await page.goto('/');
    await ready(page);
    await page.getByTestId('home-checkin').click();
    await expect(page).toHaveURL(new RegExp(`/check-in/${req!.weekStart}$`));
    await expect(page.getByText(/1 of 4|Step 1/i)).toBeVisible();
    await page.getByLabel('Weight').fill('71.4');
    await shot(page, testInfo, '02-wizard-body');
    await page.getByTestId('checkin-next').click();
    await expect(page.getByTestId('checkin-training')).toBeVisible();
    await page.getByTestId('checkin-next').click();
    await expect(page.getByTestId('checkin-nutrition')).toBeVisible();
    await page.getByTestId('checkin-next').click();
    await page.getByTestId('checkin-notes').fill('C-spec: solid week, slept well.');
    await shot(page, testInfo, '03-wizard-notes');
    await page.getByTestId('checkin-submit').click();
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(page.getByText('C-spec: solid week, slept well.')).toBeVisible();
    await shot(page, testInfo, '04-client-submitted');

    const sub = await db.findOne<{ status: string; currentWeight: number; notes: string; submittedAt: number }>('checkIns', { _id: req!._id });
    expect(sub).toMatchObject({ status: 'submitted', currentWeight: 71.4, notes: 'C-spec: solid week, slept well.' });
    expect(sub?.submittedAt).toBeGreaterThan(0);

    // Reload keeps the read-only summary (no wizard again).
    await page.reload();
    await ready(page);
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(page.getByTestId('checkin-next')).toHaveCount(0);

    // Coach (fresh context) sees the submission.
    const coach2 = await as('coachA');
    await coach2.page.goto(`/coach/client/${CLIENT_A}/checkins`);
    await ready(coach2.page);
    const row = coach2.page.getByTestId('checkin-row').first();
    await expect(row).toContainText('Submitted');
    await expect(row).toContainText('71.4');
    await row.locator('button').first().click();
    await expect(row).toContainText('C-spec: solid week, slept well.');
    await shot(coach2.page, testInfo, '05-coach-sees-submission');
  });

  test('measurements: save → reload → persist; clear one → save → reload → stays cleared', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(180_000);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'measurementLogs' });
    const day = todayKey();
    const { page } = await as('clientA');
    const field = (label: string) => page.locator('div').filter({ has: page.locator(`label:text-is("${label}")`) }).locator('> input');
    await page.goto('/progress/measurements');
    await ready(page);
    await field('Waist').fill('81.5');
    await field('Chest').fill('99');
    await field('Arm').fill('34');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved').first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.reload();
    await ready(page);
    await expect(field('Waist')).toHaveValue('81.5');
    await expect(field('Chest')).toHaveValue('99');
    await expect(field('Arm')).toHaveValue('34');
    await shot(page, testInfo, '01-saved-after-reload');
    type MLog = { values: Record<string, number> };
    const r1 = await pollDb(
      () => db.findOne<SyncRec<MLog>>('syncRecords', { clientId: CLIENT_A, collection: 'measurementLogs', recordId: day }),
      (r) => r?.data.values.waist === 81.5,
    );
    expect(r1?.data.values).toEqual({ waist: 81.5, chest: 99, arm: 34 });

    // Clear one value → save → reload → it stays cleared (locally AND on the server).
    await field('Waist').fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved').first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.reload();
    await ready(page);
    await expect(field('Chest')).toHaveValue('99');
    await expect(field('Waist')).toHaveValue('');
    const r2 = await pollDb(
      () => db.findOne<SyncRec<MLog>>('syncRecords', { clientId: CLIENT_A, collection: 'measurementLogs', recordId: day }),
      (r) => !!r && !('waist' in r.data.values),
    );
    expect(r2?.data.values).toEqual({ chest: 99, arm: 34 });
    // A second reload (pull-before-push sync pass) must not resurrect it.
    await page.reload();
    await ready(page);
    await expect(field('Waist')).toHaveValue('');
    await shot(page, testInfo, '02-cleared-after-reload');
    // Fresh context: server copy only.
    const fresh = await as('clientA');
    const ff = (label: string) => fresh.page.locator('div').filter({ has: fresh.page.locator(`label:text-is("${label}")`) }).locator('> input');
    await fresh.page.goto('/progress/measurements');
    await ready(fresh.page);
    await expect(ff('Chest')).toHaveValue('99', { timeout: 20_000 });
    await expect(ff('Waist')).toHaveValue('');
  });

  test('progress photo: upload PNG → appears → server record has stub-CDN cdnUrl → loads in fresh context', async ({ as, db, env, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(180_000);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'progressPhotos' });
    const { page } = await as('clientA');
    await page.goto('/progress/photos');
    await ready(page);
    const png = await makePng(page, '#3a7bd4', 96);
    await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: png });
    const img = page.locator('img[alt="front"]');
    await expect(img).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Uploading', { exact: false })).toHaveCount(0, { timeout: 20_000 });
    await shot(page, testInfo, '01-photo-added');
    await page.waitForTimeout(500);
    await page.reload(); // boot sync pushes the photo metadata (incl. cdnUrl)
    await ready(page);
    await expect(page.locator('img[alt="front"]')).toBeVisible();
    const rec = await pollDb(
      () => db.findOne<SyncRec<{ cdnUrl?: string; pose: string }>>('syncRecords', { clientId: CLIENT_A, collection: 'progressPhotos' }),
      (r) => !!r?.data.cdnUrl,
    );
    expect(rec?.data.pose).toBe('front');
    expect(rec?.data.cdnUrl ?? '').toMatch(new RegExp(`^${env.bunny.cdn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`));
    const res = await page.request.get(rec!.data.cdnUrl!);
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeGreaterThan(50);

    const fresh = await as('clientA');
    await fresh.page.goto('/progress/photos');
    await ready(fresh.page);
    const fimg = fresh.page.locator('img[alt="front"]');
    await expect(fimg).toBeVisible({ timeout: 20_000 });
    await expect(fimg).toHaveAttribute('src', rec!.data.cdnUrl!);
    await expect.poll(() => fimg.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await shot(fresh.page, testInfo, '02-photo-fresh-context');
  });

  test('settings: rename → coach sees new name; Arabic → rtl; sign out → anonymous', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(180_000);
    const NEW = 'Aya C-Renamed';
    const { page } = await as('clientA');
    try {
      await page.goto('/settings');
      await ready(page);
      await page.locator('#settings-name').fill(NEW);
      await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 10_000 });
      await shot(page, testInfo, '01-renamed');
      await expect.poll(async () => (await db.findOne<{ displayName: string }>('users', { _id: CLIENT_A }))?.displayName).toBe(NEW);

      const coach = await as('coachA');
      await coach.page.goto('/coach/clients');
      await ready(coach.page);
      // Soft: a stale roster name is a defect, but the rest of the journey must still run.
      await expect.soft(coach.page.getByText(NEW).first(), 'coach roster shows the renamed client').toBeVisible();
      await shot(coach.page, testInfo, '02-coach-roster-after-rename');
      await coach.page.goto(`/coach/messages/${CLIENT_A}`);
      await ready(coach.page);
      await expect.soft(coach.page.getByText(NEW).first(), 'coach thread header shows the renamed client').toBeVisible();
      await shot(coach.page, testInfo, '02b-coach-thread-after-rename');

      // Language → Arabic.
      await page.getByTestId('settings-tab-preferences').click();
      await page.getByRole('button', { name: 'ع', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', /^ar/);
      expect(await bodyText(page)).toMatch(/[\u0600-\u06FF]{3,}/);
      await shot(page, testInfo, '03-arabic-rtl');
      await page.waitForTimeout(500);
      await page.reload();
      await ready(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      // Back to English.
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(page.getByText('Language')).toBeVisible();

      // Restore the seeded name through the UI.
      await page.getByTestId('settings-tab-profile').click();
      await page.locator('#settings-name').fill('Client Aya');
      await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => (await db.findOne<{ displayName: string }>('users', { _id: CLIENT_A }))?.displayName).toBe('Client Aya');

      // Sign out (with confirm) → anonymous, and stays anonymous after reload.
      await page.getByTestId('settings-tab-account').click();
      await page.getByTestId('client-sign-out').click();
      await expect(page.getByTestId('confirm-dialog')).toBeVisible();
      await page.getByTestId('confirm-accept').click();
      await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 15_000 });
      await shot(page, testInfo, '04-signed-out');
      await page.reload();
      await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 15_000 });
    } finally {
      // Safety net if an assertion above failed mid-way.
      await db.updateOne('users', { _id: CLIENT_A }, { $set: { displayName: 'Client Aya', displayNameLower: 'client aya' } });
    }
  });
});
