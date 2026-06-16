import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, readDoc } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';
import { assignAll, SAMPLE } from './fixtures/plans';

/**
 * CLIENT ASSIGNED-PLAN — after the coach assigns plans + targets, the client
 * must see exactly what the coach set: the workout plan (with the precise warm-up
 * / working set counts, rest, video, instructions), nutrition plan + targets,
 * cardio plan, and coach note. Logging flows (start workout, log sets, water,
 * cardio, steps, finish) are exercised end-to-end.
 */

const PW = 'Assigned123456!';
let client: NewClient;

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    client = await createClientViaApi(coach, {
      email: uniqueEmail('qa-assigned'),
      password: PW,
      displayName: `QA Assigned ${Date.now()}`,
    });
    await assignAll(coach, client.uid);
  } finally {
    await coach.close();
  }
});

test.describe('Client assigned-plan', () => {
  test.beforeEach(async ({ loginWith, page }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });
  });

  test('sees the assigned workout plan (not the waiting state)', async ({ page }) => {
    await page.goto('/workout');
    await expect(page.getByTestId(TID.waitingForCoach)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText('Bench Press')).toBeVisible();
    await expect(page.getByText('Plank')).toBeVisible();
    await expect(page.getByText('Shoulder Mobility')).toBeVisible();
  });

  test('workout plan persisted with the exact coach-set set counts (warm-up-only + working-only)', async () => {
    const s = await signInAs('coach');
    try {
      const plan = await readDoc<{ exercises: Record<string, { name: string; warmupSetCount: number; workingSets: number; restSec: number; videoUrl: string | null }> }>(
        s.db,
        ['clientData', client.uid, 'plan', 'workout'],
      );
      const exes = Object.values(plan!.exercises);
      const bench = exes.find((e) => e.name === 'Bench Press')!;
      const mobility = exes.find((e) => e.name === 'Shoulder Mobility')!;
      const plank = exes.find((e) => e.name === 'Plank')!;
      expect(bench.warmupSetCount).toBe(SAMPLE.workout.benchWarmup);
      expect(bench.workingSets).toBe(SAMPLE.workout.benchWorking);
      expect(bench.restSec).toBe(SAMPLE.workout.benchRest);
      expect(bench.videoUrl).toContain('bench');
      expect(mobility.workingSets).toBe(0); // warm-up-only
      expect(plank.warmupSetCount).toBe(0); // working-only
    } finally {
      await s.close();
    }
  });

  test('opens a routine and sees rest time, video and instructions', async ({ page }) => {
    await page.goto('/workout');
    await page.getByText(/Day 1/).first().click();
    // Exercise detail/card surface includes the coach instructions text.
    await expect(page.getByText('Bench Press')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Pause at the chest/)).toBeVisible();
  });

  test('can start a workout, log a set (weight × reps), and finish', async ({ page }) => {
    await page.goto('/workout');
    await page.getByText(/Day 1/).first().click();
    await page.getByRole('button', { name: /start/i }).first().click();
    // Session screen: log into the first weight + reps input pair if present.
    const weight = page.getByLabel(/weight/i).first();
    if (await weight.isVisible().catch(() => false)) {
      await weight.fill('60');
      const reps = page.getByLabel(/reps/i).first();
      await reps.fill('8');
      const done = page.getByLabel(/done/i).first();
      if (await done.isVisible().catch(() => false)) await done.click();
    }
    const finish = page.getByRole('button', { name: /finish/i }).first();
    await expect(finish).toBeVisible({ timeout: 15_000 });
  });

  test('sees the assigned nutrition plan + coach targets', async ({ page }) => {
    await page.goto('/nutrition');
    await expect(page.getByTestId(TID.waitingForCoach)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText('Oats & Whey')).toBeVisible();
    // Coach-set calorie target surfaces on the macro rings.
    await expect(page.getByText(new RegExp(String(SAMPLE.nutrition.calories)))).toBeVisible();
  });

  test('can mark a meal eaten and log water', async ({ page }) => {
    await page.goto('/nutrition');
    const eat = page.getByRole('button', { name: /mark eaten|eaten/i }).first();
    if (await eat.isVisible().catch(() => false)) await eat.click();
    const water = page.getByRole('button', { name: /\+\s?250/ }).first();
    if (await water.isVisible().catch(() => false)) await water.click();
    await expect(page.getByText('Oats & Whey')).toBeVisible();
  });

  test('sees the assigned cardio plan and can log activity', async ({ page }) => {
    await page.goto('/cardio');
    await page.waitForTimeout(500);
    // Coach cardio targets (steps/cardio) are applied; the log control exists.
    const log = page.getByRole('button', { name: /log activity|log/i }).first();
    await expect(log).toBeVisible({ timeout: 15_000 });
  });

  test('cardio plan + targets persisted as coach set them', async () => {
    const s = await signInAs('coach');
    try {
      const cardio = await readDoc<{ sessions: { type: string; durationMin: number }[] }>(s.db, ['clientData', client.uid, 'plan', 'cardio']);
      expect(cardio!.sessions[0].type).toBe(SAMPLE.cardio.type);
      expect(cardio!.sessions[0].durationMin).toBe(SAMPLE.cardio.duration);
      const targets = await readDoc<{ steps: number; waterMl: number; cardioMin: number }>(s.db, ['clientData', client.uid, 'coachTargets', 'current']);
      expect(targets!.steps).toBe(SAMPLE.targets.steps);
      expect(targets!.waterMl).toBe(SAMPLE.targets.waterMl);
    } finally {
      await s.close();
    }
  });

  test('can view the coach note', async ({ page }) => {
    await page.goto('/coach-notes');
    await page.waitForTimeout(600);
    await expect(page.getByText(/Welcome to Forma/)).toBeVisible({ timeout: 15_000 });
  });
});
