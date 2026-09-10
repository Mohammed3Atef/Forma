import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../_lib/mongodb.js';
import { requireActive, requirePermission, requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { toPublicUser, type PublicUser } from '../_lib/types.js';
import { coachClientsCol } from './_lib/db.js';
import type { Subscription, SubscriptionStatus } from './_lib/types.js';
import { DAY, effectiveSubscriptionStatus, emptySubs, inSegment, type MemberSegment } from './_lib/subscription.js';

/** Port of `src/services/platform/adminMembersApi.ts`'s `fetchMembers()`. */
export interface MemberRow {
  user: PublicUser;
  /** For clients: the coach they're assigned to (from the active relationship). */
  coachId?: string;
  /** For clients: their Layer-B coaching subscription (if any). */
  subscription?: Subscription;
  /** Effective client subscription state, folding the date in. */
  subState?: SubscriptionStatus | 'none';
}

export interface MembersData {
  rows: MemberRow[];
  total: number;
  newThisWeek: number;
  newThisMonth: number;
  /** Client-subscription breakdown (clients only). */
  subs: Record<SubscriptionStatus | 'none', number>;
  /** Clients whose active/trial subscription ends within 7 days (soonest first). */
  expiringSoon: MemberRow[];
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

    // Optional convenience filter over the returned `rows` list; every
    // aggregate above is always computed over the FULL set, matching the
    // Firestore-era `fetchMembers()` (segment filtering there is UI-side only).
    const segParam = typeof req.query.segment === 'string' ? (req.query.segment as MemberSegment) : 'all';
    const rows = segParam === 'all' ? rowsAll : rowsAll.filter((r) => inSegment(r.user.createdAt, segParam, now));

    const data: MembersData = {
      rows,
      total: rowsAll.length,
      newThisWeek: rowsAll.filter((r) => r.user.createdAt >= now - 7 * DAY).length,
      newThisMonth: rowsAll.filter((r) => r.user.createdAt >= now - 30 * DAY).length,
      subs,
      expiringSoon,
    };
    res.status(200).json(data);
  } catch (e) {
    handleError(res, e);
  }
}
