/**
 * Autosaved editor drafts (localforage) are only safe to restore when the
 * server copy has NOT changed since the draft was taken. A draft carries the
 * `updatedAt` of the plan it was edited from (or later, if the editor bumps
 * it); if the server's `updatedAt` is newer — a template was assigned, a
 * version restored, another device saved — the draft is stale and restoring
 * it would silently overwrite the newer plan on the next save.
 */
export function pickFreshDraft<T extends { updatedAt?: number }>(draft: T | null | undefined, server: T | null | undefined): T | null {
  if (!draft) return null;
  const serverAt = server?.updatedAt;
  const draftAt = draft.updatedAt;
  if (typeof serverAt === 'number' && typeof draftAt === 'number' && serverAt > draftAt) return null;
  return draft;
}
