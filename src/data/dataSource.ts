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
