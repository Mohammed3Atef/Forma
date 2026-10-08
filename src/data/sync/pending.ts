import { getDataSource } from '../dataSource';
import type { Repository } from '../repositories';
import { listTombstones } from './tombstones';
import { listConflicts } from './conflicts';

const SYNCED = ['workoutLogs', 'nutritionLogs', 'cardioLogs', 'weightLogs', 'measurementLogs', 'progressPhotos', 'dailyChecklists', 'reminders'] as const;

/**
 * How many local changes of the OPEN account haven't reached the server yet
 * (unsynced records + pending deletions + unresolved conflicts). Shown before
 * sign-out (B0 / PWA-02) — they stay safely in this account's own database and
 * sync the next time the account signs in on this device.
 */
export async function countPendingChanges(): Promise<number> {
  const ds = getDataSource() as unknown as Record<string, Repository<{ id: string; dirty?: boolean; startedAt?: number | null; finished?: boolean }>>;
  let n = 0;
  for (const c of SYNCED) {
    const all = await ds[c].getAll();
    n += all.filter((r) => r.dirty && !(c === 'workoutLogs' && !r.startedAt && !r.finished)).length;
  }
  n += (await listTombstones()).length;
  n += (await listConflicts()).length;
  return n;
}
