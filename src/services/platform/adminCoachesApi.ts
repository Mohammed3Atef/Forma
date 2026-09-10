import { apiGet } from '@/services/platformApi';
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
 * per-coach client counts derived from ACTIVE `coachClients` relationships.
 * Computed server-side by `GET /api/admin/coaches`.
 */
export async function fetchCoachAdmin(): Promise<CoachAdminData> {
  return apiGet<CoachAdminData>('/admin/coaches');
}
