import { test, expect, AUTH, watchForIssues } from './_helpers';

test.use({ storageState: AUTH('coach') });

const UNIQUE = Date.now(); // keep created-item names unique across repeat runs
const EX_NAME = `Cable Crossover QA ${UNIQUE}`;
const FOOD_NAME = `Grilled Chicken Breast QA ${UNIQUE}`;
const GROUP_NAME = `Lean Protein Swaps QA ${UNIQUE}`;
const SUPP_NAME = `Whey Isolate QA ${UNIQUE}`;

test.describe('Coach Library — exercises', () => {
  test('seed starter (if sparse), create, search, edit a custom exercise', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/library');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('coach-library')).toBeVisible();

    // Exercises tab is the default. If the library looks sparse, use the
    // one-tap starter import (idempotent — safe to run even if already seeded).
    const exerciseCount = await page.getByTestId('lib-item').count();
    const desktopRows = await page.locator('[data-testid="coach-desktop-library"] tbody tr').count().catch(() => 0);
    if (exerciseCount + desktopRows < 5) {
      await page.getByTestId('lib-load-starter').click();
      await expect(page.getByTestId('confirm-dialog')).toBeVisible();
      await page.getByTestId('confirm-accept').click();
      await expect(page.getByTestId('lib-load-starter')).toBeEnabled({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
    }

    // Create a realistic custom exercise.
    await page.getByTestId('lib-new').click();
    await page.getByTestId('ex-name').fill(EX_NAME);
    await page.getByTestId('ex-target').fill('Chest');
    await page.getByTestId('ex-working-sets').fill('4');
    await page.getByTestId('ex-reps').fill('10-12');
    await page.getByTestId('ex-rest').fill('90');
    await page.getByTestId('ex-notes').fill('Keep a slight forward lean, squeeze at full contraction.');
    await page.getByTestId('ex-save').click();
    await page.waitForLoadState('networkidle');

    // Search for it.
    await page.getByTestId('lib-search').fill(EX_NAME);
    await page.waitForTimeout(400);
    const foundMobile = await page.getByTestId('lib-item').filter({ hasText: EX_NAME }).count();
    const foundDesktop = await page.locator('[data-testid="coach-desktop-library"]').getByText(EX_NAME).count();
    expect(foundMobile + foundDesktop).toBeGreaterThan(0);

    // Open it and edit (append a note) via the preview sheet's Edit action.
    if (foundMobile > 0) {
      await page.getByTestId('lib-item').filter({ hasText: EX_NAME }).first().click();
    } else {
      await page.locator('[data-testid="coach-desktop-library"]').getByText(EX_NAME).first().click();
    }
    await page.getByTestId('exercise-view-edit').click();
    await expect(page.getByTestId('ex-name')).toHaveValue(EX_NAME);
    await page.getByTestId('ex-target').fill('Chest (upper)');
    await page.getByTestId('ex-save').click();
    await page.waitForLoadState('networkidle');

    // Verify the edit persisted after a reload.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lib-search').fill(EX_NAME);
    await page.waitForTimeout(400);
    const row = page.getByTestId('lib-item').filter({ hasText: EX_NAME });
    if (await row.count()) {
      await expect(row.first()).toContainText('Chest (upper)');
    } else {
      await expect(page.locator('[data-testid="coach-desktop-library"]')).toContainText('Chest (upper)');
    }

    watch.report();
  });
});

test.describe('Coach Library — foods, food groups, supplements', () => {
  test('create, search, edit a food item', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/library');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lib-tab-foods').click();
    await page.waitForTimeout(400);

    await page.getByTestId('food-new').click();
    await page.getByTestId('lf-name').fill(FOOD_NAME);
    await page.getByTestId('lf-quantity').fill('150g');
    await page.getByTestId('lf-calories').fill('248');
    await page.getByTestId('lf-protein').fill('46');
    await page.getByTestId('lf-carbs').fill('0');
    await page.getByTestId('lf-fats').fill('5.4');
    await page.getByTestId('lf-save').click();
    await page.waitForLoadState('networkidle');

    await page.getByTestId('food-search').fill(FOOD_NAME);
    await page.waitForTimeout(400);
    const foundMobile = await page.getByTestId('food-item').filter({ hasText: FOOD_NAME }).count();
    const foundDesktop = await page.locator('[data-testid="coach-desktop-foods"]').getByText(FOOD_NAME).count();
    expect(foundMobile + foundDesktop).toBeGreaterThan(0);

    if (foundMobile > 0) await page.getByTestId('food-item').filter({ hasText: FOOD_NAME }).first().click();
    else await page.locator('[data-testid="coach-desktop-foods"]').getByText(FOOD_NAME).first().click();
    await expect(page.getByTestId('lf-name')).toHaveValue(FOOD_NAME);
    await page.getByTestId('lf-quantity').fill('160g');
    await page.getByTestId('lf-save').click();
    await page.waitForLoadState('networkidle');

    watch.report();
  });

  test('create a food group using the QA food', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/library');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lib-tab-groups').click();
    await page.waitForTimeout(400);

    await page.getByTestId('group-new').click();
    await page.getByTestId('grp-name').fill(GROUP_NAME);
    await page.locator('[data-testid="group-form"]').getByRole('button', { name: FOOD_NAME }).click();
    await page.getByTestId('grp-save').click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('group-item').filter({ hasText: GROUP_NAME })).toBeVisible({ timeout: 10_000 });
    watch.report();
  });

  test('create, search, edit a supplement', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/library');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lib-tab-supplements').click();
    await page.waitForTimeout(400);

    await page.getByTestId('supp-new').click();
    await page.getByTestId('supp-name').fill(SUPP_NAME);
    await page.getByTestId('supp-dose').fill('1 scoop (30g)');
    await page.getByTestId('supp-timing').fill('Post-workout');
    await page.getByTestId('supp-save').click();
    await page.waitForLoadState('networkidle');

    await page.getByTestId('supp-search').fill(SUPP_NAME);
    await page.waitForTimeout(400);
    await expect(page.getByTestId('supp-item').filter({ hasText: SUPP_NAME })).toBeVisible();

    await page.getByTestId('supp-item').filter({ hasText: SUPP_NAME }).first().click();
    await expect(page.getByTestId('supp-name')).toHaveValue(SUPP_NAME);
    await page.getByTestId('supp-timing').fill('Post-workout / before bed');
    await page.getByTestId('supp-save').click();
    await page.waitForLoadState('networkidle');

    watch.report();
  });

  test('throwaway item: create then delete via the delete button, confirm real items remain', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    const THROWAWAY = `Throwaway QA Supplement ${UNIQUE}`;
    await page.goto('/coach/library');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lib-tab-supplements').click();
    await page.waitForTimeout(400);

    await page.getByTestId('supp-new').click();
    await page.getByTestId('supp-name').fill(THROWAWAY);
    await page.getByTestId('supp-dose').fill('1 tablet');
    await page.getByTestId('supp-save').click();
    await page.waitForLoadState('networkidle');

    await page.getByTestId('supp-search').fill(THROWAWAY);
    await page.waitForTimeout(400);
    const row = page.getByTestId('supp-item').filter({ hasText: THROWAWAY });
    await expect(row).toBeVisible();
    await row.getByLabel('Delete').click();
    await page.getByTestId('confirm-accept').click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('supp-item').filter({ hasText: THROWAWAY })).toHaveCount(0);

    // Confirm plenty of real supplements remain (the one created earlier in this
    // run, at minimum) — never leave the library empty.
    await page.getByTestId('supp-search').fill('');
    await page.waitForTimeout(400);
    const remaining = await page.getByTestId('supp-item').count();
    expect(remaining).toBeGreaterThan(0);

    watch.report();
  });
});

test.describe('Coach Library — workout templates', () => {
  test('seed if empty, create a real template with a day/section/exercise, search/filter, preview, duplicate, edit', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    const TPL_NAME = `Push Pull Legs QA ${UNIQUE}`;

    await page.goto('/coach/templates');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('coach-templates')).toBeVisible();

    // If the library is empty, the page shows the starter-library CTA.
    const seedBtn = page.getByTestId('load-starter-library');
    if (await seedBtn.isVisible().catch(() => false)) {
      await seedBtn.click();
      await expect(page.getByTestId('confirm-dialog')).toBeVisible();
      await page.getByTestId('confirm-accept').click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }

    // Create a new template with real content.
    await page.getByTestId('template-new').click();
    await expect(page.getByTestId('coach-template-editor')).toBeVisible();
    await page.getByTestId('template-name').fill(TPL_NAME);
    await page.getByTestId('builder-add-day').click();
    await expect(page.getByTestId('builder-day')).toBeVisible();
    await page.getByTestId('day-title').fill('Push Day');
    await page.getByTestId('builder-add-section').click();
    await expect(page.getByTestId('builder-section')).toBeVisible();
    await page.getByTestId('builder-add-exercise').click();
    await expect(page.getByTestId('exercise-picker')).toBeVisible();
    await page.getByTestId('picker-search').fill('Cable Crossover QA');
    await page.waitForTimeout(400);
    const pick = page.getByTestId('picker-lib-item').first();
    if (await pick.count()) {
      await pick.click();
    } else {
      // Fall back to the first library exercise if the QA one isn't found for
      // some reason (e.g. seeding raced with the exercises test).
      await page.getByTestId('picker-search').fill('');
      await page.waitForTimeout(300);
      await page.getByTestId('picker-lib-item').first().click();
    }
    await expect(page.getByTestId('exercise-picker')).not.toBeVisible();

    // Navigate back up to the plan level to reach Save.
    await page.getByRole('button', { name: 'Day 1' }).click();
    await page.getByRole('button', { name: 'Workout plan' }).click();
    await expect(page.getByTestId('builder-plan')).toBeVisible();
    await page.getByTestId('template-save').click();
    await page.waitForLoadState('networkidle');

    // Lands on the read-only preview.
    await expect(page.getByTestId('template-preview')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('template-preview')).toContainText(TPL_NAME);
    await expect(page.getByTestId('template-preview-days')).toContainText('Push Day');

    // Back to the list; search/filter for it.
    await page.goto('/coach/templates');
    await page.waitForLoadState('networkidle');
    const card = page.getByTestId('template-card').filter({ hasText: TPL_NAME });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Preview -> Duplicate.
    await card.click();
    await expect(page.getByTestId('template-preview')).toContainText(TPL_NAME);
    await page.getByTestId('template-duplicate').click();
    await page.waitForLoadState('networkidle');
    await page.goto('/coach/templates');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('template-card').filter({ hasText: TPL_NAME })).toHaveCount(2, { timeout: 10_000 });

    // Edit the original: change its goal.
    await page.getByTestId('template-card').filter({ hasText: TPL_NAME }).first().click();
    await page.getByTestId('template-edit').click();
    await expect(page.getByTestId('coach-template-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Fat loss' }).click();
    await page.getByTestId('template-save').click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('template-preview')).toContainText('Fat loss');

    watch.report();
  });
});

test.describe('Coach Library — responsive spot-check', () => {
  for (const vp of [{ name: 'mobile', width: 390, height: 844 }, { name: 'tablet', width: 768, height: 1024 }]) {
    test(`no horizontal overflow at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/coach/library');
      await page.waitForLoadState('networkidle');
      const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflowing, `coach/library overflows horizontally at ${vp.width}px`).toBe(false);
    });
  }
});
