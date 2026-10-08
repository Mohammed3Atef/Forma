import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory localforage keyed by `${db}/${store}` — jsdom has no IndexedDB.
const dbs = new Map<string, Map<string, unknown>>();
vi.mock('localforage', () => {
  const make = (name: string, storeName: string) => {
    const key = `${name}/${storeName}`;
    const m = () => {
      if (!dbs.has(key)) dbs.set(key, new Map());
      return dbs.get(key)!;
    };
    return {
      getItem: async (k: string) => (m().has(k) ? structuredClone(m().get(k)) : null),
      setItem: async (k: string, v: unknown) => {
        m().set(k, structuredClone(v));
        return v;
      },
      removeItem: async (k: string) => void m().delete(k),
      clear: async () => m().clear(),
      keys: async () => [...m().keys()],
      iterate: async (fn: (v: unknown, k: string, i: number) => unknown) => {
        let i = 0;
        for (const [k, v] of m()) {
          const r = fn(structuredClone(v), k, i++);
          if (r !== undefined) return r;
        }
      },
    };
  };
  return { default: { createInstance: (o: { name: string; storeName: string }) => make(o.name, o.storeName) } };
});

const trpcSync = {
  push: vi.fn(async (_i?: unknown) => ({ pushed: 0, syncedAt: 1, accepted: [], conflicts: [] })),
  pull: vi.fn(async (_i?: unknown) => ({ records: [], maxSyncedAt: 0 })),
  deletionsPush: vi.fn(async (_i?: unknown) => ({ flushed: 0, syncedAt: 1, rejected: [] })),
  deletionsPull: vi.fn(async (_i?: unknown) => ({ deletions: [], maxSyncedAt: 0 })),
  singletonGet: vi.fn(async (_i?: unknown) => null),
  singletonSet: vi.fn(async (_i?: unknown) => ({})),
};
vi.mock('@/services/trpc', () => ({
  trpc: {
    sync: {
      push: { mutate: (i: unknown) => trpcSync.push(i as never) },
      pull: { query: (i: unknown) => trpcSync.pull(i as never) },
      deletionsPush: { mutate: (i: unknown) => trpcSync.deletionsPush(i as never) },
      deletionsPull: { query: (i: unknown) => trpcSync.deletionsPull(i as never) },
      singletonGet: { query: (i: unknown) => trpcSync.singletonGet(i as never) },
      singletonSet: { mutate: (i: unknown) => trpcSync.singletonSet(i as never) },
      wipe: { mutate: vi.fn() },
    },
  },
}));

import { closeAccountScope, currentLocalOwner, LEGACY_DB, openAccountScope, userDbName } from './localScope';
import { getDataSource } from './dataSource';
import { listTombstones, recordDeletion } from './sync/tombstones';
import { SyncEngine, SyncScopeChanged } from './sync/SyncEngine';
import type { WorkoutLog } from '@/types';

const log = (id: string, extra: Partial<WorkoutLog> = {}) => ({ id, date: id, dayId: 'd', startedAt: 1, endedAt: null, durationSec: 0, exercises: [], finished: true, updatedAt: 100, dirty: true, ...extra }) as WorkoutLog;

beforeEach(() => {
  dbs.clear();
  closeAccountScope();
  Object.values(trpcSync).forEach((f) => f.mockClear());
});

describe('per-account local storage (PWA-02 / PWA-03 / PWA-05)', () => {
  it("A → B → A: B never sees A's data or pending deletions; A's unsynced work survives", async () => {
    const ds = getDataSource();
    await openAccountScope('client-a');
    await ds.workoutLogs.put(log('2026-10-05')); // logged offline, not yet synced
    await recordDeletion('nutritionLogs', '2026-10-04'); // a pending delete
    closeAccountScope();

    await openAccountScope('client-b');
    expect(await ds.workoutLogs.getAll()).toEqual([]);
    expect(await listTombstones()).toEqual([]); // A's delete can't hit B's 2026-10-04
    closeAccountScope();

    await openAccountScope('client-a');
    expect((await ds.workoutLogs.get('2026-10-05'))?.dirty).toBe(true);
    expect(await listTombstones()).toEqual([expect.objectContaining({ collection: 'nutritionLogs', id: '2026-10-04' })]);
  });

  it("each account's sync cursors live in its own database (a re-opened account doesn't skip history)", async () => {
    await openAccountScope('client-a');
    trpcSync.pull.mockResolvedValue({ records: [], maxSyncedAt: 500 });
    await new SyncEngine('client-a').sync();
    expect([...(dbs.get(`${userDbName('client-a')}/meta`)?.keys() ?? [])].some((k) => k.startsWith('pullCursorV'))).toBe(true);
    closeAccountScope();
    await openAccountScope('client-b');
    trpcSync.pull.mockClear();
    await new SyncEngine('client-b').sync();
    // B's first pass is a full pull (since: 0), not A's watermark.
    expect(trpcSync.pull.mock.calls.every((c) => (c[0] as { since: number }).since === 0)).toBe(true);
  });

  it('the legacy shared database moves ONLY into its recorded owner', async () => {
    dbs.set(`${LEGACY_DB}/meta`, new Map<string, unknown>([['localOwnerUid', 'client-a'], ['pullCursorV3:client-a:workoutLogs', 400]]));
    dbs.set(`${LEGACY_DB}/workoutLogs`, new Map<string, unknown>([['2026-10-01', log('2026-10-01')]]));
    dbs.set(`${LEGACY_DB}/deletions`, new Map<string, unknown>([['weightLogs/2026-09-30', { collection: 'weightLogs', id: '2026-09-30', deletedAt: 5 }]]));
    const ds = getDataSource();

    await openAccountScope('client-b'); // not the owner
    expect(await ds.workoutLogs.getAll()).toEqual([]);
    expect(await listTombstones()).toEqual([]);
    closeAccountScope();
    expect(dbs.get(`${LEGACY_DB}/workoutLogs`)?.size).toBe(1); // untouched

    const res = await openAccountScope('client-a'); // the owner
    expect(res.migrated).toBe(true);
    expect((await ds.workoutLogs.get('2026-10-01'))?.id).toBe('2026-10-01');
    expect(await listTombstones()).toHaveLength(1);
    expect(dbs.get(`${userDbName('client-a')}/meta`)?.get('pullCursorV3:client-a:workoutLogs')).toBe(400);
    expect(dbs.get(`${LEGACY_DB}/workoutLogs`)?.size).toBe(0); // moved, not duplicated
  });

  it('a sync pass aborts the moment the open account changes (no cross-account writes)', async () => {
    await openAccountScope('client-a');
    const ds = getDataSource();
    await ds.workoutLogs.put(log('2026-10-05'));
    trpcSync.pull.mockImplementation(async () => {
      // the user switches account while this request is in flight
      closeAccountScope();
      await openAccountScope('client-b');
      return { records: [{ id: '2026-10-05', updatedAt: 999, rev: 3, data: log('2026-10-05', { dayId: 'A-data', dirty: false }) }], maxSyncedAt: 10 } as never;
    });
    await expect(new SyncEngine('client-a').sync()).rejects.toBeInstanceOf(SyncScopeChanged);
    expect(currentLocalOwner()).toBe('client-b');
    expect(await ds.workoutLogs.getAll()).toEqual([]); // nothing of A landed in B
  });
});
