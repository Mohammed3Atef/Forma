import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, readDoc, setDoc, doc } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';

/**
 * LIBRARY → CLIENT PLAN INDEPENDENCE — adding a library exercise into a client
 * plan DEEP-COPIES it (fresh id) into the plan. Editing the library exercise
 * afterwards must NOT change the copy already living in the client's plan.
 */

const PW = 'LibPlan123456!';
const LIB_EX_NAME = `QA Library Curl ${Date.now()}`;
const LIB_EX_ID = `qa-lib-ex-${Date.now()}`;
let client: NewClient;
let coachUid = '';

interface WPlan { name: string; exercises: Record<string, { id: string; name: string; workingSets: number }> }

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    coachUid = coach.uid;
    client = await createClientViaApi(coach, {
      email: uniqueEmail('qa-libplan'),
      password: PW,
      displayName: `QA LibPlan ${Date.now()}`,
    });
    // Seed a known library exercise directly (deterministic for the picker).
    await setDoc(doc(coach.db, 'coachAssets', coachUid, 'exercises', LIB_EX_ID), {
      id: LIB_EX_ID,
      name: LIB_EX_NAME,
      targetMuscle: 'Biceps',
      warmupSets: '1',
      warmupSetCount: 1,
      workingSets: 3,
      repRange: '10-12',
      rir: '',
      tempo: '',
      notes: { en: 'Slow eccentric.', ar: '' },
      restSec: 75,
      videoId: null,
      videoUrl: null,
      category: 'Isolation',
      equipment: 'Dumbbell',
      tags: ['arms'],
      progressionNotes: '',
    });
  } finally {
    await coach.close();
  }
});

test.describe.serial('Library → client plan independence', () => {
  test('coach adds a library exercise into a client plan (deep copy)', async ({ page, login }) => {
    await login('coach');
    await page.goto(`/coach/client/${client.uid}/workout`);
    await expect(page.getByTestId(TID.coachWorkoutEditor)).toBeVisible();

    await page.getByTestId(TID.workoutPlanName).fill('Plan With Library Exercise');
    await page.getByTestId(TID.builderAddDay).click();
    await expect(page.getByTestId(TID.builderDay)).toBeVisible();
    await page.getByTestId(TID.builderAddSection).click();
    await expect(page.getByTestId(TID.builderSection)).toBeVisible();

    // Pick from the library (NOT quick-create).
    await page.getByTestId(TID.builderAddExercise).click();
    await expect(page.getByTestId(TID.exercisePicker)).toBeVisible();
    await page.getByTestId(TID.pickerSearch).fill(LIB_EX_NAME);
    await page.getByTestId(TID.pickerLibItem).filter({ hasText: LIB_EX_NAME }).first().click();
    await expect(page.getByTestId(TID.exercisePicker)).toBeHidden({ timeout: 15_000 });

    await page.getByTestId(TID.workoutSave).click();
    await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible({ timeout: 20_000 });

    const s = await signInAs('coach');
    try {
      const plan = await readDoc<WPlan>(s.db, ['clientData', client.uid, 'plan', 'workout']);
      const ex = Object.values(plan!.exercises).find((e) => e.name === LIB_EX_NAME);
      expect(ex, 'library exercise copied into the plan').toBeTruthy();
      // Deep copy: the in-plan id must differ from the library doc id.
      expect(ex!.id).not.toBe(LIB_EX_ID);
    } finally {
      await s.close();
    }
  });

  test('editing the library exercise does NOT change the client plan copy', async () => {
    const s = await signInAs('coach');
    try {
      // Mutate the library exercise (rename + change working sets).
      await setDoc(doc(s.db, 'coachAssets', s.uid, 'exercises', LIB_EX_ID), {
        id: LIB_EX_ID,
        name: `${LIB_EX_NAME} EDITED`,
        targetMuscle: 'Biceps',
        warmupSets: '1',
        warmupSetCount: 1,
        workingSets: 99,
        repRange: '10-12',
        rir: '',
        tempo: '',
        notes: { en: 'Slow eccentric.', ar: '' },
        restSec: 75,
        videoId: null,
        videoUrl: null,
        category: 'Isolation',
        equipment: 'Dumbbell',
        tags: ['arms'],
        progressionNotes: '',
      });

      const plan = await readDoc<WPlan>(s.db, ['clientData', client.uid, 'plan', 'workout']);
      const copy = Object.values(plan!.exercises).find((e) => e.name === LIB_EX_NAME);
      expect(copy, 'plan copy keeps the original name').toBeTruthy();
      expect(copy!.workingSets, 'plan copy unaffected by library edit').not.toBe(99);
      const edited = Object.values(plan!.exercises).find((e) => e.name.includes('EDITED'));
      expect(edited, 'library rename did not leak into the plan').toBeFalsy();
    } finally {
      await s.close();
    }
  });
});
