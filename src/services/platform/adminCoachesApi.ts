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
  /** Forma MRR from coach subscriptions with a confirmed payment (never anything from a coach's clients). */
  trackedRevenue: number;
  /** Active paid plans with no confirmed payment on record — not counted. */
  unconfirmedPaidCoaches: number;
  conversionRate: number; // % of coaches who moved from the Trial to the paid subscription
  /** Confirmed subscription revenue per month (each coach's confirmed snapshot price). */
  recent: CoachAdminRow[];
  top: CoachAdminRow[];
  /** Monthly recurring revenue from active monthly capacity add-ons. */
  /** Monthly add-ons bought through a confirmed request, per month. */
  capacityRevenue: number;
  /** Active add-ons a Super Admin granted directly (no payment on record) — not counted. */
  grantedAddons: number;
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
