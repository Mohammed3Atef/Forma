import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// A server that returns whatever the test puts in `serverRecords`, and refuses pushes per `refuse`.
const serverRecords: Record<string, unknown[]> = {};
let refuse: Record<string, string> = {};
const pushed: { collection: string; records: { id: string; sv?: number }[] }[] = [];
vi.mock('@/services/trpc', () => ({
  trpc: {
    sync: {
      push: {
        mutate: async ({ collection, records }: { collection: string; records: { id: string; sv?: number }[] }) => {
          pushed.push({ collection, records });
          const rejected = records.filter((r) => refuse[r.id]).map((r) => ({ id: r.id, reason: refuse[r.id] }));
          const accepted = records.filter((r) => !refuse[r.id]).map((r) => ({ id: r.id, rev: 1 }));
          return { pushed: accepted.length, syncedAt: 1, accepted, conflicts: [], rejected };
        },
      },
      pull: { query: async ({ collection }: { collection: string }) => ({ records: serverRecords[collection] ?? [], maxSyncedAt: 1 }) },
      deletionsPush: { mutate: async () => ({ flushed: 0, syncedAt: 1, rejected: [] }) },
      deletionsPull: { query: async () => ({ deletions: [{ collection: 'users', id: 'x', deletedAt: 1 }], maxSyncedAt: 1 }) },
      singletonGet: { query: async () => null },
      singletonSet: { mutate: async () => ({}) },
    },
  },
}));

import { closeAccountScope, openAccountScope } from '../localScope';
import { getDataSource } from '../dataSource';
import { SyncEngine } from './SyncEngine';
import { readRejected, validatePulledRecord } from './contract';

const DAY = '2026-10-05';

beforeEach(async () => {
  dbs.clear();
  for (const k of Object.keys(serverRecords)) delete serverRecords[k];
  refuse = {};
  pushed.length = 0;
  closeAccountScope();
  await openAccountScope('client-1');
});

describe('validatePulledRecord (B1.7)', () => {
  const ok = { id: DAY, updatedAt: 1, rev: 1, sv: 1, data: { id: DAY, date: DAY } };
  it('accepts a well-formed record', () => {
    expect(validatePulledRecord('nutritionLogs', ok)).toBeNull();
    expect(validatePulledRecord('reminders', { id: 'r1', updatedAt: 1, data: { id: 'r1' } })).toBeNull(); // pre-B1 record: no sv / rev
  });
  it.each([
    ['BAD_ID', { ...ok, id: '' }],
    ['MISSING_DATA', { ...ok, data: null }],
    ['ID_MISMATCH', { ...ok, data: { date: DAY } }],
    ['ID_MISMATCH', { ...ok, data: { id: 'other', date: DAY } }],
    ['BAD_UPDATED_AT', { ...ok, updatedAt: 'yesterday' }],
    ['BAD_REV', { ...ok, rev: -1 }],
    ['BAD_DATE', { ...ok, data: { id: DAY, date: '5/10/2026' } }],
    ['BAD_DATE', { ...ok, data: { id: DAY, date: '2026-10-06' } }],
    ['NEWER_SCHEMA', { ...ok, sv: 2 }],
  ])('skips %s', (reason, rec) => {
    expect(validatePulledRecord('nutritionLogs', rec as never)).toBe(reason);
  });
});

describe('the engine never imports corrupt state, and reports what the server refused', () => {
  it('a malformed or newer-schema record from the server is skipped; the valid one is imported', async () => {
    serverRecords.weightLogs = [
      { id: DAY, updatedAt: 1, rev: 1, sv: 1, data: { id: DAY, date: DAY, weightKg: 80 } },
      { id: '2026-10-06', updatedAt: 1, rev: 1, data: { weightKg: 81 } }, // no data.id — would be stored under `undefined`
      { id: '2026-10-07', updatedAt: 1, rev: 1, sv: 9, data: { id: '2026-10-07', date: '2026-10-07', weightKg: 82 } },
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await new SyncEngine('client-1').sync();
    warn.mockRestore();
    expect(res.skipped).toBe(2);
    const local = await getDataSource().weightLogs.getAll();
    expect(local.map((r) => r.id)).toEqual([DAY]);
  });

  it('pushes carry the schema version; a refused record stays on the device and is remembered until accepted', async () => {
    await getDataSource().weightLogs.put({ id: DAY, date: DAY, weightKg: 80, updatedAt: 5, dirty: true } as never);
    refuse = { [DAY]: 'BAD_DATE' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await new SyncEngine('client-1').sync();
    expect(res.rejected).toBe(1);
    expect(pushed[0].records[0].sv).toBe(1);
    expect(await readRejected()).toEqual({ [`weightLogs/${DAY}`]: 'BAD_DATE' });
    expect((await getDataSource().weightLogs.get(DAY))?.dirty).toBe(true);
    refuse = {};
    await new SyncEngine('client-1').sync();
    warn.mockRestore();
    expect(await readRejected()).toEqual({});
  });
});
