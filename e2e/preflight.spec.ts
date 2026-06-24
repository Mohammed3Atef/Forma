import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { missingEnv, firebaseEnvConfig, credsFor, type RoleKey } from './fixtures/env';
import { signInAs } from './fixtures/firestore';

/**
 * PREFLIGHT — runs first. Verifies the foundations the rest of the suite
 * depends on: env present, Firebase initialises, every E2E user can log in and
 * carries the correct role, and the rules grant/deny as expected. A failure
 * here means "stop and fix the environment", not "the app has a bug".
 */

const EXPECTED_ROLE: Record<RoleKey, string> = {
  super_admin: 'super_admin',
  admin: 'admin',
  coach: 'coach',
  client: 'client',
};

test.describe('Preflight', () => {
  test('all required env vars are present', () => {
    const missing = missingEnv();
    expect(missing, `missing env vars: ${missing.join(', ')}`).toEqual([]);
  });

  test('Firebase web config is loaded', () => {
    const cfg = firebaseEnvConfig();
    expect(cfg.apiKey, 'VITE_FIREBASE_API_KEY').not.toEqual('');
    expect(cfg.projectId, 'VITE_FIREBASE_PROJECT_ID').not.toEqual('');
    expect(cfg.appId, 'VITE_FIREBASE_APP_ID').not.toEqual('');
  });

  test('app boots and initialises Firebase (shows the login screen)', async ({ page }) => {
    await page.goto('/login');
    // If Firebase failed to init, the app falls back to local-only mode and the
    // login form never appears. Requiring it proves init succeeded.
    await expect(page.getByTestId(TID.loginForm)).toBeVisible({ timeout: 30_000 });
  });

  for (const role of ['super_admin', 'admin', 'coach', 'client'] as RoleKey[]) {
    test(`${role}: can authenticate against Firebase directly`, async () => {
      const { email, password } = credsFor(role);
      expect(email, `${role} email`).not.toEqual('');
      expect(password, `${role} password`).not.toEqual('');
      const s = await signInAs(role);
      try {
        expect(s.uid).toBeTruthy();
      } finally {
        await s.close();
      }
    });

    test(`${role}: identity doc has the correct role + active status`, async () => {
      const { email } = credsFor(role);
      const s = await signInAs(role);
      try {
        const { readDoc } = await import('./fixtures/firestore');
        const rec = await readDoc<{ email?: string; role: string; accountStatus: string }>(s.db, ['users', s.uid]);
        const who = `${role} <${email}> uid=${s.uid} docEmail=${rec?.email ?? '(none)'}`;
        expect(rec, `${who}: users/${s.uid} doc must exist`).not.toBeNull();
        expect(rec!.role, `${who}: role`).toBe(EXPECTED_ROLE[role]);
        expect(rec!.accountStatus, `${who}: status (reactivate this exact account in the console if suspended)`).toBe('active');
      } finally {
        await s.close();
      }
    });
  }

  test('rules ALLOW: a user can read their own identity doc', async () => {
    const s = await signInAs('client');
    try {
      const { attempt, doc, getDoc } = await import('./fixtures/firestore');
      const r = await attempt(() => getDoc(doc(s.db, 'users', s.uid)));
      expect(r.ok, `own user read should be allowed: ${r.code ?? ''}`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('rules BLOCK: a client cannot list all users', async () => {
    const s = await signInAs('client');
    try {
      const { attempt, getDocs, collection, isPermissionDenied } = await import('./fixtures/firestore');
      const r = await attempt(() => getDocs(collection(s.db, 'users')));
      expect(isPermissionDenied(r), `client listing all users should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('rules ALLOW: an admin can list users', async () => {
    const s = await signInAs('admin');
    try {
      const { attempt, getDocs, collection } = await import('./fixtures/firestore');
      const r = await attempt(() => getDocs(collection(s.db, 'users')));
      expect(r.ok, `admin should be able to list users: ${r.code ?? ''}`).toBe(true);
    } finally {
      await s.close();
    }
  });
});
