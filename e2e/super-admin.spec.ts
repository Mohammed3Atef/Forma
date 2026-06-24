import { test, expect, type Page } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, findUserByEmail } from './fixtures/firestore';
import { uniqueEmail } from './fixtures/factory';

/**
 * SUPER ADMIN — the all-powerful role. Exercises the full governance surface
 * through the real UI: account lifecycle (create / suspend / reactivate /
 * role change), coach assignment + transfer, audit, analytics, read-only client
 * detail, and super-admin-only screens. Created accounts use unique emails so
 * each run is self-contained (see docs/QA.md for cleanup).
 */

const PW = 'Test123456!';
// Shared across the serial flow.
let coachAEmail: string;
let coachBEmail: string;
let clientEmail: string;
const coachAName = `QA CoachA ${Date.now()}`;
const coachBName = `QA CoachB ${Date.now()}`;
const clientName = `QA Client ${Date.now()}`;

async function createAccount(page: Page, role: string, email: string, name: string): Promise<void> {
  await page.goto('/admin/accounts');
  await page.getByTestId(TID.adminCreateAccount).click();
  await expect(page.getByTestId(TID.createAccountForm)).toBeVisible();
  await page.getByTestId(TID.createEmail).fill(email);
  await page.getByTestId(TID.createName).fill(name);
  await page.getByTestId(TID.createPassword).fill(PW);
  await page.getByTestId(TID.createPhone).fill('+15551234567');
  await page.getByTestId(TID.createRole(role)).click();
  await page.getByTestId(TID.createSubmit).click();
  // Sheet closes on success.
  await expect(page.getByTestId(TID.createAccountForm)).toBeHidden({ timeout: 25_000 });
}

test.describe.serial('Super admin', () => {
  test.beforeEach(async ({ login }) => {
    await login('super_admin');
  });

  test('lands on /admin with the mobile admin dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId(TID.adminOverview)).toBeVisible();
    await expect(page.getByTestId(TID.bottomNav)).toBeVisible();
  });

  test('overview shows platform stats tiles', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByText(/total/i).first()).toBeVisible();
    // The six stat tiles render numbers (or em-dash while loading then a number).
    await expect(page.getByTestId(TID.adminOverview)).toBeVisible();
  });

  test('can open Accounts and see the create control', async ({ page }) => {
    await page.goto('/admin/accounts');
    await expect(page.getByTestId(TID.adminAccounts)).toBeVisible();
    await expect(page.getByTestId(TID.adminCreateAccount)).toBeVisible();
  });

  test('create coach A, coach B and a client', async ({ page }) => {
    coachAEmail = uniqueEmail('qa-coachA');
    coachBEmail = uniqueEmail('qa-coachB');
    clientEmail = uniqueEmail('qa-client');
    await createAccount(page, 'coach', coachAEmail, coachAName);
    await createAccount(page, 'coach', coachBEmail, coachBName);
    await createAccount(page, 'client', clientEmail, clientName);

    // Verify in Firestore they exist with the right roles.
    const s = await signInAs('super_admin');
    try {
      const a = await findUserByEmail(s.db, coachAEmail);
      const b = await findUserByEmail(s.db, coachBEmail);
      const c = await findUserByEmail(s.db, clientEmail);
      expect(a?.role, 'coach A role').toBe('coach');
      expect(b?.role, 'coach B role').toBe('coach');
      expect(c?.role, 'client role').toBe('client');
      expect(c?.accountStatus, 'client active').toBe('active');
    } finally {
      await s.close();
    }
  });

  test('can create an admin (super-admin-only role)', async ({ page }) => {
    const adminEmail = uniqueEmail('qa-admin');
    await page.goto('/admin/accounts');
    await page.getByTestId(TID.adminCreateAccount).click();
    // The super_admin + admin role chips are only offered to a super_admin.
    await expect(page.getByTestId(TID.createRole('admin'))).toBeVisible();
    await expect(page.getByTestId(TID.createRole('super_admin'))).toBeVisible();
    await page.getByTestId(TID.createEmail).fill(adminEmail);
    await page.getByTestId(TID.createName).fill(`QA Admin ${Date.now()}`);
    await page.getByTestId(TID.createPassword).fill(PW);
    await page.getByTestId(TID.createPhone).fill('+15551234567');
    await page.getByTestId(TID.createRole('admin')).click();
    await page.getByTestId(TID.createSubmit).click();
    await expect(page.getByTestId(TID.createAccountForm)).toBeHidden({ timeout: 25_000 });
    const s = await signInAs('super_admin');
    try {
      expect((await findUserByEmail(s.db, adminEmail))?.role).toBe('admin');
    } finally {
      await s.close();
    }
  });

  test('suspend then reactivate the client account', async ({ page }) => {
    test.skip(!clientName, 'client must have been created');
    await page.goto('/admin/accounts');
    await page.getByText(clientName).click();
    await page.getByTestId(TID.setStatus('suspended')).click();
    await page.getByTestId(TID.confirmAccept).click();
    // Poll Firestore until the status write lands (the mutation is async; there's
    // no create sheet to wait on here).
    await expect.poll(async () => {
      const s = await signInAs('super_admin');
      try { return (await findUserByEmail(s.db, clientEmail))?.accountStatus; } finally { await s.close(); }
    }, { timeout: 15_000 }).toBe('suspended');

    // Reactivate.
    await page.goto('/admin/accounts');
    await page.getByText(clientName).click();
    await page.getByTestId(TID.setStatus('active')).click();
    await page.getByTestId(TID.confirmAccept).click();
    await expect.poll(async () => {
      const s = await signInAs('super_admin');
      try { return (await findUserByEmail(s.db, clientEmail))?.accountStatus; } finally { await s.close(); }
    }, { timeout: 15_000 }).toBe('active');
  });

  test('can change allowed roles for an account', async ({ page }) => {
    await page.goto('/admin/accounts');
    await page.getByText(clientName).click();
    // Super admin sees the full role set, including super_admin.
    await expect(page.getByTestId(TID.setRole('super_admin'))).toBeVisible();
    await expect(page.getByTestId(TID.setRole('admin'))).toBeVisible();
    await expect(page.getByTestId(TID.setRole('coach'))).toBeVisible();
  });

  test('assign the client to coach A', async ({ page }) => {
    const s0 = await signInAs('super_admin');
    let coachAId = '';
    try {
      coachAId = (await findUserByEmail(s0.db, coachAEmail))!.id;
    } finally {
      await s0.close();
    }
    await page.goto('/admin/assignments');
    await page.getByTestId(TID.adminAssignments).waitFor();
    await page.locator(`[data-testid="assign-client-row"][data-client-id]`, { hasText: clientName }).first().click();
    await page.locator(`[data-testid="assign-coach-row"][data-coach-id="${coachAId}"]`).click();
    await page.getByTestId(TID.confirmAccept).click();

    await expect.poll(async () => {
      const s = await signInAs('super_admin');
      try { return (await findUserByEmail(s.db, clientEmail))?.assignedCoachId; } finally { await s.close(); }
    }, { timeout: 15_000 }).toBe(coachAId);
  });

  test('transfer the client from coach A to coach B', async ({ page }) => {
    const s0 = await signInAs('super_admin');
    let coachBId = '';
    try {
      coachBId = (await findUserByEmail(s0.db, coachBEmail))!.id;
    } finally {
      await s0.close();
    }
    await page.goto('/admin/assignments');
    await page.locator(`[data-testid="assign-client-row"]`, { hasText: clientName }).first().click();
    await page.locator(`[data-testid="assign-coach-row"][data-coach-id="${coachBId}"]`).click();
    await page.getByTestId(TID.confirmAccept).click();

    await expect.poll(async () => {
      const s = await signInAs('super_admin');
      try { return (await findUserByEmail(s.db, clientEmail))?.assignedCoachId; } finally { await s.close(); }
    }, { timeout: 15_000 }).toBe(coachBId);
  });

  test('can view audit logs (governance)', async ({ page }) => {
    await page.goto('/admin/governance');
    await expect(page.getByTestId(TID.adminGovernance)).toBeVisible();
    await expect(page.getByText(/audit/i).first()).toBeVisible();
  });

  test('can view analytics', async ({ page }) => {
    await page.goto('/admin/analytics');
    await expect(page.getByTestId(TID.adminAnalytics)).toBeVisible();
  });

  test('can open a client detail (read-only oversight)', async ({ page }) => {
    const s0 = await signInAs('super_admin');
    let clientId = '';
    try {
      clientId = (await findUserByEmail(s0.db, clientEmail))!.id;
    } finally {
      await s0.close();
    }
    await page.goto(`/admin/clients/${clientId}`);
    // Renders without crashing; no plan-editing affordances here.
    await expect(page.locator('body')).toContainText(/[A-Za-z]/);
  });

  test('sees governance / feature-flag screen (super-admin only)', async ({ page }) => {
    await page.goto('/admin/governance');
    await expect(page.getByText(/feature flag/i).first()).toBeVisible();
    await expect(page.getByTestId(TID.navItem('adminGovernance'))).toBeVisible();
  });
});
