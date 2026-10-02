import { trpc } from '@/services/trpc';
import type { CoachPlan, UserRecord } from '@/types';

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
  conversionRate: number; // % of coaches who moved from the Trial to the paid subscription
  /** Confirmed subscription revenue per month (each coach's confirmed snapshot price). */
  recent: CoachAdminRow[];
  top: CoachAdminRow[];
  /** Monthly recurring revenue from active monthly capacity add-ons. */
  capacityRevenue: number;
  /** Coaches above their effective client limit. */
  overCapacityCoaches: number;
  forma: { priceMonthly: number; currency: string; maxClients: number; termDays: number };
}

/**
 * Super-admin aggregate over all coaches + their Layer-A plans, with REAL
 * per-coach client counts derived from ACTIVE `coachClients` relationships.
 * Computed server-side by `adminCoaches.list`. `search` (name/email) narrows
 * `rows` server-side over every coach on the platform — the KPI totals and
 * the Overview dashboard's `recent`/`top` stay based on the full set.
 */
export async function fetchCoachAdmin(search?: string): Promise<CoachAdminData> {
  return trpc.adminCoaches.list.query(search?.trim() ? { search: search.trim() } : undefined) as Promise<CoachAdminData>;
}
