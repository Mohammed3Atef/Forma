import { create } from 'zustand';
import { useSession } from './sessionStore';

/** Opportunistic syncs (tab refocus, reconnect) within this window are skipped. */
const MIN_SYNC_INTERVAL_MS = 60_000;

interface CloudUser {
  uid: string;
  email: string | null;
}

export type CloudStatus = 'local' | 'signedIn' | 'syncing' | 'synced' | 'error';

interface CloudState {
  available: boolean;
  user: CloudUser | null;
  syncing: boolean;
  lastSync: number | null;
  error: string | null;
  init: () => void;
  /** @deprecated sign-in now goes through `useSession` — this mirrors it, it does not perform its own sign-in. */
  signIn: (email: string, password: string, create?: boolean) => Promise<boolean>;
  /** @deprecated sign-out now goes through `useSession`. */
  signOut: () => Promise<void>;
  syncNow: (force?: boolean) => Promise<void>;
  wipeCloud: () => Promise<void>;
}

/** Derive the badge status from the current cloud state. */
export function cloudStatus(s: Pick<CloudState, 'available' | 'user' | 'syncing' | 'lastSync' | 'error'>): CloudStatus {
  if (s.user && s.error) return 'error';
  if (!s.available || !s.user) return 'local';
  if (s.syncing) return 'syncing';
  if (s.lastSync) return 'synced';
  return 'signedIn';
}

/** Guard so init() can be called from React effects (StrictMode re-runs them). */
let initialized = false;

/**
 * After a pull lands new records in IndexedDB, the in-memory zustand stores
 * still hold the pre-sync data — and the user's next interaction would persist
 * that stale state right back over the pulled records (with a newer updatedAt,
 * wiping the other device's data in the cloud too). Reload them all.
 */
async function refreshStoresAfterPull(): Promise<void> {
  const [
    { useSettings },
    { useWorkout },
    { useNutrition },
    { useCardio },
    { useMeasurements },
    { useHabits },
    { usePhotos },
    { useReminders },
    { useDay },
  ] = await Promise.all([
    import('@/stores/settingsStore'),
    import('@/stores/workoutStore'),
    import('@/stores/nutritionStore'),
    import('@/stores/cardioStore'),
    import('@/stores/measurementStore'),
    import('@/stores/habitStore'),
    import('@/stores/photoStore'),
    import('@/services/reminders/reminderStore'),
    import('@/stores/dayStore'),
  ]);
  const day = useDay.getState().selected;
  await Promise.all([
    useSettings.getState().load(),
    useWorkout.getState().load(),
    useNutrition.getState().load(day),
    useCardio.getState().load(),
    useMeasurements.getState().load(),
    usePhotos.getState().load(),
    useReminders.getState().load(),
  ]);
  // load() refocuses today — restore the user's selected day (the loadDay
  // guard keeps a live in-progress session untouched).
  useWorkout.getState().loadDay(day);
  await useHabits.getState().refresh(day);
}

export const useCloud = create<CloudState>((set, get) => ({
  // The Mongo backend is mandatory infrastructure now (not an opt-in Firebase
  // toggle) — sync is "available" whenever the user is signed in at all.
  available: true,
  user: null,
  syncing: false,
  lastSync: null,
  error: null,

  init() {
    if (initialized) return; // React StrictMode mounts effects twice in dev
    initialized = true;
    // There's only ONE account system now (`useSession`) — mirror its identity
    // instead of maintaining a separate sign-in. Sync fires on every account
    // change (sign-in, sign-out, session restore on reload).
    const applyAccount = (account: ReturnType<typeof useSession.getState>['account']) => {
      const uid = account?.id ?? null;
      const prev = get().user?.uid ?? null;
      if (uid === prev) return;
      set({ user: uid ? { uid, email: account?.email ?? null } : null, lastSync: uid ? get().lastSync : null });
      if (uid) void get().syncNow(true);
    };
    applyAccount(useSession.getState().account);
    useSession.subscribe((s) => applyAccount(s.account));
    // Auto-sync: on reconnect, on app foreground, and periodically. Foreground/
    // interval syncs are opportunistic and throttled (see syncNow); reconnect
    // forces, since the offline gap means the last "sync" did nothing.
    window.addEventListener('online', () => void get().syncNow(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void get().syncNow();
    });
    // Skip the periodic tick while backgrounded — a hidden tab already gets a
    // sync the moment it regains visibility (above), so polling every 120s
    // regardless would just burn battery/data for a tab nobody is looking at.
    setInterval(() => {
      if (document.visibilityState === 'visible') void get().syncNow();
    }, 120_000);
  },

  async signIn() {
    console.warn('[cloud] signIn() is deprecated — sign in via useSession; cloud sync follows automatically.');
    return !!get().user;
  },

  async signOut() {
    console.warn('[cloud] signOut() is deprecated — sign out via useSession; cloud sync follows automatically.');
  },

  async syncNow(force = false) {
    const { user, syncing, lastSync } = get();
    if (!user || syncing) return;
    // Skip redundant opportunistic syncs; explicit/sign-in syncs pass force.
    if (!force && lastSync && Date.now() - lastSync < MIN_SYNC_INTERVAL_MS) return;
    set({ syncing: true, error: null });
    try {
      const { SyncEngine } = await import('@/data/sync/SyncEngine');
      const result = await new SyncEngine(user.uid).sync();
      if (result.offline) return; // not a real sync — don't claim "synced"
      console.info(`[sync] done · pushed ${result.pushed}, pulled ${result.pulled}`);
      if (result.pulled > 0) await refreshStoresAfterPull();
      set({ lastSync: Date.now() });
    } catch (e) {
      console.error('[sync] failed:', e);
      set({ error: e instanceof Error ? e.message : 'Sync failed' });
    } finally {
      set({ syncing: false });
    }
  },

  async wipeCloud() {
    const { user } = get();
    if (!user) return;
    // Wait out any in-flight sync, then hold the mutex so a background sync
    // can't push deleted records back while the wipe runs.
    while (get().syncing) await new Promise((r) => setTimeout(r, 200));
    set({ syncing: true });
    try {
      const { SyncEngine } = await import('@/data/sync/SyncEngine');
      await new SyncEngine(user.uid).wipeCloud();
      set({ lastSync: null });
    } finally {
      set({ syncing: false });
    }
  },
}));
