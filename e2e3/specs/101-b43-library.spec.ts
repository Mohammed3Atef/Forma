import AxeBuilder from '@axe-core/playwright';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany, waitForLocaleSaved } from './_c-helpers';

/**
 * B4.3 — the ONE shared library, end to end (isolated stack):
 *  - a coach hands a Forma exercise and a Forma food straight from the Library to a client's plan
 *    (no "save to my library" first): the plan stores the snapshot (catalog id, both languages,
 *    media / per-100 g values, the picture); nothing is written to the coach's own library;
 *  - a template is built from Forma exercises in the workout builder's picker;
 *  - a coach customises a Forma food (their name, their serving), the Forma picture can be
 *    restored after removing it; the coach's version replaces Forma's in their list; Reset brings
 *    Forma's back;
 *  - Favourites narrow the plan editors' lists;
 *  - the client reads the handed-over exercise and food (with its picture) on a phone, in Arabic.
 * Fixtures use `e2e-b43-` ids on coachPro and are removed in afterAll.
 */
const COACH = 'e2e-coach-pro';
const PFX = 'e2e-b43-';
const DAY = 86_400_000;
const CLIENT = { id: `${PFX}client`, name: 'Laila Mostafa' };
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const loaded = (page: Page, selector: string) => page.locator(selector).first().evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0);
async function axe(page: Page, selector: string) {
  const r = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
const base = { warmupSets: '1', warmupSetCount: 1, workingSets: 3, repRange: '8-12', rir: '', tempo: '', restSec: 90, videoId: null, notes: { en: '', ar: '' } };
type Item = Record<string, unknown> & { id: string; name: { en: string; ar: string } };

async function insertFixtures() {
  const now = Date.now();
  await insertMany('users', [{ _id: CLIENT.id, email: `${CLIENT.id}@e2e.test`, emailLower: `${CLIENT.id}@e2e.test`, displayName: CLIENT.name, displayNameLower: CLIENT.name.toLowerCase(), role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: '+201240099143', passwordHash: 'not-a-login', createdBy: 'e2e-b43', createdAt: now - 60 * DAY, updatedAt: now }]);
  await insertMany('coachClients', [{ _id: `${COACH}__${CLIENT.id}`, coachId: COACH, clientId: CLIENT.id, status: 'active', createdBy: COACH, createdAt: now - 30 * DAY, updatedAt: now, subscription: { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } }]);
  await insertMany('clientProfiles', [{ _id: CLIENT.id, clientId: CLIENT.id, updatedAt: now, profile: { id: CLIENT.id, name: CLIENT.name, age: 31, weightKg: 70, heightCm: 168, goal: 'fat_loss', activityLevel: 'moderate', locale: 'en', createdAt: now - 10 * DAY, updatedAt: now - 10 * DAY }, assessment: { status: 'reviewed', completed: true, submittedAt: now - 20 * DAY, basic: { fullName: CLIENT.name } } }]);
  await insertMany('clientWorkoutPlans', [{ _id: CLIENT.id, clientId: CLIENT.id, id: `wp-${CLIENT.id}`, name: 'Full body', days: [{ id: 'd-a', dayIndex: 0, title: 'Day A', focus: '', exerciseIds: ['ex-seed'] }], exercises: { 'ex-seed': { id: 'ex-seed', name: 'Warm-up walk', targetMuscle: 'Calves', ...base } }, updatedAt: now - 5 * DAY }]);
  await insertMany('clientNutritionPlans', [{ _id: CLIENT.id, clientId: CLIENT.id, id: `mp-${CLIENT.id}`, name: 'Lean', meals: [{ id: 'm-bf', slot: 'breakfast', label: { en: 'Breakfast', ar: 'الفطور' }, items: [] }], targets: { calories: 2000, protein: 140, carbs: 200, fats: 60 }, supplements: [], waterTargetMl: 3000, beverageNotes: [], generalNotes: [], updatedAt: now - 5 * DAY }]);
}
async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  for (const col of ['coachClients', 'clientProfiles', 'planVersions', 'notifications', 'syncRecords']) await db.deleteMany(col, { clientId: re });
  for (const col of ['clientWorkoutPlans', 'clientNutritionPlans', 'users']) await db.deleteMany(col, { _id: re });
  await db.deleteMany('coachFoods', { coachId: COACH, id: 'cat-ff_banana' });
  await db.deleteMany('coachWorkoutTemplates', { coachId: COACH, name: { $regex: '^E2E-B43' } });
  await db.deleteMany('coachFavorites', { coachId: COACH });
}
const workout = (db: Db) => db.findOne<{ days: { exerciseIds: string[] }[]; exercises: Record<string, Item> }>('clientWorkoutPlans', { _id: CLIENT.id });
const nutrition = (db: Db) => db.findOne<{ meals: { items: Item[] }[] }>('clientNutritionPlans', { _id: CLIENT.id });

test.describe('B4.3 one shared library', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.beforeAll(async ({ db }) => {
    await removeFixtures(db);
    await insertFixtures();
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('a Forma exercise goes from the Library straight into a client\'s plan — a snapshot with its catalog link; nothing is added to the coach\'s own library', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const own = await db.count('coachExercises', { coachId: COACH });
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/library?tab=exercises');
    await ready(page);
    await page.getByTestId('lib-exercises-search').fill('بنش مستوي');
    const bench = page.locator('[data-testid="library-exercise-row"][data-id="fx_barbell_bench_press"]');
    await expect(bench).toBeVisible({ timeout: 15_000 });
    await bench.getByTestId('library-row-main').click();
    await expect(page.getByTestId('catalog-exercise-view')).toBeVisible();
    await page.getByTestId('exercise-use').click();
    await page.getByTestId('use-client-search').fill('Laila');
    await page.getByTestId('use-client-client').filter({ hasText: CLIENT.name }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${CLIENT.id}/workout$`));
    const prompt = page.getByTestId('library-add');
    await expect(page.getByText('Add “Barbell bench press”')).toBeVisible();
    await prompt.getByTestId('library-add-target').filter({ hasText: 'Day A' }).click();
    await expect(page.getByTestId('workout-unsaved')).toBeVisible();
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('workout-saved')).toBeVisible({ timeout: 15_000 });
    const plan = (await workout(db))!;
    const copy = Object.values(plan.exercises).find((e) => e.catalogId === 'fx_barbell_bench_press') as Item & { names: { ar: string }; instructions: { ar: { steps: string[] } }; mediaCredits: unknown[] };
    expect(copy, 'the snapshot is in the plan').toBeTruthy();
    expect(copy.names.ar).toBe('ضغط البار على البنش المستوي');
    expect(copy.instructions.ar.steps.length).toBeGreaterThan(1);
    expect(copy.mediaCredits.length).toBeGreaterThan(0);
    expect(copy.libraryExerciseId).toBeUndefined(); // a snapshot, not linked to a coach library row
    expect(plan.days[0].exerciseIds).toEqual(['ex-seed', copy.id]);
    expect(await db.count('coachExercises', { coachId: COACH })).toBe(own);
    await shot(page, testInfo, 'forma-exercise-in-plan-1440');
  });

  test('a Forma food goes from the Library into a meal at its first serving, with its source and its picture', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const own = await db.count('coachFoods', { coachId: COACH });
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/library?tab=foods');
    await ready(page);
    await page.getByTestId('lib-foods-search').fill('بيض مسلوق');
    const egg = page.locator('[data-testid="library-food-row"][data-id="ff_egg_boiled"]');
    await expect(egg).toBeVisible({ timeout: 15_000 });
    await expect(egg.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');
    await expect.poll(() => loaded(page, '[data-testid="library-food-row"][data-id="ff_egg_boiled"] img')).toBe(true);
    await egg.getByTestId('library-row-main').click();
    const view = page.getByTestId('food-shared-view');
    await expect(view.getByTestId('food-shared-per100')).toBeVisible();
    await expect(view.getByTestId('food-shared-image')).toBeVisible();
    expect(await axe(page, '[data-testid="food-shared-view"]')).toEqual([]);
    await page.getByTestId('food-use').click();
    await page.getByTestId('use-client-client').filter({ hasText: CLIENT.name }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${CLIENT.id}/nutrition$`));
    await page.getByTestId('library-add').getByTestId('library-add-target').filter({ hasText: 'Breakfast' }).click();
    await expect(page.getByTestId('nutrition-unsaved')).toBeVisible();
    await expect(page.getByTestId('nutrition-food-row').first().getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');
    await page.getByTestId('nutrition-save').click();
    await expect(page.getByTestId('nutrition-saved')).toBeVisible({ timeout: 15_000 });
    const item = (await nutrition(db))!.meals[0].items[0];
    expect(item).toMatchObject({ name: { en: 'Egg, hard-boiled', ar: 'بيض مسلوق' }, catalogId: 'ff_egg_boiled', portion: { id: 'large', amount: 1, grams: 50 }, source: { provider: 'forma-catalog' }, image: { source: 'forma-catalog', catalogFoodId: 'ff_egg_boiled' } });
    expect(await db.count('coachFoods', { coachId: COACH })).toBe(own);
  });

  test('a template is built from Forma exercises in the builder\'s picker — no library copy needed', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const own = await db.count('coachExercises', { coachId: COACH });
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/templates/new');
    await ready(page);
    await page.getByTestId('template-name').fill('E2E-B43 Forma template');
    await page.getByTestId('builder-add-day').click();
    await page.getByTestId('builder-add-section').click();
    await page.getByTestId('section-title').fill('Main');
    await page.getByTestId('builder-add-exercise').click();
    const picker = page.getByTestId('exercise-picker');
    await page.getByTestId('picker-library-search').fill('squat');
    for (const id of ['fx_barbell_back_squat', 'fx_goblet_squat']) await picker.locator(`[data-testid="library-exercise-row"][data-id="${id}"]`).getByTestId('library-row-main').click();
    await expect(page.getByTestId('picker-selected-count')).toContainText('2');
    await page.getByTestId('picker-add-selected').click();
    await expect(page.getByTestId('builder-section')).toContainText('Barbell back squat');
    await page.getByTestId('template-save').click();
    await expect(page.getByTestId('template-preview')).toBeVisible();
    const tpl = await db.findOne<{ exercises: Record<string, Item> }>('coachWorkoutTemplates', { coachId: COACH, name: 'E2E-B43 Forma template' });
    expect(Object.values(tpl!.exercises).map((e) => e.catalogId).sort()).toEqual(['fx_barbell_back_squat', 'fx_goblet_squat']);
    expect(await db.count('coachExercises', { coachId: COACH })).toBe(own);
  });

  test('a customised Forma food: the coach\'s name and picture (Forma\'s picture can be restored), listed once as theirs, used in a plan; Reset brings Forma\'s back', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/library?tab=foods');
    await ready(page);
    await page.getByTestId('lib-foods-search').fill('banana');
    const forma = page.locator('[data-testid="library-food-row"][data-id="ff_banana"]');
    await forma.getByTestId('library-row-main').click();
    await page.getByTestId('food-customize').click();
    await expect(page.getByTestId('lf-name')).toHaveValue('Banana');
    await expect(page.getByTestId('lf-image')).toHaveAttribute('data-source', 'forma-catalog');
    await page.getByTestId('lf-image-remove').click();
    await expect(page.getByTestId('lf-image')).toHaveAttribute('data-source', 'none');
    await page.getByTestId('lf-image-use-forma').click(); // restore Forma's picture
    await expect(page.getByTestId('lf-image')).toHaveAttribute('data-source', 'forma-catalog');
    await page.getByTestId('lf-name').fill('Banana (pre-workout)');
    await page.getByTestId('lf-save').click();
    await expect.poll(async () => (await db.findOne<Item>('coachFoods', { coachId: COACH, id: 'cat-ff_banana' }))?.catalogId ?? null, { timeout: 15_000 }).toBe('ff_banana');
    const mine = page.locator('[data-testid="library-food-row"][data-id="cat-ff_banana"]');
    await expect(mine).toContainText('Banana (pre-workout)');
    await expect(mine.getByTestId('library-badge-customized')).toBeVisible();
    await expect(mine.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');
    await expect(forma).toHaveCount(0);
    await shot(page, testInfo, 'customised-food-1440');

    // Used in the nutrition editor from the food sheet: the coach's version.
    await page.goto(`/coach/client/${CLIENT.id}/nutrition`);
    await ready(page);
    await page.getByTestId('nutrition-add-food').first().click();
    await page.getByTestId('food-library-search').fill('banana');
    await page.locator('[data-testid="library-food-row"][data-id="cat-ff_banana"]').getByTestId('library-row-main').click();
    await expect(page.getByTestId('food-name')).toHaveValue('Banana (pre-workout)');
    await expect(page.getByTestId('food-image')).toHaveAttribute('data-source', 'forma-catalog');
    await page.getByTestId('food-save').click();
    await page.getByTestId('nutrition-save').click();
    await expect.poll(async () => (await nutrition(db))?.meals[0].items.some((i) => i.name.en === 'Banana (pre-workout)') ?? false, { timeout: 15_000 }).toBe(true);

    // Reset: Forma's banana is back in the list; the plan keeps its copy.
    await page.goto('/coach/library?tab=foods&q=banana');
    await ready(page);
    await mine.getByTestId('library-row-main').click();
    await page.getByTestId('food-reset').click();
    await page.getByTestId('confirm-accept').click();
    await expect(forma).toBeVisible({ timeout: 15_000 });
    expect(await db.count('coachFoods', { coachId: COACH, id: 'cat-ff_banana' })).toBe(0);
    expect((await nutrition(db))!.meals[0].items.some((i) => i.name.en === 'Banana (pre-workout)')).toBe(true);
  });

  test('favourites narrow the plan editors\' lists (a starred Forma exercise is one tap away)', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/library?tab=exercises&q=goblet');
    await ready(page);
    await page.locator('[data-testid="library-exercise-row"][data-id="fx_goblet_squat"]').getByTestId('library-favorite').click();
    await expect.poll(() => db.count('coachFavorites', { coachId: COACH, refId: 'fx_goblet_squat' })).toBe(1);
    await page.goto(`/coach/client/${CLIENT.id}/workout`);
    await ready(page);
    await page.getByTestId('builder-add-exercise').first().click();
    await page.getByTestId('picker-library-scope-favorites').click();
    const rows = page.getByTestId('exercise-picker').getByTestId('library-exercise-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-id', 'fx_goblet_squat');
  });

  test('client (phone, Arabic): the handed-over exercise and food read in Arabic, the food with its picture; no overflow', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const exId = Object.values((await workout(db))!.exercises).find((e) => e.catalogId === 'fx_barbell_bench_press')!.id;
    const { page } = await as({ id: CLIENT.id, label: 'b43Client' }, phone);
    await page.goto('/settings?tab=preferences');
    await ready(page);
    await page.getByRole('button', { name: 'ع', exact: true }).click();
    await waitForLocaleSaved(page, 'ar');
    await page.goto(`/workout/exercise/${exId}`);
    await ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ضغط البار على البنش المستوي', { timeout: 20_000 });
    await expect(page.getByTestId('exercise-instructions')).toBeVisible();
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    await page.goto('/nutrition');
    await ready(page);
    const egg = page.getByTestId('client-food-row').filter({ hasText: 'بيض مسلوق' });
    await expect(egg).toBeVisible({ timeout: 20_000 });
    await expect(egg.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');
    await expect.poll(() => loaded(page, '[data-testid="client-food-row"] img')).toBe(true);
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    await shot(page, testInfo, 'client-ar-390', true);
  });
});
