import { test, expect, type Page } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, signInWith, readDoc, getDocs, collection, attempt, isPermissionDenied, setDoc, doc } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';

/**
 * WORKOUT TEMPLATES — the core "snapshot, never link" guarantee.
 *
 * A coach builds a workout template (coachAssets/{coachId}/workoutTemplates),
 * assigns it to a client (which SNAPSHOTS an independent copy into
 * clientData/{clientId}/plan/workout with `meta`), then:
 *   - editing the assigned plan flips meta.isCustomized=true and DOES NOT touch
 *     the template;
 *   - editing the template later DOES NOT touch the already-assigned plan;
 *   - the client sees the sectioned plan and CANNOT write it (rules).
 */

const PW = 'Templates123456!';
const TPL_NAME = `QA Template ${Date.now()}`;
let client: NewClient;
let templateId = '';

interface WPlan {
  name: string;
  exercises: Record<string, { id: string; name: string }>;
  meta?: { sourceTemplateId?: string; isCustomized?: boolean };
}
interface WTemplate { id: string; name: string; exercises: Record<string, { name: string }> }

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    client = await createClientViaApi(coach, {
      email: uniqueEmail('qa-tpl'),
      password: PW,
      displayName: `QA Tpl ${Date.now()}`,
    });
  } finally {
    await coach.close();
  }
});

/** Add one exercise to the current section via the picker's quick-create. */
async function addExerciseViaPicker(page: Page, vals: { name: string; warmup: string; working: string; reps: string; rest: string }): Promise<void> {
  await page.getByTestId(TID.builderAddExercise).click();
  await expect(page.getByTestId(TID.exercisePicker)).toBeVisible();
  await page.getByTestId(TID.pickerQuickCreate).click();
  await expect(page.getByTestId(TID.exerciseForm)).toBeVisible();
  await page.getByTestId(TID.exName).fill(vals.name);
  await page.getByTestId(TID.exWarmupSets).fill(vals.warmup);
  await page.getByTestId(TID.exWorkingSets).fill(vals.working);
  await page.getByTestId(TID.exReps).fill(vals.reps);
  await page.getByTestId(TID.exRest).fill(vals.rest);
  await page.getByTestId(TID.exSave).click();
  await expect(page.getByTestId(TID.exercisePicker)).toBeHidden({ timeout: 15_000 });
}

test.describe.serial('Workout templates (snapshot independence)', () => {
  test.beforeEach(async ({ login }) => {
    await login('coach');
  });

  test('creates a workout template (day → section → exercise)', async ({ page }) => {
    await page.goto('/coach/templates');
    await expect(page.getByTestId(TID.coachTemplates)).toBeVisible();

    await page.getByTestId(TID.templateNew).click();
    await expect(page.getByTestId(TID.coachTemplateEditor)).toBeVisible();
    await page.getByTestId(TID.templateName).fill(TPL_NAME);

    await page.getByTestId(TID.builderAddDay).click();
    await expect(page.getByTestId(TID.builderDay)).toBeVisible();
    await page.getByTestId(TID.builderAddSection).click();
    await expect(page.getByTestId(TID.builderSection)).toBeVisible();
    await addExerciseViaPicker(page, { name: 'Template Squat', warmup: '1', working: '5', reps: '5', rest: '180' });

    await page.getByTestId(TID.templateSave).click();
    await expect(page.getByTestId(TID.coachTemplates)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(TID.templateCard).filter({ hasText: TPL_NAME })).toBeVisible();
  });

  test('template persisted under coachAssets/workoutTemplates', async () => {
    const s = await signInAs('coach');
    try {
      const snap = await getDocs(collection(s.db, 'coachAssets', s.uid, 'workoutTemplates'));
      const tpl = snap.docs.map((d) => d.data() as WTemplate).find((t) => t.name === TPL_NAME);
      expect(tpl, 'template doc').toBeTruthy();
      templateId = tpl!.id;
      expect(Object.values(tpl!.exercises).map((e) => e.name)).toContain('Template Squat');
    } finally {
      await s.close();
    }
  });

  test('assigning the template writes an INDEPENDENT snapshot with meta', async ({ page }) => {
    test.skip(!templateId, 'template not created');
    await page.goto('/coach/templates');
    const card = page.getByTestId(TID.templateCard).filter({ hasText: TPL_NAME });
    await card.getByTestId(TID.templateAssign).click();
    await page.getByTestId(TID.assignClientBtn).filter({ hasText: client.displayName }).first().click();
    // onSuccess renders the Done button — confirms the assignment write landed.
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 15_000 });

    const s = await signInAs('coach');
    try {
      const plan = await readDoc<WPlan>(s.db, ['clientData', client.uid, 'plan', 'workout']);
      expect(plan, 'assigned plan').toBeTruthy();
      expect(plan!.meta?.sourceTemplateId).toBe(templateId);
      expect(plan!.meta?.isCustomized).toBe(false);
      expect(Object.values(plan!.exercises).map((e) => e.name)).toContain('Template Squat');

      // Independence: plan exercise ids must NOT overlap the template's (deep copy).
      const tpl = await readDoc<WTemplate>(s.db, ['coachAssets', s.uid, 'workoutTemplates', templateId]);
      const planIds = Object.keys(plan!.exercises);
      const tplIds = Object.keys(tpl!.exercises);
      expect(planIds.some((id) => tplIds.includes(id)), 'snapshot regenerates ids').toBe(false);
    } finally {
      await s.close();
    }
  });

  test('editing the assigned plan flips isCustomized and leaves the template UNCHANGED', async ({ page }) => {
    test.skip(!templateId, 'template not created');
    await page.goto(`/coach/client/${client.uid}/workout`);
    await expect(page.getByTestId(TID.coachWorkoutEditor)).toBeVisible();
    await page.getByTestId(TID.workoutPlanName).fill('Customized Plan Name');
    await page.getByTestId(TID.workoutSave).click();
    await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible({ timeout: 20_000 });

    const s = await signInAs('coach');
    try {
      const plan = await readDoc<WPlan>(s.db, ['clientData', client.uid, 'plan', 'workout']);
      expect(plan!.name).toBe('Customized Plan Name');
      expect(plan!.meta?.isCustomized, 'coach edit customizes the plan').toBe(true);
      expect(plan!.meta?.sourceTemplateId).toBe(templateId);

      const tpl = await readDoc<WTemplate>(s.db, ['coachAssets', s.uid, 'workoutTemplates', templateId]);
      expect(tpl!.name, 'template untouched by plan edit').toBe(TPL_NAME);
      expect(Object.values(tpl!.exercises).map((e) => e.name)).toContain('Template Squat');
    } finally {
      await s.close();
    }
  });

  test('editing the template later does NOT change the already-assigned plan', async ({ page }) => {
    test.skip(!templateId, 'template not created');
    await page.goto(`/coach/templates/${templateId}`);
    await expect(page.getByTestId(TID.coachTemplateEditor)).toBeVisible();
    await page.getByTestId(TID.templateName).fill(`${TPL_NAME} v2`);
    await page.getByTestId(TID.templateSave).click();
    await expect(page.getByTestId(TID.coachTemplates)).toBeVisible({ timeout: 20_000 });

    const s = await signInAs('coach');
    try {
      const tpl = await readDoc<WTemplate>(s.db, ['coachAssets', s.uid, 'workoutTemplates', templateId]);
      expect(tpl!.name).toBe(`${TPL_NAME} v2`);
      const plan = await readDoc<WPlan>(s.db, ['clientData', client.uid, 'plan', 'workout']);
      expect(plan!.name, 'assigned plan untouched by template edit').toBe('Customized Plan Name');
      expect(plan!.meta?.sourceTemplateId).toBe(templateId);
    } finally {
      await s.close();
    }
  });

  test('client sees the assigned sectioned plan and CANNOT edit it', async ({ page, loginWith }) => {
    test.skip(!templateId, 'template not created');
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });

    await page.goto('/workout');
    await expect(page.getByTestId(TID.waitingForCoach)).toHaveCount(0, { timeout: 20_000 });
    await page.getByText(/Day 1/).first().click();
    await expect(page.getByText('Template Squat')).toBeVisible({ timeout: 15_000 });
    // Working-set tag is visible in the read-only display.
    await expect(page.getByText(/Working/).first()).toBeVisible();

    // Rules: the client cannot write the coach-owned plan directly.
    const s = await signInWith(client.email, client.password);
    try {
      const r = await attempt(() => setDoc(doc(s.db, 'clientData', client.uid, 'plan', 'workout'), { hacked: true }, { merge: true }));
      expect(isPermissionDenied(r), `client writing the coach plan should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });
});
