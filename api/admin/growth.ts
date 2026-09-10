import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../_lib/mongodb';
import { requireActive, requirePermission, requireUser } from '../_lib/withAuth';
import { handleError, methodGuard } from '../_lib/http';
import { coachClientsCol } from './_lib/db';
import type { SubscriptionStatus } from './_lib/types';
import { DAY, WEEK, effectiveSubscriptionStatus, emptySubs, monthlyOf } from './_lib/subscription';

/** Port of `src/services/platform/adminGrowthApi.ts`'s `fetchGrowth()`. */
export interface GrowthPoint { label: string; value: number }
export interface ExpiringClient { clientId: string; name: string; coachId: string; endAt: number; days: number }

export interface GrowthData {
  totalMembers: number;
  newThisWeek: number;
  newPrevWeek: number;
  newThisMonth: number;
  signupSeries: GrowthPoint[];
  clientMrr: number;
  currency: string;
  subBreakdown: Record<SubscriptionStatus | 'none', number>;
  /** Active/trial client subscriptions ending within 7 days (soonest first). */
  expiringClients: ExpiringClient[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);
    requirePermission(user, 'users.read');

    const users = await usersCol();
    const coachClients = await coachClientsCol();
    const [userDocs, relDocs] = await Promise.all([
      users.find({}).toArray(),
      coachClients.find({ status: 'active' }).toArray(),
    ]);

    const now = Date.now();
    const nameById = new Map(userDocs.map((u) => [u._id, u.displayName || u.email]));

    const WEEKS = 8;
    const signupSeries: GrowthPoint[] = [];
    for (let i = WEEKS - 1; i >= 0; i -= 1) {
      const start = now - (i + 1) * WEEK;
      const end = now - i * WEEK;
      const value = userDocs.filter((u) => u.createdAt >= start && u.createdAt < end).length;
      const d = new Date(end);
      signupSeries.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value });
    }

    const newThisWeek = userDocs.filter((u) => u.createdAt >= now - WEEK).length;
    const newPrevWeek = userDocs.filter((u) => u.createdAt >= now - 2 * WEEK && u.createdAt < now - WEEK).length;
    const newThisMonth = userDocs.filter((u) => u.createdAt >= now - 30 * DAY).length;

    let clientMrr = 0;
    let currency = 'EGP';
    const subBreakdown = emptySubs();
    const expiringClients: ExpiringClient[] = [];
    for (const r of relDocs) {
      const sub = r.subscription;
      const st = effectiveSubscriptionStatus(sub, now);
      subBreakdown[st] += 1;
      if (sub) {
        if (sub.currency) currency = sub.currency;
        if (st === 'trial' || st === 'active') {
          clientMrr += monthlyOf(sub);
          const left = sub.endAt - now;
          if (left > 0 && left <= WEEK) {
            expiringClients.push({
              clientId: r.clientId,
              name: nameById.get(r.clientId) ?? r.clientId,
              coachId: r.coachId,
              endAt: sub.endAt,
              days: Math.max(0, Math.ceil(left / DAY)),
            });
          }
        }
      }
    }
    expiringClients.sort((a, b) => a.endAt - b.endAt);

    const data: GrowthData = {
      totalMembers: userDocs.length,
      newThisWeek,
      newPrevWeek,
      newThisMonth,
      signupSeries,
      clientMrr: Math.round(clientMrr),
      currency,
      subBreakdown,
      expiringClients,
    };
    res.status(200).json(data);
  } catch (e) {
    handleError(res, e);
  }
}
