import { collection, getDocs, query, where } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { COACH_PLAN_TIERS, coachPlanState, listAllCoachPlans, type CoachTierKey } from './coachPlanApi';
import type { CoachPlan, UserRecord } from '@/types';

export interface CoachAdminRow {
  coach: UserRecord;
  plan: CoachPlan | null;
  state: 'trial' | 'active' | 'expired' | 'suspended' | 'none';
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
}

/** Super-admin aggregate over all coaches + their Layer-A plans (2 reads). */
export async function fetchCoachAdmin(): Promise<CoachAdminData> {
  const { db } = ensureFirebase();
  const [usersSnap, plans] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('role', '==', 'coach'))),
    listAllCoachPlans(),
  ]);
  const now = Date.now();
  const planMap = new Map(plans.map((p) => [p.coachId, p]));
  const rows: CoachAdminRow[] = usersSnap.docs.map((d) => {
    const coach = d.data() as UserRecord;
    const plan = planMap.get(coach.id) ?? null;
    return { coach, plan, state: coachPlanState(plan, now) };
  });

  let trialCoaches = 0, activeCoaches = 0, expiredCoaches = 0, suspendedCoaches = 0, totalClients = 0, trackedRevenue = 0, converted = 0;
  for (const r of rows) {
    totalClients += r.plan?.activeClientCount ?? 0;
    if (r.state === 'trial') trialCoaches += 1;
    else if (r.state === 'active') activeCoaches += 1;
    else if (r.state === 'expired') expiredCoaches += 1;
    else if (r.state === 'suspended') suspendedCoaches += 1;
    if (r.plan && r.plan.plan !== 'trial') converted += 1;
    if (r.state === 'active' && r.plan && r.plan.plan !== 'trial') {
      trackedRevenue += COACH_PLAN_TIERS[r.plan.plan as CoachTierKey]?.priceMonthly ?? 0;
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
    top: [...rows].sort((a, b) => (b.plan?.activeClientCount ?? 0) - (a.plan?.activeClientCount ?? 0)).slice(0, 6),
  };
}
