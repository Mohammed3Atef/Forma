import { getDb } from '../_lib/mongodb.js';
import type { Role } from '../_lib/types.js';

/** Backend-local mirror of `src/services/platform/usageApi.ts`'s collections. */
export interface ActiveDayDoc {
  _id: string; // `${day}__${uid}`
  day: string;
  uid: string;
  role: Role;
  ts: number;
}

export interface UsageStatsDoc {
  _id: string; // day (YYYY-MM-DD), == doc id
  day: string;
  searches?: number;
  updatedAt: number;
}

export const DAY_MS = 86_400_000;
export const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);

export async function activeDaysCol() {
  return (await getDb()).collection<ActiveDayDoc>('activeDays');
}

export async function usageStatsCol() {
  return (await getDb()).collection<UsageStatsDoc>('usageStats');
}
