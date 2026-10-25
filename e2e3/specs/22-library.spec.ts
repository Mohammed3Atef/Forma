import { test, expect, shot } from '../fixtures';
import type { Page } from '@playwright/test';
import { appReady, confirmYes, expectToast, fullAssessment, uniq } from './_b-helpers';

/**
 * The shared library (B4.3: no starter import — every coach has Forma's exercises and foods from
 * the first visit) and library → template → client-plan sync semantics on coachA.
 *
 * Selectors: the Library opens on Programs, so exercises are `?tab=exercises`; Exercises and Foods
 * are ONE server-searched list each (`lib-exercises` / `lib-foods`, rows `library-exercise-row` /
 * `library-food-row`); `/coach/templates` is Library › Programs; swap groups are inside Foods.
 */

test.setTimeout(180_000);

const A = 'e2e-coach-a';
const B = 'e2e-coach-b';
const CA = 'e2e-client-a';
const COLS = ['coachExercises', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachWorkoutTemplates', 'coachFavorites'] as const;

interface LibEx { id: string; name: string; videoUrl?: string }
interface TplEx { name: string; videoUrl?: string; workingSets: number; repRange: string; libraryExerciseId?: string; librarySyncEnabled?: boolean }

test.beforeAll(async ({ db }) => {
  // Setup: clientA needs a complete assessment for the client workout editor (E-B-1).
  await db.updateOne('clientProfiles', { _id: CA }, { $set: { assessment: fullAssessment('Client Aya') } });
});

test('shared library: a coach has every Forma exercise and food at once — nothing to import, nothing copied', async ({ as, db }, testInfo) => {
  const before: Record<string, number> = {};
  for (const c of COLS) before[c] = await db.count(c, { coachId: B });

  // The old Templates URL is Library › Programs; an empty list offers to create, never to import.
  const { page: b } = await as('coachB');
  await b.goto('/coach/templates');
  await expect(b).toHaveURL(/\/coach\/library\?tab=programs$/);
  await appReady(b, 'lib-tab-exercises');
  await expect(b.getByTestId('load-starter-library')).toHaveCount(0);
  await expect(b.getByTestId('lib-more')).toHaveCount(0);
  await expect(b.getByText(/starter library/i)).toHaveCount(0);

  // Exercises: Forma's 1,343 (plus anything coachB made), with pictures, on the first visit.
  await b.getByTestId('lib-tab-exercises').click();
  const ex = b.getByTestId('lib-exercises');
  await expect(ex.getByTestId('library-exercise-row').first()).toBeVisible({ timeout: 20_000 });
  const exCount = Number((await b.getByTestId('lib-exercises-count').innerText()).replace(/\D/g, ''));
  expect(exCount).toBeGreaterThanOrEqual(1343);
  await expect(ex.getByTestId('library-exercise-row')).toHaveCount(30);
  await shot(b, testInfo, '01-coachB-exercises');

  // Foods: all 190, most with their picture.
  await b.getByTestId('lib-tab-foods').click();
  const foods = b.getByTestId('lib-foods');
  await expect(foods.getByTestId('library-food-row').first()).toBeVisible({ timeout: 20_000 });
  expect(Number((await b.getByTestId('lib-foods-count').innerText()).replace(/\D/g, ''))).toBeGreaterThanOrEqual(190);
  expect(await foods.locator('[data-testid="food-thumb"][data-has-image="true"]').count()).toBeGreaterThan(15);
  await shot(b, testInfo, '02-coachB-foods');

  // Nothing was copied into coachB's records by looking.
  for (const c of COLS) expect(await db.count(c, { coachId: B }), `${c} unchanged`).toBe(before[c]);
});

/* ---------------- library sync ---------------- */

/** Library › Exercises › My exercises, searched; opens the coach's own exercise. */
async function openOwn(page: Page, name: string) {
  await page.getByTestId('lib-exercises-scope-mine').click();
  await page.getByTestId('lib-exercises-search').fill(name);
  await page.getByTestId('library-exercise-row').filter({ hasText: name }).first().getByTestId('library-row-main').click();
}

async function openLibraryEdit(page: Page, name: string) {
  await page.goto('/coach/library?tab=exercises');
  await appReady(page, 'lib-exercises-search');
  await openOwn(page, name);
  await expect(page.getByTestId('exercise-view')).toBeVisible();
  await page.getByTestId('exercise-view-edit').click();
  await expect(page.getByTestId('exercise-form')).toBeVisible();
}

async function editLibrary(page: Page, from: string, to: string, video: string) {
  await openLibraryEdit(page, from);
  await page.getByTestId('ex-name').fill(to);
  await page.getByTestId('ex-video').fill(video);
  await page.getByTestId('ex-save').click();
  await expectToast(page, 'Saved');
}

/** The exercise picker: the coach's own exercise by name (one list with Forma's), added. */
async function pickOwn(page: Page, name: string) {
  await page.getByTestId('picker-library-search').fill(name);
  await page.getByTestId('exercise-picker').getByTestId('library-exercise-row').filter({ hasText: name }).first().getByTestId('library-row-main').click();
  await page.getByTestId('picker-add-selected').click();
}

/** In an open training editor: the first day — its sections are shown in the day (B3.5: no section level). */
async function openSection(page: Page) {
  await page.getByTestId('builder-day-card').first().click();
  await expect(page.getByTestId('builder-section').first()).toBeVisible();
  await expect(page.getByTestId('section-title').first()).toHaveValue('Main');
}
/** An exercise row's open button (B3.5: its move / options buttons are named after the exercise too). */
const exerciseRow = (scope: ReturnType<Page['getByTestId']>, name: string) => scope.getByTestId('builder-exercise-open').filter({ hasText: name });

test('library sync: template follows library identity/media, keeps programming; client plan only on "Update from library"; override + reconnect', async ({ as, db }, testInfo) => {
  const { page } = await as('coachA');
  const base = uniq('E2E Sync Squat');
  const v1 = 'https://cdn.example.test/v1.mp4';

  // 1) A library exercise (own, independent of the starter set).
  await page.goto('/coach/library?tab=exercises');
  await appReady(page, 'lib-new');
  await page.getByTestId('lib-new').click();
  await page.getByTestId('ex-name').fill(base);
  await page.getByTestId('ex-target').fill('Quads');
  await page.getByTestId('ex-working-sets').fill('3');
  await page.getByTestId('ex-reps').fill('8-12');
  await page.getByTestId('ex-video').fill(v1);
  await page.getByTestId('ex-save').click();
  await expectToast(page, 'Saved');
  const lib = await db.findOne<LibEx>('coachExercises', { coachId: A, name: base });
  expect(lib?.videoUrl).toBe(v1);
  const libId = lib!.id;

  // Open it (view sheet).
  await openOwn(page, base);
  await expect(page.getByTestId('exercise-view')).toBeVisible();
  await shot(page, testInfo, '01-library-exercise-view');
  await page.keyboard.press('Escape');

  // 2) New template with that exercise; customize programming (sets/reps).
  const tplName = uniq('Sync Template');
  await page.goto('/coach/templates/new');
  await appReady(page, 'template-name');
  await page.getByTestId('template-name').fill(tplName);
  await page.getByTestId('builder-add-day').click();
  await page.getByTestId('builder-add-section').click();
  await page.getByTestId('section-title').fill('Main');
  await page.getByTestId('builder-add-exercise').click();
  await pickOwn(page, base);
  const section = page.getByTestId('builder-section');
  await exerciseRow(section, base).click();
  await expect(page.getByText('Linked to library')).toBeVisible();
  await page.getByTestId('ex-working-sets').fill('5');
  await page.getByTestId('ex-reps').fill('5');
  await page.getByTestId('ex-save').click();
  await expect(section).toContainText('5 × 5');
  await expect(page.getByTestId('toast').filter({ hasText: 'Now a custom version for this client' })).toHaveCount(0); // programming edit never detaches
  await page.getByTestId('template-save').click();
  await expect(page).toHaveURL(/\/coach\/templates\/(?!new$)[^/]+$/);
  await expect(page.getByTestId('template-preview')).toBeVisible();
  const tpl = await db.findOne<{ id: string; exercises: Record<string, TplEx> }>('coachWorkoutTemplates', { coachId: A, name: tplName });
  const tplId = tpl!.id;
  const tplEx = () => db.findOne<{ exercises: Record<string, TplEx> }>('coachWorkoutTemplates', { coachId: A, id: tplId }).then((d) => Object.values(d!.exercises)[0]);
  expect(await tplEx()).toMatchObject({ name: base, workingSets: 5, repRange: '5', libraryExerciseId: libId, librarySyncEnabled: true, videoUrl: v1 });
  await shot(page, testInfo, '02-template-saved');

  // 3) Edit the LIBRARY exercise name + video → template follows, keeps 5×5.
  const v2name = `${base} v2`;
  const v2 = 'https://cdn.example.test/v2.mp4';
  await editLibrary(page, base, v2name, v2);
  await expectToast(page, '1 template updated');
  expect(await tplEx()).toMatchObject({ name: v2name, videoUrl: v2, workingSets: 5, repRange: '5', librarySyncEnabled: true });
  // Propagation must not write nulls for fields the library exercise doesn't have (E-B-2).
  const nullsInTemplate = Object.entries((await tplEx()) as unknown as Record<string, unknown>).filter(([k, v]) => v === null && k !== 'videoId').map(([k]) => k); // videoId is nullable BY CONTRACT (z.string().nullable(): null = no video)
  testInfo.annotations.push({ type: 'template-null-fields-after-sync', description: JSON.stringify(nullsInTemplate) });
  expect.soft(nullsInTemplate, 'synced template exercise has null fields').toEqual([]);
  await page.goto(`/coach/templates/${tplId}/edit`);
  await appReady(page, 'builder-plan');
  await openSection(page);
  await expect(page.getByTestId('builder-section')).toContainText(v2name);
  await expect(page.getByTestId('builder-section')).toContainText('5 × 5');
  await expect(page.getByTestId('builder-section').getByTestId('ex-row-video')).toHaveCount(1);
  await shot(page, testInfo, '03-template-follows-library');

  // 4) Assign the template to clientA.
  await page.goto(`/coach/templates/${tplId}`);
  await appReady(page, 'template-assign');
  await page.getByTestId('template-assign').click();
  await page.getByTestId('assign-client').filter({ hasText: 'Client Aya' }).click();
  await confirmYes(page);
  await expect(page.getByTestId('assign-client').filter({ hasText: 'Client Aya' }).locator('svg')).toBeVisible();
  const planEx = () => db.findOne<{ exercises: Record<string, TplEx & { id: string }> }>('clientWorkoutPlans', { _id: CA }).then((d) => Object.values(d!.exercises)[0]);
  expect(await planEx()).toMatchObject({ name: v2name, videoUrl: v2, workingSets: 5, repRange: '5', libraryExerciseId: libId });
  await shot(page, testInfo, '04-assigned');

  // 5) Edit library again → client plan does NOT change.
  const v3name = `${base} v3`;
  const v3 = 'https://cdn.example.test/v3.mp4';
  await editLibrary(page, v2name, v3name, v3);
  expect(await planEx()).toMatchObject({ name: v2name, videoUrl: v2 });

  // 6) Client workout editor → "Update from library" → identity/media refreshed, programming kept.
  await page.goto(`/coach/client/${CA}/workout`);
  await appReady(page, 'builder-plan');
  await openSection(page);
  const sec = page.getByTestId('builder-section');
  await expect(sec).toContainText(v2name);
  await shot(page, testInfo, '05-client-plan-before-update');
  await exerciseRow(sec, v2name).click();
  await page.getByRole('button', { name: 'Update from library' }).click();
  await expect(sec).toContainText(v3name);
  await expect(sec).toContainText('5 × 5');
  await shot(page, testInfo, '06-client-plan-updated');
  // Since B0 (CO-01) the refresh is an edit in the editor, persisted only by the guarded Save
  // (the unguarded server-side rewrite was removed) — so it is unsaved until the coach saves.
  await expect(page.getByTestId('workout-unsaved')).toBeVisible();
  expect(await planEx()).toMatchObject({ name: v2name, videoUrl: v2 });
  await page.getByTestId('workout-save').click();
  await expect(page.getByTestId('workout-saved'), 'client plan saves after Update from library').toBeVisible();
  expect(await planEx()).toMatchObject({ name: v3name, videoUrl: v3, workingSets: 5, repRange: '5', librarySyncEnabled: true });
  await shot(page, testInfo, '06b-client-plan-save-after-update');

  // 7) Override (sync off) on the template exercise — link kept.
  await page.goto(`/coach/templates/${tplId}/edit`);
  await appReady(page, 'builder-plan');
  await openSection(page);
  await exerciseRow(page.getByTestId('builder-section'), v3name).click();
  const custom = `${base} (my cue)`;
  await page.getByTestId('ex-name').fill(custom);
  await page.getByTestId('ex-save').click();
  await expectToast(page, 'Now a custom version for this client');
  await page.getByTestId('template-save').click();
  // A template that has received a library sync must still be saveable (E-B-2).
  await expect(page.getByText(/invalid_type/)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/coach/templates/${tplId}$`));
  expect(await tplEx()).toMatchObject({ name: custom, libraryExerciseId: libId, librarySyncEnabled: false, workingSets: 5 });

  const v4name = `${base} v4`;
  await editLibrary(page, v3name, v4name, 'https://cdn.example.test/v4.mp4');
  await expect(page.getByTestId('toast').filter({ hasText: 'template updated' })).toHaveCount(0);
  expect(await tplEx()).toMatchObject({ name: custom, librarySyncEnabled: false });
  await shot(page, testInfo, '07-override-not-propagated');

  // 8) Reconnect → takes library values, and later edits propagate again.
  await page.goto(`/coach/templates/${tplId}/edit`);
  await appReady(page, 'builder-plan');
  await openSection(page);
  await exerciseRow(page.getByTestId('builder-section'), custom).click();
  await expect(page.getByText('Custom override — automatic library updates are disabled for this exercise')).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect to library' }).click();
  await expect(page.getByTestId('builder-section')).toContainText(v4name);
  await page.getByTestId('template-save').click();
  await expect(page).toHaveURL(new RegExp(`/coach/templates/${tplId}$`));
  expect(await tplEx()).toMatchObject({ name: v4name, librarySyncEnabled: true, workingSets: 5, repRange: '5' });
  const v5name = `${base} v5`;
  await editLibrary(page, v4name, v5name, 'https://cdn.example.test/v5.mp4');
  await expectToast(page, '1 template updated');
  expect(await tplEx()).toMatchObject({ name: v5name, videoUrl: 'https://cdn.example.test/v5.mp4', workingSets: 5 });
  await shot(page, testInfo, '08-reconnected');
});

test('library sync: override on a fresh (never-synced) template → not propagated → reconnect → propagates again', async ({ as, db }, testInfo) => {
  const { page } = await as('coachA');
  const base = uniq('E2E Fresh Lunge');
  await page.goto('/coach/library?tab=exercises');
  await appReady(page, 'lib-new');
  await page.getByTestId('lib-new').click();
  await page.getByTestId('ex-name').fill(base);
  await page.getByTestId('ex-video').fill('https://cdn.example.test/f1.mp4');
  await page.getByTestId('ex-save').click();
  await expectToast(page, 'Saved');
  const libId = (await db.findOne<LibEx>('coachExercises', { coachId: A, name: base }))!.id;

  const tplName = uniq('Fresh Template');
  await page.goto('/coach/templates/new');
  await appReady(page, 'template-name');
  await page.getByTestId('template-name').fill(tplName);
  await page.getByTestId('builder-add-day').click();
  await page.getByTestId('builder-add-section').click();
  await page.getByTestId('section-title').fill('Main');
  await page.getByTestId('builder-add-exercise').click();
  await pickOwn(page, base);
  // Override a synced field (name) → sync off, link kept.
  const custom = `${base} custom`;
  await exerciseRow(page.getByTestId('builder-section'), base).click();
  await page.getByTestId('ex-name').fill(custom);
  await page.getByTestId('ex-working-sets').fill('4');
  await page.getByTestId('ex-save').click();
  await expectToast(page, 'Now a custom version for this client');
  await page.getByTestId('template-save').click();
  await expect(page.getByTestId('template-preview')).toBeVisible();
  const tplId = (await db.findOne<{ id: string }>('coachWorkoutTemplates', { coachId: A, name: tplName }))!.id;
  const tplEx = () => db.findOne<{ exercises: Record<string, TplEx> }>('coachWorkoutTemplates', { coachId: A, id: tplId }).then((d) => Object.values(d!.exercises)[0]);
  expect(await tplEx()).toMatchObject({ name: custom, libraryExerciseId: libId, librarySyncEnabled: false, workingSets: 4 });

  // Library edit does not propagate to the overridden copy.
  await editLibrary(page, base, `${base} L2`, 'https://cdn.example.test/f2.mp4');
  await expect(page.getByTestId('toast').filter({ hasText: 'template updated' })).toHaveCount(0);
  expect(await tplEx()).toMatchObject({ name: custom, librarySyncEnabled: false });
  await shot(page, testInfo, '01-override-not-propagated');

  // Reconnect → library identity/media back, programming kept.
  await page.goto(`/coach/templates/${tplId}/edit`);
  await appReady(page, 'builder-plan');
  await openSection(page);
  await exerciseRow(page.getByTestId('builder-section'), custom).click();
  await expect(page.getByText('Custom override — automatic library updates are disabled for this exercise')).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect to library' }).click();
  await expect(page.getByTestId('builder-section')).toContainText(`${base} L2`);
  await expect(page.getByTestId('builder-section')).toContainText('4 ×');
  await page.getByTestId('template-save').click();
  await expect(page.getByText(/invalid_type/)).toHaveCount(0);
  await expect(page.getByTestId('template-preview')).toBeVisible();
  expect(await tplEx()).toMatchObject({ name: `${base} L2`, videoUrl: 'https://cdn.example.test/f2.mp4', librarySyncEnabled: true, workingSets: 4 });
  await shot(page, testInfo, '02-reconnected');

  // Later library edits propagate again.
  await editLibrary(page, `${base} L2`, `${base} L3`, 'https://cdn.example.test/f3.mp4');
  await expectToast(page, '1 template updated');
  expect(await tplEx()).toMatchObject({ name: `${base} L3`, videoUrl: 'https://cdn.example.test/f3.mp4', workingSets: 4, librarySyncEnabled: true });
});

test('restore seed state (clientA plan/assessment)', async ({ db }) => {
  await db.deleteMany('clientWorkoutPlans', { _id: CA });
  await db.deleteMany('planVersions', { clientId: CA });
  expect(await db.count('clientWorkoutPlans', { _id: CA })).toBe(0);
});
