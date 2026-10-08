import { create } from 'zustand';
import { hasNavGuard } from './navGuardStore';
import { useWorkout } from './workoutStore';
import { useCardio } from './cardioStore';
import { useTimer } from './timerStore';

/**
 * "A new version is ready" (B0 / B0.7, PWA-09). The app never reloads itself
 * in the middle of critical work: it installs the update only at a SAFE POINT
 * (the app is hidden and nothing critical is running) or when the user taps
 * "Update" — and a tap during critical work asks first.
 */
interface UpdateState {
  ready: boolean;
  apply: (() => void) | null;
  setReady: (apply: () => void) => void;
}

export const useUpdate = create<UpdateState>((set) => ({
  ready: false,
  apply: null,
  setReady: (apply) => set({ ready: true, apply }),
}));

/** Work a reload must never interrupt — the reason, or null when it is safe. */
export function criticalWork(): string | null {
  const w = useWorkout.getState().active;
  if (w && w.startedAt && !w.finished) return 'workout'; // live workout session
  if (useCardio.getState().liveStart) return 'cardio'; // live cardio timer
  if (useTimer.getState().running) return 'rest-timer';
  if (hasNavGuard()) return 'unsaved-or-task'; // dirty editor / check-in in progress
  return null;
}

export function isCriticalWorkActive(): boolean {
  return criticalWork() != null;
}

/** Install the update now if — and only if — this is a safe point. Returns true when applied. */
export function applyUpdateAtSafePoint(): boolean {
  const { ready, apply } = useUpdate.getState();
  if (!ready || !apply) return false;
  if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') return false;
  const busy = criticalWork();
  if (busy) {
    console.info(`[update] deferred: ${busy} in progress`);
    return false;
  }
  apply();
  return true;
}
