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
 * The CLIENT role's local-first runtime (B0 / PWA-04): tracker stores,
 * reminders and cloud sync. Loaded on demand by `accountRuntime` when a client
 * signs in (B1.13 / AR-02), so coach, admin and anonymous sessions never
 * download it. The chunk is precached, so an installed app still boots offline.
 */
export async function enterClient(uid: string): Promise<void> {
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

export async function leaveClient(): Promise<void> {
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

/** Settle debounced writes now (the app is being hidden or closed). */
export function flushClientWrites(): Promise<void> {
  return flushWorkoutWrites();
}
