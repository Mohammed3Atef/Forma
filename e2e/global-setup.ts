import type { FullConfig } from '@playwright/test';
import { doc, setDoc } from 'firebase/firestore';
import { assertEnv, ACCOUNT_ENV, credsFor, firebaseEnvConfig, hasFirebase, type RoleKey } from './fixtures/env';
import { readDoc, signInAs } from './fixtures/firestore';

/* eslint-disable no-console */

/**
 * Ensures the standard CLIENT account has a complete fitness profile so the
 * required profile-completion overlay never blocks the client UI suites
 * (offline, rtl). The client owns its own profile doc.
 */
async function ensureClientProfile(): Promise<void> {
  const s = await signInAs('client');
  const now = Date.now();
  try {
    await setDoc(doc(s.db, 'clientData', s.uid, 'profile', 'main'), {
      id: s.uid,
      name: 'QA Client',
      age: 30,
      weightKg: 80,
      heightCm: 178,
      goal: 'recomp',
      activityLevel: 'moderate',
      locale: 'en',
      createdAt: now,
      updatedAt: now,
    });
    // A completed assessment so the mandatory onboarding gate doesn't block the
    // client UI suites (offline, rtl).
    await setDoc(doc(s.db, 'clientData', s.uid, 'profile', 'assessment'), {
      basic: { fullName: 'QA Client', dateOfBirth: '1995-01-01', age: 30, gender: 'male', heightCm: 178, weightKg: 80 },
      goals: { primaryGoal: 'recomp', goalPriorities: [] },
      lifestyle: { occupation: 'desk', sleepHours: 8, activityLevel: 'moderate', trainingDaysPerWeek: 4 },
      training: { level: 'intermediate', location: 'commercial_gym' },
      health: { injuries: [], noInjuries: true, hasMedicalConditions: false },
      nutrition: { likes: [], dislikes: [], allergies: [], mustHaveFoods: [], budget: 'medium', mealsPerDay: 3 },
      motivation: { biggestChallenge: 'consistency', commitmentLevel: 8 },
      progressPhotos: {},
      completionPercentage: 100,
      completed: true,
      completedAt: now,
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
    });
  } finally {
    await s.close();
  }
}

/**
 * Logs, for every E2E role, the exact account each credential resolves to and
 * the identity doc it maps to — so a fixture/account mismatch (wrong email,
 * stale or suspended QA account) is obvious at a glance. The doc is read by the
 * uid returned from signing in with that role's email, so it is authoritative:
 * it is the same account the suite actually drives.
 */
async function logAccountDiagnostics(): Promise<void> {
  console.log('[forma-e2e] Account diagnostics (resolved credential → identity doc):');
  for (const role of ['super_admin', 'admin', 'coach', 'client'] as RoleKey[]) {
    const envVar = ACCOUNT_ENV[role].email;
    const email = credsFor(role).email;
    try {
      const s = await signInAs(role);
      try {
        const rec = await readDoc<{ email?: string; role?: string; accountStatus?: string }>(s.db, ['users', s.uid]);
        const flag = rec?.accountStatus !== 'active' || rec?.role !== role ? '  ⚠ MISMATCH' : '';
        console.log(
          `  ${role.padEnd(11)} ${envVar}=${email}\n` +
            `              uid=${s.uid}  docEmail=${rec?.email ?? '(none)'}  role=${rec?.role ?? '(none)'}  status=${rec?.accountStatus ?? '(none)'}${flag}`,
        );
        if (role === 'super_admin' && rec && rec.accountStatus !== 'active') {
          console.warn(
            `\n[forma-e2e] ⚠ The E2E super_admin (${email}, uid ${s.uid}) is "${rec.accountStatus}", not "active".\n` +
              `  This is the SPECIFIC account E2E_SUPER_EMAIL signs in as — other super_admins you see\n` +
              `  in the Accounts screen are unrelated. Reactivate it in the Firebase console:\n` +
              `  Firestore → users/${s.uid} → accountStatus: "active".\n` +
              `  (Rules forbid admins from modifying a super_admin, and a suspended super_admin cannot\n` +
              `  reactivate itself, so the console is the only recovery path.)\n`,
          );
        }
      } finally {
        await s.close();
      }
    } catch (e) {
      console.warn(`  ${role.padEnd(11)} ${envVar}=${email}  → sign-in/lookup FAILED: ${(e as Error).message}`);
    }
  }
}

/**
 * Runs once before the whole suite. Fails fast and clearly if the environment
 * is misconfigured, so the rest of the run is meaningful. This is the first
 * line of the "preflight" requirement: no Firebase config / missing env ⇒ stop
 * with the exact variable name.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Throws naming every missing var.
  assertEnv();

  if (!hasFirebase()) {
    throw new Error(
      '[forma-e2e] Firebase is not configured. The Forma platform suite requires a real ' +
        'Firebase project (VITE_FIREBASE_API_KEY + VITE_FIREBASE_PROJECT_ID).',
    );
  }

  const cfg = firebaseEnvConfig();
  console.log(
    `\n[forma-e2e] Environment OK.\n` +
      `  project: ${cfg.projectId}\n` +
      `  authDomain: ${cfg.authDomain}\n` +
      `  accounts: super_admin, admin, coach, client\n`,
  );

  // Diagnostics + best-effort account provisioning — never hard-fail on these.
  try {
    await logAccountDiagnostics();
  } catch (e) {
    console.warn('[forma-e2e] account diagnostics failed:', (e as Error).message);
  }
  try {
    await ensureClientProfile();
  } catch (e) {
    console.warn('[forma-e2e] could not ensure client profile:', (e as Error).message);
  }
}
