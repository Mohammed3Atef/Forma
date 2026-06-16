import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { firebaseEnvConfig } from './env';
import type { FbSession } from './firestore';

/**
 * Creates a coach-owned client account directly via the Firebase SDK, mirroring
 * the app's coach-driven onboarding (createUserSecondary + linkCoachClient) so
 * suites that need a *known, freshly-created* client (empty-state, assigned-plan,
 * data-integrity) get deterministic credentials without scraping them out of the
 * UI. The coach flow is separately exercised through the UI in coach.spec.ts.
 *
 * Requires a signed-in COACH session (its authenticated db context is what the
 * security rules vet when writing the identity + relationship docs).
 */
export interface NewClient {
  uid: string;
  email: string;
  password: string;
  displayName: string;
}

export async function createClientViaApi(
  coach: FbSession,
  opts: { email: string; password: string; displayName: string; seedAssessment?: boolean },
): Promise<NewClient> {
  // 1) Mint the auth user on a throwaway secondary app (does not disturb the
  //    coach's session).
  const secondary = initializeApp(firebaseEnvConfig(), `factory-${Date.now()}-${Math.random()}`);
  let uid: string;
  try {
    const secAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secAuth, opts.email, opts.password);
    uid = cred.user.uid;
    await signOut(secAuth).catch(() => undefined);
  } finally {
    await deleteApp(secondary).catch(() => undefined);
  }

  // 2) Write the identity doc from the COACH context (rules require this).
  const now = Date.now();
  await setDoc(doc(coach.db, 'users', uid), {
    id: uid,
    email: opts.email,
    displayName: opts.displayName,
    role: 'client',
    accountStatus: 'active',
    permissions: [],
    featureFlags: {},
    createdBy: coach.uid,
    assignedCoachId: coach.uid,
    createdAt: now,
    updatedAt: now,
  });

  // 3) Link the coach⇄client relationship (deterministic id).
  await setDoc(doc(coach.db, 'coachClients', `${coach.uid}__${uid}`), {
    id: `${coach.uid}__${uid}`,
    coachId: coach.uid,
    clientId: uid,
    status: 'active',
    createdBy: coach.uid,
    createdAt: now,
    updatedAt: now,
  });

  // 4) Seed a COMPLETE fitness profile (as the coach would at creation) so the
  //    client isn't held behind the profile-completion overlay. The coach is
  //    assigned (step 3), so the rules permit writing the client's profile.
  await setDoc(doc(coach.db, 'clientData', uid, 'profile', 'main'), {
    id: uid,
    name: opts.displayName,
    age: 30,
    weightKg: 80,
    heightCm: 178,
    goal: 'recomp',
    activityLevel: 'moderate',
    locale: 'en',
    createdAt: now,
    updatedAt: now,
  });

  // 5) Seed a SUBMITTED onboarding assessment so the mandatory assessment gate
  //    doesn't block the client suites (a brand-new client would otherwise be
  //    redirected into the wizard). Pass `seedAssessment: false` for the
  //    assessment spec, which walks the wizard on an un-seeded client.
  if (opts.seedAssessment !== false) {
    await setDoc(doc(coach.db, 'clientData', uid, 'profile', 'assessment'), {
      basic: { fullName: opts.displayName, dateOfBirth: '1995-01-01', age: 30, gender: 'male', heightCm: 178, weightKg: 80 },
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
  }

  return { uid, email: opts.email, password: opts.password, displayName: opts.displayName };
}

/** Deterministic-ish unique email for a throwaway test client. */
export function uniqueEmail(prefix = 'qa-client'): string {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return `${prefix}+${stamp}@forma-e2e.test`;
}
