import type {
  CardioLog,
  ChecklistItemState,
  DailyChecklist,
  DailyTargets,
  MealPlan,
  NutritionLog,
  StreakValue,
  Streaks,
  WorkoutLog,
} from '@/types';
import { diffDays } from '@/lib/utils';

/**
 * Pure functions that derive the daily checklist and streaks from the raw logs.
 * Keeping them pure means the checklist is always recomputable from source data
 * (no drift) and is trivially testable.
 */

export interface DayInputs {
  date: string;
  targets: DailyTargets;
  mealPlan: MealPlan | null;
  workoutLog: WorkoutLog | null;
  nutritionLog: NutritionLog | null;
  cardioForDay: CardioLog[];
  /** Manual overrides the user has toggled (key -> done). */
  manual?: Record<string, boolean>;
}

/** Builds the auto-derived checklist for a single day. */
export function buildChecklist(input: DayInputs): DailyChecklist {
  const { date, targets, mealPlan, workoutLog, nutritionLog, cardioForDay, manual } = input;
  const items: Record<string, ChecklistItemState> = {};

  const setItem = (key: string, autoDone: boolean) => {
    const manualDone = manual?.[key];
    const done = manualDone ?? autoDone;
    items[key] = { done, auto: manualDone === undefined };
  };

  // Workout: done if a finished session exists, or all working sets are done.
  const workoutDone =
    !!workoutLog &&
    (workoutLog.finished ||
      (workoutLog.exercises.length > 0 &&
        workoutLog.exercises.every((ex) => ex.sets.every((s) => s.done))));
  setItem('workout', workoutDone);

  // Each planned meal.
  if (mealPlan) {
    for (const meal of mealPlan.meals) {
      setItem(`meal:${meal.id}`, !!nutritionLog?.mealsEaten[meal.id]);
    }
    // Supplements: done when every supplement is checked. Omitted entirely for
    // plans with no supplements — a permanently-false item would make
    // `fullyComplete` unreachable and freeze the overall streak at 0.
    const supps = mealPlan.supplements;
    if (supps.length > 0) {
      setItem('supplements', supps.every((s) => nutritionLog?.supplementsTaken[s.id]));
    }
  }

  // Water target — only a checklist item when the coach has set a water target
  // (otherwise `0 >= 0` would auto-complete it for a client with no plan).
  if (targets.waterMl > 0) {
    setItem('water', (nutritionLog?.waterMl ?? 0) >= targets.waterMl);
  }
  // (Creatine is no longer a hardcoded item — coaches add it as a supplement.)

  // Cardio + steps are ONE goal (the 40-min treadmill is the 10k steps): the
  // item is done when EITHER the steps target OR the cardio-minutes target is
  // met. Only a checklist item when the coach has set a steps/cardio target.
  if (targets.steps > 0 || targets.cardioMinutes > 0) {
    const totalSteps = cardioForDay.reduce((a, c) => a + (c.steps ?? 0), 0);
    const totalCardioSec = cardioForDay.reduce((a, c) => a + c.durationSec, 0);
    const stepsMet = targets.steps > 0 && totalSteps >= targets.steps;
    const cardioMet = targets.cardioMinutes > 0 && totalCardioSec >= targets.cardioMinutes * 60;
    setItem('cardio', stepsMet || cardioMet);
  }

  const keys = Object.keys(items);
  const doneCount = keys.filter((k) => items[k].done).length;
  const completionPct = keys.length ? Math.round((doneCount / keys.length) * 100) : 0;

  return {
    id: date,
    date,
    items,
    completionPct,
    fullyComplete: keys.length > 0 && doneCount === keys.length,
    updatedAt: Date.now(),
    dirty: true,
  };
}

/** Merges a freshly-built checklist with manual overrides from a stored one. */
export function extractManual(stored: DailyChecklist | null): Record<string, boolean> {
  if (!stored) return {};
  const manual: Record<string, boolean> = {};
  for (const [key, state] of Object.entries(stored.items)) {
    if (!state.auto) manual[key] = state.done;
  }
  return manual;
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

const EMPTY: StreakValue = { current: 0, longest: 0, lastDate: null };

/**
 * Rest-day tolerance for the workout streak: a run survives gaps of up to this
 * many days, so it only resets after 3 consecutive days with no workout.
 */
const WORKOUT_MAX_GAP_DAYS = 3;

/**
 * Computes a streak from the set of "qualifying" day keys (days where the habit
 * was met). Counts qualifying days in a run, tolerating gaps up to `maxGap` days
 * between them — so rest days don't break a workout streak. The current run is
 * "alive" as long as the most recent qualifying day is within `maxGap` of today;
 * once that many days pass with nothing logged, it resets to 0.
 *
 * `maxGap = 1` means strictly consecutive days (the default for daily habits).
 */
function streakFromDays(qualifying: Set<string>, todayKey: string, maxGap = 1): StreakValue {
  if (qualifying.size === 0) return EMPTY;
  const sorted = [...qualifying].sort();
  const lastDate = sorted[sorted.length - 1];

  // longest run, allowing gaps up to maxGap days between qualifying days
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && diffDays(d, prev) <= maxGap) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  // current run: alive only if the latest qualifying day is within maxGap of
  // today, then count qualifying days back while each gap stays within maxGap.
  let current = 0;
  if (diffDays(todayKey, lastDate) <= maxGap) {
    current = 1;
    for (let i = sorted.length - 1; i > 0; i -= 1) {
      if (diffDays(sorted[i], sorted[i - 1]) <= maxGap) current += 1;
      else break;
    }
  }

  return { current, longest, lastDate };
}

export interface StreakInputs {
  todayKey: string;
  checklists: DailyChecklist[];
  workoutLogs: WorkoutLog[];
  nutritionLogs: NutritionLog[];
  cardioLogs: CardioLog[];
  targets: DailyTargets;
  mealCount: number;
}

export function computeStreaks(input: StreakInputs): Streaks {
  const { todayKey, checklists, workoutLogs, nutritionLogs, cardioLogs, targets, mealCount } =
    input;

  const workoutDays = new Set(
    workoutLogs.filter((w) => w.finished).map((w) => w.date),
  );

  const nutritionDays = new Set(
    nutritionLogs
      .filter((n) => {
        const eaten = Object.values(n.mealsEaten).filter(Boolean).length;
        return mealCount > 0 && eaten >= mealCount;
      })
      .map((n) => n.date),
  );

  const waterDays = new Set(
    nutritionLogs.filter((n) => n.waterMl >= targets.waterMl).map((n) => n.date),
  );

  const stepsByDay = new Map<string, number>();
  for (const c of cardioLogs) {
    stepsByDay.set(c.date, (stepsByDay.get(c.date) ?? 0) + (c.steps ?? 0));
  }
  const stepsDays = new Set(
    [...stepsByDay.entries()].filter(([, v]) => v >= targets.steps).map(([k]) => k),
  );

  const overallDays = new Set(
    checklists.filter((c) => c.fullyComplete).map((c) => c.date),
  );

  return {
    workout: streakFromDays(workoutDays, todayKey, WORKOUT_MAX_GAP_DAYS),
    nutrition: streakFromDays(nutritionDays, todayKey),
    water: streakFromDays(waterDays, todayKey),
    steps: streakFromDays(stepsDays, todayKey),
    overall: streakFromDays(overallDays, todayKey),
  };
}
