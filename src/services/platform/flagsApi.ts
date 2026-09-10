import { apiGet, apiPut } from '@/services/platformApi';
import type { FeatureFlag } from '@/types';

export async function listFlags(): Promise<FeatureFlag[]> {
  return apiGet<FeatureFlag[]>('/banners/flags');
}

/** Upserts a flag by id; the API records the audit entry. */
export async function saveFlag(flag: FeatureFlag): Promise<void> {
  await apiPut('/banners/flags', {
    id: flag.id,
    enabled: flag.enabled,
    scope: flag.scope,
    targetId: flag.targetId,
  });
}
