import { currentLocalOwner, userStore } from '@/data/localScope';
import { trpc } from '@/services/trpc';
import { getDataSource } from '@/data/dataSource';
import type { Repository, SingletonRepository } from '@/data/repositories';
import type { AppSettings, UserProfile } from '@/types';
import { clearTombstone, listTombstones } from './tombstones';
import { hasConflict, recordConflict, sameContent, useSyncConflicts } from './conflicts';
import { PUSH_BATCH, SYNC_SCHEMA_VERSION, updateRejected, validatePulledRecord } from './contract';

/**
 * Conflict-safe sync between the local store (source of truth while offline)
 * and the Mongo-backed `trpc.sync.*` procedures.
 *
 * Strategy (B0 / PWA-06): server revisions, not device clocks. Every local
 * record remembers the server revision it is based on (`_rev`):
 *  push(): upload dirty records with that base; the server applies a write
 *          only on top of the revision the device saw. Anything else comes
 *          back as a conflict.
 *  pull(): take the server copy for clean records; a record with unsynced
 *          local edits whose server copy changed meanwhile becomes a CONFLICT
 *          the user resolves (see `conflicts.ts`) — never a silent overwrite
 *          in either direction.
 *
 * Every pushed batch gets a server-set `syncedAt` timestamp, and incremental
 * pulls cursor on THAT (not on `updatedAt`, which is the editing device's
 * clock at edit time — a device that edits offline and uploads hours later
 * would otherwise be permanently missed by everyone else's watermark).
 *
 * Deletions are mirrored as marker docs (`trpc.sync.deletionsPush`/
 * `deletionsPull`) so OTHER devices can apply them locally too; a record
 * edited after its deletion timestamp survives (edit-wins).
 *
 * This replaced a Firestore-backed version (see docs/MONGO_MIGRATION_PLAN.md)
 * — the class shape and every public method are unchanged so `cloudStore.ts`
 * didn't need to change how it calls this.
 */

/** `_remoteRev`: the latest revision whose CONTENT came from the server (another device) — see LocalRepository.put. */
type Dirty = { id: string; updatedAt: number; dirty?: boolean; _rev?: number; _remoteRev?: number };

/** Cursor store for incremental pulls (one server-time watermark per user, per collection). */
const syncMeta = {
  getItem: <T,>(k: string) => userStore('meta').getItem<T>(k),
  setItem: <T,>(k: string, v: T) => userStore('meta').setItem<T>(k, v),
  removeItem: (k: string) => userStore('meta').removeItem(k),
};
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
  'reminders',
] as const;

type CollName = (typeof COLLECTIONS)[number];

/**
 * Records computed on the device from other synced data (the daily checklist
 * is rebuilt from the day's logs on every load). Two devices always build
 * their own copy — a fresh device builds one before its first pull — so a
 * "conflict" on them carries no user decision: the server copy is adopted and
 * the stores recompute from the (separately synced, separately conflict-
 * checked) logs. Asking the user would show "changed on two devices" for
 * something nobody edited.
 */
const DERIVED: ReadonlySet<CollName> = new Set<CollName>(['dailyChecklists']);

function repoFor(name: CollName): Repository<Dirty> {
  const ds = getDataSource() as unknown as Record<CollName, Repository<Dirty>>;
  return ds[name];
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  /** Records parked for the user to resolve this pass. */
  conflicts?: number;
  /** True when the pass was skipped because the device is offline. */
  offline?: boolean;
  /** Local records the server refused under the contract (they stay on this device). */
  rejected?: number;
  /** Pulled records that were malformed or from a newer schema — NOT imported. */
  skipped?: number;
}

/** Thrown when the open account changed under a running pass — abort without writing anything further. */
export class SyncScopeChanged extends Error {
  constructor() {
    super('SYNC_SCOPE_CHANGED');
  }
}

export class SyncEngine {
  constructor(private uid: string) {}

  /** Every local read/write of a pass must target THIS account's database (B0 / PWA-02, PWA-04). */
  private guard(): void {
    if (currentLocalOwner() !== this.uid) throw new SyncScopeChanged();
  }

  // V4 (B0 / PWA-06): bumping the version makes every device do ONE full
  // re-pull, which tags each local record with its server revision.
  private cursorKey(name: string): string {
    return `pullCursorV4:${this.uid}:${name}`;
  }

  private conflicts = 0;
  /** Derived records replaced by the server copy this pass (counts as pulled, so the stores recompute). */
  private adopted = 0;
  private rejected = 0;
  private skipped = 0;

  async pushCollection(name: CollName): Promise<number> {
    this.guard();
    const repo = repoFor(name);
    const all = await repo.getAll();
    // Unstarted, unfinished workout sessions are local-only scratch — never push
    // them, so the cloud only ever holds real (started/finished) workouts.
    const isDraft = (r: Dirty) => {
      if (name !== 'workoutLogs') return false;
      const w = r as unknown as { startedAt?: number | null; finished?: boolean };
      return !w.startedAt && !w.finished;
    };
    const candidates = all.filter((r) => r.dirty && !isDraft(r));
    const dirty: Dirty[] = [];
    // A record waiting for the user's conflict decision is not pushed.
    for (const r of candidates) if (!(await hasConflict(name, r.id))) dirty.push(r);
    if (dirty.length === 0) return 0;
    let accepted = 0;
    for (let i = 0; i < dirty.length; i += PUSH_BATCH) accepted += await this.pushBatch(name, dirty.slice(i, i + PUSH_BATCH));
    return accepted;
  }

  private async pushBatch(name: CollName, dirty: Dirty[]): Promise<number> {
    const repo = repoFor(name);
    const res = await trpc.sync.push.mutate({
      collection: name,
      records: dirty.map((rec) => {
        const { dirty: _d, _rev, _remoteRev: _rr, ...data } = rec;
        return { id: rec.id, updatedAt: rec.updatedAt, data, baseRev: _rev ?? null, sv: SYNC_SCHEMA_VERSION };
      }),
    });
    this.guard();
    // Refused under the contract: kept on the device, remembered for the status (B1.7).
    const rejected = res.rejected ?? [];
    await updateRejected(name, rejected, res.accepted.map((a) => a.id));
    this.rejected += rejected.length;
    if (rejected.length) console.warn(`[sync] ${rejected.length} ${name} record(s) refused by the server:`, rejected.map((r) => r.reason).join(', '));
    const sent = new Map(dirty.map((r) => [r.id, r]));
    for (const acc of res.accepted) {
      // Compare-and-set: the user may have edited the record during the
      // network round-trip. Only clear the dirty flag if it's unchanged —
      // otherwise the newer edit stays dirty (now based on the new revision).
      const cur = await repo.get(acc.id);
      if (!cur) continue;
      const unchanged = cur.updatedAt === sent.get(acc.id)?.updatedAt;
      await repo.putFromSync({ ...cur, _rev: acc.rev, dirty: unchanged ? false : cur.dirty });
    }
    for (const c of res.conflicts) {
      const local = await repo.get(c.id);
      if (local && sameContent(local as unknown as Record<string, unknown>, c.data)) {
        await repo.putFromSync({ ...local, _rev: c.rev, dirty: false });
      } else if (DERIVED.has(name)) {
        await repo.putFromSync({ ...(c.data as unknown as Dirty), id: c.id, updatedAt: c.updatedAt, _rev: c.rev, _remoteRev: c.rev, dirty: false });
        this.adopted += 1;
      } else {
        await recordConflict(name, c.id, { data: c.data, updatedAt: c.updatedAt, rev: c.rev });
        this.conflicts += 1;
      }
    }
    return res.accepted.length;
  }

  async pullCollection(name: CollName, since: number): Promise<{ pulled: number; maxSyncedAt: number }> {
    const repo = repoFor(name);
    const res = await trpc.sync.pull.query({ collection: name, since });
    this.guard();
    const legacyCutoff = (await syncMeta.getItem<number>('migratedFromLegacy')) ?? null;
    let pulled = 0;
    for (const rec of res.records) {
      // Never import a malformed record or one from a newer schema (B1.7 / PWA-13).
      const skip = validatePulledRecord(name, rec);
      if (skip) {
        this.skipped += 1;
        console.warn(`[sync] skipped a ${name} record from the server (${skip}) — not imported`);
        continue;
      }
      const remote = rec.data as unknown as Dirty;
      const rev = rec.rev ?? 0;
      const local = await repo.get(rec.id);
      if (!local || (!local.dirty && local._rev !== rev)) {
        await repo.putFromSync({ ...remote, _rev: rev, _remoteRev: rev, dirty: false });
        pulled += 1;
        continue;
      }
      if (local._rev === rev || !local.dirty) continue; // already based on this revision
      // Unsynced local edits AND the server copy changed since they were made.
      if (sameContent(local as unknown as Record<string, unknown>, remote as unknown as Record<string, unknown>)) {
        await repo.putFromSync({ ...local, _rev: rev, dirty: false });
      } else if (DERIVED.has(name)) {
        await repo.putFromSync({ ...remote, _rev: rev, _remoteRev: rev, dirty: false });
        pulled += 1;
      } else if (local._rev === undefined && legacyCutoff != null && local.updatedAt <= legacyCutoff && local.updatedAt >= rec.updatedAt) {
        // One-time transition ONLY for edits migrated from the pre-revision
        // shared database: that edit is newer than the server copy it was
        // made on. (A record created on this device since then has no base at
        // all — e.g. a fresh tablet logging the same day — and is a conflict.)
        await repo.putFromSync({ ...local, _rev: rev });
      } else {
        await recordConflict(name, rec.id, { data: rec.data as Record<string, unknown>, updatedAt: rec.updatedAt, rev });
        this.conflicts += 1;
      }
    }
    return { pulled, maxSyncedAt: res.maxSyncedAt };
  }

  /** Sync the profile + settings singletons (last-write-wins by updatedAt). */
  private async syncSingleton<T extends { updatedAt: number }>(name: 'profile' | 'settings', repo: SingletonRepository<T>): Promise<void> {
    const [local, remote] = await Promise.all([repo.get(), trpc.sync.singletonGet.query({ name })]);
    if (local && (!remote || local.updatedAt > remote.updatedAt)) {
      await trpc.sync.singletonSet.mutate({ name, data: local, updatedAt: local.updatedAt });
    } else if (remote && (!local || remote.updatedAt > local.updatedAt)) {
      await repo.set(remote.data as T);
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
    let res: Awaited<ReturnType<typeof trpc.sync.deletionsPush.mutate>>;
    try {
      res = await trpc.sync.deletionsPush.mutate({
        deletions: tombs.map((t) => ({ collection: t.collection, id: t.id, deletedAt: t.deletedAt ?? Date.now(), ...(t.baseRev != null ? { baseRev: t.baseRev } : {}) })),
      });
    } catch {
      return 0; // keep every tombstone; retried next sync
    }
    this.guard();
    let flushed = 0;
    for (const t of tombs) {
      await clearTombstone(t.collection, t.id);
      flushed += 1;
    }
    // Refused deletes: the record was edited elsewhere after this device saw
    // it — the edit wins, so bring that copy back instead of losing it.
    for (const r of res.rejected ?? []) {
      if (!(COLLECTIONS as readonly string[]).includes(r.collection)) continue;
      await repoFor(r.collection as CollName).putFromSync({ ...(r.data as unknown as Dirty), _rev: r.rev, _remoteRev: r.rev, dirty: false });
    }
    return flushed;
  }

  /**
   * Apply deletions performed on OTHER devices: remove the local copy unless
   * it was edited after the deletion (edit-wins, so a delete can't silently
   * discard newer data).
   */
  async pullDeletions(since: number): Promise<{ applied: number; maxSyncedAt: number }> {
    const res = await trpc.sync.deletionsPull.query({ since });
    this.guard();
    let applied = 0;
    for (const marker of res.deletions) {
      if (!(COLLECTIONS as readonly string[]).includes(marker.collection) || typeof marker.id !== 'string' || !marker.id) continue;
      const repo = repoFor(marker.collection as CollName);
      const local = await repo.get(marker.id);
      // Edit-wins: never drop unsynced local edits because of a remote delete.
      if (local && !local.dirty && local.updatedAt <= marker.deletedAt) {
        await repo.remove(marker.id);
        applied += 1;
      }
    }
    return { applied, maxSyncedAt: res.maxSyncedAt };
  }

  /** Full bidirectional sync pass. */
  async sync(): Promise<SyncResult> {
    if (!navigator.onLine) return { pushed: 0, pulled: 0, offline: true };
    this.guard();
    this.conflicts = 0;
    this.adopted = 0;
    this.rejected = 0;
    this.skipped = 0;
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
    await useSyncConflicts.getState().refresh();
    return { pushed, pulled: pulled + this.adopted, conflicts: this.conflicts, rejected: this.rejected, skipped: this.skipped };
  }
}
