import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { writeAudit } from './auditApi';
import type { ClientTransferRequest, TransferMode, TransferSubHandling } from '@/types';

/**
 * Client-takeover REQUESTS, at top-level `transferRequests/{toCoachId__clientId}`
 * (deterministic id, mirrors the `planChangeRequest` pattern). A prospective coach
 * (toCoachId) requests a client owned by ANOTHER coach (fromCoachId); the current
 * coach or an admin resolves it. This module manages ONLY the request record — the
 * actual reassignment + release go through `coachClientsApi` so the users /
 * coachClients / clientData rules stay authoritative. No Auth user is ever created.
 *
 * Notifications are PULL-based by design: cross-coach pushes aren't permitted by the
 * rules (a coach can't write into another coach's notifications), so the current
 * coach sees incoming requests via `listIncomingTransferRequests`, the requester
 * tracks status via `listOutgoingTransferRequests`, and admins via
 * `listPendingTransferRequests`.
 */

const REQ = 'transferRequests';

export function transferReqId(toCoachId: string, clientId: string): string {
  return `${toCoachId}__${clientId}`;
}

/** Prospective coach submits (or re-submits) a request to take over a client. */
export async function submitTransferRequest(input: {
  toCoachId: string;
  clientId: string;
  fromCoachId: string;
  reason: string;
  mode?: TransferMode;
  subscriptionHandling?: TransferSubHandling;
}): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const id = transferReqId(input.toCoachId, input.clientId);
  const req: ClientTransferRequest = {
    id,
    clientId: input.clientId,
    fromCoachId: input.fromCoachId,
    toCoachId: input.toCoachId,
    reason: input.reason.trim(),
    status: 'pending',
    requestedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    updatedAt: now,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.subscriptionHandling ? { subscriptionHandling: input.subscriptionHandling } : {}),
  };
  await setDoc(doc(db, REQ, id), req);
  await writeAudit({
    action: 'coach.transfer_request',
    targetUserId: input.clientId,
    metadata: { clientId: input.clientId, fromCoachId: input.fromCoachId, toCoachId: input.toCoachId, performedBy: input.toCoachId, reason: req.reason, timestamp: now },
  });
}

export async function getTransferRequest(toCoachId: string, clientId: string): Promise<ClientTransferRequest | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, REQ, transferReqId(toCoachId, clientId)));
  return snap.exists() ? (snap.data() as ClientTransferRequest) : null;
}

/** Requesting coach withdraws their own pending request. */
export async function cancelTransferRequest(toCoachId: string, clientId: string): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, REQ, transferReqId(toCoachId, clientId)), { status: 'cancelled', updatedAt: Date.now() });
}

/** Admin: every pending takeover request across all coaches. */
export async function listPendingTransferRequests(): Promise<ClientTransferRequest[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, REQ), where('status', '==', 'pending')));
  return snap.docs.map((d) => d.data() as ClientTransferRequest).sort((a, b) => b.requestedAt - a.requestedAt);
}

/** Current coach: requests to take over MY clients (pending filtered client-side). */
export async function listIncomingTransferRequests(coachId: string): Promise<ClientTransferRequest[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, REQ), where('fromCoachId', '==', coachId)));
  return snap.docs
    .map((d) => d.data() as ClientTransferRequest)
    .filter((r) => r.status === 'pending')
    .sort((a, b) => b.requestedAt - a.requestedAt);
}

/** Requesting coach: the status of requests I have made. */
export async function listOutgoingTransferRequests(coachId: string): Promise<ClientTransferRequest[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, REQ), where('toCoachId', '==', coachId)));
  return snap.docs.map((d) => d.data() as ClientTransferRequest).sort((a, b) => b.requestedAt - a.requestedAt);
}

/**
 * Current coach (fromCoachId) or admin (coaches.assign) records a decision on a
 * request. ACCEPT only records the decision — the caller then performs the actual
 * release/transfer through `coachClientsApi` (keeps the data rules authoritative).
 */
export async function resolveTransferRequest(
  toCoachId: string,
  clientId: string,
  decidedBy: string,
  outcome: 'accepted' | 'rejected',
  adminNote?: string,
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await updateDoc(doc(db, REQ, transferReqId(toCoachId, clientId)), {
    status: outcome,
    reviewedAt: now,
    reviewedBy: decidedBy,
    updatedAt: now,
    ...(adminNote?.trim() ? { adminNote: adminNote.trim() } : {}),
  });
  await writeAudit({
    action: outcome === 'accepted' ? 'coach.transfer_request_accept' : 'coach.transfer_request_reject',
    targetUserId: clientId,
    metadata: { clientId, toCoachId, performedBy: decidedBy, timestamp: now },
  });
}
