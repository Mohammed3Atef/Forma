import { describe, expect, it } from 'vitest';
import { applyFoodEdit, cleanNotes, mealCalories, normalizeMealPlan, plannedTotals, type FoodEdit } from './nutritionPlanModel';
import type { MealPlan } from '../types';
import type { FoodItem } from '../types';

const food = (id: string, extra: Partial<FoodItem> = {}): FoodItem => ({ id, name: { en: id, ar: `ع-${id}` }, quantity: '100 g', calories: 200, protein: 10, carbs: 20, fats: 5, ...extra });
const edit = (f: FoodItem, patch: Partial<FoodEdit> = {}): FoodEdit => ({ name: f.name, quantity: f.quantity, calories: f.calories, protein: f.protein, carbs: f.carbs, fats: f.fats, allowCustom: !!f.allowCustomSubstitution, ...patch });
let n = 0;
const newId = () => `new-${++n}`;

describe('nutrition editor rules (B3.5)', () => {
  it('planned totals are real sums; foods without macros are counted as incomplete, not as 0 kcal', () => {
    const plan = { meals: [{ id: 'm1', slot: 'breakfast' as const, label: { en: 'B', ar: '' }, items: [food('a'), food('b', { calories: 0, protein: 0, carbs: 0, fats: 0 })] }] };
    expect(plannedTotals(plan)).toEqual({ planned: { calories: 200, protein: 10, carbs: 20, fats: 5 }, incomplete: 1 });
    expect(mealCalories(plan.meals[0].items)).toBe(200);
  });

  it('an untouched food edit keeps the item exactly — alternatives snapshot, custom flag, Arabic name, unknown fields', () => {
    const orig = food('a', { allowedAlternativeGroupId: 'g1', allowedAlternatives: [food('x')], allowCustomSubstitution: true, ...({ coachNote: 'keep' } as object) });
    expect(applyFoodEdit(orig, 'a', edit(orig), newId)).toEqual(orig);
  });

  it('changes only what was edited; a new group re-snapshots, "none" clears, an unchanged (even deleted) group keeps its snapshot', () => {
    const orig = food('a', { allowedAlternativeGroupId: 'gone', allowedAlternatives: [food('x')] });
    const kcal = applyFoodEdit(orig, 'a', edit(orig, { calories: 250 }), newId);
    expect(kcal).toEqual({ ...orig, calories: 250 });
    const regrouped = applyFoodEdit(orig, 'a', edit(orig, { group: { id: 'g2', foods: [food('y'), food('', { name: { en: 'z', ar: '' } })] } }), newId);
    expect(regrouped.allowedAlternativeGroupId).toBe('g2');
    expect(regrouped.allowedAlternatives?.map((f) => f.id)).toEqual(['y', 'new-1']);
    const none = applyFoodEdit(orig, 'a', edit(orig, { group: null }), newId);
    expect(none).not.toHaveProperty('allowedAlternatives');
    expect(none).not.toHaveProperty('allowedAlternativeGroupId');
  });

  it('a new food gets exactly the entered values; blank bilingual notes are dropped', () => {
    const created = applyFoodEdit(null, 'f9', { name: { en: 'Oats', ar: 'شوفان' }, quantity: ' 80 g ', calories: 300, protein: 10, carbs: 54, fats: 6, allowCustom: false }, newId);
    expect(created).toEqual({ id: 'f9', name: { en: 'Oats', ar: 'شوفان' }, quantity: '80 g', calories: 300, protein: 10, carbs: 54, fats: 6 });
    expect(cleanNotes([{ en: ' ', ar: '' }, { en: '', ar: 'اشرب ماء' }, { en: 'Water', ar: '' }])).toEqual([{ en: '', ar: 'اشرب ماء' }, { en: 'Water', ar: '' }]);
  });
});

describe('older / malformed stored plans open instead of breaking', () => {
  it('a complete plan is returned as is (same object)', () => {
    const p = { id: 'p', name: 'x', meals: [{ id: 'm', slot: 'lunch', label: { en: 'L', ar: '' }, items: [food('a')] }], targets: { calories: 0, protein: 0, carbs: 0, fats: 0 }, supplements: [], waterTargetMl: 0, beverageNotes: [], generalNotes: [], updatedAt: 1 } as MealPlan;
    expect(normalizeMealPlan(p)).toBe(p);
  });
  it('missing lists, labels, names and doses read as empty; other fields (and unknown ones) are kept', () => {
    const p = { id: 'p', name: 'x', meals: [{ id: 'm1', name: { en: 'Breakfast' } }, { id: 'm2', slot: 'dinner', label: { en: 'D', ar: '' }, items: [{ id: 'f', calories: 1 }] }], waterTargetMl: 0, updatedAt: 1 } as unknown as MealPlan;
    const n = normalizeMealPlan(p);
    expect(n.meals[0]).toEqual({ id: 'm1', name: { en: 'Breakfast' }, label: { en: '', ar: '' }, items: [] });
    expect(n.meals[1].items[0]).toEqual({ id: 'f', calories: 1, name: { en: '', ar: '' } });
    expect(n.supplements).toEqual([]);
    expect(n.targets).toEqual({ calories: 0, protein: 0, carbs: 0, fats: 0 });
    expect(plannedTotals(n).planned.calories).toBe(1);
  });
});

