import { test, expect, type Page } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, findUserByEmail, findCoachClientRel, readDoc, attempt, isPermissionDenied, setDoc, doc } from './fixtures/firestore';
import { uniqueEmail } from './fixtures/factory';

/**
 * COACH — the core authoring role. Creates a client through the real UI, then
 * authors a full workout / nutrition / cardio plan + targets + note, and reads
 * the client's activity. Also proves a coach cannot reach unassigned clients,
 * roles, or admin screens.
 */

const PW = 'Coach123456!';
const clientEmail = uniqueEmail('qa-coachclient');
const clientName = `QA CoachClient ${Date.now()}`;
let clientId = '';

async function gotoClientDetail(page: Page): Promise<void> {
  await page.goto('/coach');
  const row = page.locator('[data-testid="coach-client-row"]', { hasText: clientName }).first();
  await row.waitFor({ timeout: 20_000 });
  await row.click();
  await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible();
}

async function openManage(page: Page, action: string): Promise<void> {
  await page.getByTestId(TID.coachManage).click();
  await page.getByTestId(action).click();
}

test.describe.serial('Coach', () => {
  test.beforeEach(async ({ login }) => {
    await login('coach');
  });

  test('lands on /coach and shows the clients list', async ({ page }) => {
    await expect(page).toHaveURL(/\/coach$/);
    await expect(page.getByTestId(TID.coachClients)).toBeVisible();
    await expect(page.getByTestId(TID.coachAddClient)).toBeVisible();
  });

  test('creates a client (name + email + temp password); active + auto-assigned', async ({ page }) => {
    await page.goto('/coach');
    await page.getByTestId(TID.coachAddClient).click();
    await expect(page.getByTestId(TID.coachAddForm)).toBeVisible();
    await page.getByTestId(TID.coachAddName).fill(clientName);
    await page.getByTestId(TID.coachAddEmail).fill(clientEmail);
    await page.getByTestId(TID.coachAddPassword).fill(PW);
    await page.getByTestId(TID.coachAddSubmit).click();
    await expect(page.getByTestId(TID.coachAddForm)).toBeHidden({ timeout: 25_000 });

    // Appears in the coach's own list.
    const row = page.locator('[data-testid="coach-client-row"]', { hasText: clientName }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Verify active + assigned to THIS coach + relationship doc exists.
    const s = await signInAs('coach');
    try {
      const rec = await findUserByEmail(s.db, clientEmail);
      expect(rec, 'client identity doc').not.toBeNull();
      clientId = rec!.id;
      expect(rec!.role).toBe('client');
      expect(rec!.accountStatus).toBe('active');
      expect(rec!.assignedCoachId).toBe(s.uid);
      const rel = await findCoachClientRel(s.db, s.uid, clientId);
      expect(rel, 'coachClients relationship').not.toBeNull();
      expect((rel as { status: string }).status).toBe('active');
    } finally {
      await s.close();
    }
  });

  test('opens the created client detail', async ({ page }) => {
    test.skip(!clientId, 'client not created');
    await gotoClientDetail(page);
    await expect(page.getByTestId(TID.coachManage)).toBeVisible();
  });

  test('authors a full workout plan via the drill-down builder (day → section → exercise)', async ({ page }) => {
    test.skip(!clientId, 'client not created');
    await gotoClientDetail(page);
    await openManage(page, TID.coachEditWorkout);
    await expect(page.getByTestId(TID.coachWorkoutEditor)).toBeVisible();

    await page.getByTestId(TID.workoutPlanName).fill('Push / Pull / Legs');

    // Level 1 → add a day (auto-drills to the day editor).
    await page.getByTestId(TID.builderAddDay).click();
    await expect(page.getByTestId(TID.builderDay)).toBeVisible();
    // Level 2 → add a section (auto-drills to the section editor).
    await page.getByTestId(TID.builderAddSection).click();
    await expect(page.getByTestId(TID.builderSection)).toBeVisible();

    // Level 3 → add exercises via the picker's quick-create (saved to library + plan).
    const addExercise = async (vals: {
      name: string; warmup: string; working: string; reps: string; rest: string; video?: string; notes?: string;
    }) => {
      await page.getByTestId(TID.builderAddExercise).click();
      await expect(page.getByTestId(TID.exercisePicker)).toBeVisible();
      await page.getByTestId(TID.pickerQuickCreate).click();
      await expect(page.getByTestId(TID.exerciseForm)).toBeVisible();
      await page.getByTestId(TID.exName).fill(vals.name);
      await page.getByTestId(TID.exWarmupSets).fill(vals.warmup);
      await page.getByTestId(TID.exWorkingSets).fill(vals.working);
      await page.getByTestId(TID.exReps).fill(vals.reps);
      await page.getByTestId(TID.exRest).fill(vals.rest);
      if (vals.video) await page.getByTestId(TID.exVideo).fill(vals.video);
      if (vals.notes) await page.getByTestId(TID.exNotes).fill(vals.notes);
      await page.getByTestId(TID.exSave).click();
      await expect(page.getByTestId(TID.exercisePicker)).toBeHidden({ timeout: 15_000 });
    };

    // Normal, warm-up-only (working=0), working-only (warmup=0).
    await addExercise({ name: 'Bench Press', warmup: '2', working: '3', reps: '8-12', rest: '120', video: 'https://example.com/bench.mp4', notes: 'Retract scapula, controlled eccentric.' });
    await addExercise({ name: 'Shoulder Mobility', warmup: '3', working: '0', reps: '10', rest: '30' });
    await addExercise({ name: 'Plank', warmup: '0', working: '4', reps: '45s', rest: '60' });

    await page.getByTestId(TID.workoutSave).click();
    // Editor navigates back to the detail on save.
    await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible({ timeout: 20_000 });

    // Verify persisted at clientData/{id}/plan/workout with exact set counts.
    const s = await signInAs('coach');
    try {
      const plan = await readDoc<{ name: string; days: { exerciseIds: string[] }[]; exercises: Record<string, { name: string; warmupSetCount: number; workingSets: number; restSec: number; videoUrl: string | null; repRange: string }> }>(
        s.db,
        ['clientData', clientId, 'plan', 'workout'],
      );
      expect(plan, 'workout plan doc').not.toBeNull();
      expect(plan!.name).toContain('Push');
      const exes = Object.values(plan!.exercises);
      const bench = exes.find((e) => e.name === 'Bench Press');
      const mobility = exes.find((e) => e.name === 'Shoulder Mobility');
      const plank = exes.find((e) => e.name === 'Plank');
      expect(bench, 'Bench Press persisted').toBeTruthy();
      expect(bench!.warmupSetCount).toBe(2);
      expect(bench!.workingSets).toBe(3);
      expect(bench!.restSec).toBe(120);
      expect(bench!.videoUrl).toContain('bench');
      expect(mobility!.workingSets, 'warm-up-only has 0 working sets').toBe(0);
      expect(mobility!.warmupSetCount).toBe(3);
      expect(plank!.warmupSetCount, 'working-only has 0 warm-up sets').toBe(0);
      expect(plank!.workingSets).toBe(4);
    } finally {
      await s.close();
    }
  });

  test('authors a nutrition plan (meals, foods, macros, targets, water)', async ({ page }) => {
    test.skip(!clientId, 'client not created');
    await gotoClientDetail(page);
    await openManage(page, TID.coachEditNutrition);
    await expect(page.getByTestId(TID.coachNutritionEditor)).toBeVisible();

    await page.getByTestId(TID.nutritionPlanName).fill('Cut Phase');
    await page.getByTestId(TID.nutritionTarget('calories')).fill('2200');
    await page.getByTestId(TID.nutritionTarget('protein')).fill('180');
    await page.getByTestId(TID.nutritionTarget('carbs')).fill('200');
    await page.getByTestId(TID.nutritionTarget('fats')).fill('60');
    await page.getByTestId(TID.nutritionWaterTarget).fill('3000');

    await page.getByTestId(TID.nutritionAddMeal).click();
    await page.getByTestId(TID.nutritionAddFood).first().click();
    await expect(page.getByTestId(TID.foodForm)).toBeVisible();
    await page.getByTestId(TID.foodName).fill('Chicken & Rice');
    await page.getByTestId(TID.foodQuantity).fill('300g');
    await page.getByTestId(TID.foodMacro('calories')).fill('520');
    await page.getByTestId(TID.foodMacro('protein')).fill('55');
    await page.getByTestId(TID.foodMacro('carbs')).fill('60');
    await page.getByTestId(TID.foodMacro('fats')).fill('8');
    await page.getByTestId(TID.foodSave).click();
    await expect(page.getByTestId(TID.foodForm)).toBeHidden();

    await page.getByTestId(TID.nutritionSave).click();
    await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible({ timeout: 20_000 });

    const s = await signInAs('coach');
    try {
      const plan = await readDoc<{ targets: { calories: number; protein: number }; waterTargetMl: number; meals: { items: { name: { en: string }; calories: number }[] }[] }>(
        s.db,
        ['clientData', clientId, 'plan', 'nutrition'],
      );
      expect(plan, 'nutrition plan doc').not.toBeNull();
      expect(plan!.targets.calories).toBe(2200);
      expect(plan!.targets.protein).toBe(180);
      expect(plan!.waterTargetMl).toBe(3000);
      const food = plan!.meals.flatMap((m) => m.items).find((i) => i.name.en === 'Chicken & Rice');
      expect(food, 'food persisted').toBeTruthy();
      expect(food!.calories).toBe(520);
    } finally {
      await s.close();
    }
  });

  test('authors a cardio plan (sessions: type, duration, frequency, notes)', async ({ page }) => {
    test.skip(!clientId, 'client not created');
    await gotoClientDetail(page);
    await openManage(page, TID.coachEditCardio);
    await expect(page.getByTestId(TID.coachCardioEditor)).toBeVisible();

    await page.getByTestId(TID.cardioPlanName).fill('Conditioning');
    await page.getByTestId(TID.cardioAddSession).click();
    await expect(page.getByTestId(TID.cardioSessionForm)).toBeVisible();
    await page.getByTestId(TID.cardioType('running')).click();
    await page.getByTestId(TID.sessDuration).fill('30');
    await page.getByTestId(TID.sessFrequency).fill('3×/week');
    await page.getByTestId(TID.sessNotes).fill('Zone 2, conversational pace.');
    await page.getByTestId(TID.sessSave).click();
    await expect(page.getByTestId(TID.cardioSessionForm)).toBeHidden();

    await page.getByTestId(TID.cardioSave).click();
    await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible({ timeout: 20_000 });

    const s = await signInAs('coach');
    try {
      const plan = await readDoc<{ sessions: { type: string; durationMin: number; frequency: string; notes: string }[] }>(
        s.db,
        ['clientData', clientId, 'plan', 'cardio'],
      );
      expect(plan, 'cardio plan doc').not.toBeNull();
      const sess = plan!.sessions[0];
      expect(sess.type).toBe('running');
      expect(sess.durationMin).toBe(30);
      expect(sess.frequency).toContain('week');
    } finally {
      await s.close();
    }
  });

  test('adds a coach note', async ({ page }) => {
    test.skip(!clientId, 'client not created');
    await gotoClientDetail(page);
    await openManage(page, TID.coachAddNote);
    await page.getByTestId(TID.coachNoteBody).fill('Great progress this week — keep protein up.');
    await page.getByTestId(TID.coachNoteSave).click();
    // Note preview appears on the detail page.
    await expect(page.getByText(/Great progress this week/)).toBeVisible({ timeout: 15_000 });
  });

  test('can view client activity', async ({ page }) => {
    test.skip(!clientId, 'client not created');
    await gotoClientDetail(page);
    await page.getByTestId(TID.coachViewActivity).click();
    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.locator('body')).toContainText(/[A-Za-z]/);
  });

  test('cannot reach admin pages (redirected back to coach)', async ({ page }) => {
    await page.goto('/admin/accounts');
    await expect(page).toHaveURL(/\/coach/);
    await expect(page.getByTestId(TID.coachClients)).toBeVisible();
  });

  test('coach nav has no admin/governance tabs', async ({ page }) => {
    await page.goto('/coach');
    await expect(page.getByTestId(TID.navItem('adminGovernance'))).toHaveCount(0);
    await expect(page.getByTestId(TID.navItem('adminAccounts'))).toHaveCount(0);
  });

  test('rules BLOCK: coach cannot read an unassigned client clientData', async () => {
    const s = await signInAs('coach');
    try {
      const { getDoc } = await import('./fixtures/firestore');
      // A clientId the coach is NOT assigned to.
      const r = await attempt(() => getDoc(doc(s.db, 'clientData', 'not-my-client-uid', 'plan', 'workout')));
      expect(isPermissionDenied(r), `coach reading unassigned client should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('rules BLOCK: coach cannot change a user role', async () => {
    const s = await signInAs('coach');
    try {
      const r = await attempt(() =>
        setDoc(doc(s.db, 'users', clientId || 'someone'), { role: 'coach', updatedAt: Date.now() }, { merge: true }),
      );
      expect(isPermissionDenied(r), `coach changing roles should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });
});
