import type { ClientSession } from 'mongodb';
import { TRPCError } from '@trpc/server';
import { usersCol } from '../_lib/mongodb.js';
import { coachPlansCol, DAY_MS, phaseOf, type CoachPlanDoc, type CoachPlanRequestDoc, type PlanSnapshot } from './_data.js';
import { getFormaConfig, type FormaConfigDoc } from './_handlers/forma.js';
import { grantOrRenewEntitlement, pushHistory, recomputeCapacity } from './_capacity.js';

/**
 * Applying a CONFIRMED request to the coach's real entitlements — the single
 * implementation behind `coachPlanRequests.confirm` and the Super Admin
 * "Renew Forma" / direct actions. Always runs inside the caller's transaction.
 *
 * SUBSCRIPTION TERM SEMANTICS (server time only — never request time,
 * deadline or browser time):
 *   - First paid activation (Trial / expired / unpaid → `subscription` or
 *     `trial_expired`): the term starts at CONFIRMATION time.
 *   - RENEWAL (`type === 'renewal'`): the new term starts at
 *       max(current endsAt, confirmedAt)
 *     so an early renewal never loses remaining paid days (it is appended
 *     after the current end) and a late renewal is never backdated. A second
 *     early renewal therefore stacks after the already-extended end.
 *   endsAt = termStart + snapshot.termDays (the REQUEST snapshot, never live config).
 *   While a renewal is appended to a running term the coach's access, the
 *   current `startedAt` and status stay exactly as they were.
 * Base capacity becomes the snapshot's `maxClients` — on an EARLY renewal it
 * is never lowered during time that is already paid for (max(current, snapshot)).
 * Add-ons and the manual adjustment are untouched; effective capacity is recomputed in the same
 * transaction.
 */

export function buildFormaSnapshot(cfg: FormaConfigDoc): PlanSnapshot {
  return {
    tierKey: 'forma',
    label: cfg.marketingTitle,
    priceMonthly: cfg.priceMonthly,
    currency: cfg.currency,
    billingInterval: cfg.billingInterval,
    maxClients: cfg.maxClients,
    termDays: cfg.termDays,
  };
}

export async function currentFormaSnapshot(session?: ClientSession): Promise<PlanSnapshot> {
  return buildFormaSnapshot(await getFormaConfig(session));
}

/** What a confirmation did to the term — recorded in audit + history. */
export interface TermChange {
  previousEndsAt: number | null;
  termStartsAt: number;
  endsAt: number;
  confirmedAt: number;
  /** True when the term was appended after a still-running paid term. */
  extended: boolean;
}

/** The ONE renewal formula: start = max(current end, confirmation) for renewals of a paid term; confirmation otherwise. */
export function computeTermStart(
  type: CoachPlanRequestDoc['type'],
  current: Pick<CoachPlanDoc, 'plan' | 'endsAt'> | null,
  confirmedAt: number,
): { termStartsAt: number; extended: boolean } {
  const isRenewal = type === 'renewal' && !!current && phaseOf(current) === 'forma';
  if (isRenewal && current!.endsAt != null && current!.endsAt > confirmedAt) return { termStartsAt: current!.endsAt, extended: true };
  return { termStartsAt: confirmedAt, extended: false };
}

export async function applySubscription(
  req: Pick<CoachPlanRequestDoc, '_id' | 'coachId' | 'planSnapshot' | 'type'>,
  by: string,
  now: number,
  session: ClientSession,
): Promise<{ plan: CoachPlanDoc; term: TermChange }> {
  const snap = req.planSnapshot;
  if (!snap) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This request has no subscription snapshot.' });
  const plans = await coachPlansCol();
  const current = await plans.findOne({ _id: req.coachId }, { session });
  const { termStartsAt, extended } = computeTermStart(req.type, current, now);
  const endsAt = termStartsAt + snap.termDays * DAY_MS;
  const base = extended ? Math.max(current?.baseMaxClients ?? current?.maxClients ?? 0, snap.maxClients) : snap.maxClients;
  await plans.updateOne(
    { _id: req.coachId },
    {
      $set: {
        plan: 'forma',
        status: 'active',
        baseMaxClients: base,
        // An appended renewal leaves the running term (and its start) untouched.
        ...(extended ? {} : { startedAt: now }),
        endsAt,
        subscription: {
          priceMonthly: snap.priceMonthly,
          currency: snap.currency,
          billingInterval: 'month',
          termDays: snap.termDays,
          maxClients: snap.maxClients,
          requestId: req._id,
          termStartsAt,
          confirmedAt: now,
        },
        updatedAt: now,
      },
      $setOnInsert: { activeClientCount: 0, createdAt: now, addonClientCapacity: 0, manualCapacityAdjustment: 0, maxClients: snap.maxClients },
    },
    { session, upsert: true },
  );
  await recomputeCapacity(req.coachId, session);
  const day = (t: number | null | undefined) => (t == null ? '—' : new Date(t).toISOString().slice(0, 10));
  await pushHistory(
    req.coachId,
    {
      at: now,
      action: extended ? 'subscription.renewed' : 'subscription.confirmed',
      detail: `${snap.priceMonthly} ${snap.currency} / ${snap.termDays}d · ${extended ? `${day(current?.endsAt)} → ${day(endsAt)}` : `${day(termStartsAt)} → ${day(endsAt)}`}`,
      by,
    },
    session,
  );
  // A legacy grace-period pend (pre-refactor cron) is lifted by confirming payment.
  const users = await usersCol();
  await users.updateOne({ _id: req.coachId, accountStatus: 'pending' }, { $set: { accountStatus: 'active', updatedAt: now } }, { session });
  return {
    plan: (await plans.findOne({ _id: req.coachId }, { session }))!,
    term: { previousEndsAt: current?.endsAt ?? null, termStartsAt, endsAt, confirmedAt: now, extended },
  };
}

/** Dispatch a confirmed request to the right effect. */
export async function applyConfirmedRequest(req: CoachPlanRequestDoc, by: string, now: number, session: ClientSession): Promise<{ term: TermChange | null; capacity: { previousEndsAt: number | null; endsAt: number | null; renewed: boolean } | null }> {
  if (req.type === 'capacity_addon') {
    if (!req.capacitySnapshot) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This request has no capacity snapshot.' });
    const r = await grantOrRenewEntitlement({ coachId: req.coachId, snapshot: req.capacitySnapshot, source: 'request', requestId: req._id, by, now }, session);
    return { term: null, capacity: { previousEndsAt: r.previousEndsAt, endsAt: r.entitlement.endsAt, renewed: r.renewed } };
  }
  const { term } = await applySubscription(req, by, now, session);
  return { term, capacity: null };
}
