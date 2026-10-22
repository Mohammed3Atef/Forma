import { type Page } from '@playwright/test';
import { test, expect, ready, shot } from '../fixtures';
import { uiLogin, coachSignOut, noHmr } from './_a-helpers';
import { appReady, openPlanBuilder } from './_b-helpers';
import { allowDevModuleStorm, waitForLocaleSaved } from './_c-helpers';

/**
 * B3.9 certification journeys (B3_COACH_BLUEPRINT §10.2):
 *  K — account isolation: coach A out → coach B in → none of A's clients, drafts or conversations;
 *      A's own draft is still A's when A comes back (drafts are per coach, never shared).
 *  L — Arabic: Today in RTL, a plan target typed in Arabic digits saves as the number, a message in Arabic.
 *  M — failure recovery: a failed read says so and Retry recovers; a failed write reads as a translated
 *      line (never the server's text); a read paused offline is "offline", not a skeleton, and recovers;
 *      a half-written message survives a reload.
 * Plus the B3.9 keyboard model in a real browser: skip link, focus follows navigation, Escape closes
 * only the top layer.
 */

const sized = (width: number, height = 900) => ({ viewport: { width, height } });
const message = (page: Page) => page.getByTestId('message-input');

test.describe('B3.9 journeys', () => {
  test('K — account isolation: coach B sees none of coach A\'s clients, drafts or conversations; A keeps its own draft', async ({ anon, env, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { context, page } = await anon(sized(1440));
    await noHmr(context);
    const aya = env.accounts.clientA.id;
    const draft = 'K: a half-written note for Aya';

    await uiLogin(page, env.accounts.coachA.email, env.password);
    await appReady(page);
    await page.goto(`/coach/messages/${aya}`);
    await ready(page);
    await expect(message(page)).toBeVisible({ timeout: 20_000 });
    await message(page).fill(draft);
    await page.waitForTimeout(400); // the composer persists its draft on a short debounce
    await coachSignOut(page);
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 15_000 });

    // Same tab, coach B.
    await uiLogin(page, env.accounts.coachB.email, env.password);
    await appReady(page);
    await page.goto('/coach');
    await ready(page);
    await expect(page.getByText('Client Bilal').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Client Aya')).toHaveCount(0);
    await page.goto('/coach/messages');
    await ready(page);
    await expect(page.getByText('Client Bilal').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Client Aya')).toHaveCount(0);
    // A's client by URL: not B's — no thread, no composer, no draft.
    await page.goto(`/coach/messages/${aya}`);
    await ready(page);
    await expect(page.getByText('This conversation isn’t available').first()).toBeVisible({ timeout: 20_000 });
    await expect(message(page)).toHaveCount(0); // no composer — nothing can be sent, no draft can show
    await expect(page.locator('body')).not.toContainText(draft);
    await page.goto(`/coach/client/${aya}`);
    await ready(page);
    await expect(page.getByTestId('workspace-not-on-roster')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(draft);
    await shot(page, testInfo, 'k-coachB-no-coachA-data');

    // Back to A: the draft is A's and is still there.
    await coachSignOut(page);
    await uiLogin(page, env.accounts.coachA.email, env.password);
    await appReady(page);
    await page.goto(`/coach/messages/${aya}`);
    await ready(page);
    await expect(message(page)).toHaveValue(draft, { timeout: 20_000 });
    await message(page).fill('');
  });

  test('L — Arabic: Today right-to-left, a target typed in Arabic digits saves as the number, a message in Arabic', async ({ as, env, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const aya = env.accounts.clientA.id;
    const before = await db.findOne<{ targets?: Record<string, number>; name?: string }>('clientNutritionPlans', { _id: aya });
    const { page } = await as('coachA', sized(1440));
    try {
      await page.goto('/coach/settings');
      await ready(page);
      await page.getByRole('button', { name: 'العربية', exact: true }).click();
      await waitForLocaleSaved(page, 'ar');

      await page.goto('/coach');
      await ready(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByTestId('coach-today').getByRole('heading', { level: 1 })).toHaveText('اليوم');
      await shot(page, testInfo, 'l-today-rtl');

      await page.goto(`/coach/client/${aya}/nutrition`);
      await appReady(page, 'coach-nutrition-editor');
      await openPlanBuilder(page, 'nutrition-plan-name');
      if (!(await page.getByTestId('nutrition-plan-name').inputValue())) await page.getByTestId('nutrition-plan-name').fill('خطة آية');
      await page.getByTestId('nutrition-target-calories').fill('٢٢٥٠');
      await page.getByTestId('nutrition-save').click();
      await expect(page.getByTestId('nutrition-saved')).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => (await db.findOne<{ targets: { calories: number } }>('clientNutritionPlans', { _id: aya }))?.targets?.calories).toBe(2250);

      await page.goto(`/coach/messages/${aya}`);
      await ready(page);
      const text = `رسالة تجربة ${Date.now()}`;
      await message(page).fill(text);
      await page.getByTestId('message-send').click();
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => db.count('messages', { clientId: aya, body: text })).toBe(1);
      await shot(page, testInfo, 'l-message-ar');
    } finally {
      // Leave the shared fixtures as they were: English, and Aya's nutrition targets.
      await page.goto('/coach/settings').catch(() => undefined);
      await page.getByRole('button', { name: 'English', exact: true }).click().catch(() => undefined);
      await waitForLocaleSaved(page, 'en').catch(() => undefined);
      if (before) await db.updateOne('clientNutritionPlans', { _id: aya }, { $set: { targets: before.targets, name: before.name } });
      else await db.deleteMany('clientNutritionPlans', { _id: aya });
    }
  });

  test('M — failure recovery: failed read → Retry; failed write → a translated line, never server text; offline → offline state → recovers; a draft survives reload', async ({ as, env, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    audit.allow5xx(/coachAssets.exercises.save/); // the 500 this journey stages
    const { context, page } = await as('coachA', sized(1440));

    // 1. A failed read: the roster never loads → an error with Retry, then it recovers.
    await page.route('**/api/trpc/**coachClients.listMyClientUsers**', (r) => r.abort('failed'));
    await page.goto('/coach/clients');
    await ready(page);
    await expect(page.getByTestId('coach-clients')).toHaveAttribute('data-state', /error|offline/, { timeout: 30_000 });
    await shot(page, testInfo, 'm-read-failed');
    await page.unroute('**/api/trpc/**coachClients.listMyClientUsers**');
    await page.getByTestId('coach-clients').getByRole('button', { name: 'Retry' }).first().click();
    await expect(page.getByText('Client Aya').first()).toBeVisible({ timeout: 30_000 });

    // 2. A failed write: the server's own text (here a raw database error) never reaches the coach.
    await page.route('**/api/trpc/**coachAssets.exercises.save**', (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify([{ error: { message: 'E11000 duplicate key error collection: forma.coachExercises', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } }]) }),
    );
    await page.goto('/coach/library?tab=exercises');
    await appReady(page, 'lib-new');
    await page.getByTestId('lib-new').click();
    await page.getByTestId('ex-name').fill(`M failure ${Date.now()}`);
    await page.getByTestId('ex-save').click();
    const dialog = page.getByTestId('confirm-dialog');
    await expect(dialog).toContainText('Forma had a problem on its side', { timeout: 20_000 });
    await expect(dialog).not.toContainText('E11000');
    await shot(page, testInfo, 'm-write-failed-translated');
    await page.getByTestId('confirm-accept').click();
    await page.unroute('**/api/trpc/**coachAssets.exercises.save**');

    // 3. Offline mid-session: the screen keeps what it has, says it is offline (never a spinner or an
    //    empty list), and refreshes once the connection is back. (A cold offline start with nothing on the
    //    device is certified on the production build — e2e3/pwa/b39-coach-offline-boot.mjs; the dev server
    //    cannot serve a not-yet-loaded screen offline.)
    await page.goto('/coach/dashboard');
    await ready(page);
    await expect(page.getByTestId('coach-today')).toHaveAttribute('data-state', /queue|clear|incomplete/, { timeout: 30_000 });
    await page.getByTestId('rail-clients').click();
    await expect(page.getByText('Client Aya').first()).toBeVisible({ timeout: 30_000 });
    await context.setOffline(true);
    try {
      await page.getByTestId('rail-today').click();
      await expect(page.getByTestId('offline-banner')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('today-stale')).toBeVisible();
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await shot(page, testInfo, 'm-offline-today');
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByTestId('today-stale')).toHaveCount(0, { timeout: 45_000 });

    // 4. A half-written message survives a reload.
    await page.goto(`/coach/messages/${env.accounts.clientA.id}`);
    await ready(page);
    await message(page).fill('M: survives a reload');
    await page.waitForTimeout(400);
    await page.reload();
    await ready(page);
    await expect(message(page)).toHaveValue('M: survives a reload', { timeout: 20_000 });
    await message(page).fill('');
  });

  test('keyboard (B3.9, AX-05): skip link first, focus follows navigation, Escape closes only the top layer', async ({ as, env, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachA', sized(1440));
    await page.goto('/coach/dashboard');
    await ready(page);
    await page.keyboard.press('Tab');
    const skip = page.getByTestId('skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    // Navigating moves focus to the new screen's heading.
    await page.getByTestId('rail-clients').click();
    await expect(page.getByTestId('coach-clients').getByRole('heading', { level: 1 })).toBeFocused({ timeout: 10_000 });

    // A confirm over a sheet (delete from the exercise sheet): Escape cancels only the confirm.
    const name = `Esc test ${Date.now()}`;
    await page.goto('/coach/library?tab=exercises');
    await appReady(page, 'lib-new');
    await page.getByTestId('lib-new').click();
    await page.getByTestId('ex-name').fill(name);
    await page.getByTestId('ex-save').click();
    await expect(page.getByTestId('exercise-form')).toHaveCount(0, { timeout: 20_000 });
    await page.getByTestId('lib-search').fill(name);
    await page.getByTestId('coach-desktop-library').getByTestId('data-row').filter({ hasText: name }).first().click();
    await expect(page.getByTestId('exercise-view')).toBeVisible();
    await page.getByTestId('exercise-delete').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('exercise-view')).toBeVisible(); // the sheet beneath stays
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('exercise-view')).toHaveCount(0);
  });
});
