/**
 * Persistent storage. By default browsers may EVICT IndexedDB / CacheStorage
 * when the app is closed or under storage pressure — which would wipe the login
 * session, downloaded videos, and progress photos (all stored there). Requesting
 * persistent storage prevents that. It's granted automatically for installed
 * PWAs / engaged sites; we also retry on the first user gesture, which some
 * browsers require before granting.
 */

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

export async function ensurePersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Request persistence now and again on the first user gesture if still denied. */
export function setupPersistentStorage(): void {
  void ensurePersistentStorage().then((ok) => {
    if (ok) return;
    const retry = () => {
      void ensurePersistentStorage().finally(() => {
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
      });
    };
    window.addEventListener('pointerdown', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
  });
}
