import type { ClientSession, Collection } from 'mongodb';
import { TRPCError } from '@trpc/server';
import { CommercialReason } from '../_lib/commercialReason.js';
import { getDb } from '../_lib/mongodb.js';
import type { ClientSubscriptionInput, CoachClientDoc, CoachPlanDoc, SubscriptionDoc } from './_types.js';
import { buildTerm } from './_terms.js';

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

/**
 * Build a concrete `Subscription` from a coach's chosen term (no undefined
 * fields written to Mongo). B3.8: fixed-day calendar terms (1 month = 30 days)
 * anchored to the coach device's zone — see `buildTerm` in `_terms.ts`. The
 * server's own zone (UTC on Vercel) is never used for date arithmetic.
 */
export function buildSubscription(input: ClientSubscriptionInput, now: number): SubscriptionDoc {
  return buildTerm(input, now);
}

/**
 * True when the coach is at/over their client cap, per `coachPlans`.
 *
 * NOTE — this is intentionally STRICTER than the retired Firestore rule `coachAtClientCap()`,
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
export type CoachCapStatus = 'ok' | 'no_plan' | 'at_cap' | 'expired' | 'suspended';
export async function coachCapStatus(coachId: string, session?: ClientSession): Promise<CoachCapStatus> {
  const col = await coachPlansCol();
  const plan = await col.findOne({ _id: coachId }, { session });
  if (!plan) return 'no_plan';
  if (plan.status === 'suspended') return 'suspended';
  // Subscription first: an expired Trial/term is SUBSCRIPTION_EXPIRED, never
  // reported as a capacity problem.
  if (plan.status !== 'active' || (typeof plan.endsAt === 'number' && plan.endsAt <= Date.now())) return 'expired';
  const max = plan.maxClients;
  const count = plan.activeClientCount;
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return 'no_plan';
  if (typeof count !== 'number' || !Number.isFinite(count)) return 'no_plan';
  return count >= max ? 'at_cap' : 'ok';
}

/** Stable machine reasons (sent to the client in `error.data.reason`) + human messages. */
export const CAP_REASONS: Record<Exclude<CoachCapStatus, 'ok'>, string> = {
  no_plan: 'NO_SUBSCRIPTION',
  at_cap: 'CLIENT_CAPACITY_REACHED',
  expired: 'SUBSCRIPTION_EXPIRED',
  suspended: 'SUBSCRIPTION_SUSPENDED',
};
export const CAP_MESSAGES: Record<Exclude<CoachCapStatus, 'ok'>, string> = {
  no_plan: 'This coach has no active Forma subscription yet',
  at_cap: 'Client capacity reached — add client capacity to take on more clients',
  expired: 'The Forma subscription has expired — renew it to add clients',
  suspended: 'This coach account is suspended',
};

/** The TRPCError every join path throws when the cap gate refuses. */
/**
 * The same refusals when the coach who can't take the client is the RECEIVING coach of a transfer
 * (B3.9): the approving coach must not read them as their own capacity or plan.
 */
export const DESTINATION_CAP_REASONS: Record<Exclude<CoachCapStatus, 'ok'>, string> = {
  no_plan: 'DESTINATION_NOT_ACCEPTING',
  at_cap: 'DESTINATION_CAPACITY_REACHED',
  expired: 'DESTINATION_NOT_ACCEPTING',
  suspended: 'DESTINATION_NOT_ACCEPTING',
};

export function capError(status: Exclude<CoachCapStatus, 'ok'>, prefix = '', reasons: Record<Exclude<CoachCapStatus, 'ok'>, string> = CAP_REASONS): TRPCError {
  const msg = CAP_MESSAGES[status];
  return new TRPCError({
    // Capacity / no-plan refusals stay CONFLICT (pre-refactor contract); a
    // lapsed or suspended subscription is a precondition the coach must fix.
    code: status === 'at_cap' || status === 'no_plan' ? 'CONFLICT' : 'PRECONDITION_FAILED',
    message: prefix ? `${prefix}${msg.charAt(0).toLowerCase()}${msg.slice(1)}` : msg,
    cause: new CommercialReason(reasons[status]),
  });
}

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
      status: 'active',
      // A live Trial/term only — an expired subscription can't take new clients.
      $or: [{ endsAt: null }, { endsAt: { $gt: Date.now() } }],
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
