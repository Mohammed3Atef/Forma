import { describe, expect, it } from 'vitest';
import * as server from '../../api/catalog/_lib/nutrition';
import * as app from './catalogNutrition';

/** B4 — the app and the server compute servings identically (one method, one rounding). */
describe('catalog nutrition parity (app ↔ server)', () => {
  const foods = [
    { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4 },
    { kcal: 884, protein: 0, carbs: 0, fat: 100 },
    { kcal: 165, protein: 31.02, carbs: 0, fat: 3.57 },
    { kcal: 61, protein: 3.15, carbs: 4.8, fat: 3.25 },
    { kcal: 129.6, protein: 3.89, carbs: 21.12, fat: 3.36, fiber: 2.36 },
  ];
  const grams = [0, 0.4, 1, 1.05, 12.5, 33.9, 50, 86, 99.95, 100, 158, 223.5, 425, 1000, -3, Number.NaN];
  it('nutrientsFor', () => {
    for (const f of foods) for (const g of grams) expect(app.nutrientsFor(f, g)).toEqual(server.nutrientsFor(f, g));
  });
  it('servingGrams', () => {
    for (const amount of [0, 0.25, 0.5, 1, 1.5, 2, 3.333, -1, Number.NaN]) for (const p of [undefined, { id: 'cup', grams: 158 }, { id: 'tbsp', grams: 13.5 }]) expect(app.servingGrams(amount, p)).toBe(server.servingGrams(amount, p));
  });
  it('roundTo and sumServings', () => {
    for (const n of [1.005, 2.675, 0.05, -0.05, 129.99999, 1e-9, 123456.789]) for (const dp of [0, 1, 2]) expect(app.roundTo(n, dp)).toBe(server.roundTo(n, dp));
    const rows = foods.map((f) => app.nutrientsFor(f, 150));
    expect(app.sumServings(rows)).toEqual(server.sumServings(rows));
  });
});
