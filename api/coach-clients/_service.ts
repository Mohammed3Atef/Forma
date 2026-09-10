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
 * Admin/super-admin transfer with an explicit mode + subscription handling.
 * Port of `transferClientWithMode()`: ends the old relationship (transfer
 * metadata), resolves the new subscription per `subscriptionHandling`, and
 * opens the new relationship.
 *
 * KNOWN GAP vs. the Firestore-era version: `mode === 'fresh_start'` there also
 * archives + clears the previous coach's `clientData` content (plans/notes/
 * targets/check-ins) via `archiveAndClearCoachData()`. That step is NOT ported
 * here — `clientData`/`planVersions` are out of this module's scope (only
 * `api/invites`, `api/coach-clients`, `api/transfers` may be touched) and have
 * no Mongo collection yet in this migration. The reassignment and subscription
 * handling below are still applied faithfully; content-clearing must be wired
 * in once `clientData` is ported.
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
