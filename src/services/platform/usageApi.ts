import { trpc } from '@/services/trpc';

/**
 * Record that a signed-in user was active today (idempotent per user/day).
 * The API derives the acting uid/role from the verified session.
 */
export async function recordActiveDay(): Promise<void> {
  await trpc.usage.recordActiveDay.mutate();
}

/** Increment a platform usage counter for today (best-effort telemetry). */
export async function bumpUsage(field: 'searches'): Promise<void> {
  try {
    await trpc.usage.bump.mutate({ field });
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
  return trpc.usage.fetch.query();
}
