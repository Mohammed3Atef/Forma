import { trpc } from '@/services/trpc';
import type { FeatureFlag } from '@/types';

export async function listFlags(): Promise<FeatureFlag[]> {
  return trpc.flags.list.query();
}

/** Upserts a flag by id; the API records the audit entry. */
export async function saveFlag(flag: FeatureFlag): Promise<void> {
  await trpc.flags.save.mutate({
    id: flag.id,
    enabled: flag.enabled,
    scope: flag.scope,
    targetId: flag.targetId,
  });
}
