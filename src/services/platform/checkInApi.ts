import type { QueryClient } from '@tanstack/react-query';
import { trpc } from '@/services/trpc';
import type { WeeklyCheckIn } from '@/types';

/**
 * Weekly check-ins over the tRPC `checkIns.*` procedures (port of
 * `clientData/{clientId}/checkIns/{weekStart}`, then the Mongo-backed
 * `/api/client/check-ins` REST route). The coach creates/reviews; the client
 * may only update their OWN doc once, while it's still `requested` — that
 * "one-time submit while requested" rule is enforced server-side, but we keep
 * mirroring it in `submitCheckIn`'s caller-facing contract below since it
 * shapes what the client UI shows (see the Home check-in card / CheckIn page).
 */

/** Fields the client fills in on submit (all optional except photos object). */
export interface CheckInSubmission {
  currentWeight?: number;
  adherenceTraining?: number;
  adherenceNutrition?: number;
  hungerLevel?: number;
  energyLevel?: number;
  sleepQuality?: number;
  notes?: string;
  progressPhotos?: { front?: string; side?: string; back?: string };
}

/**
 * Mongo's `_id` is `${clientId}__${key}`; the frontend id IS the key — the week (`2026-10-17`)
 * for every week's first record, as before, or `week__coachId` for the incoming coach's own
 * record of a mid-week hand-over week (B3.4). Routes, drafts and the outbox use it as-is.
 */
function toCheckIn(doc: Record<string, unknown>): WeeklyCheckIn {
  const { _id, ...rest } = doc;
  const prefix = `${String(rest.clientId)}__`;
  const id = typeof _id === 'string' && _id.startsWith(prefix) ? _id.slice(prefix.length) : (rest.weekStart as string);
  return { ...rest, id } as unknown as WeeklyCheckIn;
}

// `byKey` (B3.4): this app names records by key; the server serves older apps — which address a
// week — differently, so the two generations can never mistake one same-week record for another.
export async function getCheckIn(clientId: string, id: string): Promise<WeeklyCheckIn | null> {
  const doc = await trpc.checkIns.get.query({ clientId, weekStart: id, byKey: true });
  return doc ? toCheckIn(doc) : null;
}

/** All of a client's check-ins, newest week first. */
export async function listCheckIns(clientId: string): Promise<WeeklyCheckIn[]> {
  const list = await trpc.checkIns.list.query({ clientId, byKey: true });
  return list.map((d) => toCheckIn(d));
}

/** The most recent check-in (the Home card watches for status === 'requested'). */
export async function getActiveCheckIn(clientId: string): Promise<WeeklyCheckIn | null> {
  const list = await listCheckIns(clientId);
  return list[0] ?? null;
}

export interface CoachClientCheckInSummary {
  clientId: string;
  latest: WeeklyCheckIn | null;
  previous: WeeklyCheckIn | null;
}

/**
 * Latest + previous check-in for every one of a coach's active clients, in
 * one batched request — was one `checkIns.list` request per client
 * (`CoachCheckInsOverview`'s N+1). See `checkIns.listForCoachClients`' doc
 * comment.
 */
export async function listCheckInsForCoachClients(coachId: string): Promise<CoachClientCheckInSummary[]> {
  const rows = await trpc.checkIns.listForCoachClients.query({ coachId });
  return rows.map((r) => ({
    clientId: r.clientId,
    latest: r.latest ? toCheckIn(r.latest) : null,
    previous: r.previous ? toCheckIn(r.previous) : null,
  }));
}

/**
 * Coach requests a check-in for a week. The backend is idempotent per coach and
 * week (won't clobber an already-requested / submitted / reviewed week; after a
 * mid-week hand-over the incoming coach gets a record of their own — B3.4) and
 * notifies the client itself.
 */
export async function requestCheckIn(coachId: string, clientId: string, weekStart: string, weekEnd: string): Promise<void> {
  await trpc.checkIns.request.mutate({ clientId, weekStart, weekEnd, coachId });
}

/**
 * Client submits their check-in (once, while status is still 'requested' — enforced server-side). The backend notifies the coach.
 * `opId` is the outbox operation id (B1.6): a replay of the same submission is idempotent.
 */
export async function submitCheckIn(clientId: string, id: string, data: CheckInSubmission, opId?: string, byKey = false): Promise<void> {
  // `byKey` only when the caller knows `id` is a record key — a submission queued by an older build
  // carries a week, and the server resolves it the way that build meant (B3.4 compatibility gate).
  await trpc.checkIns.submit.mutate({ clientId, weekStart: id, ...data, ...(opId ? { opId } : {}), ...(byKey ? { byKey: true } : {}) });
}

/** Coach reviews a submitted check-in with feedback. The backend notifies the client. */
export async function reviewCheckIn(clientId: string, id: string, feedback: string): Promise<void> {
  await trpc.checkIns.review.mutate({ clientId, weekStart: id, feedback });
}

/**
 * After a confirmed review (B3.9, PF-12): the client's check-in list is updated in place — no refetch
 * of it — and only marked stale for the next natural refresh. The coach-wide summaries (Today, the
 * directory) are recomputed by the server, so those are refreshed.
 */
export function writeReviewToCache(qc: QueryClient, clientId: string, coachId: string, weekStart: string, feedback: string) {
  const now = Date.now();
  qc.setQueryData<WeeklyCheckIn[]>(['checkIns', clientId], (list) =>
    list?.map((c) => (c.id === weekStart || c.weekStart === weekStart ? { ...c, status: 'reviewed' as const, coachFeedback: feedback, reviewedAt: c.reviewedAt ?? now, updatedAt: now } : c)),
  );
  void qc.invalidateQueries({ queryKey: ['checkIns', clientId], refetchType: 'none' });
  void qc.invalidateQueries({ queryKey: ['coachCheckInSummaries', coachId] });
  void qc.invalidateQueries({ queryKey: ['coachDashboardSummaries'] });
}

export interface CheckInTrendPoint {
  week: string;
  weight?: number;
  adherenceTraining?: number;
  adherenceNutrition?: number;
  energy?: number;
}

