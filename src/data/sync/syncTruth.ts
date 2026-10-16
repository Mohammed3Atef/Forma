import { create } from 'zustand';
import { getDataSource } from '@/data/dataSource';
import type { Repository } from '@/data/repositories';
import { currentLocalOwner } from '@/data/localScope';
import { onLocalChange } from '@/data/localChanges';
import { listTombstones } from './tombstones';
import { countRejectedFor, readRejected, SUBSCRIPTION_READ_ONLY, SYNC_COLLECTIONS } from './contract';
import type { OutboxOp } from '@/data/outbox/outbox';

/**
 * ONE truthful sync-state derivation (B1.7 / PWA-11). Before B1 "Synced" meant
 * only "the last sync pass finished" — it ignored unsynced edits, pending
 * deletions, conflicts, queued messages and being offline.
 *
 * "Synced" now means: every change made on this device has been ACKNOWLEDGED
 * by the server — no dirty record, no pending deletion, nothing queued in the
 * outbox, nothing refused, no conflict. It is never derived from
 * `navigator.onLine` or from a local write completing.
 *
 * User-facing states (the copy lives in i18n `trust.syncState.*`):
 *   synced          Synced
 *   syncing         Syncing…
 *   waiting         Waiting to sync          (online, changes not acknowledged yet)
 *   saved_on_device Saved on this device     (offline, changes kept locally)
 *   failed          Sync failed              (refused by the server / repeated error)
 *   conflict        Needs your choice        (edited on two devices)
 * A single local write additionally shows "Saving…" → "Saved" where it happens
 * (`localWriteLabel`) — that is NOT a sync claim.
 */
export type SyncTruthState = 'synced' | 'syncing' | 'waiting' | 'saved_on_device' | 'failed' | 'conflict';

export interface SyncTruthInput {
  /** This session runs the tracker sync engine (client role). Coaches only have an outbox. */
  clientSync: boolean;
  online: boolean;
  /** A sync pass is running. */
  syncing: boolean;
  /** Last completed pass (this session); null = not yet. */
  lastSync: number | null;
  /** The last pass failed. */
  syncError: boolean;
  /** Dirty records + pending deletions on this device. */
  pendingLocal: number;
  /** Records the server refused under the contract. */
  rejected: number;
  conflicts: number;
  outbox: OutboxCounts;
}
export interface OutboxCounts {
  /** queued, waiting for network, or retrying by itself */
  pending: number;
  sending: number;
  /** refused — needs the user */
  failed: number;
}

export function deriveSyncTruth(i: SyncTruthInput): SyncTruthState {
  if (i.conflicts > 0) return 'conflict';
  if (i.rejected > 0 || i.outbox.failed > 0) return 'failed';
  if (i.clientSync && i.online && i.syncError) return 'failed';
  if (i.online && (i.syncing || i.outbox.sending > 0)) return 'syncing';
  const pending = i.pendingLocal + i.outbox.pending + i.outbox.sending;
  // Nothing has been acknowledged this session yet → not "Synced" either.
  const unconfirmed = pending > 0 || (i.clientSync && i.lastSync == null);
  if (unconfirmed) return i.online ? 'waiting' : 'saved_on_device';
  return 'synced';
}

export function outboxCounts(ops: OutboxOp[]): OutboxCounts {
  let pending = 0;
  let sending = 0;
  let failed = 0;
  for (const o of ops) {
    if (o.status === 'acknowledged') continue;
    if (o.status === 'sending') sending += 1;
    else if (o.status === 'failed_permanent') failed += 1;
    else pending += 1;
  }
  return { pending, sending, failed };
}

/** The per-write label a screen shows next to a local-first edit. Never a sync claim. */
export function localWriteLabel(state: 'saving' | 'saved' | 'failed'): 'trust.syncState.saving' | 'trust.syncState.saved' | 'trust.local.saveFailed' {
  return state === 'saving' ? 'trust.syncState.saving' : state === 'saved' ? 'trust.syncState.saved' : 'trust.local.saveFailed';
}

// ---- live counts of what this device still owes the server ------------------

interface PendingState {
  pendingLocal: number;
  rejected: number;
  /** Of `rejected`: logs dated outside the coaching subscription (B3.0.1) — explained separately. */
  rejectedReadOnly: number;
}
export const usePendingSync = create<PendingState>(() => ({ pendingLocal: 0, rejected: 0, rejectedReadOnly: 0 }));

/** Unsynced records + pending deletions in the OPEN account's database (conflicts counted separately). */
export async function countUnsyncedLocal(): Promise<number> {
  const ds = getDataSource() as unknown as Record<string, Repository<{ id: string; dirty?: boolean; startedAt?: number | null; finished?: boolean }>>;
  let n = 0;
  for (const c of SYNC_COLLECTIONS) {
    const all = await ds[c].getAll();
    n += all.filter((r) => r.dirty && !(c === 'workoutLogs' && !r.startedAt && !r.finished)).length;
  }
  return n + (await listTombstones()).length;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
/** Re-count (debounced). Called on every local change, after a sync pass and on account switches. */
export function refreshPendingSync(delayMs = 250): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const owner = currentLocalOwner();
    const gen = ++generation;
    if (!owner) {
      usePendingSync.setState({ pendingLocal: 0, rejected: 0, rejectedReadOnly: 0 });
      return;
    }
    void Promise.all([countUnsyncedLocal(), readRejected()])
      .then(([pendingLocal, rejected]) => {
        if (gen !== generation || currentLocalOwner() !== owner) return; // switched meanwhile
        usePendingSync.setState({ pendingLocal, rejected: Object.keys(rejected).length, rejectedReadOnly: countRejectedFor(rejected, SUBSCRIPTION_READ_ONLY) });
      })
      .catch(() => undefined);
  }, delayMs);
}

onLocalChange(() => refreshPendingSync());
