import type { DataSource } from './repositories';
import { LocalDataSource } from './adapters/local/LocalDataSource';
import { isFirebaseConfigured } from './adapters/firebase/config';

let instance: DataSource | null = null;

/**
 * Returns the active data source. All reads/writes always go through the
 * local store (IndexedDB via LocalDataSource) — there is no separate Firebase
 * DataSource adapter. When Firebase env vars are present, cloud mode is layered
 * on top by the SyncEngine (src/data/sync/SyncEngine.ts), which mirrors local
 * changes to Firestore and pulls remote changes back, so callers are identical
 * in both modes.
 */
export function getDataSource(): DataSource {
  if (instance) return instance;
  instance = new LocalDataSource();
  return instance;
}

/** Whether cloud sync *could* be enabled in this build. */
export function cloudAvailable(): boolean {
  return isFirebaseConfigured();
}
