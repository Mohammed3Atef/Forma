import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import type { AssignedPlan, CardioPlan, CoachNote, CoachTargets, PlanKind } from '@/types';

/**
 * Owner-side reads of coach-authored content for the signed-in client. Kept
 * separate from coachApi/accountsApi so the client bundle never pulls in the
 * admin/coach write stack. All reads are of the client's OWN clientData, which
 * the security rules permit.
 */

const CLIENT = 'clientData';

export async function fetchMyCoachNotes(clientId: string): Promise<CoachNote[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, CLIENT, clientId, 'coachNotes'), orderBy('createdAt', 'desc'), limit(50)));
  return snap.docs.map((d) => d.data() as CoachNote);
}

export async function fetchMyPlans(clientId: string, kind: PlanKind): Promise<AssignedPlan[]> {
  const { db } = ensureFirebase();
  const name = kind === 'workout' ? 'workoutPlans' : 'nutritionPlans';
  const snap = await getDocs(query(collection(db, CLIENT, clientId, name), orderBy('assignedAt', 'desc')));
  return snap.docs.map((d) => d.data() as AssignedPlan);
}

export async function fetchMyCoachTargets(clientId: string): Promise<CoachTargets | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'coachTargets', 'current'));
  return snap.exists() ? (snap.data() as CoachTargets) : null;
}

export async function fetchMyCardioPlan(clientId: string): Promise<CardioPlan | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'plan', 'cardio'));
  return snap.exists() ? (snap.data() as CardioPlan) : null;
}
