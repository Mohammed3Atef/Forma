import { apiGet, apiPost } from '@/services/platformApi';
import type { Role } from '@/types';

/**
 * Record that a signed-in user was active today (idempotent per user/day).
 * The API derives the acting uid/role from the verified session; `uid`/`role`
 * are still accepted here for signature compatibility with existing callers.
 */
export async function recordActiveDay(uid: string, role: Role): Promise<void> {
  await apiPost('/banners/usage/active-day', { uid, role });
}

/** Increment a platform usage counter for today (best-effort telemetry). */
export async function bumpUsage(field: 'searches'): Promise<void> {
  try {
    await apiPost('/banners/usage/bump', { field });
  } catch {
    /* non-fatal */
  }
}

export interface UsageData {
  dau: number;
  wau: number;
  mau: number;
  activeTrend: { label: string; value: number }[];
  searches7d: number;
}

/** Admin usage aggregate: activeDays (last 30d) + usageStats (last 7d). Computed server-side. */
export async function fetchUsage(): Promise<UsageData> {
  return apiGet<UsageData>('/banners/usage');
}
