import { apiGet, apiPatch, apiPost } from '@/services/platformApi';
import type { WeeklyCheckIn } from '@/types';

/**
 * Weekly check-ins over the Mongo-backed `/api/client/check-ins` route (port
 * of `clientData/{clientId}/checkIns/{weekStart}`). The coach creates/reviews;
 * the client may only update their OWN doc once, while it's still `requested`
 * — that "one-time submit while requested" rule is enforced server-side, but
 * we keep mirroring it in `submitCheckIn`'s caller-facing contract below since
 * it shapes what the client UI shows (see the Home check-in card / CheckIn page).
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

/** Builds a `?a=1&b=2` query string, skipping undefined values. */
function qs(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, String(v));
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** Mongo's `_id` is `${clientId}__${weekStart}`; the frontend id IS the weekStart. */
function toCheckIn(doc: Record<string, unknown>): WeeklyCheckIn {
  const { _id, ...rest } = doc;
  return { ...rest, id: rest.weekStart as string } as unknown as WeeklyCheckIn;
}

export async function getCheckIn(clientId: string, id: string): Promise<WeeklyCheckIn | null> {
  const doc = await apiGet<Record<string, unknown> | null>(`/client/check-ins${qs({ clientId, id })}`);
  return doc ? toCheckIn(doc) : null;
}

/** All of a client's check-ins, newest week first. */
export async function listCheckIns(clientId: string): Promise<WeeklyCheckIn[]> {
  const list = await apiGet<Record<string, unknown>[]>(`/client/check-ins${qs({ clientId })}`);
  return list.map(toCheckIn);
}

/** The most recent check-in (the Home card watches for status === 'requested'). */
export async function getActiveCheckIn(clientId: string): Promise<WeeklyCheckIn | null> {
  const list = await listCheckIns(clientId);
  return list[0] ?? null;
}

/**
 * Coach requests a check-in for a week. The backend is idempotent (one doc
 * per week, keyed by weekStart — won't clobber an already-requested/submitted/
 * reviewed week) and notifies the client itself.
 */
export async function requestCheckIn(coachId: string, clientId: string, weekStart: string, weekEnd: string): Promise<void> {
  await apiPost(`/client/check-ins${qs({ action: 'request', clientId })}`, { clientId, weekStart, weekEnd, coachId });
}

/** Client submits their check-in (once, while status is still 'requested' — enforced server-side). The backend notifies the coach. */
export async function submitCheckIn(clientId: string, id: string, data: CheckInSubmission): Promise<void> {
  await apiPatch(`/client/check-ins${qs({ clientId, id })}`, data);
}

/** Coach reviews a submitted check-in with feedback. The backend notifies the client. */
export async function reviewCheckIn(clientId: string, id: string, coachId: string, feedback: string): Promise<void> {
  await apiPost(`/client/check-ins${qs({ action: 'review', clientId, id })}`, { feedback, coachId });
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
