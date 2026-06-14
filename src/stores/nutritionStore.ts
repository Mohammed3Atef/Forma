import { create } from 'zustand';
import type { FoodItem, Macros, MealPlan, NutritionLog } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { today } from '@/lib/utils';
import { notifyHabitChange } from './habitStore';

interface NutritionState {
  plan: MealPlan | null;
  log: NutritionLog | null;
  loaded: boolean;
  load: (date?: string) => Promise<void>;
  toggleMeal: (mealId: string) => Promise<void>;
  toggleSupplement: (suppId: string) => Promise<void>;
  addWater: (ml: number) => Promise<void>;
  setCreatine: (taken: boolean) => Promise<void>;
  addCustomFood: (food: FoodItem) => Promise<void>;
  removeCustomFood: (id: string) => Promise<void>;
  /** Replace a planned item for this day (original kept, shown struck-through). */
  replaceItem: (originalId: string, food: FoodItem) => Promise<void>;
  /** Remove a planned item for this day. */
  removeItem: (originalId: string) => Promise<void>;
  /** Undo a replace/remove and restore the original item for this day. */
  resetItem: (originalId: string) => Promise<void>;
  /** Add an extra food to a planned meal for this day. */
  addMealItem: (mealId: string, food: FoodItem) => Promise<void>;
  /** Remove an added extra food from a meal. */
  removeMealItem: (mealId: string, foodId: string) => Promise<void>;
}

/**
 * Pure macro total for a day. Exported so components compute it via useMemo —
 * never call this through a Zustand selector (it returns a new object and would
 * break useSyncExternalStore's snapshot caching).
 */
export function computeConsumed(plan: MealPlan | null, log: NutritionLog | null): Macros {
  const acc: Macros = { calories: 0, protein: 0, carbs: 0, fats: 0 };
  if (!log) return acc;
  const overrides = log.itemOverrides ?? {};
  const extras = log.extraItems ?? {};
  const addMacros = (f: FoodItem) => {
    acc.calories += f.calories;
    acc.protein += f.protein;
    acc.carbs += f.carbs;
    acc.fats += f.fats;
  };
  if (plan) {
    for (const meal of plan.meals) {
      if (!log.mealsEaten[meal.id]) continue;
      for (const item of meal.items) {
        if (item.id in overrides) {
          const ov = overrides[item.id];
          if (ov) addMacros(ov); // replacement (null = removed → skip)
        } else {
          addMacros(item); // original
        }
      }
      for (const extra of extras[meal.id] ?? []) addMacros(extra);
    }
  }
  for (const f of log.customFoods) addMacros(f);
  return acc;
}

function emptyLog(date: string): NutritionLog {
  return {
    id: date,
    date,
    mealsEaten: {},
    supplementsTaken: {},
    customFoods: [],
    itemOverrides: {},
    extraItems: {},
    waterMl: 0,
    creatineTaken: false,
    // 0 / clean: an untouched in-memory placeholder must never look newer than
    // real data (every mutation stamps its own Date.now() + dirty anyway).
    updatedAt: 0,
    dirty: false,
  };
}

/** Ensure new fields exist on logs created before they were added. */
function normalize(log: NutritionLog): NutritionLog {
  return {
    ...log,
    customFoods: log.customFoods ?? [],
    itemOverrides: log.itemOverrides ?? {},
    extraItems: log.extraItems ?? {},
    supplementsTaken: log.supplementsTaken ?? {},
    mealsEaten: log.mealsEaten ?? {},
    // Numeric/boolean backfills: a legacy or cloud-pulled log missing waterMl
    // would otherwise make addWater compute `undefined + ml` → NaN, which then
    // persists and breaks the water total, target check, and streaks.
    waterMl: typeof log.waterMl === 'number' && !Number.isNaN(log.waterMl) ? log.waterMl : 0,
    creatineTaken: log.creatineTaken ?? false,
  };
}

/** Stale-response guard: rapid day-switches fire overlapping loads. */
let loadSeq = 0;

export const useNutrition = create<NutritionState>((set, get) => ({
  plan: null,
  log: null,
  loaded: false,

  async load(date = today()) {
    const seq = ++loadSeq;
    const ds = getDataSource();
    const [plans, log] = await Promise.all([
      ds.mealPlans.getAll(),
      ds.nutritionLogs.get(date),
    ]);
    // If a newer load started while we awaited, drop this result — otherwise
    // the slower response wins and every toggle persists to the WRONG day.
    if (seq !== loadSeq) return;
    set({ plan: plans[0] ?? null, log: log ? normalize(log) : emptyLog(date), loaded: true });
  },

  async toggleMeal(mealId) {
    const cur = get().log;
    if (!cur) return;
    const next: NutritionLog = {
      ...cur,
      mealsEaten: { ...cur.mealsEaten, [mealId]: !cur.mealsEaten[mealId] },
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },

  async toggleSupplement(suppId) {
    const cur = get().log;
    if (!cur) return;
    const next: NutritionLog = {
      ...cur,
      supplementsTaken: { ...cur.supplementsTaken, [suppId]: !cur.supplementsTaken[suppId] },
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },

  async addWater(ml) {
    const cur = get().log;
    if (!cur) return;
    const next: NutritionLog = {
      ...cur,
      waterMl: Math.max(0, cur.waterMl + ml),
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },

  async setCreatine(taken) {
    const cur = get().log;
    if (!cur) return;
    const next: NutritionLog = { ...cur, creatineTaken: taken, updatedAt: Date.now(), dirty: true };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },

  async addCustomFood(food) {
    const cur = get().log;
    if (!cur) return;
    // Upsert by id so the same call adds OR edits an existing custom food.
    const exists = cur.customFoods.some((f) => f.id === food.id);
    const next: NutritionLog = {
      ...cur,
      customFoods: exists
        ? cur.customFoods.map((f) => (f.id === food.id ? food : f))
        : [...cur.customFoods, food],
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
  },

  async removeCustomFood(id) {
    const cur = get().log;
    if (!cur) return;
    const next: NutritionLog = {
      ...cur,
      customFoods: cur.customFoods.filter((f) => f.id !== id),
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
  },

  async replaceItem(originalId, food) {
    const cur = get().log;
    if (!cur) return;
    const next: NutritionLog = {
      ...cur,
      itemOverrides: { ...cur.itemOverrides, [originalId]: food },
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },

  async removeItem(originalId) {
    const cur = get().log;
    if (!cur) return;
    const next: NutritionLog = {
      ...cur,
      itemOverrides: { ...cur.itemOverrides, [originalId]: null },
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },

  async resetItem(originalId) {
    const cur = get().log;
    if (!cur) return;
    const overrides = { ...cur.itemOverrides };
    delete overrides[originalId];
    const next: NutritionLog = { ...cur, itemOverrides: overrides, updatedAt: Date.now(), dirty: true };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },

  async addMealItem(mealId, food) {
    const cur = get().log;
    if (!cur) return;
    const list = cur.extraItems[mealId] ?? [];
    const exists = list.some((f) => f.id === food.id);
    const nextList = exists ? list.map((f) => (f.id === food.id ? food : f)) : [...list, food];
    const next: NutritionLog = {
      ...cur,
      extraItems: { ...cur.extraItems, [mealId]: nextList },
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },

  async removeMealItem(mealId, foodId) {
    const cur = get().log;
    if (!cur) return;
    const next: NutritionLog = {
      ...cur,
      extraItems: { ...cur.extraItems, [mealId]: (cur.extraItems[mealId] ?? []).filter((f) => f.id !== foodId) },
      updatedAt: Date.now(),
      dirty: true,
    };
    set({ log: next });
    await getDataSource().nutritionLogs.put(next);
    notifyHabitChange();
  },
}));
