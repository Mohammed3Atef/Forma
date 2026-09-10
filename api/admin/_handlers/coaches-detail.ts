import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../../_lib/mongodb.js';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { toPublicUser, type PublicUser } from '../../_lib/types.js';
import { coachClientsCol, coachPlansCol } from '../_lib/db.js';
import type { CoachPlanDoc } from '../_lib/types.js';
import { coachPlanState } from '../_lib/subscription.js';

/** Single-coach detail view, complementing `fetchCoachAdmin()`'s list (api/admin/coaches.ts). */
export interface CoachDetail {
  coach: PublicUser;
  plan: CoachPlanDoc | null;
  state: 'trial' | 'active' | 'expired' | 'suspended' | 'none';
  /** Coach's currently-active clients (from `coachClients`). */
  clients: PublicUser[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);
    requirePermission(user, 'users.read');

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) throw new HttpError(400, 'Missing coach id');

    const users = await usersCol();
    const plansCol = await coachPlansCol();
    const relCol = await coachClientsCol();

    const coachDoc = await users.findOne({ _id: id, role: 'coach' });
    if (!coachDoc) throw new HttpError(404, 'Coach not found');

    const [plan, relDocs] = await Promise.all([
      plansCol.findOne({ _id: id }),
      relCol.find({ coachId: id, status: 'active' }).toArray(),
    ]);

    const clientIds = relDocs.map((r) => r.clientId);
    const clientDocs = clientIds.length ? await users.find({ _id: { $in: clientIds } }).toArray() : [];

    const data: CoachDetail = {
      coach: toPublicUser(coachDoc),
      plan: plan ?? null,
      state: coachPlanState(plan ?? null, Date.now()),
      clients: clientDocs.map(toPublicUser),
    };
    res.status(200).json(data);
  } catch (e) {
    handleError(res, e);
  }
}
