import { apiGet } from '@/services/platformApi';
import type { Role } from '@/types';

export interface PlatformStats {
  total: number;
  byRole: Record<Role, number>;
  pending: number;
  suspended: number;
}

/** Aggregate account counts, computed server-side by `GET /api/admin/stats`. */
export async function fetchPlatformStats(): Promise<PlatformStats> {
  return apiGet<PlatformStats>('/admin/stats');
}
