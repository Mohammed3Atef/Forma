import { create } from 'zustand';
import { cloudAvailable } from '@/data/dataSource';

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
  /** Resolves true on success; on failure sets `error` and resolves false. */
  signIn: (email: string, password: string, create?: boolean) => Promise<boolean>;
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
  available: cloudAvailable(),
  user: null,
  syncing: false,
  lastSync: null,
  error: null,

  init() {
    if (initialized) return; // React StrictMode mounts effects twice in dev
    initialized = true;
    if (!cloudAvailable()) {
      console.info('[firebase] not configured — running local-only');
      return;
    }
    console.info('[firebase] configured — attaching auth listener');
    // Subscribe to auth changes and auto-sync on sign-in / reconnect.
    void import('@/services/auth/firebaseAuth').then(({ firebaseAuth }) => {
      firebaseAuth.onChange((u) => {
        console.info('[firebase] auth state:', u ? `signed in (${u.uid})` : 'signed out');
        set({ user: u ? { uid: u.uid, email: u.email } : null });
        if (u) void get().syncNow(true); // first sign-in sync always runs
      });
    });
    // Auto-sync: on reconnect, on app foreground, and periodically. Foreground/
    // interval syncs are opportunistic and throttled (see syncNow); reconnect
    // forces, since the offline gap means the last "sync" did nothing.
    window.addEventListener('online', () => void get().syncNow(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void get().syncNow();
    });
    setInterval(() => void get().syncNow(), 120_000);
  },

  async signIn(email, password, create) {
    set({ error: null });
    try {
      console.info(`[firebase] ${create ? 'signing up' : 'signing in'} ${email}`);
      const { firebaseAuth } = await import('@/services/auth/firebaseAuth');
      const user = create
        ? await firebaseAuth.signUp(email, password)
        : await firebaseAuth.signIn(email, password);
      console.info('[firebase] signed in as', user.uid);
      set({ user: { uid: user.uid, email: user.email } });
      await get().syncNow(true);
      return true;
    } catch (e) {
      console.error('[firebase] sign-in failed:', e);
      set({ error: e instanceof Error ? e.message : 'Sign-in failed' });
      return false;
    }
  },

  async signOut() {
    const { firebaseAuth } = await import('@/services/auth/firebaseAuth');
    await firebaseAuth.signOutUser();
    console.info('[firebase] signed out');
    set({ user: null, lastSync: null });
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
      console.info(`[sync] done · pushed ${result.pushed}, pulled ${result.pulled} → users/${user.uid}`);
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
