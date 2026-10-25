import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany, waitForLocaleSaved } from './_c-helpers';
import { putsSince } from './_d-helpers';

/**
 * B4.2 — the ExerciseDB layer in a real browser (isolated stack; the catalog is on outside production):
 *  - the coach finds an ExerciseDB exercise by its Egyptian alias, the row shows the app's light still,
 *    the preview loads the GIF only when opened and credits AscendAPI; results page with "Show more";
 *  - added to a plan, the copy keeps the GIF, the list still, the credit and the original (restorable);
 *  - the client (phone, Arabic) sees the demonstration and the English-only steps, labelled;
 *  - the Library copy is customised: picture removed, original restored, own picture uploaded (cleaned,
 *    in the coach's own folder), own Arabic steps;
 *  - a curated exercise with no demonstration still says so honestly.
 * Fixtures use `e2e-b42-` ids and are removed in afterAll (with the one Library copy).
 */
const COACH = 'e2e-coach-pro';
const PFX = 'e2e-b42-';
const DAY = 86_400_000;
const CLIENT = { id: `${PFX}client`, name: 'Omar Fathy' };
const EDB_ID = 'edb_YAk5dIw'; // Reverse-grip pull-up (ExerciseDB) — Egyptian alias "عقلة عكسي"
const GIF = 'https://static.exercisedb.dev/media/YAk5dIw.gif';
const STILL = '/catalog/edb/YAk5dIw.webp';
const COPY_ID = `cat-${EDB_ID}`;
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });
const EXIF_JPG = fs.readFileSync('api/media/_lib/__fixtures__/exif.jpg');
const base = { warmupSets: '1', warmupSetCount: 1, workingSets: 3, repRange: '8-12', rir: '', tempo: '', restSec: 90, videoId: null, notes: { en: '', ar: '' } };

async function visual(page: Page, name: string, fullPage = false) {
  const dir = path.join('e2e-out', process.env.E2E_RUN_ID ?? 'local', 'b42-visual');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const loaded = (page: Page, selector: string) => page.locator(selector).first().evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0);
async function axe(page: Page, selector: string) {
  const r = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

type Ex = Record<string, unknown> & { id: string; catalogId?: string; imageUrl?: string | null; images?: string[]; thumbUrl?: string | null; sourceMedia?: Record<string, unknown>; mediaCredits?: { license: string }[]; instructions?: { en: { steps: string[] }; ar: { steps: string[] } | null } };

async function insertFixtures() {
  const now = Date.now();
  await insertMany('users', [{ _id: CLIENT.id, email: `${CLIENT.id}@e2e.test`, emailLower: `${CLIENT.id}@e2e.test`, displayName: CLIENT.name, displayNameLower: CLIENT.name.toLowerCase(), role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: '+201240077777', passwordHash: 'not-a-login', createdBy: 'e2e-b42', createdAt: now - 60 * DAY, updatedAt: now }]);
  await insertMany('coachClients', [{ _id: `${COACH}__${CLIENT.id}`, coachId: COACH, clientId: CLIENT.id, status: 'active', createdBy: COACH, createdAt: now - 30 * DAY, updatedAt: now, subscription: { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } }]);
  await insertMany('clientProfiles', [{ _id: CLIENT.id, clientId: CLIENT.id, updatedAt: now, profile: { id: CLIENT.id, name: CLIENT.name, age: 27, weightKg: 78, heightCm: 176, goal: 'muscle_gain', activityLevel: 'moderate', locale: 'en', createdAt: now - 10 * DAY, updatedAt: now - 10 * DAY }, assessment: { status: 'reviewed', completed: true, submittedAt: now - 20 * DAY, basic: { fullName: CLIENT.name } } }]);
  await insertMany('clientWorkoutPlans', [{ _id: CLIENT.id, clientId: CLIENT.id, id: `wp-${CLIENT.id}`, name: 'Pull base', days: [{ id: 'd-pull', dayIndex: 0, title: 'Pull', focus: '', exerciseIds: ['ex-seed'] }], exercises: { 'ex-seed': { id: 'ex-seed', name: 'Warm-up row', targetMuscle: 'Back', ...base } }, updatedAt: now - 5 * DAY }]);
}
async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  for (const col of ['coachClients', 'clientProfiles', 'planVersions', 'notifications', 'syncRecords']) await db.deleteMany(col, { clientId: re });
  for (const col of ['clientWorkoutPlans', 'users']) await db.deleteMany(col, { _id: re });
  await db.deleteMany('coachExercises', { coachId: COACH, id: COPY_ID });
}
const libCopy = (db: Db) => db.findOne<Ex>('coachExercises', { coachId: COACH, id: COPY_ID });

test.describe('B4.2 ExerciseDB catalog', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async ({ db }) => {
    await removeFixtures(db);
    await insertFixtures();
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('coach: an ExerciseDB exercise found by its Egyptian alias — light still in the list, the GIF only when opened, credited; added to the plan as a full copy', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/client/${CLIENT.id}/workout`);
    await ready(page);
    await page.getByTestId('builder-add-exercise').click();
    const gifRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith('https://static.exercisedb.dev/')) gifRequests.push(r.url());
    });
    await page.getByTestId('picker-library-search').fill('عقلة عكسي');
    const row = page.locator(`[data-testid="library-exercise-row"][data-id="${EDB_ID}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator('img')).toHaveAttribute('src', STILL);
    await expect.poll(() => loaded(page, `[data-testid="library-exercise-row"][data-id="${EDB_ID}"] img`)).toBe(true);
    expect(gifRequests, 'no GIF is downloaded for a results list').toEqual([]);
    await row.getByTestId('library-row-preview').click();
    const view = page.getByTestId('catalog-exercise-view');
    await expect(view.getByTestId('catalog-gif').locator('img')).toHaveAttribute('src', GIF);
    await expect(view.getByTestId('credit-exercisedb')).toContainText('AscendAPI');
    await expect(view.getByTestId('catalog-text-credit')).toContainText('ExerciseDB');
    expect(await axe(page, '[data-testid="catalog-exercise-view"]')).toEqual([]);
    await visual(page, 'edb-preview-en-1440');
    await page.getByTestId('catalog-preview-select').click();
    await page.getByTestId('picker-add-selected').click();
    const added = page.getByTestId('builder-exercise-row').filter({ hasText: 'Reverse-grip pull-up' });
    await expect(added).toBeVisible();
    await expect(added.getByTestId('exercise-thumb')).toHaveAttribute('data-has-image', 'true');
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('workout-saved')).toBeVisible({ timeout: 15_000 });
    const doc = await db.findOne<{ exercises: Record<string, Ex> }>('clientWorkoutPlans', { _id: CLIENT.id });
    const copy = Object.values(doc!.exercises).find((e) => e.catalogId === EDB_ID)!;
    expect(copy).toMatchObject({ imageUrl: GIF, images: [GIF], thumbUrl: STILL, sourceMedia: { imageUrl: GIF, thumbUrl: STILL } });
    expect(copy.mediaCredits?.[0]?.license).toBe('EXERCISEDB');
    expect(copy.instructions?.ar).toBeNull();
    expect(copy.instructions?.en.steps.length).toBeGreaterThan(2);
    await shot(page, testInfo, 'plan-with-edb-exercise-1440');
  });

  test('results come in pages (Show more) — never the whole catalog at once', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto(`/coach/client/${CLIENT.id}/workout`);
    await ready(page);
    await page.getByTestId('builder-add-exercise').click();
    await page.getByTestId('picker-library-search').fill('press');
    await expect(page.getByTestId('library-exercise-row')).toHaveCount(30, { timeout: 15_000 });
    await page.getByTestId('picker-library-show-more').click();
    await expect(page.getByTestId('library-exercise-row')).toHaveCount(60, { timeout: 15_000 });
  });

  test('client (phone, Arabic): the GIF demonstration and the English-only steps, labelled; no overflow', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const doc = await db.findOne<{ exercises: Record<string, Ex> }>('clientWorkoutPlans', { _id: CLIENT.id });
    const exId = Object.values(doc!.exercises).find((e) => e.catalogId === EDB_ID)!.id;
    const { page } = await as({ id: CLIENT.id, label: 'b42Client' }, phone);
    await page.goto('/settings?tab=preferences');
    await ready(page);
    await page.getByRole('button', { name: 'ع', exact: true }).click();
    await waitForLocaleSaved(page, 'ar');
    await page.goto(`/workout/exercise/${exId}`);
    await ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('السحب على العقلة بقبضة معكوسة', { timeout: 20_000 });
    await expect(page.getByTestId('exercise-demo-image')).toHaveAttribute('src', GIF);
    await expect(page.getByTestId('instructions-english-only')).toBeVisible();
    await expect(page.getByTestId('credit-exercisedb')).toBeVisible();
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    expect(await axe(page, '[data-testid="exercise-detail"]')).toEqual([]);
    await shot(page, testInfo, 'client-edb-exercise-ar-390', true);
    await visual(page, 'client-edb-exercise-ar-390', true);
  });

  test('coach Library: customise, remove the picture, restore the original, upload their own (cleaned, own folder), write Arabic steps — the shared catalog never changes', async ({ as, db, env, audit }) => {
    test.setTimeout(180_000);
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/library?tab=exercises');
    await ready(page);
    await page.getByTestId('lib-exercises-search').fill('reverse grip pull up');
    const row = page.locator(`[data-testid="library-exercise-row"][data-id="${EDB_ID}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByTestId('library-row-main').click();
    // "Customise": the coach's own version, saved only when they save it.
    await page.getByTestId('catalog-customize').click();
    await expect(page.getByTestId('exercise-form')).toBeVisible();
    await page.getByTestId('ex-save').click();
    await expect.poll(async () => (await libCopy(db))?.thumbUrl ?? null, { timeout: 15_000 }).toBe(STILL);
    // The version is the coach's own now — listed instead of Forma's, under "My exercises" too.
    await page.getByTestId('lib-exercises-scope-mine').click();
    const edit = async () => {
      await page.getByTestId('exercise-view-edit').click();
      await expect(page.getByTestId('exercise-form')).toBeVisible();
    };
    const reopen = async () => {
      await page.getByTestId('library-exercise-row').and(page.locator(`[data-id="cat-${EDB_ID}"]`)).getByTestId('library-row-main').click();
      await edit();
    };
    await reopen();

    // 1) Remove the picture: the ExerciseDB credit goes with it.
    await page.getByTestId('ex-image-remove').click();
    await page.getByTestId('ex-save').click();
    // Removed = absent (never null — library sync copies these fields into templates).
    await expect.poll(async () => { const d = await libCopy(db); return d ? (d.imageUrl ?? null) : 'no copy'; }, { timeout: 15_000 }).toBeNull();
    expect((await libCopy(db))!.mediaCredits ?? []).toEqual([]);
    expect((await libCopy(db))!.imageUrl).toBeUndefined();

    // 2) Restore the original demonstration.
    await reopen();
    await page.getByTestId('ex-media-restore').click();
    await page.getByTestId('ex-save').click();
    await expect.poll(async () => (await libCopy(db))?.imageUrl ?? null, { timeout: 15_000 }).toBe(GIF);
    expect((await libCopy(db))!).toMatchObject({ thumbUrl: STILL, mediaCredits: [{ license: 'EXERCISEDB' }] });

    // 3) Their own picture: cleaned (no EXIF) and stored in their own exercises folder, with a list still.
    const before = (await db.bunnyPuts()).length;
    await reopen();
    await page.getByTestId('ex-image-file').setInputFiles({ name: 'my-pullup.jpg', mimeType: 'image/jpeg', buffer: EXIF_JPG });
    const folder = `${env.bunny.cdn}/Forma/${COACH}/exercises/`;
    await expect(page.getByTestId('ex-picture').getByTestId('exercise-thumb')).toHaveAttribute('data-has-image', 'true', { timeout: 20_000 });
    // 4) …and their own Arabic steps.
    await page.getByTestId('ex-steps-ar').fill('تعلّق بالعقلة بقبضة معكوسة.\nاسحب جسمك حتى يتجاوز ذقنك العقلة.');
    await page.getByTestId('ex-save').click();
    await expect.poll(async () => (await libCopy(db))?.imageUrl ?? '', { timeout: 15_000 }).toMatch(new RegExp(`^${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    const mine = (await libCopy(db))!;
    expect(mine.thumbUrl?.startsWith(folder)).toBe(true);
    expect(mine.mediaCredits ?? []).toEqual([]);
    expect(mine.sourceMedia).toMatchObject({ imageUrl: GIF }); // the original stays restorable
    expect(mine.instructions?.ar?.steps).toEqual(['تعلّق بالعقلة بقبضة معكوسة.', 'اسحب جسمك حتى يتجاوز ذقنك العقلة.']);
    const puts = (await putsSince(db, before)).filter((p) => p.path.startsWith(`Forma/${COACH}/exercises/`));
    expect(puts.length).toBe(2);
    const stored = Buffer.from(await (await fetch(mine.imageUrl!)).arrayBuffer());
    expect(stored.includes(Buffer.from('Exif')) || stored.includes(Buffer.from('Private Person'))).toBe(false);

    // The shared catalog item is unchanged (opened by its catalog id).
    await page.goto(`/coach/library?tab=exercises&open=${EDB_ID}`);
    await ready(page);
    await expect(page.getByTestId('catalog-exercise-view').getByTestId('catalog-gif').locator('img')).toHaveAttribute('src', GIF, { timeout: 15_000 });
  });

  test('a curated exercise with no demonstration still says so — never another exercise’s GIF', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/library?tab=exercises');
    await ready(page);
    await page.getByTestId('lib-exercises-search').fill('lat pulldown');
    const row = page.locator('[data-testid="library-exercise-row"][data-id="fx_lat_pulldown"]');
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByTestId('library-row-main').click();
    await expect(page.getByTestId('catalog-no-demo')).toBeVisible();
    await expect(page.getByTestId('catalog-gif')).toHaveCount(0);
  });
});
