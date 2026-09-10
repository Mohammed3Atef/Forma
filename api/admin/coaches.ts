import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../_lib/mongodb.js';
import { requireActive, requirePermission, requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { toPublicUser, type PublicUser } from '../_lib/types.js';
import { coachClientsCol, coachPlansCol, coachPlanTiersCol } from './_lib/db.js';
import type { CoachPlanDoc, CoachPlanTierDoc } from './_lib/types.js';
import { coachPlanState } from './_lib/subscription.js';

/** Port of `src/services/platform/adminCoachesApi.ts`'s `fetchCoachAdmin()`. */
export interface CoachAdminRow {
  coach: PublicUser;
  plan: CoachPlanDoc | null;
  state: 'trial' | 'active' | 'expired' | 'suspended' | 'none';
  /** REAL count of active `coachClients` relationships (not the drift-prone `plan.activeClientCount`). */
  clientCount: number;
}

export interface CoachAdminData {
  rows: CoachAdminRow[];
  totalCoaches: number;
  trialCoaches: number;
  activeCoaches: number;
  expiredCoaches: number;
  suspendedCoaches: number;
  totalClients: number;
  trackedRevenue: number;
  conversionRate: number;
  recent: CoachAdminRow[];
  top: CoachAdminRow[];
  tiers: CoachPlanTierDoc[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);
    requirePermission(user, 'users.read');

    const users = await usersCol();
    const plansCol = await coachPlansCol();
    const relCol = await coachClientsCol();
    const tiersCol = await coachPlanTiersCol();

    const [coachDocs, plans, relDocs, allTiers] = await Promise.all([
      users.find({ role: 'coach' }).toArray(),
      plansCol.find({}).toArray(),
      relCol.find({ status: 'active' }).toArray(),
      tiersCol.find({}).toArray(),
    ]);

    const now = Date.now();
    const planMap = new Map(plans.map((p) => [p.coachId, p]));
    const priceByKey = new Map(allTiers.map((t) => [t.key, t.priceMonthly]));

    const clientsByCoach = new Map<string, number>();
    let totalClients = 0;
    for (const rel of relDocs) {
      if (!rel.coachId) continue;
      clientsByCoach.set(rel.coachId, (clientsByCoach.get(rel.coachId) ?? 0) + 1);
      totalClients += 1;
    }

    const rows: CoachAdminRow[] = coachDocs.map((d) => {
      const plan = planMap.get(d._id) ?? null;
      return { coach: toPublicUser(d), plan, state: coachPlanState(plan, now), clientCount: clientsByCoach.get(d._id) ?? 0 };
    });

    let trialCoaches = 0;
    let activeCoaches = 0;
    let expiredCoaches = 0;
    let suspendedCoaches = 0;
    let trackedRevenue = 0;
    let converted = 0;
    for (const r of rows) {
      if (r.state === 'trial') trialCoaches += 1;
      else if (r.state === 'active') activeCoaches += 1;
      else if (r.state === 'expired') expiredCoaches += 1;
      else if (r.state === 'suspended') suspendedCoaches += 1;
      if (r.plan && r.plan.plan !== 'trial') converted += 1;
      if (r.state === 'active' && r.plan && r.plan.plan !== 'trial') {
        trackedRevenue += priceByKey.get(r.plan.plan) ?? 0;
      }
    }
    const total = rows.length;

    const data: CoachAdminData = {
      rows,
      totalCoaches: total,
      trialCoaches,
      activeCoaches,
      expiredCoaches,
      suspendedCoaches,
      totalClients,
      trackedRevenue,
      conversionRate: total ? Math.round((converted / total) * 100) : 0,
      recent: [...rows].sort((a, b) => b.coach.createdAt - a.coach.createdAt).slice(0, 6),
      top: [...rows].sort((a, b) => b.clientCount - a.clientCount).slice(0, 6),
      tiers: allTiers.filter((t) => !t.archived),
    };
    res.status(200).json(data);
  } catch (e) {
    handleError(res, e);
  }
}
