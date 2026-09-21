import { trpc } from '@/services/trpc';
import type { Role, Subscription, SubscriptionStatus, UserRecord } from '@/types';

const DAY = 86_400_000;

export interface MemberRow {
  user: UserRecord;
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

/**
 * Super-admin/admin member console aggregate: every user + (for clients) their
 * coach and Layer-B subscription, with join-date segments, a client-subscription
 * breakdown, and an "expiring within 7 days" list. Computed server-side by
 * `adminMembers.get`. `search` (name/email/phone) narrows `rows` server-side
 * over the whole collection — the KPI totals stay based on the full set.
 */
export async function fetchMembers(search?: string): Promise<MembersData> {
  return trpc.adminMembers.get.query(search?.trim() ? { search: search.trim() } : undefined) as Promise<MembersData>;
}

export type MemberSegment = 'all' | 'week' | 'month' | 'older';
export function inSegment(createdAt: number, seg: MemberSegment, now = Date.now()): boolean {
  if (seg === 'all') return true;
  if (seg === 'week') return createdAt >= now - 7 * DAY;
  if (seg === 'month') return createdAt >= now - 30 * DAY;
  return createdAt < now - 30 * DAY; // older
}

export type { Role };
