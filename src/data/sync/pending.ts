import { useOutbox } from '../outbox/outbox';
import { listConflicts } from './conflicts';
import { countUnsyncedLocal } from './syncTruth';

/**
 * How many changes of the OPEN account haven't been acknowledged by the server
 * (unsynced records + pending deletions + unresolved conflicts + queued sends
 * in the outbox). Shown before sign-out (B0 / PWA-02) — they stay safely in
 * this account's own database and are delivered the next time the account
 * signs in on this device.
 */
export async function countPendingChanges(): Promise<number> {
  const queued = useOutbox.getState().ops.filter((o) => o.status !== 'acknowledged').length;
  return (await countUnsyncedLocal()) + (await listConflicts()).length + queued;
}
