import { normalizeAssessment } from '@/lib/assessment';
import { trpc } from '@/services/trpc';
import { writeAudit } from './auditApi';
import type {
  CardioLog,
  ClientAssessment,
  CoachNote,
  DailyChecklist,
  FreezeRequest,
  MeasurementLog,
  NoteEntityType,
  NoteScreen,
  NoteVisibility,
  NutritionLog,
  ProgressPhoto,
  Role,
  UserProfile,
  UserRecord,
  WeightLog,
  WorkoutLog,
} from '@/types';

/**
 * Coach-side reads/writes over a client's data via the tRPC `client.*`
 * procedures (port of the old `clientData/{clientId}/**` Firestore tree, then
 * the Mongo-backed `/api/client/*` REST routes). Access checks (assigned
 * coach / admin(clients.readAll|writeAll)) are enforced server-side — see
 * `api/client/_lib/access.ts` — so this file just calls the procedures and
 * shapes the responses back into the frontend's existing domain types.
 */

export interface Author {
  id: string;
  role: Role;
}

/** Mongo docs come back as `{_id, ...}`; the frontend types want `{id, ...}`. */
function withId<T>(doc: Record<string, unknown>, id: string, extra?: Record<string, unknown>): T {
  const { _id, ...rest } = doc;
  return { ...rest, ...extra, id } as unknown as T;
}

// ---- clients ---------------------------------------------------------------

/** One round trip (relationships + user profiles joined server-side) — was an N+1 of one `fetchUser` per client. */
export async function listMyClients(coachId: string): Promise<UserRecord[]> {
  return trpc.coachClients.listMyClientUsers.query({ coachId }) as Promise<UserRecord[]>;
}

export interface ClientDashboardSummary {
  clientId: string;
  workouts7d: number;
  lastActivity: string | null;
  assessment: 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'updated_after_review';
  fullName: string | null;
  toReview: boolean;
  /**
   * B3.2 (O-7): the client's training / nutrition plan has content (≥ 1 day /
   * ≥ 1 meal). Optional — a server without the field must make Today omit
   * the plan-based items, never guess.
   */
  hasWorkoutPlan?: boolean;
  hasNutritionPlan?: boolean;
}

/**
 * Per-client workouts7d/lastActivity/assessment/toReview for every one of a
 * coach's active clients, in three bounded backend queries total — was one
 * `workoutLogs.list` + `assessment.get` + `checkIns.list` fan-out PER client
 * (the coach dashboard N+1). Shared by the dashboard, `CoachAdherence`, and
 * `CoachAssessments` — see `coachClients.dashboardSummaries`' doc comment.
 */
export async function listClientDashboardSummaries(coachId: string): Promise<ClientDashboardSummary[]> {
  return trpc.coachClients.dashboardSummaries.query({ coachId }) as Promise<ClientDashboardSummary[]>;
}

export async function fetchClientProfile(clientId: string): Promise<UserProfile | null> {
  return trpc.profile.get.query({ clientId }) as Promise<UserProfile | null>;
}

/** Read a client's onboarding assessment (coach/admin oversight, read-only). */
export async function getClientAssessment(clientId: string): Promise<ClientAssessment | null> {
  return normalizeAssessment((await trpc.assessment.get.query({ clientId })) as ClientAssessment | null);
}

/** Coach records review notes on a client's assessment (merge, doesn't reset status). */
export async function setAssessmentCoachNotes(clientId: string, coachNotes: string): Promise<void> {
  await trpc.assessment.setCoachNotes.mutate({ clientId, coachNotes });
}

/** Coach marks the assessment reviewed (locks further client edits until reset). The backend notifies the client itself. */
export async function markAssessmentReviewed(clientId: string, _reviewerId: string): Promise<void> {
  await trpc.assessment.review.mutate({ clientId });
}

/** Coach re-opens the assessment so the client can edit + resubmit. */
export async function resetAssessment(clientId: string): Promise<void> {
  await trpc.assessment.reset.mutate({ clientId });
}

// ---- subscription freeze requests ------------------------------------------

/** Read a client's pending/last freeze request (coach oversight). */
export async function getClientFreezeRequest(clientId: string): Promise<FreezeRequest | null> {
  const doc = await trpc.subscriptionRequest.get.query({ clientId });
  return doc ? withId<FreezeRequest>(doc, 'current') : null;
}

/** A pending freeze request as Today lists it (B3.2 / B32-P1). */
export interface PendingFreezeRequest {
  clientId: string;
  from: number | null;
  until: number | null;
  reason: string;
  requestedAt: number;
}

/**
 * Every pending freeze request among the coach's active clients, from the
 * canonical request documents (server-scoped to the current relationship).
 * Walks every page — bounded requests, never a silently truncated list.
 */
export async function listPendingFreezeRequests(coachId: string): Promise<PendingFreezeRequest[]> {
  const out: PendingFreezeRequest[] = [];
  let cursor: { requestedAt: number; clientId: string } | undefined;
  for (let page = 0; page < 1000; page += 1) {
    const res = await trpc.subscriptionRequest.pendingForCoach.query({ coachId, cursor, limit: 200 });
    out.push(...res.items);
    if (!res.nextCursor) return out;
    cursor = res.nextCursor;
  }
  throw new Error('pendingForCoach: too many pages');
}

/** Coach records the decision on a client's freeze request (applying the freeze is done separately). The backend notifies the client. */
export async function resolveFreezeRequest(
  clientId: string,
  _decidedBy: string,
  outcome: 'accepted' | 'rejected',
  coachNote: string,
): Promise<void> {
  await trpc.subscriptionRequest.decide.mutate({ clientId, outcome, coachNote });
}

// ---- raw fitness logs (coach read-only oversight) --------------------------

/**
 * The day-keyed logs (workout/nutrition/weight) use the calendar date as their
 * id (mirroring the old Firestore doc id); cardioLogs keep their own generated
 * id since several sessions can exist per day.
 */
function logDocId(name: string, doc: Record<string, unknown>): string {
  return name === 'cardioLogs' ? (doc._id as string) : (doc.date as string);
}

/** Recent records from one of a client's log collections (newest first). */
export async function fetchClientLogs<T>(clientId: string, name: string, max = 14): Promise<T[]> {
  let list: Record<string, unknown>[];
  switch (name) {
    case 'workoutLogs':
      list = await trpc.logsWorkout.list.query({ clientId, limit: max });
      break;
    case 'nutritionLogs':
      list = await trpc.logsNutrition.list.query({ clientId, limit: max });
      break;
    case 'weightLogs':
      list = await trpc.logsWeight.list.query({ clientId, limit: max });
      break;
    case 'cardioLogs':
      list = await trpc.logsCardio.list.query({ clientId, limit: max });
      break;
    default:
      throw new Error(`fetchClientLogs: unsupported collection "${name}"`);
  }
  return list.map((d) => withId<T>(d, logDocId(name, d), { dirty: false }));
}

export interface ClientDay {
  date: string;
  workout: WorkoutLog | null;
  nutrition: NutritionLog | null;
  weight: WeightLog | null;
  checklist: DailyChecklist | null;
  cardio: CardioLog[];
}

/** Everything a client logged on one calendar day (for the coach activity view). */
export async function fetchClientDay(clientId: string, date: string): Promise<ClientDay> {
  const [w, n, wt, cardio, checklist] = await Promise.all([
    trpc.logsWorkout.get.query({ clientId, date }),
    trpc.logsNutrition.get.query({ clientId, date }),
    trpc.logsWeight.get.query({ clientId, date }),
    trpc.logsCardio.list.query({ clientId, date }),
    trpc.logsChecklist.get.query({ clientId, date }),
  ]);
  return {
    date,
    workout: w ? withId<WorkoutLog>(w, date, { dirty: false }) : null,
    nutrition: n ? withId<NutritionLog>(n, date, { dirty: false }) : null,
    weight: wt ? withId<WeightLog>(wt, date, { dirty: false }) : null,
    checklist: checklist ? withId<DailyChecklist>(checklist, date, { dirty: false }) : null,
    cardio: cardio.map((c) => withId<CardioLog>(c, c._id as string, { dirty: false })),
  };
}

// ---- client data for the read-only "view as client" screens ----------------

/** A client's full body-measurement history (oldest → newest by date). */
export async function fetchClientMeasurements(clientId: string): Promise<MeasurementLog[]> {
  const list = await trpc.measurements.list.query({ clientId });
  return list.map((d) => withId<MeasurementLog>(d, d.date));
}

/**
 * A client's progress photos (newest first). Reads the generic `progressPhotos`
 * sync collection (pushed by the client's `photoStore.ts` via SyncEngine) —
 * see `api/_trpc/routers/clientLogs.ts`'s `photosRouter`. Only CDN-uploaded
 * photos have a viewable image for the coach; the rest render a placeholder.
 */
export async function fetchClientPhotos(clientId: string): Promise<ProgressPhoto[]> {
  const list = await trpc.photos.list.query({ clientId });
  return list.map((d) => withId<ProgressPhoto>(d as Record<string, unknown>, (d as { id: string }).id, { dirty: false }));
}

/** A client's bodyweight history (newest first). */
export async function fetchClientWeightLogs(clientId: string, max = 120): Promise<WeightLog[]> {
  return fetchClientLogs<WeightLog>(clientId, 'weightLogs', max);
}

/**
 * Coach records a body-measurement entry for a client. The backend read-merges
 * the existing day (so partial entries don't wipe other body parts) and
 * filters to clean positive numbers itself.
 */
export async function saveClientMeasurement(
  clientId: string,
  date: string,
  values: Record<string, number>,
  updatedBy: string,
  clear: string[] = [],
): Promise<void> {
  await trpc.measurements.save.mutate({ clientId, date, values, ...(clear.length ? { clear } : {}) });
  await writeAudit({ action: 'client.measurement', targetUserId: clientId, metadata: { date, by: updatedBy } });
}

// ---- coach notes -----------------------------------------------------------

export async function listCoachNotes(clientId: string): Promise<CoachNote[]> {
  const list = await trpc.coachNotes.list.query({ clientId });
  return list.map((d) => withId<CoachNote>(d, d._id));
}

/** Optional entity anchor for a coach note (where it's attached + the deep-link target). */
export interface NoteAnchor {
  screen?: NoteScreen;
  date?: string;
  entityType?: NoteEntityType;
  entityId?: string;
}

/**
 * Notes are PRIVATE unless `visibility: 'client'` is passed (B0 / CO-02). The
 * backend notifies the client only for shared notes (author/role are taken
 * from the authenticated session).
 */
export async function addCoachNote(
  clientId: string,
  body: string,
  _author: Author,
  kind: 'note' | 'announcement' = 'note',
  anchor?: NoteAnchor,
  visibility: NoteVisibility = 'private',
): Promise<void> {
  await trpc.coachNotes.create.mutate({
    clientId,
    body,
    kind,
    visibility,
    screen: anchor?.screen,
    date: anchor?.date,
    entityType: anchor?.entityType,
    entityId: anchor?.entityId,
  });
}

