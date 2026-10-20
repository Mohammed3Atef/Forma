import localforage from 'localforage';

/**
 * Library → template sync results that did not land (B3.7, TS-04). Saving a library exercise also
 * pushes its name / media / metadata into every linked template (server side, idempotent). When
 * that push fails the exercise itself is saved, but templates keep the old copy — so the Library
 * keeps a notice with Retry until it succeeds or the coach dismisses it, across navigation and
 * reloads. One list per coach account (same device store as the editors' drafts).
 */
const store = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });

export interface SyncIssue {
  exerciseId: string;
  name: string;
  at: number;
}

export const syncIssuesKey = (coachId: string) => `librarySyncIssues:${coachId}`;

export async function readSyncIssues(coachId: string): Promise<SyncIssue[]> {
  try {
    const v = await store.getItem<unknown>(syncIssuesKey(coachId));
    return Array.isArray(v) ? v.filter((x): x is SyncIssue => !!x && typeof (x as SyncIssue).exerciseId === 'string' && typeof (x as SyncIssue).name === 'string') : [];
  } catch {
    return [];
  }
}

export async function writeSyncIssues(coachId: string, issues: SyncIssue[]): Promise<void> {
  try {
    if (issues.length) await store.setItem(syncIssuesKey(coachId), issues);
    else await store.removeItem(syncIssuesKey(coachId));
  } catch {
    /* storage unavailable — the notice still shows for this visit */
  }
}

/** Records (or clears) the outcome for one exercise; a later success removes its notice. */
export function withSyncResult(issues: SyncIssue[], exerciseId: string, name: string, failed: boolean, now = Date.now()): SyncIssue[] {
  const rest = issues.filter((i) => i.exerciseId !== exerciseId);
  return failed ? [...rest, { exerciseId, name, at: now }] : rest;
}
