import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot, type Db } from '../fixtures';
import { allowDevModuleStorm, insertMany } from './_c-helpers';
import { confirmNo, confirmYes } from './_b-helpers';

/**
 * B3.5 — the coach's plan editors (blueprint §6.4, owner brief 2026-10-18): an older training plan
 * opens clean (B34-R1); every field the client sees round-trips (RIR, tempo, notes EN / AR, sets /
 * reps / rest, nutrition notes and alternatives, cardio sessions and daily targets); unsaved work
 * is protected (guard, reload, offline, browser Back keeps the draft); history and conflicts are
 * kept; phones get a full-screen task, desktop a dense layout; EN / AR / AR-EG; axe; 360–1440.
 *
 * Fixtures on coachPro (`e2e-ed-` ids, removed in afterAll).
 */
const COACH = 'e2e-coach-pro';
const PFX = 'e2e-ed-';
const DAY = 86_400_000;
const C = {
  full: { id: `${PFX}full`, name: 'Yara Nabil' },
  fresh: { id: `${PFX}fresh`, name: 'Karim Adel' },
};
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });

const EX = {
  squat: { id: 'ex-squat', name: 'Back squat', targetMuscle: 'Quads', category: 'Legs', equipment: 'Barbell', warmupSets: '2', warmupSetCount: 2, workingSets: 4, repRange: '5', rir: '2', tempo: '3-1-1', notes: { en: 'Brace before each rep', ar: 'شد البطن قبل كل تكرار' }, restSec: 180, videoId: null, videoUrl: 'https://cdn.example.test/squat.mp4', progressionNotes: 'Add 2.5 kg a week', tags: ['strength'], images: ['https://cdn.example.test/squat.png'], libraryExerciseId: 'lib-squat', librarySyncEnabled: true },
  rdl: { id: 'ex-rdl', name: 'Romanian deadlift', targetMuscle: 'Hamstrings', warmupSets: '0', workingSets: 3, repRange: '8-10', rir: '2', tempo: '', notes: { en: '', ar: '' }, restSec: 120, videoId: null },
  bench: { id: 'ex-bench', name: 'Bench press', targetMuscle: 'Chest', warmupSets: '1', workingSets: 4, repRange: '6-8', rir: '1', tempo: '2-0-1', notes: { en: 'Pause on the chest', ar: '' }, restSec: 150, videoId: null },
};
// An older plan: day 1 flat (no `sections`), day 2 `sections: []` — what seeded / imported plans look like.
const WORKOUT = (now: number) => ({
  _id: C.full.id,
  clientId: C.full.id,
  id: `wp-${C.full.id}`,
  name: 'Strength base',
  days: [
    { id: 'd-lower', dayIndex: 0, title: 'Lower', focus: 'Legs', exerciseIds: ['ex-squat', 'ex-rdl'] },
    { id: 'd-upper', dayIndex: 1, title: 'Upper', focus: 'Chest', exerciseIds: ['ex-bench'], sections: [] },
  ],
  exercises: Object.fromEntries(Object.values(EX).map((e) => [e.id, e])), // keyed by exercise id
  weeklyVolume: { chest: '10 sets' },
  meta: { sourceTemplateId: 't1', sourceTemplateName: 'Base', assignedAt: now - 9 * DAY, assignedBy: COACH, isCustomized: false },
  updatedAt: now - 5 * DAY,
});
const NUTRITION = (now: number) => ({
  _id: C.full.id,
  clientId: C.full.id,
  id: `np-${C.full.id}`,
  name: 'Lean bulk',
  meals: [
    {
      id: 'm-bf',
      slot: 'breakfast',
      label: { en: 'Breakfast', ar: 'الفطور' },
      items: [
        { id: 'f-oats', name: { en: 'Oats', ar: 'شوفان' }, quantity: '80 g', calories: 300, protein: 10, carbs: 54, fats: 6, allowedAlternativeGroupId: 'g-gone', allowedAlternatives: [{ id: 'alt-1', name: { en: 'Rice', ar: 'أرز' }, quantity: '100 g', calories: 130, protein: 3, carbs: 28, fats: 0 }] },
        { id: 'f-eggs', name: { en: 'Eggs', ar: '' }, quantity: '3', calories: 210, protein: 18, carbs: 1, fats: 15, allowCustomSubstitution: true },
      ],
    },
    { id: 'm-ln', slot: 'lunch', label: { en: 'Lunch', ar: '' }, items: [{ id: 'f-chk', name: { en: 'Chicken', ar: 'فراخ' }, quantity: '200 g', calories: 330, protein: 62, carbs: 0, fats: 7 }] },
  ],
  targets: { calories: 2600, protein: 170, carbs: 300, fats: 75 },
  supplements: [{ id: 's-cr', name: 'Creatine', dose: { en: '5 g daily', ar: '' } }],
  waterTargetMl: 3500,
  beverageNotes: [{ en: 'Black coffee is fine', ar: 'القهوة السادة مسموحة' }],
  generalNotes: [],
  substitutionPolicy: { allowClientSubstitutions: true, allowCustomFoods: false, requireCoachApproval: false },
  updatedAt: now - 5 * DAY,
});
const CARDIO = (now: number) => ({
  _id: C.full.id,
  clientId: C.full.id,
  id: `cp-${C.full.id}`,
  name: 'Conditioning',
  sessions: [
    { id: 'c-walk', type: 'walking', durationMin: 30, frequency: 'Daily', notes: 'After dinner' },
    { id: 'c-bike', type: 'cycling', durationMin: 20, frequency: '2x/week', notes: '' },
  ],
  updatedAt: now - 5 * DAY,
});

async function insertFixtures() {
  const now = Date.now();
  const users = Object.values(C).map((c, i) => ({
    _id: c.id, email: `${c.id}@e2e.test`, emailLower: `${c.id}@e2e.test`, displayName: c.name, displayNameLower: c.name.toLowerCase(), role: 'client',
    accountStatus: 'active', permissions: [], featureFlags: {}, assignedCoachId: COACH, phone: `+2012400${String(i).padStart(5, '0')}`, passwordHash: 'not-a-login', createdBy: 'e2e-ed', createdAt: now - 60 * DAY, updatedAt: now,
  }));
  const rels = Object.values(C).map((c) => ({ _id: `${COACH}__${c.id}`, coachId: COACH, clientId: c.id, status: 'active', createdBy: COACH, createdAt: now - 30 * DAY, updatedAt: now, subscription: { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } }));
  const profiles = Object.values(C).map((c) => ({ _id: c.id, clientId: c.id, updatedAt: now, assessment: { status: 'reviewed', completed: true, submittedAt: now - 20 * DAY, basic: { fullName: c.name } } }));
  await insertMany('users', users);
  await insertMany('coachClients', rels);
  await insertMany('clientProfiles', profiles);
  await insertMany('clientWorkoutPlans', [WORKOUT(now)]);
  await insertMany('clientNutritionPlans', [NUTRITION(now)]);
  await insertMany('clientCardioPlans', [CARDIO(now)]);
  await insertMany('coachTargets', [{ _id: C.full.id, clientId: C.full.id, waterMl: 3500, steps: 8000, updatedBy: COACH, updatedAt: now - 5 * DAY }]);
}
async function removeFixtures(db: Db) {
  const re = { $regex: `^${PFX}` };
  for (const col of ['coachClients', 'clientProfiles', 'planVersions', 'notifications', 'syncRecords']) await db.deleteMany(col, { clientId: re });
  for (const col of ['clientWorkoutPlans', 'clientNutritionPlans', 'clientCardioPlans', 'coachTargets', 'users']) await db.deleteMany(col, { _id: re });
  await db.deleteMany('coachWorkoutTemplates', { name: { $regex: '^E2E-ED ' } });
  await db.deleteMany('coachExercises', { name: { $regex: '^E2E-ED ' } });
}
async function setLanguage(page: Page, label: 'English' | 'العربية' | 'مصري') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toMatch(label === 'English' ? /^en$/ : label === 'مصري' ? /^ar-eg$/ : /^ar$/);
  await page.waitForTimeout(600);
}
async function openEditor(page: Page, kind: 'workout' | 'nutrition' | 'cardio', id = C.full.id) {
  await page.goto(`/coach/client/${id}/${kind}`);
  await ready(page);
  await expect(page.getByTestId(`coach-${kind}-editor`)).toBeVisible();
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const row = (page: Page, name: string) => page.getByTestId('builder-exercise-open').filter({ hasText: name });

test.describe('B3.5 plan editors', () => {
  test.beforeAll(async ({ db }) => {
    await removeFixtures(db);
    await insertFixtures();
  });
  test.afterAll(async ({ db }) => {
    await removeFixtures(db);
  });

  test('B34-R1: an older training plan (flat days, `sections: []`) opens with nothing unsaved — and leaves without a prompt', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const before = await db.findOne('clientWorkoutPlans', { _id: C.full.id });
    const { page } = await as('coachPro', sized(1440));
    await openEditor(page, 'workout');
    await expect(page.getByTestId('workout-clean')).toBeVisible();
    await expect(page.getByTestId('workout-unsaved')).toHaveCount(0);
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('workout-clean')).toBeVisible();
    await page.getByTestId('rail-clients').click();
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/coach\/clients$/);
    expect(await db.findOne('clientWorkoutPlans', { _id: C.full.id }), 'opening wrote nothing').toEqual(before);
  });

  test('training: programming (sets, reps, rest, RIR, tempo, notes EN / AR, progression), named sections and reorder round-trip; untouched fields and days stay exactly as stored', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openEditor(page, 'workout');
    await expect(page.getByTestId('builder-day')).toHaveAttribute('data-day-id', 'd-lower'); // desktop opens the first day
    // Dense table: RIR and tempo are columns.
    await expect(page.getByTestId('builder-exercise-row').filter({ hasText: 'Back squat' })).toContainText('3-1-1');
    await row(page, 'Romanian deadlift').click();
    await page.getByTestId('ex-rir').fill('1');
    await page.getByTestId('ex-tempo').fill('3-0-1');
    await page.getByTestId('ex-rest').fill('90');
    await page.getByTestId('ex-notes').fill('Hips back, soft knees');
    await page.getByTestId('ex-notes-ar').getByRole('button').click();
    await page.getByTestId('ex-notes-ar-input').fill('الورك للخلف والركبة لينة');
    await page.getByTestId('ex-progression').fill('Add a rep each week');
    await page.getByTestId('ex-save').click();
    // A named warm-up section; move the deadlift into it, then above the squat.
    await page.getByTestId('builder-add-section').click();
    const warm = page.getByTestId('builder-section').nth(1);
    await warm.getByTestId('section-title').fill('Warm-up');
    await warm.getByTestId('section-kind').selectOption('warmup');
    await page.getByRole('button', { name: 'Options for Romanian deadlift' }).click();
    await page.getByRole('menuitem', { name: 'Move to section' }).click();
    await page.getByTestId('sheet').getByRole('button', { name: 'Warm-up' }).click();
    await page.getByRole('button', { name: 'Options for Warm-up' }).click();
    await page.getByRole('menuitem', { name: 'Move section up' }).click();
    await expect(page.getByTestId('workout-unsaved')).toBeVisible();
    await shot(page, testInfo, 'training-edited-1440');
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('workout-saved')).toBeVisible();

    const doc = await db.findOne<ReturnType<typeof WORKOUT>>('clientWorkoutPlans', { _id: C.full.id });
    const lower = doc!.days[0] as { exerciseIds: string[]; sections?: { title: string; kind: string; exerciseIds: string[] }[] };
    expect(lower.sections?.map((s) => [s.title, s.kind, s.exerciseIds])).toEqual([['Warm-up', 'warmup', ['ex-rdl']], ['', 'normal', ['ex-squat']]]);
    expect(lower.exerciseIds).toEqual(['ex-rdl', 'ex-squat']); // the tracker's order follows the sections
    expect(doc!.exercises['ex-rdl']).toEqual({ ...EX.rdl, rir: '1', tempo: '3-0-1', restSec: 90, notes: { en: 'Hips back, soft knees', ar: 'الورك للخلف والركبة لينة' }, progressionNotes: 'Add a rep each week' });
    expect(doc!.exercises['ex-squat']).toEqual(EX.squat); // never opened: byte-for-byte
    expect(doc!.days[1]).toEqual(WORKOUT(0).days[1]); // the untouched older day keeps its shape
    expect(doc!.weeklyVolume).toEqual({ chest: '10 sets' });
    expect(doc!.meta).toMatchObject({ sourceTemplateName: 'Base', isCustomized: true });
    // Reload: the saved shape opens clean too.
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('workout-clean')).toBeVisible();
  });

  test('phones: a full-screen task — two levels, the one Back steps up, the save bar stays reachable above the content', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', phone);
    await openEditor(page, 'workout');
    // The editor covers the shell (no tab bar on top of it).
    const bar = page.getByTestId('plan-editor-bar');
    await expect(bar).toBeVisible();
    const box = (await bar.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844 + 1);
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="plan-editor-bar"]') != null, [box.x + 20, box.y + box.height / 2]);
    expect(top, 'the save bar is the topmost layer').toBe(true);
    await page.getByTestId('builder-day-card').filter({ hasText: 'Upper' }).click();
    await expect(page.getByTestId('builder-day')).toBeVisible();
    await shot(page, testInfo, 'training-day-390');
    await page.getByTestId('coach-workout-editor').getByRole('button', { name: 'Back' }).click();
    await expect(page.getByTestId('builder-plan')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.full.id}/workout$`));
    await page.getByTestId('coach-workout-editor').getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${C.full.id}/plan$`));
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
  });

  test('nutrition: targets first, planned vs target as rows; bilingual label / dose / notes, reorder, confirmed deletes; every other field saved as it was', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openEditor(page, 'nutrition');
    await expect(page.getByTestId('nutrition-clean')).toBeVisible();
    await expect(page.getByTestId('nutrition-total-calories')).toContainText('840 / 2600');
    await expect(page.getByTestId('nutrition-totals').getByRole('listitem')).toHaveCount(4);
    const breakfast = page.getByTestId('nutrition-meal').filter({ hasText: 'Breakfast' });
    await breakfast.getByTestId('meal-label-ar').getByRole('button').click();
    await breakfast.getByTestId('meal-label-ar-input').fill('فطار');
    await page.getByRole('button', { name: 'Move Eggs up' }).click();
    await page.getByTestId('generalNotes-add').click();
    await page.getByTestId('generalNotes-en').pressSequentially('Eat slowly, sit down');
    await page.getByTestId('nutrition-supp-row').filter({ hasText: 'Creatine' }).getByRole('button').first().click();
    await page.getByTestId('supp-dose-ar').getByRole('button').click();
    await page.getByTestId('supp-dose-ar-input').fill('5 جم يوميًا');
    await page.getByTestId('supp-save').click();
    await page.getByTestId('policy-requireCoachApproval').click();
    // A delete asks first; "No" keeps it.
    await page.getByRole('button', { name: 'Delete Creatine' }).click();
    await confirmNo(page);
    await expect(page.getByTestId('nutrition-supp-row')).toHaveCount(1);
    await shot(page, testInfo, 'nutrition-edited-1440');
    await page.getByTestId('nutrition-save').click();
    await expect(page.getByTestId('nutrition-saved')).toBeVisible();

    const doc = await db.findOne<ReturnType<typeof NUTRITION>>('clientNutritionPlans', { _id: C.full.id });
    const orig = NUTRITION(0);
    expect(doc!.meals[0].label).toEqual({ en: 'Breakfast', ar: 'فطار' });
    expect(doc!.meals[0].items).toEqual([orig.meals[0].items[1], orig.meals[0].items[0]]); // reordered, each item untouched (the deleted group's snapshot stays)
    expect(doc!.meals[1]).toEqual(orig.meals[1]);
    expect(doc!.generalNotes).toEqual([{ en: 'Eat slowly, sit down', ar: 'Eat slowly, sit down' }]);
    expect(doc!.beverageNotes).toEqual(orig.beverageNotes);
    expect(doc!.supplements).toEqual([{ id: 's-cr', name: 'Creatine', dose: { en: '5 g daily', ar: '5 جم يوميًا' } }]);
    expect(doc!.substitutionPolicy).toEqual({ ...orig.substitutionPolicy, requireCoachApproval: true });
    expect(doc!.targets).toEqual(orig.targets);
    expect(doc!.waterTargetMl).toBe(3500);
  });

  test('cardio: sessions reorder and keep their fields; steps and cardio minutes are set here and merged into the client\'s targets', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openEditor(page, 'cardio');
    await expect(page.getByTestId('cardio-target-steps')).toHaveValue('8000');
    await page.getByTestId('cardio-target-steps').fill('10000');
    await page.getByTestId('cardio-target-minutes').fill('25');
    await page.getByRole('button', { name: /Move Cycling · 20 min up/ }).click();
    await page.getByTestId('cardio-save').click();
    await expect(page.getByTestId('cardio-saved')).toBeVisible();
    const targets = await db.findOne<Record<string, unknown>>('coachTargets', { _id: C.full.id });
    expect(targets).toMatchObject({ steps: 10000, cardioMin: 25, waterMl: 3500 }); // water kept
    const plan = await db.findOne<ReturnType<typeof CARDIO>>('clientCardioPlans', { _id: C.full.id });
    expect(plan!.sessions).toEqual([CARDIO(0).sessions[1], CARDIO(0).sessions[0]]);
    expect(await db.count('notifications', { clientId: C.full.id, type: 'targets_updated' })).toBeGreaterThan(0);
  });

  test('unsaved work: a reload restores the draft (and says so), Discard returns to the saved plan; offline keeps it on the device with Save disabled; browser Back keeps the draft', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page, context } = await as('coachPro', sized(1440));
    await openEditor(page, 'cardio');
    await page.getByTestId('cardio-plan-name').fill('Conditioning — draft');
    await expect(page.getByTestId('cardio-unsaved')).toBeVisible();
    page.on('dialog', (d) => void d.accept()); // the browser's own "leave site?" (beforeunload) on reload / Back
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('plan-editor-draft-restored')).toBeVisible();
    await expect(page.getByTestId('cardio-plan-name')).toHaveValue('Conditioning — draft');
    await page.getByTestId('plan-editor-discard-draft').click();
    await expect(page.getByTestId('cardio-plan-name')).toHaveValue('Conditioning');
    await expect(page.getByTestId('cardio-clean')).toBeVisible();

    await page.getByTestId('cardio-plan-name').fill('Conditioning — offline');
    await context.setOffline(true);
    try {
      await expect(page.getByTestId('cardio-offline')).toBeVisible();
      await expect(page.getByTestId('plan-editor-offline-notice')).toBeVisible();
      await expect(page.getByTestId('cardio-save')).toBeDisabled();
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByTestId('cardio-save')).toBeEnabled();

    // Browser Back is not blocked (BrowserRouter, B3.4 §6) — the draft survives and comes back.
    await page.goBack();
    await page.goForward();
    await ready(page);
    await expect(page.getByTestId('cardio-plan-name')).toHaveValue('Conditioning — offline');
    await expect(page.getByTestId('plan-editor-draft-restored')).toBeVisible();
    await page.getByTestId('plan-editor-discard-draft').click();
    await expect(page.getByTestId('cardio-clean')).toBeVisible();
  });

  test('history in the editor: a save with a note becomes a version; restoring an earlier one (with unsaved edits) asks, then the editor shows it', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openEditor(page, 'nutrition');
    await page.getByTestId('nutrition-plan-name').fill('Lean bulk v2');
    await page.getByTestId('version-history').click();
    await page.getByTestId('version-reason').fill('Raised carbs');
    await page.getByTestId('version-save-confirm').click();
    await expect(page.getByTestId('nutrition-saved')).toBeVisible();
    await page.getByTestId('version-history').click();
    await expect(page.getByTestId('version-row').first()).toContainText('Raised carbs');
    await page.getByTestId('sheet-close').last().click();
    await page.getByTestId('nutrition-plan-name').fill('Unsaved name');
    await page.getByTestId('version-history').click();
    const older = page.getByTestId('version-row').filter({ has: page.locator('[data-testid^="version-restore-"]') }).last();
    await older.locator('[data-testid^="version-restore-"]').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText('unsaved changes');
    await confirmYes(page);
    await expect(page.getByTestId('nutrition-plan-name')).toHaveValue('Lean bulk');
    await expect(page.getByTestId('nutrition-clean')).toBeVisible();
    expect((await db.findOne<{ name: string }>('clientNutritionPlans', { _id: C.full.id }))!.name).toBe('Lean bulk');
  });

  test('no plan yet: create is deliberate, "Start from a template" goes to the templates; the picker filters, remembers recent picks and ends with "Create new"', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await openEditor(page, 'workout', C.fresh.id);
    await expect(page.getByTestId('plan-editor-empty')).toBeVisible();
    await expect(page.getByTestId('workout-save')).toHaveCount(0);
    await page.getByTestId('plan-editor-from-template').click();
    await expect(page).toHaveURL(/\/coach\/templates$/);
    await openEditor(page, 'workout', C.fresh.id);
    await page.getByTestId('plan-editor-create').click();
    await page.getByTestId('builder-add-day').click();
    await page.getByTestId('builder-add-exercise').click();
    const picker = page.getByTestId('exercise-picker');
    await expect(picker).toBeVisible();
    // "Create new" is the last row of the list.
    const quick = picker.getByTestId('picker-quick-create');
    expect(await picker.evaluate((el, q) => el.lastElementChild === q, await quick.elementHandle())).toBe(true);
    await quick.click();
    await page.getByTestId('ex-name').fill('E2E-ED Hip thrust');
    await page.getByTestId('ex-target').fill('Glutes');
    await page.getByTestId('ex-save').click();
    await expect(page.getByTestId('builder-exercise-row')).toHaveCount(1);
    if (await picker.isVisible()) await page.getByTestId('sheet-close').last().click();
    // Reopened: the new exercise is under "Recently used"; the muscle filter narrows the list.
    await page.getByTestId('builder-add-exercise').click();
    await expect(page.getByTestId('picker-recent')).toContainText('E2E-ED Hip thrust');
    await page.getByTestId('picker-muscle').selectOption('Glutes');
    await expect(picker.getByTestId('picker-recent')).toHaveCount(0);
    const items = picker.getByTestId('picker-lib-item');
    await expect(items.first()).toContainText('Glutes');
    for (const txt of await items.allTextContents()) expect(txt).toContain('Glutes');
    await page.getByTestId('sheet-close').last().click();
    // Leaving the unsaved new plan asks first.
    await page.getByTestId('coach-workout-editor').getByRole('button', { name: 'Back' }).click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await confirmYes(page);
  });

  test('templates: same builder and guard; Save replaces the editor in history; a missing template is "not found", never a blank one', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await page.goto('/coach/templates/does-not-exist/edit');
    await ready(page);
    await expect(page.getByTestId('template-not-found').or(page.getByTestId('template-load-error'))).toBeVisible();
    await expect(page.getByTestId('template-save')).toHaveCount(0);
    await page.goto('/coach/templates');
    await ready(page);
    await page.goto('/coach/templates/new/edit');
    await ready(page);
    await page.getByTestId('template-name').fill('E2E-ED Template');
    await page.getByTestId('rail-today').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible(); // the shared guard (B3-C01)
    await confirmNo(page);
    await page.getByTestId('builder-add-day').click();
    await page.getByTestId('template-save').click();
    await expect(page).toHaveURL(/\/coach\/templates\/(?!new$)[^/]+$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/coach\/templates$/); // never back into the editor (NAV-K04)
    expect(await db.count('coachWorkoutTemplates', { name: 'E2E-ED Template' })).toBe(1);
  });

  test('owner review B35-R2: two coach tabs edit the daily targets — one save lands, the other conflicts with both values shown; nothing is overwritten silently; water is untouched', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    await db.updateOne('coachTargets', { _id: C.full.id }, { $set: { steps: 8000, waterMl: 3500 }, $unset: { cardioMin: '' } });
    const a = await as('coachPro', sized(1440));
    const b = await as('coachPro', sized(1440));
    for (const t of [a, b]) t.page.on('dialog', (d) => void d.accept());
    await openEditor(a.page, 'cardio');
    await openEditor(b.page, 'cardio');
    await expect(b.page.getByTestId('cardio-target-steps')).toHaveValue('8000');

    await a.page.getByTestId('cardio-target-steps').fill('9000');
    await a.page.getByTestId('cardio-save').click();
    await expect(a.page.getByTestId('cardio-clean').or(a.page.getByTestId('cardio-saved'))).toBeVisible();

    await b.page.getByTestId('cardio-target-steps').fill('11000');
    await b.page.getByTestId('cardio-save').click();
    await expect(b.page.getByTestId('cardio-targets-conflict')).toBeVisible();
    await expect(b.page.getByTestId('cardio-targets-mine-steps')).toHaveText('11000');
    await expect(b.page.getByTestId('cardio-targets-theirs-steps')).toHaveText('9000');
    await expect(b.page.getByTestId('cardio-conflict')).toBeVisible();
    expect(await db.findOne('coachTargets', { _id: C.full.id })).toMatchObject({ steps: 9000, waterMl: 3500 }); // B did not overwrite A
    await shot(b.page, testInfo, 'targets-conflict-1440');

    // B reloads: the edit comes back (stale — the targets changed since), and saving asks again.
    await b.page.reload();
    await ready(b.page);
    await expect(b.page.getByTestId('cardio-target-steps')).toHaveValue('11000');
    await expect(b.page.getByTestId('plan-editor-draft-restored').locator('[data-stale]')).toBeVisible();
    await b.page.getByTestId('cardio-save').click();
    await expect(b.page.getByTestId('cardio-targets-conflict')).toBeVisible();
    await b.page.getByTestId('cardio-targets-keep-mine').click();
    await expect(b.page.getByTestId('cardio-clean').or(b.page.getByTestId('cardio-saved'))).toBeVisible();
    expect(await db.findOne('coachTargets', { _id: C.full.id })).toMatchObject({ steps: 11000, waterMl: 3500 });

    // A's view is now stale; its next change conflicts instead of overwriting B's.
    await a.page.getByTestId('cardio-target-minutes').fill('15');
    await a.page.getByTestId('cardio-target-steps').fill('9500');
    await a.page.getByTestId('cardio-save').click();
    await expect(a.page.getByTestId('cardio-targets-conflict')).toBeVisible();
    await a.page.getByTestId('cardio-targets-use-theirs').click();
    await expect(a.page.getByTestId('cardio-target-steps')).toHaveValue('11000');
    expect(await db.findOne('coachTargets', { _id: C.full.id })).toMatchObject({ steps: 11000, waterMl: 3500 });
  });

  test('owner review B35-R3: daily-target edits are in the draft — reload, browser Back and offline keep them; Save clears the draft; Discard returns to the saved values', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    await db.updateOne('coachTargets', { _id: C.full.id }, { $set: { steps: 8000, waterMl: 3500 }, $unset: { cardioMin: '' } });
    const { page, context } = await as('coachPro', sized(1440));
    page.on('dialog', (d) => void d.accept());
    await openEditor(page, 'cardio');
    await page.getByTestId('cardio-target-steps').fill('7777');
    await expect(page.getByTestId('cardio-unsaved')).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('cardio-target-steps')).toHaveValue('7777');
    await expect(page.getByTestId('plan-editor-draft-restored')).toBeVisible();
    await page.goBack();
    await page.goForward();
    await ready(page);
    await expect(page.getByTestId('cardio-target-steps')).toHaveValue('7777');

    await context.setOffline(true);
    try {
      await page.getByTestId('cardio-target-minutes').fill('12');
      await expect(page.getByTestId('cardio-offline')).toBeVisible();
      await expect(page.getByTestId('cardio-save')).toBeDisabled();
    } finally {
      await context.setOffline(false);
    }
    await page.getByTestId('cardio-save').click();
    await expect(page.getByTestId('cardio-clean').or(page.getByTestId('cardio-saved'))).toBeVisible();
    expect(await db.findOne('coachTargets', { _id: C.full.id })).toMatchObject({ steps: 7777, cardioMin: 12, waterMl: 3500 });
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('plan-editor-draft-restored')).toHaveCount(0); // a saved draft is gone

    await page.getByTestId('cardio-target-steps').fill('6000');
    await page.reload();
    await ready(page);
    await page.getByTestId('plan-editor-discard-draft').click();
    await expect(page.getByTestId('cardio-target-steps')).toHaveValue('7777');
    await expect(page.getByTestId('cardio-clean')).toBeVisible();
    expect(await db.findOne('coachTargets', { _id: C.full.id })).toMatchObject({ steps: 7777 });
  });

  test('owner review: a plan draft made before another tab saved comes back as stale — saving asks (keep mine / load latest), never overwrites silently', async ({ as, db, audit }) => {
    allowDevModuleStorm(audit);
    const a = await as('coachPro', sized(1440));
    const b = await as('coachPro', sized(1440));
    for (const t of [a, b]) t.page.on('dialog', (d) => void d.accept());
    await openEditor(a.page, 'cardio');
    await openEditor(b.page, 'cardio');
    await a.page.getByTestId('cardio-plan-name').fill('Name from tab A');
    await expect(a.page.getByTestId('cardio-unsaved')).toBeVisible();
    await b.page.getByTestId('cardio-plan-name').fill('Name from tab B');
    await b.page.getByTestId('cardio-save').click();
    await expect(b.page.getByTestId('cardio-clean').or(b.page.getByTestId('cardio-saved'))).toBeVisible();

    await a.page.reload();
    await ready(a.page);
    await expect(a.page.getByTestId('cardio-plan-name')).toHaveValue('Name from tab A');
    await expect(a.page.getByTestId('plan-editor-draft-restored').locator('[data-stale]')).toBeVisible();
    await a.page.getByTestId('cardio-save').click();
    await expect(a.page.getByTestId('plan-editor-conflict')).toBeVisible();
    expect((await db.findOne<{ name: string }>('clientCardioPlans', { _id: C.full.id }))!.name).toBe('Name from tab B');
    await a.page.getByTestId('plan-editor-keep-mine').click();
    await expect(a.page.getByTestId('cardio-clean').or(a.page.getByTestId('cardio-saved'))).toBeVisible();
    expect((await db.findOne<{ name: string }>('clientCardioPlans', { _id: C.full.id }))!.name).toBe('Name from tab A');
    // B's version stays in History (restorable).
    expect(await db.count('planVersions', { clientId: C.full.id, kind: 'cardio' })).toBeGreaterThan(1);
  });

  test('owner review: the targets conflict panel and the stale-draft notice — EN + AR at 390, no overflow, axe 0', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const found: Record<string, string[]> = {};
    for (const lang of ['en', 'ar'] as const) {
      await db.updateOne('coachTargets', { _id: C.full.id }, { $set: { steps: 8000 }, $unset: { cardioMin: '' } });
      const { page } = await as('coachPro', phone);
      page.on('dialog', (d) => void d.accept());
      if (lang === 'ar') await setLanguage(page, 'العربية');
      try {
        await openEditor(page, 'cardio');
        await page.getByTestId('cardio-target-steps').fill('9100');
        await db.updateOne('coachTargets', { _id: C.full.id }, { $set: { steps: 12000 } }); // saved elsewhere meanwhile
        await page.reload();
        await ready(page);
        await expect(page.getByTestId('plan-editor-draft-restored').locator('[data-stale]')).toBeVisible();
        await page.getByTestId('cardio-save').click();
        await expect(page.getByTestId('cardio-targets-conflict')).toBeVisible();
        await page.getByTestId('cardio-targets-conflict').scrollIntoViewIfNeeded();
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
        await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe(lang === 'ar' ? 'rtl' : 'ltr');
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        found[lang] = r.violations.map((v) => `${v.id} × ${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
        await shot(page, testInfo, `targets-conflict-${lang}-390`);
        await page.getByTestId('cardio-targets-use-theirs').click();
        await expect(page.getByTestId('cardio-target-steps')).toHaveValue('12000');
      } finally {
        if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
      }
    }
    expect(found).toEqual({ en: [], ar: [] });
  });

  test('Arabic: right-to-left editors with Arabic labels; the client\'s own text keeps its direction', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro', sized(1440));
    await setLanguage(page, 'العربية');
    try {
      await openEditor(page, 'workout');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByTestId('workout-clean')).toHaveText(ar.trust.planEditor.barClean);
      await expect(page.getByTestId('builder-add-section')).toContainText(ar.coachEditor.addSection);
      await shot(page, testInfo, 'training-ar-1440');
      await openEditor(page, 'nutrition');
      await expect(page.getByTestId('nutrition-totals')).toContainText(ar.nutrition.calories);
      await shot(page, testInfo, 'nutrition-ar-1440');
    } finally {
      await setLanguage(page, 'English').catch(() => undefined);
    }
  });

  test('accessibility: the three editors and their sheets — no axe violations (WCAG 2.1 A / AA, EN + AR, 390 + 1440)', async ({ as, audit }, testInfo) => {
    test.setTimeout(300_000);
    allowDevModuleStorm(audit);
    const found: Record<string, string[]> = {};
    const scan = async (page: Page, name: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      found[name] = r.violations.map((v) => `${v.id} × ${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
    };
    for (const lang of ['en', 'ar'] as const) {
      for (const ctx of [phone, sized(1440)] as const) {
        const { page } = await as('coachPro', ctx);
        const w = ctx === phone ? 390 : 1440;
        if (lang === 'ar') await setLanguage(page, 'العربية');
        try {
          await openEditor(page, 'workout');
          if (w === 390) await page.getByTestId('builder-day-card').first().click();
          await scan(page, `${lang}-${w}-workout`);
          await page.getByTestId('builder-exercise-open').first().click();
          await expect(page.getByTestId('exercise-programming')).toBeVisible();
          await scan(page, `${lang}-${w}-programming-sheet`);
          await page.getByTestId('sheet-close').last().click();
          await openEditor(page, 'nutrition');
          await scan(page, `${lang}-${w}-nutrition`);
          await page.getByTestId('nutrition-food-row').first().getByRole('button').first().click();
          await expect(page.getByTestId('food-form')).toBeVisible();
          await scan(page, `${lang}-${w}-food-sheet`);
          await page.getByTestId('sheet-close').last().click();
          await openEditor(page, 'cardio');
          await scan(page, `${lang}-${w}-cardio`);
        } finally {
          if (lang === 'ar') await setLanguage(page, 'English').catch(() => undefined);
        }
      }
    }
    await testInfo.attach('axe-editors.json', { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
    expect(Object.entries(found).filter(([, v]) => v.length > 0)).toEqual([]);
  });

  test('visual QA matrix: the three editors at 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR (+ Egyptian Arabic)', async ({ as, audit }, testInfo) => {
    test.setTimeout(900_000);
    allowDevModuleStorm(audit);
    const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b35-visual');
    fs.mkdirSync(outDir, { recursive: true });
    const shots: { name: string; overflow: number; dir: string }[] = [];
    const plan: { w: number; lang: 'en' | 'ar' | 'ar-eg'; kinds: ('workout' | 'nutrition' | 'cardio')[] }[] = [];
    for (const w of [390, 1440]) for (const lang of ['en', 'ar'] as const) plan.push({ w, lang, kinds: ['workout', 'nutrition', 'cardio'] });
    for (const w of [360, 430, 768, 1024]) for (const lang of ['en', 'ar'] as const) plan.push({ w, lang, kinds: ['workout', 'nutrition'] });
    for (const w of [390, 1440]) plan.push({ w, lang: 'ar-eg', kinds: ['workout'] });
    for (const p of plan) {
      const { page } = await as('coachPro', p.w <= 430 ? { ...devices['Pixel 7'], viewport: { width: p.w, height: 844 } } : sized(p.w));
      if (p.lang !== 'en') await setLanguage(page, p.lang === 'ar' ? 'العربية' : 'مصري');
      try {
        for (const kind of p.kinds) {
          await openEditor(page, kind);
          await page.waitForTimeout(300);
          const name = `${kind}-${p.w}-${p.lang}`;
          await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
          shots.push({ name, overflow: await overflowOf(page), dir: await page.evaluate(() => document.documentElement.dir) });
          if (kind === 'workout' && p.w < 1024) {
            await page.getByTestId('builder-day-card').first().click();
            await page.screenshot({ path: path.join(outDir, `${name}-day.png`), fullPage: true });
            shots.push({ name: `${name}-day`, overflow: await overflowOf(page), dir: await page.evaluate(() => document.documentElement.dir) });
          }
        }
      } finally {
        if (p.lang !== 'en') await setLanguage(page, 'English').catch(() => undefined);
      }
    }
    fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(shots, null, 2));
    expect(shots.filter((s) => s.overflow > 0)).toEqual([]);
    expect(shots.filter((s) => s.dir !== (s.name.endsWith('-en') || s.name.endsWith('-en-day') ? 'ltr' : 'rtl'))).toEqual([]);
  });
});
