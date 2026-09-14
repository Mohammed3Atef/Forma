import type { DataSource } from './repositories';
import { LocalDataSource } from './adapters/local/LocalDataSource';

let instance: DataSource | null = null;

/**
 * Returns the active data source. All reads/writes always go through the
 * local store (IndexedDB via LocalDataSource) — there is no separate remote
 * DataSource adapter. Cloud mode is layered on top by the SyncEngine
 * (src/data/sync/SyncEngine.ts), which mirrors local changes to the Mongo
 * backend (`trpc.sync.*`) and pulls remote changes back, so callers are
 * identical whether or not a sync has happened yet.
 */
export function getDataSource(): DataSource {
  if (instance) return instance;
  instance = new LocalDataSource();
  return instance;
}

/**
 * Whether cloud sync is available. The backend is mandatory infrastructure
 * now (not an opt-in Firebase toggle) — this always returns true and exists
 * only so the ~20 existing call sites (gating "cloud" UI/behavior) don't need
 * individual edits.
 */
export function cloudAvailable(): boolean {
  return true;
}
