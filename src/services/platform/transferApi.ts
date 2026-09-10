import { apiGet, apiPatch, apiPost } from '@/services/platformApi';
import type { ClientTransferRequest, TransferMode, TransferSubHandling } from '@/types';

/**
 * Client-takeover REQUESTS — now backed by `/api/transfers/*` (Mongo
 * `transferRequests` collection) instead of Firestore's
 * `transferRequests/{toCoachId__clientId}`. A prospective coach (toCoachId)
 * requests a client owned by ANOTHER coach (fromCoachId); the current coach or
 * an admin resolves it. This module manages ONLY the request record — the
 * actual reassignment + release go through `coachClientsApi`'s
 * `transferClientWithMode` (the backend's `PATCH /api/transfers/:id` accept
 * path calls the exact same shared server function).
 *
 * Notifications are still PULL-based: the current coach sees incoming
 * requests via `listIncomingTransferRequests`, the requester tracks status via
 * `listOutgoingTransferRequests`, and admins via `listPendingTransferRequests`.
 *
 * The Mongo doc's `_id` IS `${toCoachId}__${clientId}` (same convention as
 * Firestore); `fromApiDoc` below maps that back onto the frontend's `id`
 * field so every exported function here keeps returning the same
 * `ClientTransferRequest` shape.
 */

/** Wire shape returned by `/api/transfers/*` — `_id` is `${toCoachId}__${clientId}`. */
interface ClientTransferRequestApiDoc {
  _id: string;
  clientId: string;
  fromCoachId: string;
  toCoachId: string;
  mode?: TransferMode;
  subscriptionHandling?: TransferSubHandling;
  reason: string;
  status: ClientTransferRequest['status'];
  requestedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  adminNote?: string;
  updatedAt: number;
}

function fromApiDoc(doc: ClientTransferRequestApiDoc): ClientTransferRequest {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

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
  // `toCoachId` is inferred server-side from the signed-in (coach) caller —
  // the endpoint always uses the authenticated user's id, so it isn't sent.
  await apiPost('/transfers', {
    clientId: input.clientId,
    fromCoachId: input.fromCoachId,
    reason: input.reason.trim(),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.subscriptionHandling ? { subscriptionHandling: input.subscriptionHandling } : {}),
  });
}

/**
 * Fetch one transfer request by its composite id. There is no `GET /api/transfers/:id`
 * route — only the list endpoint (`?type=incoming|outgoing|pending`) exists — so
 * this is implemented as "look it up in my own outgoing requests", which matches
 * every current call site (always invoked with `toCoachId` == the signed-in coach).
 */
export async function getTransferRequest(toCoachId: string, clientId: string): Promise<ClientTransferRequest | null> {
  const list = await listOutgoingTransferRequests(toCoachId);
  return list.find((r) => r.id === transferReqId(toCoachId, clientId)) ?? null;
}

/** Requesting coach withdraws their own pending request. */
export async function cancelTransferRequest(toCoachId: string, clientId: string): Promise<void> {
  await apiPatch(`/transfers/${encodeURIComponent(transferReqId(toCoachId, clientId))}`, { action: 'cancel' });
}

/** Admin: every pending takeover request across all coaches. */
export async function listPendingTransferRequests(): Promise<ClientTransferRequest[]> {
  const docs = await apiGet<ClientTransferRequestApiDoc[]>('/transfers?type=pending');
  return docs.map(fromApiDoc);
}

/** Current coach: requests to take over MY clients (pending, newest first). */
export async function listIncomingTransferRequests(_coachId: string): Promise<ClientTransferRequest[]> {
  const docs = await apiGet<ClientTransferRequestApiDoc[]>('/transfers?type=incoming');
  return docs.map(fromApiDoc);
}

/** Requesting coach: the status of requests I have made. */
export async function listOutgoingTransferRequests(_coachId: string): Promise<ClientTransferRequest[]> {
  const docs = await apiGet<ClientTransferRequestApiDoc[]>('/transfers?type=outgoing');
  return docs.map(fromApiDoc);
}

/**
 * Current coach (fromCoachId) or admin (coaches.assign) records a decision on a
 * request. ACCEPT triggers the actual reassignment server-side (the shared
 * `transferClientWithMode`, same function an admin direct transfer uses).
 */
export async function resolveTransferRequest(
  toCoachId: string,
  clientId: string,
  _decidedBy: string,
  outcome: 'accepted' | 'rejected',
  adminNote?: string,
): Promise<void> {
  await apiPatch(`/transfers/${encodeURIComponent(transferReqId(toCoachId, clientId))}`, {
    action: outcome === 'accepted' ? 'accept' : 'reject',
    ...(adminNote?.trim() ? { adminNote: adminNote.trim() } : {}),
  });
}
