import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs } from './fixtures/firestore';

/**
 * COACH PLAN SELF-SERVICE — the coach sees their Forma plan and requests an
 * upgrade; the super-admin is ALERTED on the overview, sees full plan detail
 * (incl. an editable end date), and approves — which applies + resolves.
 */
let coachUid = '';
test.beforeAll(async () => {
  const s = await signInAs('coach');
  try {
    coachUid = s.uid;
  } finally {
    await s.close();
  }
});

test.describe.serial('Coach plan', () => {
  test('coach sees their plan and submits an upgrade request', async ({ page, login }) => {
    await login('coach');
    await page.goto('/coach/plan');
    await expect(page.getByTestId(TID.coachPlanPage)).toBeVisible({ timeout: 25_000 });
    // Clean slate: withdraw any leftover pending request.
    if (await page.getByTestId(TID.coachPlanCancel).isVisible().catch(() => false)) {
      await page.getByTestId(TID.coachPlanCancel).click();
      await expect(page.getByTestId(TID.coachPlanRequest)).toBeVisible({ timeout: 15_000 });
    }
    await page.getByTestId(TID.coachPlanRequest).click();
    await page.getByTestId(TID.coachPlanReason).fill('Please review my plan — my roster is growing.');
    await page.getByTestId(TID.coachPlanRequestSubmit).click();
    await expect(page.getByTestId(TID.coachPlanRequestCard)).toBeVisible({ timeout: 15_000 });
  });

  test('super-admin is alerted, sees full detail, and approves', async ({ page, login }) => {
    test.skip(!coachUid, 'coach uid not resolved');
    await login('super_admin');
    // Notification: the pending request surfaces on the admin overview AND lights
    // up the notification bell (the universal notification affordance).
    await page.goto('/admin');
    await expect(page.getByTestId('admin-pending-requests-alert')).toBeVisible({ timeout: 25_000 });
    // The mobile header bell carries the pending-request count (the desktop bar
    // also renders one, hidden at this breakpoint — scope to the visible one).
    await expect(page.getByTestId('brand-bar').getByTestId('notifications-badge')).toBeVisible({ timeout: 25_000 });

    await page.goto(`/admin/coaches/${coachUid}`);
    await expect(page.getByTestId('admin-coach-detail')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId(TID.coachEndDateInput)).toBeVisible(); // full plan controls
    await expect(page.getByTestId(TID.coachPlanApprove)).toBeVisible();
    await page.getByTestId(TID.coachPlanApprove).click();
    await expect(page.getByTestId('coach-plan-request-card')).toBeHidden({ timeout: 15_000 });
  });

  test('coach is notified that their request was reviewed', async ({ page, login }) => {
    await login('coach');
    // The decision lands in the coach's own notification feed (bell → list).
    await page.goto('/coach/notifications');
    await expect(page.getByTestId('notification-item').first()).toBeVisible({ timeout: 25_000 });
  });
});
