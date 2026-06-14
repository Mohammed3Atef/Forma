import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import localforage from 'localforage';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { getDataSource } from '@/data/dataSource';
import type { Repository, SingletonRepository } from '@/data/repositories';
import type { AppSettings, UserProfile } from '@/types';
import { clearAllTombstones, clearTombstone, listTombstones } from './tombstones';

/**
 * Conflict-safe one-way-then-merge sync between the local store (source of
 * truth while offline) and Firestore. Strategy: last-write-wins by `updatedAt`.
 *
 *  push(): upload every locally-`dirty` record, then clear its dirty flag.
 *  pull(): download remote records and overwrite local ones that are older.
 *
 * Every pushed doc gets a server-set `syncedAt` timestamp, and incremental
 * pulls cursor on THAT (not on `updatedAt`, which is the editing device's
 * clock at edit time — a device that edits offline and uploads hours later
 * would otherwise be permanently missed by everyone else's watermark).
 *
 * Deletions are mirrored as marker docs in `users/{uid}/deletions` so OTHER
 * devices can apply them locally too; a record edited after its deletion
 * timestamp survives (edit-wins).
 *
 * Only runs when the user has opted into cloud sync and is signed in. Reads in
 * the app always come from the local store, so the UI is unaffected by sync.
 */

type Dirty = { id: string; updatedAt: number; dirty?: boolean };

interface DeletionMarker {
  collection: string;
  id: string;
  deletedAt: number;
}

/** Cursor store for incremental pulls (one server-time watermark per user). */
const syncMeta = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
/**
 * Re-scan a window before the last cursor so a write committing concurrently
 * with a pull (its `syncedAt` just below our watermark) can't be permanently
 * missed. Re-pulled docs are cheap and de-duped by the updatedAt comparison.
 */
const PULL_MARGIN_MS = 10 * 60_000;

/** Recursively drop `undefined` values — Firestore rejects them. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

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

  private path(name: string): string {
    return `users/${this.uid}/${name}`;
  }

  async pushCollection(name: CollName): Promise<number> {
    const { db } = ensureFirebase();
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
    for (const rec of dirty) {
      // `dirty` is local bookkeeping; `syncedAt` is the server-side watermark
      // other devices cursor on (added AFTER stripUndefined so the sentinel
      // FieldValue object isn't mangled by the recursive copy).
      const payload = {
        ...(stripUndefined({ ...rec, dirty: undefined }) as Record<string, unknown>),
        syncedAt: serverTimestamp(),
      };
      await setDoc(doc(db, this.path(name), rec.id), payload);
      // Compare-and-set: the user may have edited the record during the network
      // round-trip. Only clear the dirty flag if it's unchanged — otherwise the
      // newer edit stays dirty and syncs next pass (the old code rewrote the
      // stale snapshot here, silently losing the concurrent edit).
      const cur = await repo.get(rec.id);
      if (cur && cur.updatedAt === rec.updatedAt) {
        await repo.put({ ...cur, dirty: false });
      }
    }
    return dirty.length;
  }

  async pullCollection(
    name: CollName,
    since: number,
  ): Promise<{ pulled: number; maxSyncedAt: number }> {
    const { db } = ensureFirebase();
    const repo = repoFor(name);
    const coll = collection(db, this.path(name));
    // First sync (since = 0) pulls everything; afterwards only docs uploaded
    // since the last cursor, so we don't re-read the whole collection each time.
    const snap = await getDocs(
      since > 0 ? query(coll, where('syncedAt', '>', Timestamp.fromMillis(since))) : coll,
    );
    let pulled = 0;
    let maxSyncedAt = 0;
    for (const d of snap.docs) {
      const { syncedAt, ...remote } = d.data() as Dirty & { syncedAt?: Timestamp };
      if (syncedAt) maxSyncedAt = Math.max(maxSyncedAt, syncedAt.toMillis());
      const local = await repo.get(remote.id);
      if (!local || remote.updatedAt > local.updatedAt) {
        await repo.put({ ...remote, dirty: false });
        pulled += 1;
      }
    }
    return { pulled, maxSyncedAt };
  }

  /** Sync the profile + settings singletons (last-write-wins by updatedAt). */
  private async syncSingleton<T extends { updatedAt: number }>(
    path: string,
    repo: SingletonRepository<T>,
  ): Promise<void> {
    const { db } = ensureFirebase();
    const ref = doc(db, path);
    const [local, remoteSnap] = await Promise.all([repo.get(), getDoc(ref)]);
    const remote = remoteSnap.exists() ? (remoteSnap.data() as T) : null;
    if (local && (!remote || local.updatedAt > remote.updatedAt)) {
      await setDoc(ref, stripUndefined(local) as Record<string, unknown>);
    } else if (remote && (!local || remote.updatedAt > local.updatedAt)) {
      await repo.set(remote);
    }
  }

  /**
   * Push queued local deletions to the cloud: delete the data doc AND write a
   * deletion marker so other devices remove their local copies too. The local
   * tombstone is only cleared when both cloud writes succeed — a transient
   * failure keeps it queued for the next pass (the old code cleared it
   * unconditionally, so one failure resurrected the record forever).
   */
  async flushDeletions(): Promise<number> {
    const { db } = ensureFirebase();
    const tombs = await listTombstones();
    let flushed = 0;
    for (const t of tombs) {
      try {
        const marker: Record<string, unknown> = {
          collection: t.collection,
          id: t.id,
          deletedAt: t.deletedAt ?? Date.now(),
          syncedAt: serverTimestamp(),
        };
        await setDoc(doc(db, this.path('deletions'), `${t.collection}__${t.id}`), marker);
        await deleteDoc(doc(db, `users/${this.uid}/${t.collection}/${t.id}`));
        await clearTombstone(t.collection, t.id);
        flushed += 1;
      } catch {
        /* keep the tombstone; retried next sync */
      }
    }
    return flushed;
  }

  /**
   * Apply deletions performed on OTHER devices: remove the local copy unless
   * it was edited after the deletion (edit-wins, so a delete can't silently
   * discard newer data).
   */
  async pullDeletions(since: number): Promise<{ applied: number; maxSyncedAt: number }> {
    const { db } = ensureFirebase();
    const coll = collection(db, this.path('deletions'));
    const snap = await getDocs(
      since > 0 ? query(coll, where('syncedAt', '>', Timestamp.fromMillis(since))) : coll,
    );
    let applied = 0;
    let maxSyncedAt = 0;
    for (const d of snap.docs) {
      const { syncedAt, ...marker } = d.data() as DeletionMarker & { syncedAt?: Timestamp };
      if (syncedAt) maxSyncedAt = Math.max(maxSyncedAt, syncedAt.toMillis());
      if (!(COLLECTIONS as readonly string[]).includes(marker.collection)) continue;
      const repo = repoFor(marker.collection as CollName);
      const local = await repo.get(marker.id);
      if (local && local.updatedAt <= marker.deletedAt) {
        await repo.remove(marker.id);
        applied += 1;
      }
    }
    return { applied, maxSyncedAt };
  }

  /** Delete ALL of this user's cloud data (used by "reset all data"). */
  async wipeCloud(): Promise<void> {
    const { db } = ensureFirebase();
    // Include legacy/auxiliary collections that may exist in older accounts.
    const names = [...COLLECTIONS, 'videoAssets', 'deletions'];
    for (const name of names) {
      const snap = await getDocs(collection(db, `users/${this.uid}/${name}`));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }
    await deleteDoc(doc(db, `users/${this.uid}/profile/main`)).catch(() => undefined);
    await deleteDoc(doc(db, `users/${this.uid}/settings/app`)).catch(() => undefined);
    await clearAllTombstones();
    await syncMeta.removeItem(`pullCursor:${this.uid}`);
    await syncMeta.removeItem(`pullCursorV2:${this.uid}`);
  }

  /** Full bidirectional sync pass. */
  async sync(): Promise<SyncResult> {
    if (!navigator.onLine) return { pushed: 0, pulled: 0, offline: true };
    const ds = getDataSource();
    // V2 cursor keys on the server-set `syncedAt` watermark. (The legacy
    // `pullCursor` keyed on local-clock `updatedAt` and is intentionally
    // abandoned: starting V2 at 0 forces one full re-pull, which also picks up
    // any docs the old watermark logic missed.)
    const cursorKey = `pullCursorV2:${this.uid}`;
    const lastPulled = (await syncMeta.getItem<number>(cursorKey)) ?? 0;
    const since = lastPulled > 0 ? Math.max(0, lastPulled - PULL_MARGIN_MS) : 0;
    let maxSyncedAt = lastPulled;
    // Local deletions FIRST, so pulling can't re-add records we just deleted;
    // then remote deletions, so we don't pull docs another device removed.
    await this.flushDeletions();
    const remoteDeletes = await this.pullDeletions(since);
    maxSyncedAt = Math.max(maxSyncedAt, remoteDeletes.maxSyncedAt);
    await this.syncSingleton<UserProfile>(`users/${this.uid}/profile/main`, ds.profile);
    await this.syncSingleton<AppSettings>(`users/${this.uid}/settings/app`, ds.settings);
    let pushed = 0;
    let pulled = remoteDeletes.applied;
    for (const name of COLLECTIONS) {
      const res = await this.pullCollection(name, since);
      pulled += res.pulled;
      maxSyncedAt = Math.max(maxSyncedAt, res.maxSyncedAt);
      pushed += await this.pushCollection(name);
    }
    // Advance the watermark only after a fully successful pass (a throw above
    // leaves it untouched, so the next sync retries the same window). The
    // cursor is the max SERVER timestamp observed, never this device's clock.
    await syncMeta.setItem(cursorKey, maxSyncedAt);
    return { pushed, pulled };
  }
}
