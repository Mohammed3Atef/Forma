import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page, type Route, type TestInfo } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';
import { confirmYes } from './_b-helpers';
import { procsOf } from './_d-helpers';

/**
 * B3.7 — the coach Library (blueprint §6.6, owner brief 2026-10-20): Programs · Exercises · Foods
 * (swap groups inside) · Supplements; "Use in a client plan" into the client's existing editors as
 * an unsaved change (Journey I); templates read-first (RM-27); a persistent template-sync notice with
 * Retry (TS-04); ⌘K create commands (DT-08); EN / AR / AR-EG, 360–1440, axe.
 * B4.3 — Exercises and Foods are ONE shared library each (Forma's catalog + the coach's own; All ·
 * Favourites · Mine), searched, filtered and paged on the server; no starter import; favourites.
 *
 * Fixtures on coachPro use `e2e-lib-` ids / "E2E-LIB" names and are removed in afterAll; the
 * first-run test signs in a coach it creates (and removes) itself.
 */
const COACH = 'e2e-coach-pro';
const PFX = 'e2e-lib-';
const DAY = 86_400_000;
const CLIENT = { id: `${PFX}client`, name: 'Salma Fathy' };
const NEW_COACH = { id: `${PFX}new-coach`, label: 'newCoach' };
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });
const MUSCLES = ['Chest', 'Back', 'Quads', 'Glutes', 'Shoulders'];
const EQUIPMENT = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight'];

const base = { warmupSets: '1', warmupSetCount: 1, workingSets: 3, repRange: '8-12', rir: '', tempo: '', restSec: 90, videoId: null };
const libExercise = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id: `${PFX}${id}`, coachId: COACH, name, targetMuscle: 'Chest', notes: { en: '', ar: '' }, ...base, createdAt: Date.now() - DAY, updatedAt: Date.now() - DAY, ...extra });
const BENCH = libExercise('bench', 'E2E-LIB Bench press', { equipment: 'Barbell', category: 'Push', workingSets: 4, repRange: '6-8', notes: { en: 'Pause on the chest', ar: 'توقف لحظة على الصدر' }, videoUrl: 'https://cdn.example.test/e2e-lib-bench.mp4', tags: ['strength'] });
const YOGURT = { id: `${PFX}yogurt`, coachId: COACH, name: { en: 'E2E-LIB Greek yogurt', ar: 'زبادي يوناني' }, quantity: '170 g', calories: 100, protein: 17, carbs: 6, fats: 0, category: 'Dairy', createdAt: Date.now(), updatedAt: Date.now() };

function fixtures(baseURL: string) {
  const now = Date.now();
  const demo = [
    libExercise('demo-video', 'E2E-LIB Demo Video', { videoUrl: 'https://cdn.example.test/e2e-lib-demo.mp4' }),
    libExercise('demo-image', 'E2E-LIB Demo Image', { images: [`${baseURL}/icons/apple-touch-icon.png`] }),
    libExercise('demo-none', 'E2E-LIB Demo None'),
    libExercise('demo-drive', 'E2E-LIB Demo Drive', { videoUrl: 'https://drive.google.com/file/d/e2e/view', sourceProvider: 'wger', sourceId: '9' }),
  ];
  const generated = Array.from({ length: 210 }, (_, i) =>
    libExercise(`gen-${String(i).padStart(3, '0')}`, `E2E-LIB Gen ${String(i).padStart(3, '0')}`, {
      targetMuscle: MUSCLES[i % 5],
      equipment: EQUIPMENT[Math.floor(i / 5) % 5],
      ...(i % 7 === 0 ? { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } : {}),
    }),
  );
  const tplExercise = (id: string, name: string) => ({ ...BENCH, id, name, libraryExerciseId: BENCH.id, librarySyncEnabled: true });
  const template = {
    id: `${PFX}tpl`,
    coachId: COACH,
    name: 'E2E-LIB Upper Lower',
    goal: 'strength',
    splitType: 'upper_lower',
    // Seeded shape: flat days, no `sections` — the read view must show their exercises.
    days: [
      { id: `${PFX}td1`, dayIndex: 0, title: 'Upper A', focus: 'Push', exerciseIds: ['te1'] },
      { id: `${PFX}td2`, dayIndex: 1, title: 'Lower A', focus: '', exerciseIds: ['te2'] },
    ],
    exercises: { te1: tplExercise('te1', 'E2E-LIB Bench press'), te2: { id: 'te2', name: 'E2E-LIB Back squat', targetMuscle: 'Quads', notes: { en: '', ar: '' }, ...base } },
    createdAt: now - 5 * DAY,
    updatedAt: now - 5 * DAY,
  };
  return { exercises: [BENCH, ...demo, ...generated], template };
}

const WORKOUT = (now: number) => ({
  _id: CLIENT.id,
  clientId: CLIENT.id,
  id: `wp-${CLIENT.id}`,
  name: 'Strength base',
  days: [
    { id: 'd-upper', dayIndex: 0, title: 'Upper', focus: '', exerciseIds: ['x-row'] },
    { id: 'd-lower', dayIndex: 1, title: 'Lower', focus: '', exerciseIds: ['x-bike'], sections: [{ id: 's-warm', title: 'Warm-up', kind: 'warmup', exerciseIds: ['x-bike'] }, { id: 's-main', title: 'Main', kind: 'working', exerciseIds: [] }] },
  ],
  exercises: {
    'x-row': { id: 'x-row', name: 'Seated row', targetMuscle: 'Back', ...base, notes: { en: '', ar: '' } },
    'x-bike': { id: 'x-bike', name: 'Bike', targetMuscle: '', ...base, notes: { en: '', ar: '' } },
  },
  updatedAt: now - 3 * DAY,
});
const NUTRITION = (now: number) => ({
  _id: CLIENT.id,
  clientId: CLIENT.id,
  id: `np-${CLIENT.id}`,
  name: 'Lean',
  meals: [{ id: 'm-bf', slot: 'breakfast', label: { en: 'Breakfast', ar: 'الفطور' }, items: [{ id: 'f-eggs', name: { en: 'Eggs', ar: 'بيض' }, quantity: '3', calories: 210, protein: 18, carbs: 1, fats: 15 }] }],
  targets: { calories: 2200, protein: 160, carbs: 220, fats: 70 },
  supplements: [],
  waterTargetMl: 3000,
  beverageNotes: [],
  generalNotes: [],
  updatedAt: now - 3 * DAY,
});

async function insertFixtures(baseURL: string) {
  const now = Date.now();
  const f = fixtures(baseURL);
  await insertMany('users', [{ _id: CLIENT.id, email: `${CLIENT.id}@e2e.test`, emailLower: `${CLIENT.id}@e2e.test`, displayName: CLIENT.name, displayNameLower: CLIENT.name.toLowerCase(), role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: '+201240099001', passwordHash: 'not-a-login', createdBy: 'e2e-lib', createdAt: now - 60 * DAY, updatedAt: now }]);
  await insertMany('coachClients', [{ _id: `${COACH}__${CLIENT.id}`, coachId: COACH, clientId: CLIENT.id, status: 'active', createdBy: COACH, createdAt: now - 30 * DAY, updatedAt: now, subscription: { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } }]);
  await insertMany('clientProfiles', [{ _id: CLIENT.id, clientId: CLIENT.id, updatedAt: now, assessment: { status: 'reviewed', completed: true, submittedAt: now - 20 * DAY, basic: { fullName: CLIENT.name } } }]);
  await insertMany('clientWorkoutPlans', [WORKOUT(now)]);
  await insertMany('clientNutritionPlans', [NUTRITION(now)]);
  await insertMany('coachExercises', f.exercises);
  await insertMany('coachFoods', [YOGURT]);
  await insertMany('coachWorkoutTemplates', [f.template]);
}
async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  for (const col of ['coachClients', 'clientProfiles', 'planVersions', 'notifications', 'syncRecords']) await db.deleteMany(col, { clientId: re });
  for (const col of ['clientWorkoutPlans', 'clientNutritionPlans', 'users', 'coachPlans']) await db.deleteMany(col, { _id: re });
  await db.deleteMany('coachFavorites', { coachId: { $in: [COACH, NEW_COACH.id] } });
  for (const col of ['coachExercises', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachWorkoutTemplates']) {
    await db.deleteMany(col, { coachId: NEW_COACH.id });
    await db.deleteMany(col, { coachId: COACH, $or: [{ id: re }, { name: { $regex: '^E2E-LIB' } }] });
  }
}

async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitForLocaleSaved(page, LOCALE_OF[label]); // B3.9.0: <html lang> + the stored settings, instead of a fixed 600 ms
}
async function openLibrary(page: Page, qs = '') {
  await page.goto(`/coach/library${qs}`);
  await ready(page);
  await expect(page.getByTestId('coach-library')).toBeVisible();
}
/** Library › Exercises rows (Forma's and the coach's own, one list). */
const rows = (page: Page) => page.getByTestId('lib-exercises').getByTestId('library-exercise-row');
/** The coach's own rows only. */
const own = (page: Page) => rows(page).and(page.locator('[data-kind="own"]'));
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function axeScan(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
}
/** Screenshots for docs/product-audit/B3_VISUAL_QA.md (§B3.7), with each page's horizontal overflow and direction. */
function visualSink(testInfo: TestInfo) {
  const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b37-visual');
  fs.mkdirSync(outDir, { recursive: true });
  const captured: { file: string; overflow: number; dir: string }[] = [];
  return {
    async capture(page: Page, name: string) {
      await page.waitForTimeout(400);
      const file = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir }));
      captured.push({ file: path.basename(file), ...m });
    },
    async finish(label: string) {
      fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(captured, null, 2));
      await testInfo.attach(`${label}.json`, { body: JSON.stringify({ dir: outDir, captured }, null, 2), contentType: 'application/json' });
      expect(captured.filter((c) => c.overflow > 0), 'no horizontal overflow').toEqual([]);
      for (const c of captured) expect(c.dir, c.file).toBe(/-en(-|\.png$)/.test(c.file) ? 'ltr' : 'rtl');
    },
  };
}

test.describe('B3.7 Library (B4.3: one shared library)', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeAll(async ({ db, env }) => {
    await removeFixtures(db);
    await insertFixtures(env.baseURL);
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('first run (B4.3): a new coach has Forma\'s exercises and foods at once — no starter offer, nothing copied; empty lists offer to create; no clipping or overflow', async ({ as, db, audit }, testInfo) => {
    test.setTimeout(420_000); // five fresh app contexts
    allowDevModuleStorm(audit);
    const now = Date.now();
    await db.insertOne('users', { _id: NEW_COACH.id, email: `${NEW_COACH.id}@e2e.test`, emailLower: `${NEW_COACH.id}@e2e.test`, displayName: 'Nour Coach', displayNameLower: 'nour coach', role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, phone: '+201240099002', currency: 'EGP', passwordHash: 'not-a-login', createdBy: 'e2e-lib', createdAt: now - DAY, updatedAt: now });
    const pro = await db.findOne<Record<string, unknown>>('coachPlans', { _id: COACH });
    await db.insertOne('coachPlans', { ...pro, _id: NEW_COACH.id, activeClientCount: 0, history: [] });

    for (const [w, lang] of [[360, 'en'], [390, 'en'], [390, 'ar'], [1440, 'en']] as const) {
      const { context, page } = await as(NEW_COACH, w < 1024 ? { ...phone, viewport: { width: w, height: 800 } } : sized(w));
      if (lang === 'ar') await setLanguage(page, 'العربية');
      try {
        await openLibrary(page);
        const copy = lang === 'ar' ? ar : en;
        // Programs: nothing yet — the offer is to create, never to import.
        await expect(page.getByTestId('lib-first')).toContainText(copy.library.first.programs.title);
        await expect(page.getByTestId('load-starter-library')).toHaveCount(0);
        await expect(page.getByTestId('lib-more')).toHaveCount(0);
        // The repro: no clipped segment.
        for (const seg of ['programs', 'exercises', 'foods', 'supplements']) {
          const clipped = await page.getByTestId(`lib-tab-${seg}`).evaluate((el) => {
            const label = el.querySelector('span.truncate') as HTMLElement;
            return label.scrollWidth > label.clientWidth + 1;
          });
          expect(clipped, `${seg} label fits (${w} ${lang})`).toBe(false);
        }
        // Exercises: the whole shared library, the search on its own full-width row (CO-23).
        await page.getByTestId('lib-tab-exercises').click();
        await expect(page.getByTestId('library-exercise-row').first()).toBeVisible({ timeout: 20_000 });
        expect(Number((await page.getByTestId('lib-exercises-count').innerText()).replace(/\D/g, ''))).toBeGreaterThanOrEqual(1343);
        const search = await page.getByTestId('lib-exercises-search').boundingBox();
        const content = await page.getByTestId('coach-library').boundingBox();
        expect(search!.width, `search width at ${w}`).toBeGreaterThan(content!.width * 0.9);
        // My exercises: empty, with "New exercise" — not an import.
        await page.getByTestId('lib-exercises-scope-mine').click();
        await expect(page.getByTestId('lib-exercises-empty')).toContainText(copy.library.empty.myExercises);
        await expect(page.getByTestId('lib-new-first')).toBeVisible();
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
        await shot(page, testInfo, `first-run-${w}-${lang}`, true);
      } finally {
        if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
        await context.close();
      }
    }
    for (const c of ['coachExercises', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachWorkoutTemplates', 'coachFavorites']) expect(await db.count(c, { coachId: NEW_COACH.id }), c).toBe(0);
  });

  test('TB-04 / EX-15: 200+ own exercises among Forma\'s — server pages of 30 with Show more, filters by catalog muscle / equipment / demonstration; the view lives in the URL; no overflow 360–1440', async ({ as, audit }, testInfo) => {
    test.setTimeout(480_000); // seven fresh app contexts (360 → 1440) after the desktop checks
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, `?tab=exercises&scope=mine&q=${encodeURIComponent('E2E-LIB Gen')}`);
    await expect(rows(page)).toHaveCount(30);
    await expect(page.getByTestId('lib-exercises-count')).toHaveText('210 exercises');
    await page.getByTestId('lib-exercises-show-more').click();
    await expect(rows(page)).toHaveCount(60);

    await page.getByTestId('lib-exercises-equipment').selectOption('barbell');
    await expect(page).toHaveURL(/equipment=barbell/);
    await expect(page.getByTestId('lib-exercises-count')).toHaveText('45 exercises');
    for (const r of await rows(page).all()) await expect(r).toContainText('Barbell');
    await page.getByTestId('lib-exercises-demo').check();
    await expect(page).toHaveURL(/demo=1/);
    const withDemo = await rows(page).count();
    expect(withDemo).toBeGreaterThan(0);
    await expect(page.getByTestId('library-media-video')).toHaveCount(withDemo); // their demos are YouTube links
    const before = await rows(page).allTextContents();
    await page.reload();
    await ready(page);
    await expect(rows(page)).toHaveCount(withDemo);
    expect(await rows(page).allTextContents()).toEqual(before);
    await expect(page.getByTestId('lib-exercises-demo')).toBeChecked();
    await expect(page.getByTestId('lib-exercises-scope-mine')).toHaveAttribute('aria-checked', 'true');
    await shot(page, testInfo, 'tb04-filtered-1440');

    // No horizontal scroll anywhere from 360 to 1440.
    for (const [w, h] of [[360, 780], [390, 844], [430, 932], [768, 1024], [1024, 800], [1280, 900], [1440, 900]] as const) {
      const ctx = await as('coachPro', w <= 430 ? { ...phone, viewport: { width: w, height: h } } : sized(w, h));
      await openLibrary(ctx.page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Gen')}`);
      await expect(rows(ctx.page)).toHaveCount(30);
      expect(await overflowOf(ctx.page), `overflow at ${w}`).toBeLessThanOrEqual(0);
      await ctx.context.close();
    }
  });

  test('media honesty: own exercises are marked by what Forma can show; a link that cannot play is never offered as a video; the source is credited', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, `?tab=exercises&scope=mine&q=${encodeURIComponent('E2E-LIB Demo')}`);
    await expect(rows(page)).toHaveCount(4);
    const row = (name: string) => rows(page).filter({ hasText: name });
    await expect(row('Demo Video').getByTestId('library-media-video')).toBeVisible();
    await expect(row('Demo Image').getByTestId('library-media-image')).toBeVisible();
    await expect(row('Demo None').getByTestId('library-media-none')).toHaveCount(1);
    await expect(row('Demo Drive').getByTestId('library-media-none')).toHaveCount(1);
    await shot(page, testInfo, 'demo-rows-1440');

    await row('Demo Image').getByTestId('library-row-main').click();
    await expect(page.getByTestId('demo-image-view')).toBeVisible();
    await expect.poll(() => page.getByTestId('demo-image-view').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await row('Demo None').getByTestId('library-row-main').click();
    await expect(page.getByTestId('demo-placeholder')).toContainText('No demo yet');
    await page.keyboard.press('Escape');
    await row('Demo Drive').getByTestId('library-row-main').click();
    await expect(page.getByTestId('video-unsupported')).toBeVisible(); // explained, never a dead player
    await expect(page.getByTestId('exercise-view').locator('video, iframe')).toHaveCount(0);
    await expect(page.getByTestId('exercise-view').getByTestId('attribution')).toContainText('wger.de · CC BY-SA');
    await shot(page, testInfo, 'demo-broken-link-detail');
  });

  test('Journey I (exercise): search → Use in a client plan → the client\'s editor asks where → unsaved until Save → the stored copy is the library\'s, bilingual, linked, nothing duplicated', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, '?tab=exercises');
    await page.getByTestId('lib-exercises-search').fill('E2E-LIB Bench');
    const mine = own(page).filter({ hasText: 'E2E-LIB Bench press' });
    await expect(mine).toHaveCount(1);
    await expect(rows(page).first()).toHaveAttribute('data-kind', 'own'); // the coach's own ranks first among equals
    await mine.getByTestId('library-row-main').click();
    await page.getByTestId('exercise-use').click();
    await page.getByTestId('use-client-search').fill('Salma');
    await page.getByTestId('use-client-client').filter({ hasText: CLIENT.name }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${CLIENT.id}/workout$`)); // the hand-off is consumed
    const prompt = page.getByTestId('library-add');
    await expect(prompt).toBeVisible();
    const targets = prompt.getByTestId('library-add-target');
    await expect(targets).toHaveText([/Upper/, /Lower › Warm-up/, /Lower › Main/]);
    await shot(page, testInfo, 'journey-i-choose-day');
    await targets.filter({ hasText: 'Lower › Main' }).click();
    await expect(page.getByTestId('workout-unsaved')).toBeVisible();
    await expect(page.getByTestId('builder-section').filter({ hasText: 'Main' })).toContainText('E2E-LIB Bench press');
    const stored = () => db.findOne<{ days: { id: string; exerciseIds: string[]; sections?: { id: string; exerciseIds: string[] }[] }[]; exercises: Record<string, Record<string, unknown>> }>('clientWorkoutPlans', { _id: CLIENT.id });
    expect(Object.keys((await stored())!.exercises)).toHaveLength(2); // nothing written yet
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('workout-saved')).toBeVisible();
    const plan = (await stored())!;
    const added = Object.values(plan.exercises).filter((e) => e.libraryExerciseId === BENCH.id);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ name: BENCH.name, notes: BENCH.notes, videoUrl: BENCH.videoUrl, equipment: 'Barbell', workingSets: 4, repRange: '6-8', tags: ['strength'], librarySyncEnabled: true });
    expect(added[0].id).not.toBe(BENCH.id);
    expect(plan.days[1].sections!.find((s) => s.id === 's-main')!.exerciseIds).toEqual([added[0].id]);
    expect(plan.days[1].exerciseIds).toEqual(['x-bike', added[0].id]);
    expect(plan.days[0]).toEqual(WORKOUT(0).days[0]); // the untouched flat day keeps its stored shape
    expect(Object.keys(plan.exercises)).toHaveLength(3);
    // Back returns to the Library as it was left.
    await page.getByTestId('coach-workout-editor').getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/coach\/library\?tab=exercises&q=E2E-LIB/);
    await expect(own(page).filter({ hasText: 'E2E-LIB Bench press' })).toHaveCount(1);
  });

  test('Journey I (food): search → Use in a client plan → meal → Save; the plan item keeps both languages and the library food is unchanged', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, '?tab=foods');
    await page.getByTestId('lib-foods-search').fill('زبادي');
    const yogurt = page.getByTestId('library-food-row').and(page.locator(`[data-id="${YOGURT.id}"]`));
    await expect(yogurt).toHaveCount(1);
    await yogurt.getByTestId('library-row-main').click();
    await expect(page.getByTestId('food-view')).toContainText('170 g');
    await page.getByTestId('food-use').click();
    await page.getByTestId('use-client-client').filter({ hasText: CLIENT.name }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${CLIENT.id}/nutrition$`));
    await page.getByTestId('library-add').getByTestId('library-add-target').filter({ hasText: 'Breakfast' }).click();
    await expect(page.getByTestId('nutrition-unsaved')).toBeVisible();
    await page.getByTestId('nutrition-save').click();
    await expect(page.getByTestId('nutrition-saved')).toBeVisible();
    const plan = await db.findOne<{ meals: { items: Record<string, unknown>[] }[] }>('clientNutritionPlans', { _id: CLIENT.id });
    const items = plan!.meals[0].items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'f-eggs', name: { en: 'Eggs', ar: 'بيض' } });
    expect(items[1]).toMatchObject({ name: YOGURT.name, quantity: '170 g', calories: 100, protein: 17, carbs: 6, fats: 0 });
    expect(items[1].id).not.toBe(YOGURT.id);
    expect(await db.findOne('coachFoods', { coachId: COACH, id: YOGURT.id })).toMatchObject({ name: YOGURT.name });
  });

  test('RM-27 / CO-39: Programs is a Library segment; a program opens read-first with all its exercises; Edit is explicit; Save and Back never loop; old URLs redirect', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/templates');
    await ready(page);
    await expect(page).toHaveURL(/\/coach\/library\?tab=programs$/);
    await expect(page.getByTestId('rail-library')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('template-search').fill('E2E-LIB');
    const programRows = page.getByTestId('coach-desktop-templates').getByTestId('data-row');
    await expect(programRows).toHaveCount(1);
    await programRows.first().getByTestId('row-open').click();
    await expect(page).toHaveURL(`/coach/templates/${PFX}tpl`);
    const view = page.getByTestId('template-preview');
    await expect(view.getByTestId('template-read-day')).toHaveCount(2);
    await expect(view).toContainText('E2E-LIB Bench press');
    await expect(view).toContainText('E2E-LIB Back squat');
    await expect(view.locator('input, textarea, select')).toHaveCount(0);
    await expect(page.getByTestId('template-save')).toHaveCount(0);
    await shot(page, testInfo, 'program-read-first-1440');

    await page.getByTestId('template-edit').click();
    await expect(page).toHaveURL(`/coach/templates/${PFX}tpl/edit`);
    await page.getByTestId('template-name').fill('E2E-LIB Upper Lower v2');
    await page.getByTestId('template-save').click();
    await expect(page).toHaveURL(`/coach/templates/${PFX}tpl`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E-LIB Upper Lower v2');
    const tpl = await db.findOne<{ days: Record<string, unknown>[] }>('coachWorkoutTemplates', { coachId: COACH, id: `${PFX}tpl` });
    expect(tpl!.days[0].sections).toBeUndefined(); // untouched seeded days keep their stored shape
    await page.goBack();
    await expect(page).toHaveURL(/\/coach\/library\?tab=programs&q=E2E-LIB$/); // never back into the builder

    // "Use in a client plan" from the program asks for a client, then asks again before replacing that
    // client's plan (the server keeps the current plan as a version). Cancel leaves the plan untouched.
    await page.goto(`/coach/templates/${PFX}tpl`); // a cold deep link
    await ready(page);
    const planBefore = await db.findOne('clientWorkoutPlans', { _id: CLIENT.id });
    const versionsBefore = await db.count('planVersions', { clientId: CLIENT.id });
    await page.getByTestId('template-assign').click();
    await page.getByTestId('assign-client').filter({ hasText: CLIENT.name }).click();
    const confirm = page.getByTestId('confirm-dialog');
    await expect(confirm).toContainText(`Assign "E2E-LIB Upper Lower v2" to ${CLIENT.name}? This replaces their current workout plan — the existing one is saved as a version first.`);
    await confirm.getByTestId('confirm-cancel').click();
    await expect(confirm).toHaveCount(0);
    expect(await db.findOne('clientWorkoutPlans', { _id: CLIENT.id })).toEqual(planBefore);
    expect(await db.count('planVersions', { clientId: CLIENT.id })).toBe(versionsBefore);
    await page.keyboard.press('Escape');
    await page.getByTestId('coach-template-editor').getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/coach\/library\?tab=programs$/);
    // A program that no longer exists says so — never a blank template.
    await page.goto('/coach/templates/does-not-exist');
    await ready(page);
    await expect(page.getByTestId('template-not-found')).toBeVisible();
  });

  test('TS-04: a template sync that did not land stays on screen with Retry (also after a reload); Retry re-saves and the notice goes', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    let saves = 0;
    // The save itself succeeds; its answer is changed to report a failed template sync.
    const handler = async (route: Route) => {
      const procs = procsOf(route.request().url());
      if (!procs.includes('coachAssets.exercises.save')) return route.continue();
      saves += 1;
      const res = await route.fetch();
      const body = await res.json();
      const mark = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(mark);
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (o.sync && typeof o.sync === 'object') return { ...o, sync: { status: 'failed', affectedTemplates: 0, error: 'e2e: forced' } };
          return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, mark(x)]));
        }
        return v;
      };
      await route.fulfill({ status: res.status(), contentType: 'application/json', body: JSON.stringify(mark(body)) });
    };
    await page.route(/\/api\/trpc\//, handler);
    await openLibrary(page, `?tab=exercises&scope=mine&q=${encodeURIComponent('E2E-LIB Bench')}`);
    await rows(page).first().getByTestId('library-row-main').click();
    await page.getByTestId('exercise-view-edit').click();
    await page.getByTestId('ex-progression').fill('Add 2.5 kg when all sets hit 8');
    await page.getByTestId('ex-save').click();
    const notice = page.getByTestId('lib-sync-issue');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('“E2E-LIB Bench press” was saved, but its templates weren\'t updated');
    await expect(notice).toHaveAttribute('role', 'alert');
    expect(saves).toBe(1);
    await page.waitForTimeout(6_000); // longer than a toast lives
    await expect(notice).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('lib-sync-issue')).toBeVisible();
    await shot(page, testInfo, 'ts04-notice-1440');
    await page.unroute(/\/api\/trpc\//, handler);
    const resave = page.waitForRequest((r) => procsOf(r.url()).includes('coachAssets.exercises.save'));
    await page.getByTestId('lib-sync-retry').click();
    await resave;
    await expect(page.getByTestId('lib-sync-issue')).toHaveCount(0);
  });

  test('DT-08: ⌘K "New exercise" and "New food" open the creation forms themselves; an exercise already listed opens read-first (own or Forma\'s)', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    // ⌘K searches what the Library has already listed (no extra reads).
    await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Demo')}`);
    await expect(rows(page)).not.toHaveCount(0);
    await page.goto('/coach/me');
    await ready(page);
    await page.keyboard.press('Control+k');
    await page.getByTestId('command-input').fill('New exercise');
    await page.getByRole('option', { name: 'New exercise' }).click();
    await expect(page.getByTestId('exercise-form')).toBeVisible();
    await expect(page).toHaveURL(/\/coach\/library\?tab=exercises$/);
    await expect(page.getByTestId('ex-name')).toHaveValue('');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.getByTestId('command-input').fill('New food');
    await page.getByRole('option', { name: 'New food' }).click();
    await expect(page.getByTestId('food-lib-form')).toBeVisible();
    await expect(page).toHaveURL(/\/coach\/library\?tab=foods$/);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.getByTestId('command-input').fill('E2E-LIB Demo Image');
    await page.getByRole('option', { name: 'E2E-LIB Demo Image' }).click();
    await expect(page.getByTestId('exercise-view')).toBeVisible();
    await expect(page.getByTestId('demo-image-view')).toBeVisible();
    // A Forma exercise opens its catalog page by id.
    await page.goto(`/coach/library?tab=exercises&open=fx_barbell_bench_press`);
    await ready(page);
    await expect(page.getByTestId('catalog-exercise-view')).toBeVisible();
    await expect(page).toHaveURL(/\/coach\/library\?tab=exercises$/);
  });

  test('favourites: a star keeps an own and a Forma exercise in Favourites — references only, nothing copied; unstarring removes them', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    const exercisesBefore = await db.count('coachExercises', { coachId: COACH });
    await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Bench')}`);
    await own(page).filter({ hasText: 'E2E-LIB Bench press' }).getByTestId('library-favorite').click();
    await page.getByTestId('lib-exercises-search').fill('barbell bench press');
    const forma = rows(page).and(page.locator('[data-id="fx_barbell_bench_press"]'));
    await forma.getByTestId('library-favorite').click();
    await expect(forma.getByTestId('library-favorite')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('lib-exercises-search').fill('');
    await page.getByTestId('lib-exercises-scope-favorites').click();
    await expect(page).toHaveURL(/scope=favorites/);
    await expect(rows(page)).toHaveCount(2);
    await shot(page, testInfo, 'favorites-390', true);
    expect(await db.count('coachFavorites', { coachId: COACH })).toBe(2);
    expect(await db.count('coachExercises', { coachId: COACH })).toBe(exercisesBefore);
    // Unstar one at a time: the Favourites list refetches after each, so the next star is a new row.
    for (const left of [1, 0]) {
      await rows(page).first().getByTestId('library-favorite').click();
      await expect(rows(page)).toHaveCount(left);
    }
    await expect(page.getByTestId('lib-exercises-empty')).toBeVisible();
    expect(await db.count('coachFavorites', { coachId: COACH })).toBe(0);
  });

  test('swap groups live inside Foods (the old ?tab=groups opens them); a group is built from the one food list — the coach\'s own food and a Forma food — and saved with copies of both', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, '?tab=groups');
    await expect(page).toHaveURL(/\/coach\/library\?tab=foods&view=groups$/);
    await expect(page.getByTestId('lib-tab-foods')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('lib-foods-view-groups')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('group-new').click();
    await page.getByTestId('grp-name').fill('E2E-LIB Dairy swaps');
    const list = page.getByTestId('grp-library');
    await list.getByTestId('grp-library-search').fill('greek');
    await list.getByTestId('library-food-row').and(page.locator(`[data-id="${YOGURT.id}"]`)).getByTestId('library-row-main').click();
    await expect(page.getByTestId('grp-picked-count')).toHaveText('1 picked');
    await list.getByTestId('grp-library-search').fill('cottage cheese');
    await list.getByTestId('library-food-row').and(page.locator('[data-id="ff_cottage_cheese_1"]')).getByTestId('library-row-main').click();
    await expect(page.getByTestId('grp-picked-count')).toHaveText('2 picked');
    await expect(page.getByTestId('grp-foods').getByRole('listitem')).toHaveCount(2);
    await page.getByTestId('grp-save').click();
    await expect(page.getByTestId('coach-desktop-groups').getByTestId('data-row').filter({ hasText: 'E2E-LIB Dairy swaps' })).toBeVisible();
    const g = await db.findOne<{ foods: Record<string, unknown>[] }>('coachFoodGroups', { coachId: COACH, name: 'E2E-LIB Dairy swaps' });
    expect(g!.foods).toEqual([expect.objectContaining({ id: YOGURT.id, name: YOGURT.name }), expect.objectContaining({ id: 'ff_cottage_cheese_1', catalogId: 'ff_cottage_cheese_1', per100g: expect.any(Object) })]);
    expect(await db.count('coachFoods', { coachId: COACH, id: 'ff_cottage_cheese_1' })).toBe(0); // the group holds a copy; the library is not touched
  });

  test('CO-26-R: the exercise form is metadata-first; changing a default keeps every other field, the Arabic and the library link', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    await openLibrary(page, `?tab=exercises&scope=mine&q=${encodeURIComponent('E2E-LIB Bench')}`);
    await rows(page).first().getByTestId('library-row-main').click();
    await page.getByTestId('exercise-view-edit').click();
    await expect(page.getByTestId('exercise-form').locator('legend')).toHaveCount(4); // the form loads on first use
    const legends = (await page.getByTestId('exercise-form').locator('legend').allTextContents()).map((s) => s.trim());
    expect(legends).toEqual(['About the exercise', 'Demo', en.coachEditor.instructions, 'Defaults when added to a plan']);
    await shot(page, testInfo, 'co26r-form-390', true);
    await page.getByTestId('ex-working-sets').fill('5');
    await page.getByTestId('ex-save').click();
    await expect(page.getByTestId('exercise-form')).toHaveCount(0);
    const stored = await db.findOne<Record<string, unknown>>('coachExercises', { coachId: COACH, id: BENCH.id });
    expect(stored).toMatchObject({ workingSets: 5, notes: BENCH.notes, name: BENCH.name, equipment: 'Barbell', category: 'Push', videoUrl: BENCH.videoUrl, tags: ['strength'] });
  });

  test('offline: the loaded Library stays readable, writes wait for the network; opening Programs asks for no exercise list', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { context, page } = await as('coachPro', sized(1440));
    const lists: { proc: string; bytes: number }[] = [];
    page.on('response', async (r) => {
      const procs = procsOf(r.url());
      if (procs.some((p) => p === 'library.exercises.list')) lists.push({ proc: 'library.exercises.list', bytes: (await r.body().catch(() => Buffer.alloc(0))).length });
    });
    await openLibrary(page);
    await expect(page.getByTestId('coach-desktop-templates')).toBeVisible();
    await page.waitForTimeout(800);
    expect(lists, 'Programs alone never loads the exercise library').toEqual([]);
    await page.getByTestId('lib-tab-exercises').click();
    await expect(rows(page).first()).toBeVisible();
    await expect.poll(() => lists.length).toBe(1);
    testInfo.annotations.push({ type: 'exercise-page-bytes', description: String(lists[0].bytes) });
    expect(lists[0].bytes, 'one page of 30 rows stays light').toBeLessThan(40_000);
    await context.setOffline(true);
    await expect(page.getByTestId('lib-new')).toBeDisabled();
    await expect(rows(page).first()).toBeVisible();
    await shot(page, testInfo, 'offline-1440');
    await context.setOffline(false);
    await expect(page.getByTestId('lib-new')).toBeEnabled();
  });

  test('Arabic: a right-to-left Library — translated segments, scopes and search; the reader\'s exercise and food names; no overflow (390 + 1440)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    for (const w of [1440, 390]) {
      const { context, page } = await as('coachPro', w === 390 ? phone : sized(w));
      await setLanguage(page, 'العربية');
      try {
        await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('بنش')}`);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.getByTestId('lib-tab-programs')).toHaveText(ar.coachLib.tabs.programs);
        await expect(page.getByTestId('lib-exercises-scope-mine')).toHaveText(ar.library.scope.myExercises);
        await expect(page.getByTestId('lib-exercises-search')).toHaveAttribute('placeholder', ar.library.searchExercises);
        // Egyptian gym words find Forma's bench press, shown in Arabic.
        await expect(rows(page).and(page.locator('[data-id="fx_barbell_bench_press"]'))).toContainText('ضغط البار');
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
        await shot(page, testInfo, `ar-exercises-${w}`, true);
        await openLibrary(page, `?tab=foods&q=${encodeURIComponent('زبادي')}`);
        await expect(page.getByText('زبادي يوناني').first()).toBeVisible();
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
      } finally {
        await setLanguage(page, 'English').catch(() => undefined);
        await context.close();
      }
    }
  });

  test('accessibility: segments, the lists, a detail, "Use in a client plan", the editor prompt and a program read-first — no axe violations (WCAG 2.1 A / AA, EN + AR, 390 + 1440)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const found: Record<string, Awaited<ReturnType<typeof axeScan>>> = {};
    for (const lang of ['en', 'ar'] as const) {
      for (const w of [1440, 390]) {
        const { context, page } = await as('coachPro', w === 390 ? phone : sized(w));
        if (lang === 'ar') await setLanguage(page, 'العربية');
        try {
          await openLibrary(page, `?tab=programs&q=E2E-LIB`);
          found[`${lang}-${w}-programs`] = await axeScan(page);
          await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Demo')}`);
          await expect(rows(page).first()).toBeVisible();
          found[`${lang}-${w}-exercises`] = await axeScan(page);
          await openLibrary(page, `?tab=foods&q=${encodeURIComponent('rice')}`);
          await expect(page.getByTestId('library-food-row').first()).toBeVisible();
          found[`${lang}-${w}-foods`] = await axeScan(page);
          await openLibrary(page, `?tab=exercises&scope=mine&q=${encodeURIComponent('E2E-LIB Demo Drive')}`);
          await rows(page).first().getByTestId('library-row-main').click();
          await expect(page.getByTestId('exercise-view')).toBeVisible();
          found[`${lang}-${w}-detail`] = await axeScan(page);
          await page.getByTestId('exercise-use').click();
          await expect(page.getByTestId('use-in-plan')).toBeVisible();
          await expect(page.getByTestId('use-client-client').first()).toBeVisible();
          found[`${lang}-${w}-use`] = await axeScan(page);
          await page.keyboard.press('Escape');
          if (w === 1440) {
            await openLibrary(page, '?tab=foods&view=groups');
            found[`${lang}-${w}-groups`] = await axeScan(page);
            await page.goto(`/coach/client/${CLIENT.id}/workout?addExercise=${PFX}demo-none`);
            await ready(page);
            await expect(page.getByTestId('library-add')).toBeVisible();
            found[`${lang}-${w}-editor-prompt`] = await axeScan(page);
            await page.getByTestId('library-add-cancel').click();
            await page.goto(`/coach/templates/${PFX}tpl`);
            await ready(page);
            await expect(page.getByTestId('template-preview')).toBeVisible();
            found[`${lang}-${w}-program`] = await axeScan(page);
          }
        } finally {
          if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
          await context.close();
        }
      }
    }
    await testInfo.attach('axe-library.json', { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
    expect(Object.entries(found).filter(([, v]) => v.length > 0)).toEqual([]);
  });

  test('visual QA matrix: Library segments, a detail, the editor prompt and a program at 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR (+ Egyptian Arabic)', async ({ as, audit }, testInfo) => {
    test.setTimeout(900_000);
    allowDevModuleStorm(audit);
    const sink = visualSink(testInfo);
    const widths: [number, number][] = [[360, 780], [390, 844], [430, 932], [768, 1024], [1024, 800], [1440, 900]];
    for (const lang of ['en', 'ar', 'ar-eg'] as const) {
      for (const [w, h] of lang === 'ar-eg' ? widths.filter(([x]) => x === 390 || x === 1440) : widths) {
        const { context, page } = await as('coachPro', w <= 430 ? { ...phone, viewport: { width: w, height: h } } : sized(w, h));
        if (lang !== 'en') await setLanguage(page, lang === 'ar' ? 'العربية' : 'مصري');
        try {
          await openLibrary(page, '?tab=programs&q=E2E-LIB');
          await sink.capture(page, `programs-${w}-${lang}`);
          await openLibrary(page, '?tab=exercises');
          await expect(rows(page).first()).toBeVisible();
          await sink.capture(page, `exercises-${w}-${lang}`);
          if (lang !== 'ar-eg' || w === 390) {
            await openLibrary(page, '?tab=foods');
            await expect(page.getByTestId('library-food-row').first()).toBeVisible();
            await sink.capture(page, `foods-${w}-${lang}`);
            await openLibrary(page, '?tab=foods&view=groups');
            await sink.capture(page, `groups-${w}-${lang}`);
            await openLibrary(page, '?tab=supplements');
            await sink.capture(page, `supplements-${w}-${lang}`);
          }
          if (w === 390 || w === 1440) {
            await openLibrary(page, `?tab=exercises&scope=mine&q=${encodeURIComponent('E2E-LIB Demo Image')}`);
            await rows(page).first().getByTestId('library-row-main').click();
            await expect(page.getByTestId('exercise-view')).toBeVisible();
            await sink.capture(page, `detail-${w}-${lang}`);
            await page.goto(`/coach/templates/${PFX}tpl`);
            await ready(page);
            await expect(page.getByTestId('template-preview')).toBeVisible();
            await sink.capture(page, `program-${w}-${lang}`);
            await page.goto(`/coach/client/${CLIENT.id}/workout?addExercise=${PFX}demo-none`);
            await ready(page);
            await expect(page.getByTestId('library-add')).toBeVisible();
            await sink.capture(page, `prompt-${w}-${lang}`);
            await page.getByTestId('library-add-cancel').click();
          }
        } finally {
          if (lang !== 'en') await setLanguage(page, 'English').catch(() => undefined);
          await context.close();
        }
      }
    }
    await sink.finish('b43-library');
  });
});
