import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, getDocs, collection } from './fixtures/firestore';

/**
 * COACH EXERCISE LIBRARY — the coach builds reusable exercises once; they
 * persist under `coachAssets/{coachId}/exercises`, are searchable, and are
 * reachable as a dedicated bottom-nav tab. Full CRUD (create / edit / delete)
 * is exercised through the real UI.
 */

const EX_NAME = `QA Lib Back Squat ${Date.now()}`;
const EX_NAME_EDITED = `${EX_NAME} v2`;

test.describe.serial('Coach exercise library', () => {
  test.beforeEach(async ({ login, page }) => {
    await login('coach');
    await page.getByTestId(TID.coachClients).waitFor({ timeout: 25_000 });
  });

  test('opens the Library from the bottom nav', async ({ page }) => {
    await page.goto('/coach');
    await page.getByTestId(TID.navItem('coachLibrary')).click();
    await expect(page).toHaveURL(/\/coach\/library$/);
    await expect(page.getByTestId(TID.coachLibrary)).toBeVisible();
  });

  test('creates an exercise in the library (with a quick preset)', async ({ page }) => {
    await page.goto('/coach/library');
    await expect(page.getByTestId(TID.coachLibrary)).toBeVisible();

    await page.getByTestId(TID.libNew).click();
    await expect(page.getByTestId(TID.exerciseForm)).toBeVisible();
    await page.getByTestId(TID.exName).fill(EX_NAME);
    await page.getByTestId(TID.exTarget).fill('Quads');
    await page.getByTestId(TID.preset('strength')).click(); // fills 4 working × 3-6 · 150s
    await page.getByTestId(TID.exSave).click();
    await expect(page.getByTestId(TID.exerciseForm)).toBeHidden();

    await expect(page.getByTestId(TID.libItem).filter({ hasText: EX_NAME })).toBeVisible({ timeout: 15_000 });
  });

  test('library exercise persisted under coachAssets with preset values', async () => {
    const s = await signInAs('coach');
    try {
      const snap = await getDocs(collection(s.db, 'coachAssets', s.uid, 'exercises'));
      const ex = snap.docs.map((d) => d.data() as { name: string; workingSets: number; restSec: number }).find((e) => e.name === EX_NAME);
      expect(ex, 'library exercise persisted').toBeTruthy();
      expect(ex!.workingSets).toBe(4); // strength preset
      expect(ex!.restSec).toBe(150);
    } finally {
      await s.close();
    }
  });

  test('search filters the library', async ({ page }) => {
    await page.goto('/coach/library');
    await expect(page.getByTestId(TID.coachLibrary)).toBeVisible();
    await page.getByTestId(TID.libSearch).fill('zzz-definitely-no-match-zzz');
    await expect(page.getByTestId(TID.libItem)).toHaveCount(0);
    await page.getByTestId(TID.libSearch).fill('QA Lib Back Squat');
    await expect(page.getByTestId(TID.libItem).first()).toBeVisible({ timeout: 10_000 });
  });

  test('views an exercise read-only, then edits it', async ({ page }) => {
    await page.goto('/coach/library');
    await page.getByTestId(TID.libSearch).fill(EX_NAME);
    // Tapping an exercise opens the read-only VIEW; an Edit button switches to the form.
    await page.getByRole('button', { name: new RegExp(EX_NAME) }).first().click();
    await expect(page.getByTestId('exercise-view')).toBeVisible();
    await page.getByTestId('exercise-view-edit').click();
    await expect(page.getByTestId(TID.exerciseForm)).toBeVisible();
    await page.getByTestId(TID.exName).fill(EX_NAME_EDITED);
    await page.getByTestId(TID.exSave).click();
    await expect(page.getByTestId(TID.exerciseForm)).toBeHidden();

    await page.getByTestId(TID.libSearch).fill(EX_NAME_EDITED);
    await expect(page.getByTestId(TID.libItem).filter({ hasText: EX_NAME_EDITED })).toBeVisible({ timeout: 10_000 });
  });

  test('deletes a library exercise', async ({ page }) => {
    await page.goto('/coach/library');
    await page.getByTestId(TID.libSearch).fill(EX_NAME_EDITED);
    const row = page.getByTestId(TID.libItem).filter({ hasText: EX_NAME_EDITED }).first();
    await row.getByRole('button', { name: /delete/i }).click();
    await page.getByTestId(TID.confirmAccept).click();
    await expect(page.getByTestId(TID.libItem).filter({ hasText: EX_NAME_EDITED })).toHaveCount(0, { timeout: 10_000 });

    // Confirm the doc is gone at the data layer too.
    const s = await signInAs('coach');
    try {
      const snap = await getDocs(collection(s.db, 'coachAssets', s.uid, 'exercises'));
      const names = snap.docs.map((d) => (d.data() as { name: string }).name);
      expect(names).not.toContain(EX_NAME_EDITED);
    } finally {
      await s.close();
    }
  });
});
