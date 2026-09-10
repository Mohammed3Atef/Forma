import { apiGet, apiPatch, apiPost, apiPut } from '@/services/platformApi';
import { fetchUser } from './accountsApi';
import { getRelationship } from './coachClientsApi';
import type { ClientAssessment, CardioPlan, CoachClientRelationship, CoachNote, CoachTargets, FreezeRequest, UserProfile, UserRecord } from '@/types';

/**
 * Owner-side reads of coach-authored content for the signed-in client, over
 * the Mongo-backed `/api/client/*` routes (port of the old
 * `clientData/{clientId}/**` Firestore tree). Access is enforced server-side —
 * a client may only ever read/write their OWN data via these routes (see
 * `api/client/_lib/access.ts`).
 */

/** Builds a `?a=1&b=2` query string, skipping undefined values. */
function qs(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, String(v));
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** Mongo docs come back as `{_id, ...}`; the frontend types want `{id, ...}`. */
function withId<T>(doc: Record<string, unknown>, id: string, extra?: Record<string, unknown>): T {
  const { _id, ...rest } = doc;
  return { ...rest, ...extra, id } as unknown as T;
}

export async function fetchMyCoachNotes(clientId: string): Promise<CoachNote[]> {
  const list = await apiGet<Record<string, unknown>[]>(`/client/coach-notes${qs({ clientId })}`);
  return list.map((d) => withId<CoachNote>(d, d._id as string));
}

export async function fetchMyCoachTargets(clientId: string): Promise<CoachTargets | null> {
  const doc = await apiGet<Record<string, unknown> | null>(`/client/coach-targets${qs({ clientId })}`);
  return doc ? withId<CoachTargets>(doc, 'current') : null;
}

export async function fetchMyCardioPlan(clientId: string): Promise<CardioPlan | null> {
  return apiGet<CardioPlan | null>(`/client/cardio-plan${qs({ clientId })}`);
}

export async function fetchMyProfile(clientId: string): Promise<UserProfile | null> {
  return apiGet<UserProfile | null>(`/client/profile${qs({ clientId })}`);
}

export async function fetchMyAssessment(clientId: string): Promise<ClientAssessment | null> {
  return apiGet<ClientAssessment | null>(`/client/assessment${qs({ clientId })}`);
}

/**
 * Persist an in-progress assessment draft (status `in_progress`) so the coach
 * can see the client has started, and so progress survives across devices.
 * Does NOT touch profile/main (that's derived only on submit).
 */
export async function saveAssessmentProgress(clientId: string, assessment: ClientAssessment): Promise<void> {
  await apiPut(`/client/assessment${qs({ clientId })}`, { clientId, ...assessment });
}

/**
 * Submits the onboarding assessment AND the derived fitness profile in one
 * request; the backend persists both atomically, preserves prior review
 * feedback on a re-submit (flips to `updated_after_review` instead of
 * resetting), syncs `users.displayName`, and notifies the coach.
 */
export async function submitAssessment(
  clientId: string,
  assessment: ClientAssessment,
  profile: UserProfile,
): Promise<void> {
  await apiPost(`/client/assessment${qs({ action: 'submit', clientId })}`, { clientId, assessment, profile });
}

// ---- subscription (read-only) + freeze requests ----------------------------

/** Read the assigned coach's public record (name/phone/photo) for the "Your Coach" card. */
export async function fetchMyCoach(coachId: string): Promise<UserRecord | null> {
  return fetchUser(coachId);
}

/** Read the client's coach relationship (for the subscription banner). */
export async function fetchMyRelationship(coachId: string, clientId: string): Promise<CoachClientRelationship | null> {
  return getRelationship(coachId, clientId);
}

export async function fetchMyFreezeRequest(clientId: string): Promise<FreezeRequest | null> {
  const doc = await apiGet<Record<string, unknown> | null>(`/client/subscription-request${qs({ clientId })}`);
  return doc ? withId<FreezeRequest>(doc, 'current') : null;
}

/** Client submits (or re-submits) a request to freeze their subscription. The backend notifies the coach. */
export async function submitFreezeRequest(
  clientId: string,
  data: { from?: number | null; until?: number | null; reason: string },
): Promise<void> {
  await apiPost(`/client/subscription-request${qs({ action: 'submit', clientId })}`, { clientId, ...data });
}

/** Client withdraws a pending freeze request. */
export async function cancelFreezeRequest(clientId: string): Promise<void> {
  await apiPatch(`/client/subscription-request${qs({ clientId })}`, { clientId });
}
