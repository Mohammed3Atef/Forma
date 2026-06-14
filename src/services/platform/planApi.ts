import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import type { CardioPlan, MealPlan, WorkoutPlan } from '@/types';

/**
 * Coach-authored rich plans, stored as singleton docs under the client:
 *   clientData/{clientId}/plan/workout    → WorkoutPlan
 *   clientData/{clientId}/plan/nutrition  → MealPlan
 *
 * Coaches (and admins with clients.writeAll) write these; the client reads its
 * own and renders them through the existing tracker UI. There is no demo data —
 * a client with no assigned plan shows the "waiting for your coach" state.
 */

const CLIENT = 'clientData';

export async function getClientWorkoutPlan(clientId: string): Promise<WorkoutPlan | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'plan', 'workout'));
  return snap.exists() ? (snap.data() as WorkoutPlan) : null;
}

export async function saveClientWorkoutPlan(clientId: string, plan: WorkoutPlan): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, CLIENT, clientId, 'plan', 'workout'), { ...plan, updatedAt: Date.now() });
}

export async function getClientMealPlan(clientId: string): Promise<MealPlan | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'plan', 'nutrition'));
  return snap.exists() ? (snap.data() as MealPlan) : null;
}

export async function saveClientMealPlan(clientId: string, plan: MealPlan): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, CLIENT, clientId, 'plan', 'nutrition'), { ...plan, updatedAt: Date.now() });
}

export async function getClientCardioPlan(clientId: string): Promise<CardioPlan | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'plan', 'cardio'));
  return snap.exists() ? (snap.data() as CardioPlan) : null;
}

export async function saveClientCardioPlan(clientId: string, plan: CardioPlan): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, CLIENT, clientId, 'plan', 'cardio'), { ...plan, updatedAt: Date.now() });
}
