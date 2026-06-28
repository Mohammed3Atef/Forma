# Feature: Offline / Sync

**Purpose.** The Client app is offline-first: it works from a local cache and syncs when online. Coach/Admin are
online-first (live reads); their management mutations are disabled offline.

**Data model.** Client domain data lives in IndexedDB via localforage (stores: profile, settings, workoutPlans,
workoutLogs, mealPlans, nutritionLogs, cardioLogs, weightLogs, measurementLogs, progressPhotos, dailyChecklists,
reminders, blobs, meta, deletions). Each record carries a `dirty` flag; tombstones track deletions. Cloud mirror
is `clientData/{uid}/{collection}` in Firestore.

**Key services.**
- [`src/data/sync/SyncEngine.ts`](../../src/data/sync/SyncEngine.ts) — push dirty → pull since a server
  watermark; last-write-wins by `updatedAt`; tombstone deletes.
- [`src/services/auth/cloudStore.ts`](../../src/services/auth/cloudStore.ts) — sync triggers (sign-in, `online`
  event, foreground, 120s) + `cloudStatus()` derivation.
- [`src/hooks/useOnlineStatus.ts`](../../src/hooks/useOnlineStatus.ts) — single connectivity source.

**Key UI.** `OfflineBanner` (global, [components/shared](../../src/components/shared/OfflineBanner.tsx)),
`SyncStatusIndicator` (Coach/Admin top bar, retry on error), `SyncStatusBadge` (client settings), `OfflineState`
(for views that need a connection).

**Permissions / rules.** No rule changes for offline; writes simply queue locally (client) or are blocked (Coach/Admin).

**Edge cases.** First load requires online (auth); lazy chunks are precached by the SW so they work offline after
first visit; after a pull, in-memory stores reload to avoid clobbering pulled records; opportunistic syncs are
throttled (60s) to avoid churn.

**Testing.** `e2e/offline.spec.ts` — banner appears on `context.setOffline(true)`, client cached data still
renders, a Coach/Admin dangerous action is disabled offline, banner clears on reconnect.
