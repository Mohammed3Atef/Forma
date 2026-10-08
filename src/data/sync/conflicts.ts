import { create } from 'zustand';
import { userStore } from '../localScope';
import { getDataSource } from '../dataSource';
import type { Repository } from '../repositories';

/**
 * Sync conflicts (B0 / PWA-06). When this device has unsynced edits to a
 * record that ANOTHER device changed on the server in the meantime, neither
 * copy is overwritten: the server's copy is parked here and the user chooses
 * "keep this device's version" or "use the other device's version". The
 * record is not pushed until then.
 */
export interface SyncConflict {
  collection: string;
  id: string;
  server: { data: Record<string, unknown>; updatedAt: number; rev: number };
  detectedAt: number;
}

type Revved = { id: string; updatedAt: number; dirty?: boolean; _rev?: number; _remoteRev?: number };

const key = (collection: string, id: string) => `${collection}/${id}`;
const store = () => userStore('syncConflicts');

function repo(collection: string): Repository<Revved> | null {
  const r = (getDataSource() as unknown as Record<string, Repository<Revved> | undefined>)[collection];
  return r ?? null;
}

interface ConflictState {
  conflicts: SyncConflict[];
  refresh: () => Promise<void>;
}

/** Reactive list for the UI (refreshed after every sync pass and resolution). */
export const useSyncConflicts = create<ConflictState>((set) => ({
  conflicts: [],
  async refresh() {
    set({ conflicts: await listConflicts() });
  },
}));

export async function recordConflict(collection: string, id: string, server: SyncConflict['server']): Promise<void> {
  await store().setItem(key(collection, id), { collection, id, server, detectedAt: Date.now() } satisfies SyncConflict);
}

export async function hasConflict(collection: string, id: string): Promise<boolean> {
  return (await store().getItem(key(collection, id))) != null;
}

export async function listConflicts(): Promise<SyncConflict[]> {
  const out: SyncConflict[] = [];
  await store().iterate<SyncConflict, void>((v) => {
    out.push(v);
  });
  return out.sort((a, b) => a.detectedAt - b.detectedAt);
}

/** Keep this device's edits: they are re-based on the server revision and pushed next sync. */
export async function keepThisDevice(c: SyncConflict): Promise<void> {
  const r = repo(c.collection);
  const local = r ? await r.get(c.id) : null;
  // This device's content, now based on the server revision it replaces (its lineage stays local).
  if (r && local) await r.putFromSync({ ...local, _rev: c.server.rev, dirty: true, updatedAt: Math.max(Date.now(), local.updatedAt + 1) });
  else if (r) await r.putFromSync({ ...(c.server.data as Revved), _rev: c.server.rev, _remoteRev: c.server.rev, dirty: false });
  await store().removeItem(key(c.collection, c.id));
  await useSyncConflicts.getState().refresh();
}

/** Use the other device's version: this device's unsynced edits to that record are discarded. */
export async function useOtherDevice(c: SyncConflict): Promise<void> {
  const r = repo(c.collection);
  if (r) await r.putFromSync({ ...(c.server.data as Revved), _rev: c.server.rev, _remoteRev: c.server.rev, dirty: false });
  await store().removeItem(key(c.collection, c.id));
  await useSyncConflicts.getState().refresh();
}

/** Key-order-independent JSON. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Content equality ignoring sync bookkeeping (identical edits on two devices are not a conflict). */
export function sameContent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const strip = ({ dirty: _d, _rev: _r, _remoteRev: _rr, updatedAt: _u, ...rest }: Record<string, unknown>) => canonical(rest);
  return strip(a) === strip(b);
}
