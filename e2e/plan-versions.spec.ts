import { test, expect, type Page } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, signInWith, readDoc, getDocs, collection } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';
import { assignWorkoutPlan } from './fixtures/plans';

/**
 * PLAN VERSIONING — the coach snapshots the workout plan as numbered versions;
 * the active version is mirrored into clientData/{id}/plan/workout (what the
 * client reads). Restoring an older version swaps the client's active plan.
 */

const PW = 'Versions123456!';
let client: NewClient;

interface WPlan { name: string }
interface Version { id: string; versionNumber: number; name: string; active: boolean; kind: string }

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    client = await createClientViaApi(coach, { email: uniqueEmail('qa-ver'), password: PW, displayName: `QA Ver ${Date.now()}` });
    await assignWorkoutPlan(coach, client.uid); // seed plan/workout (name "E2E Push Day", Day 1, Bench Press)
  } finally {
    await coach.close();
  }
});

async function listVersions(): Promise<Version[]> {
  const s = await signInAs('coach');
  try {
    const snap = await getDocs(collection(s.db, 'clientData', client.uid, 'planVersions'));
    return snap.docs.map((d) => d.data() as Version).filter((v) => v.kind === 'workout');
  } finally {
    await s.close();
  }
}
async function planName(): Promise<string | undefined> {
  const s = await signInAs('coach');
  try {
    return (await readDoc<WPlan>(s.db, ['clientData', client.uid, 'plan', 'workout']))?.name;
  } finally {
    await s.close();
  }
}
async function saveAsVersion(page: Page, name: string, reason: string): Promise<void> {
  await page.goto(`/coach/client/${client.uid}/workout`);
  await expect(page.getByTestId(TID.coachWorkoutEditor)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId(TID.workoutPlanName).fill(name);
  await page.getByTestId(TID.versionSaveNew).click();
  await page.getByTestId(TID.versionReason).fill(reason);
  await page.getByTestId(TID.versionSaveConfirm).click();
  await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('Plan versioning', () => {
  test('coach saves V1', async ({ page, login }) => {
    await login('coach');
    await saveAsVersion(page, 'Plan V1', 'initial');

    const versions = await listVersions();
    expect(versions.length).toBe(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].active).toBe(true);
    expect(await planName()).toBe('Plan V1');
  });

  test('coach saves V2 (V1 deactivated, plan mirrors V2)', async ({ page, login }) => {
    await login('coach');
    await saveAsVersion(page, 'Plan V2', 'progressed volume');

    const versions = await listVersions().then((v) => v.sort((a, b) => a.versionNumber - b.versionNumber));
    expect(versions.length).toBe(2);
    expect(versions[0]).toMatchObject({ versionNumber: 1, active: false });
    expect(versions[1]).toMatchObject({ versionNumber: 2, active: true, name: 'Plan V2' });
    expect(await planName()).toBe('Plan V2');
  });

  test('client sees the active version (V2)', async ({ page, loginWith }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });
    await page.goto('/workout');
    await expect(page.getByTestId(TID.waitingForCoach)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText(/Day 1/).first()).toBeVisible({ timeout: 15_000 });
    expect(await planName()).toBe('Plan V2'); // plan/workout = what the client reads
  });

  test('coach restores V1 → client plan reverts', async ({ page, login }) => {
    await login('coach');
    await page.goto(`/coach/client/${client.uid}/versions/workout`);
    await expect(page.getByTestId(TID.planVersionHistory)).toBeVisible({ timeout: 20_000 });

    // Two rows render (V2 active, V1 inactive); restore V1 by its version number.
    await expect(page.getByTestId(TID.versionRow)).toHaveCount(2, { timeout: 15_000 });
    await page.getByTestId(TID.versionRestoreFor(1)).click();
    await page.getByTestId(TID.confirmAccept).click();

    await expect.poll(planName, { timeout: 15_000 }).toBe('Plan V1');
    const versions = await listVersions().then((v) => v.sort((a, b) => a.versionNumber - b.versionNumber));
    expect(versions[0].active, 'V1 active after restore').toBe(true);
    expect(versions[1].active, 'V2 inactive after restore').toBe(false);
  });

  test('client sees the restored plan (V1)', async ({ page, loginWith }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });
    await page.goto('/workout');
    await expect(page.getByTestId(TID.waitingForCoach)).toHaveCount(0, { timeout: 20_000 });
    expect(await planName()).toBe('Plan V1');
  });
});
