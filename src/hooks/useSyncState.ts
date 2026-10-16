import { useMemo } from 'react';
import { useCloud } from '@/services/auth/cloudStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSyncConflicts } from '@/data/sync/conflicts';
import { useOutbox } from '@/data/outbox/outbox';
import { deriveSyncTruth, outboxCounts, usePendingSync, type SyncTruthState } from '@/data/sync/syncTruth';

export interface SyncState {
  state: SyncTruthState;
  /** Changes on this device the server hasn't acknowledged (records, deletions, queued sends). */
  pending: number;
  conflicts: number;
  /** Items the server refused + outbox sends that need the user. */
  failed: number;
  /** Of `failed`: logs refused because their day was outside the coaching subscription (B3.0.1). */
  failedReadOnly: number;
  lastSync: number | null;
  online: boolean;
  /** Start a sync pass now (client role; no-op otherwise). */
  syncNow: () => void;
}

/** The one place screens read sync truth from (B1.7). */
export function useSyncState(): SyncState {
  const online = useOnlineStatus();
  const clientSync = useCloud((s) => !!s.user);
  const syncing = useCloud((s) => s.syncing);
  const lastSync = useCloud((s) => s.lastSync);
  const syncError = useCloud((s) => !!s.error);
  const syncNowFn = useCloud((s) => s.syncNow);
  const pendingLocal = usePendingSync((s) => s.pendingLocal);
  const rejected = usePendingSync((s) => s.rejected);
  const rejectedReadOnly = usePendingSync((s) => s.rejectedReadOnly);
  const conflicts = useSyncConflicts((s) => s.conflicts.length);
  const ops = useOutbox((s) => s.ops);
  const outbox = useMemo(() => outboxCounts(ops), [ops]);
  const state = deriveSyncTruth({ clientSync, online, syncing, lastSync, syncError, pendingLocal, rejected, conflicts, outbox });
  return {
    state,
    pending: pendingLocal + outbox.pending + outbox.sending,
    conflicts,
    failed: rejected + outbox.failed,
    failedReadOnly: rejectedReadOnly,
    lastSync,
    online,
    syncNow: () => {
      if (clientSync) void syncNowFn(true);
    },
  };
}
