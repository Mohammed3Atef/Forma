import { collection, getDocs, query, where } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { coachPlanState, listAllCoachPlans } from './coachPlanApi';
import { listCoachPlanTiers } from './coachPlanTiersApi';
import type { CoachPlan, CoachPlanTierConfig, UserRecord } from '@/types';

export interface CoachAdminRow {
  coach: UserRecord;
  plan: CoachPlan | null;
  state: 'trial' | 'active' | 'expired' | 'suspended' | 'none';
  /** REAL count of non-disabled clients assigned to this coach (not the
   *  drift-prone maintained `plan.activeClientCount`). */
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
  conversionRate: number; // % of coaches who moved off trial to a paid tier
  recent: CoachAdminRow[];
  top: CoachAdminRow[];
  tiers: CoachPlanTierConfig[]; // active (non-archived) tier configs for labels/pricing
}

/**
 * Super-admin aggregate over all coaches + their Layer-A plans, with REAL
 * per-coach client counts derived from ACTIVE `coachClients` relationships —
 * the same source the coach's own list uses (`listRelationshipsForCoach`) —
 * rather than the maintained `activeClientCount` counter, which can drift. 3 reads.
 */
export async function fetchCoachAdmin(): Promise<CoachAdminData> {
  const { db } = ensureFirebase();
  const [usersSnap, plans, relSnap, allTiers] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('role', '==', 'coach'))),
    listAllCoachPlans(),
    getDocs(query(collection(db, 'coachClients'), where('status', '==', 'active'))),
    listCoachPlanTiers(true),
  ]);
  const now = Date.now();
  const planMap = new Map(plans.map((p) => [p.coachId, p]));
  const priceByKey = new Map(allTiers.map((tr) => [tr.key, tr.priceMonthly]));

  // Real client counts = active coach↔client relationships, grouped by coach.
  const clientsByCoach = new Map<string, number>();
  let totalClients = 0;
  for (const d of relSnap.docs) {
    const rel = d.data() as { coachId?: string };
    if (!rel.coachId) continue;
    clientsByCoach.set(rel.coachId, (clientsByCoach.get(rel.coachId) ?? 0) + 1);
    totalClients += 1;
  }

  const rows: CoachAdminRow[] = usersSnap.docs.map((d) => {
    const coach = d.data() as UserRecord;
    const plan = planMap.get(coach.id) ?? null;
    return { coach, plan, state: coachPlanState(plan, now), clientCount: clientsByCoach.get(coach.id) ?? 0 };
  });

  let trialCoaches = 0, activeCoaches = 0, expiredCoaches = 0, suspendedCoaches = 0, trackedRevenue = 0, converted = 0;
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
  return {
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
    tiers: allTiers.filter((tr) => !tr.archived),
  };
}
