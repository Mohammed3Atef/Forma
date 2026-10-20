import { test, expect, shot } from '../fixtures';
import type { Page } from '@playwright/test';
import { appReady, confirmNo, confirmYes, fullAssessment, openPlanBuilder } from './_b-helpers';

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
  await openPlanBuilder(page, 'workout-plan-name');
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

test('unsaved guard: rail item → Cancel keeps edits → Leave discards and navigates', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await openCleanEditor(page);
  await makeDirty(page, 'sidebar');

  await page.getByTestId('rail-clients').click();
  await expect(guard(page)).toBeVisible();
  await shot(page, testInfo, '01-sidebar-guard');
  await confirmNo(page);
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));
  await expect(page.getByTestId('workout-plan-name')).toHaveValue(`${BASE_NAME} sidebar`);
  await expect(page.getByTestId('workout-unsaved')).toBeVisible();

  await page.getByTestId('rail-clients').click();
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

test('unsaved guard: the account entry (rail Me) → Cancel stays → Leave goes to Me', async ({ as, env }) => {
  const { page } = await as('coachA');
  await openCleanEditor(page);
  await makeDirty(page, 'avatar');
  // B3.1: the account entry is the rail's Me (the old top-bar avatar → Settings is gone).
  const me = page.getByTestId('rail-me');
  await me.click();
  await expect(guard(page)).toBeVisible();
  await confirmNo(page);
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));
  await expect(page.getByTestId('workout-plan-name')).toHaveValue(`${BASE_NAME} avatar`);
  await me.click();
  await confirmYes(page);
  await expect(page).toHaveURL(/\/coach\/me$/);
  expect(env.accounts.coachA.email).toBeTruthy();
});

test('unsaved guard: editor back arrow and the shell rail both confirm (B3.4: the editor is a full-screen task — one Back)', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  // Arrive from the client's Plan so back has somewhere in-app to go.
  await page.goto(`/coach/client/${CA}/plan`);
  await appReady(page, 'plan-edit-workout');
  await page.getByTestId('plan-edit-workout').click();
  await openPlanBuilder(page, 'workout-plan-name');
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

  // B3.4: no workspace header around the editor (one Back) — the editor's is the only one.
  await expect(page.getByTestId('workspace-back')).toHaveCount(0);
  await expect(name).toHaveValue(`${BASE_NAME} back`);

  // The shell rail is guarded too.
  await page.getByTestId('rail-clients').click();
  await expect(guard(page)).toBeVisible();
  await confirmNo(page);
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));

  // Leave via the editor back arrow → back to the client's Plan.
  await editorBack.click();
  await confirmYes(page);
  await expect(page).not.toHaveURL(new RegExp(`${EDITOR}$`));
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/plan$`));
  testInfo.annotations.push({ type: 'editor-back-landed', description: page.url() });
  await shot(page, testInfo, '02-after-leave');
});

test('unsaved guard: browser Back is NOT blocked (records actual behaviour)', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto(`/coach/client/${CA}/plan`);
  await appReady(page, 'plan-edit-workout');
  // In-app (pushState) history entry: Plan → Edit → editor.
  await page.getByTestId('plan-edit-workout').click();
  await expect(page).toHaveURL(new RegExp(`${EDITOR}$`));
  await openPlanBuilder(page, 'workout-plan-name');
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
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/plan$`));
  // Where did the unsaved edit go? Reopen the editor in-app.
  await page.getByTestId('plan-edit-workout').click();
  await appReady(page, 'workout-plan-name');
  testInfo.annotations.push({ type: 'browser-back-draft-restored', description: await name.inputValue() });
});

test('unsaved guard: after Save, navigating does not warn', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await openCleanEditor(page);
  await makeDirty(page, 'saved');
  await page.getByTestId('workout-save').click();
  await expect(page.getByTestId('workout-saved')).toBeVisible();
  await page.getByTestId('rail-clients').click();
  await expect(page).toHaveURL(/\/coach\/clients$/);
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await shot(page, testInfo, '01-no-warning');
  // Put the baseline name back for the other tests.
  await openCleanEditor(page);
});

/* ---------------- history ---------------- */

test('history: Clients → client → Plan → Profile › Notes → back arrow; browser Back/Forward', async ({ as, env }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto('/coach/clients');
  await appReady(page, 'coach-desktop-clients');
  // B3.3: the client's name is the row's link (rows show no contact details).
  const row = page.getByTestId('coach-desktop-clients').locator(`[data-testid="client-table-row"][data-client-id="${env.accounts.clientA.id}"]`);
  await row.getByTestId('client-open').click();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}$`));
  // B3.4: sections (and Profile's sections) replace history.
  await page.getByTestId('workspace-tab-plan').click();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/plan$`));
  await page.getByTestId('workspace-tab-profile').click();
  await page.getByTestId('profile-notes').click();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/notes$`));
  await shot(page, testInfo, '01-notes-tab');

  // In-app back arrow (workspace header): sections are `replace`, so back leaves the workspace to Clients.
  await page.getByTestId('workspace-back').click();
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

test('history: deep link to /notes in a fresh context → back arrow stays in-site (client Profile); refresh keeps the page', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto(`/coach/client/${CA}/notes`);
  await appReady(page, 'workspace-tab-profile');
  // Refresh on a deep link keeps the page.
  await page.reload();
  await appReady(page, 'workspace-tab-profile');
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/notes$`));
  await shot(page, testInfo, '01-deeplink-after-refresh');

  await page.getByTestId('workspace-back').click();
  await page.waitForTimeout(1_000);
  testInfo.annotations.push({ type: 'deeplink-back-landed', description: page.url() });
  await shot(page, testInfo, '02-after-back');
  // Never leaves the site.
  expect(new URL(page.url()).origin).toBe(new URL(page.context().pages()[0].url()).origin);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/coach\//);
  // B3.4: a Profile section's semantic parent is the client's Profile.
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}/profile$`));
});

test('history: messages — workspace → thread → back; deep-linked thread → back → list; desktop list behaviour', async ({ as }, testInfo) => {
  // B3.6: one Messages screen — at this width the inbox and the conversation sit side by side and the
  // selection is the URL (DT-01); the thread's "Open client" goes back to the workspace it came from (NAV-K07).
  const { page } = await as('coachA');
  await page.goto('/coach/messages');
  await appReady(page, 'coach-desktop-messages');
  await page.getByTestId('thread-row').filter({ hasText: 'Client Aya' }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/messages/${CA}$`));
  testInfo.annotations.push({ type: 'desktop-thread-row-url', description: page.url() });
  await shot(page, testInfo, '01-desktop-inbox-selected');

  // Workspace Message → the conversation → Open client returns to the workspace (history, not a new entry).
  await page.goto(`/coach/client/${CA}`);
  await appReady(page, 'coach-client-detail');
  await page.getByRole('button', { name: 'Message' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/coach/messages/${CA}$`));
  await shot(page, testInfo, '02-thread');
  await page.getByTestId('thread-open-client').click();
  await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}$`));

  // Deep-linked conversation (fresh context): the split view with it selected; reload keeps it; the inbox is right there.
  const { page: fresh } = await as('coachA');
  await fresh.goto(`/coach/messages/${CA}`);
  await appReady(fresh, 'thread-recipient');
  await fresh.reload();
  await appReady(fresh, 'thread-recipient');
  await expect(fresh).toHaveURL(new RegExp(`/coach/messages/${CA}$`));
  await expect(fresh.getByTestId('coach-desktop-messages')).toBeVisible();
  await expect(fresh.locator(`[data-testid="thread-row"][data-client-id="${CA}"]`)).toHaveAttribute('aria-current', 'true');
  await shot(fresh, testInfo, '03-deeplink-thread-in-split');
});

test('restore seed state (clientA plan)', async ({ db }) => {
  await db.deleteMany('clientWorkoutPlans', { _id: CA });
  await db.deleteMany('planVersions', { clientId: CA });
  expect(await db.count('clientWorkoutPlans', { _id: CA })).toBe(0);
});
