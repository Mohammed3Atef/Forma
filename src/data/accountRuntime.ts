import type { Role } from '@/types';
import { closeAccountScope, currentLocalOwner, openAccountScope } from './localScope';
import { bootstrapData } from './bootstrap';
import { useSettings } from '@/stores/settingsStore';
import { flushWorkoutWrites, useWorkout } from '@/stores/workoutStore';
import { useNutrition } from '@/stores/nutritionStore';
import { useCardio } from '@/stores/cardioStore';
import { useHabits } from '@/stores/habitStore';
import { useMeasurements } from '@/stores/measurementStore';
import { useReminders } from '@/services/reminders/reminderStore';
import { useCloud } from '@/services/auth/cloudStore';
import { useTimer } from '@/stores/timerStore';
import { usePhotos } from '@/stores/photoStore';

/**
 * Opens / closes the signed-in account's LOCAL runtime (B0 / PWA-02, PWA-04):
 *  - every account gets its own local database (`localScope.ts`);
 *  - only the CLIENT role runs the local-first client runtime — stores,
 *    reminders and cloud sync. Coaches/admins only load their device settings
 *    (locale) and never read, push or mark-synced any client data;
 *  - leaving an account first flushes its pending writes and waits for any
 *    in-flight sync, so nothing of one account can land in another's database.
 * Switches are serialized.
 */
let active: { uid: string; role: Role } | null = null;
let chain: Promise<void> = Promise.resolve();

async function leave(): Promise<void> {
  if (!active) return;
  if (active.role === 'client') {
    await flushWorkoutWrites().catch(() => undefined);
    useReminders.getState().stop();
    // Stop this account's timers in memory only (their persisted state stays with the account).
    const timer = useTimer.getState();
    if (timer.intervalId) clearInterval(timer.intervalId);
    useTimer.setState({ running: false, paused: false, remainingSec: 0, endsAt: null, intervalId: null, pausedRemaining: null });
    useCardio.setState({ liveStart: null, liveParams: null });
    // Photos load on demand (not in enter()), so drop this account's list — the
    // next account must never see its metadata or CDN URLs (PWA-14).
    usePhotos.setState({ photos: [], loaded: false });
    await useCloud.getState().stop();
  }
  closeAccountScope();
  active = null;
}

async function enter(uid: string, role: Role): Promise<void> {
  await openAccountScope(uid);
  await bootstrapData();
  await useSettings.getState().load();
  if (role === 'client') {
    await Promise.all([
      useWorkout.getState().load(),
      useNutrition.getState().load(),
      useCardio.getState().load(),
      useMeasurements.getState().load(),
    ]);
    await useHabits.getState().refresh();
    await useReminders.getState().load();
    useReminders.getState().start();
    useTimer.getState().restore(); // a rest timer running when the app was killed (PWA-07)
    useCloud.getState().start(uid);
  }
  active = { uid, role };
}

/** Make the local runtime match the signed-in account (null = signed out). */
export function syncLocalRuntime(uid: string | null, role: Role | null): Promise<void> {
  chain = chain
    .then(async () => {
      if (active && uid === active.uid && role === active.role) return;
      await leave();
      if (uid && role) await enter(uid, role);
    })
    .catch((e) => {
      console.error('[runtime] failed to open the local data for this account:', e);
    });
  return chain;
}

/** True when the client runtime for `uid` is open (stores loaded from its own database). */
export function clientRuntimeReady(uid: string | null | undefined): boolean {
  return !!uid && active?.uid === uid && active.role === 'client' && currentLocalOwner() === uid;
}

/** The account whose local runtime is open (any role). */
export function runtimeAccount(): string | null {
  return active?.uid ?? null;
}

// Crash-safety (B0 / PWA-07): settle debounced writes the moment the app is
// hidden — iOS may kill a backgrounded PWA without another chance.
if (typeof document !== 'undefined') {
  const flush = () => {
    if (active?.role === 'client') void flushWorkoutWrites();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}
