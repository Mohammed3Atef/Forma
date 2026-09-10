import crypto from 'node:crypto';
import { getDb } from '../_lib/mongodb.js';
import type { Role } from '../_lib/types.js';

/**
 * Backend-local mirror of `src/services/platform/flagsApi.ts`'s `FeatureFlag`
 * shape (`featureFlags` collection, `_id` == flagId).
 */
export type FeatureFlagScope = 'global' | 'coach' | 'client';

export interface FeatureFlagDoc {
  _id: string;
  enabled: boolean;
  scope: FeatureFlagScope;
  /** uid the flag applies to when scope is 'coach' | 'client'. */
  targetId?: string;
  updatedAt: number;
}

export interface PublicFeatureFlag {
  id: string;
  enabled: boolean;
  scope: FeatureFlagScope;
  targetId?: string;
  updatedAt: number;
}

export function toPublicFlag(d: FeatureFlagDoc): PublicFeatureFlag {
  return { id: d._id, enabled: d.enabled, scope: d.scope, targetId: d.targetId, updatedAt: d.updatedAt };
}

export async function flagsCol() {
  return (await getDb()).collection<FeatureFlagDoc>('featureFlags');
}

interface AuditLogDoc {
  _id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  targetUserId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

/** Best-effort audit write for flag changes — mirrors `flagsApi.saveFlag()`'s `writeAudit()` call. */
export async function writeFlagAudit(
  actor: { id: string; role: Role },
  flagId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const col = (await getDb()).collection<AuditLogDoc>('adminAuditLogs');
    await col.insertOne({
      _id: crypto.randomUUID(),
      actorId: actor.id,
      actorRole: actor.role,
      action: 'flag.update',
      targetUserId: flagId,
      metadata,
      createdAt: Date.now(),
    });
  } catch (e) {
    console.warn('[audit] write failed (non-fatal):', e);
  }
}
