import localforage from 'localforage';
import { LEGACY_DB, currentLocalOwner, forgetAccountInstances, userDbName } from './localScope';
import { syncLocalRuntime } from './accountRuntime';
import { countPendingChanges } from './sync/pending';

/**
 * "Remove this device's data" (B2.7, brief + PWA-14): takes the signed-in
 * account's LOCAL copy off this device — never anything on the server.
 *
 *  - Refused while anything is only on this device (unsynced edits, sync
 *    conflicts, queued messages / check-ins / uploads): the caller says how
 *    many and asks the client to sync first. Nothing unsynced is ever dropped.
 *  - Unfinished drafts (check-in, assessment) are not "changes" — the caller
 *    names them in the confirmation, so they are never removed silently.
 *  - The account is signed out and its runtime closed BEFORE its database is
 *    deleted, so no store can write into it while it goes.
 */

const checkInDraftPrefix = (uid: string) => `forma.checkinDraft.v1.${uid}.`;
const deviceMeta = () => localforage.createInstance({ name: LEGACY_DB, storeName: 'meta' });

/** Changes that exist only on this device (Infinity when that can't be verified — treat as blocked). */
export async function pendingOnDevice(): Promise<number> {
  try {
    return await countPendingChanges();
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Unfinished check-in / assessment drafts kept on this device for `uid`. */
export async function draftsOnDevice(uid: string): Promise<number> {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(checkInDraftPrefix(uid))) n++;
  } catch {
    /* storage unavailable */
  }
  try {
    if ((await deviceMeta().getItem(`assessmentDraft:${uid}`)) != null) n++;
  } catch {
    /* storage unavailable */
  }
  return n;
}

/**
 * Deletes `uid`'s local database, its per-account keys and its drafts. The
 * account must already be signed out; this waits for its runtime to close.
 */
export async function removeAccountDataFromDevice(uid: string): Promise<void> {
  await syncLocalRuntime(null, null);
  if (currentLocalOwner() === uid) throw new Error('The account is still open on this device.');
  forgetAccountInstances(uid);
  await localforage.dropInstance({ name: userDbName(uid) });
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes(uid)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
  await deviceMeta()
    .removeItem(`assessmentDraft:${uid}`)
    .catch(() => undefined);
}
