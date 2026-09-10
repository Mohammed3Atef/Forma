import localforage from 'localforage';
import { apiGet, apiPost, apiPut } from '@/services/platformApi';
import { getDataSource } from '@/data/dataSource';
import type { Repository, SingletonRepository } from '@/data/repositories';
import type { AppSettings, UserProfile } from '@/types';
import { clearAllTombstones, clearTombstone, listTombstones } from './tombstones';

/**
 * Conflict-safe one-way-then-merge sync between the local store (source of
 * truth while offline) and the Mongo-backed `/api/sync/*` endpoints. Strategy:
 * last-write-wins by `updatedAt`.
 *
 *  push(): upload every locally-`dirty` record, then clear its dirty flag.
 *  pull(): download remote records and overwrite local ones that are older.
 *
 * Every pushed batch gets a server-set `syncedAt` timestamp, and incremental
 * pulls cursor on THAT (not on `updatedAt`, which is the editing device's
 * clock at edit time — a device that edits offline and uploads hours later
 * would otherwise be permanently missed by everyone else's watermark).
 *
 * Deletions are mirrored as marker docs (`api/sync/deletions/*`) so OTHER
 * devices can apply them locally too; a record edited after its deletion
 * timestamp survives (edit-wins).
 *
 * This replaced a Firestore-backed version (see docs/MONGO_MIGRATION_PLAN.md)
 * — the class shape and every public method are unchanged so `cloudStore.ts`
 * didn't need to change how it calls this.
 */

type Dirty = { id: string; updatedAt: number; dirty?: boolean };

/** Cursor store for incremental pulls (one server-time watermark per user, per collection). */
const syncMeta = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
/**
 * Re-scan a window before the last cursor so a write committing concurrently
 * with a pull (its `syncedAt` just below our watermark) can't be permanently
 * missed. Re-pulled docs are cheap and de-duped by the updatedAt comparison.
 */
const PULL_MARGIN_MS = 10 * 60_000;

const COLLECTIONS = [
  'workoutLogs',
  'nutritionLogs',
  'cardioLogs',
  'weightLogs',
  'measurementLogs',
  'progressPhotos',
  'dailyChecklists',
  // NB: 'videoAssets' is deliberately NOT synced — the type has no dirty flag,
  // video blobs are device-local, and the seed manages the records.
  'reminders',
] as const;

type CollName = (typeof COLLECTIONS)[number];

function repoFor(name: CollName): Repository<Dirty> {
  const ds = getDataSource() as unknown as Record<CollName, Repository<Dirty>>;
  return ds[name];
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  /** True when the pass was skipped because the device is offline. */
  offline?: boolean;
}

export class SyncEngine {
  constructor(private uid: string) {}

  private cursorKey(name: string): string {
    return `pullCursorV3:${this.uid}:${name}`;
  }

  async pushCollection(name: CollName): Promise<number> {
    const repo = repoFor(name);
    const all = await repo.getAll();
    // Unstarted, unfinished workout sessions are local-only scratch — never push
    // them, so the cloud only ever holds real (started/finished) workouts.
    const isDraft = (r: Dirty) => {
      if (name !== 'workoutLogs') return false;
      const w = r as unknown as { startedAt?: number | null; finished?: boolean };
      return !w.startedAt && !w.finished;
    };
    const dirty = all.filter((r) => r.dirty && !isDraft(r));
    if (dirty.length === 0) return 0;
    const { syncedAt: _unused } = await apiPost<{ pushed: number; syncedAt: number }>('/sync/push', {
      collection: name,
      records: dirty.map((rec) => ({ id: rec.id, updatedAt: rec.updatedAt, data: { ...rec, dirty: undefined } })),
    });
    void _unused;
    // Compare-and-set: the user may have edited the record during the network
    // round-trip. Only clear the dirty flag if it's unchanged — otherwise the
    // newer edit stays dirty and syncs next pass.
    for (const rec of dirty) {
      const cur = await repo.get(rec.id);
      if (cur && cur.updatedAt === rec.updatedAt) {
        await repo.put({ ...cur, dirty: false });
      }
    }
    return dirty.length;
  }

  async pullCollection(name: CollName, since: number): Promise<{ pulled: number; maxSyncedAt: number }> {
    const repo = repoFor(name);
    const res = await apiGet<{ records: { id: string; updatedAt: number; data: Record<string, unknown> }[]; maxSyncedAt: number }>(
      `/sync/pull?collection=${encodeURIComponent(name)}&since=${since}`,
    );
    let pulled = 0;
    for (const rec of res.records) {
      const remote = rec.data as unknown as Dirty;
      const local = await repo.get(rec.id);
      if (!local || remote.updatedAt > local.updatedAt) {
        await repo.put({ ...remote, dirty: false });
        pulled += 1;
      }
    }
    return { pulled, maxSyncedAt: res.maxSyncedAt };
  }

  /** Sync the profile + settings singletons (last-write-wins by updatedAt). */
  private async syncSingleton<T extends { updatedAt: number }>(name: 'profile' | 'settings', repo: SingletonRepository<T>): Promise<void> {
    const [local, remote] = await Promise.all([
      repo.get(),
      apiGet<{ data: T; updatedAt: number } | null>(`/sync/singleton?name=${name}`),
    ]);
    if (local && (!remote || local.updatedAt > remote.updatedAt)) {
      await apiPut(`/sync/singleton`, { name, data: local, updatedAt: local.updatedAt });
    } else if (remote && (!local || remote.updatedAt > local.updatedAt)) {
      await repo.set(remote.data);
    }
  }

  /**
   * Push queued local deletions to the cloud: delete the data doc AND write a
   * deletion marker so other devices remove their local copies too. The local
   * tombstone is only cleared when the flush succeeds — a transient failure
   * keeps it queued for the next pass.
   */
  async flushDeletions(): Promise<number> {
    const tombs = await listTombstones();
    if (tombs.length === 0) return 0;
    try {
      await apiPost('/sync/deletions/push', {
        deletions: tombs.map((t) => ({ collection: t.collection, id: t.id, deletedAt: t.deletedAt ?? Date.now() })),
      });
    } catch {
      return 0; // keep every tombstone; retried next sync
    }
    let flushed = 0;
    for (const t of tombs) {
      await clearTombstone(t.collection, t.id);
      flushed += 1;
    }
    return flushed;
  }

  /**
   * Apply deletions performed on OTHER devices: remove the local copy unless
   * it was edited after the deletion (edit-wins, so a delete can't silently
   * discard newer data).
   */
  async pullDeletions(since: number): Promise<{ applied: number; maxSyncedAt: number }> {
    const res = await apiGet<{ deletions: { collection: string; id: string; deletedAt: number }[]; maxSyncedAt: number }>(
      `/sync/deletions/pull?since=${since}`,
    );
    let applied = 0;
    for (const marker of res.deletions) {
      if (!(COLLECTIONS as readonly string[]).includes(marker.collection)) continue;
      const repo = repoFor(marker.collection as CollName);
      const local = await repo.get(marker.id);
      if (local && local.updatedAt <= marker.deletedAt) {
        await repo.remove(marker.id);
        applied += 1;
      }
    }
    return { applied, maxSyncedAt: res.maxSyncedAt };
  }

  /** Delete ALL of this user's cloud data (used by "reset all data"). */
  async wipeCloud(): Promise<void> {
    await apiPost('/sync/wipe');
    await clearAllTombstones();
    for (const name of [...COLLECTIONS, 'profile', 'settings']) {
      await syncMeta.removeItem(this.cursorKey(name));
    }
  }

  /** Full bidirectional sync pass. */
  async sync(): Promise<SyncResult> {
    if (!navigator.onLine) return { pushed: 0, pulled: 0, offline: true };
    const ds = getDataSource();
    const deletionsCursorKey = this.cursorKey('deletions');
    const lastDeletionsPulled = (await syncMeta.getItem<number>(deletionsCursorKey)) ?? 0;
    const deletionsSince = lastDeletionsPulled > 0 ? Math.max(0, lastDeletionsPulled - PULL_MARGIN_MS) : 0;
    // Local deletions FIRST, so pulling can't re-add records we just deleted;
    // then remote deletions, so we don't pull docs another device removed.
    await this.flushDeletions();
    const remoteDeletes = await this.pullDeletions(deletionsSince);
    await syncMeta.setItem(deletionsCursorKey, Math.max(lastDeletionsPulled, remoteDeletes.maxSyncedAt));
    await this.syncSingleton<UserProfile>('profile', ds.profile);
    await this.syncSingleton<AppSettings>('settings', ds.settings);
    let pushed = 0;
    let pulled = remoteDeletes.applied;
    for (const name of COLLECTIONS) {
      const cursorKey = this.cursorKey(name);
      const lastPulled = (await syncMeta.getItem<number>(cursorKey)) ?? 0;
      const since = lastPulled > 0 ? Math.max(0, lastPulled - PULL_MARGIN_MS) : 0;
      const res = await this.pullCollection(name, since);
      pulled += res.pulled;
      // Advance the watermark only after a fully successful pull for this
      // collection (a throw above leaves it untouched, so the next sync
      // retries the same window).
      await syncMeta.setItem(cursorKey, Math.max(lastPulled, res.maxSyncedAt));
      pushed += await this.pushCollection(name);
    }
    return { pushed, pulled };
  }
}
