import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, writeBatch } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { notify } from './notificationsApi';
import type { ClientAssessment, AssignedPlan, CardioPlan, CoachClientRelationship, CoachNote, CoachTargets, FreezeRequest, PlanKind, UserProfile, UserRecord } from '@/types';

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

export async function fetchMyProfile(clientId: string): Promise<UserProfile | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'profile', 'main'));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function fetchMyAssessment(clientId: string): Promise<ClientAssessment | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'profile', 'assessment'));
  return snap.exists() ? (snap.data() as ClientAssessment) : null;
}

/**
 * Persist an in-progress assessment draft to Firestore (status `in_progress`)
 * so the coach can see the client has started, and so progress survives across
 * devices. Does NOT touch profile/main (that's derived only on submit). The
 * rules allow this only while the assessment is not yet `reviewed`.
 */
export async function saveAssessmentProgress(clientId: string, assessment: ClientAssessment): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(
    doc(db, CLIENT, clientId, 'profile', 'assessment'),
    { ...assessment, status: 'in_progress', completed: false, updatedAt: Date.now() },
    { merge: true },
  );
}

/**
 * Atomically persists the submitted onboarding assessment AND the derived
 * fitness profile (profile/main) in a single Firestore batch — both writes
 * succeed or neither does, so the client is never marked "assessed" with a
 * stale/blank profile. Both live under the client-owned `profile/*` subtree.
 */
export async function submitAssessment(
  clientId: string,
  assessment: ClientAssessment,
  profile: UserProfile,
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const ref = doc(db, CLIENT, clientId, 'profile', 'assessment');
  // Living assessment: editing a reviewed assessment flips it to
  // 'updated_after_review' and PRESERVES the coach's review feedback/date.
  const prevSnap = await getDoc(ref);
  const prev = prevSnap.exists() ? (prevSnap.data() as ClientAssessment) : null;
  const wasReviewed = prev?.status === 'reviewed' || prev?.status === 'updated_after_review';
  const batch = writeBatch(db);
  batch.set(ref, {
    ...assessment,
    status: wasReviewed ? 'updated_after_review' : 'submitted',
    completed: true,
    completedAt: now,
    submittedAt: prev?.submittedAt ?? now,
    updatedAt: now,
    ...(prev?.coachNotes != null ? { coachNotes: prev.coachNotes } : {}),
    ...(prev?.reviewedAt != null ? { reviewedAt: prev.reviewedAt } : {}),
    ...(prev?.reviewedBy != null ? { reviewedBy: prev.reviewedBy } : {}),
  });
  batch.set(doc(db, CLIENT, clientId, 'profile', 'main'), { ...profile, id: clientId, updatedAt: now });
  // Reflect the real name the client entered onto their account so the coach
  // sees it (instead of an email-prefix fallback from sign-up). Also keeps the
  // lowercased search index in sync. Control fields are untouched (rules allow).
  const fullName = assessment.basic.fullName.trim();
  if (fullName) {
    batch.set(doc(db, 'users', clientId), { displayName: fullName, displayNameLower: fullName.toLowerCase(), updatedAt: now }, { merge: true });
  }
  await batch.commit();
  await notify({ clientId, forRole: 'coach', type: 'assessment_submitted', route: `/coach/client/${clientId}/assessment`, createdBy: clientId });
}

// ---- subscription (read-only) + freeze requests ----------------------------

/** Read the assigned coach's public record (name/phone/photo) for the "Your Coach" card. */
export async function fetchMyCoach(coachId: string): Promise<UserRecord | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, 'users', coachId));
  return snap.exists() ? (snap.data() as UserRecord) : null;
}

/** Read the client's coach relationship (for the subscription banner). */
export async function fetchMyRelationship(coachId: string, clientId: string): Promise<CoachClientRelationship | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, 'coachClients', `${coachId}__${clientId}`));
  return snap.exists() ? (snap.data() as CoachClientRelationship) : null;
}

export async function fetchMyFreezeRequest(clientId: string): Promise<FreezeRequest | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'subscriptionRequest', 'current'));
  return snap.exists() ? (snap.data() as FreezeRequest) : null;
}

/** Client submits (or re-submits) a request to freeze their subscription. */
export async function submitFreezeRequest(
  clientId: string,
  data: { from?: number | null; until?: number | null; reason: string },
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await setDoc(doc(db, CLIENT, clientId, 'subscriptionRequest', 'current'), {
    id: 'current',
    clientId,
    from: data.from ?? null,
    until: data.until ?? null,
    reason: data.reason.trim(),
    status: 'pending',
    requestedAt: now,
    decidedAt: null,
    decidedBy: null,
    coachNote: '',
    updatedAt: now,
  });
  await notify({ clientId, forRole: 'coach', type: 'freeze_requested', body: data.reason.trim().slice(0, 140), route: `/coach/client/${clientId}`, createdBy: clientId });
}

/** Client withdraws a pending freeze request. */
export async function cancelFreezeRequest(clientId: string): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, CLIENT, clientId, 'subscriptionRequest', 'current'), { status: 'cancelled', updatedAt: Date.now() }, { merge: true });
}
