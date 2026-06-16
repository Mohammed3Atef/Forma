import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, findUserByEmail, attempt, isPermissionDenied, setDoc, doc } from './fixtures/firestore';
import { credsFor } from './fixtures/env';

/**
 * ADMIN — manages people and reads oversight data, but does NOT author client
 * plans by default and cannot touch super_admin accounts or self-promote.
 */

test.describe('Admin', () => {
  test.beforeEach(async ({ login }) => {
    await login('admin');
  });

  test('lands on /admin', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId(TID.adminOverview)).toBeVisible();
  });

  test('can view accounts', async ({ page }) => {
    await page.goto('/admin/accounts');
    await expect(page.getByTestId(TID.adminAccounts)).toBeVisible();
    await expect(page.getByTestId(TID.accountRow).first()).toBeVisible({ timeout: 20_000 });
  });

  test('can filter to coaches and clients', async ({ page }) => {
    await page.goto('/admin/accounts');
    // Role filter chips exist for each role.
    await expect(page.getByRole('button', { name: /coach/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /client/i }).first()).toBeVisible();
  });

  test('can open a client detail read-only', async ({ page }) => {
    const client = credsFor('client');
    const s = await signInAs('admin');
    let clientId = '';
    try {
      clientId = (await findUserByEmail(s.db, client.email))?.id ?? '';
    } finally {
      await s.close();
    }
    test.skip(!clientId, 'E2E client account not found');
    await page.goto(`/admin/clients/${clientId}`);
    await expect(page.locator('body')).toContainText(/[A-Za-z]/);
  });

  test('can view analytics if allowed', async ({ page }) => {
    await page.goto('/admin/analytics');
    await expect(page.getByTestId(TID.adminAnalytics)).toBeVisible();
  });

  test('can view audit logs if allowed', async ({ page }) => {
    await page.goto('/admin/governance');
    await expect(page.getByText(/audit/i).first()).toBeVisible();
  });

  test('create form does NOT offer admin/super_admin roles (no self-promotion)', async ({ page }) => {
    await page.goto('/admin/accounts');
    await page.getByTestId(TID.adminCreateAccount).click();
    await expect(page.getByTestId(TID.createRole('client'))).toBeVisible();
    await expect(page.getByTestId(TID.createRole('coach'))).toBeVisible();
    await expect(page.getByTestId(TID.createRole('admin'))).toHaveCount(0);
    await expect(page.getByTestId(TID.createRole('super_admin'))).toHaveCount(0);
  });

  test('cannot edit a super_admin account (UI blocks it)', async ({ page }) => {
    await page.goto('/admin/accounts');
    const superRow = page.locator('[data-testid="account-row"][data-account-role="super_admin"]').first();
    await superRow.waitFor({ timeout: 20_000 });
    await superRow.click();
    await expect(page.getByTestId(TID.cannotEditAccount)).toBeVisible();
  });

  test('rules BLOCK: admin cannot promote a user to super_admin', async () => {
    const client = credsFor('client');
    const s = await signInAs('admin');
    try {
      const target = await findUserByEmail(s.db, client.email);
      test.skip(!target, 'E2E client not found');
      const r = await attempt(() =>
        setDoc(doc(s.db, 'users', target!.id), { role: 'super_admin', updatedAt: Date.now() }, { merge: true }),
      );
      expect(isPermissionDenied(r), `admin promoting to super_admin should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('rules BLOCK: admin cannot write a client workout plan (no clients.writeAll)', async () => {
    const client = credsFor('client');
    const s = await signInAs('admin');
    try {
      const target = await findUserByEmail(s.db, client.email);
      test.skip(!target, 'E2E client not found');
      const r = await attempt(() =>
        setDoc(doc(s.db, 'clientData', target!.id, 'plan', 'workout'), {
          id: 'x',
          name: 'admin should not write this',
          days: [],
          exercises: {},
          updatedAt: Date.now(),
        }),
      );
      expect(isPermissionDenied(r), `admin writing client plan should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('rules ALLOW: admin can read a client identity doc (oversight)', async () => {
    const client = credsFor('client');
    const s = await signInAs('admin');
    try {
      const r = await attempt(() => findUserByEmail(s.db, client.email));
      expect(r.ok).toBe(true);
    } finally {
      await s.close();
    }
  });
});
