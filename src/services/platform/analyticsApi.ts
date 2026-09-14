import { trpc } from '@/services/trpc';
import type { Role } from '@/types';

export interface PlatformStats {
  total: number;
  byRole: Record<Role, number>;
  pending: number;
  suspended: number;
}

/** Aggregate account counts, computed server-side by `adminStats.get`. */
export async function fetchPlatformStats(): Promise<PlatformStats> {
  return trpc.adminStats.get.query();
}
