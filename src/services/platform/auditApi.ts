import { trpc } from '@/services/trpc';
import type { AuditLog } from '@/types';

/**
 * Records an admin action. Best-effort: a failed audit write must never block
 * the primary operation (true tamper-proofing needs a Cloud Function — see the
 * plan). The acting user/role is derived server-side from the verified
 * session, never sent by the client.
 */
export async function writeAudit(entry: {
  action: string;
  targetUserId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await trpc.adminAudit.create.mutate({
      action: entry.action,
      targetUserId: entry.targetUserId,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.warn('[audit] write failed (non-fatal):', e);
  }
}

export interface AuditPage {
  logs: AuditLog[];
  /** Opaque pagination cursor returned by `adminAudit.list` (an encoded `createdAt:id` string), or `null` on the last page. */
  cursor: string | null;
}

export interface AuditFilters {
  /** Exact actor user id. */
  actorId?: string;
  /** Exact target user id. */
  targetUserId?: string;
  /** An exact action key, or a bare category prefix (e.g. "users" matches "users.*"). */
  action?: string;
  since?: number;
  until?: number;
}

export async function fetchAuditPage(pageSize = 25, after?: string | null, filters?: AuditFilters): Promise<AuditPage> {
  return trpc.adminAudit.list.query({ pageSize, cursor: after ?? undefined, ...filters }) as Promise<AuditPage>;
}
