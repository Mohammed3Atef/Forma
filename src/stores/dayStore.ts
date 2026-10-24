import { create } from 'zustand';
import { addDays, today } from '@/lib/utils';

/**
 * The calendar day the whole app is currently focused on. All modules
 * (workout, nutrition, cardio, habits) read and write data for this day, so the
 * user can navigate to any date and log/review just that day's data.
 */
interface DayState {
  selected: string;
  setDay: (day: string) => void;
  shift: (deltaDays: number) => void;
  reset: () => void;
}

export const useDay = create<DayState>((set, get) => ({
  selected: today(),
  setDay: (day) => set({ selected: day }),
  shift: (deltaDays) => set({ selected: addDays(get().selected, deltaDays) }),
  reset: () => set({ selected: today() }),
}));

/** Coming back after this long starts a new "visit": the app is about today again. */
export const RESUME_RESET_MS = 30 * 60_000;

// A PWA left open across midnight used to keep logging to yesterday: `selected`
// was computed once at module load. Roll forward on re-focus when the user was
// focused on the old "today"; and after a long time away, any past day the user
// was browsing is dropped too (B0 / CL-04 — logging defaults to today).
if (typeof document !== 'undefined') {
  let lastToday = today();
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      hiddenAt = Date.now();
      return;
    }
    const now = today();
    const longAway = hiddenAt != null && Date.now() - hiddenAt >= RESUME_RESET_MS;
    hiddenAt = null;
    if (now !== lastToday) {
      if (useDay.getState().selected === lastToday) useDay.getState().setDay(now);
      lastToday = now;
    }
    if (longAway && useDay.getState().selected !== now) useDay.getState().reset();
  });
}
