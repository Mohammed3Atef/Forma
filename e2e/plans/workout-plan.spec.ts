import { test, expect } from '@playwright/test';
import { IDS, buildDay, removeAllDays, saveAsNewVersion, loginFresh } from './helpers';

/**
 * Builds a real hypertrophy Push/Pull/Legs plan for client@forma.test through
 * the actual coach UI (PlanBuilder: plan -> day -> section -> exercise), then
 * exercises the surrounding product features on it: edit, "save as new
 * version" + version history, "save as template" + template preview/duplicate,
 * and finally verifies the client actually sees it rendered correctly.
 */
test.describe('Coach: build & assign PPL hypertrophy workout plan', () => {
  const PLAN_NAME = 'Hypertrophy Push/Pull/Legs';
  const TEMPLATE_NAME = 'PPL Hypertrophy Template (QA)';

  test('build, assign, edit, version, and template the plan; verify from the client', async ({ page, browser }) => {
    test.setTimeout(240_000);

    // Fresh login rather than the shared e2e/.auth/coach.json snapshot — see
    // loginFresh's doc comment (multiple agents share this account concurrently).
    await loginFresh(page, 'E2E_COACH_EMAIL', 'E2E_COACH_PASSWORD');

    // ---- 1. Open the workout editor for client@forma.test via the real client-detail UI ----
    await page.goto(`/coach/client/${IDS.clientMain}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('coach-manage').click();
    await expect(page.getByTestId('sheet-panel')).toBeVisible();
    await page.getByTestId('coach-edit-workout').click();
    await expect(page.getByTestId('coach-workout-editor')).toBeVisible();

    await page.getByTestId('workout-plan-name').fill(PLAN_NAME);
    // Idempotency: a previous run of this spec may have gotten this far and left
    // days behind before failing on a later step — start from a clean slate.
    await removeAllDays(page);

    // ---- 2. Build 3 real days: Push / Pull / Legs (warm-up + working sections) ----
    await buildDay(page, {
      title: 'Push Day',
      focus: 'Chest, Shoulders, Triceps',
      sections: [
        {
          title: 'Warm-up',
          kind: 'warmup',
          exercises: [
            { name: 'Band Pull-Aparts', target: 'Rear Delts', preset: 'mobility', notes: '2 sets of 15-20 reps, light band tension, focus on scapular retraction.' },
          ],
        },
        {
          title: 'Working Sets',
          kind: 'working',
          exercises: [
            { name: 'Barbell Bench Press', target: 'Chest', preset: 'hypertrophy', notes: 'Control the eccentric for 3 seconds; rack the bar when form breaks down.' },
            { name: 'Seated Dumbbell Shoulder Press', target: 'Shoulders', preset: 'hypertrophy', notes: 'Full range of motion, avoid locking out the elbows at the top.' },
            { name: 'Cable Triceps Pushdown', target: 'Triceps', preset: 'pump', notes: 'Keep elbows pinned to your sides throughout the movement.' },
          ],
        },
      ],
    });

    await buildDay(page, {
      title: 'Pull Day',
      focus: 'Back, Biceps',
      sections: [
        {
          title: 'Warm-up',
          kind: 'warmup',
          exercises: [
            { name: 'Face Pulls', target: 'Rear Delts / Upper Back', preset: 'mobility', notes: 'Light band or cable, 2x15, focus on posture and scapular control.' },
          ],
        },
        {
          title: 'Working Sets',
          kind: 'working',
          exercises: [
            { name: 'Conventional Deadlift', target: 'Posterior Chain', preset: 'strength', notes: 'Reset each rep from the floor; brace hard before pulling.' },
            { name: 'Barbell Bent-Over Row', target: 'Mid Back', preset: 'hypertrophy', notes: 'Pull to the lower ribs, squeeze the shoulder blades together.' },
            { name: 'Lat Pulldown', target: 'Lats', preset: 'hypertrophy', notes: 'Lead with the elbows, avoid leaning back excessively.' },
          ],
        },
      ],
    });

    await buildDay(page, {
      title: 'Legs Day',
      focus: 'Quads, Hamstrings, Glutes, Calves',
      sections: [
        {
          title: 'Warm-up',
          kind: 'warmup',
          exercises: [
            { name: 'Bodyweight Walking Lunges', target: 'Quads / Glutes', preset: 'mobility', notes: '2x10 per leg, controlled tempo to open up the hips.' },
          ],
        },
        {
          title: 'Working Sets',
          kind: 'working',
          exercises: [
            { name: 'Back Squat', target: 'Quads', preset: 'strength', notes: 'Hit depth (hip crease below the knee); brace before descending.' },
            { name: 'Romanian Deadlift', target: 'Hamstrings', preset: 'hypertrophy', notes: 'Soft knees, push the hips back, stop at mid-shin.' },
            { name: 'Standing Calf Raise', target: 'Calves', preset: 'pump', notes: 'Full stretch at the bottom, pause at the top for a squeeze.' },
          ],
        },
      ],
    });

    // Sanity: 3 day cards now on the plan-level view.
    await expect(page.getByTestId('builder-day-card')).toHaveCount(3);

    // ---- 3. Save (assigns to client@forma.test) ----
    await page.getByTestId('workout-save').click();
    await expect(page.getByTestId('coach-client-detail')).toBeVisible({ timeout: 15_000 });

    // ---- 4. Verify the assignment shows up in the Manage sheet ----
    await page.getByTestId('coach-manage').click();
    await expect(page.getByTestId('coach-edit-workout')).toContainText(PLAN_NAME);
    await page.getByTestId('sheet-close').click();

    // ---- 5. Edit the existing plan (real edit, not a rebuild) ----
    await page.goto(`/coach/client/${IDS.clientMain}/workout`);
    await expect(page.getByTestId('coach-workout-editor')).toBeVisible();
    await expect(page.getByTestId('workout-plan-name')).toHaveValue(PLAN_NAME);
    await expect(page.getByTestId('builder-day-card')).toHaveCount(3);

    // Open Push Day -> Working Sets -> edit Barbell Bench Press's progression notes.
    await page.getByTestId('builder-day-card').first().click();
    await expect(page.getByTestId('builder-day')).toBeVisible();
    await page.getByRole('button', { name: 'Working Sets' }).click();
    await expect(page.getByTestId('builder-section')).toBeVisible();
    await page.getByText('Barbell Bench Press').click();
    const exForm = page.getByTestId('exercise-form');
    await expect(exForm).toBeVisible();
    const updatedNotes = 'Control the eccentric for 3 seconds; rack the bar when form breaks down. Progress load weekly once 12 clean reps land on all 3 sets.';
    await exForm.getByTestId('ex-notes').fill(updatedNotes);
    await exForm.getByTestId('ex-save').click();
    await expect(exForm).not.toBeVisible();
    await page.getByRole('button', { name: 'Push Day', exact: true }).click();
    await page.getByRole('button', { name: 'Workout plan', exact: true }).click();

    // ---- 6. Save as a new version (with a reason) ----
    await saveAsNewVersion(page, 'Week 1 baseline — initial PPL build');
    await expect(page.getByTestId('coach-client-detail')).toBeVisible({ timeout: 15_000 });

    // ---- 7. Version history: at least one version, marked active ----
    await page.goto(`/coach/client/${IDS.clientMain}/versions/workout`);
    await expect(page.getByTestId('plan-version-history')).toBeVisible();
    await expect(page.getByTestId('version-row').first()).toBeVisible();
    await expect(page.getByTestId('version-active')).toBeVisible();

    // ---- 8. Save as template, then preview + duplicate it ----
    // Idempotent: if a previous run of this spec already created it, reuse it
    // rather than piling up near-identical templates on every retry.
    await page.goto('/coach/templates');
    await expect(page.getByTestId('coach-templates')).toBeVisible();
    const exactTemplateCard = page.getByTestId('template-card').filter({ has: page.getByText(TEMPLATE_NAME, { exact: true }) });
    if ((await exactTemplateCard.count()) === 0) {
      await page.goto(`/coach/client/${IDS.clientMain}/workout`);
      await expect(page.getByTestId('coach-workout-editor')).toBeVisible();
      await page.getByTestId('save-as-template').click();
      const templateSheet = page.getByTestId('sheet-panel');
      await expect(templateSheet).toBeVisible();
      await templateSheet.getByTestId('template-from-plan-name').fill(TEMPLATE_NAME);
      await templateSheet.getByRole('button', { name: 'Hypertrophy', exact: true }).click();
      await templateSheet.getByRole('button', { name: 'PPL', exact: true }).click();
      await templateSheet.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(templateSheet).not.toBeVisible({ timeout: 10_000 });
      await page.goto('/coach/templates');
    }

    const templateCard = page.getByTestId('template-card').filter({ has: page.getByText(TEMPLATE_NAME, { exact: true }) }).first();
    await expect(templateCard).toBeVisible({ timeout: 10_000 });
    await templateCard.click();

    await expect(page.getByTestId('template-preview')).toBeVisible();
    await expect(page.getByTestId('template-preview-days').getByText('Push Day')).toBeVisible();
    await expect(page.getByTestId('template-preview-days').getByText('Pull Day')).toBeVisible();
    await expect(page.getByTestId('template-preview-days').getByText('Legs Day')).toBeVisible();

    const copyName = `${TEMPLATE_NAME} (copy)`;
    const copyCard = page.getByTestId('template-card').filter({ has: page.getByText(copyName, { exact: true }) });
    if ((await copyCard.count()) === 0) {
      await page.getByTestId('template-duplicate').click();
      await expect(page.getByTestId('coach-templates')).toBeVisible({ timeout: 10_000 });
    } else {
      await page.goto('/coach/templates');
    }
    await expect(copyCard.first()).toBeVisible({ timeout: 10_000 });

    // ---- 9. Client-side verification: client@forma.test actually sees the plan ----
    // Fresh login (not the shared e2e/.auth/client.json snapshot) — several other
    // agents share this same account concurrently during this QA pass, and a
    // saved session can get invalidated between capture and use (see loginFresh).
    const clientCtx = await browser.newContext();
    const clientPage = await clientCtx.newPage();
    await loginFresh(clientPage, 'E2E_CLIENT_EMAIL', 'E2E_CLIENT_PASSWORD');
    await clientPage.goto('/workout');
    await clientPage.waitForLoadState('networkidle');
    await expect(clientPage.getByText('Push Day')).toBeVisible();
    await expect(clientPage.getByText('Pull Day')).toBeVisible();
    await expect(clientPage.getByText('Legs Day')).toBeVisible();

    await clientPage.getByText('Push Day').click();
    await clientPage.waitForLoadState('networkidle');
    await expect(clientPage.getByText('Barbell Bench Press')).toBeVisible();
    await expect(clientPage.getByText('Seated Dumbbell Shoulder Press')).toBeVisible();
    await expect(clientPage.getByText('Cable Triceps Pushdown')).toBeVisible();
    await expect(clientPage.getByText(/Rest 90s/).first()).toBeVisible();
    await expect(clientPage.getByText(/3 Working/).first()).toBeVisible();
    await expect(clientPage.getByText('Progress load weekly once 12 clean reps land on all 3 sets.')).toBeVisible();

    await clientCtx.close();
  });
});
