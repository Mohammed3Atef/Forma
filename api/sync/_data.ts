import { getDb } from '../_lib/mongodb';

/**
 * Generic sync backend for `src/data/sync/SyncEngine.ts` — replaces the old
 * `clientData/{uid}/{collection}/{id}` Firestore layout with three flat Mongo
 * collections, scoped by `clientId`. This is deliberately generic (keyed by a
 * caller-supplied `collection` name) rather than one Mongo collection per
 * synced type, because the whole point of this endpoint is to stay a
 * behavioral mirror of the old generic Firestore path — see SyncEngine for
 * the actual per-collection list (workoutLogs, nutritionLogs, cardioLogs,
 * weightLogs, measurementLogs, progressPhotos, dailyChecklists, reminders).
 */

export interface SyncRecordDoc {
  _id: string; // `${clientId}__${collection}__${recordId}`
  clientId: string;
  collection: string;
  recordId: string;
  data: Record<string, unknown>;
  updatedAt: number; // the device's own clock at edit time (for last-write-wins)
  syncedAt: number; // server clock at push time (the pull watermark)
}

export interface SyncDeletionDoc {
  _id: string; // `${clientId}__${collection}__${recordId}`
  clientId: string;
  collection: string;
  recordId: string;
  deletedAt: number;
  syncedAt: number;
}

export interface SyncSingletonDoc {
  _id: string; // `${clientId}__${name}`
  clientId: string;
  name: string;
  data: Record<string, unknown>;
  updatedAt: number;
}

export async function syncRecordsCol() {
  return (await getDb()).collection<SyncRecordDoc>('syncRecords');
}
export async function syncDeletionsCol() {
  return (await getDb()).collection<SyncDeletionDoc>('syncDeletions');
}
export async function syncSingletonsCol() {
  return (await getDb()).collection<SyncSingletonDoc>('syncSingletons');
}

export function recordId(clientId: string, collection: string, recordId_: string): string {
  return `${clientId}__${collection}__${recordId_}`;
}
export function singletonId(clientId: string, name: string): string {
  return `${clientId}__${name}`;
}
