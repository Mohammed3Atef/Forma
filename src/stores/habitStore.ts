import { create } from 'zustand';
import type { DailyChecklist, Streaks } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { today } from '@/lib/utils';
import { useDay } from './dayStore';
import {
  buildChecklist,
  computeStreaks,
  extractManual,
} from '@/services/habits/habitLogic';

const EMPTY_STREAK = { current: 0, longest: 0, lastDate: null };

interface HabitState {
  checklist: DailyChecklist | null;
  streaks: Streaks;
  /** Recompute today's checklist from current logs and persist it. */
  refresh: (date?: string) => Promise<void>;
  /** Recompute all streaks (reads full history). */
  refreshStreaks: () => Promise<void>;
  /** Manually toggle a checklist item (overrides the auto value). */
  toggle: (key: string) => Promise<void>;
}

/** Two checklists are equivalent when every item agrees (order-insensitive). */
function sameChecklist(a: DailyChecklist, b: DailyChecklist): boolean {
  const ak = Object.keys(a.items);
  const bk = Object.keys(b.items);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => {
    const x = a.items[k];
    const y = b.items[k];
    return !!y && x.done === y.done && x.auto === y.auto;
  });
}

/**
 * Monotonic token: a refresh()/toggle() that finishes after a newer call
 * started must not overwrite its result (otherwise an in-flight rebuild that
 * read the store BEFORE a manual toggle would persist right over it, and an
 * older day's checklist could land after a newer day's).
 */
let refreshSeq = 0;

export const useHabits = create<HabitState>((set, get) => ({
  checklist: null,
  streaks: {
    workout: EMPTY_STREAK,
    nutrition: EMPTY_STREAK,
    water: EMPTY_STREAK,
    steps: EMPTY_STREAK,
    overall: EMPTY_STREAK,
  },

  async refresh(date = today()) {
    const seq = ++refreshSeq;
    const ds = getDataSource();
    const [settings, mealPlan, workoutLog, nutritionLog, cardioAll, stored] =
      await Promise.all([
        ds.settings.get(),
        ds.mealPlans.getAll().then((p) => p[0] ?? null),
        ds.workoutLogs.get(date),
        ds.nutritionLogs.get(date),
        ds.cardioLogs.getAll(),
        ds.dailyChecklists.get(date),
      ]);
    if (!settings) return;
    if (seq !== refreshSeq) return; // superseded by a newer refresh/toggle

    const built = buildChecklist({
      date,
      targets: settings.targets,
      mealPlan,
      workoutLog,
      nutritionLog,
      cardioForDay: cardioAll.filter((c) => c.date === date),
      manual: extractManual(stored),
    });

    // Only persist when something actually changed. Re-stamping an identical
    // checklist on every app load made the local copy always "newer", so a
    // remote device's manual toggles could never win a sync, and every device
    // overwrote the other's checklist in the cloud on every pass.
    if (stored && sameChecklist(stored, built)) {
      set({ checklist: stored });
    } else {
      await ds.dailyChecklists.put(built);
      set({ checklist: built });
    }
    await get().refreshStreaks();
  },

  async refreshStreaks() {
    const ds = getDataSource();
    const [settings, mealPlan, checklists, workoutLogs, nutritionLogs, cardioLogs] =
      await Promise.all([
        ds.settings.get(),
        ds.mealPlans.getAll().then((p) => p[0] ?? null),
        ds.dailyChecklists.getAll(),
        ds.workoutLogs.getAll(),
        ds.nutritionLogs.getAll(),
        ds.cardioLogs.getAll(),
      ]);
    if (!settings) return;

    const streaks = computeStreaks({
      todayKey: today(),
      checklists,
      workoutLogs,
      nutritionLogs,
      cardioLogs,
      targets: settings.targets,
      mealCount: mealPlan?.meals.length ?? 0,
    });
    set({ streaks });
  },

  async toggle(key) {
    const cur = get().checklist;
    if (!cur) return;
    refreshSeq += 1; // invalidate any in-flight refresh built from pre-toggle data
    const ds = getDataSource();
    const existing = cur.items[key];
    const nextDone = !existing?.done;
    const items = {
      ...cur.items,
      [key]: { done: nextDone, auto: false },
    };
    const keys = Object.keys(items);
    const doneCount = keys.filter((k) => items[k].done).length;
    const next: DailyChecklist = {
      ...cur,
      items,
      completionPct: keys.length ? Math.round((doneCount / keys.length) * 100) : 0,
      fullyComplete: keys.length > 0 && doneCount === keys.length,
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ checklist: next });
    await ds.dailyChecklists.put(next);
    await get().refreshStreaks();
  },
}));

/** Refresh the habit checklist for the currently-focused day after a change. */
export function notifyHabitChange(): void {
  void useHabits.getState().refresh(useDay.getState().selected);
}
