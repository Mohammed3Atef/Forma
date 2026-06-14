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

// A PWA left open across midnight used to keep logging to yesterday: `selected`
// was computed once at module load. Roll forward on re-focus — but only when
// the user was focused on the old "today" (a deliberately selected past day
// stays put).
if (typeof document !== 'undefined') {
  let lastToday = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = today();
    if (now !== lastToday) {
      if (useDay.getState().selected === lastToday) useDay.getState().setDay(now);
      lastToday = now;
    }
  });
}
