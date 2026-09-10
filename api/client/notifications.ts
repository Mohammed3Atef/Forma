import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../_lib/http.js';
import { canReadClientData, canWriteClientOrCoach, resolveClientId } from './_lib/access.js';
import { notificationsCol } from './_lib/db.js';
import type { AppNotificationDoc } from './_lib/types.js';

/**
 * `clientData/{clientId}/notifications/{id}` — the coach creates client-bound
 * alerts, the client writes coach-bound alerts, and either marks their own
 * seen. NOT in `isCoachOwnedColl`, but a dedicated rule ALSO grants the
 * assigned coach / admin(clients.writeAll) write (same shape as measurementLogs).
 */
const NotificationTypeEnum = z.enum([
  'coach_note',
  'plan_assigned',
  'targets_updated',
  'subscription_updated',
  'freeze_decided',
  'measurement_added',
  'assessment_reviewed',
  'freeze_requested',
  'assessment_submitted',
  'checkin_requested',
  'checkin_submitted',
  'checkin_reviewed',
  'message_received',
  'trial_expiring',
  'plan_change_requested',
  'plan_decided',
  'coach_assigned',
  'client_released',
]);

const CreateBody = z.object({
  forRole: z.enum(['client', 'coach']),
  type: NotificationTypeEnum,
  body: z.string().optional(),
  screen: z.enum(['nutrition', 'workout', 'cardio', 'progress', 'measurements', 'photos']).optional(),
  date: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  route: z.string().optional(),
});

const SeenBody = z.object({ seenAt: z.number().optional() });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST', 'PATCH', 'DELETE');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await notificationsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const forRole = typeof req.query.forRole === 'string' ? req.query.forRole : undefined;
      const filter: Record<string, unknown> = { clientId };
      if (forRole === 'client' || forRole === 'coach') filter.forRole = forRole;
      const list = await col.find(filter).sort({ createdAt: -1 }).limit(100).toArray();
      res.status(200).json(list);
      return;
    }

    if (req.method === 'POST') {
      if (!(await canWriteClientOrCoach(user, clientId))) throw new HttpError(403, 'Forbidden');
      const body = CreateBody.parse(req.body);
      const now = Date.now();
      const doc: AppNotificationDoc = {
        _id: crypto.randomUUID(),
        clientId,
        forRole: body.forRole,
        type: body.type,
        seenAt: null,
        createdAt: now,
        createdBy: user.id,
        updatedAt: now,
      };
      if (body.body) doc.body = body.body;
      if (body.screen) doc.screen = body.screen;
      if (body.date) doc.date = body.date;
      if (body.entityType) doc.entityType = body.entityType as AppNotificationDoc['entityType'];
      if (body.entityId) doc.entityId = body.entityId;
      if (body.route) doc.route = body.route;
      await col.insertOne(doc);
      res.status(201).json(doc);
      return;
    }

    const id = typeof req.query.id === 'string' ? req.query.id : undefined;
    if (!id) throw new HttpError(400, 'id is required');
    if (!(await canWriteClientOrCoach(user, clientId))) throw new HttpError(403, 'Forbidden');

    if (req.method === 'PATCH') {
      const body = SeenBody.parse(req.body ?? {});
      const now = Date.now();
      await col.updateOne({ _id: id, clientId }, { $set: { seenAt: body.seenAt ?? now, updatedAt: now } });
      const updated = await col.findOne({ _id: id, clientId });
      if (!updated) throw new HttpError(404, 'Notification not found');
      res.status(200).json(updated);
      return;
    }

    // DELETE
    await col.deleteOne({ _id: id, clientId });
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
