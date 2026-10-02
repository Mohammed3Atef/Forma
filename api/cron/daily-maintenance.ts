import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { coachPlansCol, coachPlanRequestsCol, DAY_MS, phaseOf, requestLabelEn, type CoachPlanRequestDoc } from '../coach-plans/_data.js';
import { expireDueEntitlements, pushHistory } from '../coach-plans/_capacity.js';
import { currentFormaSnapshot } from '../coach-plans/_subscription.js';
import { usersCol, withDbTransaction } from '../_lib/mongodb.js';
import { sendPlanRequestAwaitingEmail, sendPlanRequestExpiredEmail } from '../_lib/email.js';

/**
 * The one daily Vercel Cron (see `vercel.json`; Hobby allows one daily
 * schedule). Each sweep is exported and idempotent, so tests and a manual
 * re-run are safe:
 *
 * 1. `expireStalePlanRequests` — `awaiting` past its deadline → `expired`
 *    (same rule as the read-path `isRequestExpired`). Never touches plans.
 * 2. `expireSubscriptions` — Trial or paid term past `endsAt` → plan
 *    `status: 'expired'` (persisting what `planStateOf` already derives).
 *    For an ended TRIAL a `trial_expired` subscription request is raised so
 *    it shows up in the Super Admin queue. The account itself is NEVER
 *    pended or deleted: the coach can still sign in, see My Plan and request
 *    the subscription; adding clients is refused (SUBSCRIPTION_EXPIRED).
 * 3. `expireCapacity` — capacity entitlements past `endsAt` → `expired`,
 *    effective capacity recomputed in the same transaction. Clients are never
 *    removed; a coach left over capacity simply can't add more.
 */
const NEVER_MS = 10 * 365 * DAY_MS;

export async function expireStalePlanRequests(now = Date.now()) {
  const col = await coachPlanRequestsCol();
  const users = await usersCol();
  const due = await col.find({ status: 'awaiting', confirmationDeadline: { $lte: now } }).toArray();
  let expired = 0;
  for (const r of due) {
    const result = await col.updateOne({ _id: r._id, status: 'awaiting' }, { $set: { status: 'expired', expiredAt: now } });
    if (result.modifiedCount === 0) continue;
    expired += 1;
    try {
      const user = await users.findOne({ _id: r.coachId });
      if (user) await sendPlanRequestExpiredEmail(user.email, user.displayName, requestLabelEn(r));
    } catch (e) {
      console.error('[cron/daily-maintenance] request-expiry email failed (non-fatal):', e);
    }
  }
  return { checked: due.length, expired };
}

export async function expireSubscriptions(now = Date.now()) {
  const plans = await coachPlansCol();
  const due = await plans.find({ status: 'active', endsAt: { $ne: null, $lte: now } }).toArray();
  const reqCol = await coachPlanRequestsCol();
  const users = await usersCol();
  let expired = 0;
  let requestsCreated = 0;
  for (const plan of due) {
    const r = await plans.updateOne({ _id: plan._id, status: 'active', endsAt: { $lte: now } }, { $set: { status: 'expired', updatedAt: now } });
    if (r.modifiedCount === 0) continue;
    expired += 1;
    await pushHistory(plan._id, { at: now, action: phaseOf(plan) === 'trial' ? 'trial.expired' : 'subscription.expired', by: 'system' });
    if (phaseOf(plan) !== 'trial') continue;
    const open = await reqCol.findOne({ coachId: plan._id, requestKey: 'subscription', status: { $in: ['awaiting', 'processing'] } });
    if (open) continue;
    const doc: CoachPlanRequestDoc = {
      _id: crypto.randomUUID(),
      coachId: plan._id,
      type: 'trial_expired',
      requestKey: 'subscription',
      requestedTierKey: 'forma',
      planSnapshot: await currentFormaSnapshot(),
      status: 'awaiting',
      requestedAt: now,
      // Stays open until the coach pays or a Super Admin resolves it.
      confirmationDeadline: now + NEVER_MS,
    };
    try {
      await reqCol.insertOne(doc);
      requestsCreated += 1;
      const user = await users.findOne({ _id: plan._id });
      if (user) sendPlanRequestAwaitingEmail(user.email, user.displayName, requestLabelEn(doc)).catch((e) => console.error('[cron/daily-maintenance] trial-expiry email failed (non-fatal):', e));
    } catch (e) {
      if (!(e instanceof Error && 'code' in e && (e as { code?: number }).code === 11000)) throw e;
    }
  }
  return { checked: due.length, expired, requestsCreated };
}

export async function expireCapacity(now = Date.now()) {
  return expireDueEntitlements(now, withDbTransaction);
}

export async function runDailyMaintenance(now = Date.now()) {
  const expirePlanRequests = await expireStalePlanRequests(now);
  const subscriptions = await expireSubscriptions(now);
  const capacity = await expireCapacity(now);
  return { expirePlanRequests, subscriptions, capacity: { expired: capacity.expired, coaches: capacity.coaches.length } };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Fail CLOSED: a deployment that forgot CRON_SECRET must refuse every caller.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/daily-maintenance] CRON_SECRET is not set — refusing to run');
    res.status(503).json({ error: 'Cron is not configured' });
    return;
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.status(200).json({ ok: true, ...(await runDailyMaintenance()) });
}
