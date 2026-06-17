import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { notify } from './notificationsApi';
import type { WeeklyCheckIn } from '@/types';

const CLIENT = 'clientData';
const COLL = 'checkIns';

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

const ref = (clientId: string, id: string) => {
  const { db } = ensureFirebase();
  return doc(db, CLIENT, clientId, COLL, id);
};

export async function getCheckIn(clientId: string, id: string): Promise<WeeklyCheckIn | null> {
  const snap = await getDoc(ref(clientId, id));
  return snap.exists() ? (snap.data() as WeeklyCheckIn) : null;
}

/** All of a client's check-ins, newest week first. */
export async function listCheckIns(clientId: string): Promise<WeeklyCheckIn[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, CLIENT, clientId, COLL), orderBy('weekStart', 'desc')));
  return snap.docs.map((d) => d.data() as WeeklyCheckIn);
}

/** The most recent check-in (the Home card watches for status === 'requested'). */
export async function getActiveCheckIn(clientId: string): Promise<WeeklyCheckIn | null> {
  const list = await listCheckIns(clientId);
  return list[0] ?? null;
}

/**
 * Coach requests a check-in for a week (idempotent: one doc per week, keyed by
 * weekStart — won't clobber an already-requested/submitted/reviewed week).
 */
export async function requestCheckIn(coachId: string, clientId: string, weekStart: string, weekEnd: string): Promise<void> {
  const existing = await getCheckIn(clientId, weekStart);
  if (existing) return; // week already has a check-in
  const now = Date.now();
  const checkIn: WeeklyCheckIn = {
    id: weekStart,
    clientId,
    coachId,
    weekStart,
    weekEnd,
    status: 'requested',
    progressPhotos: {},
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref(clientId, weekStart), checkIn);
  await notify({
    clientId,
    forRole: 'client',
    type: 'checkin_requested',
    entityType: 'checkin',
    entityId: weekStart,
    route: `/check-in/${weekStart}`,
    createdBy: coachId,
  });
}

/** Client submits their check-in (once, while status is still 'requested'). */
export async function submitCheckIn(clientId: string, id: string, data: CheckInSubmission): Promise<void> {
  const now = Date.now();
  const patch: Record<string, unknown> = { status: 'submitted', submittedAt: now, updatedAt: now };
  for (const k of ['currentWeight', 'adherenceTraining', 'adherenceNutrition', 'hungerLevel', 'energyLevel', 'sleepQuality', 'notes'] as const) {
    const v = data[k];
    if (v != null && v !== '') patch[k] = v;
  }
  // Only persist photo poses that were actually uploaded.
  const photos: Record<string, string> = {};
  for (const pose of ['front', 'side', 'back'] as const) {
    const url = data.progressPhotos?.[pose];
    if (url) photos[pose] = url;
  }
  patch.progressPhotos = photos;
  await setDoc(ref(clientId, id), patch, { merge: true });
  await notify({
    clientId,
    forRole: 'coach',
    type: 'checkin_submitted',
    entityType: 'checkin',
    entityId: id,
    route: `/coach/client/${clientId}/checkins`,
    createdBy: clientId,
  });
}

/** Coach reviews a submitted check-in with feedback. */
export async function reviewCheckIn(clientId: string, id: string, coachId: string, feedback: string): Promise<void> {
  const now = Date.now();
  await setDoc(ref(clientId, id), { status: 'reviewed', reviewedAt: now, coachFeedback: feedback.trim(), updatedAt: now }, { merge: true });
  await notify({
    clientId,
    forRole: 'client',
    type: 'checkin_reviewed',
    body: feedback.trim().slice(0, 140),
    entityType: 'checkin',
    entityId: id,
    route: `/check-in/${id}`,
    createdBy: coachId,
  });
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
