import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedure } from '../trpc.js';
import { usersCol } from '../../_lib/mongodb.js';
import { toPublicUser, type PublicUser } from '../../_lib/types.js';
import { coachClientsCol, coachPlansCol, coachPlanTiersCol } from '../../admin/_lib/db.js';
import type { CoachPlanDoc, CoachPlanTierDoc } from '../../admin/_lib/types.js';
import { coachPlanState } from '../../admin/_lib/subscription.js';

/** Port of `src/services/platform/adminCoachesApi.ts`'s `fetchCoachAdmin()`. */
export interface CoachAdminRow {
  coach: PublicUser;
  plan: CoachPlanDoc | null;
  state: 'trial' | 'active' | 'expired' | 'suspended' | 'none';
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

/** Complements `list`'s aggregate — single-coach detail (also used as a super-admin fallback read of a coach's plan; see coachPlanApi.ts's getCoachPlan). */
export interface CoachDetail {
  coach: PublicUser;
  plan: CoachPlanDoc | null;
  state: 'trial' | 'active' | 'expired' | 'suspended' | 'none';
  clients: PublicUser[];
}

export const adminCoachesRouter = router({
  /**
   * Super-admin-only: a full per-coach admin rollup (plan/tier/capacity/
   * revenue for EVERY coach on the platform). Was gated on `users.read`,
   * which even the `coach` role holds per `rbac.ts` — tightened to match the
   * frontend, which already restricts the whole `AdminCoaches` page to
   * super_admin.
   */
  list: roleProcedure('super_admin')
    .input(z.object({ search: z.string().trim().max(200).optional() }).optional())
    .query(async ({ input }): Promise<CoachAdminData> => {
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
    // `coachPlans` docs are keyed by `_id` == coachId — they never actually
    // carry a separate `coachId` field (only `PublicCoachPlan`, the API
    // response shape, synthesizes one). Keying this map by `p.coachId` (as the
    // pre-migration REST handler also did — this bug predates the tRPC
    // migration) meant `p.coachId` was always `undefined`, so every coach's
    // plan/tier/state/maxClients silently rendered as null/"none" here.
    const planMap = new Map(plans.map((p) => [p._id, p]));
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
    const recent = [...rows].sort((a, b) => b.coach.createdAt - a.coach.createdAt).slice(0, 6);
    const top = [...rows].sort((a, b) => b.clientCount - a.clientCount).slice(0, 6);

    // Search narrows only the `rows` the AdminCoaches list table renders — the
    // KPI totals and the Overview dashboard's `recent`/`top` widgets above are
    // already computed from the full, unfiltered set, so they never fluctuate
    // as the admin types a search term. Runs server-side over every coach on
    // the platform (not just whatever page/scroll position the client has
    // loaded), same guarantee `adminUsers.list`'s search already gives.
    const search = input?.search?.trim().toLowerCase();
    const visibleRows = search
      ? rows.filter((r) => r.coach.displayName?.toLowerCase().includes(search) || r.coach.email?.toLowerCase().includes(search))
      : rows;

    return {
      rows: visibleRows,
      totalCoaches: total,
      trialCoaches,
      activeCoaches,
      expiredCoaches,
      suspendedCoaches,
      totalClients,
      trackedRevenue,
      conversionRate: total ? Math.round((converted / total) * 100) : 0,
      recent,
      top,
      tiers: allTiers.filter((t) => !t.archived),
    };
  }),

  /**
   * Super-admin-only single-coach detail. Also used as `getCoachPlan()`'s
   * fallback when a super admin (not the coach themself) views another
   * coach's plan — a coach reading their OWN plan always succeeds on
   * `coachPlans.me` first and never reaches this fallback, so tightening
   * this to super_admin doesn't affect a coach's own plan page.
   */
  detail: roleProcedure('super_admin')
    .input(z.object({ id: z.string().trim().min(1) }))
    .query(async ({ input }): Promise<CoachDetail> => {
      const users = await usersCol();
      const plansCol = await coachPlansCol();
      const relCol = await coachClientsCol();

      const coachDoc = await users.findOne({ _id: input.id, role: 'coach' });
      if (!coachDoc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Coach not found' });

      const [plan, relDocs] = await Promise.all([
        plansCol.findOne({ _id: input.id }),
        relCol.find({ coachId: input.id, status: 'active' }).toArray(),
      ]);

      const clientIds = relDocs.map((r) => r.clientId);
      const clientDocs = clientIds.length ? await users.find({ _id: { $in: clientIds } }).toArray() : [];

      return {
        coach: toPublicUser(coachDoc),
        plan: plan ?? null,
        state: coachPlanState(plan ?? null, Date.now()),
        clients: clientDocs.map(toPublicUser),
      };
    }),
});
