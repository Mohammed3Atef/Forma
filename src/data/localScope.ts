import localforage from 'localforage';

/**
 * Per-account local storage (B0 / PWA-02, PWA-03, PWA-05).
 *
 * Every signed-in account gets its OWN IndexedDB database (`forma-u-<uid>`):
 * its logs, plans, profile/settings, downloaded media, pending deletions
 * (tombstones) and sync cursors. Switching accounts on a device therefore
 * never deletes anything and can never leak or replay one account's pending
 * changes into another — the old model (one shared `gym-tracker` database,
 * wiped whenever a different uid signed in) silently destroyed unsynced data,
 * applied the previous user's deletions to the next user and left stale sync
 * cursors behind.
 *
 * The legacy shared database is migrated ONCE into the account recorded as its
 * owner (`localOwnerUid`); any other account starts with an empty database and
 * pulls its own history. Legacy data whose owner is unknown is left untouched.
 *
 * Device-level (not per-account) state stays in the legacy `gym-tracker/meta`
 * store: coach editor drafts (keyed by coach + client) and the assessment
 * draft (keyed by uid).
 */

export const LEGACY_DB = 'gym-tracker';
/** Used while no account is open — nothing should write here; it keeps stray reads empty and harmless. */
const NO_ACCOUNT_DB = 'forma-no-account';

/** Every store the local data layer uses (kept in sync with LocalDataSource / blobStore / tombstones / SyncEngine). */
export const USER_STORES = [
  'profile',
  'settings',
  'workoutPlans',
  'workoutLogs',
  'mealPlans',
  'nutritionLogs',
  'cardioLogs',
  'weightLogs',
  'measurementLogs',
  'progressPhotos',
  'dailyChecklists',
  'reminders',
  'blobs',
  'deletions',
  'syncConflicts',
  'outbox',
  'meta',
] as const;
export type UserStoreName = (typeof USER_STORES)[number];

let dbName = NO_ACCOUNT_DB;
let ownerUid: string | null = null;
const instances = new Map<string, LocalForage>();

export function userDbName(uid: string): string {
  return `forma-u-${uid}`;
}

/** The localForage instance for `storeName` in the CURRENT account's database. */
export function userStore(storeName: UserStoreName): LocalForage {
  const key = `${dbName}/${storeName}`;
  let inst = instances.get(key);
  if (!inst) {
    inst = localforage.createInstance({ name: dbName, storeName });
    instances.set(key, inst);
  }
  return inst;
}

/** The account whose database is open (null while signed out). */
export function currentLocalOwner(): string | null {
  return ownerUid;
}

const legacy = (storeName: string) => localforage.createInstance({ name: LEGACY_DB, storeName });

/** Legacy meta keys that belonged to the device owner's sync state (moved, then removed). */
const LEGACY_OWNER_META = /^(pullCursorV\d+:|clientDataMigrated:|seedVersion$|localOwnerUid$)/;

/**
 * Copies the legacy shared database into `uid`'s own database when `uid` is its
 * recorded owner. Copy first, verify, then clear the legacy stores — a failure
 * part-way leaves the legacy data intact and the copy is retried next time.
 */
async function migrateLegacyIfOwner(uid: string): Promise<boolean> {
  const legacyMeta = legacy('meta');
  const owner = await legacyMeta.getItem<string>('localOwnerUid');
  if (owner !== uid) return false;
  const target = (s: string) => userStore(s as UserStoreName);
  for (const s of USER_STORES) {
    if (s === 'meta' || s === 'syncConflicts' || s === 'outbox') continue; // never in the pre-B0 shared database
    const src = legacy(s);
    const entries: [string, unknown][] = [];
    await src.iterate<unknown, void>((v, k) => {
      entries.push([k, v]);
    });
    const dst = target(s);
    for (const [k, v] of entries) {
      // Never overwrite something already in the account's own database.
      if ((await dst.getItem(k)) == null) await dst.setItem(k, v);
    }
  }
  const metaEntries: [string, unknown][] = [];
  await legacyMeta.iterate<unknown, void>((v, k) => {
    if (LEGACY_OWNER_META.test(k)) metaEntries.push([k, v]);
  });
  const dstMeta = target('meta');
  for (const [k, v] of metaEntries) if (k !== 'localOwnerUid' && (await dstMeta.getItem(k)) == null) await dstMeta.setItem(k, v);
  await dstMeta.setItem('migratedFromLegacy', Date.now());
  // Copy succeeded — now remove the moved data from the shared database.
  for (const s of USER_STORES) {
    if (s === 'meta' || s === 'syncConflicts' || s === 'outbox') continue; // never in the pre-B0 shared database
    await legacy(s).clear();
  }
  for (const [k] of metaEntries) await legacyMeta.removeItem(k);
  return true;
}

/**
 * Opens `uid`'s database (migrating the legacy shared one if `uid` owns it).
 * Idempotent for the same uid. Callers must flush any pending writes of the
 * previous account BEFORE switching (see `closeAccountScope`).
 */
export async function openAccountScope(uid: string): Promise<{ migrated: boolean }> {
  if (ownerUid === uid) return { migrated: false };
  dbName = userDbName(uid);
  ownerUid = uid;
  let migrated = false;
  try {
    const meta = userStore('meta');
    if ((await meta.getItem('migratedFromLegacy')) == null) migrated = await migrateLegacyIfOwner(uid);
  } catch (e) {
    console.warn('[localScope] legacy migration failed (legacy data kept, will retry):', e);
  }
  return { migrated };
}

/** Drops the cached store handles for `uid`'s database (before that database is deleted, B2.7). */
export function forgetAccountInstances(uid: string): void {
  const prefix = `${userDbName(uid)}/`;
  for (const key of [...instances.keys()]) if (key.startsWith(prefix)) instances.delete(key);
}

/** Points the data layer at an empty no-account database (sign-out). Nothing is deleted. */
export function closeAccountScope(): void {
  dbName = NO_ACCOUNT_DB;
  ownerUid = null;
}
