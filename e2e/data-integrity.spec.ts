import { test, expect } from './fixtures/test';
import {
  signInAs,
  signInWith,
  readDoc,
  docExists,
  findCoachClientRel,
  findUserByEmail,
  attempt,
  setDoc,
  getDocs,
  collection,
  doc,
} from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';
import { assignAll } from './fixtures/plans';

/**
 * DATA INTEGRITY — after a full coach→client flow, inspect Firestore directly
 * and confirm the schema is correct: identity doc, relationship, the three
 * coach-authored plan docs (structured, not note-only), coach targets, and that
 * client logs land under clientData/{clientId}. Also confirms the coach-driven
 * flow does NOT rely on the legacy users/{uid}/workoutPlans path.
 */

const PW = 'Integrity123456!';
let client: NewClient;
let coachUid = '';

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  coachUid = coach.uid;
  try {
    client = await createClientViaApi(coach, { email: uniqueEmail('qa-integrity'), password: PW, displayName: `QA Integrity ${Date.now()}` });
    await assignAll(coach, client.uid);
  } finally {
    await coach.close();
  }
});

test.describe('Data integrity', () => {
  test('users/{uid} has correct role + accountStatus', async () => {
    const s = await signInAs('coach');
    try {
      const rec = await findUserByEmail(s.db, client.email);
      expect(rec).not.toBeNull();
      expect(rec!.role).toBe('client');
      expect(rec!.accountStatus).toBe('active');
      expect(rec!.assignedCoachId).toBe(coachUid);
    } finally {
      await s.close();
    }
  });

  test('coachClients relationship exists and is active', async () => {
    const s = await signInAs('coach');
    try {
      const rel = await findCoachClientRel(s.db, coachUid, client.uid);
      expect(rel, 'coachClients/{coach__client}').not.toBeNull();
      expect((rel as { status: string }).status).toBe('active');
    } finally {
      await s.close();
    }
  });

  test('clientData/{id}/plan/{workout,nutrition,cardio} all exist', async () => {
    const s = await signInAs('coach');
    try {
      expect(await docExists(s.db, ['clientData', client.uid, 'plan', 'workout'])).toBe(true);
      expect(await docExists(s.db, ['clientData', client.uid, 'plan', 'nutrition'])).toBe(true);
      expect(await docExists(s.db, ['clientData', client.uid, 'plan', 'cardio'])).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('coach-created data is STRUCTURED (not stored as notes only)', async () => {
    const s = await signInAs('coach');
    try {
      const wp = await readDoc<{ days: unknown[]; exercises: Record<string, unknown> }>(s.db, ['clientData', client.uid, 'plan', 'workout']);
      expect(wp!.days.length, 'workout plan has structured days').toBeGreaterThan(0);
      expect(Object.keys(wp!.exercises).length, 'workout plan has structured exercises').toBeGreaterThan(0);
      const mp = await readDoc<{ meals: unknown[]; targets: Record<string, number> }>(s.db, ['clientData', client.uid, 'plan', 'nutrition']);
      expect(mp!.meals.length, 'nutrition plan has structured meals').toBeGreaterThan(0);
      expect(mp!.targets.calories, 'nutrition targets present').toBeGreaterThan(0);
      const cp = await readDoc<{ sessions: unknown[] }>(s.db, ['clientData', client.uid, 'plan', 'cardio']);
      expect(cp!.sessions.length, 'cardio plan has structured sessions').toBeGreaterThan(0);
    } finally {
      await s.close();
    }
  });

  test('coach targets stored at clientData/{id}/coachTargets/current', async () => {
    const s = await signInAs('coach');
    try {
      expect(await docExists(s.db, ['clientData', client.uid, 'coachTargets', 'current'])).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('client logs are written under clientData/{clientId}', async () => {
    // Sign in AS the client and write a cardio log (owner write allowed).
    const cs = await signInWith(client.email, client.password);
    try {
      const day = new Date().toISOString().slice(0, 10);
      const r = await attempt(() =>
        setDoc(doc(cs.db, 'clientData', cs.uid, 'cardioLogs', day), { id: day, date: day, steps: 8888, minutes: 25, updatedAt: Date.now(), dirty: false }),
      );
      expect(r.ok, `client writing own log should be allowed (got ${r.code ?? ''})`).toBe(true);
      const snap = await getDocs(collection(cs.db, 'clientData', cs.uid, 'cardioLogs'));
      expect(snap.size, 'cardio log persisted under clientData/{clientId}').toBeGreaterThan(0);
    } finally {
      await cs.close();
    }
  });

  test('coach-driven flow does NOT use legacy users/{uid}/workoutPlans', async () => {
    // The plan lives under clientData, not as a subcollection of the users doc.
    const cs = await signInWith(client.email, client.password);
    try {
      const legacy = await getDocs(collection(cs.db, 'users', cs.uid, 'workoutPlans')).catch(() => null);
      const legacyCount = legacy?.size ?? 0;
      expect(legacyCount, 'no coach plan should live under users/{uid}/workoutPlans').toBe(0);
      // And the real plan is under clientData.
      expect(await docExists(cs.db, ['clientData', cs.uid, 'plan', 'workout'])).toBe(true);
    } finally {
      await cs.close();
    }
  });
});
