import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';

/**
 * B4 — the curated Forma catalog in a real browser (B4.3: always on — it IS the shared library):
 * the coach finds an exercise in Arabic / Egyptian words in the ONE list, previews its demonstration,
 * Forma's instructions and the media credits, and adds it — the plan stores a full copy with its
 * catalog link; a catalog food is added as a computed serving with its provenance; in the Library a
 * coach customises a Forma exercise (their own version replaces Forma's in their list); the client
 * reads the copy in Arabic on a phone (name, instructions, credits; the serving in Arabic). Offline
 * says so. axe, 44 px, no overflow.
 *
 * Fixtures on coachPro use `e2e-b4-` ids and are removed in afterAll (with the one library copy).
 */
const COACH = 'e2e-coach-pro';
const PFX = 'e2e-b4-';
const DAY = 86_400_000;
const CLIENT = { id: `${PFX}client`, name: 'Hana Samir' };
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });
/** Screens for the B4 visual QA, kept on disk: e2e-out/<run>/b4-visual/. */
async function visual(page: Page, name: string, fullPage = false) {
  const dir = path.join('e2e-out', process.env.E2E_RUN_ID ?? 'local', 'b4-visual');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const base = { warmupSets: '1', warmupSetCount: 1, workingSets: 3, repRange: '8-12', rir: '', tempo: '', restSec: 90, videoId: null, notes: { en: '', ar: '' } };
async function insertFixtures() {
  const now = Date.now();
  await insertMany('users', [{ _id: CLIENT.id, email: `${CLIENT.id}@e2e.test`, emailLower: `${CLIENT.id}@e2e.test`, displayName: CLIENT.name, displayNameLower: CLIENT.name.toLowerCase(), role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: '+201240099999', passwordHash: 'not-a-login', createdBy: 'e2e-b4', createdAt: now - 60 * DAY, updatedAt: now }]);
  await insertMany('coachClients', [{ _id: `${COACH}__${CLIENT.id}`, coachId: COACH, clientId: CLIENT.id, status: 'active', createdBy: COACH, createdAt: now - 30 * DAY, updatedAt: now, subscription: { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } }]);
  await insertMany('clientProfiles', [{ _id: CLIENT.id, clientId: CLIENT.id, updatedAt: now, profile: { id: CLIENT.id, name: CLIENT.name, age: 29, weightKg: 64, heightCm: 165, goal: 'fat_loss', activityLevel: 'moderate', locale: 'en', createdAt: now - 10 * DAY, updatedAt: now - 10 * DAY }, assessment: { status: 'reviewed', completed: true, submittedAt: now - 20 * DAY, basic: { fullName: CLIENT.name } } }]);
  await insertMany('clientWorkoutPlans', [
    { _id: CLIENT.id, clientId: CLIENT.id, id: `wp-${CLIENT.id}`, name: 'Push base', days: [{ id: 'd-push', dayIndex: 0, title: 'Push', focus: '', exerciseIds: ['ex-seed'] }], exercises: { 'ex-seed': { id: 'ex-seed', name: 'Warm-up walk', targetMuscle: 'Calves', ...base } }, updatedAt: now - 5 * DAY },
  ]);
  await insertMany('clientNutritionPlans', [
    { _id: CLIENT.id, clientId: CLIENT.id, id: `mp-${CLIENT.id}`, name: 'Lean', meals: [{ id: 'm-lunch', slot: 'lunch', label: { en: 'Lunch', ar: 'غداء' }, items: [] }], targets: { calories: 2200, protein: 160, carbs: 220, fats: 70 }, supplements: [], waterTargetMl: 3000, beverageNotes: [], generalNotes: [], updatedAt: now - 5 * DAY },
  ]);
}
async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  for (const col of ['coachClients', 'clientProfiles', 'planVersions', 'notifications', 'syncRecords']) await db.deleteMany(col, { clientId: re });
  for (const col of ['clientWorkoutPlans', 'clientNutritionPlans', 'users']) await db.deleteMany(col, { _id: re });
  await db.deleteMany('coachExercises', { coachId: COACH, id: 'cat-fx_romanian_deadlift' });
  await db.deleteMany('coachFavorites', { coachId: COACH });
}
async function axe(page: Page, selector: string) {
  const r = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
async function smallTargets(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els.flatMap((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.height < 43.5 || r.width < 43.5) ? [`${el.getAttribute('data-testid') ?? el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`] : [];
    }),
  );
}

test.describe('B4 Forma catalog', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async ({ db }) => {
    await removeFixtures(db);
    await insertFixtures();
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('coach: find an exercise in Egyptian Arabic, preview demonstration + instructions + credits, add it — the plan keeps a full copy with its catalog link', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/client/${CLIENT.id}/workout`);
    await ready(page);
    await expect(page.getByTestId('coach-workout-editor')).toBeVisible();
    await page.getByTestId('builder-add-exercise').click();
    const picker = page.getByTestId('exercise-picker');
    await expect(picker).toBeVisible();
    await page.getByTestId('picker-library-search').fill('بنش مستوي');
    const row = page.locator('[data-testid="library-exercise-row"][data-id="fx_barbell_bench_press"]');
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(picker.getByTestId('library-exercise-row').first()).toHaveAttribute('data-id', 'fx_barbell_bench_press');
    expect(await smallTargets(page, '[data-testid="exercise-picker"] button')).toEqual([]);
    expect(await axe(page, '[data-testid="exercise-picker"]')).toEqual([]);
    await row.getByTestId('library-row-preview').click();
    const view = page.getByTestId('catalog-exercise-view');
    await expect(view).toBeVisible();
    await expect(view.getByTestId('exercise-instructions')).toBeVisible();
    await expect(view.getByTestId('media-credits')).toContainText('Goulart'); // the H.264 MP4 demonstration
    await expect(view.getByTestId('media-credits')).toContainText('Everkinetic');
    // B4.1: every approved demonstration can be chosen; the video loads only when tapped (poster first).
    // B4.2: the three videos and the ExerciseDB GIF of the same movement (linked, never a duplicate item).
    await expect(view.getByTestId('catalog-demo-option')).toHaveCount(4);
    await expect(view.locator('video')).toHaveCount(0);
    await view.getByTestId('catalog-video-poster').click();
    await expect(view.locator('video')).toHaveCount(1);
    await shot(page, testInfo, 'catalog-preview-1440');
    await visual(page, 'catalog-preview-en-1440');
    expect(await axe(page, '[data-testid="catalog-exercise-view"]')).toEqual([]);
    await page.getByTestId('catalog-preview-select').click();
    await page.getByTestId('picker-add-selected').click();
    await expect(page.getByTestId('builder-exercise-row').filter({ hasText: 'Barbell bench press' })).toBeVisible();
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('workout-saved')).toBeVisible({ timeout: 15_000 });

    const doc = await db.findOne<{ exercises: Record<string, Record<string, unknown>>; days: { exerciseIds: string[] }[] }>('clientWorkoutPlans', { _id: CLIENT.id });
    const copy = Object.values(doc!.exercises).find((e) => e.catalogId === 'fx_barbell_bench_press') as Record<string, unknown> & { mediaCredits: { author: string; license: string }[]; instructions: { ar: { steps: string[] } }; names: { ar: string }; id: string };
    expect(copy, 'the catalog copy is in the plan').toBeTruthy();
    expect(copy.names.ar).toBe('ضغط البار على البنش المستوي');
    expect(copy.instructions.ar.steps.length).toBeGreaterThan(1);
    expect(copy.mediaCredits.map((c) => c.author)).toEqual(expect.arrayContaining(['Everkinetic', 'Goulart']));
    expect(copy.libraryExerciseId).toBeUndefined();
    expect(doc!.days[0].exerciseIds).toContain(copy.id);
    expect(doc!.exercises['ex-seed']).toMatchObject({ name: 'Warm-up walk' }); // untouched
  });

  test('coach: a catalog food is a computed serving (2 cups of rice) saved with its provenance', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/client/${CLIENT.id}/nutrition`);
    await ready(page);
    await expect(page.getByTestId('coach-nutrition-editor')).toBeVisible();
    await page.getByTestId('nutrition-add-food').first().click();
    await page.getByTestId('food-library-search').fill('رز طويل');
    const rice = page.locator('[data-testid="library-food-row"][data-id="ff_rice_white_long_cooked"]');
    await expect(rice).toBeVisible({ timeout: 15_000 });
    await rice.getByTestId('library-row-main').click();
    await expect(page.getByTestId('food-catalog-portion')).toHaveValue('cup');
    await page.getByTestId('food-catalog-amount').fill('2');
    await page.getByTestId('food-catalog-amount').blur();
    await expect(page.getByTestId('food-catalog-macros')).toContainText('316 g · 411 kcal');
    await page.getByTestId('food-catalog-use').click();
    await expect(page.getByTestId('food-serving')).toBeVisible();
    await page.getByTestId('food-save').click();
    await page.getByTestId('nutrition-save').click();
    await expect
      .poll(async () => ((await db.findOne<{ meals: { items: Record<string, unknown>[] }[] }>('clientNutritionPlans', { _id: CLIENT.id }))?.meals[0].items[0] ?? null) as Record<string, unknown> | null, { timeout: 15_000 })
      .toMatchObject({ catalogId: 'ff_rice_white_long_cooked', calories: 411, protein: 8.5, carbs: 89, fats: 0.9, portion: { id: 'cup', amount: 2, grams: 316 }, foodState: 'cooked', verification: 'source-values', source: { provider: 'forma-catalog' } });
  });

  test('coach Library: a Forma exercise opens read-first; "Customise" saves the coach\'s own version, which then replaces Forma\'s in their list; Reset brings Forma\'s back', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/library?tab=exercises');
    await ready(page);
    await page.getByTestId('lib-exercises-search').fill('الرفعة الرومانية');
    const rdl = page.locator('[data-testid="library-exercise-row"][data-id="fx_romanian_deadlift"]');
    await expect(rdl).toBeVisible({ timeout: 15_000 });
    await rdl.getByTestId('library-row-main').click();
    // B4.2: the ExerciseDB demonstration of the same movement, credited (B4.1 said "no demonstration yet" here).
    await expect(page.getByTestId('catalog-gif')).toBeVisible();
    await expect(page.getByTestId('credit-exercisedb')).toContainText('AscendAPI');
    await page.getByTestId('catalog-customize').click();
    await expect(page.getByTestId('ex-name')).toHaveValue('Barbell Romanian deadlift');
    await page.getByTestId('ex-name').fill('Romanian deadlift (paused)');
    await page.getByTestId('ex-save').click();
    await expect.poll(async () => (await db.findOne<{ catalogId?: string; name?: string }>('coachExercises', { coachId: COACH, id: 'cat-fx_romanian_deadlift' }))?.catalogId, { timeout: 15_000 }).toBe('fx_romanian_deadlift');
    await page.getByTestId('lib-exercises-search').fill('romanian deadlift');
    const mine = page.locator('[data-testid="library-exercise-row"][data-id="cat-fx_romanian_deadlift"]');
    await expect(mine).toContainText('Romanian deadlift (paused)');
    await expect(mine.getByTestId('library-badge-customized')).toBeVisible();
    await expect(rdl).toHaveCount(0); // listed once — as the coach's version
    await mine.getByTestId('library-row-main').click();
    await page.getByTestId('exercise-reset').click();
    await page.getByTestId('confirm-accept').click();
    await expect.poll(() => db.count('coachExercises', { coachId: COACH, id: 'cat-fx_romanian_deadlift' }), { timeout: 15_000 }).toBe(0);
    await expect(rdl).toBeVisible();
  });

  test('offline: a Forma search says the library needs a connection — never stale results for a new search', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page, context } = await as('coachPro', sized(1440));
    await page.goto(`/coach/client/${CLIENT.id}/workout`);
    await ready(page);
    await page.getByTestId('builder-add-exercise').click();
    await page.getByTestId('picker-library-search').fill('squat');
    await expect(page.getByTestId('library-exercise-row').first()).toBeVisible({ timeout: 15_000 });
    await context.setOffline(true);
    await page.getByTestId('picker-library-search').fill('lunge');
    await expect(page.getByTestId('picker-library-offline')).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);
  });

  test('client (phone, Arabic): the copied exercise reads in Arabic with Forma’s instructions and the media credits; the serving reads in Arabic; no overflow', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const doc = await db.findOne<{ exercises: Record<string, { id: string; catalogId?: string }> }>('clientWorkoutPlans', { _id: CLIENT.id });
    const exId = Object.values(doc!.exercises).find((e) => e.catalogId === 'fx_barbell_bench_press')!.id;
    const { page } = await as({ id: CLIENT.id, label: 'b4Client' }, phone);
    await page.goto('/settings?tab=preferences');
    await ready(page);
    await page.getByRole('button', { name: 'ع', exact: true }).click();
    await waitForLocaleSaved(page, 'ar');
    await page.goto(`/workout/exercise/${exId}`);
    await ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ضغط البار على البنش المستوي', { timeout: 20_000 });
    await expect(page.getByTestId('exercise-instructions')).toContainText('طريقة الأداء');
    await expect(page.getByTestId('media-credits')).toContainText('Everkinetic');
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    expect(await axe(page, '[data-testid="exercise-detail"]')).toEqual([]);
    await shot(page, testInfo, 'client-exercise-ar-390', true);
    await visual(page, 'client-exercise-ar-390', true);
    await page.goto('/nutrition');
    await ready(page);
    await expect(page.locator('body')).toContainText('2 × كوب (316 جم)', { timeout: 20_000 });
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    await shot(page, testInfo, 'client-nutrition-ar-390', true);
    await visual(page, 'client-nutrition-ar-390', true);
  });

  test('matrix: picker (Forma library + preview) and food serving at 390 / 768 / 1440 in EN, AR and AR-EG — no overflow, axe clean, 44 px targets', async ({ as, audit }) => {
    test.setTimeout(240_000);
    allowDevModuleStorm(audit);
    for (const [label, locale] of [['English', 'en'], ['العربية', 'ar'], ['مصري', 'ar-eg']] as const) {
      for (const width of [390, 768, 1440]) {
        const { page, context } = await as('coachPro', width === 390 ? phone : sized(width));
        await page.goto('/coach/settings');
        await ready(page);
        await page.getByRole('button', { name: label, exact: true }).click();
        await waitForLocaleSaved(page, LOCALE_OF[label]);
        const tag = `${locale}-${width}`;

        await page.goto(`/coach/client/${CLIENT.id}/workout`);
        await ready(page);
        // Phones and tablets show the days first; the desktop opens the first day itself.
        if (width < 1024) await page.getByTestId('builder-day-card').first().click();
        await page.getByTestId('builder-add-exercise').first().click();
        await page.getByTestId('picker-library-search').fill(locale === 'en' ? 'press' : 'ضغط');
        await expect(page.getByTestId('library-exercise-row').first()).toBeVisible({ timeout: 15_000 });
        expect(await overflowOf(page), `overflow ${tag}`).toBeLessThanOrEqual(0);
        expect(await smallTargets(page, '[data-testid="exercise-picker"] button'), `targets ${tag}`).toEqual([]);
        expect(await axe(page, '[data-testid="exercise-picker"]'), `axe picker ${tag}`).toEqual([]);
        await visual(page, `picker-${tag}`);
        await page.locator('[data-testid="library-exercise-row"][data-id="fx_barbell_bench_press"]').getByTestId('library-row-preview').click();
        await expect(page.getByTestId('catalog-exercise-view')).toBeVisible();
        expect(await axe(page, '[data-testid="catalog-exercise-view"]'), `axe preview ${tag}`).toEqual([]);
        expect(await overflowOf(page), `overflow preview ${tag}`).toBeLessThanOrEqual(0);
        await visual(page, `preview-${tag}`);

        await page.goto(`/coach/client/${CLIENT.id}/nutrition`);
        await ready(page);
        await page.getByTestId('nutrition-add-food').first().click();
        await page.getByTestId('food-library-search').fill(locale === 'en' ? 'baladi' : 'عيش بلدي');
        await page.locator('[data-testid="library-food-row"][data-id="ff_baladi_bread"]').getByTestId('library-row-main').click();
        await expect(page.getByTestId('food-catalog-note')).toBeVisible(); // the estimate says what it was matched to
        expect(await smallTargets(page, '[data-testid="food-catalog-serving"] button'), `targets serving ${tag}`).toEqual([]);
        expect(await axe(page, '[data-testid="food-catalog-serving"]'), `axe serving ${tag}`).toEqual([]);
        expect(await overflowOf(page), `overflow serving ${tag}`).toBeLessThanOrEqual(0);
        await visual(page, `food-serving-${tag}`);
        await context.close();
      }
    }
  });
});
