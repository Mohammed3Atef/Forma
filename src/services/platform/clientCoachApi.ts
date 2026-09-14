import { trpc } from '@/services/trpc';
import { fetchUser } from './accountsApi';
import { getRelationship } from './coachClientsApi';
import type { ClientAssessment, CardioPlan, CoachClientRelationship, CoachNote, CoachTargets, FreezeRequest, UserProfile, UserRecord } from '@/types';

/**
 * Owner-side reads of coach-authored content for the signed-in client, over
 * the tRPC `client.*` procedures (port of the old `clientData/{clientId}/**`
 * Firestore tree, then the Mongo-backed `/api/client/*` REST routes). Access
 * is enforced server-side — a client may only ever read/write their OWN data
 * via these procedures (see `api/client/_lib/access.ts`).
 */

/** Mongo docs come back as `{_id, ...}`-less already (tRPC strips `_id`); the frontend types want `{id, ...}`. */
function withId<T>(doc: Record<string, unknown>, id: string, extra?: Record<string, unknown>): T {
  const { _id, ...rest } = doc;
  return { ...rest, ...extra, id } as unknown as T;
}

export async function fetchMyCoachNotes(clientId: string): Promise<CoachNote[]> {
  const list = await trpc.coachNotes.list.query({ clientId });
  return list.map((d) => withId<CoachNote>(d, d._id));
}

export async function fetchMyCoachTargets(clientId: string): Promise<CoachTargets | null> {
  const doc = await trpc.coachTargets.get.query({ clientId });
  return doc ? withId<CoachTargets>(doc, 'current') : null;
}

export async function fetchMyCardioPlan(clientId: string): Promise<CardioPlan | null> {
  return trpc.cardioPlan.get.query({ clientId }) as Promise<CardioPlan | null>;
}

export async function fetchMyProfile(clientId: string): Promise<UserProfile | null> {
  return trpc.profile.get.query({ clientId }) as Promise<UserProfile | null>;
}

export async function fetchMyAssessment(clientId: string): Promise<ClientAssessment | null> {
  return trpc.assessment.get.query({ clientId }) as Promise<ClientAssessment | null>;
}

/**
 * Persist an in-progress assessment draft (status `in_progress`) so the coach
 * can see the client has started, and so progress survives across devices.
 * Does NOT touch profile/main (that's derived only on submit).
 */
export async function saveAssessmentProgress(clientId: string, assessment: ClientAssessment): Promise<void> {
  await trpc.assessment.saveDraft.mutate({ clientId, ...assessment } as unknown as Parameters<typeof trpc.assessment.saveDraft.mutate>[0]);
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
  await trpc.assessment.submit.mutate({ clientId, assessment, profile } as unknown as Parameters<typeof trpc.assessment.submit.mutate>[0]);
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
  const doc = await trpc.subscriptionRequest.get.query({ clientId });
  return doc ? withId<FreezeRequest>(doc, 'current') : null;
}

/** Client submits (or re-submits) a request to freeze their subscription. The backend notifies the coach. */
export async function submitFreezeRequest(
  clientId: string,
  data: { from?: number | null; until?: number | null; reason: string },
): Promise<void> {
  await trpc.subscriptionRequest.submit.mutate({ clientId, ...data });
}

/** Client withdraws a pending freeze request. */
export async function cancelFreezeRequest(clientId: string): Promise<void> {
  await trpc.subscriptionRequest.cancel.mutate({ clientId });
}
