import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, canWriteCoachOwned, resolveClientId } from '../_lib/access.js';
import { checkInsCol } from '../_lib/db.js';
import { notify } from '../_lib/notify.js';
import type { WeeklyCheckInDoc } from '../_lib/types.js';

/**
 * Port of `checkInApi` — weekly check-ins at `clientData/{clientId}/checkIns/{weekStart}`.
 * `checkIns` is in `isCoachOwnedColl` (coach creates the request + reviews), but
 * a dedicated rule ALSO lets the client update their OWN doc while it's still
 * `status: 'requested'` (the one-time submit). No delete rule is granted to the
 * client — only the coach/admin(clients.writeAll) branch covers create/update/delete.
 */
const RequestBody = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  coachId: z.string().optional(),
});

const SubmitBody = z.object({
  currentWeight: z.number().optional(),
  adherenceTraining: z.number().optional(),
  adherenceNutrition: z.number().optional(),
  hungerLevel: z.number().optional(),
  energyLevel: z.number().optional(),
  sleepQuality: z.number().optional(),
  notes: z.string().optional(),
  progressPhotos: z.object({ front: z.string().optional(), side: z.string().optional(), back: z.string().optional() }).optional(),
});

const ReviewBody = z.object({ feedback: z.string() });

function checkInId(clientId: string, weekStart: string): string {
  return `${clientId}__${weekStart}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST', 'PATCH', 'DELETE');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await checkInsCol();
    const id = typeof req.query.id === 'string' ? req.query.id : undefined;

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      if (id) {
        const doc = await col.findOne({ _id: checkInId(clientId, id) });
        res.status(200).json(doc ?? null);
        return;
      }
      const list = await col.find({ clientId }).sort({ weekStart: -1 }).toArray();
      res.status(200).json(list);
      return;
    }

    if (req.method === 'POST') {
      const action = typeof req.query.action === 'string' ? req.query.action : 'request';
      if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');

      if (action === 'review') {
        if (!id) throw new HttpError(400, 'id is required');
        const body = ReviewBody.parse(req.body);
        const now = Date.now();
        const _id = checkInId(clientId, id);
        await col.updateOne({ _id }, { $set: { status: 'reviewed', reviewedAt: now, coachFeedback: body.feedback.trim(), updatedAt: now } });
        const updated = await col.findOne({ _id });
        if (!updated) throw new HttpError(404, 'Check-in not found');
        await notify({
          clientId,
          forRole: 'client',
          type: 'checkin_reviewed',
          body: body.feedback.trim().slice(0, 140),
          entityType: 'checkin',
          entityId: id,
          route: `/check-in/${id}`,
          createdBy: user.id,
        });
        res.status(200).json(updated);
        return;
      }

      // action === 'request' (default) — idempotent: one doc per week.
      const body = RequestBody.parse(req.body);
      const _id = checkInId(clientId, body.weekStart);
      const existing = await col.findOne({ _id });
      if (existing) {
        res.status(200).json(existing);
        return;
      }
      const now = Date.now();
      const coachId = body.coachId ?? (user.role === 'coach' ? user.id : '');
      const checkIn: WeeklyCheckInDoc = {
        _id,
        clientId,
        coachId,
        weekStart: body.weekStart,
        weekEnd: body.weekEnd,
        status: 'requested',
        progressPhotos: {},
        createdAt: now,
        updatedAt: now,
      };
      await col.insertOne(checkIn);
      await notify({
        clientId,
        forRole: 'client',
        type: 'checkin_requested',
        entityType: 'checkin',
        entityId: body.weekStart,
        route: `/check-in/${body.weekStart}`,
        createdBy: user.id,
      });
      res.status(201).json(checkIn);
      return;
    }

    if (req.method === 'PATCH') {
      // Client submits their OWN check-in, once, while it's still 'requested'.
      if (!id) throw new HttpError(400, 'id is required');
      const _id = checkInId(clientId, id);
      const existing = await col.findOne({ _id });
      if (!existing) throw new HttpError(404, 'Check-in not found');
      const allowed = user.accountStatus === 'active' && user.id === clientId && existing.status === 'requested';
      if (!allowed) throw new HttpError(403, 'Forbidden');
      const data = SubmitBody.parse(req.body);
      const now = Date.now();
      const patch: Record<string, unknown> = { status: 'submitted', submittedAt: now, updatedAt: now };
      for (const k of ['currentWeight', 'adherenceTraining', 'adherenceNutrition', 'hungerLevel', 'energyLevel', 'sleepQuality', 'notes'] as const) {
        const v = data[k];
        if (v != null && v !== '') patch[k] = v;
      }
      const photos: Record<string, string> = {};
      for (const pose of ['front', 'side', 'back'] as const) {
        const url = data.progressPhotos?.[pose];
        if (url) photos[pose] = url;
      }
      patch.progressPhotos = photos;
      await col.updateOne({ _id }, { $set: patch });
      const updated = await col.findOne({ _id });
      await notify({
        clientId,
        forRole: 'coach',
        type: 'checkin_submitted',
        entityType: 'checkin',
        entityId: id,
        route: `/coach/client/${clientId}/checkins`,
        createdBy: clientId,
      });
      res.status(200).json(updated);
      return;
    }

    // DELETE — coach/admin only (no client delete rule).
    if (!id) throw new HttpError(400, 'id is required');
    if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
    await col.deleteOne({ _id: checkInId(clientId, id) });
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
