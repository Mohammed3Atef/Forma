import fs from 'node:fs';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot } from '../fixtures';
import { CLIENT_A, seedWorkoutPlan, seedNutritionPlan, pollDb, todayKey, allowDevModuleStorm, type SyncRec } from './_c-helpers';
import { uiLogin, noHmr } from './_a-helpers';

/**
 * B2 — Premium client experience: regression tests for every B2 behaviour
 * that replaced an old one, plus the brief's client journeys that no earlier
 * spec covers end to end (B, C, D, E, G, H, I). Journeys already covered
 * elsewhere are mapped in docs/product-audit/B2_CLIENT_CERTIFICATION_REPORT.md.
 *
 * Every test cleans up the seeded state it changes (shared DB, files run in order).
 */
const mobile = (width = 390, height = 844) => ({ ...devices['Pixel 7'], viewport: { width, height } });
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const tr = (key: string, vars: Record<string, string | number> = {}) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], ar) as string);
const TODAY = todayKey();

async function setLanguage(page: Page, label: 'EN' | 'ع') {
  await page.goto('/settings?tab=preferences');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', label === 'EN' ? 'ltr' : 'rtl');
  await page.waitForTimeout(600); // let the synced locale land before navigating
}

test.describe('B2 client', () => {
  test.afterAll(async ({ db }) => {
    for (const collection of ['workoutLogs', 'nutritionLogs', 'weightLogs']) await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection, recordId: TODAY });
    await db.deleteMany('messages', { clientId: CLIENT_A, body: { $regex: '^B2 ' } });
    await db.deleteMany('checkIns', { _id: { $regex: `^${CLIENT_A}__2032-` } });
  });

  test('IA: five tabs, You behind the avatar, no hamburger; side rail from 1024 px; retired routes redirect', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('clientA', mobile());
    await page.goto('/');
    await ready(page);
    const nav = page.getByTestId('bottom-nav');
    for (const key of ['today', 'train', 'nutrition', 'progress', 'coach']) await expect(nav.getByTestId(`nav-${key}`)).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(5);
    await expect(page.getByTestId('client-rail')).toBeHidden();
    await expect(page.getByRole('button', { name: /^menu$/i })).toHaveCount(0); // the old hamburger is gone for the client
    await page.getByTestId('you-button').click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Client Aya' })).toBeVisible();
    await page.goto('/workout/library');
    await expect(page).toHaveURL(/\/workout$/);
    await page.goto('/notifications');
    await expect(page).toHaveURL(/\/coach-notes$/);
    await shot(page, testInfo, '01-mobile-nav');

    const desk = await as('clientA');
    await desk.page.goto('/');
    await ready(desk.page);
    await expect(desk.page.getByTestId('client-rail')).toBeVisible();
    await expect(desk.page.getByTestId('bottom-nav')).toBeHidden();
    await expect(desk.page.getByTestId('rail-you')).toBeVisible();
    await shot(desk.page, testInfo, '02-desktop-rail');
  });

  test('Journey A — new client: no coach yet → an honest state; coach but no plan → waiting; the plan arrives → the first action is Start', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    // No coach (clientFree): Today says so — never zeros, never "waiting for your coach".
    const free = await as('clientFree', mobile());
    await free.page.goto('/');
    await ready(free.page);
    await expect(free.page.getByText("You're not connected to a coach yet")).toBeVisible({ timeout: 20_000 });
    await expect(free.page.getByTestId('waiting-for-coach')).toHaveCount(0);
    await free.page.getByTestId('nav-coach').click();
    await expect(free.page.getByTestId('messages-no-coach')).toBeVisible();
    await shot(free.page, testInfo, '01-no-coach');

    // Assigned coach, no plan yet → waiting; then the plan arrives → Start is the first action.
    await db.deleteMany('clientWorkoutPlans', { _id: CLIENT_A });
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs' });
    const { page } = await as('clientA', mobile());
    await page.goto('/');
    await ready(page);
    await expect(page.getByTestId('waiting-for-coach')).toBeVisible({ timeout: 20_000 });
    await shot(page, testInfo, '02-waiting-for-plan');
    await seedWorkoutPlan(db);
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('today-start')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('waiting-for-coach')).toHaveCount(0);
    await shot(page, testInfo, '03-first-action-start');
  });

  test('Journey B — Today → Start (already running, CL-18) → set → rest → resume bar → finish → Today shows done', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    await seedWorkoutPlan(db);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs' });
    const { page } = await as('clientA', mobile());
    await page.goto('/');
    await ready(page);
    await page.getByTestId('today-start').click();
    await expect(page).toHaveURL(/\/workout\/session$/);
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
    const row = page.getByTestId('set-row').first();
    await row.getByLabel('Weight').fill('40');
    await row.getByLabel('reps').fill('10');
    await page.getByTestId('set-done-0').click();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Leave the session: the resume bar follows the client and brings them back.
    await page.waitForTimeout(500);
    await page.goto('/nutrition');
    await ready(page);
    await expect(page.getByTestId('resume-bar')).toBeVisible();
    await shot(page, testInfo, '01-resume-bar');
    await page.getByTestId('resume-bar').click();
    await expect(page).toHaveURL(/\/workout\/session$/);
    await expect(page.getByTestId('resume-bar')).toHaveCount(0);

    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.locator('#finish-duration').fill('20');
    await page.getByRole('button', { name: 'Save workout' }).click();
    await expect(page.getByText('Workout complete')).toBeVisible();
    await page.goto('/');
    await ready(page);
    await expect(page.getByTestId('today-view-session')).toBeVisible();
    await expect(page.getByTestId('resume-bar')).toHaveCount(0);
    await shot(page, testInfo, '02-today-done');
    const rec = await pollDb(
      () => db.findOne<SyncRec<{ finished: boolean; exercises: { sets: { done: boolean; weightKg: number | null }[] }[] }>>('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs', recordId: TODAY }),
      (r) => !!r?.data.finished,
    );
    expect(rec?.data.exercises[0].sets[0]).toMatchObject({ done: true, weightKg: 40 });
  });

  test('Journey C — Nutrition: one Add-food flow with "Add to", edit the quantity, and the day switcher never logs to another day silently', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    await seedNutritionPlan(db);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs' });
    const { page } = await as('clientA', mobile());
    await page.goto('/nutrition');
    await ready(page);

    // The page's Add food asks where the food goes (default: Other); pick the meal.
    await page.getByRole('button', { name: 'Add food', exact: true }).last().click();
    const sheet = page.getByRole('dialog');
    const target = sheet.getByRole('radiogroup', { name: 'Add to' });
    await expect(target.getByRole('radio', { name: 'Other' })).toHaveAttribute('aria-checked', 'true');
    await target.getByRole('radio', { name: 'C Breakfast' }).click();
    await sheet.getByLabel('Name', { exact: true }).fill('B2 Toast');
    await sheet.getByLabel('Quantity').fill('1 slice');
    await sheet.getByLabel('Carbs').fill('15');
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    const meal = page.getByTestId('meal-c-meal-1');
    await expect(meal.getByText('+ B2 Toast')).toBeVisible();

    // Edit the quantity from the row menu (no red × on the row).
    await meal.getByRole('button', { name: 'Options for B2 Toast' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await sheet.getByLabel('Quantity').fill('2 slices');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(meal.getByText(/^2 slices/)).toBeVisible();
    await shot(page, testInfo, '01-added-and-edited');

    // Another day is announced in words, and one tap returns to today.
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect(page.getByTestId('day-switcher-notice')).toContainText('changes are saved to this day');
    await expect(page.getByText('+ B2 Toast')).toHaveCount(0);
    await shot(page, testInfo, '02-yesterday-announced');
    await page.getByTestId('day-switcher-today').click();
    await expect(page.getByTestId('day-switcher-label')).toHaveText('Today');
    await expect(page.getByText('+ B2 Toast')).toBeVisible();

    // The server copy (a reload runs the boot sync, as in the Phase-3 client specs).
    await page.waitForTimeout(800);
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('meal-c-meal-1').getByText('+ B2 Toast')).toBeVisible();
    const rec = await pollDb(
      () => db.findOne<SyncRec<{ extraItems: Record<string, { name: { en: string }; quantity: string }[]> }>>('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs', recordId: TODAY }),
      (r) => r?.data.extraItems?.['c-meal-1']?.[0]?.quantity === '2 slices',
    );
    expect(rec?.data.extraItems['c-meal-1']).toHaveLength(1);
    expect(rec?.data.extraItems['c-meal-1'][0]).toMatchObject({ quantity: '2 slices', name: { en: 'B2 Toast' } });
  });

  test('Journey D — Progress: one log flow (weight → measurements), period-driven trend, old tab links land on the right view', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'weightLogs', recordId: TODAY });
    const { page } = await as('clientA', mobile());
    await page.goto('/progress');
    await ready(page);
    await expect(page.getByRole('radio', { name: 'Body' })).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('progress-log-weight').click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Weight (kg)').fill('71.4');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('progress-weight')).toContainText('71.4');
    await page.waitForTimeout(800);
    await page.reload(); // boot sync pushes the weigh-in
    await ready(page);
    await expect(page.getByTestId('progress-weight')).toContainText('71.4');
    const rec = await pollDb(
      () => db.findOne<SyncRec<{ weightKg: number }>>('syncRecords', { clientId: CLIENT_A, collection: 'weightLogs', recordId: TODAY }),
      (r) => r?.data.weightKg === 71.4,
    );
    expect(rec?.data.weightKg).toBe(71.4);
    // Measurements are one tap further in the same flow.
    await page.getByTestId('progress-log-weight').click();
    await page.getByRole('dialog').getByRole('button', { name: /Log measurements/ }).click();
    await expect(page).toHaveURL(/\/progress\/measurements$/);
    await expect(page.getByTestId('day-switcher')).toBeVisible();
    // Old ?tab= links.
    await page.goto('/progress?tab=strength');
    await expect(page.getByRole('radio', { name: 'Strength' })).toHaveAttribute('aria-checked', 'true');
    await page.goto('/progress?tab=photos');
    await expect(page.getByRole('radio', { name: 'Body' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('progress-photos')).toBeInViewport({ timeout: 5000 });
    await page.goto('/progress?tab=consistency');
    await expect(page.getByTestId('progress-this-week')).toBeVisible();
    await shot(page, testInfo, '01-consistency');
  });

  test('Coach tab: sections are peers (no Back); a requested check-in opens the wizard; deep links Back to their semantic parent (Journey H)', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const week = '2032-03-06';
    await db.deleteMany('checkIns', { _id: `${CLIENT_A}__${week}` });
    await db.insertOne('checkIns', { _id: `${CLIENT_A}__${week}`, clientId: CLIENT_A, coachId: 'e2e-coach-a', weekStart: week, weekEnd: week, status: 'requested', progressPhotos: {}, createdAt: Date.now(), updatedAt: Date.now() });
    const { page } = await as('clientA', mobile());
    await page.goto('/messages');
    await ready(page);
    const back = page.getByRole('button', { name: 'Back', exact: true });
    await expect(page.getByTestId('coach-nav')).toBeVisible();
    await expect(back).toHaveCount(0);
    await page.getByTestId('coach-nav-updates').click();
    await expect(page).toHaveURL(/\/coach-notes$/);
    await expect(back).toHaveCount(0);
    await page.getByTestId('coach-nav-checkins').click();
    await expect(page).toHaveURL(/\/check-ins$/);
    await expect(back).toHaveCount(0);
    await page.getByTestId('checkin-history-row').first().click();
    await expect(page).toHaveURL(new RegExp(`/check-in/${week}$`));
    await expect(page.getByTestId('checkin-flow')).toBeVisible();
    await shot(page, testInfo, '01-checkin-from-coach-tab');

    // Cold deep links (fresh contexts, no history) → Back → the semantic parent.
    await seedWorkoutPlan(db);
    for (const [path, parent] of [
      ['/workout/exercise/c-ex-bench', /\/workout$/],
      ['/assessment', /\/check-ins$/],
      ['/progress/measurements', /\/progress$/],
      ['/history', /\/workout$/],
    ] as const) {
      const cold = await as('clientA', mobile());
      await cold.page.goto(path);
      await ready(cold.page);
      await cold.page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(cold.page, `${path} → Back`).toHaveURL(parent);
    }
    const coldCheckIn = await as('clientA', mobile());
    await coldCheckIn.page.goto(`/check-in/${week}`);
    await ready(coldCheckIn.page);
    await coldCheckIn.page.getByTestId('checkin-close').click();
    await expect(coldCheckIn.page).toHaveURL(/\/check-ins$/);
  });

  test('Journey E — a message written offline is queued, then delivered and acknowledged after reconnect', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page, context } = await as('clientA', mobile());
    await page.goto('/messages');
    await ready(page);
    await expect(page.getByTestId('message-input')).toBeVisible();
    await context.setOffline(true);
    await page.getByTestId('message-input').fill('B2 offline hello');
    await page.getByTestId('message-send').click();
    const pending = page.getByTestId('message-bubble-pending').filter({ hasText: 'B2 offline hello' });
    await expect(pending).toBeVisible();
    await expect(pending).not.toHaveAttribute('data-outbox-status', 'acknowledged');
    await shot(page, testInfo, '01-queued-offline');
    await context.setOffline(false);
    await expect(page.getByTestId('message-bubble').filter({ hasText: 'B2 offline hello' })).toBeVisible({ timeout: 30_000 });
    await expect(pending).toHaveCount(0, { timeout: 30_000 });
    const msg = await pollDb(() => db.findOne<{ body: string; fromUserId: string }>('messages', { clientId: CLIENT_A, body: 'B2 offline hello' }), (m) => !!m);
    expect(msg?.fromUserId).toBe(CLIENT_A);
    await shot(page, testInfo, '02-acknowledged');
  });

  test('Journey G — account isolation: A’s offline change stays A’s, B never sees it, and it syncs when A returns', async ({ anon, db, env, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(240_000);
    await seedNutritionPlan(db);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs' });
    const { context, page } = await anon(mobile()); // phone width: the avatar (You) and the tab bar are the navigation
    await noHmr(context);
    await uiLogin(page, env.accounts.clientA.email, env.password);
    await ready(page);
    await page.goto('/nutrition');
    await ready(page);
    await page.getByTestId('you-button').click(); // load You while online (a lazy screen; production precaches it)
    await expect(page.getByTestId('client-you')).toBeVisible();
    await page.getByTestId('nav-nutrition').click();
    const meal = page.getByTestId('meal-c-meal-1');
    await expect(meal).toBeVisible();

    // A's change cannot reach the server: every sync call fails (the network is "down" for sync only,
    // so the sign-in screen and B's session still load — the dev server has no service-worker precache).
    const SYNC = /\/api\/trpc\/[^?]*sync\./;
    await page.route(SYNC, (r) => r.abort('internetdisconnected'));
    await meal.getByRole('button', { name: 'Mark eaten' }).click();
    await expect(meal).toHaveAttribute('data-eaten', 'true');
    await page.getByTestId('you-button').click();
    await page.getByTestId('settings-tab-account').click();
    await page.getByTestId('client-sign-out').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText("haven't synced yet", { timeout: 20_000 });
    await shot(page, testInfo, '01-signout-says-pending');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 20_000 });
    await page.unroute(SYNC);

    await uiLogin(page, env.accounts.clientB.email, env.password);
    await ready(page);
    await page.goto('/nutrition');
    await ready(page);
    await expect(page.getByText('C Breakfast')).toHaveCount(0);
    await expect(page.locator('[data-eaten="true"]')).toHaveCount(0);
    await shot(page, testInfo, '02-client-b-isolated');
    await page.goto('/settings?tab=account');
    await ready(page);
    await page.getByTestId('client-sign-out').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 20_000 });

    await uiLogin(page, env.accounts.clientA.email, env.password);
    await ready(page);
    await page.goto('/nutrition');
    await ready(page);
    await expect(page.getByTestId('meal-c-meal-1')).toHaveAttribute('data-eaten', 'true');
    const rec = await pollDb(
      () => db.findOne<SyncRec<{ mealsEaten: Record<string, boolean> }>>('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs', recordId: TODAY }),
      (r) => r?.data.mealsEaten?.['c-meal-1'] === true,
      30_000,
    );
    expect(rec?.data.mealsEaten['c-meal-1']).toBe(true);
    await shot(page, testInfo, '03-a-retained-and-synced');
  });

  test('You: "Remove my data from this device" refuses while changes are only on this device; when clean it removes this account’s local database and the server copy stays', async ({ anon, db, env, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(240_000);
    await seedNutritionPlan(db);
    await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs' });
    const { context, page } = await anon(mobile()); // phone width: the avatar (You) and the tab bar are the navigation
    await noHmr(context);
    await uiLogin(page, env.accounts.clientA.email, env.password);
    await ready(page);
    await page.goto('/nutrition');
    await ready(page);
    await page.getByTestId('you-button').click(); // load You while online (a lazy screen; production precaches it)
    await expect(page.getByTestId('client-you')).toBeVisible();
    await page.getByTestId('nav-nutrition').click();
    await expect(page.getByTestId('meal-c-meal-1')).toBeVisible();

    // Refused: something exists only on this device.
    await context.setOffline(true);
    await page.getByTestId('meal-c-meal-1').getByRole('button', { name: 'Mark eaten' }).click();
    await page.getByTestId('you-button').click();
    await page.getByTestId('settings-tab-account').click();
    await page.getByTestId('remove-device-data').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText('only on this device', { timeout: 15_000 });
    await shot(page, testInfo, '01-refused-pending');
    await page.getByTestId('confirm-accept').click();
    await expect(page).toHaveURL(/\/settings/);

    // Clean: sync, then remove.
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Sync now' }).click();
    await pollDb(
      () => db.findOne<SyncRec<{ mealsEaten: Record<string, boolean> }>>('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs', recordId: TODAY }),
      (r) => r?.data.mealsEaten?.['c-meal-1'] === true,
      30_000,
    );
    await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toContain(`forma-u-${CLIENT_A}`);
    await page.getByTestId('remove-device-data').click();
    const dialog = page.getByTestId('confirm-dialog');
    await expect(dialog).toContainText('Everything already saved to your account stays');
    await shot(page, testInfo, '02-confirm-explains');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)), { timeout: 15_000 }).not.toContain(`forma-u-${CLIENT_A}`);

    // The server copy is untouched and comes back at the next sign-in.
    expect((await db.findOne<SyncRec<{ mealsEaten: Record<string, boolean> }>>('syncRecords', { clientId: CLIENT_A, collection: 'nutritionLogs', recordId: TODAY }))?.data.mealsEaten['c-meal-1']).toBe(true);
    await uiLogin(page, env.accounts.clientA.email, env.password);
    await ready(page);
    await page.goto('/nutrition');
    await ready(page);
    await expect(page.getByTestId('meal-c-meal-1')).toHaveAttribute('data-eaten', 'true', { timeout: 20_000 });
    await shot(page, testInfo, '03-restored-from-account');
  });

  test('Journey I — Arabic: workout, nutrition and messaging complete in Arabic, right to left', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    test.setTimeout(240_000);
    await seedWorkoutPlan(db);
    await seedNutritionPlan(db);
    for (const collection of ['workoutLogs', 'nutritionLogs']) await db.deleteMany('syncRecords', { clientId: CLIENT_A, collection });
    const { page } = await as('clientA', mobile());
    await setLanguage(page, 'ع');
    try {
      // Workout
      await page.goto('/');
      await ready(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await page.getByTestId('today-start').click();
      await expect(page).toHaveURL(/\/workout\/session$/);
      const row = page.getByTestId('set-row').first();
      await row.getByLabel(tr('workout.weight')).fill('٥٠'); // Arabic-Indic digits are accepted (B0)
      await row.getByLabel(tr('common.reps')).fill('8');
      await page.getByTestId('set-done-0').click();
      await expect(row).toHaveAttribute('data-done', 'true');
      await page.getByRole('button', { name: tr('common.finish'), exact: true }).click();
      await page.locator('#finish-duration').fill('15');
      await page.getByRole('button', { name: tr('gt.saveWorkout') }).click();
      await expect(page.getByText(tr('gt.workoutComplete'))).toBeVisible();
      await shot(page, testInfo, '01-ar-workout-complete');

      // Nutrition
      await page.goto('/nutrition');
      await ready(page);
      await page.getByRole('button', { name: tr('nutrition.addFood'), exact: true }).last().click();
      const sheet = page.getByRole('dialog');
      await sheet.getByLabel(tr('settings.name'), { exact: true }).fill('B2 خبز');
      await sheet.getByLabel(tr('nutrition.carbs')).fill('20');
      await sheet.getByRole('button', { name: tr('common.add'), exact: true }).click();
      await expect(page.getByTestId('nutrition-other')).toContainText('B2 خبز');
      await shot(page, testInfo, '02-ar-nutrition');

      // Messaging
      await page.goto('/messages');
      await ready(page);
      await page.getByTestId('message-input').fill('B2 مرحبا');
      await page.getByTestId('message-send').click();
      await expect(page.getByTestId('message-bubble').filter({ hasText: 'B2 مرحبا' })).toBeVisible({ timeout: 30_000 });
      await shot(page, testInfo, '03-ar-message');

      const w = await pollDb(
        () => db.findOne<SyncRec<{ finished: boolean; exercises: { sets: { weightKg: number | null }[] }[] }>>('syncRecords', { clientId: CLIENT_A, collection: 'workoutLogs', recordId: TODAY }),
        (r) => !!r?.data.finished,
      );
      expect(w?.data.exercises[0].sets[0].weightKg).toBe(50);
    } finally {
      await setLanguage(page, 'EN');
    }
  });
});
