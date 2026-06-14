import localforage from 'localforage';

/**
 * Binary blob store for downloaded videos and progress photos.
 * Kept separate from the JSON document store so large binaries don't bloat
 * the structured collections. Backed by IndexedDB via localForage.
 */
const store = localforage.createInstance({
  name: 'gym-tracker',
  storeName: 'blobs',
  description: 'Downloaded videos and progress photos',
});

export const blobStore = {
  async put(key: string, blob: Blob): Promise<void> {
    await store.setItem(key, blob);
  },
  async get(key: string): Promise<Blob | null> {
    return (await store.getItem<Blob>(key)) ?? null;
  },
  async has(key: string): Promise<boolean> {
    return (await store.getItem(key)) != null;
  },
  async remove(key: string): Promise<void> {
    await store.removeItem(key);
  },
  /** Returns an object URL for a stored blob, or null if missing. */
  async objectUrl(key: string): Promise<string | null> {
    const blob = await this.get(key);
    return blob ? URL.createObjectURL(blob) : null;
  },
};
