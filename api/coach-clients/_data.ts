import type { ClientSession, Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb.js';
import type { ClientSubscriptionInput, CoachClientDoc, CoachPlanDoc, SubscriptionDoc } from './_types.js';

const SUB_DAY = 86_400_000;

export async function coachClientsCol(): Promise<Collection<CoachClientDoc>> {
  return (await getDb()).collection<CoachClientDoc>('coachClients');
}

/** Read-only accessor onto the parallel `coachPlans` module's collection. */
export async function coachPlansCol(): Promise<Collection<CoachPlanDoc>> {
  return (await getDb()).collection<CoachPlanDoc>('coachPlans');
}

/** Deterministic relationship id — mirrors the Firestore doc-id convention. */
export function relId(coachId: string, clientId: string): string {
  return `${coachId}__${clientId}`;
}

/** Calendar-accurate `startAt + months` → end timestamp (same as `src/lib/subscription.ts`). */
export function addMonths(startAt: number, months: number): number {
  const d = new Date(startAt);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/**
 * Build a concrete `Subscription` from a coach's chosen term (no undefined
 * fields written to Mongo) — exact port of `buildSubscription()` in
 * `src/services/platform/coachClientsApi.ts`.
 */
export function buildSubscription(input: ClientSubscriptionInput, now: number): SubscriptionDoc {
  const start = input.startAt ?? now;
  const base: SubscriptionDoc = {
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
    // Days-based term (coach plan with unit='days') takes priority; else months.
    if (typeof input.days === 'number' && input.days > 0) return { ...base, endAt: start + input.days * SUB_DAY };
    const months = input.months ?? 1;
    return { ...base, months, endAt: addMonths(start, months) };
  }
  return base; // pending / expired / cancelled / frozen / ended: no term math
}

/**
 * True when the coach is at/over their client cap, per `coachPlans`.
 *
 * NOTE — this is intentionally STRICTER than `firestore.rules`' `coachAtClientCap()`,
 * which treats a missing/legacy plan doc as "not blocked" (best-effort). Per this
 * migration's explicit product decision, a missing or malformed `coachPlans` doc is
 * treated as "at cap" here — the safer failure mode is refusing a new client link,
 * never silently allowing unlimited clients.
 */
export async function coachAtClientCap(coachId: string): Promise<boolean> {
  return (await coachCapStatus(coachId)) !== 'ok';
}

/**
 * Same decision as `coachAtClientCap`, but says WHY a new client link is
 * refused so callers can return the right error: a coach with NO plan doc (or
 * a malformed one) is a different problem from a coach who is genuinely full,
 * and telling an admin "at their client limit" for the former sends them to
 * raise a limit that isn't the issue.
 */
export type CoachCapStatus = 'ok' | 'no_plan' | 'at_cap';
export async function coachCapStatus(coachId: string, session?: ClientSession): Promise<CoachCapStatus> {
  const col = await coachPlansCol();
  const plan = await col.findOne({ _id: coachId }, { session });
  if (!plan) return 'no_plan';
  const max = plan.maxClients;
  const count = plan.activeClientCount;
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return 'no_plan';
  if (typeof count !== 'number' || !Number.isFinite(count)) return 'no_plan';
  return count >= max ? 'at_cap' : 'ok';
}

export const CAP_MESSAGES: Record<Exclude<CoachCapStatus, 'ok'>, string> = {
  no_plan: 'This coach has no active plan yet',
  at_cap: 'Coach is at their client limit',
};

/**
 * ATOMIC slot reservation — the ONE cap gate every path that opens a new
 * active relationship goes through (`assignExistingClient`, `invites.claim`,
 * `transferClientWithMode`). `coachCapStatus` above is a read and therefore
 * only ever advisory: two concurrent joins that both read "one slot left"
 * would both pass it and push the coach over `maxClients`. This instead makes
 * the check and the increment ONE conditional `findOneAndUpdate`, so of N
 * simultaneous joins for the last slot exactly one wins — the rest see
 * `at_cap`.
 *
 * The filter pins both fields to real numbers on purpose (`$gt`/`$gte` only
 * match values of the same BSON type bracket, so null/missing/strings never
 * match): in aggregation comparison order `null < 25` is TRUE, so a bare
 * `$expr: {$lt: [...]}` on a legacy plan doc with no `activeClientCount`
 * would grant unlimited slots. A missing/malformed doc is refused as
 * `no_plan` (never silently allowed), matching `coachCapStatus`.
 *
 * Callers MUST release the slot (`releaseClientSlot`) if the relationship
 * write that follows fails — or run the whole thing inside a transaction with
 * `session`, in which case an abort rolls the reservation back for free.
 */
export async function reserveClientSlot(coachId: string, session?: ClientSession): Promise<CoachCapStatus> {
  const col = await coachPlansCol();
  const reserved = await col.findOneAndUpdate(
    {
      _id: coachId,
      maxClients: { $gt: 0 },
      activeClientCount: { $gte: 0 },
      $expr: { $lt: ['$activeClientCount', '$maxClients'] },
    },
    { $inc: { activeClientCount: 1 }, $set: { updatedAt: Date.now() } },
    { session, returnDocument: 'after' },
  );
  if (reserved) return 'ok';
  // Lost — say why. If a slot freed up between the CAS and this read, still
  // report `at_cap` (the caller may retry); never claim a reservation we
  // didn't make.
  const why = await coachCapStatus(coachId, session);
  return why === 'ok' ? 'at_cap' : why;
}

/**
 * Returns a slot taken by `reserveClientSlot` (relationship ended, or the
 * write after the reservation failed). Floored at zero so a release can
 * never drive the counter negative; a plan doc with no numeric counter is
 * left alone (it is `no_plan` for reservation purposes anyway — see the
 * reconciliation script for repairing such docs).
 */
export async function releaseClientSlot(coachId: string, session?: ClientSession): Promise<void> {
  const col = await coachPlansCol();
  await col.updateOne(
    { _id: coachId, activeClientCount: { $gt: 0 } },
    { $inc: { activeClientCount: -1 }, $set: { updatedAt: Date.now() } },
    { session },
  );
}
