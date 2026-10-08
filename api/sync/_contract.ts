/**
 * The sync payload CONTRACT (B1.7 / PWA-13). Before B1 the server accepted any
 * collection name and any shape, and one bad record failed the whole push.
 * Now:
 *  - collections are an allow-list (an unknown one is a programming error →
 *    the request is refused);
 *  - every record is checked on its own; a bad record is REJECTED with a
 *    reason while the valid ones in the same batch are applied;
 *  - a batch has a size limit; a record has a size limit;
 *  - every record carries a schema version (`sv`); a version this server does
 *    not understand is rejected instead of being stored half-understood.
 *
 * Compatibility policy (documented in B1_FOUNDATION_SPEC §14): the schema
 * version only changes for an incompatible change of a record's meaning.
 * Additive fields never bump it. Old clients send no `sv` (= 1). The client
 * mirrors this list in `src/data/sync/contract.ts`.
 */

export const SYNC_SCHEMA_VERSION = 1;
export const SYNC_COLLECTIONS = ['workoutLogs', 'nutritionLogs', 'cardioLogs', 'weightLogs', 'measurementLogs', 'progressPhotos', 'dailyChecklists', 'reminders'] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

/** Collections whose record id IS the day (`YYYY-MM-DD`). */
const DAY_KEYED: ReadonlySet<string> = new Set(['workoutLogs', 'nutritionLogs', 'weightLogs', 'measurementLogs', 'dailyChecklists']);
/** Collections whose records belong to a day (and must say which). */
const DATED: ReadonlySet<string> = new Set([...DAY_KEYED, 'cardioLogs', 'progressPhotos']);

export const MAX_RECORDS_PER_PUSH = 500;
export const MAX_RECORD_BYTES = 256 * 1024;
const ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isSyncCollection(name: string): name is SyncCollection {
  return (SYNC_COLLECTIONS as readonly string[]).includes(name);
}

export type RejectReason = 'BAD_ID' | 'ID_MISMATCH' | 'BAD_DATE' | 'BAD_UPDATED_AT' | 'TOO_LARGE' | 'UNSUPPORTED_VERSION';

function validDay(d: unknown): boolean {
  if (typeof d !== 'string' || !DAY_RE.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}

/**
 * Why a pushed record can't be accepted — or null when it can.
 * Deliberately NOT checked: how far a device clock is off. Since B0 the server
 * revision decides which write wins, so a wrong clock leads to a conflict, not
 * a lost record — refusing its writes would strand that device's data.
 */
export function validatePushedRecord(collection: SyncCollection, rec: { id: string; updatedAt: number; data: Record<string, unknown>; sv?: number }): RejectReason | null {
  if ((rec.sv ?? 1) > SYNC_SCHEMA_VERSION || (rec.sv ?? 1) < 1) return 'UNSUPPORTED_VERSION';
  if (!ID_RE.test(rec.id)) return 'BAD_ID';
  if (rec.data.id !== undefined && rec.data.id !== rec.id) return 'ID_MISMATCH';
  if (!Number.isFinite(rec.updatedAt) || rec.updatedAt < 0) return 'BAD_UPDATED_AT';
  if (DATED.has(collection) && rec.data.date !== undefined && !validDay(rec.data.date)) return 'BAD_DATE';
  if (DAY_KEYED.has(collection) && rec.data.date !== undefined && rec.data.date !== rec.id) return 'BAD_DATE';
  if (DAY_KEYED.has(collection) && !validDay(rec.id)) return 'BAD_ID';
  let size = 0;
  try {
    size = JSON.stringify(rec.data).length;
  } catch {
    return 'TOO_LARGE';
  }
  if (size > MAX_RECORD_BYTES) return 'TOO_LARGE';
  return null;
}
