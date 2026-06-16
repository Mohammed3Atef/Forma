import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, signInWith, readDoc, getDocs, collection, setDoc, doc } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';
import { assignNutritionPlanWithAlternatives } from './fixtures/plans';

/**
 * FOOD ALTERNATIVES — coach builds a food + alternatives group, assigns a meal
 * whose item carries approved alternatives (snapshotted onto the plan), the
 * client swaps to an approved alternative (stored only in the day log, plan
 * untouched), and the coach sees the substitution + adherence tag.
 */

const PW = 'Foods123456!';
const FOOD_NAME = `QA Oats ${Date.now()}`;
const GROUP_NAME = `QA Carbs ${Date.now()}`;
let client: NewClient;
let seeded: { mealId: string; itemId: string; altName: string };

function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface MPlan { meals: { items: { name: { en: string }; allowedAlternatives?: unknown[] }[] }[] }

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    client = await createClientViaApi(coach, { email: uniqueEmail('qa-foods'), password: PW, displayName: `QA Foods ${Date.now()}` });
    seeded = await assignNutritionPlanWithAlternatives(coach, client.uid);
  } finally {
    await coach.close();
  }
});

test.describe.serial('Food alternatives', () => {
  test('coach creates a food and an alternatives group', async ({ page, login }) => {
    await login('coach');
    await page.goto('/coach/library');
    await expect(page.getByTestId(TID.coachLibrary)).toBeVisible();

    // Food
    await page.getByTestId(TID.libTab('foods')).click();
    await page.getByTestId(TID.foodNew).click();
    await page.getByTestId(TID.lfName).fill(FOOD_NAME);
    await page.getByTestId(TID.lfQuantity).fill('80g');
    await page.getByTestId(TID.lfMacro('calories')).fill('350');
    await page.getByTestId(TID.lfMacro('protein')).fill('13');
    await page.getByTestId(TID.lfMacro('carbs')).fill('54');
    await page.getByTestId(TID.lfMacro('fats')).fill('7');
    await page.getByTestId(TID.lfSave).click();
    await expect(page.getByTestId(TID.foodItem).filter({ hasText: FOOD_NAME })).toBeVisible({ timeout: 15_000 });

    // Group containing that food
    await page.getByTestId(TID.libTab('groups')).click();
    await page.getByTestId(TID.groupNew).click();
    await page.getByTestId(TID.grpName).fill(GROUP_NAME);
    await page.getByRole('button', { name: FOOD_NAME }).click(); // toggle the food into the group
    await page.getByTestId(TID.grpSave).click();
    await expect(page.getByTestId(TID.groupItem).filter({ hasText: GROUP_NAME })).toBeVisible({ timeout: 15_000 });

    // Persisted under coachAssets.
    const s = await signInAs('coach');
    try {
      const foods = await getDocs(collection(s.db, 'coachAssets', s.uid, 'foods'));
      expect(foods.docs.map((d) => (d.data() as { name: { en: string } }).name.en)).toContain(FOOD_NAME);
      const groups = await getDocs(collection(s.db, 'coachAssets', s.uid, 'foodGroups'));
      const g = groups.docs.map((d) => d.data() as { name: string; foods: unknown[] }).find((x) => x.name === GROUP_NAME);
      expect(g, 'food group persisted').toBeTruthy();
      expect(g!.foods.length).toBe(1);
    } finally {
      await s.close();
    }
  });

  test('client swaps a planned food for an approved alternative; the plan is untouched', async ({ page, loginWith }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });
    await page.goto('/nutrition');
    await expect(page.getByText('Oats').first()).toBeVisible({ timeout: 20_000 });

    await page.getByTestId(TID.clientSwap).first().click();
    await expect(page.getByTestId(TID.swapSheet)).toBeVisible();
    await page.getByTestId(TID.swapApprovedItem).filter({ hasText: seeded.altName }).click();

    // The replacement + adherence badge render.
    await expect(page.getByText(seeded.altName).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(TID.subBadge).first()).toContainText(/approved/i);

    // The coach-owned plan is NOT mutated by the client swap.
    const s = await signInAs('coach');
    try {
      const plan = await readDoc<MPlan>(s.db, ['clientData', client.uid, 'plan', 'nutrition']);
      expect(plan!.meals[0].items[0].name.en, 'planned item unchanged').toBe('Oats');
      expect(plan!.meals[0].items[0].allowedAlternatives?.length, 'alternatives still present').toBe(2);
    } finally {
      await s.close();
    }
  });

  test('coach activity shows the substitution with its adherence tag', async ({ page, login }) => {
    // Seed today's log with an approved substitution (deterministic, sync-free).
    const cs = await signInWith(client.email, client.password);
    const date = todayKey();
    try {
      await setDoc(doc(cs.db, 'clientData', client.uid, 'nutritionLogs', date), {
        id: date,
        date,
        mealsEaten: { [seeded.mealId]: true },
        supplementsTaken: {},
        customFoods: [],
        itemOverrides: { [seeded.itemId]: { id: 'alt-rice', name: { en: seeded.altName, ar: '' }, quantity: '150g', protein: 4, carbs: 45, fats: 1, calories: 205 } },
        substitutions: { [seeded.itemId]: { source: 'approved_substitution' } },
        extraItems: {},
        waterMl: 0,
        creatineTaken: false,
        updatedAt: Date.now(),
        dirty: false,
      });
    } finally {
      await cs.close();
    }

    await login('coach');
    await page.goto(`/coach/client/${client.uid}/activity`);
    await expect(page.getByTestId(TID.activitySubstitutions)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(TID.activitySubstitutions)).toContainText(seeded.altName);
    await expect(page.getByTestId(TID.activitySubstitutions)).toContainText(/approved/i);
  });
});
