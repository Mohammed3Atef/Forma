import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory localforage keyed by `${db}/${store}` — jsdom has no IndexedDB.
const dbs = new Map<string, Map<string, unknown>>();
const dropped: string[] = [];
vi.mock('localforage', () => {
  const make = (name: string, storeName: string) => {
    const key = `${name}/${storeName}`;
    const m = () => {
      if (!dbs.has(key)) dbs.set(key, new Map());
      return dbs.get(key)!;
    };
    return {
      getItem: async (k: string) => (m().has(k) ? m().get(k) : null),
      setItem: async (k: string, v: unknown) => void m().set(k, v),
      removeItem: async (k: string) => void m().delete(k),
    };
  };
  return {
    default: {
      createInstance: (o: { name: string; storeName: string }) => make(o.name, o.storeName),
      dropInstance: async (o: { name: string }) => {
        dropped.push(o.name);
        for (const k of [...dbs.keys()]) if (k.startsWith(`${o.name}/`)) dbs.delete(k);
      },
    },
  };
});

const pending = vi.fn(async () => 0);
vi.mock('./sync/pending', () => ({ countPendingChanges: () => pending() }));
const owner = { uid: null as string | null };
vi.mock('./localScope', () => ({
  LEGACY_DB: 'gym-tracker',
  userDbName: (uid: string) => `forma-u-${uid}`,
  currentLocalOwner: () => owner.uid,
  forgetAccountInstances: vi.fn(),
}));
vi.mock('./accountRuntime', () => ({ syncLocalRuntime: vi.fn(async () => undefined) }));

import { draftsOnDevice, pendingOnDevice, removeAccountDataFromDevice } from './deviceData';
import localforage from 'localforage';

describe('remove this device’s data (B2.7)', () => {
  beforeEach(() => {
    dbs.clear();
    dropped.length = 0;
    localStorage.clear();
    owner.uid = null;
    pending.mockReset();
    pending.mockResolvedValue(0);
  });

  it('reports what is only on this device; an unverifiable count blocks removal', async () => {
    pending.mockResolvedValueOnce(3);
    expect(await pendingOnDevice()).toBe(3);
    pending.mockRejectedValueOnce(new Error('db closed'));
    expect(await pendingOnDevice()).toBe(Number.POSITIVE_INFINITY);
  });

  it('counts this account’s unfinished drafts (check-ins + assessment), not other accounts’', async () => {
    localStorage.setItem('forma.checkinDraft.v1.u1.2026-10-03', '{}');
    localStorage.setItem('forma.checkinDraft.v1.u2.2026-10-03', '{}');
    await localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' }).setItem('assessmentDraft:u1', { step: 2 });
    expect(await draftsOnDevice('u1')).toBe(2);
    expect(await draftsOnDevice('u2')).toBe(1);
  });

  it('deletes only this account’s database and keys, and keeps device-level data of others', async () => {
    await localforage.createInstance({ name: 'forma-u-u1', storeName: 'workoutLogs' }).setItem('a', 1);
    await localforage.createInstance({ name: 'forma-u-u2', storeName: 'workoutLogs' }).setItem('b', 1);
    await localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' }).setItem('assessmentDraft:u1', {});
    await localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' }).setItem('assessmentDraft:u2', {});
    localStorage.setItem('forma.planSeen.v1.u1.workout', '1');
    localStorage.setItem('forma.planSeen.v1.u2.workout', '1');
    localStorage.setItem('forma.micPrimed', '1');

    await removeAccountDataFromDevice('u1');

    expect(dropped).toEqual(['forma-u-u1']);
    expect(dbs.has('forma-u-u2/workoutLogs')).toBe(true);
    expect(localStorage.getItem('forma.planSeen.v1.u1.workout')).toBeNull();
    expect(localStorage.getItem('forma.planSeen.v1.u2.workout')).toBe('1');
    expect(localStorage.getItem('forma.micPrimed')).toBe('1');
    const meta = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
    expect(await meta.getItem('assessmentDraft:u1')).toBeNull();
    expect(await meta.getItem('assessmentDraft:u2')).not.toBeNull();
  });

  it('refuses while the account is still open on this device', async () => {
    owner.uid = 'u1';
    await expect(removeAccountDataFromDevice('u1')).rejects.toThrow();
    expect(dropped).toEqual([]);
  });
});
