import type { Repository, SingletonRepository } from '@/data/repositories';
import { userStore, type UserStoreName } from '@/data/localScope';

/**
 * localForage-backed implementations of the repository interfaces.
 * Each collection gets its own IndexedDB store for clean separation and
 * fast `getAll` via iteration. The store is resolved on every call in the
 * CURRENT account's database (B0 / PWA-02 — see `localScope.ts`).
 */

export class LocalRepository<T extends { id: string }> implements Repository<T> {
  constructor(private readonly storeName: UserStoreName) {}

  private get store(): LocalForage {
    return userStore(this.storeName);
  }

  async get(id: string): Promise<T | null> {
    return (await this.store.getItem<T>(id)) ?? null;
  }

  async getAll(): Promise<T[]> {
    const items: T[] = [];
    await this.store.iterate<T, void>((value) => {
      items.push(value);
    });
    return items;
  }

  /**
   * App write. The server revision a record is based on (`_rev`) belongs to the
   * sync engine, which stamps it here after every acknowledged push — so the
   * copy a screen holds in memory is usually a revision or more behind. Taking
   * the screen's `_rev` at face value made every ordinary edit after a sync look
   * like a two-device conflict (found in the B0 e2e run). So the stored base is
   * kept, unless another device's content has landed since the copy this edit
   * came from (`_remoteRev` newer than the edit's own `_rev`): then the stale
   * base is kept and the server reports a real conflict (PWA-06).
   */
  async put(item: T): Promise<T> {
    const next = withBaseRevision(item, await this.store.getItem<Revisioned>(item.id));
    await this.store.setItem(item.id, next);
    return next;
  }

  async putMany(items: T[]): Promise<void> {
    await Promise.all(items.map((i) => this.put(i)));
  }

  /** Sync-engine write: `_rev` / `_remoteRev` are stored exactly as given. */
  async putFromSync(item: T): Promise<T> {
    await this.store.setItem(item.id, item);
    return item;
  }

  async remove(id: string): Promise<void> {
    // Remember the server revision being deleted so the tombstone can make the
    // delete conditional on it (B0 / PWA-06: a stale delete can't erase a newer edit).
    const cur = await this.store.getItem<{ _rev?: number }>(id);
    if (cur && typeof cur._rev === 'number') rememberRemovedRev(this.storeName, id, cur._rev);
    await this.store.removeItem(id);
  }
}

type Revisioned = { _rev?: number; _remoteRev?: number };

/** The base revision an app write should carry (see `LocalRepository.put`). */
export function withBaseRevision<T>(item: T, stored: Revisioned | null): T {
  if (!stored || typeof stored._rev !== 'number') return item;
  const inc = item as T & Revisioned;
  const lineage = stored._remoteRev != null ? { _remoteRev: stored._remoteRev } : {};
  // No base at all: the record was built from what is stored (or created here and pushed since).
  if (inc._rev == null) return { ...inc, _rev: stored._rev, ...lineage };
  if (inc._rev >= stored._rev) return { ...inc, ...lineage };
  // An older base: fine if every revision since was this device's own push.
  if ((stored._remoteRev ?? -1) <= inc._rev) return { ...inc, _rev: stored._rev, ...lineage };
  return { ...inc, ...lineage }; // the server will report the conflict
}

const removedRevs = new Map<string, number>();
function rememberRemovedRev(collection: string, id: string, rev: number): void {
  removedRevs.set(`${collection}/${id}`, rev);
}
/** The server revision a just-removed record was at (consumed once by the tombstone writer). */
export function takeRemovedRev(collection: string, id: string): number | undefined {
  const k = `${collection}/${id}`;
  const rev = removedRevs.get(k);
  removedRevs.delete(k);
  return rev;
}

export class LocalSingleton<T> implements SingletonRepository<T> {
  private key = 'value';

  constructor(private readonly storeName: UserStoreName) {}

  private get store(): LocalForage {
    return userStore(this.storeName);
  }

  async get(): Promise<T | null> {
    return (await this.store.getItem<T>(this.key)) ?? null;
  }

  async set(value: T): Promise<T> {
    await this.store.setItem(this.key, value);
    return value;
  }
}
