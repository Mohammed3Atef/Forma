import { apiGet, apiPost, apiPut } from '@/services/platformApi';
import { fetchUser } from './accountsApi';
import { listRelationshipsForCoach } from './coachClientsApi';
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
 * Coach-side reads/writes over a client's Mongo-backed data at `/api/client/*`
 * (port of the old `clientData/{clientId}/**` Firestore tree). Access checks
 * (assigned coach / admin(clients.readAll|writeAll)) are enforced server-side —
 * see `api/client/_lib/access.ts` — so this file just calls the routes and
 * shapes the responses back into the frontend's existing domain types.
 */

export interface Author {
  id: string;
  role: Role;
}

// ---- small local helpers ---------------------------------------------------

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

// ---- clients ---------------------------------------------------------------

export async function listMyClients(coachId: string): Promise<UserRecord[]> {
  const rels = await listRelationshipsForCoach(coachId);
  const users = await Promise.all(rels.map((r) => fetchUser(r.clientId)));
  return users.filter((u): u is UserRecord => !!u);
}

export async function fetchClientProfile(clientId: string): Promise<UserProfile | null> {
  return apiGet<UserProfile | null>(`/client/profile${qs({ clientId })}`);
}

/** Read a client's onboarding assessment (coach/admin oversight, read-only). */
export async function getClientAssessment(clientId: string): Promise<ClientAssessment | null> {
  return apiGet<ClientAssessment | null>(`/client/assessment${qs({ clientId })}`);
}

/** Coach records review notes on a client's assessment (merge, doesn't reset status). */
export async function setAssessmentCoachNotes(clientId: string, coachNotes: string): Promise<void> {
  await apiPost(`/client/assessment${qs({ action: 'notes', clientId })}`, { clientId, coachNotes });
}

/** Coach marks the assessment reviewed (locks further client edits until reset). The backend notifies the client itself. */
export async function markAssessmentReviewed(clientId: string, reviewerId: string): Promise<void> {
  await apiPost(`/client/assessment${qs({ action: 'review', clientId })}`, { clientId, reviewerId });
}

/** Coach re-opens the assessment so the client can edit + resubmit. */
export async function resetAssessment(clientId: string): Promise<void> {
  await apiPost(`/client/assessment${qs({ action: 'reset', clientId })}`, { clientId });
}

// ---- subscription freeze requests ------------------------------------------

/** Read a client's pending/last freeze request (coach oversight). */
export async function getClientFreezeRequest(clientId: string): Promise<FreezeRequest | null> {
  const doc = await apiGet<Record<string, unknown> | null>(`/client/subscription-request${qs({ clientId })}`);
  return doc ? withId<FreezeRequest>(doc, 'current') : null;
}

/** Coach records the decision on a client's freeze request (applying the freeze is done separately). The backend notifies the client. */
export async function resolveFreezeRequest(
  clientId: string,
  decidedBy: string,
  outcome: 'accepted' | 'rejected',
  coachNote: string,
): Promise<void> {
  await apiPost(`/client/subscription-request${qs({ action: 'decide', clientId })}`, { clientId, decidedBy, outcome, coachNote });
}

/** Coach sets the client's initial fitness profile (optional, at creation). */
export async function saveClientProfile(clientId: string, profile: UserProfile): Promise<void> {
  await apiPut(`/client/profile${qs({ clientId })}`, { clientId, ...profile });
}

// ---- raw fitness logs (coach read-only oversight) --------------------------

/** Maps a `fetchClientLogs` collection name to its `/api/client/logs/*` route. */
function logsPath(name: string): string {
  switch (name) {
    case 'workoutLogs':
      return '/client/logs/workout';
    case 'nutritionLogs':
      return '/client/logs/nutrition';
    case 'weightLogs':
      return '/client/logs/weight';
    case 'cardioLogs':
      return '/client/logs/cardio';
    default:
      throw new Error(`fetchClientLogs: unsupported collection "${name}"`);
  }
}

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
  const list = await apiGet<Record<string, unknown>[]>(`${logsPath(name)}${qs({ clientId, limit: max })}`);
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
  const base = { clientId, date };
  const [w, n, wt, cardio, checklist] = await Promise.all([
    apiGet<Record<string, unknown> | null>(`/client/logs/workout${qs(base)}`),
    apiGet<Record<string, unknown> | null>(`/client/logs/nutrition${qs(base)}`),
    apiGet<Record<string, unknown> | null>(`/client/logs/weight${qs(base)}`),
    apiGet<Record<string, unknown>[]>(`/client/logs/cardio${qs(base)}`),
    apiGet<Record<string, unknown> | null>(`/client/logs/checklist${qs(base)}`),
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
  const list = await apiGet<Record<string, unknown>[]>(`/client/measurements${qs({ clientId })}`);
  return list.map((d) => withId<MeasurementLog>(d, d.date as string, { dirty: false }));
}

/**
 * A client's progress photos (newest first). Reads the generic `progressPhotos`
 * sync collection (pushed by the client's `photoStore.ts` via SyncEngine) —
 * see `api/client/_handlers/photos.ts`. Only CDN-uploaded photos have a
 * viewable image for the coach; the rest render a placeholder.
 */
export async function fetchClientPhotos(clientId: string): Promise<ProgressPhoto[]> {
  const list = await apiGet<Record<string, unknown>[]>(`/client/photos${qs({ clientId })}`);
  return list.map((d) => withId<ProgressPhoto>(d, d.id as string, { dirty: false }));
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
  await apiPut(`/client/measurements${qs({ clientId })}`, { clientId, date, values, updatedBy });
  await writeAudit({ action: 'client.measurement', targetUserId: clientId, metadata: { date, by: updatedBy } });
}

// ---- coach notes -----------------------------------------------------------

export async function listCoachNotes(clientId: string): Promise<CoachNote[]> {
  const list = await apiGet<Record<string, unknown>[]>(`/client/coach-notes${qs({ clientId })}`);
  return list.map((d) => withId<CoachNote>(d, d._id as string));
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
  author: Author,
  kind: 'note' | 'announcement' = 'note',
  anchor?: NoteAnchor,
): Promise<void> {
  await apiPost(`/client/coach-notes${qs({ clientId })}`, {
    clientId,
    body,
    kind,
    authorId: author.id,
    authorRole: author.role,
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

// ---- assigned plans & templates (legacy — no Mongo route) ------------------
//
// These collections (`workoutPlans`/`nutritionPlans` "assigned plan" cards and
// top-level `planTemplates`) have no route under `api/client/*` — they were
// superseded by the singleton coach-authored plan + version history model
// (see planApi.ts / planVersionsApi.ts). Nothing in the app currently calls
// these besides `assignTemplate`, so they resolve to safe no-ops.

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
  const doc = await apiGet<Record<string, unknown> | null>(`/client/coach-targets${qs({ clientId })}`);
  return doc ? withId<CoachTargets>(doc, 'current') : null;
}

/** The backend notifies the client itself. */
export async function setCoachTargets(
  clientId: string,
  targets: Pick<CoachTargets, 'waterMl' | 'steps' | 'cardioMin' | 'calories' | 'protein'>,
  updatedBy: string,
): Promise<void> {
  await apiPut(`/client/coach-targets${qs({ clientId })}`, { clientId, updatedBy, ...targets });
}
