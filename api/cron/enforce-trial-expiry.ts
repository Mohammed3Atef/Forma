import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { coachPlansCol, coachPlanRequestsCol, DAY_MS, TRIAL_GRACE_DAYS, type CoachPlanRequestDoc } from '../coach-plans/_data.js';
import { listTiers } from '../coach-plans/_handlers/tiers-data.js';
import { buildPlanSnapshot } from '../_trpc/routers/coachPlanRequests.js';
import { usersCol } from '../_lib/mongodb.js';
import { sendPlanRequestAwaitingEmail } from '../_lib/email.js';

/**
 * Vercel Cron (see `vercel.json`'s `crons`) — the single Trial → Pro
 * transition. For every coach whose Trial has run out:
 *
 * 1. Raises an `awaiting` plan request for the (one) paid tier, if one isn't
 *    already outstanding — this is what shows up in the Super Admin dashboard
 *    to confirm payment on. It has no fixed deadline (unlike a coach's own
 *    self-service request) — only a Super Admin `confirm`/`reject` resolves
 *    it, so it never silently disappears via the OTHER cron
 *    (`expire-plan-requests.ts`)'s 24h-deadline sweep.
 * 2. After `TRIAL_GRACE_DAYS` past `endsAt` with still no confirmation, the
 *    account itself is hard-blocked (`accountStatus: 'pending'`) — the
 *    coach sees the existing Account Pending screen app-wide, not just a
 *    soft plan-gated read-only mode. `coachPlanRequests.confirm` reverses
 *    this the moment payment is confirmed.
 */
const NEVER_MS = 10 * 365 * DAY_MS;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.authorization;
    if (header !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

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
              console.error('[cron/enforce-trial-expiry] notification email failed (non-fatal):', e),
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

  res.status(200).json({ ok: true, checked: expiredTrials.length, requestsCreated, accountsPended });
}
