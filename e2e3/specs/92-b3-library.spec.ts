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
 * (swap groups inside) · Supplements; search, filters, sort, paging, an explicit Select mode;
 * honest demo states and attribution; the first-run starter library; "Use in a client plan" into
 * the client's existing editors as an unsaved change (Journey I); templates read-first (RM-27);
 * a persistent template-sync notice with Retry (TS-04); ⌘K create commands (DT-08); EN / AR / AR-EG,
 * 360–1440, axe.
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
const table = (page: Page) => page.getByTestId('coach-desktop-library');
const rows = (page: Page) => table(page).getByTestId('data-row');
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

test.describe('B3.7 Library', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeAll(async ({ db, env }) => {
    await removeFixtures(db);
    await insertFixtures(env.baseURL);
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('first run (CO-23, EX-08, EX-23): a new coach sees what the starter library is — honestly — and adds it in one tap; adding it again duplicates nothing', async ({ as, db, audit }, testInfo) => {
    test.setTimeout(420_000); // six fresh app contexts plus two starter-library runs
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
        const panel = page.getByTestId('lib-starter');
        await expect(panel).toBeVisible();
        await expect(page.getByTestId('load-starter-library')).toBeVisible();
        const copy = lang === 'ar' ? ar : en;
        await expect(panel).toContainText(copy.library.starter.honesty);
        await expect(page.getByText(/many with video|كثير منها بفيديو/)).toHaveCount(0);
        // The repro: no clipped segment, no squeezed search.
        for (const seg of ['programs', 'exercises', 'foods', 'supplements']) {
          const clipped = await page.getByTestId(`lib-tab-${seg}`).evaluate((el) => {
            const label = el.querySelector('span.truncate') as HTMLElement;
            return label.scrollWidth > label.clientWidth + 1;
          });
          expect(clipped, `${seg} label fits (${w} ${lang})`).toBe(false);
        }
        // Nothing to search yet: no search, sort or Select — just the offer (B3.3 rule for empty lists).
        await expect(page.getByTestId('template-search')).toHaveCount(0);
        await expect(page.getByTestId('lib-select')).toHaveCount(0);
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
        await shot(page, testInfo, `first-run-${w}-${lang}`, true);
      } finally {
        if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
        await context.close();
      }
    }

    const { page } = await as(NEW_COACH, sized(1440));
    await openLibrary(page);
    await page.getByTestId('load-starter-library').click();
    await confirmYes(page);
    const done = page.getByTestId('confirm-dialog');
    await expect(done).toContainText('Starter library added', { timeout: 60_000 });
    await expect(done).not.toContainText(/didn't load|E11000/);
    await done.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('coach-desktop-templates').getByTestId('data-row').first()).toBeVisible();
    await expect(page.getByTestId('lib-starter')).toHaveCount(0);
    const cols = ['coachExercises', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachWorkoutTemplates'];
    const counts = await Promise.all(cols.map((c) => db.count(c, { coachId: NEW_COACH.id })));
    testInfo.annotations.push({ type: 'starter-counts', description: JSON.stringify(Object.fromEntries(cols.map((c, i) => [c, counts[i]]))) });
    for (const n of counts) expect(n).toBeGreaterThan(0);
    // Again, from the Library's menu: nothing is duplicated.
    await page.getByTestId('lib-more').click();
    await page.getByTestId('lib-load-starter').click();
    await confirmYes(page);
    await expect(page.getByTestId('confirm-dialog')).toContainText('Starter library added', { timeout: 60_000 });
    await page.getByTestId('confirm-accept').click();
    expect(await Promise.all(cols.map((c) => db.count(c, { coachId: NEW_COACH.id })))).toEqual(counts);
    // The exercises the starter added say honestly that most have no demo.
    await page.getByTestId('lib-tab-exercises').click();
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    await expect(table(page).getByTestId('demo-none').first()).toBeVisible();
    await expect(page.getByTestId('attribution')).toContainText('wger.de');
    await shot(page, testInfo, 'starter-exercises-1440');
    // With content, the search has its own full-width row — never squeezed (CO-23) — at 360 and 1440.
    for (const w of [360, 1440]) {
      const ctx = await as(NEW_COACH, w < 1024 ? { ...phone, viewport: { width: w, height: 780 } } : sized(w));
      await openLibrary(ctx.page, '?tab=exercises');
      const search = await ctx.page.getByTestId('lib-search').boundingBox();
      const content = await ctx.page.getByTestId('coach-library').boundingBox();
      expect(search!.width, `search width at ${w}`).toBeGreaterThan(content!.width * 0.9);
      expect(await overflowOf(ctx.page)).toBeLessThanOrEqual(0);
      await shot(ctx.page, testInfo, `starter-exercises-${w}`);
      await ctx.context.close();
    }
  });

  test('TB-04 / EX-15: 200+ exercises — real column names, sort with aria-sort, filters, pages of 50; the view lives in the URL', async ({ as, audit }, testInfo) => {
    test.setTimeout(480_000); // seven fresh app contexts (360 → 1440) after the desktop checks
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Gen')}`);
    await expect(rows(page)).toHaveCount(50);
    await expect(page.getByTestId('lib-count')).toHaveText(/^210 of \d+$/);
    await expect(page.getByTestId('pagination-status')).toHaveText('Page 1 / 5');
    const headers = (await table(page).getByRole('columnheader').allTextContents()).map((s) => s.trim()).filter(Boolean);
    expect(headers).toEqual(['Exercise', 'Muscle', 'Equipment', 'Demo', 'Default sets', 'Actions']); // the last is the row menu's (visually hidden) header
    // No bulk controls on rows until Select; the row menu holds the rest.
    await expect(page.getByTestId('row-select')).toHaveCount(0);
    await expect(rows(page).first().getByTestId('row-menu')).toBeVisible();

    await page.getByTestId('sort-muscle').click();
    await expect(page).toHaveURL(/sort=muscle/);
    // B3.9.0: the column header that holds the sort button, by role (was `xpath=ancestor::th`).
    const muscleHeader = table(page).getByRole('columnheader').filter({ has: page.getByTestId('sort-muscle') });
    await expect(muscleHeader).toHaveAttribute('aria-sort', 'ascending');
    await expect(rows(page).first()).toContainText('Back');
    await page.getByTestId('sort-muscle').click();
    await expect(muscleHeader).toHaveAttribute('aria-sort', 'descending');
    await expect(rows(page).first()).toContainText('Shoulders');
    await page.getByTestId('pagination-next').click();
    await expect(page.getByTestId('pagination-status')).toHaveText('Page 2 / 5');

    await page.getByTestId('lib-filter-equipment').selectOption('Barbell');
    await expect(page).toHaveURL(/equipment=Barbell/);
    await expect(page.getByTestId('pagination-status')).toHaveCount(0); // 45 rows: one page
    for (const r of await rows(page).all()) await expect(r).toContainText('Barbell');
    await page.getByTestId('lib-filter-video').click();
    const withVideo = await rows(page).count();
    expect(withVideo).toBeGreaterThan(0);
    await expect(table(page).getByTestId('demo-video')).toHaveCount(withVideo);
    const before = await rows(page).allTextContents();
    await page.reload();
    await ready(page);
    expect(await rows(page).allTextContents()).toEqual(before);
    await expect(page.getByTestId('lib-filter-video')).toHaveAttribute('aria-pressed', 'true');
    await shot(page, testInfo, 'tb04-filtered-1440');

    // No horizontal scroll anywhere from 360 to 1440 (table from 1024, list below).
    for (const [w, h] of [[360, 780], [390, 844], [430, 932], [768, 1024], [1024, 800], [1280, 900], [1440, 900]] as const) {
      const ctx = await as('coachPro', w <= 430 ? { ...phone, viewport: { width: w, height: h } } : sized(w, h));
      await openLibrary(ctx.page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Gen')}`);
      await expect(ctx.page.getByTestId(w >= 1024 ? 'coach-desktop-library' : 'lib-list-exercises')).toBeVisible();
      expect(await overflowOf(ctx.page), `overflow at ${w}`).toBeLessThanOrEqual(0);
      if (w < 1024) {
        await expect(ctx.page.getByTestId('lib-item')).toHaveCount(30);
        await ctx.page.getByTestId('lib-show-more').click();
        await expect(ctx.page.getByTestId('lib-item')).toHaveCount(60);
      }
      await ctx.context.close();
    }
  });

  test('media honesty: Video / Image / "No demo yet"; a link that cannot play is never offered as a video; the source is credited', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Demo')}`);
    await expect(rows(page)).toHaveCount(4);
    const row = (name: string) => rows(page).filter({ hasText: name });
    await expect(row('Demo Video').getByTestId('demo-video')).toBeVisible();
    await expect(row('Demo Image').getByTestId('demo-image')).toBeVisible();
    await expect(row('Demo None').getByTestId('demo-none')).toHaveText('No demo yet');
    await expect(row('Demo Drive').getByTestId('demo-none')).toHaveText('No demo yet');
    await shot(page, testInfo, 'demo-rows-1440');

    await row('Demo Image').getByTestId('row-open').click();
    await expect(page.getByTestId('demo-image-view')).toBeVisible();
    await expect.poll(() => page.getByTestId('demo-image-view').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await row('Demo None').getByTestId('row-open').click();
    await expect(page.getByTestId('demo-placeholder')).toContainText('No demo yet');
    await page.keyboard.press('Escape');
    await row('Demo Drive').getByTestId('row-open').click();
    await expect(page.getByTestId('video-unsupported')).toBeVisible(); // explained, never a dead player
    await expect(page.getByTestId('exercise-view').locator('video, iframe')).toHaveCount(0);
    await expect(page.getByTestId('exercise-view').getByTestId('attribution')).toContainText('wger.de · CC BY-SA');
    await shot(page, testInfo, 'demo-broken-link-detail');
  });

  test('Journey I (exercise): search → Use in a client plan → the client\'s editor asks where → unsaved until Save → the stored copy is the library\'s, bilingual, linked, nothing duplicated', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, '?tab=exercises');
    await page.getByTestId('lib-search').fill('E2E-LIB Bench');
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().getByTestId('row-open').click();
    await page.getByTestId('exercise-use').click();
    await page.getByTestId('use-client-search').fill('Salma');
    await page.getByTestId('use-client-client').filter({ hasText: CLIENT.name }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${CLIENT.id}/workout$`)); // the hand-off is consumed
    const prompt = page.getByTestId('library-add');
    await expect(prompt).toBeVisible();
    const targets = prompt.getByTestId('library-add-target');
    await expect(targets).toHaveText([/Upper/, /Lower › Warm-up/, /Lower › Main/]);
    await shot(page, testInfo, 'journey-i-choose-day');
    await targets.filter({ hasText: 'Lower › Main' }).click(); // B3.9.0: the target by its name (the order is asserted just above), not nth(2)
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
    await expect(rows(page)).toHaveCount(1);
  });

  test('Journey I (food): search → Use in a client plan → meal → Save; the plan item keeps both languages and the library food is unchanged', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, '?tab=foods');
    await page.getByTestId('food-search').fill('زبادي');
    const foodRows = page.getByTestId('coach-desktop-foods').getByTestId('data-row');
    await expect(foodRows).toHaveCount(1);
    await foodRows.first().getByTestId('row-open').click();
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
    await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Bench')}`);
    await rows(page).first().getByTestId('row-open').click();
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

  test('DT-08: ⌘K "New exercise" and "New food" open the creation forms themselves; a searched exercise opens read-first', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
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
  });

  test('Select mode: bulk actions only after Select; only the selected item is deleted', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    await insertMany('coachExercises', [libExercise('tmp-1', 'E2E-LIB Temp one'), libExercise('tmp-2', 'E2E-LIB Temp two')]);
    const { page } = await as('coachPro', phone);
    await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Temp')}`);
    const items = page.getByTestId('lib-item');
    await expect(items).toHaveCount(2);
    await expect(page.getByTestId('row-select')).toHaveCount(0);
    await page.getByTestId('lib-select').click();
    await expect(page.getByTestId('row-select')).toHaveCount(2);
    await items.filter({ hasText: 'Temp one' }).getByTestId('row-open').click(); // in Select mode a tap selects
    await expect(page.getByTestId('exercise-view')).toHaveCount(0);
    await expect(page.getByTestId('bulk-count')).toHaveText('1 selected');
    await page.getByTestId('bulk-delete').click();
    await confirmYes(page);
    await expect(items).toHaveCount(1);
    expect(await db.count('coachExercises', { coachId: COACH, id: `${PFX}tmp-1` })).toBe(0);
    expect(await db.count('coachExercises', { coachId: COACH, id: `${PFX}tmp-2` })).toBe(1);
  });

  test('swap groups live inside Foods (the old ?tab=groups opens them); a group is built from a searchable checklist and saved with its foods', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openLibrary(page, '?tab=groups');
    await expect(page).toHaveURL(/\/coach\/library\?tab=foods&view=groups$/);
    await expect(page.getByTestId('lib-tab-foods')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('lib-foods-view-groups')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('group-new').click();
    await page.getByTestId('grp-name').fill('E2E-LIB Dairy swaps');
    await page.getByTestId('group-form').getByPlaceholder('Search foods').fill('greek');
    await page.getByTestId(`grp-food-${YOGURT.id}`).click();
    await expect(page.getByTestId('grp-picked-count')).toHaveText('1 picked');
    await page.getByTestId('grp-save').click();
    await expect(page.getByTestId('coach-desktop-groups').getByTestId('data-row').filter({ hasText: 'E2E-LIB Dairy swaps' })).toBeVisible();
    const g = await db.findOne<{ foods: { id: string; name: unknown }[] }>('coachFoodGroups', { coachId: COACH, name: 'E2E-LIB Dairy swaps' });
    expect(g!.foods).toEqual([expect.objectContaining({ id: YOGURT.id, name: YOGURT.name })]);
  });

  test('CO-26-R: the exercise form is metadata-first; changing a default keeps every other field, the Arabic and the library link', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Bench')}`);
    await page.getByTestId('lib-item').first().getByTestId('row-open').click();
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

  test('offline: the loaded Library stays readable, writes wait for the network; opening Programs downloads no exercise list (PF-11 not worse)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { context, page } = await as('coachPro', sized(1440));
    const lists: { proc: string; bytes: number }[] = [];
    page.on('response', async (r) => {
      const procs = procsOf(r.url());
      if (procs.some((p) => p === 'coachAssets.exercises.list')) lists.push({ proc: 'coachAssets.exercises.list', bytes: (await r.body().catch(() => Buffer.alloc(0))).length });
    });
    await openLibrary(page);
    await expect(page.getByTestId('coach-desktop-templates')).toBeVisible();
    await page.waitForTimeout(800);
    expect(lists, 'Programs alone never loads the exercise library').toEqual([]);
    await page.getByTestId('lib-tab-exercises').click();
    await expect(rows(page).first()).toBeVisible();
    await expect.poll(() => lists.length).toBe(1);
    testInfo.annotations.push({ type: 'exercise-list-bytes', description: String(lists[0].bytes) });
    await context.setOffline(true);
    await expect(page.getByTestId('lib-new')).toBeDisabled();
    await expect(page.getByTestId('lib-select')).toHaveCount(0);
    await expect(rows(page).first()).toBeVisible();
    await shot(page, testInfo, 'offline-1440');
    await context.setOffline(false);
    await expect(page.getByTestId('lib-new')).toBeEnabled();
  });

  test('Arabic: a right-to-left Library — translated segments, columns and demo states; the reader\'s food names; no overflow (390 + 1440)', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    for (const w of [1440, 390]) {
      const { context, page } = await as('coachPro', w === 390 ? phone : sized(w));
      await setLanguage(page, 'العربية');
      try {
        await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Demo')}`);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.getByTestId('lib-tab-programs')).toHaveText(ar.coachLib.tabs.programs);
        await expect(page.getByTestId('lib-tab-supplements')).toHaveText(ar.coachLib.tabs.supplements);
        await expect(page.getByText(ar.library.demo.none).first()).toBeVisible();
        if (w === 1440) {
          await expect(page.getByTestId('sort-name')).toHaveText(ar.library.col.exercise);
          const box = await page.getByTestId('sort-name').boundingBox();
          expect(box!.x).toBeGreaterThan(page.viewportSize()!.width / 2); // the first column sits on the right
        }
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

  test('accessibility: segments, table, list, detail, "Use in a client plan", the editor prompt and a program read-first — no axe violations (WCAG 2.1 A / AA, EN + AR, 390 + 1440)', async ({ as, audit }, testInfo) => {
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
          found[`${lang}-${w}-exercises`] = await axeScan(page);
          await page.getByTestId('row-open').filter({ hasText: 'Demo Drive' }).click();
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
          await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB')}`);
          await sink.capture(page, `exercises-${w}-${lang}`);
          if (lang !== 'ar-eg' || w === 390) {
            await openLibrary(page, `?tab=foods&q=${encodeURIComponent('E2E-LIB')}`);
            await sink.capture(page, `foods-${w}-${lang}`);
            await openLibrary(page, '?tab=foods&view=groups');
            await sink.capture(page, `groups-${w}-${lang}`);
            await openLibrary(page, '?tab=supplements');
            await sink.capture(page, `supplements-${w}-${lang}`);
          }
          if (w === 390 || w === 1440) {
            await openLibrary(page, `?tab=exercises&q=${encodeURIComponent('E2E-LIB Demo Image')}`);
            await page.getByTestId('row-open').first().click();
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
    await sink.finish('b37-library');
  });
});
