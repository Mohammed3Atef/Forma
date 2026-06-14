import localforage from 'localforage';

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
}

const store = localforage.createInstance({ name: 'gym-tracker', storeName: 'deletions' });

const key = (collection: string, id: string) => `${collection}/${id}`;

export async function recordDeletion(collection: string, id: string): Promise<void> {
  await store.setItem(key(collection, id), { collection, id, deletedAt: Date.now() });
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
