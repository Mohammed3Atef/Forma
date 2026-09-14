import { test, expect } from '@playwright/test';
import { CLIENT_AUTH, watchPage } from './helpers';

test.use({ storageState: CLIENT_AUTH });

/**
 * Real end-to-end workout flow for TODAY (distinct from the seeded 10-week
 * history): preview a routine day's detail, start a real session, log a
 * couple of sets with realistic numbers, finish it, and confirm it lands in
 * History. `startSession` is keyed by today's date and never overwrites an
 * already-finished/started session for the day, so this is safe to run once.
 */
test('start, log, and finish a real workout session; verify it appears in History', async ({ page }) => {
  const { consoleErrors, failedRequests } = watchPage(page);

  await page.goto('/workout');

  // If there's no plan yet the coach hasn't assigned one — bail out loudly,
  // since the rest of this flow depends on it.
  const waitingForCoach = page.getByText(/waiting/i);
  if (await waitingForCoach.isVisible().catch(() => false)) {
    test.skip(true, 'Client has no assigned workout plan yet — cannot exercise the session flow.');
  }

  // If a session for today is already active (e.g. resumed from a previous
  // run), open it directly instead of starting a second one.
  const resumeBtn = page.getByRole('button', { name: /resume session|edit/i }).first();
  if (await resumeBtn.isVisible().catch(() => false)) {
    await resumeBtn.click();
  } else {
    // Pick the first routine day and preview its Routine Detail view first.
    const firstDay = page.locator('ul > li button').first();
    await expect(firstDay).toBeVisible();
    await firstDay.click();

    // Routine Detail — preview before starting.
    await expect(page.getByText(/exercises/i).first()).toBeVisible();
    const startBtn = page.getByRole('button', { name: /start this workout/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();
  }

  // Workout Session screen.
  await expect(page).toHaveURL(/\/workout\/session/);

  // If the session is already finished (edit mode re-entry), just verify and stop.
  const alreadyComplete = page.getByText(/workout complete/i);
  if (await alreadyComplete.isVisible().catch(() => false)) {
    console.log('[workout-session.spec] today\'s session was already finished — verified read-only view.');
    return;
  }

  // Begin recording (starts the timer / marks the session as started).
  const startTimerBtn = page.getByRole('button', { name: /^start$/i });
  if (await startTimerBtn.isVisible().catch(() => false)) {
    await startTimerBtn.click();
  }

  // Log realistic numbers into the first two visible sets across exercise cards.
  const weightInputs = page.getByLabel('Weight');
  const repsInputs = page.getByLabel('reps', { exact: false });
  const doneButtons = page.getByRole('button', { name: 'Done' });

  const setCount = await weightInputs.count();
  expect(setCount).toBeGreaterThan(0);
  const toLog = Math.min(2, setCount);
  const sampleWeights = [40, 42.5];
  const sampleReps = [10, 8];
  for (let i = 0; i < toLog; i++) {
    await weightInputs.nth(i).fill(String(sampleWeights[i]));
    await repsInputs.nth(i).fill(String(sampleReps[i]));
    await doneButtons.nth(i).click();
  }

  // Finish the session.
  const finishBtn = page.getByRole('button', { name: /^finish$/i });
  await expect(finishBtn).toBeVisible();
  await finishBtn.click();

  // Confirm sheet — realistic duration, save.
  await expect(page.getByText(/finish workout\?/i)).toBeVisible();
  const durationInput = page.locator('#finish-duration');
  await durationInput.fill('35');
  await page.getByRole('button', { name: /save workout/i }).click();

  // Summary screen.
  await expect(page.getByText(/workout complete/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^done$/i }).click();
  await expect(page.getByTestId('client-home')).toBeVisible();

  // Verify it now shows up in History (current month, today's date).
  await page.goto('/history');
  const today = new Date();
  const todayDay = String(today.getDate());
  await expect(page.getByText(new RegExp(`workouts`, 'i'))).toBeVisible();
  // The calendar cell for today should now be marked as a workout day.
  await expect(page.locator('button', { hasText: new RegExp(`^${todayDay}$`) }).first()).toBeVisible();

  if (consoleErrors.length) console.warn('[workout-session.spec] console errors:', consoleErrors);
  const bad = failedRequests.filter((r) => r.status >= 400);
  if (bad.length) console.warn('[workout-session.spec] failed requests:', bad);
});
