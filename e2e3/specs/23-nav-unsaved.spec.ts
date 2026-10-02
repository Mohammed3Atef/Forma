import { test, expect, shot } from '../fixtures';
import type { Page } from '@playwright/test';
import { appReady, confirmNo, confirmYes, fullAssessment } from './_b-helpers';

/**
 * Unsaved-changes guard in the coach client workout editor, and back/forward
 * history behaviour across the client workspace and messages (coachA/clientA).
 */

test.setTimeout(120_000);

const CA = 'e2e-client-a';
const EDITOR = `/coach/client/${CA}/workout`;
const BASE_NAME = 'Nav Baseline Plan';

test.beforeAll(async ({ db }) => {
  // Setup: complete assessment so the editor renders (E-B-1).
  await db.updateOne('clientProfiles', { _id: CA }, { $set: { assessment: fullAssessment('Client Aya') } });
});

/** Open the editor and make sure a saved plan named BASE_NAME exists (not dirty). */
async function openCleanEditor(page: Page) {
  await page.goto(EDITOR);
  await appReady(page, 'workout-plan-name');
  const name = page.getByTestId('workout-plan-name');
  if ((await name.inputValue()) !== BASE_NAME) {
    await name.fill(BASE_NAME);
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('workout-saved')).toBeVisible();
  }
  await expect(page.getByTestId('workout-unsaved')).toHaveCount(0);
}

async function makeDirty(page: Page, suffix: string) {
  await page.getByTestId('workout-plan-name').fill(`${BASE_NAME} ${suffix}`);
  await expect(page.getByTestId('workout-unsaved')).toBeVisible();
}

const guard = (page: Page) => page.getByTestId('confirm-dialog').filter({ hasText: 'Discard changes?' });

test('unsaved guard: sidebar item → Cancel keeps edits → Leave discards and navigates', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await openCleanEditor(page);
  await makeDirty(page, 'sidebar');

  await page.getByTestId('sidebar-coachClients').click();
  await expect(guard(page)).toBeVisible();
  await shot(page, testInfo, '01-sidebar-guard');
  await confirmNo(page);
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));
  await expect(page.getByTestId('workout-plan-name')).toHaveValue(`${BASE_NAME} sidebar`);
  await expect(page.getByTestId('workout-unsaved')).toBeVisible();

  await page.getByTestId('sidebar-coachClients').click();
  await expect(guard(page)).toBeVisible();
  await confirmYes(page);
  await expect(page).toHaveURL(/\/coach\/clients$/);
  await shot(page, testInfo, '02-left-to-clients');

  // "Discard changes?" → Leave: reopening shows the saved plan, not the edit.
  await page.goto(EDITOR);
  await appReady(page, 'workout-plan-name');
  await shot(page, testInfo, '03-reopened');
  await expect(page.getByTestId('workout-plan-name')).toHaveValue(BASE_NAME);
  await expect(page.getByTestId('workout-unsaved')).toHaveCount(0);
});

test('unsaved guard: top-bar avatar → Cancel stays → Leave goes to settings', async ({ as, env }) => {
  const { page } = await as('coachA');
  await openCleanEditor(page);
  await makeDirty(page, 'avatar');
  const avatar = page.getByRole('banner').getByRole('button', { name: 'Coach Amira' });
  await avatar.click();
  await expect(guard(page)).toBeVisible();
  await confirmNo(page);
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));
  await expect(page.getByTestId('workout-plan-name')).toHaveValue(`${BASE_NAME} avatar`);
  await avatar.click();
  await confirmYes(page);
  await expect(page).toHaveURL(/\/coach\/settings$/);
  expect(env.accounts.coachA.email).toBeTruthy();
});

test('unsaved guard: editor back arrow and workspace back arrow both confirm', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  // Arrive from the overview so back has somewhere in-app to go.
  await page.goto(`/coach/client/${CA}`);
  await appReady(page, 'coach-client-detail');
  await page.getByTestId('workspace-tab-workout').click();
  await appReady(page, 'workout-plan-name');
  const name = page.getByTestId('workout-plan-name');
  if ((await name.inputValue()) !== BASE_NAME) {
    await name.fill(BASE_NAME);
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('workout-saved')).toBeVisible();
  }
  await makeDirty(page, 'back');

  // Editor's own TopBar back arrow.
  const editorBack = page.getByTestId('coach-workout-editor').getByRole('button', { name: 'Back' });
  await editorBack.click();
  await expect(guard(page)).toBeVisible();
  await shot(page, testInfo, '01-editor-back-guard');
  await confirmNo(page);
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));

  // Workspace header back arrow (first "Back" in the workspace header).
  const wsBack = page.getByTestId('workspace-switch-trigger').locator('xpath=preceding-sibling::button[1]');
  await wsBack.click();
  await expect(guard(page)).toBeVisible();
  await confirmNo(page);
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));
  await expect(name).toHaveValue(`${BASE_NAME} back`);

  // Workspace tab rail also guarded.
  await page.getByTestId('workspace-tab-notes').click();
  await expect(guard(page)).toBeVisible();
  await confirmNo(page);
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));

  // Leave via the editor back arrow → leaves the editor.
  await editorBack.click();
  await confirmYes(page);
  await expect(page).not.toHaveURL(new RegExp(`${EDITOR}$`));
  await expect(page).toHaveURL(/\/coach\//);
  testInfo.annotations.push({ type: 'editor-back-landed', description: page.url() });
  await shot(page, testInfo, '02-after-leave');
});

test('unsaved guard: browser Back is NOT blocked (records actual behaviour)', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto(`/coach/client/${CA}`);
  await appReady(page, 'coach-client-detail');
  // In-app (pushState) history entry: overview → "Edit plan" → editor.
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));
  await appReady(page, 'workout-plan-name');
  const name = page.getByTestId('workout-plan-name');
  if ((await name.inputValue()) !== BASE_NAME) {
    await name.fill(BASE_NAME);
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('workout-saved')).toBeVisible();
  }
  await makeDirty(page, 'hwback');
  let nativeDialog = false;
  page.on('dialog', (d) => { nativeDialog = true; void d.accept(); });
  await page.goBack({ waitUntil: 'commit', timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  const appGuardShown = await guard(page).count();
  testInfo.annotations.push({ type: 'browser-back', description: JSON.stringify({ url: page.url(), appGuardShown, nativeDialog }) });
  await shot(page, testInfo, '01-after-browser-back');
  // Known limitation (useUnsavedGuard.ts doc comment): browser Back leaves without asking.
  expect(appGuardShown).toBe(0);
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}$`));
  // Where did the unsaved edit go? Reopen the editor in-app.
  await page.getByTestId('workspace-tab-workout').click();
  await appReady(page, 'workout-plan-name');
  testInfo.annotations.push({ type: 'browser-back-draft-restored', description: await name.inputValue() });
});

test('unsaved guard: after Save, navigating does not warn', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await openCleanEditor(page);
  await makeDirty(page, 'saved');
  await page.getByTestId('workout-save').click();
  await expect(page.getByTestId('workout-saved')).toBeVisible();
  await page.getByTestId('sidebar-coachClients').click();
  await expect(page).toHaveURL(/\/coach\/clients$/);
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await shot(page, testInfo, '01-no-warning');
  // Put the baseline name back for the other tests.
  await openCleanEditor(page);
});

/* ---------------- history ---------------- */

test('history: Clients → client → workout tab → notes tab → back arrow; browser Back/Forward', async ({ as, env }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto('/coach/clients');
  await appReady(page, 'coach-desktop-clients');
  const row = page.getByTestId('coach-desktop-clients').getByTestId('data-row').filter({ hasText: env.accounts.clientA.email });
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}$`));
  await page.getByTestId('workspace-tab-workout').click();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/workout$`));
  await page.getByTestId('workspace-tab-notes').click();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/notes$`));
  await shot(page, testInfo, '01-notes-tab');

  // In-app back arrow (workspace header): tabs are `replace`, so back leaves the workspace to Clients.
  await page.getByTestId('workspace-switch-trigger').locator('xpath=preceding-sibling::button[1]').click();
  await expect(page).toHaveURL(/\/coach\/clients$/);
  await shot(page, testInfo, '02-back-to-clients');

  // Browser Forward → the workspace entry (last tab), Back → Clients again.
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/notes$`));
  await expect(page.getByText('Notes').first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/coach\/clients$/);
  await expect(page.getByTestId('coach-desktop-clients')).toBeVisible();
});

test('history: deep link to /notes in a fresh context → back arrow stays in-site (client overview); refresh keeps the page', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto(`/coach/client/${CA}/notes`);
  await appReady(page, 'workspace-tab-notes');
  // Refresh on a deep link keeps the page.
  await page.reload();
  await appReady(page, 'workspace-tab-notes');
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/notes$`));
  await shot(page, testInfo, '01-deeplink-after-refresh');

  await page.getByTestId('workspace-switch-trigger').locator('xpath=preceding-sibling::button[1]').click();
  await page.waitForTimeout(1_000);
  testInfo.annotations.push({ type: 'deeplink-back-landed', description: page.url() });
  await shot(page, testInfo, '02-after-back');
  // Never leaves the site.
  expect(new URL(page.url()).origin).toBe(new URL(page.context().pages()[0].url()).origin);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/coach\//);
  // Expected per brief: falls back to the client overview.
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}$`));
});

test('history: messages — workspace → thread → back; deep-linked thread → back → list; desktop list behaviour', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  // Desktop inbox list.
  await page.goto('/coach/messages');
  await appReady(page, 'coach-desktop-messages');
  await page.getByTestId('thread-row').filter({ hasText: 'Client Aya' }).click();
  testInfo.annotations.push({ type: 'desktop-thread-row-url', description: page.url() });
  await shot(page, testInfo, '01-desktop-inbox-selected');

  // Workspace Message → thread route → back arrow returns to the workspace.
  await page.goto(`/coach/client/${CA}`);
  await appReady(page, 'coach-client-detail');
  await page.getByRole('button', { name: 'Message' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/coach/messages/${CA}$`));
  await shot(page, testInfo, '02-thread');
  await page.getByRole('button', { name: 'Back' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}$`));

  // Deep-linked thread (fresh context) → back → inbox list.
  const { page: fresh } = await as('coachA');
  await fresh.goto(`/coach/messages/${CA}`);
  await appReady(fresh, 'topbar-title');
  await fresh.reload();
  await appReady(fresh, 'topbar-title');
  await expect(fresh).toHaveURL(new RegExp(`/coach/messages/${CA}$`));
  await fresh.getByRole('button', { name: 'Back' }).first().click();
  await expect(fresh).toHaveURL(/\/coach\/messages$/);
  await expect(fresh.getByTestId('coach-desktop-messages')).toBeVisible();
  await shot(fresh, testInfo, '03-deeplink-thread-back-to-list');
});

test('restore seed state (clientA plan)', async ({ db }) => {
  await db.deleteMany('clientWorkoutPlans', { _id: CA });
  await db.deleteMany('planVersions', { clientId: CA });
  expect(await db.count('clientWorkoutPlans', { _id: CA })).toBe(0);
});
