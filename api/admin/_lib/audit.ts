import crypto from 'node:crypto';
import { auditLogsCol } from './db.js';
import type { AuthedUser } from '../../_lib/withAuth.js';

/**
 * Best-effort append-only audit write — mirrors `src/services/platform/auditApi.ts`'s
 * `writeAudit()`: a failed audit write must never block the primary admin
 * operation (real tamper-proofing would need a privileged writer, e.g. a
 * Cloud Function equivalent — out of scope here).
 */
export async function writeAudit(
  actor: AuthedUser,
  action: string,
  targetUserId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const col = await auditLogsCol();
    await col.insertOne({
      _id: crypto.randomUUID(),
      actorId: actor.id,
      actorRole: actor.role,
      action,
      targetUserId,
      metadata,
      createdAt: Date.now(),
    });
  } catch (e) {
    console.warn('[audit] write failed (non-fatal):', e);
  }
}
