import { apiGet, apiPost } from '@/services/platformApi';
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
    await apiPost('/admin/audit', {
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
  /** Opaque pagination cursor returned by `/api/admin/audit` (an encoded `createdAt:id` string), or `null` on the last page. */
  cursor: string | null;
}

export async function fetchAuditPage(pageSize = 25, after?: string | null): Promise<AuditPage> {
  const qs = new URLSearchParams({ pageSize: String(pageSize) });
  if (after != null) qs.set('cursor', after);
  return apiGet<AuditPage>(`/admin/audit?${qs.toString()}`);
}
