import { userStore } from '../localScope';
import { takeRemovedRev } from '../adapters/local/LocalRepository';

/**
 * Deletion tracking. When a record is deleted locally we record a "tombstone"
 * so the next cloud sync deletes it from Firestore too — otherwise the cloud
 * copy would be pulled back and the record would reappear. Tombstones persist
 * across restarts and offline periods, and are flushed (then cleared) on sync.
 */
export interface Tombstone {
  collection: string;
  id: string;
  /** When the local deletion happened (used for delete-vs-edit conflicts). */
  deletedAt?: number;
  /** Server revision of the copy that was deleted (B0 / PWA-06); absent for pre-revision records. */
  baseRev?: number;
}

/** Per-account outbox of deletions (B0 / PWA-03): one account's pending deletes can never be flushed under another. */
const store = {
  setItem: (k: string, v: Tombstone) => userStore('deletions').setItem(k, v),
  removeItem: (k: string) => userStore('deletions').removeItem(k),
  iterate: <T, U>(fn: (v: T, k: string, i: number) => U) => userStore('deletions').iterate<T, U>(fn),
  clear: () => userStore('deletions').clear(),
};

const key = (collection: string, id: string) => `${collection}/${id}`;

export async function recordDeletion(collection: string, id: string): Promise<void> {
  const baseRev = takeRemovedRev(collection, id);
  await store.setItem(key(collection, id), { collection, id, deletedAt: Date.now(), ...(baseRev != null ? { baseRev } : {}) });
}

export async function recordDeletions(collection: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => recordDeletion(collection, id)));
}

export async function listTombstones(): Promise<Tombstone[]> {
  const out: Tombstone[] = [];
  await store.iterate<Tombstone, void>((v) => {
    out.push(v);
  });
  return out;
}

export async function clearTombstone(collection: string, id: string): Promise<void> {
  await store.removeItem(key(collection, id));
}

export async function clearAllTombstones(): Promise<void> {
  await store.clear();
}
