import { trpc } from '@/services/trpc';
import type { SubscriptionStatus } from '@/types';

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

/**
 * Platform growth + money aggregate for the admin: weekly signup trend (last 8
 * weeks), new-member deltas, client-subscription MRR + breakdown, and clients
 * whose subscription ends within 7 days. Computed server-side by `adminGrowth.get`.
 */
export async function fetchGrowth(): Promise<GrowthData> {
  return trpc.adminGrowth.get.query();
}
