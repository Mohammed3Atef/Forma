import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { useSession } from '@/services/auth/sessionStore';
import type { AuditLog } from '@/types';

const AUDIT = 'adminAuditLogs';

/**
 * Records an admin action. Best-effort: a failed audit write must never block
 * the primary operation (true tamper-proofing needs a Cloud Function — see the
 * plan). The acting user is read from the session; rules require
 * `actorId == request.auth.uid`.
 */
export async function writeAudit(entry: {
  action: string;
  targetUserId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const account = useSession.getState().account;
    if (!account) return;
    const { db } = ensureFirebase();
    await addDoc(collection(db, AUDIT), {
      actorId: account.id,
      actorRole: account.role,
      action: entry.action,
      targetUserId: entry.targetUserId,
      metadata: entry.metadata ?? {},
      createdAt: Date.now(),
    });
  } catch (e) {
    console.warn('[audit] write failed (non-fatal):', e);
  }
}

export interface AuditPage {
  logs: AuditLog[];
  cursor: QueryDocumentSnapshot | null;
}

export async function fetchAuditPage(pageSize = 25, after?: QueryDocumentSnapshot | null): Promise<AuditPage> {
  const { db } = ensureFirebase();
  const q = after
    ? query(collection(db, AUDIT), orderBy('createdAt', 'desc'), startAfter(after), limit(pageSize))
    : query(collection(db, AUDIT), orderBy('createdAt', 'desc'), limit(pageSize));
  const snap = await getDocs(q);
  const logs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }));
  const cursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;
  return { logs, cursor };
}
