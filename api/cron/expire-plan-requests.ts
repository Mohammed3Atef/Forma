import type { VercelRequest, VercelResponse } from '@vercel/node';
import { coachPlanRequestsCol, isRequestExpired } from '../coach-plans/_data.js';
import { usersCol } from '../_lib/mongodb.js';
import { sendPlanRequestExpiredEmail } from '../_lib/email.js';

/**
 * Vercel Cron (see `vercel.json`'s `crons`, every 15 min) — safety net for
 * accounts nobody is actively looking at. The defensive read-path
 * (`coachPlanRequests.get`/`.listPending`) already applies the exact same
 * `isRequestExpired` rule at read time, so an overdue request is reported as
 * expired even before this job catches up; this job just persists that
 * transition for rows nobody happens to read. Never touches `CoachPlanDoc` —
 * an expiry only ever changes the request row.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.authorization;
    if (header !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const col = await coachPlanRequestsCol();
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
        const user = await (await usersCol()).findOne({ _id: r.coachId });
        if (user) await sendPlanRequestExpiredEmail(user.email, user.displayName, r.planSnapshot.label.en);
      } catch (e) {
        console.error('[cron/expire-plan-requests] notification email failed (non-fatal):', e);
      }
    }
  }
  res.status(200).json({ ok: true, checked: candidates.length, expired });
}
