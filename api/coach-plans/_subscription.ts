import type { ClientSession } from 'mongodb';
import { TRPCError } from '@trpc/server';
import { usersCol } from '../_lib/mongodb.js';
import { coachPlansCol, DAY_MS, type CoachPlanDoc, type CoachPlanRequestDoc, type PlanSnapshot } from './_data.js';
import { getFormaConfig, type FormaConfigDoc } from './_handlers/forma.js';
import { grantOrRenewEntitlement, pushHistory, recomputeCapacity } from './_capacity.js';

/**
 * Applying a CONFIRMED request to the coach's real entitlements — the single
 * implementation behind `coachPlanRequests.confirm` and the Super Admin
 * "Renew Forma" / direct actions. Always runs inside the caller's transaction.
 *
 * SUBSCRIPTION TERM SEMANTICS (documented, not invented):
 *   - Trial / expired / lapsed coach → term starts at CONFIRMATION time:
 *       startsAt = now, endsAt = now + snapshot.termDays.
 *   - Renewal of a still-ACTIVE paid term → the pre-refactor rule is kept
 *     exactly: the new term also starts at confirmation (startsAt = now,
 *     endsAt = now + termDays); remaining days of the current term are NOT
 *     carried over and nothing is prorated. A carry-over rule is a product
 *     decision, deliberately not made here.
 * Base capacity becomes the snapshot's `maxClients`; add-ons and the manual
 * adjustment are untouched; effective capacity is recomputed in the same
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

export async function applySubscription(req: Pick<CoachPlanRequestDoc, '_id' | 'coachId' | 'planSnapshot'>, by: string, now: number, session: ClientSession): Promise<CoachPlanDoc> {
  const snap = req.planSnapshot;
  if (!snap) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This request has no subscription snapshot.' });
  const plans = await coachPlansCol();
  await plans.updateOne(
    { _id: req.coachId },
    {
      $set: {
        plan: 'forma',
        status: 'active',
        baseMaxClients: snap.maxClients,
        startedAt: now,
        endsAt: now + snap.termDays * DAY_MS,
        subscription: {
          priceMonthly: snap.priceMonthly,
          currency: snap.currency,
          billingInterval: 'month',
          termDays: snap.termDays,
          maxClients: snap.maxClients,
          requestId: req._id,
        },
        updatedAt: now,
      },
      $setOnInsert: { activeClientCount: 0, createdAt: now, addonClientCapacity: 0, manualCapacityAdjustment: 0, maxClients: snap.maxClients },
    },
    { session, upsert: true },
  );
  await recomputeCapacity(req.coachId, session);
  await pushHistory(req.coachId, { at: now, action: 'subscription.confirmed', detail: `${snap.priceMonthly} ${snap.currency} / ${snap.termDays}d`, by }, session);
  // A legacy grace-period pend (pre-refactor cron) is lifted by confirming payment.
  const users = await usersCol();
  await users.updateOne({ _id: req.coachId, accountStatus: 'pending' }, { $set: { accountStatus: 'active', updatedAt: now } }, { session });
  return (await plans.findOne({ _id: req.coachId }, { session }))!;
}

/** Dispatch a confirmed request to the right effect. */
export async function applyConfirmedRequest(req: CoachPlanRequestDoc, by: string, now: number, session: ClientSession): Promise<void> {
  if (req.type === 'capacity_addon') {
    if (!req.capacitySnapshot) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This request has no capacity snapshot.' });
    await grantOrRenewEntitlement({ coachId: req.coachId, snapshot: req.capacitySnapshot, source: 'request', requestId: req._id, by, now }, session);
    return;
  }
  await applySubscription(req, by, now, session);
}
