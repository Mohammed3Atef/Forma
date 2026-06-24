import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import {
  signInAs,
  unauthedDb,
  attempt,
  isPermissionDenied,
  findUserByEmail,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
} from './fixtures/firestore';
import { credsFor } from './fixtures/env';
import { createClientViaApi, uniqueEmail } from './fixtures/factory';

/**
 * SECURITY & PERMISSIONS — the authoritative boundary is firestore.rules, so
 * most of these exercise the rules directly via the SDK as each role, plus a few
 * auth-state UI checks (unauthenticated / suspended / pending blocked).
 */

const ARBITRARY_OTHER = 'some-other-client-uid-not-mine';

test.describe('Security — Firestore rules', () => {
  test('client cannot read another client clientData', async () => {
    const s = await signInAs('client');
    try {
      const r = await attempt(() => getDoc(doc(s.db, 'clientData', ARBITRARY_OTHER, 'plan', 'workout')));
      expect(isPermissionDenied(r), `got ${r.code ?? 'ok'}`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('client cannot edit a coach-owned workout plan (even their own)', async () => {
    const s = await signInAs('client');
    try {
      const r = await attempt(() =>
        setDoc(doc(s.db, 'clientData', s.uid, 'plan', 'workout'), { id: 'x', name: 'hacked', days: [], exercises: {}, updatedAt: Date.now() }),
      );
      expect(isPermissionDenied(r), `client editing own plan should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('client cannot edit a coach-owned nutrition plan', async () => {
    const s = await signInAs('client');
    try {
      const r = await attempt(() =>
        setDoc(doc(s.db, 'clientData', s.uid, 'plan', 'nutrition'), { id: 'x', name: 'hacked', meals: [], targets: { calories: 0, protein: 0, carbs: 0, fats: 0 }, supplements: [], waterTargetMl: 0, beverageNotes: [], generalNotes: [], updatedAt: Date.now() }),
      );
      expect(isPermissionDenied(r), `got ${r.code ?? 'ok'}`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('client cannot edit a coach-owned cardio plan', async () => {
    const s = await signInAs('client');
    try {
      const r = await attempt(() =>
        setDoc(doc(s.db, 'clientData', s.uid, 'plan', 'cardio'), { id: 'x', name: 'hacked', sessions: [], updatedAt: Date.now() }),
      );
      expect(isPermissionDenied(r), `got ${r.code ?? 'ok'}`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('coach cannot access an unassigned client', async () => {
    const s = await signInAs('coach');
    try {
      const r = await attempt(() => getDoc(doc(s.db, 'clientData', ARBITRARY_OTHER, 'plan', 'workout')));
      expect(isPermissionDenied(r), `got ${r.code ?? 'ok'}`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('coach cannot change roles', async () => {
    const s = await signInAs('coach');
    try {
      const r = await attempt(() => setDoc(doc(s.db, 'users', s.uid), { role: 'admin', updatedAt: Date.now() }, { merge: true }));
      expect(isPermissionDenied(r), `got ${r.code ?? 'ok'}`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('coach cannot read admin audit logs', async () => {
    const s = await signInAs('coach');
    try {
      const r = await attempt(() => getDocs(collection(s.db, 'adminAuditLogs')));
      expect(isPermissionDenied(r), `got ${r.code ?? 'ok'}`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('admin cannot edit client plans (no clients.writeAll)', async () => {
    const s = await signInAs('admin');
    try {
      const r = await attempt(() =>
        setDoc(doc(s.db, 'clientData', ARBITRARY_OTHER, 'plan', 'workout'), { id: 'x', name: 'admin-hack', days: [], exercises: {}, updatedAt: Date.now() }),
      );
      expect(isPermissionDenied(r), `got ${r.code ?? 'ok'}`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('admin cannot modify a super_admin account', async () => {
    const superEmail = credsFor('super_admin').email;
    const s = await signInAs('admin');
    try {
      const superRec = await findUserByEmail(s.db, superEmail);
      test.skip(!superRec, 'super_admin account not found');
      const r = await attempt(() => updateDoc(doc(s.db, 'users', superRec!.id), { accountStatus: 'suspended', updatedAt: Date.now() }));
      expect(isPermissionDenied(r), `admin modifying super_admin should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('unauthenticated direct Firestore calls are denied', async () => {
    const anon = unauthedDb();
    try {
      const r = await attempt(() => getDocs(collection(anon.db, 'users')));
      expect(isPermissionDenied(r) || !r.ok, `unauthenticated read should fail (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await anon.close();
    }
  });
});

test.describe('Security — auth states', () => {
  test('unauthenticated user cannot access protected routes (sees login)', async ({ page }) => {
    for (const route of ['/admin', '/coach', '/workout', '/admin/accounts']) {
      await page.goto(route);
      await expect(page.getByTestId(TID.loginForm)).toBeVisible({ timeout: 20_000 });
    }
  });

  test('suspended user is blocked', async ({ loginWith, page }) => {
    // Create a client, then suspend it via a super_admin context.
    const coach = await signInAs('coach');
    let email = '';
    let uid = '';
    try {
      const c = await createClientViaApi(coach, { email: uniqueEmail('qa-susp'), password: 'Susp123456!', displayName: `QA Susp ${Date.now()}` });
      email = c.email;
      uid = c.uid;
    } finally {
      await coach.close();
    }
    const sa = await signInAs('super_admin');
    try {
      await updateDoc(doc(sa.db, 'users', uid), { accountStatus: 'suspended', updatedAt: Date.now() });
    } finally {
      await sa.close();
    }
    await loginWith(email, 'Susp123456!');
    await expect(page.getByTestId(TID.accountSuspended)).toBeVisible({ timeout: 25_000 });
  });

  test('pending self-signup user is blocked', async ({ page }) => {
    // Self sign-up creates a pending account (SELF_SIGNUP_STATUS).
    const email = uniqueEmail('qa-pending');
    await page.goto('/login');
    await page.getByTestId(TID.loginForm).waitFor();
    await page.getByTestId(TID.loginToggleMode).click(); // switch to sign-up
    await page.getByTestId(TID.loginEmail).fill(email);
    await page.getByTestId(TID.loginPassword).fill('Pending123456!');
    // Sign-up now requires a confirmed password + phone (auth hardening).
    await page.getByTestId(TID.loginConfirm).fill('Pending123456!');
    await page.getByTestId(TID.loginPhone).fill('+15551234567');
    await page.getByTestId(TID.loginSubmit).click();
    await expect(page.getByTestId(TID.accountPending)).toBeVisible({ timeout: 25_000 });
  });
});
