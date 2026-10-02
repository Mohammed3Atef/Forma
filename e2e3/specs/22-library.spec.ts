import { test, expect, shot } from '../fixtures';
import type { Page } from '@playwright/test';
import { appReady, confirmYes, expectToast, fullAssessment, uniq } from './_b-helpers';

/**
 * Starter library (two coaches, idempotent re-run) and library → template →
 * client-plan sync semantics on coachA.
 */

test.setTimeout(180_000);

const A = 'e2e-coach-a';
const B = 'e2e-coach-b';
const CA = 'e2e-client-a';
const COLS = ['coachExercises', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachWorkoutTemplates'] as const;

interface LibEx { id: string; name: string; videoUrl?: string }
interface TplEx { name: string; videoUrl?: string; workingSets: number; repRange: string; libraryExerciseId?: string; librarySyncEnabled?: boolean }

test.beforeAll(async ({ db }) => {
  // Setup: clientA needs a complete assessment for the client workout editor (E-B-1).
  await db.updateOne('clientProfiles', { _id: CA }, { $set: { assessment: fullAssessment('Client Aya') } });
});

test('starter library: coachA and coachB both load it; shared ids; idempotent re-run', async ({ as, db }, testInfo) => {
  // coachA — from the Library page.
  const { page: a } = await as('coachA');
  await a.goto('/coach/library');
  await appReady(a, 'lib-load-starter');
  await a.getByTestId('lib-load-starter').click();
  await confirmYes(a);
  await expectToast(a, 'Starter library added');
  await expect(a.getByTestId('toast').filter({ hasText: /failed|Some categories/i })).toHaveCount(0);
  await expect(a.getByTestId('coach-desktop-library').getByTestId('data-row').first()).toBeVisible({ timeout: 20_000 });
  await shot(a, testInfo, '01-coachA-exercises');

  // coachB — from the Templates empty state (LoadStarterLibraryButton).
  const { page: b } = await as('coachB');
  await b.goto('/coach/templates');
  await appReady(b, 'load-starter-library');
  await b.getByTestId('load-starter-library').click();
  await confirmYes(b);
  const done = b.getByTestId('confirm-dialog');
  await expect(done).toContainText('Starter library added', { timeout: 60_000 });
  await expect(done).not.toContainText(/failed|Some categories/i);
  await expect(done).not.toContainText(/duplicate key|E11000/i);
  await shot(b, testInfo, '02-coachB-loaded-dialog');
  await done.getByTestId('confirm-accept').click();
  await expect(b.getByTestId('template-card').first()).toBeVisible();
  await shot(b, testInfo, '03-coachB-templates');

  // Every tab populated (coachB, UI).
  await b.goto('/coach/library');
  await appReady(b, 'lib-tab-exercises');
  await expect(b.getByTestId('coach-desktop-library').getByTestId('data-row').first()).toBeVisible({ timeout: 20_000 });
  await b.getByTestId('lib-tab-foods').click();
  await expect(b.getByTestId('coach-desktop-foods').getByTestId('data-row').first()).toBeVisible();
  await b.getByTestId('lib-tab-groups').click();
  await expect(b.getByTestId('group-item').first()).toBeVisible();
  await b.getByTestId('lib-tab-supplements').click();
  await expect(b.getByTestId('supp-item').first()).toBeVisible();
  await shot(b, testInfo, '04-coachB-supplements');

  // DB: per-coach counts equal, same logical ids.
  const counts: Record<string, [number, number]> = {};
  for (const c of COLS) counts[c] = [await db.count(c, { coachId: A }), await db.count(c, { coachId: B })];
  testInfo.annotations.push({ type: 'starter-counts', description: JSON.stringify(counts) });
  for (const c of COLS) {
    expect(counts[c][0], `${c} count coachA`).toBeGreaterThan(0);
    expect(counts[c][0], `${c} per-coach counts equal`).toBe(counts[c][1]);
  }
  const idsA = new Set((await db.find<{ id: string }>('coachExercises', { coachId: A })).map((e) => e.id));
  const idsB = (await db.find<{ id: string }>('coachExercises', { coachId: B })).map((e) => e.id);
  const shared = idsB.filter((id) => idsA.has(id)).length;
  expect(shared).toBeGreaterThan(0);
  expect(shared).toBe(idsB.length);

  // Re-run for coachA → idempotent.
  await a.getByTestId('lib-load-starter').click();
  await confirmYes(a);
  await expect(a.getByTestId('toast').filter({ hasText: 'Starter library added' }).first()).toBeVisible();
  await a.waitForTimeout(1_000);
  for (const c of COLS) expect(await db.count(c, { coachId: A }), `${c} unchanged after re-run`).toBe(counts[c][0]);
  await shot(a, testInfo, '05-coachA-rerun');
});

/* ---------------- library sync ---------------- */

async function openLibraryEdit(page: Page, name: string) {
  await page.goto('/coach/library');
  await appReady(page, 'lib-search');
  await page.getByTestId('lib-search').fill(name);
  await page.getByTestId('coach-desktop-library').getByTestId('data-row').filter({ hasText: name }).first().click();
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

/** In an open PlanBuilder: day card → "Main" section. */
async function openSection(page: Page) {
  await page.getByTestId('builder-day-card').first().click();
  await page.getByTestId('builder-day').getByRole('button', { name: /Main/ }).click();
  await expect(page.getByTestId('builder-section')).toBeVisible();
}

test('library sync: template follows library identity/media, keeps programming; client plan only on "Update from library"; override + reconnect', async ({ as, db }, testInfo) => {
  const { page } = await as('coachA');
  const base = uniq('E2E Sync Squat');
  const v1 = 'https://cdn.example.test/v1.mp4';

  // 1) A library exercise (own, independent of the starter set).
  await page.goto('/coach/library');
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
  await page.getByTestId('lib-search').fill(base);
  await page.getByTestId('coach-desktop-library').getByTestId('data-row').filter({ hasText: base }).click();
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
  await page.getByTestId('picker-search').fill(base);
  await page.getByTestId('picker-lib-item').filter({ hasText: base }).click();
  await page.getByTestId('picker-add-selected').click();
  const section = page.getByTestId('builder-section');
  await section.getByRole('button', { name: new RegExp(base) }).click();
  await expect(page.getByText('Linked to library')).toBeVisible();
  await page.getByTestId('ex-working-sets').fill('5');
  await page.getByTestId('ex-reps').fill('5');
  await page.getByTestId('ex-save').click();
  await expect(section).toContainText('5 × 5');
  await expect(page.getByTestId('toast').filter({ hasText: 'Make this a custom override?' })).toHaveCount(0); // programming edit never detaches
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
  await expect(page.getByTestId('builder-section')).toContainText('🎬');
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
  await sec.getByRole('button', { name: new RegExp(v2name) }).click();
  await page.getByRole('button', { name: 'Update from library' }).click();
  await expect(sec).toContainText(v3name);
  await expect(sec).toContainText('5 × 5');
  expect(await planEx()).toMatchObject({ name: v3name, videoUrl: v3, workingSets: 5, repRange: '5', librarySyncEnabled: true });
  await shot(page, testInfo, '06-client-plan-updated');
  // The refresh is already persisted server-side; record whether the editor still claims unsaved changes.
  testInfo.annotations.push({ type: 'unsaved-after-update-from-library', description: String(await page.getByTestId('workout-unsaved').isVisible()) });
  // The coach can still Save the client plan afterwards (E-B-2: nulls written by the refresh).
  await page.getByTestId('workout-save').click();
  await expect.soft(page.getByTestId('workout-saved'), 'client plan saves after Update from library').toBeVisible();
  await shot(page, testInfo, '06b-client-plan-save-after-update');

  // 7) Override (sync off) on the template exercise — link kept.
  await page.goto(`/coach/templates/${tplId}/edit`);
  await appReady(page, 'builder-plan');
  await openSection(page);
  await page.getByTestId('builder-section').getByRole('button', { name: new RegExp(v3name) }).click();
  const custom = `${base} (my cue)`;
  await page.getByTestId('ex-name').fill(custom);
  await page.getByTestId('ex-save').click();
  await expectToast(page, 'Make this a custom override?');
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
  await page.getByTestId('builder-section').getByRole('button', { name: new RegExp(custom.replace(/[()]/g, '\\$&')) }).click();
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
  await page.goto('/coach/library');
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
  await page.getByTestId('picker-search').fill(base);
  await page.getByTestId('picker-lib-item').filter({ hasText: base }).click();
  await page.getByTestId('picker-add-selected').click();
  // Override a synced field (name) → sync off, link kept.
  const custom = `${base} custom`;
  await page.getByTestId('builder-section').getByRole('button', { name: new RegExp(base) }).click();
  await page.getByTestId('ex-name').fill(custom);
  await page.getByTestId('ex-working-sets').fill('4');
  await page.getByTestId('ex-save').click();
  await expectToast(page, 'Make this a custom override?');
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
  await page.getByTestId('builder-section').getByRole('button', { name: new RegExp(custom) }).click();
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
