import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { coachPlansCol, coachPlanRequestsCol, DAY_MS, TRIAL_GRACE_DAYS, isRequestExpired, type CoachPlanRequestDoc } from '../coach-plans/_data.js';
import { listTiers } from '../coach-plans/_handlers/tiers-data.js';
import { buildPlanSnapshot } from '../_trpc/routers/coachPlanRequests.js';
import { usersCol } from '../_lib/mongodb.js';
import { sendPlanRequestAwaitingEmail, sendPlanRequestExpiredEmail } from '../_lib/email.js';

/**
 * The one daily Vercel Cron (see `vercel.json`) — merged so this project only
 * ever needs a single once-per-day schedule, which is what Vercel's Hobby
 * plan allows (a cron expression that would run more than once a day fails
 * the whole deployment, not just that job). Runs both maintenance sweeps
 * back to back:
 *
 * 1. Expires any plan request stuck `awaiting` past its 24h confirmation
 *    deadline — a safety net; the defensive read-path (`coachPlanRequests.get`
 *    /`.listPending`) already applies the exact same rule live, so this just
 *    persists the transition for rows nobody happens to read. Never touches
 *    `CoachPlanDoc`.
 * 2. The Trial → Pro transition: for every coach whose Trial has run out,
 *    raises an `awaiting` Pro-tier request (what shows up in the Super Admin
 *    dashboard to confirm payment on) if one isn't already outstanding, and
 *    after `TRIAL_GRACE_DAYS` past `endsAt` with still no confirmation, hard-
 *    blocks the account (`accountStatus: 'pending'`) app-wide.
 *    `coachPlanRequests.confirm` reverses the pend the moment payment is
 *    confirmed.
 */
const NEVER_MS = 10 * 365 * DAY_MS;

async function expireStalePlanRequests() {
  const col = await coachPlanRequestsCol();
  const users = await usersCol();
  const candidates = await col.find({ status: 'awaiting' }).toArray();
  const now = Date.now();
  let expired = 0;
  for (const r of candidates) {
    if (!isRequestExpired(r, now)) continue;
    const result = await col.updateOne({ _id: r._id, status: 'awaiting' }, { $set: { status: 'expired', expiredAt: now } });
    if (result.modifiedCount > 0) {
      expired += 1;
      // Best-effort — never fails the sweep.
      try {
        const user = await users.findOne({ _id: r.coachId });
        if (user) await sendPlanRequestExpiredEmail(user.email, user.displayName, r.planSnapshot.label.en);
      } catch (e) {
        console.error('[cron/daily-maintenance] expire-plan-requests: notification email failed (non-fatal):', e);
      }
    }
  }
  return { checked: candidates.length, expired };
}

async function enforceTrialExpiry() {
  const now = Date.now();
  const plans = await coachPlansCol();
  const expiredTrials = await plans.find({ plan: 'trial', endsAt: { $lte: now } }).toArray();

  const tiers = await listTiers(false);
  const paidTier = tiers.find((t) => t.signupEnabled && !t.isDefaultSignupPlan);

  const reqCol = await coachPlanRequestsCol();
  const users = await usersCol();
  let requestsCreated = 0;
  let accountsPended = 0;

  for (const plan of expiredTrials) {
    const actionable = await reqCol.findOne({ coachId: plan._id, status: { $in: ['awaiting', 'processing'] } });
    if (!actionable && paidTier) {
      const snapshot = await buildPlanSnapshot(paidTier._id);
      if (snapshot) {
        const doc: CoachPlanRequestDoc = {
          _id: crypto.randomUUID(),
          coachId: plan._id,
          type: 'trial_expired',
          requestedTierKey: paidTier._id,
          planSnapshot: snapshot,
          status: 'awaiting',
          requestedAt: now,
          confirmationDeadline: now + NEVER_MS,
        };
        try {
          await reqCol.insertOne(doc);
          requestsCreated += 1;
          const user = await users.findOne({ _id: plan._id });
          if (user) {
            sendPlanRequestAwaitingEmail(user.email, user.displayName, snapshot.label.en).catch((e) =>
              console.error('[cron/daily-maintenance] enforce-trial-expiry: notification email failed (non-fatal):', e),
            );
          }
        } catch (e) {
          // Duplicate-key against the partial unique index — a request landed concurrently; nothing to do.
          if (!(e instanceof Error && 'code' in e && (e as { code?: number }).code === 11000)) throw e;
        }
      }
    }

    if (now >= plan.endsAt! + TRIAL_GRACE_DAYS * DAY_MS) {
      const result = await users.updateOne({ _id: plan._id, accountStatus: 'active' }, { $set: { accountStatus: 'pending', updatedAt: now } });
      if (result.modifiedCount > 0) accountsPended += 1;
    }
  }

  return { checked: expiredTrials.length, requestsCreated, accountsPended };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.authorization;
    if (header !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const expirePlanRequests = await expireStalePlanRequests();
  const trialExpiry = await enforceTrialExpiry();
  res.status(200).json({ ok: true, expirePlanRequests, trialExpiry });
}
