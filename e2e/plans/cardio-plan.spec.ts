import { test, expect } from '@playwright/test';
import { IDS, addCardioSession, saveAsNewVersion, loginFresh } from './helpers';

/**
 * Builds a real cardio plan (incline-treadmill LISS + an interval running
 * session) for demo.client06 (Mariam Adel) through the actual coach UI,
 * versions it, and verifies it via the coach's "view as client" read-only
 * mirror.
 *
 * Verification note: Mariam Adel is a demo client seeded without a completed
 * onboarding assessment (scripts/seed-demo-dataset.mjs never submits one), so
 * a real client-side login for her would be blocked by the mandatory
 * AssessmentWizard gate — a pre-existing product behavior unrelated to plan
 * assignment, and not something this pass should push through on her account.
 * Instead this spec verifies the assigned plan the same way the product
 * itself offers a coach to check a client's view: CoachViewLayout's read-only
 * "cardio" tab (`/coach/client/:id/view/cardio`), which queries the exact same
 * `getClientCardioPlan` the client app renders from.
 *
 * NOTE on scope: CoachCardioEditor has the identical "reopen shows an empty
 * plan" bug documented in nutrition-plan.spec.ts (same fix committed locally,
 * not deployed). So everything below happens in ONE continuous editor mount —
 * build both sessions, tweak session 1 in place (the "edit"), then a single
 * "save as new version" (which both assigns and versions) — never reopening
 * the editor afterward. Version history and the coach's read-only preview are
 * checked on separate, unaffected pages.
 */
test.describe('Coach: build & assign cardio plan', () => {
  const PLAN_NAME = 'Fat-Loss Cardio - LISS + Intervals';

  test('build a LISS + interval cardio plan for Mariam Adel, version, and preview it', async ({ page }) => {
    test.setTimeout(120_000);

    // Fresh login rather than the shared e2e/.auth/coach.json snapshot — see
    // loginFresh's doc comment (multiple agents share this account concurrently).
    await loginFresh(page, 'E2E_COACH_EMAIL', 'E2E_COACH_PASSWORD');

    // ---- 1. Open the cardio editor for demo.client06 (Mariam Adel) ----
    await page.goto(`/coach/client/${IDS.mariamAdel}/cardio`);
    await expect(page.getByTestId('coach-cardio-editor')).toBeVisible();
    await page.getByTestId('cardio-plan-name').fill(PLAN_NAME);

    await addCardioSession(page, {
      type: 'treadmill',
      duration: '40',
      frequency: '4x/week',
      notes: 'Incline 8%, pace 5.5 km/h. Keep heart rate in zone 2 (60-70% of max) — conversational pace throughout.',
    });
    await addCardioSession(page, {
      type: 'running',
      duration: '25',
      frequency: '2x/week',
      notes: '5 min warm-up jog, then 8x (1 min sprint / 2 min walk), 5 min cool-down jog.',
    });

    // ---- 2. Edit session 1 in place (still the same mount, nothing saved yet) ----
    await page.getByText(/Treadmill · 40 min/).click();
    const editForm = page.getByTestId('cardio-session-form');
    await expect(editForm).toBeVisible();
    await editForm.getByTestId('sess-duration').fill('45');
    await editForm.getByTestId('sess-notes').fill('Incline 10%, pace 5.2 km/h. Keep heart rate in zone 2 (60-70% of max).');
    await editForm.getByTestId('sess-save').click();
    await expect(editForm).not.toBeVisible();

    // ---- 3. Save as a new version (assigns to Mariam Adel + creates version 1) ----
    await saveAsNewVersion(page, 'Initial LISS + interval build — 45 min incline treadmill, 25 min intervals');
    await expect(page.getByTestId('coach-client-detail')).toBeVisible({ timeout: 15_000 });

    // ---- 4. Verify the assignment shows up in the Manage sheet ----
    await page.getByTestId('coach-manage').click();
    await expect(page.getByTestId('coach-edit-cardio')).toContainText('2');
    await page.getByTestId('sheet-close').click();

    // ---- 5. Version history ----
    await page.goto(`/coach/client/${IDS.mariamAdel}/versions/cardio`);
    await expect(page.getByTestId('plan-version-history')).toBeVisible();
    await expect(page.getByTestId('version-row').first()).toBeVisible();
    await expect(page.getByTestId('version-active')).toBeVisible();

    // ---- 6. Preview via the coach's read-only "view as client" cardio tab ----
    await page.goto(`/coach/client/${IDS.mariamAdel}/view/cardio`);
    await expect(page.getByTestId('coach-view')).toBeVisible();
    await expect(page.getByText(/Treadmill · 45 min/)).toBeVisible();
    await expect(page.getByText('4x/week')).toBeVisible();
    await expect(page.getByText(/Incline 10%, pace 5.2 km\/h/)).toBeVisible();
    await expect(page.getByText(/Running · 25 min/)).toBeVisible();
    await expect(page.getByText('2x/week')).toBeVisible();
    await expect(page.getByText(/8x \(1 min sprint \/ 2 min walk\)/)).toBeVisible();
  });
});
