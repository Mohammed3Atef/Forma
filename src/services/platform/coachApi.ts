import { trpc } from '@/services/trpc';
import { writeAudit } from './auditApi';
import type {
  AssignedPlan,
  CardioLog,
  ClientAssessment,
  CoachNote,
  CoachTargets,
  DailyChecklist,
  FreezeRequest,
  MeasurementLog,
  NoteEntityType,
  NoteScreen,
  NutritionLog,
  PlanKind,
  PlanTemplate,
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
  return trpc.assessment.get.query({ clientId }) as Promise<ClientAssessment | null>;
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

/** Coach records the decision on a client's freeze request (applying the freeze is done separately). The backend notifies the client. */
export async function resolveFreezeRequest(
  clientId: string,
  _decidedBy: string,
  outcome: 'accepted' | 'rejected',
  coachNote: string,
): Promise<void> {
  await trpc.subscriptionRequest.decide.mutate({ clientId, outcome, coachNote });
}

/** Coach sets the client's initial fitness profile (optional, at creation). */
export async function saveClientProfile(clientId: string, profile: UserProfile): Promise<void> {
  await trpc.profile.save.mutate({ clientId, ...profile });
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

/** A client's cardio history (newest first). */
export async function fetchClientCardioLogs(clientId: string, max = 120): Promise<CardioLog[]> {
  return fetchClientLogs<CardioLog>(clientId, 'cardioLogs', max);
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
): Promise<void> {
  await trpc.measurements.save.mutate({ clientId, date, values });
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

/** The backend notifies the client itself (author/role are taken from the authenticated session). */
export async function addCoachNote(
  clientId: string,
  body: string,
  _author: Author,
  kind: 'note' | 'announcement' = 'note',
  anchor?: NoteAnchor,
): Promise<void> {
  await trpc.coachNotes.create.mutate({
    clientId,
    body,
    kind,
    screen: anchor?.screen,
    date: anchor?.date,
    entityType: anchor?.entityType,
    entityId: anchor?.entityId,
  });
}

/** Sends an announcement note to every client in the list. */
export async function broadcastAnnouncement(clientIds: string[], body: string, author: Author): Promise<void> {
  await Promise.all(clientIds.map((id) => addCoachNote(id, body, author, 'announcement')));
}

// ---- assigned plans & templates (legacy — no backend route) ---------------
//
// These collections (`workoutPlans`/`nutritionPlans` "assigned plan" cards and
// top-level `planTemplates`) have no procedure under the tRPC `client.*`
// namespace — they were superseded by the singleton coach-authored plan +
// version history model (see planApi.ts / planVersionsApi.ts). Nothing in the
// app currently calls these besides `assignTemplate`, so they resolve to safe
// no-ops.

export async function listAssignedPlans(_clientId: string, _kind: PlanKind): Promise<AssignedPlan[]> {
  return [];
}

export async function assignPlan(
  _clientId: string,
  _data: { kind: PlanKind; title: string; description: string; assignedBy: string },
): Promise<void> {}

export async function deleteAssignedPlan(_clientId: string, _kind: PlanKind, _id: string): Promise<void> {}

export async function listTemplates(_coachId: string): Promise<PlanTemplate[]> {
  return [];
}

export async function createTemplate(
  _coachId: string,
  _data: { kind: PlanKind; title: string; description: string },
): Promise<void> {}

export async function deleteTemplate(_id: string): Promise<void> {}

/** Copies a template onto a client as an assigned plan. */
export async function assignTemplate(template: PlanTemplate, clientId: string, assignedBy: string): Promise<void> {
  await assignPlan(clientId, { kind: template.kind, title: template.title, description: template.description, assignedBy });
}

// ---- coach targets ---------------------------------------------------------

export async function getCoachTargets(clientId: string): Promise<CoachTargets | null> {
  const doc = await trpc.coachTargets.get.query({ clientId });
  return doc ? withId<CoachTargets>(doc, 'current') : null;
}

/** The backend notifies the client itself. */
export async function setCoachTargets(
  clientId: string,
  targets: Pick<CoachTargets, 'waterMl' | 'steps' | 'cardioMin' | 'calories' | 'protein'>,
  _updatedBy: string,
): Promise<void> {
  await trpc.coachTargets.set.mutate({ clientId, ...targets });
}
