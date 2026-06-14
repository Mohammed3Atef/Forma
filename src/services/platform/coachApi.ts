import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { uid } from '@/lib/utils';
import { fetchUser } from './accountsApi';
import { listRelationshipsForCoach } from './coachClientsApi';
import type {
  AssignedPlan,
  CardioLog,
  CoachNote,
  CoachTargets,
  DailyChecklist,
  NutritionLog,
  PlanKind,
  PlanTemplate,
  Role,
  UserProfile,
  UserRecord,
  WeightLog,
  WorkoutLog,
} from '@/types';

const CLIENT = 'clientData';
const TEMPLATES = 'planTemplates';

function planCollection(kind: PlanKind): string {
  return kind === 'workout' ? 'workoutPlans' : 'nutritionPlans';
}

export interface Author {
  id: string;
  role: Role;
}

// ---- clients ---------------------------------------------------------------

export async function listMyClients(coachId: string): Promise<UserRecord[]> {
  const rels = await listRelationshipsForCoach(coachId);
  const users = await Promise.all(rels.map((r) => fetchUser(r.clientId)));
  return users.filter((u): u is UserRecord => !!u);
}

export async function fetchClientProfile(clientId: string): Promise<UserProfile | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'profile', 'main'));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

/** Coach sets the client's initial fitness profile (optional, at creation). */
export async function saveClientProfile(clientId: string, profile: UserProfile): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, CLIENT, clientId, 'profile', 'main'), { ...profile, id: clientId, updatedAt: Date.now() });
}

/** Recent records from one of a client's log collections (newest first). */
export async function fetchClientLogs<T>(clientId: string, name: string, max = 14): Promise<T[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, CLIENT, clientId, name), orderBy('updatedAt', 'desc'), limit(max)));
  return snap.docs.map((d) => d.data() as T);
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
  const { db } = ensureFirebase();
  const dayDoc = (name: string) => getDoc(doc(db, CLIENT, clientId, name, date));
  const [w, n, wt, cl, cardioSnap] = await Promise.all([
    dayDoc('workoutLogs'),
    dayDoc('nutritionLogs'),
    dayDoc('weightLogs'),
    dayDoc('dailyChecklists'),
    getDocs(query(collection(db, CLIENT, clientId, 'cardioLogs'), orderBy('updatedAt', 'desc'), limit(60))),
  ]);
  return {
    date,
    workout: w.exists() ? (w.data() as WorkoutLog) : null,
    nutrition: n.exists() ? (n.data() as NutritionLog) : null,
    weight: wt.exists() ? (wt.data() as WeightLog) : null,
    checklist: cl.exists() ? (cl.data() as DailyChecklist) : null,
    cardio: cardioSnap.docs.map((d) => d.data() as CardioLog).filter((c) => c.date === date),
  };
}

// ---- coach notes -----------------------------------------------------------

export async function listCoachNotes(clientId: string): Promise<CoachNote[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, CLIENT, clientId, 'coachNotes'), orderBy('createdAt', 'desc'), limit(50)));
  return snap.docs.map((d) => d.data() as CoachNote);
}

export async function addCoachNote(
  clientId: string,
  body: string,
  author: Author,
  kind: 'note' | 'announcement' = 'note',
): Promise<void> {
  const { db } = ensureFirebase();
  const id = uid('note');
  const now = Date.now();
  const note: CoachNote = { id, clientId, authorId: author.id, authorRole: author.role, body, kind, createdAt: now, updatedAt: now };
  await setDoc(doc(db, CLIENT, clientId, 'coachNotes', id), note);
}

/** Sends an announcement note to every client in the list. */
export async function broadcastAnnouncement(clientIds: string[], body: string, author: Author): Promise<void> {
  await Promise.all(clientIds.map((id) => addCoachNote(id, body, author, 'announcement')));
}

// ---- assigned plans --------------------------------------------------------

export async function listAssignedPlans(clientId: string, kind: PlanKind): Promise<AssignedPlan[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, CLIENT, clientId, planCollection(kind)), orderBy('assignedAt', 'desc')));
  return snap.docs.map((d) => d.data() as AssignedPlan);
}

export async function assignPlan(
  clientId: string,
  data: { kind: PlanKind; title: string; description: string; assignedBy: string },
): Promise<void> {
  const { db } = ensureFirebase();
  const id = uid('plan');
  const now = Date.now();
  const plan: AssignedPlan = {
    id,
    clientId,
    kind: data.kind,
    title: data.title,
    description: data.description,
    assignedBy: data.assignedBy,
    assignedAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, CLIENT, clientId, planCollection(data.kind), id), plan);
}

export async function deleteAssignedPlan(clientId: string, kind: PlanKind, id: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, CLIENT, clientId, planCollection(kind), id));
}

// ---- templates -------------------------------------------------------------

export async function listTemplates(coachId: string): Promise<PlanTemplate[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, TEMPLATES), where('coachId', '==', coachId)));
  return snap.docs.map((d) => d.data() as PlanTemplate);
}

export async function createTemplate(
  coachId: string,
  data: { kind: PlanKind; title: string; description: string },
): Promise<void> {
  const { db } = ensureFirebase();
  const id = uid('tpl');
  const now = Date.now();
  const tpl: PlanTemplate = { id, coachId, kind: data.kind, title: data.title, description: data.description, createdAt: now, updatedAt: now };
  await setDoc(doc(db, TEMPLATES, id), tpl);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, TEMPLATES, id));
}

/** Copies a template onto a client as an assigned plan. */
export async function assignTemplate(template: PlanTemplate, clientId: string, assignedBy: string): Promise<void> {
  await assignPlan(clientId, { kind: template.kind, title: template.title, description: template.description, assignedBy });
}

// ---- coach targets ---------------------------------------------------------

export async function getCoachTargets(clientId: string): Promise<CoachTargets | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, CLIENT, clientId, 'coachTargets', 'current'));
  return snap.exists() ? (snap.data() as CoachTargets) : null;
}

export async function setCoachTargets(
  clientId: string,
  targets: Pick<CoachTargets, 'waterMl' | 'steps' | 'cardioMin' | 'calories' | 'protein'>,
  updatedBy: string,
): Promise<void> {
  const { db } = ensureFirebase();
  const clean: CoachTargets = {
    id: 'current',
    clientId,
    updatedBy,
    updatedAt: Date.now(),
  };
  // Drop undefined so Firestore (and the type) stay clean.
  for (const k of ['waterMl', 'steps', 'cardioMin', 'calories', 'protein'] as const) {
    if (typeof targets[k] === 'number' && !Number.isNaN(targets[k])) clean[k] = targets[k];
  }
  await setDoc(doc(db, CLIENT, clientId, 'coachTargets', 'current'), clean);
}
