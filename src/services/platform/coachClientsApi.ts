import {
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { writeAudit } from './auditApi';
import type { CoachClientRelationship } from '@/types';

const REL = 'coachClients';
const USERS = 'users';

/** Deterministic relationship id so rules can `exists()` it without a query. */
export function relId(coachId: string, clientId: string): string {
  return `${coachId}__${clientId}`;
}

export async function listRelationshipsForCoach(coachId: string): Promise<CoachClientRelationship[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, REL), where('coachId', '==', coachId), where('status', '==', 'active')));
  return snap.docs.map((d) => d.data() as CoachClientRelationship);
}

/**
 * Writes ONLY the relationship doc (no users/{clientId} update) — used when a
 * coach creates their own client: the client's `assignedCoachId` is already set
 * at account creation, and a coach isn't allowed to update other user docs.
 */
export async function linkCoachClient(coachId: string, clientId: string, createdBy: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const id = relId(coachId, clientId);
  const rel: CoachClientRelationship = { id, coachId, clientId, status: 'active', createdBy, createdAt: now, updatedAt: now };
  await setDoc(doc(db, REL, id), rel);
}

/** Assigns a client to a coach (idempotent on the deterministic id). */
export async function assignClientToCoach(coachId: string, clientId: string, createdBy: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const id = relId(coachId, clientId);
  const rel: CoachClientRelationship = {
    id,
    coachId,
    clientId,
    status: 'active',
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, REL, id), rel);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: coachId, updatedAt: now });
  await writeAudit({ action: 'coach.assign', targetUserId: clientId, metadata: { coachId } });
}

/** Moves a client from one coach to another (ends the old link, opens a new one). */
export async function transferClient(
  clientId: string,
  fromCoachId: string | undefined,
  toCoachId: string,
  createdBy: string,
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  if (fromCoachId && fromCoachId !== toCoachId) {
    await updateDoc(doc(db, REL, relId(fromCoachId, clientId)), { status: 'ended', updatedAt: now }).catch(() => undefined);
  }
  const id = relId(toCoachId, clientId);
  await setDoc(doc(db, REL, id), {
    id,
    coachId: toCoachId,
    clientId,
    status: 'active',
    createdBy,
    createdAt: now,
    updatedAt: now,
  } satisfies CoachClientRelationship);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: toCoachId, updatedAt: now });
  await writeAudit({ action: 'coach.transfer', targetUserId: clientId, metadata: { from: fromCoachId ?? null, to: toCoachId } });
}

/** Removes a client's coach assignment. */
export async function unassignClient(clientId: string, coachId: string, createdBy: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { status: 'ended', updatedAt: now }).catch(() => undefined);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: deleteField(), updatedAt: now });
  await writeAudit({ action: 'coach.unassign', targetUserId: clientId, metadata: { coachId, createdBy } });
}
