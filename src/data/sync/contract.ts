import { userStore } from '@/data/localScope';

/**
 * The client half of the sync contract (B1.7 / PWA-13) — mirrors
 * `api/sync/_contract.ts` (kept in sync by hand: the API bundle and the app
 * bundle don't share modules).
 *
 * The client is STRICTER than the server about what it imports: a pulled
 * record that is malformed or written by a newer, unknown schema is SKIPPED
 * (never written into the local database, never shown), counted and logged.
 * Corrupt state never enters the device; the server copy stays untouched for a
 * newer app version (or support) to read.
 */
export const SYNC_SCHEMA_VERSION = 1;
export const SYNC_COLLECTIONS = ['workoutLogs', 'nutritionLogs', 'cardioLogs', 'weightLogs', 'measurementLogs', 'progressPhotos', 'dailyChecklists', 'reminders'] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];
/** Records per push request (the server allows 500). */
export const PUSH_BATCH = 200;

const DAY_KEYED: ReadonlySet<string> = new Set(['workoutLogs', 'nutritionLogs', 'weightLogs', 'measurementLogs', 'dailyChecklists']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isSyncCollection(name: string): name is SyncCollection {
  return (SYNC_COLLECTIONS as readonly string[]).includes(name);
}

export type PullSkipReason = 'BAD_ID' | 'MISSING_DATA' | 'ID_MISMATCH' | 'BAD_UPDATED_AT' | 'BAD_REV' | 'BAD_DATE' | 'NEWER_SCHEMA';

/** Why a pulled record must not be imported — or null when it is safe to import. */
export function validatePulledRecord(collection: SyncCollection, rec: { id?: unknown; updatedAt?: unknown; rev?: unknown; sv?: unknown; data?: unknown }): PullSkipReason | null {
  if (typeof rec.id !== 'string' || rec.id.length === 0) return 'BAD_ID';
  if ((typeof rec.sv === 'number' ? rec.sv : 1) > SYNC_SCHEMA_VERSION) return 'NEWER_SCHEMA';
  if (!rec.data || typeof rec.data !== 'object' || Array.isArray(rec.data)) return 'MISSING_DATA';
  const data = rec.data as Record<string, unknown>;
  // The local store keys by `data.id` — a record without it (or with someone else's) would be stored under the wrong key.
  if (data.id !== rec.id) return 'ID_MISMATCH';
  if (typeof rec.updatedAt !== 'number' || !Number.isFinite(rec.updatedAt)) return 'BAD_UPDATED_AT';
  if (rec.rev !== undefined && (typeof rec.rev !== 'number' || !Number.isInteger(rec.rev) || rec.rev < 0)) return 'BAD_REV';
  if (data.date !== undefined && (typeof data.date !== 'string' || !DAY_RE.test(data.date))) return 'BAD_DATE';
  if (DAY_KEYED.has(collection) && data.date !== rec.id) return 'BAD_DATE';
  return null;
}

// ---- records the server refused (they stay on the device; the status says so) ----

/**
 * B3.0.1 / B3-S06: the server refused a workout / nutrition / cardio log
 * because its DAY was not covered by the coaching subscription (after it
 * ended, or inside a freeze). Not a broken record: it stays on the device and
 * is pushed again every pass, so it syncs once the coach extends or renews
 * over that date. Mirrors `api/sync/_contract.ts` `RejectReason`.
 */
export const SUBSCRIPTION_READ_ONLY = 'SUBSCRIPTION_READ_ONLY';

type RejectedMap = Record<string, string>; // `${collection}/${id}` → reason

/** How many refused records were refused for `reason`. */
export function countRejectedFor(map: RejectedMap, reason: string): number {
  return Object.values(map).filter((r) => r === reason).length;
}
const REJECTED_KEY = 'syncRejected';

export async function readRejected(): Promise<RejectedMap> {
  return (await userStore('meta').getItem<RejectedMap>(REJECTED_KEY)) ?? {};
}
export async function updateRejected(collection: string, rejected: { id: string; reason: string }[], acceptedIds: string[]): Promise<void> {
  const map = await readRejected();
  for (const id of acceptedIds) delete map[`${collection}/${id}`];
  for (const r of rejected) map[`${collection}/${r.id}`] = r.reason;
  await userStore('meta').setItem(REJECTED_KEY, map);
}
