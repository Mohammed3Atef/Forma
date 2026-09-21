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

/** Mongo's `_id` is `${clientId}__${weekStart}`; the frontend id IS the weekStart. */
function toCheckIn(doc: Record<string, unknown>): WeeklyCheckIn {
  const { _id, ...rest } = doc;
  return { ...rest, id: rest.weekStart as string } as unknown as WeeklyCheckIn;
}

export async function getCheckIn(clientId: string, id: string): Promise<WeeklyCheckIn | null> {
  const doc = await trpc.checkIns.get.query({ clientId, weekStart: id });
  return doc ? toCheckIn(doc) : null;
}

/** All of a client's check-ins, newest week first. */
export async function listCheckIns(clientId: string): Promise<WeeklyCheckIn[]> {
  const list = await trpc.checkIns.list.query({ clientId });
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
 * Coach requests a check-in for a week. The backend is idempotent (one doc
 * per week, keyed by weekStart — won't clobber an already-requested/submitted/
 * reviewed week) and notifies the client itself.
 */
export async function requestCheckIn(coachId: string, clientId: string, weekStart: string, weekEnd: string): Promise<void> {
  await trpc.checkIns.request.mutate({ clientId, weekStart, weekEnd, coachId });
}

/** Client submits their check-in (once, while status is still 'requested' — enforced server-side). The backend notifies the coach. */
export async function submitCheckIn(clientId: string, id: string, data: CheckInSubmission): Promise<void> {
  await trpc.checkIns.submit.mutate({ clientId, weekStart: id, ...data });
}

/** Coach reviews a submitted check-in with feedback. The backend notifies the client. */
export async function reviewCheckIn(clientId: string, id: string, feedback: string): Promise<void> {
  await trpc.checkIns.review.mutate({ clientId, weekStart: id, feedback });
}

export interface CheckInTrendPoint {
  week: string;
  weight?: number;
  adherenceTraining?: number;
  adherenceNutrition?: number;
  energy?: number;
}

/** Clean, chart-ready series (oldest → newest) from submitted/reviewed check-ins. */
export function checkInTrends(list: WeeklyCheckIn[]): CheckInTrendPoint[] {
  return list
    .filter((c) => c.status !== 'requested')
    .slice()
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((c) => ({
      week: c.weekStart,
      weight: c.currentWeight,
      adherenceTraining: c.adherenceTraining,
      adherenceNutrition: c.adherenceNutrition,
      energy: c.energyLevel,
    }));
}
