import { z } from 'zod';
import { router, permissionProcedure } from '../trpc.js';
import { usersCol } from '../../_lib/mongodb.js';
import { toPublicUser, type PublicUser, type Role } from '../../_lib/types.js';
import { coachClientsCol } from '../../admin/_lib/db.js';
import type { Subscription, SubscriptionStatus } from '../../admin/_lib/types.js';
import { DAY, WEEK, effectiveSubscriptionStatus, emptySubs, inSegment, monthlyOf, type MemberSegment } from '../../admin/_lib/subscription.js';

/** Port of `src/services/platform/analyticsApi.ts`'s `fetchPlatformStats()`. */
export interface PlatformStats {
  total: number;
  byRole: Record<Role, number>;
  pending: number;
  suspended: number;
}

export const adminStatsRouter = router({
  get: permissionProcedure('users.read').query(async (): Promise<PlatformStats> => {
    const users = await usersCol();
    const [total, superAdmin, admin, coach, client, pending, suspended] = await Promise.all([
      users.countDocuments({}),
      users.countDocuments({ role: 'super_admin' }),
      users.countDocuments({ role: 'admin' }),
      users.countDocuments({ role: 'coach' }),
      users.countDocuments({ role: 'client' }),
      users.countDocuments({ accountStatus: 'pending' }),
      users.countDocuments({ accountStatus: 'suspended' }),
    ]);
    return { total, byRole: { super_admin: superAdmin, admin, coach, client }, pending, suspended };
  }),
});

/** Port of `src/services/platform/adminMembersApi.ts`'s `fetchMembers()`. */
export interface MemberRow {
  user: PublicUser;
  coachId?: string;
  subscription?: Subscription;
  subState?: SubscriptionStatus | 'none';
}

export interface MembersData {
  rows: MemberRow[];
  total: number;
  newThisWeek: number;
  newThisMonth: number;
  subs: Record<SubscriptionStatus | 'none', number>;
  expiringSoon: MemberRow[];
}

export const adminMembersRouter = router({
  get: permissionProcedure('users.read')
    .input(z.object({ segment: z.enum(['all', 'week', 'month', 'older']).optional() }).optional())
    .query(async ({ input }): Promise<MembersData> => {
      const users = await usersCol();
      const coachClients = await coachClientsCol();
      const [userDocs, relDocs] = await Promise.all([users.find({}).toArray(), coachClients.find({ status: 'active' }).toArray()]);

      const now = Date.now();
      const linkByClient = new Map<string, { coachId: string; subscription?: Subscription }>();
      for (const r of relDocs) linkByClient.set(r.clientId, { coachId: r.coachId, subscription: r.subscription });

      const rowsAll: MemberRow[] = userDocs
        .map((d) => {
          const link = d.role === 'client' ? linkByClient.get(d._id) : undefined;
          const subscription = link?.subscription;
          const subState = d.role === 'client' ? effectiveSubscriptionStatus(subscription, now) : undefined;
          return { user: toPublicUser(d), coachId: link?.coachId, subscription, subState };
        })
        .sort((a, b) => b.user.createdAt - a.user.createdAt);

      const subs = emptySubs();
      const expiringSoon: MemberRow[] = [];
      for (const r of rowsAll) {
        if (r.user.role !== 'client') continue;
        const st = (r.subState ?? 'none') as SubscriptionStatus | 'none';
        subs[st] += 1;
        if (r.subscription && (st === 'trial' || st === 'active')) {
          const left = r.subscription.endAt - now;
          if (left > 0 && left <= 7 * DAY) expiringSoon.push(r);
        }
      }
      expiringSoon.sort((a, b) => a.subscription!.endAt - b.subscription!.endAt);

      const segParam: MemberSegment = input?.segment ?? 'all';
      const rows = segParam === 'all' ? rowsAll : rowsAll.filter((r) => inSegment(r.user.createdAt, segParam, now));

      return {
        rows,
        total: rowsAll.length,
        newThisWeek: rowsAll.filter((r) => r.user.createdAt >= now - 7 * DAY).length,
        newThisMonth: rowsAll.filter((r) => r.user.createdAt >= now - 30 * DAY).length,
        subs,
        expiringSoon,
      };
    }),
});

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
  expiringClients: ExpiringClient[];
}

export const adminGrowthRouter = router({
  get: permissionProcedure('users.read').query(async (): Promise<GrowthData> => {
    const users = await usersCol();
    const coachClients = await coachClientsCol();
    const [userDocs, relDocs] = await Promise.all([users.find({}).toArray(), coachClients.find({ status: 'active' }).toArray()]);

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
            expiringClients.push({ clientId: r.clientId, name: nameById.get(r.clientId) ?? r.clientId, coachId: r.coachId, endAt: sub.endAt, days: Math.max(0, Math.ceil(left / DAY)) });
          }
        }
      }
    }
    expiringClients.sort((a, b) => a.endAt - b.endAt);

    return {
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
  }),
});
