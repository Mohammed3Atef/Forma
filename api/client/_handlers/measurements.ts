import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, canWriteClientOrCoach, resolveClientId } from '../_lib/access.js';
import { measurementLogsCol } from '../_lib/db.js';
import { notify } from '../_lib/notify.js';
import type { MeasurementLogDoc } from '../_lib/types.js';

/**
 * Port of `coachApi.fetchClientMeasurements/saveClientMeasurement` —
 * `clientData/{clientId}/measurementLogs/{date}`. NOT in `isCoachOwnedColl`
 * (so the client keeps their normal own-write), but a dedicated rule ALSO
 * grants the assigned coach / admin(clients.writeAll) write.
 */
const Body = z.object({ date: z.string(), values: z.record(z.string(), z.number()) });

function logId(clientId: string, date: string): string {
  return `${clientId}__${date}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT', 'DELETE');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await measurementLogsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      if (date) {
        const doc = await col.findOne({ _id: logId(clientId, date) });
        res.status(200).json(doc ?? null);
        return;
      }
      const list = await col.find({ clientId }).sort({ date: 1 }).toArray();
      res.status(200).json(list);
      return;
    }

    if (req.method === 'PUT') {
      if (!(await canWriteClientOrCoach(user, clientId))) throw new HttpError(403, 'Forbidden');
      const body = Body.parse(req.body);
      const _id = logId(clientId, body.date);
      const existing = await col.findOne({ _id });
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(body.values)) {
        if (typeof v === 'number' && !Number.isNaN(v) && v > 0) clean[k] = v;
      }
      const now = Date.now();
      const log: MeasurementLogDoc = {
        _id,
        clientId,
        date: body.date,
        values: { ...existing?.values, ...clean },
        updatedAt: now,
      };
      await col.replaceOne({ _id }, log, { upsert: true });
      // Mirrors `saveClientMeasurement`, which is coach-initiated — only notify
      // the client when someone OTHER than the client themself made the write.
      if (user.id !== clientId) {
        await notify({ clientId, forRole: 'client', type: 'measurement_added', screen: 'measurements', date: body.date, createdBy: user.id });
      }
      res.status(200).json(log);
      return;
    }

    // DELETE
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!date) throw new HttpError(400, 'date is required');
    if (!(await canWriteClientOrCoach(user, clientId))) throw new HttpError(403, 'Forbidden');
    await col.deleteOne({ _id: logId(clientId, date) });
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
