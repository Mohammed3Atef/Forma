import {
  collection,
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
import type { CoachClientRelationship, Subscription, SubscriptionPeriod, SubscriptionStatus } from '@/types';

const REL = 'coachClients';
const USERS = 'users';

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
    await updateDoc(doc(db, REL, relId(fromCoachId, clientId)), { status: 'ended', updatedAt: now }).catch(() => undefined);
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
  await updateDoc(doc(db, REL, relId(coachId, clientId)), { status: 'ended', updatedAt: now }).catch(() => undefined);
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
