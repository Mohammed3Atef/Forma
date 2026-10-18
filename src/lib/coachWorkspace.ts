import type { CardioLog, MealPlan, NutritionLog, WeightLog, WorkoutLog, WorkoutPlan } from '@/types';
import { addDays, diffDays } from './utils';

/**
 * The coach's client workspace (B3.4 / blueprint §6.3): Summary · Plan · Progress · Profile.
 * Pure helpers — routes, and every number the workspace shows, computed from stored logs only
 * (each with its window; nothing predicted, scored or invented).
 */

export type WorkspaceSection = 'summary' | 'plan' | 'progress' | 'profile';
export const WORKSPACE_SECTIONS: WorkspaceSection[] = ['summary', 'plan', 'progress', 'profile'];
/** Editors are full-screen task flows (B3.5 rebuilds them); the workspace draws no chrome around them. */
export const EDITOR_SEGMENTS = ['workout', 'nutrition', 'cardio'] as const;
/** Profile's sections keep their own URLs (stored notification targets point at them). */
export const PROFILE_SEGMENTS = ['assessment', 'notes', 'subscription', 'history'] as const;

export type ProgressView = 'week' | 'day' | 'nutrition' | 'cardio' | 'body' | 'photos' | 'checkins';
export const PROGRESS_VIEWS: ProgressView[] = ['week', 'nutrition', 'cardio', 'body', 'photos', 'checkins'];

const enc = encodeURIComponent;
export const workspaceBase = (clientId: string) => `/coach/client/${enc(clientId)}`;

export function sectionPath(clientId: string, section: WorkspaceSection): string {
  return section === 'summary' ? workspaceBase(clientId) : `${workspaceBase(clientId)}/${section}`;
}

/** Which section a workspace URL belongs to — `editor` for a plan editor (no workspace chrome). */
export function sectionOf(pathname: string, clientId: string): WorkspaceSection | 'editor' {
  const base = `/coach/client/${clientId}`;
  const rest = pathname.split(/[?#]/)[0].replace(/\/+$/, '').slice(base.length).replace(/^\//, '');
  const seg = rest.split('/')[0];
  if (!seg) return 'summary';
  if ((EDITOR_SEGMENTS as readonly string[]).includes(seg)) return 'editor';
  if (seg === 'plan' || seg === 'versions') return 'plan';
  if (seg === 'progress' || seg === 'checkins' || seg === 'view') return 'progress';
  if (seg === 'profile' || (PROFILE_SEGMENTS as readonly string[]).includes(seg)) return 'profile';
  return 'summary';
}

/** The same place for another client (switching client keeps the section — blueprint §6.3). */
export function samePlaceFor(pathname: string, fromClientId: string, toClientId: string, search = ''): string {
  const base = `/coach/client/${fromClientId}`;
  const path = pathname.split(/[?#]/)[0];
  const rest = path.startsWith(base) ? path.slice(base.length) : '';
  const seg = rest.replace(/^\//, '').split('/')[0];
  // Editors are per-client work in progress: the switcher lands on the other client's Plan instead.
  if ((EDITOR_SEGMENTS as readonly string[]).includes(seg)) return `${workspaceBase(toClientId)}/plan`;
  return `${workspaceBase(toClientId)}${rest}${search}`;
}

export function progressViewOf(v: string | null | undefined): ProgressView {
  return v === 'day' || (PROGRESS_VIEWS as string[]).includes(v ?? '') ? (v as ProgressView) : 'week';
}

/** The retired "view as client" tabs (`…/view/:tab`) → Progress views (blueprint §5.3). */
export function legacyViewTarget(clientId: string, tab: string | undefined): string {
  const map: Record<string, ProgressView> = { activity: 'day', nutrition: 'nutrition', cardio: 'cardio', measurements: 'body', progress: 'body', photos: 'photos' };
  const view = map[tab ?? 'activity'] ?? 'day';
  return `${workspaceBase(clientId)}/progress?view=${view}`;
}

// ---- Summary numbers ------------------------------------------------------------

export interface TrainingStats {
  /** Distinct plan days finished in the current training week (Sat–Fri). */
  doneThisWeek: number;
  /** Training days in the plan (the client's weekly split), or null without a plan. */
  planDays: number | null;
  /** Finished workouts in the last 7 / 28 days, today included. */
  last7: number;
  last28: number;
  /** `YYYY-MM-DD` of the last finished workout, or null (none in the logs read). */
  lastWorkout: string | null;
}

/**
 * Same rule as the client's own Train screen: a plan day counts once per week when a finished
 * workout for it was logged this week. `logs` must cover at least the last 28 days.
 */
export function trainingStats(logs: WorkoutLog[], plan: WorkoutPlan | null | undefined, todayKey: string, weekStart: string): TrainingStats {
  const finished = logs.filter((l) => l.finished);
  const inLast = (n: number) => finished.filter((l) => l.date <= todayKey && diffDays(todayKey, l.date) < n).length;
  const planDayIds = new Set((plan?.days ?? []).map((d) => d.id));
  const thisWeek = new Set(finished.filter((l) => l.date >= weekStart && l.date <= todayKey && (planDayIds.size === 0 || planDayIds.has(l.dayId))).map((l) => l.dayId));
  const lastWorkout = finished.map((l) => l.date).filter((d) => d <= todayKey).sort().pop() ?? null;
  return { doneThisWeek: thisWeek.size, planDays: plan ? plan.days.length : null, last7: inLast(7), last28: inLast(28), lastWorkout };
}

export interface WeightTrend {
  latest: { date: string; kg: number } | null;
  /** Change from the earliest weigh-in within the last 28 days to the latest (null with fewer than two). */
  change: { from: string; kg: number } | null;
}

export function weightTrend(logs: WeightLog[], todayKey: string): WeightTrend {
  const sorted = [...logs].filter((l) => typeof l.weightKg === 'number' && l.date <= todayKey).sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  if (!latest) return { latest: null, change: null };
  const window = sorted.filter((l) => diffDays(todayKey, l.date) < 28);
  const first = window[0];
  const change = first && first.date !== latest.date ? { from: first.date, kg: Math.round((latest.weightKg - first.weightKg) * 10) / 10 } : null;
  return { latest: { date: latest.date, kg: latest.weightKg }, change };
}

// ---- Progress › Week ------------------------------------------------------------------

export interface WeekDayRow {
  date: string;
  workout: 'done' | 'started' | null;
  /** Name of the plan day trained, when known. */
  workoutTitle: string | null;
  mealsEaten: number;
  mealsPlanned: number | null;
  cardioMin: number;
  /** The day's log was read (false = outside the window the logs cover → "—"). */
  known: boolean;
}

/**
 * One row per day of the training week starting `weekStart`. `coveredFrom` is the oldest day the
 * fetched logs are complete for — older days are "unknown", never "nothing logged".
 */
export function weekRows(
  weekStart: string,
  todayKey: string,
  logs: { workouts: WorkoutLog[]; nutrition: NutritionLog[]; cardio: CardioLog[] },
  plans: { workout?: WorkoutPlan | null; meal?: MealPlan | null },
  coveredFrom: string,
): WeekDayRow[] {
  const w = new Map(logs.workouts.map((l) => [l.date, l]));
  const n = new Map(logs.nutrition.map((l) => [l.date, l]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d <= todayKey);
  return days.map((date) => {
    const wl = w.get(date);
    const started = !!wl && (wl.finished || wl.startedAt != null);
    const nl = n.get(date);
    return {
      date,
      workout: wl?.finished ? 'done' : started ? 'started' : null,
      workoutTitle: wl ? plans.workout?.days.find((d) => d.id === wl.dayId)?.title ?? null : null,
      mealsEaten: nl ? Object.values(nl.mealsEaten ?? {}).filter(Boolean).length : 0,
      mealsPlanned: plans.meal ? plans.meal.meals.length : null,
      cardioMin: Math.round(logs.cardio.filter((c) => c.date === date).reduce((a, c) => a + (c.durationSec ?? 0), 0) / 60),
      known: date >= coveredFrom,
    };
  });
}

/** How many days of daily logs the workspace reads (Summary 28-day window + 8 weeks of Progress). */
export const LOG_DAYS = 56;
