import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { addMonths } from '@/lib/subscription';
import { writeAudit } from './auditApi';
import { notify } from './notificationsApi';
import { bumpActiveClientCount } from './coachPlanApi';
import { getClientCardioPlan, getClientMealPlan, getClientWorkoutPlan } from './planApi';
import { saveAsNewVersion } from './planVersionsApi';
import type {
  BillingCycle,
  CoachClientRelationship,
  Subscription,
  SubscriptionPeriod,
  SubscriptionStatus,
  TransferMode,
  TransferSubHandling,
} from '@/types';

const REL = 'coachClients';
const USERS = 'users';
const CLIENT = 'clientData';

/** Deterministic relationship id so rules can `exists()` it without a query. */
export function relId(coachId: string, clientId: string): string {
  return `${coachId}__${clientId}`;
}

export async function listRelationshipsForCoach(coachId: string): Promise<CoachClientRelationship[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, REL), where('coachId', '==', coachId), where('status', '==', 'active')));
  return snap.docs.map((d) => d.data() as CoachClientRelationship);
}

/**
 * Writes ONLY the relationship doc (no users/{clientId} update) — used when a
 * coach creates their own client: the client's `assignedCoachId` is already set
 * at account creation, and a coach isn't allowed to update other user docs.
 */
export async function linkCoachClient(coachId: string, clientId: string, createdBy: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const id = relId(coachId, clientId);
  // Every linked client gets a subscription state (default 14-day trial).
  const subscription: Subscription = { startAt: now, endAt: now + 14 * 86_400_000, status: 'trial', updatedAt: now };
  const rel: CoachClientRelationship = { id, coachId, clientId, status: 'active', subscription, createdBy, createdAt: now, updatedAt: now };
  await setDoc(doc(db, REL, id), rel);
  await bumpActiveClientCount(coachId, 1);
}

/** Assigns a client to a coach (idempotent on the deterministic id). */
export async function assignClientToCoach(coachId: string, clientId: string, createdBy: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const id = relId(coachId, clientId);
  const rel: CoachClientRelationship = {
    id,
    coachId,
    clientId,
    status: 'active',
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, REL, id), rel);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: coachId, updatedAt: now });
  await bumpActiveClientCount(coachId, 1);
  await writeAudit({ action: 'coach.assign', targetUserId: clientId, metadata: { coachId } });
}

/** Moves a client from one coach to another (ends the old link, opens a new one). */
export async function transferClient(
  clientId: string,
  fromCoachId: string | undefined,
  toCoachId: string,
  createdBy: string,
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  if (fromCoachId && fromCoachId !== toCoachId) {
    await updateDoc(doc(db, REL, relId(fromCoachId, clientId)), {
      status: 'ended',
      endedAt: now,
      endedBy: createdBy,
      endReason: 'transferred',
      updatedAt: now,
    }).catch(() => undefined);
  }
  const id = relId(toCoachId, clientId);
  await setDoc(doc(db, REL, id), {
    id,
    coachId: toCoachId,
    clientId,
    status: 'active',
    createdBy,
    createdAt: now,
    updatedAt: now,
  } satisfies CoachClientRelationship);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: toCoachId, updatedAt: now });
  if (fromCoachId && fromCoachId !== toCoachId) await bumpActiveClientCount(fromCoachId, -1);
  if (fromCoachId !== toCoachId) await bumpActiveClientCount(toCoachId, 1);
  await writeAudit({ action: 'coach.transfer', targetUserId: clientId, metadata: { from: fromCoachId ?? null, to: toCoachId } });
}

/** Removes a client's coach assignment. */
export async function unassignClient(clientId: string, coachId: string, createdBy: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await updateDoc(doc(db, REL, relId(coachId, clientId)), {
    status: 'ended',
    endedAt: now,
    endedBy: createdBy,
    endReason: 'unassigned',
    updatedAt: now,
  }).catch(() => undefined);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: deleteField(), updatedAt: now });
  await bumpActiveClientCount(coachId, -1);
  await writeAudit({ action: 'coach.unassign', targetUserId: clientId, metadata: { coachId, createdBy } });
}

// ---- subscription (lives on the relationship; coach-owned, client-readable) ----

export async function getRelationship(coachId: string, clientId: string): Promise<CoachClientRelationship | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, REL, relId(coachId, clientId)));
  return snap.exists() ? (snap.data() as CoachClientRelationship) : null;
}

/** Snapshot a subscription into a history period (omitting undefined fields). */
function toPeriod(sub: Subscription, endedAt: number): SubscriptionPeriod {
  const p: SubscriptionPeriod = { startAt: sub.startAt, endAt: sub.endAt, status: 'ended', endedAt };
  if (typeof sub.months === 'number') p.months = sub.months;
  if (typeof sub.price === 'number') p.price = sub.price;
  if (sub.currency) p.currency = sub.currency;
  return p;
}

/**
 * Set (or reset) the subscription term: starts active, ends after `months`.
 * Optionally carries the price/currency. Starting a NEW term (different start
 * date) archives the prior term into `subscriptionHistory` so the history view
 * shows every period the client subscribed for; same-start edits update in place.
 */
export async function setSubscriptionTerm(
  coachId: string,
  clientId: string,
  startAt: number,
  months: number,
  price?: number,
  currency?: string,
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const rel = await getRelationship(coachId, clientId);
  const prev = rel?.subscription;
  // Preserve an existing price unless a new one is provided.
  const effPrice = typeof price === 'number' ? price : prev?.price;
  const effCurrency = currency ?? prev?.currency;
  const sub: Subscription = {
    startAt,
    endAt: addMonths(startAt, months),
    months,
    status: 'active',
    frozenFrom: null,
    frozenUntil: null,
    updatedAt: now,
    ...(typeof effPrice === 'number' ? { price: effPrice } : {}),
    ...(effCurrency ? { currency: effCurrency } : {}),
  };
  const history = [...(rel?.subscriptionHistory ?? [])];
  if (prev && prev.startAt !== startAt) history.push(toPeriod(prev, now));
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { subscription: sub, subscriptionHistory: history, updatedAt: now });
  await writeAudit({ action: 'sub.setTerm', targetUserId: clientId, metadata: { months, price: effPrice ?? null } });
  await notify({ clientId, forRole: 'client', type: 'subscription_updated', route: '/coach-notes', createdBy: coachId });
}

/** Set/update the subscription price in place (no new term, no history entry). */
export async function setSubscriptionPrice(coachId: string, clientId: string, price: number, currency?: string): Promise<void> {
  const { db } = ensureFirebase();
  const rel = await getRelationship(coachId, clientId);
  if (!rel?.subscription) throw new Error('No subscription to price');
  const now = Date.now();
  const next: Subscription = {
    ...rel.subscription,
    price,
    ...(currency ? { currency } : {}),
    updatedAt: now,
  };
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { subscription: next, updatedAt: now });
  await writeAudit({ action: 'sub.setPrice', targetUserId: clientId, metadata: { price, currency: currency ?? null } });
  await notify({ clientId, forRole: 'client', type: 'subscription_updated', route: '/coach-notes', createdBy: coachId });
}

/** Freeze the subscription for [from, until); extends the term by the frozen days. */
export async function freezeSubscription(coachId: string, clientId: string, from: number, until: number, note?: string): Promise<void> {
  const { db } = ensureFirebase();
  const rel = await getRelationship(coachId, clientId);
  if (!rel?.subscription) throw new Error('No subscription to freeze');
  const now = Date.now();
  const extendBy = Math.max(0, until - from);
  const next: Subscription = {
    ...rel.subscription,
    status: 'frozen',
    frozenFrom: from,
    frozenUntil: until,
    endAt: rel.subscription.endAt + extendBy,
    ...(note?.trim() ? { note: note.trim() } : {}),
    updatedAt: now,
  };
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { subscription: next, updatedAt: now });
  await writeAudit({ action: 'sub.freeze', targetUserId: clientId, metadata: { from, until } });
  await notify({ clientId, forRole: 'client', type: 'subscription_updated', route: '/coach-notes', createdBy: coachId });
}

/** Lift a freeze and resume the subscription. */
export async function unfreezeSubscription(coachId: string, clientId: string): Promise<void> {
  const { db } = ensureFirebase();
  const rel = await getRelationship(coachId, clientId);
  if (!rel?.subscription) return;
  const now = Date.now();
  const next: Subscription = { ...rel.subscription, status: 'active', frozenFrom: null, frozenUntil: null, updatedAt: now };
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { subscription: next, updatedAt: now });
  await writeAudit({ action: 'sub.unfreeze', targetUserId: clientId, metadata: {} });
  await notify({ clientId, forRole: 'client', type: 'subscription_updated', route: '/coach-notes', createdBy: coachId });
}

/** End the subscription now. */
export async function endSubscription(coachId: string, clientId: string): Promise<void> {
  const { db } = ensureFirebase();
  const rel = await getRelationship(coachId, clientId);
  const now = Date.now();
  const base: Subscription = rel?.subscription ?? { startAt: now, endAt: now, status: 'active', frozenFrom: null, frozenUntil: null, updatedAt: now };
  const next: Subscription = { ...base, status: 'ended', endAt: now, frozenFrom: null, frozenUntil: null, updatedAt: now };
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { subscription: next, updatedAt: now });
  await writeAudit({ action: 'sub.end', targetUserId: clientId, metadata: {} });
  await notify({ clientId, forRole: 'client', type: 'subscription_updated', route: '/coach-notes', createdBy: coachId });
}

const SUB_DAY = 86_400_000;

/** Cancel the subscription now (tracking only — no refund/payment). */
export async function cancelSubscription(coachId: string, clientId: string): Promise<void> {
  const { db } = ensureFirebase();
  const rel = await getRelationship(coachId, clientId);
  const now = Date.now();
  const base: Subscription = rel?.subscription ?? { startAt: now, endAt: now, status: 'active', frozenFrom: null, frozenUntil: null, updatedAt: now };
  const next: Subscription = { ...base, status: 'cancelled', cancelledAt: now, frozenFrom: null, frozenUntil: null, updatedAt: now };
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { subscription: next, updatedAt: now });
  await writeAudit({ action: 'sub.cancel', targetUserId: clientId, metadata: {} });
  await notify({ clientId, forRole: 'client', type: 'subscription_updated', route: '/coach-notes', createdBy: coachId });
}

/** Extend the term by N days (reactivates an expired/cancelled term). Tracking only. */
export async function extendSubscription(coachId: string, clientId: string, days: number): Promise<void> {
  const { db } = ensureFirebase();
  const rel = await getRelationship(coachId, clientId);
  const now = Date.now();
  const base: Subscription = rel?.subscription ?? { startAt: now, endAt: now, status: 'active', frozenFrom: null, frozenUntil: null, updatedAt: now };
  const from = Math.max(base.endAt, now);
  const status: SubscriptionStatus = base.status === 'trial' ? 'trial' : 'active';
  const next: Subscription = { ...base, status, endAt: from + days * SUB_DAY, cancelledAt: null, frozenFrom: null, frozenUntil: null, updatedAt: now };
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { subscription: next, updatedAt: now });
  await writeAudit({ action: 'sub.extend', targetUserId: clientId, metadata: { days } });
  await notify({ clientId, forRole: 'client', type: 'subscription_updated', route: '/coach-notes', createdBy: coachId });
}

// ---- existing-client lifecycle (assign / release / transfer / timeline) ------

/**
 * Subscription the coach picks when assigning an existing client (CASE 1) or an
 * admin creates a new term on transfer. Mirrors the invite chooser so a client is
 * NEVER assigned without an explicit subscription state.
 */
export interface ClientSubscriptionInput {
  status: SubscriptionStatus; // 'trial' | 'active' | 'pending' (others valid for transfer)
  months?: number; // active term length
  trialDays?: number; // trial length (default 14)
  price?: number;
  currency?: string;
  planName?: string;
  billingCycle?: BillingCycle;
  startAt?: number; // defaults to now
}

/** Build a concrete `Subscription` from the coach's chosen term (no undefined fields). */
function buildSubscription(input: ClientSubscriptionInput, now: number): Subscription {
  const start = input.startAt ?? now;
  const base: Subscription = {
    startAt: start,
    endAt: start,
    status: input.status,
    frozenFrom: null,
    frozenUntil: null,
    updatedAt: now,
    ...(typeof input.price === 'number' ? { price: input.price } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.planName ? { planName: input.planName } : {}),
    ...(input.billingCycle ? { billingCycle: input.billingCycle } : {}),
  };
  if (input.status === 'trial') return { ...base, endAt: start + (input.trialDays ?? 14) * SUB_DAY };
  if (input.status === 'active') {
    const months = input.months ?? 1;
    return { ...base, months, endAt: addMonths(start, months) };
  }
  return base; // pending / expired / cancelled / frozen / ended: no term math
}

/**
 * The client's CURRENT active coach (if any), resolved from `coachClients`.
 * Single-field `clientId` query (auto-indexed); the active rel is filtered
 * client-side (a client has at most one active coach + a few historical rels).
 */
export async function getClientAssignment(
  clientId: string,
): Promise<{ coachId: string; rel: CoachClientRelationship } | null> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, REL), where('clientId', '==', clientId)));
  const active = snap.docs.map((d) => d.data() as CoachClientRelationship).find((r) => r.status === 'active');
  return active ? { coachId: active.coachId, rel: active } : null;
}

/** Every coaching relationship a client has had (newest first) — the timeline source. */
export async function listClientCoachHistory(clientId: string): Promise<CoachClientRelationship[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, REL), where('clientId', '==', clientId)));
  return snap.docs.map((d) => d.data() as CoachClientRelationship).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * CASE 1 — a coach assigns an UNASSIGNED existing client to themselves, with a
 * required subscription. Never creates an Auth user. Writes the rel (granted by
 * the coach self-link rule), claims the client (`assignedCoachId '' → self`,
 * rule E1), bumps the count, notifies the client, and audits.
 */
export async function assignExistingClient(
  coachId: string,
  clientId: string,
  createdBy: string,
  sub: ClientSubscriptionInput,
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const id = relId(coachId, clientId);
  const subscription = buildSubscription(sub, now);
  const rel: CoachClientRelationship = { id, coachId, clientId, status: 'active', subscription, createdBy, createdAt: now, updatedAt: now };
  await setDoc(doc(db, REL, id), rel);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: coachId, updatedAt: now });
  await bumpActiveClientCount(coachId, 1);
  await notify({ clientId, forRole: 'client', type: 'coach_assigned', route: '/coach-notes', createdBy: coachId });
  await writeAudit({
    action: 'coach.assign_existing',
    targetUserId: clientId,
    metadata: { clientId, fromCoachId: null, toCoachId: coachId, performedBy: createdBy, subscriptionHandling: 'new', timestamp: now },
  });
}

/**
 * A coach releases their OWN client: the Forma account and all client-owned data
 * stay intact and the client becomes re-assignable. Ends the rel with metadata,
 * clears `assignedCoachId` (rule E1 release branch, self → ''), decrements the
 * count, notifies the client, and audits. No Auth user is ever deleted.
 */
export async function releaseClient(coachId: string, clientId: string, by: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  // Notify the client FIRST — while the relationship is still active, the coach
  // still has write access to the client's notifications.
  await notify({ clientId, forRole: 'client', type: 'client_released', route: '/', createdBy: coachId });
  await updateDoc(doc(db, REL, relId(coachId, clientId)), {
    status: 'ended',
    endedAt: now,
    endedBy: by,
    endReason: 'released',
    updatedAt: now,
  }).catch(() => undefined);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: deleteField(), updatedAt: now });
  await bumpActiveClientCount(coachId, -1);
  await writeAudit({
    action: 'coach.release',
    targetUserId: clientId,
    metadata: { clientId, fromCoachId: coachId, toCoachId: null, performedBy: by, timestamp: now },
  });
}

/**
 * FRESH START — snapshot the active plans into the RETAINED `planVersions`
 * history, then clear the active plans and all coach-authored content so the new
 * coach starts clean. KEEPS profile, assessment, every log, weight, measurements,
 * photos, dailyChecklists, and `planVersions`. Per-doc deletes are best-effort.
 * Gated to super-admin (`clients.writeAll`) by the caller + rules.
 */
export async function archiveAndClearCoachData(clientId: string, by: string): Promise<void> {
  const { db } = ensureFirebase();
  // 1) Archive active plans into version history, then drop the active plan docs.
  const [workout, nutrition, cardio] = await Promise.all([
    getClientWorkoutPlan(clientId).catch(() => null),
    getClientMealPlan(clientId).catch(() => null),
    getClientCardioPlan(clientId).catch(() => null),
  ]);
  if (workout) await saveAsNewVersion(clientId, 'workout', workout, by, 'Archived on transfer').catch(() => undefined);
  if (nutrition) await saveAsNewVersion(clientId, 'nutrition', nutrition, by, 'Archived on transfer').catch(() => undefined);
  if (cardio) await saveAsNewVersion(clientId, 'cardio', cardio, by, 'Archived on transfer').catch(() => undefined);
  await Promise.all(
    (['workout', 'nutrition', 'cardio'] as const).map((k) => deleteDoc(doc(db, CLIENT, clientId, 'plan', k)).catch(() => undefined)),
  );
  // 2) Delete coach-authored content (client-owned data is untouched).
  const colls = ['coachNotes', 'messages', 'checkIns', 'coachTargets', 'notifications', 'workoutPlans', 'nutritionPlans', 'subscriptionRequest'];
  for (const coll of colls) {
    const snap = await getDocs(collection(db, CLIENT, clientId, coll)).catch(() => null);
    if (!snap) continue;
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => undefined)));
  }
}

/**
 * Admin/super-admin transfer with an explicit mode + subscription handling.
 * Reassigns the client (ends the old rel with metadata, opens a new one),
 * optionally runs Fresh Start, resolves the subscription, notifies, and audits.
 *  - `keep_plans`  : everything carries over (any `coaches.assign` admin).
 *  - `fresh_start` : archive + clear coach content (super-admin `clients.writeAll`).
 */
export async function transferClientWithMode(
  clientId: string,
  fromCoachId: string | undefined,
  toCoachId: string,
  mode: TransferMode,
  subscriptionHandling: TransferSubHandling,
  by: string,
  newSub?: ClientSubscriptionInput,
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const fromRel = fromCoachId ? await getRelationship(fromCoachId, clientId) : null;
  // 1) End the old relationship with transfer metadata.
  if (fromCoachId && fromCoachId !== toCoachId) {
    await updateDoc(doc(db, REL, relId(fromCoachId, clientId)), {
      status: 'ended',
      endedAt: now,
      endedBy: by,
      endReason: 'transferred',
      mode,
      updatedAt: now,
    }).catch(() => undefined);
  }
  // 2) Resolve the subscription for the new relationship.
  let subscription: Subscription | undefined;
  if (subscriptionHandling === 'keep') {
    subscription = fromRel?.subscription;
  } else if (subscriptionHandling === 'new') {
    subscription = buildSubscription(newSub ?? { status: mode === 'fresh_start' ? 'pending' : 'trial' }, now);
  } else {
    subscription = { startAt: now, endAt: now, status: 'pending', frozenFrom: null, frozenUntil: null, updatedAt: now };
  }
  // 3) Open the new relationship.
  const id = relId(toCoachId, clientId);
  const rel: CoachClientRelationship = {
    id,
    coachId: toCoachId,
    clientId,
    status: 'active',
    createdBy: by,
    createdAt: now,
    updatedAt: now,
    ...(subscription ? { subscription } : {}),
  };
  await setDoc(doc(db, REL, id), rel);
  await updateDoc(doc(db, USERS, clientId), { assignedCoachId: toCoachId, updatedAt: now });
  if (fromCoachId && fromCoachId !== toCoachId) await bumpActiveClientCount(fromCoachId, -1);
  if (fromCoachId !== toCoachId) await bumpActiveClientCount(toCoachId, 1);
  // 4) Fresh start clears the previous coach's content (after the reassign, so the
  // new coach owns the rel; client-owned data + planVersions are retained).
  if (mode === 'fresh_start') await archiveAndClearCoachData(clientId, by);
  // 5) Notify both coaches' clients + audit (after any clear, so these survive).
  await notify({ clientId: toCoachId, forRole: 'coach', type: 'coach_assigned', route: `/coach/client/${clientId}`, createdBy: by });
  await notify({ clientId, forRole: 'client', type: 'coach_assigned', route: '/coach-notes', createdBy: by });
  const payload = { clientId, fromCoachId: fromCoachId ?? null, toCoachId, performedBy: by, mode, subscriptionHandling, timestamp: now };
  await writeAudit({ action: 'coach.transfer', targetUserId: clientId, metadata: payload });
  await writeAudit({
    action: mode === 'fresh_start' ? 'coach.transfer_fresh_start' : 'coach.transfer_keep_plans',
    targetUserId: clientId,
    metadata: payload,
  });
}
