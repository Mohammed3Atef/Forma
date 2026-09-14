import { test, expect } from '@playwright/test';
import { IDS, addMeal, addFoodToMeal, loginFresh } from './helpers';

/**
 * Builds a real nutrition plan (targets, meals, foods with macros, an approved
 * food-alternatives group, supplements) for client@forma.test through the
 * actual coach UI, assigns it, and verifies the client sees the assigned
 * targets/meals/foods rendered correctly.
 *
 * NOTE on scope: while writing this suite we found a real bug in
 * CoachNutritionEditor (and the identical pattern in CoachCardioEditor) — its
 * "load the plan" effect falls back to an empty plan as soon as `plan === null`
 * WITHOUT waiting for the query to finish loading, so reopening an existing,
 * already-assigned plan reliably (not just occasionally) shows it as blank,
 * and saving from there would silently wipe the client's real plan.
 * CoachWorkoutEditor already guards this correctly with `query.isLoading`; we
 * applied the same fix to the other two (see git log — committed locally as
 * `fix: coach nutrition/cardio editors race to an empty plan on load`), but
 * could not deploy it (no push access to origin in this environment) and this
 * suite runs against the live, still-unpatched, production site. So this spec
 * deliberately never reopens the nutrition editor for client@forma.test after
 * the initial save, to avoid actually triggering the live bug and destroying
 * the real plan/meals/foods it just built. "Edit an existing plan" and
 * "version history" for nutrition are exercised on the *workout* plan instead
 * (see workout-plan.spec.ts), where the editor does not have this bug.
 */
test.describe('Coach: build & assign nutrition plan', () => {
  const GROUP_NAME = 'Lean Protein Swaps';
  const PLAN_NAME = 'Balanced Cut - 2150 kcal';

  test('build a food-alternatives group, assign a nutrition plan, and verify from the client', async ({ page, browser }) => {
    test.setTimeout(180_000);

    // Fresh login rather than the shared e2e/.auth/coach.json snapshot — see
    // loginFresh's doc comment (multiple agents share this account concurrently).
    await loginFresh(page, 'E2E_COACH_EMAIL', 'E2E_COACH_PASSWORD');

    // ---- 1. Build a small food library + an approved-alternatives group ----
    await page.goto('/coach/library');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lib-tab-foods').click();
    await page.waitForLoadState('networkidle');

    const foods = [
      { name: 'Grilled Chicken Breast', quantity: '200 g', calories: '330', protein: '62', carbs: '0', fats: '7' },
      { name: 'Baked Salmon Fillet', quantity: '200 g', calories: '412', protein: '46', carbs: '0', fats: '25' },
      { name: 'Firm Tofu', quantity: '250 g', calories: '200', protein: '22', carbs: '6', fats: '11' },
    ];
    // Idempotent: skip re-creating a food/group a previous run of this spec
    // already added (the library is an additive, coach-wide asset list with no
    // natural dedupe of its own). Text-based check (not a testid) since the
    // foods tab renders a desktop DataTable at this viewport width instead of
    // the mobile `food-item` card list.
    for (const f of foods) {
      if (await page.getByText(f.name, { exact: true }).count()) continue;
      await page.getByTestId('food-new').click();
      const form = page.getByTestId('food-lib-form');
      await expect(form).toBeVisible();
      await form.getByTestId('lf-name').fill(f.name);
      await form.getByTestId('lf-quantity').fill(f.quantity);
      await form.getByTestId('lf-calories').fill(f.calories);
      await form.getByTestId('lf-protein').fill(f.protein);
      await form.getByTestId('lf-carbs').fill(f.carbs);
      await form.getByTestId('lf-fats').fill(f.fats);
      await form.getByTestId('lf-save').click();
      await expect(form).not.toBeVisible();
    }

    await page.getByTestId('lib-tab-groups').click();
    await page.waitForLoadState('networkidle');
    if (await page.getByText(GROUP_NAME, { exact: true }).count()) {
      // already exists from a previous run
    } else {
      await page.getByTestId('group-new').click();
      const groupForm = page.getByTestId('group-form');
      await expect(groupForm).toBeVisible();
      await groupForm.getByTestId('grp-name').fill(GROUP_NAME);
      for (const f of foods) {
        await groupForm.getByTestId('grp-foods').getByRole('button', { name: f.name, exact: true }).first().click();
      }
      await groupForm.getByTestId('grp-save').click();
      await expect(groupForm).not.toBeVisible();
    }
    await expect(page.getByTestId('group-item').filter({ hasText: GROUP_NAME }).first()).toBeVisible();

    // ---- 2. Open the nutrition editor for client@forma.test ----
    await page.goto(`/coach/client/${IDS.clientMain}/nutrition`);
    await expect(page.getByTestId('coach-nutrition-editor')).toBeVisible();
    await page.getByTestId('nutrition-plan-name').fill(PLAN_NAME);

    await page.getByTestId('nutrition-target-calories').fill('2150');
    await page.getByTestId('nutrition-target-protein').fill('175');
    await page.getByTestId('nutrition-target-carbs').fill('210');
    await page.getByTestId('nutrition-target-fats').fill('65');
    await page.getByTestId('nutrition-water-target').fill('3200');

    // Let clients swap the protein source between approved alternatives, coach must review any custom swap.
    await page.getByTestId('policy-allowClientSubstitutions').click();
    await page.getByTestId('policy-requireCoachApproval').click();

    // ---- 3. Meals ----
    const breakfast = await addMeal(page, { label: 'Breakfast', slot: 'Breakfast' });
    await addFoodToMeal(page, breakfast, {
      name: 'Grilled Chicken Breast', quantity: '200 g', calories: '330', protein: '62', carbs: '0', fats: '7', altGroup: GROUP_NAME,
    });
    await addFoodToMeal(page, breakfast, { name: 'Oats', quantity: '80 g dry', calories: '300', protein: '10', carbs: '54', fats: '5' });

    const lunch = await addMeal(page, { label: 'Lunch', slot: 'Lunch' });
    await addFoodToMeal(page, lunch, { name: 'Baked Salmon Fillet', quantity: '200 g', calories: '412', protein: '46', carbs: '0', fats: '25', altGroup: GROUP_NAME });
    await addFoodToMeal(page, lunch, { name: 'Steamed Brown Rice', quantity: '200 g cooked', calories: '220', protein: '5', carbs: '45', fats: '2' });

    const dinner = await addMeal(page, { label: 'Dinner', slot: 'Dinner' });
    await addFoodToMeal(page, dinner, { name: 'Firm Tofu Stir-fry', quantity: '250 g', calories: '260', protein: '24', carbs: '12', fats: '13' });
    await addFoodToMeal(page, dinner, { name: 'Mixed Vegetables', quantity: '250 g', calories: '90', protein: '4', carbs: '18', fats: '1' });

    // ---- 4. Supplements ----
    await page.getByRole('button', { name: 'Add supplement' }).click();
    const suppSheet = page.getByTestId('sheet-panel');
    await expect(suppSheet).toBeVisible();
    await suppSheet.getByLabel('Name').fill('Whey Protein Isolate');
    await suppSheet.getByLabel('Dose').fill('30 g (1 scoop)');
    await suppSheet.getByLabel('Timing').fill('Post-workout');
    await suppSheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(suppSheet).not.toBeVisible();

    // ---- 5. Save (assigns to client@forma.test) ----
    await page.getByTestId('nutrition-save').click();
    await expect(page.getByTestId('coach-client-detail')).toBeVisible({ timeout: 15_000 });

    // ---- 6. Verify the assignment: Targets card + Manage sheet ----
    await expect(page.getByText('2150')).toBeVisible();
    await expect(page.getByText('175')).toBeVisible();
    await page.getByTestId('coach-manage').click();
    await expect(page.getByTestId('coach-edit-nutrition')).toContainText(PLAN_NAME);
    await page.getByTestId('sheet-close').click();

    // ---- 7. Client-side verification ----
    // (Edit / save-as-version / version-history for an *existing* nutrition
    // plan are intentionally not exercised here — see the file-level note on
    // the live CoachNutritionEditor reopen bug. That flow is proven instead on
    // the workout plan in workout-plan.spec.ts, whose editor isn't affected.)
    // Fresh login (not the shared e2e/.auth/client.json snapshot) — see loginFresh.
    const clientCtx = await browser.newContext();
    const clientPage = await clientCtx.newPage();
    await loginFresh(clientPage, 'E2E_CLIENT_EMAIL', 'E2E_CLIENT_PASSWORD');
    await clientPage.goto('/nutrition');
    await clientPage.waitForLoadState('networkidle');

    await expect(clientPage.getByText('Breakfast')).toBeVisible();
    await expect(clientPage.getByText('Lunch')).toBeVisible();
    await expect(clientPage.getByText('Dinner')).toBeVisible();
    await expect(clientPage.getByText('Grilled Chicken Breast')).toBeVisible();
    await expect(clientPage.getByText('Baked Salmon Fillet')).toBeVisible();
    await expect(clientPage.getByText('Firm Tofu Stir-fry')).toBeVisible();
    await expect(clientPage.getByText('/2150')).toBeVisible();
    await expect(clientPage.getByText('/175')).toBeVisible();
    await expect(clientPage.getByText(/3200 ml/)).toBeVisible();

    await clientCtx.close();
  });
});
