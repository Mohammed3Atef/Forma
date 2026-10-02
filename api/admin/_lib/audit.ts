import crypto from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { auditLogsCol } from './db.js';
import type { AuthedUser } from '../../_trpc/context.js';

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

/**
 * Transactional audit write — part of the caller's transaction, so a
 * commercial state change (payment confirmed, capacity granted/removed,
 * manual adjustment) and its audit row commit or roll back TOGETHER. Unlike
 * `writeAudit`, a failure here propagates and aborts the transaction.
 */
export async function writeAuditTx(
  actor: Pick<AuthedUser, 'id' | 'role'> | { id: 'system'; role: 'system' },
  action: string,
  targetUserId: string,
  metadata: Record<string, unknown>,
  session: ClientSession,
): Promise<void> {
  const col = await auditLogsCol();
  await col.insertOne(
    { _id: crypto.randomUUID(), actorId: actor.id, actorRole: actor.role as AuthedUser['role'], action, targetUserId, metadata, createdAt: Date.now() },
    { session },
  );
}
