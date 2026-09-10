import crypto from 'node:crypto';
import { getDb } from '../_lib/mongodb.js';
import { HttpError } from '../_lib/http.js';
import type { UserDoc } from '../_lib/types.js';
import { addMonths, bumpActiveClientCount, buildSubscription, coachAtClientCap, coachClientsCol, relId } from './_data.js';
import type {
  ClientSubscriptionInput,
  CoachClientDoc,
  SubscriptionDoc,
  TransferMode,
  TransferSubHandling,
} from './_types.js';
import {
  archivedClientDataCol,
  clientCardioPlansCol,
  clientNutritionPlansCol,
  clientWorkoutPlansCol,
  coachNotesCol,
  coachTargetsCol,
} from '../client/_lib/db.js';
import type { ArchivedClientDataDoc, ArchivedClientDataKind } from '../client/_lib/types.js';

const SUB_DAY = 86_400_000;

/**
 * In-place mutations of an EXISTING relationship's subscription — the piece
 * the original migration pass left unported (see the frontend
 * `coachClientsApi.ts` gap it called out). Ports `setSubscriptionTerm` /
 * `setSubscriptionPrice` / `freezeSubscription` / `unfreezeSubscription` /
 * `endSubscription` / `cancelSubscription` / `extendSubscription` from that
 * same Firestore-era file, one discriminated action at a time.
 */
export type SubscriptionAction =
  | { op: 'setTerm'; startAt: number; months?: number; days?: number; price?: number; currency?: string; planName?: string }
  | { op: 'setPrice'; price: number; currency?: string }
  | { op: 'freeze'; from: number; until: number; note?: string }
  | { op: 'unfreeze' }
  | { op: 'end' }
  | { op: 'cancel' }
  | { op: 'extend'; days: number };

export async function updateSubscription(coachId: string, clientId: string, action: SubscriptionAction): Promise<CoachClientDoc> {
  const col = await coachClientsCol();
  const id = relId(coachId, clientId);
  const existing = await col.findOne({ _id: id });
  if (!existing) throw new HttpError(404, 'Relationship not found');
  const now = Date.now();
  const cur: SubscriptionDoc = existing.subscription ?? { startAt: now, endAt: now, status: 'pending', frozenFrom: null, frozenUntil: null, updatedAt: now };

  let next: SubscriptionDoc;
  switch (action.op) {
    case 'setTerm': {
      const start = action.startAt;
      const base: SubscriptionDoc = {
        ...cur,
        startAt: start,
        status: 'active',
        frozenFrom: null,
        frozenUntil: null,
        updatedAt: now,
        ...(typeof action.price === 'number' ? { price: action.price } : {}),
        ...(action.currency ? { currency: action.currency } : {}),
        ...(action.planName ? { planName: action.planName } : {}),
      };
      if (typeof action.days === 'number' && action.days > 0) {
        next = { ...base, endAt: start + action.days * SUB_DAY, months: undefined };
      } else {
        const months = action.months ?? 1;
        next = { ...base, months, endAt: addMonths(start, months) };
      }
      break;
    }
    case 'setPrice':
      next = { ...cur, price: action.price, ...(action.currency ? { currency: action.currency } : {}), updatedAt: now };
      break;
    case 'freeze':
      next = { ...cur, status: 'frozen', frozenFrom: action.from, frozenUntil: action.until, ...(action.note ? { note: action.note } : {}), updatedAt: now };
      break;
    case 'unfreeze':
      next = { ...cur, status: 'active', frozenFrom: null, frozenUntil: null, updatedAt: now };
      break;
    case 'end':
      next = { ...cur, status: 'ended', endAt: now, updatedAt: now };
      break;
    case 'cancel':
      next = { ...cur, status: 'cancelled', cancelledAt: now, updatedAt: now };
      break;
    case 'extend':
      next = { ...cur, endAt: cur.endAt + action.days * SUB_DAY, updatedAt: now };
      break;
  }

  await col.updateOne({ _id: id }, { $set: { subscription: next, updatedAt: now } });
  return { ...existing, subscription: next, updatedAt: now };
}

/**
 * Business logic shared across `api/coach-clients/*` and `api/transfers/*`
 * (the transfer-request approval flow performs the actual reassignment through
 * `transferClientWithMode` below, exactly like `transferApi.ts`'s comment says
 * the Firestore version does through `coachClientsApi.ts`).
 */

export async function getRelationship(coachId: string, clientId: string): Promise<CoachClientDoc | null> {
  const col = await coachClientsCol();
  return col.findOne({ _id: relId(coachId, clientId) });
}

/**
 * CASE 1 — a coach (or an admin with `coaches.assign`) assigns an UNASSIGNED
 * existing client to a coach, with a required subscription. Port of
 * `assignExistingClient()`. Never creates a user — the client account must
 * already exist and be unassigned.
 */
export async function assignExistingClient(
  coachId: string,
  clientId: string,
  createdBy: string,
  sub: ClientSubscriptionInput,
): Promise<CoachClientDoc> {
  const db = await getDb();
  const users = db.collection<UserDoc>('users');
  const client = await users.findOne({ _id: clientId });
  if (!client) throw new HttpError(404, 'Client not found');
  if (client.role !== 'client') throw new HttpError(400, 'Target user is not a client');
  if (client.assignedCoachId) throw new HttpError(409, 'Client already has an assigned coach');
  if (await coachAtClientCap(coachId)) throw new HttpError(409, 'Coach is at their client limit');

  const col = await coachClientsCol();
  const id = relId(coachId, clientId);
  const existing = await col.findOne({ _id: id });
  if (existing && existing.status === 'active') throw new HttpError(409, 'Relationship already exists');

  const now = Date.now();
  const subscription = buildSubscription(sub, now);
  const rel: CoachClientDoc = {
    _id: id,
    coachId,
    clientId,
    status: 'active',
    subscription,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await col.updateOne({ _id: id }, { $set: rel }, { upsert: true });
  await users.updateOne({ _id: clientId }, { $set: { assignedCoachId: coachId, updatedAt: now } });
  await bumpActiveClientCount(coachId, 1);
  return rel;
}

/**
 * Ends an active relationship (coach releases their own client, or an admin
 * unassigns one). Port of `releaseClient()` / `unassignClient()` — the Forma
 * account and all client-owned data stay intact; the client becomes
 * re-assignable. No Auth user is ever deleted.
 */
export async function endRelationship(
  coachId: string,
  clientId: string,
  endedBy: string,
  endReason: 'released' | 'unassigned',
): Promise<CoachClientDoc> {
  const col = await coachClientsCol();
  const id = relId(coachId, clientId);
  const existing = await col.findOne({ _id: id });
  if (!existing) throw new HttpError(404, 'Relationship not found');
  if (existing.status !== 'active') throw new HttpError(409, 'Relationship is not active');

  const now = Date.now();
  await col.updateOne({ _id: id }, { $set: { status: 'ended', endedAt: now, endedBy, endReason, updatedAt: now } });
  const db = await getDb();
  const users = db.collection<UserDoc>('users');
  await users.updateOne({ _id: clientId }, { $set: { updatedAt: now }, $unset: { assignedCoachId: '' } });
  await bumpActiveClientCount(coachId, -1);

  return { ...existing, status: 'ended', endedAt: now, endedBy, endReason, updatedAt: now };
}

/**
 * Fresh-start transfer support: archives the client's current coach-owned
 * content (workout/nutrition/cardio plan singletons, coach notes, coach-set
 * targets) into `archivedClientData` — one doc per item, tagged with the
 * PREVIOUS coach id, the client id, and an archive timestamp — then deletes
 * the live docs so the new coach genuinely starts the client fresh (a GET on
 * any of those routes behaves exactly like a brand-new client: `null`/empty).
 *
 * Called from `transferClientWithMode` BEFORE the client is reassigned, so a
 * `fresh_start` transfer archives+clears and reassigns as one server-side
 * operation — never a second client-triggered call (this codebase doesn't use
 * Mongo multi-document transactions anywhere, so "atomic" here means "one
 * request, sequential awaited writes," consistent with every other multi-step
 * mutation in this file).
 */
async function archiveAndClearCoachOwnedData(clientId: string, previousCoachId: string, now: number): Promise<void> {
  const [workoutPlan, nutritionPlan, cardioPlan, targets, notes] = await Promise.all([
    (await clientWorkoutPlansCol()).findOne({ _id: clientId }),
    (await clientNutritionPlansCol()).findOne({ _id: clientId }),
    (await clientCardioPlansCol()).findOne({ _id: clientId }),
    (await coachTargetsCol()).findOne({ _id: clientId }),
    (await coachNotesCol()).find({ clientId }).toArray(),
  ]);

  const entries: ArchivedClientDataDoc[] = [];
  // Generic over `T` (rather than typing `doc` as `Record<string, unknown>`
  // directly) so this compiles for every source doc shape here, including the
  // ones declared as plain `interface`s with no index signature (CoachTargetsDoc,
  // CoachNoteDoc) — only the `_id: string` constraint is actually required.
  function archiveOne<T extends { _id: string }>(kind: ArchivedClientDataKind, doc: T): void {
    const { _id: sourceId, ...rest } = doc;
    entries.push({
      _id: crypto.randomUUID(),
      clientId,
      previousCoachId,
      kind,
      sourceId,
      archivedAt: now,
      data: rest as unknown as Record<string, unknown>,
    });
  }

  if (workoutPlan) archiveOne('workoutPlan', workoutPlan);
  if (nutritionPlan) archiveOne('nutritionPlan', nutritionPlan);
  if (cardioPlan) archiveOne('cardioPlan', cardioPlan);
  if (targets) archiveOne('coachTargets', targets);
  for (const note of notes) archiveOne('coachNote', note);

  if (entries.length) {
    await (await archivedClientDataCol()).insertMany(entries);
  }

  await Promise.all([
    (await clientWorkoutPlansCol()).deleteOne({ _id: clientId }),
    (await clientNutritionPlansCol()).deleteOne({ _id: clientId }),
    (await clientCardioPlansCol()).deleteOne({ _id: clientId }),
    (await coachTargetsCol()).deleteOne({ _id: clientId }),
    (await coachNotesCol()).deleteMany({ clientId }),
  ]);
}

/**
 * Admin/super-admin transfer with an explicit mode + subscription handling.
 * Port of `transferClientWithMode()`: ends the old relationship (transfer
 * metadata), archives + clears the previous coach's plan/notes/targets content
 * when `mode === 'fresh_start'` (see `archiveAndClearCoachOwnedData` above),
 * resolves the new subscription per `subscriptionHandling`, and opens the new
 * relationship.
 */
export async function transferClientWithMode(
  clientId: string,
  fromCoachId: string | undefined,
  toCoachId: string,
  mode: TransferMode,
  subscriptionHandling: TransferSubHandling,
  by: string,
  newSub?: ClientSubscriptionInput,
): Promise<CoachClientDoc> {
  const now = Date.now();
  const movingCoaches = !!fromCoachId && fromCoachId !== toCoachId;

  // Cap gate BEFORE any mutation — mirrors the enforcement `firestore.rules`
  // applied at the `coachClients` doc-create layer (via `coachAtClientCap`).
  if ((movingCoaches || !fromCoachId) && (await coachAtClientCap(toCoachId))) {
    throw new HttpError(409, 'Destination coach is at their client limit');
  }

  const col = await coachClientsCol();
  const fromRel = fromCoachId ? await col.findOne({ _id: relId(fromCoachId, clientId) }) : null;

  if (movingCoaches) {
    await col
      .updateOne(
        { _id: relId(fromCoachId!, clientId) },
        { $set: { status: 'ended', endedAt: now, endedBy: by, endReason: 'transferred', mode, updatedAt: now } },
      )
      .catch(() => undefined);
  }

  // Fresh start: archive + clear the PREVIOUS coach's plan/notes/targets
  // content before the reassignment below, so the new coach starts clean.
  // Only meaningful when there actually was a previous coach.
  if (mode === 'fresh_start' && fromCoachId) {
    await archiveAndClearCoachOwnedData(clientId, fromCoachId, now);
  }

  let subscription: SubscriptionDoc | undefined;
  if (subscriptionHandling === 'keep') {
    subscription = fromRel?.subscription;
  } else if (subscriptionHandling === 'new') {
    subscription = buildSubscription(newSub ?? { status: mode === 'fresh_start' ? 'pending' : 'trial' }, now);
  } else {
    // 'expire' — same verbatim behavior as the Firestore-era function: a fresh
    // pending term, not an 'expired' one. Preserved as-is, not "fixed".
    subscription = { startAt: now, endAt: now, status: 'pending', frozenFrom: null, frozenUntil: null, updatedAt: now };
  }

  const id = relId(toCoachId, clientId);
  const rel: CoachClientDoc = {
    _id: id,
    coachId: toCoachId,
    clientId,
    status: 'active',
    createdBy: by,
    createdAt: now,
    updatedAt: now,
    ...(subscription ? { subscription } : {}),
  };
  await col.updateOne({ _id: id }, { $set: rel }, { upsert: true });

  const db = await getDb();
  const users = db.collection<UserDoc>('users');
  await users.updateOne({ _id: clientId }, { $set: { assignedCoachId: toCoachId, updatedAt: now } });

  if (movingCoaches) await bumpActiveClientCount(fromCoachId!, -1);
  if (fromCoachId !== toCoachId) await bumpActiveClientCount(toCoachId, 1);

  return rel;
}
