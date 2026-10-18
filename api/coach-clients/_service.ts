import crypto from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { getDb, withDbTransaction } from '../_lib/mongodb.js';
import { TRPCError } from '@trpc/server';
import type { UserDoc } from '../_lib/types.js';
import { addMonths, capError, buildSubscription, coachClientsCol, relId, releaseClientSlot, reserveClientSlot } from './_data.js';
import { CommercialReason } from '../_lib/commercialReason.js';
import { SUBSCRIPTION_RULE_MESSAGES, applyExtend, applyFreeze, applyUnfreeze, isBackdatedRenewal, snapshotOf, type SubscriptionRuleReason } from './_subscriptionRules.js';
import type {
  ClientSubscriptionInput,
  CoachClientDoc,
  PreviousStintDoc,
  SubscriptionDoc,
  SubscriptionEventDoc,
  SubscriptionPeriodDoc,
  SubscriptionStatus,
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

/** A term without its coach's commercial details (B3.4: what a kept subscription carries to another coach). */
function termOnly(sub: SubscriptionDoc): SubscriptionDoc {
  const { price: _p, currency: _c, planName: _n, billingCycle: _b, note: _note, ...term } = sub;
  return term;
}

/**
 * B3.4 / B3-S13: (re)activates the `coachId__clientId` relationship document. A first stint is
 * a plain insert. A returning client's ENDED document is replaced by a clean active one, with
 * the whole previous stint (dates, end reason, mode, term, archived terms, audit trail, invite
 * code) moved into `previousStints` — nothing from an earlier stint survives on the active
 * document, and nothing is lost. Compare-and-set on "not active", so two racing activations
 * can never both win (the loser gets a duplicate-key error and the caller rolls back).
 */
async function activateRelationship(fresh: CoachClientDoc, now: number, session?: ClientSession): Promise<CoachClientDoc> {
  const col = await coachClientsCol();
  const prev = await col.findOne({ _id: fresh._id }, { session });
  if (prev?.status === 'active') throw new TRPCError({ code: 'CONFLICT', message: 'Relationship already exists' });
  let next: CoachClientDoc = fresh;
  if (prev) {
    const { _id, coachId: _c, clientId: _cl, previousStints, ...stint } = prev;
    next = { ...fresh, previousStints: [...(previousStints ?? []), { ...stint, archivedAt: now } as PreviousStintDoc] };
  }
  await col.replaceOne({ _id: fresh._id, status: { $ne: 'active' } }, next, { upsert: true, session });
  return next;
}

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

/**
 * Who is changing the subscription (B3.0.1). `requireActive`: the owning
 * coach may only change a relationship that is still active (B3-S05); an
 * admin with `clients.writeAll` may correct an ended one (owner R-2), which
 * the router audits.
 */
export interface SubscriptionChangeOptions {
  actorRole: 'coach' | 'admin';
  requireActive: boolean;
}

export interface SubscriptionChangeResult {
  doc: CoachClientDoc;
  before: SubscriptionDoc | null;
  event: SubscriptionEventDoc;
}

/** Keep the audit trail bounded (newest last). */
const MAX_SUBSCRIPTION_EVENTS = 200;

function ruleError(reason: SubscriptionRuleReason): TRPCError {
  return new TRPCError({ code: 'CONFLICT', message: SUBSCRIPTION_RULE_MESSAGES[reason], cause: new CommercialReason(reason) });
}

export async function updateSubscription(
  coachId: string,
  clientId: string,
  action: SubscriptionAction,
  opts: SubscriptionChangeOptions = { actorRole: 'coach', requireActive: true },
): Promise<SubscriptionChangeResult> {
  const col = await coachClientsCol();
  const id = relId(coachId, clientId);
  const existing = await col.findOne({ _id: id });
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relationship not found' });
  // B3-S05: a former coach can no longer change the record of a client who left.
  if (opts.requireActive && existing.status !== 'active') {
    throw new TRPCError({ code: 'CONFLICT', message: 'This client is no longer yours', cause: new CommercialReason('RELATIONSHIP_ENDED') });
  }
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
        // A renewal starts unfrozen; a scheduled freeze ends with the old term (S07 §0.6).
        freezeCredit: null,
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
    case 'freeze': {
      // B3-S07 (F-C): scheduled, compensated, finite, inside the term.
      const r = applyFreeze(existing.subscription, action.from, action.until, action.note, now);
      if (!r.ok) throw ruleError(r.reason);
      next = r.next;
      break;
    }
    case 'unfreeze': {
      const r = applyUnfreeze(existing.subscription, now);
      if (!r.ok) throw ruleError(r.reason);
      next = r.next;
      break;
    }
    case 'end':
      next = { ...cur, status: 'ended', endAt: now, updatedAt: now };
      break;
    case 'cancel':
      next = { ...cur, status: 'cancelled', cancelledAt: now, updatedAt: now };
      break;
    case 'extend': {
      // B3-S07 (E2): max(now, end) + days; terminal terms need a renewal.
      const r = applyExtend(existing.subscription, action.days, now);
      if (!r.ok) throw ruleError(r.reason);
      next = r.next;
      break;
    }
  }

  // B0 / CO-15: a term change (renewal / new term) ARCHIVES the outgoing term
  // instead of overwriting it, so the coach's billing history and revenue keep
  // every previous term. Price edits, freezes and extensions change the
  // current term and are not archived. Atomic with the update itself.
  const archive = action.op === 'setTerm' && existing.subscription ? archivedTerm(existing.subscription, now) : null;
  // B3.0.1: every change leaves an auditable event in the same write.
  const event: SubscriptionEventDoc = {
    at: now,
    op: action.op,
    actorRole: opts.actorRole,
    before: existing.subscription ? snapshotOf(existing.subscription) : null,
    after: snapshotOf(next),
    ...(action.op === 'setTerm' && isBackdatedRenewal(existing.subscription, action.startAt, now) ? { backdated: true as const } : {}),
  };
  // Compare-and-set on the term we read: two concurrent changes (e.g. a freeze
  // and an extension) must not both apply their date arithmetic to the same
  // stale copy.
  const filter = existing.subscription ? { _id: id, 'subscription.updatedAt': existing.subscription.updatedAt } : { _id: id, subscription: { $exists: false } };
  const written = await col.updateOne(filter, {
    $set: { subscription: next, updatedAt: now },
    $push: {
      ...(archive ? { subscriptionHistory: archive } : {}),
      subscriptionEvents: { $each: [event], $slice: -MAX_SUBSCRIPTION_EVENTS },
    },
  });
  if (written.matchedCount === 0) {
    throw new TRPCError({ code: 'CONFLICT', message: 'The subscription changed meanwhile — reload and try again', cause: new CommercialReason('SUBSCRIPTION_CHANGED') });
  }
  return {
    doc: {
      ...existing,
      subscription: next,
      ...(archive ? { subscriptionHistory: [...(existing.subscriptionHistory ?? []), archive] } : {}),
      subscriptionEvents: [...(existing.subscriptionEvents ?? []), event].slice(-MAX_SUBSCRIPTION_EVENTS),
      updatedAt: now,
    },
    before: existing.subscription ?? null,
    event,
  };
}

/** The outgoing term as a history entry, with the state it ended in. */
function archivedTerm(cur: SubscriptionDoc, now: number): SubscriptionPeriodDoc {
  const lapsed = cur.endAt <= now;
  const status: SubscriptionStatus =
    cur.status === 'active' || cur.status === 'trial' || cur.status === 'frozen' ? (lapsed ? 'expired' : 'ended') : cur.status;
  return {
    startAt: cur.startAt,
    endAt: Math.min(cur.endAt, Math.max(now, cur.startAt)),
    ...(cur.months != null ? { months: cur.months } : {}),
    ...(cur.price != null ? { price: cur.price } : {}),
    ...(cur.currency ? { currency: cur.currency } : {}),
    status,
    endedAt: now,
  };
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
  if (!client) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
  if (client.role !== 'client') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Target user is not a client' });
  if (client.assignedCoachId) throw new TRPCError({ code: 'CONFLICT', message: 'Client already has an assigned coach' });

  const col = await coachClientsCol();
  const id = relId(coachId, clientId);
  const existing = await col.findOne({ _id: id });
  if (existing && existing.status === 'active') throw new TRPCError({ code: 'CONFLICT', message: 'Relationship already exists' });

  // Atomic cap gate — reserve the slot BEFORE the relationship exists, give it
  // back if anything after this point fails (see `reserveClientSlot`).
  const cap = await reserveClientSlot(coachId);
  if (cap !== 'ok') throw capError(cap);

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
  let saved: CoachClientDoc;
  try {
    // B3-S13: a returning client starts a clean stint; the previous one is archived, not merged.
    saved = await activateRelationship(rel, now);
    await users.updateOne({ _id: clientId }, { $set: { assignedCoachId: coachId, updatedAt: now } });
  } catch (e) {
    await releaseClientSlot(coachId).catch((err) => console.warn('[coach-clients] slot release after failed assign failed:', err));
    throw e;
  }
  return saved;
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
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relationship not found' });
  if (existing.status !== 'active') throw new TRPCError({ code: 'CONFLICT', message: 'Relationship is not active' });

  const now = Date.now();
  await col.updateOne({ _id: id }, { $set: { status: 'ended', endedAt: now, endedBy, endReason, updatedAt: now } });
  const db = await getDb();
  const users = db.collection<UserDoc>('users');
  await users.updateOne({ _id: clientId }, { $set: { updatedAt: now }, $unset: { assignedCoachId: '' } });
  // Best-effort, same as before: the relationship IS ended at this point; a
  // counter miss is repairable (scripts/reconcile-active-client-counts.mjs).
  await releaseClientSlot(coachId).catch((e) => console.warn('[coach-clients] slot release failed (non-fatal):', e));

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
 * Called from `transferClientWithMode` BEFORE the client is reassigned, inside
 * the SAME Mongo transaction (`session` is threaded through every read and
 * write here — a write made without it would commit immediately, outside the
 * transaction, and survive an abort). So a `fresh_start` transfer archives,
 * clears and reassigns all-or-nothing: a failure anywhere leaves the
 * previous coach's plans/notes/targets exactly as they were.
 */
async function archiveAndClearCoachOwnedData(clientId: string, previousCoachId: string, now: number, session: ClientSession): Promise<void> {
  // Sequential on purpose: one ClientSession must not run operations concurrently.
  const workoutPlan = await (await clientWorkoutPlansCol()).findOne({ _id: clientId }, { session });
  const nutritionPlan = await (await clientNutritionPlansCol()).findOne({ _id: clientId }, { session });
  const cardioPlan = await (await clientCardioPlansCol()).findOne({ _id: clientId }, { session });
  const targets = await (await coachTargetsCol()).findOne({ _id: clientId }, { session });
  const notes = await (await coachNotesCol()).find({ clientId }, { session }).toArray();

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
    await (await archivedClientDataCol()).insertMany(entries, { session });
  }

  // Sequential (not Promise.all): a ClientSession must not be used by
  // several operations concurrently.
  await (await clientWorkoutPlansCol()).deleteOne({ _id: clientId }, { session });
  await (await clientNutritionPlansCol()).deleteOne({ _id: clientId }, { session });
  await (await clientCardioPlansCol()).deleteOne({ _id: clientId }, { session });
  await (await coachTargetsCol()).deleteOne({ _id: clientId }, { session });
  await (await coachNotesCol()).deleteMany({ clientId }, { session });
}

/**
 * Admin/super-admin transfer with an explicit mode + subscription handling.
 * Port of `transferClientWithMode()`: ends the old relationship (transfer
 * metadata), archives + clears the previous coach's plan/notes/targets content
 * when `mode === 'fresh_start'` (see `archiveAndClearCoachOwnedData` above),
 * resolves the new subscription per `subscriptionHandling`, and opens the new
 * relationship.
 *
 * ATOMIC: every write below — destination slot reservation, ending the old
 * relationship, the fresh-start archive+clear, the new relationship, the
 * client's `assignedCoachId`, the source coach's slot release — runs in ONE
 * Mongo transaction. A failure at any step (including the cap gate) aborts
 * the whole thing: the old relationship stays active, no archive rows exist,
 * both counters are untouched, and the client is still assigned to the
 * previous coach. Nothing here is "best-effort" any more.
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

  return withDbTransaction(async (session) => {
    const col = await coachClientsCol();
    const fromRel = fromCoachId ? await col.findOne({ _id: relId(fromCoachId, clientId) }, { session }) : null;
    // A named "from" coach must really be this client's current coach — never
    // end a phantom relationship and hand the client to `toCoachId` on the say-so
    // of the request alone (the routers check this too; this is the last line).
    if (fromCoachId && (!fromRel || fromRel.status !== 'active')) {
      throw new TRPCError({ code: 'CONFLICT', message: 'That coach does not currently coach this client' });
    }

    // Atomic cap gate on the destination (see `reserveClientSlot`). Inside the
    // transaction, so an abort further down hands the slot back automatically.
    if (movingCoaches || !fromCoachId) {
      const cap = await reserveClientSlot(toCoachId, session);
      if (cap !== 'ok') {
        throw capError(cap, 'Destination coach: ');
      }
    }

    if (movingCoaches) {
      await col.updateOne(
        { _id: relId(fromCoachId!, clientId) },
        { $set: { status: 'ended', endedAt: now, endedBy: by, endReason: 'transferred', mode, updatedAt: now } },
        { session },
      );
    }

    // Fresh start: archive + clear the PREVIOUS coach's plan/notes/targets
    // content before the reassignment below, so the new coach starts clean.
    // Only meaningful when there actually was a previous coach.
    if (mode === 'fresh_start' && fromCoachId) {
      await archiveAndClearCoachOwnedData(clientId, fromCoachId, now, session);
    }

    let subscription: SubscriptionDoc | undefined;
    if (subscriptionHandling === 'keep') {
      // "Keep" keeps the client's TERM exactly (dates, months, status, freeze). B3.4 owner review: the previous
      // coach's commercial details — price, currency, package name, billing cycle, their note — stay theirs and
      // are not copied to another coach; the new coach sets their own price. (Same coach: unchanged.)
      subscription = fromRel?.subscription && movingCoaches ? termOnly(fromRel.subscription) : fromRel?.subscription;
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
    let saved: CoachClientDoc = rel;
    if (movingCoaches || !fromCoachId) {
      // B3-S13: the destination stint starts clean; an earlier stint with this coach is archived.
      saved = await activateRelationship(rel, now, session);
    } else {
      // Same coach (the relationship stays active): unchanged behaviour.
      await col.updateOne({ _id: id }, { $set: rel }, { upsert: true, session });
    }

    const db = await getDb();
    const users = db.collection<UserDoc>('users');
    await users.updateOne({ _id: clientId }, { $set: { assignedCoachId: toCoachId, updatedAt: now } }, { session });

    if (movingCoaches) await releaseClientSlot(fromCoachId!, session);

    return saved;
  });
}
