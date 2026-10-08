import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * B0 / PWA-06 — two devices of the same client, simulated end to end through
 * the real SyncEngine against a fake server that applies the same revision
 * rules as `api/_trpc/routers/sync.ts` (covered there by syncConflicts.test.ts).
 */

// Each "device" is its own IndexedDB (a Map of `${db}/${store}` → Map).
type Db = Map<string, Map<string, unknown>>;
const devices: Record<'phone' | 'tablet', Db> = { phone: new Map(), tablet: new Map() };
let device: Db = devices.phone;
vi.mock('localforage', () => {
  const make = (name: string, storeName: string) => {
    const key = `${name}/${storeName}`;
    const m = () => {
      if (!device.has(key)) device.set(key, new Map());
      return device.get(key)!;
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

// Fake server with the production revision rules.
type Rec = { id: string; updatedAt: number; rev: number; data: Record<string, unknown>; syncedAt: number };
const server = new Map<string, Rec>();
let clock = 1000;
vi.mock('@/services/trpc', () => {
  const k = (c: string, id: string) => `${c}/${id}`;
  return {
    trpc: {
      sync: {
        push: {
          mutate: async ({ collection, records }: { collection: string; records: { id: string; updatedAt: number; data: Record<string, unknown>; baseRev?: number | null }[] }) => {
            const accepted: { id: string; rev: number }[] = [];
            const conflicts: Omit<Rec, 'syncedAt'>[] = [];
            for (const r of records) {
              const ex = server.get(k(collection, r.id));
              const ok = r.baseRev === undefined ? !ex || r.updatedAt >= ex.updatedAt : r.baseRev === null ? !ex : !ex || ex.rev === r.baseRev;
              if (ok) {
                const rev = (ex?.rev ?? 0) + 1;
                server.set(k(collection, r.id), { id: r.id, updatedAt: r.updatedAt, rev, data: r.data, syncedAt: ++clock });
                accepted.push({ id: r.id, rev });
              } else if (ex) conflicts.push({ id: ex.id, updatedAt: ex.updatedAt, rev: ex.rev, data: ex.data });
            }
            return { pushed: accepted.length, syncedAt: clock, accepted, conflicts };
          },
        },
        pull: {
          query: async ({ collection, since }: { collection: string; since: number }) => {
            const records = [...server.entries()].filter(([key, r]) => key.startsWith(`${collection}/`) && r.syncedAt > since).map(([, r]) => ({ id: r.id, updatedAt: r.updatedAt, rev: r.rev, data: r.data }));
            return { records, maxSyncedAt: Math.max(since, ...[...server.values()].map((r) => r.syncedAt)) };
          },
        },
        deletionsPush: { mutate: async () => ({ flushed: 0, syncedAt: clock, rejected: [] }) },
        deletionsPull: { query: async ({ since }: { since: number }) => ({ deletions: [], maxSyncedAt: since }) },
        singletonGet: { query: async () => null },
        singletonSet: { mutate: async () => ({}) },
        wipe: { mutate: async () => undefined },
      },
    },
  };
});

import { closeAccountScope, openAccountScope } from '../localScope';
import { getDataSource } from '../dataSource';
import { SyncEngine } from './SyncEngine';
import { keepThisDevice, listConflicts, useOtherDevice } from './conflicts';
import type { DailyChecklist, NutritionLog } from '@/types';

const DAY = '2026-10-05';
const day = (entries: string[], updatedAt: number) => ({ id: DAY, date: DAY, entries, updatedAt, dirty: true }) as unknown as NutritionLog;
const entriesOf = (l: unknown) => (l as { entries: string[] } | null)?.entries;

async function on(name: 'phone' | 'tablet') {
  closeAccountScope();
  device = devices[name];
  await openAccountScope('client-1');
}

beforeEach(() => {
  devices.phone = new Map();
  devices.tablet = new Map();
  server.clear();
  closeAccountScope();
});

describe('two devices, same day (PWA-06)', () => {
  it("the tablet's offline day never silently replaces the phone's synced day", async () => {
    const ds = getDataSource();
    await on('phone');
    await ds.nutritionLogs.put(day(['breakfast', 'lunch'], 100));
    await new SyncEngine('client-1').sync();

    await on('tablet'); // logged water offline before its first pull, with a newer clock
    await ds.nutritionLogs.put(day(['water'], 999));
    const res = await new SyncEngine('client-1').sync();
    expect(res.conflicts).toBe(1);
    expect(entriesOf([...server.values()][0].data)).toEqual(['breakfast', 'lunch']); // server untouched
    expect(entriesOf(await ds.nutritionLogs.get(DAY))).toEqual(['water']); // tablet's edit kept too
    const [c] = await listConflicts();
    expect(entriesOf(c.server.data)).toEqual(['breakfast', 'lunch']);

    // The user chooses the other device's version → the tablet now matches the phone.
    await useOtherDevice(c);
    expect(entriesOf(await ds.nutritionLogs.get(DAY))).toEqual(['breakfast', 'lunch']);
    expect(await listConflicts()).toEqual([]);
    await new SyncEngine('client-1').sync();
    expect([...server.values()][0].rev).toBe(1);
  });

  it('"keep this device" pushes the tablet version on top of the server revision it saw', async () => {
    const ds = getDataSource();
    await on('phone');
    await ds.nutritionLogs.put(day(['breakfast'], 100));
    await new SyncEngine('client-1').sync();
    await on('tablet');
    await ds.nutritionLogs.put(day(['breakfast', 'snack'], 200));
    await new SyncEngine('client-1').sync();
    const [c] = await listConflicts();
    await keepThisDevice(c);
    await new SyncEngine('client-1').sync();
    expect(entriesOf([...server.values()][0].data)).toEqual(['breakfast', 'snack']);
    expect([...server.values()][0].rev).toBe(2);

    // The phone pulls the chosen version (its copy was clean).
    await on('phone');
    await new SyncEngine('client-1').sync();
    expect(entriesOf(await ds.nutritionLogs.get(DAY))).toEqual(['breakfast', 'snack']);
  });

  it('ordinary edits on one device then the other flow through without conflicts', async () => {
    const ds = getDataSource();
    await on('phone');
    await ds.nutritionLogs.put(day(['breakfast'], 100));
    await new SyncEngine('client-1').sync();
    await on('tablet');
    await new SyncEngine('client-1').sync(); // pulls rev 1
    const pulled = await ds.nutritionLogs.get(DAY);
    await ds.nutritionLogs.put({ ...pulled!, entries: ['breakfast', 'lunch'], updatedAt: 300, dirty: true } as unknown as NutritionLog);
    const res = await new SyncEngine('client-1').sync();
    expect(res.conflicts).toBe(0);
    await on('phone');
    await new SyncEngine('client-1').sync();
    expect(entriesOf(await ds.nutritionLogs.get(DAY))).toEqual(['breakfast', 'lunch']);
  });

  it('a stale device whose copy changed elsewhere gets a conflict even with a faster clock', async () => {
    const ds = getDataSource();
    await on('phone');
    await ds.nutritionLogs.put(day(['a'], 100));
    await new SyncEngine('client-1').sync();
    await on('tablet');
    await new SyncEngine('client-1').sync(); // tablet based on rev 1
    await on('phone');
    const p = await ds.nutritionLogs.get(DAY);
    await ds.nutritionLogs.put({ ...p!, entries: ['a', 'b'], updatedAt: 200, dirty: true } as unknown as NutritionLog);
    await new SyncEngine('client-1').sync(); // rev 2
    await on('tablet');
    const t = await ds.nutritionLogs.get(DAY);
    await ds.nutritionLogs.put({ ...t!, entries: ['a', 'c'], updatedAt: 9_999_999, dirty: true } as unknown as NutritionLog);
    const res = await new SyncEngine('client-1').sync();
    expect(res.conflicts).toBe(1);
    expect(entriesOf([...server.values()][0].data)).toEqual(['a', 'b']);
  });

  // Screens edit the copy they hold in memory, which never sees the revision the
  // engine stamps after a push. Found in the B0 e2e run: every edit after a sync
  // was parked as "changed on two devices" on a single phone.
  describe('edits from an in-memory copy (what the stores actually do)', () => {
    it('a copy created before its own push syncs the next edit without a conflict', async () => {
      const ds = getDataSource();
      await on('phone');
      const mem = day(['a'], 100); // the store's object — it never gets `_rev`
      await ds.nutritionLogs.put(mem);
      await new SyncEngine('client-1').sync();
      await ds.nutritionLogs.put({ ...mem, entries: ['a', 'b'], updatedAt: 200, dirty: true } as unknown as NutritionLog);
      const res = await new SyncEngine('client-1').sync();
      expect(res.conflicts).toBe(0);
      expect(await listConflicts()).toEqual([]);
      expect(entriesOf([...server.values()][0].data)).toEqual(['a', 'b']);
      expect([...server.values()][0].rev).toBe(2);
    });

    it("a copy several of this device's own pushes behind still syncs", async () => {
      const ds = getDataSource();
      await on('phone');
      await ds.nutritionLogs.put(day(['a'], 100));
      await new SyncEngine('client-1').sync();
      const mem = (await ds.nutritionLogs.get(DAY))!; // loaded at rev 1
      await ds.nutritionLogs.put({ ...mem, entries: ['a', 'b'], updatedAt: 200, dirty: true } as unknown as NutritionLog);
      await new SyncEngine('client-1').sync(); // rev 2, memory still says 1
      await ds.nutritionLogs.put({ ...mem, entries: ['a', 'b', 'c'], updatedAt: 300, dirty: true } as unknown as NutritionLog);
      const res = await new SyncEngine('client-1').sync();
      expect(res.conflicts).toBe(0);
      expect(entriesOf([...server.values()][0].data)).toEqual(['a', 'b', 'c']);
      expect([...server.values()][0].rev).toBe(3);
    });

    it("a copy older than another device's change is still a conflict (never a silent overwrite)", async () => {
      const ds = getDataSource();
      await on('phone');
      await ds.nutritionLogs.put(day(['a'], 100));
      await new SyncEngine('client-1').sync();
      const mem = (await ds.nutritionLogs.get(DAY))!; // phone screen holds rev 1
      await on('tablet');
      await new SyncEngine('client-1').sync();
      const t = await ds.nutritionLogs.get(DAY);
      await ds.nutritionLogs.put({ ...t!, entries: ['a', 'tablet'], updatedAt: 200, dirty: true } as unknown as NutritionLog);
      await new SyncEngine('client-1').sync(); // rev 2 from the tablet
      await on('phone');
      await new SyncEngine('client-1').sync(); // pulls rev 2 (its copy was clean)
      await ds.nutritionLogs.put({ ...mem, entries: ['a', 'phone'], updatedAt: 300, dirty: true } as unknown as NutritionLog);
      const res = await new SyncEngine('client-1').sync();
      expect(res.conflicts).toBe(1);
      expect(entriesOf([...server.values()][0].data)).toEqual(['a', 'tablet']);
    });

    it('the lineage marker never reaches the server', async () => {
      const ds = getDataSource();
      await on('phone');
      await ds.nutritionLogs.put(day(['a'], 100));
      await new SyncEngine('client-1').sync();
      await on('tablet');
      await new SyncEngine('client-1').sync();
      const t = await ds.nutritionLogs.get(DAY);
      await ds.nutritionLogs.put({ ...t!, entries: ['a', 'b'], updatedAt: 200, dirty: true } as unknown as NutritionLog);
      await new SyncEngine('client-1').sync();
      expect(Object.keys([...server.values()][0].data)).not.toContain('_remoteRev');
      expect(Object.keys([...server.values()][0].data)).not.toContain('_rev');
    });
  });

  it('a derived record (the daily checklist) never asks the user: the server copy is adopted, then recomputed edits sync', async () => {
    const ds = getDataSource();
    const checklist = (done: boolean, updatedAt: number) =>
      ({ id: DAY, date: DAY, items: { workout: { done, auto: true } }, completionPct: done ? 100 : 0, fullyComplete: done, updatedAt, dirty: true }) as unknown as DailyChecklist;
    await on('phone');
    await ds.dailyChecklists.put(checklist(true, 100));
    await new SyncEngine('client-1').sync();

    await on('tablet'); // builds its own (empty) checklist at load, before its first pull
    await ds.dailyChecklists.put(checklist(false, 200));
    const res = await new SyncEngine('client-1').sync();
    expect(res.conflicts).toBe(0);
    expect(await listConflicts()).toEqual([]);
    expect(res.pulled).toBeGreaterThan(0); // → the stores reload and the checklist is recomputed
    expect((await ds.dailyChecklists.get(DAY)) as unknown).toMatchObject({ fullyComplete: true, dirty: false });
    expect([...server.values()][0].rev).toBe(1); // server untouched

    // A recomputed checklist (built without a revision) then syncs on top of the adopted copy.
    await ds.dailyChecklists.put(checklist(false, 300));
    const again = await new SyncEngine('client-1').sync();
    expect(again.conflicts).toBe(0);
    expect([...server.values()][0].rev).toBe(2);
  });
});
