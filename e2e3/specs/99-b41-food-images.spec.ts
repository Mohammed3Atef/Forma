import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany, waitForLocaleSaved } from './_c-helpers';
import { bearerOf, mediaFetch, png, putsSince } from './_d-helpers';
import { trpcMutation } from './_a-helpers';

/**
 * B4.1 Slice 3 checkpoint — food pictures in a real browser (isolated stack; the catalog's public
 * media zone and the coach upload zone are both local stand-ins):
 *  - canonical: a catalog food shows its approved picture (row, serving card with credit); the plan
 *    stores a COPY on the catalog CDN;
 *  - coach upload: a library food gets the coach's own photo (their `foods` folder, no metadata);
 *    used in a plan; replaced (a new file — the plan keeps the earlier one); removed;
 *  - ownership: another coach cannot use or change it, a client's private photo is refused, a client
 *    cannot upload food photos;
 *  - the client (phone, Arabic) sees the plan's pictures with Arabic alt text; a broken picture
 *    falls back to the placeholder.
 * Fixtures use `e2e-b41-` ids (plus the one library food) and are removed in afterAll.
 */
const COACH = 'e2e-coach-pro';
const PFX = 'e2e-b41-';
const DAY = 86_400_000;
const CLIENT = { id: `${PFX}client`, name: 'Mona Adel' };
const FOOD = 'E2E B41 Mahshi (home)';
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });
const EXIF_JPG = fs.readFileSync('api/media/_lib/__fixtures__/exif.jpg');

async function visual(page: Page, name: string, fullPage = false) {
  const dir = path.join('e2e-out', process.env.E2E_RUN_ID ?? 'local', 'b41-visual');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function axe(page: Page, selector: string) {
  const r = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
/** The picture really loaded (not just an <img> pointing somewhere). */
const loaded = (page: Page, selector: string) => page.locator(selector).first().evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0);

type Img = { source: string; url: string; thumbUrl: string; catalogFoodId?: string; rev: number; alt?: { en: string; ar: string } };
type PlanDoc = { updatedAt: number; meals: { id: string; items: { id: string; name: { en: string }; image?: Img }[] }[] };
type FoodDoc = { id: string; image?: Img };

async function insertFixtures() {
  const now = Date.now();
  await insertMany('users', [{ _id: CLIENT.id, email: `${CLIENT.id}@e2e.test`, emailLower: `${CLIENT.id}@e2e.test`, displayName: CLIENT.name, displayNameLower: CLIENT.name.toLowerCase(), role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: '+201240088888', passwordHash: 'not-a-login', createdBy: 'e2e-b41', createdAt: now - 60 * DAY, updatedAt: now }]);
  await insertMany('coachClients', [{ _id: `${COACH}__${CLIENT.id}`, coachId: COACH, clientId: CLIENT.id, status: 'active', createdBy: COACH, createdAt: now - 30 * DAY, updatedAt: now, subscription: { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } }]);
  await insertMany('clientProfiles', [{ _id: CLIENT.id, clientId: CLIENT.id, updatedAt: now, profile: { id: CLIENT.id, name: CLIENT.name, age: 31, weightKg: 70, heightCm: 168, goal: 'fat_loss', activityLevel: 'moderate', locale: 'en', createdAt: now - 10 * DAY, updatedAt: now - 10 * DAY }, assessment: { status: 'reviewed', completed: true, submittedAt: now - 20 * DAY, basic: { fullName: CLIENT.name } } }]);
  await insertMany('clientNutritionPlans', [
    { _id: CLIENT.id, clientId: CLIENT.id, id: `mp-${CLIENT.id}`, name: 'Lean', meals: [{ id: 'm-lunch', slot: 'lunch', label: { en: 'Lunch', ar: 'غداء' }, items: [] }], targets: { calories: 2000, protein: 140, carbs: 200, fats: 65 }, supplements: [], waterTargetMl: 2500, beverageNotes: [], generalNotes: [], updatedAt: now - 5 * DAY },
  ]);
}
async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  for (const col of ['coachClients', 'clientProfiles', 'planVersions', 'notifications', 'syncRecords']) await db.deleteMany(col, { clientId: re });
  for (const col of ['clientNutritionPlans', 'users']) await db.deleteMany(col, { _id: re });
  await db.deleteMany('coachFoods', { coachId: COACH, 'name.en': FOOD });
  await db.deleteMany('coachFoods', { coachId: 'e2e-coach-b', id: re });
}
const plan = (db: Db) => db.findOne<PlanDoc>('clientNutritionPlans', { _id: CLIENT.id });
const libFood = (db: Db) => db.findOne<FoodDoc>('coachFoods', { coachId: COACH, 'name.en': FOOD });

test.describe('B4.1 food pictures', () => {
  test.describe.configure({ mode: 'serial' });
  /** The coach's first upload (kept for the replacement, history and ownership checks). */
  let first: Img;

  test.beforeAll(async ({ db }) => {
    await removeFixtures(db);
    await insertFixtures();
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('canonical: a catalog food shows its approved picture with its credit; the plan keeps a copy on the catalog CDN', async ({ as, db, env, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const catalogMedia = env.catalogMedia;
    expect(catalogMedia, 'the e2e stack sets FORMA_CATALOG_MEDIA_URL to the stand-in').toBeTruthy();
    expect(fs.existsSync('e2e-out/.cache/catalog/food-images/out/ff_koshary'), 'food pictures are built locally (node scripts/catalog/build-food-images.mjs)').toBe(true);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/client/${CLIENT.id}/nutrition`);
    await ready(page);
    await page.getByTestId('nutrition-add-food').first().click();
    await page.getByTestId('food-catalog-search').fill('كشري');
    const row = page.locator('[data-testid="catalog-food-row"][data-id="ff_koshary"]');
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');
    await expect.poll(() => loaded(page, '[data-testid="catalog-food-row"][data-id="ff_koshary"] img')).toBe(true);
    await row.click();
    const card = page.getByTestId('food-catalog-image');
    await expect(card).toContainText('Dina Said');
    await expect.poll(() => loaded(page, '[data-testid="food-catalog-image"] img')).toBe(true);
    expect(await axe(page, '[data-testid="food-catalog-serving"]')).toEqual([]);
    await visual(page, 'serving-card-en-1440');
    await page.getByTestId('food-catalog-use').click();
    await expect(page.getByTestId('food-image')).toHaveAttribute('data-source', 'forma-catalog');
    await expect(page.getByTestId('food-image-credit')).toContainText('Dina Said');
    await page.getByTestId('food-save').click();
    await expect(page.getByTestId('nutrition-food-row').first().getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');
    await page.getByTestId('nutrition-save').click();
    await expect.poll(async () => (await plan(db))?.meals[0].items[0]?.image?.source ?? null, { timeout: 15_000 }).toBe('forma-catalog');
    const img = (await plan(db))!.meals[0].items[0].image!;
    expect(img.catalogFoodId).toBe('ff_koshary');
    expect(img.url.startsWith(`${catalogMedia}/catalog/foods/ff_koshary/`)).toBe(true);
    expect(img.thumbUrl.startsWith(`${catalogMedia}/catalog/foods/ff_koshary/`)).toBe(true);
    await shot(page, testInfo, 'plan-with-catalog-picture-1440');
  });

  test('coach upload: a library food gets the coach’s own photo — their foods folder, no metadata; used in a plan; replaced (the plan keeps the earlier file); removed', async ({ as, db, env, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    const folder = `${env.bunny.cdn}/Forma/${COACH}/foods/`;
    const before = (await db.bunnyPuts()).length; // `putsSince` takes a put-log index

    // 1) New library food with a photo straight from a camera (EXIF: GPS, camera, author).
    await page.goto('/coach/library?tab=foods');
    await ready(page);
    await page.getByTestId('food-new').click();
    await page.getByTestId('lf-name').fill(FOOD);
    await page.getByTestId('lf-image-file').setInputFiles({ name: 'mahshi.jpg', mimeType: 'image/jpeg', buffer: EXIF_JPG });
    await expect(page.getByTestId('lf-image-preview')).toHaveAttribute('src', new RegExp(`^${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), { timeout: 20_000 });
    await expect(page.getByTestId('lf-image-progress')).toHaveCount(0);
    expect(await axe(page, '[data-testid="food-lib-form"]')).toEqual([]);
    await visual(page, 'library-form-with-photo-1440');
    await page.getByTestId('lf-save').click();
    await expect.poll(async () => (await libFood(db))?.image?.source ?? null, { timeout: 15_000 }).toBe('upload');
    first = (await libFood(db))!.image!;
    expect(first.url.startsWith(folder) && first.thumbUrl.startsWith(folder)).toBe(true);
    expect(first.rev).toBe(1);
    const puts = (await putsSince(db, before)).filter((p) => p.path.startsWith(`Forma/${COACH}/foods/`));
    expect(puts.length, 'the photo and its thumbnail').toBe(2);
    for (const u of [first.url, first.thumbUrl]) {
      const bytes = Buffer.from(await (await fetch(u)).arrayBuffer());
      expect(bytes.length).toBeGreaterThan(100);
      expect(bytes.includes(Buffer.from('Exif')), 'no EXIF block').toBe(false);
      expect(bytes.includes(Buffer.from('Private Person')) || bytes.includes(Buffer.from('Forma test fixture')), 'no author / description').toBe(false);
    }
    await expect(page.getByTestId('coach-desktop-foods').getByTestId('data-row').filter({ hasText: FOOD }).getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');

    // 2) Used in the client's plan: the item carries the same picture (a copy).
    await page.goto(`/coach/client/${CLIENT.id}/nutrition`);
    await ready(page);
    await page.getByTestId('nutrition-add-food').first().click();
    await page.getByTestId('food-lib-option').filter({ hasText: FOOD }).click();
    await expect(page.getByTestId('food-image')).toHaveAttribute('data-source', 'upload');
    await page.getByTestId('food-save').click();
    await page.getByTestId('nutrition-save').click();
    await expect.poll(async () => (await plan(db))?.meals[0].items.find((i) => i.name.en === FOOD)?.image?.url ?? null, { timeout: 15_000 }).toBe(first.url);

    // 3) Replace the library photo: a new file (next revision); the plan keeps the one it was saved with.
    await page.goto('/coach/library?tab=foods');
    await ready(page);
    await page.getByTestId('coach-desktop-foods').getByTestId('data-row').filter({ hasText: FOOD }).getByTestId('row-open').click();
    await expect(page.getByTestId('food-view-image')).toBeVisible();
    await page.getByTestId('food-view-edit').click();
    await page.getByTestId('lf-image-file').setInputFiles({ name: 'mahshi-2.png', mimeType: 'image/png', buffer: png(320, 240) });
    await expect.poll(async () => page.getByTestId('lf-image-preview').getAttribute('src'), { timeout: 20_000 }).not.toBe(first.thumbUrl);
    await expect(page.getByTestId('lf-image-progress')).toHaveCount(0);
    await page.getByTestId('lf-save').click();
    await expect.poll(async () => (await libFood(db))?.image?.rev ?? 0, { timeout: 15_000 }).toBe(2);
    const second = (await libFood(db))!.image!;
    expect(second.url).not.toBe(first.url);
    expect(second.url.startsWith(folder)).toBe(true);
    expect((await plan(db))!.meals[0].items.find((i) => i.name.en === FOOD)!.image!.url, 'the plan keeps its picture').toBe(first.url);
    expect((await fetch(first.url)).status, 'the earlier file still exists for the plans that show it').toBe(200);

    // 4) Remove the library photo: the row falls back to the placeholder.
    await page.getByTestId('coach-desktop-foods').getByTestId('data-row').filter({ hasText: FOOD }).getByTestId('row-open').click();
    await page.getByTestId('food-view-edit').click();
    await page.getByTestId('lf-image-remove').click();
    await expect(page.getByTestId('lf-image')).toHaveAttribute('data-source', 'none');
    await page.getByTestId('lf-save').click();
    await expect.poll(async () => (await libFood(db))?.image ?? null, { timeout: 15_000 }).toBeNull();
    await expect(page.getByTestId('coach-desktop-foods').getByTestId('data-row').filter({ hasText: FOOD }).getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'false');
    await shot(page, testInfo, 'library-after-remove-1440');
  });

  test('a photo that is not usable is stopped with a reason; nothing is uploaded', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    const before = (await db.bunnyPuts()).length;
    await page.goto('/coach/library?tab=foods');
    await ready(page);
    await page.getByTestId('food-new').click();
    await page.getByTestId('lf-image-file').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: fs.readFileSync('api/media/_lib/__fixtures__/small.png') });
    await expect(page.getByTestId('lf-image-error')).toContainText('too small');
    await page.getByTestId('lf-image-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') });
    await expect(page.getByTestId('lf-image-error')).toContainText("isn't a photo");
    expect((await putsSince(db, before)).filter((p) => p.path.includes('/foods/'))).toEqual([]);
  });

  test('ownership: another coach can neither use nor change this coach’s photo; a client’s private photo is refused; a client cannot upload food photos', async ({ as, db, env }) => {
    const b = await as('coachB', sized(1280));
    const bBearer = await bearerOf(b.page, () => b.page.goto('/coach/dashboard'));
    const token = bBearer.replace(/^Bearer /, '');
    // Coach B saves a food pointing at Coach A's (coachPro's) upload → refused.
    const steal = await trpcMutation(env.baseURL, 'coachAssets.foods.save', { id: `${PFX}steal`, name: { en: 'Stolen', ar: '' }, quantity: '', protein: 0, carbs: 0, fats: 0, calories: 0, image: { source: 'upload', url: first.url, thumbUrl: first.thumbUrl, rev: 1, uploadedAt: Date.now() } }, token);
    expect(steal.status).toBe(400);
    expect(JSON.stringify(steal.body)).toContain('your own uploads');
    expect(await db.count('coachFoods', { coachId: 'e2e-coach-b', id: `${PFX}steal` })).toBe(0);
    // Coach B cannot change Coach A's library food (scoped to the caller: not found).
    const food = (await libFood(db))!;
    const change = await trpcMutation(env.baseURL, 'coachAssets.foods.update', { id: food.id, image: null }, token);
    expect(change.status).toBe(404);

    // Coach A cannot put the client's private progress photo on a plan item.
    const a = await as('coachPro', sized(1280));
    const aToken = (await bearerOf(a.page, () => a.page.goto('/coach/dashboard'))).replace(/^Bearer /, '');
    const current = (await plan(db))!;
    const progress = `${env.bunny.cdn}/Forma/${CLIENT.id}/progress-front.jpg`;
    const meals = current.meals.map((m, i) => (i === 0 ? { ...m, items: m.items.map((it, j) => (j === 0 ? { ...it, image: { source: 'upload', url: progress, thumbUrl: progress, rev: 1, uploadedAt: Date.now() } } : it)) } : m));
    const leak = await trpcMutation(env.baseURL, 'nutritionPlan.save', { clientId: CLIENT.id, name: 'Lean', meals, targets: { calories: 2000, protein: 140, carbs: 200, fats: 65 }, supplements: [], baseUpdatedAt: current.updatedAt }, aToken);
    expect(leak.status).toBe(400);
    expect(JSON.stringify(leak.body)).toContain('your own uploads');
    expect((await plan(db))!.updatedAt, 'nothing was written').toBe(current.updatedAt);

    // A client cannot upload into a food folder.
    const c = await as('clientA', phone);
    const cBearer = await bearerOf(c.page, () => c.page.goto('/'));
    const up = await mediaFetch(c.page, 'upload', { query: { category: 'food' }, body: [...png(96, 96)], contentType: 'image/png', bearer: cBearer });
    expect(up.status).toBe(403);
  });

  test('client (phone, Arabic): the plan’s pictures with Arabic alt text; a broken picture falls back to the placeholder; no overflow', async ({ as, db, env, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    // A plan item whose file is gone (deleted from storage) — written directly, as an old plan would hold it.
    const missing = `${env.bunny.cdn}/Forma/${COACH}/foods/gone-r1.webp`;
    await db.updateOne('clientNutritionPlans', { _id: CLIENT.id }, { $push: { 'meals.0.items': { id: `${PFX}gone`, name: { en: 'Grilled fish', ar: 'سمك مشوي' }, quantity: '150 g', protein: 30, carbs: 0, fats: 6, calories: 180, image: { source: 'upload', url: missing, thumbUrl: missing, rev: 1, uploadedAt: Date.now() } } } });
    const { page } = await as({ id: CLIENT.id, label: 'b41Client' }, phone);
    await page.goto('/settings?tab=preferences');
    await ready(page);
    await page.getByRole('button', { name: 'ع', exact: true }).click();
    await waitForLocaleSaved(page, 'ar');
    await page.goto('/nutrition');
    await ready(page);
    const koshary = page.getByTestId('client-food-row').filter({ hasText: 'كشري' });
    await expect(koshary).toBeVisible({ timeout: 20_000 });
    await expect(koshary.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'true');
    await expect(koshary.locator('img')).toHaveAttribute('alt', /كشري/);
    await expect.poll(() => loaded(page, '[data-testid="client-food-row"] img')).toBe(true);
    const gone = page.getByTestId('client-food-row').filter({ hasText: 'سمك مشوي' });
    await expect(gone.getByTestId('food-thumb')).toHaveAttribute('data-has-image', 'false', { timeout: 10_000 });
    await expect(gone.locator('img')).toHaveCount(0);
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    expect(await axe(page, '[data-testid="nutrition-meals"]')).toEqual([]);
    await shot(page, testInfo, 'client-nutrition-pictures-ar-390', true);
    await visual(page, 'client-nutrition-pictures-ar-390', true);
  });
});
