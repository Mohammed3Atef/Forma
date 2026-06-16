import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { uid } from '@/lib/utils';
import type { CardioPlan, MealPlan, PlanVersion, PlanVersionKind, WorkoutPlan } from '@/types';

/**
 * Plan version history at `clientData/{clientId}/planVersions/{versionId}` — a
 * flat subcollection keyed by `kind`. The assigned `plan/{kind}` doc always
 * mirrors the `active` version's snapshot (that's what the client reads), so
 * "save as version" and "restore" both rewrite it. Coach-owned (the rules treat
 * `planVersions` as a coach-owned collection); the client only reads.
 */

const CLIENT = 'clientData';
type AnyPlan = WorkoutPlan | MealPlan | CardioPlan;

/** Deep, structural clone (drops `undefined` keys — Firestore rejects them). */
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export async function listVersions(clientId: string, kind: PlanVersionKind): Promise<PlanVersion[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, CLIENT, clientId, 'planVersions'), where('kind', '==', kind)));
  return snap.docs.map((d) => d.data() as PlanVersion).sort((a, b) => b.versionNumber - a.versionNumber);
}

/** Write the active plan the client reads (`plan/{workout|nutrition|cardio}`). */
async function writeActivePlan(clientId: string, kind: PlanVersionKind, snapshot: AnyPlan): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, CLIENT, clientId, 'plan', kind), { ...snapshot, updatedAt: Date.now() });
}

/**
 * Snapshot the current plan as a new active version (deactivating the previous
 * active one) and mirror it into the assigned `plan/{kind}` doc.
 */
export async function saveAsNewVersion(
  clientId: string,
  kind: PlanVersionKind,
  plan: AnyPlan,
  createdBy: string,
  reason?: string,
): Promise<PlanVersion> {
  const { db } = ensureFirebase();
  const existing = await listVersions(clientId, kind);
  const versionNumber = (existing[0]?.versionNumber ?? 0) + 1;
  const now = Date.now();
  const version: PlanVersion = {
    id: uid('ver'),
    kind,
    versionNumber,
    name: plan.name || `${kind} v${versionNumber}`,
    createdAt: now,
    createdBy,
    snapshot: clone(plan),
    active: true,
  };
  if (reason?.trim()) version.reason = reason.trim();

  const batch = writeBatch(db);
  existing
    .filter((v) => v.active)
    .forEach((v) => batch.update(doc(db, CLIENT, clientId, 'planVersions', v.id), { active: false }));
  batch.set(doc(db, CLIENT, clientId, 'planVersions', version.id), version);
  await batch.commit();

  await writeActivePlan(clientId, kind, version.snapshot);
  return version;
}

/** Make an older version active again and restore it into the assigned plan. */
export async function restoreVersion(clientId: string, version: PlanVersion): Promise<void> {
  const { db } = ensureFirebase();
  const all = await listVersions(clientId, version.kind);
  const batch = writeBatch(db);
  all.forEach((v) => batch.update(doc(db, CLIENT, clientId, 'planVersions', v.id), { active: v.id === version.id }));
  await batch.commit();
  await writeActivePlan(clientId, version.kind, version.snapshot);
}
